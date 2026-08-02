/**
 * Features in this group need non-stock SillyTavern server routes or response
 * passthrough. Keep the implementation available for later work, but do not
 * expose or call it while the public extension targets an unmodified server.
 */
export const ENABLE_SERVER_DEPENDENT_FEATURES = false;

export const STOCK_RESEARCH_BACKENDS = Object.freeze([
    'searxng',
    'serpapi',
    'tavily',
    'serper',
    'koboldcpp',
]);

export const OPTIONAL_COMPONENT_RESEARCH_BACKENDS = Object.freeze([
    'extras',
    'selenium',
]);

export const SERVER_DEPENDENT_RESEARCH_BACKENDS = Object.freeze([
    'anysearch',
    'claude_profile',
    'gemini_profile',
]);

export function getEnabledResearchBackends() {
    const publicBackends = [...STOCK_RESEARCH_BACKENDS, ...OPTIONAL_COMPONENT_RESEARCH_BACKENDS];
    return ENABLE_SERVER_DEPENDENT_FEATURES
        ? [...publicBackends, ...SERVER_DEPENDENT_RESEARCH_BACKENDS]
        : publicBackends;
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
    const enabledBackends = getEnabledResearchBackends();
    const paused = Boolean(requestedBackend) && !enabledBackends.includes(requestedBackend);
    return {
        requestedBackend,
        researchBackend: normalizeResearchBackend(requestedBackend),
        enabled: paused ? false : Boolean(enabled),
        paused,
    };
}
