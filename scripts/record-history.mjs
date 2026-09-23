// 每日任务：记录订阅计划价格历史快照
//   1. 读取 js/data.js 提取 PLAN_DATA 起步价
//   2. 追加到 data/price-history.json（按日期为 key）
//   3. 对比昨日价格，如有变动生成 alert 进 data/alerts.json
//   4. 保留最近 90 天，超出裁剪
import { readFileSync } from "node:fs";
import { readJSON, writeJSON, today } from "./lib.mjs";

const d = today();
const HISTORY_PATH = "data/price-history.json";
const ALERTS_PATH = "data/alerts.json";
const RETENTION_DAYS = 90;

// 读取 js/data.js 并安全提取 PLAN_DATA
const dataCode = readFileSync("js/data.js", "utf8");
// 提取 RATE
const rateMatch = dataCode.match(/const\s+RATE\s*=\s*([\d.]+)\s*;/);
const RATE = rateMatch ? +rateMatch[1] : 7.2;
// 提取 PLAN_DATA 数组字面量，并将表达式（如 3*RATE）预处理为数值后 JSON.parse
const planMatch = dataCode.match(/const\s+PLAN_DATA\s*=\s*(\[[\s\S]*?\]);\s*$/m);
if (!planMatch) throw new Error("PLAN_DATA not found in js/data.js");
const jsonLike = planMatch[1].replace(/(\d+(?:\.\d+)?)\s*\*\s*RATE/g, (_m, n) => String(+n * RATE));
const PLAN_DATA = JSON.parse(jsonLike);

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
