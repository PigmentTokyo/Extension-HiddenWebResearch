# Hidden Web Research for SillyTavern

一个让不支持工具的主模型也能无额外工具楼层联网，并可选择 SearXNG、AnySearch、SerpAPI、Claude 隐藏桥接或 Gemini 原生直答的 SillyTavern 扩展。Claude 与 Gemini 原生路径均可使用 Connection Profile，或在扩展内保存独立 URL + Key。

## 它解决什么问题

- Claude/Gemini 中转不支持官方搜索工具时，仍可用 SearXNG、AnySearch 或 SerpAPI 自动研究。
- DeepSeek 或其他没有原生联网能力的模型也能自动决定是否搜索。
- 规划、搜索和补搜都不会生成工具楼层或空楼层。
- 三种普通检索后端都会标准化为标题、URL、摘要和可选日期，可要求最终回答使用真实 Markdown 来源链接。
- 重生成和 swipe 可在短时间内复用内存研究结果。
- Gemini 原生模式把带引用和 Search Suggestions 的 Gemini 答案直接作为唯一最终楼层。

## 五种联网模式

### 1. 本机 SearXNG

默认推荐。当前所选模型通过 `generateRaw()` 充当隐藏规划器，扩展直接调用 SillyTavern 核心的 `/api/search/searxng` 路由。

AnySearch 与 SerpAPI 也复用下面同一套模型适配器、查询硬帽、证据预算和隐藏注入流程；切换检索服务不会改变“谁负责规划和最终回答”。

模型适配器有：

- Auto
- Claude 启发：顺序查证
- Gemini 启发：双分面 Grounding
- DeepSeek V4 Pro：分面合并
- GLM 5.2：层级核验
- Kimi K3：研究收敛
- Other / 通用

这些策略由 Claude Opus 5、Opus 4.8、Sonnet 5、Gemini 3.1 Pro，以及 DeepSeek V4 Pro、GLM 5.2、Kimi K3 的受控实测行为蒸馏而来，只改变“何时搜、如何组织查询、如何补搜与停止”。它们不是原生工具、搜索服务或模型内部推理的复刻；选择 Claude 启发策略不会向不兼容中转伪造 Anthropic server tool，也不能借用 Anthropic 官方服务器。

- **Claude 启发：顺序查证**：每次围绕一个实质缺口搜索，先找权威或原始来源，再仅为矛盾、时效或缺失证据补搜。
- **Gemini 启发：双分面 Grounding**：首轮最多查询两个互补分面，之后只为尚未覆盖的分面定向补搜；不会照搬强模型原生搜索中可能出现的大量近似查询。
- **DeepSeek V4 Pro：分面合并**：合并同一主管机关或同一证据目标下的相关分面，首轮最多 2 条，之后每轮 1 条，总计最多 4 条。
- **GLM 5.2：层级核验**：按主管层级、原始来源、统计口径和时间有效性逐级核验，首轮最多 2 条，之后每轮 1 条，总计最多 4 条。
- **Kimi K3：研究收敛**：保留其 Deep Research 式多角度覆盖，但更早合并近似分支并停止扩张；首轮最多 2 条，之后每轮 1 条，总计最多 3 条。
- **Other / 通用**：每轮 1 条、总计最多 3 条，使用保守的通用 JSON 规划协议。

为避免查询爆炸，策略查询帽为：Claude 3、Gemini 4、DeepSeek V4 Pro 4、GLM 5.2 4、Kimi K3 3、通用 3。用户设置的高级总查询上限仍是更外层的硬限制。

当前 SearXNG 路径只读取搜索结果中的标题、URL、日期与摘要，不会像原生搜索工具一样继续访问并阅读完整网页。因此这里是**摘要级研究**，不应理解为对 Claude/Gemini 原生页面阅读能力的完整复制。

#### 国产旗舰专属档案（1.4.0）

三个档案只对精确的当前旗舰型号启用，不覆盖历史型号或同厂其他模型：

| 档案 | 精确模型 ID | 查询节奏 | 规划器最低输出 |
| --- | --- | --- | --- |
| DeepSeek V4 Pro：分面合并 | `deepseek-v4-pro` | 首轮 2、后续 1、总计 4 | 1024 tokens |
| GLM 5.2：层级核验 | `glm-5.2` | 首轮 2、后续 1、总计 4 | 1536 tokens |
| Kimi K3：研究收敛 | `kimi-k3` | 首轮 2、后续 1、总计 3 | 2048 tokens |

