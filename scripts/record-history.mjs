// 每日任务：记录订阅计划价格历史快照
//   1. 读取 data/manual/plans.json 提取起步价
//   2. 追加到 data/auto/price-history.json（按日期为 key）
//   3. 对比昨日价格，如有变动生成 alert 进 data/auto/alerts.json
//   4. 保留最近 90 天，超出裁剪
// 幂等性：历史按日期为 key 覆盖写；告警按 `price:<平台>:<日期>` 去重，
// 因此同一天重复运行不会产生重复记录或重复告警。
import { readJSON, writeJSON, today } from "./lib.mjs";

const d = today();
const HISTORY_PATH = "data/auto/price-history.json";
const ALERTS_PATH = "data/auto/alerts.json";
const RETENTION_DAYS = 90;

// 直接读 JSON：与浏览器同一份数据源（data/manual/plans.json）。
// 旧实现靠 `require("../js/data.js")` 执行浏览器脚本、再读它挂在 globalThis 上的 _CP_EXPORT，
// 只要该文件引入任何 ESM 语法这一步就会抛错，并连带打断整个每日巡检。
const PLAN_DATA = readJSON("data/manual/plans.json", { plans: [] }).plans;
if (!Array.isArray(PLAN_DATA) || !PLAN_DATA.length) {
  throw new Error("data/manual/plans.json 未读到价格数据（plans 缺失或为空）");
}

// 读取现有历史
const hist = readJSON(HISTORY_PATH, { updatedAt: null, history: {} });

// 生成今日快照
const snapshot = {};
for (const p of PLAN_DATA) {
  if (p.status === "bad") continue;
  snapshot[p.name] = { startVal: p.startVal ?? 0, start: p.start };
}

// 检查价格变动（与上一次记录对比）
const alerts = readJSON(ALERTS_PATH, []);
let changes = 0;
for (const [name, rec] of Object.entries(snapshot)) {
  const prevDates = Object.keys(hist.history[name] || {}).sort();
  if (!prevDates.length) continue;
  const lastDate = prevDates[prevDates.length - 1];
  const prev = hist.history[name][lastDate];
  if (!prev || prev.startVal === rec.startVal) continue;
  const oldV = prev.startVal, newV = rec.startVal;
  const diff = oldV ? ((newV - oldV) / oldV * 100) : 0;
  const diffStr = diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
  const id = `price:${name}:${d}`;
  if (!alerts.find(a => a.id === id)) {
    alerts.push({
      id, label: `${name} 起步价变动`, url: "", tier: "official", kind: "price-change",
      detected: d, resolved: false,
      note: `${lastDate} 为 ${prev.start}（≈¥${oldV.toFixed(1)}）→ ${d} 为 ${rec.start}（≈¥${newV.toFixed(1)}），变动 ${diffStr}。请人工核实后更新价格表。`
    });
    changes++;
  }
}
if (changes) writeJSON(ALERTS_PATH, alerts);

// 追加今日快照
for (const [name, rec] of Object.entries(snapshot)) {
  if (!hist.history[name]) hist.history[name] = {};
  hist.history[name][d] = rec;
}

// 裁剪：只保留最近 RETENTION_DAYS 天
const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
for (const name of Object.keys(hist.history)) {
  const dates = Object.keys(hist.history[name]).sort();
  for (const date of dates) {
    if (date <= cutoff) delete hist.history[name][date];
  }
}

hist.updatedAt = d;
writeJSON(HISTORY_PATH, hist);
console.log(`· 价格历史：已记录 ${d} 快照（${Object.keys(snapshot).length} 个平台）· 新增调价告警 ${changes} 条`);
