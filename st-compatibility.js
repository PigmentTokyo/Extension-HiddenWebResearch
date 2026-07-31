export const MINIMUM_SUPPORTED_CLIENT_VERSION = '1.13.3';
export const GEMINI_TOOL_CHOICE_NONE_MINIMUM_VERSION = '1.15.0';

const REQUIRED_EVENT_NAMES = Object.freeze([
    'CHAT_COMPLETION_SETTINGS_READY',
    'GENERATION_ENDED',
    'GENERATION_STOPPED',
    'CHAT_CHANGED',
]);

export function parseSillyTavernClientVersion(value) {
    const match = String(value || '').match(/(?:^|:)(\d+)\.(\d+)\.(\d+)(?:[-+][^:]*)?(?::|$)/u);
    if (!match) return null;
    return Object.freeze({
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        normalized: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
    });
}

export function isClientVersionAtLeast(clientVersion, minimumVersion) {
    const current = parseSillyTavernClientVersion(clientVersion);
    const minimum = parseSillyTavernClientVersion(minimumVersion);
    if (!current || !minimum) return false;
    const currentParts = [current.major, current.minor, current.patch];
    const minimumParts = [minimum.major, minimum.minor, minimum.patch];
    for (let index = 0; index < currentParts.length; index++) {
        if (currentParts[index] > minimumParts[index]) return true;
        if (currentParts[index] < minimumParts[index]) return false;
    }
    return true;
}

/**
 * SillyTavern 1.13.3 can convert completed Gemini function history, but it
 * does not translate tool_choice="none" into Google functionCallingConfig.
 * Keep Gemini on the neutral research-packet fallback until 1.15.0.
 */
export function supportsGeminiToolChoiceNone(clientVersion) {
    return isClientVersionAtLeast(clientVersion, GEMINI_TOOL_CHOICE_NONE_MINIMUM_VERSION);
}

function hasEvent(eventTypes, name) {
    return typeof eventTypes?.[name] === 'string' && Boolean(eventTypes[name]);
}

export function inspectSillyTavernCompatibility({
    eventSource,
    eventTypes,
    clientVersion,
    generateRaw,
    getContext,
} = {}) {
    const missing = [];
    const versionSupported = isClientVersionAtLeast(clientVersion, MINIMUM_SUPPORTED_CLIENT_VERSION);
    if (!versionSupported) missing.push(`SillyTavern ${MINIMUM_SUPPORTED_CLIENT_VERSION}+`);

    const hasEventApi = typeof eventSource?.on === 'function'
        && typeof eventSource?.removeListener === 'function';
    if (!hasEventApi) missing.push('eventSource.on/removeListener');

    for (const eventName of REQUIRED_EVENT_NAMES) {
        if (!hasEvent(eventTypes, eventName)) missing.push(`event_types.${eventName}`);
    }

    const hasObjectGenerateRaw = typeof generateRaw === 'function' && generateRaw.length === 0;
    if (!hasObjectGenerateRaw) missing.push('generateRaw(options)');

    const hasContextApi = typeof getContext === 'function';
    if (!hasContextApi) missing.push('SillyTavern.getContext()');

    return Object.freeze({
        minimumVersion: MINIMUM_SUPPORTED_CLIENT_VERSION,
        supported: missing.length === 0,
        requestRewrite: versionSupported
            && hasEventApi && hasEvent(eventTypes, 'CHAT_COMPLETION_SETTINGS_READY'),
        objectGenerateRaw: hasObjectGenerateRaw,
        contextApi: hasContextApi,
        clientVersion: parseSillyTavernClientVersion(clientVersion)?.normalized ?? null,
        versionSupported,
        missing: Object.freeze(missing),
    });
}

export function isCompatibleGenerationRequest(request, handledTypes) {
    if (!request || typeof request !== 'object' || !Array.isArray(request.messages)) return false;
    const type = String(request.type || '');
    if (handledTypes instanceof Set) return handledTypes.has(type);
    if (Array.isArray(handledTypes)) return handledTypes.includes(type);
    return Boolean(type);
}
