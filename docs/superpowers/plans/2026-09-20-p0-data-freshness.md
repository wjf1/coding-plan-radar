# P0 数据新鲜度与巡检诚实化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 CodingPlan Radar 站点的"数据更新"显示口径与真实管道状态一致（修三处口径缺陷 + 一处假安全），并为此新增可测试的新鲜度计算层与数据校验层。

**Architecture:** 三层。① 数据层：`js/data.js` 的 12 条 PLAN_DATA 各加 `pricedAt`/`pricedBy` 两个溯源字段。② 纯逻辑层：新增零 DOM 的 `js/freshness.js`，以 `globalThis.FRESH` 暴露，既能被浏览器直接用 `<script>` 加载，也能被 Node 用 `vm` 求值后单测——这是全计划可测试性的支点。③ 管道层：CI 用新脚本 `scripts/mark-pipeline.mjs` 区分「源抓不到」（数据问题，不红）与「脚本崩溃」（代码 bug，必须红），用 `scripts/build-triage.mjs` 把待办收敛成一条常驻 issue。前端只负责把这三层如实渲染出来。

**Tech Stack:** 原生 JS（无框架）、Node ≥20 内建 `node:test` / `node:assert` / `node:vm`、GitHub Actions（ubuntu-latest）+ `gh` CLI、纯 CSS（复用 `css/styles.css` 既有 token）。

**Spec:** `docs/superpowers/specs/2026-09-20-daily-data-update-design.md`（本计划只实现其 §2、§3、§8 的 P0 部分；§4 抽取器与 §6 开 PR 属 P1/P2，单独排期）

## Global Constraints

每个任务都隐含遵守以下各条（数值逐字取自 spec 与仓库实测）：

- **零 npm 依赖、无构建步骤**。不得新增 `package.json`，不得 `npm install`。测试只用 Node 内建 `node:test`。
- 所有脚本必须能在 `node scripts/xxx.mjs` 下直接运行，工作目录为仓库根。
- 跑测试用 `node --test`（不带路径参数，靠默认 `**/*.test.?(c|m)js` 规则发现）。**不要写 `node --test tests/`**：实测 Node 22.23.2 会把目录参数当模块路径去 require，报 `Cannot find module ...\tests` 并让整轮测试以 1 个失败用例收场。
- 需要"既能被 import 又能单独跑"的脚本，一律用 `scripts/lib.mjs` 导出的 `isMain(import.meta.url)` 判定主模块。**不要**写 `import.meta.url === 'file://' + process.argv[1]`：Windows 下两边格式根本不同，判定恒假，CI(Linux) 正常而本地静默失效。
- **不引入无头浏览器、不引入 LLM 抽取**（用户 2026-09-20 明确选定"白名单锚定规则"）。
- **机器不写价格数字**。`pricedAt`/`pricedBy` 只能由人或人工合并的 PR 改动；本计划中任何脚本都不得自动更新这两个字段。
- 文件行尾必须是 **LF**。`scripts/publish-via-api.mjs` 全量上传工作区，一旦转成 CRLF 会让 26 个文件变成整文件 diff。本地 git 已设 `core.autocrlf=false`；每次提交前用 `git ls-files --eol | grep -v 'w/lf'` 验证输出为空。
- 复用既有 CSS token：`--ok:#3ecf8e`、`--warn:#f5b445`、`--bad:#f26d6d`、`--chip:#1b2740`、`--border:#23304a`、`--radius:14px`，以及 `.badge`/`.b-ok`/`.b-warn`/`.b-bad`、`.health .h-dot`、`.src-official`/`.src-agg`、`.stat`、`.card`。**不新增视觉体系**，新增样式总量控制在 25 行内。
- 新鲜度阈值：`FRESH_DAYS = 30`、`STALE_DAYS = 60`。
- 平台总数口径沿用现有逻辑：统计只算 `status !== "bad"` 的条目（11 个），与 `index.html` 的 `#st-plat` 一致；但 `R4Coder`（`status:"bad"`）同样必须有两字段，以便校验器要求"必填"。
- 推送远端（建分支 / 开 PR / 改 main）属对外可见操作，**每个阶段结束时停下来问用户**，不在任务内自动推。

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `js/data.js` | 12 条 PLAN_DATA 的唯一人工编辑处；本任务只加两字段，不动价格 | Modify（12 处插入） |
| `scripts/lib.mjs` | 既有公用模块；新增跨平台 `isMain(importMetaUrl)` 供三个新脚本复用 | Modify（+10 行） |
| `tests/helpers.mjs` | `loadGlobal(file, expr)` / `loadPlans()`：用 `vm` 从浏览器脚本里取全局量 | Create |
| `js/freshness.js` | 纯函数：距今、等级、统计、pill 与卡片的 HTML 字符串。零 DOM | Create |
| `js/app.js` | DOM 接线（取元素、填 innerHTML） | Modify（`loadAutoMeta`、`renderPlans`、init） |
| `index.html` | 两枚 pill 容器、`#freshness` 挂载点、页脚去静态日期 | Modify（3 处） |
| `css/styles.css` | `.pillwrap`/`.pill-fresh`/`.fresh-*` 局部样式 | Modify（末尾追加） |
| `scripts/lib.mjs` | 既有公用模块；本次新增导出 `isMain(importMetaUrl)` 供各脚本判定主模块 | Modify |
| `scripts/validate-data.mjs` | 断言 pricedAt/pricedBy 合法；供 CI 与本地复用 | Create |
| `scripts/mark-pipeline.mjs` | 按崩溃步骤集合决定 `meta.json` 怎么写 | Create |
| `scripts/build-triage.mjs` | 由 `alerts/signals/sourcehealth` 生成 `issue-body.md`（未决集全量，非"仅今日"） | Create |
| `.github/workflows/daily-update.yml` | 步骤 id 化、条件写 meta、校验与测试接入、常驻 issue、末尾 exit 1 | Modify |
| `data/sources.json` | kimi/glm/minimax 加 `hashMonitors:"layout-only"` | Modify |
| `README.md` | 时点承诺、假安全说明、新脚本与新字段说明 | Modify |
| `tests/*.test.mjs` | `node:test` 用例 | Create |

---

## Task 0: 工作副本与发布通道

本地已无 `.git` 远端可推（`git clone` 实测 SSL 握手失败：`schannel: failed to receive handshake`）。因此工作副本 = tarball 解出目录 + 本地 git 做检查点，发布走 `api.github.com`。

**Files:**
- 工作目录：`F:/AI/Qdor/repos/cpr-inspect`
- Read: `scripts/publish-via-api.mjs`

- [ ] **Step 1: 确认已在本地 git 基线上**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && git log --oneline | head -3
```
Expected: 首行是 `baseline: coding-plan-radar main @ 5ce39d3 ...`，其下是 `chore: 锁定 LF...`。若目录不存在则先 `gh api repos/wjf1/coding-plan-radar/tarball/main > /tmp/cpr.tgz && mkdir -p cpr-inspect && tar -xzf /tmp/cpr.tgz -C cpr-inspect --strip-components=1` 再 `git init` + `git config core.autocrlf false`。

- [ ] **Step 2: 验证 token 可用（只读，不写）**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && gh auth status 2>&1 | head -5
```
Expected: 显示已登录账号。若未登录，停下来报告用户——后续无法发布，但不影响 Task 1–6 的实现与测试。

- [ ] **Step 3: 记录发布方式（不要现在推）**

发布在 Task 6 之后统一执行，命令形态：

```bash
# ① 用 gh 建远端分支（起点为 main 当前 sha）
SHA=$(gh api repos/wjf1/coding-plan-radar/git/ref/heads/main --jq '.object.sha')
gh api repos/wjf1/coding-plan-radar/git/refs -f ref="refs/heads/feat/p0-data-freshness" -f sha="$SHA"
# ② 全量上传到该分支
GITHUB_BRANCH=feat/p0-data-freshness node scripts/publish-via-api.mjs "feat(p0): 数据新鲜度与巡检诚实化"
# ③ 开 PR
gh pr create --repo wjf1/coding-plan-radar --base main --head feat/p0-data-freshness --title "..." --body-file /tmp/pr.md
```

---

## Task 1: pricedAt / pricedBy 字段与数据校验

**Files:**
- Modify: `js/data.js`（12 处，锚点见 Step 2 表）
- Create: `scripts/validate-data.mjs`
- Create: `tests/helpers.mjs`（注意：**不能**叫 `*.test.mjs`，否则 Node 的测试运行器会把它当一个测试文件跑一遍）
- Test: `tests/validate-data.test.mjs`
- Modify: `scripts/lib.mjs`（新增导出 `isMain(importMetaUrl)`，见 Step 3 说明）

**Interfaces:**
- Consumes: `js/data.js` 顶层 `const PLAN_DATA`（12 条，字段 `name/status/srcType/srcNote`）
- Produces: 每条 PLAN_DATA 多出 `pricedAt:string(YYYY-MM-DD)` 与 `pricedBy:"human"|"auto-merged"`；`scripts/validate-data.mjs` 导出 `validatePlans(plans) -> string[]`（返回错误信息数组，空数组＝通过），并被 `js/freshness.js` 与 CI 复用。

- [ ] **Step 1: 写共享测试夹具与失败的测试**

Create `tests/helpers.mjs`:

