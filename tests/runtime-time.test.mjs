import assert from 'node:assert/strict';

import {
    captureRuntimeClock,
    classifyTemporalRequest,
    formatTrustedRuntimeClock,
    isLiveClockTopic,
    isRemoteClockRequest,
    prepareAnchoredSearchQuery,
} from '../runtime-time.js';

const tokyoClock = captureRuntimeClock({
    now: new Date('2026-07-29T20:06:14.000Z'),
    timeZone: 'Asia/Tokyo',
});

assert.deepEqual(tokyoClock, {
    capturedAtUtc: '2026-07-29T20:06:14.000Z',
    localDate: '2026-07-30',
    localTime: '05:06:14',
    localDateTime: '2026-07-30T05:06:14+09:00',
    timeZone: 'Asia/Tokyo',
    utcOffset: '+09:00',
    weekday: 'Thursday',
    cachePartition: '2026-07-30|Asia/Tokyo|+09:00',
});

const clockBlock = formatTrustedRuntimeClock(tokyoClock);
assert.match(clockBlock, /<trusted_runtime_clock source="browser_runtime">/u);
assert.match(clockBlock, /<captured_at_utc>2026-07-29T20:06:14\.000Z<\/captured_at_utc>/u);
assert.match(clockBlock, /<local_datetime>2026-07-30T05:06:14\+09:00<\/local_datetime>/u);
assert.match(clockBlock, /<timezone>Asia\/Tokyo<\/timezone>/u);
assert.match(clockBlock, /<weekday>Thursday<\/weekday>/u);

assert.equal(classifyTemporalRequest('今天是几月几号'), 'clock_only');
assert.equal(classifyTemporalRequest('今天的日期是多少'), 'clock_only');
assert.equal(classifyTemporalRequest('你能告诉我今天是几月几号吗'), 'clock_only');
assert.equal(classifyTemporalRequest('不要联网，今天星期几？'), 'clock_only');
assert.equal(classifyTemporalRequest('现在几点了'), 'clock_only');
assert.equal(classifyTemporalRequest('What date is it today?'), 'clock_only');
assert.equal(classifyTemporalRequest("Can you tell me what today's date is?"), 'clock_only');
assert.equal(classifyTemporalRequest('今天多少号'), 'clock_only');
assert.equal(classifyTemporalRequest('今天是几日'), 'clock_only');
assert.equal(classifyTemporalRequest('今日日期为几号'), 'clock_only');
assert.equal(classifyTemporalRequest('今天日期和时间'), 'clock_only');
assert.equal(classifyTemporalRequest('现在的日期和时间是什么'), 'clock_only');
assert.equal(classifyTemporalRequest('What is the date and time?'), 'clock_only');
assert.equal(classifyTemporalRequest('What are the current date and time?'), 'clock_only');
assert.equal(classifyTemporalRequest('Tell me the date and time now'), 'clock_only');
assert.equal(classifyTemporalRequest('What day and time is it?'), 'clock_only');
assert.equal(classifyTemporalRequest('Please show me the current date'), 'clock_only');
assert.equal(classifyTemporalRequest("What's today's date and time?"), 'clock_only');
assert.equal(classifyTemporalRequest('Tokyo weather tomorrow'), 'relative');
assert.equal(classifyTemporalRequest('截至今天 Claude 最新模型是什么'), 'relative');
assert.equal(classifyTemporalRequest('下周东京天气'), 'relative');
assert.equal(classifyTemporalRequest('明年是什么生肖'), 'relative');
assert.equal(classifyTemporalRequest('今天解释最新 AI 新闻'), 'relative');
assert.equal(classifyTemporalRequest('把 today 翻译成中文'), 'none');
assert.equal(classifyTemporalRequest('今天写一个故事'), 'none');
assert.equal(classifyTemporalRequest('在这个故事里，今天是几月几号'), 'none');
assert.equal(classifyTemporalRequest('只依据上文，故事中今天几号'), 'none');
assert.equal(classifyTemporalRequest('只根据我提供的资料，判断今天是几号'), 'none');
assert.equal(classifyTemporalRequest('只用以下内容判断今天几号'), 'none');
assert.equal(classifyTemporalRequest('今天在故事里是几号'), 'none');
assert.equal(classifyTemporalRequest('角色问：今天几号'), 'none');
assert.equal(classifyTemporalRequest('梦中今天是什么日期'), 'none');
assert.equal(classifyTemporalRequest('上文说今天发布了新模型，请联网查证'), 'relative');
assert.equal(classifyTemporalRequest('文中说今天股价上涨，这是真的吗'), 'relative');
assert.equal(classifyTemporalRequest('latest release date for Claude'), 'relative');
assert.equal(classifyTemporalRequest('纽约现在是几月几号'), 'relative');
assert.equal(classifyTemporalRequest('今天东京是几号'), 'relative');
assert.equal(classifyTemporalRequest('site:docs.anthropic.com Messages API tool use'), 'none');

