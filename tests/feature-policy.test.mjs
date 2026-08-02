import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    ENABLE_SERVER_DEPENDENT_FEATURES,
    getEnabledResearchBackends,
    isResearchBackendEnabled,
    normalizeResearchBackend,
    OPTIONAL_COMPONENT_RESEARCH_BACKENDS,
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
assert.deepEqual(STOCK_RESEARCH_BACKENDS, [
    'searxng',
    'serpapi',
    'tavily',
    'serper',
    'koboldcpp',
]);
assert.deepEqual(OPTIONAL_COMPONENT_RESEARCH_BACKENDS, ['extras', 'selenium']);
assert.deepEqual(
    SERVER_DEPENDENT_RESEARCH_BACKENDS,
    ['anysearch', 'claude_profile', 'gemini_profile'],
);
const publicBackends = [
    'searxng',
    'serpapi',
    'tavily',
    'serper',
    'koboldcpp',
    'extras',
    'selenium',
];
assert.deepEqual(getEnabledResearchBackends(), publicBackends);

for (const backend of publicBackends) {
    assert.equal(isResearchBackendEnabled(backend), true);
    assert.equal(normalizeResearchBackend(backend), backend);
    assert.deepEqual(resolveResearchBackendSelection(backend, true), {
        requestedBackend: backend,
        researchBackend: backend,
        enabled: true,
        paused: false,
    });
}
for (const backend of [...SERVER_DEPENDENT_RESEARCH_BACKENDS, 'zai', 'unknown', '', null]) {
    assert.equal(normalizeResearchBackend(backend), 'searxng');
}
for (const backend of [...SERVER_DEPENDENT_RESEARCH_BACKENDS, 'zai', 'unknown']) {
    assert.equal(isResearchBackendEnabled(backend), false);
    assert.deepEqual(resolveResearchBackendSelection(backend, true), {
        requestedBackend: backend,
        researchBackend: 'searxng',
        enabled: false,
        paused: true,
    });
}
for (const backend of ['', null]) {
    assert.deepEqual(resolveResearchBackendSelection(backend, true), {
        requestedBackend: '',
        researchBackend: 'searxng',
        enabled: true,
        paused: false,
    });
}
assert.equal(getEnabledResearchBackends().includes('zai'), false);
assert.equal(STOCK_RESEARCH_BACKENDS.includes('zai'), false);
assert.equal(OPTIONAL_COMPONENT_RESEARCH_BACKENDS.includes('zai'), false);
assert.equal(SERVER_DEPENDENT_RESEARCH_BACKENDS.includes('zai'), false);
assert.deepEqual(resolveResearchBackendSelection('', false), {
    requestedBackend: '',
    researchBackend: 'searxng',
    enabled: false,
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

assert.equal(manifest.version, '1.12.0');
assert.equal(manifest.minimum_client_version, '1.13.3');
assert.equal(manifest.display_name, 'P1G搜（颜料搜）');
assert.equal(manifest.generate_interceptor, 'HiddenWebResearch_Intercept');
assert.match(visibleSettingsHtml, /<b>P1G搜（颜料搜）<\/b>/u);
assert.match(visibleSettingsHtml, /<span>启用插件<\/span>/u);
assert.doesNotMatch(visibleSettingsHtml, /启用隐藏联网研究/u);
assert.match(indexSource, /const DISPLAY_NAME = 'P1G搜（颜料搜）'/u);
assert.match(indexSource, /const EXTENSION_ID = 'third-party\/Extension-HiddenWebResearch'/u);
assert.match(indexSource, /const SETTINGS_KEY = 'hiddenWebResearch'/u);
assert.match(indexSource, /const PROMPT_KEY = '___HiddenWebResearch___'/u);
assert.match(readme, /^# P1G搜（颜料搜） for SillyTavern$/mu);
assert.match(readme, /https:\/\/github\.com\/PigmentTokyo\/Extension-HiddenWebResearch/u);
assert.match(indexSource, /schemaVersion:\s*12/u);
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

for (const [backend, functionName] of Object.entries({
    tavily: 'searchTavily',
    serper: 'searchSerper',
    koboldcpp: 'searchKoboldCpp',
    extras: 'searchExtras',
    selenium: 'searchSelenium',
})) {
    assert.match(
        indexSource,
        new RegExp(`settings\\.researchBackend === '${backend}'\\) return ${functionName}\\(query, settings\\)`, 'u'),
    );
}
assert.match(indexSource, /fetch\('\/api\/search\/tavily'/u);
assert.match(indexSource, /fetch\('\/api\/search\/serper'/u);
assert.match(indexSource, /fetch\('\/api\/search\/koboldcpp'/u);
assert.match(indexSource, /url\.pathname = '\/api\/websearch'/u);
assert.match(indexSource, /doExtrasFetch\(url,/u);
assert.match(indexSource, /fetch\('\/api\/plugins\/selenium\/probe'/u);
assert.match(indexSource, /fetch\('\/api\/plugins\/selenium\/search'/u);
assert.match(
    indexSource,
    /textgenerationwebui_settings\?\.server_urls\?\.\[textgen_types\.KOBOLDCPP\]/u,
);
assert.match(indexSource, /body:\s*JSON\.stringify\(\{ query, url: baseUrl \}\)/u);
assert.doesNotMatch(indexSource, /api\.tavily\.com|google\.serper\.dev/iu);

for (const [provider, secretName] of Object.entries({
    serpapi: 'SERPAPI',
    tavily: 'TAVILY',
    serper: 'SERPER',
})) {
    assert.match(
        indexSource,
        new RegExp(`if \\(provider === '${provider}'\\)[\\s\\S]*?secretKey: SECRET_KEYS\\.${secretName}`, 'u'),
    );
}
assert.match(indexSource, /function getSharedSearchApiConfig\(provider\)/u);
assert.match(indexSource, /getActiveSearchApiSecret\(provider\)\?\.id/u);
assert.match(indexSource, /writeSecret\(\s*definition\.secretKey,/u);
assert.match(indexSource, /deleteSecret\(definition\.secretKey, record\.id\)/u);
assert.match(indexSource, /const warning = provider === 'anysearch'/u);
assert.match(indexSource, /SillyTavern[^`]*\$\{definition\.label\} Key/u);
assert.match(indexSource, /for \(const provider of \['serpapi', 'tavily', 'serper'\]\)/u);

const legacyBuilderStart = indexSource.indexOf('function buildLegacyAggregateResult');
const legacySearchStart = indexSource.indexOf('async function searchExtras', legacyBuilderStart);
const legacyBuilderSource = indexSource.slice(legacyBuilderStart, legacySearchStart);
assert.ok(legacyBuilderStart >= 0);
assert.ok(legacySearchStart > legacyBuilderStart);
assert.match(legacyBuilderSource, /items:\s*\[\]/u);
assert.match(legacyBuilderSource, /formatted:\s*''/u);
assert.match(legacyBuilderSource, /aggregateEvidence:/u);
assert.match(
    legacyBuilderSource,
    /candidateLinks:\s*settings\.includeSourceLinks\s*\?\s*normalized\.candidateLinks\s*:\s*\[\]/u,
);
assert.doesNotMatch(legacyBuilderSource, /buildUrlBackedSearchResult|formatSearchItems/u);
assert.match(legacyBuilderSource, /forcePromptTransport:\s*true/u);

const legacyFormatterStart = indexSource.indexOf('function formatLegacyAggregateEvidence');
const combinedFormatterStart = indexSource.indexOf('function formatCombinedResearchEvidence', legacyFormatterStart);
const legacyFormatterSource = indexSource.slice(legacyFormatterStart, combinedFormatterStart);
assert.ok(legacyFormatterStart >= 0);
assert.ok(combinedFormatterStart > legacyFormatterStart);
assert.match(legacyFormatterSource, /<candidate_urls>/u);
assert.match(legacyFormatterSource, /not mapped to individual URLs/u);
assert.match(legacyFormatterSource, /Never claim that a statement came from a candidate URL/u);
assert.doesNotMatch(legacyFormatterSource, /<source\s/u);
assert.match(indexSource, /normalizeLegacyBrowserSearchResponse\(payload, settings\.maxResultsPerQuery\)/u);
assert.equal((indexSource.match(/normalizeLegacyBrowserSearchResponse\(payload, settings\.maxResultsPerQuery\)/gu) || []).length, 2);
assert.match(indexSource, /forcePromptTransport \|\|= Boolean\(result\.forcePromptTransport\)/u);
assert.match(
    indexSource,
    /const transport = researchResult\.forcePromptTransport\s*\? 'prompt'\s*:\s*resolveResearchTransport/u,
);
assert.match(indexSource, /Aggregate summaries and candidate URL lists are not mapped to each other/u);

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
assert.match(packetSource, /const aggregateCitationRule = \['extras', 'selenium'\]\.includes\(searchBackend\)/u);
assert.match(packetSource, /Aggregate summaries and candidate URL lists are not mapped to each other/u);
assert.match(packetSource, /Never attribute a statement to, or cite, a candidate URL/u);
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

for (const backend of publicBackends) {
    assert.match(visibleSettingsHtml, new RegExp(`<option value="${backend}">`, 'u'));
    assert.match(
        indexSource,
        new RegExp(`\\$\\('#hwr_${backend}_settings'\\)\\.toggle\\(backend === '${backend}'\\)`, 'u'),
    );
}
assert.doesNotMatch(visibleSettingsHtml, /<option value="zai">/u);
assert.match(visibleSettingsHtml, /\u672c\u6269\u5c55\u4e0d\u63d0\u4f9b Z\.AI/u);
assert.equal((visibleSettingsHtml.match(/\u4e0d\u5f97\u4f2a\u9020\u9010\u6761\u5f15\u7528/gu) || []).length, 2);
assert.doesNotMatch(indexSource, /\/api\/search\/zai|SECRET_KEYS\.ZAI|researchBackend === 'zai'/iu);
assert.match(visibleSettingsHtml, /for="hwr_adapter">[^<]+<\/label>/u);
assert.match(visibleSettingsHtml, /<option value="claude">Claude /u);
assert.match(visibleSettingsHtml, /<option value="gemini">Gemini /u);
assert.match(visibleSettingsHtml, /id="hwr_result_transport"/u);
assert.match(visibleSettingsHtml, /隐藏工具结果优先/u);
assert.match(visibleSettingsHtml, /固定使用隐藏研究包/u);
assert.match(visibleSettingsHtml, /SillyTavern 1\.13\.3.*1\.18\.x/u);
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
for (const id of [
    'hwr_tavily_settings',
    'hwr_tavily_key',
    'hwr_tavily_status',
    'hwr_save_tavily_key',
    'hwr_clear_tavily_key',
    'hwr_test_tavily',
    'hwr_serper_settings',
    'hwr_serper_key',
    'hwr_serper_status',
    'hwr_save_serper_key',
    'hwr_clear_serper_key',
    'hwr_test_serper',
    'hwr_koboldcpp_settings',
    'hwr_test_koboldcpp',
    'hwr_extras_settings',
    'hwr_extras_engine',
    'hwr_test_extras',
    'hwr_selenium_settings',
    'hwr_selenium_engine',
    'hwr_test_selenium',
]) {
    assert.match(visibleSettingsHtml, new RegExp(`id="${id}"`, 'u'));
}
assert.match(indexSource, /\$\(definition\.saveSelector\)\.on\('click', \(\) => saveSearchApiKey\(provider\)\)/u);
assert.match(indexSource, /#hwr_clear_' \+ provider \+ '_key'\)\.on\('click', \(\) => clearSearchApiKey\(provider\)\)/u);
for (const backend of ['tavily', 'serper', 'koboldcpp', 'extras', 'selenium']) {
    assert.match(
        indexSource,
        new RegExp(`#hwr_test_${backend}'\\)\\.on\\('click', \\(\\) => testStructuredSearchConnection\\('${backend}'\\)`, 'u'),
    );
}
assert.match(indexSource, /#hwr_extras_engine'\)\.val\(settings\.extrasEngine\)\.on\('change'/u);
assert.match(indexSource, /#hwr_selenium_engine'\)\.val\(settings\.seleniumEngine\)\.on\('change'/u);
assert.match(visibleSettingsHtml, /maxlength="4000"/u);
for (const [id, title, summaryId] of [
    ['hwr_source_section', '当前来源配置', 'hwr_source_summary'],
    ['hwr_behavior_section', '研究行为与结果注入', 'hwr_behavior_summary'],
    ['hwr_planner_section', '隐藏搜索规划 API', 'hwr_planner_summary'],
    ['hwr_custom_prompts_section', '自定义提示词', 'hwr_custom_prompts_summary'],
]) {
    assert.match(
        indexSource,
        new RegExp(`createSettingsSection\\('${id}', '${title}', '${summaryId}'\\)`, 'u'),
    );
}
for (const id of ['hwr_advanced_section', 'hwr_help_section']) {
    assert.match(visibleSettingsHtml, new RegExp(`<details id="${id}" class="hwr_section`, 'u'));
}
const initializeSettingsLayoutCall = indexSource.lastIndexOf('initializeSettingsLayout();');
const bindSettingsUiCall = indexSource.lastIndexOf('bindSettingsUi();');
assert.ok(initializeSettingsLayoutCall >= 0);
assert.ok(bindSettingsUiCall > initializeSettingsLayoutCall);
assert.match(indexSource, /availableProfiles\.some\(profile => profile\.id === settings\.plannerProfileId\)/u);
assert.match(indexSource, /if \(openSource \|\| \(openMissing && source\.missing\)\) openSettingsSection\('hwr_source_section'\)/u);
assert.match(indexSource, /if \(openMissing && plannerMissing\) openSettingsSection\('hwr_planner_section'\)/u);
assert.match(indexSource, /const target = \/规划\|副 API\/u\.test\(String\(text\)\) \? 'hwr_planner_section' : 'hwr_source_section'/u);
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
assert.match(visibleSettingsHtml, /<option value="direct">自行保存 OpenAI 兼容 URL \+ Key（副 API）<\/option>/u);

console.log('Stock-only feature policy: all assertions passed');
