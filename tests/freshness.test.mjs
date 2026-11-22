import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGlobal, loadPlans, hostData } from "./helpers.mjs";

const FRESH = loadGlobal("js/freshness.js", "FRESH");

const NOW = Date.parse("2026-09-20T12:00:00Z");
const at = (days) => new Date(NOW - days * 86400000).toISOString().slice(0, 10);

test("daysSince 与 levelOf 的阈值边界", () => {
  assert.equal(FRESH.daysSince("2026-09-13", NOW), 7);
  assert.equal(FRESH.daysSince("垃圾", NOW), null);
  assert.equal(FRESH.levelOf(at(30), NOW), "ok");
  assert.equal(FRESH.levelOf(at(31), NOW), "warn");
  assert.equal(FRESH.levelOf(at(60), NOW), "warn");
  assert.equal(FRESH.levelOf(at(61), NOW), "bad");
  assert.equal(FRESH.levelOf("垃圾", NOW), "unknown");
});

test("statsOf 只统计在售平台，并区分出处强度", () => {
  const plans = [
    { name: "A", status: "ok", srcType: "official", pricedAt: at(7), pricedBy: "human" },
    { name: "B", status: "ok", srcType: "agg", pricedAt: at(20), pricedBy: "human" },
    { name: "C", status: "promo", srcType: "agg", pricedAt: at(45), pricedBy: "human" },
    { name: "D", status: "bad", srcType: "agg", pricedAt: at(500), pricedBy: "human" },
  ];
  // status:"bad" 的 D 不计入，与 #st-plat 口径一致；hostData 见 tests/helpers.mjs 的说明
  assert.deepEqual(hostData(FRESH.statsOf(plans, NOW)), {
    total: 3, fresh: 2, warn: 1, stale: 0, unknown: 0, official: 1, worst: "warn",
  });
});

test("worst 优先级：bad > warn > ok，unknown 记为 warn", () => {
  const p = (lv, by) => [{ name: "X", status: "ok", srcType: "official", pricedBy: by || "human", ...lv }];
  assert.equal(FRESH.statsOf(p({ pricedAt: at(500) }), NOW).worst, "bad");
  assert.equal(FRESH.statsOf(p({ pricedAt: undefined }), NOW).worst, "warn");
  assert.equal(FRESH.statsOf(p({ pricedAt: at(5) }), NOW).worst, "ok");
});

test("rowsOf 最陈旧的排最前", () => {
  const plans = [
    { name: "新", status: "ok", srcType: "official", pricedAt: at(2), pricedBy: "human" },
    { name: "旧", status: "ok", srcType: "agg", pricedAt: at(40), pricedBy: "human" },
    { name: "停售", status: "bad", srcType: "agg", pricedAt: at(99), pricedBy: "human" },
  ];
  const r = FRESH.rowsOf(plans, NOW);
  assert.deepEqual(r.map(x => x.name), ["旧", "新"]);
  assert.equal(r[0].days, 40);
  assert.equal(r[0].level, "warn");
});

test("pillHtml 用覆盖计数而非单个日期，段数与在售平台数一致", () => {
  const html = FRESH.pillHtml(loadPlans(), NOW);
  // main 数据集 20 条（1 条停售不计入）；8 条核价日晚于该 NOW 的条目同样落在"新鲜"档
  // （未来核价日 = 刚核过价，负天数不过任何阈值），故为 19/19
  assert.match(html, /价格核价 19\/19 新鲜/);
  assert.equal(FRESH.rowsOf(loadPlans(), NOW).length, 19, "在售平台每个一格");
  assert.match(html, /href="#freshness"/);
});

test("真实数据：12 官方直采 / 7 聚合参考，全部落在统计里", () => {
  const s = FRESH.statsOf(loadPlans(), NOW);
  assert.deepEqual({ total: s.total, official: s.official, fresh: s.fresh, stale: s.stale, unknown: s.unknown },
    { total: 19, official: 12, fresh: 19, stale: 0, unknown: 0 });
});

test("cardHtml 含汇总数字、出处徽章、来源文案，且不泄露未转义内容", () => {
  const plans = [{ name: '<img src=x>', status: "ok", srcType: "agg",
    pricedAt: at(45), pricedBy: "auto-merged" }];
  const html = FRESH.cardHtml(plans, { now: NOW, autoCheck: "2026-09-20", degraded: false, failed: [] });
  // 45 天属"超 30 天"，故"30 天内复核"是 0/1；数字与标签分处 <b>/<small>，按整段精确断言
  assert.match(html, /<b>0\/1<\/b><small>30 天内复核<\/small>/);
  assert.match(html, /<b>0\/1<\/b><small>官方直采<\/small>/);
  assert.match(html, /<b>1<\/b><small>需复核（超 30 天）<\/small>/);
  assert.match(html, /聚合参考/);
  assert.match(html, /机器抽价 · 人工合并/);
  assert.match(html, /45 天/);
  assert.ok(!html.includes("<img src=x>"), "平台名必须转义");
});

test("cardHtml 在管道降级时挂提示，且未知日期有兜底文案", () => {
  const plans = [{ name: "X", status: "ok", srcType: "official", pricedAt: "坏日期", pricedBy: "human" }];
  const html = FRESH.cardHtml(plans, { now: NOW, autoCheck: "2026-09-19", degraded: true, failed: ["fetch-feeds"] });
  assert.match(html, /自动巡检未完成/);
  assert.match(html, /fetch-feeds/);
  assert.match(html, /核价日期未知/);
});
