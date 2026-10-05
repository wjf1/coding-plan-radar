// 每日任务①：从 models.dev 重新生成 data/auto/snapshot.json（兜底快照，与线上实时数据同源）
// 由 .github/workflows/daily-update.yml 每天调度，也可手动运行：node scripts/update-snapshot.mjs
import { writeJSON } from "./lib.mjs";

const PROV = {
  anthropic:"Anthropic", openai:"OpenAI", google:"Google", zhipuai:"智谱", zai:"Z.ai",
  moonshotai:"月之暗面", minimax:"MiniMax", deepseek:"DeepSeek", volcengine:"火山引擎",
  xiaomi:"小米", alibaba:"阿里云"
};
// 只保留编码相关模型（名称关键词过滤），排除图像/语音输出
const KW = ["claude sonnet","claude opus","claude fable","claude haiku","gpt-5","glm-","kimi k","k2.7",
            "minimax-m","deepseek v4","gemini-3","grok 4","doubao-seed-2","qwen3","mimo-v2"];
const OUT_PRICE_CAP = 60;

const api = await (await fetch("https://models.dev/api.json")).json();
const rows = [];
for (const [pid, label] of Object.entries(PROV)) {
  const pv = api[pid];
  if (!pv) continue;
  for (const m of Object.values(pv.models || {})) {
    const c = m.cost || {};
    if (!c.output || c.output <= 0 || c.output > OUT_PRICE_CAP) continue;
    const nm = (m.name || m.id).toLowerCase();
    if (!KW.some(k => nm.includes(k))) continue;
    const mod = m.modalities || {};
    if (mod.output && !mod.output.includes("text")) continue;
    rows.push({ p:label, pid, id:m.id, n:m.name || m.id, i:c.input || 0, o:c.output,
                c:(m.limit || {}).context || 0, t:!!m.tool_call, r:!!m.reasoning });
  }
}
// 去重（同供应商同名同价）并按输出价升序
const seen = new Set();
const uniq = rows
  .sort((a,b) => (a.pid+a.n).localeCompare(b.pid+b.n) || b.o - a.o)
  .filter(r => { const k = r.p+r.n+r.o; if (seen.has(k)) return false; seen.add(k); return true; })
  .sort((a,b) => a.o - b.o);

const today = new Date().toISOString().slice(0,10);

// 快照是「models.dev 拉取失败时」的唯一兜底。它自己坏了，等于全站没有任何降级能力，
// 而且坏了不会报错——页面只会安静地少掉一批模型。所以先校验再落盘：
// 字段不完整或整体为空时直接抛错，宁可当天不更新快照，也不要把坏快照写进仓库。
function validateSnapshot(models){
  if(!Array.isArray(models)) throw new Error("快照必须是数组");
  if(!models.length) throw new Error("快照为空（models.dev 可能改版，或返回了空数据）");
  for(const m of models){
    if(!m || !m.pid || !m.id || !m.n || !Number.isFinite(m.i) || !Number.isFinite(m.o))
      throw new Error(`快照条目字段不完整：${JSON.stringify(m).slice(0,120)}`);
  }
  return models;
}

writeJSON("data/auto/snapshot.json", {
  generatedAt: today,
  source: "https://models.dev/api.json",
  models: validateSnapshot(uniq),
});
console.log(`snapshot: ${uniq.length} models, date ${today}`);
