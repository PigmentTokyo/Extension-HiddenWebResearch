import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    createDiagnosticRecorder, DIAGNOSTIC_PLUGIN_VERSION, DIAGNOSTIC_EVENT_LIMIT,
    DIAGNOSTIC_CHARACTER_LIMIT, projectDiagnosticContext, summarizeDiagnosticError,
    downloadDiagnosticReport,
} from '../diagnostic-log.js';
import { parsePlannerDecision } from '../research-strategies.js';

const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
assert.equal(DIAGNOSTIC_PLUGIN_VERSION, manifest.version);
const secret = 'private-fixture-must-never-export';
const context = {
    clientVersion: 'SillyTavern 1.18.0',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36 Edg/140.0',
    language: 'zh-CN', timeZone: 'Asia/Tokyo', resolvedAdapter: 'other',
    currentModel: { source: 'custom', model: 'provider/model-name', available: true, secretId: secret },
    plannerModel: { source: 'custom', model: 'https://user:password@private.test/key', apiKey: secret },
    chat: secret, headers: { Authorization: secret },
    settings: {
        enabled: true, debug: false, plannerMaxTokens: 512, researchBackend: 'serpapi',
        strategyCustomPrompt: secret, strategyCustomPromptEnabled: true,
        searxngUrl: `https://user:${secret}@private.test/?token=${secret}`,
        plannerProfileId: secret, plannerDirectProfiles: [{ secretId: secret, model: secret }],
        resultVariableName: secret, apiKey: secret,
    },
};
assert.equal(projectDiagnosticContext(context).browser, 'Edg 140.0');
assert.equal(projectDiagnosticContext(context).currentModel.model, 'provider/model-name');
assert.equal(projectDiagnosticContext(context).plannerModel.model, '[REDACTED]');
assert.equal(projectDiagnosticContext(context).settings.strategyCustomPromptLength, secret.length);
assert.equal(projectDiagnosticContext(context).settings.searxngUrlConfigured, true);
const recorder = createDiagnosticRecorder({ now: () => 1000 });
const token = recorder.scope();
recorder.record('run_started', { context, inputLength: 300, raw: secret, query: secret }, token);
recorder.record('planner_failed', { error: new Error(`HTTP 401 Authorization: Bearer ${secret} prompt=${secret}`) }, token);
recorder.record('query_blocked', { round: 2, reason: 'copied_user_request', query: secret }, token);
context.settings.plannerMaxTokens = 1024;
const report = recorder.report(context);
assert.equal(report.events[0].data.context.settings.plannerMaxTokens, 512, 'Capture settings at run time');
assert.equal(report.currentContext.settings.plannerMaxTokens, 1024);
assert.equal(report.events[1].data.error.category, 'authentication');
assert.equal(report.events[1].data.error.status, 401);
assert.match(report.events[2].explanation, /复制/u);
assert.doesNotMatch(JSON.stringify(report), new RegExp(secret));
assert.doesNotMatch(JSON.stringify(report), /private\.test|user:password|Authorization/u);
report.events[0].data.context.currentModel.model = secret;
assert.doesNotMatch(JSON.stringify(recorder.report()), new RegExp(secret), 'Reports cannot mutate the stored buffer');
assert.deepEqual(summarizeDiagnosticError(new Error('Request timed out')), { category: 'timeout' });
assert.deepEqual(summarizeDiagnosticError({ status: 429, message: secret }), { category: 'rate_limit', status: 429 });
assert.equal(summarizeDiagnosticError({ name: 'AbortError', message: secret }).category, 'cancelled');
assert.equal(summarizeDiagnosticError(new Error('Failed to fetch')).category, 'network');

