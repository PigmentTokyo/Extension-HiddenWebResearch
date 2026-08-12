const LOCAL_BARE_SEARXNG_PATTERN = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:[/?#].*)?$/iu;
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//iu;
const MAX_SEARXNG_URL_CHARS = 2048;

/**
 * Normalizes a SearXNG instance URL before it reaches SillyTavern's server
 * route. Only unambiguous loopback hostnames receive an implicit http://
 * scheme; remote hosts must state their transport explicitly.
 *
 * @param {unknown} value Raw SearXNG URL.
 * @param {{allowBlank?: boolean}} options Normalization options.
 * @returns {string} Origin URL without a trailing slash, or blank when allowed.
 */
export function normalizeSearxngBaseUrl(value, { allowBlank = true } = {}) {
    let input = String(value || '').trim();
    if (!input) {
        if (allowBlank) return '';
        throw new Error('SearXNG Base URL 不能为空');
    }
    if (input.length > MAX_SEARXNG_URL_CHARS) {
        throw new Error('SearXNG Base URL 过长');
    }
    if (!URL_SCHEME_PATTERN.test(input)) {
        if (!LOCAL_BARE_SEARXNG_PATTERN.test(input)) {
            throw new Error('SearXNG Base URL 缺少 http:// 或 https://');
        }
        input = `http://${input}`;
    }

    let url;
    try {
        url = new URL(input);
    } catch {
        throw new Error('SearXNG Base URL 格式无效');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('SearXNG Base URL 只允许 http:// 或 https://');
    }
    if (url.username || url.password) {
        throw new Error('SearXNG Base URL 不能内嵌用户名或密码');
    }

    const normalizedPath = url.pathname.replace(/\/+$/gu, '') || '/';
    const isPastedSearchUrl = normalizedPath.toLowerCase() === '/search';
    if (isPastedSearchUrl) {
        url.pathname = '/';
        url.search = '';
        url.hash = '';
    } else {
        if (normalizedPath !== '/') {
            throw new Error('SearXNG Base URL 请填写站点根地址，不要附加路径');
        }
        if (url.search || url.hash) {
            throw new Error('SearXNG Base URL 不能包含查询参数或 #fragment');
        }
    }

    return url.toString().replace(/\/+$/gu, '');
}
