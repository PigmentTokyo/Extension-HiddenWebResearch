const STRATEGY_ALIASES = Object.freeze({
    anthropic: 'claude',
    claude: 'claude',
    deepseek: 'deepseek-v4-pro',
    'deepseek-v4-pro': 'deepseek-v4-pro',
    gemini: 'gemini',
    'glm-5.2': 'glm-5.2',
    google: 'gemini',
    'kimi-k3': 'kimi-k3',
    makersuite: 'gemini',
    other: 'other',
    vertexai: 'gemini',
});

const STRATEGY_LABELS = Object.freeze({
    claude: 'Claude 启发：必要性门控 / 顺序查证',
    gemini: 'Gemini 启发：搜索增益 / 查询提炼',
    'deepseek-v4-pro': 'DeepSeek V4 Pro：分面合并',
    'glm-5.2': 'GLM 5.2：层级核验',
    'kimi-k3': 'Kimi K3：研究收敛',
    other: '其他 / 通用',
});

const RESPONSE_PROFILE_IDS = Object.freeze({
    claude: 'claude-inspired',
    gemini: 'gemini-inspired',
    'deepseek-v4-pro': 'deepseek-v4-pro',
    'glm-5.2': 'glm-5.2',
    'kimi-k3': 'kimi-k3',
    other: 'general',
});

const PLANNER_STYLE_INSTRUCTIONS = Object.freeze({
    claude: [
        'Apply a Claude-inspired policy reconstructed from public tool behavior; never claim this is Anthropic private wording or a native Anthropic tool call.',
        'Use a cautious knowledge-first necessity check: search for an explicit browse request; current, changing, live, or plausibly outdated facts; material high-precision facts where freshness, attribution, or error risk matters; exact sources or quotations; or a material low-confidence knowledge gap.',
        'Start with exactly one highest-value precise query and prefer the responsible primary source. Do not split a request into many fields.',
        'In each later round, issue at most one sequential follow-up for a concrete unresolved fact, contradiction, or recency gap. Stop as soon as the evidence is sufficient.',
    ].join(' '),
    gemini: [
        'Apply a Gemini-inspired policy reconstructed from public Google Search behavior; never claim this is Google private wording or native Google grounding.',
        'Use a grounding-improvement check: search only when external retrieval would materially improve factual accuracy, freshness, attribution, specificity, or completeness.',
        'Do not search merely because more detail could be found when reliable internal knowledge or supplied context is already sufficient.',
        'Convert the information need into concise, high-intent, standalone search queries instead of copying the user sentence.',
        'The first round may contain two queries only when they are genuinely complementary independent facets; otherwise use one.',
        'Later rounds may contain only the single highest-value gap-filling query. Stop when the material requested information is supported.',
    ].join(' '),
    'deepseek-v4-pro': [
        'Map the material factual facets, then consolidate closely related facets into the fewest queries.',
        'The first round may contain at most two queries: one consolidated, high-intent primary or official-source query covering closely related facets when an authority is inferable, plus one genuinely orthogonal verification query when necessary. Do not make the consolidated query vague or overstuffed.',
        'Do not create one query per requested field. After evidence arrives, select only the unresolved gap with the highest information gain and stop once coverage is sufficient.',
    ].join(' '),
    'glm-5.2': [
        'Plan hierarchically from scope to authority to unresolved layer.',
        'When one exists, begin with an authoritative hub, regulator, standards body, or official summary that can cover the top-level question; use a second first-round query only for an orthogonal jurisdiction, definition, implementation detail, timeline, or statistical scope.',
        'Preserve official terminology and track date, jurisdiction, and measurement-scope mismatches. Each later round may verify only one unresolved layer.',
    ].join(' '),
    'kimi-k3': [
        'Optimize for the minimum sufficient evidence set and aggressive convergence.',
        'Infer the responsible authority or domain when possible; use one authority-specific or site-restricted primary query, plus at most one orthogonal verification query in the first round.',
        'Do not branch into a deep-research tree. Reuse gathered evidence, request only the single most valuable gap-filling follow-up, and stop immediately when the material information needs are covered.',
    ].join(' '),
    other: [
        'Use a conservative knowledge-first loop.',
        'Search only when external evidence would materially improve factual accuracy, freshness, specificity, or verification.',
        'Choose one precise, high-value query at a time, prefer primary sources, and stop as soon as the evidence is sufficient.',
    ].join(' '),
});

