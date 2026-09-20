// 巡检日期（data/meta.json）的唯一写入点。
//
// 存在的理由：原先 workflow 无条件把 autoCheck 写成当天，而四个抓取步骤都带 continue-on-error，
// 于是「所有脚本都崩了」与「巡检顺利完成」在页面上长得一模一样。现在区分两件事：
//   · 某个源抓不到 —— 数据问题，由 scripts/lib.mjs 的 recordHealth 记进 sourcehealth.json，不降级；
//   · 脚本自身崩溃 —— 代码 bug，必须让站点和 Actions 同时知道，且不推进巡检日期。
import { readFileSync, writeFileSync } from "node:fs";
import { isMain } from "./lib.mjs";

export function decideMeta(prev, crashedSteps, today, ranAt) {
  const crashed = [...new Set((crashedSteps || []).filter(Boolean))];
  if (crashed.length) {
    return {
      autoCheck: (prev && prev.autoCheck) || null, // 保持旧值：不假装今天跑成功过
      pipelineDegraded: true,
      failedSteps: crashed,
      ranAt,
    };
  }
  return { autoCheck: today, pipelineDegraded: false, failedSteps: [], ranAt };
}

if (isMain(import.meta.url)) {
  const arg = (name, dft = "") => {
    const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : dft;
  };
  const crashed = arg("crashed").split(",").map((s) => s.trim()).filter(Boolean);
  let prev = null;
  try {
    prev = JSON.parse(readFileSync("data/meta.json", "utf8"));
  } catch {
    prev = null;
  }
  const today = arg("today", new Date().toISOString().slice(0, 10));
  const ranAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const meta = decideMeta(prev, crashed, today, ranAt);
  writeFileSync("data/meta.json", JSON.stringify(meta) + "\n", "utf8");
  console.log(`meta.json → ${JSON.stringify(meta)}`);
  console.log(crashed.length ? `DEGRADED: ${crashed.join(",")}` : "CLEAN");
}
