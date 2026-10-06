// 数据与脚本校验：CI 与本地共用的单一入口（node scripts/validate.mjs）
// 存在意义：站点所有内容都由 data/manual/ 与 data/auto/ 下的 JSON 驱动，但这些文件由「人工编辑 + 每日自动巡检」两条路径写入。
// 之前没有任何校验，一个逗号写错或一次写坏的文件会直接被提交上线——页面只会安静地少一块内容。
// 这里把「数据契约」和「脚本语法」两类问题挡在提交之前：任何一项不通过即以非 0 退出。
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const errors = [];
const notes = [];
const fail = (msg) => errors.push(msg);
const ok = (msg) => notes.push(msg);

const readJSONStrict = (p) => {
  if (!existsSync(p)) { fail(`缺少文件：${p}`); return null; }
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    fail(`${p} 不是合法 JSON：${e.message}`);
    return null;
  }
};

/* ---------- 1. data/ 下所有 JSON 必须可解析 ---------- */
// 目录按维护方式分离：manual = 人工录入，auto = 机器每日生成。
// 分开是为了让「改哪个文件」这件事本身就不需要猜，也便于 GitHub 折叠机器产物的 diff。
const DATA_DIRS = ["data/manual", "data/auto"];
let dataCount = 0;
for (const dataDir of DATA_DIRS) {
  if (!existsSync(dataDir)) { fail(`缺少目录：${dataDir}`); continue; }
  let count = 0;
  for (const f of readdirSync(dataDir)) {
    const p = join(dataDir, f);
    if (statSync(p).isFile() && f.endsWith(".tmp")) {
      fail(`残留的原子写入中间文件：${p}（应被 .gitignore 忽略并清理）`);
      continue;
    }
    if (!f.endsWith(".json")) continue;
    readJSONStrict(p);
    count++;
  }
  dataCount += count;
  ok(`${dataDir}/ 下 ${count} 个 JSON 文件语法合法`);
}
ok(`data/ 合计 ${dataCount} 个 JSON 文件`);

/* ---------- 2. 数据契约 ---------- */
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// 2.1 data/manual/plans.json —— 对比表与详情卡片的主数据
const plansDoc = readJSONStrict("data/manual/plans.json");
if (plansDoc) {
  const { plans, rate } = plansDoc;
  if (!isNum(rate)) fail("data/manual/plans.json: rate 必须是数字（$1 折算人民币用）");
  if (!Array.isArray(plans) || !plans.length) {
    fail("data/manual/plans.json: plans 必须是非空数组");
  } else {
    const seen = new Set();
    plans.forEach((p, i) => {
      const at = `data/manual/plans.json plans[${i}]${p && p.name ? `（${p.name}）` : ""}`;
      if (!isStr(p.name)) fail(`${at}: name 缺失`);
      else if (seen.has(p.name)) fail(`${at}: name 重复`);
      else seen.add(p.name);
      if (!["intl", "cn"].includes(p.region)) fail(`${at}: region 必须是 intl 或 cn`);
      if (!["ok", "promo", "bad"].includes(p.status)) fail(`${at}: status 必须是 ok/promo/bad`);
      if (!Array.isArray(p.tiers) || !p.tiers.length) fail(`${at}: tiers 必须是非空数组`);
      else if (p.tiers.some((t) => !Array.isArray(t) || t.length < 2)) fail(`${at}: tiers 每项至少要有 [名称, 价格]`);
      if (p.startVal !== undefined && !isNum(p.startVal)) fail(`${at}: startVal 必须是数字`);
      if (!isStr(p.srcUrl)) fail(`${at}: srcUrl 缺失（数据必须可溯源）`);
      if (!p.status || p.status === "bad") return;
      if (!isStr(p.vendor)) fail(`${at}: vendor 缺失`);
      if (!isStr(p.start)) fail(`${at}: start 缺失`);
    });
    ok(`data/manual/plans.json: ${plans.length} 个平台（rate=${rate}）`);
  }
}

// 2.2 data/auto/snapshot.json —— models.dev 拉取失败时的唯一兜底
const snap = readJSONStrict("data/auto/snapshot.json");
if (snap) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(snap.generatedAt || ""))) {
    fail("data/auto/snapshot.json: generatedAt 必须是 YYYY-MM-DD");
  }
  if (!Array.isArray(snap.models) || !snap.models.length) {
    fail("data/auto/snapshot.json: models 必须是非空数组（兜底数据不能为空）");
  } else {
    snap.models.forEach((m, i) => {
      const at = `data/auto/snapshot.json models[${i}]${m && m.n ? `（${m.n}）` : ""}`;
      if (!isStr(m.pid) || !isStr(m.id) || !isStr(m.n)) fail(`${at}: pid/id/n 缺失`);
      if (!isNum(m.i) || !isNum(m.o)) fail(`${at}: 输入/输出价必须是数字`);
    });
    ok(`data/auto/snapshot.json: ${snap.models.length} 款模型（快照日期 ${snap.generatedAt}）`);
  }
}

// 2.3 其余数组型数据文件：必须存在且是非空数组
for (const [p, min] of [["data/manual/calc-plans.json", 1], ["data/manual/calc-models.json", 1], ["data/manual/ide-plans.json", 1], ["data/manual/changelog.json", 1], ["data/manual/repos.json", 1]]) {
  const v = readJSONStrict(p);
  if (!v) continue;
  if (!Array.isArray(v)) fail(`${p}: 顶层必须是数组`);
  else if (v.length < min) fail(`${p}: 数组为空（应有至少 ${min} 条）`);
  else ok(`${p}: ${v.length} 条`);
}

