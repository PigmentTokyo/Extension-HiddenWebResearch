import assert from 'node:assert/strict';
import {
    normalizeAnySearchResponse,
    normalizeKoboldCppResponse,
    normalizeLegacyBrowserSearchResponse,
    normalizeSerpApiResponse,
    normalizeSerperResponse,
    normalizeTavilyResponse,
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

const tavily = normalizeTavilyResponse({
    answer: 'unattributed synthesized answer must not survive',
    response_time: 0.42,
    results: [
        {
            title: 'Primary Tavily result',
            url: 'https://tavily.example/article#section',
            content: 'Full Tavily content',
            snippet: 'Short Tavily snippet',
            published_date: '2026-08-01',
        },
        {
            title: 'Duplicate Tavily result',
            url: 'https://tavily.example/article#other-section',
            content: 'duplicate must be discarded',
        },
        {
            title: 'Unsafe Tavily result',
            url: 'javascript:alert(1)',
            content: 'must be discarded',
        },
        {
            title: 'Credential-bearing Tavily result',
            url: 'https://user:password@tavily.example/private',
            content: 'must be discarded',
        },
        {
            title: 'Long Tavily result',
            url: 'https://tavily.example/long',
            raw_content: 'x'.repeat(7000),
            date: '2026-07-31',
        },
    ],
}, 10);

assert.equal(tavily.items.length, 2);
assert.deepEqual(tavily.items[0], {
    title: 'Primary Tavily result',
    url: 'https://tavily.example/article',
    snippet: 'Full Tavily content',
    published: '2026-08-01',
});
assert.equal(tavily.items[1].snippet.length, 6000);
assert.equal(JSON.stringify(tavily).includes('unattributed synthesized answer'), false);
assert.deepEqual(normalizeTavilyResponse(null).items, []);
assert.equal(normalizeTavilyResponse({ results: tavily.items }, 1).items.length, 1);

const serper = normalizeSerperResponse({
    answerBox: { answer: 'unsupported answer box secret' },
    knowledgeGraph: { description: 'unsupported knowledge graph secret' },
    organic: [
        {
            title: 'Primary Serper result',
            link: 'https://serper.example/page#fragment',
            snippet: 'Serper snippet',
            date: 'Aug 1, 2026',
        },
        {
            title: 'Duplicate Serper result',
            link: 'https://serper.example/page#duplicate',
            snippet: 'duplicate must be discarded',
        },
        {
            title: 'Unsafe Serper result',
            link: 'data:text/plain,unsafe',
            snippet: 'must be discarded',
        },
        {
            title: 'Credential-bearing Serper result',
            link: 'https://user:password@serper.example/private',
            snippet: 'must be discarded',
        },
        {
            title: 'Serper result without a snippet',
            link: 'https://serper.example/no-snippet',
        },
    ],
}, 10);

assert.deepEqual(serper.items, [
    {
        title: 'Primary Serper result',
        url: 'https://serper.example/page',
        snippet: 'Serper snippet',
        published: 'Aug 1, 2026',
    },
    {
        title: 'Serper result without a snippet',
        url: 'https://serper.example/no-snippet',
        snippet: '',
        published: '',
    },
]);
assert.equal(JSON.stringify(serper).includes('unsupported answer box secret'), false);
assert.equal(JSON.stringify(serper).includes('unsupported knowledge graph secret'), false);
assert.deepEqual(normalizeSerperResponse(null).items, []);
assert.equal(normalizeSerperResponse({ organic: serper.items.map(item => ({
    title: item.title,
    link: item.url,
    snippet: item.snippet,
})) }, 1).items.length, 1);

const koboldCpp = normalizeKoboldCppResponse([
    {
        title: 'Primary KoboldCpp result',
        url: 'https://kobold.example/page#fragment',
        desc: 'Short description',
        content: 'Full content',
        published: '2026-08-01',
    },
    {
        title: 'Duplicate KoboldCpp result',
        url: 'https://kobold.example/page#other-fragment',
        desc: 'duplicate must be discarded',
    },
    {
        title: 'Repeated text',
        url: 'https://kobold.example/repeated',
        desc: 'Same text',
        content: 'Same text',
    },
    {
        title: 'Unsafe KoboldCpp result',
        url: 'javascript:alert(1)',
        content: 'must be discarded',
    },
    {
        title: 'Credential-bearing KoboldCpp result',
        url: 'https://user:password@kobold.example/private',
        content: 'must be discarded',
    },
    {
        title: 'Long KoboldCpp result',
        url: 'https://kobold.example/long',
        content: 'y'.repeat(7000),
        date: '2026-07-31',
    },
], 10);

assert.equal(koboldCpp.items.length, 3);
assert.deepEqual(koboldCpp.items[0], {
    title: 'Primary KoboldCpp result',
    url: 'https://kobold.example/page',
    snippet: 'Short description | Full content',
    published: '2026-08-01',
});
assert.equal(koboldCpp.items[1].snippet, 'Same text');
assert.equal(koboldCpp.items[2].snippet.length, 6000);
assert.deepEqual(normalizeKoboldCppResponse({ results: [] }).items, []);
assert.deepEqual(normalizeKoboldCppResponse(null).items, []);

const legacy = normalizeLegacyBrowserSearchResponse({
    results: [
        'Aggregate answer box text',
        'First unpaired result snippet',
        'Second unpaired result snippet',
    ],
    links: [
        'https://legacy.example/a#first',
        'javascript:alert(1)',
        'data:text/plain,unsafe',
        'https://user:password@legacy.example/private',
        'https://legacy.example/a#duplicate',
        'https://legacy.example/b',
    ],
    api_key: 'secret metadata must not survive',
}, 10);

assert.deepEqual(legacy, {
    items: [],
    aggregateText: 'Aggregate answer box text\nFirst unpaired result snippet\nSecond unpaired result snippet',
    candidateLinks: [
        'https://legacy.example/a',
        'https://legacy.example/b',
    ],
});
assert.equal(JSON.stringify(legacy).includes('secret metadata'), false);
assert.equal(legacy.items.some(item => Object.hasOwn(item, 'url')), false);

const legacyLimited = normalizeLegacyBrowserSearchResponse({
    results: `z\u0000${'x'.repeat(7000)}`,
    links: [
        'https://legacy.example/one',
        'https://legacy.example/two',
    ],
}, 1);
assert.equal(legacyLimited.aggregateText.length, 6000);
assert.deepEqual(legacyLimited.candidateLinks, ['https://legacy.example/one']);
assert.deepEqual(normalizeLegacyBrowserSearchResponse(null), {
    items: [],
    aggregateText: '',
    candidateLinks: [],
});
assert.deepEqual(normalizeLegacyBrowserSearchResponse('not an object'), {
    items: [],
    aggregateText: '',
    candidateLinks: [],
});

console.log('Search provider normalizers: all assertions passed');
