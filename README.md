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
| 📡 市场动态 | 促销与停售追踪（B站每日播报 + 官方公告交叉核实）+ 本站变更记录 |
| 🛡️ 来源分级 | 官方直采（绿）＞ 实时数据源（青）＞ 聚合参考（蓝）＞ 社区情报（黄，仅进动态区） |

## 🔄 每日自动更新（GitHub Actions）

仓库每天 **北京时间 09:00**（cron `0 1 * * *` UTC）自动运行 [daily-update.yml](.github/workflows/daily-update.yml)：

1. **`scripts/update-snapshot.mjs`** —— 重新抓取 models.dev，重新生成 `js/snapshot.js` 兜底快照（116 款编码模型）
2. **`scripts/check-pages.mjs`** —— 对 5 个官方定价页（Claude / ChatGPT / Copilot / Cursor / GLM）做内容哈希变动检测
   - 有变动 → 写入 `data/alerts.json`，站点顶部自动挂「待核实」横幅，并自动开 issue 提醒人工核价
3. **提交推送** —— 有数据变化才 commit，push 自动触发 GitHub Pages 重新发布
4. **巡检日期** —— 写入 `data/meta.json`，显示在站点顶部导航

**诚实原则**：脚本只自动更新机器可验证的数据（模型 API 价快照、页面变动信号），订阅价格一律人工核实后才改 —— 顶部导航的「数据更新」（人工核价日期）与「自动巡检」（机器检查日期）分开标注。

### 处理「官方页变动」issue 的流程

1. 打开 issue 中列出的官方页面，核对新价格 / 新额度
2. 更新本地 `js/data.js` 对应平台条目（含新的采集日期）
3. 将 `data/alerts.json` 中该条目的 `"resolved": false` 改为 `true`
4. 提交推送，横幅自动消失

## 📁 目录结构

```
├── index.html              # 页面骨架（对比表 / Token 榜 / 计算器 / IDE 榜 / 动态 / FAQ）
├── css/styles.css          # 全部样式（深色主题，无框架）
├── js/
│   ├── data.js             # ⭐ 订阅计划数据 + IDE 表 + 变更记录（日常改这里）
│   ├── app.js              # 渲染与交互逻辑（表格/卡片/计算器/实时榜/巡检状态）
│   └── snapshot.js         # models.dev 兜底快照（每日自动重新生成，勿手改）
├── data/
│   ├── pagehash.json       # 官方页内容哈希基线（自动维护）
│   ├── alerts.json         # 「待核实」预警状态（人工 resolved）
│   └── meta.json           # 最近巡检日期（自动维护）
├── scripts/                # 每日巡检脚本（node ≥18，可手动运行）
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

# 手动跑一次巡检
node scripts/update-snapshot.mjs && node scripts/check-pages.mjs
```

无构建步骤、零 npm 依赖、纯静态 —— fork 后开启 Pages 即可获得自己的实例。

## 📚 数据来源

| 层级 | 来源 | 用途 |
|---|---|---|
| 官方直采 | [claude.com/pricing](https://claude.com/pricing) · [openai.com](https://openai.com/chatgpt/pricing/) · [github.com](https://github.com/features/copilot/plans) · [cursor.com](https://cursor.com/pricing) · [bigmodel.cn](https://bigmodel.cn/glm-coding) | 订阅价格（人工核价） |
| 实时数据源 | [models.dev](https://github.com/sst/models.dev)（API 直连，CORS 全开放） | Token 价格榜 + 兜底快照 |
| 方法论 | [mahonzhan/awesome-coding-plan](https://github.com/mahonzhan/awesome-coding-plan)（2857★） | 额度倍率 / TPS / 三周期额度 / 坑点 |
| 聚合参考 | [codingplan.org](https://codingplan.org/) | 部分国内平台价格（逐条标注） |
| 社区情报 | [B站每日播报](https://www.bilibili.com/video/BV1xtYR6EE72/) | 市场动态（不直接进价格表） |

## ⚖️ 免责声明

- 价格与额度可能随时变化，**付款前务必以平台官网为准**
- 「额度倍率」「编辑推荐」为基于公开数据的社区口径估算与主观参考，非官方承诺，非广告
- 本站不含任何推广链接，与所列平台无商业关系；所有商标归各自所有者
