# CodingPlan Radar 数据每日更新方案 · 设计说明

- 日期：2026-09-20
- 仓库：`wjf1/coding-plan-radar`（线上 https://wjf1.github.io/coding-plan-radar/）
- 范围：修口径 + 半自动 PR（白名单锚定抽取）
- 状态：待用户复核

---

## 0. 目标与不变量

**目标**：让"数据每日更新"这件事在事实上成立、在界面上如实、在人工成本上可承受。

**不可破的不变量**（沿用 README「诚实原则」）：

1. 机器只负责**发现**，价格与额度数字必须经人手确认才进入对比表。
2. 零 npm 依赖、无构建步骤。不引入无头浏览器，不引入 LLM 抽取。
3. 抽不到的源必须标注"抽不到"，不做"看起来在监控"的假象。

**明确不承诺**：价格数字每天变新。§5 说明为什么物理上不可能。

---

## 1. 现状核查（证据）

| 环节 | 实际状态 | 证据 |
|---|---|---|
| Actions 定时任务 | 每天跑，连续 6 天成功 | run 11→16 均 `schedule` + `success` |
| `js/snapshot.js`（models.dev 兜底） | ✅ 每日重生成 | run 28 与 bot commit `5ce39d3` 同批 |
| `data/signals.json`（线索队列） | ✅ 每日刷新 | 46 条，官方源 29 条 |
| `data/sourcehealth.json` | ✅ 每日刷新，22/22 源成功 | `updatedAt: 2026-09-20` |
| **`js/data.js` 价格表（11 平台 / 33 档）** | ❌ 机器不碰 | 上次实质改动 2026-09-14，采集日期 09-13 |
| 顶部「数据更新：2026-09-13」 | ❌ 永不变化 | `index.html:37`、`index.html:342` 硬编码字符串 |

实测抽取边界（2026-09-20 两次实网探针）：

| 平台 | 订阅价能否自动抽取 | 证据 |
|---|---|---|
| GitHub Copilot | ✅ 高置信 | docs.github.com 服务端渲染，`Copilot Pro $10 USD per month` 逐档成对 |
| Cursor | ✅ 高置信 | 正文无价格，但 HTML 内嵌 JSON 有 `"price":"0/20/60/200/40"`，两个渲染变体取值一致 |
| Claude | ⚠️ 需自定义规则 | 同档混出 `$17`（年付）/`$200 billed up front`/`$20 if billed monthly`，且同页 20+ 条 API token 价 |
| Trae | ⚠️ 需自定义规则 | `Free $0 / Pro $20 / Pro+ $60 / Ultra $200` 可锚定；该页有 1 次"确认后回滚"史 |
| Kimi / GLM | ❌ | 253 KB / 775 KB HTML，价格命中 **0**，内容客户端再取数 |
| MiniMax | ❌ 且危险 | 抽到的 `¥630 / ¥5,950` 是**语音套餐**，非 coding plan |
| OpenAI | ❌ 硬封 | 403（本机与 CI 双环境一致） |
| Qoder / CodeBuddy / 火山 / 小米 | ❌ | 已在 `sources.json` 的 disabled 名单 |

**结论：11 个平台中 4 个可机器核价（2 个高置信 + 2 个需规则）。**

---

## 2. P0 · 修口径（不新增任何抓取能力）

### 2.1 数据新鲜度显示（修订版：主口径不用最旧日期）

**数据字段**：`js/data.js` 每个平台条目新增

```js
pricedAt: "2026-09-13",   // 该条目最后一次经人手确认的日期（ISO）
pricedBy: "human",        // human=人工核价 | auto-merged=机器抽价+人工合并
```

**初始化（2026-09-20 从 `srcNote` 逐条实查得出，不是统一填一个日期）**：

| pricedAt | 平台 | 条数 |
|---|---|---|
| `2026-09-13` | ChatGPT (Codex)、Claude、GitHub Copilot、Cursor、GLM Coding Plan | 5（均 `srcType:official`） |
| `2026-08-31` | OpenCode Go、Kimi For Coding、MiniMax Coding、阿里云百炼、火山方舟、小米 MiMo | 6（均 `srcType:agg`，出处 codingplan.org） |
| `2026-08-31` | R4Coder（`status:"bad"`，已停售） | 1 |