三款模型都使用 JSON 规划协议：DeepSeek V4 Pro 与 GLM 5.2 使用兼容性更广的 JSON Object，Kimi K3 优先使用严格 JSON Schema，并在中转拒绝该格式时自动退回提示词约束 JSON。DeepSeek V4 Pro 不再沿用早期 DeepSeek 兼容档案的 XML 指令；Kimi K3 始终启用 thinking，扩展只调低隐藏规划的 reasoning effort，不尝试关闭思考。无法精确识别为上述 ID 的旧版 DeepSeek、GLM、Kimi，以及包含供应商前缀但型号不同的中转名称，都会进入 **Other / 通用**，避免让旧型号冒充新档案。

同一脱敏研究场景的实测用于校准硬查询帽：DeepSeek V4 Pro 的自然规划查询由 3 条收敛为执行 2 条，GLM 5.2 由 3 条收敛为 2 条，Kimi K3 由 4 条收敛为 2 条；耗时约为 5 / 9 / 38 秒，总 tokens 约为 676 / 804 / 1458。它们只说明为何需要模型专属硬帽，不代表固定延迟、用量或回答质量。测试没有在文档、日志或脱敏产物中记录 key、URL、查询正文或回答正文。

本轮验证凭据只存放在开发者本机的未跟踪文件中，未纳入本仓库；扩展和本文均不读取或复制其内容。模型能力与协议依据可查阅：

