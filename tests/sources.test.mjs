import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const s = JSON.parse(fs.readFileSync("data/manual/sources.json", "utf8"));
const all = ["pages", "lists", "feeds", "apis"].flatMap((g) => (s[g] || []).map((x) => ({ ...x, group: g })));
const get = (id) => all.find((p) => p.id === id);

test("自动巡检发现不了订阅价变化的源必须声明 layout-only", () => {
  // kimi：整页哈希监控，但 HTML 无价格（客户端再取）——spec §3 的原始假安全场景；
  // glm / minimax：条目级监控，但监控字段是额度 / API Token 价，不含订阅套餐价。
  // 三者的自动告警都无法发现「订阅价变了」，必须如实标注而不是假装在盯价格。
  for (const id of ["kimi", "glm", "minimax"]) {
    assert.equal(get(id).hashMonitors, "layout-only", `${id} 应标注为发现不了订阅价变化`);
  }
});

test("layout-only 的源必须写明原因（不做口头知识）", () => {
  for (const p of all.filter((x) => x.hashMonitors === "layout-only")) {
    assert.ok(p.layoutOnlyReason, `${p.id} 需写明 layoutOnlyReason`);
  }
});

test("其余源保持默认（不带该字段，读取侧当 price-capable 处理）", () => {
  for (const id of ["copilot", "trae", "claude", "cursor", "baidu-qianfan", "gh-education"]) {
    const p = get(id);
    assert.ok(p, `${id} 存在`);
    assert.notEqual(p.hashMonitors, "layout-only", `${id} 不应被误标`);
  }
});