const RESPONSE_STYLE_INSTRUCTIONS = Object.freeze({
    claude: [
        'Use a Claude-inspired research synthesis style, without imitating any private protocol or claiming Anthropic native search.',
        'Lead with the direct answer, preserve the requested tone and format, and prefer authoritative or first-party sources.',
        'For each materially current factual claim, normally cite the single strongest source; add another only when corroboration or a conflict matters, and explain material discrepancies.',
        'Do not add a separate sources list unless the user requests one.',
    ].join(' '),
    gemini: [
        'Use a Gemini-inspired grounded synthesis style, without imitating any private protocol or claiming Google native grounding.',
        'Combine complementary evidence facets into one direct answer while preserving the requested tone and format.',
        'Ground each sentence or short paragraph that contains materially current facts; group multiple citations after the claim when distinct sources jointly support it.',
        'Do not emit groundingMetadata, Search Suggestions, or a separate sources list unless the user requests one.',
    ].join(' '),
    'deepseek-v4-pro': [
        'Use a DeepSeek V4 Pro-oriented synthesis: merge complementary facets into a compact structured answer and clearly distinguish retrieved facts from your own inference.',
        'Resolve contradictions explicitly, avoid repetitive caveats, and preserve the requested tone and format.',
    ].join(' '),
    'glm-5.2': [
        'Use a GLM 5.2-oriented hierarchical synthesis: give the conclusion first, then organize verified facts and necessary explanation in descending importance.',
        'Cross-check time-sensitive claims, flag conflicts precisely, and preserve the requested tone and format.',
    ].join(' '),
    'kimi-k3': [
        'Use a Kimi K3-oriented research synthesis: give a concise conclusion followed by the minimum evidence trail needed to support it.',
        'Converge overlapping sources, remove repetition, state unresolved gaps precisely, and preserve the requested tone and format.',
    ].join(' '),
    other: [
        'Give a direct, well-grounded answer using the supplied current evidence.',
        'Separate supported facts from inference, reconcile conflicts, and preserve the requested tone and format.',
    ].join(' '),
});

const TARGET_MODEL_PATTERNS = Object.freeze([
    ['deepseek-v4-pro', /(?:^|[^a-z0-9])deepseek[\s._/-]+v4[\s._/-]*pro(?:$|[^a-z0-9.])/iu],
    ['glm-5.2', /(?:^|[^a-z0-9])glm[\s._/-]+5[\s._/-]+2(?:$|[^a-z0-9.])/iu],
    ['kimi-k3', /(?:^|[^a-z0-9])kimi[\s._/-]+k3(?:$|[^a-z0-9.])/iu],
]);

const DOMESTIC_MODEL_FAMILY_PATTERN = /(?:deepseek|(?:^|[^a-z0-9])(?:glm|kimi|moonshotai)(?:$|[^a-z0-9]))/iu;

/**
 * Query-shaping limits derived from the observed native-search styles.
 * Later rounds stay sequential so that every follow-up addresses a concrete
 * evidence gap instead of producing progressively narrower synonyms.
 */
export const RESEARCH_STRATEGY_PROFILES = Object.freeze({
    claude: Object.freeze({
        id: 'claude',
        firstRoundQueryLimit: 1,
        followUpQueryLimit: 1,
        totalQueryLimit: 3,
        plannerMinTokens: 512,
        conservative: false,
    }),
    gemini: Object.freeze({
        id: 'gemini',
        firstRoundQueryLimit: 2,
        followUpQueryLimit: 1,
        totalQueryLimit: 4,
        plannerMinTokens: 512,
        conservative: false,
    }),
    'deepseek-v4-pro': Object.freeze({
        id: 'deepseek-v4-pro',
        firstRoundQueryLimit: 2,
        followUpQueryLimit: 1,
        totalQueryLimit: 4,
        plannerMinTokens: 1024,
        conservative: false,
    }),
    'glm-5.2': Object.freeze({
        id: 'glm-5.2',
        firstRoundQueryLimit: 2,
        followUpQueryLimit: 1,
        totalQueryLimit: 4,
        plannerMinTokens: 1536,
        conservative: false,
    }),
    'kimi-k3': Object.freeze({
        id: 'kimi-k3',
        firstRoundQueryLimit: 2,
        followUpQueryLimit: 1,
        totalQueryLimit: 3,
        plannerMinTokens: 2048,
        conservative: false,
    }),
    other: Object.freeze({
        id: 'other',
        firstRoundQueryLimit: 1,
        followUpQueryLimit: 1,
        totalQueryLimit: 3,
        plannerMinTokens: 512,
        conservative: true,
    }),
});

const ENGLISH_STOP_WORDS = new Set([
    'a',
    'about',
    'an',
    'and',
    'are',
    'as',
    'at',
    'by',
    'detail',
    'details',
    'detailed',
    'do',
    'does',
    'explain',
    'explanation',
    'for',
    'from',
    'guide',
    'how',
    'in',
    'into',
    'is',
    'of',
    'on',
    'or',
    'overview',
    'please',
    'related',
    'specific',
    'that',
    'the',
    'to',
    'what',
    'with',
]);

const ENGLISH_TOKEN_ALIASES = new Map([
    ['approach', 'aspect'],
    ['approaches', 'aspect'],
    ['behavior', 'aspect'],
    ['behaviour', 'aspect'],
    ['browse', 'search'],
    ['browsed', 'search'],
    ['browses', 'search'],
    ['browsing', 'search'],
    ['characteristic', 'aspect'],
    ['characteristics', 'aspect'],
    ['cost', 'pricing'],
    ['costs', 'pricing'],
    ['documentation', 'docs'],
    ['features', 'aspect'],
    ['feature', 'aspect'],
    ['internet', 'web'],
    ['mechanism', 'aspect'],
    ['mechanisms', 'aspect'],
    ['method', 'aspect'],
    ['methods', 'aspect'],
    ['online', 'web'],
    ['prices', 'pricing'],
    ['searches', 'search'],
    ['searched', 'search'],
    ['searching', 'search'],
    ['strategies', 'aspect'],
    ['strategy', 'aspect'],
    ['styles', 'aspect'],
    ['style', 'aspect'],
    ['traits', 'aspect'],
    ['trait', 'aspect'],
]);

