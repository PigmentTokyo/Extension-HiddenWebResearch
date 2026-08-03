import assert from 'node:assert/strict';

import {
    arePlannerDirectCustomSecretStatesEqual,
    arePlannerDirectSettingsSnapshotsEqual,
    findNewPlannerDirectSecret,
    getPlannerDirectSecretCleanupDecision,
    getPlannerDirectSecretReferenceStatus,
    hasOnlyPlannerDirectProfileMetadataFields,
    isPlannerDirectProfileMetadataShape,
    normalizePlannerDirectCustomSecretRecords,
    PLANNER_DIRECT_SECRET_CLEANUP_REASON,
    PLANNER_DIRECT_SECRET_RECORDS_STATUS,
    PLANNER_DIRECT_SECRET_REFERENCE_STATUS,
    projectPlannerDirectConnectionProfileSecretReferences,
    projectPlannerDirectCustomSecretState,
    projectPlannerDirectSettingsSnapshot,
    shouldRestorePreviousPlannerDirectSecret,
} from '../planner-direct-transactions.js';

const rawCredential = 'raw-credential-sentinel-never-copy';
const firstProfile = {
    id: 'planner-one',
    name: 'Primary planner',
    apiUrl: 'https://planner.example/v1',
    model: 'planner-small',
    secretId: 'secret-one',
};
const secondProfile = {
    id: 'planner-two',
    name: 'Backup planner',
    apiUrl: 'https://backup.example/v1',
    model: 'planner-medium',
    secretId: 'secret-two',
};
const credentialDraft = {
    id: 'planner-draft',
    name: 'Credential draft',
    apiUrl: 'https://draft.example/v1',
    model: '',
    secretId: 'secret-draft',
};

assert.equal(hasOnlyPlannerDirectProfileMetadataFields(firstProfile), true);
assert.equal(isPlannerDirectProfileMetadataShape(firstProfile), true);
assert.equal(isPlannerDirectProfileMetadataShape(credentialDraft), true);
assert.equal(hasOnlyPlannerDirectProfileMetadataFields({ ...firstProfile, apiKey: rawCredential }), false);
assert.equal(isPlannerDirectProfileMetadataShape({ ...firstProfile, token: rawCredential }), false);
assert.equal(hasOnlyPlannerDirectProfileMetadataFields({ id: 'allowed-subset' }), true);
assert.equal(isPlannerDirectProfileMetadataShape({ id: 'allowed-subset' }), false);
assert.equal(isPlannerDirectProfileMetadataShape({ ...firstProfile, apiUrl: 'file:///unsafe' }), false);
assert.equal(isPlannerDirectProfileMetadataShape(null), false);

const persistedConnectionReferences = projectPlannerDirectConnectionProfileSecretReferences({
    connectionManager: {
        profiles: [
            { id: 'cm-one', 'secret-id': 'secret-one', apiKey: rawCredential },
            { id: 'cm-two', 'secret-id': 'secret-two' },
            { id: 'cm-three', 'secret-id': 'secret-one' },
            { id: 'cm-without-key' },
        ],
    },
});
assert.deepEqual(persistedConnectionReferences, {
    status: PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN,
    secretIds: ['secret-one', 'secret-two'],
});
assert.equal(Object.isFrozen(persistedConnectionReferences), true);
assert.equal(Object.isFrozen(persistedConnectionReferences.secretIds), true);
assert.equal(JSON.stringify(persistedConnectionReferences).includes(rawCredential), false);
assert.deepEqual(projectPlannerDirectConnectionProfileSecretReferences({
    connectionManager: { profiles: [] },
}), {
    status: PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN,
    secretIds: [],
});
for (const malformedConnectionSettings of [
    null,
    {},
    { connectionManager: null },
    { connectionManager: {} },
    { connectionManager: { profiles: null } },
    { connectionManager: { profiles: [null] } },
    { connectionManager: { profiles: [{ 'secret-id': 'bad secret id' }] } },
    { connectionManager: { profiles: [{ 'secret-id': 42 }] } },
]) {
    assert.equal(
        projectPlannerDirectConnectionProfileSecretReferences(malformedConnectionSettings).status,
        PLANNER_DIRECT_SECRET_RECORDS_STATUS.UNKNOWN,
    );
}

