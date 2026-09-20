// 数据契约校验：价格条目的溯源字段必须存在且合法。
// 目的：pricedAt 是「数据新鲜度」面板的唯一事实来源，一旦漂移，首页显示就会重新变成谎话。
import { isMain } from "./lib.mjs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PRICED_BY = new Set(["human", "auto-merged"]);

export function validatePlans(plans, today = new Date().toISOString().slice(0, 10)) {
  const errs = [];
  if (!Array.isArray(plans) || !plans.length) return ["PLAN_DATA 为空或不是数组"];
  for (const d of plans) {
    const at = (msg) => errs.push(`[${d.name || "(未命名)"}] ${msg}`);
    if (!d.name) errs.push("[条目缺 name] 平台名必填");
    if (!d.srcUrl) at("缺 srcUrl：每条数据必须有可点开的出处");
    if (!d.pricedAt) {
      at("缺 pricedAt（人工核价日期）");
    } else if (!ISO.test(d.pricedAt)) {
      at(`pricedAt "${d.pricedAt}" 不是 YYYY-MM-DD`);
    } else if (d.pricedAt > today) {
      at(`pricedAt "${d.pricedAt}" 晚于今天 ${today}`);
    }
    if (!d.pricedBy) at("缺 pricedBy（human | auto-merged）");
    else if (!PRICED_BY.has(d.pricedBy)) at(`pricedBy "${d.pricedBy}" 只允许 human | auto-merged`);
  }
  return errs;
}

// 用 resolve 比对而非字符串拼 file:// —— Windows 下 argv[1] 是 F:\... 而 import.meta.url 是
// file:///F:/...，直接比会永远为假，CI（Linux）与本地（Windows）都要能跑所以必须跨平台。
if (isMain(import.meta.url)) {
  const fs = await import("node:fs");
  const vm = await import("node:vm");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("js/data.js", "utf8") + "\nglobalThis.__P = PLAN_DATA;", ctx);
  const errs = validatePlans(ctx.__P);
  if (errs.length) {
    console.error(`✗ 数据契约校验失败（${errs.length} 项）：`);
    errs.forEach((e) => console.error("  · " + e));
    process.exit(1);
  }
  console.log(`✓ 数据契约校验通过：${ctx.__P.length} 条平台条目字段完整`);
}
