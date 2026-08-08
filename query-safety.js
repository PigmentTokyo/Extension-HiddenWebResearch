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
const SEARCH_QUERY_HARD_MAX_CHARS = 120;
const SEARCH_QUERY_WRAPPER_PATTERNS = Object.freeze([
    Object.freeze({
        pattern: /^(?:以下|下面)(?:内容)?(?:是|为)?\s*(?:用户|玩家|提问者)(?:的)?(?:本轮|当前|最新)?(?:输入|消息|请求|问题|指令)(?:内容)?\s*[:：=]\s*/iu,
        userInput: true,
    }),
    Object.freeze({
        pattern: /^(?:用户|玩家|提问者)(?:的)?(?:本轮|当前|最新)?(?:输入|消息|请求|问题|指令)(?:内容)?\s*[:：=]\s*/iu,
        userInput: true,
    }),
    Object.freeze({
        pattern: /^(?:the\s+)?(?:latest|current|original)?\s*user(?:'s)?\s*(?:input|message|request|question|instruction)\s*[:=]\s*/iu,
        userInput: true,
    }),
    Object.freeze({
        pattern: /^(?:latest_user_request|original_user_request|user_input|user_message|user_request)\s*[:=]\s*/iu,
        userInput: true,
    }),
    Object.freeze({
        pattern: /^(?:search(?:\s+query)?|web\s+search|搜索(?:查询|关键词|词)?|查询(?:关键词|词)?)\s*[:：=]\s*/iu,
        userInput: false,
    }),
]);
const EXPLICIT_SEARCH_TARGET_PATTERNS = Object.freeze([
    /(?:^|[。！？!?；;\n]\s*)(?:请|帮我|麻烦)?(?:联网|上网|网页|网络|网上|在线)?(?:搜索|搜一下|查询|查一下|检索|查证|核实|搜索一下|查询一下)\s*(?:一下|有关|关于)?\s*[:：]?\s*([^。！？!?；;\n]{2,120})/giu,
    /(?:请|帮我|麻烦)(?:联网|上网|网页|网络|网上|在线)?(?:搜索|搜一下|查询|查一下|检索|查证|核实|搜索一下|查询一下)\s*(?:一下|有关|关于)?\s*[:：]?\s*([^。！？!?；;\n]{2,120})/giu,
    /\b(?:please\s+)?(?:search(?:\s+the)?\s+(?:web|internet)(?:\s+for)?|search\s+for|look\s+up|verify\s+online)\s+([^.!?;\n]{2,120})/giu,
]);
const PURPOSE_PREFIX_PATTERN = /^(?:(?:to\s+)?(?:verify|check|find|look\s+up|research|confirm|identify|determine|establish)|(?:查证|核实|确认|查找|寻找|了解|调查|检索|搜索))\s*[:：\-]?\s*/iu;
const GENERIC_PURPOSE_PATTERN = /^(?:(?:the\s+)?(?:user|current|latest)\s+(?:request|input|question|message)|(?:specific\s+)?(?:evidence|information|facts?|details?|sources?|accuracy|current\s+behavior|official\s+docs?)|primary|independent|recency|contradiction|gap[ _-]?fill|(?:用户|本轮|当前|最新)(?:请求|输入|问题|消息|内容)|(?:相关)?(?:信息|事实|细节|资料|来源|准确性|真实性))$/iu;

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

function cleanSearchQueryText(value) {
    let text = String(value || '')
        .normalize('NFKC')
        .replace(/```[\s\S]*?```/gu, ' ')
        .replace(/<[^>]+>/gu, ' ')
        .replace(/^\s*(?:[-*#]+|\d{1,2}[.)、])\s*/u, '')
        .replace(/[\s"'`*#“”‘’]+$/gu, '')
        .replace(/\s+/gu, ' ')
        .trim();
    let wrapperRemoved = false;
    let userInputWrapperRemoved = false;
    for (let pass = 0; pass < 3; pass++) {
        const previous = text;
        for (const wrapper of SEARCH_QUERY_WRAPPER_PATTERNS) {
            const replaced = text.replace(wrapper.pattern, '').trim();
            if (replaced !== text && wrapper.userInput) userInputWrapperRemoved = true;
            text = replaced;
        }
        if (text !== previous) wrapperRemoved = true;
        if (text === previous) break;
    }
    return { text, wrapperRemoved, userInputWrapperRemoved };
}

function normalizeQueryComparisonText(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLocaleLowerCase('en-US')
        .replace(/[\p{P}\p{S}\s]+/gu, '');
}

function getTrigramCoverage(candidate, source) {
    if (candidate.length < 24 || source.length < 24) return 0;
    const sourceTrigrams = new Set();
    for (let index = 0; index <= source.length - 3; index++) {
        sourceTrigrams.add(source.slice(index, index + 3));
    }
    let total = 0;
    let matched = 0;
    for (let index = 0; index <= candidate.length - 3; index++) {
        total++;
        if (sourceTrigrams.has(candidate.slice(index, index + 3))) matched++;
    }
    return total ? matched / total : 0;
}

/**
 * Validates a planner-produced query before it is sent to a search provider.
 * Long narrative copies and prompt-wrapper text fail closed instead of leaking
 * the user's full turn into a third-party search log.
 */
export function validateSearchQueryCandidate(value, {
    userRequest = '',
    maxLength = SEARCH_QUERY_HARD_MAX_CHARS,
    allowShortCopy = false,
} = {}) {
    const original = String(value || '');
    if (containsSensitiveQueryMaterial(original)) {
        return { valid: false, query: '', reason: 'sensitive_material' };
    }
    const cleaned = cleanSearchQueryText(original);
    const query = cleaned.text;
    if (!query) return { valid: false, query: '', reason: 'empty' };
    if (containsSensitiveQueryMaterial(query)) {
        return { valid: false, query: '', reason: 'sensitive_material' };
    }

    const limit = Math.min(
        SEARCH_QUERY_HARD_MAX_CHARS,
        Math.max(16, Math.floor(Number(maxLength) || SEARCH_QUERY_HARD_MAX_CHARS)),
    );
    const queryLength = [...query].length;
    if (queryLength > limit) {
        return { valid: false, query: '', reason: 'too_long' };
    }
    if (cleaned.userInputWrapperRemoved) {
        return { valid: false, query: '', reason: 'wrapped_user_request' };
    }
    const narrativePunctuationCount = (query.match(/[，,。！？!?；;]/gu) || []).length;
    if (queryLength > 32 && narrativePunctuationCount >= 2) {
        return { valid: false, query: '', reason: 'narrative_text' };
    }

    if (!allowShortCopy && userRequest) {
        const source = cleanSearchQueryText(userRequest).text;
        const normalizedQuery = normalizeQueryComparisonText(query);
        const normalizedSource = normalizeQueryComparisonText(source);
        if (normalizedQuery.length >= 32 && normalizedSource) {
            const directCopy = normalizedSource.includes(normalizedQuery)
                || normalizedQuery.includes(normalizedSource);
            if (directCopy || getTrigramCoverage(normalizedQuery, normalizedSource) >= 0.9) {
                return { valid: false, query: '', reason: 'copied_user_request' };
            }
        }
    }
    return { valid: true, query, reason: cleaned.wrapperRemoved ? 'wrapper_removed' : 'ok' };
}

/**
 * Recovers a concise query from the planner's evidence-purpose field when its
 * query field copied the full user turn. Generic labels fail closed.
 */
export function buildSafePurposeFallbackQuery(value, {
    userRequest = '',
    maxLength = SEARCH_QUERY_HARD_MAX_CHARS,
} = {}) {
    const original = String(value || '');
    if (containsSensitiveQueryMaterial(original)) return '';
    const cleaned = cleanSearchQueryText(original);
    if (cleaned.userInputWrapperRemoved) return '';
    const purpose = cleaned.text.replace(PURPOSE_PREFIX_PATTERN, '').trim();
    if (!purpose || GENERIC_PURPOSE_PATTERN.test(purpose)) return '';
    const validation = validateSearchQueryCandidate(purpose, {
        userRequest,
        maxLength,
    });
    return validation.valid ? validation.query : '';
}

function extractExplicitSearchTarget(value, maxLength) {
    const text = String(value || '').normalize('NFKC');
    const matches = EXPLICIT_SEARCH_TARGET_PATTERNS
        .flatMap(pattern => [...text.matchAll(pattern)])
        .sort((left, right) => Number(left.index) - Number(right.index));
    for (let index = matches.length - 1; index >= 0; index--) {
        const candidate = validateSearchQueryCandidate(matches[index][1], {
            maxLength,
            allowShortCopy: true,
        });
        if (candidate.valid) return candidate.query;
    }
    return '';
}

/**
 * Returns a conservative local fallback query. A short direct request can be
 * used, but a long request is never head/tail-truncated into a search query.
 */
export function buildSafeFallbackQuery(value, maxLength = 96) {
    if (containsSensitiveQueryMaterial(value)) return '';
    const limit = Math.min(
        SEARCH_QUERY_HARD_MAX_CHARS,
        Math.max(16, Math.floor(Number(maxLength) || 96)),
    );
    const cleaned = cleanSearchQueryText(value);
    if (cleaned.userInputWrapperRemoved) return '';
    const directFallbackLimit = Math.min(limit, 32);
    if ([...cleaned.text].length <= directFallbackLimit) {
        const direct = validateSearchQueryCandidate(cleaned.text, {
            maxLength: directFallbackLimit,
            allowShortCopy: true,
        });
        return direct.valid ? direct.query : '';
    }
    return extractExplicitSearchTarget(value, limit);
}
