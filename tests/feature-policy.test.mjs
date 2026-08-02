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
const plannerPromptsSource = await readFile(new URL('../planner-prompts.js', import.meta.url), 'utf8');
const querySafetySource = await readFile(new URL('../query-safety.js', import.meta.url), 'utf8');
const researchTransportSource = await readFile(new URL('../research-transport.js', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const settingsHtml = await readFile(new URL('../settings.html', import.meta.url), 'utf8');
const visibleSettingsHtml = settingsHtml.replace(/<!--[\s\S]*?-->/gu, '');

assert.equal(manifest.version, '1.9.0');
assert.equal(manifest.minimum_client_version, '1.13.3');
assert.equal(manifest.display_name, 'P1G搜（颜料搜）');
assert.equal(manifest.generate_interceptor, 'HiddenWebResearch_Intercept');
assert.match(visibleSettingsHtml, /<b>P1G搜（颜料搜）<\/b>/u);
assert.match(indexSource, /const DISPLAY_NAME = 'P1G搜（颜料搜）'/u);
assert.match(indexSource, /const EXTENSION_ID = 'third-party\/Extension-HiddenWebResearch'/u);
assert.match(indexSource, /const SETTINGS_KEY = 'hiddenWebResearch'/u);
assert.match(indexSource, /const PROMPT_KEY = '___HiddenWebResearch___'/u);
assert.match(readme, /^# P1G搜（颜料搜） for SillyTavern$/mu);
assert.match(readme, /https:\/\/github\.com\/PigmentTokyo\/Extension-HiddenWebResearch/u);
assert.match(indexSource, /schemaVersion:\s*10/u);
assert.match(indexSource, /strategyCustomPromptEnabled:\s*false/u);
assert.match(indexSource, /strategyCustomPrompt:\s*''/u);
assert.match(indexSource, /triggerCustomPromptEnabled:\s*false/u);
assert.match(indexSource, /triggerCustomPrompt:\s*''/u);
assert.match(indexSource, /normalizeCustomPrompt\(settings\.strategyCustomPrompt\)/u);
assert.match(indexSource, /normalizeCustomPrompt\(settings\.triggerCustomPrompt\)/u);
assert.match(indexSource, /strategyCustomPromptHash:/u);
assert.match(indexSource, /triggerCustomPromptHash:/u);
assert.match(plannerPromptsSource, /LOWER-PRIORITY USER-CONFIGURED TRIGGER GUIDANCE/u);
assert.match(plannerPromptsSource, /LOWER-PRIORITY USER-CONFIGURED STRATEGY GUIDANCE/u);
assert.match(plannerPromptsSource, /FIXED TRIGGER DIRECTIVE/u);
assert.match(plannerPromptsSource, /Number\(round\) === 1 && !evidence\.length && !evaluationOnly && !forceInitialSearch/u);
assert.match(plannerPromptsSource, /CUSTOM_PROMPT_MAX_CHARS = 4000/u);
assert.match(indexSource, /containsSensitiveQueryMaterial\(prompt\)/u);

const totalLimitStart = indexSource.indexOf('function getEffectiveTotalQueryLimit');
const roundLimitStart = indexSource.indexOf('function getEffectiveRoundQueryLimit', totalLimitStart);
const cleanQueryStart = indexSource.indexOf('function cleanQuery', roundLimitStart);
const liveLimitSource = indexSource.slice(totalLimitStart, cleanQueryStart);
assert.match(liveLimitSource, /return settings\.maxTotalQueries/u);
assert.match(liveLimitSource, /settings\.maxQueriesPerRound/u);
assert.doesNotMatch(liveLimitSource, /profile\.totalQueryLimit|getStrategyQueryLimit/u);
assert.match(indexSource, /Math\.min\(settings\.maxTotalQueries, settings\.maxRounds \* settings\.maxQueriesPerRound\)/u);
assert.match(indexSource, /\['maxRounds', 'maxQueriesPerRound', 'maxTotalQueries'\]\.includes\(key\)/u);

const answerCustomizationStart = indexSource.indexOf('function buildStrategyAnswerCustomization');
const truncateTextStart = indexSource.indexOf('function truncateText', answerCustomizationStart);
const answerCustomizationSource = indexSource.slice(answerCustomizationStart, truncateTextStart);
assert.match(answerCustomizationSource, /settings\.strategyCustomPromptEnabled/u);
assert.doesNotMatch(answerCustomizationSource, /triggerCustomPrompt/u);
assert.match(indexSource, /\$\{answerCustomization\}/u);
assert.match(indexSource, /body:\s*JSON\.stringify\(\{ query \}\)/u);
assert.match(indexSource, /if \(!isResearchBackendEnabled\(settings\.researchBackend\)/u);
assert.deepEqual(
    evaluateNativeResearchGate('Tokyo weather tomorrow', 'auto'),
    { shouldCall: true, reason: 'dynamic_topic' },
);
assert.deepEqual(
    evaluateNativeResearchGate('Continue this fictional roleplay scene', 'auto'),
    { shouldCall: false, reason: 'creative_or_roleplay' },
);
assert.deepEqual(
    evaluateNativeResearchGate('Explain photosynthesis', 'explicit'),
    { shouldCall: false, reason: 'explicit_not_requested' },
);
assert.deepEqual(
    evaluateNativeResearchGate('Search the web for the latest release', 'explicit'),
    { shouldCall: true, reason: 'explicit_request' },
);
assert.deepEqual(
    evaluateNativeResearchGate('Hello', 'always'),
    { shouldCall: true, reason: 'policy_always' },
);
assert.deepEqual(
    evaluateNativeResearchGate('Do not search the web; use only provided context', 'always'),
    { shouldCall: false, reason: 'user_opt_out' },
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
assert.match(indexSource, /buildCompletedClientToolMessages/u);
assert.match(indexSource, /<<<HWR_CLIENT_TOOL_RESULTS_/u);
assert.match(indexSource, /name:\s*'hwr_web_search'/u);
assert.match(researchTransportSource, /role:\s*'assistant',\s*\n\s*content:\s*'',\s*\n\s*tool_calls:/u);
assert.match(researchTransportSource, /role:\s*'tool',\s*\n\s*tool_call_id:/u);
assert.match(researchTransportSource, /assistant\.reasoning_content = ''/u);
assert.match(indexSource, /supportsGeminiToolChoiceNone\(CLIENT_VERSION\)/u);
assert.match(indexSource, /CLIENT_COMPATIBILITY\.requestRewrite/u);
assert.match(indexSource, /request\.tool_choice = 'none'/u);
assert.match(indexSource, /requestSource === 'deepseek'/u);
assert.match(indexSource, /delete request\.tools/u);
assert.match(indexSource, /delete request\.tool_choice/u);
assert.match(indexSource, /isGemini3/u);
assert.match(indexSource, /\['makersuite', 'vertexai', 'google'\]/u);
assert.match(indexSource, /if \(isGemini3\) return false/u);
assert.match(indexSource, /if \(normalizedSource === 'deepseek'\) return true/u);
assert.match(indexSource, /activePromptInjection && hasInjectedResearchMarker\(request\)/u);
assert.match(indexSource, /isCompatibleGenerationRequest\(request, HANDLED_GENERATION_TYPES\)/u);
assert.match(indexSource, /String\(request\.type \|\| ''\) !== String\(pending\.type \|\| ''\)/u);
assert.match(indexSource, /request\.messages\.findLast/u);
assert.match(indexSource, /message\?\.name !== 'example_user'/u);
assert.match(indexSource, /typeof item\.content === 'string'/u);
assert.match(visibleSettingsHtml, /1\.13\.3–1\.14\.x 尚不能对 Gemini/u);
assert.match(indexSource, /request\.enable_web_search = false/u);
assert.match(
    indexSource,
    /eventSource\.on\(event_types\.CHAT_COMPLETION_SETTINGS_READY,\s*handleChatCompletionSettingsReady\)/u,
);
assert.match(indexSource, /当前连接不支持安全工具消息，已自动回退隐藏研究包/u);
assert.match(indexSource, /setResearchPrompt\(''\)/u);
assert.match(indexSource, /buildPlannerPriorTurns/u);
assert.match(indexSource, /forceInitialSearch:\s*mustSearch && !evidence\.length/u);
assert.match(indexSource, /HWR_INTERNAL_PLANNER_PROFILE=\$\{adapter\}/u);
assert.match(plannerPromptsSource, /HWR_INTERNAL_PLANNER_PROFILE=\$\{adapter\}/u);
assert.match(indexSource, /invalid decision after evidence collection/u);
assert.match(plannerPromptsSource, /PLANNER_INPUT_JSON/u);
assert.match(plannerPromptsSource, /latest_user_request/u);
assert.match(plannerPromptsSource, /force_initial_search/u);
assert.match(plannerPromptsSource, /code may require search for current APIs or versions/u);
assert.match(plannerPromptsSource, /creative or roleplay tasks may require search for exact canon facts/u);
assert.doesNotMatch(plannerPromptsSource, /<conversation>|<research_state>/u);
assert.doesNotMatch(plannerPromptsSource, /END_PLANNER_INPUT_JSON/u);
assert.match(plannerPromptsSource, /compactSearchRequest\(latestUserRequest, 4000\)/u);
assert.match(indexSource, /searchPolicy:\s*settings\.searchPolicy/u);
assert.match(indexSource, /evidence\.length && decision\.unresolved\.length/u);
assert.match(indexSource, /if \(unresolvedGaps\.length\) \{\s*researchPartial = true/u);
assert.match(indexSource, /buildSafeFallbackQuery\(userText, 220\)/u);
assert.match(indexSource, /containsSensitiveQueryMaterial\(query\)/u);
assert.match(indexSource, /blockedUnsafeQueries/u);
assert.match(indexSource, /blockedThisDecision/u);
assert.match(indexSource, /blockedPreparedQueryCount/u);
assert.match(indexSource, /requested more research but produced no new executable query/u);
assert.match(indexSource, /credential-shaped search material/u);
assert.match(indexSource, /planner-requested web search failed/u);
assert.match(indexSource, /if \(hadSearchFailure\) \{/u);
assert.match(querySafetySource, /PRIVATE KEY|Bearer|api\[_-\]\?key/u);
assert.match(querySafetySource, /\[middle omitted\]/u);

const anchoringStart = indexSource.indexOf('const preparedQuery = prepareAnchoredSearchQuery');
const finalQueryStart = indexSource.indexOf('const query = preparedQuery.executedQuery', anchoringStart);
const finalSafetyStart = indexSource.indexOf('containsSensitiveQueryMaterial(query)', finalQueryStart);
const dispatchStart = indexSource.indexOf('const result = await searchStructuredBackend', anchoringStart);
assert.ok(anchoringStart >= 0);
assert.ok(finalSafetyStart > finalQueryStart);
assert.ok(dispatchStart > finalSafetyStart);
assert.ok(dispatchStart > anchoringStart);

const structuredStart = indexSource.indexOf('async function runStructuredSearchResearch');
const hardOptOutGuard = indexSource.indexOf('hasExplicitNoSearchIntent(userText)', structuredStart);
const plannerStart = indexSource.indexOf('const adapter = detectAdapter()', structuredStart);
assert.ok(structuredStart >= 0);
assert.ok(hardOptOutGuard > structuredStart);
assert.ok(plannerStart > hardOptOutGuard);

assert.match(visibleSettingsHtml, /<option value="searxng">/u);
assert.match(visibleSettingsHtml, /for="hwr_adapter">[^<]+<\/label>/u);
assert.match(visibleSettingsHtml, /<option value="claude">Claude /u);
assert.match(visibleSettingsHtml, /<option value="gemini">Gemini /u);
assert.match(visibleSettingsHtml, /id="hwr_result_transport"/u);
assert.match(visibleSettingsHtml, /隐藏工具结果优先/u);
assert.match(visibleSettingsHtml, /固定使用隐藏研究包/u);
assert.match(visibleSettingsHtml, /兼容 SillyTavern 1\.13\.3 及以上版本/u);
assert.match(visibleSettingsHtml, /<option value="serpapi">/u);
for (const id of [
    'hwr_strategy_custom_enabled',
    'hwr_strategy_custom_prompt',
    'hwr_save_strategy_custom_prompt',
    'hwr_restore_strategy_custom_prompt',
    'hwr_strategy_custom_status',
    'hwr_trigger_custom_enabled',
    'hwr_trigger_custom_prompt',
    'hwr_save_trigger_custom_prompt',
    'hwr_restore_trigger_custom_prompt',
    'hwr_trigger_custom_status',
    'hwr_restore_advanced_defaults',
]) {
    assert.match(visibleSettingsHtml, new RegExp(`id="${id}"`, 'u'));
}
assert.match(visibleSettingsHtml, /maxlength="4000"/u);
assert.match(visibleSettingsHtml, /实际每轮与总查询硬上限完全由“高级限制”中的数值决定/u);
assert.match(visibleSettingsHtml, /DeepSeek[^<]+Claude[^<]+API[^<]+DeepSeek/u);
assert.match(indexSource, /bindCustomPromptUi\('strategy'\)/u);
assert.match(indexSource, /bindCustomPromptUi\('trigger'\)/u);
assert.match(indexSource, /restoreCustomPromptDefaults/u);
assert.match(indexSource, /restoreAdvancedSettingsDefaults/u);
assert.match(indexSource, /invalidateRun\(`\$\{kind\} custom prompt saved`, \{ clearCaches: true \}\)/u);
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
