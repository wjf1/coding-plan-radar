// ===== 订阅计划数据 =====
// 价格来源：官方定价页直采（2026-09-13）或聚合参考（逐条标注）
// ratio = 月额度倍率（额度折算价值 ÷ 月价），方法论与数值参考 GitHub: mahonzhan/awesome-coding-plan（2026-09-13 检索）
// periods = 三周期（5h/周/月）额度倍率，同上来源；坑点 = 社区反馈汇总，仅供参考
// PLAN_DATA 条目字段说明：
//   name/vendor/region     平台名、厂商、intl=国际 | cn=国内（用于筛选）
//   status                 ok=正常 | promo=促销中 | bad=已停售（bad 不渲染详情卡片）
//   start/startVal         起步价展示文本 / 折合人民币数值（仅用于排序，$ 按 RATE 换算）
//   tiers                  全档位 [名称, 价格, 备注]
//   ratio/ratioTier        月额度倍率与档位说明（awesome-coding-plan 口径，null=无折算数据）
//   periods                三周期额度 {h5, wk, mo}（可缺省）
//   speed                  实测生成速度 TPS（awesome-coding-plan 实测，null=无数据）
//   pitfalls               坑点与社区反馈（429/限额/稳定性等，逐条带来源提示）
//   srcType/srcUrl/srcNote srcType: official=官方直采 | agg=聚合参考；来源链接与采集日期
const RATE = 7.2; // $1 ≈ ¥7.2，仅用于排序统一量纲

