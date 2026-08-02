import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    fallbackPlannerToCurrent,
    isPlannerRequestTimeout,
    listPlannerProfiles,
    normalizePlannerConnectionMode,
    PLANNER_REQUEST_TIMEOUT_REASON,
    requestHiddenPlanner,
    resolvePlannerRequestMode,
    raceTaskWithAbortSignal,
    shouldFallbackPlannerRequest,
} from '../planner-request-router.js';

assert.equal(normalizePlannerConnectionMode('current'), 'current');
assert.equal(normalizePlannerConnectionMode('profile'), 'profile');
assert.equal(normalizePlannerConnectionMode(' profile '), 'profile');
assert.equal(normalizePlannerConnectionMode('PROFILE'), 'profile');
assert.equal(normalizePlannerConnectionMode('direct'), 'current');
assert.equal(normalizePlannerConnectionMode(''), 'current');
assert.equal(normalizePlannerConnectionMode(null), 'current');

assert.equal(resolvePlannerRequestMode('profile', false), 'profile');
assert.equal(resolvePlannerRequestMode('profile', true), 'current');
assert.equal(resolvePlannerRequestMode('current', false), 'current');
assert.equal(resolvePlannerRequestMode('invalid', false), 'current');

const timeoutController = new AbortController();
timeoutController.abort(PLANNER_REQUEST_TIMEOUT_REASON);
assert.equal(isPlannerRequestTimeout(timeoutController.signal), true);
assert.equal(shouldFallbackPlannerRequest(timeoutController.signal, true), true);

const userAbortController = new AbortController();
userAbortController.abort('Generation stopped');
assert.equal(isPlannerRequestTimeout(userAbortController.signal), false);
assert.equal(shouldFallbackPlannerRequest(userAbortController.signal, true), false);
assert.equal(isPlannerRequestTimeout(null), false);
assert.equal(shouldFallbackPlannerRequest(null, true), true);
assert.equal(shouldFallbackPlannerRequest(null, false), false);

{
    const controller = new AbortController();
    let taskStarted = false;
    const pending = raceTaskWithAbortSignal(() => {
        taskStarted = true;
        return new Promise(() => {});
    }, controller.signal);
    await Promise.resolve();
    assert.equal(taskStarted, true);
    controller.abort('Generation stopped');
    await assert.rejects(pending, error => error?.name === 'AbortError');
}

{
    const controller = new AbortController();
    const result = await raceTaskWithAbortSignal(
        async () => 'completed',
        controller.signal,
    );
    assert.equal(result, 'completed');
}

{
    const controller = new AbortController();
    controller.abort(PLANNER_REQUEST_TIMEOUT_REASON);
    await assert.rejects(
        raceTaskWithAbortSignal(async () => 'must not run', controller.signal),
        error => error?.name === 'AbortError',
    );
}

const supportedProfiles = [
    { id: 'planner-fast', name: 'Fast planner', model: 'planner-small' },
    { id: 'planner-strong', name: 'Strong planner', model: 'planner-large' },
];

{
    let currentCalls = 0;
    const result = await fallbackPlannerToCurrent({
        error: new Error('profile timeout'),
        signal: timeoutController.signal,
        fallbackToCurrent: true,
        isCurrent: () => true,
        generateCurrent: async () => {
            currentCalls++;
            return '{"action":"DONE"}';
        },
    });
    assert.equal(currentCalls, 1);
    assert.deepEqual(result, {
        text: '{"action":"DONE"}',
        source: 'current',
        fallbackUsed: true,
    });
}

{
    let currentCalls = 0;
    const originalError = new Error('user cancelled profile request');
    await assert.rejects(
        fallbackPlannerToCurrent({
            error: originalError,
            signal: userAbortController.signal,
            fallbackToCurrent: true,
            isCurrent: () => false,
            generateCurrent: async () => {
                currentCalls++;
                return 'must not run';
            },
        }),
        error => error === originalError,
    );
    assert.equal(currentCalls, 0);
}

{
    let currentCalls = 0;
    const originalError = new Error('profile failed with fallback disabled');
    await assert.rejects(
        fallbackPlannerToCurrent({
            error: originalError,
            fallbackToCurrent: false,
            isCurrent: () => true,
            generateCurrent: async () => {
                currentCalls++;
                return 'must not run';
            },
        }),
        error => error === originalError,
    );
    assert.equal(currentCalls, 0);
}

