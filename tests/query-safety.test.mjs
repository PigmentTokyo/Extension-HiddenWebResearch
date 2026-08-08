import assert from 'node:assert/strict';

import {
    buildSafePurposeFallbackQuery,
    buildSafeFallbackQuery,
    compactSearchRequest,
    containsSensitiveQueryMaterial,
    validateSearchQueryCandidate,
} from '../query-safety.js';

const longRequest = `${'A'.repeat(5000)} Please search the web for the latest stable SDK version.`;
const compacted = compactSearchRequest(longRequest, 4000);
assert.equal(compacted.length, 4000);
assert.ok(compacted.startsWith('A'.repeat(100)));
assert.match(compacted, /\[middle omitted\]/u);
assert.match(compacted, /Please search the web for the latest stable SDK version\.$/u);

assert.equal(compactSearchRequest('  short\nrequest  ', 4000), 'short request');
assert.equal(buildSafeFallbackQuery(longRequest, 220), 'the latest stable SDK version');

assert.equal(
    validateSearchQueryCandidate('以下是用户的本轮输入：东京明天天气', {
        userRequest: '东京明天天气',
    }).reason,
    'wrapped_user_request',
);
assert.deepEqual(
    validateSearchQueryCandidate('搜索查询：东京明天天气', { userRequest: '东京明天天气' }),
    { valid: true, query: '东京明天天气', reason: 'wrapper_removed' },
);

const wrappedRoleplay = '以下是用户的本轮输入：在房间里陪已经睡着的艾莉丝，先观察她是否醒来，然后继续描述房间里的灯光、衣服、动作、表情以及接下来发生的全部对话和剧情。';
assert.equal(
    validateSearchQueryCandidate(wrappedRoleplay, { userRequest: wrappedRoleplay }).reason,
    'wrapped_user_request',
);
assert.equal(buildSafeFallbackQuery(wrappedRoleplay, 220), '');

const wrappedCompactNarrative = '以下是用户的本轮输入：抱着艾莉丝去床上睡觉去，然后第二天醒来继续描写房间里的对话和动作，并保持角色设定与剧情连续性';
assert.equal(
    validateSearchQueryCandidate(wrappedCompactNarrative, { userRequest: wrappedCompactNarrative }).reason,
    'wrapped_user_request',
);
assert.equal(buildSafeFallbackQuery(wrappedCompactNarrative, 220), '');

const copiedNarrative = '在房间里陪已经睡着的艾莉丝，先观察她是否醒来，然后继续描述房间里的灯光、衣服、动作、表情以及接下来发生的全部对话和剧情，并保持此前约定的叙述方式。';
assert.ok(
    ['narrative_text', 'copied_user_request'].includes(
        validateSearchQueryCandidate(copiedNarrative, { userRequest: copiedNarrative }).reason,
    ),
);
assert.equal(buildSafeFallbackQuery(copiedNarrative, 220), '');
const copiedLongSentence = 'Alice official character profile appearance outfit personality sleeping habit relationship story';
assert.equal(
    validateSearchQueryCandidate(copiedLongSentence, { userRequest: copiedLongSentence }).reason,
    'copied_user_request',
);
assert.deepEqual(
    validateSearchQueryCandidate('艾莉丝 官方角色设定 睡眠习惯', { userRequest: copiedNarrative }),
    { valid: true, query: '艾莉丝 官方角色设定 睡眠习惯', reason: 'ok' },
);
assert.equal(
    buildSafePurposeFallbackQuery('查证：艾莉丝 官方角色设定 睡眠习惯', {
        userRequest: copiedNarrative,
    }),
    '艾莉丝 官方角色设定 睡眠习惯',
);
assert.equal(buildSafePurposeFallbackQuery('核实用户请求', { userRequest: copiedNarrative }), '');
assert.equal(buildSafePurposeFallbackQuery('primary', { userRequest: copiedNarrative }), '');
assert.equal(buildSafePurposeFallbackQuery(copiedNarrative, { userRequest: copiedNarrative }), '');

assert.equal(
    buildSafeFallbackQuery(`${'剧情描述 '.repeat(80)}请搜索：艾莉丝 官方角色设定`, 220),
    '艾莉丝 官方角色设定',
);
assert.equal(buildSafeFallbackQuery('以下是用户的本轮输入：东京明天天气', 220), '');

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
