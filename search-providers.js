const MAX_RESULT_TEXT = 6000;
const MAX_TITLE_TEXT = 500;
const MAX_URL_TEXT = 2000;
const MAX_DATE_TEXT = 160;

function cleanText(value, maxLength) {
    return String(value ?? '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, maxLength);
}

function normalizeHttpUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw.length > MAX_URL_TEXT) return '';
    try {
        const url = new URL(raw);
        if (!['http:', 'https:'].includes(url.protocol)) return '';
        if (url.username || url.password) return '';
        url.hash = '';
        return url.toString();
    } catch {
        return '';
    }
}

function dedupeItems(items, maxResults) {
    const output = [];
    const seenUrls = new Set();
    const limit = Math.min(10, Math.max(1, Number.parseInt(maxResults, 10) || 10));
    for (const item of items) {
        const url = normalizeHttpUrl(item.url);
        if (!url || seenUrls.has(url)) continue;
        const title = cleanText(item.title, MAX_TITLE_TEXT) || url;
        const snippet = cleanText(item.snippet, MAX_RESULT_TEXT);
        const published = cleanText(item.published, MAX_DATE_TEXT);
        if (!title && !snippet) continue;
        output.push({ title, url, snippet, published });
        seenUrls.add(url);
        if (output.length >= limit) break;
    }
    return output;
}

/**
 * Converts an AnySearch REST response into HWR's common search-item shape.
 * Only successful response data is inspected. Error metadata and request IDs
 * are intentionally discarded so upstream credentials can never enter model
 * evidence through this parser.
 *
 * @param {unknown} payload AnySearch response JSON
 * @param {number} maxResults maximum output items
 * @returns {{items: Array<{title: string, url: string, snippet: string, published: string}>}}
 */
export function normalizeAnySearchResponse(payload, maxResults = 10) {
    if (!payload || typeof payload !== 'object' || Number(payload.code) !== 0) {
        return { items: [] };
    }
    const results = Array.isArray(payload.data?.results) ? payload.data.results : [];
    const items = results.map(result => ({
        title: result?.title,
        url: result?.url,
        snippet: result?.content || result?.snippet,
        published: '',
    }));
    return { items: dedupeItems(items, maxResults) };
}

/**
 * Converts a SerpAPI Google Search response into HWR's common search-item
 * shape. Only organic results with safe source URLs are retained.
 *
 * @param {unknown} payload SerpAPI response JSON
 * @param {number} maxResults maximum output items
 * @returns {{items: Array<{title: string, url: string, snippet: string, published: string}>}}
 */
export function normalizeSerpApiResponse(payload, maxResults = 10) {
    if (!payload || typeof payload !== 'object') {
        return { items: [] };
    }
    const results = Array.isArray(payload.organic_results) ? payload.organic_results : [];
    const items = results.map(result => ({
        title: result?.title,
        url: result?.link,
        snippet: result?.snippet,
        published: result?.date,
    }));
    return { items: dedupeItems(items, maxResults) };
}