// 2.4 巡检产物：meta.json 的巡检日期
const meta = readJSONStrict("data/auto/meta.json");
if (meta && !/^\d{4}-\d{2}-\d{2}$/.test(String(meta.autoCheck || ""))) {
  fail("data/auto/meta.json: autoCheck 必须是 YYYY-MM-DD");
}

// 2.5 价格历史：结构为 {history:{平台:{日期:{startVal}}}}
const hist = readJSONStrict("data/auto/price-history.json");
if (hist) {
  if (typeof hist.history !== "object" || hist.history === null) fail("data/auto/price-history.json: history 必须是对象");
  else {
    let entries = 0;
    for (const [name, dates] of Object.entries(hist.history)) {
      if (typeof dates !== "object" || dates === null) { fail(`data/auto/price-history.json: ${name} 必须是「日期 → 记录」的对象`); continue; }
      for (const [d, rec] of Object.entries(dates)) {
        entries++;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) fail(`data/auto/price-history.json: ${name} 的日期键 ${d} 不是 YYYY-MM-DD`);
        if (rec && rec.startVal !== undefined && !isNum(rec.startVal)) fail(`data/auto/price-history.json: ${name} ${d} 的 startVal 不是数字`);
      }
    }
    ok(`data/auto/price-history.json: ${Object.keys(hist.history).length} 个平台 / ${entries} 条记录`);
  }
}

// 2.6 sources.json：信息源声明契约（tier 白名单 + list 源的条目级配置）
// 这里只做形态校验；选择器能否真正解析出条目由 probe-source.mjs（人工预览）与
// check-pages.mjs 的 0 条保护兜底——校验通过不代表 selector 有效，两者缺一不可。
const sourcesDoc = readJSONStrict("data/manual/sources.json");
if (sourcesDoc) {
  const tierNames = Object.keys(sourcesDoc.tiers || {});
  const allIds = new Map(); // id → 所在数组，跨数组查重
  const selOk = (s, { allowPath }) => {
    const parts = String(s ?? "").trim().split(/\s+/).filter(Boolean);
    const max = allowPath ? 3 : 1; // fields 只允许块内单级；itemSelector 允许最多三级路径
    if (parts.length < 1 || parts.length > max) return false;
    return parts.every((part) => /^(?:[a-zA-Z][a-zA-Z0-9-]*)?(?:[.#][a-zA-Z0-9_-]+)*(?::nth\(\d+\))?$/.test(part));
  };
  for (const group of ["feeds", "pages", "lists", "apis"]) {
    for (const s of sourcesDoc[group] || []) {
      const at = `data/manual/sources.json ${group}[].${s && s.id ? s.id : "?"}`;
      if (!isStr(s.id)) fail(`${at}: id 缺失`);
      else if (allIds.has(s.id)) fail(`${at}: id 与 ${allIds.get(s.id)} 重复`);
      else allIds.set(s.id, group);
      if (isStr(s.tier) && tierNames.length && !tierNames.includes(s.tier)) fail(`${at}: tier「${s.tier}」不在 tiers 白名单里`);
    }
  }
  const lists = sourcesDoc.lists || [];
  if (!Array.isArray(lists)) fail("data/manual/sources.json: lists 必须是数组");
  else {
    for (const l of lists) {
      const at = `data/manual/sources.json lists[].${l && l.id ? l.id : "?"}`;
      if (l.type !== "list") fail(`${at}: type 必须是 list`);
      if (!isStr(l.url)) fail(`${at}: url 缺失`);
      if (!isStr(l.itemSelector) || !selOk(l.itemSelector, { allowPath: true })) fail(`${at}: itemSelector 缺失或语法不支持（仅 tag/.class/#id + :nth(k)，最多三级路径）`);
      const fields = l.fields || {};
      const fk = Object.keys(fields);
      if (!fk.length) fail(`${at}: fields 至少要有一个字段`);
      for (const [k, sel] of Object.entries(fields)) {
        if (!isStr(sel) || !selOk(sel, { allowPath: false })) fail(`${at}: fields.${k}「${sel}」必须是块内单级选择器（不支持路径）`);
      }
      if (l.keyField !== undefined && !fk.includes(l.keyField)) fail(`${at}: keyField「${l.keyField}」必须是 fields 的键之一`);
    }
    if (lists.length) ok(`data/manual/sources.json: lists ${lists.length} 个条目级监控源（${lists.map((l) => l.id).join(", ")}）`);
  }
}

/* ---------- 3. 脚本语法（node --check，零依赖） ---------- */
const jsFiles = ["js/app.js"];
for (const f of readdirSync("scripts")) if (f.endsWith(".mjs")) jsFiles.push(join("scripts", f));
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    const detail = String(e.stderr || e.message).split("\n").slice(0, 6).join("\n");
    fail(`${f} 语法检查未通过：\n${detail}`);
  }
}
ok(`${jsFiles.length} 个 JS 文件的语法检查通过`);

/* ---------- 汇总 ---------- */
for (const n of notes) console.log(`  ✓ ${n}`);
if (errors.length) {
  console.error(`\n✗ 校验未通过（${errors.length} 项）：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\n校验通过：数据契约与脚本语法均无问题。");
