# Hidden Web Research for SillyTavern

让没有厂商原生联网能力的主模型也能通过 SearXNG 或 SerpAPI 获取网页搜索摘要，并且不生成工具楼层、空楼层、附件或 Data Bank 文件。

当前公开版以“可直接安装到原版 SillyTavern”为边界：只开放原版酒馆已经提供的 SearXNG 与基础 SerpAPI 路由，不要求修改核心文件，也不要求安装 server plugin。

## 它解决什么问题

- Claude/Gemini 中转、DeepSeek、GLM、Kimi 或其他没有原生联网能力的模型，可以在正式回答前进行隐藏搜索。
- 当前回答模型通过 `generateRaw()` 规划查询、判断是否补搜，并负责最终写作。
- 搜索证据优先在本轮请求发出前转换为客户端工具调用与工具结果；连接不支持安全工具消息时，自动保留为临时 depth-0 `IN_CHAT` 隐藏研究包。
- 搜索结果标准化为标题、URL、摘要和可选日期；最终回答可使用紧跟事实的真实 Markdown 编号链接。
- regenerate 和 swipe 可在短时间内复用内存研究结果。

## 当前支持的联网模式

| 模式 | 原版 SillyTavern | 额外要求 |
| --- | --- | --- |
| 本机 SearXNG | 支持 | 一台酒馆服务器能够访问的 SearXNG 实例 |
| SerpAPI Google Search | 支持 | 当前用户已保存的共享 SerpAPI Key |
| AnySearch | 暂停 | 需要额外服务端代理，因此公开版不显示 |
| Claude 原生搜索桥接 | 暂停 | 当前高级协议依赖额外响应适配，因此公开版不显示 |
| Gemini 原生 Grounding | 暂停 | 原版酒馆不透传完整 Grounding 元数据，因此公开版不显示 |
| Claude/Gemini URL + Key、模型列表 | 暂停 | 需要专用服务端凭据与模型列表路由 |

暂停项目的实现代码暂时保留在硬编码关闭的内部开关后，旧设置不会继续调用它们。以后如果配套服务端方案成熟，再单独恢复。

### 本机 SearXNG

默认推荐。扩展调用原版 SillyTavern 的 `POST /api/search/searxng`，解析搜索结果页面中的标题、URL、日期和摘要。

当前路径不会继续打开并阅读完整网页，因此它属于摘要级研究，不是 Claude/Gemini 原生页面阅读能力的复制。SearXNG Base URL 应使用可信地址；在多人或公网酒馆上允许普通用户任意修改该地址可能形成服务端请求风险。

### SerpAPI Google Search

扩展复用原版 SillyTavern 自带的 `SECRET_KEYS.SERPAPI` 和 `POST /api/search/serpapi`：

- 只发送原版路由可靠支持的 `{ query }`。
- 使用当前激活的共享 SerpAPI Key；扩展内保存的新 Key 也会被 WebSearch 等其他功能使用。
- 每条规划查询只请求一页，不自动分页放大费用。
- 只采用带合法 HTTP(S) 链接的自然搜索结果。

