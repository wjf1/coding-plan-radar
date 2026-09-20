# CodingPlan Radar 📡

**AI 编程订阅计划（Coding Plan）对比站** —— 看得见数据来源的订阅指南。

> 🔗 在线地址：**https://wjf1.github.io/coding-plan-radar/**
>
> 覆盖 11 个主流平台、30+ 付费档位（ChatGPT / Claude / GitHub Copilot / Cursor / OpenCode / GLM / Kimi / MiniMax / 阿里百炼 / 火山方舟 / 小米 MiMo），每条数据标注来源与采集日期。

## ✨ 功能

| 功能 | 说明 |
|---|---|
| ⚡ 快速对比表 | 价格、额度口径、状态（正常/促销/停售），支持搜索、国内/国际筛选、多键排序 |
| 📈 额度倍率 | 月度额度折算价值 ÷ 月价（[awesome-coding-plan](https://github.com/mahonzhan/awesome-coding-plan) 口径），MiniMax 88.65× / Claude 63.6× / ChatGPT 21.82× … |
| 🕒 三周期额度 | 每平台 5h / 周 / 月三档额度与倍率，识别「月倍率高但 5h 倍率低」的节奏陷阱 |
| 💰 Token 实时价格榜 | 浏览器直连 [models.dev](https://github.com/sst/models.dev) 拉取 200+ 款第一方模型 API 价（$/百万 Token），输出价升序 + ⚡性价比标记 |
| 🧮 订阅 vs API 计算器 | 输入月输出量与模型档位，实时估算按量成本，对比候选订阅给出「订阅还是按量」结论 |
| 🖥️ IDE 订阅榜 | 12 个 $10–20 档 IDE/编辑器订阅横评（Trae / Copilot / Zed / Kiro / Windsurf…） |
| 🎁 白嫖 / 免费额度 | 官方免费档、学生包、免费 API 额度、限时试用；标注额度 / 门槛 / 证据强度，并列出已失效的坑（如 GitHub Models 已下线） |
| 📡 市场动态 | 促销与停售追踪（人工确认）+ 自动发现的线索队列 + 信息源健康看板 + 本站变更记录 |
| 🛡️ 来源分级 | 官方直采（绿）＞ 实时数据源（青）＞ 聚合参考（蓝）＞ 社区情报（黄，仅作线索，不进价格表） |

## 🔄 每日自动更新（GitHub Actions）

仓库每天自动运行 [daily-update.yml](.github/workflows/daily-update.yml) 巡检一次。cron 设为 `0 1 * * *`
（= 北京时间 09:00），但 **GitHub 的定时调度不保证启动时点**——2026-09-15→09-20 六次定时运行实测均在
05:2x–05:3x UTC（约北京 13:30）才起跑，因此本站只承诺"每天一次"，不承诺"09:00 完成"。
四个抓取任务互相独立、任一失败不影响其余（`continue-on-error`），跑之前还有一道硬闸：

0. **`node scripts/validate-data.mjs && node --test`** —— 数据契约（每平台必须有合法 `pricedAt`/`pricedBy`）
   与纯函数层单测；不通过就中止，绝不带着脏数据往下巡检

1. **`scripts/update-snapshot.mjs`** —— 重新抓取 models.dev，重新生成 `js/snapshot.js` 兜底快照
2. **`scripts/check-pages.mjs`** —— 按 `data/sources.json` 对官方定价页/文档做内容哈希变动检测
   - 有变动 → 写入 `data/alerts.json`，站点顶部自动挂「待核实」横幅并开 issue
   - 页面回到基线哈希时**自动 resolved**；抓取失败不再静默跳过，而是计入源健康
3. **`scripts/fetch-feeds.mjs`** —— 抓取官方 changelog / 状态页 / 社区订阅源，归一化为 `data/signals.json` 线索
4. **`scripts/diff-prices.mjs`** —— 对比 models.dev / OpenRouter / LiteLLM：价格变动、免费模型增删、价格源分歧

**诚实原则**：

- 机器只负责**发现**，所有价格与促销数字一律人工确认后才进对比表；机器线索单独陈列
- 每个信息源的抓取成败写入 `data/sourcehealth.json`，在站点「市场动态 → 信息源健康」公开可见，
  **连续 3 天失败即标注「已失效」**，不再假装巡检成功
- JS 渲染的空壳页面（Qoder / CodeBuddy / 火山方舟计费页）与对机器人返回验证页的站点（OpenAI 定价页实测 403）
  明确标注为不可自动监控，不做假巡检
- **变动需二次确认**：页面内容变化要「下一次巡检仍是同一个新值」才告警（真实变动因此晚一天），
  避免动态渲染页面天天误报
- **不稳定页面自动停用预警**：cursor.com/pricing 实测两次抓取正文长度即不同（渲染变体跳变），
  连续确认后回滚达阈值即标记为「需人工核对」并停止自动告警——宁可承认监控不了，也不刷假警报
- **区分"源抓不到"与"脚本崩了"**：前者是数据问题，写入 `data/sourcehealth.json` 并在连续 3 天失败时标失效，
  巡检照常；后者是代码 bug，`scripts/mark-pipeline.mjs` 会把 `data/meta.json` 标为 `pipelineDegraded` 且
  **不推进"最近巡检"日期**，并让 Actions 运行变红（此前四个步骤全 `continue-on-error` 后无条件写日期，
  于是"全崩"与"跑成"在页面上长得一样）
- **哈希监控分两类**：Kimi / GLM 的套餐价不在 HTML 里（客户端再取）、MiniMax 页面含价但属语音套餐，
  这三页的哈希对比只能发现版式改动、发现不了价格改动，故在 `data/sources.json` 标
  `"hashMonitors": "layout-only"`，站点显示为「仅版式监控」（虚线灰底），不计入"价格正在被自动盯着"
- **待办不再隔天消失**：未核实的告警按「当前未决全集」输出到一条常驻 issue（label `daily-triage`），
  并标注已挂起天数；队列清空时自动关闭

### 处理「官方页变动」issue 的流程

1. 打开 issue 中列出的官方页面，核对新价格 / 新额度
2. 更新本地 `js/data.js` 对应平台条目（含新的采集日期）
3. 将 `data/alerts.json` 中该条目的 `"resolved": false` 改为 `true`（或等着它自动回滚解决）
4. 提交推送，横幅自动消失

### 处理「自动发现的线索」的流程

1. 看站点「市场动态 → 自动发现的线索」，或 issue 里的线索列表
2. 人工核实后，促销/停售写进 `data/promos.json`，白嫖/免费额度写进 `data/freebies.json`
3. 社区情报（黄标）默认**不录入**，除非能追到官方出处

## 📁 目录结构

```
├── index.html              # 页面骨架（对比表 / Token 榜 / 计算器 / IDE 榜 / 白嫖 / 动态 / FAQ）
├── css/styles.css          # 全部样式（深色主题，无框架）
├── js/
│   ├── data.js             # ⭐ 订阅计划数据 + IDE 表 + 变更记录（日常改这里；每平台带 pricedAt/pricedBy）
│   ├── freshness.js        # 数据新鲜度纯函数层（零 DOM；浏览器与 node:test 共用同一份源码）
│   ├── app.js              # 渲染与交互逻辑（表格/卡片/计算器/实时榜/巡检/白嫖/源健康/新鲜度）
│   └── snapshot.js         # models.dev 兜底快照（每日自动重新生成，勿手改）
├── tests/                  # node:test 用例，零依赖；`node --test` 运行
│   └── helpers.mjs         # 用 vm 从浏览器脚本里取全局量（本仓库无构建步骤）
├── data/
│   ├── sources.json        # ⭐ 信息源声明清单（唯一事实来源：URL / 分级 / 关键词 / 启用状态与原因）
│   ├── promos.json         # 人工确认的促销 / 停售记录（驱动「市场动态」时间线）
│   ├── freebies.json       # 人工维护的白嫖 / 免费额度条目
│   ├── alerts.json         # 「待核实」预警状态（人工 resolved，或自动回滚解决）
│   ├── signals.json        # 机器发现的线索（90 天滚动窗口，自动维护）
│   ├── sourcehealth.json   # 每源抓取成败（自动维护，站点据此显示「已失效」）
│   ├── pagehash.json       # 官方页内容哈希基线（自动维护）
│   ├── pricebase.json      # 价格 / 免费模型基线（自动维护，用于差异检测）
│   └── meta.json           # 最近巡检日期 + pipelineDegraded/failedSteps（自动维护，见 mark-pipeline.mjs）
├── scripts/
│   ├── lib.mjs             # 公用：带 UA/超时抓取、JSON 读写、源健康、极简 RSS 解析、关键词匹配、isMain
│   ├── validate-data.mjs   # 数据契约校验（pricedAt/pricedBy/srcUrl 必填且合法）
│   ├── update-snapshot.mjs # 兜底快照
│   ├── check-pages.mjs     # 官方页哈希巡检 + 源健康
│   ├── fetch-feeds.mjs     # RSS / JSON 源 → 线索
│   ├── diff-prices.mjs     # 价格库与免费模型差异检测
│   ├── mark-pipeline.mjs   # 巡检日期唯一写入点：脚本崩溃则保持旧日期并标 pipelineDegraded
│   ├── build-triage.mjs    # 生成当前未决清单 → issue-body.md（配合常驻 daily-triage issue）
│   └── publish-via-api.mjs # 走 GitHub API 发布（github.com 被阻断时替代 git push）
└── .github/workflows/
    └── daily-update.yml    # 定时任务（cron 09:00 北京时间，可手动触发）
```

## 🚀 本地运行与部署

```bash
# 本地预览（任选其一）
python -m http.server 8765        # http://127.0.0.1:8765
npx serve .

# 数据/内容更新后发布
git add . && git commit -m "update: ..." && git push   # Pages 自动重新发布

# 若所在网络阻断了 github.com 的 HTTPS（git push 报 connection reset），改用 API 发布：
node scripts/publish-via-api.mjs "update: ..."         # 需要 GITHUB_TOKEN 或已登录的 gh CLI

# 手动跑一次完整巡检
node scripts/update-snapshot.mjs && node scripts/check-pages.mjs \
  && node scripts/fetch-feeds.mjs && node scripts/diff-prices.mjs
```

无构建步骤、零 npm 依赖（含 RSS 解析，未引入 YAML / XML 库）、纯静态 —— fork 后开启 Pages 即可获得自己的实例。

> 注：`data/sources.json` 里的社区源（LINUX DO / V2EX 等）在中国大陆线路不可达，只在 GitHub Actions
> 的海外出口能抓到；本地跑时它们会正常报失败并记录到 `sourcehealth.json`，这属预期行为。

## 📚 数据来源

| 层级 | 来源 | 用途 |
|---|---|---|
| 官方直采 | [claude.com/pricing](https://claude.com/pricing) · [docs.github.com Copilot 计划](https://docs.github.com/en/copilot/get-started/plans) · [cursor.com/pricing](https://cursor.com/pricing) · [docs.bigmodel.cn](https://docs.bigmodel.cn/cn/coding-plan/overview) · [platform.kimi.com](https://platform.kimi.com/docs/pricing) · [trae.ai](https://www.trae.ai/pricing) · [MiniMax](https://platform.minimaxi.com/document/price) · [阿里云百炼免费额度](https://help.aliyun.com/zh/model-studio/new-free-quota) 等 | 订阅价格（人工核价）+ 每日哈希巡检 |
| 官方订阅源 | [GitHub Changelog](https://github.blog/changelog/feed/) · [Cursor Changelog](https://cursor.com/changelog/rss.xml) · [OpenAI News](https://openai.com/news/rss.xml) · [Claude](https://status.claude.com/history.rss) / [OpenAI](https://status.openai.com/history.rss) / [GitHub](https://www.githubstatus.com/history.rss) Status | 促销与可用性事件线索（RSS/Atom） |
| 实时数据源 | [models.dev](https://github.com/sst/models.dev)（API 直连，CORS 全开放）· [OpenRouter 模型表](https://openrouter.ai/api/v1/models) · [LiteLLM 价格表](https://github.com/BerriAI/litellm) | Token 价格榜 + 兜底快照 + 免费模型 / 价格差异检测 |
| 方法论 | [mahonzhan/awesome-coding-plan](https://github.com/mahonzhan/awesome-coding-plan)（2857★） | 额度倍率 / TPS / 三周期额度 / 坑点 |
| 聚合参考 | [codingplan.org](https://codingplan.org/) | 部分国内平台价格（逐条标注） |
| 社区情报 | [Hacker News](https://hn.algolia.com/) · [少数派](https://sspai.com/) · [IT之家](https://www.ithome.com/) · [awesome-free-llm-apis 提交流](https://github.com/mnfst/awesome-free-llm-apis) | 线索提示（黄色标注，**不直接进价格表**） |

> **关于 LINUX DO / V2EX（2026-09-14 结论）**：这两个一手性最强的中文社区源，经**双环境实测**均无法自动获取 ——
> 大陆线路超时，GitHub Actions 海外出口分别返回 `403 Cloudflare` 与 `HTTP 200 空响应体`。
> 这说明拦截发生在**数据中心 IP 信誉层**而非网络封锁层，**自建 VPS / RSSHub 同样解决不了**（能解决的是住宅代理）。
> 因此本站停用这两个源并改为人工巡览，不做"看起来在监控"的假象。

### 🚫 明确不收录的信息源

| 类型 | 原因 |
|---|---|
| 逆向 / 公益 / API 中转站（free-one-api、chatanywhere 等） | 违反上游 ToS，存在密钥泄露与封号风险；且项目寿命不可预期（已有多个知名仓库 404 消失） |
| 共享账号 / 合租 | 账号安全与平台条款风险 |
| 需登录 cookie 抓取（小红书 / 即刻 / 公众号中转） | 合规与稳定性均不可接受 |
| X / Twitter、36氪 / 机器之心原生 RSS | 前者路由需多组鉴权 token 且官方实例已关闭，后者实测返回反爬页或非 feed |
| 中文羊毛聚合站（福利吧 / hostloc / 什么值得买首页） | 实测主动断连 / 需邀请码 / 与 AI 订阅无关内容为主，噪声比极差 |
| LINUX DO / V2EX（暂缓） | 双环境实测均不可自动获取（403 Cloudflare / 空响应体），属数据中心 IP 信誉拦截，自建 VPS 无效；保留配置但 `enabled: false`，有住宅代理时可一键启用 |

> **LiteLLM 只做参考基线，不告警**：按模型名匹配会把不同 SKU 配到一起（如 litellm 的 `azure/gpt-5.6`
> 转售价 $30 vs 第一方 `openai/gpt-5.6` $20），首个真实 CI 运行即产生 146 条假"价格分歧"信号。
> 因此它只抓取、只记录基线供人工比对，不再自动报警。

> 2026-09-14：原「B站每日播报」来源已移除。相关条目的原始出处仅剩视频、无法结构化核验，
> 故改由上述官方 / 结构化源持续找官方确认；未能复核的条目在站点上明确标注「⚠ 待重新核实」。

## ⚖️ 免责声明

- 价格与额度可能随时变化，**付款前务必以平台官网为准**
- 「额度倍率」「编辑推荐」为基于公开数据的社区口径估算与主观参考，非官方承诺，非广告
- 免费额度条目的领取条件与规则以官方为准，本站仅做汇总与出处标注
- 本站不含任何推广链接，与所列平台无商业关系；所有商标归各自所有者