`pricedBy` 全部初始化为 `"human"`。

> **这条初始化揭示了一件此前被掩盖的事**：11 个在表平台里只有 5 个是官方直采，另外 6 个的价格出自聚合站 codingplan.org 的 08-31 快照。原先统一的"数据更新 2026-09-13"把这两类混成一个日期，读起来像全表都是 09-13 官方核过的。因此新鲜度面板必须**同时显示两个轴**：距今（绿/黄/红）与出处强度（官方直采 / 聚合参考，复用现有 `.src-official`/`.src-agg` 徽章）。汇总行加一项 `5/11 官方直采`。

阈值常量为 `FRESH_DAYS = 30`、`STALE_DAYS = 60`。按 09-20 计，6 个 agg 平台距今 20 天，仍落在绿色区——**这是刻意的**：陈旧风险由"出处强度"轴承载，而不是靠把阈值压到 7 天把首页染成一片红。

`validate-data.mjs` 因此可要求两字段**必填且合法**（`pricedAt` 为 ISO 日期且不晚于今天）。渲染层另做一层防御：万一字段缺失则显示「核价日期未知」，不计入统计也不参与 pill 颜色——校验负责不让它发生，渲染负责发生时不难看。

**顶部：一枚 pill 改为两枚并排**，各自只说自己那一类的日期，不再合并成一个含糊的"数据更新"。

| Pill | 主文案 | 颜色 | 说明 |
|---|---|---|---|
| A 自动巡检 | `● 自动巡检 09-20` | 青（沿用现 `.updated-pill`），绿点沿用 `.statusbar .dot.live` | `pipelineDegraded` 时转琥珀 `● 自动巡检未完成`（见 2.3） |
| B 价格核价 | `价格核价 11/11 新鲜` + 迷你分布条 | 绿/黄/红按最差一段取 | **主口径是覆盖率计数 + 分布**，不是任何单个极值日期；点击滚动到新鲜度卡 |

`11/11` = ≤30 天平台数 / 总数。迷你分布条是 11 段小色块（每段一平台，绿 ≤30 天 / 黄 30–60 / 红 >60），按核价日从新到旧排列——**分布本身即信息**，读它不需要理解任何日期口径。

**`#dynamics` 新增「数据新鲜度」卡**（面板主体）：

```
┌─ 🗓 数据新鲜度 ────────────────────────────── 截至 2026-09-20 ─┐
│ [11/11] 30 天内复核  [5/11] 官方直采  [4/11] 可自动核价  [0] 超60天│
│  ▓▓▓▓▓▓▓▓▓▓▓ 全部平台核价分布（每格一平台，绿→黄→红）          │
│                                                                │
│  平台               最近核价      出处        来源        距今  │
│  MiniMax Coding     2026-08-31   聚合参考   ● 人工        20天 │
│  Kimi For Coding    2026-08-31   聚合参考   ● 人工        20天 │
│  …（默认按"距今"降序，最需行动的在最上面）                      │
│  GitHub Copilot     2026-09-13   官方直采   ● 人工         7天 │
│                                                                │
│  图例  ● 人工核价   ● 机器抽价+人工合并   ⚠ 超 30 天   ✖ 超 60 天│
└────────────────────────────────────────────────────────────────┘
```

- 三个汇总数字复用现有 `.stat` 版式；色点复用 `.health .h-dot` 的绿/黄/红语言；来源标签复用 `.badge.b-ok/.b-warn`。
- 每行右侧 40px 迷你新鲜度条，颜色按阈值分段。
- 「可自动核价 4/11」这个数字**故意放在首屏汇总里**：让覆盖边界显眼，而不是假装 11 个都在核。
- 无新增 CSS 体系，仅新增约 25 行局部样式（`.pill-fresh`、`.fresh-bar`、`.fresh-grid`）。
- 响应式：`@media(max-width:760px)` 隐藏 Pill B 的迷你条，仅保留计数；新鲜度卡的"来源"列在窄屏折到平台名下方。

