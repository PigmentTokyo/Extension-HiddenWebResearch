import assert from 'node:assert/strict';

import {
    containsPlannerDirectCredentialMaterial,
    getPlannerDirectProfileFingerprint,
    getReadyPlannerDirectProfile,
    isPlannerDirectProfileReady,
    normalizePlannerDirectApiUrl,
    normalizePlannerDirectProfile,
    normalizePlannerDirectProfiles,
    PLANNER_DIRECT_PROFILE_LIMIT,
} from '../planner-direct-profiles.js';

assert.equal(PLANNER_DIRECT_PROFILE_LIMIT, 20);

for (const credential of [
    'Bearer abcdefghijklmnopqrstuvwxyz012345',
    'sk-ant-abcdefghijklmnopqrstuvwxyz012345',
    'AIzaSyA1234567890abcdefghijklmnopqrstuvwxyz',
    'AKIAABCDEFGHIJKLMNOP',
    'eyJabcdefghijk.eyJabcdefghijkl.abcdefghijk',
    '-----BEGIN PRIVATE KEY-----',
]) {
    assert.equal(containsPlannerDirectCredentialMaterial(credential), true, credential);
}
for (const harmless of [
    '',
    'planner-small',
    'https://api.example.com/v1',
    'Bearer is a normal English word here',
]) {
    assert.equal(containsPlannerDirectCredentialMaterial(harmless), false, harmless);
}

for (const [input, expected] of [
    ['https://api.example.com/v1', 'https://api.example.com/v1'],
    ['https://api.example.com/v1/', 'https://api.example.com/v1'],
    ['https://api.example.com/v1/chat/completions', 'https://api.example.com/v1'],
    ['https://api.example.com/v1/chat/completions/', 'https://api.example.com/v1'],
    ['https://api.example.com/V1/CHAT/COMPLETIONS/', 'https://api.example.com/V1'],
    ['http://localhost:5001/', 'http://localhost:5001'],
    ['http://127.0.0.1:5001/openai///', 'http://127.0.0.1:5001/openai'],
]) {
    assert.equal(normalizePlannerDirectApiUrl(input), expected, input);
}

for (const input of [
    '',
    'not a URL',
    'ftp://api.example.com/v1',
    'https://user:password@api.example.com/v1',
    'https://api.example.com/v1?key=must-not-live-in-url',
    'https://api.example.com/v1#fragment',
]) {
    assert.throws(() => normalizePlannerDirectApiUrl(input), /Planner direct API URL/u, input);
}

for (const input of [
    'https://api.example.com/v1/sk-ant-abcdefghijklmnopqrstuvwxyz012345',
    'https://sk-ant-abcdefghijklmnopqrstuvwxyz012345.example.com/v1',
]) {
    assert.throws(() => normalizePlannerDirectApiUrl(input), /looks like a credential/u, input);
}

const rawKey = 'raw-key-sentinel-must-never-persist';
const normalized = normalizePlannerDirectProfile({
    id: '  planner-one  ',
    name: '  Fast   Planner  ',
    apiUrl: 'https://api.example.com/v1/chat/completions/',
    model: '  planner-small  ',
    secretId: '  server-secret-id-1  ',
    apiKey: rawKey,
    key: rawKey,
    token: rawKey,
});
assert.deepEqual(normalized, {
    id: 'planner-one',
    name: 'Fast Planner',
    apiUrl: 'https://api.example.com/v1',
    model: 'planner-small',
    secretId: 'server-secret-id-1',
});
assert.equal(Object.isFrozen(normalized), true);
assert.equal(JSON.stringify(normalized).includes(rawKey), false);

const importedWithoutCredential = normalizePlannerDirectProfile({
    id: 'needs-key',
    name: 'Imported planner',
    apiUrl: 'https://imported.example/v1',
    model: 'planner-model',
});
assert.equal(importedWithoutCredential.secretId, '');
assert.equal(isPlannerDirectProfileReady(importedWithoutCredential), false);
assert.equal(isPlannerDirectProfileReady(normalized), true);
assert.equal(isPlannerDirectProfileReady(null), false);
assert.equal(isPlannerDirectProfileReady({ ...normalized, apiUrl: 'javascript:alert(1)' }), false);

