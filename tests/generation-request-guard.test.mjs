import assert from 'node:assert/strict';

import {
    captureGenerationStartSnapshot,
    isJsSlashRunnerPromptViewerRefreshActive,
    shouldSkipSyntheticGeneration,
} from '../generation-request-guard.js';

function fakeDocument(dialogs) {
    return {
        querySelectorAll(selector) {
            assert.equal(selector, '[role="dialog"]');
            return dialogs;
        },
    };
}

function fakeDialog(textContent, { spinner = true, refreshingIcon = false } = {}) {
    return {
        textContent,
        querySelector(selector) {
            if (selector === '.TH-loading-spinner') return spinner ? {} : null;
            if (selector === '.fa-rotate-right.animate-spin') return refreshingIcon ? {} : null;
            assert.fail('Unexpected selector: ' + selector);
        },
    };
}

assert.equal(isJsSlashRunnerPromptViewerRefreshActive(fakeDocument([
    fakeDialog('Cargando indicaciones...', { refreshingIcon: true }),
])), true, 'the same-dialog loading and rotating-refresh DOM markers are locale-independent');
assert.equal(isJsSlashRunnerPromptViewerRefreshActive(fakeDocument([
    fakeDialog('Cargando indicaciones...'),
    fakeDialog('Otro dialogo', { spinner: false, refreshingIcon: true }),
])), false, 'loading and refresh markers from different dialogs must not be combined');
assert.equal(isJsSlashRunnerPromptViewerRefreshActive(fakeDocument([
    fakeDialog('提示词查看器 \n 正在发送虚假生成请求, 从而获取最新提示词...'),
])), true);
assert.equal(isJsSlashRunnerPromptViewerRefreshActive(fakeDocument([
    fakeDialog('Prompt Viewer Sending a fake generation request to get the latest prompts...'),
])), true);
assert.equal(isJsSlashRunnerPromptViewerRefreshActive(fakeDocument([
    fakeDialog('提示词查看器 正在获取生成请求中的提示词...'),
])), false, 'a real generation observed by the viewer must not be skipped');
assert.equal(isJsSlashRunnerPromptViewerRefreshActive(fakeDocument([
    fakeDialog('提示词查看器 正在发送虚假生成请求', { spinner: false }),
])), false, 'a matching phrase without the active loading state is insufficient');

const existingMessage = { is_user: false };
const unchangedChat = [existingMessage];
const blankNormal = captureGenerationStartSnapshot({
    type: 'normal',
    options: {},
    dryRun: false,
    chatId: 'chat-1',
    chat: unchangedChat,
    textareaValue: '',
});

assert.equal(shouldSkipSyntheticGeneration({
    snapshot: blankNormal,
    type: 'normal',
    chatId: 'chat-1',
    chat: unchangedChat,
}), true, 'an unchanged blank normal generation is synthetic/non-conversational');

assert.equal(shouldSkipSyntheticGeneration({
    snapshot: blankNormal,
    type: 'normal',
    chatId: 'chat-1',
    chat: [...unchangedChat, { is_user: true }],
}), false, 'send_if_empty or another newly appended user turn remains eligible');

const typedNormal = captureGenerationStartSnapshot({
    type: 'normal',
    options: {},
    dryRun: false,
    chatId: 'chat-1',
    chat: unchangedChat,
    textareaValue: '请搜索今天新闻',
});
assert.equal(shouldSkipSyntheticGeneration({
    snapshot: typedNormal,
    type: 'normal',
    chatId: 'chat-1',
    chat: unchangedChat,
}), false, 'non-empty user input must never be inferred as a preview');

const automaticNormal = captureGenerationStartSnapshot({
    type: 'normal',
    options: { automatic_trigger: true },
    dryRun: false,
    chatId: 'chat-1',
    chat: unchangedChat,
    textareaValue: '',
});
assert.equal(shouldSkipSyntheticGeneration({
    snapshot: automaticNormal,
    type: 'normal',
    chatId: 'chat-1',
    chat: unchangedChat,
}), false, 'automatic generation behavior is preserved');

const groupNormal = captureGenerationStartSnapshot({
    type: 'normal',
    options: {},
    dryRun: false,
    chatId: 'chat-1',
    groupId: 'group-1',
    chat: unchangedChat,
    textareaValue: '',
    capturedAt: 1_000,
});
assert.equal(shouldSkipSyntheticGeneration({
    snapshot: groupNormal,
    type: 'normal',
    chatId: 'chat-1',
    groupId: 'group-1',
    chat: unchangedChat,
    now: 1_001,
}), false, 'unchanged group-chat generations fail open');

const staleNormal = captureGenerationStartSnapshot({
    type: 'normal',
    options: {},
    dryRun: false,
    chatId: 'chat-1',
    groupId: '',
    chat: unchangedChat,
    textareaValue: '',
    capturedAt: 1_000,
});
assert.equal(shouldSkipSyntheticGeneration({
    snapshot: staleNormal,
    type: 'normal',
    chatId: 'chat-1',
    groupId: '',
    chat: unchangedChat,
    now: 31_001,
}), false, 'snapshots older than 30 seconds fail open');

assert.equal(shouldSkipSyntheticGeneration({
    snapshot: blankNormal,
    type: 'regenerate',
    chatId: 'chat-1',
    chat: unchangedChat,
}), false);
assert.equal(shouldSkipSyntheticGeneration({
    snapshot: blankNormal,
    type: 'normal',
    chatId: 'chat-2',
    chat: unchangedChat,
}), false);
assert.equal(shouldSkipSyntheticGeneration({
    snapshot: null,
    type: 'normal',
    chatId: 'chat-1',
    chat: unchangedChat,
    promptViewerRefreshActive: true,
}), true, 'the explicit viewer refresh signal takes precedence');

console.log('Synthetic generation request guard: all assertions passed');
