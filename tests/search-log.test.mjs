import assert from 'node:assert/strict';

import {
    appendSearchLogEntry,
    createSearchLogEntry,
    formatSearchLogEntries,
    SEARCH_LOG_CHARACTER_LIMIT,
    SEARCH_LOG_LIMIT,
} from '../search-log.js';

const entry = createSearchLogEntry({
    id: 'log-1',
    backend: 'tavily',
    backendLabel: 'Tavily Search',
    query: 'SillyTavern latest release',
    startedAt: 1000,
    finishedAt: 1456,
    result: {
        cacheHit: false,
        items: [{
            title: 'SillyTavern releases',
            url: 'https://github.com/SillyTavern/SillyTavern/releases',
            snippet: 'Latest release notes.',
            published: '2026-08-08',
            api_key: 'must-not-leak',
            headers: { Authorization: 'must-not-leak' },
        }],
        aggregateEvidence: null,
        raw: { secret: 'must-not-leak' },
    },
});
assert.equal(entry.status, 'success');
assert.equal(entry.durationMs, 456);
assert.equal(entry.resultCount, 1);
assert.equal(entry.items[0].title, 'SillyTavern releases');
assert.doesNotMatch(JSON.stringify(entry), /must-not-leak|api_key|Authorization/u);

const malicious = createSearchLogEntry({
    id: 'log-malicious',
    backend: 'searxng',
    query: 'safe query',
    result: {
        items: [
            { title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', snippet: '<script>alert(2)</script>' },
            { title: 'data', url: 'data:text/html,bad', snippet: 'x' },
            { title: 'userinfo', url: 'https://user:pass@example.com/a', snippet: 'x' },
            {
                title: 'secret query',
                url: 'https://example.com/a?key=secret-value&client_secret=client-value&refresh_token=refresh-value&id_token=id-value&api-token=api-token-value&secret-key=secret-key-value&passwd=passwd-value&session_token=session-value&x-amz-signature=sig-value&client_id=public-id&lang=zh#private-fragment',
                snippet: 'x',
            },
        ],
    },
    error: 'request failed with Bearer abcdefghijk and https://user:pass@api.example/path?token=secret-value Authorization: second-secret',
});
assert.equal(malicious.items[0].url, '');
assert.equal(malicious.items[0].title, '<img src=x onerror=alert(1)>');
assert.equal(malicious.items[0].snippet, '<script>alert(2)</script>');
assert.equal(malicious.items[1].url, '');
assert.equal(malicious.items[2].url, '');
assert.match(malicious.items[3].url, /key=REDACTED/u);
assert.match(malicious.items[3].url, /client_secret=REDACTED/u);
assert.match(malicious.items[3].url, /refresh_token=REDACTED/u);
assert.match(malicious.items[3].url, /id_token=REDACTED/u);
assert.match(malicious.items[3].url, /api-token=REDACTED/u);
assert.match(malicious.items[3].url, /secret-key=REDACTED/u);
assert.match(malicious.items[3].url, /passwd=REDACTED/u);
assert.match(malicious.items[3].url, /session_token=REDACTED/u);
assert.match(malicious.items[3].url, /x-amz-signature=REDACTED/u);
assert.match(malicious.items[3].url, /client_id=public-id/u);
assert.doesNotMatch(malicious.items[3].url, /private-fragment/u);
assert.doesNotMatch(JSON.stringify(malicious), /secret-value|client-value|refresh-value|id-value|api-token-value|secret-key-value|passwd-value|session-value|sig-value|abcdefghijk/u);
assert.doesNotMatch(JSON.stringify(malicious), /user:pass|second-secret/u);
assert.match(malicious.error, /https:\/\/api\.example\/path/u);

const secretQuery = createSearchLogEntry({
    id: 'log-secret-query',
    backend: 'searxng',
    query: 'token=planner-secret search target',
    result: { items: [] },
});
assert.doesNotMatch(secretQuery.query, /planner-secret/u);

const labeledSecrets = createSearchLogEntry({
    id: 'log-labeled-secrets',
    backend: 'searxng',
    query: 'x-goog-api-key=AIza-not-for-logs client_secret=client-log-secret refresh_token=refresh-log-secret',
    error: 'passwd="pass log secret" access_token=access-log-secret',
});
assert.doesNotMatch(JSON.stringify(labeledSecrets), /AIza-not-for-logs|client-log-secret|refresh-log-secret|pass log secret|access-log-secret/u);

const cached = createSearchLogEntry({
    id: 'log-2',
    backend: 'searxng',
    query: 'Tokyo weather',
    result: {
        cacheHit: true,
        items: [],
        aggregateEvidence: {
            provider: 'SearXNG',
            engine: 'google',
            text: 'Cached aggregate evidence.',
            candidateLinks: ['https://example.com/a', 'https://example.com/a'],
        },
    },
});
assert.equal(cached.status, 'cache');
assert.equal(cached.aggregateEvidence.candidateLinks.length, 1);

const failed = createSearchLogEntry({
    id: 'log-3',
    backend: 'serpapi',
    query: 'query',
    error: new Error('quota exhausted'),
});
assert.equal(failed.status, 'error');
assert.equal(failed.error, 'quota exhausted');

let ring = [];
for (let index = 0; index < SEARCH_LOG_LIMIT + 5; index++) {
    ring = appendSearchLogEntry(ring, { id: String(index) });
}
assert.equal(ring.length, SEARCH_LOG_LIMIT);
assert.equal(ring[0].id, '5');

const characterBounded = appendSearchLogEntry([
    { id: 'old', text: 'a'.repeat(700) },
], { id: 'new', text: 'b'.repeat(700) }, SEARCH_LOG_LIMIT, 1000);
assert.deepEqual(characterBounded.map(item => item.id), ['new']);
assert.equal(SEARCH_LOG_CHARACTER_LIMIT, 200000);

const text = formatSearchLogEntries([entry, cached, failed]);
assert.match(text, /SillyTavern latest release/u);
assert.match(text, /Latest release notes/u);
assert.match(text, /缓存复用/u);
assert.match(text, /quota exhausted/u);
assert.doesNotMatch(text, /must-not-leak/u);

console.log('Search log helpers: all assertions passed');
