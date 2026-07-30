import assert from 'node:assert/strict';
import {
    RESEARCH_STRATEGY_PROFILES,
    canonicalizeUrl,
    detectResearchStrategy,
    extractQueryFeatures,
    filterNovelQueries,
    getResearchStrategyLabel,
    getResearchStrategyProfile,
    getStrategyQueryLimit,
    limitQueriesForStrategy,
    mergeStructuredSourceBatch,
    mergeStructuredSources,
    normalizeQueryForComparison,
    normalizeStrategyName,
    parsePlannerDecision,
    querySimilarity,
} from '../research-strategies.js';

assert.equal(normalizeStrategyName(' Anthropic '), 'claude');
assert.equal(normalizeStrategyName('VERTEXAI'), 'gemini');
assert.equal(normalizeStrategyName('deepseek'), 'deepseek-v4-pro');
assert.equal(normalizeStrategyName('DEEPSEEK-V4-PRO'), 'deepseek-v4-pro');
assert.equal(normalizeStrategyName('GLM-5.2'), 'glm-5.2');
assert.equal(normalizeStrategyName('KIMI-K3'), 'kimi-k3');
assert.equal(normalizeStrategyName('unknown-provider'), 'other');
assert.equal(getResearchStrategyProfile('google'), RESEARCH_STRATEGY_PROFILES.gemini);
assert.equal(getStrategyQueryLimit('claude', 1), 1);
assert.equal(getStrategyQueryLimit('claude', 2), 1);
assert.equal(getStrategyQueryLimit('gemini', 1), 2);
assert.equal(getStrategyQueryLimit('gemini', 2), 1);
assert.equal(getStrategyQueryLimit('deepseek', 1), 2);
assert.equal(getStrategyQueryLimit('deepseek', 2), 1);
assert.equal(getStrategyQueryLimit('glm-5.2', 1), 2);
assert.equal(getStrategyQueryLimit('kimi-k3', 1), 2);
assert.equal(getResearchStrategyProfile('claude').totalQueryLimit, 3);
assert.equal(getResearchStrategyProfile('claude').plannerMinTokens, 512);
assert.equal(getResearchStrategyProfile('gemini').totalQueryLimit, 4);
assert.equal(getResearchStrategyProfile('gemini').plannerMinTokens, 512);
assert.equal(getResearchStrategyProfile('deepseek').id, 'deepseek-v4-pro');
assert.equal(getResearchStrategyProfile('deepseek').totalQueryLimit, 4);
assert.equal(getResearchStrategyProfile('deepseek').plannerMinTokens, 1024);
assert.equal(getResearchStrategyProfile('glm-5.2').totalQueryLimit, 4);
assert.equal(getResearchStrategyProfile('glm-5.2').plannerMinTokens, 1536);
assert.equal(getResearchStrategyProfile('kimi-k3').totalQueryLimit, 3);
assert.equal(getResearchStrategyProfile('kimi-k3').plannerMinTokens, 2048);
assert.equal(getResearchStrategyProfile('other').plannerMinTokens, 512);
assert.equal(getResearchStrategyProfile('other').conservative, true);
assert.deepEqual(limitQueriesForStrategy(['a', 'b', 'c'], 'gemini', 1), ['a', 'b']);
assert.deepEqual(limitQueriesForStrategy(['a', 'b', 'c'], 'gemini', 2), ['a']);
assert.deepEqual(limitQueriesForStrategy(['a', 'b', 'c'], 'deepseek', 1), ['a', 'b']);

const positiveStrategyDetections = [
    [{ source: 'openai', model: 'deepseek-v4-pro' }, 'deepseek-v4-pro'],
    [{ source: 'router/deepseek', model: 'v4_pro:latest' }, 'deepseek-v4-pro'],
    [{ source: 'openai', model: 'openrouter/z-ai/GLM-5.2-FP8:free' }, 'glm-5.2'],
    [{ source: 'custom', model: 'route-prod/GLM-5-2/fp8' }, 'glm-5.2'],
    [{ source: 'glm', model: '5-2-fp8' }, 'glm-5.2'],
    [{ source: 'moonshotai', model: 'Kimi-K3' }, 'kimi-k3'],
    [{ source: 'openai', model: 'moonshotai/Kimi-K3' }, 'kimi-k3'],
    [{ source: 'kimi', model: 'k3' }, 'kimi-k3'],
    [{ source: 'anthropic', model: 'claude-opus-5' }, 'claude'],
    [{ source: 'deepseek-v4-pro', model: 'claude-opus-5' }, 'claude'],
    [{ source: 'custom', model: 'gemini-3.1-pro-preview' }, 'gemini'],
];
for (const [modelInfo, expected] of positiveStrategyDetections) {
    assert.equal(detectResearchStrategy(modelInfo), expected);
}

