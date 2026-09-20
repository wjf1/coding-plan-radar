// 生成「待人工处理清单」→ issue-body.md。
//
// 为什么要从 workflow 的内联 node -e 里搬出来：一是没法测试，二是原先告警过滤写的是
// `!a.resolved && a.detected === today` —— 只列"今天检出的未决告警"，于是今天没核实的
// 事项明天就静默离开清单，而它其实还挂着。现在按「当前未决全集」输出，配合常驻 issue
// （label: daily-triage）就是一个真正的待办队列。
import { writeFileSync } from "node:fs";
import { readJSON, isMain } from "./lib.mjs";

const DAY = 86400000;

const daysOpen = (iso, today) => {
  const t = Date.parse(iso);
  const now = Date.parse(today);
  if (Number.isNaN(t) || Number.isNaN(now)) return null;
  return Math.max(0, Math.round((now - t) / DAY));
};

export function buildTriage({ alerts = [], signals = { items: [] }, reported = { ids: [] }, health = { sources: {} } }, today) {
  const out = [];

  const open = (alerts || []).filter((a) => a && !a.resolved);
  if (open.length) {
    out.push(
      "### 官方页内容变动，价格待人工核实\n" +
        open
          .map((a) => {
            const n = daysOpen(a.detected, today);
            return `- [${a.label}](${a.url}) — 检测于 ${a.detected}${n === null ? "" : `（已挂起 ${n} 天）`}`;
          })
          .join("\n")
    );
  }

  const reportedSet = new Set((reported && reported.ids) || []);
  // ① 状态页故障不是促销线索，且状态页一忙就天天开单；
  // ② 社区情报固定只作线索展示，不进人工队列；
  // ③ 每条线索只上报一次（记在 data/reported.json）。
  const sig = ((signals && signals.items) || []).filter(
    (s) => s.tier !== "community" && s.kind !== "availability" && !reportedSet.has(s.id)
  );
  if (sig.length) {
    out.push(
      "### 自动发现的新线索（官方源，需人工确认后才进价格表）\n" +
        sig.slice(0, 20).map((s) => `- [${s.title}](${s.url})　— ${s.sourceLabel}`).join("\n")
    );
  }

  const dead = Object.values((health && health.sources) || {}).filter(
    (s) => s.ok === false && (s.consecutiveFailures || 0) >= 3
  );
  if (dead.length) {
    out.push(
      "### ⚠ 以下信息源已连续 3 天抓取失败，需要在 data/sources.json 中修复或停用\n" +
        dead.map((s) => `- ${s.label}（${s.url}）— 最后错误：${s.error || "未知"}`).join("\n")
    );
  }

  return { body: out.join("\n\n"), reportedIds: sig.map((s) => s.id) };
}

if (isMain(import.meta.url)) {
  const today = new Date().toISOString().slice(0, 10);
  const signals = readJSON("data/signals.json", { items: [] });
  const r = buildTriage(
    {
      alerts: readJSON("data/alerts.json", []),
      signals,
      reported: readJSON("data/reported.json", { ids: [] }),
      health: readJSON("data/sourcehealth.json", { sources: {} }),
    },
    today
  );
  writeFileSync("issue-body.md", r.body, "utf8");

  if (r.reportedIds.length) {
    const reported = readJSON("data/reported.json", { ids: [] });
    const merged = new Set([...(reported.ids || []), ...r.reportedIds]);
    // 线索本身有 90 天滚动窗口，reported 也跟着收敛，否则这个文件只增不减。
    const live = new Set((signals.items || []).map((s) => s.id));
    reported.ids = [...merged].filter((id) => live.has(id));
    reported.updatedAt = today;
    writeFileSync("data/reported.json", JSON.stringify(reported, null, 1) + "\n", "utf8");
  }

  console.log(
    r.body
      ? `待办清单：${r.body.split("\n\n").length} 组，新上报线索 ${r.reportedIds.length} 条`
      : "当前无未决事项"
  );
}