const PLAN_DATA = [
  {
    name:"ChatGPT (Codex)", region:"intl", vendor:"OpenAI", status:"ok",
    start:"$8 / 月（Go）", startVal:8*RATE,
    models:"GPT-5.6 Sol / Terra / Luna",
    quota:"按套餐用量限制；Pro 为 5× / 20× 档",
    ratio:21.82, ratioTier:"Plus $20/月",
    periods:{h5:"45–225 条消息",wk:"$109（5.46×）",mo:"$436（21.82×）"},
    speed:null,
    pitfalls:"Codex $20 档限额也有抱怨，但同价可用量普遍优于 Claude；捆绑图像/视频生成，非编码场景加分。",
    tiers:[["Free","$0","基础额度"],["Go","$8 / 月","入门付费档"],["Plus","$20 / 月","更高 Codex 额度"],["Pro","约 $200 / 月起","5× / 20× 用量档"]],
    tags:["Codex 任务","Pro 推理 Sol Pro","最高 Codex 任务上限"],
    srcType:"official", srcLabel:"官方直采 + 聚合补全",
    srcUrl:"https://openai.com/chatgpt/pricing/",
    srcNote:"官方页 2026-09-13 采集；Go 档价格参考 codingplan.org",
    note:"Go 档价格在官方页为动态展示，以结账页为准"
  },
  {
    name:"Claude", region:"intl", vendor:"Anthropic", status:"ok",
    start:"$20 / 月（年付 $17）", startVal:20*RATE,
    models:"Fable · Opus · Sonnet · Haiku",
    quota:"5 小时滚动会话 + 每周上限；Pro ≈ Free 的 5×",
    ratio:63.6, ratioTier:"Pro $20/月",
    periods:{h5:"$31.84（1.59×）",wk:"$318（15.9×）",mo:"$1,274（63.6×）"},
    speed:null,
    pitfalls:"2026 年 3–4 月起大量用户反馈限额收紧：单 prompt 占用激增、Max 20× 也有约 1 小时触顶 + 4 小时锁定的案例（Reddit 汇总）；5h 与每周双帽叠加，爆发型重度用户需谨慎。",
    tiers:[["Free","$0","Sonnet / Haiku 基础用量"],["Pro","$20 / 月","年付 $200 折合 $17/月"],["Max 5×","$100 / 月起","Pro 的 5× 用量"],["Max 20×","更高档","Pro 的 20× 用量"],["Team","$25 / 席 / 月","年付 $20；高级席 $125/$100"]],
    tags:["Claude Code 全付费档含","Cowork / Design","Extended Thinking","MCP"],
    srcType:"official", srcLabel:"官方直采",
    srcUrl:"https://claude.com/pricing", srcNote:"claude.com/pricing · 2026-09-13",
    note:"所有付费计划均含 Claude Code，与聊天共享用量池"
  },
  {
    name:"GitHub Copilot", region:"intl", vendor:"GitHub", status:"ok",
    start:"$10 / 月（Pro）", startVal:10*RATE,
    models:"GPT-5.6 · Claude Sonnet 5 · Gemini 3 Pro",
    quota:"按 Premium Requests 计；Max 档含 $100 AI Credits（1 credit = $0.01）",
    ratio:null, ratioTier:"",
    periods:null, speed:null,
    pitfalls:"已从请求制转向 Credits 计量，重度 premium 模型消耗快；Pro 档 $15 月度 credits 倍率仅 1.5×（社区折算）。",
    tiers:[["Free","$0","2000 次补全 + 50 次聊天 / 月"],["Pro","$10 / 月","无限补全，少量 Premium 额度"],["Pro+","$39 / 月","15× Pro Premium 额度"],["Max","$100 / 月","30× 额度 + $100 AI Credits"],["Business","$19 / 席 / 月","以官网为准"]],
    tags:["VS Code / JetBrains","Copilot Agent","模型自选","AI Credits 计量"],
    srcType:"official", srcLabel:"官方直采",
    srcUrl:"https://github.com/features/copilot/plans", srcNote:"github.com/features/copilot/plans · 2026-09-13",
    note:"Business/Enterprise 档价格未在抓取页直列，标注为常见价，以官网为准"
  },
  {
    name:"Cursor", region:"intl", vendor:"Anysphere", status:"ok",
    start:"$20 / 月（年付 $16）", startVal:20*RATE,
    models:"Composer + 前沿模型（Grok 等）",
    quota:"每档含固定模型用量额度，超出按量后付",
    ratio:null, ratioTier:"",
    periods:null, speed:null,
    pitfalls:"社区共识：$20 档对顶级模型（Claude/GPT）限额明显紧于 Claude Code/Codex；Ultra 近期也有「消耗变快」反馈；编辑器体验与 Tab 补全仍是长项。",
    tiers:[["Hobby","$0","有限 Agent 请求"],["Pro","$20 / 月","扩展 Agent 上限"],["Pro+","$60 / 月","约 3× Pro 用量"],["Ultra","$200 / 月","20× Pro Agent 上限"],["Teams","$40 / 席 / 月","含 $20/席用量"]],
    tags:["Agent 重度","Bugbot","云端 Agent","MCP / Skills"],
    srcType:"official", srcLabel:"官方直采",
    srcUrl:"https://cursor.com/pricing", srcNote:"cursor.com/pricing · 2026-09-13",
    note:"学生认证可免费用一年 Pro"
  },
  {
    name:"OpenCode Go", region:"intl", vendor:"OpenCode", status:"promo",
    start:"$10 / 月", startVal:10*RATE,
    models:"24 款：Grok 4.6 · GLM-5.3 · Kimi K3 · DeepSeek V4 等",
    quota:"5h $12 / 周 $30 / 月 $60 三重上限",
    ratio:6, ratioTier:"按月 $60 额度折算",
    periods:{h5:"$12（1.2×）",wk:"$30（3×）",mo:"$60（6×）"},
    speed:null,
    pitfalls:"额度按 API 价值折算而非不限量，重度使用可能不够；当前 4× 活动显著放大额度（至 9/20）。",
    tiers:[["Go","$10 / 月","全模型通吃"],["活动","4× 额度","V4.1 Flash 活动延至 2026-09-20"]],
    tags:["性价比之王","多模型轮换","限时 4× 额度"],
    srcType:"agg", srcLabel:"聚合参考 + 社区动态",
    srcUrl:"https://codingplan.org/", srcNote:"codingplan.org（2026-08-31）+ B站播报（2026-09-12）",
    note:"当前促销期内性价比突出；活动 9/20 结束"
  },
  {
    name:"GLM Coding Plan", region:"cn", vendor:"智谱 BigModel", status:"ok",
    start:"¥118 / 月（年付折合 ¥94.4）", startVal:118,
    models:"GLM-5.3 · GLM-5.3-Flash 全档可用",
    quota:"积分制：2,000–28,000 积分 / 5h，10K–140K / 周；非高峰积分 5 折",
    ratio:8.35, ratioTier:"Pro 档（旧版次数制口径）",
    periods:{h5:"90–450 次（0.24–0.39×）",wk:"600–3000 次（1.27–2.09×）",mo:"2400–12000 次（5.08–8.35×）"},
    speed:26.8,
    pitfalls:"社区反馈算力紧缺、429 频繁且高峰难抢；新版积分制 + 非高峰 5 折可缓解，愿错峰使用者体验更好。",
    tiers:[["Lite","¥118 / 月","年付 7 折低至 ¥94.4/月"],["Pro","¥538 / 月","更高积分池"],["Max","¥1,078 / 月","最高积分池"]],
    tags:["20+ 编程工具适配","Claude Code / Codex / ZCode","非高峰 5 折"],
    srcType:"official", srcLabel:"官方直采（转述）",
    srcUrl:"https://bigmodel.cn/glm-coding", srcNote:"bigmodel.cn/glm-coding + docs.bigmodel.cn · 2026-09-13",
    note:"2026-08 起改为 Token 积分制；老用户 Max 权益保留。三周期数据为旧版次数制口径"
  },
  {
    name:"Kimi For Coding", region:"cn", vendor:"月之暗面", status:"ok",
    start:"¥49 / 月（Andante）", startVal:49,
    models:"Kimi K3 · K3-256K · K2.7 · K2.7 Code",
    quota:"5 小时 Token 配额 / 7 天刷新；K3 1M 上下文",
    ratio:9.89, ratioTier:"Allegretto ¥199/月",
    periods:{h5:"359–1307 次（≈0.45×）",wk:"3570–9073 次（≈2.47×）",mo:"8400 万–14.28 亿 tokens（2.48–9.89×）"},
    speed:27.98,
    pitfalls:"社区反馈算力紧张、TPS 大降、kimi-k2.6 不稳定易死循环、429 频繁；¥49 Andante 档月倍率仅 2.48×，被评「毫无性价比」，建议 ¥199 起步。",
    tiers:[["Adagio","免费","体验档"],["Andante","¥49 / 月","入门"],["Moderato","¥99 / 月","进阶"],["Allegretto","¥199 / 月","重度"],["Allegro","¥699 / 月","顶配"]],
    tags:["音乐五档命名","1M 上下文","长任务友好"],
    srcType:"agg", srcLabel:"聚合参考",
    srcUrl:"https://codingplan.org/", srcNote:"codingplan.org（2026-08-31），以 platform.moonshot 官网为准",
    note:"档位多、梯度细，可按用量精确定档"
  },
  {
    name:"MiniMax Coding", region:"cn", vendor:"MiniMax", status:"ok",
    start:"¥49 / 月（Plus）", startVal:49,
    models:"MiniMax M3 · M2.7 · H3 · Speech 2.8",
    quota:"月度 Token 包：6 亿 – 71 亿+",
    ratio:88.65, ratioTier:"Plus ¥49/月（全表最高）",
    periods:{h5:"1360 次 / 6000 万 tokens（2.22×）",wk:"13600 次 / 6 亿（22.2×）",mo:"24 亿 tokens（88.65×）"},
    speed:52.6,
    pitfalls:"月倍率最高但 5h 周期倍率仅 2.22×——适合平稳节奏，不适合 5 小时爆发型使用；MiniMax 是社区公认的「Token Plan 例外」。",
    tiers:[["Plus","¥49 / 月","6 亿 Token/月"],["Max","¥119 / 月","18 亿 Token/月"],["Ultra","¥469 / 月","71 亿+ Token/月"]],
    tags:["月度大 Token 包","多模态语音","月倍率最高","52.6 TPS"],
    srcType:"agg", srcLabel:"聚合参考",
    srcUrl:"https://codingplan.org/", srcNote:"codingplan.org（2026-08-31），以官网为准",
    note:"按月 Token 计量，口径直观，适合批量脚本型任务"
  },
  {
    name:"阿里云百炼 Coding", region:"cn", vendor:"阿里云", status:"promo",
    start:"¥39 / 月（Lite）", startVal:39,
    models:"Qwen3.8-Max · qwen3.8-flash · DeepSeek-V4-Pro 等",
    quota:"2,500–40,000 Credits / 7 天",
    ratio:19.8, ratioTier:"旧 Lite ¥40 档口径（该档已下线）",
    periods:{mo:"6 亿 tokens（19.8×）"},
    speed:52.5,
    pitfalls:" awesome-coding-plan 记录旧 Lite ¥40 档已下线，现行为 ¥39 活动价档位，额度结构有调整，下单前以官网为准。",
    tiers:[["Lite","¥39 / 月","原价 ¥60"],["Standard","¥139 / 月","原价 ¥180"],["Pro","¥499 / 月","原价 ¥600"]],
    tags:["夜间 22–8 点五折","通义 + DeepSeek 双系"],
    srcType:"agg", srcLabel:"聚合参考",
    srcUrl:"https://codingplan.org/", srcNote:"codingplan.org（2026-08-31），以阿里云官网为准",
    note:"页面标价为限时活动价，原价见括号"
  },
  {
    name:"火山方舟 Coding", region:"cn", vendor:"火山引擎", status:"promo",
    start:"¥9.9 首购（Lite，刊例 ¥40）", startVal:9.9,
    models:"Doubao-Seed-2.1-turbo · GLM-5.3 · Auto 模式等 8+ 款",
    quota:"按订阅档位额度",
    ratio:15.18, ratioTier:"Lite ¥40 档月倍率",
    periods:{h5:"148 次 / 1000 万 tokens（0.48×）",wk:"1138 次 / 7500 万（3.65×）",mo:"6275 次 / 3.2 亿（15.18×）"},
    speed:86.6,
    pitfalls:"速度为全表最快（86.6 TPS，doubao-seed-2.0-pro 实测）；首购价便宜但续费恢复刊例，长期成本需按 ¥40/¥200 计算。",
    tiers:[["Lite","首购 ¥9.9","刊例 ¥40/月"],["Pro","首两月 ¥49.9","刊例 ¥200/月，活动至 11-08"]],
    tags:["首购超低价","Auto 模式","豆包系","86.6 TPS 最快"],
    srcType:"agg", srcLabel:"聚合参考",
    srcUrl:"https://codingplan.org/", srcNote:"codingplan.org（2026-08-31），以火山引擎官网为准",
    note:"首购价适合低成本尝鲜，续费恢复刊例价"
  },
  {
    name:"小米 MiMo Coding", region:"cn", vendor:"小米", status:"ok",
    start:"¥39 / 月（Lite）", startVal:39,
    models:"MiMo-V2.5-Pro · MiMo-V2.5 · MiMo 全模态 · TTS",
    quota:"492–9,840 亿 Credits / 年；夜间 0.8× 消耗",
    ratio:1.12, ratioTier:"Token Plan Pro ¥329 档",
    periods:{mo:"380 亿 Credits ≈ 13 亿 tokens（1.12×）"},
    speed:46.7,
    pitfalls:"Token Plan 型模式月倍率仅 1.12×，社区评价「性价比偏低」；优势在速度尚可（46.7 TPS）与全模态、小米生态。",
    tiers:[["Lite","¥39 / 月","入门"],["Standard","¥99 / 月","进阶"],["Pro","¥329 / 月","重度"],["Max","¥659 / 月","顶配"]],
    tags:["年额度包","夜间 0.8×","全模态"],
    srcType:"agg", srcLabel:"聚合参考",
    srcUrl:"https://codingplan.org/", srcNote:"codingplan.org（2026-08-31），以小米官网为准",
    note:"按年度 Credit 总量计，适合用量可预期的用户"
  },
  {
    name:"R4Coder", region:"intl", vendor:"—", status:"bad",
    start:"已停售", startVal:99999,
    models:"—",
    quota:"—",
    ratio:null, ratioTier:"",
    periods:null, speed:null,
    pitfalls:"算力不足关闭订阅渠道——「额度再差也比天天 429 强」的反面教材。",
    tiers:[["订阅渠道","已关闭","因算力不足停止新订阅"]],
    tags:["停售","不推荐新购","老用户可退款"],
    srcType:"agg", srcLabel:"社区情报",
    srcUrl:"https://www.bilibili.com/video/BV1xtYR6EE72/", srcNote:"B站播报（2026-09-12）",
    note:"已订阅用户若觉得模型速度慢可申请退款"
  }
];

