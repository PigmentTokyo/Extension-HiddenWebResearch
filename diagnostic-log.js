// Keep the executed code version in reports, including after a partial update.
export const DIAGNOSTIC_PLUGIN_VERSION = '1.13.4';
export const DIAGNOSTIC_EVENT_LIMIT = 240;
export const DIAGNOSTIC_CHARACTER_LIMIT = 200000;

const NUMBER_SETTINGS = [
    'schemaVersion', 'maxRounds', 'maxQueriesPerRound', 'maxTotalQueries',
    'maxResultsPerQuery', 'plannerMaxTokens', 'recentMessages', 'recentContextChars',
    'maxCharsPerQuery', 'maxEvidenceChars', 'requestTimeoutMs', 'reuseSeconds',
    'resultInjectionDepth',
];
const BOOLEAN_SETTINGS = [
    'enabled', 'plannerFallbackToCurrent', 'strategyCustomPromptEnabled',
    'triggerCustomPromptEnabled', 'includeSourceLinks', 'debug',
];
const CODE_SETTINGS = [
    'adapter', 'searchPolicy', 'researchBackend', 'plannerConnectionMode',
    'resultTransport', 'resultInjectionPosition', 'resultInjectionRole', 'resultVariableScope',
    'serpapiLanguage', 'serpapiCountry', 'extrasEngine', 'seleniumEngine',
];
const EVENT_NUMBERS = [
    'round', 'queryLimit', 'responseLength', 'durationMs', 'queryCount', 'resultCount',
    'inputLength', 'inputLines', 'priorTurnCount', 'queryIndex', 'queryLength',
    'purposeLength', 'evidenceLength', 'unresolvedCount', 'totalQueryLimit', 'maxTokens',
];
const EVENT_BOOLEANS = [
    'evaluationOnly', 'fallbackUsed', 'cacheHit', 'partial', 'cancelled',
    'explicitSearch', 'shouldCall', 'sensitiveInput', 'forcePromptTransport',
    'valid', 'aggregateResult',
];
const EVENT_CODES = ['reason', 'action', 'source', 'mode', 'configuredMode', 'backend', 'stage', 'type', 'temporalKind', 'transport', 'format'];

function number(value) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined;
}

function code(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/u.test(value) ? value : 'unknown';
}

function modelName(value) {
    if (typeof value !== 'string') return '';
    // Model names may contain provider slashes, but never export URLs or credentials.
    if (/https?:|\b(?:sk|key|token)-|AIza|gh[pousr]_|Bearer|Basic/iu.test(value)) return '[REDACTED]';
    return /^[a-zA-Z0-9_.:/+ -]{1,160}$/u.test(value) ? value : '[CUSTOM MODEL]';
}

// Never retain arbitrary error.message: upstream errors can echo prompts, keys,
// request bodies or URLs. Classify in place and retain only fixed categories.
export function summarizeDiagnosticError(error) {
    const text = String(error?.message ?? error ?? '');
    const explicitStatus = Number(error?.status ?? error?.statusCode);
    const match = text.match(/(?:HTTP(?:\s+error)?|status(?:\s+code)?|returned|failed[:\s]*)[\s:=]*(\d{3})\b/iu);
    const status = explicitStatus >= 400 && explicitStatus <= 599
        ? explicitStatus : match ? Number(match[1]) : undefined;
    let category = 'unknown';
    if (/timed?\s*out|timeout/iu.test(text)) category = 'timeout';
    else if (error?.name === 'AbortError' || /aborted|cancelled/iu.test(text)) category = 'cancelled';
    else if (status === 401 || status === 403 || /unauthorized|forbidden|invalid.{0,12}(?:key|credential)/iu.test(text)) category = 'authentication';
    else if (status === 429 || /quota|rate.?limit/iu.test(text)) category = 'rate_limit';
    else if (/JSON|schema|parse|format/iu.test(text)) category = 'invalid_response';
    else if (/fetch|network|ECONN|ENOTFOUND|CORS/iu.test(text)) category = 'network';
    else if (/not configured|missing|not available|unavailable|未配置|未保存/iu.test(text)) category = 'configuration';
    else if (status) category = 'http';
    return { category, ...(status ? { status } : {}) };
}

export function projectDiagnosticSettings(settings = {}) {
    const result = {};
    for (const key of NUMBER_SETTINGS) if (number(settings[key]) !== undefined) result[key] = number(settings[key]);
    for (const key of BOOLEAN_SETTINGS) if (typeof settings[key] === 'boolean') result[key] = settings[key];
    for (const key of CODE_SETTINGS) if (settings[key] !== undefined) result[key] = code(settings[key]);
    result.strategyCustomPromptLength = String(settings.strategyCustomPrompt || '').length;
    result.triggerCustomPromptLength = String(settings.triggerCustomPrompt || '').length;
    result.searxngUrlConfigured = Boolean(settings.searxngUrl);
    result.searxngPreferencesConfigured = Boolean(settings.searxngPreferences);
    result.plannerProfileSelected = Boolean(settings.plannerProfileId);
    result.plannerDirectProfileSelected = Boolean(settings.plannerDirectProfileId);
    return result;
}

