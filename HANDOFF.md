# HANDOFF — CodingPlan Radar 接力开发文档

> 新会话 / 新 Agent 接手本项目时，除 README 与 CHANGELOG 外**请优先读本文件**，
> 它记录的是「代码现状 + 踩过的坑 + 下一步该做什么」，避免重复探索或踩同一个雷。

## 项目概况与当前状态

- **定位**：AI 编程订阅计划（Coding Plan）对比站。纯静态站，无构建、零 npm 依赖，GitHub Pages 托管。
- **线上地址**：https://wjf1.github.io/coding-plan-radar/ ｜ 仓库：https://github.com/wjf1/coding-plan-radar
- **覆盖**：20 个条目（19 个在售平台 + 1 个已停售留档）、69 个付费档位；Token 实时价格榜接 models.dev。
- **当前版本**：**v7.3（2026-10-06）**。上一版本 v7.2（2026-10-05，数据目录语义化）、v7.1（2026-10-05，a11y P0 修复）。
- **自动化**：GitHub Actions 每天北京时间 09:00 巡检 → 更新数据 → 提交推送（触发 Pages 重新发布）→ 有事项时开 issue。
- **受众现状**：1 star / 0 fork，仓库 issue 全部是机器人每日巡检开出的（无真人反馈）。功能开发的边际收益很低，
  维护重点应放在**自动化管道不静默失效**上。

## 技术栈与运行基线

- 运行时：**Node ≥ 20**（CI 用 20；本地实测 22 亦可）。无 package.json、无 npm 依赖、无构建步骤。
- 浏览器端：原生 ES5+ / 原生 DOM，无框架。CSS 单文件。
- 测试：Node 内建 `node:test`（`tests/selfcheck.mjs`），**刻意不引入 vitest/jest**，以保住「零依赖」定位。
- 核心命令：

```bash
node scripts/validate.mjs        # 数据契约 + 脚本语法校验（改完 data/*.json 必须跑）
node tests/selfcheck.mjs         # 零依赖自检（15 例）

# 本地预览（必须走 HTTP，file:// 会被 CORS 拦截而只剩空壳）
python -m http.server 8765

# 手动跑一次完整巡检（顺序与 CI 一致）
node scripts/update-snapshot.mjs && node scripts/check-pages.mjs \
  && node scripts/fetch-feeds.mjs && node scripts/diff-prices.mjs \
  && node scripts/verify-listings.mjs && node scripts/record-history.mjs
```

## 核心架构与文件拓扑

**单一事实来源（SSOT）**

| 内容 | 文件 | 谁在写 |
|---|---|---|
| 订阅计划价格 / 档位 / 额度 / 坑点 | `data/manual/plans.json` | **人工**（日常主要改这里） |
| 计算器候选订阅 / 预设模型 | `data/manual/calc-plans.json`、`data/manual/calc-models.json` | 人工 |
| IDE 订阅榜 / 站内变更记录 / 同类项目 | `data/manual/ide-plans.json`、`data/manual/changelog.json`、`data/manual/repos.json` | 人工（changelog 与 `CHANGELOG.md` 同步） |
| 信息源清单（URL / 分级 / 关键词 / 启停原因） | `data/manual/sources.json` | 人工（**改巡检范围只改这里**） |
| models.dev 兜底快照 | `data/auto/snapshot.json` | 机器（`update-snapshot.mjs`，每日） |
| 促销停售 / 白嫖额度 | `data/manual/promos.json`、`data/manual/freebies.json` | 人工确认 + 机器核对状态回写 |
| 线索 / 源健康 / 价格历史 / 基线 / 巡检日期 | `data/auto/signals.json`、`sourcehealth.json`、`price-history.json`、`pricebase.json`、`pagehash.json`（page 源哈希基线）、`listbase.json`（list 源条目基线，v7.3）、`meta.json`、`alerts.json`、`reported.json`、`transients.json` | 机器（每日） |

**目录约定**：`data/manual/` = 人工录入，`data/auto/` = 机器每日生成（勿手改，GitHub 上折叠 diff）。
改数据先改 manual，改巡检范围只改 `data/manual/sources.json`。

**数据流**：`data/manual/sources.json` 声明源 → 六个巡检脚本抓取/比对 → 写回 `data/auto/*.json` → `validate.mjs` 校验 →
`git commit && git push` → Pages 重新发布 → 浏览器端 `app.js` 通过 `fetch` 读取 `data/*.json` 渲染。

**前端**：`js/app.js` 单文件（约 840 行）。`init` 里先 `bind()`（表单/筛选，不依赖数据），
再 `await Promise.all([loadData(), loadPriceHistory()])`，最后统一首屏渲染——数据未到之前不做半渲染。
单文件失败只让对应板块为空（`loadJSONOr`）。

**关键约定**：人工维护的数据与机器生成的数据**严格分离**；机器只负责发现，任何价格/促销数字必须人工确认后才进对比表。
## 最近一轮变更与交付成果（v7.3，2026-10-06）

### v7.3 —— 信息源采集层升级：条目级监控（list 源）

