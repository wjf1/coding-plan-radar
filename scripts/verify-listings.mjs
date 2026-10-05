// 每日任务⑤：白嫖/免费额度来源页自动核对 + 促销条目自动过期归档
// 背景（2026-09-30）：freebies.json 此前为纯手工维护（checked 长期不动），promos.json 里
// 过期促销（如 OpenCode Go 活动截止 9/20）会一直挂着「促销中」。本脚本让两块界面随巡检动态更新：
//   ① freebies：逐条抓取来源页 → 正常 / 特征变化 / 连续失败三种状态写回条目；
//      JS 渲染空壳等不可自动核对的条目标 autoCheck:false，如实显示「需人工核对」，不做假巡检。
//   ② promos：promo 类条目 expires 已过 → 标 expired:true（前端显示「已结束」，不删历史记录）。
// 反爬特征检测沿用 check-pages 的思路，但去掉 "cloudflare"/"Ray ID" 这类宽泛特征——
// developers.cloudflare.com 等正常官方文档页本身就含这些词，避免误判。
import { readJSON, writeJSON, fetchText, stripTags, today, loadHealth, recordHealth, saveHealth, FAIL_THRESHOLD } from "./lib.mjs";

const ANTI_BOT_MARKERS = [
  "cf-browser-verification",
  "just a moment",
  "checking your browser",
  "ddos protection",
  "challenge-platform",
  "turnstile",
  "please wait while we check your browser",
];

const d = today();
const health = loadHealth();

/* ---------- ① 白嫖 / 免费额度来源页核对 ---------- */
const fb = readJSON("data/manual/freebies.json", { items: [], retired: [] });
fb.items = fb.items || [];
let fbOk = 0, fbChanged = 0, fbStale = 0, fbSkipped = 0;

for (const it of fb.items) {
  if (it.autoCheck === false) {
    // 不可自动核对的条目（JS 渲染空壳 / 需登录等）：状态固定为人工核对，不假装巡检
    it.status = "manual";
    it.statusNote = it.statusNote || "该来源无法自动化核对（JS 渲染 / 需人工巡览），领取前请以官方页面为准";
    it.lastChecked = d;
    fbSkipped++;
    continue;
  }
  const src = { id: `freebie-${it.id}`, label: `白嫖条目：${it.name}`, url: it.source, tier: it.tier || "agg", type: "page" };
  try {
    const r = await fetchText(it.source);
    const text = stripTags(r.text);
    if (text.length < 200) throw new Error(`正文过短（${text.length} 字符），疑似 JS 渲染空壳或被拦截`);
    const lower = text.toLowerCase();
    for (const marker of ANTI_BOT_MARKERS) {
      if (lower.includes(marker)) throw new Error(`检测到反爬/验证页面特征（${marker}），内容不可信`);
    }
    // 特征关键词校验：条目可声明 verifyKeywords，页面正文至少命中一个才算「未变」
    if (Array.isArray(it.verifyKeywords) && it.verifyKeywords.length) {
      const hit = it.verifyKeywords.some((k) => lower.includes(String(k).toLowerCase()));
      if (!hit) {
        it.status = "changed";
        it.statusNote = "来源页可访问，但原有特征关键词已不在页面上，额度规则可能已调整，待人工复核";
        it.lastChecked = d;
        it.failCount = 0;
        fbChanged++;
        recordHealth(health, src, { ok: true, detail: "来源页可访问，特征关键词未命中" });
        console.log(`△ CHANGED ${it.id} (${it.name}) — 来源页特征关键词消失，待人工复核`);
        continue;
      }
    }
    it.status = "ok";
    delete it.statusNote;
    it.lastChecked = d;
    it.failCount = 0;
    fbOk++;
    recordHealth(health, src, { ok: true, detail: `来源页可访问（${text.length} chars）` });
    console.log(`✓ OK ${it.id} (${it.name})`);
  } catch (e) {
    it.failCount = (it.failCount || 0) + 1;
    it.lastChecked = d;
    it.lastError = String(e.message).slice(0, 160);
    if (it.failCount >= FAIL_THRESHOLD) {
      it.status = "stale";
      it.statusNote = `来源页连续 ${it.failCount} 天无法访问（${it.lastError}），条目待人工复核`;
      fbStale++;
      console.log(`✗ STALE ${it.id} (${it.name}) — ${it.lastError}（连续 ${it.failCount} 天）`);
    } else {
      // 未达阈值：保留上一次的状态（首次失败从 ok 降为 warn 提示）
      it.status = it.status === "stale" ? "stale" : "warn";
      it.statusNote = `来源页本次抓取失败（${it.lastError}），连续 ${it.failCount}/${FAIL_THRESHOLD} 天`;
      console.log(`… WARN ${it.id} (${it.name}) — ${it.lastError}（第 ${it.failCount} 天）`);
    }
    recordHealth(health, src, { ok: false, error: it.lastError });
  }
}
fb.checked = d;
writeJSON("data/manual/freebies.json", fb);

/* ---------- ② 促销条目自动过期归档 ---------- */
const pm = readJSON("data/manual/promos.json", { items: [] });
pm.items = pm.items || [];
const justExpired = [];
for (const p of pm.items) {
  // 仅 promo 类按 expires 自动过期；delist（停售是持续状态）与 price（生效日）语义不同，不自动标
  if (!p.expired && p.kind === "promo" && p.expires && p.expires < d) {
    p.expired = true;
    p.expiredOn = d;
    justExpired.push(`${p.title}（截止 ${p.expires}）`);
    console.log(`⏰ EXPIRED ${p.id} — ${p.title}（截止 ${p.expires}）`);
  }
}
writeJSON("data/manual/promos.json", pm);

saveHealth(health);

console.log(
  `\n总结：白嫖条目 ${fb.items.length}（正常 ${fbOk} · 特征变化 ${fbChanged} · 待复核 ${fbStale} · 人工核对 ${fbSkipped}）` +
  ` · 促销新到期 ${justExpired.length}`
);
const fbIssues = fb.items.filter((x) => x.status === "stale" || x.status === "changed" || x.status === "warn");
if (fbIssues.length) console.log(`SUMMARY_FREEBIES_ATTENTION: ${fbIssues.map((x) => x.id).join(",")}`);
if (justExpired.length) console.log(`SUMMARY_PROMOS_EXPIRED: ${justExpired.length}`);