const staleClockQuery = prepareAnchoredSearchQuery('today date Tokyo Japan 2025-07-31', {
    userText: '今天是几月几号',
    temporalKind: 'clock_only',
    clock: tokyoClock,
});
assert.equal(staleClockQuery.logicalQuery, 'today date Tokyo Japan 2025-07-31');
assert.match(staleClockQuery.executedQuery, /reference date 2026-07-30 browser timezone Asia\/Tokyo$/u);
assert.match(staleClockQuery.executedQuery, /2025-07-31/u);

const neighboringTimezoneDate = prepareAnchoredSearchQuery('today date 2026-07-29', {
    userText: '今天是几号',
    temporalKind: 'clock_only',
    clock: tokyoClock,
});
assert.equal(neighboringTimezoneDate.logicalQuery, 'today date 2026-07-29');
assert.match(neighboringTimezoneDate.executedQuery, /2026-07-29/u);
assert.match(neighboringTimezoneDate.executedQuery, /reference date 2026-07-30/u);

const staleBareYear = prepareAnchoredSearchQuery('today date Tokyo Japan 2025', {
    userText: '今天是几月几号',
    temporalKind: 'clock_only',
    clock: tokyoClock,
});
assert.equal(staleBareYear.logicalQuery, 'today date Tokyo Japan 2025');
assert.match(staleBareYear.executedQuery, /reference date 2026-07-30 browser timezone Asia\/Tokyo$/u);
assert.match(staleBareYear.executedQuery, /(?:^|\s)2025(?:$|\s)/u);

const tomorrowWeatherQuery = prepareAnchoredSearchQuery('Tokyo weather tomorrow', {
    userText: '明天天气如何，东京',
    temporalKind: 'relative',
    clock: tokyoClock,
});
assert.match(tomorrowWeatherQuery.executedQuery, /reference UTC instant 2026-07-29T20:06Z$/u);

const historicalQuery = prepareAnchoredSearchQuery('Tokyo weather 2025-07-31', {
    userText: '查询 2025年7月31日东京天气',
    temporalKind: 'relative',
    clock: tokyoClock,
});
assert.equal(historicalQuery.executedQuery, 'Tokyo weather 2025-07-31');
assert.equal(historicalQuery.anchored, false);

const comparisonQuery = prepareAnchoredSearchQuery('compare Claude 2025 and current behavior', {
    userText: '对比 2025 年与现在的 Claude 搜索',
    temporalKind: 'relative',
    clock: tokyoClock,
});
assert.match(comparisonQuery.executedQuery, /2025/u);
assert.match(comparisonQuery.executedQuery, /reference date 2026-07-30 browser timezone Asia\/Tokyo$/u);

const alreadyAnchored = prepareAnchoredSearchQuery(
    'Tokyo weather 2026-07-30 timezone Asia/Tokyo',
    {
        userText: '东京今天天气',
        temporalKind: 'relative',
        clock: tokyoClock,
    },
);
assert.equal(alreadyAnchored.executedQuery, '东京今天天气 reference UTC instant 2026-07-29T20:06Z');

const staticQuery = 'site:docs.anthropic.com Messages API tool use';
assert.deepEqual(
    prepareAnchoredSearchQuery(staticQuery, {
        userText: '查阅 Messages API tool use 文档',
        temporalKind: 'none',
        clock: tokyoClock,
    }),
    {
        logicalQuery: staticQuery,
        executedQuery: staticQuery,
        anchored: false,
        targetDate: '',
    },
);

const longQuery = prepareAnchoredSearchQuery(`latest ${'Claude '.repeat(60)}`, {
    userText: 'Claude 最新能力',
    temporalKind: 'relative',
    clock: tokyoClock,
});
assert.ok(longQuery.executedQuery.length <= 240);
assert.match(longQuery.executedQuery, /reference date 2026-07-30 browser timezone Asia\/Tokyo$/u);