const CJK_SEMANTIC_ALIASES = Object.freeze([
    [/(?:互联网|网络|网页|联网)(?:搜索|检索|查询)/gu, ' 搜索 '],
    [/(?:网络浏览|网页浏览)/gu, ' 搜索 '],
    [/(?:検索方法|検索方式|検索戦略|検索特性|検索特徴)/gu, ' 検索 方面 '],
    [/(?:特点|特征|特性|机制|机理|原理|方式|方法|策略|风格|行为)/gu, ' 方面 '],
    [/(?:詳細|詳しく|具体的|详细|具体|深入|全面|进一步|说明|介绍)/gu, ' '],
]);

const PURPOSE_PATTERNS = Object.freeze([
    ['availability', /(?:availability|release|released|rollout|可用性|发布|上线|提供状況|リリース)/iu],
    ['comparison', /(?:compare|comparison|versus|\bvs\b|区别|差异|对比|比較|違い)/iu],
    ['documentation', /(?:\bapi\b|docs?|documentation|reference|官方文档|开发文档|接口文档|公式ドキュメント|リファレンス)/iu],
    ['implementation', /(?:implementation|code|example|sample|实现|代码|示例|接入|実装|コード|例)/iu],
    ['legal', /(?:terms?|policy|legal|compliance|条款|政策|合规|規約|ポリシー|法令遵守)/iu],
    ['limitations', /(?:limitations?|limits?|drawbacks?|risks?|限制|局限|缺点|风险|制限|欠点|リスク)/iu],
    ['performance', /(?:benchmark|latency|performance|speed|基准|延迟|性能|速度|ベンチマーク|遅延|性能)/iu],
    ['pricing', /(?:pricing|prices?|costs?|billing|费用|价格|定价|计费|料金|価格|課金)/iu],
    ['privacy', /(?:privacy|security|安全|隐私|セキュリティ|プライバシー)/iu],
    ['sources', /(?:sources?|citations?|references?|evidence|来源|引用|证据|出典|引用元|根拠)/iu],
]);

const TEMPORAL_PATTERN = /(?:\b(?:latest|current|currently|recent|recently|today|yesterday|tomorrow|before|after|since)\b|(?:19|20)\d{2}(?:[-/.年]\d{1,2})?(?:[-/.月]\d{1,2}日?)?|最新|当前|目前|今天|昨日|明天|截至|之后|之前|以来|近(?:期|日|年)|本(?:周|月|年)|最新|現在|今日|昨日|明日|以降|以前|以来|今(?:週|月|年))/giu;
const SEARCH_OPERATOR_PATTERN = /\b(site|domain|filetype|intitle|inurl|before|after|purpose|facet)\s*:\s*([^\s]+)/giu;
const TRACKING_PARAMETER_NAMES = new Set([
    '_hsenc',
    '_hsmi',
    'ascsubtag',
    'dclid',
    'fbclid',
    'gbraid',
    'gclid',
    'igshid',
    'mc_cid',
    'mc_eid',
    'mkt_tok',
    'msclkid',
    'oly_anon_id',
    'oly_enc_id',
    'rb_clickid',
    'ref',
    'ref_src',
    'referrer',
    's_cid',
    'spm',
    'tag',
    'vero_conv',
    'vero_id',
    'wbraid',
    'yclid',
]);

/**
 * @param {unknown} value Strategy name or provider alias.
 * @returns {'claude'|'gemini'|'deepseek-v4-pro'|'glm-5.2'|'kimi-k3'|'other'}
 */
export function normalizeStrategyName(value) {
    const key = String(value || '').normalize('NFKC').trim().toLowerCase();
    return STRATEGY_ALIASES[key] || 'other';
}

function normalizeModelIdentifier(value) {
    return String(value || '')
        .normalize('NFKC')
        .trim()
        .toLowerCase();
}

/**
 * Detects only the explicitly tuned flagship domestic-model profiles.
 *
 * @param {{source?: unknown, model?: unknown}} value Provider and model identifiers.
 * @returns {'claude'|'gemini'|'deepseek-v4-pro'|'glm-5.2'|'kimi-k3'|'other'}
 */
