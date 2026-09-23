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
    srcType:"agg", srcLabel:"聚合参考",
    srcUrl:"https://codingplan.org/", srcNote:"codingplan.org（2026-08-31）；4× 活动原始出处为社区视频、已从本站移除，正由官方渠道重新确认",
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
    srcType:"agg", srcLabel:"社区情报（待重新核实）",
    srcUrl:"https://codingplan.org/", srcNote:"停售信息原始出处为社区视频、已从本站移除；未找到可核验的官方公告，标注待重新核实",
    note:"已订阅用户若觉得模型速度慢可申请退款"
  },
  {
    name:"DeepSeek API", region:"cn", vendor:"DeepSeek", status:"ok",
    start:"按量计费（无固定月费）", startVal:0,
    models:"DeepSeek-V4-Pro · DeepSeek-V4-Flash · DeepSeek-V3.2 · DeepSeek-R1",
    quota:"纯 API 按量计费，无订阅套餐；Token Plan 用户可通过第三方平台接入",
    ratio:null, ratioTier:"",
    periods:null, speed:null,
    pitfalls:"无官方 Coding Plan 订阅，纯 API 按量；对高频编码场景需自行估算成本。第三方 Token Plan（如百度千帆、腾讯云）已接入 DeepSeek 模型。",
    tiers:[["API 按量","¥0–按需","输入 ¥1–12 / 百万 tokens，输出 ¥2–24 / 百万 tokens"]],
    tags:["API 按量","无订阅","高性价比","第三方 Token Plan 可接入"],
    srcType:"official", srcLabel:"官方直采",
    srcUrl:"https://api-docs.deepseek.com/quick_start/pricing",
    srcNote:"api-docs.deepseek.com · 2026-09-23 采集；无固定月费订阅，仅 API 按量",
    note:"DeepSeek 官方暂未推出固定月费订阅制，表中价格为 API 按量参考价"
  },
  {
    name:"百度千帆 Token Plan", region:"cn", vendor:"百度", status:"ok",
    start:"¥9.9 / 月（Mini 首购）", startVal:9.9,
    models:"GLM-5.3 · GLM-5.2 · DeepSeek-V4-Pro · DeepSeek-V4-Flash · ERNIE 5.1 · ERNIE 4.5 Turbo · Kimi-K2.6",
    quota:"双轨制：Token 制（1:1 抵扣，不区分模型）+ 积分制（按模型系数折算）；首购五折、续费六折",
    ratio:null, ratioTier:"",
    periods:null, speed:null,
    pitfalls:"双轨制复杂：Token 制对旗舰模型更划算（1:1 抵扣），积分制对 Flash 模型更省；梯度折扣仅明确覆盖 GLM-5.2 与 DeepSeek-V4-Pro-0813，GLM-5.3 是否同享需控制台确认。",
    tiers:[["Mini","首购 ¥4.9 / 原价 ¥9.9","1400 积分 / 1000 万 Token"],["Lite","首购 ¥19.9 / 原价 ¥40","6600 积分 / 4200 万 Token"],["Pro","首购 ¥99.9 / 原价 ¥200","45000 积分 / 2.3 亿 Token"],["Max","首购 ¥299.9 / 原价 ¥600","165000 积分 / 7 亿 Token"]],
    tags:["双轨制","首购五折","续费六折","工作日 2 折 / 夜间 0.5 折 / 周末 1 折"],
    srcType:"official", srcLabel:"官方直采（转述）",
    srcUrl:"https://cloud.baidu.com/doc/WENXINWORKSHOP/s/Blfmc9dlf",
    srcNote:"IT之家官方报道 + CSDN 引用千帆官方文档 · 2026-09-23 采集；折扣与 GLM-5.3 覆盖范围需人工复核",
    note:"双轨制并存：Token 制 1:1 抵扣适合旗舰模型，积分制适合 Flash 模型；梯度折扣时段以控制台实际展示为准"
  },
  {
    name:"讯飞星辰 Token Plan", region:"cn", vendor:"科大讯飞", status:"ok",
    start:"¥200 / 月（标准成员）", startVal:200,
    models:"Spark-X2.5 · Spark-X2-Flash · GLM-5.2 · DeepSeek-V4-Pro · DeepSeek-V4-Flash · Kimi-K2.6",
    quota:"积分制：标准 20000 积分 / 高级 60000 积分 / 尊享 200000 积分；支持 OpenAI + Anthropic 双协议",
    ratio:null, ratioTier:"",
    periods:null, speed:null,
    pitfalls:"企业级定位，单价高于个人平台；限时折扣（6–8 折）已过期，当前按原价计费；高峰期权益到账可能有 1–3 分钟延迟。",
    tiers:[["标准成员","¥200 / 月","20000 积分 / 月，TPM 200w"],["高级成员","¥600 / 月","60000 积分 / 月，TPM 300w"],["尊享成员","¥2000 / 月","200000 积分 / 月，TPM 500w"]],
    tags:["企业级","双协议接入","错峰 0.8 折","国产算力"],
    srcType:"official", srcLabel:"官方直采",
    srcUrl:"https://www.xfyun.cn/doc/spark/TokenPlan.html",
    srcNote:"xfyun.cn 官方 Token Plan 文档 · 2026-09-23 采集；限时折扣状态需人工复核",
    note:"企业/团队订阅制，按成员计费；支持 Cursor、Claude Code、OpenCode 等工具配置"
  },
  {
    name:"腾讯云 Token Plan", region:"cn", vendor:"腾讯云", status:"ok",
    start:"$7 / 月（Lite）", startVal:7*RATE,
    models:"GLM-5.3-Flash · GLM-5.2 · Kimi K3 · Kimi-K2.6 · DeepSeek-V4-Flash · MiniMax-M3",
    quota:"积分制：Lite 1000 / Standard 2600 / Pro 7900 / Max 15900 credits / 月；自动路由最优模型",
    ratio:null, ratioTier:"",
    periods:null, speed:null,
    pitfalls:"仅新加坡区域可用；Credits 按月清零不结转；每个根账号只能购买一个计划；不支持降级。",
    tiers:[["Lite","$7 / 月","1000 credits / 月"],["Standard","$17 / 月","2600 credits / 月"],["Pro","$51 / 月","7900 credits / 月"],["Max","$103 / 月","15900 credits / 月"]],
    tags:["多模型切换","自动路由","国际版","新加坡区域"],
    srcType:"official", srcLabel:"官方直采",
    srcUrl:"https://www.tencentcloud.com/document/product/1300/81315",
    srcNote:"tencentcloud.com 官方 Token Plan 文档 · 2026-09-23 采集",
    note:"支持 OpenClaw、Claude Code、Cursor、Cline 等主流工具；Credits 不结转、不可退款"
  },
  {
    name:"Gemini API", region:"intl", vendor:"Google", status:"ok",
    start:"按量计费（无固定月费）", startVal:0,
    models:"Gemini 3.8 Flash · Gemini 3.8 Pro · Gemini 3.8 Ultra · Gemini 3.8 Nano",
    quota:"纯 API 按量计费；Google AI Pro $19.99/月含 1000 AI credits（非 Token 订阅）",
    ratio:null, ratioTier:"",
    periods:null, speed:null,
    pitfalls:"无传统 Coding Plan 订阅；Gemini 3.8 Flash 输入 $0.75/百万、输出 $3.75/百万（2026-12-31 前促销价，2027-01-01 起翻倍）；Google AI Pro 的 credits 与 API 按量体系不同。",
    tiers:[["API 按量","$0–按需","Flash 输入 $0.75/M 输出 $3.75/M；Pro 输入 $1.35/M 输出 $6.75/M"],["Google AI Pro","$19.99 / 月","1000 AI credits + Antigravity；Ultra $249.99/月"]],
    tags:["API 按量","长上下文","Google 生态","促销价限时"],
    srcType:"official", srcLabel:"官方直采",
    srcUrl:"https://ai.google.dev/gemini-api/docs/pricing",
    srcNote:"ai.google.dev 官方定价页 · 2026-09-23 采集；2026-12-31 前为促销价",
    note:"Gemini 无固定月费 Token Plan，API 按量为主；Google AI Pro 为 credits 体系，非 Token 订阅"
  },
  {
    name:"TRAE", region:"intl", vendor:"字节跳动", status:"ok",
    start:"$3 / 月（Lite）", startVal:3*RATE,
    models:"GPT-4.1 · Gemini-2.5-Pro · DeepSeek-V3 · DeepSeek-R1 · GLM-5.2 等",
    quota:"Token 按量计费；含月度 Dollar Usage：Lite $5 / Pro $20 / Pro+ $90 / Ultra $400",
    ratio:null, ratioTier:"",
    periods:null, speed:null,
    pitfalls:"2026-02 起改为 Token 积分制（原 Fast Request 制）；国际版与国内版（trae.com.cn）计费体系不同，国内版为积分制。Free 档限 5000 次补全/月。",
    tiers:[["Free","$0","5000 次补全/月；有限 AI 用量"],["Lite","$3 / 月","$5 Basic Usage"],["Pro","$10 / 月","$20 Basic Usage；全模型 + SOLO 模式"],["Pro+","$30 / 月","$90 Basic Usage"],["Ultra","$100 / 月","$400 Basic Usage；新模型优先体验"]],
    tags:["AI IDE","SOLO 模式","Token 计费","字节系"],
    srcType:"official", srcLabel:"官方直采",
    srcUrl:"https://docs.trae.ai/ide/new-plans-and-billing",
    srcNote:"docs.trae.ai 官方定价文档 · 2026-09-23 采集；国内版 pricing 见 trae.com.cn",
    note:"国际版与国内版定价不同；Pro 档含 $20 usage，月费 $10，对标 Cursor Pro"
  },
  {
    name:"Devin", region:"intl", vendor:"Cognition Labs", status:"ok",
    start:"$20 / 月（Pro）", startVal:20*RATE,
    models:"SWE-2 · GPT 系列 · Claude · Gemini · SpaceXAI 等",
    quota:"按消息/任务计费；Pro 含更高额度，Max 显著更高；超出按 API 价购买",
    ratio:null, ratioTier:"",
    periods:null, speed:null,
    pitfalls:"原 Windsurf 产品已并入 Devin 品牌；Devin Cloud 为云端 Agent，Devin Desktop 为本地 IDE。Free 档模型可用性受限。",
    tiers:[["Free","$0","轻量 Agent 额度；无限 inline edit / Tab 补全"],["Pro","$20 / 月","全模型；Devin Cloud 访问；可按 API 价购买额外用量"],["Max","$200 / 月","显著更高额度"],["Team","$80 + $40/席 / 月","协作 + 管理后台"],["Enterprise","定制","SAML/SSO + 专属部署"]],
    tags:["AI 软件工程师","SWE-2","Devin Cloud","原 Windsurf"],
    srcType:"official", srcLabel:"官方直采",
    srcUrl:"https://devin.ai/pricing",
    srcNote:"devin.ai/pricing · 2026-09-23 采集",
    note:"SWE-2 Free 在 Desktop/CLI 限时免费至 2026-10-10"
  },
  {
    name:"Poe", region:"intl", vendor:"Quora", status:"ok",
    start:"$19.99 / 月（Subscriber）", startVal:19.99*RATE,
    models:"Claude 3 · GPT-4 · Gemini · 自定义 Bot 等",
    quota:"Subscriber 档无限消息；Free 档每日有限条数",
    ratio:null, ratioTier:"",
    periods:null, speed:null,
    pitfalls:"非专门 Coding IDE，为 AI 聊天聚合平台；编程场景需自建 Bot。Annual 档 $199.99/年折合 $16.67/月。",
    tiers:[["Free","$0","每日有限消息；免费 Bot"],["Subscriber","$19.99 / 月","无限消息；全模型访问"],["Annual","$199.99 / 年","折合 $16.67/月；优先支持"]],
    tags:["AI 聚合平台","多模型","自定义 Bot","非 IDE"],
    srcType:"agg", srcLabel:"聚合参考（官方页待复核）",
    srcUrl:"https://poe.com/pricing",
    srcNote:"toolradar.com 聚合自 poe.com 官方页（2026-09-01 验证），需人工复核官方定价页",
    note:"编程场景可通过自定义 Bot 接入 Claude/GPT，但非专门 Coding Plan"
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
  {pid:"anthropic", match:"Claude Sonnet 5", label:"Claude Sonnet 5（高档）", fIn:2, fOut:10},
  {pid:"baidu", match:"ERNIE", label:"百度千帆 ERNIE 5.1（国产旗舰）", fIn:4, fOut:18},
  {pid:"tencent", match:"GLM-5.3-Flash", label:"腾讯云 GLM-5.3-Flash（经济档）", fIn:0.8, fOut:2.8},
  {pid:"iflytek", match:"Spark-X2.5", label:"讯飞星火 X2.5（国产旗舰）", fIn:1.6, fOut:6},
  {pid:"google", match:"Gemini 3.8 Flash", label:"Gemini 3.8 Flash（经济档）", fIn:0.75, fOut:3.75}
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
  {date:"2026-09-14", v:"v5", text:"信息源机制重构：① 移除 B站播报来源，改由官方 changelog / 状态页 RSS + 公开社区订阅源（LINUX DO / V2EX / HN）+ 官方文档页哈希巡检组成的多源管道；② 新增「白嫖 / 免费额度」板块（含官方免费档、学生包、免费 API 额度、限时试用）；③ 修复 2 个静默失效的监控点——OpenAI 定价页实测对机器人返回 403 Cloudflare、原 Copilot 监控页连接失败，前者改为只抓 news RSS 并人工核价，后者换用 docs.github.com 官方文档页；④ 新增「信息源健康」看板，每源抓取成败公开可见，连续 3 天失败标注为已失效；⑤ 新增「自动发现的线索」队列，机器发现与人工确认严格分离，社区情报固定黄色标注、不进价格表。"},
  {date:"2026-09-13", v:"v4", text:"上线每日自动巡检：GitHub Actions 每天 09:00（北京时间）重新生成 models.dev 兜底快照 + 官方定价页哈希变动检测，变动自动挂「待核实」横幅并开 issue 提醒人工核价。"},
  {date:"2026-09-13", v:"v3", text:"新增：订阅 vs API 成本计算器、IDE 订阅扩展榜、三周期（5h/周/月）额度倍率、TPS 速度参考、各平台坑点提示（社区反馈）。数据方法与坑点来源：awesome-coding-plan（2857★，2026-09-01 更新）+ Reddit 限额讨论汇总。"},
  {date:"2026-09-13", v:"v2", text:"新增：Token 实时价格榜（models.dev 直连 + 兜底快照）、额度倍率列、同类 GitHub 项目板块；重构为多文件结构。"},
  {date:"2026-09-13", v:"v1", text:"初版上线：11 平台 33 档对比、市场动态（B站播报 9/12）、FAQ 与数据来源分级。"}
];

