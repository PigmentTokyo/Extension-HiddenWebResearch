import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as compatibility from '../st-compatibility.js';
import * as transport from '../research-transport.js';
import { createResearchResponseGuard } from '../research-response-guard.js';

const index = await readFile(new URL('../index.js', import.meta.url), 'utf8');
function extract(name) {
    const start = index.indexOf(`function ${name}(`);
    const tail = index.slice(start);
    const end = /\r?\n\}/u.exec(tail);
    assert.ok(start >= 0 && end, name);
    return tail.slice(0, end.index + end[0].length);
}
const emitted = [];
const guard = createResearchResponseGuard({
    baseUrl: 'http://localhost:8001/', makeId: () => 'integration-test',
    fetchImpl: async (url, init) => {
        emitted.push(JSON.parse(init.body));
        const message = emitted.length === 1
            ? { tool_calls: [{ id: 'unexpected', type: 'function', function: { name: 'hwr_web_search', arguments: '{}' } }] }
            : { content: '20 degrees' };
        return new Response(JSON.stringify({ choices: [{ message }] }), { headers: { 'Content-Type': 'application/json' } });
    },
});
const info = { source: 'custom', model: 'gemini-3.8-flash' };
const settings = { custom_url: 'https://example.test/v1', reverse_proxy: 'https://unused.test' };
const invocations = transport.buildClientWebSearchInvocations({
    queries: ['weather'], provider: 'SearXNG', retrievedAtUtc: '2026-09-06T00:00:00.000Z',
    sources: [{ sourceId: 'S1', title: 'Weather', url: 'https://example.test/weather', snippet: '20 degrees', queries: ['weather'] }],
});
const request = {
    chat_completion_source: info.source, model: info.model, custom_url: settings.custom_url,
    type: 'regenerate', stream: false,
    messages: [{ role: 'user', content: 'weather' }, { role: 'user', content: 'Policy\nBEGIN_MARKER\nOriginal evidence\nEND_MARKER' }],
};
const sandbox = {
    ...compatibility, ...transport,
    request, researchResponseGuard: guard,
    runEpoch: 3, CLIENT_VERSION: '1.18.0', CLIENT_COMPATIBILITY: { requestRewrite: true },
    activePromptInjection: true,
    activeToolTransport: { chatId: 'synthetic', type: 'regenerate', startMarker: 'BEGIN_MARKER', endMarker: 'END_MARKER', userText: 'weather', invocations },
    HANDLED_GENERATION_TYPES: new Set(['regenerate']),
    SillyTavern: { getContext: () => ({ chatId: 'synthetic', mainApi: 'openai', chatCompletionSettings: settings, isToolCallingSupported: () => true }) },
    getCurrentModelInfo: () => info,
    getSettings: () => ({ enabled: true }),
    isRunCurrent: (epoch, chatId) => epoch === 3 && chatId === 'synthetic',
    applyActiveVariableInjection: () => {},
    hasInjectedResearchMarker: () => true,
    setResearchPrompt: () => {},
    updateStatus: () => {},
};
const functions = ['guardResearchRequest', 'handleChatCompletionSettingsReady', 'getRequestMessageText', 'hasRequestMessageNonTextContent', 'removeTransportMarkerBlockText', 'removeTransportMarkerBlock', 'disableVendorNativeSearch', 'appendClientSearchToolDefinition', 'isClientToolTransportSupported'];
vm.createContext(sandbox);
vm.runInContext(functions.map(extract).join('\n'), sandbox);
assert.equal(vm.runInContext('isClientToolTransportSupported()', sandbox), true);
vm.runInContext('handleChatCompletionSettingsReady(request)', sandbox);
assert.equal(request.tool_choice, 'none');
assert.equal(request.tools[0].function.name, 'hwr_web_search');
assert.equal(request.messages.filter(message => message.role === 'tool').length, 1);
// A hypothetical later extension overwrites the choice. The dispatch guard
// must recover none and handle an upstream that violates it anyway.
request.tool_choice = 'auto';
const response = await guard.fetch('http://localhost:8001/api/backends/chat-completions/generate', { method: 'POST', body: JSON.stringify(request) });
assert.equal((await response.json()).choices[0].message.content, '20 degrees');
assert.equal(emitted.length, 2);
assert.equal(emitted[0].tool_choice, 'none');
assert.doesNotMatch(JSON.stringify(emitted), /__hwr_response_guard/u);
assert.doesNotMatch(JSON.stringify(emitted[1]), /hwr_web_search/u);
assert.match(JSON.stringify(emitted[1]), /20 degrees/u);
assert.equal(vm.runInContext('isClientToolTransportSupported()', sandbox), false, 'Only the connection that actually failed falls back');
info.model = 'another-model';
assert.equal(vm.runInContext('isClientToolTransportSupported()', sandbox), true);
console.log('Real HWR request hook -> guarded dispatch -> bounded retry -> connection fallback passed without a chat/session');
