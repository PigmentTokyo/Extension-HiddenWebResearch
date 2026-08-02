# P1G搜（颜料搜） for SillyTavern

项目的用户可见名称现为 **P1G搜（颜料搜）**。为保证已安装用户能够原地更新，技术仓库名、安装目录和内部兼容 ID 继续保持 `Extension-HiddenWebResearch` / `HiddenWebResearch`。

让没有厂商原生联网能力的主模型也能通过 SearXNG 或 SerpAPI 获取网页搜索摘要，并且不生成工具楼层、空楼层、附件或 Data Bank 文件。

当前公开版以“可直接安装到原版 SillyTavern”为边界：只开放原版酒馆已经提供的 SearXNG 与基础 SerpAPI 路由，不要求修改核心文件，也不要求安装 server plugin。

## SillyTavern 版本兼容

- 最低支持 SillyTavern `1.13.3`；这是该版本首次同时具备扩展所需的对象式 `generateRaw()`、带生成类型的请求改写事件、多密钥接口和当前搜索路由协议。
- `1.13.3–1.14.x` 保留 SearXNG、SerpAPI、隐藏规划、时间锚、模型策略、自定义提示词、缓存和无额外楼层等全部公开能力。由于这些版本不能把 `tool_choice: none` 可靠转换给 Gemini，Gemini 会自动走同一份中性隐藏研究包；Claude、DeepSeek 和其他安全来源仍可使用隐藏工具结果。
- `1.15.0` 及以上保持当前双通道行为：安全时优先隐藏工具结果，其他情况自动回退隐藏研究包；Gemini 3 继续保守回退。
- 指定 Connection Profile 作为副规划 API 的请求能力从 `1.13.3` 起即可使用；但 `1.13.3–1.17.x` 使用对应 SillyTavern Chat Completion 来源当前激活的密钥槽，`1.18.0` 起才能按 Profile 精确绑定独立 `secret-id`。
- 插件内命名直连副规划器要求 `1.18.0+`：只有这些版本才能把每个 OpenAI-compatible URL / 模型精确绑定到各自的服务端 `secret-id`。旧版继续使用当前回答模型或 Connection Profile，不会退化为全局轮换 Key 或浏览器明文保存。
- `1.18.x` 仍是主要实机回归环境。降低最低版本不会删除或关闭新版本上的任何现有功能。

兼容判断采用实际接口和请求能力，并对旧版 Gemini 协议做安全降级；不是简单绕过 manifest。低于 `1.13.3` 的版本不会加载本扩展。

## 它解决什么问题

- Claude/Gemini 中转、DeepSeek、GLM、Kimi 或其他没有原生联网能力的模型，可以在正式回答前进行隐藏搜索。
- 可把查询规划、补搜与充分性判断交给当前回答模型，也可指定另一个 Connection Manager Profile 作为便宜的副 API；最终正文始终由当前主模型写作。
- 在 SillyTavern 1.18.0 及以上，也可直接填写 OpenAI-compatible Base URL、模型和 Key，并把最多 20 组副规划 API 命名保存、随时切换；网页搜索仍由 SearXNG 或 SerpAPI 执行。
- 当前模型模式继续通过 `generateRaw()` 规划；副 API 模式不会切换当前回答的来源、Profile、URL 或模型，也不要求修改后端或安装 server plugin。直连模式首次写入空 Custom 密钥槽时会改变全局活动 Custom credential，这是原版 secrets 的共享槽例外，详见下方警告。
- 搜索证据优先在本轮请求发出前转换为客户端工具调用与工具结果；连接不支持安全工具消息时，自动保留为临时 depth-0 `IN_CHAT` 隐藏研究包。
- 搜索结果标准化为标题、URL、摘要和可选日期；最终回答可使用紧跟事实的真实 Markdown 编号链接。
- regenerate 和 swipe 可在短时间内复用内存研究结果。

## 当前支持的联网模式