// ===== 同类 GitHub 项目 =====
const GH_REPOS = [
  {name:"mahonzhan/awesome-coding-plan", desc:"各厂家 Coding Plan 实际价值对比：额度价值 / 三周期额度倍率 / TPS 实测 / IDE Plan 表 / 能力测试。本站倍率、速度与坑点数据的方法论来源（2857★，2026-09-01 更新）", stars:"活跃维护 · 2857★", url:"https://github.com/mahonzhan/awesome-coding-plan", tag:"方法论 + 数据"},
  {name:"sst/models.dev", desc:"开源模型数据库，含 800+ 供应商、每百万 Token 的 API 价格、上下文窗口；本站「Token 实时价格榜」的数据源", stars:"实时更新", url:"https://github.com/sst/models.dev", tag:"实时数据源"},
  {name:"wmpeng/codingplan", desc:"国内主流 AI 平台 Coding Plan 对比（智谱 / Kimi / MiniMax 等），覆盖 Agent 高强度编码场景", stars:"社区维护", url:"https://github.com/wmpeng/codingplan", tag:"参考"},
  {name:"berriai/litellm", desc:"LLM 网关，其 model_prices_and_context_window.json 是业界常用的模型价格实时数据源（3900+ 模型），可作 models.dev 的交叉校验源", stars:"42k+ stars 生态", url:"https://raw.githubusercontent.com/berriai/litellm/main/model_prices_and_context_window.json", tag:"备用数据源"},
  {name:"mnfst/awesome-free-llm-apis", desc:"「永久免费」LLM API 清单，本站「白嫖 / 免费额度」板块的参考来源之一；仓库 README 的提交变更被用作免费额度变动的事件流", stars:"7601★ · CC0", url:"https://github.com/mnfst/awesome-free-llm-apis", tag:"白嫖参考"},
  {name:"open-free-llm-api/awesome-freellm-apis", desc:"134+ 免费 API 汇总，含 Claude Code / Cursor / Codex 的一键配置思路，更新频繁（MIT 许可，可安全引用）", stars:"2985★ · 活跃更新", url:"https://github.com/open-free-llm-api/awesome-freellm-apis", tag:"白嫖参考"}
];

// 条件导出，供 Node.js 每日巡检脚本读取价格数据（不影响浏览器端）
if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.versions && globalThis.process.versions.node) {
  globalThis._CP_EXPORT = { RATE, PLAN_DATA, CALC_PLANS, CALC_MODELS, IDE_PLANS, CHANGELOG, GH_REPOS };
}