官方页告警从「这个 800KB 页面变了」升级为「哪个档位的哪个字段从什么变成了什么」。
借鉴 AIHOT `web_list` 的「选择器定位条目 + 先预览再创建」，解析引擎为本仓库自己的零依赖实现；
架构不变（仍无 npm 依赖、无数据库、零 LLM）。方案出处见下方「信息源与线索分析改造方案」章节，本版实施的是其**步骤 1**。

1. **`lib.mjs` 极简 HTML 条目抽取引擎**：`parseSimpleSelector` / `matchBlocks` / `pickText` / `parseListItems` /
   `diffListChanges` / `isStructuralBreakdown`。选择器子集 = `tag`/`.class`/`#id` 单级组合 + `:nth(k)` 后缀 +
   最多三级后代路径；语法超出子集**直接抛错**（宁可不解析也不静默错抓）；`script`/`style`/注释先剥离，
   里面的假标签不参与标签配对。
2. **`sources.json` 新增 `lists` 数组**（`itemSelector` + `fields` + `keyField`）：**GLM Coding Plan 文档页**
   从 page 迁移为首个 list 试点——此前该页任何无关改动都触发整页哈希告警，现在只盯「套餐类型 / 5 小时积分 / 每周积分」表。
3. **`check-pages.mjs` 双通道**：page 源沿用整页哈希（含二次确认 / 不稳定检测 / auto-revert，全部未动），
   list 源走条目 diff（基线 `data/auto/listbase.json`），共用反爬检测与源健康；alert 新增
   `kind: "list-change"`（带 `changes` 明细，上限 20 处）与 `kind: "structure-change"`（熔断提醒）。
4. **两道保护**：解析出 0 条 → 绝不建基线、不写 alert、只记源健康；条目骤变/过半变动 → 只提醒人工核对选择器、
   **不更新基线**（防把改版页面固化成新基线）。
5. **新增 `scripts/probe-source.mjs`**：试抓预览，与正式采集同一解析逻辑，解析 0 条即非 0 退出；改选择器前必跑。
6. **`validate.mjs`** 新增 sources.json 契约（id 跨数组查重 / tier 白名单 / selector 语法）；
   **`tests/selfcheck.mjs` 15 → 24 例**；**`daily-update.yml`** 的 issue 对 list 告警逐行列出字段级变更明细。

**开发中被端到端验证抓住、当场修复的两个缺陷**（验证脚本为一次性工具，未入仓库）：

- 结构变更分支最初漏把旧基线带回写盘对象 → 下次巡检会把改版页面当「首次见面」重新建基线，熔断反而加速坏结构固化。
- 同源存在其它类型未解决 alert（page 时代遗留）时复用旧卡只更新 `detected` → `kind` 保持旧值、`changes` 丢失。
  改为 `kind` 一致才原卡复用，否则旧卡标 `superseded`、另开新卡。

验证：`validate.mjs` 通过；`selfcheck.mjs` 24/24；probe 对智谱页实测抽出 3 档精确数据；
临时目录四场景（字段变动→二次确认→报警 / 回滚自动关闭 / 结构变更熔断 / 0 条保护）17 项断言全过。

### v7.2 —— 数据目录语义化 + 死代码清理（含与 v7.1 并行改动合并）

1. **data 目录按维护方式分离**：`data/manual/`（9 个人工录入文件）与 `data/auto/`（10 个机器每日生成文件）。
   全仓库 99 处路径引用同步改写（脚本 / 前端 / workflow / 校验 / 测试夹具），新增 `.gitattributes` 让 GitHub 折叠 auto 目录的 diff。
   动机：此前 19 个 JSON 平铺在一个目录里，「哪些能手改、哪些会被巡检覆盖」只能靠记忆或读脚本，
   而工作流里甚至有一处把人工文件与机器产物混在一起 `git add -A`。分离后这件事由目录结构本身表达。
2. **删除死代码 `populateCalcModels()`**：该函数（v4 合入时引入）从未被调用，与之配套的
   `window._CALC_MODEL_POOL` 回退分支也永远是 `undefined`，一并清除，`renderCalc()` 直接用 `CALC_MODELS`。
   删除而非接线是刻意的：接线会让计算器下拉从固定 3 档变成 20+ 个动态模型，属于面向线上页面的行为变更，
   不该混在整理类改动里。相关取舍见下方 Backlog 的 P2 行。
3. **补齐计算器表头的 `scope`**：与并行的 v7.1（a11y）合并后验收时发现，`renderCalc()` 生成的候选订阅表 4 个 `<th>` 没有 `scope`——v7.1 覆盖了 3 个静态表格但漏了这张 JS 生成的表。已补齐，运行时全站 33 个 `<th>` 全部带 `scope`。
4. **更正 v7.0 的一处误报**：先前记录「`data/transients.json` 没有产出方」有误——
   `scripts/check-pages.mjs:101-114` 正常写入 auto-revert 记录，workflow 读取的字段也一致，该分支可正常触发。

验证：`node scripts/validate.mjs` 通过（manual 9 + auto 10）；`node tests/selfcheck.mjs` 15/15；
浏览器端确认九个数据板块在新路径下全部正常渲染。


### v7.1 —— 对比度、键盘可达性与交互 Bug（a11y P0，12 项）

依据「CodingPlan Radar UI 设计提升方案」（PDF）评审执行，**只做判定为真实缺陷的部分**。

