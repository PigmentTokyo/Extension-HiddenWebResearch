export const SEARCH_LOG_LIMIT = 40;
export const SEARCH_LOG_CHARACTER_LIMIT = 200000;

function normalizeLogText(value, maxLength) {
    return String(value ?? '')
        .replace(/\r\n?/gu, '\n')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
        .trim()
        .slice(0, maxLength);
}

function isSensitiveLogKey(value) {
    const normalized = String(value || '')
        .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '_')
        .replace(/^_+|_+$/gu, '');
    if (!normalized) return false;
    if (['apikey', 'authkey', 'sessionid'].includes(normalized)) return true;
    const sensitiveParts = new Set([
        'key',
        'token',
        'secret',
        'auth',
        'authorization',
        'oauth',
        'password',
        'passwd',
        'credential',
        'signature',
        'sig',
        'session',
        'sessionid',
        'jwt',
    ]);
    return normalized.split('_').some(part => sensitiveParts.has(part));
}

function redactSensitiveLogText(value, maxLength) {
    return normalizeLogText(value, maxLength)
        .replace(/https?:\/\/[^\s<>"']+/giu, rawUrl => {
            try {
                const parsed = new URL(rawUrl);
                parsed.username = '';
                parsed.password = '';
                parsed.search = '';
                parsed.hash = '';
                return parsed.toString();
            } catch {
                return '[REDACTED URL]';
            }
        })
        .replace(/\b(Bearer|Basic)\s+[^\s,;]+/giu, '$1 [REDACTED]')
        .replace(/\b([A-Za-z][A-Za-z0-9_-]{1,40})\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gu, (match, key) => (
            isSensitiveLogKey(key) ? `${key}=[REDACTED]` : match
        ))
        .replace(/\b(api\s+key|access\s+token|refresh\s+token|client\s+secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu, '$1=[REDACTED]')
        .replace(/\b(?:sk|key|token)-[A-Za-z0-9_.-]{8,}\b/gu, '[REDACTED]');
}

function normalizeLogUrl(value) {
    try {
        const parsed = new URL(String(value || ''));
        if (!['http:', 'https:'].includes(parsed.protocol)) return '';
        if (parsed.username || parsed.password) return '';
        parsed.hash = '';
        for (const key of [...parsed.searchParams.keys()]) {
            if (isSensitiveLogKey(key)) {
                parsed.searchParams.set(key, 'REDACTED');
            }
        }
        return parsed.toString();
    } catch {
        return '';
    }
}

function normalizeTimestamp(value) {
    const parsed = Number(value);
    const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function normalizeLogItem(item) {
    if (!item || typeof item !== 'object') return null;
    const title = normalizeLogText(item.title, 400);
    const url = normalizeLogUrl(item.url || item.uri).slice(0, 1200);
    const snippet = normalizeLogText(item.snippet || item.description || item.citedText, 2000);
    const published = normalizeLogText(item.published || item.date || item.pageAge, 160);
    if (!title && !url && !snippet) return null;
    return { title, url, snippet, published };
}

function normalizeAggregateEvidence(value) {
    if (!value || typeof value !== 'object') return null;
    const text = normalizeLogText(value.text, 5000);
    const candidateLinks = [...new Set((Array.isArray(value.candidateLinks) ? value.candidateLinks : [])
        .map(link => normalizeLogUrl(link).slice(0, 1200))
        .filter(Boolean))]
        .slice(0, 12);
    if (!text && !candidateLinks.length) return null;
    return {
        provider: normalizeLogText(value.provider, 120),
        engine: normalizeLogText(value.engine, 120),
        text,
        candidateLinks,
    };
}

export function createSearchLogEntry({
    id,
    backend,
    backendLabel,
    query,
    result = null,
    error = null,
    context = 'research',
    startedAt = Date.now(),
    finishedAt = Date.now(),
    cacheHit = Boolean(result?.cacheHit),
    note = '',
}) {
    const start = Number.isFinite(Number(startedAt)) ? Number(startedAt) : Date.now();
    const finish = Number.isFinite(Number(finishedAt)) ? Number(finishedAt) : start;
    const items = (Array.isArray(result?.items) ? result.items : [])
        .map(normalizeLogItem)
        .filter(Boolean)
        .slice(0, 10);
    const aggregateEvidence = normalizeAggregateEvidence(result?.aggregateEvidence);
    const errorText = redactSensitiveLogText(error?.message || error, 1200);
    const status = errorText ? 'error' : cacheHit ? 'cache' : 'success';

    return {
        id: normalizeLogText(id, 80),
        backend: normalizeLogText(backend, 80),
        backendLabel: normalizeLogText(backendLabel || backend, 120),
        query: redactSensitiveLogText(query, 500),
        context: context === 'test' ? 'test' : 'research',
        status,
        cacheHit: Boolean(cacheHit && !errorText),
        startedAtUtc: normalizeTimestamp(start),
        finishedAtUtc: normalizeTimestamp(finish),
        durationMs: Math.max(0, Math.round(finish - start)),
        resultCount: items.length,
        items,
        aggregateEvidence,
        error: errorText,
        note: redactSensitiveLogText(note, 500),
    };
}

export function appendSearchLogEntry(
    entries,
    entry,
    limit = SEARCH_LOG_LIMIT,
    characterLimit = SEARCH_LOG_CHARACTER_LIMIT,
) {
    const safeEntries = Array.isArray(entries) ? entries : [];
    const parsedLimit = Number.parseInt(limit, 10);
    const safeLimit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(200, parsedLimit)) : SEARCH_LOG_LIMIT;
    const parsedCharacterLimit = Number.parseInt(characterLimit, 10);
    const safeCharacterLimit = Number.isFinite(parsedCharacterLimit)
        ? Math.max(1000, Math.min(2000000, parsedCharacterLimit))
        : SEARCH_LOG_CHARACTER_LIMIT;
    const next = [...safeEntries, entry].slice(-safeLimit);
    let totalCharacters = next.reduce((total, item) => total + JSON.stringify(item).length, 0);
    while (next.length > 1 && totalCharacters > safeCharacterLimit) {
        totalCharacters -= JSON.stringify(next.shift()).length;
    }
    return next;
}

function statusLabel(status) {
    if (status === 'error') return '失败';
    if (status === 'cache') return '缓存复用';
    return '成功';
}

export function formatSearchLogEntries(entries) {
    const safeEntries = Array.isArray(entries) ? entries : [];
    if (!safeEntries.length) return '暂无搜索日志。';
    return safeEntries.map((entry, entryIndex) => {
        const lines = [
            `#${entryIndex + 1} [${statusLabel(entry.status)}] ${entry.query || '(无关键词)'}`,
            `时间: ${entry.finishedAtUtc}`,
            `来源: ${entry.backendLabel || entry.backend || '未知'} | 场景: ${entry.context === 'test' ? '连接测试' : '研究'} | 耗时: ${entry.durationMs} ms`,
        ];
        if (entry.note) lines.push(`说明: ${entry.note}`);
        if (entry.error) lines.push(`错误: ${entry.error}`);
        for (const [itemIndex, item] of (entry.items || []).entries()) {
            lines.push(`结果 ${itemIndex + 1}: ${item.title || '(无标题)'}`);
            if (item.url) lines.push(`URL: ${item.url}`);
            if (item.published) lines.push(`日期: ${item.published}`);
            if (item.snippet) lines.push(`摘要: ${item.snippet}`);
        }
        const aggregate = entry.aggregateEvidence;
        if (aggregate?.text) {
            lines.push(`聚合摘要${aggregate.provider ? ` (${aggregate.provider}${aggregate.engine ? ` / ${aggregate.engine}` : ''})` : ''}: ${aggregate.text}`);
        }
        for (const link of aggregate?.candidateLinks || []) lines.push(`候选 URL: ${link}`);
        return lines.join('\n');
    }).join('\n\n');
}