const modelIds = prepareAnchoredSearchQuery(
    'current Anthropic web_search_20250305 claude-3-5-sonnet-20241022 support',
    {
        userText: '目前支持哪些 Claude 搜索工具和模型？',
        temporalKind: 'relative',
        clock: tokyoClock,
    },
);
assert.match(modelIds.logicalQuery, /web_search_20250305/u);
assert.match(modelIds.logicalQuery, /claude-3-5-sonnet-20241022/u);

const yesterdayFacet = prepareAnchoredSearchQuery('Tokyo weather yesterday', {
    userText: 'Compare yesterday and tomorrow weather in Tokyo',
    temporalKind: 'relative',
    clock: tokyoClock,
});
assert.match(yesterdayFacet.executedQuery, /reference UTC instant 2026-07-29T20:06Z$/u);

const tomorrowFacet = prepareAnchoredSearchQuery('Tokyo weather tomorrow', {
    userText: 'Compare yesterday and tomorrow weather in Tokyo',
    temporalKind: 'relative',
    clock: tokyoClock,
});
assert.match(tomorrowFacet.executedQuery, /reference UTC instant 2026-07-29T20:06Z$/u);

const multiDayFacet = prepareAnchoredSearchQuery('compare Tokyo weather yesterday and tomorrow', {
    userText: 'Compare yesterday and tomorrow weather in Tokyo',
    temporalKind: 'relative',
    clock: tokyoClock,
});
assert.match(multiDayFacet.executedQuery, /reference UTC instant 2026-07-29T20:06Z$/u);

const staticFacet = prepareAnchoredSearchQuery('Messages API tool use syntax', {
    userText: 'Give latest Claude models and explain Messages API syntax',
    temporalKind: 'relative',
    clock: tokyoClock,
});
assert.equal(staticFacet.executedQuery, 'Messages API tool use syntax');

const remoteClockQuery = prepareAnchoredSearchQuery('current time in New York', {
    userText: 'What time is it now in New York?',
    temporalKind: 'relative',
    clock: tokyoClock,
});
assert.equal(
    remoteClockQuery.executedQuery,
    'current time in New York reference UTC instant 2026-07-29T20:06Z',
);

for (const remoteQuery of [
    '纽约现在是几月几号',
    '纽约现在星期几',
    '伦敦当前日期',
    '洛杉矶今天几号',
    '今天东京是几号',
]) {
    const prepared = prepareAnchoredSearchQuery(remoteQuery, {
        userText: remoteQuery,
        temporalKind: 'relative',
        clock: tokyoClock,
    });
    assert.equal(prepared.logicalQuery, remoteQuery);
    assert.match(prepared.executedQuery, /reference UTC instant 2026-07-29T20:06Z$/u);
}

for (const remoteQuery of [
    'What is the date in New York?',
    'New York current date',
    'New York time now',
    'Compare clocks between Tokyo and New York right now',
]) {
    const prepared = prepareAnchoredSearchQuery(remoteQuery, {
        userText: remoteQuery,
        temporalKind: 'relative',
        clock: tokyoClock,
    });
    assert.match(prepared.executedQuery, /reference UTC instant 2026-07-29T20:06Z$/u);
}

for (const weatherQuery of [
    'New York weather today',
    '纽约今天天气',
]) {
    const prepared = prepareAnchoredSearchQuery(weatherQuery, {
        userText: weatherQuery,
        temporalKind: 'relative',
        clock: tokyoClock,
    });
    assert.match(prepared.executedQuery, /reference UTC instant 2026-07-29T20:06Z$/u);
    assert.doesNotMatch(prepared.executedQuery, /browser timezone Asia\/Tokyo/u);
}

const remoteWeatherDate = prepareAnchoredSearchQuery(
    'New York weather today 2026-07-29',
    {
        userText: 'New York weather today',
        temporalKind: 'relative',
        clock: tokyoClock,
    },
);
assert.doesNotMatch(remoteWeatherDate.logicalQuery, /2026-07-29/u);
assert.match(remoteWeatherDate.executedQuery, /reference UTC instant 2026-07-29T20:06Z$/u);

