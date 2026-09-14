// 每日任务④：结构性数据差异检测（价格 / 免费模型）
//   1. models.dev  —— 第一方 API 刊例价变动（与 js/snapshot.js 同源）
//   2. OpenRouter  —— :free 免费模型的新增与消失（白嫖板块的自动数据来源）
//   3. LiteLLM     —— 只做健康检查与参考基线，不产生告警（理由见文件内注释）
// 首次运行只落基线、不发信号，避免一天内灌入上百条噪声。
import { readJSON, writeJSON, fetchText, hash16, today, loadHealth, recordHealth, saveHealth, isDead, FAIL_THRESHOLD } from "./lib.mjs";

const WATCH_MARKERS = ["claude-sonnet", "claude-opus", "gpt-5", "glm-5", "deepseek-v4", "kimi-k", "qwen3"];

// 第一方 API 价供应商（与 js/app.js 的 OFFICIAL_PROVIDERS 保持一致）
const WATCHED = ["anthropic", "openai", "google", "xai", "zhipuai", "zai", "moonshotai", "minimax", "deepseek", "volcengine", "xiaomi", "alibaba"];

const sources = readJSON("data/sources.json", {});
const apis = (sources.apis || []).filter((a) => a.type === "api" && a.pipeline === "diff" && a.enabled !== false);
const byIdSrc = Object.fromEntries(apis.map((a) => [a.id, a]));

const base = readJSON("data/pricebase.json", null);
const store = readJSON("data/signals.json", { generatedAt: null, items: [] });
const health = loadHealth();
const d = today();

const byId = new Map(store.items.map((i) => [i.id, i]));
const next = { modelsdev: {}, openrouterFree: [], litellm: {} };
let added = 0;
const failed = [];
const firstRun = !base;

const addSignal = (src, kind, title, { url = "", excerpt = "" } = {}) => {
  const id = `${src.id}:${hash16(kind + title)}`;
  if (byId.has(id)) {
    byId.get(id).lastSeen = d;
    return false;
  }
  byId.set(id, {
    id, source: src.id, sourceLabel: src.label, sourceUrl: src.url, tier: src.tier,
    kind, title, excerpt, url: url || src.url, date: d, firstSeen: d, lastSeen: d,
  });
  added++;
  return true;
};

const num = (v) => (Number.isFinite(+v) ? +v : null);

/* ---------- 1) models.dev 价格变动 ---------- */
{
  const src = byIdSrc.modelsdev;
  if (src) {
    let status = null;
    try {
      const r = await fetchText(src.url);
      status = r.status;
      const api = JSON.parse(r.text);
      let n = 0;
      for (const pid of WATCHED) {
        const pv = api[pid];
        if (!pv) continue;
        for (const m of Object.values(pv.models || {})) {
          const out = num((m.cost || {}).output);
          if (out === null || out <= 0) continue;
          const key = `${pid}|${m.id}`;
          next.modelsdev[key] = out;
          n++;
        }
      }
      recordHealth(health, src, { ok: true, status, detail: `${n} 款模型纳入基线` });

      if (!firstRun) {
        for (const [key, out] of Object.entries(next.modelsdev)) {
          const old = base.modelsdev?.[key];
          if (old === undefined || old === out) continue;
          const [pid, id] = key.split("|");
          addSignal(src, "price-change", `${id} 输出价 ${old} → ${out} $/M（${pid}）`, {
            url: `https://models.dev/${pid}/${id}`,
            excerpt: `models.dev 刊例输出价由 $${old} 变为 $${out} 每百万 token。请人工确认后决定是否更新站内数据。`,
          });
        }
        for (const key of Object.keys(base.modelsdev || {})) {
          if (next.modelsdev[key] === undefined) {
            const [pid, id] = key.split("|");
            addSignal(src, "price-change", `${id} 已从 models.dev 下架（${pid}）`, {
              excerpt: "该模型上一版基线中存在，本次抓取已消失，可能已下线或改名。",
            });
          }
        }
      }
      console.log(`· models.dev: 基线 ${n} 款，${firstRun ? "首跑记录基线（不发信号）" : `价格变动信号 +${added}`}`);
    } catch (e) {
      failed.push({ id: src.id, error: e.message });
      recordHealth(health, src, { ok: false, status, error: e.message });
      console.log(`✗ FAILED ${src.id} — ${e.message}`);
    }
  }
}