**先说这份方案不能直接照抄**（下次若再拿到同类评审文档，先查这几项）：

- ❌ **所有代码块都是空的**：附录 A.1–A.8 与正文 §6.1–6.8 的「修复：」框，框高仅一行、无任何字符。
  既不在 PDF 文本层（`pypdf` 提取到"修复："后直接是下一节标题），也不是图片（全文仅 198 张 2–6KB 的 emoji 字形图）。
  说明**源文件里 `<pre>` 块从未被写入**，而非渲染丢字——本次代码全部按代码库实况重写。
- ❌ **§4.2 字号替换表约 10/16 行选择器标注错误**：如 `.ratio small` 标 11.5px 实为 11px、`.hero p` 标 13.5px 实为 15.5px、
  `.pick .pr` 标 15.5px 实为 26px；并漏了真实存在的 15px（`.ratio`）、16px（`.verdict b`）。
  **照此表执行必然漏改**——要用就从 CSS 提取 `选择器 → 字号` 再映射，别手写。
- ❌ **`#04121f` 说"三处"实为两处**：第三处 `.lang-btn.on` 的 CSS 规则**在 `styles.css` 里根本不存在**
  （`.lang-btn` 只有 index.html 内联 `<style>` 里的定义），与文档 §7.2 自相矛盾。
- ⚠️ **`target="_blank"` 说"全站数十处"实为 12 处**（4 处 HTML + 8 处 JS 模板），措辞夸大。
- ⚠️ **§10.1 的数据契约已过时**：它要求保持「`data/*.json`、`js/data.js`、`js/snapshot.js` 三者不变」，
  而 v7.0 恰好删掉了后两个、改为纯 `data/*.json`。

**值得认可的准确性**：全部 WCAG 对比度数值分毫不差（`--dim` 4.45/4.23/4.03、建议值 5.52/5.25/5.00、
`--muted` 7.37、表头 6.82、`--accent` 6.06、正文 16.34、chip 选中 5.97–10.23）；行数 219/358/837 精确；
4 个具体 bug（空状态、上限、aria-sort、焦点环）全部属实；sticky 表头失效的机制解释正确
（`overflow-x:auto` 使容器成为最近可滚动祖先，`position:sticky` 垂直方向贴不到视口）。

本次落地的 12 项（详见 `CHANGELOG.md` v7.1）：

1. `--dim` → `#7c8aa6`（脚注对比度 4.03–4.45 → 5.00–5.52，全部过 AA）
2. `.disclaimer` 的 `#58657f`（3.27:1，比 `--dim` 原值更差）→ `var(--dim)`
3. 全局 `:focus-visible` 焦点环 + 三处覆盖（`input.s`/`select` 的 `outline:none` 提权、summary 内缩因 `details` 是 `overflow:hidden`）
4. 18 个 `<th>` 补 `scope`；103 个外链补 `rel="noopener noreferrer"`
5. `hideDecorativeGlyphs()`：章节标题/图标位 emoji 包进 `aria-hidden`
6. `prefers-reduced-motion` 兜底
7. 对比表空状态（`renderPlans` 此前直接置空 tbody）
8. 对比上限在交互层拦截（原先只靠 `restoreURLState` 的 `.slice(0,4)` 兜底 → 勾第 5 个渲染 5 列、刷新变回 4 列）
9. hero 兜底数 11/33/15 → 19/69/14（`st-models` 的 `60+` 在 JS 中无来源，永不覆盖）
10. 排序 `data-sort` + `aria-sort`；箭头用 CSS `::after` 生成（避免被 `applyI18N` 的 `data-i18n-orig` 记进 DOM）；
    并修正整行表头（含不可排序列）都显示手型
11. 3 处行内 `onclick` 按 §6.6 迁到 `bind()`，HTML 仅留 `data-action="compare|clear|export"`
12. 第 9–12 项之外，还修了文档漏掉的 `.disclaimer` 对比度与 `st-models` 无 JS 来源

验证证据：`node scripts/validate.mjs` 通过；`node tests/selfcheck.mjs` 15/15；浏览器实测（本地 HTTP + Chrome
DevTools，**可编程断言而非截图判读**）——搜索 `zzzz` 出空状态且复位按钮生效；勾第 5 个被拦截（`checked` 保持 4、
提示文案出现、URL `compare` 参数为 4）；点价格表头 `aria-sort` 在 ascending/descending 间切换；真实 Tab 后
`skip-link` 的 `:focus-visible` 计算样式为 `2px solid rgb(91,140,255)`；18/18 `scope`；103 个外链 `rel` 齐全；
14 处 emoji 已 `aria-hidden`；`--dim` 计算值 `#7c8aa6`。

**未做**（判定为收益/风险不划算，见下节 Backlog）：字号/间距/阴影 Token 化、浅色主题、scrollspy / 返回顶部 /
进度条、sticky 表头修复、sparkline 交互、计算器图表、骨架屏、i18n 长文本全量翻译。

### v7.0 —— 安全边界、数据写入可靠性与巡检可见性
本次由「CodingPlan Radar 开发执行计划」评审结论驱动，**只做按 ROI 排在前面的项，砍掉了架构洁癖类任务**。

修复的真实问题（均先复现、再修、再验）：

