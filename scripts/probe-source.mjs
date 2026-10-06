// 试抓预览：node scripts/probe-source.mjs <list源id>
// 只打印解析结果，不写任何文件——创建/修改 list 源前必须先用它验证选择器，
// 预览与正式采集套用同一套解析逻辑（parseListItems），「看到的就是正式会收的」。
// 解析出 0 条时以非 0 退出：禁止在看不到条目时建立基线（借鉴 AIHOT「先预览，再创建」）。
import { readJSON, fetchText, parseListItems, stripTags } from "./lib.mjs";

const id = process.argv[2];
const sources = readJSON("data/manual/sources.json", {});
const lists = sources.lists || [];
const src = lists.find((l) => l.id === id && l.type === "list");
if (!src) {
  console.error(`✗ 在 data/manual/sources.json 的 lists 里找不到 list 源：${id || "（未传 id）"}`);
  console.error(`  可用：${lists.map((l) => l.id).join(", ") || "（无）"}`);
  process.exit(1);
}

console.log(`抓取 ${src.label} → ${src.url}`);
let text, status;
try {
  ({ text, status } = await fetchText(src.url));
} catch (e) {
  console.error(`✗ 抓取失败：${e.message}`);
  process.exit(1);
}
console.log(`HTTP ${status} · 正文 ${stripTags(text).length} 字符`);

let items;
try {
  items = parseListItems(text, src);
} catch (e) {
  console.error(`✗ 解析失败：${e.message}`);
  process.exit(1);
}
if (!items.length) {
  console.error(`✗ itemSelector「${src.itemSelector}」解析出 0 条——禁止建基线（疑似选择器失效或页面改版）`);
  process.exit(1);
}

console.log(`✓ 解析出 ${items.length} 条（itemSelector: ${src.itemSelector}）`);
console.log("");
const fields = Object.keys(src.fields || {});
items.slice(0, 20).forEach((it, i) => {
  console.log(`#${i + 1} ${fields.map((f) => `${f}=${JSON.stringify(it[f] ?? "")}`).join("  ")}`);
});
if (items.length > 20) console.log(`… 其余 ${items.length - 20} 条省略`);
console.log(`\n预览与正式采集使用同一解析逻辑；确认无误后由 check-pages.mjs 建立基线。`);
