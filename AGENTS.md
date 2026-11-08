# AGENTS.md

本文件为 AI 代理（ZCode / Claude Code 等）提供本项目级上下文。接手任务前先通读，再读 `HANDOFF.md`（含完整避坑清单与未实施方案）。

## 项目概览

AI 编程订阅计划（Coding Plan）对比站 **CodingPlan Radar**：纯静态站，无构建、**零 npm 依赖**（原生 HTML/CSS/JS，无框架），GitHub Pages 托管。覆盖 20 个条目（19 在售 + 1 停售留档）、69 个付费档位，Token 实时价格榜接 models.dev。

- 本地目录名 `coding-plan-compare`，**远端仓库名是 `wjf1/coding-plan-radar`**（不一致是刻意的）；线上 https://wjf1.github.io/coding-plan-radar/ 。
- 当前版本 **v7.5**（2026-10-31，条目级监控铺开 + 缓存 schema 版本化；工作目录版本，未打 tag，CHANGELOG `[Unreleased]` 待转正）；上一发布版 v7.4（2026-10-27）。无 package.json、无构建步骤、无第三方依赖。
- 自动化：GitHub Actions 每天北京时间 09:00（cron UTC 01:00）六步巡检 → 更新 `data/auto/` → 提交推送触发 Pages 重新发布 → 有待处理事项时自动开 issue。
- 维护重心（HANDOFF 明示）：功能开发边际收益低，重点是**自动化管道不静默失效**。
- 数据流：`data/manual/sources.json` 声明源 → 六个巡检脚本抓取/比对 → 写回 `data/auto/*.json` → validate 校验 → 提交推送触发 Pages 重新发布 → 浏览器端 `app.js` 经 `fetch` 读 JSON 渲染。站点板块：对比表（搜索/筛选/倍率列）、平台详情卡、IDE 榜 / 变更记录、Token 价格榜（三级保障：本地缓存 24h → models.dev 在线 → 内置快照降级）、成本计算器、巡检状态 / 信息源 / 白嫖板块；单文件加载失败只让对应板块为空（`loadJSONOr`），不拖垮整页。
- 浏览器缓存带 schema 版本（`CACHE_SCHEMA = 2`，写入含 `schema` 字段，不匹配即弃）；改缓存结构必须同步递增，否则旧缓存静默残留。

## 构建与测试命令

无构建、无 npm install（零依赖定位，刻意不引入 vitest/jest，测试用 Node 内建 `node:test`）。以下命令均已在 `HANDOFF.md` 与 `.github/workflows/{validate,daily-update}.yml` 中验证真实存在：

```bash
node scripts/validate.mjs    # 数据契约 + 脚本语法校验（改完 data/*.json 必须跑）
node tests/selfcheck.mjs     # 零依赖自检（15 例：纯函数/原子写入/幂等性/校验脚本负向用例）
python -m http.server 8765   # 本地预览（必须走 HTTP，file:// 被 CORS 拦截只剩空壳）

# 手动跑一次完整巡检（顺序与 CI 一致）：
node scripts/update-snapshot.mjs && node scripts/check-pages.mjs \
  && node scripts/fetch-feeds.mjs && node scripts/diff-prices.mjs \
  && node scripts/verify-listings.mjs && node scripts/record-history.mjs

node scripts/probe-source.mjs <id>  # 改 list 源选择器前先 probe（解析 0 条即报错退出）
```

- CI `validate.yml`（push/PR，Node 20）：validate → selfcheck，零依赖不需要 install。
- CI `daily-update.yml`（cron 每日）：六步巡检 → 校验 → 提交推送（触发 Pages）→ 待处理清单开 issue。注意 `continue-on-error` 下 job 结果恒 success，**判成功必须读 `steps.<id>.outputs.ok`**，不能读 `needs.<job>.result`。

## 代码风格约定

- 前端 `js/app.js` 单文件（约 840 行，原生 ES5+ / DOM，无框架），文件头横线块注释列模块划分；数据未到之前不做半渲染（`init` 先 `bind()` 再 `await Promise.all` 后统一首屏渲染）。
- 注释中文、密度高，讲机制与事故成因；CSS 单文件 `css/`。
- **数据严格两分**：`data/manual/` = 人工录入（价格 / 档位 / sources / promos / freebies / changelog），`data/auto/` = 机器每日生成（snapshot / signals / sourcehealth / price-history 等，勿手改）。机器只负责发现，任何价格/促销数字必须人工确认后才进对比表。
- `data/*.json` 一律原子写：新脚本用 `scripts/lib.mjs` 的 `writeJSON` / `writeFileAtomic`，**不要直接 `writeFileSync`**（半截 JSON 会被读取容错误判为文件不存在，静默丢数据）；Windows 下 `renameSync` 覆盖已存在文件可行，无需额外处理。
- 安全：`esc()` 只处理 `&<>"`——写进属性或 URL 的场景必须用 `safeHref()`（放行 http/https），不要裸 `esc()`。

## 提交与发布规范

- 提交信息 Conventional Commits + 中文描述：`feat(sources): ...`、`fix: ...`、`docs: ...`；每日自动巡检为机器人提交 `chore(daily): 自动数据巡检 YYYY-MM-DD`（数据类变更不进 CHANGELOG）。
- 数据类变更（每日巡检）不逐条记录；代码与内容层面的版本变更写 `CHANGELOG.md`（`[vX.Y] - 日期`，北京时间），并同步精简版到 `data/manual/changelog.json`（站点「本站变更记录」板块读它，两者需同步维护）。
- 发布：版本随 CHANGELOG `[Unreleased]` 转正；`data/manual/changelog.json` 与 `CHANGELOG.md` 同步后打 tag / 发 Release（标题 `vX.Y: 中文摘要`）。部署即 push（Pages 自动发布），无独立发布步骤。

## 项目专属注意

1. **任何审查/行号引用/估算之前先 `git fetch && git log origin/main --oneline`**：本地克隆滞后是本项目最大的坑（曾落后 17 个提交导致全线误判）。
2. **本地预览必须 HTTP**：所有数据走 `fetch("data/*.json")`，`file://` 下被 CORS 拦截只剩空壳——「页面空白」先查打开方式。
3. **改巡检范围只改 `data/manual/sources.json`**，不要把 URL 硬编码进脚本；新脚本产物落 `data/auto/`，勿写进 `data/manual/`（机器回写仅限 status 类核对字段）；新增平台条目必须带 `srcUrl`（校验会拦）。
4. **社区源在大陆线路不可达**（LINUX DO / V2EX 等，数据中心 IP 被 403/空响应）：本地跑巡检必然失败并记入源健康，这是预期行为不是 bug，只有 GitHub Actions 海外出口能抓到。
5. **改 list 源选择器前必须先 `node scripts/probe-source.mjs <id>`**；运行期保护已内置（0 条不建基线、结构变更熔断不更新基线），改动 `check-pages.mjs` 该分支时务必保持「旧基线回盘」语义（曾修过「熔断丢基线把坏结构固化成新基线」的缺陷）。
