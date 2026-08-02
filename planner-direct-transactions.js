import {
    normalizePlannerDirectProfile,
    normalizePlannerDirectProfiles,
} from './planner-direct-profiles.js';

const CUSTOM_SECRET_KEY = 'api_key_custom';
const PROFILE_FIELDS = Object.freeze(['id', 'name', 'apiUrl', 'model', 'secretId']);
const PROFILE_FIELD_SET = new Set(PROFILE_FIELDS);
const OPAQUE_ID_MAX_CHARS = 512;
const LABEL_MAX_CHARS = 512;
const TRANSACTION_MARKER_MAX_CHARS = 256;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export const PLANNER_DIRECT_SECRET_RECORDS_STATUS = Object.freeze({
    KNOWN: 'KNOWN',
    UNKNOWN: 'UNKNOWN',
});

export const PLANNER_DIRECT_SECRET_REFERENCE_STATUS = Object.freeze({
    REFERENCED: 'REFERENCED',
    UNREFERENCED: 'UNREFERENCED',
    UNKNOWN: 'UNKNOWN',
});

export const PLANNER_DIRECT_SECRET_CLEANUP_REASON = Object.freeze({
    SAFE: 'SAFE',
    INVALID_SECRET_ID: 'INVALID_SECRET_ID',
    PROFILE_STATE_UNKNOWN: 'PROFILE_STATE_UNKNOWN',
    REFERENCED: 'REFERENCED',
    SECRET_STATE_UNKNOWN: 'SECRET_STATE_UNKNOWN',
    NOT_FOUND: 'NOT_FOUND',
    ACTIVE: 'ACTIVE',
});

const UNKNOWN_SECRET_RECORDS = Object.freeze({
    status: PLANNER_DIRECT_SECRET_RECORDS_STATUS.UNKNOWN,
    records: Object.freeze([]),
    activeId: '',
});

const UNKNOWN_CONNECTION_PROFILE_REFERENCES = Object.freeze({
    status: PLANNER_DIRECT_SECRET_RECORDS_STATUS.UNKNOWN,
    secretIds: Object.freeze([]),
});

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function normalizeOpaqueId(value) {
    if (typeof value !== 'string') return '';
    const normalized = value.trim();
    if (!normalized || normalized.length > OPAQUE_ID_MAX_CHARS) return '';
    if (CONTROL_CHARACTERS.test(normalized) || /\s/u.test(normalized)) return '';
    return normalized;
}

function normalizeLabel(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized || normalized.length > LABEL_MAX_CHARS) return null;
    if (CONTROL_CHARACTERS.test(normalized)) return null;
    return normalized;
}

function normalizeTransactionMarker(value) {
    if (value === undefined) return undefined;
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
        throw new Error('Planner direct transaction marker must be a non-secret scalar');
    }
    const normalized = String(value).trim();
    if (!normalized || normalized.length > TRANSACTION_MARKER_MAX_CHARS || CONTROL_CHARACTERS.test(normalized)) {
        throw new Error('Planner direct transaction marker is invalid');
    }
    return normalized;
}

/**
 * Projects only the Custom secret IDs referenced by persisted Connection
 * Manager profiles. Missing or malformed settings remain UNKNOWN so a caller
 * cannot authorize destructive cleanup from an incomplete server snapshot.
 *
 * @param {unknown} extensionSettings Persisted extension_settings root
 * @returns {{status: 'KNOWN'|'UNKNOWN', secretIds: ReadonlyArray<string>}}
 */
export function projectPlannerDirectConnectionProfileSecretReferences(extensionSettings) {
    if (!isPlainObject(extensionSettings)) return UNKNOWN_CONNECTION_PROFILE_REFERENCES;
    const connectionManager = extensionSettings.connectionManager;
    if (!isPlainObject(connectionManager) || !Array.isArray(connectionManager.profiles)) {
        return UNKNOWN_CONNECTION_PROFILE_REFERENCES;
    }

    const secretIds = new Set();
    for (const profile of connectionManager.profiles) {
        if (!isPlainObject(profile)) return UNKNOWN_CONNECTION_PROFILE_REFERENCES;
        const rawSecretId = profile['secret-id'];
        if (rawSecretId === undefined || rawSecretId === null || rawSecretId === '') continue;
        const secretId = normalizeOpaqueId(rawSecretId);
        if (!secretId) return UNKNOWN_CONNECTION_PROFILE_REFERENCES;
        secretIds.add(secretId);
    }

    return Object.freeze({
        status: PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN,
        secretIds: Object.freeze([...secretIds]),
    });
}

