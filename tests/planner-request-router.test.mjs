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
import {
    getPlannerDirectProfileFingerprint,
    normalizePlannerDirectProfile,
} from '../planner-direct-profiles.js';

assert.equal(normalizePlannerConnectionMode('current'), 'current');
assert.equal(normalizePlannerConnectionMode('profile'), 'profile');
assert.equal(normalizePlannerConnectionMode(' profile '), 'profile');
assert.equal(normalizePlannerConnectionMode('PROFILE'), 'profile');
assert.equal(normalizePlannerConnectionMode('direct'), 'direct');
assert.equal(normalizePlannerConnectionMode(' DIRECT '), 'direct');
assert.equal(normalizePlannerConnectionMode(''), 'current');
assert.equal(normalizePlannerConnectionMode(null), 'current');

assert.equal(resolvePlannerRequestMode('profile', false), 'profile');
assert.equal(resolvePlannerRequestMode('profile', true), 'current');
assert.equal(resolvePlannerRequestMode('direct', false), 'direct');
assert.equal(resolvePlannerRequestMode('direct', true), 'current');
assert.equal(resolvePlannerRequestMode('current', false), 'current');
assert.equal(resolvePlannerRequestMode('invalid', false), 'current');

const directProfileMetadata = normalizePlannerDirectProfile({
    id: 'planner-direct-fast',
    name: '  Fast direct planner  ',
    apiUrl: 'https://planner.example/v1/chat/completions',
    model: 'deepseek-chat',
    secretId: 'planner-secret-id',
    apiKey: 'raw-api-key-must-not-persist',
    key: 'raw-key-must-not-persist',
    token: 'raw-token-must-not-persist',
});
assert.deepEqual({ ...directProfileMetadata }, {
    id: 'planner-direct-fast',
    name: 'Fast direct planner',
    apiUrl: 'https://planner.example/v1',
    model: 'deepseek-chat',
    secretId: 'planner-secret-id',
});
assert.deepEqual(Object.keys(directProfileMetadata).sort(), ['apiUrl', 'id', 'model', 'name', 'secretId']);
assert.doesNotMatch(JSON.stringify(directProfileMetadata), /raw-(?:api-)?key|raw-token/u);
const directProfileFingerprint = getPlannerDirectProfileFingerprint(directProfileMetadata);
assert.equal(directProfileFingerprint.mode, 'direct');
assert.equal(directProfileFingerprint.model, 'deepseek-chat');
assert.doesNotMatch(
    JSON.stringify(directProfileFingerprint),
    /planner\.example|planner-secret-id|raw-(?:api-)?key|raw-token/u,
);

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

