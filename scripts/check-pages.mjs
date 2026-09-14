// 每日任务②：官方页面变动检测（内容哈希对比）
// 设计要点（2026-09-14）：
//   1. 页清单不再硬编码，统一读 data/sources.json（含被禁用源及原因）
//   2. 抓取失败不再 catch 后静默 skip —— 写入 data/sourcehealth.json 累计失败，连续失败即视为失效
//   3. 【二次确认】页面内容变了不算数，必须"下一次巡检仍旧是同一个新值"才报警。
//      原因：cursor.com/pricing 实测两次抓取正文长度就不同（7506 vs 8114 字符，动态渲染/轮播），
//      朴素哈希对比会天天误报，把真正的价格变动淹没。代价是真实变动晚一天告警。
//   4. 【不稳定页面识别】页面在多个渲染变体之间来回跳时（如 cursor.com/pricing 实测在两个
//      正文长度 7506/8114 之间交替），"二次确认"仍可能偶然通过然后又回滚。
//      因此记录「确认后又在短期内回滚」的次数：累计 2 次即判定该页不可稳定监控，
//      之后只保留基线、不再自动预警 —— 宁可说"这页需要人工看"，也不刷假警报。
//   5. 页面回到基线哈希时自动解决（resolved）对应 alert，减少人工负担
import { readJSON, writeJSON, fetchText, stripTags, hash16, today, loadHealth, recordHealth, saveHealth, FAIL_THRESHOLD, isDead } from "./lib.mjs";

const UNSTABLE_FLAPS = 2;   // 出现多少个"不同的新值"后判定页面不稳定
const UNSTABLE_REVERTS = 2; // 确认后又回滚几次后判定页面不可稳定监控
const SEEN_KEEP = 6;        // 每页保留的历史哈希条数

const sources = readJSON("data/sources.json", { pages: [] });
const pages = (sources.pages || []).filter((p) => p.type === "page" && p.enabled !== false);
const disabled = (sources.pages || []).filter((p) => p.enabled === false);

const raw = readJSON("data/pagehash.json", {});
const alerts = readJSON("data/alerts.json", []);
const health = loadHealth();
const d = today();

const hashes = {};
const changed = [];
const pending = [];
const failed = [];
const unstable = [];