const historicalComparison = prepareAnchoredSearchQuery(
    'compare current policy 2026-07-30 with previous version 2024-01-01',
    {
        userText: 'Compare current policy with the previous version',
        temporalKind: 'relative',
        clock: tokyoClock,
    },
);
assert.equal(
    historicalComparison.executedQuery,
    'compare current policy 2026-07-30 with previous version 2024-01-01 browser timezone Asia/Tokyo',
);

const badCurrentFacet = prepareAnchoredSearchQuery('today price 2025-07-31', {
    userText: 'Compare 2025 with today',
    temporalKind: 'relative',
    clock: tokyoClock,
});
assert.match(badCurrentFacet.executedQuery, /2025-07-31/u);
assert.match(badCurrentFacet.executedQuery, /reference date 2026-07-30/u);

for (const productYearQuery of [
    'Windows Server 2025 latest patches today',
    'Office 2024 current support',
    'ISO 27001 2022 current compliance',
    '2025 tax rules current',
]) {
    const prepared = prepareAnchoredSearchQuery(productYearQuery, {
        userText: productYearQuery,
        temporalKind: 'relative',
        clock: tokyoClock,
    });
    const explicitYears = productYearQuery.match(/(?:19|20)\d{2}/gu) || [];
    for (const year of explicitYears) assert.match(prepared.logicalQuery, new RegExp(year, 'u'));
}

const staleVersionDate = prepareAnchoredSearchQuery(
    'latest Claude version 2025-07-31',
    {
        userText: 'latest Claude version',
        temporalKind: 'relative',
        clock: tokyoClock,
    },
);
assert.doesNotMatch(staleVersionDate.executedQuery, /2025-07-31/u);
assert.match(staleVersionDate.executedQuery, /reference date 2026-07-30/u);

const multiOffsetPlannerConflict = prepareAnchoredSearchQuery(
    'Tokyo weather today',
    {
        userText: 'Compare Tokyo weather yesterday and tomorrow',
        temporalKind: 'relative',
        clock: tokyoClock,
    },
);
assert.doesNotMatch(multiOffsetPlannerConflict.logicalQuery, /\btoday\b/iu);
assert.match(multiOffsetPlannerConflict.logicalQuery, /\byesterday\b/iu);
assert.match(multiOffsetPlannerConflict.logicalQuery, /\btomorrow\b/iu);

const conflictingPlannerDay = prepareAnchoredSearchQuery('Tokyo weather tomorrow', {
    userText: 'Tokyo weather yesterday',
    temporalKind: 'relative',
    clock: tokyoClock,
});
assert.doesNotMatch(conflictingPlannerDay.logicalQuery, /tomorrow/u);
assert.match(conflictingPlannerDay.executedQuery, /yesterday reference UTC instant 2026-07-29T20:06Z/u);

const releaseDateQuery = prepareAnchoredSearchQuery('latest release date for Claude', {
    userText: 'What is the latest release date for Claude?',
    temporalKind: 'relative',
    clock: tokyoClock,
});
assert.match(releaseDateQuery.executedQuery, /reference date 2026-07-30/u);

const mixedRemoteRequestFacet = prepareAnchoredSearchQuery('latest Claude news', {
    userText: '纽约现在几点，以及最新 Claude 新闻',
    temporalKind: 'relative',
    clock: tokyoClock,
});
assert.match(mixedRemoteRequestFacet.executedQuery, /reference date 2026-07-30/u);

const unpaddedDate = prepareAnchoredSearchQuery(
    'Tokyo weather today 2026-7-30 browser timezone Asia/Tokyo',
    {
        userText: '东京今天天气',
        temporalKind: 'relative',
        clock: tokyoClock,
    },
);
assert.doesNotMatch(unpaddedDate.logicalQuery, /2026-7-30/u);
assert.match(unpaddedDate.executedQuery, /reference UTC instant 2026-07-29T20:06Z$/u);

const yearBoundaryClock = captureRuntimeClock({
    now: new Date('2026-12-31T03:00:00.000Z'),
    timeZone: 'Asia/Tokyo',
});
const yearBoundaryQuery = prepareAnchoredSearchQuery('Tokyo weather tomorrow', {
    userText: '东京明天天气',
    temporalKind: 'relative',
    clock: yearBoundaryClock,
});
assert.match(yearBoundaryQuery.executedQuery, /reference UTC instant 2026-12-31T03:00Z/u);

