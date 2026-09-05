import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as compatibility from '../st-compatibility.js';

const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
function functionSource(name) {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `Missing ${name}`);
    const tail = source.slice(start);
    const end = /\r?\n\}/u.exec(tail);
    assert.ok(end, `Missing closing brace for ${name}`);
    return tail.slice(0, end.index + end[0].length);
}
function supported({ connection = 'custom', model = 'gemini-3.8-flash', version = '1.18.0', toolSupport = true } = {}) {
    return vm.runInNewContext(`${functionSource('isClientToolTransportSupported')}\nisClientToolTransportSupported()`, {
        ...compatibility,
        CLIENT_COMPATIBILITY: { requestRewrite: true },
        CLIENT_VERSION: version,
        researchResponseGuard: null,
        SillyTavern: { getContext: () => ({ mainApi: 'openai', isToolCallingSupported: () => toolSupport }) },
        getCurrentModelInfo: () => ({ source: connection, model }),
    });
}

for (const connection of ['custom', 'openrouter', 'openai', 'makersuite', 'vertexai', 'google']) {
    for (const model of ['gemini-3.8-flash', 'gemini-3-flash-preview', 'google/gemini-3.8-flash', 'models/gemini-3.8-flash', ' GEMINI-3.8-FLASH ']) {
        const nativeGoogle = ['makersuite', 'vertexai', 'google'].includes(connection);
        assert.equal(supported({ connection, model }), !nativeGoogle, `${connection}/${model}: restrict only the native Google protocol`);
    }
}
assert.equal(supported({ connection: 'custom', model: 'claude-sonnet-4-6' }), true);
assert.equal(supported({ connection: 'custom', model: 'gemini-2.5-flash' }), true);
assert.equal(supported({ connection: 'custom', model: 'gemini-30-flash' }), true);
assert.equal(supported({ connection: 'custom', model: 'gemini-3.8-flash', toolSupport: false }), false);
assert.equal(supported({ connection: 'deepseek', model: 'deepseek-chat', toolSupport: false }), true);
assert.equal(supported({ connection: 'makersuite', model: 'gemini-2.5-flash', version: '1.14.0' }), false);
assert.equal(supported({ connection: 'makersuite', model: 'gemini-2.5-flash', version: '1.15.0' }), true);

// A profile may change after research finishes. Exercise the real request hook:
// the already budgeted evidence must survive, without adding a callable tool.
const pending = { chatId: 'test-chat', type: 'normal', startMarker: 'BEGIN_PROBE', endMarker: 'END_PROBE' };
const request = {
    type: 'normal', chat_completion_source: 'makersuite', model: 'gemini-3.8-flash',
    messages: [{ role: 'user', content: 'BEGIN_PROBE\nEvidence: 20 degrees Celsius\nEND_PROBE' }],
};
const originalMessages = JSON.stringify(request.messages);
let status;
const sandbox = {
    ...compatibility, request, CLIENT_VERSION: '1.18.0',
    activePromptInjection: false, activeToolTransport: pending,
    researchResponseGuard: null,
    HANDLED_GENERATION_TYPES: new Set(['normal']),
    SillyTavern: { getContext: () => ({ chatId: 'test-chat' }) },
    applyActiveVariableInjection: () => {},
    getRequestMessageText: message => message.content,
    disableVendorNativeSearch: payload => { payload.enable_web_search = false; },
    updateStatus: (state, message) => { status = { state, message }; },
};
vm.runInNewContext(`${functionSource('handleChatCompletionSettingsReady')}\nhandleChatCompletionSettingsReady(request)`, sandbox);
assert.equal(JSON.stringify(request.messages), originalMessages, 'Research evidence must be preserved');
assert.equal(request.tools, undefined, 'Gemini fallback must not advertise hwr_web_search');
assert.equal(request.tool_choice, undefined);
assert.equal(sandbox.activeToolTransport, null);
assert.equal(status.state, 'ready');
console.log('Gemini research transport: 30 model/source combinations, compatibility controls, and request-time fallback passed');