| 模式 | 原版 SillyTavern | 额外要求 |
| --- | --- | --- |
| 本机 SearXNG | 支持 | 一台酒馆服务器能够访问的 SearXNG 实例 |
| SerpAPI Google Search | 支持 | 当前用户已保存的共享 SerpAPI Key |
| OpenAI-compatible URL + Key 副规划器 | 1.18.0+ 支持 | 只负责隐藏规划；搜索仍使用上面的 SearXNG / SerpAPI |
| AnySearch | 暂停 | 需要额外服务端代理，因此公开版不显示 |
| Claude 原生搜索桥接 | 暂停 | 当前高级协议依赖额外响应适配，因此公开版不显示 |
| Gemini 原生 Grounding | 暂停 | 原版酒馆不透传完整 Grounding 元数据，因此公开版不显示 |
| Claude/Gemini 原生搜索 URL + Key、模型列表 | 暂停 | 需要专用服务端凭据与原生协议适配；不同于 OpenAI-compatible 副规划器 |

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
- **Claude 启发：必要性门控 / 顺序查证**：先做知识优先的必要性检查；显式联网、时效事实、高精度核实、精确出处或低置信度缺口才搜索。推荐首轮 1 条、后续每轮 1 条、总计约 3 条；回答结论先行，优先最强权威来源并克制引用。
- **Gemini 启发：搜索增益 / 查询提炼**：判断检索能否实质改善正确性、时效性、归因或完整性，再把需求改写成简短的高意图查询。推荐首轮仅在分面真正互补时使用 2 条、后续每轮 1 条、总计约 4 条；回答偏向逐段 Grounding 和并列互补证据。
- **DeepSeek V4 Pro：分面合并**：把同一主管机关可回答的相关分面合并，推荐首轮 2 条、总计约 4 条；回答区分检索事实与模型推断。
- **GLM 5.2：层级核验**：先找主管机关、标准组织或权威汇总，再按辖区、定义、时间线或统计口径逐层补缺；推荐总计约 4 条。
- **Kimi K3：研究收敛**：以最小充分证据链快速收敛，避免展开 Deep Research 树；推荐总计约 3 条。
- **Other / 通用**：知识优先、推荐每轮 1 条、总计约 3 条，证据充分即停。

自动识别优先读取当前真实模型 ID。无法精确匹配目标旗舰型号的旧 DeepSeek、GLM、Kimi 会回退到 Other / 通用。私有 `hwr_planner_profile` 标记及其配套服务端强制逻辑当前暂停；提示词策略、查询数量建议、近重复抑制和证据合并仍正常工作。

上述数量现在只负责引导经济型查询，不再是隐藏硬帽。实际执行硬上限完全由“高级限制”的最多轮数、每轮最多查询和总查询上限共同决定，用户可在允许范围内自主提高或降低。扩展仍可设置原版酒馆支持的普通规划请求参数，是否被采用由当前酒馆版本和上游渠道决定。

搜索后还会应用相应的最终回答契约。这些都是基于公开行为的启发式模拟；扩展不会伪造 Anthropic/Google 私有提示词、`groundingMetadata`、官方搜索声明或厂商签名。普通中转最终看到的是带外部证据的本轮临时上下文，并由当前模型自己完成回答。

## 隐藏搜索规划 API

“规划器来源”与上面的“查询规划与最终回答策略”是两件不同的事：

- **当前回答模型（默认）**：保持旧版行为，由当前主连接执行隐藏规划，再由同一主模型生成最终正文。
- **指定 Connection Manager Profile（副 API）**：所选 Profile 只负责 `SEARCH / DONE` 判断、查询词生成、补搜与最后的证据充分性评估；正文仍走当前主连接。
- **插件内 OpenAI-compatible 直连（1.18.0+）**：直接选择一组已命名保存的 Base URL、模型与服务端 Key，只把隐藏规划请求交给它；最终正文仍走当前主连接。
- **策略下拉框**：决定规划提示词和最终回答契约。它不会自动切换到对应厂商；例如主模型 DeepSeek、策略选 Claude、副规划 Profile 选 Gemini 时，Gemini 会执行 Claude 启发的规划规则，而最终正文仍由 DeepSeek 写。

### Connection Manager Profile

副 API 模式复用原版 SillyTavern 的 `ConnectionManagerRequestService.sendRequest()`：

