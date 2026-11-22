// 每日巡检的「待处理清单」生成器：从 alerts / signals / freebies / promos / sourcehealth
// / transients 六个数据面汇总需要人工处理的事项，输出 markdown 到 issue-body.md
// （daily-update.yml 的「维护常驻待办 issue」步骤消费）。
//
// 背景：此前逻辑内嵌在 daily-update.yml 的 ~70 行 `node -e` 里——无法单测、无法本地复跑；
// 且 alert 的 changes.from/to（来自上游网页全文的外部文本）未转义直接拼进 markdown，
// 存在内容注入面。本版本统一经 mdSafe 压平换行并转义 markdown 结构字符（`[ ] < > 反引号）。
//
// P0 诚实化修复：告警过滤原先写 `a.detected === today`——今天检出、明天还没核实的事项
// 会静默离开清单，而它仍待人工处理（告警蒸发）。现在按「当前未决全集」（!resolved）输出，
// 配合常驻 issue（label daily-triage）即为一个真正的待办队列，而非每日流水。
import fs from "node:fs";
import { isMain } from "./lib.mjs";

/** 外部/不可信文本的安全插值：压平换行（防逃出列表行）+ 转义 markdown 结构字符（防链接/代码注入）。 */
const mdSafe = (s) =>
  String(s ?? "")
    .replace(/\r?\n+/g, " ")
    .replace(/([`[\]<>])/g, "\\$1");

const DAY = 86400000;
const daysOpen = (iso, today) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.round((Date.parse(today) - t) / DAY));
};

export function buildTriage(
  { alerts = [], signals = { items: [] }, reported = { ids: [] }, freebies = { items: [] }, promos = { items: [] }, transients = { items: [] }, health = { sources: {} } },
  today,
) {
  const out = [];

  // 官方页变动 → 待人工核价。按「当前未决全集」输出（不再按检出日截断），
  // 挂起天数让人一眼看出哪些事项被拖了多久。
  // list 源（条目级监控）的 alert 带 changes 明细：直接列出「哪个档位的哪个字段从什么变成什么」；
  // structure-change 是结构变更熔断（页面改版），不更新基线，需先用 probe-source.mjs 核对选择器
  const open = (alerts || []).filter((a) => !a.resolved);
  if (open.length) {
    out.push(
      "### 官方页内容变动，价格待人工核实\n" +
        open
          .map((a) => {
            const n = daysOpen(a.detected, today);
            const head =
              "- [" + mdSafe(a.label) + "](" + a.url + ") 检测于 " + a.detected +
              (n === null ? "" : "（已挂起 " + n + " 天）") +
              (a.kind === "structure-change"
                ? "（⚠ 疑似页面结构变更，基线未更新，请先 `node scripts/probe-source.mjs " + mdSafe(a.id) + "` 核对选择器）"
                : "");
            const lines = (a.changes || []).map(
              (c) => "  - " + mdSafe(c.item) + " · " + mdSafe(c.field) + ": " + mdSafe(c.from ?? "（无）") + " → " + mdSafe(c.to ?? "（已移除）"),
            );
            if (a.note) lines.unshift("  - " + mdSafe(a.note));
            return lines.length ? head + "\n" + lines.join("\n") : head;
          })
          .join("\n"),
    );
  }

  // 机器线索中的官方来源信号 → 待确认后录入 promos.json
  // ① 状态页故障不是促销线索；② 社区情报只作展示，不进人工队列；③ 每条只上报一次
  const reportedSet = new Set((reported && reported.ids) || []);
  const sig = (signals.items || []).filter(
    (s) => s.tier !== "community" && s.kind !== "availability" && !reportedSet.has(s.id),
  );
  if (sig.length) {
    out.push(
      "### 自动发现的新线索（官方源，需人工确认后才进价格表）\n" +
        sig.slice(0, 20).map((s) => "- [" + mdSafe(s.title) + "](" + s.url + ")　— " + mdSafe(s.sourceLabel)).join("\n"),
    );
  }

  // 白嫖额度条目异常 → 待人工复核
  const fbIssues = (freebies.items || []).filter((f) => f.status === "stale" || f.status === "changed" || f.status === "warn");
  if (fbIssues.length) {
    out.push(
      "### 🎁 白嫖/免费额度条目需要人工复核\n" +
        fbIssues.map((f) => "- **" + mdSafe(f.name) + "**（" + mdSafe(f.status) + "）" + f.source + " — " + mdSafe(f.statusNote || f.lastError || "")).join("\n"),
    );
  }

  // 促销今日到期 → 已自动标「已结束」，提醒确认时间线上是否需要补一条后续动态
  const justExpired = (promos.items || []).filter((p) => p.expired && p.expiredOn === today);
  if (justExpired.length) {
    out.push(
      "### ⏰ 促销活动今日到期（已自动标记为「已结束」）\n" +
        justExpired.map((p) => "- " + mdSafe(p.title) + "（截止 " + p.expires + "）").join("\n"),
    );
  }

  // 连续失败的源 → 需要修监控
  const dead = Object.values(health.sources || {}).filter((s) => s.ok === false && (s.consecutiveFailures || 0) >= 3);
  if (dead.length) {
    out.push(
      "### ⚠ 以下信息源已连续 3 天抓取失败，需要在 data/manual/sources.json 中修复或停用\n" +
        dead.map((s) => "- " + mdSafe(s.label) + "（" + s.url + "）— 最后错误：" + mdSafe(s.error || "未知")).join("\n"),
    );
  }

  // 标注 auto-revert 条目
  const todayReverts = (transients.items || []).filter((t) => t.resolvedAt === today);
  if (todayReverts.length) {
    out.push(
      "### 🔄 今日 auto-revert 记录（内容回到基线，可能为临时促销/渲染变体）\n" +
        todayReverts.map((t) => "- " + mdSafe(t.label) + "（" + t.url + "）：" + t.detected + " 检测到变动，今日自动恢复").join("\n"),
    );
  }

  return { body: out.join("\n\n"), reportedIds: sig.map((s) => s.id) };
}

if (isMain(import.meta.url)) {
  const read = (p, d) => {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      return d;
    }
  };
  const today = new Date().toISOString().slice(0, 10);
  const signals = read("data/auto/signals.json", { items: [] });
  const r = buildTriage(
    {
      alerts: read("data/auto/alerts.json", []),
      signals,
      reported: read("data/auto/reported.json", { ids: [] }),
      freebies: read("data/manual/freebies.json", { items: [] }),
      promos: read("data/manual/promos.json", { items: [] }),
      transients: read("data/auto/transients.json", { items: [] }),
      health: read("data/auto/sourcehealth.json", { sources: {} }),
    },
    today,
  );
  fs.writeFileSync("issue-body.md", r.body, "utf8");
  if (r.reportedIds.length) {
    const reportedPath = "data/auto/reported.json";
    const reported = read(reportedPath, { ids: [] });
    const merged = new Set([...(reported.ids || []), ...r.reportedIds]);
    // 线索有滚动窗口，reported 也要跟着收敛，否则只增不减
    const live = new Set((signals.items || []).map((s) => s.id));
    reported.ids = [...merged].filter((id) => live.has(id));
    reported.updatedAt = today;
    fs.writeFileSync(reportedPath, JSON.stringify(reported, null, 1) + "\n", "utf8");
  }
  console.log(`pending digest: ${r.body ? r.body.split("\n\n").length : 0} 个板块，新上报线索 ${r.reportedIds.length} 条`);
}
