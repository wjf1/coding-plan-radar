# HANDOFF — CodingPlan Radar 接力开发文档

> 新会话 / 新 Agent 接手本项目时，除 README 与 CHANGELOG 外**请优先读本文件**，
> 它记录的是「代码现状 + 踩过的坑 + 下一步该做什么」，避免重复探索或踩同一个雷。

## 项目概况与当前状态

- **定位**：AI 编程订阅计划（Coding Plan）对比站。纯静态站，无构建、零 npm 依赖，GitHub Pages 托管。
- **线上地址**：https://wjf1.github.io/coding-plan-radar/ ｜ 仓库：https://github.com/wjf1/coding-plan-radar
- **覆盖**：20 个条目（19 个在售平台 + 1 个已停售留档）、69 个付费档位；Token 实时价格榜接 models.dev。
- **当前版本**：**v7.1（2026-10-05）**。上一版本 v7.0（2026-10-05，数据 JSON 化重构）。
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
| 订阅计划价格 / 档位 / 额度 / 坑点 | `data/plans.json` | **人工**（日常主要改这里） |
| 计算器候选订阅 / 预设模型 | `data/calc-plans.json`、`data/calc-models.json` | 人工 |
| IDE 订阅榜 / 站内变更记录 / 同类项目 | `data/ide-plans.json`、`data/changelog.json`、`data/repos.json` | 人工（changelog 与 `CHANGELOG.md` 同步） |
| 信息源清单（URL / 分级 / 关键词 / 启停原因） | `data/sources.json` | 人工（**改巡检范围只改这里**） |
| models.dev 兜底快照 | `data/snapshot.json` | 机器（`update-snapshot.mjs`，每日） |
| 促销停售 / 白嫖额度 | `data/promos.json`、`data/freebies.json` | 人工确认 + 机器核对状态回写 |
| 线索 / 源健康 / 价格历史 / 基线 / 巡检日期 | `data/signals.json`、`sourcehealth.json`、`price-history.json`、`pricebase.json`、`pagehash.json`、`meta.json`、`alerts.json`、`reported.json`、`transients.json` | 机器（每日） |

**数据流**：`data/sources.json` 声明源 → 六个巡检脚本抓取/比对 → 写回 `data/*.json` → `validate.mjs` 校验 →
`git commit && git push` → Pages 重新发布 → 浏览器端 `app.js` 通过 `fetch` 读取 `data/*.json` 渲染。

**前端**：`js/app.js` 单文件（约 840 行）。`init` 里先 `bind()`（表单/筛选，不依赖数据），
再 `await Promise.all([loadData(), loadPriceHistory()])`，最后统一首屏渲染——数据未到之前不做半渲染。
单文件失败只让对应板块为空（`loadJSONOr`）。

**关键约定**：人工维护的数据与机器生成的数据**严格分离**；机器只负责发现，任何价格/促销数字必须人工确认后才进对比表。

## 最近一轮变更与交付成果（v7.1，2026-10-05）

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

## 最近一轮变更与交付成果（v7.0，2026-10-05）

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
   该 hack 只要 data.js 引入 ESM 语法即崩。数据已 JSON 化（`data/plans.json` 等 6 个文件），
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

### 值得做但本次未做

| 优先级 | 待办 | 说明 |
|---|---|---|
| P1 | **数据目录语义化**（计划 D2-1） | `data/manual/` 与 `data/auto/` 分离人工与机器产物，配合 `.gitattributes` 折叠 auto 目录 diff。0.5h，纯整理，收益是可读性 |
| P2 | **`populateCalcModels()` 是死代码** | `js/app.js` 里该函数从未被调用：计算器的模型下拉实际用的是 `index.html` 里写死的 3 个 `<option>`（value 0/1/2），动态池从未生效。要么接上（`loadModels()` 成功后调用），要么删掉函数并清理 `window._CALC_MODEL_POOL` |
| P2 | **`data/transients.json` 被 workflow 读取但仓库里可能不存在** | 读取侧有容错（`read(p, {items:[]})`），但 auto-revert 记录实际未生成，相关 issue 分支永远不触发。需要哪个脚本产出它，或删掉该分支 |
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
- ⚠️ **改巡检范围只改 `data/sources.json`**，不要硬编码 URL 到脚本里；源健康（`sourcehealth.json`）会如实反映抓取失败。
- ⚠️ **社区源在大陆线路不可达**（LINUX DO / V2EX 等，数据中心 IP 被拦 403/空响应），本地跑必然失败并记入源健康，
  这是预期行为，不是 bug；只有 GitHub Actions 的海外出口能抓到。
- ⚠️ **CI 里 `continue-on-error` 会把 job 结果变成 success**：判断某步骤是否成功必须读它自己写进
  `steps.<id>.outputs` 的标记（本 workflow 用 `ok=true/false`），**不能读 `needs.<job>.result`**——那是 job 级结果。
- ⚠️ **`esc()` 只处理 `&<>"`**：任何写进属性或 URL 的场景请用 `safeHref()`（放行 http/https）而不是裸 `esc()`。
- ⚠️ **公众号式数据条目字段含义**见 `data/plans.json` 顶部的 `_readme`；新增平台条目必须带 `srcUrl`（校验会拦）。
- 📌 Windows 环境下 `renameSync` 覆盖已存在文件是可行的（等价 `MOVEFILE_REPLACE_EXISTING`），原子写入无需额外处理。