- 只列出 Chat Completion Profile，避免 Text Completion 的 Instruct 模板污染严格规划 JSON。
- 插件设置只保存 Profile ID；URL、Proxy 和服务商 Key 仍由 Connection Manager / SillyTavern secrets 管理。Reverse Proxy Preset 的密码由酒馆自身的 Proxy Preset 设置机制管理。
- 不修改 `selectedProfile` 或当前聊天连接，因此不存在“切到副模型后忘记切回”的竞态。
- Profile 请求显式设置 `enable_web_search: false` 且不提交搜索工具，所以插件不会主动请求厂商原生搜索；但无法阻止 `:online` 型号、先天联网模型或中转网关强制搜索，这类服务仍可能另行收费。
- 不额外加载角色卡、世界书、Completion Preset 或 Instruct 模板；仍保留 Profile 为适配目标 API 所记录的端点、模型、代理与协议处理设置。最近真实聊天中的角色扮演内容仍会按上下文范围发送。
- 副规划器会收到最新用户请求、设置范围内的最近真实聊天消息、补搜阶段已经取得的网页摘要，以及启用的自定义规划补充词。只选择自己信任的 Profile 和 HTTPS 端点，不要把不愿发送给该副 API 的内容放进规划上下文。
- Connection Manager、Proxy Preset 与所有同源第三方扩展属于同一前端信任域。副规划 Profile 路径不会读取或复制 Connection Manager 中已保存的 Key，但无法替用户审计 Custom API 或中转服务器。

### 插件内 OpenAI-compatible 直连（仅 1.18.0+）

不想先建立 Connection Profile 时，可以直接在扩展里填写 OpenAI-compatible Base URL、精确模型 ID 和 Key。该路径只使用原版 SillyTavern 已有的 Custom Chat Completion 与 secrets 接口，不增加后端路由，不修改核心文件，也不需要 server plugin。

- 最多保存 20 组命名配置；选择另一项只会改变下一次隐藏规划请求所引用的 URL、模型和精确 `secret-id`，不会修改当前回答模型的 URL 或模型。Custom 活动密钥槽的首次写入副作用见下条。
- Key 写入当前 SillyTavern 用户的服务端 `SECRET_KEYS.CUSTOM` secrets。扩展设置只保存 `{ id, name, apiUrl, model, secretId }` 元数据，密码框保存后清空，明文 Key 不会回显，也不会写入扩展设置、缓存或聊天。
- 原版 `/api/secrets/write` 会把新 Key 设为活动 Custom Key。若保存前已有活动项，扩展只有在活动项仍是刚写入的新 Key 时才恢复旧项，避免覆盖另一标签页或扩展的后续轮换；若保存前整个 Custom 槽为空，原版酒馆要求非空槽恰有一个活动项，因此新规划 Key 会持续成为全局活动 Custom Key。插件不会改变主模型 URL 或模型，但以后任何没有精确 `secret-id` 的 Custom 请求可能把它发送到自己的 Custom URL。首次空槽保存会二次确认；不接受该共享槽副作用时请取消并改用合适来源的 Connection Manager Profile，或先建立希望保持活动的 Custom Key。保存期间不要在其他标签页并行生成或改 Custom Key；选择已有配置本身不会轮换 Key。
- 配置与 Key 操作都采用服务端回读确认；事务开始前会先取消尚未执行的酒馆延迟保存、立即保存当前完整设置并回读，无法确认落盘时不会写 Key 或删除旧 Key。旧 Key 只有在确认由本插件创建、处于非活动状态、且服务端落盘状态与当前页面都确认未被其他本插件配置或 Connection Manager Profile 引用时才会自动清理，其余情况保留并提示到酒馆密钥管理器手工检查。
- 保存或删除直连副 API 配置时，插件会从事务开始到设置回读与 Key 清理结束，短时锁定当前标签页的发送、继续、重生成、滑动和停止入口；纯 URL / 模型 / 名称修改也使用同一把锁，避免隐藏研究读取到半完成配置。写入 Key 的窗口内，当前页走原版 `CHAT_COMPLETION_SETTINGS_READY` 管线、且没有显式 `secret-id` 的 Custom 请求（包括后台 `generateRaw()`）还会被临时指定到每事务唯一且不存在的 secret ID：并发请求会因无有效凭据而失败，不会回退到瞬时活动的规划 Key。若写入、恢复或回滚后无法证明全局活动 Custom Key 安全，该保护和当前标签页发送锁都会保持到刷新。其他标签页无法由前端扩展锁定；同源扩展若绕过酒馆事件管线直接 `fetch`，或预先捕获并自行调用更底层的原函数，也处于同一信任边界，前端扩展无法可靠封锁。因此仍不要并行生成或轮换 Custom Key，并只安装可信扩展。
- Base URL 可填写形如 `https://example.com/v1` 的地址；如果粘贴末尾 `/chat/completions`，扩展会归一化为 Base URL。修改已保存配置的 URL 时必须重新输入 Key，避免把旧凭据意外发送到新站点。
- 只支持 OpenAI Chat Completions 兼容协议。只提供 Anthropic Messages 或 Gemini `generateContent` 原生接口的地址不能直接使用；请在 Connection Manager 建立对应来源的 Chat Completion Profile。
- 直连模型仍只执行 `SEARCH / DONE`、查询生成、补搜和证据充分性判断。真正的网页查询继续由已选 SearXNG / SerpAPI 完成，最终正文始终由当前回答模型生成。
- 请求显式关闭酒馆原生联网且不提交搜索工具，但无法阻止名称含 `:online`、模型自身或中转网关强制搜索；这可能产生额外搜索费用。
- 请求由 SillyTavern 服务器发往所填地址。非 HTTPS 或不可信端点能够看到 Key、规划提示、设置范围内的最近聊天和搜索摘要；除可信本机回环地址外应坚持 HTTPS。允许普通用户填写任意地址还可能形成服务端请求（SSRF）风险，多人或公网酒馆必须限制配置权限并审计目标端点。