{
    let currentCalls = 0;
    await assert.rejects(
        fallbackPlannerToCurrent({
            error: new Error('profile failed after chat changed'),
            fallbackToCurrent: true,
            isCurrent: () => false,
            generateCurrent: async () => {
                currentCalls++;
                return 'must not run';
            },
        }),
        error => error?.name === 'AbortError',
    );
    assert.equal(currentCalls, 0);
}

{
    let currentCalls = 0;
    await assert.rejects(
        fallbackPlannerToCurrent({
            error: new Error('profile failed'),
            fallbackToCurrent: true,
            isCurrent: () => true,
            generateCurrent: async () => {
                currentCalls++;
                throw new Error('current fallback failed');
            },
        }),
        /current fallback failed/u,
    );
    assert.equal(currentCalls, 1, 'a failed current fallback must not trigger a third attempt');
}

{
    let runIsCurrent = true;
    let currentCalls = 0;
    await assert.rejects(
        fallbackPlannerToCurrent({
            error: new Error('profile failed before chat changed'),
            fallbackToCurrent: true,
            isCurrent: () => runIsCurrent,
            generateCurrent: async () => {
                currentCalls++;
                runIsCurrent = false;
                return '{"action":"DONE"}';
            },
        }),
        error => error?.name === 'AbortError',
    );
    assert.equal(currentCalls, 1, 'a chat change during fallback must discard the completed fallback');
}
assert.deepEqual(listPlannerProfiles({
    getSupportedProfiles: () => supportedProfiles,
}), supportedProfiles);
assert.deepEqual(listPlannerProfiles(null), []);
assert.deepEqual(listPlannerProfiles({}), []);
assert.deepEqual(listPlannerProfiles({
    getSupportedProfiles: () => {
        throw new Error('Connection Manager is disabled');
    },
}), []);
assert.deepEqual(listPlannerProfiles({
    getSupportedProfiles: () => null,
}), []);

{
    let currentCalls = 0;
    const result = await requestHiddenPlanner({
        mode: 'current',
        profileId: 'planner-fast',
        fallbackToCurrent: true,
        messages: [{ role: 'user', content: 'plan this' }],
        maxTokens: 256,
        service: {
            getSupportedProfiles: () => supportedProfiles,
            sendRequest: () => {
                throw new Error('Profile transport must not run in current mode');
            },
        },
        generateCurrent: async () => {
            currentCalls++;
            return '{"action":"DONE"}';
        },
    });

    assert.deepEqual(result, {
        text: '{"action":"DONE"}',
        source: 'current',
        fallbackUsed: false,
    });
    assert.equal(currentCalls, 1);
}

{
    const messages = [
        { role: 'system', content: 'Return planner JSON.' },
        { role: 'user', content: 'What needs searching?' },
    ];
    const controller = new AbortController();
    const overridePayload = {
        enable_web_search: false,
        include_reasoning: false,
        temperature: 0.2,
    };
    const mainConnection = { activeProfileId: 'main-answer-profile' };
    let capturedArgs;
    let globalSwitchCalls = 0;
    const service = {
        getSupportedProfiles: () => supportedProfiles,
        sendRequest: async (...args) => {
            capturedArgs = args;
            return { content: '{"action":"SEARCH","queries":["Tokyo weather"]}' };
        },
        // A correct implementation never calls either global profile switch method.
        setProfile: () => {
            globalSwitchCalls++;
            mainConnection.activeProfileId = 'planner-fast';
        },
        loadProfile: () => {
            globalSwitchCalls++;
            mainConnection.activeProfileId = 'planner-fast';
        },
    };

    const result = await requestHiddenPlanner({
        mode: 'profile',
        profileId: 'planner-fast',
        fallbackToCurrent: true,
        messages,
        maxTokens: 384,
        signal: controller.signal,
        overridePayload,
        service,
        generateCurrent: async () => {
            throw new Error('Current answer model must not run after a successful profile request');
        },
    });

    assert.deepEqual(result, {
        text: '{"action":"SEARCH","queries":["Tokyo weather"]}',
        source: 'profile',
        fallbackUsed: false,
    });
    assert.deepEqual(capturedArgs, [
        'planner-fast',
        messages,
        384,
        {
            stream: false,
            signal: controller.signal,
            extractData: true,
            includePreset: false,
            includeInstruct: false,
        },
        overridePayload,
    ]);
    assert.equal(globalSwitchCalls, 0);
    assert.equal(mainConnection.activeProfileId, 'main-answer-profile');
}