```js
// 测试夹具：本仓库零依赖、无构建，浏览器脚本里的全局量只能靠 vm 求值取出来。
// 这个文件必须放在 helpers.mjs 而不是 *.test.mjs —— 后者会被测试运行器当成用例再跑一遍。
import fs from "node:fs";
import vm from "node:vm";

export function loadGlobal(file, expr) {
  const ctx = { console, Date, Math, JSON, String, Number, Array, Set, isNaN, RegExp };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, "utf8") + `\nglobalThis.__OUT = ${expr};`, ctx);
  return ctx.__OUT;
}

export const loadPlans = () => loadGlobal("js/data.js", "PLAN_DATA");

/**
 * vm 里 new 出来的对象带的是另一个 realm 的 Object.prototype，与宿主字面量做
 * assert.deepEqual（strict 版会比较原型）时，即使结构完全一致也会失败。
 * 从 vm 取回的纯数据先过一道 structuredClone，就在宿主 realm 里重建了。
 */
export const hostData = (v) => structuredClone(v);
```

Create `tests/validate-data.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePlans } from "../scripts/validate-data.mjs";
import { loadPlans } from "./helpers.mjs";

test("真实数据全部通过校验", () => {
  assert.deepEqual(validatePlans(loadPlans()), []);
});

test("缺 pricedAt 被拒绝", () => {
  const bad = [{ name: "X", status: "ok", srcType: "official", srcUrl: "https://a.test/" }];
  assert.match(validatePlans(bad)[0], /X.*pricedAt/);
});

test("非法日期与未来日期被拒绝", () => {
  const f = (y) => [{ name: "X", status: "ok", srcType: "official", srcUrl: "https://a.test/", pricedAt: y, pricedBy: "human" }];
  assert.equal(validatePlans(f("2026-13-45")).length, 1);
  assert.equal(validatePlans(f("去年三月")).length, 1);
  assert.equal(validatePlans(f("2099-01-01")).length, 1);
  assert.equal(validatePlans(f(new Date().toISOString().slice(0, 10))).length, 0);
});

test("pricedBy 只接受 human 与 auto-merged", () => {
  const base = { name: "X", status: "ok", srcType: "official", srcUrl: "https://a.test/", pricedAt: "2026-09-13" };
  assert.equal(validatePlans([{ ...base, pricedBy: "bot" }]).length, 1);
  assert.equal(validatePlans([{ ...base, pricedBy: "human" }]).length, 0);
  assert.equal(validatePlans([{ ...base, pricedBy: "auto-merged" }]).length, 0);
});

test("srcUrl 缺失被拒绝", () => {
  const base = { name: "X", status: "ok", srcType: "official", pricedAt: "2026-09-13", pricedBy: "human" };
  assert.match(validatePlans([base])[0], /srcUrl/);
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node --test
```
Expected: FAIL，`Cannot find module '../scripts/validate-data.mjs'`。

- [ ] **Step 3: 写校验器**

先给 `scripts/lib.mjs` 加跨平台主模块判定（改文件头的 import，并在 `today` 之后加导出）：

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
```

```js
/**
 * 判断「本模块是否作为主脚本被直接运行」，用于让同一个 .mjs 既能被 import 复用又能单独跑。
 * 不能用字符串比较 import.meta.url 与 argv[1]：Windows 下前者是 file:///F:/... 后者是 F:\...，
 * 永远不相等，于是本地（Windows）能跑、CI（Linux）跑不通的判定会静默失效。
 */
export const isMain = (importMetaUrl) =>
  !!process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(importMetaUrl));
```

Create `scripts/validate-data.mjs`:

```js
// 数据契约校验：价格条目的溯源字段必须存在且合法。
// 目的：pricedAt 是「数据新鲜度」面板的唯一事实来源，一旦漂移，首页显示就会重新变成谎话。
import { isMain } from "./lib.mjs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PRICED_BY = new Set(["human", "auto-merged"]);

export function validatePlans(plans, today = new Date().toISOString().slice(0, 10)) {
  const errs = [];
  if (!Array.isArray(plans) || !plans.length) return ["PLAN_DATA 为空或不是数组"];
  for (const d of plans) {
    const at = (msg) => errs.push(`[${d.name || "(未命名)"}] ${msg}`);
    if (!d.name) errs.push("[条目缺 name] 平台名必填");
    if (!d.srcUrl) at("缺 srcUrl：每条数据必须有可点开的出处");
    if (!d.pricedAt) { at("缺 pricedAt（人工核价日期）"); }
    else if (!ISO.test(d.pricedAt)) at(`pricedAt "${d.pricedAt}" 不是 YYYY-MM-DD`);
    else if (d.pricedAt > today) at(`pricedAt "${d.pricedAt}" 晚于今天 ${today}`);
    if (!d.pricedBy) at("缺 pricedBy（human | auto-merged）");
    else if (!PRICED_BY.has(d.pricedBy)) at(`pricedBy "${d.pricedBy}" 只允许 human | auto-merged`);
  }
  return errs;
}

if (isMain(import.meta.url)) {
  const fs = await import("node:fs");
  const vm = await import("node:vm");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("js/data.js", "utf8") + "\nglobalThis.__P = PLAN_DATA;", ctx);
  const errs = validatePlans(ctx.__P);
  if (errs.length) {
    console.error(`✗ 数据契约校验失败（${errs.length} 项）：`);
    errs.forEach((e) => console.error("  · " + e));
    process.exit(1);
  }
  console.log(`✓ 数据契约校验通过：${ctx.__P.length} 条平台条目字段完整`);
}
```

- [ ] **Step 4: 跑测试，确认只剩数据未改导致的失败**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node --test
```
Expected: 4 个用例 PASS，`真实数据全部通过校验` FAIL 并报 12 条「缺 pricedAt」。这正是下一步要修的。

- [ ] **Step 5: 给 12 条条目插入两字段**

在每条的 `srcNote:` 那一行**之后**插入两行，缩进 4 空格。按 Step 2 表逐条填值（**注意两组日期不同，不是统一值**）：

| # | `srcNote` 所在行（当前 HEAD） | 平台 | pricedAt |
|---|---|---|---|
| 1 | 31 | ChatGPT (Codex) | `2026-09-13` |
| 2 | 46 | Claude | `2026-09-13` |
| 3 | 60 | GitHub Copilot | `2026-09-13` |
| 4 | 74 | Cursor | `2026-09-13` |
| 5 | 89 | OpenCode Go | `2026-08-31` |
| 6 | 104 | GLM Coding Plan | `2026-09-13` |
| 7 | 119 | Kimi For Coding | `2026-08-31` |
| 8 | 134 | MiniMax Coding | `2026-08-31` |
| 9 | 149 | 阿里云百炼 Coding | `2026-08-31` |
| 10 | 164 | 火山方舟 Coding | `2026-08-31` |
| 11 | 179 | 小米 MiMo Coding | `2026-08-31` |
| 12 | 193 | R4Coder（已停售） | `2026-08-31` |

日期取自各条 `srcNote` 里写明的采集日（5 条官方直采为 09-13，6 条 codingplan.org 聚合参考为 08-31）。`pricedBy` 全部为 `"human"`。

以第 1 条为例，改完是这样（其余 11 条同形，仅 pricedAt 取值不同）：

```js
    srcType:"official", srcLabel:"官方直采 + 聚合补全",
    srcUrl:"https://openai.com/chatgpt/pricing/",
    srcNote:"官方页 2026-09-13 采集；Go 档价格参考 codingplan.org",
    pricedAt:"2026-09-13",
    pricedBy:"human",
    note:"Go 档价格在官方页为动态展示，以结账页为准"
```

行号会随插入递增而偏移，所以**从文件末尾往前改**（12 → 1），或每改一条就重新 `grep -n 'srcNote:' js/data.js`。

- [ ] **Step 6: 跑校验与测试，确认全绿**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node scripts/validate-data.mjs && node --test
```
Expected: `✓ 数据契约校验通过：12 条平台条目字段完整`；测试 5/5 pass。

- [ ] **Step 7: 确认站点未被破坏**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && grep -c 'pricedAt:' js/data.js && python -m http.server 8765 &
sleep 1 && curl -s "http://127.0.0.1:8765/js/data.js" | grep -c 'pricedAt'
```
Expected: `12` / `12`。关掉服务。

- [ ] **Step 8: 提交**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && git ls-files --eol | grep -v 'w/lf' || echo "行尾 OK"
git add js/data.js scripts/validate-data.mjs scripts/lib.mjs tests/helpers.mjs tests/validate-data.test.mjs
git commit -m "feat(p0): 每条订阅计划补 pricedAt/pricedBy 溯源字段 + 数据契约校验"
```

---

## Task 2: js/freshness.js 纯逻辑层

本文件是**全计划唯一的新鲜度计算实现**，不含任何 DOM，浏览器与 Node 共用。

**Files:**
- Create: `js/freshness.js`
- Test: `tests/freshness.test.mjs`

**Interfaces:**
- Consumes: `PLAN_DATA`（以参数传入，不读全局）
- Produces: `globalThis.FRESH = { FRESH_DAYS, STALE_DAYS, daysSince, levelOf, statsOf, rowsOf, pillHtml, cardHtml }`
  - `daysSince(iso, now) -> number|null`
  - `levelOf(iso, now) -> "ok"|"warn"|"bad"|"unknown"`
  - `statsOf(plans, now) -> {total, fresh, warn, stale, unknown, official, worst:"ok"|"warn"|"bad"}`
  - `rowsOf(plans, now) -> [{name, pricedAt, pricedBy, srcType, days, level}]`（距今降序）
  - `pillHtml(plans, now) -> string`、`cardHtml(plans, opt) -> string`，`opt = {now, autoCheck, degraded, failed}`

- [ ] **Step 1: 写失败的测试**

Create `tests/freshness.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGlobal, loadPlans, hostData } from "./helpers.mjs";

