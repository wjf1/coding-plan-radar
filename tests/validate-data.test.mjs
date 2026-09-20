import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePlans } from "../scripts/validate-data.mjs";
import { loadPlans } from "./helpers.mjs";

test("真实数据全部通过校验", () => {
  assert.deepEqual(validatePlans(loadPlans()), []);
});

test("缺 pricedAt 被拒绝", () => {
  const bad = [{ name: "X", status: "ok", srcType: "official", srcUrl: "https://a.test/" }];
  assert.match(validatePlans(bad)[0], /X.*pricedAt/);
});

test("非法日期与未来日期被拒绝", () => {
  const f = (y) => [{ name: "X", status: "ok", srcType: "official", srcUrl: "https://a.test/", pricedAt: y, pricedBy: "human" }];
  assert.equal(validatePlans(f("2026-13-45")).length, 1);
  assert.equal(validatePlans(f("去年三月")).length, 1);
  assert.equal(validatePlans(f("2099-01-01")).length, 1);
  assert.equal(validatePlans(f(new Date().toISOString().slice(0, 10))).length, 0);
});

test("pricedBy 只接受 human 与 auto-merged", () => {
  const base = { name: "X", status: "ok", srcType: "official", srcUrl: "https://a.test/", pricedAt: "2026-09-13" };
  assert.equal(validatePlans([{ ...base, pricedBy: "bot" }]).length, 1);
  assert.equal(validatePlans([{ ...base, pricedBy: "human" }]).length, 0);
  assert.equal(validatePlans([{ ...base, pricedBy: "auto-merged" }]).length, 0);
});

test("srcUrl 缺失被拒绝", () => {
  const base = { name: "X", status: "ok", srcType: "official", pricedAt: "2026-09-13", pricedBy: "human" };
  assert.match(validatePlans([base])[0], /srcUrl/);
});
