import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTriage } from "../scripts/pending-digest.mjs";

const EMPTY = {
  alerts: [],
  signals: { items: [] },
  reported: { ids: [] },
  freebies: { items: [] },
  promos: { items: [] },
  transients: { items: [] },
  health: { sources: {} },
};
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

test("community 与 availability 类线索不进人工队列，且不记入 reported", () => {
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

test("连续 3 天失败的源进「需要修监控」清单", () => {
  const health = { sources: {
    dead: { label: "死源", url: "https://d/", ok: false, consecutiveFailures: 4, error: "HTTP 403" },
    shaky: { label: "刚失败", url: "https://s/", ok: false, consecutiveFailures: 1 },
    fine: { label: "好的", url: "https://f/", ok: true, consecutiveFailures: 0 },
  }};
  const { body } = buildTriage({ ...EMPTY, health }, T);
  assert.match(body, /死源/);
  assert.ok(!body.includes("刚失败"));
  assert.ok(!body.includes("好的"));
});

test("外部文本经 mdSafe 转义，不注入 markdown 结构", () => {
  const alerts = [{ id: "x", label: "<script>alert(1)</script>", url: "https://x.test/", detected: T, resolved: false }];
  const { body } = buildTriage({ ...EMPTY, alerts }, T);
  assert.ok(!body.includes("<script>"), "label 必须转义");
  assert.match(body, /alert\(1\)/, "文本内容保留、只转义结构字符");
});

test("六面全空时 body 为空串（workflow 据此关闭常驻 issue）", () => {
  assert.equal(buildTriage(EMPTY, T).body, "");
});