const FRESH = loadGlobal("js/freshness.js", "FRESH");

const NOW = Date.parse("2026-09-20T12:00:00Z");
const at = (days) => new Date(NOW - days * 86400000).toISOString().slice(0, 10);

test("daysSince 与 levelOf 的阈值边界", () => {
  assert.equal(FRESH.daysSince("2026-09-13", NOW), 7);
  assert.equal(FRESH.daysSince("垃圾", NOW), null);
  assert.equal(FRESH.levelOf(at(30), NOW), "ok");
  assert.equal(FRESH.levelOf(at(31), NOW), "warn");
  assert.equal(FRESH.levelOf(at(60), NOW), "warn");
  assert.equal(FRESH.levelOf(at(61), NOW), "bad");
  assert.equal(FRESH.levelOf("垃圾", NOW), "unknown");
});

test("statsOf 只统计在售平台，并区分出处强度", () => {
  const plans = [
    { name: "A", status: "ok", srcType: "official", pricedAt: at(7), pricedBy: "human" },
    { name: "B", status: "ok", srcType: "agg", pricedAt: at(20), pricedBy: "human" },
    { name: "C", status: "promo", srcType: "agg", pricedAt: at(45), pricedBy: "human" },
    { name: "D", status: "bad", srcType: "agg", pricedAt: at(500), pricedBy: "human" },
  ];
  // status:"bad" 的 D 不计入，与 #st-plat 口径一致；hostData 见 tests/helpers.mjs 的说明
  assert.deepEqual(hostData(FRESH.statsOf(plans, NOW)), {
    total: 3, fresh: 2, warn: 1, stale: 0, unknown: 0, official: 1, worst: "warn",
  });
});

test("worst 优先级：bad > warn > ok，unknown 记为 warn", () => {
  const p = (lv, by) => [{ name: "X", status: "ok", srcType: "official", pricedBy: by || "human", ...lv }];
  assert.equal(FRESH.statsOf(p({ pricedAt: at(500) }), NOW).worst, "bad");
  assert.equal(FRESH.statsOf(p({ pricedAt: undefined }), NOW).worst, "warn");
  assert.equal(FRESH.statsOf(p({ pricedAt: at(5) }), NOW).worst, "ok");
});

test("rowsOf 最陈旧的排最前", () => {
  const plans = [
    { name: "新", status: "ok", srcType: "official", pricedAt: at(2), pricedBy: "human" },
    { name: "旧", status: "ok", srcType: "agg", pricedAt: at(40), pricedBy: "human" },
    { name: "停售", status: "bad", srcType: "agg", pricedAt: at(99), pricedBy: "human" },
  ];
  const r = FRESH.rowsOf(plans, NOW);
  assert.deepEqual(r.map(x => x.name), ["旧", "新"]);
  assert.equal(r[0].days, 40);
  assert.equal(r[0].level, "warn");
});

test("pillHtml 用覆盖计数而非单个日期，并输出 11 段分布", () => {
  const html = FRESH.pillHtml(loadPlans(), NOW);
  assert.match(html, /价格核价 11\/11 新鲜/);
  assert.equal((html.match(/<i/g) || []).length, 11, "在售平台每个一格");
  assert.match(html, /href="#freshness"/);
});

test("真实数据：5 官方直采 / 6 聚合参考，且都在 30 天内", () => {
  const s = FRESH.statsOf(loadPlans(), NOW);
  assert.deepEqual({ total: s.total, official: s.official, fresh: s.fresh, stale: s.stale },
    { total: 11, official: 5, fresh: 11, stale: 0 });
});

test("cardHtml 含汇总数字、出处徽章、来源文案，且不泄露未转义内容", () => {
  const plans = [{ name: '<img src=x>', status: "ok", srcType: "agg",
    pricedAt: at(45), pricedBy: "auto-merged" }];
  const html = FRESH.cardHtml(plans, { now: NOW, autoCheck: "2026-09-20", degraded: false, failed: [] });
  // 45 天属"超 30 天"，故"30 天内复核"是 0/1；数字与标签分处 <b>/<small>，按整段精确断言
  assert.match(html, /<b>0\/1<\/b><small>30 天内复核<\/small>/);
  assert.match(html, /<b>0\/1<\/b><small>官方直采<\/small>/);
  assert.match(html, /<b>1<\/b><small>需复核（超 30 天）<\/small>/);
  assert.match(html, /聚合参考/);
  assert.match(html, /机器抽价 · 人工合并/);
  assert.match(html, /45 天/);
  assert.ok(!html.includes("<img src=x>"), "平台名必须转义");
});

