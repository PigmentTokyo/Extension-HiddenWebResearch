/**
 * Features in this group need non-stock SillyTavern server routes or response
 * passthrough. Keep the implementation available for later work, but do not
 * expose or call it while the public extension targets an unmodified server.
 */
export const ENABLE_SERVER_DEPENDENT_FEATURES = false;

export const STOCK_RESEARCH_BACKENDS = Object.freeze([
    'searxng',
    'serpapi',
]);

export const SERVER_DEPENDENT_RESEARCH_BACKENDS = Object.freeze([
    'anysearch',
    'claude_profile',
    'gemini_profile',
]);

export function getEnabledResearchBackends() {
    return ENABLE_SERVER_DEPENDENT_FEATURES
        ? [...STOCK_RESEARCH_BACKENDS, ...SERVER_DEPENDENT_RESEARCH_BACKENDS]
        : [...STOCK_RESEARCH_BACKENDS];
}

export function normalizeResearchBackend(value) {
    const backend = String(value || '');
    return getEnabledResearchBackends().includes(backend)
        ? backend
        : STOCK_RESEARCH_BACKENDS[0];
}

export function isResearchBackendEnabled(value) {
    return getEnabledResearchBackends().includes(String(value || ''));
}

export function resolveResearchBackendSelection(value, enabled) {
    const requestedBackend = String(value || '');
    const paused = !ENABLE_SERVER_DEPENDENT_FEATURES
        && SERVER_DEPENDENT_RESEARCH_BACKENDS.includes(requestedBackend);
    return {
        requestedBackend,
        researchBackend: normalizeResearchBackend(requestedBackend),
        enabled: paused ? false : Boolean(enabled),
        paused,
    };
}