export function projectDiagnosticContext(input = {}) {
    const connection = value => ({
        source: code(value?.source), model: modelName(value?.model),
        ...(typeof value?.available === 'boolean' ? { available: value.available } : {}),
        ...(typeof value?.endpointConfigured === 'boolean' ? { endpointConfigured: value.endpointConfigured } : {}),
    });
    const ua = String(input.userAgent || '');
    const browserMatch = ua.match(/(Edg|EdgiOS|EdgA|Firefox|FxiOS)\/([\d.]+)/u)
        || ua.match(/(Chrome|CriOS|Version)\/([\d.]+)/u);
    const platform = /Android/u.test(ua) ? 'Android' : /iPhone|iPad/u.test(ua) ? 'iOS'
        : /Windows/u.test(ua) ? 'Windows' : /Macintosh/u.test(ua) ? 'macOS' : /Linux/u.test(ua) ? 'Linux' : 'unknown';
    return {
        pluginVersion: DIAGNOSTIC_PLUGIN_VERSION,
        sillyTavernVersion: String(input.clientVersion || '').match(/\d+\.\d+\.\d+(?:[-.][a-zA-Z0-9]+)*/u)?.[0] || 'unknown',
        browser: browserMatch ? `${browserMatch[1]} ${browserMatch[2]}` : 'unknown',
        platform,
        language: code(input.language),
        timeZone: typeof input.timeZone === 'string' && /^[a-zA-Z0-9_+\-/]{1,80}$/u.test(input.timeZone) ? input.timeZone : 'unknown',
        currentModel: connection(input.currentModel),
        plannerModel: connection(input.plannerModel),
        resolvedAdapter: code(input.resolvedAdapter),
        settings: projectDiagnosticSettings(input.settings),
    };
}

function projectEventData(input = {}) {
    const data = {};
    for (const key of EVENT_NUMBERS) if (number(input[key]) !== undefined) data[key] = number(input[key]);
    for (const key of EVENT_BOOLEANS) if (typeof input[key] === 'boolean') data[key] = input[key];
    for (const key of EVENT_CODES) if (input[key] !== undefined) data[key] = code(input[key]);
    if (input.error !== undefined) data.error = summarizeDiagnosticError(input.error);
    if (input.context) data.context = projectDiagnosticContext(input.context);
    return data;
}

export const DIAGNOSTIC_REASON_LABELS = Object.freeze({
    unsafe_short_query: '未能生成安全短查询，未执行搜索',
    unsafe_full_turn_fallback: '原输入不适合直接作为备用搜索词',
    wrapped_user_request: '查询含用户输入包装语',
    narrative_text: '查询含叙事文本',
    copied_user_request: '查询复制了较长的用户正文',
    too_long: '查询超过长度限制',
    sensitive_material: '查询可能包含凭据',
    invalid_planner: '规划结果无效',
    no_results: '搜索无可用结果',
    no_search_needed: '模型判断无需搜索',
    cache_reuse: '复用了本页研究缓存',
    missing_action: '规划 JSON 缺少 action 字段',
    unsupported_action: '规划 action 不是 SEARCH 或 DONE',
    conflicting_status: '规划 action 与 status 冲突',
    search_without_queries: '规划要求搜索但没有可用查询',
    done_with_queries: '规划同时要求结束和搜索',
    empty_response: '规划回复为空',
    malformed_json: '规划 JSON 语法无效',
    no_supported_format: '规划回复不符合支持的 JSON、XML 或纯文本格式',
});

export function createDiagnosticRecorder({ now = Date.now } = {}) {
    let generation = 0;
    let sequence = 0;
    let runSequence = 0;
    let events = [];
    let dropped = 0;
    let characters = 0;
    let clearedAt = new Date(now()).toISOString();
    const scope = () => Object.freeze({ generation, runId: ++runSequence });
    const record = (event, input = {}, token = null) => {
        try {
            if (token && token.generation !== generation) return;
            const data = projectEventData(input);
            const entry = {
                sequence: ++sequence, at: new Date(now()).toISOString(),
                runId: token?.runId || null, event: code(event), data,
            };
            const reason = data.reason?.replace(/^post_prepare_/u, '');
            if (DIAGNOSTIC_REASON_LABELS[reason]) entry.explanation = DIAGNOSTIC_REASON_LABELS[reason];
            const size = JSON.stringify(entry).length;
            events.push(entry);
            characters += size;
            while (events.length > DIAGNOSTIC_EVENT_LIMIT || characters > DIAGNOSTIC_CHARACTER_LIMIT) {
                characters -= JSON.stringify(events.shift()).length;
                dropped++;
            }
        } catch {
            // Diagnostics must never interrupt research, even with malformed data.
        }
    };
    return {
        scope, record,
        clear() {
            generation++;
            events = [];
            dropped = 0;
            characters = 0;
            clearedAt = new Date(now()).toISOString();
        },
        count: () => events.length,
        report(context = {}) {
            return {
                format: 'p1g-research-diagnostics', schemaVersion: 1,
                exportedAt: new Date(now()).toISOString(), collectedSince: clearedAt,
                privacy: '仅含运行元数据。不含聊天原文、候选/实际搜索词、网页正文、规划器原始回复、原始错误、请求头、URL、Key、secret ID 或 Profile 名称。自定义提示词仅记录开关和长度。',
                retention: { eventLimit: DIAGNOSTIC_EVENT_LIMIT, characterLimit: DIAGNOSTIC_CHARACTER_LIMIT, droppedEvents: dropped },
                currentContext: projectDiagnosticContext(context),
                events: JSON.parse(JSON.stringify(events)),
            };
        },
    };
}

export function downloadDiagnosticReport(text, { document, URL, Blob, setTimeout }, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    try {
        anchor.href = url;
        anchor.download = filename;
        document.body.append(anchor);
        anchor.click();
    } finally {
        anchor.remove();
        // Mobile browsers may read the Blob after click returns.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
}
