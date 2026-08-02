export const PLANNER_DIRECT_PROFILE_LIMIT = 20;

const PROFILE_ID_MAX_CHARS = 128;
const PROFILE_NAME_MAX_CHARS = 120;
const API_URL_MAX_CHARS = 2048;
const MODEL_ID_MAX_CHARS = 512;
const SECRET_ID_MAX_CHARS = 512;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const CREDENTIAL_PATTERNS = Object.freeze([
    /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/iu,
    /\bsk-(?:ant-)?[A-Za-z0-9_-]{12,}/iu,
    /\bAIza[A-Za-z0-9_-]{24,}/u,
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
    /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/iu,
]);

function normalizeRequiredText(value, label, maxChars, { collapseWhitespace = false } = {}) {
    let normalized = String(value ?? '').trim();
    if (collapseWhitespace) normalized = normalized.replace(/\s+/gu, ' ');
    if (!normalized) throw new Error(`${label} is required`);
    if (CONTROL_CHARACTERS.test(normalized)) throw new Error(`${label} contains control characters`);
    if (normalized.length > maxChars) throw new Error(`${label} exceeds ${maxChars} characters`);
    return normalized;
}

function normalizeOptionalSecretId(value) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return '';
    if (CONTROL_CHARACTERS.test(normalized)) throw new Error('Planner direct secret ID contains control characters');
    if (/\s/u.test(normalized)) throw new Error('Planner direct secret ID contains whitespace');
    if (normalized.length > SECRET_ID_MAX_CHARS) {
        throw new Error(`Planner direct secret ID exceeds ${SECRET_ID_MAX_CHARS} characters`);
    }
    return normalized;
}

export function containsPlannerDirectCredentialMaterial(value) {
    const text = String(value ?? '');
    return CREDENTIAL_PATTERNS.some(pattern => pattern.test(text));
}

function rejectCredentialMaterial(value, label) {
    if (containsPlannerDirectCredentialMaterial(value)) {
        throw new Error(`${label} looks like a credential; paste keys only in the API Key field`);
    }
    return value;
}
/**
 * Normalizes an OpenAI-compatible API base URL. SillyTavern appends
 * `/chat/completions`, so a pasted full endpoint is reduced to its base URL.
 * Credentials must never be embedded in the URL.
 *
 * @param {unknown} value Raw API URL
 * @returns {string} Normalized base URL without a trailing slash
 */
export function normalizePlannerDirectApiUrl(value) {
    const input = normalizeRequiredText(value, 'Planner direct API URL', API_URL_MAX_CHARS);
    let url;
    try {
        url = new URL(input);
    } catch {
        throw new Error('Planner direct API URL is invalid');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Planner direct API URL must use http:// or https://');
    }
    if (url.username || url.password) {
        throw new Error('Planner direct API URL must not contain embedded credentials');
    }
    if (url.search || url.hash) {
        throw new Error('Planner direct API URL must not contain a query string or fragment');
    }
    rejectCredentialMaterial(url.hostname, 'Planner direct API URL');
    rejectCredentialMaterial(url.pathname, 'Planner direct API URL');

    url.pathname = url.pathname
        .replace(/\/+$/gu, '')
        .replace(/\/chat\/completions$/iu, '')
        .replace(/\/+$/gu, '');

    return url.toString().replace(/\/+$/gu, '');
}

/**
 * Produces the only metadata shape that may be persisted for a direct planner.
 * Unknown properties (including apiKey/key/token) are intentionally discarded.
 * A blank secretId is retained so imported metadata can be shown as needing a
 * new key, but such a profile is not request-ready.
 *
 * @param {unknown} value Raw profile metadata
 * @returns {{id: string, name: string, apiUrl: string, model: string, secretId: string}}
 */
export function normalizePlannerDirectProfile(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Planner direct profile must be an object');
    }

    return Object.freeze({
        id: normalizeRequiredText(value.id, 'Planner direct profile ID', PROFILE_ID_MAX_CHARS),
        name: rejectCredentialMaterial(
            normalizeRequiredText(
                value.name,
                'Planner direct profile name',
                PROFILE_NAME_MAX_CHARS,
                { collapseWhitespace: true },
            ),
            'Planner direct profile name',
        ),
        apiUrl: normalizePlannerDirectApiUrl(value.apiUrl),
        model: rejectCredentialMaterial(
            normalizeRequiredText(value.model, 'Planner direct model ID', MODEL_ID_MAX_CHARS),
            'Planner direct model ID',
        ),
        secretId: normalizeOptionalSecretId(value.secretId),
    });
}

/**
 * Sanitizes a persisted profile list. Invalid entries and duplicate IDs are
 * discarded, and the first 20 valid unique profiles are retained.
 *
 * @param {unknown} value Raw persisted value
 * @returns {ReadonlyArray<{id: string, name: string, apiUrl: string, model: string, secretId: string}>}
 */
export function normalizePlannerDirectProfiles(value) {
    if (!Array.isArray(value)) return Object.freeze([]);
    const profiles = [];
    const seenIds = new Set();

    for (const candidate of value) {
        if (profiles.length >= PLANNER_DIRECT_PROFILE_LIMIT) break;
        try {
            const profile = normalizePlannerDirectProfile(candidate);
            if (seenIds.has(profile.id)) continue;
            seenIds.add(profile.id);
            profiles.push(profile);
        } catch {
            // Settings normalization must recover from malformed imported data.
        }
    }

    return Object.freeze(profiles);
}

/**
 * @param {unknown} value Profile metadata
 * @returns {boolean} Whether all request-critical metadata is present and valid
 */
export function isPlannerDirectProfileReady(value) {
    try {
        return Boolean(normalizePlannerDirectProfile(value).secretId);
    } catch {
        return false;
    }
}

/**
 * Finds the selected profile only when it is safe to dispatch a request.
 *
 * @param {unknown} profiles Raw or normalized profile list
 * @param {unknown} selectedId Selected profile ID
 * @returns {{id: string, name: string, apiUrl: string, model: string, secretId: string}|null}
 */
export function getReadyPlannerDirectProfile(profiles, selectedId) {
    const normalizedId = String(selectedId ?? '').trim();
    if (!normalizedId) return null;
    const selected = normalizePlannerDirectProfiles(profiles).find(profile => profile.id === normalizedId);
    return selected && isPlannerDirectProfileReady(selected) ? selected : null;
}

function hashFingerprintPart(value) {
    const text = String(value ?? '');
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index);
        first = Math.imul(first ^ code, 0x01000193);
        second = Math.imul(second ^ code, 0x85ebca6b);
    }
    return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Returns stable request-relevant cache metadata. Endpoint and credential IDs
 * are hashed, profile labels are excluded, and unknown/raw key properties can
 * never enter the fingerprint.
 *
 * @param {unknown} value Profile metadata
 * @returns {{mode: 'direct', profileIdHash: string, apiUrlHash: string, model: string, secretIdHash: string}}
 */
export function getPlannerDirectProfileFingerprint(value) {
    const profile = normalizePlannerDirectProfile(value);
    return Object.freeze({
        mode: 'direct',
        profileIdHash: hashFingerprintPart(profile.id),
        apiUrlHash: hashFingerprintPart(profile.apiUrl),
        model: profile.model,
        secretIdHash: hashFingerprintPart(profile.secretId),
    });
}