for (const p of pages) {
  let text, status = null;
  try {
    const r = await fetchText(p.url);
    status = r.status;
    text = stripTags(r.text);
    if (text.length < 200) throw new Error(`正文过短（${text.length} 字符），疑似 JS 渲染空壳或被拦截`);
  } catch (e) {
    failed.push({ id: p.id, label: p.label, error: e.message });
    recordHealth(health, p, { ok: false, status, error: e.message });
    console.log(`✗ FAILED ${p.id} (${p.label}) — ${e.message}`);
    // 抓取失败时保留上一次的基线记录，避免"恢复后一有差异就误报"
    if (raw[p.id]) hashes[p.id] = raw[p.id];
    continue;
  }

  const h = hash16(text);
  const prev = typeof raw[p.id] === "string" ? { hash: raw[p.id] } : raw[p.id] || null;
  const rec = prev ? { ...prev } : { hash: h };
  let note = `${text.length} chars`;

  const seen = Array.isArray(rec.seen) ? rec.seen.slice() : [];
  if (!seen.includes(h)) seen.push(h);
  rec.seen = seen.slice(-SEEN_KEEP);

  // 已判定为不可稳定监控的页面：只记录，不预警
  if (prev && rec.unstable) {
    rec.pending = h;
    rec.pendingSince = rec.pendingSince || d;
    note += " · 内容在多个渲染变体间跳变，已暂停自动预警（需人工核对）";
    unstable.push(p.id);
    hashes[p.id] = rec;
    recordHealth(health, p, { ok: true, status, detail: note });
    health.sources[p.id].unstable = true;
    continue;
  }

  if (!prev) {
    console.log(`· baseline ${p.id}`);
  } else if (prev.hash === h) {
    // 与基线一致：清掉待确认状态，并自动关闭此前的人工核实提醒
    delete rec.pending;
    delete rec.pendingSince;
    rec.flaps = 0;
    const ex = alerts.find((a) => a.id === p.id && !a.resolved);
    if (ex) {
      ex.resolved = true;
      ex.resolvedBy = "auto-revert";
      ex.resolvedAt = d;
      // 确认后又在短期内回滚 → 计一次"跳变"，累计到阈值即停止自动预警
      if (ex.detected && (Date.now() - Date.parse(ex.detected)) / 86400000 <= 14) {
        rec.revertCount = (rec.revertCount || 0) + 1;
        if (rec.revertCount >= UNSTABLE_REVERTS) {
          rec.unstable = true;
          note += " · 多次确认后又回滚，判定为不可稳定监控，已停止自动预警";
          unstable.push(p.id);
          console.log(`⚠ UNSTABLE ${p.id} — 确认后多次回滚，判定该页不可稳定监控`);
        }
      }
      console.log(`✓ REVERTED ${p.id} — 内容回到基线，自动关闭待核实提醒`);
    }
  } else if (prev.pending === h) {
    // 二次确认成立：新内容连续两次一致 → 判定为真实变动
    rec.hash = h;
    delete rec.pending;
    delete rec.pendingSince;
    rec.flaps = 0;
    rec.changedAt = d;
    changed.push(p.id);
    const ex = alerts.find((a) => a.id === p.id && !a.resolved);
    if (ex) ex.detected = d;
    else alerts.push({ id: p.id, label: p.label, url: p.url, tier: p.tier, kind: "page-change", detected: d, resolved: false });
    console.log(`★ CHANGED ${p.id} (${p.label}) — 新内容经两次巡检确认`);
  } else {
    // 首次看到的新值：只挂起不报警
    rec.flaps = prev.pending && prev.pending !== h ? (prev.flaps || 0) + 1 : 0;
    rec.pending = h;
    rec.pendingSince = prev.pending && prev.pendingSince ? prev.pendingSince : d;
    if (rec.flaps >= UNSTABLE_FLAPS) {
      rec.unstable = true;
      note += " · 内容不稳定（疑似轮播/动态渲染），已暂停自动预警";
      unstable.push(p.id);
      console.log(`⚠ UNSTABLE ${p.id} (${p.label}) — 多次出现不同内容，判定为不可稳定监控`);
    } else {
      pending.push(p.id);
      console.log(`… PENDING ${p.id} (${p.label}) — 发现新内容，下次巡检仍一致才报警`);
    }
  }
  hashes[p.id] = rec;
  recordHealth(health, p, { ok: true, status, detail: note });
  if (rec.unstable) health.sources[p.id].unstable = true;
}

// 清理已禁用源的基线，避免它们长期占位造成"在监控"的错觉
for (const p of disabled) {
  if (hashes[p.id] || raw[p.id]) console.log(`- 已停用监控：${p.id}`);
}

writeJSON("data/pagehash.json", hashes);
writeJSON("data/alerts.json", alerts);
saveHealth(health, sources);

const dead = Object.values(health.sources).filter(isDead);
if (dead.length) console.log(`\n⚠ 已失效源（连续失败 ≥${FAIL_THRESHOLD} 天）：${dead.map((x) => x.label).join("、")}`);
console.log(
  `\n总结：监控 ${pages.length} 页 · 确认变动 ${changed.length}（${changed.join(",") || "无"}）` +
  ` · 待二次确认 ${pending.length}（${pending.join(",") || "无"}）` +
  ` · 不稳定 ${unstable.length}（${unstable.join(",") || "无"}）` +
  ` · 抓取失败 ${failed.length}（${failed.map((f) => f.id).join(",") || "无"}）`
);
if (changed.length) console.log(`SUMMARY_CHANGED: ${changed.join(",")}`);
else console.log("SUMMARY_CLEAN: no official page changed");