function freezeProfile(profile) {
    return Object.freeze({
        id: profile.id,
        name: profile.name,
        apiUrl: profile.apiUrl,
        model: profile.model,
        secretId: profile.secretId,
    });
}

/**
 * Returns true only when a candidate contains no fields outside the persisted
 * direct-planner metadata allowlist. This catches apiKey/key/token additions
 * before a settings transaction is committed.
 *
 * @param {unknown} value Candidate profile
 * @returns {boolean}
 */
export function hasOnlyPlannerDirectProfileMetadataFields(value) {
    return isPlainObject(value) && Object.keys(value).every(key => PROFILE_FIELD_SET.has(key));
}

/**
 * Validates the exact persisted profile shape, including all five allowed
 * fields. It deliberately rejects credential-like or otherwise unknown fields.
 *
 * @param {unknown} value Candidate profile
 * @returns {boolean}
 */
export function isPlannerDirectProfileMetadataShape(value) {
    if (!hasOnlyPlannerDirectProfileMetadataFields(value)) return false;
    if (!PROFILE_FIELDS.every(field => Object.hasOwn(value, field))) return false;
    try {
        normalizePlannerDirectProfile(value);
        return true;
    } catch {
        return false;
    }
}

/**
 * Projects only the settings fields owned by the direct-planner transaction.
 * Unknown profile properties are discarded by the canonical normalizer. The
 * optional marker must be an explicitly non-secret scalar supplied by the
 * caller; it is not read from extension settings.
 *
 * @param {unknown} settings Extension settings object
 * @param {{transactionMarker?: string|number|boolean}} [options] Projection options
 * @returns {{mode: string, profileId: string, profiles: ReadonlyArray<object>, transactionMarker?: string}}
 */
export function projectPlannerDirectSettingsSnapshot(settings, { transactionMarker } = {}) {
    const source = isPlainObject(settings) ? settings : {};
    const marker = normalizeTransactionMarker(transactionMarker);
    const profiles = Object.freeze(
        normalizePlannerDirectProfiles(source.plannerDirectProfiles).map(freezeProfile),
    );
    const snapshot = {
        mode: String(source.plannerConnectionMode ?? '').trim(),
        profileId: String(source.plannerDirectProfileId ?? '').trim(),
        profiles,
    };
    if (marker !== undefined) snapshot.transactionMarker = marker;
    return Object.freeze(snapshot);
}

/**
 * Compares two projected direct-settings snapshots without serializing them.
 *
 * @param {ReturnType<typeof projectPlannerDirectSettingsSnapshot>} left Left snapshot
 * @param {ReturnType<typeof projectPlannerDirectSettingsSnapshot>} right Right snapshot
 * @returns {boolean}
 */
export function arePlannerDirectSettingsSnapshotsEqual(left, right) {
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    if (left.mode !== right.mode || left.profileId !== right.profileId) return false;
    const leftHasMarker = Object.hasOwn(left, 'transactionMarker');
    const rightHasMarker = Object.hasOwn(right, 'transactionMarker');
    if (leftHasMarker !== rightHasMarker || left.transactionMarker !== right.transactionMarker) return false;
    if (!Array.isArray(left.profiles) || !Array.isArray(right.profiles)) return false;
    if (left.profiles.length !== right.profiles.length) return false;
    return left.profiles.every((profile, index) => {
        const other = right.profiles[index];
        return PROFILE_FIELDS.every(field => profile?.[field] === other?.[field]);
    });
}

/**
 * Strictly normalizes the CUSTOM records returned by `/api/secrets/read`.
 * The masked `value` property and every unknown property are never copied.
 * Missing, non-array, duplicate-ID, malformed, multi-active, or non-empty
 * input without exactly one active record is represented as UNKNOWN so callers
 * can fail closed.
 *
 * @param {unknown} records Value of `secretState.api_key_custom`
 * @returns {{status: 'KNOWN'|'UNKNOWN', records: ReadonlyArray<{id: string, label: string, active: boolean}>, activeId: string}}
 */
export function normalizePlannerDirectCustomSecretRecords(records) {
    if (!Array.isArray(records)) return UNKNOWN_SECRET_RECORDS;
    const normalized = [];
    const seenIds = new Set();
    let activeId = '';

    for (const record of records) {
        if (!isPlainObject(record)) return UNKNOWN_SECRET_RECORDS;
        const id = normalizeOpaqueId(record.id);
        const label = normalizeLabel(record.label);
        if (!id || label === null || typeof record.active !== 'boolean' || seenIds.has(id)) {
            return UNKNOWN_SECRET_RECORDS;
        }
        if (record.active) {
            if (activeId) return UNKNOWN_SECRET_RECORDS;
            activeId = id;
        }
        seenIds.add(id);
        normalized.push(Object.freeze({ id, label, active: record.active }));
    }

    if (normalized.length > 0 && !activeId) return UNKNOWN_SECRET_RECORDS;

    return Object.freeze({
        status: PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN,
        records: Object.freeze(normalized),
        activeId,
    });
}

