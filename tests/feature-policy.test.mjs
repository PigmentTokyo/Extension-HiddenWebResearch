import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    ENABLE_SERVER_DEPENDENT_FEATURES,
    getEnabledResearchBackends,
    isResearchBackendEnabled,
    normalizeResearchBackend,
    resolveResearchBackendSelection,
    SERVER_DEPENDENT_RESEARCH_BACKENDS,
    STOCK_RESEARCH_BACKENDS,
} from '../feature-policy.js';
import {
    evaluateNativeResearchGate,
    hasExplicitNoSearchIntent,
    hasExplicitSearchIntent,
} from '../research-gate.js';

assert.equal(ENABLE_SERVER_DEPENDENT_FEATURES, false);
for (const request of ['不要联网搜索，只根据我提供的内容回答', 'Do not search the web; use only provided context']) {
    assert.equal(hasExplicitNoSearchIntent(request), true);
    assert.equal(hasExplicitSearchIntent(request), false);
}
assert.deepEqual(STOCK_RESEARCH_BACKENDS, ['searxng', 'serpapi']);
assert.deepEqual(
    SERVER_DEPENDENT_RESEARCH_BACKENDS,
    ['anysearch', 'claude_profile', 'gemini_profile'],
);
assert.deepEqual(getEnabledResearchBackends(), ['searxng', 'serpapi']);

for (const backend of STOCK_RESEARCH_BACKENDS) {
    assert.equal(isResearchBackendEnabled(backend), true);
    assert.equal(normalizeResearchBackend(backend), backend);
    assert.deepEqual(resolveResearchBackendSelection(backend, true), {
        requestedBackend: backend,
        researchBackend: backend,
        enabled: true,
        paused: false,
    });
}
for (const backend of [...SERVER_DEPENDENT_RESEARCH_BACKENDS, 'unknown', '', null]) {
    assert.equal(normalizeResearchBackend(backend), 'searxng');
}
for (const backend of SERVER_DEPENDENT_RESEARCH_BACKENDS) {
    assert.equal(isResearchBackendEnabled(backend), false);
    assert.deepEqual(resolveResearchBackendSelection(backend, true), {
        requestedBackend: backend,
        researchBackend: 'searxng',
        enabled: false,
        paused: true,
    });
}
assert.deepEqual(resolveResearchBackendSelection('unknown', true), {
    requestedBackend: 'unknown',
    researchBackend: 'searxng',
    enabled: true,
    paused: false,
});

const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const settingsHtml = await readFile(new URL('../settings.html', import.meta.url), 'utf8');
const visibleSettingsHtml = settingsHtml.replace(/<!--[\s\S]*?-->/gu, '');

