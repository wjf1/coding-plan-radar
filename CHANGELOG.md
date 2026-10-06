# 变更记录 / Changelog

本文件记录 CodingPlan Radar 的版本变更。站点内的「本站变更记录」板块（`data/changelog.json`）
是本文件的精简子集，两者需同步维护。

日期均为北京时间。数据类变更（每日自动巡检提交）不在本文件逐条记录，只记录代码与内容层面的版本变更。

## [v7.3] - 2026-10-06

**信息源采集层升级：条目级监控（list 源）** —— 官方页告警从「这个 800KB 页面变了」升级为
「哪个档位的哪个字段从什么变成了什么」。借鉴 [AIHOT](https://github.com/KKKKhazix/AIHOT) `web_list` 的
「选择器定位条目 + 先预览再创建」思路，选择器引擎为本仓库自己的零依赖实现；整体架构不变（仍无 npm 依赖、无数据库，LLM 未引入——那是改造方案步骤 2/3 的事）。

| # | 项目 | 说明 |
|---|---|---|
| 1 | `lib.mjs` 极简 HTML 条目抽取引擎 | `parseSimpleSelector` / `matchBlocks` / `pickText` / `parseListItems` / `diffListChanges` / `isStructuralBreakdown`。选择器子集：`tag` / `.class` / `#id` 单级任意组合 + `:nth(k)` 后缀 + 最多三级后代路径（如 `table:nth(1) tbody tr`）；语法超出子集**直接抛错**——宁可不解析也不静默错抓。`script`/`style`/注释先剥离，里面的假标签不参与标签配对 |
| 2 | `sources.json` 新增 `lists` 数组 | 条目级监控源声明：`itemSelector` + `fields`（字段名 → 块内单级选择器）+ `keyField`（条目主键）。**GLM Coding Plan 文档页**从 `page`（整页哈希）迁移为首个 `list` 试点：该页约 800KB，此前任何无关改动（文案/导航/样式）都会触发整页哈希告警；现在只盯「套餐类型 / 5 小时积分 / 每周积分」表，基线 `data/auto/listbase.json` |
| 3 | `check-pages.mjs` 支持 list 通道 | 与 page 通道共用反爬检测、二次确认（真实变动晚一天告警）、auto-revert 回滚、源健康机制；alert 新增 `kind: "list-change"`（带 `changes` 字段级明细，单条上限 20 处）与 `kind: "structure-change"`（结构变更熔断）。**两道保护**：`itemSelector` 解析出 0 条 → 绝不建基线、不写 alert、只记源健康（无可信数据不发言）；条目骤变或过半变动 → 只提醒人工核对选择器、**不更新基线**（防止把改版页面固化成新基线） |
| 4 | 新增 `scripts/probe-source.mjs` | 「先预览，再创建」：`node scripts/probe-source.mjs <id>` 只打印解析结果不写盘，与正式采集同一套解析逻辑；解析出 0 条以非 0 退出。创建/修改 list 源前必须先跑 |
| 5 | `validate.mjs` + `tests/selfcheck.mjs` | 新增 sources.json 契约：全源 id 跨数组查重（feeds/pages/lists/apis）、tier 白名单、list 源 selector 语法校验（fields 只许单级）。selfcheck 15 → **24 例**（选择器引擎 / 端到端抽取 / diff / 熔断判定 / validate 负向用例） |
| 6 | `daily-update.yml` issue 明细 | `list-change` alert 在巡检 issue 里逐行列出 `条目 · 字段: 旧值 → 新值`；`structure-change` 附 probe-source 核对指引 |

**开发过程中发现并当场修复的两个缺陷**（由四场景端到端验证脚本抓住，该脚本为一次性工具未入仓库）：

1. **结构变更分支丢失旧基线**：熔断本意是「不更新基线」，但最初实现漏了把旧基线带回本轮写盘对象——
   本轮 `listbase.json` 里没有该源，下次巡检会把改版页面当「首次见到的页面」重新建基线，熔断反而加速了坏结构固化。场景 C 抓住后修复。
2. **alert 复用导致 kind/changes 错乱**：同一源存在其它类型（page 时代遗留）的未解决 alert 时，
   复用旧卡只更新 `detected`，`kind` 保持旧值、`changes` 丢失。改为 `kind` 一致才原卡复用，否则旧卡标 `superseded` 关闭、另开新卡。

**验证**：`node scripts/validate.mjs` 通过；`node tests/selfcheck.mjs` 24/24；
`probe-source.mjs` 对智谱文档页实测精确抽出 3 档（Lite 2,000/10,000 · Pro 12,000/60,000 · Max 28,000/140,000）；
临时目录四场景端到端 17 项断言全部通过（字段变动 → 二次确认 → 报警明细 / 回滚自动关闭 / 结构变更熔断不更新基线 / 0 条保护）。

---

## [v7.2] - 2026-10-05

**数据目录语义化与死代码清理（3 项）** —— 让「哪些数据能手改」由目录结构回答，而不是靠记忆。

| # | 项目 | 说明 |
|---|---|---|
| 1 | data 目录按维护方式分离 | 拆为 `data/manual/`（9 个：plans / calc-plans / calc-models / ide-plans / changelog / repos / sources / promos / freebies，人工录入）与 `data/auto/`（10 个：snapshot / alerts / price-history / reported / signals / sourcehealth / pagehash / pricebase / transients / meta，机器每日生成）。全仓库 99 处路径引用同步改写（脚本 / 前端 / workflow / 校验脚本 / 测试夹具），新增 `.gitattributes` 让 GitHub 折叠 `data/auto/**` 的 diff。此前 19 个 JSON 平铺一处，「哪些会被巡检覆盖」只能靠读脚本判断 |
| 2 | 删除死代码 | `populateCalcModels()`（v4 合入时引入）从未被调用，配套的 `window._CALC_MODEL_POOL` 回退分支永远取不到值，一并清除，`renderCalc()` 直接用 `CALC_MODELS`。**刻意选择删除而非接线**：接线会把计算器下拉从固定 3 档变成 20+ 个动态模型，属于面向线上页面的行为变更，不宜混在整理类改动里 |
| 3 | 文档同步 | README 中英双语目录结构与全部内联路径、HANDOFF 的数据归属表 / 数据流 / 避坑段同步更新；更正 v7.0 记录中的一处误报（`transients.json` 并非无产出方，`check-pages.mjs` 正常写入） |

| 4 | 补齐计算器表头 `scope` | 合并 v7.1（a11y）后验收时发现：`renderCalc()` 生成的候选订阅表 4 个 `<th>` 没有 `scope`（v7.1 只覆盖了 3 个静态表格），运行时全站 33 个 `<th>` 已全部带 `scope` |

**新增待办（本次排查发现，未修）**：`data/manual/calc-models.json` 配置了 7 个模型档位，但 `index.html` 的 `<select id="calcmodel">` 只写死 3 个 `<option>`（value 0/1/2），另外 4 个档位用户无法选择；同时这 3 个 option 的标签与 `calc-models.json` 的 `label` 重复维护，存在漂移风险。修法见 `HANDOFF.md` 的 Backlog。

---

## [v7.1] - 2026-10-05

**对比度、键盘可达性与两处真实交互 Bug（12 项）** —— 按「CodingPlan Radar UI 设计提升方案」评审结论执行，
只落地判定为「真实缺陷且改动面小」的部分；纯视觉重构类任务（字号/间距 Token 化、浅色主题、scrollspy、
sparkline 交互、骨架屏）本轮不做。仓库仍保持无构建、零 npm 依赖。

> **方案原文不可直接作为实施依据**：该 PDF 的附录 A.1–A.8 与正文 6.1–6.8 的「修复：」代码框**全部为空框**
> （框高仅一行，源文件里未写入代码）；§4.2 字号替换表约 10/16 行选择器标注有误。本轮代码按代码库实况重新编写。

### 无障碍

| # | 项目 | 说明 |
|---|---|---|
| 1 | 脚注对比度达标 | `--dim` 由 `#6b7a99` 改为 `#7c8aa6`。原值在 `--bg` / `--bg2` / `--card` 上仅 4.45 / 4.23 / 4.03:1，**全部低于 WCAG AA 的 4.5:1**，而它正是全站 12px 脚注、表格小字、区块说明的专用色。新值实测 5.52 / 5.25 / 5.00:1，一行改动修复全站脚注可读性 |
| 2 | 页脚免责声明对比度 | `.disclaimer` 的 `#58657f` 实测仅 **3.27:1**（比 `--dim` 原值更差），改为 `var(--dim)` |
| 3 | 全局焦点环 | 新增 `:focus-visible`（`2px solid var(--accent)` + 2px offset）。此前全站只有 `input.s:focus { border-color }` 一处焦点反馈，**键盘用户 Tab 到 chip / button / select / summary 时完全看不到焦点位置**。`--accent` 对比度 6.06:1，满足 1.4.11 非文本对比度 ≥3:1 |
| 4 | 焦点环三处覆盖 | `input.s` / `select` 原有 `outline:none` 会盖掉全局环，显式提权重写；`details` 带 `overflow:hidden` 会裁掉 FAQ summary 的外扩描边，改用 `outline-offset:-2px` 内缩 |
| 5 | 表头 `scope` | 三个表格 18 个 `<th>` 全部补 `scope="col"`；对比视图的行标题补 `scope="row"` |
| 6 | 外链 `rel` | 全站 `target="_blank"` 补 `rel="noopener noreferrer"`（HTML 4 处 + JS 模板 8 处），浏览器实测 103 个外链 `rel` 齐全 |
| 7 | 装饰性 emoji | 新增 `hideDecorativeGlyphs()`：把章节标题 / 图标位开头的 emoji 包进 `aria-hidden` 的 `<span>`。此前读屏会逐字念出符号名（"high voltage sign, money-mouth face, abacus…"）。只处理元素首个文本节点，故切语言后重复调用安全 |
| 8 | 动效降级 | 新增 `@media (prefers-reduced-motion: reduce)`：`scroll-behavior:auto` + `skip-link` 过渡置 `none` |

### 修复的 Bug

| # | 项目 | 说明 |
|---|---|---|
| 9 | 对比表搜索无空状态 | `renderPlans()` 在无匹配时把 `tbody.innerHTML` 置空即返回，用户搜到空白表格会以为页面坏了。现显示「没有匹配的平台」+「清空搜索与筛选」按钮（事件委托绑在 `tbody` 上，渲染重建后仍有效）。`renderTokens()` 早有同类处理，此处只是漏了 |
| 10 | 对比选择上限未在交互层拦截 | 复选框 change 处理原先只 `push` 不校验上限，4 个上限仅靠 `restoreURLState()` 的 `.slice(0,4)` 兜底——结果是**勾第 5 个照样渲染 5 列，刷新一次又变回 4 列**的自相矛盾状态。现改为在 change 里拦截、回滚勾选并提示「最多同时对比 4 个平台」（4 秒后自动收起） |
| 11 | hero 静态数与实测不符 | `index.html` 兜底写死 `11 / 33 / 15`，而 `app.js` 首帧覆盖为 `19 / 69 / 14`，**首屏先闪一下错数据**；且 `st-models`（`60+`）在 `app.js` 中根本没有来源、永远不会被覆盖。已把 HTML 兜底值改为实测值。注：`19` 是排除 1 个已停售后的在售数，`69` 是全部 20 个条目的档位合计（**含**已停售）——两处口径本就不同，本次保持与 `app.js` 一致 |
| 12 | 排序无方向指示 | 新增 `updateSortIndicator()`：给可排序列写 `data-sort` + `aria-sort`，箭头由 CSS `::after` 生成。另修正**整行表头（含不可排序的「核心模型」等）都是手型**的问题——现仅 `th[data-k]` / `th[data-tk]` 给手型与 hover |

**行为变化提示**：`target="_blank"` 的 3 处行内 `onclick` 已按方案 §6.6 迁到 `bind()`，HTML 端仅留
`data-action="compare|clear|export"` 标识（便于日后收紧 CSP）；排序箭头改为 CSS 生成，不会被 `applyI18N()`
的 `data-i18n-orig` 快照记进 DOM。

验证证据：`node scripts/validate.mjs` 通过；`node tests/selfcheck.mjs` 15/15 通过；浏览器实测（本地 HTTP + Chrome
DevTools）确认搜索空状态与复位、勾第 5 个被拦截且提示、点价格表头 `aria-sort` 在 ascending/descending 间切换、
真实 Tab 后 `skip-link` 的 `:focus-visible` 计算样式为 `2px solid rgb(91,140,255)`、18/18 `<th scope>`、
103 个外链 `rel` 齐全、14 处 emoji 已隐藏。

---

## [v7.0] - 2026-10-05

**安全边界、数据写入可靠性与巡检可见性（14 项）** —— 把第三方数据的安全边界、数据文件的写入可靠性，
以及几处「出错了但没人知道」的静默路径一次性补齐。仓库仍保持无构建、零 npm 依赖。

### 安全加固

| # | 项目 | 说明 |
|---|---|---|
| 1 | Token 榜 XSS | `renderTokens()` 把 models.dev 返回的模型名 / ID / 厂商直接插入 `innerHTML`，未转义——这是全站唯一「第三方不可信数据进 DOM」的路径。三个字段全部过 `esc()` |
| 2 | 链接协议校验 | `esc()` 只处理 `&<>"`，挡不住 `javascript:`。新增 `safeHref()`：所有动态 `href`（对比表 / 详情卡片 / 同类项目 / 促销 / 白嫖 / 线索 / 榜单）只放行 `http(s)`，其余降级为不可点击的 `#` |
| 3 | 全站转义补齐 | 对比表、详情卡片、IDE 榜、变更记录、同类项目中的平台名 / 厂商 / 档位 / 额度 / 坑点等字段统一过 `esc()` |
| 4 | CSV 公式注入 | 导出 CSV 时对以 `=` `+` `-` `@` 开头的单元格前置单引号，避免在 Excel / WPS 打开时被当作公式执行（`=HYPERLINK(...)` 可在打开表格时外发本机数据） |

### 数据可靠性

| # | 项目 | 说明 |
|---|---|---|
| 5 | 原子写入 | `lib.mjs` 的 `writeJSON` 改为 `.tmp` + `rename`。原先直接 `writeFileSync` 会先截断目标文件，进程中途被杀即留下半截 JSON；而 `readJSON` 的容错会把损坏文件当成「不存在」并回落默认值——等于静默清空整库数据。所有脚本（含 `update-snapshot`、`publish-via-api`）一并受益 |
| 6 | 快照 schema 校验 | `update-snapshot.mjs` 落盘前校验：条目缺 `pid/id/n`、价格非数字、或整体为空时直接抛错退出。快照是 models.dev 失败时的唯一兜底，坏快照比旧快照更危险 |
| 7 | 快速降级 | models.dev 拉取加 5 秒 `AbortSignal.timeout`，超时即降级到内置快照，不再让第三方接口拖住首屏 |
| 8 | 降级提示日期 | 兜底提示原先把快照日期硬编码为「2026-09-13」，与每日重新生成的快照不符。现读 `data/snapshot.json` 的 `generatedAt` 显示真实日期 |
| 9 | 巡检失败可见 | `record-history` 的失败原先被写成 `ok=false: record-history` 挂在一个没有 `id` 的步骤上，既拿不到 outcome、也不进失败汇总——它崩掉时巡检会安静地少掉当天价格历史，而流程仍然是绿的。现纳入 `failed_steps` 并开 issue |

### 数据结构重构

| # | 项目 | 说明 |
|---|---|---|
| 10 | 数据 JSON 化 | `js/data.js`（订阅计划 / 计算器 / IDE 榜 / 变更记录 / 同类项目）拆为 `data/plans.json`、`calc-plans.json`、`calc-models.json`、`ide-plans.json`、`changelog.json`、`repos.json`；`js/snapshot.js` 改为 `data/snapshot.json`。两个 JS 数据文件已删除 |
| 11 | 移除 Node 侧 hack | `record-history.mjs` 原先靠 `require("../js/data.js")` 执行浏览器脚本、再读 `globalThis._CP_EXPORT` 取数据（因为 JS 对象字面量无法 `JSON.parse`）。该 hack 只要 data.js 引入任何 ESM 语法就会崩，并连带打断整个每日巡检。现改为直接读 JSON，浏览器与脚本共用同一份来源 |
| 12 | 前端异步加载 | `app.js` 改为并行 `fetch` 六个数据文件后再首屏渲染；单个文件失败只让对应板块为空，不拖垮整页 |

### 质量保障

| # | 项目 | 说明 |
|---|---|---|
| 13 | 数据契约校验 | 新增 `scripts/validate.mjs`：校验 19 个 `data/*.json` 的语法与契约（计划条目必填字段与名称唯一性、快照非空且字段完整、价格历史结构、`meta.json` 日期格式等）+ 对所有脚本与 `app.js` 跑 `node --check`。已接入 `daily-update.yml` 作为提交前闸门（**校验不通过则不提交**），并新增 `validate.yml` 在 push / PR 时运行 |
| 14 | 零依赖自检 | 新增 `tests/selfcheck.mjs`（Node 内建 `node:test`，不引入测试框架）：15 个用例覆盖哈希 / 关键词匹配 / 文本清洗 / RSS 解析、原子写入不残留 `.tmp`、`record-history` 同一天连跑两次字节级不变、以及 `validate.mjs` 的四类负向用例（坏 JSON / 空快照 / 缺字段 / 语法错误） |

**行为变化提示**：页面数据改为 `fetch` 读取 `data/*.json`，用 `file://` 直接打开将只剩空壳——本地预览必须走 HTTP（`python -m http.server` 或 `npx serve`）。

---

## [v6.3] - 2026-09-30

**排版与本地化（3 项）**

| # | 项目 | 说明 |
|---|---|---|
| 1 | 顶部导航重构 | logo 与数据胶囊一行、导航合并单行（窄屏横向滚动），链接胶囊式 hover；修复两行导航与 logo 垂直错位 |
| 2 | 中文界面线索中文化 | 官方公告高频句式自动译为中文（「X 已上线 GitHub Copilot」「X 正式全量可用」等，产品名保留原文）；英文为主的摘要不再整段展示；HTML 实体（&#8230; 等）正确解码；RSS 尾巴（The post … appeared first on …）自动清理。英文界面显示原文 |
| 3 | 数据源头清理 | fetch-feeds 入库时即解码实体并清理尾巴（lib.mjs excerpt 管道），新旧数据渲染一致 |

---

## [v6.2] - 2026-09-30

**动态性修复（4 项）** —— 修复两块界面「静态化」的根因并移除首页横幅区。

| # | 项目 | 说明 |
|---|---|---|
| 1 | 每日巡检产物丢失修复 | v4 合入时 workflow 拆成 4 个并行 job：各自 checkout、无 artifact 传递，publish 再 checkout 拿不到前序产物——signals.json / sourcehealth.json / alerts.json / snapshot.js 自 09-24 起连续 7 天停更（每日提交只剩 meta.json + price-history.json）。现合并回**单 job 顺序执行**，每步独立记录成败并汇总 |
| 2 | 白嫖/免费额度每日自动核对 | 新增 scripts/verify-listings.mjs：逐条抓取来源页 → ok（正常）/ warn（本次抓取失败，观察中）/ stale（连续 ≥3 天失败）/ changed（特征关键词消失）/ manual（JS 空壳等不可自动核对，如实标注）。核对徽标与日期显示在每张卡片上；异常条目写入每日巡检 issue |
| 3 | 市场动态时间线动态化 | 到期促销自动标记「已结束」（expired）并沉底，不再挂着"促销中"；signals.json 官方源线索按日期混入时间线（虚线框 + 「待人工确认」标注），核实后才写入价格表——时间线每天随巡检更新 |
| 4 | 首页横幅区移除 | hero 下方的促销/变动横幅（#hero-promos / #page-alerts）整体移除，信息合并进「市场动态」时间线；alerts.json 机制保留（继续驱动每日 issue），只是不再上首页 |

数据文件的连带变更：freebies.json 每条新增 status / lastChecked 字段（脚本自动维护），CodeBuddy 条目标记 autoCheck:false；promos.json 中 OpenCode Go 活动已自动标记过期。

---

## [v6] - 2026-09-23

**双轮迭代（31 项）** —— 数据真实性、平台覆盖、价格历史与可访问性的系统性修补。
本次代码变更通过 GitHub API 直推 `main`（12 个文件），本站变更记录首次与仓库 CHANGELOG 对齐。

### 第一轮（23 项）

**数据真实性修复（7 项）**

| # | 项目 | 说明 |
|---|---|---|
| 1 | CI 故障静默消除 | 巡检任务失败不再静默跳过，失败计入 `data/sourcehealth.json` 并公开可见 |
| 2 | claude / cursor 监控恢复 | 修复两个长期失效的监控点（Claude 状态页、cursor.com/pricing） |
| 3 | livePrice 降级修复 | models.dev 直连失败时正确降级到 `js/snapshot.js` 兜底快照 |
| 4 | 反爬壳检测 | 识别「对机器人返回验证页」的响应，标记为不可自动监控，不再当作正常内容 |
| 5 | auto-revert 日志 | 页面回到基线哈希时的自动 resolve 写入日志，可追溯 |
| 6 | issue 告警条件扩展 | 待人工核实清单的触发条件扩展，避免漏报 |
| 7 | IT之家降噪 | 降低噪声源的线索产出占比 |

**功能增强（6 项）**

| # | 项目 | 说明 |
|---|---|---|
| 8 | 平台扩展至 14 家 | 新增 DeepSeek API、百度千帆 Token Plan、讯飞星辰 Token Plan、腾讯云 Token Plan、Gemini API |
| 9 | 对比多选 | 勾选 2–4 个平台生成并排对比视图 |
| 10 | 中英文切换 | UI 文案整体国际化，右上角一键切换 |
| 11 | URL 状态持久化 | 筛选、排序、搜索词、对比选中项、语言写入 URL，链接可复现视图 |
| 12 | 计算器模型扩展 | 「订阅 vs API 成本计算器」的模型档位扩充 |
| 13 | CSV 导出 | 对比表一键导出 CSV |

**界面与可访问性（5 项）**

| # | 项目 | 说明 |
|---|---|---|
| 14 | ARIA 标签 | 表格与控件补充语义化标签 |
| 15 | skip-to-content | 新增键盘可达的「跳到主内容」链接 |
| 16 | 移动端 touch 滚动 | 加横向表格的移动端触摸滚动 |
| 17 | 临时文件过滤 | 临时/中间产物不进入发布产物 |
| 18 | cheapSet 键名修复 | 修复性价比标记的键名不匹配 |

**质检修复（5 项）**

| # | 项目 | 说明 |
|---|---|---|
| 19 | `esc()` 安全转义 | 渲染外部数据一律转义，堵住注入面 |
| 20 | `aria-pressed` 同步 | 选中态与无障碍属性保持一致 |
| 21 | CSV 换行处理 | 字段内的换行与引号正确转义，Excel 可直接打开 |
| 22 | Hero 区国际化 | 首屏标题与描述纳入 i18n 字典 |
| 23 | URL 对比上限截断 | URL 中超出 4 个的对比项自动截断，避免构造超长链接 |

### 第二轮

**平台扩展（3 项）** —— 新增 TRAE、Devin、Poe。在售平台总数达到 19 家（另有 1 家已停售平台 R4Coder 保留为历史记录，共 20 个条目）。

**价格历史曲线（3 项）**

| 项目 | 说明 |
|---|---|
| 每日价格快照记录 | 新增 `scripts/record-history.mjs` 与 `data/price-history.json`，每天记录各平台起步价 |
| SVG 趋势迷你图 | 前端以纯 SVG 折线呈现价格走势，零依赖 |
| 调价自动告警 | 与前一日的价格对比，涨/降价写入 `data/alerts.json` |

**巡检接入（1 项）** —— 新增平台的定价页纳入每日哈希巡检范围（`data/sources.json`）。

**质检修复（5 项）**

| # | 项目 | 说明 |
|---|---|---|
| 24 | 安全转义恢复 | 修复第一轮上线后回归的转义遗漏 |
| 25 | record-history 安全化 | 解析 `js/data.js` 时先剥离表达式再做 JSON 解析，避免 `eval` 类风险 |
| 26 | 首屏闪烁消除 | 首屏渲染前不再出现主题/语言闪烁 |
| 27 | meta 文案泛化 | `data/meta.json` 的说明文案不再写死平台数量 |
| 28 | 90 天裁剪修正 | 价格历史保留窗口的边界日期计算修正 |

### 本轮涉及的仓库元信息同步

- README 重写为**中英双语版**并补充配图（`docs/screenshots/`），平台/档位数量、功能清单、目录结构、工作流步骤全部与代码对齐
- 新增本 CHANGELOG，站内「本站变更记录」同步追加 v6 条目
- 站点页脚的数据更新日期改为读取 `data/meta.json`，不再硬编码
- GitHub 仓库描述与 topics 同步更新

---

## [v6.1] - 2026-09-23

**核查修复** —— 对 v6 双轮迭代做交付前核验时发现的问题，逐项复现并修复。

| # | 问题 | 影响 | 修复 |
|---|---|---|---|
| 1 | `scripts/record-history.mjs` 用 `JSON.parse` 解析 `js/data.js` 的 `PLAN_DATA` 字面量 | `data.js` 的键名不带引号（合法 JS、非法 JSON），脚本必抛 `SyntaxError`；该步骤在 CI 中**没有** `continue-on-error`，下一次定时任务的 `publish` 作业会整体失败，每日 09:00 更新静默停摆 | 改走 `js/data.js` 既有的 `_CP_EXPORT` 扩展点（`createRequire` + 取值断言），不做字符串求值、不受键名写法影响 |
| 2 | 语言切换按钮没有任何点击绑定 | `setLang()` 已实现但从未被调用，点击「中 / EN」无任何反应；`I18N` 字典 68 个键中只有约 14 个被使用 | 在 `bind()` 中绑定 `.lang-btn` 点击，并把按钮高亮态同步移入 `setLang()`；URL 带 `?lang=en` 时首屏也会实际应用 |
| 3 | 静态标签未接入 `I18N` 字典 | 章节标题、对比表/Token 榜表头、工具条、排序选项、计算器标签、搜索占位符在英文态仍是中文 | 新增 `data-i18n` / `data-i18n-ph` 通用机制（50 + 2 处），中文态还原原始标记以免丢掉 `<i>` 强调样式 |
| 4 | 两处数据更新日期硬编码为 `2026-09-13` | 页头「数据更新」与页脚日期长期停在首版日期，与实际每日巡检不符 | 页头 `#data-date` 与页脚 `#foot-date` 一并改为读 `data/meta.json` |

已核验：`record-history.mjs` 连跑两次幂等（19 个平台、0 条重复告警）、90 天裁剪正确、构造调价后正确生成 1 条 `price-change` 告警且未变平台不告警；页面无 console 报错，表头排序 / 多选对比 / CSV 导出（21 行）/ 计算器联动 / 语言切换均正常。

> 仍待补齐：英文态下导航栏、首屏统计项文案、长段说明文字与 FAQ / 数据说明正文仍为中文（`I18N` 字典尚无对应键）。

---


信息源机制重构：

- 移除 B站播报来源，改由官方 changelog / 状态页 RSS + 公开社区订阅源（LINUX DO / V2EX / HN）+ 官方文档页哈希巡检组成的多源管道
- 新增「白嫖 / 免费额度」板块（含官方免费档、学生包、免费 API 额度、限时试用）
- 修复 2 个静默失效的监控点：OpenAI 定价页实测对机器人返回 403 Cloudflare、原 Copilot 监控页连接失败；前者改为只抓 news RSS 并人工核价，后者换用 docs.github.com 官方文档页
- 新增「信息源健康」看板，每源抓取成败公开可见，连续 3 天失败标注为已失效
- 新增「自动发现的线索」队列，机器发现与人工确认严格分离，社区情报固定黄色标注、不进价格表

---

## [v4] - 2026-09-13

上线每日自动巡检：GitHub Actions 每天 09:00（北京时间）重新生成 models.dev 兜底快照 + 官方定价页哈希变动检测，变动自动挂「待核实」横幅并开 issue 提醒人工核价。

> 注：本次双轮迭代的提交信息中同样使用了「v4 合入」字样，指的是工作副本的迭代版本，与站点变更记录的 v4 不是同一套编号。

---

## [v3] - 2026-09-13

新增：订阅 vs API 成本计算器、IDE 订阅扩展榜、三周期（5h/周/月）额度倍率、TPS 速度参考、各平台坑点提示（社区反馈）。数据方法与坑点来源：awesome-coding-plan（2857★，2026-09-01 更新）+ Reddit 限额讨论汇总。

---

## [v2] - 2026-09-13

新增：Token 实时价格榜（models.dev 直连 + 兜底快照）、额度倍率列、同类 GitHub 项目板块；重构为多文件结构。

---

## [v1] - 2026-09-13

初版上线：11 平台 33 档对比、市场动态（B站播报 9/12）、FAQ 与数据来源分级。
