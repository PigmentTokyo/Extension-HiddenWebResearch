const TEMPORAL_SIGNAL_PATTERN = /(?:\b(?:latest|current|currently|recent|recently|today|tonight|tomorrow|yesterday|now|this\s+(?:week|month|year)|(?:next|last)\s+(?:week|month|year)|as\s+of|real[- ]?time)\b|最新|当前|目前|现在|今日|今天|今晚|明日|明天|后天|後天|昨日|昨天|截至|实时|最近|近期|本(?:周|週|月|年|季度)|(?:上|下)(?:周|週|星期|月|季度|季|年)|明年|去年|前年|来年|今(?:日|週|月|年)|何月何日|几月几(?:日|号)|几号|星期几|周几|几点)/iu;
const DAY_AFTER_TOMORROW_PATTERN = /(?:\bday\s+after\s+tomorrow\b|后天|後天)/iu;
const TOMORROW_PATTERN = /(?:\btomorrow\b|明日|明天)/iu;
const YESTERDAY_PATTERN = /(?:\byesterday\b|昨日|昨天)/iu;
const CURRENT_DAY_PATTERN = /(?:\b(?:today|tonight|now)\b|今日|今天|今晚|现在|當前|当前)/iu;
const PURE_LANGUAGE_META_PATTERN = /^(?:(?:请|please)\s*)?(?:(?:把|将)\s*)?(?:(?:today|tomorrow|yesterday|今天|今日|明天|昨日|昨天)\s*(?:翻译|译成|是什么意思|的?意思|的?含义)|(?:translate|define)\s+(?:the\s+word\s+)?(?:today|tomorrow|yesterday))(?:\s*(?:成|为|into)?\s*(?:中文|英文|chinese|english))?$/iu;
const LOCAL_NON_FACTUAL_PATTERN = /^(?:(?:今天|今日|现在|当前|today|now)[,， ]*)?(?:请|please\s+)?(?:帮我|替我|给我|help\s+me\s+)?(?:写|创作|续写|翻译|总结|解释|扮演|修改|润色|计算|聊天|讲故事|write|create|continue|translate|summari[sz]e|explain|roleplay|edit|calculate|chat|tell\s+a\s+story)/iu;
const STRICT_LOCAL_TASK_PATTERN = /(?:写|创作|续写|翻译|扮演|修改|润色|计算|聊天|讲故事|write|create|continue|translate|roleplay|edit|calculate|chat|tell\s+a\s+story)/iu;
const NO_SEARCH_DECORATION_PATTERN = /(?:(?:不要|不用|无需|请勿|别)(?:再)?(?:使用|进行)?(?:(?:联网|网络|网页)(?:搜索|检索|查询)?|(?:搜索|检索|查询))|(?:do\s+not|don't|without)\s+(?:use\s+)?(?:(?:(?:the\s+)?(?:web|internet)\s+)?(?:search|browse|browsing)|(?:the\s+)?(?:web|internet)))/giu;
const ONLY_PROVIDED_CONTEXT_PATTERN = /(?:(?:只|仅)(?:依据|根据|按照|使用|用|凭)(?:我)?(?:提供的)?(?:上文|前文|聊天内容|已有内容|上下文|资料|文本|以下内容|下面内容)|(?:只|仅)用(?:以下|下面|这些)?(?:内容|资料|文本)|\b(?:only\s+(?:use|using)|based\s+only\s+on)\s+(?:the\s+)?(?:provided|above|existing|following)\s+(?:context|text|conversation|material)\b)/iu;
const FICTIONAL_TIME_CONTEXT_PATTERN = /(?:(?:故事|剧情|小说|设定|世界观|梦(?:境|中)?|角色(?:扮演|问)?).{0,32}(?:今天|今日|现在|当前|时间|日期|星期几|周几|几点)|(?:今天|今日|现在|当前|时间|日期|星期几|周几|几点).{0,32}(?:故事|剧情|小说|设定|世界观|梦(?:境|中)?|角色(?:扮演|问)?)|(?:story|plot|fiction|roleplay|setting|dream).{0,48}\b(?:today|now|current|time|date|day)\b|\b(?:today|now|current|time|date|day)\b.{0,48}(?:story|plot|fiction|roleplay|setting|dream))/iu;
const ENGLISH_CLOCK_ENTITY_PATTERN = /\b(?:release|launch|concert|movie|show|event|task|version|episode|deadline|schedule|appointment|meeting|flight|train|game|dinner|breakfast|lunch|sunset|sunrise|christmas|easter|bed|prayer|school|store|bank|runtime|response|latency|processing|execution|duration|performance|algorithm|quicksort|mergesort|model)\b/iu;
const ENGLISH_REMOTE_CLOCK_PATTERNS = [
    /^what(?:'s|\s+is)\s+(?:today'?s\s+)?(?:the\s+)?(?:time|date|day)\s+(?:in|at)\s+\S.+$/iu,
    /^today'?s?\s+(?:time|date|day)\s+(?:in|at)\s+\S.+$/iu,
    /^what\s+(?:time|date|day)\s+is\s+it(?:\s+(?:today|now|right\s+now))?\s+(?:in|at)\s+\S.+$/iu,
    /^(?:what(?:'s|\s+(?:is|are))\s+)?(?:the\s+)?(?:current|local)\s+(?:time|times|date|day)\s+(?:in|at|for)\s+\S.+$/iu,
    /^(?:time|times)\s+(?:in|at|for)\s+\S.+$/iu,
    /^(?:time|date|day)\s+(?:now|today)\s+(?:in|at)\s+\S.+$/iu,
    /^(?:current|local)\s+(?:time|date|day)\s+(?:in\s+)?\S.+$/iu,
    /^(?:the\s+)?(?:time|date|day)\s+(?:in|at)\s+\S.+\s+(?:today|now)$/iu,
    /^(?:what\s+(?:are|is)\s+)?(?:the\s+)?local\s+times?\s+for\s+\S.+$/iu,
    /^[\p{L}\p{M}][\p{L}\p{M} .,'’'-]{1,60}\s+(?:(?:current|local)\s+(?:time|date|day)|(?:time|date|day)\s+(?:now|today))$/iu,
];
const CLOCK_COMPARISON_PATTERN = /(?:\b(?:time\s+difference|compare\s+(?:the\s+)?(?:local\s+)?clocks?|local\s+times?\s+for)\b|时差|时间差|(?:快|慢)\s*几\s*小时|(?:比较|对比).{0,32}(?:时间|时钟))/iu;
const CLOCK_COMPARISON_NON_ZONE_PATTERN = /(?:\b(?:runtime|response|latency|processing|execution|duration|performance|algorithm|quicksort|mergesort|model)\b|模型|算法|运行|执行|响应|延迟|耗时|性能)/iu;
const ENGLISH_PROPER_LOCATION_CLOCK_PATTERN = /^(?:(?:\p{Lu}[\p{L}\p{M}.'’-]*\s+){1,4}time|[Ww]hat\s+(?:time|date|day)\s+is\s+(?:\p{Lu}[\p{L}\p{M}.'’-]*)(?:\s+\p{Lu}[\p{L}\p{M}.'’-]*){0,3})$/u;
const LOCAL_CLOCK_SHORT_PATTERN = /^(?:现在|当前|今天|今日)?(?:是|的)?(?:几点|时间|日期|几月几日|几月几号|几号|多少号|星期几|周几)(?:是多少|是什么|吗)?[?？]?$/u;
const CHINESE_NON_CLOCK_ENTITY_PATTERN = /(?:版本|任务|模型|电影|演出|发布|发售|航班|列车|比赛|预约|会议|编号|序号|晚饭|早餐|午餐|日落|日出|考试|商店|银行|学校|祈祷|算法|运行|执行|响应|延迟|耗时|性能)/u;
const CHINESE_REMOTE_CLOCK_PATTERN = /^(?:(?:请|帮我|查询|查看|告诉我)\s*)?(?:(?:(?:现在|当前|今天|今日)(?:在)?\s*[\p{L}·]{1,24})|(?:在\s*[\p{L}·]{1,24})|(?:[\p{L}·]{1,24}(?:的)?(?:当地|现在|当前|今天|今日)))(?:是|的)?(?:几点|时间|日期|几月几日|几月几号|几号|多少号|星期几|周几)(?:是多少|是什么|吗)?[?？]?$/u;
const CHINESE_BARE_LOCATION_CLOCK_PATTERN = /^(?:(?:东京|東京|纽约|紐約|伦敦|倫敦|巴黎|北京|上海|香港|台北|首尔|首爾|新加坡|洛杉矶|洛杉磯|旧金山|舊金山|柏林|悉尼|雪梨|莫斯科|迪拜|孟买|孟買|德里|曼谷|罗马|羅馬|马德里|馬德里|多伦多|多倫多|温哥华|溫哥華|芝加哥|波士顿|波士頓|西雅图|西雅圖|华盛顿|華盛頓)|[\p{L}]{1,12}(?:市|县|縣|省|州|国|國|地区|地區))(?:的|是)?(?:几点|时间|日期|几月几日|几月几号|几号|多少号|星期几|周几)(?:是多少|是什么|吗)?$/u;
const LOCATION_RELATIVE_QUERY_PATTERN = /(?:(?:\b(?:weather|forecast|temperature|rain|snow|air\s+quality)\b.*\b(?:today|tonight|tomorrow|yesterday|now|current|this\s+(?:week|month|year)|(?:next|last)\s+(?:week|month|year))\b|\b(?:today|tonight|tomorrow|yesterday|now|current|this\s+(?:week|month|year)|(?:next|last)\s+(?:week|month|year))\b.*\b(?:weather|forecast|temperature|rain|snow|air\s+quality)\b)|(?:天气|预报|气温|降雨|降雪|空气质量).{0,40}(?:今天|今日|今晚|明天|明日|后天|昨日|昨天|现在|当前|本周|本週|本月|下周|下週|下月|上周|上週|上月)|(?:今天|今日|今晚|明天|明日|后天|昨日|昨天|现在|当前|本周|本週|本月|下周|下週|下月|上周|上週|上月).{0,40}(?:天气|预报|气温|降雨|降雪|空气质量))/iu;
const HISTORICAL_QUERY_PATTERN = /(?:\b(?:compare|comparison|versus|vs\.?|previous|prior|former|history|historical|baseline|archive)\b|对比|比较|相比|上一版|前一版|历史|基线|归档|此前|之前)/iu;
const HISTORICAL_CUTOFF_PATTERN = /(?:\b(?:as\s+of|through|up\s+to)\s+(?:19|20)\d{2}\b|截至\s*(?:19|20)\d{2}\s*年?|(?:19|20)\d{2}\s*年\s*(?:当时|以前|之前))/iu;
const DATE_RANGE_CONTEXT_PATTERN = /(?:\b(?:from|since|after|before|to|through|until|between|as\s+of|date)\s*:?\s*(?:19|20)\d{2}(?:[-/.]\d{1,2}[-/.]\d{1,2})?|(?:自|从|截至|之后|以前|之前|至|到|之间)\s*(?:19|20)\d{2}(?:\s*年|\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2}))/iu;

function normalizeText(value) {
    return String(value || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function isRemoteClockRequest(value) {
    const normalized = normalizeText(value);
    const clockText = normalized.replace(/[?？!！。]+$/gu, '').trim();
    if (!clockText || LOCAL_CLOCK_SHORT_PATTERN.test(clockText)) return false;
    const queryText = clockText.replace(
        /^(?:(?:can|could|would)\s+you\s+(?:please\s+)?tell\s+me|(?:please\s+)?tell\s+me)\s+/iu,
        '',
    );
    if (CLOCK_COMPARISON_PATTERN.test(clockText)) {
        return !CLOCK_COMPARISON_NON_ZONE_PATTERN.test(clockText);
    }
    if (ENGLISH_CLOCK_ENTITY_PATTERN.test(clockText) || CHINESE_NON_CLOCK_ENTITY_PATTERN.test(clockText)) {
        return false;
    }
    if (CHINESE_REMOTE_CLOCK_PATTERN.test(clockText)) return true;
    return CHINESE_BARE_LOCATION_CLOCK_PATTERN.test(clockText)
        || ENGLISH_PROPER_LOCATION_CLOCK_PATTERN.test(queryText)
        || ENGLISH_REMOTE_CLOCK_PATTERNS.some(pattern => pattern.test(queryText));
}

export function isLiveClockTopic(value) {
    const normalized = normalizeText(value);
    return isRemoteClockRequest(normalized)
        || /(?:\b(?:time|times|clock|clocks)\b|时差|时间差|几点|几\s*小时)/iu.test(normalized);
}

export function isLocationRelativeRequest(value) {
    return LOCATION_RELATIVE_QUERY_PATTERN.test(normalizeText(value));
}

function escapeXml(value) {
    return String(value || '')
        .replace(/&/gu, '&amp;')
        .replace(/</gu, '&lt;')
        .replace(/>/gu, '&gt;')
        .replace(/"/gu, '&quot;');
}

function resolveTimeZone(requestedTimeZone) {
    const requested = normalizeText(requestedTimeZone);
    const localTimeZone = normalizeText(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const candidate = requested || localTimeZone || 'UTC';
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date(0));
        return candidate;
    } catch {
        return 'UTC';
    }
}

function formatUtcOffset(minutes) {
    const sign = minutes < 0 ? '-' : '+';
    const absolute = Math.abs(minutes);
    const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
    const remainingMinutes = String(absolute % 60).padStart(2, '0');
    return `${sign}${hours}:${remainingMinutes}`;
}

function shiftIsoDate(localDate, days) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(localDate || ''));
    if (!match) return String(localDate || '');
    const shifted = new Date(Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]) + days,
    ));
    return shifted.toISOString().slice(0, 10);
}

function getRelativeDayOffsets(value) {
    const text = normalizeText(value);
    const offsets = [];
    if (DAY_AFTER_TOMORROW_PATTERN.test(text)) offsets.push(2);
    const withoutDayAfterTomorrow = text.replace(
        /(?:\bday\s+after\s+tomorrow\b|后天|後天)/giu,
        ' ',
    );
    if (TOMORROW_PATTERN.test(withoutDayAfterTomorrow)) offsets.push(1);
    if (YESTERDAY_PATTERN.test(text)) offsets.push(-1);
    if (CURRENT_DAY_PATTERN.test(text)) offsets.push(0);
    return [...new Set(offsets)];
}

function hasResolvedDate(value, localDate) {
    const [year, month, day] = String(localDate || '').split('-');
    if (!year || !month || !day) return false;
    const numericMonth = String(Number(month));
    const numericDay = String(Number(day));
    const monthToken = `(?:0${numericMonth}|${numericMonth})`;
    const dayToken = `(?:0${numericDay}|${numericDay})`;
    const pattern = new RegExp(
        `(?:${year}\\s*[-/.]\\s*${monthToken}\\s*[-/.]\\s*${dayToken}|${year}\\s*年\\s*${numericMonth}\\s*月\\s*${numericDay}\\s*日)`,
        'iu',
    );
    return pattern.test(String(value || ''));
}

function normalizeCompleteDateToken(value) {
    const text = normalizeText(value);
    const match = /^((?:19|20)\d{2})\s*(?:[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})|年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?)$/u.exec(text);
    if (!match) return '';
    const year = Number(match[1]);
    const month = Number(match[2] || match[4]);
    const day = Number(match[3] || match[5]);
    const instant = new Date(Date.UTC(year, month - 1, day));
    if (
        instant.getUTCFullYear() !== year
        || instant.getUTCMonth() !== month - 1
        || instant.getUTCDate() !== day
    ) return '';
    return instant.toISOString().slice(0, 10);
}

function extractIndependentCompleteDates(value) {
    const text = String(value || '');
    const westernDates = [...text.matchAll(
        /(^|[^\p{L}\p{N}_-])((?:19|20)\d{2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2})(?=$|[^\p{L}\p{N}_-])/gu,
    )].map(match => match[2]);
    const chineseDates = [...text.matchAll(
        /((?:19|20)\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日?)/gu,
    )].map(match => match[1]);
    return [...new Set(
        [...westernDates, ...chineseDates]
            .map(normalizeCompleteDateToken)
            .filter(Boolean),
    )];
}

function truncateWithSuffix(value, suffix, maxLength) {
    const normalizedSuffix = normalizeText(suffix);
    const normalizedValue = normalizeText(value);
    if (!normalizedSuffix) return normalizedValue.slice(0, maxLength).trim();
    const available = Math.max(1, maxLength - normalizedSuffix.length - 1);
    return `${normalizedValue.slice(0, available).trim()} ${normalizedSuffix}`.trim();
}

/**
 * Captures one internally consistent browser-runtime clock snapshot.
 *
 * @param {{now?: Date|string|number, timeZone?: string}} options Clock options.
 * @returns {{capturedAtUtc: string, localDate: string, localTime: string, localDateTime: string, timeZone: string, utcOffset: string, weekday: string, cachePartition: string}}
 */
export function captureRuntimeClock({ now = new Date(), timeZone = '' } = {}) {
    const instant = now instanceof Date ? new Date(now.getTime()) : new Date(now);
    if (!Number.isFinite(instant.getTime())) {
        throw new TypeError('Invalid runtime clock instant');
    }

    const resolvedTimeZone = resolveTimeZone(timeZone);
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: resolvedTimeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'long',
        hourCycle: 'h23',
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(instant)
            .filter(part => part.type !== 'literal')
            .map(part => [part.type, part.value]),
    );
    const localDate = `${parts.year}-${parts.month}-${parts.day}`;
    const localTime = `${parts.hour}:${parts.minute}:${parts.second}`;
    const localAsUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
    );
    const instantAtSecondPrecision = Math.trunc(instant.getTime() / 1000) * 1000;
    const utcOffsetMinutes = Math.round((localAsUtc - instantAtSecondPrecision) / 60000);
    const utcOffset = formatUtcOffset(utcOffsetMinutes);

    return Object.freeze({
        capturedAtUtc: instant.toISOString(),
        localDate,
        localTime,
        localDateTime: `${localDate}T${localTime}${utcOffset}`,
        timeZone: resolvedTimeZone,
        utcOffset,
        weekday: parts.weekday || '',
        cachePartition: `${localDate}|${resolvedTimeZone}|${utcOffset}`,
    });
}

