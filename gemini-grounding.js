function normalizeText(value) {
    return String(value || '').replace(/\r\n?/gu, '\n').trim();
}

function normalizePartText(value) {
    return String(value || '').replace(/\r\n?/gu, '\n');
}

function isHttpUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Converts a UTF-8 byte offset to a JavaScript UTF-16 code-unit index.
 *
 * @param {string} text Source text.
 * @param {number} byteOffset UTF-8 byte offset.
 * @returns {number} UTF-16 code-unit index.
 */
export function utf8ByteOffsetToCodeUnitIndex(text, byteOffset) {
    const source = String(text || '');
    const limit = Number.isFinite(byteOffset) ? Math.max(0, byteOffset) : Number.POSITIVE_INFINITY;
    const encoder = new TextEncoder();
    let bytes = 0;
    let codeUnits = 0;

    for (const character of source) {
        const size = encoder.encode(character).length;
        if (bytes + size > limit) break;
        bytes += size;
        codeUnits += character.length;
    }

    return codeUnits;
}

function getCandidateParts(rawResponse) {
    const directParts = rawResponse?.responseContent?.parts;
    if (Array.isArray(directParts)) return directParts;
    const candidateParts = rawResponse?.candidates?.[0]?.content?.parts;
    if (Array.isArray(candidateParts)) return candidateParts;
    return [];
}

function getFallbackText(rawResponse) {
    return normalizeText(
        rawResponse?.choices?.[0]?.message?.content
        ?? rawResponse?.choices?.[0]?.text
        ?? rawResponse?.text,
    );
}

function getGroundingMetadata(rawResponse) {
    return rawResponse?.groundingMetadata
        ?? rawResponse?.candidates?.[0]?.groundingMetadata
        ?? null;
}

function getFinishReason(rawResponse) {
    return String(
        rawResponse?.finishReason
        ?? rawResponse?.candidates?.[0]?.finishReason
        ?? rawResponse?.choices?.[0]?.finish_reason
        ?? '',
    ).toUpperCase();
}

function citationMarkdown(indices, chunks) {
    const seen = new Set();
    const links = [];
    for (const rawIndex of Array.isArray(indices) ? indices : []) {
        const index = Number.parseInt(rawIndex, 10);
        if (!Number.isInteger(index) || index < 0 || seen.has(index)) continue;
        const web = chunks[index]?.web;
        if (!web || !isHttpUrl(web.uri)) continue;
        seen.add(index);
        const title = normalizeText(web.title).replace(/"/gu, '\\"');
        const titleSuffix = title ? ` "${title}"` : '';
        links.push(`[${index + 1}](${web.uri}${titleSuffix})`);
    }
    return links.join(' ');
}

function supportEndIndex(text, segment) {
    const parsed = Number(segment?.endIndex);
    if (Number.isFinite(parsed) && parsed >= 0) {
        return utf8ByteOffsetToCodeUnitIndex(text, parsed);
    }
    const segmentText = normalizeText(segment?.text);
    if (!segmentText) return text.length;
    const index = text.lastIndexOf(segmentText);
    return index >= 0 ? index + segmentText.length : text.length;
}

function addCitationsToPart(text, partIndex, supports, chunks) {
    const insertions = new Map();
    for (const support of supports) {
        const segment = support?.segment;
        const segmentPart = Number.parseInt(segment?.partIndex, 10) || 0;
        if (segmentPart !== partIndex) continue;
        const markdown = citationMarkdown(support?.groundingChunkIndices, chunks);
        if (!markdown) continue;
        const endIndex = Math.min(text.length, Math.max(0, supportEndIndex(text, segment)));
        const previous = insertions.get(endIndex) || [];
        if (!previous.includes(markdown)) previous.push(markdown);
        insertions.set(endIndex, previous);
    }

    let output = text;
    const sorted = [...insertions.entries()].sort(([left], [right]) => right - left);
    for (const [index, citations] of sorted) {
        output = `${output.slice(0, index)} ${citations.join(' ')}${output.slice(index)}`;
    }
    return output;
}

/**
 * Extracts a complete Gemini Google Search grounded answer.
 *
 * @param {any} rawResponse Raw Google or SillyTavern response.
 * @returns {{
 *   text: string,
 *   attributedText: string,
 *   usedSearch: boolean,
 *   queries: string[],
 *   sources: {index: number, title: string, uri: string}[],
 *   searchEntryPoint: string,
 *   finishReason: string,
 *   truncated: boolean,
 *   usageMetadata: any,
 * }}
 */
export function extractGeminiGroundedAnswer(rawResponse) {
    const metadata = getGroundingMetadata(rawResponse);
    const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
    const supports = Array.isArray(metadata?.groundingSupports) ? metadata.groundingSupports : [];
    const parts = getCandidateParts(rawResponse)
        .map((part, index) => ({ part, index }))
        .filter(item => item.part && typeof item.part === 'object' && !item.part.thought && typeof item.part.text === 'string')
        .map(item => ({ index: item.index, text: normalizePartText(item.part.text) }))
        .filter(item => item.text.trim());
    const text = parts.length ? parts.map(item => item.text).join('\n\n').trim() : getFallbackText(rawResponse);
    const attributedParts = parts.map(item => addCitationsToPart(item.text, item.index, supports, chunks));
    const attributedText = attributedParts.length ? attributedParts.join('\n\n').trim() : text;
    const queries = [...new Set(
        (Array.isArray(metadata?.webSearchQueries) ? metadata.webSearchQueries : [])
            .map(normalizeText)
            .filter(Boolean),
    )];
    const sources = chunks
        .map((chunk, index) => ({
            index: index + 1,
            title: normalizeText(chunk?.web?.title),
            uri: String(chunk?.web?.uri || ''),
        }))
        .filter(source => isHttpUrl(source.uri));
    const searchEntryPoint = String(metadata?.searchEntryPoint?.renderedContent || '').trim();
    const finishReason = getFinishReason(rawResponse);
    const usedSearch = Boolean(
        queries.length
        || sources.length
        || supports.length
        || searchEntryPoint,
    );

    return {
        text,
        attributedText,
        usedSearch,
        queries,
        sources,
        searchEntryPoint,
        finishReason,
        truncated: finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH',
        usageMetadata: rawResponse?.usageMetadata ?? null,
    };
}
