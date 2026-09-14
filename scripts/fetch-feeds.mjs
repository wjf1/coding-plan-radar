// 每日任务③：外部信息源抓取 → 归一化为「信号」
// 覆盖两类源：type=feed（RSS/Atom）+ type=api & pipeline=signals（HN 搜索、GitHub commit 流）
// 信号只是线索不是结论：官方源信号可进「待核实」，社区源信号固定标黄、不进价格表。
// 产物 data/signals.json 为 90 天滚动窗口，避免仓库无限膨胀。
import { readJSON, writeJSON, fetchText, parseFeed, daysAgo, hash16, today, loadHealth, recordHealth, saveHealth, isDead, FAIL_THRESHOLD, ghHeaders, excerpt, compileMatcher } from "./lib.mjs";

const KEEP_DAYS = 90;          // 信号保留窗口
const MAX_NEW_PER_SOURCE = 15; // 单源单次最多新增，防止个别源刷屏
const MAX_ITEMS = 600;         // 文件总量上限

const sources = readJSON("data/sources.json", {});
const feeds = (sources.feeds || []).filter((f) => f.type === "feed" && f.enabled !== false);
const apiSources = (sources.apis || []).filter((a) => a.type === "api" && a.pipeline === "signals" && a.enabled !== false);
const store = readJSON("data/signals.json", { generatedAt: null, items: [] });
const health = loadHealth();
const d = today();

const byId = new Map(store.items.map((i) => [i.id, i]));
let added = 0;
const failed = [];

const matchKeywords = (f, item) => {
  if (!f.keywords || !f.keywords.length) return true;
  if (!f._match) f._match = compileMatcher(f.keywords);
  return f._match(item.title + " " + item.desc);
};

/* ---------- 非 RSS 接口 → 统一条目结构 ---------- */
const JSON_PARSERS = {
  // HN Algolia 搜索：定价相关讨论
  "hn-algolia": (j) =>
    (j.hits || []).map((h) => ({
      title: h.title || "",
      link: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      date: h.created_at || "",
      desc: excerpt(h.story_text || `${h.points || 0} points · ${h.num_comments || 0} comments`, 200),
    })),
  // GitHub commits 列表：用提交信息当「免费额度变动」事件流（过滤纯自动化提交，只留有人为信息的）
  "gh-commits": (j) =>
    (Array.isArray(j) ? j : [])
      .filter((c) => !/^(merge pull request|docs:|chore:|ci:)/i.test((c.commit?.message || "").trim()))
      .map((c) => ({
        title: (c.commit?.message || "").split("\n")[0].slice(0, 160),
        link: c.html_url || "",
        date: c.commit?.author?.date || "",
        desc: `${c.commit?.author?.name || ""} 提交于 ${(c.commit?.author?.date || "").slice(0, 10)}`,
      })),
};

/* ---------- 统一处理 ---------- */
async function ingest(src, items, stat) {
  const fresh = items
    .filter((it) => {
      if (!it.title || !it.link) return false;
      const age = daysAgo(it.date);
      return age === null ? true : age <= (src.maxAgeDays || 30);
    })
    .filter((it) => matchKeywords(src, it));

  recordHealth(health, src, { ok: true, status: stat.status, detail: `${items.length} 条 / 命中 ${fresh.length}` });

  let n = 0;
  for (const it of fresh) {
    if (n >= MAX_NEW_PER_SOURCE) break;
    const id = `${src.id}:${hash16(it.link || it.title)}`;
    if (byId.has(id)) {
      byId.get(id).lastSeen = d;
      continue;
    }
    byId.set(id, {
      id,
      source: src.id,
      sourceLabel: src.label,
      sourceUrl: src.url,
      tier: src.tier,
      kind: src.kind || (src.tier === "community" ? "community" : "promo-candidate"),
      title: it.title,
      excerpt: it.desc,
      url: it.link,
      date: it.date || d,
      firstSeen: d,
      lastSeen: d,
    });
    added++;
    n++;
  }
  console.log(`· ${src.id}: ${items.length} 条 → 命中 ${fresh.length}，新增 ${n}`);
}

for (const f of feeds) {
  let items, status = null;
  try {
    const r = await fetchText(f.url);
    status = r.status;
    items = parseFeed(r.text);
    if (!items.length) throw new Error("解析到 0 条条目，可能不是有效 feed 或被拦截页替换");
  } catch (e) {
    failed.push({ id: f.id, error: e.message });
    recordHealth(health, f, { ok: false, status, error: e.message });
    console.log(`✗ FAILED ${f.id} (${f.label}) — ${e.message}`);
    continue;
  }
  await ingest(f, items, { status });
}

for (const a of apiSources) {
  let items, status = null;
  try {
    const r = await fetchText(a.url, { headers: a.parser === "gh-commits" ? ghHeaders() : {} });
    status = r.status;
    const parse = JSON_PARSERS[a.parser];
    if (!parse) throw new Error(`未知 parser：${a.parser}`);
    items = parse(JSON.parse(r.text));
  } catch (e) {
    failed.push({ id: a.id, error: e.message });
    recordHealth(health, a, { ok: false, status, error: e.message });
    console.log(`✗ FAILED ${a.id} (${a.label}) — ${e.message}`);
    continue;
  }
  await ingest(a, items, { status });
}

// 90 天滚动清理
const keep = [];
for (const it of byId.values()) {
  const age = (Date.now() - Date.parse(it.firstSeen)) / 86400000;
  if (Number.isNaN(age) || age <= KEEP_DAYS) keep.push(it);
}
keep.sort((a, b) => String(b.firstSeen).localeCompare(String(a.firstSeen)) || String(a.source).localeCompare(String(b.source)));

writeJSON("data/signals.json", { generatedAt: d, items: keep.slice(0, MAX_ITEMS) });
saveHealth(health);

const dead = Object.values(health.sources).filter(isDead);
if (dead.length) console.log(`\n⚠ 已失效源（连续失败 ≥${FAIL_THRESHOLD} 天）：${dead.map((x) => x.label).join("、")}`);
console.log(`\n总结：订阅源 ${feeds.length} + 接口源 ${apiSources.length} · 新增信号 ${added} 条 · 库内共 ${keep.length} 条 · 抓取失败 ${failed.length}（${failed.map((x) => x.id).join(",") || "无"}）`);