/**
 * Classifies whether a request needs a runtime date anchor.
 *
 * @param {unknown} value User request.
 * @returns {'none'|'relative'|'clock_only'}
 */
export function classifyTemporalRequest(value) {
    const original = normalizeText(value);
    if (!original) return 'none';
    if (
        ONLY_PROVIDED_CONTEXT_PATTERN.test(original)
        || FICTIONAL_TIME_CONTEXT_PATTERN.test(original)
    ) return 'none';

    const withoutOptOut = normalizeText(original.replace(NO_SEARCH_DECORATION_PATTERN, ' '));
    const compact = withoutOptOut
        .replace(/[，,。.!！?？:：;；"'“”‘’]/gu, '')
        .replace(/\s+/gu, '');
    const chineseClockCandidate = compact.replace(
        /^(?:(?:请问|请告诉我|告诉我|麻烦告诉我|帮我查一下|帮我看看|查询一下)|(?:(?:你|您)(?:能不能|能否|能|可以|可不可以)?(?:请)?(?:告诉我|告知我|说一下)))/u,
        '',
    );
    const chineseClockOnly = /^(?:(?:现在|当前|今天|今日)?(?:的)?(?:(?:日期|时间)(?:(?:和|及|、)(?:日期|时间))?(?:是|为)?(?:多少|什么|几号|多少号|几日)?|(?:是|的)?(?:几月几日|几月几号|几号|多少号|几日|什么日期|星期几|周几|几点|几点钟|什么时间|时间是多少)(?:(?:和|及|、)?(?:星期几|周几|几点|几点钟|日期|时间))?))(?:了|呢|吗|呀|啊)?$/u;
    const english = withoutOptOut.toLowerCase().replace(/[?.!,]/gu, '').trim();
    const englishClockCandidate = english.replace(
        /^(?:(?:can|could|would)\s+you\s+(?:please\s+)?tell\s+me|please\s+tell\s+me)\s+/u,
        '',
    );
    const englishClockOnly = [
        /^(?:please\s+)?(?:tell\s+me\s+)?(?:what(?:'s|\s+is)\s+)?(?:the\s+)?(?:current\s+)?(?:date|time|day\s+of\s+the\s+week)(?:\s+(?:today|now))?$/u,
        /^what\s+(?:date|day|time)\s+is\s+it(?:\s+(?:today|now))?$/u,
        /^what(?:'s|\s+is)\s+today'?s\s+(?:date|day)$/u,
        /^what\s+today'?s\s+(?:date|day|time)\s+is$/u,
        /^what\s+the\s+current\s+(?:date|time)\s+is$/u,
        /^(?:today'?s|current)\s+(?:date|time)$/u,
        /^what\s+(?:is|are)\s+(?:the\s+)?(?:current\s+)?(?:(?:date|day)\s+and\s+(?:the\s+)?(?:current\s+)?time|time\s+and\s+(?:the\s+)?(?:current\s+)?(?:date|day))(?:\s+(?:today|now))?$/u,
        /^(?:tell\s+me\s+)?(?:the\s+)?(?:current\s+)?(?:(?:date|day)\s+and\s+(?:the\s+)?(?:current\s+)?time|time\s+and\s+(?:the\s+)?(?:current\s+)?(?:date|day))(?:\s+(?:today|now))?$/u,
        /^what\s+(?:date|day)\s+and\s+time\s+is\s+it(?:\s+(?:today|now))?$/u,
        /^(?:please\s+)?(?:show|give)\s+(?:me\s+)?(?:the\s+)?(?:current\s+)?(?:date|time|day\s+of\s+the\s+week)(?:\s+(?:today|now))?$/u,
        /^what(?:'s|\s+is)\s+today'?s\s+(?:(?:date|day)\s+and\s+time|time\s+and\s+(?:date|day))$/u,
    ];
    if (
        chineseClockOnly.test(chineseClockCandidate)
        || englishClockOnly.some(pattern => pattern.test(englishClockCandidate))
    ) {
        return 'clock_only';
    }
    if (isRemoteClockRequest(original)) return 'relative';
    if (PURE_LANGUAGE_META_PATTERN.test(original)) return 'none';

    const localTaskMatch = LOCAL_NON_FACTUAL_PATTERN.exec(original);
    if (localTaskMatch) {
        if (STRICT_LOCAL_TASK_PATTERN.test(localTaskMatch[0])) return 'none';
        const remaining = original.slice(localTaskMatch[0].length);
        if (!TEMPORAL_SIGNAL_PATTERN.test(remaining)) return 'none';
    }
    return TEMPORAL_SIGNAL_PATTERN.test(original) ? 'relative' : 'none';
}

/**
 * Formats trusted request metadata separately from untrusted web evidence.
 *
 * @param {ReturnType<typeof captureRuntimeClock>} clock Runtime clock.
 * @returns {string}
 */
export function formatTrustedRuntimeClock(clock) {
    if (!clock?.capturedAtUtc || !clock?.localDate || !clock?.timeZone) {
        throw new TypeError('A valid runtime clock is required');
    }
    return `<trusted_runtime_clock source="browser_runtime">
<captured_at_utc>${escapeXml(clock.capturedAtUtc)}</captured_at_utc>
<local_date>${escapeXml(clock.localDate)}</local_date>
<local_time>${escapeXml(clock.localTime)}</local_time>
<local_datetime>${escapeXml(clock.localDateTime)}</local_datetime>
<timezone>${escapeXml(clock.timeZone)}</timezone>
<utc_offset>${escapeXml(clock.utcOffset)}</utc_offset>
<weekday>${escapeXml(clock.weekday)}</weekday>
</trusted_runtime_clock>`;
}

/**
 * Adds a stable calendar-date anchor only to time-sensitive search queries.
 * Full time-of-day is intentionally excluded to preserve search relevance and cache reuse.
 *
 * @param {unknown} query Planner query.
 * @param {{userText?: unknown, temporalKind?: 'none'|'relative'|'clock_only', clock: ReturnType<typeof captureRuntimeClock>, maxLength?: number}} options Query options.
 * @returns {{logicalQuery: string, executedQuery: string, anchored: boolean, targetDate: string}}
 */
export function prepareAnchoredSearchQuery(query, {
    userText = '',
    temporalKind = 'none',
    clock,
    maxLength = 240,
} = {}) {
    const baseQuery = normalizeText(query);
    const boundedLength = Math.max(80, Math.min(500, Number(maxLength) || 240));
    if (!baseQuery) {
        return { logicalQuery: '', executedQuery: '', anchored: false, targetDate: '' };
    }
    if (!clock?.localDate || !clock?.timeZone) {
        throw new TypeError('A valid runtime clock is required');
    }

    const queryKind = classifyTemporalRequest(baseQuery);
    const normalizedUserText = normalizeText(userText);
    const queryRelativeDayOffsets = getRelativeDayOffsets(baseQuery);
    const userRelativeDayOffsets = getRelativeDayOffsets(normalizedUserText);
    const userDates = new Set(extractIndependentCompleteDates(normalizedUserText));
    const plannerAddedDates = extractIndependentCompleteDates(baseQuery)
        .filter(date => !userDates.has(date));
    const userExpectedDates = userRelativeDayOffsets.length
        ? userRelativeDayOffsets.map(offset => shiftIsoDate(clock.localDate, offset))
        : [clock.localDate];
    const locationSensitiveRequest = isLocationRelativeRequest(baseQuery)
        || isLocationRelativeRequest(normalizedUserText);
    const plannerDateConflict = temporalKind === 'relative'
        && plannerAddedDates.length > 0
        && !DATE_RANGE_CONTEXT_PATTERN.test(baseQuery)
        && !HISTORICAL_QUERY_PATTERN.test(baseQuery)
        && !HISTORICAL_QUERY_PATTERN.test(normalizedUserText)
        && (
            locationSensitiveRequest
            || plannerAddedDates.some(date => !userExpectedDates.includes(date))
        );
    const isOriginalFallback = baseQuery === normalizedUserText
        && (temporalKind === 'clock_only' || temporalKind === 'relative');
    const inheritsTemporalDate = temporalKind === 'relative' && plannerAddedDates.length > 0;
    const effectiveKind = queryKind !== 'none'
        ? queryKind
        : isOriginalFallback || inheritsTemporalDate ? temporalKind : 'none';
    if (effectiveKind === 'none') {
        const unchanged = baseQuery.slice(0, boundedLength).trim();
        return { logicalQuery: unchanged, executedQuery: unchanged, anchored: false, targetDate: '' };
    }

    const queryOffsetOutsideUserIntent = queryRelativeDayOffsets.length > 0
        && userRelativeDayOffsets.length > 0
        && queryRelativeDayOffsets.some(offset => !userRelativeDayOffsets.includes(offset));
    const querySeed = queryOffsetOutsideUserIntent || plannerDateConflict
        ? normalizedUserText
        : baseQuery;

    if (
        HISTORICAL_CUTOFF_PATTERN.test(querySeed)
        || HISTORICAL_CUTOFF_PATTERN.test(normalizedUserText)
    ) {
        const unchanged = (
            HISTORICAL_CUTOFF_PATTERN.test(querySeed) ? querySeed : normalizedUserText
        ).slice(0, boundedLength).trim();
        return { logicalQuery: unchanged, executedQuery: unchanged, anchored: unchanged !== baseQuery, targetDate: '' };
    }

    if (isRemoteClockRequest(querySeed)) {
        const utcMinute = String(clock.capturedAtUtc || '').slice(0, 16);
        const suffix = utcMinute ? `reference UTC instant ${utcMinute}Z` : '';
        if (/\breference\s+UTC\s+instant\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/iu.test(querySeed)) {
            const unchanged = querySeed.slice(0, boundedLength).trim();
            return {
                logicalQuery: unchanged,
                executedQuery: unchanged,
                anchored: unchanged !== baseQuery,
                targetDate: '',
            };
        }
        const executedQuery = truncateWithSuffix(querySeed, suffix, boundedLength);
        return {
            logicalQuery: querySeed,
            executedQuery,
            anchored: executedQuery !== baseQuery,
            targetDate: '',
        };
    }

    if (locationSensitiveRequest) {
        const logicalQuery = querySeed;
        const utcMinute = String(clock.capturedAtUtc || '').slice(0, 16);
        const suffix = utcMinute ? `reference UTC instant ${utcMinute}Z` : '';
        const executedQuery = truncateWithSuffix(logicalQuery, suffix, boundedLength);
        return {
            logicalQuery,
            executedQuery,
            anchored: executedQuery !== baseQuery,
            targetDate: '',
        };
    }

    const relativeDayOffsets = queryOffsetOutsideUserIntent
        ? userRelativeDayOffsets
        : queryRelativeDayOffsets.length
            ? queryRelativeDayOffsets
            : effectiveKind !== 'none' && userRelativeDayOffsets.length === 1
                ? userRelativeDayOffsets
                : [];
    const targetDates = relativeDayOffsets.length
        ? relativeDayOffsets.map(offset => shiftIsoDate(clock.localDate, offset))
        : [clock.localDate];
    const targetDate = relativeDayOffsets.length === 1 ? targetDates[0] : clock.localDate;
    const logicalQuery = querySeed.slice(0, boundedLength).trim();

    const hasDate = hasResolvedDate(logicalQuery, targetDate);
    const hasTimeZone = logicalQuery.toLowerCase().includes(String(clock.timeZone).toLowerCase());
    if (hasDate && hasTimeZone) {
        const unchanged = logicalQuery.slice(0, boundedLength).trim();
        return {
            logicalQuery: unchanged,
            executedQuery: unchanged,
            anchored: unchanged !== baseQuery,
            targetDate,
        };
    }

    const dateLabel = relativeDayOffsets.length === 1 && relativeDayOffsets[0] !== 0
        ? 'target date'
        : 'reference date';
    const suffix = hasDate
        ? `browser timezone ${clock.timeZone}`
        : `${dateLabel} ${targetDate} browser timezone ${clock.timeZone}`;
    const executedQuery = truncateWithSuffix(logicalQuery, suffix, boundedLength);
    return {
        logicalQuery,
        executedQuery,
        anchored: executedQuery !== baseQuery,
        targetDate,
    };
}
