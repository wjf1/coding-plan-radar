// 锁死本次修掉的"日期说谎"这一类缺陷：日期一旦由自动化维护，就不允许再在界面文案里写死字面量。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

test("顶部不再有硬编码的「数据更新：<日期>」胶囊", () => {
  const html = read("index.html");
  assert.ok(!/数据更新[：:].{0,12}\d{4}-\d{2}-\d{2}/.test(html), "首页日期必须由 app.js 从 pricedAt 派生");
  assert.ok(/id="auto-pill"/.test(html), "自动巡检胶囊仍需存在");
  assert.ok(/id="fresh-pill"/.test(html), "价格核价胶囊仍需存在");
});

test("快照日期以变量导出，降级提示引用该变量而非字面量", () => {
  const snap = read("js/snapshot.js");
  assert.match(snap, /const MODEL_SNAPSHOT_DATE="\d{4}-\d{2}-\d{2}"/);
  const app = read("js/app.js");
  assert.match(app, /已降级为内置快照（\$\{typeof MODEL_SNAPSHOT_DATE/);
  const fallbackLine = app.split("\n").filter((l) => l.includes("已降级为内置快照"));
  assert.equal(fallbackLine.length, 1, "降级提示应只有一处");
  assert.ok(!/已降级为内置快照（\d{4}-\d{2}-\d{2}/.test(app), "降级提示里不许出现写死的日期");
});

test("生成快照的脚本会导出日期变量，否则上面的约定会悄悄失效", () => {
  const gen = read("scripts/update-snapshot.mjs");
  assert.match(gen, /const MODEL_SNAPSHOT_DATE="\$\{today\}"/);
});

test("面向用户的文案不再承诺「09:00」这一具体时点", () => {
  for (const f of ["index.html", "README.md"]) {
    assert.ok(!/每天\s*09:00/.test(read(f)), `${f} 仍在承诺不成立的时点`);
  }
});