{
    const result = await requestHiddenPlanner({
        mode: 'profile',
        profileId: 'planner-fast',
        fallbackToCurrent: true,
        messages: [{ role: 'user', content: 'plan' }],
        maxTokens: 128,
        service: {
            getSupportedProfiles: () => supportedProfiles,
            sendRequest: async () => '{"action":"DONE"}',
        },
        generateCurrent: async () => {
            throw new Error('String profile responses must not fall back');
        },
    });
    assert.deepEqual(result, {
        text: '{"action":"DONE"}',
        source: 'profile',
        fallbackUsed: false,
    });
}

for (const profileFailure of [
    {
        label: 'Connection Manager service missing',
        service: null,
        profileId: 'planner-fast',
    },
    {
        label: 'profile ID missing',
        service: {
            getSupportedProfiles: () => supportedProfiles,
        },
        profileId: '',
    },
    {
        label: 'selected profile unavailable',
        service: {
            getSupportedProfiles: () => supportedProfiles,
        },
        profileId: 'deleted-profile',
    },
    {
        label: 'profile listing failed',
        service: {
            getSupportedProfiles: () => {
                throw new Error('Connection Manager is disabled');
            },
        },
        profileId: 'planner-fast',
    },
    {
        label: 'profile request failed',
        service: {
            getSupportedProfiles: () => supportedProfiles,
            sendRequest: async () => {
                throw new Error('upstream unavailable');
            },
        },
        profileId: 'planner-fast',
    },
    {
        label: 'profile returned an empty object',
        service: {
            getSupportedProfiles: () => supportedProfiles,
            sendRequest: async () => ({ content: '   ' }),
        },
        profileId: 'planner-fast',
    },
    {
        label: 'profile returned an empty string',
        service: {
            getSupportedProfiles: () => supportedProfiles,
            sendRequest: async () => '',
        },
        profileId: 'planner-fast',
    },
]) {
    let currentCalls = 0;
    const result = await requestHiddenPlanner({
        mode: 'profile',
        profileId: profileFailure.profileId,
        fallbackToCurrent: true,
        messages: [{ role: 'user', content: profileFailure.label }],
        maxTokens: 128,
        service: profileFailure.service,
        generateCurrent: async () => {
            currentCalls++;
            return `fallback:${profileFailure.label}`;
        },
    });

    assert.deepEqual(result, {
        text: `fallback:${profileFailure.label}`,
        source: 'current',
        fallbackUsed: true,
    }, profileFailure.label);
    assert.equal(currentCalls, 1, profileFailure.label);
}

{
    let currentCalls = 0;
    await assert.rejects(
        requestHiddenPlanner({
            mode: 'profile',
            profileId: 'planner-fast',
            fallbackToCurrent: false,
            messages: [{ role: 'user', content: 'plan' }],
            maxTokens: 128,
            service: {
                getSupportedProfiles: () => supportedProfiles,
                sendRequest: async () => {
                    throw new Error('profile offline');
                },
            },
            generateCurrent: async () => {
                currentCalls++;
                return 'must not be used';
            },
        }),
        /profile offline|planner profile|profile request/iu,
    );
    assert.equal(currentCalls, 0);
}

{
    let profileCalls = 0;
    let currentCalls = 0;
    await assert.rejects(
        requestHiddenPlanner({
            mode: 'profile',
            profileId: 'planner-fast',
            fallbackToCurrent: true,
            messages: [{ role: 'user', content: 'plan' }],
            maxTokens: 128,
            service: {
                getSupportedProfiles: () => supportedProfiles,
                sendRequest: async () => {
                    profileCalls++;
                    throw new Error('profile offline');
                },
            },
            generateCurrent: async () => {
                currentCalls++;
                throw new Error('current model is also offline');
            },
        }),
        /current model is also offline/iu,
    );
    assert.equal(profileCalls, 1, 'one routed call must make only one profile attempt');
    assert.equal(currentCalls, 1, 'one routed call must make only one fallback attempt');
}