export function detectResearchStrategy(value = {}) {
    const source = normalizeModelIdentifier(value?.source);
    const model = normalizeModelIdentifier(value?.model);
    const fingerprint = `${source} ${model}`.trim();

    for (const [strategy, pattern] of TARGET_MODEL_PATTERNS) {
        if (pattern.test(model)) return strategy;
    }

    if (DOMESTIC_MODEL_FAMILY_PATTERN.test(model)) return 'other';
    if (/(?:anthropic|claude)/iu.test(model)) return 'claude';
    if (/(?:gemini|makersuite|vertexai|google)/iu.test(model)) return 'gemini';

    // Some connection managers split a model ID between the provider/source
    // and model fields, so retry on the combined fingerprint only after an
    // explicit model identifier has had priority.
    for (const [strategy, pattern] of TARGET_MODEL_PATTERNS) {
        if (pattern.test(fingerprint)) return strategy;
    }

    if (DOMESTIC_MODEL_FAMILY_PATTERN.test(fingerprint)) return 'other';
    if (/(?:anthropic|claude)/iu.test(fingerprint)) return 'claude';
    if (/(?:gemini|makersuite|vertexai|google)/iu.test(fingerprint)) return 'gemini';
    return 'other';
}

/**
 * @param {unknown} value Strategy name or provider alias.
 * @returns {string} User-facing strategy label.
 */
export function getResearchStrategyLabel(value) {
    return STRATEGY_LABELS[normalizeStrategyName(value)];
}

/**
 * @param {unknown} value Strategy name or provider alias.
 * @returns {typeof RESEARCH_STRATEGY_PROFILES[keyof typeof RESEARCH_STRATEGY_PROFILES]}
 */
export function getResearchStrategyProfile(value) {
    return RESEARCH_STRATEGY_PROFILES[normalizeStrategyName(value)];
}

/**
 * Describes how the hidden planner should decide whether to search and shape
 * subsequent queries. These profiles imitate public behavior only; they are
 * not vendor system prompts or native tool protocols.
 *
 * @param {unknown} value Strategy name or provider alias.
 * @returns {string}
 */
export function getResearchPlannerInstruction(value) {
    return PLANNER_STYLE_INSTRUCTIONS[normalizeStrategyName(value)];
}

/**
 * Describes how the final answer should synthesize retrieved evidence.
 * These are presentation profiles only; they never claim a vendor-native
 * search tool was used.
 *
 * @param {unknown} value Strategy name or provider alias.
 * @returns {{id: string, instruction: string}}
 */
export function getResearchResponseProfile(value) {
    const strategy = normalizeStrategyName(value);
    return {
        id: RESPONSE_PROFILE_IDS[strategy],
        instruction: RESPONSE_STYLE_INSTRUCTIONS[strategy],
    };
}

/**
 * Builds citation rules for the final answer.
 *
 * @param {boolean} includeSourceLinks Whether real source URLs are present.
 * @returns {string}
 */
export function getResearchCitationInstruction(includeSourceLinks = true) {
    if (!includeSourceLinks) {
        return [
            'Source links were intentionally omitted.',
            'Do not output URLs, source IDs such as S1, numbered citation markers, or a sources list.',
        ].join(' ');
    }

    return [
        'Cite materially current web-supported claims using only the supplied <source> records.',
        'A source may be cited only when its title, snippet, published date, or cited text supports the claim.',
        'Render source S1 as [1](EXACT_URL), S2 as [2](EXACT_URL), and so on, placing compact citations immediately after the supported claim.',
        'Copy each supplied URL exactly; never invent, repair, shorten, or alter a URL.',
        'Never cite a query, an unresolved gap, or a source that does not support the statement, and do not expose internal S identifiers outside the compact numbered links.',
    ].join(' ');
}

/**
 * @param {unknown} strategy Strategy name or provider alias.
 * @param {number} round One-based research round.
 * @returns {number}
 */
export function getStrategyQueryLimit(strategy, round = 1) {
    const profile = getResearchStrategyProfile(strategy);
    return Number(round) > 1 ? profile.followUpQueryLimit : profile.firstRoundQueryLimit;
}

/**
 * Applies a strategy's per-round query cap without mutating the input.
 *
 * @param {unknown[]} queries Candidate queries.
 * @param {unknown} strategy Strategy name or provider alias.
 * @param {number} round One-based research round.
 * @returns {unknown[]}
 */
export function limitQueriesForStrategy(queries, strategy, round = 1) {
    return Array.isArray(queries)
        ? queries.slice(0, getStrategyQueryLimit(strategy, round))
        : [];
}

/**
 * Surface normalization used for exact comparisons and diagnostics.
 *
 * @param {unknown} value Query text.
 * @returns {string}
 */
export function normalizeQueryForComparison(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\p{P}\p{S}\s]+/gu, ' ')
        .trim()
        .replace(/\s+/gu, ' ');
}

function normalizeSemanticText(value) {
    let text = String(value || '').normalize('NFKC').toLowerCase();
    for (const [pattern, replacement] of CJK_SEMANTIC_ALIASES) {
        text = text.replace(pattern, replacement);
    }
    return text;
}

function canonicalizeEnglishToken(token) {
    const alias = ENGLISH_TOKEN_ALIASES.get(token);
    if (alias) return alias;
    if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
    if (token.length > 5 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
    return token;
}

function collectCjkBigrams(text) {
    const features = new Set();
    const segments = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu) || [];
    for (const segment of segments) {
        const characters = [...segment];
        if (characters.length === 1) {
            features.add(characters[0]);
            continue;
        }
        for (let index = 0; index < characters.length - 1; index++) {
            features.add(`${characters[index]}${characters[index + 1]}`);
        }
    }
    return features;
}