默认启用“副 API 失败时回退当前回答模型”：一次 Profile / 直连配置缺失、超时、上游错误、空回复或格式错误后，本轮后续规划直接走当前模型，不会每轮先失败一次再双重计费。用户停止或切换聊天造成的 abort 会立即结束插件等待且不会再启动回退；但已经送达上游、或渠道忽略取消信号的请求仍可能继续执行和计费。关闭该选项后，坏配置仍会在本轮熔断而不再重复收费；明确必须搜索的请求可使用本地安全查询兜底，模糊请求则继续普通生成。

### 旧版 Key 选择限制

| SillyTavern | Profile 的 URL / 模型 / 来源 | Profile 独立 Key |
| --- | --- | --- |
| 1.13.3–1.17.x | 支持 | 不完整：使用对应 Chat Completion 来源当前激活的密钥槽 |
| 1.18.0+ | 支持 | 支持按 Profile 的 `secret-id` 精确选择 |

因此旧版如果主模型与副规划器使用同一个 SillyTavern Chat Completion 来源密钥槽、又必须使用两把不同 Key，不能承诺真正隔离。可让副规划器使用另一来源，或先把规划 Key 设为该来源的当前激活 Key。扩展不会通过临时轮换 Key 或切换 Profile 绕过此限制，因为那会改变全局状态并产生并发竞态。

插件内 URL + Key 直连采用更严格的边界：`1.13.3–1.17.x` 不开放该模式，只能选择当前回答模型或现有 Connection Profile。扩展不会为兼容旧版而轮换全局 `SECRET_KEYS.CUSTOM` 活跃 Key，也不会把 raw Key 保存到 extension settings、LocalStorage 或其他客户端存储；升级到 `1.18.0+` 后才能安全使用多配置独立 `secret-id`。

Reverse Proxy Profile 是例外：它使用 Proxy Preset 的 password，而不是服务商 `secret-id`；该密码遵循 SillyTavern 自身的 Proxy Preset 设置与存储机制。

## 搜索结果怎样注入

- **隐藏工具结果优先（推荐）**：扩展先用临时 `IN_CHAT` 标记让 SillyTavern 正确计算本轮 token；正式请求构造完成后，再只在内存中把该标记换成一个客户端工具调用及其结果。SillyTavern 会按当前来源转换：Claude 为 `tool_use/tool_result`，Gemini 为 `functionCall/functionResponse`，DeepSeek/OpenAI 兼容来源为 `tool_calls/tool`。
- **固定使用隐藏研究包**：始终把同一份中性证据包作为本轮临时 system 上下文发送，适合拒绝工具历史、错误上报能力或没有开启函数调用的中转。