**对比表行内**：每行加 `核价 MM-DD` 徽标（复用 `.badge`），`auto-merged` 青、`human` 绿、>30 天 `.b-warn`、>60 天 `.b-bad`。

**页脚** `index.html:342`：删除静态日期，改由 app.js 注入
`数据分「人工核价」与「每日自动巡检」两类 · 详见 市场动态 → 数据新鲜度`。

### 2.2 未处理告警不再蒸发

`daily-update.yml:63` 现为 `!a.resolved && a.detected === today`——今天检出的 `aliyun-free-quota`（`resolved:false`）明天就静默离开清单，而它仍未被核实。

- 过滤条件改为只按 `!a.resolved`，输出附「已挂起 N 天」。
- 由"每天开一条新 issue"改为**一条常驻 issue + label `daily-triage`**：存在未关闭者则 `gh issue edit --body-file`（覆盖为当前未决集），否则新建。队列语义从"历史流水"变成"当前待办"。
- `data/reported.json` 的"每条线索只上报一次"去重逻辑保留，同样汇入这条常驻 issue。

### 2.3 区分「源失败」与「脚本崩溃」

现状：4 个抓取步骤全 `continue-on-error: true`，随后 `写入巡检日期` **无条件**把 `autoCheck` 写成今天。四个脚本全崩时站点仍显示"自动巡检：今天"，job 结论仍是 success。

| 事件 | 语义 | 处置 |
|---|---|---|
| 单个源抓不到 | 数据问题 | 写 sourcehealth、连续 3 天标失效，**job 不红**（既有行为，保留） |
| 脚本自身崩溃 | 代码 bug | **job 必须红**；`autoCheck` 保持旧值，写 `pipelineDegraded:true` + `failedSteps:[…]` |

实现：每步加 `id:`，新增末步用 `steps.*.outcome` 汇总，有崩溃则 `exit 1`；`写入巡检日期` 改为条件写入。前端按 `pipelineDegraded` 渲染 Pill A 为琥珀态。

### 2.4 巡检时点承诺改口

cron `0 1 * * *`（北京 09:00），但 run 11–16 实际启动都在 **05:2x–05:3x UTC ≈ 北京 13:30**。GitHub schedule 不保证时点。

- README 与页面文案改为「每日自动巡检一次，通常在 09:00–14:00（北京时间）之间触发」。
- 若将来需要准点：外部 `repository_dispatch` 作发令枪、cron 退化为兜底，靠 `concurrency.group` 去重。**本期不实现，仅在此记录接口。**

---

## 3. 纠正一处假安全：空转的哈希监控

`platform.kimi.com/docs/pricing` 与 `docs.bigmodel.cn/cn/coding-plan/overview` 抓取"成功"、哈希稳定、健康表报绿——但它们的 HTML 里**没有价格**（价格命中实测为 0）。因此这两页的哈希监控只能发现版式/文案改动，**价格变了永远不会响**。`check-pages.mjs` 的"正文 < 200 字符即判失败"阈值（1370 / 2934 字符）拦不住这种情况。

- `data/sources.json` 为源新增 `"hashMonitors": "layout-only" | "price-capable"`。
- 源健康面板据此显示「仅监控版式，价格不可自动核」，且**不计入"价格监控在跑"的统计**。
- MiniMax 加同类标注：正文含价但属语音套餐，不可用于 coding plan 核价。
- 抽取器（§4）不为这三者写任何规则。

---

## 4. P1 · 抽取器（只读对照，先观察再准入门）

### 4.1 前置：数据层拆分（全案唯一有回归风险的改动）

机器要产出可合并的 diff，数据必须有机器可写的序列化。`PLAN_DATA` 现在是 JS 字面量，程序化改写只能靠正则定位对象边界，过脆。