const nonTargetDomesticModels = [
    { source: 'anthropic', model: 'deepseek-v3.2' },
    { source: 'deepseek-v4-pro', model: 'deepseek-v3.2' },
    { source: 'deepseek', model: 'deepseek-v4' },
    { source: 'openai', model: 'deepseek-4-pro' },
    { source: 'google', model: 'glm-4.7' },
    { source: 'google/glm-4.7', model: '' },
    { source: 'openai', model: 'glm-5.2.1' },
    { source: 'openai', model: 'glm52' },
    { source: 'moonshotai', model: 'kimi-k2.5' },
    { source: 'anthropic', model: 'kimi-k3.1' },
    { source: 'openai', model: 'kimi-3' },
];
for (const modelInfo of nonTargetDomesticModels) {
    assert.equal(detectResearchStrategy(modelInfo), 'other');
}
assert.equal(detectResearchStrategy({ source: 'custom', model: 'unlisted-model' }), 'other');
assert.equal(getResearchStrategyLabel('deepseek'), 'DeepSeek V4 Pro：分面合并');
assert.equal(getResearchStrategyLabel('glm-5.2'), 'GLM 5.2：层级核验');
assert.equal(getResearchStrategyLabel('kimi-k3'), 'Kimi K3：研究收敛');
assert.equal(getResearchStrategyLabel('unknown'), '其他 / 通用');

assert.equal(
    normalizeQueryForComparison('  Ｇｅｍｉｎｉ　3．1—PRO，WEB_Search!!  '),
    'gemini 3 1 pro web search',
);
assert.equal(
    normalizeQueryForComparison('CLAUDE: Search\tStrategy'),
    'claude search strategy',
);

const englishFeatures = extractQueryFeatures('Gemini online browsing characteristics');
assert.deepEqual([...englishFeatures.englishTokens].sort(), ['aspect', 'gemini', 'search', 'web']);
const cjkFeatures = extractQueryFeatures('Gemini 联网搜索特点');
assert.ok(cjkFeatures.cjkBigrams.has('搜索'));
assert.ok(cjkFeatures.cjkBigrams.has('方面'));

assert.ok(
    querySimilarity(
        'Gemini 3.1 Pro web search characteristics',
        'gemini 3.1 pro online browsing behavior detailed explanation',
    ) > 0.9,
);
assert.ok(
    querySimilarity(
        'Gemini 联网搜索特点',
        'Gemini 网络检索机制详细说明',
    ) > 0.85,
);
assert.ok(querySimilarity('Claude search citations', 'Tokyo weather forecast') < 0.3);

const seenQueries = ['Gemini 3.1 Pro web search characteristics'];
const novelQueries = filterNovelQueries([
    'gemini 3.1 pro online browsing behavior detailed',
    'Gemini 3.1 Pro web search strategy',
    'site:ai.google.dev Gemini 3.1 Pro web search characteristics',
    'Gemini 3.1 Pro web search characteristics 2026',
    'Gemini 3.1 Pro web search pricing',
    'Gemini 3.1 Pro web search latency benchmark',
    'Gemini 3.1 Pro web search latency benchmark details',
], seenQueries);
assert.deepEqual(novelQueries, [
    'site:ai.google.dev Gemini 3.1 Pro web search characteristics',
    'Gemini 3.1 Pro web search characteristics 2026',
    'Gemini 3.1 Pro web search pricing',
    'Gemini 3.1 Pro web search latency benchmark',
]);

assert.deepEqual(
    filterNovelQueries(
        ['Claude search enterprise tenancy', 'Claude search general behavior'],
        ['Claude search behavior'],
        { facetTerms: ['enterprise tenancy'] },
    ),
    ['Claude search enterprise tenancy'],
);
assert.deepEqual(
    filterNovelQueries(['first', 'second', 'third'], [], { maxQueries: 2 }),
    ['first', 'second'],
);