/**
 * Reads and normalizes CUSTOM records from a complete `/api/secrets/read`
 * response. Stock SillyTavern represents an empty secret slot as `null`, so
 * an explicitly present `null` CUSTOM field is the one non-array value that
 * projects to a known empty list. An absent or otherwise malformed key stays
 * UNKNOWN.
 *
 * @param {unknown} secretState Full secrets state response
 * @param {string} [customKey] CUSTOM key name
 * @returns {ReturnType<typeof normalizePlannerDirectCustomSecretRecords>}
 */
export function projectPlannerDirectCustomSecretState(secretState, customKey = CUSTOM_SECRET_KEY) {
    if (!isPlainObject(secretState) || !Object.hasOwn(secretState, customKey)) return UNKNOWN_SECRET_RECORDS;
    if (secretState[customKey] === null) return normalizePlannerDirectCustomSecretRecords([]);
    return normalizePlannerDirectCustomSecretRecords(secretState[customKey]);
}

function asKnownSecretRecords(value) {
    if (value?.status === PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN && Array.isArray(value.records)) {
        // Re-validate rather than trusting a caller-forged status/activeId.
        return normalizePlannerDirectCustomSecretRecords(value.records);
    }
    return normalizePlannerDirectCustomSecretRecords(value);
}

/**
 * Strictly compares two projected Custom secret snapshots. Any malformed or
 * forged state compares unequal, allowing callers to abort across a user
 * confirmation or settings-save window instead of restoring a stale active ID.
 *
 * @param {unknown} left Earlier state
 * @param {unknown} right Later state
 * @returns {boolean}
 */
export function arePlannerDirectCustomSecretStatesEqual(left, right) {
    const leftState = asKnownSecretRecords(left);
    const rightState = asKnownSecretRecords(right);
    if (leftState.status !== PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN
        || rightState.status !== PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN
        || leftState.activeId !== rightState.activeId
        || leftState.records.length !== rightState.records.length) {
        return false;
    }
    return leftState.records.every((record, index) => {
        const other = rightState.records[index];
        return record.id === other?.id
            && record.label === other.label
            && record.active === other.active;
    });
}

/**
 * Resolves the secret created by a write without guessing. A response ID wins
 * only when it identifies a genuinely new post-state record. Without an ID,
 * the pre/post diff (optionally narrowed by the exact write label) must contain
 * exactly one candidate. Ambiguous or unknown state returns null.
 *
 * @param {{before: unknown, after: unknown, responseId?: unknown, expectedLabel?: unknown}} input Resolution input
 * @returns {{id: string, label: string, active: boolean}|null}
 */
export function findNewPlannerDirectSecret({ before, after, responseId, expectedLabel } = {}) {
    const beforeState = asKnownSecretRecords(before);
    const afterState = asKnownSecretRecords(after);
    if (beforeState.status !== PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN
        || afterState.status !== PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN) {
        return null;
    }

    const responseSecretId = responseId === undefined || responseId === null || responseId === ''
        ? ''
        : normalizeOpaqueId(responseId);
    if ((responseId !== undefined && responseId !== null && responseId !== '') && !responseSecretId) return null;
    const label = expectedLabel === undefined ? null : normalizeLabel(expectedLabel);
    if (expectedLabel !== undefined && label === null) return null;
    const beforeIds = new Set(beforeState.records.map(record => record.id));
    const newlyAdded = afterState.records.filter(record => !beforeIds.has(record.id));

    if (responseSecretId) {
        const matching = newlyAdded.filter(record => record.id === responseSecretId);
        if (matching.length !== 1) return null;
        if (label !== null && matching[0].label !== label) return null;
        return matching[0];
    }

    const candidates = label === null
        ? newlyAdded
        : newlyAdded.filter(record => record.label === label);
    return candidates.length === 1 ? candidates[0] : null;
}

/**
 * Returns true only when restoring the pre-write active secret cannot clobber
 * another actor's later rotation: the currently active secret must still be
 * the newly written secret, and the previous secret must still exist.
 *
 * @param {unknown} secretRecords Normalized result or raw CUSTOM record array
 * @param {unknown} previousActiveId Pre-write active secret ID
 * @param {unknown} newSecretId Newly written secret ID
 * @returns {boolean}
 */
