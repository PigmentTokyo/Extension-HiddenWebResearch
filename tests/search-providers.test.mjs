import assert from 'node:assert/strict';
import {
    normalizeAnySearchResponse,
    normalizeSerpApiResponse,
} from '../search-providers.js';

const anySearch = normalizeAnySearchResponse({
    code: 0,
    request_id: 'must-not-survive',
    data: {
        results: [
            {
                title: 'Primary',
                url: 'https://example.com/a#fragment',
                snippet: 'short',
                content: 'full content',
            },
            {
                title: 'Duplicate',
                url: 'https://example.com/a#fragment',
                snippet: 'duplicate',
            },
            {
                title: 'Unsafe',
                url: 'javascript:alert(1)',
                snippet: 'bad',
            },
            {
                title: 'Credential URL',
                url: 'https://user:password@example.com/private',
                snippet: 'must be discarded',
            },
            {
                title: 'Long',
                url: 'https://example.com/long',
                content: 'x'.repeat(7000),
            },
        ],
    },
}, 10);

assert.equal(anySearch.items.length, 2);
assert.equal(anySearch.items[0].snippet, 'full content');
assert.equal(anySearch.items[1].snippet.length, 6000);
assert.equal(JSON.stringify(anySearch).includes('must-not-survive'), false);

const anySearchCredentialError = normalizeAnySearchResponse({
    code: -1,
    message: 'quota exhausted',
    data: {
        api_key: 'secret-generated-key',
        username: 'secret-user',
        password: 'secret-password',
    },
}, 10);
assert.deepEqual(anySearchCredentialError.items, []);
assert.equal(JSON.stringify(anySearchCredentialError).includes('secret-'), false);

const serpApi = normalizeSerpApiResponse({
    search_metadata: { status: 'Success' },
    organic_results: [
        {
            title: 'Result',
            link: 'https://example.org/page',
            snippet: 'Snippet',
            date: 'Jul 30, 2026',
        },
        {
            title: '',
            link: 'data:text/plain,unsafe',
            snippet: 'Unsafe',
        },
        {
            title: 'No snippet is still valid',
            link: 'https://example.org/no-snippet',
        },
        {
            title: 'Credential URL',
            link: 'https://user:password@example.org/private',
            snippet: 'must be discarded',
        },
    ],
}, 10);

assert.deepEqual(serpApi.items, [
    {
        title: 'Result',
        url: 'https://example.org/page',
        snippet: 'Snippet',
        published: 'Jul 30, 2026',
    },
    {
        title: 'No snippet is still valid',
        url: 'https://example.org/no-snippet',
        snippet: '',
        published: '',
    },
]);

assert.deepEqual(normalizeSerpApiResponse(null).items, []);
assert.deepEqual(normalizeSerpApiResponse({ organic_results: [] }).items, []);