- DeepSeek 官方的 [V4 发布说明](https://api-docs.deepseek.com/news/news260424/)、[Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode) 与 [JSON Output](https://api-docs.deepseek.com/guides/json_mode/)。
- 智谱官方的 [GLM-5.2 模型说明](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.2)、[迁移至 GLM-5.2](https://docs.bigmodel.cn/cn/guide/start/migrate-to-glm-new) 与 [结构化输出](https://docs.bigmodel.cn/cn/guide/capabilities/struct-output)。
- Moonshot AI 官方的 [Kimi K3 仓库与使用说明](https://github.com/MoonshotAI/Kimi-K3)。

### 2. AnySearch（anysearch.com）

调用官方 `POST https://api.anysearch.com/v1/search`：

- Key 可选；没有 Key 时使用按客户端 IP 计量的匿名额度。
- 可选 `zone=cn|intl` 和首选语言；留空由 AnySearch 自动路由。
- 扩展请求 JSON 结果，并把 `data.results[].title/url/content/snippet` 白名单化后送入共同研究循环。
- 单次最多采用 10 条结果，正文仍受每条与总证据字符限制。
- 任何 400/401/402/403/429/5xx 错误只返回脱敏分类；尤其不会转发可能出现在匿名 402 响应里的自动注册账号或 Key。

Key 保存在当前 SillyTavern 用户的服务端 secrets；密码框成功保存后立即清空。官方协议与错误码见 [AnySearch API 文档](https://www.anysearch.com/docs)。

### 3. SerpAPI Google Search

复用 SillyTavern 自带的 `SECRET_KEYS.SERPAPI` 与 `POST /api/search/serpapi`：

- 请求固定使用 SerpAPI 官方 Google Search API，读取 `organic_results[].title/link/snippet/date`。
- 可选设置 Google 的 `hl` 语言与 `gl` 国家代码。
- 每条查询只请求一页，再在本地截取高级设置指定的结果数；不会自动分页增加费用。
- 只把带合法 HTTP(S) 来源链接的自然结果作为可引用证据。
- 扩展设置页保存的 Key 属于酒馆共享 SerpAPI 密钥槽，因此 WebSearch 等其他功能也会使用当前激活的同一 Key。

协议与字段依据见 [SerpAPI Google Search API](https://serpapi.com/search-api) 和 [Organic Results](https://serpapi.com/organic-results)。

### 4. Claude 原生搜索桥接

可选模式。连接方式可以二选一：

- 在 SillyTavern 的 Connection Manager 中建立 Claude Profile。
- 在本扩展的 Claude 区域填写 Messages API Base URL、精确模型 ID 与 API Key，并点击保存。

两条路径都会请求 Anthropic Web Search。来源支持时使用 `web_search_20260318`，并强制 `direct` 模式，以便稳定取得可供扩展提取的结构化搜索结果。研究结果仍然隐藏，当前主模型只负责最后回答。

直连 URL 应填写 API 根路径，例如 `https://api.anthropic.com/v1`；末尾 `/messages` 会被自动去除。目标必须兼容 Anthropic Messages 协议，并在响应中保留 `server_tool_use`、`web_search_tool_result`、引用和 `stop_reason`。只有 OpenAI `/chat/completions` 包装的中转不能使用该路径。

1.6.0 可在模型框旁点击“拉取模型列表”。服务端使用已与 URL 绑定的凭据请求原生 `GET /v1/models`；首次拉取会先安全保存 URL + Key，随后可从建议列表选择或继续手工填写。中转可能不实现列表接口，或隐藏实际可调用的型号，因此列表出现不代表支持原生搜索，列表缺项也不代表手工模型 ID 不可用。拉列表本身不生成内容、不执行搜索。

- Connection Profile 模式只保存 Profile ID。
- 直连模式只在扩展设置中保存 URL 与模型 ID；Key 不进入 `extension_settings`、聊天、LocalStorage、Proxy Preset 或日志。
- URL 与 Key 会绑定成一个凭据包，保存到当前 SillyTavern 用户的服务端 `secrets.json`。
- 实际请求只采用服务端凭据包内的 URL；浏览器请求里的 `custom_url`、`reverse_proxy` 或临时 URL 不能把该 Key 改送到其他地址。
- 修改 URL 时必须重新输入 Key；更换 Key 后会清理旧的 HWR 凭据。
- “清除直连配置”会删除 HWR URL、模型与 Key，并切回 Connection Profile。
- 如果 Profile 使用自定义 URL/中转，只能称为 Claude-compatible；只有直达 `api.anthropic.com` 才是官方直连。
- 中转必须实际支持并透传 `web_search_20260318` 与 `direct`；扩展不能把不支持该协议的上游变成官方搜索。
- 该模式会产生 Claude token 和搜索费用。


### 5. Gemini 原生搜索直答

Google 现行 Search Grounding 条款不允许简单复制 Claude 的“隐藏研究 → 另一模型改写”流程：Grounded Result 必须与关联 Search Suggestions 一起展示给发起用户，且原则上不得把结果拆出用于其他目的。因此 Grounded Result 不能先隐藏，再交给 Claude、DeepSeek 或其他模型转写；该模式采用不同流程：

1. 本地零 token 门控判断本条是否需要联网。
2. 所选 Google AI Studio / Vertex AI Profile 通过 `google_search` 原生工具检索。
3. 扩展解析 `groundingMetadata`，按 `groundingSupports` 加入引用。
4. Gemini 的完整答案和 `searchEntryPoint.renderedContent` 成为同一个最终助手楼层。
5. 当前主模型本轮不调用；Gemini Grounded Result 不进入研究缓存。

这仍然没有工具楼层或空楼层，但必须明确：联网触发后，本轮真正的回答模型是所选 Gemini Profile，而不是当前 Claude/DeepSeek/中转模型。若希望当前模型负责最后写作，请使用“Gemini 启发：双分面 Grounding + 本机 SearXNG”；该路径使用的是独立 SearXNG 摘要，不是隐藏或转交 Google Grounded Result。

#### gcli 兼容配置

Gemini 连接同样可以二选一：

- 使用 Google AI Studio / Vertex AI Connection Profile；Vertex AI 仅支持此方式。
- 使用扩展内直连；只支持 Google AI Studio `generateContent` 协议。

直连 URL 应填写站点根地址，例如 `https://generativelanguage.googleapis.com` 或 `https://gcli.ggchan.dev`，不要保留 `/v1`、`/v1beta` 或完整 `/models/...` 路径；末尾版本路径会自动去除。模型必须返回完整 `groundingMetadata` 与 `searchEntryPoint.renderedContent`。

“拉取模型列表”由服务端请求原生 `/v1beta/models`，只保留声明支持 `generateContent` 的型号；首次拉取同样会先安全绑定 URL + Key。按钮不会改成强制下拉，模型框始终允许手填，因为模型列表元数据不能证明 `google_search` / Grounding 一定可用。

实测 `gcli.ggchan.dev` 同时提供两种接口：

- `/v1/chat/completions` 的 `*-search` 模型只返回普通正文，不保留结构化 Grounding。
- `/v1beta/models/{model}:generateContent` 支持 `tools: [{"google_search": {}}]`，并返回完整 `groundingMetadata` 与 Search Suggestions。

因此可在 Connection Manager 中建立 **Google AI Studio** Profile，并用 Proxy Preset 指向 `https://gcli.ggchan.dev`，也可直接把该站点根地址、精确模型与对应 Key 保存到扩展。不要建立 Custom/OpenAI Profile。推荐先选 `gemini-2.5-flash-lite`；不要选带 `-search` 后缀的 OpenAI 包装型号。

直连 Gemini 与 Claude 使用两个独立的 HWR secret 命名空间，互不覆盖 SillyTavern 原有 Claude / Google AI Studio active key，也不会修改其他 Connection Profile。

#### SillyTavern Grounding 透传要求

SillyTavern 1.18.0 会在服务端收到 `groundingMetadata`，但默认只向前端返回正文。本模式要求在 `src/endpoints/backends/chat-completions.js` 的 Gemini 非流式响应里额外透传 `groundingMetadata`、`finishReason` 和 `usageMetadata`。本机安装已配套应用这一小补丁；SillyTavern 更新后如该改动被覆盖，需要重新应用。

1.5.0 的 URL + Key 直连还要求两项小型核心适配：`src/endpoints/secrets.js` 与 `public/scripts/secrets.js` 注册 `HWR_CLAUDE` / `HWR_GEMINI` 独立命名空间；`chat-completions.js` 解析服务端 URL 绑定凭据包。若 SillyTavern 更新覆盖这些改动，Connection Profile 模式仍可用，但扩展内直连会明确报告 HWR 凭据不可用。

1.6.0 在同一核心文件增加专用 `POST /api/backends/chat-completions/hwr-direct-models`：浏览器只提交 provider 与 HWR secret ID；服务端忽略任何临时 URL、反代地址或密码，并且只回传经过白名单清理的模型 ID/显示名。

1.7.0 在 `src/endpoints/search.js` 增加固定官方上游的 AnySearch 安全路由，并在前后端 secrets 注册 `ANYSEARCH`。SerpAPI 本来就是 SillyTavern 内置路由；本机补丁只增加 secret ID、`hl/gl`、超时与脱敏日志处理，仍兼容只提交 `query` 的原有调用。

#### 零 token 前置门控

Claude 桥接和 Gemini 直答都不会为每条消息无条件调用研究模型。触发策略直接控制调用：


- **本地零 token 判断**：明确联网、URL、新闻、价格、天气、赛事、版本、法规、现任人物、在线状态、高风险事实和购买建议等场景才调用；闲聊、翻译、改写、用户已提供文本的总结、纯创作和角色扮演会跳过。
- **每条消息都调用**：除非用户本条明确要求不联网，否则每条消息都会调用所选 Profile 并至少执行一次搜索。
- **仅明确要求联网**：只有“联网查、网页搜索、给出来源”等明确请求才调用。

本地门控只读取最新用户消息，不调用任何模型。它会遮蔽引用、代码块和长篇粘贴正文后再判断，避免把待翻译内容中的“搜索”误当成指令。它采用保守白名单，冷门但不含时效或检索提示的问题可能被跳过；这时直接说“请联网查”即可强制触发。

## 无额外楼层的实现

SearXNG / AnySearch / SerpAPI / Claude 路径：

1. 正式生成开始前，`generate_interceptor` 读取最近对话。
2. 扩展完成隐藏规划与搜索。
3. 研究包只通过临时 `setExtensionPrompt()` 注入本轮主请求。
4. `GENERATION_ENDED`、`GENERATION_STOPPED` 和 `CHAT_CHANGED` 都会清除注入。

Gemini 路径：通过门控后取得完整 Grounded Result，调用 `saveReply()` 写入唯一最终回复，再以 `abort(true)` 阻止当前主模型重复生成。normal、regenerate 与 swipe 都沿用 SillyTavern 的原生消息结构。

运行令牌会阻止迟到的异步请求污染新聊天。

SearXNG / AnySearch / SerpAPI / Claude 隐藏研究不会写入：

- `chat`
- 工具调用消息
- 附件
- Data Bank
- LocalStorage
- IndexedDB

上述四种隐藏研究的证据仍会发送给最终回答所使用的模型/中转。Gemini 模式则把最终 Grounded Result、引用与 Search Suggestions 保存在用户聊天历史中，不转交其他模型。

## 建议设置

- 联网模式：本机 SearXNG
- 模型风格：自动识别
- 触发策略：本地零 token 判断
- 最多规划轮数：3
- 每轮最多查询：2
- 总查询上限：按策略限制为 Claude 3、Gemini 4、DeepSeek V4 Pro 4、GLM 5.2 4、Kimi K3 3、通用 3
- 每次结果数：6
- 总证据字符：18000
- 重生成复用：600 秒

WebSearch 扩展可以保持内部 `Enabled` 与 `Use Function Tool` 关闭；Hidden Web Research 不需要它生成楼层。

Claude Profile 建议使用 Sonnet，并把研究输出上限设为 800–1200。1.1.0 会把仍处于旧默认值 2048 的设置迁移为 1024；用户已经手工修改过的值不会覆盖。

用 Opus 5、Opus 4.8、Sonnet 5、Gemini 3.1 Pro、DeepSeek V4 Pro、GLM 5.2 与 Kimi K3 校准策略，不代表日常隐藏规划必须使用这些最强模型。强模型的隐藏思考和原生搜索循环可能消耗大量 token；1.4.0 提取其可迁移的查询组织特点，同时用模型专属硬帽抑制重复搜索。

## 关于 Profile 与密钥

AnySearch 与 SerpAPI 的密码框也只用于提交；明文 Key 不进入扩展设置、聊天或浏览器持久存储。AnySearch 可删除 Key 后切回匿名。SerpAPI 使用酒馆共享密钥槽，删除当前 Key 会同时影响 WebSearch 等其他使用者，因此界面会二次确认。

## 通过 SillyTavern 扩展安装器安装

公开仓库与安装 URL：

```text
https://github.com/PigmentTokyo/Extension-HiddenWebResearch
```

在 SillyTavern 中打开“扩展程序”→“安装扩展”，粘贴上述 URL 即可安装前端扩展。后续可在扩展管理器中检查并手动更新；当前清单保持 `auto_update: false`，不会在未确认服务端兼容性的情况下自动替换前端。

内置前端安装器不会修改 SillyTavern 服务端核心。因而在一台全新酒馆上：

- SearXNG 与原有 SerpAPI 路由可直接复用。
- AnySearch 服务端代理、Claude/Gemini 独立密钥、直连与模型列表仍需配套服务端适配。
- 缺少适配时扩展会收到 404/405，并明确提示“服务端适配缺失或版本不兼容”，不会退回浏览器直传 Key。

因此，这个 Git URL 可以直接安装本仓库的前端；要获得本项目在开发机上验证过的全部功能，仍需安装与当前 SillyTavern 版本匹配的服务端适配。SillyTavern 的前端安装器不能执行服务端代码、修改核心或重启服务，不能把完整安装压缩成一次 UI 粘贴操作。

不需要把明文 key 发到聊天里。官方协议格式是公开的；key 只用于实际验证账号、模型和组织是否获准使用搜索。

1.5.0 可以直接在扩展设置页录入 Key，但密码框只用于本次提交：成功后立即清空，刷新后始终为空。服务端 secret 文件由 SillyTavern 按当前用户管理；它不会把 Key 回填给本扩展。保存远程自定义域名或非 HTTPS 地址时会显示目标主机与风险确认；本地回环地址用于本机服务时不弹远程传输确认。

1.6.0 的模型列表请求沿用同一绑定凭据。首次点击拉取时若尚未保存，扩展会先保存 URL + Key；后续刷新后即使密码框为空，也能由服务端重新拉取。模型 ID 当前值不会被列表自动覆盖，空列表或上游错误也不会清除手填值。

Gemini Profile 推荐使用 `gemini-2.5-flash-lite`，输出上限设为 1024–2048。实测同一短查询在 Flash-Lite 上为 69 总 tokens、1 条搜索查询；Gemini 3 Flash Preview 在 1024 上限下消耗 4963 总 tokens（其中 4898 为 thinking）、自动执行 16 条查询且仍被截断。不同渠道的计费与用量可能变化，应以实际响应和供应商账单为准。

Gemini 原生模式不使用“重生成复用”缓存；每次 regenerate/swipe 都会产生新请求。

更安全的验证方式：

1. 使用 Connection Profile 时，在 Connection Manager 新建 Claude 或 Google AI Studio Profile，再在扩展中选择。
2. 使用扩展直连时，先填写 URL 与 Key；可点击“拉取模型列表”安全保存凭据并取得建议，也可直接手填精确模型 ID，最后点击保存。
3. 模型列表只验证列表接口。Claude 仍需点击“测试 Claude 搜索（会计费）”；Gemini 应发送一条实际的“请联网查……”消息，以便 Grounded Result 与 Search Suggestions 按条款同屏展示。

Google Search Grounding 的展示与使用限制见 [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms)，协议结构见 [Grounding with Google Search](https://ai.google.dev/gemini-api/docs/generate-content/google-search)。

若必须研究某个特殊兼容端点，可把 URL 和 key 放在本机文件中，再只提供文件路径；不要把明文凭证写进聊天、README、设置导出或日志。