assert.equal(manifest.version, '1.8.0');
assert.match(indexSource, /schemaVersion:\s*8/u);
assert.match(indexSource, /body:\s*JSON\.stringify\(\{ query \}\)/u);
assert.match(indexSource, /if \(!isResearchBackendEnabled\(settings\.researchBackend\)/u);
assert.deepEqual(
    evaluateNativeResearchGate('Tokyo weather tomorrow', 'auto'),
    { shouldCall: true, reason: 'dynamic_topic' },
);
assert.match(indexSource, /extension_prompt_types\.IN_CHAT/u);
assert.match(indexSource, /extension_prompt_roles\.SYSTEM/u);
assert.match(
    indexSource,
    /setExtensionPrompt\(\s*PROMPT_KEY,\s*value,\s*extension_prompt_types\.IN_CHAT,\s*0,\s*false,\s*extension_prompt_roles\.SYSTEM,\s*\)/u,
);
assert.doesNotMatch(
    indexSource,
    /setExtensionPrompt\(PROMPT_KEY, packet, extension_prompt_types\.IN_PROMPT/u,
);

assert.match(indexSource, /const mustSearch = localGate\.shouldCall/u);
assert.match(indexSource, /Planner failed; using local-gate search fallback/u);
const packetStart = indexSource.indexOf('function buildResearchPacket');
const packetEnd = indexSource.indexOf('function makeResearchCacheKey', packetStart);
const packetSource = indexSource.slice(packetStart, packetEnd);
assert.match(packetSource, /const envelopeName = 'hidden_web_research'/u);
assert.doesNotMatch(packetSource, /web_search_tool_results|grounding_context/u);
assert.doesNotMatch(packetSource, /trusted_runtime_clock/u);

assert.match(indexSource, /const runtimeClock = captureRuntimeClock\(\)/u);
assert.equal((indexSource.match(/const runtimeClock = captureRuntimeClock\(\)/gu) || []).length, 1);
assert.match(indexSource, /classifyTemporalRequest\(latestUser\?\.mes/u);
assert.match(indexSource, /temporalKind === 'clock_only'/u);
assert.match(indexSource, /buildTrustedRuntimeClockPrompt\(runtimeClock, \{ clockOnly: true \}\)/u);
assert.match(indexSource, /已注入本地日期与时间（未调用规划器或搜索服务）/u);
assert.match(indexSource, /runtimeClockPartition:\s*runtimeClock\.cachePartition/u);
assert.match(indexSource, /remoteClockMinute:\s*remoteClockRequest/u);
assert.match(indexSource, /isRemoteClockRequest\(userText\)/u);
assert.match(indexSource, /isLocationRelativeRequest\(userText\)/u);
assert.match(indexSource, /isLiveClockTopic\(userText\)/u);
assert.match(indexSource, /captured_at_utc field is the authoritative absolute instant/u);
assert.match(indexSource, /never substitute the browser-local date or time for the target location/u);
assert.match(indexSource, /isRemoteClockRequest,/u);
assert.match(indexSource, /runtimeClock,\s*\n\s*\}\);/u);
assert.match(indexSource, /isLocationRelativeRequest,/u);
assert.match(indexSource, /prepareAnchoredSearchQuery\(candidateQuery/u);
assert.match(indexSource, /const conversationChat = Array\.isArray\(context\.chat\)/u);
assert.match(indexSource, /getLatestUserMessage\(conversationChat\)/u);
assert.match(indexSource, /buildClientWebSearchInvocations/u);
assert.match(indexSource, /<<<HWR_CLIENT_TOOL_RESULTS_/u);
assert.match(indexSource, /name:\s*'hwr_web_search'/u);
assert.match(indexSource, /role:\s*'assistant',\s*\n\s*content:\s*'',\s*\n\s*tool_calls:/u);
assert.match(indexSource, /role:\s*'tool',\s*\n\s*tool_call_id:/u);
assert.match(indexSource, /request\.tool_choice = 'none'/u);
assert.match(indexSource, /requestSource === 'deepseek'/u);
assert.match(indexSource, /delete request\.tools/u);
assert.match(indexSource, /delete request\.tool_choice/u);
assert.match(indexSource, /isGemini3/u);
assert.match(indexSource, /\['makersuite', 'vertexai', 'google'\]/u);
assert.match(indexSource, /if \(isGemini3\) return false/u);
assert.match(indexSource, /if \(normalizedSource === 'deepseek'\) return true/u);
assert.match(indexSource, /activePromptInjection && hasInjectedResearchMarker\(request\)/u);
assert.match(indexSource, /String\(request\.type \|\| ''\) !== String\(pending\.type \|\| ''\)/u);
assert.match(indexSource, /request\.messages\.findLast/u);
assert.match(indexSource, /message\?\.name !== 'example_user'/u);
assert.match(indexSource, /typeof item\.content === 'string'/u);
assert.match(visibleSettingsHtml, /Gemini 3 转换器不会回传函数调用 ID/u);
assert.match(indexSource, /request\.enable_web_search = false/u);
assert.match(
    indexSource,
    /eventSource\.on\(event_types\.CHAT_COMPLETION_SETTINGS_READY,\s*handleChatCompletionSettingsReady\)/u,
);
assert.match(indexSource, /当前连接不支持安全工具消息，已自动回退隐藏研究包/u);
assert.match(indexSource, /setResearchPrompt\(''\)/u);

const anchoringStart = indexSource.indexOf('const preparedQuery = prepareAnchoredSearchQuery');
const dispatchStart = indexSource.indexOf('const result = await searchStructuredBackend', anchoringStart);
assert.ok(anchoringStart >= 0);
assert.ok(dispatchStart > anchoringStart);

const structuredStart = indexSource.indexOf('async function runStructuredSearchResearch');
const hardOptOutGuard = indexSource.indexOf('hasExplicitNoSearchIntent(userText)', structuredStart);
const plannerStart = indexSource.indexOf('const adapter = detectAdapter()', structuredStart);
assert.ok(structuredStart >= 0);
assert.ok(hardOptOutGuard > structuredStart);
assert.ok(plannerStart > hardOptOutGuard);

assert.match(visibleSettingsHtml, /<option value="searxng">/u);
assert.match(visibleSettingsHtml, /查询与回答策略/u);
assert.match(visibleSettingsHtml, /id="hwr_result_transport"/u);
assert.match(visibleSettingsHtml, /隐藏工具结果优先/u);
assert.match(visibleSettingsHtml, /固定使用隐藏研究包/u);
assert.match(visibleSettingsHtml, /<option value="serpapi">/u);
for (const backend of SERVER_DEPENDENT_RESEARCH_BACKENDS) {
    assert.doesNotMatch(visibleSettingsHtml, new RegExp(`<option value="${backend}">`, 'u'));
}

for (const id of [
    'hwr_anysearch_settings',
    'hwr_claude_profile_settings',
    'hwr_gemini_profile_settings',
    'hwr_claude_direct_key',
    'hwr_gemini_direct_key',
    'hwr_serpapi_language',
    'hwr_serpapi_country',
]) {
    assert.doesNotMatch(visibleSettingsHtml, new RegExp(`id="${id}"`, 'u'));
}

assert.match(visibleSettingsHtml, /id="hwr_searxng_settings"/u);
assert.match(visibleSettingsHtml, /id="hwr_serpapi_settings"/u);
assert.doesNotMatch(visibleSettingsHtml, /URL \+ Key/u);

console.log('Stock-only feature policy: all assertions passed');
