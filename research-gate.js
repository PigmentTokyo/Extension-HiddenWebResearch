const HARD_OPT_OUT_PATTERN = /(?:不要|不用|无需|禁止|别)(?:再)?(?:联网|上网|进行)?(?:网页|网络|网上|在线)?(?:搜索|检索|查找|查证|核实|浏览)|(?:不要|不用|无需|禁止|别)(?:再)?(?:联网|上网)|只(?:根据|依据|使用)(?:我)?(?:上文|下文|以下|所给|提供的|已有)(?:内容|文本|资料|数据|信息)?|\b(?:(?:do not|don't|dont|without|no)\s+(?:use\s+)?(?:the\s+)?(?:web\s+)?(?:search|browse|browsing|lookup)|use\s+only\s+(?:the\s+)?provided\s+(?:context|text|data|information))\b/iu;
const WEB_ACCESS_PATTERN = /(?:联网|上网)(?:查|搜索|检索|找|看|核实|查证)?|(?:网页|网络|网上|在线)(?:搜索|检索|查找|查证|核实|浏览)|(?:谷歌|百度|必应|searxng|serpapi|anysearch)(?:一下|搜索|查询)?|\b(?:search|browse)\s+(?:the\s+)?(?:web|internet|online)|\b(?:web\s*search|google\s+it|verify\s+online|serpapi|anysearch)\b/iu;
const SOURCE_REQUEST_PATTERN = /官网(?:链接|地址|页面|文档)|(?:给|提供|附上|列出|标注|补充).{0,10}(?:来源|出处|引用|参考链接|官网链接|原文链接|url)|\b(?:provide|give|list|include|cite)\s+(?:me\s+)?(?:official\s+)?(?:sources?|citations?|references?|links?|urls?)\b/iu;
const WEAK_LOOKUP_PATTERN = /(?:^|[。！？.!?]\s*)(?:请|帮我|麻烦)?(?:搜索|搜一下|查询|查一下|检索|研究一下)|(?:^|[.!?]\s*)(?:please\s+)?(?:search\s+for|look\s+up|research)\b/iu;
const FACT_CHECK_PATTERN = /(?:核实|查证|验证).{0,12}(?:报道|消息|说法|传闻|事实|真假|属实)|(?:报道|消息|说法|传闻).{0,12}(?:真假|属实|核实|查证)|\b(?:fact[- ]?check|verify)\s+(?:this\s+)?(?:claim|report|rumou?r|news|story)\b/iu;
const LOCAL_CODE_OR_TEXT_PATTERN = /(?:代码|函数|数组|变量|字段|公式|单元测试|语法|段落|语气|上文|下文|所给文本).{0,16}(?:查找|搜索|核实|验证|来源|链接|当前)|(?:查找|搜索|核实|验证).{0,16}(?:代码|函数|数组|变量|字段|公式|单元测试|语法)|(?:当前|现在).{0,12}(?:段落|语气|设定|代码|函数|数组|变量|字段)|\b(?:code|function|array|variable|field|formula|unit\s+test|syntax|paragraph).{0,20}(?:search|find|verify|source|link)\b/iu;
const URL_REFERENCE_PATTERN = /(?:https?:\/\/|www\.|(?:这个|该|上述|下面的?)(?:链接|网页|网站|页面|文章)|\bthis\s+(?:link|page|website|article)\b)/iu;
const RECENCY_PATTERN = /(?:最新|最近|近期|近日|今日|今天的?|本周|本月|今年|截至|实时|刚刚|刚发布|新发布|现任|目前的?|当前的?|现在的?)|\b(?:latest|recent(?:ly)?|today|tonight|this\s+(?:week|month|year)|as\s+of|real[- ]?time|newly\s+released|current(?:ly)?)\b/iu;
const SUPPLIED_TEXT_TASK_PATTERN = /(?:(?:翻译|译成|改写|润色|校对|概括|总结|摘要).{0,18}(?:以下|下面|这段|这篇|上文|本文|提供的内容|冒号)|(?:以下|下面|这段|这篇|上文|本文|提供的内容).{0,18}(?:翻译|译成|改写|润色|校对|概括|总结|摘要)|^(?:请|帮我|麻烦)?(?:把|将)?(?:翻译|改写|润色|校对))|\b(?:translate|rewrite|proofread|polish|summari[sz]e)\s+(?:this|the\s+following|the\s+text|the\s+passage|the\s+content\s+(?:below|above))\b/iu;
const CREATIVE_OR_ROLEPLAY_PATTERN = /(?:角色扮演|保持角色|扮演|续写|虚构|(?:写|创作|描写).{0,24}(?:故事|小说|诗|文案|对话|邮件|场景|暴雨)|取名|起名|头脑风暴)|\b(?:roleplay|stay\s+in\s+character|fictional|creative\s+writing|continue\s+(?:the\s+)?(?:story|scene)|write\s+(?:a|an|the)\s+(?:story|poem|email|dialogue)|brainstorm)\b/iu;
const REAL_WORLD_ANCHOR_PATTERN = /(?:真实|实际|现实中|准确|事实|真实数据)|\b(?:real[- ]world|actual|accurate|factual|real\s+data)\b/iu;
const FICTIONAL_CONTEXT_PATTERN = /(?:当前|这个|该)?(?:设定|世界观|剧情|故事|角色|小说|游戏内|剧本)|\b(?:this|the)\s+(?:setting|story|fictional\s+world|game|scenario)\b/iu;
const LOCAL_ACTION_PATTERN = /^(?:今天|现在|today|now)[,， ]*(?:请|帮我|please\s+)?(?:写|翻译|总结|解释|继续|扮演|修改|润色|计算|聊天|write|translate|summari[sz]e|explain|continue|roleplay|edit|calculate|chat)/iu;
const CASUAL_PATTERN = /^(?:你好|您好|在吗|谢谢|多谢|早上好|下午好|晚上好|晚安|哈哈+|嘿|嗨|hi|hello|hey|thanks|thank\s+you|good\s+(?:morning|afternoon|evening|night))[!！?？。.~～\s]*$|(?:最近好吗|心情不好|陪我聊聊|\bhow\s+are\s+you|\bhow(?:'s|\s+is)\s+it\s+going|\bdoing\s+lately)/iu;
const DYNAMIC_TOPIC_PATTERN = /(?:新闻|要闻|热点|时事|最新消息|进展|公告|价格|报价|现价|股价|汇率|金价|油价|币价|票价|房价|利率|天气|下雨|气温|降雨|降雪|台风|空气质量|预报|比分|赛程|积分榜|比赛结果|谁赢|夺冠|版本|发行版|更新日志|eol|法律|法规|条例|法令|监管|税率|签证|入境规定|合规要求|现任|在任|总裁|总统|总理|首相|主席|部长|负责人|宕机|服务状态|故障|可用性|库存|在售|航班|召回|漏洞|补丁)|\b(?:news|headline|breaking|developments?|announcement|(?:current|latest).{0,30}(?:price|scores?|version)|stock\s+price|exchange\s+rate|market\s+cap|fare|interest\s+rate|weather|forecast|temperature|rainfall|air\s+quality|typhoon|score|fixture|standings|match\s+result|who\s+won|stable\s+version|release|changelog|eol|law|regulation|tax\s+rate|visa|entry\s+requirements?|compliance|incumbent|ceo|president|prime\s+minister|mayor|outage|downtime|status\s+page|is\s+\w+\s+down|availability|in\s+stock|flight|recall|vulnerability|patch)\b/iu;
const QUESTION_OR_LOOKUP_PATTERN = /[?？]|(?:吗|么|如何|怎样|怎么|多少|哪些?|哪里|谁|是否|能否|有没有|有什么|是什么|为什么|请问|告诉我|帮我|对比|比较)|\b(?:what|who|when|where|which|how|is|are|does|do|can|could|should|compare|tell\s+me)\b/iu;
const HIGH_STAKES_PATTERN = /(?:医疗|医学|症状|诊断|药物|药品|用药|剂量|相互作用|法律|法规|税务|投资|证券|贷款|保险)|\b(?:medical|symptom|diagnosis|medication|dosage|interaction|legal|law|tax|invest(?:ment)?|securities|loan|insurance)\b/iu;
const RECOMMENDATION_PATTERN = /(?:推荐(?:一个|一些|几款|适合|什么|哪)|选购|购买建议|值得买吗|哪个好|旅行计划|酒店推荐|餐厅推荐|机票推荐)|\b(?:recommend|buying\s+advice|worth\s+buying|travel\s+plan|hotel\s+recommendation|restaurant\s+recommendation|flight\s+recommendation)\b/iu;

function normalizeGateText(value) {
    return String(value || '').replace(/\s+/gu, ' ').trim();
}

function prepareIntentText(value) {
    const masked = String(value || '').normalize('NFKC')
        .replace(/```[\s\S]*?```/gu, ' ')
        .replace(/`[^`\n]{1,500}`/gu, ' ')
        .replace(/"[^"\n]{1,500}"/gu, ' ')
        .replace(/“[^”\n]{1,500}”/gu, ' ')
        .replace(/‘[^’\n]{1,500}’/gu, ' ')
        .replace(/「[^」\n]{1,500}」/gu, ' ')
        .replace(/『[^』\n]{1,500}』/gu, ' ');
    const clipped = masked.length > 2400
        ? `${masked.slice(0, 1200)} ${masked.slice(-1200)}`
        : masked;
    return normalizeGateText(clipped);
}

function hasExplicitSearchIntentPrepared(text) {
    if (WEB_ACCESS_PATTERN.test(text)) return true;
    if (LOCAL_CODE_OR_TEXT_PATTERN.test(text)) return false;
    return SOURCE_REQUEST_PATTERN.test(text) || FACT_CHECK_PATTERN.test(text) || WEAK_LOOKUP_PATTERN.test(text);
}

export function hasExplicitNoSearchIntent(value) {
    return HARD_OPT_OUT_PATTERN.test(prepareIntentText(value));
}

export function hasExplicitSearchIntent(value) {
    const text = prepareIntentText(value);
    return !HARD_OPT_OUT_PATTERN.test(text) && hasExplicitSearchIntentPrepared(text);
}

/**
 * Makes a local, zero-token decision before a Claude research profile is called.
 *
 * @param {string} value Latest user message.
 * @param {'auto'|'always'|'explicit'} policy Search policy.
 * @returns {{shouldCall: boolean, reason: string}}
 */
export function evaluateNativeResearchGate(value, policy = 'auto') {
    const text = prepareIntentText(value);
    if (!text) return { shouldCall: false, reason: 'empty' };
    if (HARD_OPT_OUT_PATTERN.test(text)) return { shouldCall: false, reason: 'user_opt_out' };

    const explicitSearch = hasExplicitSearchIntentPrepared(text);
    if (policy === 'always') return { shouldCall: true, reason: 'policy_always' };
    if (policy === 'explicit') {
        return explicitSearch
            ? { shouldCall: true, reason: 'explicit_request' }
            : { shouldCall: false, reason: 'explicit_not_requested' };
    }
    if (explicitSearch) return { shouldCall: true, reason: 'explicit_request' };

    if (LOCAL_ACTION_PATTERN.test(text)) return { shouldCall: false, reason: 'local_action' };
    if (LOCAL_CODE_OR_TEXT_PATTERN.test(text)) return { shouldCall: false, reason: 'local_task' };
    if (URL_REFERENCE_PATTERN.test(text)) return { shouldCall: true, reason: 'url_reference' };
    if (SUPPLIED_TEXT_TASK_PATTERN.test(text)) return { shouldCall: false, reason: 'supplied_text_task' };
    if (FICTIONAL_CONTEXT_PATTERN.test(text) && !REAL_WORLD_ANCHOR_PATTERN.test(text)) {
        return { shouldCall: false, reason: 'fictional_context' };
    }
    if (CREATIVE_OR_ROLEPLAY_PATTERN.test(text) && !REAL_WORLD_ANCHOR_PATTERN.test(text)) {
        return { shouldCall: false, reason: 'creative_or_roleplay' };
    }
    if (CASUAL_PATTERN.test(text)) return { shouldCall: false, reason: 'casual' };
    if (DYNAMIC_TOPIC_PATTERN.test(text)) return { shouldCall: true, reason: 'dynamic_topic' };
    if (RECOMMENDATION_PATTERN.test(text)) return { shouldCall: true, reason: 'recommendation' };

    let score = 0;
    if (RECENCY_PATTERN.test(text)) score++;
    if (QUESTION_OR_LOOKUP_PATTERN.test(text)) score++;
    if (HIGH_STAKES_PATTERN.test(text)) score++;

    return score >= 2
        ? { shouldCall: true, reason: 'scored_web_need' }
        : { shouldCall: false, reason: 'no_web_signal' };
}

// Backwards-compatible export for existing imports and tests.
export const evaluateClaudeResearchGate = evaluateNativeResearchGate;