// ===== 订阅 vs API 成本计算器的候选（月额度为 awesome-coding-plan 折算口径）=====
const CALC_PLANS = [
  {name:"MiniMax Plus", price:49, quota:2.4e9, note:"24 亿 tokens/月（社区折算）"},
  {name:"Claude Pro", price:20*RATE, quota:1.59e9, note:"≈15.9 亿 tokens/月（社区折算）"},
  {name:"Kimi Allegretto", price:199, quota:1.428e9, note:"14.28 亿 tokens/月"},
  {name:"火山 Lite（刊例）", price:40, quota:3.2e8, note:"3.2 亿 tokens/月"},
  {name:"ChatGPT Plus", price:20*RATE, quota:6.16e8, note:"≈6.16 亿 tokens/月（社区折算）"},
  {name:"Kimi Andante", price:49, quota:8.4e7, note:"8400 万 tokens/月"},
  {name:"OpenCode Go", price:10*RATE, quota:null, note:"月 $60 API 额度"},
  {name:"Cursor Pro", price:20*RATE, quota:null, note:"$20 模型用量 + 后付"}
];
// 计算器用 API 模型（优先从实时数据匹配，失败用内置价）
const CALC_MODELS = [
  {pid:"deepseek", match:"V4 Flash", label:"DeepSeek V4 Flash（经济档）", fIn:0.15, fOut:0.6},
  {pid:"zhipuai", match:"GLM-5.3", label:"GLM-5.3（中档）", fIn:1.4, fOut:4.4},
  {pid:"anthropic", match:"Claude Sonnet 5", label:"Claude Sonnet 5（高档）", fIn:2, fOut:10}
];