const settings = {
    plannerConnectionMode: ' direct ',
    plannerDirectProfileId: ' planner-one ',
    plannerDirectProfiles: [{
        ...firstProfile,
        name: '  Primary   planner  ',
        apiUrl: 'https://planner.example/v1/chat/completions/',
        apiKey: rawCredential,
    }],
    unrelated: rawCredential,
};
const snapshot = projectPlannerDirectSettingsSnapshot(settings, { transactionMarker: ' txn-1 ' });
assert.deepEqual(snapshot, {
    mode: 'direct',
    profileId: 'planner-one',
    profiles: [{
        ...firstProfile,
        name: 'Primary planner',
    }],
    transactionMarker: 'txn-1',
});
assert.equal(Object.isFrozen(snapshot), true);
assert.equal(Object.isFrozen(snapshot.profiles), true);
assert.equal(Object.isFrozen(snapshot.profiles[0]), true);
assert.equal(JSON.stringify(snapshot).includes(rawCredential), false);

const equivalentSnapshot = projectPlannerDirectSettingsSnapshot({
    plannerConnectionMode: 'direct',
    plannerDirectProfileId: 'planner-one',
    plannerDirectProfiles: [{ ...firstProfile, name: 'Primary planner' }],
}, { transactionMarker: 'txn-1' });
assert.equal(arePlannerDirectSettingsSnapshotsEqual(snapshot, equivalentSnapshot), true);
for (const changed of [
    projectPlannerDirectSettingsSnapshot({ ...settings, plannerConnectionMode: 'current' }, { transactionMarker: 'txn-1' }),
    projectPlannerDirectSettingsSnapshot({ ...settings, plannerDirectProfileId: 'planner-two' }, { transactionMarker: 'txn-1' }),
    projectPlannerDirectSettingsSnapshot({ ...settings, plannerDirectProfiles: [secondProfile] }, { transactionMarker: 'txn-1' }),
    projectPlannerDirectSettingsSnapshot(settings, { transactionMarker: 'txn-2' }),
    projectPlannerDirectSettingsSnapshot(settings),
]) {
    assert.equal(arePlannerDirectSettingsSnapshotsEqual(snapshot, changed), false);
}
assert.equal(arePlannerDirectSettingsSnapshotsEqual(snapshot, null), false);
assert.throws(
    () => projectPlannerDirectSettingsSnapshot(settings, { transactionMarker: { raw: rawCredential } }),
    /non-secret scalar/u,
);
assert.throws(
    () => projectPlannerDirectSettingsSnapshot(settings, { transactionMarker: 'bad\nmarker' }),
    /transaction marker is invalid/u,
);

const rawRecords = [
    { id: 'old-secret', label: 'Existing custom key', active: true, value: `***${rawCredential}`, extra: rawCredential },
    { id: 'inactive-secret', label: 'Inactive custom key', active: false, value: rawCredential },
];
const knownState = normalizePlannerDirectCustomSecretRecords(rawRecords);
assert.deepEqual(knownState, {
    status: PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN,
    records: [
        { id: 'old-secret', label: 'Existing custom key', active: true },
        { id: 'inactive-secret', label: 'Inactive custom key', active: false },
    ],
    activeId: 'old-secret',
});
assert.equal(Object.isFrozen(knownState), true);
assert.equal(Object.isFrozen(knownState.records), true);
assert.equal(Object.isFrozen(knownState.records[0]), true);
assert.equal(JSON.stringify(knownState).includes(rawCredential), false);
assert.deepEqual(normalizePlannerDirectCustomSecretRecords([]), {
    status: PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN,
    records: [],
    activeId: '',
});

for (const invalidRecords of [
    undefined,
    null,
    {},
    [{ id: 'one', label: 'Label', active: false }],
    [{ id: '', label: 'Label', active: false }],
    [{ id: 'bad id', label: 'Label', active: false }],
    [{ id: 'one', label: '', active: false }],
    [{ id: 'one', label: 'Label', active: 'yes' }],
    [
        { id: 'duplicate', label: 'A', active: false },
        { id: 'duplicate', label: 'B', active: true },
    ],
    [
        { id: 'one', label: 'A', active: true },
        { id: 'two', label: 'B', active: true },
    ],
]) {
    const result = normalizePlannerDirectCustomSecretRecords(invalidRecords);
    assert.equal(result.status, PLANNER_DIRECT_SECRET_RECORDS_STATUS.UNKNOWN);
    assert.deepEqual(result.records, []);
}
assert.equal(projectPlannerDirectCustomSecretState({}).status, PLANNER_DIRECT_SECRET_RECORDS_STATUS.UNKNOWN);
assert.deepEqual(projectPlannerDirectCustomSecretState({ api_key_custom: null }), {
    status: PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN,
    records: [],
    activeId: '',
});
assert.equal(projectPlannerDirectCustomSecretState({ api_key_custom: undefined }).status, PLANNER_DIRECT_SECRET_RECORDS_STATUS.UNKNOWN);
assert.deepEqual(projectPlannerDirectCustomSecretState({ api_key_custom: rawRecords }), knownState);
assert.deepEqual(projectPlannerDirectCustomSecretState({ custom_alias: rawRecords }, 'custom_alias'), knownState);
assert.equal(arePlannerDirectCustomSecretStatesEqual(knownState, rawRecords), true);
assert.equal(arePlannerDirectCustomSecretStatesEqual(knownState, [
    rawRecords[1],
    rawRecords[0],
]), false, 'record reordering is treated as a changed transaction snapshot');
assert.equal(arePlannerDirectCustomSecretStatesEqual(knownState, [
    { id: 'old-secret', label: 'Existing custom key', active: false },
    { id: 'inactive-secret', label: 'Inactive custom key', active: false },
]), false, 'a non-empty state without an active item must fail closed');
assert.equal(arePlannerDirectCustomSecretStatesEqual(knownState, null), false);