recorder.clear();
recorder.record('planner_response', { responseLength: 46 }, token);
assert.equal(recorder.count(), 0, 'A cleared/chat-switched request must never repopulate the report');
const nextToken = recorder.scope();
recorder.record('planner_response', { responseLength: 46 }, nextToken);
assert.equal(recorder.count(), 1);
assert.notEqual(nextToken.runId, token.runId);
for (let i = 0; i < DIAGNOSTIC_EVENT_LIMIT + 1; i++) recorder.record('query_blocked', { reason: 'too_long' });
assert.equal(recorder.count(), DIAGNOSTIC_EVENT_LIMIT);
assert.ok(recorder.report().retention.droppedEvents > 0);
recorder.clear();
context.currentModel.model = 'm'.repeat(160);
context.plannerModel.model = 'p'.repeat(160);
Object.assign(context.settings, {
    maxRounds: 3, maxQueriesPerRound: 2, maxTotalQueries: 5, maxResultsPerQuery: 6,
    recentMessages: 8, recentContextChars: 12000, maxCharsPerQuery: 6000,
    maxEvidenceChars: 18000, requestTimeoutMs: 20000, reuseSeconds: 600,
});
for (let i = 0; i < 240; i++) recorder.record('run_started', { context });
assert.ok(recorder.count() < 240, 'Character limit also trims large configuration snapshots');
assert.ok(recorder.report().events.reduce((sum, entry) => sum + JSON.stringify(entry).length, 0) <= DIAGNOSTIC_CHARACTER_LIMIT);
assert.doesNotThrow(() => recorder.record('bad', { get error() { throw new Error('bad getter'); } }));

for (const [raw, expectedAction, expectedReason] of [
    ['{"action":"DONE","queries":[],"unresolved":[]}', 'DONE', 'ok'],
    ['{"action":"SEARCH","queries":[]}', 'INVALID', 'search_without_queries'],
    ['{"action":"DONE","queries":["private search"]}', 'INVALID', 'done_with_queries'],
    ['{"should_search":false}', 'INVALID', 'missing_action'],
    ['{"action":"FINISH"}', 'INVALID', 'unsupported_action'],
    ['{"action":"DONE","status":"SEARCH"}', 'INVALID', 'conflicting_status'],
    ['{"action": broken}', 'INVALID', 'malformed_json'],
    ['', 'INVALID', 'empty_response'],
    [`Ordinary text ${secret}`, 'INVALID', 'no_supported_format'],
    ['<action>SEARCH</action><query>test</query>', 'SEARCH', 'ok'],
    ['SEARCH: test', 'SEARCH', 'ok'],
]) {
    let metadata;
    const decision = parsePlannerDecision(raw, 2, value => { metadata = value; });
    assert.equal(decision.action, expectedAction, raw);
    assert.equal(metadata.reason, expectedReason, raw);
    assert.doesNotMatch(JSON.stringify(metadata), /private search|private-fixture/u);
    assert.deepEqual(parsePlannerDecision(raw, 2), decision, 'Observer preserves existing parser behavior');
}
assert.equal(parsePlannerDecision('DONE', 1, () => { throw new Error('observer failed'); }).action, 'DONE');

let capturedBlob, clicked = false, removed = false, revoked = false, timer;
const anchor = { click: () => { clicked = true; }, remove: () => { removed = true; } };
downloadDiagnosticReport('{"ok":true}', {
    document: { createElement: () => anchor, body: { append: () => {} } }, Blob,
    URL: { createObjectURL: blob => { capturedBlob = blob; return 'blob:fixture'; }, revokeObjectURL: () => { revoked = true; } },
    setTimeout: (callback, delay) => { timer = { callback, delay }; },
}, 'P1G-diagnostics.json');
assert.equal(await capturedBlob.text(), '{"ok":true}');
assert.equal(anchor.download, 'P1G-diagnostics.json');
assert.ok(clicked && removed && !revoked);
assert.ok(timer.delay >= 1000);
timer.callback();
assert.ok(revoked);
console.log('Diagnostics: privacy projection, snapshots, memory bounds, stale runs, parse reasons and download passed');
