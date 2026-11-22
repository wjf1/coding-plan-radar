// 巡检日期的唯一写入点（data/auto/meta.json）。
// 存在的理由：原先 workflow 在 ⑥ 里无条件把 autoCheck 写成当天，而抓取步骤失败与否只进
// has_failure 汇总——于是「所有脚本都崩了」与「巡检顺利完成」在页面上长得一模一样。
// 源抓不到是数据问题（由 sourcehealth.json 如实记录，不降级）；脚本崩溃是代码 bug，
// 必须让站点和 Actions 同时知道：autoCheck 保持旧值 + pipelineDegraded + job 变红。
import { isMain, writeFileAtomic } from "./lib.mjs";
import { readFileSync } from "node:fs";

export function decideMeta(prev, crashedSteps, today, ranAt) {
  const crashed = [...new Set((crashedSteps || []).filter(Boolean))];
  if (crashed.length) {
    return {
      autoCheck: (prev && prev.autoCheck) || null,   // 保持旧值：不假装今天跑成功过
      pipelineDegraded: true,
      failedSteps: crashed,
      ranAt,
    };
  }
  return { autoCheck: today, pipelineDegraded: false, failedSteps: [], ranAt };
}

if (isMain(import.meta.url)) {
  const arg = (name, dft = "") => {
    const m = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
    return m ? m.slice(name.length + 3) : dft;
  };
  const crashed = arg("crashed").split(",").map((s) => s.trim()).filter(Boolean);
  let prev = null;
  try { prev = JSON.parse(readFileSync("data/auto/meta.json", "utf8")); } catch { prev = null; }
  const today = arg("today", new Date().toISOString().slice(0, 10));
  const meta = decideMeta(prev, crashed, today, new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
  // 与各巡检脚本一致：先写 .tmp 再 mv，避免中途被杀留下半截 JSON
  writeFileAtomic("data/auto/meta.json", JSON.stringify(meta) + "\n");
  console.log(`meta.json → ${JSON.stringify(meta)}`);
  console.log(`PIPELINE_CRASHED=${crashed.length ? "true" : "false"}`);
}
