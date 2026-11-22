import { test } from "node:test";
import assert from "node:assert/strict";
import { decideMeta } from "../scripts/mark-pipeline.mjs";

const BASE = { autoCheck: "2026-09-19", pipelineDegraded: false, failedSteps: [], ranAt: "x" };

test("无崩溃：巡检日期推进、降级标记清零", () => {
  const m = decideMeta(BASE, [], "2026-09-20", "2026-09-20T05:35:00Z");
  assert.deepEqual(m, { autoCheck: "2026-09-20", pipelineDegraded: false, failedSteps: [], ranAt: "2026-09-20T05:35:00Z" });
});

test("有崩溃：autoCheck 保持旧值，并记下哪些脚本崩了", () => {
  const m = decideMeta(BASE, ["check-pages", "diff-prices"], "2026-09-20", "2026-09-20T05:35:00Z");
  assert.equal(m.autoCheck, "2026-09-19", "绝不能把失败的运行算成巡检成功");
  assert.equal(m.pipelineDegraded, true);
  assert.deepEqual(m.failedSteps, ["check-pages", "diff-prices"]);
});

test("崩溃后恢复：日期重新推进、标记清零", () => {
  const degraded = { autoCheck: "2026-09-18", pipelineDegraded: true, failedSteps: ["fetch-feeds"] };
  const m = decideMeta(degraded, [], "2026-09-20", "2026-09-20T05:35:00Z");
  assert.deepEqual(m, { autoCheck: "2026-09-20", pipelineDegraded: false, failedSteps: [], ranAt: "2026-09-20T05:35:00Z" });
});

test("meta.json 损坏时不炸，按空基线重建", () => {
  const m = decideMeta(null, [], "2026-09-20", "2026-09-20T05:35:00Z");
  assert.equal(m.autoCheck, "2026-09-20");
  assert.equal(m.pipelineDegraded, false);
});

test("崩溃步骤去重且忽略空项", () => {
  const m = decideMeta(BASE, ["a", "", "a", null], "2026-09-20", "t");
  assert.deepEqual(m.failedSteps, ["a"]);
});