1. **Token 榜 XSS**：`renderTokens()` 把 models.dev 返回的模型名/ID/厂商直接插进 `innerHTML` —— 全站唯一
   「第三方不可信数据进 DOM」的路径，已全部过 `esc()`。
2. **`esc()` 挡不住协议**：新增 `safeHref()`，所有动态 `href` 只放行 `http(s)`，其余降级为 `#`。
   （`esc` 只处理 `&<>"`，`javascript:` 照样能进 href。）
3. **CSV 公式注入**：导出时对 `=` `+` `-` `@` 开头的单元格前置单引号。
4. **非原子写入**：`lib.mjs` 的 `writeJSON` 改为 `.tmp` + `rename`。原先 `writeFileSync` 先截断目标文件，
   中途被杀即留半截 JSON；而 `readJSON` 的容错把损坏文件当成「不存在」并回落默认值——**等于静默清空整库数据**。
5. **坏快照可入库**：`update-snapshot.mjs` 增加 schema 校验（缺字段/空快照直接抛错），不再把坏兜底写进仓库。
6. **第三方接口拖首屏**：models.dev 加 5 秒 `AbortSignal.timeout` 快速降级；降级提示改读快照的真实 `generatedAt`
   （原先硬编码「2026-09-13」，与每日重生成的快照不符）。
7. **巡检失败静默**：`record-history` 的失败原先写成 `ok=false: record-history` 挂在一个无 `id` 的步骤上，
   既拿不到 outcome 也不进失败汇总；现纳入 `failed_steps` 并开 issue。
8. **Node 侧 hack**：`record-history.mjs` 原靠 `require("../js/data.js")` + `globalThis._CP_EXPORT` 取数据，
   该 hack 只要 data.js 引入 ESM 语法即崩。数据已 JSON 化（`data/manual/plans.json` 等 6 个文件），
   `js/data.js`、`js/snapshot.js` 删除，浏览器与脚本共用同一份来源。
9. **零校验**：新增 `scripts/validate.mjs`（数据契约 + `node --check`）与 `tests/selfcheck.mjs`（15 例）；
   `daily-update.yml` 里校验不通过**则不提交**，并新增 `validate.yml` 在 push/PR 时运行。

验证证据：

- `node scripts/validate.mjs` 通过（19 个 JSON + 10 个 JS 文件）。
- `node tests/selfcheck.mjs`：15/15 通过，含 `validate.mjs` 的四类负向用例（坏 JSON / 空快照 / 缺字段 / 语法错误）。
- 浏览器端（本地 HTTP + Chrome DevTools，劫持 `fetch` 注入恶意载荷，不改动仓库数据）：
  - 恶意模型名 `<img src=x onerror=…>` → 执行标记为 `null`，`#ttbody` 内 `img`/`b` 元素数为 0，`&lt;img` 可见（转义生效）；
  - `javascript:` 链接（线索 / 来源链接）→ `href` 渲染为 `#`，全页无 `javascript:` 协议链接；
  - 恶意计划名 `=cmd|' /C calc'!A1` → CSV 首个单元格为 `"'=cmd|…`（公式防护生效）；
  - 桩一个「永不返回且遵守 abort 信号」的 models.dev → 5 秒后 `signal timed out` 并降级到快照（128 款，日期 2026-10-05）。
- **未做**：功能类与重构类任务（见下节 Backlog）。

## 信息源与线索分析改造方案（借鉴 AIHOT，草案 · 未实施）

