import assert from 'node:assert/strict';
import {
    buildCompletedClientToolMessages,
    buildClientWebSearchInvocations,
    normalizeResearchTransport,
    resolveResearchTransport,
} from '../research-transport.js';

assert.equal(normalizeResearchTransport('auto'), 'auto');
assert.equal(normalizeResearchTransport('prompt'), 'prompt');
assert.equal(normalizeResearchTransport('unexpected'), 'auto');
assert.equal(resolveResearchTransport('auto', true), 'tool');
assert.equal(resolveResearchTransport('auto', false), 'prompt');
assert.equal(resolveResearchTransport('prompt', true), 'prompt');

const invocations = buildClientWebSearchInvocations({
    queries: ['Tokyo weather tomorrow', 'Tokyo rain forecast'],
    sources: [
        {
            sourceId: 'S1',
            title: 'Tokyo forecast',
            url: 'https://weather.example/tokyo',
            snippet: 'Rain is expected tomorrow afternoon.',
            published: '2026-07-30',
            queries: ['Tokyo weather tomorrow'],
        },
        {
            sourceId: 'S2',
            title: 'Rain radar',
            url: 'https://radar.example/tokyo',
            snippet: 'The rain band reaches central Tokyo after 14:00.',
            queries: ['Tokyo rain forecast'],
        },
    ],
    provider: 'SearXNG',
    retrievedAtUtc: '2026-07-30T15:00:00.000Z',
    includeSourceLinks: true,
    maxChars: 8000,
});

assert.equal(invocations.length, 2);
assert.deepEqual(invocations.map(item => item.name), ['hwr_web_search', 'hwr_web_search']);
assert.equal(new Set(invocations.map(item => item.id)).size, 2);
assert.deepEqual(JSON.parse(invocations[0].parameters), { query: 'Tokyo weather tomorrow' });
assert.deepEqual(JSON.parse(invocations[1].parameters), { query: 'Tokyo rain forecast' });
assert.equal(JSON.parse(invocations[0].result).type, 'client_web_search_result');
assert.equal(JSON.parse(invocations[0].result).provider, 'SearXNG');
assert.equal(JSON.parse(invocations[0].result).retrieved_at_utc, '2026-07-30T15:00:00.000Z');
assert.equal(JSON.parse(invocations[0].result).results[0].url, 'https://weather.example/tokyo');
assert.ok(invocations.every(item => item.error === false && item.signature === null));

const standardExchange = buildCompletedClientToolMessages(invocations);
assert.equal(standardExchange.toolCalls.length, 2);
assert.deepEqual(standardExchange.messages[0], {
    role: 'assistant',
    content: '',
    tool_calls: standardExchange.toolCalls,
});
assert.deepEqual(standardExchange.toolCalls[0], {
    id: invocations[0].id,
    type: 'function',
    function: {
        name: 'hwr_web_search',
        arguments: invocations[0].parameters,
    },
});
assert.deepEqual(standardExchange.messages.slice(1), invocations.map(invocation => ({
    role: 'tool',
    tool_call_id: invocation.id,
    content: invocation.result,
})));
assert.equal('reasoning_content' in standardExchange.messages[0], false);

const deepSeekExchange = buildCompletedClientToolMessages(invocations, {
    includeReasoningContent: true,
});
assert.equal(deepSeekExchange.messages[0].reasoning_content, '');
assert.deepEqual(deepSeekExchange.messages.slice(1), standardExchange.messages.slice(1));
assert.deepEqual(buildCompletedClientToolMessages(null), {
    toolCalls: [],
    messages: [{ role: 'assistant', content: '', tool_calls: [] }],
});

const noLinks = buildClientWebSearchInvocations({
    queries: ['query'],
    sources: [{
        sourceId: 'S1',
        title: 'Title',
        url: 'https://secret-link.example/',
        snippet: 'Evidence',
        queries: ['query'],
    }],
    provider: 'SerpAPI',
    retrievedAtUtc: '2026-07-30T15:00:00.000Z',
    includeSourceLinks: false,
});
assert.equal(noLinks.length, 1);
assert.equal('url' in JSON.parse(noLinks[0].result).results[0], false);
assert.equal(noLinks[0].result.includes('https://secret-link.example/'), false);

assert.deepEqual(buildClientWebSearchInvocations({
    queries: [],
    sources: [],
    provider: 'SearXNG',
    retrievedAtUtc: '2026-07-30T15:00:00.000Z',
}), []);

console.log('research transport tests passed');
