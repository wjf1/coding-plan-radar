// 每日任务：记录订阅计划价格历史快照
//   1. 读取 js/data.js 提取 PLAN_DATA 起步价
//   2. 追加到 data/price-history.json（按日期为 key）
//   3. 对比昨日价格，如有变动生成 alert 进 data/alerts.json
//   4. 保留最近 90 天，超出裁剪
import { createRequire } from "node:module";
import { readJSON, writeJSON, today } from "./lib.mjs";

const d = today();
const HISTORY_PATH = "data/price-history.json";
const ALERTS_PATH = "data/alerts.json";
const RETENTION_DAYS = 90;

// 读取 PLAN_DATA：走 js/data.js 自己暴露的 _CP_EXPORT 扩展点。
// 该文件里是 JS 对象字面量（键名不带引号），不能直接 JSON.parse；
// 正则截取 + JSON.parse 会在第一个键名处抛 SyntaxError 并让整个 publish 作业失败，
// 用 require 执行后取值既不做字符串求值，也不受键名写法影响。
const require = createRequire(import.meta.url);
require("../js/data.js");
const PLAN_DATA = globalThis._CP_EXPORT?.PLAN_DATA;
if (!Array.isArray(PLAN_DATA)) throw new Error("js/data.js 未导出 PLAN_DATA（_CP_EXPORT 缺失）");

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
