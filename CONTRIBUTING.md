# 贡献指南 / Contributing

感谢关注 CodingPlan Radar。本项目是**零 npm 依赖、零构建**的纯静态站：
数据即仓库里的 JSON，前端是原生 ES5+，巡检脚本是 Node 内建模块直接跑的 `.mjs`。
参与贡献前请先读一遍本文件与 `HANDOFF.md`（后者记录了架构现状与踩过的坑）。

## 开发环境

- **Node ≥ 20**（CI 用 20，本地 22 实测可用）。仅此而已——没有 `package.json`，**不要**引入
  `npm install`、构建步骤或运行时依赖；测试用 Node 内建的 `node:test`（`tests/selfcheck.mjs`）。
- 编辑器随意，但请保持改动文件原有的缩进与风格（2 空格缩进，与现有代码一致）。
- Windows 环境开发没问题：所有脚本只用跨平台的 Node API；原子写依赖 `renameSync`，Windows 下等价
  `MOVEFILE_REPLACE_EXISTING`，行为一致。

## 本地校验与自检

改动之后、提交之前，两条命令必须全绿：

```bash
node scripts/validate.mjs        # 数据契约 + 全部 .mjs/.js 语法校验
node tests/selfcheck.mjs         # 零依赖自检（含选择器引擎、diff、解析器的正负用例）
```

本地预览页面**必须走 HTTP**（数据是 `fetch("data/*.json")`，`file://` 下会被 CORS 拦成空壳）：

```bash
python -m http.server 8765       # 或 npx serve
```

## 数据修改规范（最重要的一节）

**目录语义**：`data/manual/` = 人工录入（价格、档位、坑点、信息源清单……），`data/auto/` =
机器每日生成（快照、基线、告警……），**不要手改 auto 目录**，也不要把机器产物写进 manual。

**价格与额度数字的红线**：

- 价格、额度、倍率等数字**只能来自结构化源（models.dev / OpenRouter / LiteLLM）或人工确认**，
  禁止让 LLM 直接产出任何价格数字。模型可以回答「这条线索值不值得看」，不能回答「价格是多少」。
- 每个平台条目必须带 `srcUrl`（校验会拦截缺失）；改价格时同步核对来源页，宁可晚一天更新，
  也不让存疑数字进对比表。
- `data/auto/pricebase.json` / `price-history.json` 由巡检脚本维护，人工只读。

**信息源调整**：加源 / 停源 / 改关键词，只改 `data/manual/sources.json`，不要把 URL 硬编码进脚本。
把 page 源迁移为 list 源（条目级监控）前，必须先跑：

```bash
node scripts/probe-source.mjs <源id>
```

解析出 0 条就禁止落配置（`probe` 会非 0 退出）；SPA 空壳页与 Cloudflare 拦截页不要尝试迁移，
在 `sources.json` 里如实标注 `enabled: false` + 原因，站点会显示停用状态而不是假装在监控。

## 提交与 PR 流程

1. **分支**：从 `main` 切出功能分支（`feat/xxx`、`fix/xxx`）；机器人每日巡检提交直接进 `main`，
   人工改动走分支。
2. **提交信息**：中文 conventional commits，如 `feat(calc): 支持按供应商筛选`、
   `fix(validate): 修复 pricebase 契约漏检`、`chore(daily): 自动数据巡检 2026-10-31`。
3. **变更记录**：代码与内容层面的变更写入 `CHANGELOG.md` 的 `[Unreleased]` 段（Keep a Changelog
   分类：新增 / 变更 / 弃用 / 移除 / 修复 / 安全）；站点内的「本站变更记录」板块
   （`data/manual/changelog.json`）与它保持同步。涉及界面或数据说明变化的，`README.md` 同步修订。
4. **验证清单**（PR 描述里带上结果）：
   - [ ] `node scripts/validate.mjs` 通过
   - [ ] `node tests/selfcheck.mjs` 全绿
   - [ ] 改了 `data/manual/*.json` 的：本地预览确认对应板块渲染正常
   - [ ] 改了 `js/app.js` 前端交互的：浏览器实测（本项目不靠截图判读，用可编程断言 / DevTools）
5. **PR 审查重点**：价格数字的来源与核对记录、`data/manual` 与 `data/auto` 的边界、
   新增告警是否会刷屏（历史教训：litellm 价格分歧告警首个 CI 运行产生 146 条假信号）。

## 报告问题

- 价格错误：直接开 issue，注明平台、档位、页面看到的值与仓库里的值（附来源页截图或链接）。
- 源失效：`data/auto/sourcehealth.json` 会如实记录连续失败，issue 里贴上对应条目即可。
- 功能建议：先看 `HANDOFF.md` 的「明确不建议做」清单——零 npm、零构建、零 LLM 价格这三条定位
  不接受破坏；其余建议按「收益 / 回归风险」评估，本站受众很小，边际收益低的建议可能被婉拒。