const utcFallback = captureRuntimeClock({
    now: new Date('2026-07-30T01:02:03.000Z'),
    timeZone: 'Invalid/Timezone',
});
assert.equal(utcFallback.timeZone, 'UTC');
assert.equal(utcFallback.localDateTime, '2026-07-30T01:02:03+00:00');
assert.throws(
    () => captureRuntimeClock({ now: new Date('invalid'), timeZone: 'UTC' }),
    /Invalid runtime clock instant/u,
);

const beforeDst = captureRuntimeClock({
    now: new Date('2026-03-08T06:59:59.000Z'),
    timeZone: 'America/New_York',
});
const afterDst = captureRuntimeClock({
    now: new Date('2026-03-08T07:00:00.000Z'),
    timeZone: 'America/New_York',
});
assert.equal(beforeDst.localDateTime, '2026-03-08T01:59:59-05:00');
assert.equal(afterDst.localDateTime, '2026-03-08T03:00:00-04:00');
assert.equal(beforeDst.utcOffset, '-05:00');
assert.equal(afterDst.utcOffset, '-04:00');

for (const remoteClockText of [
    'What is the date in New York?',
    'What time is it in New York?',
    'new york current date',
    'new york time now',
    'los angeles local time',
    'Tokyo local time',
    'Tokyo time',
    'New York time',
    'What time is Tokyo?',
    'What date is New York?',
    'What day is London?',
    'What are the local times for Tokyo and New York?',
    'Compare local clocks between Tokyo and New York',
    '东京现在几点',
    '伦敦当地时间',
    '东京时间',
    '东京时间是多少',
    '东京是几点',
    '伦敦几点',
    '东京和纽约时差',
    '比较东京和纽约的时间',
    '伦敦比东京慢几小时',
    "What is today's date in New York?",
    "What's today's date in New York?",
    'What day is it today in New York?',
    "Can you tell me today's date in New York?",
    'Tell me the current date in New York',
    'What time is it right now in New York?',
    'Could you tell me the current time in New York?',
    'New York date today',
]) {
    assert.equal(isRemoteClockRequest(remoteClockText), true, remoteClockText);
    assert.equal(classifyTemporalRequest(remoteClockText), 'relative', remoteClockText);
}

for (const nonRemoteClockText of [
    'latest release date for Claude in Japan',
    'What is the release date in New York?',
    'Find the concert date in London',
    'What time is the movie at AMC?',
    'launch date in China',
    '今天Claude是几号版本',
    '今天第几号任务',
    '现在几点',
    'What time is dinner?',
    'What date is Christmas?',
    'sunset time',
    '晚饭几点',
    '早餐几点',
    '日落时间',
    '考试几点',
    '商店几点',
    '银行几点',
    '学校几点',
    '祈祷时间',
    'time difference between quicksort and mergesort',
    '比较两个模型的响应时间',
    '对比算法运行时间',
]) {
    assert.equal(isRemoteClockRequest(nonRemoteClockText), false, nonRemoteClockText);
}

for (const liveClockText of [
    'tell me the time there now',
    'compare clocks',
    '东京和纽约时差',
]) {
    assert.equal(isLiveClockTopic(liveClockText), true, liveClockText);
}

for (const comparisonClockText of [
    'What is the time difference between Tokyo and London for my flight?',
    'Compare local clocks for a meeting in Tokyo and New York',
    '东京和纽约时差，方便安排航班',
]) {
    assert.equal(isRemoteClockRequest(comparisonClockText), true, comparisonClockText);
    assert.equal(classifyTemporalRequest(comparisonClockText), 'relative', comparisonClockText);
}

for (const historicalCutoffText of [
    '截至 2025 年 Claude 有哪些模型',
    'as of 2025 what Claude models existed',
    '2025 年当时最新 Claude 模型',
]) {
    const prepared = prepareAnchoredSearchQuery(historicalCutoffText, {
        userText: historicalCutoffText,
        temporalKind: 'relative',
        clock: tokyoClock,
    });
    assert.equal(prepared.executedQuery, historicalCutoffText);
    assert.doesNotMatch(prepared.executedQuery, /2026-07-30/u);
}

const remoteWeatherConflict = prepareAnchoredSearchQuery(
    'New York weather tomorrow',
    {
        userText: 'New York weather yesterday',
        temporalKind: 'relative',
        clock: tokyoClock,
    },
);
assert.match(remoteWeatherConflict.logicalQuery, /yesterday/u);
assert.doesNotMatch(remoteWeatherConflict.logicalQuery, /tomorrow/u);