- `data/plans.json` = 唯一事实来源（人工编辑入口迁到这里）。
- `scripts/build-plans.mjs` 生成 `js/plans.js`（`const PLAN_DATA = [...]`，标注"CI 生成，勿手改"）。
- `index.html` 在 `js/data.js` 之后新增一行 `<script src="js/plans.js"></script>`。
- `js/data.js` 删去 `PLAN_DATA` 字面量，保留 `RATE / CALC_PLANS / CALC_MODELS / IDE_PLANS / CHANGELOG / GH_REPOS`。

已核实爆炸半径：`PLAN_DATA` 仅被 `js/app.js` 引用（4 处），`index.html` 不引用，**app.js 一行不改**；脚本加载顺序为 snapshot→data→plans→app。仓库已有"CI 生成产物"先例（`js/snapshot.js`）。

不采用运行时 fetch `plans.json`：首屏对比表是关键内容，不应引入 no-cache、闪烁与离线退化。

一致性保障：`validate-data.mjs` 断言 `plans.json` 与 `js/plans.js` 内容一致——人若手改产物则 CI 报红。

迁移方式：用 Node 内建 `vm` 沙箱求值原 `data.js` 取 `PLAN_DATA` → `JSON.stringify` 落 `plans.json`，**逐条 diff 核对后单独一次提交、可单独回滚**。

> 注意执行顺序：`pricedAt / pricedBy` 在 P0-b 先写进 `js/data.js`，P1-a 的 `vm` 迁移会**原样带过去**，不在两处分别手工编写——否则一次核价要改两个地方，必然漂移。迁移完成后 `js/data.js` 内不再有 PLAN_DATA 字面量，字段唯一归属 `plans.json`。

### 4.2 `data/extractors.json` 声明式规则

```jsonc
{
 "copilot-pro": {
   "planId": "GitHub Copilot", "pageId": "copilot",
   "mode": "text",                       // text=去标签正文 | html-json=内嵌 JSON
   "tier": "Pro",
   "anchor": "Copilot Pro\\s+\\$([0-9]+)", // 必须锚定到档位名；通用 $\\d+ 扫描禁止
   "currency": "USD", "period": "month",
   "expect": 10                           // fixture 断言用
 }
}
```

规则按平台按档位一条。**锚不到档位名的页面不写规则**（MiniMax 即为反例证据）。

### 4.3 `scripts/extract-prices.mjs`（workflow 第 ⑤ 步）

1. 复用 `check-pages.mjs` 已抓正文：check-pages 顺手落盘到 gitignore 的 `data/.cache/<pageId>.html`，避免二次抓取。
2. 逐规则抽值 → 与 `plans.json` 比对 → 写 `data/extracted.json`：
   `{planId, tier, pageValue, tableValue, verdict: match|diff|unresolved|no-rule, capturedAt}`
3. 未命中 / 多义 / 同档多个不同值 → `unresolved`，**不猜**。Claude 的三值歧义默认走此路，除非规则显式声明取哪个并写明理由。
4. 沿用二次确认原则：连续两次巡检抽到同一新值才判 `diff`。
5. 页面无规则 → `no-rule`，前端如实显示「无自动核价规则（原因）」。

### 4.4 fixture 回放测试

`tests/fixtures/<pageId>.html` 入库 4 个平台的正文快照；`scripts/test-extract.mjs` 离线断言每条规则的 `expect`。无网络、可重现、防规则漂移，CI 每次必跑。fixture 更新需人工 `--update-fixtures` 并提交。

### 4.5 前端「机器核价对照」（`#dynamics`）

按平台分组，逐档显示 `人工表值 / 机器抽值 / verdict / 抓取时间`。覆盖不足的 7 个平台显示 `no-rule` 及原因。这是 §2.1「4/11」那个数字的明细出处。

---

## 5. 倍率数据不做日更（说明为何不可能）

`ratio / ratioTier / periods / speed` 全部来自 `mahonzhan/awesome-coding-plan`。该仓库**最后推送 2026-09-01，已 19 天未更新**，内容是单份 18 KB Markdown（含 90 行表格，格式可解析）。