const directProfiles = [
    {
        id: 'planner-direct-fast',
        name: 'Fast direct planner',
        apiUrl: 'https://planner.example/v1',
        model: 'deepseek-chat',
        secretId: 'planner-secret-id',
    },
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
    const mainConnection = {
        activeProfileId: 'main-answer-profile',
        activeCustomSecretId: 'main-answer-secret',
    };
    let capturedArgs;
    let globalMutationCalls = 0;
    const service = {
        getSupportedProfiles: () => directProfiles,
        sendRequest: async (...args) => {
            capturedArgs = args;
            return { content: '{"action":"SEARCH","queries":["Tokyo weather"]}' };
        },
        setProfile: () => {
            globalMutationCalls++;
            mainConnection.activeProfileId = 'planner-direct-fast';
        },
        loadProfile: () => {
            globalMutationCalls++;
            mainConnection.activeProfileId = 'planner-direct-fast';
        },
        rotateSecret: () => {
            globalMutationCalls++;
            mainConnection.activeCustomSecretId = 'planner-secret-id';
        },
    };

    const result = await requestHiddenPlanner({
        mode: 'direct',
        profileId: 'planner-direct-fast',
        fallbackToCurrent: true,
        messages,
        maxTokens: 384,
        signal: controller.signal,
        overridePayload,
        service,
        generateCurrent: async () => {
            throw new Error('Current answer model must not run after a successful direct request');
        },
    });

    assert.deepEqual(result, {
        text: '{"action":"SEARCH","queries":["Tokyo weather"]}',
        source: 'direct',
        fallbackUsed: false,
    });
    assert.deepEqual(capturedArgs, [
        'planner-direct-fast',
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
    assert.equal(globalMutationCalls, 0);
    assert.deepEqual(mainConnection, {
        activeProfileId: 'main-answer-profile',
        activeCustomSecretId: 'main-answer-secret',
    });
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
assert.match(indexSource, /from '\.\/planner-direct-profiles\.js'/u);
assert.match(indexSource, /from '\.\/planner-direct-transactions\.js'/u);
assert.match(indexSource, /supportsPlannerDirectSecretId,/u);
assert.match(indexSource, /schemaVersion:\s*12/u);
assert.match(indexSource, /plannerConnectionMode:\s*PLANNER_CONNECTION_MODES\.CURRENT/u);
assert.match(indexSource, /plannerProfileId:\s*''/u);
assert.match(indexSource, /plannerDirectProfileId:\s*''/u);
assert.match(indexSource, /plannerDirectProfiles:\s*\[\]/u);
assert.match(indexSource, /plannerFallbackToCurrent:\s*true/u);
assert.match(indexSource, /normalizePlannerConnectionMode\(settings\.plannerConnectionMode\)/u);
assert.match(indexSource, /setValue\('plannerDirectProfileId',[\s\S]*?slice\(0, 128\)\)/u);
assert.match(indexSource, /setNormalizedPlannerDirectProfiles\(settings, setValue\)/u);
assert.match(indexSource, /const allowedKeys = \['apiUrl', 'id', 'model', 'name', 'secretId'\]/u);

const defaultsStart = indexSource.indexOf('const defaultSettings = {');
const defaultsEnd = indexSource.indexOf('};', defaultsStart);
assert.ok(defaultsStart >= 0 && defaultsEnd > defaultsStart);
const defaultsSource = indexSource.slice(defaultsStart, defaultsEnd);
assert.doesNotMatch(defaultsSource, /plannerDirect(?:Api)?Key|plannerDirectToken/u);

const directCapabilityStart = indexSource.indexOf('function isPlannerDirectConnectionSupported');
const directCapabilityEnd = indexSource.indexOf('function getPlannerDirectProfileMetadata', directCapabilityStart);
assert.ok(directCapabilityStart >= 0 && directCapabilityEnd > directCapabilityStart);
const directCapabilitySource = indexSource.slice(directCapabilityStart, directCapabilityEnd);
assert.match(directCapabilitySource, /supportsPlannerDirectSecretId\(CLIENT_VERSION\)/u);
assert.match(directCapabilitySource, /ChatCompletionService\?\.processRequest === 'function'/u);

const directTransactionStart = indexSource.indexOf('async function readPersistedPlannerSettingsEnvelopeStrict');
const directTransactionEnd = indexSource.indexOf('async function fetchPlannerDirectModels', directTransactionStart);
assert.ok(directTransactionStart >= 0 && directTransactionEnd > directTransactionStart);
const directTransactionSource = indexSource.slice(directTransactionStart, directTransactionEnd);
assert.match(
    directTransactionSource,
    /fetch\('\/api\/settings\/get',[\s\S]*?cache:\s*'no-store'[\s\S]*?projectPlannerDirectSettingsSnapshot/u,
);
assert.match(directTransactionSource, /arePlannerDirectSettingsSnapshotsEqual\(persisted, expected\)/u);
assert.match(
    directTransactionSource,
    /projectPlannerDirectConnectionProfileSecretReferences\(safeExtensionSettings\)/u,
);
assert.match(
    directTransactionSource,
    /function saveSettingsWithSuccessSignal[\s\S]*?event_types\.SETTINGS_UPDATED[\s\S]*?await saveSettings\(\)[\s\S]*?removeListener/u,
);
assert.match(
    directTransactionSource,
    /function flushPendingSettingsBeforePlannerDirectMutation[\s\S]*?cancelDebounce\(saveSettingsDebounced\)[\s\S]*?await saveSettingsWithSuccessSignal\(\)[\s\S]*?readPersistedPlannerDirectSettingsStrict[\s\S]*?saveSettingsDebounced\(\)/u,
);
assert.match(
    directTransactionSource,
    /fetch\('\/api\/secrets\/read',[\s\S]*?cache:\s*'no-store'[\s\S]*?projectPlannerDirectCustomSecretState\(payload, SECRET_KEYS\.CUSTOM\)/u,
);
assert.match(directTransactionSource, /fetch\('\/api\/secrets\/write'/u);
assert.match(
    directTransactionSource,
    /async function writePlannerCustomSecretVerified\([^)]*assertBeforeWrite\)[\s\S]*?assertBeforeWrite\?\.\(\);[\s\S]*?fetch\('\/api\/secrets\/write'/u,
);
const directSecretWriteStart = directTransactionSource.indexOf('async function writePlannerCustomSecretVerified');
const directSecretRotateStart = directTransactionSource.indexOf('async function rotatePlannerCustomSecret', directSecretWriteStart);
assert.ok(directSecretWriteStart >= 0 && directSecretRotateStart > directSecretWriteStart);
assert.doesNotMatch(
    directTransactionSource.slice(directSecretWriteStart, directSecretRotateStart),
    /mirrorPlannerSecretState/u,
    'the live secret mirror must not run while the newly written planner Key is temporarily active',
);
assert.match(
    directTransactionSource,
    /restorePreviousPlannerActiveIfSafe\(newSecretId, previousActiveId\);[\s\S]*?await mirrorPlannerSecretState\(\)/u,
);
assert.match(
    directTransactionSource,
    /function acquirePlannerDirectHostSendLock\(\)[\s\S]*?applyInteractionGuards[\s\S]*?restoreInteractionGuards[\s\S]*?setSendButtonState\(true\);[\s\S]*?deactivateSendButtons\(\)/u,
);
const hostSendLockStart = directTransactionSource.indexOf('function acquirePlannerDirectHostSendLock');
const hostSendLockEnd = directTransactionSource.indexOf('function createPlannerDirectProfileId', hostSendLockStart);
assert.ok(hostSendLockStart >= 0 && hostSendLockEnd > hostSendLockStart);
const hostSendLockSource = directTransactionSource.slice(hostSendLockStart, hostSendLockEnd);
assert.match(
    hostSendLockSource,
    /display: element\.style\.display[\s\S]*?visibility: element\.style\.visibility[\s\S]*?matches\?\.\('\.mes_stop'\)[\s\S]*?style\.visibility = 'hidden'/u,
);
assert.match(
    hostSendLockSource,
    /guardedEscape[\s\S]*?event\.key === 'Escape'[\s\S]*?addEventListener\('keyup', blockGenerationInteraction, true\)/u,
);
assert.match(
    hostSendLockSource,
    /if \(hostGenerationActive[\s\S]*?!is_send_press[\s\S]*?!is_group_generating[\s\S]*?activeRunEpoch === null\)[\s\S]*?hostGenerationActive = false/u,
);
assert.match(
    hostSendLockSource,
    /restoreStopPresentationSnapshot\(\);[\s\S]*?setSendButtonState\(false\);[\s\S]*?activateSendButtons\(\)/u,
);
assert.doesNotMatch(
    hostSendLockSource,
    /#mes_stop'\)\.css\('display', 'none'\)/u,
    'credential sealing must keep Stop flex/hidden so every late host activate emits GENERATION_ENDED',
);
assert.match(
    directTransactionSource,
    /eventSource\.on\(event_types\.GENERATION_STARTED, onGenerationStarted\);[\s\S]*?eventSource\.on\(event_types\.GENERATION_ENDED, onGenerationFinished\);[\s\S]*?eventSource\.on\(event_types\.GENERATION_STOPPED, onGenerationFinished\)/u,
);
assert.match(
    directTransactionSource,
    /const onGenerationFinished = \(\) => \{[\s\S]*?hostGenerationActive = false;[\s\S]*?Promise\.resolve\(\)\.then\(enforceCredentialSeal\)/u,
);
assert.match(
    directTransactionSource,
    /if \(!allowActivate\) \{[\s\S]*?activationForbidden = true;[\s\S]*?if \(concurrentGeneration\) restoreInteractionGuards\(\);[\s\S]*?else enforceCredentialSeal\(\);[\s\S]*?return false;[\s\S]*?setSendButtonState\(false\);[\s\S]*?activateSendButtons\(\)/u,
);
assert.match(
    directTransactionSource,
    /PLANNER_DIRECT_HOST_GENERATION_CONTROL_SELECTOR[\s\S]*?#send_but[\s\S]*?#option_regenerate[\s\S]*?#option_continue[\s\S]*?\.mes_stop/u,
);
assert.match(directTransactionSource, /PLANNER_DIRECT_CREDENTIAL_LOCK_WARNING[\s\S]*?当前标签页已保持发送锁定/u);
const credentialGuardStart = indexSource.indexOf('function isPlannerDirectImplicitCustomCredentialRequest');
const credentialGuardEnd = indexSource.indexOf('function handleChatCompletionSettingsReady', credentialGuardStart);
assert.ok(credentialGuardStart >= 0 && credentialGuardEnd > credentialGuardStart);
const credentialGuardSource = indexSource.slice(credentialGuardStart, credentialGuardEnd);
assert.ok(credentialGuardSource.includes("String(request.chat_completion_source || '').trim().toLowerCase() === 'custom'"));
assert.ok(credentialGuardSource.includes("!String(request.secret_id || '').trim()"));
assert.ok(credentialGuardSource.includes("if (String(request.secret_id || '').trim()) return;"));
assert.ok(credentialGuardSource.includes('request.secret_id = sentinelSecretId'));
const credentialGuardLifecycleStart = directTransactionSource.indexOf(
    'function beginPlannerDirectCredentialRequestGuard',
);
const credentialGuardLifecycleEnd = directTransactionSource.indexOf(
    'function acquirePlannerDirectHostSendLock',
    credentialGuardLifecycleStart,
);
assert.ok(credentialGuardLifecycleStart >= 0 && credentialGuardLifecycleEnd > credentialGuardLifecycleStart);
const credentialGuardLifecycleSource = directTransactionSource.slice(
    credentialGuardLifecycleStart,
    credentialGuardLifecycleEnd,
);
assert.match(
    credentialGuardLifecycleSource,
    /sentinelSecretId:[^\r\n]*hwr-missing-[^\r\n]*createPlannerDirectProfileId\(\)/u,
);
assert.match(
    credentialGuardLifecycleSource,
    /makeFirst\([\s\S]*?capturePlannerDirectCredentialWindowRequest[\s\S]*?makeLast\([\s\S]*?enforcePlannerDirectCredentialWindowRequest/u,
);
assert.doesNotMatch(
    credentialGuardLifecycleSource,
    /previousActiveId/u,
    'implicit requests must fail closed with a sentinel, never pin an old Key to a possibly changed URL',
);
assert.match(
    indexSource,
    /if \(CLIENT_COMPATIBILITY\.supported\) \{[\s\S]*?makeFirst\([\s\S]*?capturePlannerDirectCredentialWindowRequest[\s\S]*?handleChatCompletionSettingsReady[\s\S]*?makeLast\([\s\S]*?enforcePlannerDirectCredentialWindowRequest/u,
);
assert.match(directTransactionSource, /findNewPlannerDirectSecret\(\{/u);
assert.match(
    directTransactionSource,
    /recoverableById[\s\S]*?error\.plannerSecretId = recoverableById\.id/u,
);
assert.match(
    directTransactionSource,
    /const confirmedSecretState = await readPlannerCustomSecretStateStrict\(\)[\s\S]*?flushPendingSettingsBeforePlannerDirectMutation\(settings\)[\s\S]*?const beforeSecretState = await readPlannerCustomSecretStateStrict\(\)[\s\S]*?arePlannerDirectCustomSecretStatesEqual\(confirmedSecretState, beforeSecretState\)/u,
);
assert.match(directTransactionSource, /当前酒馆还没有任何 Custom Key[\s\S]*?全局活动项/u);
assert.match(directTransactionSource, /fetch\('\/api\/secrets\/delete'/u);
assert.match(directTransactionSource, /state\.records\.some\(record => record\.id === secretId\)/u);
assert.match(
    directTransactionSource,
    /function isPlannerDirectMutationBusy\(\) \{[\s\S]*?activeRunEpoch !== null \|\| is_send_press \|\| is_group_generating \|\| plannerDirectTestLocked/u,
);
assert.match(
    directTransactionSource,
    /connectionProfileSecretReferences: persisted\.connectionProfileSecretReferences/u,
);
assert.match(
    indexSource,
    /function updatePlannerDirectCapabilityUi\(\)[\s\S]*?mutationLocked = plannerDirectSaveLocked[\s\S]*?#hwr_planner_connection_mode[\s\S]*?!supported \|\| mutationLocked/u,
);
const directSaveMutationStart = directTransactionSource.indexOf('async function savePlannerDirectProfile');
const directDeleteMutationStart = directTransactionSource.indexOf('async function deletePlannerDirectProfile', directSaveMutationStart);
assert.ok(directSaveMutationStart >= 0 && directDeleteMutationStart > directSaveMutationStart);
const directSaveMutationSource = directTransactionSource.slice(directSaveMutationStart, directDeleteMutationStart);
const directGuardBeginCall = directSaveMutationSource.indexOf(
    'credentialRequestGuard = beginPlannerDirectCredentialRequestGuard();',
);
const directFirstSecretAwait = directSaveMutationSource.indexOf(
    'const confirmedSecretState = await readPlannerCustomSecretStateStrict();',
);
assert.ok(
    directGuardBeginCall >= 0 && directFirstSecretAwait > directGuardBeginCall,
    'the request guard must be installed synchronously before the first API-Key transaction await',
);
assert.match(
    directSaveMutationSource,
    /assertPlannerDirectCredentialRequestGuard\(credentialRequestGuard\);[\s\S]*?hostSendLock\.assertSafe\(\);[\s\S]*?credentialStateSafe = false/u,
);
assert.ok(
    (directSaveMutationSource.match(
        /releasePlannerDirectCredentialRequestGuard\(credentialRequestGuard, credentialStateSafe\)/gu,
    ) || []).length >= 2,
    'both save exits must release the request guard only after the final credential proof',
);
assert.match(
    directSaveMutationSource,
    /if \(isPlannerDirectMutationBusy\(\)\)/u,
);
assert.match(
    directSaveMutationSource,
    /hostSendLock = acquirePlannerDirectHostSendLock\(\)[\s\S]*?flushPendingSettingsBeforePlannerDirectMutation\(settings\)[\s\S]*?hostSendLock\.assertSafe\(\)[\s\S]*?saveAndVerifyPlannerDirectSettings\(settings\)/u,
);
assert.match(
    directTransactionSource.slice(directDeleteMutationStart),
    /if \(isPlannerDirectMutationBusy\(\)\)/u,
);
assert.match(
    directTransactionSource.slice(directDeleteMutationStart),
    /hostSendLock = acquirePlannerDirectHostSendLock\(\)[\s\S]*?flushPendingSettingsBeforePlannerDirectMutation\(settings\)[\s\S]*?hostSendLock\.assertSafe\(\)[\s\S]*?saveAndVerifyPlannerDirectSettings\(settings\)/u,
);
assert.match(directSaveMutationSource, /const activateReady = options\?\.activateReady !== false/u);
assert.match(
    directSaveMutationSource,
    /profileReady && activateReady[\s\S]*?PLANNER_CONNECTION_MODES\.DIRECT[\s\S]*?: previousMode/u,
);
assert.doesNotMatch(directSaveMutationSource, /selectionChanged/u);
const directModelListStart = indexSource.indexOf('async function fetchPlannerDirectModels');
const directModelListEnd = indexSource.indexOf('async function testPlannerDirectProfile', directModelListStart);
assert.ok(directModelListStart >= 0 && directModelListEnd > directModelListStart);
const directModelListSource = indexSource.slice(directModelListStart, directModelListEnd);
assert.match(directModelListSource, /const needsSave = !profile/u);
assert.match(
    directModelListSource,
    /profile = await savePlannerDirectProfile\(\{ activateReady: false \}\)/u,
);
assert.match(directModelListSource, /const current = getPlannerDirectProfileMetadata\(getSettings\(\)\)/u);
assert.doesNotMatch(
    directModelListSource,
    /const current = getSelectedPlannerDirectProfile\(getSettings\(\)\)/u,
);
assert.match(indexSource, /if \(plannerDirectSaveLocked\) \{[\s\S]*?本轮不启动隐藏研究/u);
assert.match(visibleSettingsHtml, /<details class="hwr_subdetails">[\s\S]*?直连 Key 安全与版本说明/u);
assert.match(visibleSettingsHtml, /独立直连配置需要 SillyTavern 1\.18\.0\+/u);
assert.match(visibleSettingsHtml, /请勿跨标签页同时生成或轮换 Key/u);
assert.match(visibleSettingsHtml, /完全避开共享密钥槽影响时请使用 Connection Profile/u);
assert.match(await readFile(new URL('../README.md', import.meta.url), 'utf8'), /纯 URL \/ 模型 \/ 名称修改也使用同一把锁/u);
assert.match(await readFile(new URL('../README.md', import.meta.url), 'utf8'), /后台 [^\r\n]*generateRaw\(\)[\s\S]*?每事务唯一且不存在的 secret ID/u);
assert.doesNotMatch(
    directTransactionSource,
    /\b(?:writeSecret|deleteSecret)\s*\(/u,
    'direct planner mutations must use strict endpoint readback, not stock best-effort secret helpers',
);
const verifiedCleanupCalls = [...directTransactionSource.matchAll(/await deletePlannerCustomSecretVerified\(/gu)];
assert.ok(verifiedCleanupCalls.length >= 3);
for (const call of verifiedCleanupCalls) {
    const guardedPrefix = directTransactionSource.slice(Math.max(0, call.index - 400), call.index);
    assert.match(
        guardedPrefix,
        /if \(decision\.safe\) \{[\s\S]*$/u,
        'each verified direct-secret deletion must be gated by the fail-closed cleanup decision',
    );
}

const directServiceStart = indexSource.indexOf('function getPlannerDirectService');
const profileServiceStart = indexSource.indexOf('function getPlannerProfileService', directServiceStart);
const fingerprintStart = indexSource.indexOf('function getPlannerConnectionFingerprint', profileServiceStart);
const plannerStart = indexSource.indexOf('async function planNextSearch', fingerprintStart);
const plannerEnd = indexSource.indexOf('function getSearxngConfig', plannerStart);
assert.ok(
    directServiceStart >= 0
    && profileServiceStart > directServiceStart
    && fingerprintStart > profileServiceStart
    && plannerStart > fingerprintStart
    && plannerEnd > plannerStart,
);
const directServiceSource = indexSource.slice(directServiceStart, profileServiceStart);
const plannerServiceSource = indexSource.slice(profileServiceStart, fingerprintStart);
const fingerprintSource = indexSource.slice(fingerprintStart, plannerStart);
const plannerSource = indexSource.slice(plannerStart, plannerEnd);

assert.match(directServiceSource, /supportsPlannerDirectSecretId\(CLIENT_VERSION\)/u);
assert.match(directServiceSource, /ChatCompletionService\?\.processRequest/u);
assert.match(directServiceSource, /isPlannerDirectProfileReady\(profile\)/u);
assert.match(
    directServiceSource,
    /sendRequest:\s*async \(profileId, messages, maxTokens, custom = \{\}, overridePayload = \{\}\)/u,
);
assert.match(directServiceSource, /chat_completion_source:\s*'custom'/u);
assert.match(directServiceSource, /custom_url:\s*profile\.apiUrl/u);
assert.match(directServiceSource, /secret_id:\s*profile\.secretId/u);
assert.match(directServiceSource, /enable_web_search:\s*false/u);
assert.match(directServiceSource, /disableVendorNativeSearch\(requestData\)/u);
assert.match(directServiceSource, /delete requestData\.tools/u);
assert.match(directServiceSource, /delete requestData\.tool_choice/u);
assert.match(directServiceSource, /ChatCompletionService\.processRequest\(requestData,[\s\S]*?true, custom\?\.signal \?\? null\)/u);
assert.doesNotMatch(directServiceSource, /setProfile\s*\(|loadProfile\s*\(|rotatePlannerCustomSecret\s*\(|rotateSecret\s*\(/u);

assert.match(plannerServiceSource, /ConnectionManagerRequestService/u);
assert.match(plannerServiceSource, /selected === 'openai'/u);
assert.match(plannerServiceSource, /sendRequest:\s*service\.sendRequest\.bind\(service\)/u);
assert.match(fingerprintSource, /settings\.plannerConnectionMode === PLANNER_CONNECTION_MODES\.DIRECT/u);
assert.match(fingerprintSource, /getPlannerDirectProfileFingerprint\(profile\)/u);
assert.match(fingerprintSource, /profileIdHash:\s*hashString\(settings\.plannerDirectProfileId \|\| ''\)/u);
assert.match(fingerprintSource, /mode:\s*PLANNER_CONNECTION_MODES\.PROFILE/u);
assert.match(
    fingerprintSource,
    /function getPlannerProfileOverridePayload\(\)[\s\S]*?enable_web_search:\s*false/u,
);

assert.match(plannerSource, /requestHiddenPlanner\(\{/u);
assert.match(plannerSource, /profileId:\s*secondaryId/u);
assert.match(plannerSource, /fallbackToCurrent:\s*false/u);
assert.match(plannerSource, /runCurrentFallback\(\{/u);
assert.match(plannerSource, /failedSignal:\s*secondarySignal/u);
assert.match(plannerSource, /allowed:\s*settings\.plannerFallbackToCurrent/u);
assert.match(plannerSource, /decision\.action === 'INVALID' && routed\.source !== PLANNER_CONNECTION_MODES\.CURRENT/u);
assert.match(plannerSource, /resolvePlannerRequestMode\(/u);
assert.match(
    plannerSource,
    /configuredMode === PLANNER_CONNECTION_MODES\.DIRECT[\s\S]*?!isPlannerDirectConnectionSupported\(\)[\s\S]*?!getSelectedPlannerDirectProfile\(settings\)[\s\S]*?PLANNER_CONNECTION_MODES\.CURRENT/u,
);
assert.match(indexSource, /raceTaskWithAbortSignal\(\(\) => callback\(controller\.signal\), controller\.signal\)/u);
assert.match(indexSource, /controller\.abort\(PLANNER_REQUEST_TIMEOUT_REASON\)/u);
assert.match(
    plannerSource,
    /const secondaryId = mode === PLANNER_CONNECTION_MODES\.DIRECT[\s\S]*?settings\.plannerDirectProfileId[\s\S]*?settings\.plannerProfileId/u,
);
assert.match(
    plannerSource,
    /const secondaryService = mode === PLANNER_CONNECTION_MODES\.DIRECT[\s\S]*?getPlannerDirectService\(settings\)[\s\S]*?getPlannerProfileService\(\)/u,
);
assert.match(plannerSource, /generateCurrent,/u);
assert.match(plannerSource, /Boolean\(plannerRuntime\?\.secondaryFailed\)/u);
assert.match(plannerSource, /routed\.fallbackUsed && plannerRuntime/u);
assert.ok((plannerSource.match(/plannerRuntime\.secondaryFailed = true/gu) || []).length >= 2);
assert.doesNotMatch(plannerSource, /profileFailed/u);
assert.doesNotMatch(plannerSource, /setProfile\s*\(|loadProfile\s*\(|rotatePlannerCustomSecret\s*\(|rotateSecret\s*\(/u);

const researchStart = indexSource.indexOf('async function runStructuredSearchResearch');
const researchEnd = indexSource.indexOf('function getClaudeProfiles', researchStart);
assert.ok(researchStart >= 0 && researchEnd > researchStart);
const researchSource = indexSource.slice(researchStart, researchEnd);
assert.match(researchSource, /plannerConnection:\s*getPlannerConnectionFingerprint\(settings\)/u);
assert.match(researchSource, /plannerFallbackToCurrent:\s*settings\.plannerFallbackToCurrent/u);
assert.match(researchSource, /const plannerRuntime = \{/u);
assert.match(researchSource, /secondaryFailed:\s*false/u);
assert.doesNotMatch(researchSource, /profileFailed/u);
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
    'hwr_planner_direct_panel',
    'hwr_planner_direct_connection',
    'hwr_new_planner_direct',
    'hwr_planner_direct_name',
    'hwr_planner_direct_url',
    'hwr_planner_direct_model',
    'hwr_planner_direct_models',
    'hwr_fetch_planner_direct_models',
    'hwr_planner_direct_model_list_status',
    'hwr_planner_direct_key',
    'hwr_planner_direct_status',
    'hwr_save_planner_direct',
    'hwr_delete_planner_direct',
    'hwr_test_planner_direct',
]) {
    assert.match(visibleSettingsHtml, new RegExp(`id="${id}"`, 'u'));
}
assert.match(visibleSettingsHtml, /<option value="direct">/u);
assert.match(
    visibleSettingsHtml,
    /<input[^>]+id="hwr_planner_direct_key"[^>]+type="password"[^>]+autocomplete="new-password"/u,
);
assert.match(visibleSettingsHtml, /最终正文始终由当前回答模型生成/u);
assert.match(visibleSettingsHtml, /副 API 只负责判断和规划查询/u);
assert.match(visibleSettingsHtml, /保存时原版酒馆可能短暂切换活动 Custom Key/u);
assert.match(indexSource, /\$\('#hwr_refresh_planner_profiles'\)\.on\('click', refreshPlannerProfiles\)/u);
assert.match(indexSource, /\$\('#hwr_test_planner_profile'\)\.on\('click', testPlannerProfile\)/u);
assert.match(indexSource, /\$\('#hwr_planner_direct_connection'\)\.on\('change', function \(\) \{/u);
assert.match(indexSource, /\$\('#hwr_new_planner_direct'\)\.on\('click', \(\) => \{/u);
assert.match(
    indexSource,
    /\$\('#hwr_planner_direct_name, #hwr_planner_direct_model'\)\.on\('input', markPlannerDirectFormDirty\)/u,
);
assert.match(indexSource, /\$\('#hwr_planner_direct_url'\)\.on\('input', \(\) => \{/u);
assert.match(indexSource, /\$\('#hwr_planner_direct_key'\)\.on\('input', markPlannerDirectFormDirty\)/u);
for (const [id, handler] of [
    ['hwr_save_planner_direct', 'savePlannerDirectProfile'],
    ['hwr_delete_planner_direct', 'deletePlannerDirectProfile'],
    ['hwr_fetch_planner_direct_models', 'fetchPlannerDirectModels'],
    ['hwr_test_planner_direct', 'testPlannerDirectProfile'],
]) {
    assert.match(
        indexSource,
        new RegExp(`\\$\\('#${id}'\\)\\.on\\('click', ${handler}\\)`, 'u'),
    );
}
assert.match(indexSource, /refreshPlannerDirectProfilesUi\(\)/u);

const directSelectionStart = indexSource.indexOf("$('#hwr_planner_direct_connection').on('change'");
const directSelectionEnd = indexSource.indexOf("$('#hwr_new_planner_direct').on('click'", directSelectionStart);
assert.ok(directSelectionStart >= 0 && directSelectionEnd > directSelectionStart);
const directSelectionSource = indexSource.slice(directSelectionStart, directSelectionEnd);
assert.match(directSelectionSource, /settings\.plannerDirectProfileId = String\(\$\(this\)\.val\(\) \|\| ''\)/u);
assert.match(directSelectionSource, /populatePlannerDirectForm\(selected\)/u);
assert.doesNotMatch(
    directSelectionSource,
    /setProfile\s*\(|loadProfile\s*\(|rotatePlannerCustomSecret\s*\(|rotateSecret\s*\(|writeSecret\s*\(|deleteSecret\s*\(|secret_state|SECRET_KEYS\.CUSTOM/u,
);
const directTestStart = indexSource.indexOf('async function testPlannerDirectProfile');
const directTestEnd = indexSource.indexOf('function getPlannerProfileDisplayLabel', directTestStart);
assert.ok(directTestStart >= 0 && directTestEnd > directTestStart);
const directTestSource = indexSource.slice(directTestStart, directTestEnd);
assert.match(directTestSource, /activeRunEpoch !== null/u);
assert.match(directTestSource, /const profile = getSelectedPlannerDirectProfile\(settings\)/u);
assert.match(directTestSource, /const controller = new AbortController\(\)/u);
assert.match(directTestSource, /mode:\s*PLANNER_CONNECTION_MODES\.DIRECT/u);
assert.match(directTestSource, /fallbackToCurrent:\s*false/u);
assert.match(directTestSource, /service:\s*getPlannerDirectService\(settings\)/u);
assert.doesNotMatch(directTestSource, /runAbortableRequest/u);

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

console.log('hidden planner routing tests passed');