export function shouldRestorePreviousPlannerDirectSecret(secretRecords, previousActiveId, newSecretId) {
    const state = asKnownSecretRecords(secretRecords);
    const previousId = normalizeOpaqueId(previousActiveId);
    const newId = normalizeOpaqueId(newSecretId);
    if (state.status !== PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN
        || !previousId || !newId || previousId === newId) {
        return false;
    }
    if (state.activeId !== newId) return false;
    return state.records.some(record => record.id === previousId)
        && state.records.some(record => record.id === newId && record.active);
}

function getStrictNormalizedProfiles(profiles) {
    if (!Array.isArray(profiles) || !profiles.every(isPlannerDirectProfileMetadataShape)) return null;
    const normalized = normalizePlannerDirectProfiles(profiles);
    if (normalized.length !== profiles.length) return null;
    return normalized;
}

/**
 * Determines whether a canonical persisted profile set references a secret.
 * Malformed/duplicate/credential-bearing profile input is UNKNOWN, never
 * treated as safely unreferenced.
 *
 * @param {unknown} profiles Persisted direct profiles
 * @param {unknown} secretId Secret ID
 * @param {{excludeProfileId?: unknown}} [options] Optional profile being replaced/deleted
 * @returns {'REFERENCED'|'UNREFERENCED'|'UNKNOWN'}
 */
export function getPlannerDirectSecretReferenceStatus(profiles, secretId, { excludeProfileId } = {}) {
    const id = normalizeOpaqueId(secretId);
    const normalizedProfiles = getStrictNormalizedProfiles(profiles);
    if (!id || !normalizedProfiles) return PLANNER_DIRECT_SECRET_REFERENCE_STATUS.UNKNOWN;
    const excludedId = excludeProfileId === undefined || excludeProfileId === null || excludeProfileId === ''
        ? ''
        : normalizeOpaqueId(excludeProfileId);
    if ((excludeProfileId !== undefined && excludeProfileId !== null && excludeProfileId !== '') && !excludedId) {
        return PLANNER_DIRECT_SECRET_REFERENCE_STATUS.UNKNOWN;
    }
    const referenced = normalizedProfiles.some(profile => profile.id !== excludedId && profile.secretId === id);
    return referenced
        ? PLANNER_DIRECT_SECRET_REFERENCE_STATUS.REFERENCED
        : PLANNER_DIRECT_SECRET_REFERENCE_STATUS.UNREFERENCED;
}

/**
 * Produces a fail-closed cleanup decision. Deletion is safe only when the
 * profile set is known to be unreferenced, the secret state is known, the
 * target exists, and it is inactive. Deleting an active CUSTOM secret can
 * reactivate an unrelated key and is therefore never approved here.
 *
 * @param {{profiles: unknown, secretRecords: unknown, secretId: unknown, excludeProfileId?: unknown}} input Cleanup input
 * @returns {{safe: boolean, reason: string}}
 */
export function getPlannerDirectSecretCleanupDecision({ profiles, secretRecords, secretId, excludeProfileId } = {}) {
    const id = normalizeOpaqueId(secretId);
    if (!id) return Object.freeze({ safe: false, reason: PLANNER_DIRECT_SECRET_CLEANUP_REASON.INVALID_SECRET_ID });
    const referenceStatus = getPlannerDirectSecretReferenceStatus(profiles, id, { excludeProfileId });
    if (referenceStatus === PLANNER_DIRECT_SECRET_REFERENCE_STATUS.UNKNOWN) {
        return Object.freeze({ safe: false, reason: PLANNER_DIRECT_SECRET_CLEANUP_REASON.PROFILE_STATE_UNKNOWN });
    }
    if (referenceStatus === PLANNER_DIRECT_SECRET_REFERENCE_STATUS.REFERENCED) {
        return Object.freeze({ safe: false, reason: PLANNER_DIRECT_SECRET_CLEANUP_REASON.REFERENCED });
    }

    const state = asKnownSecretRecords(secretRecords);
    if (state.status !== PLANNER_DIRECT_SECRET_RECORDS_STATUS.KNOWN) {
        return Object.freeze({ safe: false, reason: PLANNER_DIRECT_SECRET_CLEANUP_REASON.SECRET_STATE_UNKNOWN });
    }
    const record = state.records.find(candidate => candidate.id === id);
    if (!record) return Object.freeze({ safe: false, reason: PLANNER_DIRECT_SECRET_CLEANUP_REASON.NOT_FOUND });
    if (record.active) return Object.freeze({ safe: false, reason: PLANNER_DIRECT_SECRET_CLEANUP_REASON.ACTIVE });
    return Object.freeze({ safe: true, reason: PLANNER_DIRECT_SECRET_CLEANUP_REASON.SAFE });
}
