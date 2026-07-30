import assert from 'node:assert/strict';

import {
    buildSafeFallbackQuery,
    compactSearchRequest,
    containsSensitiveQueryMaterial,
} from '../query-safety.js';

const longRequest = `${'A'.repeat(5000)} Please search the web for the latest stable SDK version.`;
const compacted = compactSearchRequest(longRequest, 4000);
assert.equal(compacted.length, 4000);
assert.ok(compacted.startsWith('A'.repeat(100)));
assert.match(compacted, /\[middle omitted\]/u);
assert.match(compacted, /Please search the web for the latest stable SDK version\.$/u);

assert.equal(compactSearchRequest('  short\nrequest  ', 4000), 'short request');
assert.match(
    buildSafeFallbackQuery(longRequest, 220),
    /Please search the web for the latest stable SDK version\.$/u,
);

const sensitiveQueries = [
    'search sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz.123456',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
    'Authorization: Basic dXNlcjpwYXNzd29yZA==',
    'Authorization: Basic dXNlcjpwYXNz',
    'Authorization: Basic dTpw',
    'api_key=abcdefghijklmnopqrstuvwxyz123456',
    'https://example.test/?token=abcdefghijklmnopqrstuvwxyz',
    'AIzaSyDUMMYKEY1234567890123456789012',
    'ghp_abcdefghijklmnopqrstuvwxyz123456',
    ['xoxb', '123456789012', 'abcdefghijklmnopqrstuvwxyz'].join('-'),
    'eyJabcdefghijk.eyJabcdefghijkl.abcdefghijklmnop',
    '-----BEGIN PRIVATE KEY-----',
];
for (const query of sensitiveQueries) {
    assert.equal(containsSensitiveQueryMaterial(query), true, query);
    assert.equal(buildSafeFallbackQuery(query, 220), '', query);
}

for (const query of [
    'Claude API key security best practices',
    'site:ai.google.dev Gemini API documentation',
    'Tokyo weather 2026-07-31',
    'Authorization: Bearer header syntax',
    'How to set Authorization: Bearer in fetch',
    'Authorization: Bearer authentication header syntax',
    'Authorization: Bearer YOUR_TOKEN_HERE',
    'Authorization: Bearer YOUR_ACCESS_TOKEN_HERE',
    'Authorization: Basic BASE64_CREDENTIALS',
    'Authorization: Basic syntax',
    'Authorization: Basic help',
    'Authorization: Basic dGVzdA==',
    'api_key=YOUR_KEY example',
    'api_key=<YOUR_API_KEY_HERE> example',
    'password: example configuration',
    'https://example.test/?token=placeholder',
]) {
    assert.equal(containsSensitiveQueryMaterial(query), false, query);
}

console.log('Search-query safety and head-tail compaction: all assertions passed');