const beforeWrite = normalizePlannerDirectCustomSecretRecords([
    { id: 'old-secret', label: 'Existing custom key', active: true, value: rawCredential },
]);
const afterWrite = normalizePlannerDirectCustomSecretRecords([
    { id: 'old-secret', label: 'Existing custom key', active: false, value: rawCredential },
    { id: 'new-secret', label: 'P1G direct planner / Test', active: true, value: rawCredential },
]);
assert.deepEqual(findNewPlannerDirectSecret({
    before: beforeWrite,
    after: afterWrite,
    responseId: 'new-secret',
    expectedLabel: 'P1G direct planner / Test',
}), { id: 'new-secret', label: 'P1G direct planner / Test', active: true });
assert.deepEqual(findNewPlannerDirectSecret({ before: beforeWrite, after: afterWrite }), {
    id: 'new-secret',
    label: 'P1G direct planner / Test',
    active: true,
});
assert.equal(findNewPlannerDirectSecret({
    before: beforeWrite,
    after: afterWrite,
    responseId: 'old-secret',
}), null, 'a pre-existing response ID must never be treated as newly written');
assert.equal(findNewPlannerDirectSecret({
    before: beforeWrite,
    after: afterWrite,
    responseId: 'new-secret',
    expectedLabel: 'Wrong label',
}), null);

const afterConcurrentWrites = normalizePlannerDirectCustomSecretRecords([
    { id: 'old-secret', label: 'Existing custom key', active: false },
    { id: 'new-secret', label: 'P1G direct planner / Test', active: false },
    { id: 'third-party', label: 'Someone else', active: true },
]);
assert.deepEqual(findNewPlannerDirectSecret({
    before: beforeWrite,
    after: afterConcurrentWrites,
    responseId: 'new-secret',
}), { id: 'new-secret', label: 'P1G direct planner / Test', active: false });
assert.deepEqual(findNewPlannerDirectSecret({
    before: beforeWrite,
    after: afterConcurrentWrites,
    expectedLabel: 'P1G direct planner / Test',
}), { id: 'new-secret', label: 'P1G direct planner / Test', active: false });
assert.equal(findNewPlannerDirectSecret({ before: beforeWrite, after: afterConcurrentWrites }), null);

const ambiguousLabels = normalizePlannerDirectCustomSecretRecords([
    { id: 'old-secret', label: 'Existing custom key', active: false },
    { id: 'new-one', label: 'Shared write label', active: false },
    { id: 'new-two', label: 'Shared write label', active: true },
]);
assert.equal(findNewPlannerDirectSecret({
    before: beforeWrite,
    after: ambiguousLabels,
    expectedLabel: 'Shared write label',
}), null);
assert.equal(findNewPlannerDirectSecret({ before: null, after: afterWrite }), null);
assert.equal(findNewPlannerDirectSecret({ before: beforeWrite, after: afterWrite, responseId: 'bad id' }), null);

assert.equal(
    shouldRestorePreviousPlannerDirectSecret(afterWrite, 'old-secret', 'new-secret'),
    true,
);
assert.equal(
    shouldRestorePreviousPlannerDirectSecret(afterConcurrentWrites, 'old-secret', 'new-secret'),
    false,
    'a third-party active secret must never be overwritten',
);
assert.equal(shouldRestorePreviousPlannerDirectSecret(afterWrite, 'missing', 'new-secret'), false);
assert.equal(shouldRestorePreviousPlannerDirectSecret(afterWrite, 'new-secret', 'new-secret'), false);
assert.equal(shouldRestorePreviousPlannerDirectSecret(null, 'old-secret', 'new-secret'), false);