/**
 * Produces English-token and CJK-bigram features for approximate comparison.
 *
 * @param {unknown} value Query text.
 * @returns {{normalized: string, englishTokens: Set<string>, cjkBigrams: Set<string>}}
 */
export function extractQueryFeatures(value) {
    const semanticText = normalizeSemanticText(value);
    const normalized = normalizeQueryForComparison(semanticText);
    const englishTokens = new Set();
    const matches = normalized.match(/[a-z0-9]+/gu) || [];
    for (const match of matches) {
        const token = canonicalizeEnglishToken(match);
        if (token && !ENGLISH_STOP_WORDS.has(token)) englishTokens.add(token);
    }
    return {
        normalized,
        englishTokens,
        cjkBigrams: collectCjkBigrams(semanticText),
    };
}

function setSimilarity(left, right) {
    if (!left.size && !right.size) return null;
    if (!left.size || !right.size) return 0;
    let intersection = 0;
    for (const item of left) {
        if (right.has(item)) intersection++;
    }
    const dice = (2 * intersection) / (left.size + right.size);
    const containment = intersection / Math.min(left.size, right.size);
    return Math.max(dice, containment * 0.92);
}

/**
 * Approximate query similarity using English tokens and CJK bigrams.
 *
 * @param {unknown} left First query.
 * @param {unknown} right Second query.
 * @returns {number} A value between 0 and 1.
 */
export function querySimilarity(left, right) {
    const leftFeatures = extractQueryFeatures(left);
    const rightFeatures = extractQueryFeatures(right);
    if (leftFeatures.normalized === rightFeatures.normalized) return 1;

    const components = [
        {
            score: setSimilarity(leftFeatures.englishTokens, rightFeatures.englishTokens),
            weight: Math.max(leftFeatures.englishTokens.size, rightFeatures.englishTokens.size),
        },
        {
            score: setSimilarity(leftFeatures.cjkBigrams, rightFeatures.cjkBigrams),
            weight: Math.max(leftFeatures.cjkBigrams.size, rightFeatures.cjkBigrams.size),
        },
    ].filter(component => component.score !== null && component.weight > 0);

    if (!components.length) return 0;
    const totalWeight = components.reduce((total, component) => total + component.weight, 0);
    return components.reduce((total, component) => total + component.score * component.weight, 0) / totalWeight;
}