assert.deepEqual(
    parsePlannerDecision(JSON.stringify({
        action: 'SEARCH',
        queries: [
            { query: '2026 Claude search behavior', purpose: 'current behavior' },
            { search_query: 'site:docs.anthropic.com web search', facet: 'official docs' },
        ],
        unresolved_gaps: [
            { gap: 'Need primary documentation' },
            'Need an exact release date',
        ],
    }), 2),
    {
        action: 'SEARCH',
        queries: ['2026 Claude search behavior', 'site:docs.anthropic.com web search'],
        queryPurposes: ['current behavior', 'official docs'],
        unresolved: ['Need primary documentation', 'Need an exact release date'],
    },
);
assert.deepEqual(
    parsePlannerDecision(
        '<research><action>DONE</action><unresolved>Pricing remains unclear</unresolved></research>',
        1,
    ),
    {
        action: 'DONE',
        queries: [],
        queryPurposes: [],
        unresolved: ['Pricing remains unclear'],
    },
);
assert.deepEqual(
    parsePlannerDecision('{"queries":{"text":"single object query"},"unresolved":"one gap"}', 1),
    {
        action: 'SEARCH',
        queries: ['single object query'],
        queryPurposes: [''],
        unresolved: ['one gap'],
    },
);
assert.deepEqual(
    parsePlannerDecision('SEARCH: current flagship documentation', 1),
    {
        action: 'SEARCH',
        queries: ['current flagship documentation'],
        queryPurposes: [''],
        unresolved: [],
    },
);
assert.deepEqual(
    parsePlannerDecision('DONE', 1),
    {
        action: 'DONE',
        queries: [],
        queryPurposes: [],
        unresolved: [],
    },
);

assert.equal(
    canonicalizeUrl('HTTPS://Example.COM:443/docs/?b=2&utm_source=newsletter&a=1#part'),
    'https://example.com/docs?a=1&b=2',
);
assert.equal(
    canonicalizeUrl('https://example.com/docs?a=1&FBCLID=secret&b=2&a=1'),
    'https://example.com/docs?a=1&b=2',
);
assert.equal(canonicalizeUrl('http://Example.com:80/'), 'http://example.com/');
assert.equal(canonicalizeUrl('javascript:alert(1)'), '');
assert.equal(canonicalizeUrl('not a URL'), '');

const firstBatch = [
    {
        title: 'Primary report',
        url: 'https://Example.com/report/?utm_campaign=launch#summary',
        query: 'first query',
    },
    {
        title: 'Second source',
        url: 'https://second.example/item?b=2&a=1',
        query: 'first query',
    },
];
const firstBatchSnapshot = structuredClone(firstBatch);
const firstState = mergeStructuredSourceBatch({}, firstBatch);
assert.deepEqual(firstBatch, firstBatchSnapshot);
assert.deepEqual(firstState.addedSourceIds, ['S1', 'S2']);
assert.equal(firstState.nextSourceNumber, 3);
assert.deepEqual(firstState.sources.map(source => [source.sourceId, source.url]), [
    ['S1', 'https://example.com/report'],
    ['S2', 'https://second.example/item?a=1&b=2'],
]);

const secondBatch = [
    {
        uri: 'https://example.com/report#different-fragment',
        snippet: 'Additional context from the same report.',
        query: 'follow-up query',
    },
    {
        link: 'https://third.example/news?utm_medium=social',
        title: 'Third source',
        publishedAt: '2026-07-30',
        query: 'follow-up query',
    },
    {
        url: 'https://second.example/item?a=1&utm_source=x&b=2',
        cited_text: 'Supporting sentence.',
    },
];
const secondBatchSnapshot = structuredClone(secondBatch);
const secondState = mergeStructuredSourceBatch(firstState, secondBatch);
assert.deepEqual(secondBatch, secondBatchSnapshot);
assert.deepEqual(secondState.addedSourceIds, ['S3']);
assert.equal(secondState.nextSourceNumber, 4);
assert.deepEqual(secondState.sources.map(source => source.sourceId), ['S1', 'S2', 'S3']);
assert.equal(secondState.sources[0].snippet, 'Additional context from the same report.');
assert.deepEqual(secondState.sources[0].queries, ['first query', 'follow-up query']);
assert.equal(secondState.sources[1].citedText, 'Supporting sentence.');
assert.equal(secondState.sources[2].published, '2026-07-30');

const enrichedState = mergeStructuredSourceBatch(secondState, [{
    url: 'https://example.com/report',
    snippet: 'A distinct follow-up passage from the same report.',
    query: 'third query',
}, {
    url: 'https://example.com/report',
    snippet: 'A distinct follow-up passage from the same report.',
    query: 'third query',
}]);
assert.match(enrichedState.sources[0].snippet, /Additional context/u);
assert.match(enrichedState.sources[0].snippet, /distinct follow-up passage/u);
assert.equal(enrichedState.sources[0].snippet.match(/distinct follow-up passage/gu)?.length, 1);
assert.match(enrichedState.sources[0].snippet, / \| /u);
assert.equal(enrichedState.sources[0].sourceId, 'S1');
const arrayOnlyMerge = mergeStructuredSources(firstState.sources, secondBatch);
assert.deepEqual(arrayOnlyMerge.map(source => source.sourceId), ['S1', 'S2', 'S3']);

console.log('Planner strategies: all assertions passed');