// ===== IDE / 编辑器订阅扩展榜（来源：awesome-coding-plan IDE 表，2026-09-13）=====
const IDE_PLANS = [
  {name:"GitHub Copilot Pro", price:"$10 / 月", ratio:"1.5×", note:"$15 月度 credits；无限补全", hl:false},
  {name:"Trae Pro", price:"$10 / 月", ratio:">2×", note:"$20 基础用量 + 随机赠送（有用户获 $130）；7 天试用", hl:true},
  {name:"Zed Pro", price:"$10 / 月", ratio:"0.5×", note:"含 $5 tokens；编辑器极简流派", hl:false},
  {name:"CodeBuddy 个人专业版", price:"¥59 / 月", ratio:"—", note:"2000 Credits/月，限时加赠 2000", hl:false},
  {name:"Cursor Pro", price:"$20 / 月", ratio:"≈1×", note:"$20 API 用量；Auto/Composer 更省", hl:false},
  {name:"Windsurf Pro", price:"$20 / 月", ratio:"—", note:"每天 8–101 条 Premium 消息；SWE-1.5 无限；2 周试用", hl:false},
  {name:"Kiro Pro", price:"$20 / 月", ratio:"2×", note:"1000 credits，超量 $0.04/credit；⚠ 首月免费资格退出付款页即失效", hl:false},
  {name:"Factory Droid Pro", price:"$20 / 月", ratio:"≈2.4×", note:"2000 万 Standard Tokens", hl:false},
  {name:"Augment Code INDIE", price:"$20 / 月", ratio:"1.25×", note:"4 万 credits（价值 $25）", hl:false},
  {name:"Qoder Pro", price:"$20 / 月", ratio:"—", note:"2000 Credits/月", hl:false},
  {name:"Google AI Pro", price:"$19.99 / 月", ratio:"—", note:"Antigravity + 1000 AI credits/月；Ultra $249.99 为 25000", hl:false},
  {name:"Kilo Pass Starter", price:"$19 / 月", ratio:"1.4×", note:"最高 40% 赠送 credits", hl:false}
];