/* ---------- 2) OpenRouter 免费模型增删 ---------- */
{
  const src = byIdSrc.openrouter;
  const before = added;
  if (src) {
    let status = null;
    try {
      const r = await fetchText(src.url);
      status = r.status;
      const j = JSON.parse(r.text);
      next.openrouterFree = (j.data || [])
        .map((m) => m.id)
        .filter((id) => typeof id === "string" && id.endsWith(":free"))
        .sort();
      recordHealth(health, src, { ok: true, status, detail: `${next.openrouterFree.length} 个免费模型` });

      if (!firstRun) {
        const oldSet = new Set(base.openrouterFree || []);
        const newSet = new Set(next.openrouterFree);
        for (const id of next.openrouterFree) {
          if (!oldSet.has(id))
            addSignal(src, "free-model-new", `OpenRouter 新增免费模型：${id}`, {
              url: "https://openrouter.ai/models?max_price=0",
              excerpt: "可作为白嫖/零成本验证模型的候选，额度与限速以 OpenRouter 页面为准。",
            });
        }
        for (const id of oldSet) {
          if (!newSet.has(id))
            addSignal(src, "free-model-gone", `OpenRouter 免费模型下架：${id}`, {
              url: "https://openrouter.ai/models?max_price=0",
              excerpt: "该免费模型已从 OpenRouter 模型中消失，站内白嫖板块如有收录需同步下架。",
            });
        }
      }
      console.log(`· OpenRouter: ${next.openrouterFree.length} 个免费模型，新增信号 ${added - before}`);
    } catch (e) {
      failed.push({ id: src.id, error: e.message });
      recordHealth(health, src, { ok: false, status, error: e.message });
      console.log(`✗ FAILED ${src.id} — ${e.message}`);
    }
  }
}

/* ---------- 3) LiteLLM：仅作健康检查与参考基线，不产生告警 ---------- */
// 为什么不做"价格分歧告警"（2026-09-14 实测）：按模型名后缀匹配会把不同 SKU 配到一起，
// 例如 litellm 的 azure/gpt-5.6（Azure 转售价 $30）会撞上 models.dev 的第一方 openai/gpt-5.6（$20），
// 首个真实 CI 运行一次就产生了 146 条"分歧"假信号，把真正的线索全部淹没。
// 因此这里只抓取、只记录基线（供人工比对参考），不再自动报警。
{
  const src = byIdSrc.litellm;
  if (src) {
    let status = null;
    try {
      const r = await fetchText(src.url, { timeout: 40000 });
      status = r.status;
      const j = JSON.parse(r.text);
      for (const [key, v] of Object.entries(j)) {
        if (key === "sample_spec" || !v || typeof v !== "object") continue;
        const lower = key.toLowerCase();
        if (!WATCH_MARKERS.some((m) => lower.includes(m))) continue;
        const out = num(v.output_cost_per_token);
        if (out === null || out <= 0) continue;
        next.litellm[key] = +(out * 1e6).toFixed(4);
      }
      recordHealth(health, src, {
        ok: true,
        status,
        detail: `${Object.keys(next.litellm).length} 款关注模型（仅作参考基线，不告警）`,
      });
      console.log(`· LiteLLM: ${Object.keys(next.litellm).length} 款关注模型记入参考基线（按设计不产生告警）`);
    } catch (e) {
      failed.push({ id: src.id, error: e.message });
      recordHealth(health, src, { ok: false, status, error: e.message });
      console.log(`✗ FAILED ${src.id} — ${e.message}`);
    }
  }
}

/* ---------- 落盘 ---------- */
// 基线只在抓取成功时更新，避免一次失败把好基线清空
if (firstRun) {
  writeJSON("data/pricebase.json", { updatedAt: d, ...next });
  console.log("· 首跑：已写入 data/pricebase.json 基线");
} else {
  const merged = {
    updatedAt: d,
    modelsdev: Object.keys(next.modelsdev).length ? next.modelsdev : base.modelsdev || {},
    openrouterFree: next.openrouterFree.length ? next.openrouterFree : base.openrouterFree || [],
    litellm: Object.keys(next.litellm).length ? next.litellm : base.litellm || {},
  };
  writeJSON("data/pricebase.json", merged);
}

const keep = [];
for (const it of byId.values()) {
  const age = (Date.now() - Date.parse(it.firstSeen)) / 86400000;
  if (Number.isNaN(age) || age <= 90) keep.push(it);
}
keep.sort((a, b) => String(b.firstSeen).localeCompare(String(a.firstSeen)) || String(a.source).localeCompare(String(b.source)));
writeJSON("data/signals.json", { generatedAt: d, items: keep.slice(0, 600) });
saveHealth(health, sources);

const dead = Object.values(health.sources).filter(isDead);
if (dead.length) console.log(`\n⚠ 已失效源（连续失败 ≥${FAIL_THRESHOLD} 天）：${dead.map((x) => x.label).join("、")}`);
console.log(`\n总结：差异检测源 ${apis.length} 个 · 新增信号 ${added} 条 · 抓取失败 ${failed.length}（${failed.map((x) => x.id).join(",") || "无"}）`);
