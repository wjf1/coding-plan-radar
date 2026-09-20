import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTriage } from "../scripts/build-triage.mjs";

const EMPTY = { alerts: [], signals: { items: [] }, reported: { ids: [] }, health: { sources: {} } };
const T = "2026-09-21";

test("三天前检出且仍未核实的告警，今天仍在清单里（这是原先 bug 的核心）", () => {
  const alerts = [
    { id: "aliyun", label: "阿里云百炼免费额度说明", url: "https://x.test/", detected: "2026-09-18", resolved: false },
    { id: "copilot", label: "Copilot 文档", url: "https://y.test/", detected: "2026-09-21", resolved: true },
    { id: "kimi", label: "Kimi 定价", url: "https://z.test/", detected: "2026-09-20", resolved: true, resolvedBy: "auto-revert" },
  ];
  const { body } = buildTriage({ ...EMPTY, alerts }, T);
  assert.match(body, /阿里云百炼/);
  assert.match(body, /已挂起 3 天/);
  assert.ok(!body.includes("Copilot 文档"), "已 resolved 的不进清单");
  assert.ok(!body.includes("Kimi 定价"), "已 resolved 的不进清单");
});

test("当天检出的告警显示「已挂起 0 天」而非消失", () => {
  const alerts = [{ id: "a", label: "今日变动", url: "https://a/", detected: T, resolved: false }];
  assert.match(buildTriage({ ...EMPTY, alerts }, T).body, /今日变动.*已挂起 0 天/s);
});

test("community 与 availability 类线索不进人工队列，也不记入 reported", () => {
  const signals = { items: [
    { id: "a1", title: "社区爆料", url: "https://c/", sourceLabel: "HN", tier: "community", kind: "promo-candidate" },
    { id: "a2", title: "状态页事件", url: "https://s/", sourceLabel: "Status", tier: "official", kind: "availability" },
    { id: "a3", title: "官方 changelog 促销", url: "https://o/", sourceLabel: "GH Changelog", tier: "official", kind: "promo-candidate" },
  ]};
  const r = buildTriage({ ...EMPTY, signals }, T);
  assert.match(r.body, /官方 changelog 促销/);
  assert.ok(!r.body.includes("社区爆料"));
  assert.ok(!r.body.includes("状态页事件"));
  assert.deepEqual(r.reportedIds, ["a3"]);
});

test("已上报过的线索不重复出现在清单里", () => {
  const signals = { items: [{ id: "a3", title: "已经提过的线索", url: "https://o/", sourceLabel: "GH", tier: "official", kind: "promo-candidate" }] };
  const { body } = buildTriage({ ...EMPTY, signals, reported: { ids: ["a3"] } }, T);
  assert.ok(!body.includes("已经提过的线索"));
});

test("连续 3 天失败的源进「需要修监控」清单，未达阈值的不进", () => {
  const health = { sources: {
    dead: { label: "死源", url: "https://d/", ok: false, consecutiveFailures: 4, error: "HTTP 403" },
    edge: { label: "刚好三天", url: "https://e/", ok: false, consecutiveFailures: 3, error: "timeout" },
    shaky: { label: "刚失败", url: "https://s/", ok: false, consecutiveFailures: 1 },
    fine: { label: "好的", url: "https://f/", ok: true, consecutiveFailures: 0 },
  }};
  const { body } = buildTriage({ ...EMPTY, health }, T);
  assert.match(body, /死源/);
  assert.match(body, /刚好三天/);
  assert.ok(!body.includes("刚失败"));
  assert.ok(!body.includes("好的"));
});

test("三类都空时 body 为空串（workflow 据此关闭常驻 issue）", () => {
  const r = buildTriage(EMPTY, T);
  assert.equal(r.body, "");
  assert.deepEqual(r.reportedIds, []);
});

test("各数据文件缺失/为 null 时不抛异常", () => {
  const r = buildTriage({ alerts: null, signals: null, reported: null, health: null }, T);
  assert.equal(r.body, "");
});