两种方式都不会写入 `context.chat`，因此不会生成空楼层或工具楼层；生成结束后临时提示会被清除。工具通道使用扩展自己的 `hwr_web_search` 名称，表示“客户端已经完成搜索”，并不宣称结果来自 Claude 或 Gemini 官方服务器。

自动模式会先依据当前 SillyTavern 连接能力选择通道。若请求还没发出时不能安全转换，就保留隐藏研究包；如果不可靠的中转在收到工具消息后才返回 4xx，浏览器扩展无法在同一轮透明重放，应该在设置中改为“固定使用隐藏研究包”。

当前扩展对 Gemini 3 专用来源始终保守使用隐藏研究包，因为当前酒馆转换协议无法在多次同名搜索时可靠保留调用 ID。SillyTavern 1.13.3–1.14.x 的 Gemini 后端还不能可靠执行 `tool_choice: none`，因此这些版本的全部 Gemini 来源都会自动回退隐藏研究包；1.15.0 及以上的非 Gemini 3 来源可恢复工具通道。Claude 与 DeepSeek 专用来源不受这个限制。

## 触发策略与 token

- **模型自动判断**：除纯本地日期/时间外，会调用所选隐藏规划器。明确联网、天气、动态信息、推荐、URL 等高置信场景由本地门控保证至少搜索一次；普通或模糊场景由模型策略返回 `SEARCH` 或 `DONE`。即使最终不搜索，也会消耗规划 tokens。
- **每条消息都调用并至少搜索一次**：仍先调用所选规划器来提炼查询，但它不能否决首次搜索；本条明确禁止联网和纯本地日期/时间是例外。
- **仅在用户明确要求联网时搜索**：先由本地规则识别“联网查、网页搜索、给来源、查证报道”等请求。未命中时零模型 token 跳过；命中后再调用所选规划器组织查询，并保证至少搜索一次。

无论选择当前模型、Connection Profile 还是插件内直连，每一次首轮判断、补搜规划或最终充分性评估都是一次独立的规划模型 API 调用，会分别产生 token / 费用；最终正文又是当前主模型的一次调用。SearXNG / SerpAPI 查询是另一类搜索请求。选择 `:online` 或会强制联网的副模型时，即使插件关闭了原生搜索字段，上游仍可能自行搜索并额外收费。

换句话说，“查询与回答策略”决定**怎样判断模糊情况、怎样查、怎样写**；“触发策略”决定**这一轮是否进入研究流程，以及首次搜索能否被跳过**。当前用户明确要求“不联网”始终拥有最高优先级。规划器不会向用户直接回答；所有历史文本和搜索摘要都作为不可信数据封装，网页中的指令不会被执行。
### 自定义补充提示词

设置页提供两套彼此独立的补充词，并各自带“保存”和“恢复内置默认”：

- **查询规划与最终回答策略补充**：同时影响查询焦点、来源偏好、补搜顺序、证据充分性，以及有搜索结果时主模型怎样组织最终回答；它不会把模型替换成下拉框所写的厂商。规划由所选规划器执行，最终正文始终由当前主模型执行。
- **触发判断补充**：只影响模糊场景是否值得进入研究。它不能取消明确搜索、天气等本地高置信门控，也不能绕过“仅明确要求联网”的本地跳过。

两者都是内置固定策略之上的低优先级补充层。明确“不联网”、纯本机日期/时间绕过、查询轮数与数量硬上限、凭据拦截、严格规划输出、证据安全和禁止伪装厂商原生搜索始终优先。“恢复内置默认”会清除相应补充词并自动使用当前版本的内置规则，不会改动其他设置。补充词最长 4000 字符，会发送给所选规划器；取得证据后还会进入主模型的最终回答上下文。不要填写 Key、Token、密码或私人信息。

## 无额外楼层的实现