{
    let currentCalls = 0;
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    await assert.rejects(
        requestHiddenPlanner({
            mode: 'profile',
            profileId: 'planner-fast',
            fallbackToCurrent: true,
            messages: [{ role: 'user', content: 'plan' }],
            maxTokens: 128,
            service: {
                getSupportedProfiles: () => supportedProfiles,
                sendRequest: async () => {
                    throw abortError;
                },
            },
            generateCurrent: async () => {
                currentCalls++;
                return 'must not fall back after abort';
            },
        }),
        error => error === abortError || error?.name === 'AbortError',
    );
    assert.equal(currentCalls, 0);
}

{
    const controller = new AbortController();
    controller.abort();
    let currentCalls = 0;
    await assert.rejects(
        requestHiddenPlanner({
            mode: 'profile',
            profileId: 'planner-fast',
            fallbackToCurrent: true,
            messages: [{ role: 'user', content: 'plan' }],
            maxTokens: 128,
            signal: controller.signal,
            service: {
                getSupportedProfiles: () => supportedProfiles,
                sendRequest: async () => {
                    throw new Error('transport stopped after signal abort');
                },
            },
            generateCurrent: async () => {
                currentCalls++;
                return 'must not run for an already-aborted request';
            },
        }),
        error => error?.name === 'AbortError' || controller.signal.aborted,
    );
    assert.equal(currentCalls, 0);
}

