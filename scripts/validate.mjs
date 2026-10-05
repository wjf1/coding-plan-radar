// 数据与脚本校验：CI 与本地共用的单一入口（node scripts/validate.mjs）
// 存在意义：站点所有内容都由 data/*.json 驱动，但这些文件由「人工编辑 + 每日自动巡检」两条路径写入。
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
const dataDir = "data";
if (!existsSync(dataDir)) {
  fail("缺少 data/ 目录");
} else {
  let count = 0;
  for (const f of readdirSync(dataDir)) {
    const p = join(dataDir, f);
    if (!statSync(p).isFile()) continue;
    if (f.endsWith(".tmp")) { fail(`残留的原子写入中间文件：${p}（应被 .gitignore 忽略并清理）`); continue; }
    if (!f.endsWith(".json")) continue;
    readJSONStrict(p);
    count++;
  }
  ok(`data/ 下 ${count} 个 JSON 文件语法合法`);
}

/* ---------- 2. 数据契约 ---------- */
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// 2.1 data/plans.json —— 对比表与详情卡片的主数据
const plansDoc = readJSONStrict("data/plans.json");
if (plansDoc) {
  const { plans, rate } = plansDoc;
  if (!isNum(rate)) fail("data/plans.json: rate 必须是数字（$1 折算人民币用）");
  if (!Array.isArray(plans) || !plans.length) {
    fail("data/plans.json: plans 必须是非空数组");
  } else {
    const seen = new Set();
    plans.forEach((p, i) => {
      const at = `data/plans.json plans[${i}]${p && p.name ? `（${p.name}）` : ""}`;
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
    ok(`data/plans.json: ${plans.length} 个平台（rate=${rate}）`);
  }
}

// 2.2 data/snapshot.json —— models.dev 拉取失败时的唯一兜底
const snap = readJSONStrict("data/snapshot.json");
if (snap) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(snap.generatedAt || ""))) {
    fail("data/snapshot.json: generatedAt 必须是 YYYY-MM-DD");
  }
  if (!Array.isArray(snap.models) || !snap.models.length) {
    fail("data/snapshot.json: models 必须是非空数组（兜底数据不能为空）");
  } else {
    snap.models.forEach((m, i) => {
      const at = `data/snapshot.json models[${i}]${m && m.n ? `（${m.n}）` : ""}`;
      if (!isStr(m.pid) || !isStr(m.id) || !isStr(m.n)) fail(`${at}: pid/id/n 缺失`);
      if (!isNum(m.i) || !isNum(m.o)) fail(`${at}: 输入/输出价必须是数字`);
    });
    ok(`data/snapshot.json: ${snap.models.length} 款模型（快照日期 ${snap.generatedAt}）`);
  }
}

// 2.3 其余数组型数据文件：必须存在且是非空数组
for (const [p, min] of [["data/calc-plans.json", 1], ["data/calc-models.json", 1], ["data/ide-plans.json", 1], ["data/changelog.json", 1], ["data/repos.json", 1]]) {
  const v = readJSONStrict(p);
  if (!v) continue;
  if (!Array.isArray(v)) fail(`${p}: 顶层必须是数组`);
  else if (v.length < min) fail(`${p}: 数组为空（应有至少 ${min} 条）`);
  else ok(`${p}: ${v.length} 条`);
}

// 2.4 巡检产物：meta.json 的巡检日期
const meta = readJSONStrict("data/meta.json");
if (meta && !/^\d{4}-\d{2}-\d{2}$/.test(String(meta.autoCheck || ""))) {
  fail("data/meta.json: autoCheck 必须是 YYYY-MM-DD");
}

// 2.5 价格历史：结构为 {history:{平台:{日期:{startVal}}}}
const hist = readJSONStrict("data/price-history.json");
if (hist) {
  if (typeof hist.history !== "object" || hist.history === null) fail("data/price-history.json: history 必须是对象");
  else {
    let entries = 0;
    for (const [name, dates] of Object.entries(hist.history)) {
      if (typeof dates !== "object" || dates === null) { fail(`data/price-history.json: ${name} 必须是「日期 → 记录」的对象`); continue; }
      for (const [d, rec] of Object.entries(dates)) {
        entries++;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) fail(`data/price-history.json: ${name} 的日期键 ${d} 不是 YYYY-MM-DD`);
        if (rec && rec.startVal !== undefined && !isNum(rec.startVal)) fail(`data/price-history.json: ${name} ${d} 的 startVal 不是数字`);
      }
    }
    ok(`data/price-history.json: ${Object.keys(hist.history).length} 个平台 / ${entries} 条记录`);
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
