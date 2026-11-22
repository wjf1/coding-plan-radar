/**
 * page 基线状态机的行为钉子（lib.mjs evaluatePageChange，从 check-pages.mjs 提取）。
 * v7.3 曾在状态机上爆过「熔断丢基线 / alert kind 错乱」两个缺陷——这些用例固化不变量：
 *   1. 首见 → baseline（不报警）
 *   2. 新值首轮 → pending（不报警，二次确认机制）
 *   3. pending 稳定 → changed（开 alert / 已有 alert 则 touch 更新检测时间）
 *   4. 内容回基线 → reverted（auto-revert 解决 alert；14 天窗口内反复 revert → unstable 熔断）
 *   5. pending 多次跳变 → unstable 熔断，且**熔断必须带回旧基线**（rec.hash 不被 pending 污染）
 * 阈值口径与 check-pages.mjs 一致：UNSTABLE_FLAPS=2 / UNSTABLE_REVERTS=2 / SEEN_KEEP=6。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluatePageChange, pruneAlerts, assertCrawlable, ANTI_BOT_MARKERS_BASE } from "../scripts/lib.mjs";

const OPTS = { id: "p1", day: "2026-11-22", unstableFlaps: 2, unstableReverts: 2, seenKeep: 6 };
const H = (s) => `hash-${s}`;

test("S1: 首见无基线 → baseline，不产 alert 动作", () => {
  const r = evaluatePageChange(null, H("A"), OPTS);
  assert.equal(r.outcome, "baseline");
  assert.equal(r.alertOp, null);
  assert.equal(r.rec.hash, H("A"));
});

test("S2: 基线上的新值 → pending 挂起（不报警），旧基线保留", () => {
  const prev = { hash: H("A") };
  const r = evaluatePageChange(prev, H("B"), { ...OPTS, alerts: [] });
  assert.equal(r.outcome, "pending");
  assert.equal(r.alertOp, null);
  assert.equal(r.rec.hash, H("A"), "基线不得被 pending 值污染");
  assert.equal(r.rec.pending, H("B"));
});

test("S3: pending 稳定两轮 → changed 并开 alert；已有 alert 则 touch（detected 更新由调用方分发）", () => {
  const prev = { hash: H("A"), pending: H("B"), pendingSince: "2026-11-21" };
  const alerts = [{ id: "p1", detected: "2026-11-21", resolved: false }];
  const r = evaluatePageChange(prev, H("B"), { ...OPTS, alerts });
  assert.equal(r.outcome, "changed");
  assert.equal(r.alertOp.type, "touch", "已有未解决 alert → touch（调用方更新 detected），不重复开");

  const r2 = evaluatePageChange({ hash: H("A"), pending: H("C") }, H("C"), { ...OPTS, alerts: [] });
  assert.equal(r2.outcome, "changed");
  assert.equal(r2.alertOp.type, "open");
  assert.equal(r2.rec.hash, H("C"));
});

test("S4: 内容回基线 → reverted 解决 alert（auto-revert）；14 天窗口内反复 revert 熔断", () => {
  const alerts = [{ id: "p1", detected: "2026-11-20", resolved: false }];
  const prev = { hash: H("A"), pending: H("B") };
  const r = evaluatePageChange(prev, H("A"), { ...OPTS, alerts });
  assert.equal(r.outcome, "reverted");
  assert.equal(alerts[0].resolved, true);
  assert.equal(alerts[0].resolvedBy, "auto-revert");
  assert.equal(r.rec.hash, H("A"), "revert 后基线仍为旧基线");
  assert.equal(r.revertInfo.detectedAt, "2026-11-20");

  // 反复 revert 达 UNSTABLE_REVERTS=2 → 熔断
  const prev2 = { hash: H("A"), revertCount: 1 };
  const alerts2 = [{ id: "p1", detected: "2026-11-15", resolved: false }];
  const r2 = evaluatePageChange(prev2, H("A"), { ...OPTS, alerts: alerts2 });
  assert.equal(r2.outcome, "reverted");
  assert.equal(r2.unstableNow, true);
  assert.equal(r2.rec.unstable, true);
});

test("S5: pending 多次跳变 → unstable 熔断，熔断记录带回旧基线（v7.3 踩坑不变量）", () => {
  let prev = { hash: H("A"), pending: H("B"), flaps: 1 };
  const r = evaluatePageChange(prev, H("C"), OPTS); // flaps 1→2 达 UNSTABLE_FLAPS=2
  assert.equal(r.outcome, "unstable");
  assert.equal(r.rec.unstable, true);
  assert.equal(r.rec.hash, H("A"), "熔断必须保留旧基线，绝不把 pending 值写进 hash");
  assert.equal(r.rec.pending, H("C"), "熔断时仅记录最近观测值");

  // 熔断后的重复访问：继续只记录不预警（outcome 仍 unstable，旧基线不动）
  const r2 = evaluatePageChange(r.rec, H("D"), OPTS);
  assert.equal(r2.outcome, "unstable");
  assert.equal(r2.rec.hash, H("A"));
});

test("S6: pruneAlerts 滚动清理——resolved 超 90 天删除，未解决与无时间戳保留", () => {
  const alerts = [
    { id: "a", resolved: false },
    { id: "b", resolved: true, resolvedAt: "2025-01-01" }, // 远超 90 天 → 删
    { id: "c", resolved: true, resolvedAt: "2026-11-01" }, // 近期 → 留
    { id: "d", resolved: true },                            // 无 resolvedAt → 保守留
  ];
  const kept = pruneAlerts(alerts, { todayStr: "2026-11-22" });
  assert.deepEqual(kept.map((a) => a.id), ["a", "c", "d"]);
});

test("S7: 反爬基表共享——assertCrawlable 长度与特征拦截，extraMarkers 追加生效", () => {
  assert.throws(() => assertCrawlable("short"), /正文过短/);
  assert.throws(() => assertCrawlable("x".repeat(300) + " just a moment"), /反爬\/验证页面特征/);
  // 基表不含 cloudflare（verify-listings 场景不误伤官方文档页）
  assert.ok(!ANTI_BOT_MARKERS_BASE.includes("cloudflare"));
  const ok = assertCrawlable("y".repeat(300) + " cloudflare pages doc");
  assert.equal(ok, undefined, "基表不应拦截 cloudflare 字样");
  assert.throws(() => assertCrawlable("y".repeat(300) + " cloudflare", { extraMarkers: ["cloudflare"] }), /cloudflare/);
});
