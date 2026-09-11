import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as diagnosticsModule from '../diagnostic-log.js';
import * as safety from '../query-safety.js';
import * as gate from '../research-gate.js';
import * as clock from '../runtime-time.js';
import * as strategies from '../research-strategies.js';
import * as prompts from '../planner-prompts.js';
import * as router from '../planner-request-router.js';

const index = await readFile(new URL('../index.js', import.meta.url), 'utf8');
function extract(name) {
    const match = new RegExp(`(?:async )?function ${name}\\(`, 'u').exec(index);
    assert.ok(match, name);
    const tail = index.slice(match.index);
    const end = /\r?\n\}(?=\r?\n|$)/u.exec(tail);
    return tail.slice(0, end.index + end[0].length);
}
const narrative = '在房间里陪已经睡着的艾莉丝，先观察她是否醒来，然后继续描述房间里的灯光、衣服、动作、表情以及接下来发生的全部对话和剧情，并保持此前约定的叙述方式。';

function fixture(raw, overrides = {}) {
    const diagnostics = diagnosticsModule.createDiagnosticRecorder();
    let searchCalls = 0;
    const statuses = [];
    const sandbox = {
        ...diagnosticsModule, ...safety, ...gate, ...clock, ...strategies, ...prompts, ...router,
        diagnostics, DEFAULT_RESULT_VARIABLE_NAME: 'p1g_search_result',
        searchLogGeneration: 0, researchCache: new Map(),
        CLIENT_VERSION: '1.18.0', CLIENT_COMPATIBILITY: { requestRewrite: false },
        navigator: { userAgent: 'Chrome/140.0', language: 'zh-CN' },
        $: () => ({ text() {} }),
        getCurrentModelInfo: () => ({ source: 'custom', model: 'fixture-model' }),
        detectAdapter: () => 'other', getPlannerProfileService: () => null,
        getStructuredSearchConfiguration: () => ({}), getPlannerConnectionFingerprint: () => ({}),
        hashString: () => 'test-hash', isRunCurrent: () => true,
        getEffectiveTotalQueryLimit: (_adapter, settings) => settings.maxTotalQueries,
        getEffectiveRoundQueryLimit: () => 2,
        ensureStructuredSearchBackendReady: async () => {},
        recordResearchCacheReuse: () => {},
        formatCombinedResearchEvidence: state => ({ evidence: state.sources.map(source => source.snippet).join('\n'), truncated: false }),
        buildResearchPacket: ({ evidence }) => evidence.join('\n'),
        searchStructuredBackendWithLog: async () => { searchCalls++; return { items: [] }; },
        generateRaw: async () => raw,
        getPlannerProfileOverridePayload: () => ({}),
        runAbortableRequest: async callback => callback(new AbortController().signal),
        debugLog: () => {},
        updateStatus: (_state, text) => statuses.push(text),
        ...overrides,
    };
    vm.createContext(sandbox);
    const functions = [
        'normalizeWhitespace', 'getLatestUserMessage', 'cleanQuery', 'makeResearchCacheKey',
        'getDiagnosticContext', 'renderDiagnosticSummary', 'startDiagnosticRun',
        'generatePlannerWithCurrent', 'planNextSearch', 'runStructuredSearchResearch',
    ];
    vm.runInContext(index.match(/const defaultSettings = \{[\s\S]*?\r?\n\};/u)[0] + '\n' + functions.map(extract).join('\n'), sandbox);
    vm.runInContext('globalThis.settings = { ...defaultSettings, enabled: true, searchPolicy: "always", reuseSeconds: 0, researchBackend: "serpapi", debug: false };', sandbox);
    sandbox.getSettings = () => sandbox.settings;
    const run = async (input = narrative) => {
        const { trace } = sandbox.startDiagnosticRun(sandbox.settings, 'normal', input, 'none');
        return sandbox.runStructuredSearchResearch({
            chat: [{ is_user: true, mes: input }], chatId: 'never-export-this-chat-id', epoch: 1,
            settings: sandbox.settings, runtimeClock: clock.captureRuntimeClock(), trace,
        });
    };
    return { sandbox, diagnostics, run, statuses, searchCalls: () => searchCalls };
}