// Keep the routing helper usable by the SillyTavern 1.13.3 browser baseline.
// Its ConnectionManagerRequestService already has the exact five-argument
// sendRequest(profileId, prompt, maxTokens, custom, overridePayload) signature
// exercised above; the helper must not depend on newer JavaScript conveniences.
const routerSource = await readFile(new URL('../planner-request-router.js', import.meta.url), 'utf8');
assert.doesNotMatch(routerSource, /AbortSignal\.any|Promise\.withResolvers|structuredClone/gu);
assert.doesNotMatch(routerSource, /setProfile\s*\(|loadProfile\s*\(/gu);

const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const settingsHtml = await readFile(new URL('../settings.html', import.meta.url), 'utf8');
const visibleSettingsHtml = settingsHtml.replace(/<!--[\s\S]*?-->/gu, '');

assert.match(indexSource, /requestHiddenPlanner,/u);
assert.match(indexSource, /from '\.\/planner-request-router\.js'/u);
assert.match(indexSource, /schemaVersion:\s*10/u);
assert.match(indexSource, /plannerConnectionMode:\s*PLANNER_CONNECTION_MODES\.CURRENT/u);
assert.match(indexSource, /plannerProfileId:\s*''/u);
assert.match(indexSource, /plannerFallbackToCurrent:\s*true/u);
assert.match(indexSource, /normalizePlannerConnectionMode\(settings\.plannerConnectionMode\)/u);

const serviceStart = indexSource.indexOf('function getPlannerProfileService');
const plannerStart = indexSource.indexOf('async function planNextSearch', serviceStart);
const plannerEnd = indexSource.indexOf('function getSearxngConfig', plannerStart);
assert.ok(serviceStart >= 0 && plannerStart > serviceStart && plannerEnd > plannerStart);
const plannerServiceSource = indexSource.slice(serviceStart, plannerStart);
const plannerSource = indexSource.slice(plannerStart, plannerEnd);
assert.match(plannerServiceSource, /ConnectionManagerRequestService/u);
assert.match(plannerServiceSource, /selected === 'openai'/u);
assert.match(plannerServiceSource, /sendRequest:\s*service\.sendRequest\.bind\(service\)/u);
assert.match(plannerServiceSource, /enable_web_search:\s*false/u);
assert.match(plannerSource, /requestHiddenPlanner\(\{/u);
assert.match(plannerSource, /profileId:\s*settings\.plannerProfileId/u);
assert.match(plannerSource, /fallbackToCurrent:\s*false/u);
assert.match(plannerSource, /runCurrentFallback\(\{/u);
assert.match(plannerSource, /failedSignal:\s*profileSignal/u);
assert.match(plannerSource, /allowed:\s*settings\.plannerFallbackToCurrent/u);
assert.match(plannerSource, /decision\.action === 'INVALID' && routed\.source === PLANNER_CONNECTION_MODES\.PROFILE/u);
assert.match(plannerSource, /resolvePlannerRequestMode\(/u);
assert.match(indexSource, /raceTaskWithAbortSignal\(\(\) => callback\(controller\.signal\), controller\.signal\)/u);
assert.match(indexSource, /controller\.abort\(PLANNER_REQUEST_TIMEOUT_REASON\)/u);
assert.match(plannerSource, /service:\s*getPlannerProfileService\(\)/u);
assert.match(plannerSource, /generateCurrent,/u);
assert.match(plannerSource, /Boolean\(plannerRuntime\?\.profileFailed\)/u);
assert.match(plannerSource, /routed\.fallbackUsed && plannerRuntime/u);
assert.match(plannerSource, /plannerRuntime\.profileFailed = true/u);
assert.doesNotMatch(plannerSource, /setProfile\s*\(|loadProfile\s*\(/u);

const researchStart = indexSource.indexOf('async function runStructuredSearchResearch');
const researchEnd = indexSource.indexOf('function getClaudeProfiles', researchStart);
assert.ok(researchStart >= 0 && researchEnd > researchStart);
const researchSource = indexSource.slice(researchStart, researchEnd);
assert.match(researchSource, /plannerConnection:\s*getPlannerProfileFingerprint\(settings\)/u);
assert.match(researchSource, /plannerFallbackToCurrent:\s*settings\.plannerFallbackToCurrent/u);
assert.match(researchSource, /const plannerRuntime = \{/u);
assert.match(researchSource, /profileFailed:\s*false/u);
assert.match(researchSource, /isCurrent:\s*\(\) => isRunCurrent\(epoch, chatId\)/u);
assert.ok((researchSource.match(/plannerRuntime,/gu) || []).length >= 2);

for (const id of [
    'hwr_planner_connection_settings',
    'hwr_planner_connection_mode',
    'hwr_planner_profile_panel',
    'hwr_planner_profile',
    'hwr_refresh_planner_profiles',
    'hwr_planner_profile_hint',
    'hwr_planner_fallback_current',
    'hwr_test_planner_profile',
    'hwr_resolved_planner_connection',
]) {
    assert.match(visibleSettingsHtml, new RegExp(`id="${id}"`, 'u'));
}
assert.match(visibleSettingsHtml, /\u6700\u7ec8\u6b63\u6587\u59cb\u7ec8\u4f7f\u7528\u5f53\u524d\u56de\u7b54\u6a21\u578b/u);
assert.match(visibleSettingsHtml, /\u4e0d\u4f1a\u5207\u6362\u9152\u9986\u5f53\u524d\u8fde\u63a5/u);
assert.doesNotMatch(visibleSettingsHtml, /id="hwr_planner_(?:url|key)"/u);
assert.match(indexSource, /\$\('#hwr_refresh_planner_profiles'\)\.on\('click', refreshPlannerProfiles\)/u);
assert.match(indexSource, /\$\('#hwr_test_planner_profile'\)\.on\('click', testPlannerProfile\)/u);
const profileTestStart = indexSource.indexOf('async function testPlannerProfile');
const profileTestEnd = indexSource.indexOf('async function testStructuredSearchConnection', profileTestStart);
assert.ok(profileTestStart >= 0 && profileTestEnd > profileTestStart);
const profileTestSource = indexSource.slice(profileTestStart, profileTestEnd);
assert.match(profileTestSource, /activeRunEpoch !== null/u);
assert.match(profileTestSource, /const controller = new AbortController\(\)/u);
assert.doesNotMatch(profileTestSource, /runAbortableRequest/u);

const searchTestStart = indexSource.indexOf('async function testStructuredSearchConnection');
const searchTestEnd = indexSource.indexOf('async function testClaudeProfile', searchTestStart);
assert.ok(searchTestStart >= 0 && searchTestEnd > searchTestStart);
assert.match(indexSource.slice(searchTestStart, searchTestEnd), /activeRunEpoch !== null/u);

console.log('hidden planner profile routing tests passed');