`hl`、`gl`、指定 secret ID、专用超时和脱敏服务端错误等增强参数目前暂停，不在界面中显示。SerpAPI 协议可参考 [Google Search API](https://serpapi.com/search-api) 与 [Organic Results](https://serpapi.com/organic-results)。

## 当前回答模型的查询规划与最终回答策略

这一项同时控制：模糊场景是否值得搜索、查询怎样拆分和补搜、证据齐全后当前模型怎样组织最终回答。它不会替换当前模型，也不会调用所选厂商的官方搜索服务器：

- **自动识别**：按当前连接的真实模型 ID 选择下列策略；这是本地字符串匹配，不是让 AI 自报身份。
- **Claude 启发：必要性门控 / 顺序查证**：先做知识优先的必要性检查；显式联网、时效事实、高精度核实、精确出处或低置信度缺口才搜索。每轮只查一个最高价值问题，总计最多 3 条；回答结论先行，优先最强权威来源并克制引用。
- **Gemini 启发：搜索增益 / 查询提炼**：判断检索能否实质改善正确性、时效性、归因或完整性，再把需求改写成简短的高意图查询。首轮仅在分面真正互补时最多 2 条，之后每轮 1 条，总计最多 4 条；回答偏向逐段 Grounding 和并列互补证据。
- **DeepSeek V4 Pro：分面合并**：把同一主管机关可回答的相关分面合并，首轮最多 2 条，总计最多 4 条；回答区分检索事实与模型推断。
- **GLM 5.2：层级核验**：先找主管机关、标准组织或权威汇总，再按辖区、定义、时间线或统计口径逐层补缺；总计最多 4 条。
- **Kimi K3：研究收敛**：以最小充分证据链快速收敛，避免展开 Deep Research 树；总计最多 3 条。
- **Other / 通用**：知识优先、每轮 1 条、总计最多 3 条，证据充分即停。

自动识别优先读取当前真实模型 ID。无法精确匹配目标旗舰型号的旧 DeepSeek、GLM、Kimi 会回退到 Other / 通用。私有 `hwr_planner_profile` 标记及其配套服务端强制逻辑当前暂停；提示词策略、查询硬帽、近重复抑制和证据合并仍正常工作。

实际查询数取“高级限制”和上述策略硬上限中的较小值。扩展仍可设置原版酒馆支持的普通规划请求参数，是否被采用由当前酒馆版本和上游渠道决定。

搜索后还会应用相应的最终回答契约。这些都是基于公开行为的启发式模拟；扩展不会伪造 Anthropic/Google 私有提示词、`groundingMetadata`、官方搜索声明或厂商签名。普通中转最终看到的是带外部证据的本轮临时上下文，并由当前模型自己完成回答。

## 搜索结果怎样注入

- **隐藏工具结果优先（推荐）**：扩展先用临时 `IN_CHAT` 标记让 SillyTavern 正确计算本轮 token；正式请求构造完成后，再只在内存中把该标记换成一个客户端工具调用及其结果。SillyTavern 会按当前来源转换：Claude 为 `tool_use/tool_result`，Gemini 为 `functionCall/functionResponse`，DeepSeek/OpenAI 兼容来源为 `tool_calls/tool`。
- **固定使用隐藏研究包**：始终把同一份中性证据包作为本轮临时 system 上下文发送，适合拒绝工具历史、错误上报能力或没有开启函数调用的中转。

两种方式都不会写入 `context.chat`，因此不会生成空楼层或工具楼层；生成结束后临时提示会被清除。工具通道使用扩展自己的 `hwr_web_search` 名称，表示“客户端已经完成搜索”，并不宣称结果来自 Claude 或 Gemini 官方服务器。

自动模式会先依据当前 SillyTavern 连接能力选择通道。若请求还没发出时不能安全转换，就保留隐藏研究包；如果不可靠的中转在收到工具消息后才返回 4xx，浏览器扩展无法在同一轮透明重放，应该在设置中改为“固定使用隐藏研究包”。

当前扩展对 Gemini 3 专用来源保守使用隐藏研究包：SillyTavern 1.18.0 的转换器不会把 OpenAI 兼容调用 ID 写入 Gemini `functionCall/functionResponse`，无法在不改后端的前提下可靠模拟多查询匹配。Claude 与 DeepSeek 专用来源不受这个限制。

## 触发策略与 token

- **模型自动判断**：除纯本地日期/时间外，会调用当前回答模型作为隐藏规划器。明确联网、天气、动态信息、推荐、URL 等高置信场景由本地门控保证至少搜索一次；普通或模糊场景由上面的模型策略返回 `SEARCH` 或 `DONE`。即使最终不搜索，也会消耗规划 tokens。
- **每条消息都调用并至少搜索一次**：仍先调用隐藏规划器来提炼查询，但它不能否决首次搜索；本条明确禁止联网和纯本地日期/时间是例外。
- **仅在用户明确要求联网时搜索**：先由本地规则识别“联网查、网页搜索、给来源、查证报道”等请求。未命中时零模型 token 跳过；命中后再调用规划器组织查询，并保证至少搜索一次。

换句话说，“查询与回答策略”决定**怎样判断模糊情况、怎样查、怎样写**；“触发策略”决定**这一轮是否进入研究流程，以及首次搜索能否被跳过**。当前用户明确要求“不联网”始终拥有最高优先级。规划器不会向用户直接回答；所有历史文本和搜索摘要都作为不可信数据封装，网页中的指令不会被执行。

## 无额外楼层的实现

1. 正式生成开始前，`generate_interceptor` 读取最近对话。
2. 当前模型通过隐藏 `generateRaw()` 请求规划查询。
3. 扩展调用 SearXNG 或 SerpAPI，并根据证据缺口决定是否补搜。
4. 扩展先把带唯一标记的研究包作为临时 system-role `IN_CHAT` 提示加入本轮 token 预算。
5. 在 `CHAT_COMPLETION_SETTINGS_READY` 阶段，自动模式会把标记块改写为请求内的客户端工具调用与工具结果；不能安全改写时原样保留中性研究包。
6. `GENERATION_ENDED`、`GENERATION_STOPPED` 和 `CHAT_CHANGED` 都会清除临时状态。

研究证据不会写入聊天、工具调用消息、附件、Data Bank、LocalStorage 或 IndexedDB，但会临时发送给最终回答所使用的模型或中转。

这种方式能模拟“先搜索、再综合、按事实引用”的回答流程和请求内工具历史，但不能生成厂商原生 UI 的引用卡片、服务器签名或 Grounding 元数据。

## 建议设置

- 联网模式：本机 SearXNG
- 查询规划策略：自动识别
- 搜索结果注入：隐藏工具结果优先
- 触发策略：需要节省规划 token 时选择“仅明确要求联网”；希望模型自动决定时选择“模型自动判断”
- 最多规划轮数：3
- 每轮最多查询：2
- 每次结果数：6
- 总证据字符：18000
- regenerate 复用：600 秒

酒馆原生“启用联网搜索”和 WebSearch 扩展内部 `Enabled`、`Use Function Tool` 应保持关闭；Hidden Web Research 直接复用酒馆服务端搜索路由。Claude 与多数来源要使用隐藏工具结果通道时，请开启全局“启用函数调用”；DeepSeek 专用来源的已完成工具历史不依赖这个开关。其他不满足条件的连接会自动回退隐藏研究包。

## 安装与更新

在 SillyTavern 中打开“扩展程序”→“安装扩展”，粘贴：

```text
https://github.com/PigmentTokyo/Extension-HiddenWebResearch
```

当前版本为 `1.8.1`。`manifest.json` 保持 `auto_update: false`，已经安装的用户需要在扩展管理器中手动检查并执行更新。

`1.8.1`：

- 重写 Claude 与 Gemini 的隐藏自动判断提示词：前者采用必要性门控和顺序查证，后者采用搜索增益判断与高意图查询提炼；
- 为 DeepSeek V4 Pro、GLM 5.2、Kimi K3 与通用模式补齐独立规划指令，同时保留各自查询硬帽与最终回答契约；
- 规划器只接收结构化、转义后的最新用户请求、真实历史消息和证据，不读取 system 预设、示例消息或最新用户消息后的旧 swipe；
- 强化首次强制搜索、严格 JSON 语义校验及规划异常后的不完整研究标记；研究缓存按触发策略隔离，避免错误结果跨策略复用；
- 长消息以首尾保留方式交给规划器，并在网络发送前阻止常见 API Key、Bearer、JWT 与私钥样式的搜索词。

`1.8.0`：

- 新增“隐藏工具结果优先 / 固定使用隐藏研究包”双通道；
- 工具通道只修改本轮即将发送的请求，不写入聊天记录，并由 SillyTavern 转换为当前来源支持的工具消息格式；
- 隐藏规划请求和带研究证据的最终请求都会显式关闭厂商原生联网，避免插件结果与上游搜索混用；
- 规划与搜索只读取真实 `context.chat` 用户消息，不把预设示例或正则生成内容误当成待搜索问题；
- 工具能力不足时在发送前自动回退中性研究包，并提供固定回退选项兼容会拒绝工具历史的中转。

`1.7.3`：

- 每次生成只抓取一次浏览器本地时间与对应 UTC 瞬间，并把同一份可信时钟交给隐藏规划器和最终回答模型；
- “今天、明天、截至目前”等时效查询分面会追加明确日期与浏览器时区，静态或历史分面保持原样；
- “今天几号、现在几点”等纯时间问题直接由请求时钟回答，不调用规划器或搜索服务；
- 异地日期与时间查询携带 UTC 请求分钟并按分钟分区缓存，不把浏览器本地时间冒充目标地点时间；
- 所有研究缓存按本地日期与时区分区，缓存中的研究包本身不固化时间戳。

`1.7.2`：

- 修复没有启用 `main` 提示块的预设会静默丢失研究证据的问题；
- 为 Claude、Gemini 与三种旗舰国模增加独立最终回答契约；
- 为天气等动态主题和规划器异常增加可靠搜索回退。

从 `1.7.0` 更新时，如果旧设置正在使用 AnySearch、Claude 原生桥接或 Gemini 原生直答，`1.7.1` 会：

- 把联网模式安全切回 SearXNG；
- 同时关闭扩展，要求用户重新确认模式后手动启用；
- 清除临时注入与内存缓存；
- 保留旧 URL、模型和服务端密钥，不做破坏性删除。

## 密钥与日志

SerpAPI 密码框只用于写入当前 SillyTavern 用户的共享服务端 secrets；成功后不会把明文 Key 写进扩展设置或聊天。删除当前共享 Key 会同时影响 WebSearch 等其他使用者，因此界面会二次确认。

本扩展自己的调试日志不打印搜索正文。原版 SillyTavern 的服务端搜索路由可能按照其自身实现记录查询或上游响应；在多人或公网环境使用前，请根据你的隐私要求审查并配置酒馆日志。

## 开发检查

```powershell
node tests/runtime-time.test.mjs
node tests/research-transport.test.mjs
node tests/gemini-grounding.test.mjs
node tests/native-search-metrics.test.mjs
node tests/planner-strategies.test.mjs
node tests/planner-prompts.test.mjs
node tests/query-safety.test.mjs
node tests/search-providers.test.mjs
node tests/feature-policy.test.mjs
```

原生 Claude/Gemini 解析器测试暂时继续保留，作为以后恢复实验能力时的回归基线；测试存在不代表公开版已经开放对应功能。

<!--
PAUSED SERVER-DEPENDENT IMPLEMENTATION

The following code paths intentionally remain unreachable while
ENABLE_SERVER_DEPENDENT_FEATURES is false:
- AnySearch proxy and credential UI
- Claude native bridge and Claude/Gemini direct credential bundles
- Native model-list route
- Gemini Grounding metadata passthrough and direct grounded answer
- private hwr_planner_profile marker and server-side enforcement

Do not re-enable UI, bindings, dispatch, or documentation independently.
A future implementation must provide a versioned server capability handshake
and complete end-to-end tests before this flag can change.
-->