1. 正式生成开始前，`generate_interceptor` 读取最近对话。
2. 当前模型通过隐藏 `generateRaw()`、指定 Connection Profile，或 1.18.0+ 的插件内 OpenAI-compatible 直连配置执行规划查询。
3. 扩展调用 SearXNG 或 SerpAPI，并根据证据缺口决定是否补搜。
4. 扩展先把带唯一标记的研究包作为临时 system-role `IN_CHAT` 提示加入本轮 token 预算。
5. 在 `CHAT_COMPLETION_SETTINGS_READY` 阶段，自动模式会把标记块改写为请求内的客户端工具调用与工具结果；不能安全改写时原样保留中性研究包。
6. `GENERATION_ENDED`、`GENERATION_STOPPED` 和 `CHAT_CHANGED` 都会清除临时状态。

研究证据不会写入聊天、工具调用消息、附件、Data Bank、LocalStorage 或 IndexedDB，但会临时发送给最终回答所使用的模型或中转。

这种方式能模拟“先搜索、再综合、按事实引用”的回答流程和请求内工具历史，但不能生成厂商原生 UI 的引用卡片、服务器签名或 Grounding 元数据。

## 建议设置

- 联网模式：本机 SearXNG
- 查询规划策略：自动识别
- 规划器来源：默认当前回答模型；想转移规划费用时可选独立 Connection Profile，SillyTavern 1.18.0+ 也可选插件内命名保存的 OpenAI-compatible URL + Key
- 搜索结果注入：隐藏工具结果优先
- 触发策略：需要节省规划 token 时选择“仅明确要求联网”；希望模型自动决定时选择“模型自动判断”
- 最多规划轮数：3
- 每轮最多查询：2
- 每次结果数：6
- 总证据字符：18000
- regenerate 复用：600 秒

酒馆原生“启用联网搜索”和 WebSearch 扩展内部 `Enabled`、`Use Function Tool` 应保持关闭；P1G搜（颜料搜）直接复用酒馆服务端搜索路由。Claude 与多数来源要使用隐藏工具结果通道时，请开启全局“启用函数调用”；DeepSeek 专用来源的已完成工具历史不依赖这个开关。其他不满足条件的连接会自动回退隐藏研究包。

## 安装与更新

在 SillyTavern 中打开“扩展程序”→“安装扩展”，粘贴：

```text
https://github.com/PigmentTokyo/Extension-HiddenWebResearch
```

当前版本为 `1.10.0`。最低支持 SillyTavern `1.13.3`；`manifest.json` 保持 `auto_update: false`，已经安装的用户需要在扩展管理器中手动检查并执行更新。

`1.10.0`：

- 新增插件内 OpenAI-compatible 副规划 API：填写 Base URL、模型与 Key，可命名保存并切换最多 20 组配置，主回答连接不变；
- Key 使用原版 SillyTavern `SECRET_KEYS.CUSTOM` 服务端 secrets 保存，扩展设置只保留配置元数据与 `secretId`，不会保存或回显明文；
- 保存、轮换、设置落盘与删除增加服务端回读校验；状态不明、活动中、非插件所有或仍被 Connection Manager 引用的 Key 都会保留，避免刷新后配置断链；
- 原版写 Key 会短暂激活新值，插件阻止当前页生成期间保存并在未检测到并发轮换时恢复原活动项；选择已有配置本身不轮换 Key；
- 精确隔离的多 Key 直连模式仅在 SillyTavern 1.18.0+ 开放；1.13.3–1.17.x 继续使用当前模型或 Connection Profile，不轮换全局 Key，也不降级为客户端明文存储；
- 直连规划不要求修改后端或安装 server plugin；网页搜索仍使用 SearXNG / SerpAPI，最终正文仍由当前回答模型生成；
- URL 变更必须重新输入 Key；限制为 OpenAI Chat Completions 兼容端点，并补充 HTTPS、第三方信任与 SSRF 风险提示；
- 规划请求继续按每轮独立 API 调用计费，并保留失败熔断、单次回退、取消丢弃晚到结果及 `:online` 强制联网边界；
- 新增直连配置规范化、20 项上限、就绪检查、无明文缓存指纹与 1.18.0 secret-id 能力边界测试。

`1.9.0`：