> **状态：步骤 1 已于 v7.3（2026-10-06）实施发布**——page 整页哈希 → 条目级选择器已完成，GLM 文档页为首个试点；
> **步骤 2（LLM 分诊）与步骤 3（聚类热度）仍未实施**，实施前请先读下一节的「明确不建议做」，其中三条红线即出自本方案。
>
> **评估来源**：[KKKKhazix/AIHOT](https://github.com/KKKKhazix/AIHOT)（MIT；Node 24 + PostgreSQL 17 + Docker 的全栈资讯热点站）。
> 关键参考文件：`docs/sources.md`（六种信源与试抓预览）、`docs/selection.md`（预筛 / 双评分 / 分级门槛 / 校准）、
> `industry/prompts/`（全部提示词，按内容哈希做版本）、`industry/selection.ts`（门槛常量）、`.env.example`（模型 / 向量 / 付费采集配置）。
>
> **结论：借「线索层的智能化」，不借架构。** 本站卖的是**价格事实**（错一位即误导用户），AIHOT 卖的是**资讯筛选**（允许摘要级误差）。
> AIHOT 的采集类型、预筛、双评分、聚类、热度只应作用在 `data/auto/signals.json` 这一段线索流上；
> `plans.json` / `promos.json` / `freebies.json` 里的任何价格与额度数字，仍只由结构化源或人工确认产出。
> 这条与现有「机器只负责发现，任何价格/促销数字必须人工确认」的约定完全一致——AIHOT 的模型分诊恰好能把「发现」做得更准，而不越过这条线。

### 为什么不能整体对齐

| | 本站 | AIHOT |
|---|---|---|
| 形态 | 纯静态站（Pages）+ Actions 每日脚本 + JSON 落盘仓库，零 npm 依赖 | Node 24 + PostgreSQL 17 + Docker 全栈服务，带后台 / API / MCP |
| 数据性质 | 结构化事实：价格、5h/周/月三档额度、白嫖条款 | 非结构化资讯流 |
| 处理方式 | **零 LLM**：整页哈希 + 关键词整词匹配 + 价格 diff + 人工核价 | LLM 六步：判重 → 预筛 → 双评分 → 结构化 → 写作 → 聚类 → 热度 |
| 质量哲学 | 宁可当天不更新，也不让坏数据进仓库 | 宁可少选几条，也不让噪声进精选（但允许模型自主入选） |
| 信息源 | 3 类（feed 10 / page 17 / api 5），声明在 `sources.json`，四档 tier + 健康看板 | 6 类（rss / web_list / json_list / x_search / mp_account / external），后台管理、试抓预览、付费熔断 |

差异决定了取舍：**采集与分诊可以借鉴，存储与发布架构不能动**（静态站 + git 可追溯每一次价格变动，本身就是本站的核心资产之一）。

### 步骤 1（P1 · 零 LLM · 零依赖）：page 源从整页哈希升级为条目级选择器

**现有痛点（真实存在）**：`scripts/check-pages.mjs` 对 SSR 页做「去标签后 sha256 整页哈希」，只能得出「这个 1MB 页面变了」，
然后人工上去找哪一行变了；而 `sources.json` 里已有一批 JS 空壳页（qoder / copilot.tencent / codebuddy / volcengine），
hash 恒定不变，纳入监控等于自欺——`disabled` 数组里已如实记录。AIHOT 的 `web_list` 思路是用 CSS `itemSelector` 定位到**每条记录**再抽字段，
谁变了、从什么变成什么，一目了然。

**改动**：

1. `data/manual/sources.json` 的 `pages` 增加可选字段（或新增 `lists` 数组，二选一，倾向后者以免污染现有 page 语义）：

```json
{
  "id": "bigmodel-coding",
  "label": "智谱 Coding Plan 定价",
  "url": "https://docs.bigmodel.cn/cn/coding-plan/overview",
  "tier": "official",
  "type": "list",
  "itemSelector": ".plan-card",
  "fields": { "name": "h3", "price": ".price", "quota": ".quota" },
  "enabled": false
}
```

2. 新增 `scripts/probe-source.mjs <id>`：只打印解析结果（条目数 + 前 20 条的字段值），不写任何文件。
   这是照搬 AIHOT「**先预览，再创建**」的关键工程习惯——预览与正式采集套用同一组过滤，看到的就是正式会收的。
   **selector 一条都解析不出来时必须报错退出，绝不落基线**（否则下一轮巡检会把「全空」当成真实变动）。
3. `scripts/check-pages.mjs` 对 `type: list` 的源改走条目级比对：逐条抽字段 → 与基线比对 → 写入 `alerts.json`，
   且 alert 新增 `changes: [{ item, field, from, to }]`，issue 正文直接列出「某档位价格 19→25」。
4. 新增基线文件 `data/auto/listbase.json`（与现有 `pagehash.json` 同角色，勿混用）。

**验收**：对 `docs.bigmodel.cn/cn/coding-plan/overview` 人为改一个价格数字，alert 输出的是「第 N 档价格 19→25」，而不是「页面已变动」。
`node scripts/validate.mjs` 与 `node tests/selfcheck.mjs` 保持全绿。

**边界与熔断**：
- 结构改名（CSS 类被重写）会造成「全量变动」假告警 → 设熔断：单次变动条目占比 > 50% 视为结构变更，只开 issue、不写 alert、不更新基线。
- 现有 4 个 `page-unreliable`（Cloudflare 挑战页 / SPA 空壳）维持禁用，不因本改造复活。

### 步骤 2（P2 · 引入 LLM，只做分诊）：预筛 + 双评分 + 按 tier 设门槛

**现有痛点**：`signals.json` 当前 97 条线索全部是「关键词命中即收」，噪声不小——
例如「德国电力公司推出游戏玩家专属电价套餐」这类与订阅计划无关的条目也进来了（命中的只是 `price` 一类通用词）。
AIHOT 的做法是 `prefilter.md`（宽进，只拦明显无关）→ `selection-score.md`（同一份标准独立打两次 0–100，两次之和 ≥ 2×门槛）
→ 门槛按信源分级（官方一手低、媒体个人高）。本站已有的四档 tier（official / realtime / agg / community）天然可映射。

**改动**：

1. 新增 `prompts/prefilter.md`、`prompts/score.md`——**提示词与代码分离，改名不改代码**；提示词版本取其内容哈希，写入产物，便于回溯「这条当初为什么被判 reject」。
2. 新增 `data/manual/triage.json` 存门槛与总开关（对齐 AIHOT 把门槛常量放在代码外的习惯）：

```json
{ "enabled": false, "thresholds": { "official": 50, "realtime": 60, "agg": 70, "community": 80 } }
```

3. 新增 `scripts/triage-signals.mjs`，插在 `fetch-feeds.mjs` 之后、workflow 生成待处理清单之前，回写每条信号：

```json
"triage": { "prefilter": "PASS", "scores": [72, 68], "avg": 70, "decision": "select", "promptHash": "a1b2c3d4", "model": "deepseek-flash" }
```

4. workflow 的「生成待处理清单」按 `triage.avg` 排序、只取 `decision === "select"` 的前 20 条，替代现在的「时间序前 20 条」。

**红线（务必写进代码注释）**：`triage.decision` **只影响 issue 里线索的排序与取舍**，不得写入
`plans.json` / `promos.json` / `freebies.json` 的任何价格或额度字段。模型回答的是「值不值得看」，不是「价格是多少」。

**降级**：LLM 不可用、超时或返回非 JSON → 全部标 `UNKNOWN`、保留原时间序，并把失败记入 `sourcehealth.json`（新增虚拟源 id `llm-triage`），
当日**照常提交**，绝不因为模型故障阻塞整条巡检（延续本站「宁可当天不更新，也不让坏数据进仓库」的相反面：宁可少一次分诊，也不让管道变红）。

**评测（引入 LLM 的必配项，不做等于不知道改动是变好还是变坏）**：
- `.data/gold.jsonl`（**不进 Git**）：从现有 signals 抽 100–200 条，逐条人工标 `select` / `reject` / `either`，多放难例。
- 新增 `scripts/eval-triage.mjs`，输出准确率 / 查准率 / 查全率，分开发集与留出集，用法对齐 AIHOT 的 `eval-selection.ts`。
- **门槛不要照抄 AIHOT 的 60 / 65 / 76**——那是 AI 资讯领域的样本，本站必须用自己的评测集校准。

**成本与密钥**：约 97 条 × 3 次调用 ≈ 300 次 flash 级小请求/天，成本可忽略。`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`
放 **GitHub Actions secrets**，绝不进仓库；请求加硬超时，不依赖默认值。

### 步骤 3（P3 · 事件聚类 + 热度）

**收益**：一次降价可能同时被 HN、官方 changelog、社区提到，现在会显示三条；聚成一个事件后只显示一条，
且「有多少个独立来源在说同一件事」本身就是比「时间新」更靠谱的优先级信号。

**改动**：

1. 候选召回**先按标题 + 摘要的关键词/字符重合**，不上 embedding 服务（现有线索量级仅百条；
   AIHOT 自己也写明向量不配时用文字重合兜底，只是热度偏低——本站量级下够用，不值得多接一个付费依赖）。
2. 新增 `prompts/group.md`，让模型判定「同一件事 / 后续进展 / 两件事」，拿不准的合并，写入前复核一遍。
3. 产物 `data/auto/events.json`；`signals.json` 每条加 `eventId`。
4. 热度按事件算：48 小时窗口，每个独立 source 只计一次，24 小时减半。
5. 前端 `js/app.js` 把动态区从扁平日线改为按事件折叠成一组（线索卡片显示「N 个来源在说」），
   `index.html` 结构同步调整；所有新字段渲染必须过 `esc()` / `safeHref()`（见避坑节）。

### 贯穿三步的硬约束

- 产物落 `data/auto/`，人工配置落 `data/manual/`；写入一律用 `lib.mjs` 的 `writeJSON`（原子写）。
- 新增步骤一律加入 `daily-update.yml` **同一个 job 内顺序执行**，并接入现有 `ok=true/false` outcome 汇总——
  **不要拆成并行 job**（v6.2 已踩过，见避坑节）。
- 任一步失败都不得让当天数据不提交（除现有 `validate` 门禁外）。
- 每条 LLM 结论都必须**可回溯**：产物里保留 `model` + `promptHash` + 判定理由，与站点「来源分级 / 诚实原则」的定位一致。
- 建议按步骤各自独立成版本（步骤 1 → v7.3；步骤 2 → v8.0；步骤 3 → v8.1），
  每步单独走「功能测试 + 安全验证 → CHANGELOG / README 中英 / HANDOFF → 版本号 + annotated tag → GitHub Release」四文档门禁。

### 逐项对照：借什么 / 不借什么

| 借鉴项 | 判定 | 落点 |
|---|---|---|
| `web_list` 选择器采集 + 试抓预览 | ✅ 步骤 1 | 替代整页哈希，直击现有痛点 |
| 预筛 + 双评分 + 按 tier 设门槛 | ✅ 步骤 2 | 映射本站四档 tier，降人工核验量 |
| 事件聚类 + 按事件算热度 | ✅ 步骤 3 | 解决重复刷屏，产出更好的优先级 |
| 提示词与代码分离、版本 = 内容哈希 | ✅ 步骤 2 起 | 调提示词不必改代码、不必全量重跑 |
| 金标准评测集（gold.jsonl + 开发/留出集） | ✅ 步骤 2 必配 | 引入 LLM 的验收前提 |
| 付费采集服务（Jina 渲染 / SocialData / 极致了） | ⚠️ 可选 | 可救回现被 Cloudflare 拦死的源，但要花钱 |
| Postgres + Docker + 后台 / API / MCP 架构 | ❌ | 破坏静态可审计、零运维定位 |
| 让 LLM 产出价格 / 额度数字 | ❌ 红线 | 价格错一位即误导用户 |
| 为聚类引入向量 / embedding 服务 | ❌ | 量级不需要，多一个付费依赖与失效面 |
| 「实时」目标与常驻进程 | ❌ | 日更足够；且常驻进程有既存硬约束 |

## 接力开发指引与待办（Next Steps / Backlog）

### 明确不建议做（有事故记录或零收益）

- ❌ **字号 / 间距 / 阴影 / 层级 Token 化**（UI 方案 P1-1、§3.2–3.3）。纯重构、**零用户可见收益**，要动 219 行 CSS
  与 358 行 HTML 每一处字号与间距，回归面覆盖全站；且**唯一落地依据 §4.2 替换表本身就是错的**（约 10/16 行选择器
  标注有误、漏了 15px / 16px）。若哪天真要做，**必须用脚本从 CSS 提取 `选择器 → 字号` 再映射**，不要手写表格。
- ❌ **浅色主题**（§9.1）。看着是"低成本扩展"，实际每个 `--dim` / `--muted` / 边框配对都要在浅底上重新验对比度；
  本站色板是为深色底调出来的，翻浅色等于重做一遍颜色体系，而受众只有 1 star。
- ❌ **scrollspy / 返回顶部 / 章节进度条**（§5.1、P1-5）。给一个"零依赖、单文件 JS"的站加 IntersectionObserver
  常驻逻辑，收益是锦上添花，代价是首屏多一段全局代码 + 一个新的失效面（观察器泄漏、锚点与 section id 失配）。
- ❌ **sparkline 交互升级 / 计算器条形图 / 骨架屏**（§9.3、§9.4、§9.6）。均为 P2 装饰性投入。
- ❌ **i18n 长文本全量翻译**（§8.3，编辑推荐 / FAQ / 数据说明 / 平台详情正文）。这是**内容工程**不是 UI 任务，
  要把 `plans.json` 等字段改成 `{zh,en}` 结构。文档自己给的务实方案是「把 EN 模式定性为国际化预览并如实告知覆盖度」——本轮维持现状。
- ❌ **把 workflow 拆成多 job 并行 + artifact 传递**（开发计划里的 C1-1）。v6.2 已经踩过：并行 job 各自 checkout、
  无 artifact 传递，`signals.json`/`sourcehealth.json`/`alerts.json` 连续 7 天停更。
  `.github/workflows/daily-update.yml` 顶部有注释说明，**不要重蹈**。
- ❌ **把 `app.js` 拆成 `js/modules/*` + 自研 store**（计划 F1-1/F1-2/F1-3，约 4h）。README 的定位是「3 个 JS 文件下
  框架是过度设计」，自研 store 等于手工复刻框架；对单人零构建项目收益≈0、回归风险实在。
- ❌ **反馈按钮把数据写进 localStorage**（计划 P1-4-1）。用户提交的反馈只存在用户自己浏览器里，作者永远收不到；
  要做就得接 GitHub Issues API。
- ❌ **引入 vitest / ESLint + 全仓库一次性格式化**（计划 Q1-1/Q2-1）。会打破「零 npm、零构建」定位；
  测试需求已由 `tests/selfcheck.mjs` 以零依赖方式覆盖。
- ❌ **把本站整体改成服务端应用**（Postgres + Docker + 后台 / API / MCP，即 AIHOT 的架构）。
  会一次性丢掉静态站的全部优势：零成本零运维、数据即真相（JSON 全在仓库里、git 可追溯每一次价格变动）、可离线读、Pages 直发。
  需要 LLM 就在 Actions 里加一个离线步骤，产物照旧落 `data/auto/*.json`，前端读法不变。**连 `package.json` 都不要引入。**
- ❌ **让 LLM 产出价格 / 额度数字**。AIHOT 是资讯站，摘要级误差可接受；本站价格表错一位即误导用户。
  价格只能来自结构化源（models.dev / OpenRouter / LiteLLM）或人工确认。模型只回答「值不值得看 / 属于哪一类 / 和哪条是同一件事」。
  若将来真要做抽取，必须配二次核验（抽取值回到源页做正则或哈希校验，一致才落库）。
- ❌ **为聚类引入向量 / embedding 服务**。现有线索量级仅百条，标题摘要的关键词/字符重合已足够召回候选；
  多接一个付费依赖等于多一个失效面。
- ❌ **在 Actions 里改「实时」或起常驻进程**。本站是日更的订阅对比站，实时化收益≈0；
  且常驻后台进程有既存的硬约束（见「关键避坑与运行约束」与用户级 AGENTS.md）。

### 值得做但本次未做

> v7.2 已完成其中两项（数据目录语义化、删除 `populateCalcModels()`），下表为剩余项。

| 优先级 | 待办 | 说明 |
|---|---|---|
| 已完成（v7.3） | ~~**信息源采集层升级：page 整页哈希 → 条目级选择器**~~（改造方案步骤 1） | **已完成**：`lib.mjs` 选择器引擎 + `lists` 数组 + `probe-source.mjs` + 熔断/0 条保护，GLM 文档页为首个试点。**后续迁移其余 11 个 page 源时逐个做**：每个都要先用 `node scripts/probe-source.mjs <id>` 验证 selector 能稳定抽出条目，SPA 空壳页与 Cloudflare 拦截页（现有 `page-unreliable` / disabled）不要尝试迁移 |
| P2 | **线索分诊：预筛 + 双评分 + tier 门槛**（改造方案步骤 2） | 需接 LLM 与建评测集；红线是只影响线索排序、不碰任何价格字段。前置条件：`.data/gold.jsonl` 标注完成 |
| P3 | **事件聚类 + 热度**（改造方案步骤 3） | 依赖前两步；需前端配合把动态区改为按事件折叠 |
| P2 | **计算器只暴露 7 个预设中的 3 个（真缺陷）** | `data/manual/calc-models.json` 配了 7 个档位，但 `index.html` 的 `<select id="calcmodel">` 只写死 3 个 `<option>`（value 0/1/2），另外 4 个（百度千帆 ERNIE 5.1 / 腾讯云 GLM-5.3-Flash / 讯飞星火 X2.5 / Gemini 3.8 Flash）用户选不到；且这 3 个 option 的标签与 `calc-models.json` 的 label 重复维护，改一处不同步就漂移。修法：初始化时用 `CALC_MODELS` 渲染 `<option>`（保留「GLM-5.3（中档）」为默认选中），删掉 index.html 里写死的三项 |
| P3 | **LICENSE 缺失** | 公开仓库建议补 MIT LICENSE 与 `CONTRIBUTING.md`（计划 E1-1） |
| P3 | **功能类需求**（计划 P1-2-1 散点图 / P1-3-1 最近 7 天变更面板 / P1-5-1 场景标签过滤） | 在零受众前提下边际收益≈0；若把项目当作品集则优先做这些（而不是 store 与 lint），并同步补 README 配图 |
| P3 | **localStorage 缓存版本化**（计划 S3-2） | 当前 `CACHE_KEY = "cp_modelsdev_cache_v1"` 无 schema 版本与过期清理。缓存结构一变就会读到旧结构，建议加 `schema` 字段 |

### 接手第一步建议

1. `git pull` 确认在 `origin/main` 最新（**注意本地克隆很容易滞后**，见下节）。
2. `node scripts/validate.mjs && node tests/selfcheck.mjs`，两条都绿再动手。
3. 改完数据先跑 validate；改完 JS 用本地 HTTP + DevTools 做一次可编程断言（本项目不靠截图判读）。

## 关键避坑与运行约束

- ⚠️ **本地克隆滞后是最大的坑**：本次接手时本地 `main` 落后远端 17 个提交，导致「计划说的行数/结构对不上」
  的错误判断。**任何代码审查、行号引用、任务估算之前，先 `git fetch && git log origin/main --oneline`。**
- ⚠️ **必须经 HTTP 打开页面**：所有数据走 `fetch("data/*.json")`，`file://` 下会被 CORS 拦截，页面只剩空壳。
  本地预览用 `python -m http.server` 或 `npx serve`。
- ⚠️ **`data/*.json` 一律原子写**：新增脚本请用 `lib.mjs` 的 `writeJSON` / `writeFileAtomic`，不要直接 `writeFileSync`。
  半截 JSON 会被读取容错误判为「文件不存在」，静默丢掉整块数据。
- ⚠️ **`.tmp` 中间文件**：已加进 `.gitignore`；若在仓库里看到 `*.tmp`，说明上次写入被中断，需人工确认目标文件完整性。
- ⚠️ **改巡检范围只改 `data/manual/sources.json`**，不要硬编码 URL 到脚本里；源健康（`sourcehealth.json`）会如实反映抓取失败。
- ⚠️ **社区源在大陆线路不可达**（LINUX DO / V2EX 等，数据中心 IP 被拦 403/空响应），本地跑必然失败并记入源健康，
  这是预期行为，不是 bug；只有 GitHub Actions 的海外出口能抓到。
- ⚠️ **CI 里 `continue-on-error` 会把 job 结果变成 success**：判断某步骤是否成功必须读它自己写进
  `steps.<id>.outputs` 的标记（本 workflow 用 `ok=true/false`），**不能读 `needs.<job>.result`**——那是 job 级结果。
- ⚠️ **`esc()` 只处理 `&<>"`**：任何写进属性或 URL 的场景请用 `safeHref()`（放行 http/https）而不是裸 `esc()`。
- ⚠️ **公众号式数据条目字段含义**见 `data/manual/plans.json` 顶部的 `_readme`；新增平台条目必须带 `srcUrl`（校验会拦）。
- ⚠️ **数据分两处**：`data/manual/`（人工）与 `data/auto/`（机器）。新脚本写产物请落到 `data/auto/`，不要写进 `data/manual/`——后者是人工录入区，机器回写只允许改 status 一类核对字段。
- ⚠️ **改 list 源（`sources.json` 的 `lists` 数组）选择器前必须先 probe**：`node scripts/probe-source.mjs <id>` 预览，解析 0 条即报错退出。运行期保护已内置：`check-pages.mjs` 对 list 源解析出 0 条时不建基线、不报警、只记源健康；条目骤变/过半变动按结构变更熔断（写 `structure-change` alert 但**不更新基线**——修复过一次「熔断丢基线导致下次巡检把坏结构固化成新基线」的缺陷，改动该分支时务必保持旧基线回盘）。list 源告警的 `changes` 明细由 `daily-update.yml` 生成 issue 时逐行展示。
- 📌 Windows 环境下 `renameSync` 覆盖已存在文件是可行的（等价 `MOVEFILE_REPLACE_EXISTING`），原子写入无需额外处理。