assert.equal(shouldRestorePreviousPlannerDirectSecret({
    status: PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN,
    activeId: 'new-secret',
    records: [
        { id: 'old-secret', label: 'Old', active: false },
        { id: 'new-secret', label: 'New', active: true },
        { id: 'third-party', label: 'Third party', active: true },
    ],
}, 'old-secret', 'new-secret'), false, 'forged KNOWN state must be revalidated');

assert.equal(
    getPlannerDirectSecretReferenceStatus([firstProfile, secondProfile], 'secret-one'),
    PLANNER_DIRECT_SECRET_REFERENCE_STATUS.REFERENCED,
);
assert.equal(
    getPlannerDirectSecretReferenceStatus([firstProfile, secondProfile], 'secret-one', { excludeProfileId: 'planner-one' }),
    PLANNER_DIRECT_SECRET_REFERENCE_STATUS.UNREFERENCED,
);
const sharedSecretProfile = { ...secondProfile, secretId: firstProfile.secretId };
assert.equal(
    getPlannerDirectSecretReferenceStatus(
        [firstProfile, sharedSecretProfile],
        'secret-one',
        { excludeProfileId: 'planner-one' },
    ),
    PLANNER_DIRECT_SECRET_REFERENCE_STATUS.REFERENCED,
    'excluding one profile must not hide another profile that shares its secret',
);
assert.equal(
    getPlannerDirectSecretReferenceStatus([firstProfile], 'unrelated-secret'),
    PLANNER_DIRECT_SECRET_REFERENCE_STATUS.UNREFERENCED,
);
for (const unknownProfiles of [
    null,
    [{ ...firstProfile, apiKey: rawCredential }],
    [firstProfile, { ...firstProfile }],
    [{ ...firstProfile, secretId: 'bad secret id' }],
]) {
    assert.equal(
        getPlannerDirectSecretReferenceStatus(unknownProfiles, 'secret-one'),
        PLANNER_DIRECT_SECRET_REFERENCE_STATUS.UNKNOWN,
    );
}
assert.equal(
    getPlannerDirectSecretReferenceStatus([firstProfile], 'bad secret id'),
    PLANNER_DIRECT_SECRET_REFERENCE_STATUS.UNKNOWN,
);

const cleanupSecrets = normalizePlannerDirectCustomSecretRecords([
    { id: 'secret-one', label: 'One', active: false },
    { id: 'secret-two', label: 'Two', active: true },
]);
assert.deepEqual(getPlannerDirectSecretCleanupDecision({
    profiles: [firstProfile, secondProfile],
    secretRecords: cleanupSecrets,
    secretId: 'secret-one',
}), { safe: false, reason: PLANNER_DIRECT_SECRET_CLEANUP_REASON.REFERENCED });
assert.deepEqual(getPlannerDirectSecretCleanupDecision({
    profiles: [firstProfile, secondProfile],
    secretRecords: cleanupSecrets,
    secretId: 'secret-one',
    excludeProfileId: 'planner-one',
}), { safe: true, reason: PLANNER_DIRECT_SECRET_CLEANUP_REASON.SAFE });
assert.deepEqual(getPlannerDirectSecretCleanupDecision({
    profiles: [firstProfile],
    secretRecords: cleanupSecrets,
    secretId: 'secret-two',
}), { safe: false, reason: PLANNER_DIRECT_SECRET_CLEANUP_REASON.ACTIVE });
assert.deepEqual(getPlannerDirectSecretCleanupDecision({
    profiles: [firstProfile],
    secretRecords: null,
    secretId: 'secret-two',
}), { safe: false, reason: PLANNER_DIRECT_SECRET_CLEANUP_REASON.SECRET_STATE_UNKNOWN });
assert.deepEqual(getPlannerDirectSecretCleanupDecision({
    profiles: [firstProfile],
    secretRecords: cleanupSecrets,
    secretId: 'missing-secret',
}), { safe: false, reason: PLANNER_DIRECT_SECRET_CLEANUP_REASON.NOT_FOUND });
assert.deepEqual(getPlannerDirectSecretCleanupDecision({
    profiles: [{ ...firstProfile, key: rawCredential }],
    secretRecords: cleanupSecrets,
    secretId: 'secret-one',
}), { safe: false, reason: PLANNER_DIRECT_SECRET_CLEANUP_REASON.PROFILE_STATE_UNKNOWN });
assert.deepEqual(getPlannerDirectSecretCleanupDecision({
    profiles: [],
    secretRecords: cleanupSecrets,
    secretId: 'bad secret id',
}), { safe: false, reason: PLANNER_DIRECT_SECRET_CLEANUP_REASON.INVALID_SECRET_ID });

console.log('planner direct transaction safety tests passed');
