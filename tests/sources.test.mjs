import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const s = JSON.parse(fs.readFileSync("data/sources.json", "utf8"));
const get = (id) => s.pages.find((p) => p.id === id);

test("HTML 里没有价格的页面必须声明 layout-only", () => {
  // 2026-09-20 实测：kimi 253KB / glm 775KB 的 HTML 内价格 token 命中均为 0（价格客户端再取）；
  // minimax 正文含价但为语音套餐。三页的哈希对比都无法发现价格变化，却照样在健康表里报绿。
  for (const id of ["kimi", "glm", "minimax"]) {
    assert.equal(get(id).hashMonitors, "layout-only", `${id} 应标注为仅监控版式`);
  }
});

test("标了 layout-only 就必须写明原因", () => {
  for (const p of s.pages.filter((x) => x.hashMonitors === "layout-only")) {
    assert.ok(p.layoutOnlyReason, `${p.id} 需写明原因`);
    assert.ok(p.layoutOnlyReason.length > 20, `${p.id} 的原因不能是一句话敷衍`);
  }
});

test("未标注的页面默认可用于价格监控（不写冗余字段）", () => {
  for (const id of ["claude", "copilot", "cursor", "trae"]) {
    assert.equal(get(id).hashMonitors, undefined, `${id} 不该被标成 layout-only`);
  }
});

test("被监控的页面都要有 id / label / url，供站点按 id 关联声明", () => {
  for (const p of s.pages) {
    for (const k of ["id", "label", "url"]) {
      assert.ok(p[k] && String(p[k]).trim(), `页面 ${p.id || "?"} 缺 ${k}`);
    }
  }
});