const remoteWeatherSetConflict = prepareAnchoredSearchQuery(
    'compare New York weather today and tomorrow',
    {
        userText: 'Compare New York weather yesterday and tomorrow',
        temporalKind: 'relative',
        clock: tokyoClock,
    },
);
assert.match(remoteWeatherSetConflict.logicalQuery, /yesterday/u);
assert.match(remoteWeatherSetConflict.logicalQuery, /tomorrow/u);
assert.doesNotMatch(remoteWeatherSetConflict.logicalQuery, /\btoday\b/u);

for (const remoteClockText of [
    'time now in Tokyo',
    'date today in New York',
    'Today date in Tokyo',
    'Current time Tokyo',
    'Tell me the date in Tokyo today',
]) {
    assert.equal(isRemoteClockRequest(remoteClockText), true, remoteClockText);
    const prepared = prepareAnchoredSearchQuery(remoteClockText, {
        userText: remoteClockText,
        temporalKind: 'relative',
        clock: tokyoClock,
    });
    assert.match(prepared.executedQuery, /reference UTC instant 2026-07-29T20:06Z$/u);
    assert.doesNotMatch(prepared.executedQuery, /browser timezone/u);
}

for (const weatherPeriodText of [
    'New York weather this week',
    'New York weather next week',
    'New York weather last week',
    '下周纽约天气',
    '纽约本周天气',
    'London forecast this month',
]) {
    const prepared = prepareAnchoredSearchQuery(weatherPeriodText, {
        userText: weatherPeriodText,
        temporalKind: 'relative',
        clock: tokyoClock,
    });
    assert.match(prepared.executedQuery, /reference UTC instant 2026-07-29T20:06Z$/u);
    assert.doesNotMatch(prepared.executedQuery, /browser timezone/u);
}

const rewrittenHistoricalCutoff = prepareAnchoredSearchQuery(
    'latest Claude models',
    {
        userText: 'as of 2025 what Claude models existed',
        temporalKind: 'relative',
        clock: tokyoClock,
    },
);
assert.equal(rewrittenHistoricalCutoff.executedQuery, 'as of 2025 what Claude models existed');
assert.doesNotMatch(rewrittenHistoricalCutoff.executedQuery, /2026-07-30/u);

for (const [candidateQuery, originalRequest] of [
    ['Tokyo weather 2025-07-31', 'Tokyo weather today'],
    ['New York weather 2025-07-31', 'New York weather today'],
    ['Claude news 2025-07-31', 'latest Claude news'],
]) {
    const prepared = prepareAnchoredSearchQuery(candidateQuery, {
        userText: originalRequest,
        temporalKind: 'relative',
        clock: tokyoClock,
    });
    assert.equal(prepared.logicalQuery, originalRequest);
    assert.doesNotMatch(prepared.logicalQuery, /2025-07-31/u);
}

for (const rangeQuery of [
    'latest Claude news from 2026-07-01 to 2026-07-30',
    'current policy updates since 2026-01-01',
    'recent CVEs after 2026-07-01',
    'latest news between 2026-07-01 and 2026-07-30',
    'current releases before 2026-07-15',
    'latest Claude news after:2026-07-01',
    'latest site:example.com after:2026-07-01',
    'recent news date:2026-07-01',
]) {
    const prepared = prepareAnchoredSearchQuery(rangeQuery, {
        userText: 'Give me the latest relevant information',
        temporalKind: 'relative',
        clock: tokyoClock,
    });
    for (const date of rangeQuery.match(/(?:19|20)\d{2}-\d{2}-\d{2}/gu) || []) {
        assert.match(prepared.logicalQuery, new RegExp(date, 'u'), rangeQuery);
    }
    assert.doesNotMatch(prepared.logicalQuery, /\b(?:from|since|after|before|between|date):?\s*$/iu);
}

for (const explicitDateField of [
    'latest project target date 2025-07-31',
    'current policy reference date 2025-07-31',
    'latest launch target date 2026-08-01',
]) {
    const prepared = prepareAnchoredSearchQuery(explicitDateField, {
        userText: explicitDateField,
        temporalKind: 'relative',
        clock: tokyoClock,
    });
    assert.match(prepared.logicalQuery, new RegExp(explicitDateField.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
}

console.log('Runtime clock and temporal search anchoring: all assertions passed');
