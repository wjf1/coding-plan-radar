// 每日巡检的「待处理清单」生成器：从 alerts / signals / freebies / promos / sourcehealth
// / transients 六个数据面汇总当天需要人工处理的事项，输出 markdown 到 issue-body.md
// （daily-update.yml 的「有待处理事项时开 issue」步骤消费）。
//
// 背景：此前逻辑内嵌在 daily-update.yml 的 ~70 行 `node -e` 里——无法单测、无法本地复跑；
// 且 alert 的 changes.from/to（来自上游网页全文的外部文本）未转义直接拼进 markdown，
// 存在内容注入面。本版本统一经 mdSafe 压平换行并转义 markdown 结构字符（`[ ] < > 反引号）。
import fs from "node:fs";

const read = (p, d) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return d;
  }
};

/** 外部/不可信文本的安全插值：压平换行（防逃出列表行）+ 转义 markdown 结构字符（防链接/代码注入）。 */
const mdSafe = (s) =>
  String(s ?? "")
    .replace(/\r?\n+/g, " ")
    .replace(/([`[\]<>])/g, "\\$1");

const today = new Date().toISOString().slice(0, 10);
const out = [];

// 官方页变动 → 待人工核价
// list 源（条目级监控）的 alert 带 changes 明细：直接列出「哪个档位的哪个字段从什么变成什么」；
// structure-change 是结构变更熔断（页面改版），不更新基线，需先用 probe-source.mjs 核对选择器
const alerts = read("data/auto/alerts.json", []).filter((a) => !a.resolved && a.detected === today);
if (alerts.length) {
  out.push(
    "### 官方页内容变动，价格待人工核实\n" +
      alerts
        .map((a) => {
          const head =
            "- [" + mdSafe(a.label) + "](" + a.url + ") 检测于 " + a.detected +
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
const reportedPath = "data/auto/reported.json";
const reported = read(reportedPath, { ids: [] });
const reportedSet = new Set(reported.ids || []);
const sig = read("data/auto/signals.json", { items: [] }).items.filter(
  (s) => s.tier !== "community" && s.kind !== "availability" && !reportedSet.has(s.id),
);
if (sig.length) {
  out.push(
    "### 自动发现的新线索（官方源，需人工确认后才进价格表）\n" +
      sig.slice(0, 20).map((s) => "- [" + mdSafe(s.title) + "](" + s.url + ")　— " + mdSafe(s.sourceLabel)).join("\n"),
  );
  reported.ids = [...reportedSet, ...sig.map((s) => s.id)];
  reported.updatedAt = today;
  fs.writeFileSync(reportedPath, JSON.stringify(reported, null, 1) + "\n", "utf8");
}

// 白嫖额度条目异常 → 待人工复核
const fb = read("data/manual/freebies.json", { items: [] });
const fbIssues = (fb.items || []).filter((f) => f.status === "stale" || f.status === "changed" || f.status === "warn");
if (fbIssues.length) {
  out.push(
    "### 🎁 白嫖/免费额度条目需要人工复核\n" +
      fbIssues.map((f) => "- **" + mdSafe(f.name) + "**（" + mdSafe(f.status) + "）" + f.source + " — " + mdSafe(f.statusNote || f.lastError || "")).join("\n"),
  );
}

// 促销今日到期 → 已自动标「已结束」，提醒确认时间线上是否需要补一条后续动态
const pm = read("data/manual/promos.json", { items: [] });
const justExpired = (pm.items || []).filter((p) => p.expired && p.expiredOn === today);
if (justExpired.length) {
  out.push(
    "### ⏰ 促销活动今日到期（已自动标记为「已结束」）\n" +
      justExpired.map((p) => "- " + mdSafe(p.title) + "（截止 " + p.expires + "）").join("\n"),
  );
}

// 连续失败的源 → 需要修监控
const hs = read("data/auto/sourcehealth.json", { sources: {} }).sources || {};
const dead = Object.values(hs).filter((s) => s.ok === false && (s.consecutiveFailures || 0) >= 3);
if (dead.length) {
  out.push(
    "### ⚠ 以下信息源已连续 3 天抓取失败，需要在 data/manual/sources.json 中修复或停用\n" +
      dead.map((s) => "- " + mdSafe(s.label) + "（" + s.url + "）— 最后错误：" + mdSafe(s.error || "未知")).join("\n"),
  );
}

// 标注 auto-revert 条目
const transients = read("data/auto/transients.json", { items: [] });
const todayReverts = transients.items.filter((t) => t.resolvedAt === today);
if (todayReverts.length) {
  out.push(
    "### 🔄 今日 auto-revert 记录（内容回到基线，可能为临时促销/渲染变体）\n" +
      todayReverts.map((t) => "- " + mdSafe(t.label) + "（" + t.url + "）：" + t.detected + " 检测到变动，今日自动恢复").join("\n"),
  );
}

fs.writeFileSync("issue-body.md", out.length ? out.join("\n\n") : "", "utf8");
console.log(`pending digest: ${out.length} 个板块`);