function compactQuery(value) {
    return String(value || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function collectQueryDimensions(value, facetTerms = []) {
    const raw = String(value || '').normalize('NFKC');
    const normalized = normalizeQueryForComparison(raw);
    const dimensions = new Set();

    for (const match of raw.matchAll(SEARCH_OPERATOR_PATTERN)) {
        dimensions.add(`${match[1].toLowerCase()}:${normalizeQueryForComparison(match[2])}`);
    }
    for (const match of raw.matchAll(TEMPORAL_PATTERN)) {
        dimensions.add(`date:${normalizeQueryForComparison(match[0])}`);
    }
    for (const [name, pattern] of PURPOSE_PATTERNS) {
        if (pattern.test(raw)) dimensions.add(`purpose:${name}`);
    }

    const quotedPhrases = raw.match(/["“”「」『』][^"“”「」『』]{2,120}["“”「」『』]/gu) || [];
    for (const phrase of quotedPhrases) {
        const normalizedPhrase = normalizeQueryForComparison(phrase);
        if (normalizedPhrase) dimensions.add(`quote:${normalizedPhrase}`);
    }

    for (const facetTerm of facetTerms) {
        const facet = normalizeQueryForComparison(facetTerm);
        if (facet && normalized.includes(facet)) dimensions.add(`facet:${facet}`);
    }
    return dimensions;
}

function hasSubstantialNewFeatures(candidate, previous) {
    const candidateFeatures = extractQueryFeatures(candidate);
    const previousFeatures = extractQueryFeatures(previous);
    const newEnglish = [...candidateFeatures.englishTokens]
        .filter(token => !previousFeatures.englishTokens.has(token) && token !== 'aspect' && token !== 'search' && token !== 'web');
    const newCjk = [...candidateFeatures.cjkBigrams]
        .filter(token => !previousFeatures.cjkBigrams.has(token) && token !== '方面' && token !== '搜索');
    return newEnglish.length >= 2 || newCjk.length >= 3;
}

function addsMeaningfulDimension(candidate, previous, facetTerms) {
    const candidateDimensions = collectQueryDimensions(candidate, facetTerms);
    const previousDimensions = collectQueryDimensions(previous, facetTerms);
    for (const dimension of candidateDimensions) {
        if (!previousDimensions.has(dimension)) return true;
    }
    return hasSubstantialNewFeatures(candidate, previous);
}

/**
 * Removes exact and approximate repeats while retaining queries that add a
 * site/date/purpose/custom facet or a substantial new topic facet.
 *
 * @param {unknown[]} candidates Candidate query strings.
 * @param {unknown[]} seenQueries Queries already issued.
 * @param {{similarityThreshold?: number, maxQueries?: number, facetTerms?: unknown[]}} options Filtering options.
 * @returns {string[]}
 */
export function filterNovelQueries(candidates, seenQueries = [], options = {}) {
    if (!Array.isArray(candidates)) return [];
    const thresholdValue = Number(options.similarityThreshold);
    const similarityThreshold = Number.isFinite(thresholdValue)
        ? Math.min(1, Math.max(0, thresholdValue))
        : 0.78;
    const maxValue = Number(options.maxQueries);
    const maxQueries = Number.isFinite(maxValue)
        ? Math.max(0, Math.floor(maxValue))
        : Number.POSITIVE_INFINITY;
    const facetTerms = Array.isArray(options.facetTerms) ? options.facetTerms : [];
    const references = (Array.isArray(seenQueries) ? seenQueries : [])
        .map(compactQuery)
        .filter(Boolean);
    const accepted = [];
    const exactKeys = new Set(references.map(normalizeQueryForComparison));

    for (const rawCandidate of candidates) {
        if (accepted.length >= maxQueries) break;
        const candidate = compactQuery(rawCandidate);
        if (!candidate) continue;
        const exactKey = normalizeQueryForComparison(candidate);
        if (!exactKey || exactKeys.has(exactKey)) continue;

        const approximateRepeat = references.some(previous => (
            querySimilarity(candidate, previous) >= similarityThreshold
            && !addsMeaningfulDimension(candidate, previous, facetTerms)
        ));
        if (approximateRepeat) continue;

        accepted.push(candidate);
        references.push(candidate);
        exactKeys.add(exactKey);
    }
    return accepted;
}

function cleanPlannerText(value, maxLength = 320) {
    return String(value || '')
        .normalize('NFKC')
        .replace(/```[\s\S]*?```/gu, ' ')
        .replace(/<[^>]+>/gu, ' ')
        .replace(/^\s*(?:[-*#]+|\d{1,2}[.)\u3001])\s*/u, '')
        .replace(/[\s"'`*#\u2018\u2019\u201c\u201d]+$/gu, '')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, maxLength);
}

function decodeXmlText(value) {
    return String(value || '')
        .replace(/&lt;/giu, '<')
        .replace(/&gt;/giu, '>')
        .replace(/&quot;/giu, '"')
        .replace(/&#39;|&apos;/giu, '\'')
        .replace(/&amp;/giu, '&');
}

function getPlannerQueryPlan(value) {
    if (typeof value === 'string' || typeof value === 'number') {
        return { query: cleanPlannerText(value, 240), purpose: '' };
    }
    if (!value || typeof value !== 'object') return { query: '', purpose: '' };
    return {
        query: cleanPlannerText(
            value.query ?? value.search_query ?? value.searchQuery ?? value.text ?? value.value,
            240,
        ),
        purpose: cleanPlannerText(value.purpose ?? value.facet ?? value.reason, 160),
    };
}

function getPlannerGap(value) {
    if (typeof value === 'string' || typeof value === 'number') {
        return cleanPlannerText(value, 320);
    }
    if (!value || typeof value !== 'object') return '';
    return cleanPlannerText(
        value.gap ?? value.unresolved ?? value.question ?? value.issue ?? value.text ?? value.value,
        320,
    );
}

function toPlannerArray(value) {
    if (value === undefined || value === null || value === '') return [];
    return Array.isArray(value) ? value : [value];
}

function findFirstJsonObject(value) {
    const text = String(value || '');
    let start = -1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < text.length; index++) {
        const character = text[index];
        if (start < 0) {
            if (character === '{') {
                start = index;
                depth = 1;
            }
            continue;
        }
        if (quoted) {
            if (escaped) {
                escaped = false;
            } else if (character === '\\') {
                escaped = true;
            } else if (character === '"') {
                quoted = false;
            }
            continue;
        }
        if (character === '"') {
            quoted = true;
        } else if (character === '{') {
            depth++;
        } else if (character === '}') {
            depth--;
            if (depth === 0) return text.slice(start, index + 1);
        }
    }
    return '';
}

function makePlannerDecision(action, queryPlans, unresolved, maxQueries) {
    const limitValue = Number(maxQueries);
    const limit = Number.isFinite(limitValue)
        ? Math.max(0, Math.floor(limitValue))
        : Number.POSITIVE_INFINITY;
    const normalizedAction = ['SEARCH', 'DONE', 'INVALID'].includes(String(action).toUpperCase())
        ? String(action).toUpperCase()
        : 'INVALID';
    const availablePlans = queryPlans
        .map(getPlannerQueryPlan)
        .filter(plan => plan.query);
    const boundedPlans = availablePlans.slice(0, limit);
    let semanticAction = normalizedAction;
    if (semanticAction === 'SEARCH' && !boundedPlans.length) semanticAction = 'INVALID';
    if (semanticAction === 'DONE' && availablePlans.length) semanticAction = 'INVALID';
    const plans = semanticAction === 'SEARCH' ? boundedPlans : [];
    return {
        action: semanticAction,
        queries: plans.map(plan => plan.query),
        queryPurposes: plans.map(plan => plan.purpose),
        unresolved: [...new Set(unresolved.map(getPlannerGap).filter(Boolean))].slice(0, 8),
    };
}

/**
 * Parses the XML, JSON, and plain-text forms emitted by hidden planners.
 * JSON query objects and unresolved-gap aliases are accepted for compatibility
 * with models that produce richer structured plans.
 *
 * @param {unknown} rawValue Planner output.
 * @param {number} maxQueries Maximum accepted queries.
 * @returns {{action: 'SEARCH'|'DONE'|'INVALID', queries: string[], queryPurposes: string[], unresolved: string[]}}
 */
export function parsePlannerDecision(rawValue, maxQueries = Number.POSITIVE_INFINITY) {
    const raw = String(rawValue || '').trim();
    const actionMatches = [...raw.matchAll(/<action>\s*(SEARCH|DONE)\s*<\/action>/giu)];
    if (actionMatches.length) {
        const action = actionMatches[actionMatches.length - 1][1].toUpperCase();
        const queryPlans = [...raw.matchAll(/<query(?:\s+[^>]*)?>([\s\S]*?)<\/query>/giu)]
            .map(match => decodeXmlText(match[1]));
        const unresolved = [
            ...raw.matchAll(/<(?:unresolved|unresolved_gap|gap)>\s*([\s\S]*?)\s*<\/(?:unresolved|unresolved_gap|gap)>/giu),
        ].map(match => decodeXmlText(match[1]));
        return makePlannerDecision(action, queryPlans, unresolved, maxQueries);
    }

    const jsonText = findFirstJsonObject(raw);
    if (jsonText) {
        try {
            const parsed = JSON.parse(jsonText);
            const queryValues = parsed.queries ?? parsed.query ?? parsed.search_queries ?? parsed.searchQueries;
            const gapValues = parsed.unresolved_gaps
                ?? parsed.unresolvedGaps
                ?? parsed.unresolved
                ?? parsed.gaps
                ?? parsed.missing;
            const queryPlans = toPlannerArray(queryValues);
            const unresolved = toPlannerArray(gapValues);
            const hasAction = Object.prototype.hasOwnProperty.call(parsed, 'action');
            const hasStatus = Object.prototype.hasOwnProperty.call(parsed, 'status');
            const normalizedAction = hasAction ? String(parsed.action || '').toUpperCase() : '';
            const normalizedStatus = hasStatus ? String(parsed.status || '').toUpperCase() : '';
            const validAction = normalizedAction === 'SEARCH' || normalizedAction === 'DONE';
            const statusAgrees = !hasStatus || normalizedStatus === normalizedAction;
            const action = validAction && statusAgrees ? normalizedAction : 'INVALID';
            return makePlannerDecision(action, queryPlans, unresolved, maxQueries);
        } catch {
            // Fall through to the plain-text compatibility parser.
        }
    }

    const plainSearch = raw.match(/(?:^|\n)\s*SEARCH\s*:\s*(.+)$/iu);
    if (plainSearch) {
        return makePlannerDecision('SEARCH', [plainSearch[1]], [], maxQueries);
    }
    if (/(?:^|\n)\s*DONE\s*(?:$|\n)/iu.test(raw)) {
        return makePlannerDecision('DONE', [], [], maxQueries);
    }
    return makePlannerDecision('INVALID', [], [], maxQueries);
}

/**
 * Canonicalizes an HTTP(S) source URL for cross-batch identity.
 *
 * @param {unknown} value URL.
 * @returns {string} Canonical URL, or an empty string for unsupported input.
 */
export function canonicalizeUrl(value) {
    let parsed;
    try {
        parsed = new URL(String(value || '').trim());
    } catch {
        return '';
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';

    parsed.hash = '';
    parsed.username = '';
    parsed.password = '';
    parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/u, '');
    if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
        parsed.port = '';
    }

    const parameters = [];
    const seenParameters = new Set();
    for (const [name, parameterValue] of parsed.searchParams) {
        const lowerName = name.toLowerCase();
        if (lowerName.startsWith('utm_') || TRACKING_PARAMETER_NAMES.has(lowerName)) continue;
        const key = `${name}\u0000${parameterValue}`;
        if (seenParameters.has(key)) continue;
        seenParameters.add(key);
        parameters.push([name, parameterValue]);
    }
    parameters.sort(([leftName, leftValue], [rightName, rightValue]) => (
        leftName.localeCompare(rightName, 'en') || leftValue.localeCompare(rightValue, 'en')
    ));
    parsed.search = '';
    for (const [name, parameterValue] of parameters) {
        parsed.searchParams.append(name, parameterValue);
    }
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
    return parsed.toString();
}

function normalizeSourceText(value) {
    return String(value || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function getSourceNumber(source) {
    const explicitNumber = Number(source?.sourceNumber);
    if (Number.isSafeInteger(explicitNumber) && explicitNumber > 0) return explicitNumber;
    const idMatch = String(source?.sourceId || source?.id || '').match(/^S(\d+)$/iu);
    return idMatch ? Number(idMatch[1]) : 0;
}

function normalizeSourceQueries(source) {
    const queries = Array.isArray(source?.queries) ? source.queries : [source?.query];
    return [...new Set(queries.map(normalizeSourceText).filter(Boolean))];
}

function normalizeSourceRecord(source, sourceNumber) {
    const input = typeof source === 'string' ? { url: source } : source;
    if (!input || typeof input !== 'object') return null;
    const url = canonicalizeUrl(input.url || input.uri || input.link);
    if (!url) return null;
    return {
        sourceId: `S${sourceNumber}`,
        sourceNumber,
        url,
        title: normalizeSourceText(input.title),
        snippet: normalizeSourceText(input.snippet || input.description),
        published: normalizeSourceText(input.published || input.publishedAt || input.date),
        citedText: normalizeSourceText(input.citedText || input.cited_text),
        pageAge: normalizeSourceText(input.pageAge || input.page_age),
        queries: normalizeSourceQueries(input),
    };
}

function preferInformativeText(previous, incoming, canonicalUrl) {
    if (!previous || previous === canonicalUrl) return incoming || previous;
    return previous;
}

function mergeDistinctSourceText(previous, incoming, maxLength = 1600) {
    const first = normalizeSourceText(previous);
    const second = normalizeSourceText(incoming);
    if (!first) return second;
    if (!second || first === second) return first;
    if (first.includes(second)) return first;
    if (second.includes(first)) return second;
    const combined = `${first} | ${second}`;
    return combined.length <= maxLength
        ? combined
        : `${combined.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function mergeSourceRecords(previous, incoming) {
    return {
        ...previous,
        title: preferInformativeText(previous.title, incoming.title, previous.url),
        snippet: mergeDistinctSourceText(previous.snippet, incoming.snippet),
        published: previous.published || incoming.published,
        citedText: previous.citedText || incoming.citedText,
        pageAge: previous.pageAge || incoming.pageAge,
        queries: [...new Set([...previous.queries, ...incoming.queries])],
    };
}

/**
 * Adds one structured source batch without mutating either the state or batch.
 * Existing canonical URLs retain their S number.
 *
 * @param {{sources?: unknown[], nextSourceNumber?: number}|unknown[]} previousState Previous registry or source array.
 * @param {unknown[]} incomingSources New source records.
 * @returns {{sources: object[], nextSourceNumber: number, addedSourceIds: string[]}}
 */
export function mergeStructuredSourceBatch(previousState = {}, incomingSources = []) {
    let previousSources = [];
    if (Array.isArray(previousState)) {
        previousSources = previousState;
    } else if (Array.isArray(previousState?.sources)) {
        previousSources = previousState.sources;
    }
    const requestedNextNumber = Number(Array.isArray(previousState) ? 0 : previousState?.nextSourceNumber);
    const highestExistingNumber = previousSources.reduce(
        (highest, source) => Math.max(highest, getSourceNumber(source)),
        0,
    );
    let nextSourceNumber = Number.isSafeInteger(requestedNextNumber) && requestedNextNumber > highestExistingNumber
        ? requestedNextNumber
        : highestExistingNumber + 1;
    const sources = [];
    const sourceIndexes = new Map();

    const addExistingSource = source => {
        const existingNumber = getSourceNumber(source);
        const sourceNumber = existingNumber || nextSourceNumber;
        const normalized = normalizeSourceRecord(source, sourceNumber);
        if (!normalized) return;
        const existingIndex = sourceIndexes.get(normalized.url);
        if (existingIndex !== undefined) {
            sources[existingIndex] = mergeSourceRecords(sources[existingIndex], normalized);
            return;
        }
        sourceIndexes.set(normalized.url, sources.length);
        sources.push(normalized);
        if (!existingNumber) nextSourceNumber++;
        if (sourceNumber >= nextSourceNumber) nextSourceNumber = sourceNumber + 1;
    };
    previousSources.forEach(addExistingSource);

    const addedSourceIds = [];
    const batch = Array.isArray(incomingSources) ? incomingSources : [];
    for (const source of batch) {
        const normalized = normalizeSourceRecord(source, nextSourceNumber);
        if (!normalized) continue;
        const existingIndex = sourceIndexes.get(normalized.url);
        if (existingIndex !== undefined) {
            sources[existingIndex] = mergeSourceRecords(sources[existingIndex], normalized);
            continue;
        }
        sourceIndexes.set(normalized.url, sources.length);
        sources.push(normalized);
        addedSourceIds.push(normalized.sourceId);
        nextSourceNumber++;
    }

    return { sources, nextSourceNumber, addedSourceIds };
}

/**
 * Convenience wrapper when only the merged source array is needed.
 *
 * @param {unknown[]} existingSources Previously numbered sources.
 * @param {unknown[]} incomingSources New source records.
 * @returns {object[]}
 */
export function mergeStructuredSources(existingSources, incomingSources) {
    return mergeStructuredSourceBatch(existingSources, incomingSources).sources;
}