因此"倍率日更"在物理上不可能——能日更的只是"上游哪天变了立刻跟进"。本期做法：

- 页面对应位置显示**上游日期**（`口径来自 awesome-coding-plan · 上游最后更新 2026-09-01`），而不是我们的快照日期。
- 可选（低优先，不进本期）：每日 fetch 上游 README 的 `pushed_at`，变化时并入既有告警管道。

---

## 6. P2 · 开 PR（准入门，不是默认行为）

**准入条件**（写进 README，可核对）：P1 连续 14 天 `verdict=match`、`unresolved=0`、fixture 全绿。未达标则永久停在 P1，也不会有假 PR。

- `scripts/open-price-pr.mjs`：复用 `publish-via-api.mjs` 已验证可行的 Git Data API 路径（blob → tree → commit → ref）建 `bot/price-<YYYY-MM-DD>` 分支，提交对 `data/plans.json` + 重新生成的 `js/plans.js` 的改动，再 `POST /pulls`。
- **一天一个聚合 PR**（非一档一个），避免 4 平台 × N 档碎片化。
- PR body：`old → new`、锚定命中的原文片段、两次确认的日期、规则 ID。审核者看 diff 即可判断。
- workflow 权限加 `pull-requests: write`。
- 合并 → 推 main → 实测 Pages 约 2 秒后自动重建（run 28 对 `5ce39d3`），**合并即发布**成立。
- 合并后 `pricedBy=auto-merged`、`pricedAt=` PR 创建日；人工手改则写 `human` + 当日。

---

## 7. 明确不做

无头浏览器 / LLM 抽取 / npm 依赖 / 机器直接改价并自动发布 / 为抽不到的源写"看起来在核价"的规则 / 多 PR 粒度 / 自动合并 / 准点触发的外部调度器。

---

## 8. 交付顺序

> **拆分说明**：本 spec 覆盖三个阶段，但实施计划**分三份写**，每份独立可交付、独立可回滚。下一份 writing-plans 只写 P0（P0-a/b/c）。P1 的抽取器规则要等 P0-b 的字段落地后才有比对对象；P2 由 §6 的准入门控制，不预先排期。

| 阶段 | 内容 | 依赖 |
|---|---|---|
| P0-a | 2.2 告警常驻 issue、2.3 崩溃与降级、2.4 文案 | 无 |
| P0-b | 2.1 `pricedAt/pricedBy` + 双 pill + 新鲜度卡 + 行内徽标 + `validate-data.mjs` | 无 |
| P0-c | 3 空转哈希纠正 | 无 |
| P1-a | 4.1 数据层拆分（单独提交） | P0-b |
| P1-b | 4.2–4.5 抽取器、fixture、对照表 | P1-a |
| P2 | 6 开 PR | P1-b 连续 14 天达标 |

---

## 9. 验收标准

- **P0**：人为让某脚本抛异常 → job 变红且 `autoCheck` 不变；昨天未决的告警今天仍在同一 issue 里；顶部 pill 不可能再与数据脱节；窄屏不破版。
- **P1**：4 平台 fixture 断言全绿；`plans.json ↔ js/plans.js` 一致性校验生效；对照表线上可见且 7 个 no-rule 平台显示原因。
- **P2**：一次真实改价能在 ≤2 天内从"官方页变化"走到"待合并 PR"，人工成本 = 看一个 diff。

---

## 10. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 官方页改 DOM/文案 → 规则失效 | 抽取降级为 `unresolved` | **安全失效**：不会写错值，只会退回人工 |
| 二次确认使真实变动晚 1 天 | 时效性 | 沿用 2026-09-14 既有取舍，换取零假警报 |
| fixture 需随页面人工更新 | 维护成本 | 仅 4 平台；`--update-fixtures` 一条命令 |
| 数据层拆分引入回归 | 首屏表格 | 单独提交、`vm` 迁移 + 逐条 diff 核对、app.js 不改 |
| 新鲜度计数被读成"一切正常" | 误导 | 分布条 + 「4/11 可自动核价」并列在汇总首位 |
