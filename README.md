# Hidden Web Research for SillyTavern

让不支持工具调用的主模型也能通过 SearXNG 或 SerpAPI 获取网页搜索摘要，并且不生成工具楼层、空楼层、附件或 Data Bank 文件。

当前公开版以“可直接安装到原版 SillyTavern”为边界：只开放原版酒馆已经提供的 SearXNG 与基础 SerpAPI 路由，不要求修改核心文件，也不要求安装 server plugin。

## 它解决什么问题

- Claude/Gemini 中转、DeepSeek、GLM、Kimi 或其他没有原生联网能力的模型，可以在正式回答前进行隐藏搜索。
- 当前回答模型通过 `generateRaw()` 规划查询、判断是否补搜，并负责最终写作。
- 搜索证据只通过临时 `setExtensionPrompt()` 注入本轮请求，不创建额外消息楼层。
- 搜索结果标准化为标题、URL、摘要和可选日期，可要求最终回答使用真实 Markdown 来源链接。
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

## 查询规划策略

策略只改变“何时搜、怎样组织查询、怎样补搜与停止”，不会调用对应厂商的官方搜索服务器：

- **Claude 启发：顺序查证**：每次处理一个实质证据缺口，优先权威或原始来源。
- **Gemini 启发：双分面 Grounding**：首轮最多两个互补分面，后续只补一个最高价值缺口。
- **DeepSeek V4 Pro：分面合并**：合并同一主管机关或证据目标下的相关分面，最多 4 条查询。
- **GLM 5.2：层级核验**：按主管层级、原始来源、统计口径和时效核验，最多 4 条查询。
- **Kimi K3：研究收敛**：压缩近似 Deep Research 分支，最多 3 条查询。
- **Other / 通用**：每轮 1 条、总计最多 3 条。

自动识别优先读取当前真实模型 ID。无法精确匹配目标旗舰型号的旧 DeepSeek、GLM、Kimi 会回退到 Other / 通用。私有 `hwr_planner_profile` 标记及其配套服务端强制逻辑当前暂停；提示词策略、查询硬帽、近重复抑制和证据合并仍正常工作。扩展仍可设置原版酒馆支持的普通规划请求参数，是否被采用由当前酒馆版本和上游渠道决定。

## 触发策略与 token

- **模型自动判断**：调用当前回答模型作为隐藏规划器，由它决定是否需要搜索。即使最终不搜索，也会产生一次规划请求的 token。
- **每条消息都搜索**：除非本条明确要求不联网，否则至少执行一次搜索。
- **仅明确要求联网**：只有“联网查、网页搜索、给出来源”等明确请求才进入规划；其他消息在本地跳过，不调用模型。

明确要求“不联网”始终优先。规划器不会向用户直接回答，搜索结果被视为不可信数据，网页摘要中的指令不会被执行。

## 无额外楼层的实现

1. 正式生成开始前，`generate_interceptor` 读取最近对话。
2. 当前模型通过隐藏 `generateRaw()` 请求规划查询。
3. 扩展调用 SearXNG 或 SerpAPI，并根据证据缺口决定是否补搜。
4. 研究包只通过临时 `setExtensionPrompt()` 注入当前正式请求。
5. `GENERATION_ENDED`、`GENERATION_STOPPED` 和 `CHAT_CHANGED` 都会清除注入。

研究证据不会写入聊天、工具调用消息、附件、Data Bank、LocalStorage 或 IndexedDB，但会临时发送给最终回答所使用的模型或中转。

## 建议设置

- 联网模式：本机 SearXNG
- 查询规划策略：自动识别
- 触发策略：需要节省规划 token 时选择“仅明确要求联网”；希望模型自动决定时选择“模型自动判断”
- 最多规划轮数：3
- 每轮最多查询：2
- 每次结果数：6
- 总证据字符：18000
- regenerate 复用：600 秒

WebSearch 扩展可以保持内部 `Enabled` 与 `Use Function Tool` 关闭；Hidden Web Research 直接复用酒馆服务端搜索路由，不需要 WebSearch 生成消息楼层。

## 安装与更新

在 SillyTavern 中打开“扩展程序”→“安装扩展”，粘贴：

```text
https://github.com/PigmentTokyo/Extension-HiddenWebResearch
```

当前版本为 `1.7.1`。`manifest.json` 保持 `auto_update: false`，已经安装的用户需要在扩展管理器中手动检查并执行更新。

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
node --test tests/gemini-grounding.test.mjs tests/native-search-metrics.test.mjs tests/planner-strategies.test.mjs tests/search-providers.test.mjs tests/feature-policy.test.mjs
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
