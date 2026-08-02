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

function cleanMultilineText(value, maxLength) {
    return String(value ?? '')
        .replace(/\r\n?/gu, '\n')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, ' ')
        .split('\n')
        .map(line => line.replace(/[^\S\n]+/gu, ' ').trim())
        .filter(Boolean)
        .join('\n')
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

function combineDistinctText(parts) {
    const output = [];
    for (const part of parts) {
        const text = cleanText(part, MAX_RESULT_TEXT);
        if (!text || output.includes(text)) continue;
        output.push(text);
    }
    return cleanText(output.join(' | '), MAX_RESULT_TEXT);
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

/**
 * Converts a Tavily response into independently citable URL-backed results.
 * The synthesized top-level answer is omitted because it has no stable source
 * URL in the stock SillyTavern response.
 *
 * @param {unknown} payload Tavily response JSON
 * @param {number} maxResults maximum output items
 * @returns {{items: Array<{title: string, url: string, snippet: string, published: string}>}}
 */
export function normalizeTavilyResponse(payload, maxResults = 10) {
    if (!payload || typeof payload !== 'object') return { items: [] };
    const results = Array.isArray(payload.results) ? payload.results : [];
    const items = results.map(result => ({
        title: result?.title,
        url: result?.url,
        snippet: result?.content || result?.snippet || result?.raw_content,
        published: result?.published_date || result?.publishedDate || result?.date,
    }));
    return { items: dedupeItems(items, maxResults) };
}

/**
 * Converts a Serper response into URL-backed organic results. Answer boxes
 * and knowledge graphs are omitted because they may not provide a supporting
 * source URL.
 *
 * @param {unknown} payload Serper response JSON
 * @param {number} maxResults maximum output items
 * @returns {{items: Array<{title: string, url: string, snippet: string, published: string}>}}
 */
export function normalizeSerperResponse(payload, maxResults = 10) {
    if (!payload || typeof payload !== 'object') return { items: [] };
    const results = Array.isArray(payload.organic) ? payload.organic : [];
    const items = results.map(result => ({
        title: result?.title,
        url: result?.link,
        snippet: result?.snippet,
        published: result?.date,
    }));
    return { items: dedupeItems(items, maxResults) };
}

/**
 * Converts KoboldCpp's local DuckDuckGo response into common records.
 *
 * @param {unknown} payload KoboldCpp response JSON
 * @param {number} maxResults maximum output items
 * @returns {{items: Array<{title: string, url: string, snippet: string, published: string}>}}
 */
export function normalizeKoboldCppResponse(payload, maxResults = 10) {
    const results = Array.isArray(payload) ? payload : [];
    const items = results.map(result => ({
        title: result?.title,
        url: result?.url,
        snippet: combineDistinctText([result?.desc, result?.content]),
        published: result?.published || result?.date,
    }));
    return { items: dedupeItems(items, maxResults) };
}

/**
 * Preserves the legacy Extras/Selenium aggregate without inventing a mapping
 * between its text blob and its separately returned links.
 *
 * @param {unknown} payload Extras or Selenium response JSON
 * @param {number} maxLinks maximum candidate links
 * @returns {{items: [], aggregateText: string, candidateLinks: string[]}}
 */
export function normalizeLegacyBrowserSearchResponse(payload, maxLinks = 10) {
    if (!payload || typeof payload !== 'object') {
        return { items: [], aggregateText: '', candidateLinks: [] };
    }
    const rawText = Array.isArray(payload.results)
        ? payload.results.join('\n')
        : String(payload.results ?? '');
    const aggregateText = cleanMultilineText(rawText, MAX_RESULT_TEXT);
    const candidateLinks = [];
    const seenLinks = new Set();
    const limit = Math.min(10, Math.max(1, Number.parseInt(maxLinks, 10) || 10));
    for (const value of Array.isArray(payload.links) ? payload.links : []) {
        const url = normalizeHttpUrl(value);
        if (!url || seenLinks.has(url)) continue;
        candidateLinks.push(url);
        seenLinks.add(url);
        if (candidateLinks.length >= limit) break;
    }
    return { items: [], aggregateText, candidateLinks };
}
