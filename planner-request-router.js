export const PLANNER_CONNECTION_MODES = Object.freeze({
    CURRENT: 'current',
    PROFILE: 'profile',
    DIRECT: 'direct',
});

export const PLANNER_REQUEST_TIMEOUT_REASON = 'Request timed out';

export function isPlannerRequestTimeout(signal) {
    return Boolean(signal?.aborted && signal.reason === PLANNER_REQUEST_TIMEOUT_REASON);
}

export function shouldFallbackPlannerRequest(signal, fallbackToCurrent) {
    if (!fallbackToCurrent) return false;
    return !signal?.aborted || isPlannerRequestTimeout(signal);
}

export function resolvePlannerRequestMode(mode, profileFailed = false) {
    const normalizedMode = normalizePlannerConnectionMode(mode);
    return normalizedMode !== PLANNER_CONNECTION_MODES.CURRENT && !profileFailed
        ? normalizedMode
        : PLANNER_CONNECTION_MODES.CURRENT;
}

function createPlannerAbortError(reason = 'Hidden research run is no longer current') {
    const error = new Error(String(reason));
    error.name = 'AbortError';
    return error;
}

function throwIfPlannerFallbackStale(isCurrent) {
    if (typeof isCurrent !== 'function' || isCurrent()) return;
    throw createPlannerAbortError();
}

/**
 * Runs exactly one current-model fallback after a Profile failure. The Profile
 * timeout signal is used only to classify the failure; it is never reused for
 * the fallback request.
 */
export async function fallbackPlannerToCurrent({
    error,
    signal = null,
    fallbackToCurrent = true,
    isCurrent = null,
    generateCurrent,
}) {
    if (!shouldFallbackPlannerRequest(signal, fallbackToCurrent)) throw error;
    if (typeof generateCurrent !== 'function') {
        throw new TypeError('generateCurrent must be a function');
    }
    throwIfPlannerFallbackStale(isCurrent);
    const text = String(await generateCurrent()).trim();
    throwIfPlannerFallbackStale(isCurrent);
    return {
        text,
        source: PLANNER_CONNECTION_MODES.CURRENT,
        fallbackUsed: true,
    };
}

export function normalizePlannerConnectionMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === PLANNER_CONNECTION_MODES.PROFILE) return PLANNER_CONNECTION_MODES.PROFILE;
    if (normalized === PLANNER_CONNECTION_MODES.DIRECT) return PLANNER_CONNECTION_MODES.DIRECT;
    return PLANNER_CONNECTION_MODES.CURRENT;
}

export function listPlannerProfiles(service) {
    if (!service || typeof service.getSupportedProfiles !== 'function') return [];
    try {
        const profiles = service.getSupportedProfiles();
        return Array.isArray(profiles) ? profiles.filter(profile => profile?.id) : [];
    } catch {
        return [];
    }
}

function isAbortFailure(error, signal) {
    return Boolean(
        signal?.aborted
        || error?.name === 'AbortError'
        || error?.cause?.name === 'AbortError',
    );
}

function throwIfAborted(signal) {
    if (!signal?.aborted) return;
    const error = new Error('Planner request was aborted');
    error.name = 'AbortError';
    error.cause = signal.reason;
    throw error;
}

/**
 * Settles on abort even when a third-party task ignores the supplied signal.
 * Promise.race installs rejection handlers on both branches, so a late task
 * settlement is discarded without becoming an unhandled rejection.
 */
export async function raceTaskWithAbortSignal(callback, signal) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    if (!signal) return callback();
    throwIfAborted(signal);
    let abortListener = null;
    const abortPromise = new Promise((_, reject) => {
        abortListener = () => {
            try {
                throwIfAborted(signal);
            } catch (error) {
                reject(error);
            }
        };
        signal.addEventListener('abort', abortListener, { once: true });
    });
    try {
        return await Promise.race([Promise.resolve().then(callback), abortPromise]);
    } finally {
        signal.removeEventListener('abort', abortListener);
    }
}

function extractPlannerText(response) {
    if (typeof response === 'string') return response.trim();
    const content = response?.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
        return content
            .map(part => typeof part === 'string' ? part : part?.text || '')
            .join('')
            .trim();
    }
    return '';
}

/**
 * Routes one hidden planning request without changing SillyTavern's selected
 * connection. The supplied service owns endpoint selection and credentials.
 */
export async function requestHiddenPlanner({
    mode,
    profileId,
    fallbackToCurrent = true,
    messages,
    maxTokens,
    signal = null,
    overridePayload = {},
    service,
    generateCurrent,
}) {
    if (typeof generateCurrent !== 'function') {
        throw new TypeError('generateCurrent must be a function');
    }

    throwIfAborted(signal);
    const normalizedMode = normalizePlannerConnectionMode(mode);
    if (normalizedMode === PLANNER_CONNECTION_MODES.CURRENT) {
        const text = String(await generateCurrent()).trim();
        throwIfAborted(signal);
        return {
            text,
            source: PLANNER_CONNECTION_MODES.CURRENT,
            fallbackUsed: false,
        };
    }

    try {
        if (!profileId) throw new Error('No secondary planner connection selected');
        if (!service || typeof service.sendRequest !== 'function') {
            throw new Error('Secondary planner request service is unavailable');
        }
        const profile = listPlannerProfiles(service).find(item => item.id === profileId);
        if (!profile) throw new Error('Selected secondary planner connection is unavailable');

        const response = await service.sendRequest(
            profileId,
            messages,
            maxTokens,
            {
                stream: false,
                signal,
                extractData: true,
                includePreset: false,
                includeInstruct: false,
            },
            overridePayload,
        );
        throwIfAborted(signal);
        const text = extractPlannerText(response);
        if (!text) throw new Error('Secondary planner returned an empty response');
        return {
            text,
            source: normalizedMode,
            fallbackUsed: false,
        };
    } catch (error) {
        if (isAbortFailure(error, signal) || !fallbackToCurrent) throw error;
        return fallbackPlannerToCurrent({
            error,
            signal,
            fallbackToCurrent,
            generateCurrent,
        });
    }
}