for (const invalidProfile of [
    null,
    [],
    { ...normalized, id: '' },
    { ...normalized, id: 'bad\nid' },
    { ...normalized, name: '' },
    { ...normalized, model: '' },
    { ...normalized, model: 'bad\u0000model' },
    { ...normalized, secretId: 'secret id with spaces' },
]) {
    assert.throws(() => normalizePlannerDirectProfile(invalidProfile));
}

for (const invalidProfile of [
    { ...normalized, name: 'Bearer abcdefghijklmnopqrstuvwxyz012345' },
    { ...normalized, name: 'sk-ant-abcdefghijklmnopqrstuvwxyz012345' },
    { ...normalized, model: 'sk-abcdefghijklmnopqrstuvwxyz012345' },
    { ...normalized, model: 'eyJabcdefghijk.eyJabcdefghijkl.abcdefghijk' },
]) {
    assert.throws(
        () => normalizePlannerDirectProfile(invalidProfile),
        /looks like a credential/u,
    );
}

const manyProfiles = [
    { invalid: true },
    normalized,
    { ...normalized, name: 'Duplicate ID loses', model: 'other-model' },
    importedWithoutCredential,
    ...Array.from({ length: 25 }, (_, index) => ({
        id: `bulk-${index}`,
        name: `Bulk ${index}`,
        apiUrl: `https://bulk-${index}.example/v1`,
        model: `model-${index}`,
        secretId: `secret-${index}`,
    })),
];
const normalizedList = normalizePlannerDirectProfiles(manyProfiles);
assert.equal(normalizedList.length, PLANNER_DIRECT_PROFILE_LIMIT);
assert.equal(Object.isFrozen(normalizedList), true);
assert.equal(normalizedList[0].id, 'planner-one');
assert.equal(normalizedList.filter(profile => profile.id === 'planner-one').length, 1);
assert.deepEqual(normalizePlannerDirectProfiles(null), []);

assert.deepEqual(getReadyPlannerDirectProfile(normalizedList, ' planner-one '), normalized);
assert.equal(getReadyPlannerDirectProfile(normalizedList, 'needs-key'), null);
assert.equal(getReadyPlannerDirectProfile(normalizedList, 'missing'), null);
assert.equal(getReadyPlannerDirectProfile(normalizedList, ''), null);

const fingerprint = getPlannerDirectProfileFingerprint({
    ...normalized,
    apiKey: rawKey,
    password: rawKey,
});
assert.deepEqual(Object.keys(fingerprint), [
    'mode',
    'profileIdHash',
    'apiUrlHash',
    'model',
    'secretIdHash',
]);
assert.equal(fingerprint.mode, 'direct');
assert.equal(fingerprint.model, normalized.model);
assert.equal(Object.isFrozen(fingerprint), true);
const serializedFingerprint = JSON.stringify(fingerprint);
assert.equal(serializedFingerprint.includes(rawKey), false);
assert.equal(serializedFingerprint.includes(normalized.apiUrl), false);
assert.equal(serializedFingerprint.includes(normalized.secretId), false);

assert.deepEqual(
    getPlannerDirectProfileFingerprint({ ...normalized, name: 'A harmless rename' }),
    fingerprint,
    'display-name-only edits must not invalidate research cache entries',
);
for (const changed of [
    { ...normalized, id: 'planner-two' },
    { ...normalized, apiUrl: 'https://other.example/v1' },
    { ...normalized, model: 'planner-large' },
    { ...normalized, secretId: 'server-secret-id-2' },
]) {
    assert.notDeepEqual(getPlannerDirectProfileFingerprint(changed), fingerprint);
}

console.log('planner direct profile normalization tests passed');
