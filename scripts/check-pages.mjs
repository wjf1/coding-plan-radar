// 每日任务②：官方定价页变动检测（哈希对比）
// 页面内容哈希变化 → 写入 data/alerts.json（站点显示「待核实」横幅）+ 供 workflow 开 issue
// 人工核价并更新 data.js 后，请把 alerts.json 里对应条目的 resolved 改为 true（或删除该条目）
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const PAGES = [
  { id:"claude",  label:"Claude 官方定价页",   url:"https://claude.com/pricing" },
  { id:"openai",  label:"ChatGPT 官方定价页",  url:"https://openai.com/chatgpt/pricing/" },
  { id:"copilot", label:"GitHub Copilot 套餐页", url:"https://github.com/features/copilot/plans" },
  { id:"cursor",  label:"Cursor 官方定价页",   url:"https://cursor.com/pricing" },
  { id:"glm",     label:"GLM Coding Plan 官方文档", url:"https://docs.bigmodel.cn/cn/coding-plan/overview" }
];
const UA = { headers:{ "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) CodingPlanRadar/1.0" } };
const today = new Date().toISOString().slice(0,10);

const hashes = existsSync("data/pagehash.json") ? JSON.parse(readFileSync("data/pagehash.json","utf8")) : {};
const alerts = existsSync("data/alerts.json") ? JSON.parse(readFileSync("data/alerts.json","utf8")) : [];
const changed = [];

for (const p of PAGES) {
  let text = "";
  try {
    const res = await fetch(p.url, UA);
    text = (await res.text()).replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<[^>]+>/g," ");
  } catch (e) { console.log(`skip ${p.id}: ${e.message}`); continue; }
  const h = createHash("sha256").update(text).digest("hex").slice(0,16);
  if (hashes[p.id] && hashes[p.id] !== h) {
    changed.push(p.id);
    const ex = alerts.find(a => a.id === p.id && !a.resolved);
    if (ex) ex.detected = today;
    else alerts.push({ id:p.id, label:p.label, url:p.url, detected:today, resolved:false });
    console.log(`CHANGED: ${p.id} (${p.label})`);
  } else if (!hashes[p.id]) {
    console.log(`baseline: ${p.id}`);
  }
  hashes[p.id] = h;
}
writeFileSync("data/pagehash.json", JSON.stringify(hashes, null, 1));
writeFileSync("data/alerts.json", JSON.stringify(alerts, null, 1));
console.log(changed.length ? `SUMMARY_CHANGED: ${changed.join(",")}` : "SUMMARY_CLEAN: no official page changed");
