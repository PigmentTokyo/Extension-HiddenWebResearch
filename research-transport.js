const TRANSPORTS = new Set(['auto', 'prompt']);

function normalizeText(value, maxLength) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, maxLength);
}

function hashText(value) {
    let hash = 2166136261;
    for (const character of String(value ?? '')) {
        hash ^= character.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeQueryList(queries, sources) {
    const explicit = Array.isArray(queries) ? queries : [];
    const inferred = Array.isArray(sources)
        ? sources.flatMap(source => Array.isArray(source?.queries) ? source.queries : [])
        : [];
    return [...new Set([...explicit, ...inferred]
        .map(query => normalizeText(query, 240))
        .filter(Boolean))]
        .slice(0, 10);
}

function normalizeSource(source, includeSourceLinks) {
    if (!source || typeof source !== 'object') return null;
    const sourceId = normalizeText(source.sourceId || source.id, 32);
    const title = normalizeText(source.title, 400);
    const snippet = normalizeText(source.snippet || source.description, 1600);
    const published = normalizeText(source.published || source.date, 160);
    const url = includeSourceLinks ? normalizeText(source.url, 800) : '';
    const queries = [...new Set((Array.isArray(source.queries) ? source.queries : [source.query])
        .map(query => normalizeText(query, 240))
        .filter(Boolean))];
    if (!sourceId || (!title && !snippet && !url)) return null;
    return {
        id: sourceId,
        title,
        ...(url ? { url } : {}),
        ...(published ? { published } : {}),
        snippet,
        queries,
    };
}

function matchesQuery(source, query) {
    const needle = query.toLocaleLowerCase();
    return source.queries.some(value => value.toLocaleLowerCase() === needle);
}

export function normalizeResearchTransport(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return TRANSPORTS.has(normalized) ? normalized : 'auto';
}

export function resolveResearchTransport(preference, toolCallingSupported) {
    const normalized = normalizeResearchTransport(preference);
    return normalized === 'auto' && Boolean(toolCallingSupported) ? 'tool' : 'prompt';
}

/**
 * Builds an ephemeral OpenAI-compatible tool exchange. SillyTavern converts the
 * same invocation records into Claude tool_use/tool_result and Gemini
 * functionCall/functionResponse when those providers are selected.
 */
export function buildClientWebSearchInvocations({
    queries,
    sources,
    provider,
    retrievedAtUtc,
    includeSourceLinks = true,
    maxChars = 18000,
}) {
    const normalizedSources = (Array.isArray(sources) ? sources : [])
        .map(source => normalizeSource(source, includeSourceLinks))
        .filter(Boolean);
    const normalizedQueries = normalizeQueryList(queries, normalizedSources);
    if (!normalizedQueries.length || !normalizedSources.length) return [];

    const providerName = normalizeText(provider || 'client_search', 80) || 'client_search';
    const timestamp = normalizeText(retrievedAtUtc, 64);
    const budget = Math.min(40000, Math.max(2000, Number.parseInt(maxChars, 10) || 18000));
    const assignedSourceIds = new Set();
    let usedCharacters = 0;
    const invocations = [];

    for (const [index, query] of normalizedQueries.entries()) {
        const candidates = normalizedSources.filter(source =>
            !assignedSourceIds.has(source.id) && matchesQuery(source, query));
        const resultItems = [];

        for (const source of candidates) {
            const candidatePayload = {
                type: 'client_web_search_result',
                provider: providerName,
                retrieved_at_utc: timestamp,
                query,
                results: [...resultItems, {
                    id: source.id,
                    title: source.title,
                    ...(source.url ? { url: source.url } : {}),
                    ...(source.published ? { published: source.published } : {}),
                    snippet: source.snippet,
                }],
            };
            const candidateLength = JSON.stringify(candidatePayload).length;
            if (usedCharacters + candidateLength > budget && resultItems.length) break;
            if (usedCharacters + candidateLength > budget) continue;
            resultItems.push(candidatePayload.results.at(-1));
            assignedSourceIds.add(source.id);
        }

        if (!resultItems.length) continue;
        const result = JSON.stringify({
            type: 'client_web_search_result',
            provider: providerName,
            retrieved_at_utc: timestamp,
            query,
            results: resultItems,
        });
        usedCharacters += result.length;
        invocations.push({
            id: `hwr_web_${hashText(`${timestamp}\n${query}\n${index}`)}_${index + 1}`,
            displayName: 'Web Search',
            name: 'hwr_web_search',
            parameters: JSON.stringify({ query }),
            result,
            error: false,
            signature: null,
            reasoning: null,
        });
    }

    // A merged source can occasionally lose an exact query match after an
    // upstream normalizer changes whitespace. Keep such evidence available in
    // one final call instead of silently dropping it.
    const remainingSources = normalizedSources.filter(source => !assignedSourceIds.has(source.id));
    if (remainingSources.length && invocations.length) {
        const lastInvocation = invocations.at(-1);
        const payload = JSON.parse(lastInvocation.result);
        for (const source of remainingSources) {
            const item = {
                id: source.id,
                title: source.title,
                ...(source.url ? { url: source.url } : {}),
                ...(source.published ? { published: source.published } : {}),
                snippet: source.snippet,
            };
            const nextResult = JSON.stringify({ ...payload, results: [...payload.results, item] });
            const previousLength = lastInvocation.result.length;
            if (usedCharacters - previousLength + nextResult.length > budget) break;
            usedCharacters = usedCharacters - previousLength + nextResult.length;
            payload.results.push(item);
            lastInvocation.result = nextResult;
        }
    }

    return invocations;
}