// ===== 本站变更记录 =====
const CHANGELOG = [
  {date:"2026-09-13", v:"v4", text:"上线每日自动巡检：GitHub Actions 每天 09:00（北京时间）重新生成 models.dev 兜底快照 + 5 个官方定价页哈希变动检测，变动自动挂「待核实」横幅并开 issue 提醒人工核价。"},
  {date:"2026-09-13", v:"v3", text:"新增：订阅 vs API 成本计算器、IDE 订阅扩展榜、三周期（5h/周/月）额度倍率、TPS 速度参考、各平台坑点提示（社区反馈）。数据方法与坑点来源：awesome-coding-plan（2857★，2026-09-01 更新）+ Reddit 限额讨论汇总。"},
  {date:"2026-09-13", v:"v2", text:"新增：Token 实时价格榜（models.dev 直连 + 兜底快照）、额度倍率列、同类 GitHub 项目板块；重构为多文件结构。"},
  {date:"2026-09-13", v:"v1", text:"初版上线：11 平台 33 档对比、市场动态（B站播报 9/12）、FAQ 与数据来源分级。"}
];

// ===== 同类 GitHub 项目 =====
const GH_REPOS = [
  {name:"mahonzhan/awesome-coding-plan", desc:"各厂家 Coding Plan 实际价值对比：额度价值 / 三周期额度倍率 / TPS 实测 / IDE Plan 表 / 能力测试。本站倍率、速度与坑点数据的方法论来源（2857★，2026-09-01 更新）", stars:"活跃维护 · 2857★", url:"https://github.com/mahonzhan/awesome-coding-plan", tag:"方法论 + 数据"},
  {name:"sst/models.dev", desc:"开源模型数据库，含 800+ 供应商、每百万 Token 的 API 价格、上下文窗口；本站「Token 实时价格榜」的数据源", stars:"实时更新", url:"https://github.com/sst/models.dev", tag:"实时数据源"},
  {name:"wmpeng/codingplan", desc:"国内主流 AI 平台 Coding Plan 对比（智谱 / Kimi / MiniMax 等），覆盖 Agent 高强度编码场景", stars:"社区维护", url:"https://github.com/wmpeng/codingplan", tag:"参考"},
  {name:"berriai/litellm", desc:"LLM 网关，其 model_prices_and_context_window.json 是业界常用的模型价格实时数据源（3900+ 模型），可作 models.dev 的交叉校验源", stars:"42k+ stars 生态", url:"https://raw.githubusercontent.com/berriai/litellm/main/model_prices_and_context_window.json", tag:"备用数据源"}
];