test("cardHtml 在管道降级时挂提示，且未知日期有兜底文案", () => {
  const plans = [{ name: "X", status: "ok", srcType: "official", pricedAt: "坏日期", pricedBy: "human" }];
  const html = FRESH.cardHtml(plans, { now: NOW, autoCheck: "2026-09-19", degraded: true, failed: ["fetch-feeds"] });
  assert.match(html, /自动巡检未完成/);
  assert.match(html, /fetch-feeds/);
  assert.match(html, /核价日期未知/);
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node --test
```
Expected: FAIL，`ENOENT: no such file or directory, open 'js/freshness.js'`。

- [ ] **Step 3: 实现纯逻辑层**

Create `js/freshness.js`:

```js
// 数据新鲜度：纯函数层，零 DOM。
// 浏览器经 <script> 直接用 globalThis.FRESH；单测经 Node vm 求值同一份源码。
// 之所以这样拆：本仓库无构建步骤，纯函数是唯一能同时被两边复用又可测试的形态。
globalThis.FRESH = (function () {
  const DAY = 86400000;
  const FRESH_DAYS = 30;
  const STALE_DAYS = 60;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const daysSince = (iso, now) => {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return Math.floor((now - t) / DAY);
  };

  const levelOf = (iso, now) => {
    const n = daysSince(iso, now);
    if (n === null) return "unknown";
    if (n > STALE_DAYS) return "bad";
    if (n > FRESH_DAYS) return "warn";
    return "ok";
  };

  // 在售平台才计入统计，与 index.html 的 #st-plat 口径保持一致
  const active = (plans) => plans.filter((d) => d.status !== "bad");

  function statsOf(plans, now = Date.now()) {
    const list = active(plans);
    const lv = list.map((d) => levelOf(d.pricedAt, now));
    const count = (x) => lv.filter((v) => v === x).length;
    const stale = count("bad");
    const warn = count("warn");
    const unknown = count("unknown");
    return {
      total: list.length,
      fresh: count("ok"),
      warn,
      stale,
      unknown,
      official: list.filter((d) => d.srcType === "official").length,
      worst: stale ? "bad" : (warn || unknown) ? "warn" : "ok",
    };
  }

  function rowsOf(plans, now = Date.now()) {
    return active(plans)
      .map((d) => ({
        name: d.name, pricedAt: d.pricedAt, pricedBy: d.pricedBy, srcType: d.srcType,
        days: daysSince(d.pricedAt, now), level: levelOf(d.pricedAt, now),
      }))
      .sort((a, b) => (b.days ?? -1) - (a.days ?? -1)); // 最陈旧在前：最需行动的排上面
  }

  // 一格一平台，按核价日从新到旧排。分布本身就是信息，读它不需要理解任何日期口径。
  const segmentsHtml = (plans, now) =>
    active(plans)
      .slice()
      .sort((a, b) => String(b.pricedAt).localeCompare(String(a.pricedAt)))
      .map((d) => {
        const lv = levelOf(d.pricedAt, now);
        const cls = lv === "bad" ? "b" : lv === "warn" ? "w" : lv === "unknown" ? "u" : "";
        return `<i class="${cls}" title="${esc(d.name)}：${esc(d.pricedAt || "未知")}"></i>`;
      })
      .join("");

  function pillHtml(plans, now = Date.now()) {
    const s = statsOf(plans, now);
    return `<a class="pill-fresh ${s.worst}" href="#freshness">价格核价 ${s.fresh}/${s.total} 新鲜` +
      `<span class="fresh-seg">${segmentsHtml(plans, now)}</span></a>`;
  }

  const byLabel = (by) =>
    by === "auto-merged" ? '<span class="badge b-chip">机器抽价 · 人工合并</span>'
      : by === "human" ? '<span class="badge b-ok">人工核价</span>'
      : '<span class="badge b-warn">核价日期未知</span>';

  const barHtml = (days, level) => {
    if (days === null) return '<span class="fresh-bar"><i style="width:100%;background:var(--warn)"></i></span>';
    const pct = Math.max(4, Math.min(100, Math.round((1 - days / 90) * 100)));
    const color = level === "bad" ? "var(--bad)" : level === "warn" ? "var(--warn)" : "var(--ok)";
    return `<span class="fresh-bar"><i style="width:${pct}%;background:${color}"></i></span>`;
  };

  function cardHtml(plans, opt = {}) {
    const now = opt.now ?? Date.now();
    const s = statsOf(plans, now);
    const rows = rowsOf(plans, now);
    const today = new Date(now).toISOString().slice(0, 10);
    const autoPill = opt.degraded
      ? `<span class="badge b-warn">⚠ 自动巡检未完成（${esc((opt.failed || []).join("、") || "有脚本异常")}）</span>`
      : `<span class="badge b-ok">自动巡检 ${esc(opt.autoCheck || "—")}</span>`;
    return `<div class="card">
      <div class="head"><h3>🗓 数据新鲜度</h3>${autoPill}<span style="color:var(--dim);font-size:12px">截至 ${esc(today)}</span></div>
      <div class="stats" style="justify-content:flex-start;margin:2px 0 6px">
        <div class="stat"><b>${s.fresh}/${s.total}</b><small>30 天内复核</small></div>
        <div class="stat"><b>${s.official}/${s.total}</b><small>官方直采</small></div>
        <div class="stat"><b>${s.warn + s.stale + s.unknown}</b><small>需复核（超 30 天）</small></div>
      </div>
      <div class="fresh-grid">
        <div class="hd">平台</div><div class="hd">最近核价</div><div class="hd">出处 · 来源</div><div class="hd hide-sm">距今</div>
        ${rows.map((r) => `<div><b>${esc(r.name)}</b></div>
          <div>${esc(r.pricedAt || "—")}</div>
          <div><span class="srcbadge ${r.srcType === "official" ? "src-official" : "src-agg"}">${r.srcType === "official" ? "官方直采" : "聚合参考"}</span>${byLabel(r.pricedBy)}</div>
          <div class="hide-sm">${r.days === null ? "未知" : r.days + " 天"} ${barHtml(r.days, r.level)}</div>`).join("")}
      </div>
      <p style="font-size:12px;color:var(--dim);margin-top:10px">
        <b>距今</b>只说明"多久没人复核过这条价格"，不代表价格一定变了；<b>出处</b>说明这个数字来自官方页还是聚合站——两者要一起看。
        超过 ${FRESH_DAYS} 天标黄、超过 ${STALE_DAYS} 天标红。价格与额度数字一律人工确认后才进表，自动巡检负责发现官方页与订阅源的变动。
      </p>
    </div>`;
  }

  return { FRESH_DAYS, STALE_DAYS, daysSince, levelOf, statsOf, rowsOf, pillHtml, cardHtml };
})();
```

- [ ] **Step 4: 跑测试，确认全绿**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node --test
```
Expected: 13 tests pass（含 Task 1 的 5 个）。若 `pillHtml 用覆盖计数` 报 11 格不符，说明 `status!=="bad"` 过滤没生效。

- [ ] **Step 5: 提交**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && git ls-files --eol | grep -v 'w/lf' || echo "行尾 OK"
git add js/freshness.js tests/freshness.test.mjs
git commit -m "feat(p0): 新增零 DOM 的新鲜度纯函数层，浏览器与 node:test 共用"
```

---

## Task 3: 前端接线（两枚 pill、新鲜度卡、行内徽标、样式）

**Files:**
- Modify: `index.html:38`（pill 容器）、`index.html:247` 前（挂载点）、`index.html:342`（页脚）、`index.html:349` 后（script 标签）
- Modify: `js/app.js:307-314`（`loadAutoMeta`）、`js/app.js:69`（行内徽标）、`js/app.js:460-464`（init）
- Modify: `css/styles.css`（末尾追加）

**Interfaces:**
- Consumes: `FRESH.pillHtml` / `FRESH.cardHtml`（Task 2）、`PLAN_DATA`（Task 1）、`data/meta.json` 的 `pipelineDegraded`/`failedSteps`（Task 4 才写入；此处按"字段可能不存在"处理）
- Produces: DOM 锚点 `#fresh-pill`、`#freshness`、`#auto-pill`、`#auto-wrap`；class `.pill-fresh.ok|warn|bad`

- [ ] **Step 1: index.html 四处改动**

`index.html:38` 整行替换为：

```html
    <div class="pillwrap">
      <div class="updated-pill" id="auto-wrap"><span id="auto-pill">自动巡检：…</span></div>
      <span id="fresh-pill"></span>
    </div>
```

在 `index.html` 的 `🩺 信息源健康` 那一行（当前 247 行）**之前**插入：

```html
    <div class="sec-head" style="margin-top:36px" id="freshness"><h2 style="font-size:19px">🗓 数据新鲜度</h2></div>
    <div id="freshness-box"></div>
```

`index.html:342` 页脚去掉写死的日期（纯静态文案即可，无需 JS 填充）：

```html
    <div>CodingPlan Radar · AI 编程订阅计划对比 · 数据分「人工核价」与「每日自动巡检」两类，详见 市场动态 → 数据新鲜度</div>
```

`index.html:349`（`js/data.js` 那行）之后插入一行，顺序必须在 data.js 与 app.js 之间：

```html
<script src="js/freshness.js"></script>
```

- [ ] **Step 2: app.js 改 loadAutoMeta 并新增 renderFreshness**

把 `js/app.js:307-314` 整段替换为：

```js
let LAST_META = { autoCheck: null, degraded: false, failed: [] };
async function loadAutoMeta(){
  const el=document.getElementById("auto-pill");
  const wrap=document.getElementById("auto-wrap");
  if(!el) return;
  try{
    const m=await fetchJSON("data/meta.json");
    LAST_META={ autoCheck:m.autoCheck||null, degraded:!!m.pipelineDegraded, failed:m.failedSteps||[] };
    if(LAST_META.degraded){
      el.textContent="自动巡检未完成（"+(LAST_META.failed.length?LAST_META.failed.join("、"):"脚本异常")+"）";
      if(wrap) wrap.classList.add("degraded");
    } else if(m.autoCheck){
      el.textContent="自动巡检 "+m.autoCheck;
    }
  }catch(e){ el.textContent="自动巡检：待首次运行"; }
}

/* ================= 数据新鲜度 ================= */
async function renderFreshness(){
  const pill=document.getElementById("fresh-pill");
  const box=document.getElementById("freshness-box");
  if(!pill && !box) return;
  try{
    if(pill) pill.innerHTML=FRESH.pillHtml(PLAN_DATA, Date.now());
    if(box) box.innerHTML=FRESH.cardHtml(PLAN_DATA, {
      now:Date.now(), autoCheck:LAST_META.autoCheck, degraded:LAST_META.degraded, failed:LAST_META.failed,
    });
  }catch(e){ if(box) box.innerHTML='<p style="color:var(--dim)">新鲜度面板渲染失败</p>'; }
}
```

- [ ] **Step 3: 对比表行内加核价徽标**

`js/app.js:69` 所在的 `<td class="src">` 一行改为：

```js
      <td class="src">${srcType}<br><a href="${d.srcUrl}" target="_blank">来源链接 ↗</a><br>${freshBadge(d)}</td>
```

并在 `js/app.js` 的 `renderPlans` 函数**之前**加入：

```js
const freshBadge = d => {
  const lv = FRESH.levelOf(d.pricedAt, Date.now());
  const cls = lv==="bad"?"b-bad":lv==="warn"?"b-warn":"b-ok";
  if(lv==="unknown") return '<span class="badge b-warn">核价日期未知</span>';
  return `<span class="badge ${cls}">核价 ${String(d.pricedAt).slice(5)}</span>`;
};
```

- [ ] **Step 4: init 里挂上新面板**

`js/app.js:462-464` 改为（`loadAutoMeta()` 必须先 `await` 才能把 `LAST_META` 传给卡片）：

```js
(async ()=>{
  await loadAutoMeta();
  await renderFreshness();
  bind(); renderPlans(); renderCards(); renderRepos(); renderIde(); renderChangelog(); renderCalc(); loadModels(); loadPageAlerts();
  renderPromos(); renderFreebies(); renderSignals(); renderSourceHealth();
})();
```

- [ ] **Step 5: 追加样式（25 行内）**

`css/styles.css` 末尾追加：

```css
/* ===== 数据新鲜度（P0） ===== */
.pillwrap{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.updated-pill.degraded{color:var(--warn);border-color:#f5b44555;background:#f5b44512}
.pill-fresh{font-size:12px;border-radius:99px;padding:3px 12px;white-space:nowrap;display:inline-flex;align-items:center;gap:8px;border:1px solid;text-decoration:none}
.pill-fresh:hover{text-decoration:none;filter:brightness(1.15)}
.pill-fresh.ok{color:var(--ok);border-color:#3ecf8e55;background:#3ecf8e12}
.pill-fresh.warn{color:var(--warn);border-color:#f5b44555;background:#f5b44512}
.pill-fresh.bad{color:var(--bad);border-color:#f26d6d55;background:#f26d6d10}
.fresh-seg{display:inline-flex;gap:2px}
.fresh-seg i{display:block;width:5px;height:12px;border-radius:2px;background:var(--ok)}
.fresh-seg i.w{background:var(--warn)}.fresh-seg i.b{background:var(--bad)}.fresh-seg i.u{background:var(--border)}
.fresh-grid{display:grid;grid-template-columns:1fr 110px 210px 130px;gap:8px 14px;font-size:13px;align-items:center}
.fresh-grid>div{min-width:0}
.fresh-grid .hd{color:var(--dim);font-size:12px;border-bottom:1px solid var(--border);padding-bottom:6px}
.fresh-bar{display:inline-block;width:46px;height:6px;border-radius:3px;background:var(--chip);overflow:hidden;vertical-align:middle}
.fresh-bar i{display:block;height:100%;border-radius:3px}
.fresh-grid .badge{margin-left:4px}
@media(max-width:860px){.fresh-grid{grid-template-columns:1fr 96px}.fresh-grid .hide-sm{display:none}.pill-fresh .fresh-seg{display:none}}
```

- [ ] **Step 6: 跑测试确认逻辑层未回归**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node --test && node scripts/validate-data.mjs
```
Expected: 全绿。

- [ ] **Step 7: 起本地服务，用浏览器实际看过**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && (python -m http.server 8765 >/dev/null 2>&1 &) && sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/index.html
```
Expected: `200`。然后用浏览器打开 `http://127.0.0.1:8765/`，逐项确认：
1. 顶部两枚 pill 并排、不折行；B 枚显示 `价格核价 11/11 新鲜` + 11 格绿条；
2. 点 B 枚跳到 `#freshness`；
3. 新鲜度卡三个数字为 `11/11`、`5/11`、`0`，表格里 MiniMax/Kimi 等 6 条排在最上面、出处列显示「聚合参考」；
4. 对比表每行来源列末尾有 `核价 08-31` 或 `核价 09-13` 绿徽标；
5. 控制台无报错；把窗口拉到 800px 宽，pill 不溢出、「距今」列隐藏；
6. 页脚不再是 `数据更新 2026-09-13`。
**截图存档，不能只凭 curl 判定完成。**

- [ ] **Step 8: 提交**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && git ls-files --eol | grep -v 'w/lf' || echo "行尾 OK"
git add index.html js/app.js js/freshness.js css/styles.css
git commit -m "feat(p0): 顶部两枚 pill + 市场动态数据新鲜度卡 + 行内核价徽标"
```

---

## Task 4: 区分「源抓不到」与「脚本崩溃」

**Files:**
- Create: `scripts/mark-pipeline.mjs`
- Test: `tests/mark-pipeline.test.mjs`
- Modify: `.github/workflows/daily-update.yml`

**Interfaces:**
- Consumes: `data/meta.json`（旧内容）、`--crashed="a,b"` 命令行参数
- Produces: 覆写 `data/meta.json` 为 `{autoCheck, pipelineDegraded, failedSteps, ranAt}`；workflow 输出 `PIPELINE_CRASHED=true|false` 供末步 gate

- [ ] **Step 1: 写失败的测试**

Create `tests/mark-pipeline.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideMeta } from "../scripts/mark-pipeline.mjs";

const BASE = { autoCheck: "2026-09-19", pipelineDegraded: false, failedSteps: [], ranAt: "x" };

test("无崩溃：巡检日期推进、降级标记清零", () => {
  const m = decideMeta(BASE, [], "2026-09-20", "2026-09-20T05:35:00Z");
  assert.deepEqual(m, { autoCheck: "2026-09-20", pipelineDegraded: false, failedSteps: [], ranAt: "2026-09-20T05:35:00Z" });
});

test("有崩溃：autoCheck 保持旧值，并记下哪些脚本崩了", () => {
  const m = decideMeta(BASE, ["check-pages", "diff-prices"], "2026-09-20", "2026-09-20T05:35:00Z");
  assert.equal(m.autoCheck, "2026-09-19", "绝不能把失败的运行算成巡检成功");
  assert.equal(m.pipelineDegraded, true);
  assert.deepEqual(m.failedSteps, ["check-pages", "diff-prices"]);
});

test("崩溃后恢复：日期重新推进、标记清零", () => {
  const degraded = { autoCheck: "2026-09-18", pipelineDegraded: true, failedSteps: ["fetch-feeds"] };
  const m = decideMeta(degraded, [], "2026-09-20", "2026-09-20T05:35:00Z");
  assert.deepEqual(m, { autoCheck: "2026-09-20", pipelineDegraded: false, failedSteps: [], ranAt: "2026-09-20T05:35:00Z" });
});

test("meta.json 损坏时不炸，按空基线重建", () => {
  const m = decideMeta(null, [], "2026-09-20", "2026-09-20T05:35:00Z");
  assert.equal(m.autoCheck, "2026-09-20");
  assert.equal(m.pipelineDegraded, false);
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node --testmark-pipeline.test.mjs
```
Expected: FAIL，`Cannot find module '../scripts/mark-pipeline.mjs'`。

- [ ] **Step 3: 实现**

Create `scripts/mark-pipeline.mjs`:

```js
// 巡检日期的唯一写入点。
// 存在的理由：原先 workflow 无条件把 autoCheck 写成当天，而 4 个抓取步骤都带 continue-on-error，
// 于是"所有脚本都崩了"与"巡检顺利完成"在页面上长得一模一样。源抓不到是数据问题（由
// sourcehealth.json 如实记录，不降级）；脚本崩溃是代码 bug，必须让站点和 Actions 同时知道。
import { readFileSync, writeFileSync } from "node:fs";
import { isMain } from "./lib.mjs";

export function decideMeta(prev, crashedSteps, today, ranAt) {
  const crashed = [...new Set((crashedSteps || []).filter(Boolean))];
  if (crashed.length) {
    return {
      autoCheck: (prev && prev.autoCheck) || null,   // 保持旧值：不假装今天跑成功过
      pipelineDegraded: true,
      failedSteps: crashed,
      ranAt,
    };
  }
  return { autoCheck: today, pipelineDegraded: false, failedSteps: [], ranAt };
}

if (isMain(import.meta.url)) {
  const arg = (name, dft = "") => {
    const m = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
    return m ? m.slice(name.length + 3) : dft;
  };
  const crashed = arg("crashed").split(",").map((s) => s.trim()).filter(Boolean);
  let prev = null;
  try { prev = JSON.parse(readFileSync("data/meta.json", "utf8")); } catch { prev = null; }
  const today = arg("today", new Date().toISOString().slice(0, 10));
  const meta = decideMeta(prev, crashed, today, new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
  writeFileSync("data/meta.json", JSON.stringify(meta) + "\n", "utf8");
  console.log(`meta.json → ${JSON.stringify(meta)}`);
  if (crashed.length) console.log("PIPELINE_CRASHED=true");
  else console.log("PIPELINE_CRASHED=false");
}
```

- [ ] **Step 4: 跑测试，确认全绿**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node --testmark-pipeline.test.mjs
```
Expected: 4 pass。

- [ ] **Step 5: workflow 给 4 个抓取步骤加 id**

`.github/workflows/daily-update.yml` 的四个步骤，在各自 `- name:` 下一行加 `id:`（其余内容不动）：

```yaml
      - name: ① 重新生成 models.dev 兜底快照
        id: s_snapshot
        continue-on-error: true
        run: node scripts/update-snapshot.mjs

      - name: ② 官方页面变动检测（哈希）
        id: s_pages
        continue-on-error: true
        run: node scripts/check-pages.mjs

      - name: ③ 抓取 changelog / 状态页 / 社区订阅源
        id: s_feeds
        continue-on-error: true
        env:
          GITHUB_TOKEN: ${{ github.token }}   # GitHub API 未认证仅 60 次/小时
        run: node scripts/fetch-feeds.mjs

      - name: ④ 价格库与免费模型差异检测
        id: s_diff
        continue-on-error: true
        run: node scripts/diff-prices.mjs
```

- [ ] **Step 6: 加校验步骤（在 checkout+setup-node 之后、① 之前）**

```yaml
      # 数据契约与逻辑层先过闸：数据字段坏了就别再往下跑，否则新鲜度面板会拿脏值渲染。
      - name: ⓪ 数据契约校验 + 单元测试
        run: |
          node scripts/validate-data.mjs
          node --test
```

- [ ] **Step 7: 替换「写入巡检日期」步骤**

把原来的 `- name: 写入巡检日期`（`echo "{\"autoCheck\":...}" > data/meta.json`）整段替换为：

```yaml
      - name: 写入巡检日期（有脚本崩溃则如实降级，不假装巡检成功）
        id: meta
        run: |
          CRASHED=""
          [ "${{ steps.s_snapshot.outcome }}" = "failure" ] && CRASHED="$CRASHED,s_snapshot"
          [ "${{ steps.s_pages.outcome }}" = "failure" ] && CRASHED="$CRASHED,s_pages"
          [ "${{ steps.s_feeds.outcome }}" = "failure" ] && CRASHED="$CRASHED,s_feeds"
          [ "${{ steps.s_diff.outcome }}" = "failure" ] && CRASHED="$CRASHED,s_diff"
          CRASHED="${CRASHED#,}"
          node scripts/mark-pipeline.mjs --crashed="$CRASHED"
          echo "crashed=$CRASHED" >> "$GITHUB_OUTPUT"
```

> 为什么逐项列举而不是通配：GitHub Actions 的 `${{ steps.*.outcome }}` **不支持**星号展开，写出来会得到字面量，降级判定静默失效——这类错误在 YAML 里不会报错，只会悄悄不生效，所以宁可啰嗦。
> 另外 `[ ... ] && CMD` 的短路在 `set -e`（Actions 默认 `bash -e`）下会让脚本以非 0 退出，因此这四行**必须**保持当前写法（末行是 `echo`，其返回值决定退出码）；若后续在末尾追加别的判断，记得加 `|| true`。

- [ ] **Step 8: 在 workflow 最末尾加降级 gate（必须在提交与开 issue 之后）**

顺序很关键：先落盘 `pipelineDegraded`、先提交、先更新 issue，最后才把 job 弄红——否则降级状态不会被持久化，第二天又"看起来正常"。

```yaml
      # 最后一步才让 job 变红：提交与 issue 都要先完成，降级状态必须被持久化下来。
      - name: 有脚本崩溃时以失败收尾
        if: steps.meta.outputs.crashed != ''
        run: |
          echo "::error::以下巡检脚本崩溃：${{ steps.meta.outputs.crashed }}"
          exit 1
```

为此 Step 7 的 `run` 里补一行输出：

```yaml
          node scripts/mark-pipeline.mjs --crashed="$CRASHED"
          echo "crashed=$CRASHED" >> "$GITHUB_OUTPUT"
```

- [ ] **Step 9: 本地验证降级路径**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node scripts/mark-pipeline.mjs --crashed=s_pages,s_diff && cat data/meta.json && echo && node scripts/mark-pipeline.mjs --crashed= && cat data/meta.json
```
Expected: 第一次 `autoCheck` 保持 `2026-09-20`（当前值）、`pipelineDegraded:true`、`failedSteps:["s_pages","s_diff"]`；第二次恢复 `pipelineDegraded:false`。最后 `git checkout data/meta.json` 还原。

- [ ] **Step 10: 验证 workflow YAML 语法**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node -e '
const s=require("fs").readFileSync(".github/workflows/daily-update.yml","utf8");
const bad=s.split("\n").filter((l,i)=>/\t/.test(l)).map((l,i)=>i);
console.log("制表符缩进行:",bad.length);
console.log("step id 数:",(s.match(/^\s+id:/gm)||[]).length);
console.log("run 块数:",(s.match(/^\s+run:/gm)||[]).length);
'
```
Expected: 制表符 0；id 数 ≥ 6。真实语法校验靠推分支后看 Actions（Task 6 Step 4 会跑 `workflow_dispatch`）。

- [ ] **Step 11: 提交**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && git checkout data/meta.json
git ls-files --eol | grep -v 'w/lf' || echo "行尾 OK"
git add scripts/mark-pipeline.mjs tests/mark-pipeline.test.mjs .github/workflows/daily-update.yml
git commit -m "fix(ci): 区分源失败与脚本崩溃，崩溃时不再把巡检日期写成当天且 job 变红"
```

---

## Task 5: 待办队列收敛为一条常驻 issue

**Files:**
- Create: `scripts/build-triage.mjs`
- Test: `tests/build-triage.test.mjs`
- Modify: `.github/workflows/daily-update.yml`（内联 `node -e` 整段换成脚本调用；issue 步骤改常驻）

**Interfaces:**
- Consumes: `data/alerts.json`、`data/signals.json`、`data/reported.json`、`data/sourcehealth.json`
- Produces: `buildTriage({alerts,signals,reported,health}, today) -> {body:string, reportedIds:string[]}`；写 `issue-body.md`；workflow 侧 label 为 `daily-triage`

- [ ] **Step 1: 写失败的测试（覆盖"告警蒸发"这个 bug）**

Create `tests/build-triage.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTriage } from "../scripts/build-triage.mjs";

const EMPTY = { alerts: [], signals: { items: [] }, reported: { ids: [] }, health: { sources: {} } };
const T = "2026-09-21";

test("三天前检出且仍未核实的告警，今天仍在清单里（这是原先 bug 的核心）", () => {
  const alerts = [
    { id: "aliyun", label: "阿里云百炼免费额度说明", url: "https://x.test/", detected: "2026-09-18", resolved: false },
    { id: "copilot", label: "Copilot 文档", url: "https://y.test/", detected: "2026-09-21", resolved: true },
    { id: "kimi", label: "Kimi 定价", url: "https://z.test/", detected: "2026-09-20", resolved: true, resolvedBy: "auto-revert" },
  ];
  const { body } = buildTriage({ ...EMPTY, alerts }, T);
  assert.match(body, /阿里云百炼/);
  assert.match(body, /已挂起 3 天/);
  assert.ok(!body.includes("Copilot 文档"), "已 resolved 的不进清单");
  assert.ok(!body.includes("Kimi 定价"), "已 resolved 的不进清单");
});

test("community 与 availability 类线索不进人工队列，且不记入 reported", () => {
  const signals = { items: [
    { id: "a1", title: "社区爆料", url: "https://c/", sourceLabel: "HN", tier: "community", kind: "promo-candidate" },
    { id: "a2", title: "状态页事件", url: "https://s/", sourceLabel: "Status", tier: "official", kind: "availability" },
    { id: "a3", title: "官方 changelog 促销", url: "https://o/", sourceLabel: "GH Changelog", tier: "official", kind: "promo-candidate" },
  ]};
  const r = buildTriage({ ...EMPTY, signals }, T);
  assert.match(r.body, /官方 changelog 促销/);
  assert.ok(!r.body.includes("社区爆料"));
  assert.ok(!r.body.includes("状态页事件"));
  assert.deepEqual(r.reportedIds, ["a3"]);
});

test("已上报过的线索不重复出现在清单里", () => {
  const signals = { items: [{ id: "a3", title: "已经提过的线索", url: "https://o/", sourceLabel: "GH", tier: "official", kind: "promo-candidate" }] };
  const { body } = buildTriage({ ...EMPTY, signals, reported: { ids: ["a3"] } }, T);
  assert.ok(!body.includes("已经提过的线索"));
});

test("连续 3 天失败的源进「需要修监控」清单", () => {
  const health = { sources: {
    dead: { label: "死源", url: "https://d/", ok: false, consecutiveFailures: 4, error: "HTTP 403" },
    shaky: { label: "刚失败", url: "https://s/", ok: false, consecutiveFailures: 1 },
    fine: { label: "好的", url: "https://f/", ok: true, consecutiveFailures: 0 },
  }};
  const { body } = buildTriage({ ...EMPTY, health }, T);
  assert.match(body, /死源/);
  assert.ok(!body.includes("刚失败"));
  assert.ok(!body.includes("好的"));
});

test("三类都空时 body 为空串（workflow 据此关闭常驻 issue）", () => {
  assert.equal(buildTriage(EMPTY, T).body, "");
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node --testbuild-triage.test.mjs
```
Expected: FAIL，`Cannot find module '../scripts/build-triage.mjs'`。

- [ ] **Step 3: 实现（把 workflow 里那段内联 node 搬出来并改掉过滤条件）**

Create `scripts/build-triage.mjs`:

```js
// 生成「待人工处理清单」。原先这段逻辑内联在 workflow 的 node -e 里，无法测试，
// 且告警过滤写的是 detected === today —— 未处理的事项第二天就静默消失。
// 现在按"当前未决全集"输出，配合常驻 issue（label daily-triage）即为一个真正的待办队列。
import { writeFileSync } from "node:fs";
import { readJSON, isMain } from "./lib.mjs";

const DAY = 86400000;
const daysOpen = (iso, today) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.round((Date.parse(today) - t) / DAY));
};

export function buildTriage({ alerts = [], signals = { items: [] }, reported = { ids: [] }, health = { sources: {} } }, today) {
  const out = [];

  const open = (alerts || []).filter((a) => !a.resolved);
  if (open.length) {
    out.push("### 官方页内容变动，价格待人工核实\n" + open.map((a) => {
      const n = daysOpen(a.detected, today);
      return `- [${a.label}](${a.url}) — 检测于 ${a.detected}${n === null ? "" : `（已挂起 ${n} 天）`}`;
    }).join("\n"));
  }

  const reportedSet = new Set(reported.ids || []);
  // ① 状态页故障不是促销线索；② 社区情报只作展示，不进人工队列；③ 每条只上报一次
  const sig = (signals.items || []).filter((s) =>
    s.tier !== "community" && s.kind !== "availability" && !reportedSet.has(s.id));
  if (sig.length) {
    out.push("### 自动发现的新线索（官方源，需人工确认后才进价格表）\n" +
      sig.slice(0, 20).map((s) => `- [${s.title}](${s.url})　— ${s.sourceLabel}`).join("\n"));
  }

  const dead = Object.values(health.sources || {}).filter((s) => s.ok === false && (s.consecutiveFailures || 0) >= 3);
  if (dead.length) {
    out.push("### ⚠ 以下信息源已连续 3 天抓取失败，需要在 data/sources.json 中修复或停用\n" +
      dead.map((s) => `- ${s.label}（${s.url}）— 最后错误：${s.error || "未知"}`).join("\n"));
  }

  return { body: out.join("\n\n"), reportedIds: sig.map((s) => s.id) };
}

if (isMain(import.meta.url)) {
  const today = new Date().toISOString().slice(0, 10);
  const r = buildTriage({
    alerts: readJSON("data/alerts.json", []),
    signals: readJSON("data/signals.json", { items: [] }),
    reported: readJSON("data/reported.json", { ids: [] }),
    health: readJSON("data/sourcehealth.json", { sources: {} }),
  }, today);
  writeFileSync("issue-body.md", r.body, "utf8");
  if (r.reportedIds.length) {
    const reported = readJSON("data/reported.json", { ids: [] });
    const merged = new Set([...(reported.ids || []), ...r.reportedIds]);
    // 线索有 90 天滚动窗口，reported 也要跟着收敛，否则只增不减
    const live = new Set((readJSON("data/signals.json", { items: [] }).items || []).map((s) => s.id));
    reported.ids = [...merged].filter((id) => live.has(id));
    reported.updatedAt = today;
    writeFileSync("data/reported.json", JSON.stringify(reported, null, 1) + "\n", "utf8");
  }
  console.log(r.body ? `待办清单：${r.body.split("\n\n").length} 组，新上报线索 ${r.reportedIds.length} 条` : "当前无未决事项");
}
```

> `reported.ids` 按"仍在 signals 里的 id"收敛这一行，顺手修掉了原先 `reported.json` 只增不减的问题——它现在被 signals 的 90 天窗口约束。

- [ ] **Step 4: 跑测试，确认全绿**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node --testbuild-triage.test.mjs
```
Expected: 5 pass。

- [ ] **Step 5: 用真实数据跑一遍，核对行为变化**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node scripts/build-triage.mjs && echo "--- issue-body.md ---" && cat issue-body.md
```
Expected: 输出里出现「阿里云百炼免费额度说明 …（已挂起 1 天）」（它在 alerts.json 中 `resolved:false`、`detected:2026-09-20`）；这是旧逻辑在同一天之后就会丢掉的那条。

- [ ] **Step 6: workflow 换成脚本调用**

把 `- name: 生成待人工处理清单` 及其后那整段 `node -e '...'`（当前 54–95 行）替换为：

```yaml
      # 先生成待处理清单（会写入 data/reported.json 记录"已上报"的线索），
      # 再提交，最后才开 issue —— 顺序不能颠倒，否则 reported.json 不会被持久化。
      - name: 生成待人工处理清单
        run: node scripts/build-triage.mjs
```

- [ ] **Step 7: issue 步骤改为常驻一条**

把 `- name: 有待处理事项时开 issue` 整段替换为：

```yaml
      - name: 维护常驻待办 issue（有事项则更新，无事项则关闭）
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh label create daily-triage --repo "$GITHUB_REPOSITORY" \
            --color f5b445 --description 自动巡检产生的待人工处理队列 --force 2>/dev/null || true
          OPEN=$(gh issue list --repo "$GITHUB_REPOSITORY" --label daily-triage --state open --json number --jq '.[0].number // empty')
          if [ -s issue-body.md ]; then
            BODY="$(printf '%s\n\n<sub>由每日自动巡检维护，请勿手工编辑正文；清单为空时本 issue 会自动关闭。</sub>\n' "$(cat issue-body.md)")"
            if [ -n "$OPEN" ]; then
              printf '%s' "$BODY" > issue-body.md
              gh issue edit "$OPEN" --repo "$GITHUB_REPOSITORY" --body-file issue-body.md
              echo "已更新常驻 issue #$OPEN"
            else
              printf '%s' "$BODY" > issue-body.md
              gh issue create --repo "$GITHUB_REPOSITORY" \
                --title "巡检待处理队列" --label daily-triage --body-file issue-body.md
            fi
          elif [ -n "$OPEN" ]; then
            gh issue close "$OPEN" --repo "$GITHUB_REPOSITORY" --comment "自动巡检：当前无未决事项。"
          else
            echo "无未决事项，无需开 issue"
          fi
```

- [ ] **Step 8: 跑全量测试 + 提交**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node --test && git checkout issue-body.md 2>/dev/null; git ls-files --eol | grep -v 'w/lf' || echo "行尾 OK"
git add scripts/build-triage.mjs tests/build-triage.test.mjs .github/workflows/daily-update.yml
git commit -m "fix(ci): 未决告警不再隔天消失，待办收敛为一条常驻 daily-triage issue"
```

---

## Task 6: 纠正空转的哈希监控 + 时点与文案

**Files:**
- Modify: `data/sources.json`（kimi / glm / minimax 三条）
- Modify: `js/app.js:437-457`（源健康芯片说明）
- Modify: `README.md`、`index.html:24` 附近「数据说明与更新机制」区块（`<section id="policy">`，289–338）
- Test: `tests/sources.test.mjs`

- [ ] **Step 1: 写失败的测试**

Create `tests/sources.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const s = JSON.parse(fs.readFileSync("data/sources.json", "utf8"));
const get = (id) => s.pages.find((p) => p.id === id);

test("HTML 里没有价格的页面必须声明 layout-only", () => {
  // 2026-09-20 实测：kimi 253KB / glm 775KB HTML，价格 token 命中均为 0；
  // minimax 正文含价但为语音套餐。三者的哈希对比都无法发现价格变化。
  for (const id of ["kimi", "glm", "minimax"]) {
    assert.equal(get(id).hashMonitors, "layout-only", `${id} 应标注为仅监控版式`);
  }
});

test("layout-only 的源不得被当成价格监控（字段自洽）", () => {
  for (const p of s.pages.filter((x) => x.hashMonitors === "layout-only")) {
    assert.ok(p.layoutOnlyReason, `${p.id} 需写明原因`);
  }
});

test("price-capable 页面保持默认", () => {
  for (const id of ["claude", "copilot", "cursor", "trae"]) {
    assert.match(get(id).hashMonitors || "price-capable", /^price-capable$/, `${id} 应为可核价`);
  }
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node --testsources.test.mjs
```
Expected: FAIL，`kimi 应标注为仅监控版式`。

- [ ] **Step 3: 改 sources.json**

给 `data/sources.json` 里 `pages` 数组的三条各加两个字段（其余字段原样不动）：

```jsonc
{
  "id": "kimi",
  "hashMonitors": "layout-only",
  "layoutOnlyReason": "2026-09-20 实测：253 KB HTML 内无任何价格文本（stripTags 后仅 1370 字符），价格为客户端再取。哈希对比只能发现版式改动，发现不了价格改动。"
}
```

```jsonc
{
  "id": "glm",
  "hashMonitors": "layout-only",
  "layoutOnlyReason": "2026-09-20 实测：775 KB HTML 内价格字段命中 0，套餐价为客户端再取。同上，哈希只覆盖版式。"
}
```

```jsonc
{
  "id": "minimax",
  "hashMonitors": "layout-only",
  "layoutOnlyReason": "2026-09-20 实测：正文含价但为语音套餐（¥630 / ¥5,950 / ¥56,000），非 Coding Plan 档位；不可用作价格核价依据。"
}
```

其余页面（claude / copilot / cursor / trae / aliyun-*）不加 `hashMonitors` 字段，由读取侧当作默认 `price-capable` 处理。

- [ ] **Step 4: 跑测试，确认全绿**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node --testsources.test.mjs && node scripts/validate-data.mjs
```
Expected: 3 pass + 契约通过。

- [ ] **Step 5: 源健康面板如实区分**

`js/app.js:441` 之后加载源声明，并把 layout-only 的 chip 标成中性色 + 专属 tooltip。把 `renderSourceHealth` 内 `try{` 后的开头改为：

```js
    const j=await fetchJSON("data/sourcehealth.json");
    const srcDecl=await fetchJSON("data/sources.json").catch(()=>({pages:[]}));
    const layoutOnly=new Set((srcDecl.pages||[]).filter(p=>p.hashMonitors==="layout-only").map(p=>p.id));
    const list=Object.values(j.sources||{});
    if(!list.length){ box.innerHTML=""; return; }
    const chips=list.map(s=>{
      const dead=s.ok===false&&(s.consecutiveFailures||0)>=3;
      const lo=layoutOnly.has(s.id);
      const cls=dead?"bad":(s.unstable||s.ok===false)?"warn":"";
      const extra=dead?"（已失效）":s.unstable?"（需人工核对）":lo?"（仅版式监控）":"";
      const tip=dead?`连续 ${s.consecutiveFailures} 天抓取失败${s.error?`（${s.error}）`:""}`
        :lo?"该页价格在客户端再取，HTML 里没有价格可比对——哈希巡检只能发现版式改动，发现不了价格改动，价格仍需人工核对"
        :s.ok===false?`上次抓取失败${s.error?`（${s.error}）`:""}`
        :`最后成功 ${s.lastOk||"—"}${s.detail?` · ${s.detail}`:""}`;
      return `<span class="h-item ${dead?"dead":""}${lo?" layout-only":""}" title="${esc(tip)}"><span class="h-dot ${cls}"></span>${esc(s.label)}${extra}</span>`;
    }).join("");
```

并在 `css/styles.css` 的新鲜度样式块里补一行（计入 25 行预算外，因为是既有 `.h-item` 的修饰）：

```css
.health .h-item.layout-only{border-style:dashed;color:var(--muted)}
```

- [ ] **Step 6: 更新源健康下方那段固定文案**

`js/app.js:455` 那段 `<p>` 末尾追加一句（保持单行模板串）：

```js
      <p style="font-size:12px;color:var(--dim);margin-top:8px">绿点＝最近一次抓取成功；黄点＝失败未达阈值，或该页内容不稳定（已暂停自动预警、需人工核对）；红点＝连续 3 天失败，判定为<b>已失效</b>——站点会如实标注，不再假装该源在正常工作。<b>虚线灰底＝该页价格在客户端再取，HTML 里没有价格可比对，自动巡检只能发现版式改动</b>（Kimi / GLM / MiniMax 即属此类，价格仍需人工核对）。巡检时间：${esc(j.updatedAt||"—")}。抓不到的源不会硬撑：LINUX DO 与 V2EX 经双环境实测均无法获取（403 / 空响应，数据中心 IP 被拦截），已从清单停用并改为人工巡览，详见页面末尾「数据说明」。</p>`;
```

- [ ] **Step 7: README 与「数据说明」区块文案**

`README.md:25` 那句"每天 北京时间 09:00（cron `0 1 * * *` UTC）"改为：

```markdown
仓库每天自动运行 [daily-update.yml](.github/workflows/daily-update.yml) 巡检一次。cron 设为 `0 1 * * *`
（= 北京时间 09:00），但**GitHub 的定时调度不保证启动时点**——2026-09-15→09-20 六次实测均在
05:2x–05:3x UTC（约北京 13:30）才起跑，因此本站只承诺"每天一次"，不承诺"09:00 完成"。
四个任务互相独立、任一失败不影响其余（`continue-on-error`）：
```

`README.md` 的「诚实原则」清单里追加两条：

```markdown
- **区分"源抓不到"与"脚本崩了"**：前者是数据问题，写入 `data/sourcehealth.json` 并在站点标失效；
  后者是代码 bug，会把 `data/meta.json` 标为 `pipelineDegraded`、**保持巡检日期不推进**，并让 Actions 运行变红
- **哈希监控分两类**：Kimi / GLM / MiniMax 的套餐价不在 HTML 里（客户端再取）或是别的商品价，
  哈希对比只能发现版式改动，发现不了价格改动 —— 这三页在源健康面板标为「仅版式监控」（虚线灰底），
  不计入"价格在被自动盯着"
```

`index.html` 的 `<section id="policy">`（289–338）里那段讲更新机制的文字，把"每天 09:00"改为同样的"每日一次、时点不保证"表述，并把「数据更新：2026-09-13」相关表述替换为指向新面板：

```html
    <p>本站数据分两类：<b>人工核价</b>（订阅价格、额度、倍率）与<b>每日自动巡检</b>（Token 实时价、线索队列、信息源健康）。
    两类的更新节奏不同，故首页顶部拆成两枚胶囊分别标注；每个平台的核价时间与出处强度见「市场动态 → 数据新鲜度」。</p>
```

- [ ] **Step 8: 浏览器复验**

起 `python -m http.server 8765`，打开 `#dynamics`，确认：Kimi / GLM / MiniMax 三枚 chip 为虚线灰底、文案「（仅版式监控）」、hover 有解释 tooltip；其余 chip 不变。截图存档。

- [ ] **Step 9: 全量测试 + 提交**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && node --test && node scripts/validate-data.mjs
git ls-files --eol | grep -v 'w/lf' || echo "行尾 OK"
git add data/sources.json js/app.js css/styles.css README.md index.html tests/sources.test.mjs
git commit -m "fix: Kimi/GLM/MiniMax 的哈希监控标注为仅版式监控，纠正巡检时点表述"
```

---

## Task 7: 发布（需要用户确认后才执行）

- [ ] **Step 1: 汇总本地提交与最终 diff**

```bash
cd "F:/AI/Qdor/repos/cpr-inspect" && git log --oneline baseline..HEAD && git diff --stat baseline..HEAD
```
Expected: 6 个 feat/fix 提交；diff 覆盖 12 个文件左右，**不应出现整文件重写**（若某文件显示"全部行变更"，说明行尾被污染，停下修）。

- [ ] **Step 2: 向用户确认后才推**

推远端会改变对外可见的仓库状态。**必须等用户明确同意**，且默认只推分支 + 开 PR，不碰 main：

```bash
SHA=$(gh api repos/wjf1/coding-plan-radar/git/ref/heads/main --jq '.object.sha')
gh api repos/wjf1/coding-plan-radar/git/refs -f ref="refs/heads/feat/p0-data-freshness" -f sha="$SHA"
GITHUB_BRANCH=feat/p0-data-freshness node scripts/publish-via-api.mjs "feat(p0): 数据新鲜度与巡检诚实化"
```

- [ ] **Step 3: 建 PR 并写清评审重点**

```bash
gh pr create --repo wjf1/coding-plan-radar --base main --head feat/p0-data-freshness \
  --title "P0：数据新鲜度面板 + 巡检状态如实化" \
  --body-file /tmp/pr-body.md
```
PR body 必须包含：① 为什么顶部日期原来是硬编码的；② 6 平台核价日实为 08-31 而非 09-13；③ workflow 改动**未经真实运行验证**，合并后需立刻 `workflow_dispatch` 跑一次（Step 4）；④ 本计划只做 P0，P1/P2 见 spec。

- [ ] **Step 4: 合并后跑一次真实巡检验证 workflow**

```bash
gh workflow run daily-update.yml --repo wjf1/coding-plan-radar --ref main
gh run list --repo wjf1/coding-plan-radar --workflow daily-data-update --limit 3
gh run watch   # 关注：⓪ 校验步骤是否通过；meta.json 是否仍推进；常驻 issue 是否被创建/更新
```
Expected: job 成功；`data/meta.json` 出现新字段；线上出现一条 `daily-triage` issue（因为 `aliyun-free-quota` 仍 `resolved:false`）。

- [ ] **Step 5: 线上复验**

打开 https://wjf1.github.io/coding-plan-radar/ ，确认两枚 pill、新鲜度卡、行内徽标、`#dynamics` 均正常；CDN 可能有缓存，必要时加 `?v=` 查询参数。

---

## 执行期发现的偏差（已实现并验证，与前文代码块不同处以本节为准）

| # | 计划里写的 | 实际改成的 | 为什么 |
|---|---|---|---|
| 1 | `node --test tests/` | `node --test` | Node 22.23.2 把目录参数当模块路径 require，报 `Cannot find module ...\tests`，整轮测试以 1 个失败收场 |
| 2 | 各脚本用 `import.meta.url === 'file://' + argv[1]` 判主模块 | 统一用 `scripts/lib.mjs` 导出的 `isMain(import.meta.url)`（`resolve` 比对） | Windows 下两边格式不同，判定恒假：CI(Linux) 正常、本地静默失效 |
| 3 | `FRESH.pillHtml()` 内含 11 段分布条 | 分布条移进 `cardHtml()` 的 `.fresh-segrow`，pill 只留 `.pdot` 状态点 | 实测两枚 pill 固有宽 363px > 容器实际给的 336px，在 `height:60px` 的 `.nav` 里折成两行被裁（`pillwrapH:63, pillwrapLines:2`）。移走后 pill 148px，单行、`navH` 60、零裁切 |
| 4 | `.nav{height:60px}` 不动 | 改 `min-height:60px` + `flex-wrap:wrap` + `padding:6px 0` | 既有缺陷：`height:60px` 配 `.nav nav{flex-wrap:wrap}` 在窄屏本就内容溢出被裁。改后 820px 下头部自然增高到 114px，横向溢出 0 |
| 5 | init 整体放进 `async IIFE` 里 `await` 后再 `renderPlans()` | 同步先 `renderPlans()` 等，只有 `loadAutoMeta()+renderFreshness()` 走异步 | 否则首屏关键对比表要白等一次 `data/meta.json` 的网络往返 |
| 6 | `assert.deepEqual(FRESH.statsOf(...), {...})` | 外面套 `hostData()`（`structuredClone`） | `node:assert/strict` 的 deepEqual 会比较原型；vm 里创建的对象带另一个 realm 的 `Object.prototype`，结构完全一致也判不等 |
| 7 | cardHtml 断言 `/1\/1 30 天内复核/` | 按整段精确断言 `<b>0/1</b><small>30 天内复核</small>` | 原写法跨 `<b>`/`<small>` 两个元素，正则永不匹配；且 45 天本应落在"需复核"，期望值自己也写错了 |

### 未处理但已确认的既有问题（不属本期，留档）

- `table{min-width:960px}`（`css/styles.css:59`）导致 400px 视口下横向溢出 120px。溢出元素是既有对比表，与新鲜度面板无关（`.fresh-grid` 未进溢出名单）。
- 缺 `favicon.ico`，控制台 1 条 404。
- 2 处 form 字段无 label（a11y 提示）。

| 8 | 计划未涉及 | `js/snapshot.js` 新增导出 `MODEL_SNAPSHOT_DATE`，降级提示改用该变量 | 复核时发现的同类缺陷：快照每天重新生成、日期只写在注释里前端读不到，于是 `app.js` 把降级提示写成死日期 `2026-09-13`，比真实快照旧 7 天且逐日更差 |
| 9 | 计划未涉及 | 新增 `tests/hardcoded-dates.test.mjs`（4 例） | 把"界面里不许再出现写死的维护日期/时点"变成可执行约束，否则同类缺陷会复发 |

---

## 执行结果（2026-09-20）

Task 1–6 全部完成，35 个用例通过，`node scripts/validate-data.mjs` 通过，浏览器实测三档视口（2560 / 820 / 400）无新增溢出。
待办：Task 7 发布（需用户确认后才推远端）。

---

## 完成判据（对照 spec §9）

- 顶部两枚 pill 由数据派生，`index.html` 中不再有硬编码的 `2026-09-13`（`grep -n "2026-09-13" index.html` 应为空）。
- 人为让某脚本抛异常（临时在 `scripts/diff-prices.mjs` 首行加 `throw 1` 推分支跑一次）→ Actions 变红，且 `data/meta.json` 的 `autoCheck` **不**推进、`pipelineDegraded:true`；撤销后恢复。
- `aliyun-free-quota`（`resolved:false`）在 09-21、09-22 的清单里仍然出现，且带「已挂起 N 天」。
- 源健康面板上 Kimi / GLM / MiniMax 显示「仅版式监控」。
- `node --test` 全绿（≥ 21 个用例），`node scripts/validate-data.mjs` 通过。