- 新增“隐藏搜索规划 API”，可选择任意 Chat Completion Connection Profile 作为副规划器，主回答连接与最终正文模型保持不变；
- Profile 模式不保存副规划器 URL/Key、不切换全局 Profile、不依赖 server plugin；插件不主动提交搜索工具，也不额外加载角色卡、世界书、Completion/Instruct 预设；
- 副 API 缺失、空回复、格式错误、超时或上游失败时可整轮熔断并回退当前模型；用户取消不回退且晚到结果不会污染新聊天，但上游忽略取消时已接收请求仍可能计费；
- 研究缓存加入规划模式、Profile ID、模型、URL 和回退策略指纹；设置 schema 升为 10，旧配置自动使用原有“当前回答模型”方式；
- 明示 1.13.3–1.17.x 使用对应来源当前激活密钥槽、1.18.0 起才支持按 Profile 独立 `secret-id` 的版本边界。

`1.8.4`：

- 将最低 SillyTavern 版本从 1.18.0 下调到 1.13.3，并增加运行时接口检查，避免只改清单造成“能安装但规划或注入失效”；
- 在 1.13.3–1.14.x 上保留全部搜索、规划与无楼层能力，同时对不能可靠禁止二次工具调用的 Gemini 自动使用隐藏研究包；1.15.0 及以上保持原有双通道；
- DeepSeek 的已完成工具调用消息显式补充空 `reasoning_content`，兼容 1.13.3–1.14.x 的旧后端，并与新版自动补全逻辑兼容；
- 新增最低版本、请求生命周期、版本能力和 1.13.3 请求形状回归测试；设置 schema 仍为 9，现有配置无需迁移。

`1.8.3`：

- 用户可见插件名称统一更新为“P1G搜（颜料搜）”，覆盖扩展列表、设置抽屉、通知、确认框、调试前缀和模型内部说明；
- GitHub 仓库名、安装目录、设置键、拦截器、提示键与工具协议标识保持不变，已安装用户可原地更新且无需迁移设置；
- 设置 schema 保持 9，本次更新不会重置联网后端、自定义提示词或高级限制。

`1.8.2`：

- 在“触发策略”和“查询规划与最终回答策略”下分别增加受约束的自定义补充提示词，支持保存草稿、启用以及一键恢复当前版本内置默认；
- 两类补充词使用独立作用域：触发补充只参与模糊场景的 SEARCH / DONE 判断，策略补充同时参与查询规划和搜后证据回答；固定 no-web、门控、预算、凭据与证据安全规则始终优先；
- 模型策略原有查询数量从执行层硬帽改为经济性推荐，实际每轮与总查询硬上限完全由高级限制决定；
- 高级限制增加一键恢复默认，并在模型识别状态中同时显示策略推荐数与用户设置的实际上限；
- 自定义提示词按哈希加入研究缓存指纹，保存、恢复与高级重置都会中止旧研究并清理内存缓存。
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

插件内直连副规划器的 Key 写入当前用户的原版 `SECRET_KEYS.CUSTOM` 服务端 secrets；配置列表只保存名称、Base URL、模型和不透明 `secretId`。保存成功后密码框清空，扩展不会读取、回显、记录或导出 raw Key。切换配置只更换请求所引用的 `secretId`；SillyTavern 1.18.0 以下不会开放该能力，也不会通过轮换全局 Custom Key 模拟隔离。

保存新 Key 时，原版接口不可避免地会先把它标为活动项。插件会在安全条件下立即恢复此前活动项，但这一写入窗口并非服务端原子事务；请不要跨标签页并行生成或轮换 Custom Key。设置保存、Key 写入、轮换与删除均会回读验证；状态不明、Key 仍活动、来源不属于本插件或可能被 Connection Manager 引用时一律保留，不做猜测性删除。

本扩展自己的调试日志不打印搜索正文。原版 SillyTavern 的服务端搜索路由可能按照其自身实现记录查询或上游响应；在多人或公网环境使用前，请根据你的隐私要求审查并配置酒馆日志。

## 开发检查

```powershell
node tests/runtime-time.test.mjs
node tests/research-transport.test.mjs
node tests/gemini-grounding.test.mjs
node tests/native-search-metrics.test.mjs
node tests/planner-strategies.test.mjs
node tests/planner-prompts.test.mjs
node tests/planner-request-router.test.mjs
node tests/planner-direct-profiles.test.mjs
node tests/planner-direct-transactions.test.mjs
node tests/query-safety.test.mjs
node tests/search-providers.test.mjs
node tests/feature-policy.test.mjs
node tests/st-compatibility.test.mjs
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
