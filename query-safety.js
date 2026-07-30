const DIRECT_SENSITIVE_QUERY_PATTERNS = Object.freeze([
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
    /\bsk-[A-Za-z0-9_-]{12,}\b/u,
    /\bAIza[0-9A-Za-z_-]{20,}\b/u,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u,
    /\bxox[baprs]-[A-Za-z0-9-]{12,}\b/u,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
]);
const AUTHORIZATION_BEARER_PATTERN = /\bAuthorization\s*:\s*Bearer\s+([A-Za-z0-9._~+\/=-]{16,})/giu;
const BARE_BEARER_PATTERN = /\bBearer\s+([A-Za-z0-9._~+\/=-]{16,})/giu;
const AUTHORIZATION_BASIC_PATTERN = /\bAuthorization\s*:\s*Basic\s+([A-Za-z0-9+/]{4,256}={0,2})(?=$|[\s"',;])/giu;
const LABELED_SECRET_PATTERN = /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*["']?([^\s"',;]{12,})/giu;
const URL_SECRET_PARAMETER_PATTERN = /[?&](?:api[_-]?key|key|token|access[_-]?token|auth)=([^&\s"',;]{12,})/giu;
const OBVIOUS_PLACEHOLDER_PATTERN = /^(?:your(?:[_-]?(?:(?:api|access|refresh|client)[_-]?)?(?:key|token|secret|credentials?))(?:[_-]?here)?|example(?:[_-]?(?:key|token|secret|credentials?|configuration|value))?|placeholder|redacted|change[_-]?me|replace[_-]?me|insert(?:[_-]?(?:key|token|secret|credentials?))?(?:[_-]?here)?|dummy(?:[_-]?(?:key|token|secret|credentials?))?|test(?:[_-]?(?:key|token|secret|credentials?))?|base64(?:[_-]?(?:credentials?|value|string))?|credentials?|x{4,}|\*{4,})$/iu;

function normalizeCredentialCandidate(value) {
    return String(value || '').trim().replace(/^[<"']+|[>"']+$/gu, '');
}

function isObviousPlaceholder(value) {
    return OBVIOUS_PLACEHOLDER_PATTERN.test(normalizeCredentialCandidate(value));
}

function containsNonPlaceholderMatch(text, pattern) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
        if (!isObviousPlaceholder(match[1])) return true;
    }
    return false;
}

function containsBasicCredential(text) {
    AUTHORIZATION_BASIC_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(AUTHORIZATION_BASIC_PATTERN)) {
        const candidate = normalizeCredentialCandidate(match[1]);
        if (isObviousPlaceholder(candidate) || candidate.length % 4 !== 0) continue;
        try {
            if (globalThis.atob(candidate).includes(':')) return true;
        } catch {
            // Invalid base64 is ordinary query text, not a credential.
        }
    }
    return false;
}

/**
 * Detects credential-shaped material that must never be sent to a search
 * provider. The check intentionally favors false negatives over blocking
 * ordinary public identifiers, but covers common API key and token formats.
 */
export function containsSensitiveQueryMaterial(value) {
    const text = String(value || '');
    if (DIRECT_SENSITIVE_QUERY_PATTERNS.some(pattern => pattern.test(text))) return true;
    return containsNonPlaceholderMatch(text, AUTHORIZATION_BEARER_PATTERN)
        || containsNonPlaceholderMatch(text, BARE_BEARER_PATTERN)
        || containsBasicCredential(text)
        || containsNonPlaceholderMatch(text, LABELED_SECRET_PATTERN)
        || containsNonPlaceholderMatch(text, URL_SECRET_PARAMETER_PATTERN);
}

/**
 * Keeps both the beginning and the end of a long request. Search instructions
 * and the actual question are commonly appended after a large pasted block.
 */
export function compactSearchRequest(value, maxLength = 4000) {
    const text = String(value || '').replace(/\s+/gu, ' ').trim();
    const limit = Math.max(0, Math.floor(Number(maxLength) || 0));
    if (!limit || text.length <= limit) return text;

    const marker = ' ... [middle omitted] ... ';
    if (limit <= marker.length + 2) return text.slice(0, limit);

    const available = limit - marker.length;
    const headLength = Math.ceil(available * 0.55);
    const tailLength = available - headLength;
    return `${text.slice(0, headLength)}${marker}${text.slice(-tailLength)}`;
}

/** Returns a compact fallback query, or an empty string when it is unsafe. */
export function buildSafeFallbackQuery(value, maxLength = 220) {
    const compacted = compactSearchRequest(value, maxLength);
    return containsSensitiveQueryMaterial(compacted) ? '' : compacted;
}
