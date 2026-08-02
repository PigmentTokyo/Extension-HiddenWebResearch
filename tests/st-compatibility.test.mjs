import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    GEMINI_TOOL_CHOICE_NONE_MINIMUM_VERSION,
    inspectSillyTavernCompatibility,
    isClientVersionAtLeast,
    isCompatibleGenerationRequest,
    MINIMUM_SUPPORTED_CLIENT_VERSION,
    parseSillyTavernClientVersion,
    PLANNER_DIRECT_SECRET_ID_MINIMUM_VERSION,
    supportsGeminiToolChoiceNone,
    supportsPlannerDirectSecretId,
} from '../st-compatibility.js';

assert.equal(MINIMUM_SUPPORTED_CLIENT_VERSION, '1.13.3');
assert.equal(GEMINI_TOOL_CHOICE_NONE_MINIMUM_VERSION, '1.15.0');
assert.equal(PLANNER_DIRECT_SECRET_ID_MINIMUM_VERSION, '1.18.0');
assert.deepEqual(
    parseSillyTavernClientVersion('SillyTavern:1.13.3:Cohee#1207'),
    { major: 1, minor: 13, patch: 3, normalized: '1.13.3' },
);
assert.deepEqual(
    parseSillyTavernClientVersion('1.18.0'),
    { major: 1, minor: 18, patch: 0, normalized: '1.18.0' },
);
assert.equal(parseSillyTavernClientVersion('SillyTavern:UNKNOWN:Cohee#1207'), null);
assert.equal(isClientVersionAtLeast('SillyTavern:1.13.3:Cohee#1207', '1.13.3'), true);
assert.equal(isClientVersionAtLeast('SillyTavern:1.13.2:Cohee#1207', '1.13.3'), false);
assert.equal(isClientVersionAtLeast('SillyTavern:1.14.9:Cohee#1207', '1.15.0'), false);
assert.equal(isClientVersionAtLeast('SillyTavern:1.15.0:Cohee#1207', '1.15.0'), true);
assert.equal(isClientVersionAtLeast('SillyTavern:2.0.0-beta:Cohee#1207', '1.15.0'), true);
assert.equal(supportsGeminiToolChoiceNone('SillyTavern:1.13.3:Cohee#1207'), false);
assert.equal(supportsGeminiToolChoiceNone('SillyTavern:1.14.9:Cohee#1207'), false);
assert.equal(supportsGeminiToolChoiceNone('SillyTavern:1.15.0:Cohee#1207'), true);
assert.equal(supportsGeminiToolChoiceNone('SillyTavern:1.18.0:Cohee#1207'), true);
assert.equal(supportsGeminiToolChoiceNone('SillyTavern:UNKNOWN:Cohee#1207'), false);
assert.equal(supportsPlannerDirectSecretId('SillyTavern:1.17.9:Cohee#1207'), false);
assert.equal(supportsPlannerDirectSecretId('SillyTavern:1.18.0:Cohee#1207'), true);
assert.equal(supportsPlannerDirectSecretId('SillyTavern:UNKNOWN:Cohee#1207'), false);

const eventTypes = {
    CHAT_COMPLETION_SETTINGS_READY: 'chat_completion_settings_ready',
    GENERATION_ENDED: 'generation_ended',
    GENERATION_STOPPED: 'generation_stopped',
    CHAT_CHANGED: 'chat_id_changed',
};
const eventSource = {
    on() {},
    removeListener() {},
};
const generateRaw = ({ prompt = '' } = {}) => prompt;
const getContext = () => ({});

const compatible = inspectSillyTavernCompatibility({
    clientVersion: 'SillyTavern:1.13.3:Cohee#1207',
    eventSource,
    eventTypes,
    generateRaw,
    getContext,
});
assert.equal(compatible.supported, true);
assert.equal(compatible.requestRewrite, true);
assert.equal(compatible.versionSupported, true);
assert.deepEqual(compatible.missing, []);

const legacyGenerateRaw = function legacyGenerateRaw(prompt, api, instructOverride) {
    return [prompt, api, instructOverride];
};
const incompatible = inspectSillyTavernCompatibility({
    clientVersion: 'SillyTavern:1.13.3:Cohee#1207',
    eventSource,
    eventTypes: { ...eventTypes, CHAT_COMPLETION_SETTINGS_READY: undefined },
    generateRaw: legacyGenerateRaw,
    getContext: undefined,
});
assert.equal(incompatible.supported, false);
assert.equal(incompatible.requestRewrite, false);
assert.ok(incompatible.missing.includes('event_types.CHAT_COMPLETION_SETTINGS_READY'));
assert.ok(incompatible.missing.includes('generateRaw(options)'));
assert.ok(incompatible.missing.includes('SillyTavern.getContext()'));

const tooOld = inspectSillyTavernCompatibility({
    clientVersion: 'SillyTavern:1.13.2:Cohee#1207',
    eventSource,
    eventTypes,
    generateRaw,
    getContext,
});
assert.equal(tooOld.supported, false);
assert.equal(tooOld.versionSupported, false);
assert.equal(tooOld.requestRewrite, false);
assert.ok(tooOld.missing.includes('SillyTavern 1.13.3+'));
assert.equal(inspectSillyTavernCompatibility({
    clientVersion: 'SillyTavern:UNKNOWN:Cohee#1207',
    eventSource,
    eventTypes,
    generateRaw,
    getContext,
}).supported, false);

const handledTypes = new Set(['normal', 'regenerate', 'swipe']);
assert.equal(isCompatibleGenerationRequest({
    type: 'normal',
    messages: [{ role: 'user', content: 'hello' }],
}, handledTypes), true);
assert.equal(isCompatibleGenerationRequest({
    type: 'swipe',
    messages: [{ role: 'user', content: 'hello' }],
}, handledTypes), true);
assert.equal(isCompatibleGenerationRequest({
    type: 'quiet',
    messages: [{ role: 'user', content: 'hello' }],
}, handledTypes), false);
assert.equal(isCompatibleGenerationRequest({
    messages: [{ role: 'user', content: 'hello' }],
}, handledTypes), false);
assert.equal(isCompatibleGenerationRequest({ type: 'normal' }, handledTypes), false);

const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
assert.equal(manifest.minimum_client_version, MINIMUM_SUPPORTED_CLIENT_VERSION);
assert.equal(manifest.version, '1.12.0');
assert.match(indexSource, /CLIENT_VERSION/u);
assert.match(indexSource, /supportsGeminiToolChoiceNone\(CLIENT_VERSION\)/u);
assert.match(indexSource, /buildCompletedClientToolMessages/u);
assert.match(indexSource, /CLIENT_COMPATIBILITY\.supported/u);
assert.match(indexSource, /clientVersion:\s*CLIENT_VERSION/u);
assert.match(readme, /最低支持 SillyTavern `1\.13\.3`/u);

console.log('SillyTavern 1.13.3 compatibility: all assertions passed');
