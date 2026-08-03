const JS_SLASH_RUNNER_PROMPT_VIEWER_STATES = Object.freeze([
    Object.freeze({
        title: '提示词查看器',
        refreshing: '正在发送虚假生成请求',
    }),
    Object.freeze({
        title: 'Prompt Viewer',
        refreshing: 'Sending a fake generation request',
    }),
]);

const SYNTHETIC_GENERATION_SNAPSHOT_MAX_AGE_MS = 30_000;

function normalizeVisibleText(value) {
    return String(value || '').replace(/\s+/gu, ' ').trim();
}

/**
 * JS-Slash-Runner's Prompt Viewer currently calls Generate('normal') and
 * cancels only after CHAT_COMPLETION_SETTINGS_READY. Generation interceptors
 * run before that event, so detect the viewer's explicit refresh UI rather
 * than spending planner/search requests for its synthetic generation.
 */
export function isJsSlashRunnerPromptViewerRefreshActive(documentLike = globalThis.document) {
    if (typeof documentLike?.querySelectorAll !== 'function') return false;

    try {
        const dialogs = Array.from(documentLike.querySelectorAll('[role="dialog"]'));
        return dialogs.some(dialog => {
            if (typeof dialog?.querySelector !== 'function') {
                return false;
            }

            const hasLoadingSpinner = Boolean(dialog.querySelector('.TH-loading-spinner'));
            if (!hasLoadingSpinner) return false;

            // This pair is locale-independent and unique to the Prompt Viewer
            // refresh state in current JS-Slash-Runner builds. Both elements
            // must belong to the same dialog so unrelated loading UIs cannot
            // be combined into a false positive.
            if (dialog.querySelector('.fa-rotate-right.animate-spin')) return true;

            // Keep a text fallback for older builds that expose the loading
            // state but do not retain the Tailwind animation class.
            const text = normalizeVisibleText(dialog.textContent);
            return JS_SLASH_RUNNER_PROMPT_VIEWER_STATES.some(({ title, refreshing }) =>
                text.includes(title) && text.includes(refreshing));
        });
    } catch {
        return false;
    }
}

/**
 * Capture state before SillyTavern consumes the textarea or appends a user
 * message. Object identity is intentionally used instead of message text so
 * the guard does not retain or log private chat content.
 */
export function captureGenerationStartSnapshot({
    type,
    options,
    dryRun,
    chatId,
    groupId,
    chat,
    textareaValue,
    capturedAt = Date.now(),
} = {}) {
    const messages = Array.isArray(chat) ? chat : [];
    return Object.freeze({
        type: String(type || ''),
        dryRun: Boolean(dryRun),
        automaticTrigger: Boolean(options?.automatic_trigger),
        chatId: String(chatId ?? ''),
        groupId: String(groupId ?? ''),
        capturedAt: Number(capturedAt),
        chatLength: messages.length,
        lastMessage: messages.at(-1) ?? null,
        hadUserInput: Boolean(String(textareaValue || '').trim()),
    });
}

/**
 * Ignore explicit Prompt Viewer refreshes and, as a provider-independent
 * fallback, blank normal generations that did not create a new chat turn.
 * Regenerate/swipe, automatic generations, non-empty input and send_if_empty
 * all remain eligible for research.
 */
export function shouldSkipSyntheticGeneration({
    snapshot,
    type,
    chatId,
    groupId,
    chat,
    promptViewerRefreshActive = false,
    now = Date.now(),
} = {}) {
    if (promptViewerRefreshActive) return true;
    if (!snapshot || typeof snapshot !== 'object') return false;
    if (String(type || '') !== 'normal' || snapshot.type !== 'normal') return false;
    if (snapshot.dryRun || snapshot.automaticTrigger || snapshot.hadUserInput) return false;
    if (String(chatId ?? '') !== snapshot.chatId) return false;

    // Group generations can switch or fan out between members without adding
    // a user message. An unchanged chat is therefore not proof of a preview.
    if (snapshot.groupId || String(groupId ?? '')) return false;

    const capturedAt = Number(snapshot.capturedAt);
    const evaluatedAt = Number(now);
    const age = evaluatedAt - capturedAt;
    if (!Number.isFinite(capturedAt)
        || !Number.isFinite(evaluatedAt)
        || age < 0
        || age > SYNTHETIC_GENERATION_SNAPSHOT_MAX_AGE_MS) {
        return false;
    }

    const messages = Array.isArray(chat) ? chat : [];
    return messages.length === snapshot.chatLength
        && (messages.at(-1) ?? null) === snapshot.lastMessage;
}