// Reproduce the reported symptom with both possible 46-ish-character replies.
for (const [raw, action, reason] of [
    ['{"action":"DONE","queries":[],"unresolved":[]}', 'DONE', 'ok'],
    ['{"should_search":false,"search_query":""}', 'INVALID', 'missing_action'],
]) {
    const test = fixture(raw);
    assert.equal(await test.run(), null);
    assert.equal(test.searchCalls(), 0);
    assert.match(test.statuses.at(-1), /规划器连续未能生成安全短查询/u);
    const report = test.diagnostics.report();
    const parsed = report.events.filter(entry => entry.event === 'planner_parse');
    assert.equal(parsed.length, 3);
    assert.ok(parsed.every(entry => entry.data.action === action && entry.data.reason === reason));
    assert.ok(report.events.some(entry => entry.data.reason === 'unsafe_full_turn_fallback'));
    assert.ok(report.events.some(entry => entry.data.reason === 'unsafe_short_query'));
    assert.equal(report.events[0].data.context.settings.debug, false);
    assert.doesNotMatch(JSON.stringify(report), /艾莉丝|should_search|never-export-this-chat-id/u);
}

const copied = fixture(JSON.stringify({ action: 'SEARCH', queries: [{ query: narrative, purpose: 'primary' }] }));
await copied.run();
assert.equal(copied.diagnostics.report().events.filter(entry => entry.event === 'query_candidate').length, 3);
assert.equal(copied.diagnostics.report().events.filter(entry => entry.data.reason === 'narrative_text').length, 3, 'Keep every rejection, not only the first');

const failure = fixture('', { generateRaw: async () => { throw new Error('HTTP 429 secret-response-never-export'); } });
await failure.run();
assert.ok(failure.diagnostics.report().events.some(entry => entry.event === 'planner_failed' && entry.data.error.status === 429));
assert.doesNotMatch(JSON.stringify(failure.diagnostics.report()), /secret-response-never-export/u);

const search = fixture('{"action":"SEARCH","queries":["Tokyo weather"]}');
await search.run('Tokyo weather');
assert.ok(search.searchCalls() > 0);
assert.ok(search.diagnostics.report().events.some(entry => entry.event === 'search_complete' && entry.data.resultCount === 0));
assert.doesNotMatch(JSON.stringify(search.diagnostics.report()), /Tokyo weather/u);
assert.ok(!search.diagnostics.report().events.some(entry => entry.event === 'search_failed'));

let plannerCalls = 0;
const success = fixture('', {
    generateRaw: async () => ++plannerCalls === 1 ? '{"action":"SEARCH","queries":["Tokyo weather"]}' : 'DONE',
    searchStructuredBackendWithLog: async () => ({ items: [{ title: 'Weather', url: 'https://private.test/weather', snippet: 'private-page-text-never-export' }] }),
});
const research = await success.run('Tokyo weather');
assert.ok(research.packet.includes('private-page-text-never-export'));
assert.ok(success.diagnostics.report().events.some(entry => entry.event === 'research_complete' && entry.data.resultCount === 1));
assert.doesNotMatch(JSON.stringify(success.diagnostics.report()), /private-page-text|private\.test|Tokyo weather/u);

const preflight = fixture('DONE', {
    ensureStructuredSearchBackendReady: async () => { throw new Error('SerpAPI key not configured'); },
});
await assert.rejects(preflight.run(), /not configured/u);
assert.equal(preflight.searchCalls(), 0);
assert.ok(preflight.diagnostics.report().events.some(entry => entry.event === 'backend_preflight_failed' && entry.data.error.category === 'configuration'));

// A failed secondary planner must show its error, then the current-model fallback.
const fallback = fixture('DONE', {
    getPlannerProfileService: () => ({
        getSupportedProfiles: () => [{ id: 'fixture-profile', api: 'custom', model: 'secondary-model' }],
        sendRequest: async () => { throw new Error('HTTP 503 private-server-error'); },
    }),
});
Object.assign(fallback.sandbox.settings, { plannerConnectionMode: 'profile', plannerProfileId: 'fixture-profile' });
await fallback.run();
assert.ok(fallback.diagnostics.report().events.some(entry => entry.event === 'planner_request_failed' && entry.data.error.status === 503));
assert.ok(fallback.diagnostics.report().events.some(entry => entry.event === 'planner_response' && entry.data.fallbackUsed));
assert.doesNotMatch(JSON.stringify(fallback.diagnostics.report()), /fixture-profile|private-server-error/u);

let release;
const pending = fixture('', { generateRaw: () => new Promise(resolve => { release = resolve; }) });
const pendingRun = pending.run();
await new Promise(resolve => setImmediate(resolve));
assert.equal(typeof release, 'function');
pending.diagnostics.clear();
pending.sandbox.isRunCurrent = () => false;
release('DONE');
await pendingRun;
assert.equal(pending.diagnostics.count(), 0, 'Clearing while a planner is in flight leaves no late events');

console.log('Diagnostics integration: actual planner/router/query gate, 3-round symptom, search, errors and in-flight clear passed');
