// 零依赖自检：node tests/selfcheck.mjs
// 不引入 vitest 等 npm 依赖——这个仓库刻意保持「无构建、无 npm」，
// 用 Node 内建的 node:test 就能覆盖到真正会出事的地方：
//   1. 巡检脚本依赖的纯函数（哈希/匹配/文本清洗/RSS 解析）
//   2. 原子写入（写坏 JSON 会被 readJSON 当成「文件不存在」而静默清库）
//   3. record-history 的幂等性（同一天重复运行不得产生重复记录）
//   4. validate.mjs 能否真的拦住坏数据（负向用例）
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { hash16, stripTags, excerpt, compileMatcher, parseFeed, daysAgo, writeJSON, readJSON, parseSimpleSelector, matchBlocks, pickText, parseListItems, diffListChanges, isStructuralBreakdown } = await import(
  new URL("../scripts/lib.mjs", import.meta.url).href
);

const tmpRoot = () => mkdtempSync(join(tmpdir(), "cpr-test-"));

/* ---------------- 1. 纯函数 ---------------- */
test("hash16：同输入同结果、不同输入不同结果", () => {
  assert.equal(hash16("hello"), hash16("hello"));
  assert.notEqual(hash16("a"), hash16("b"));
  assert.match(hash16("x"), /^[0-9a-f]+$/);
});

test("stripTags / excerpt：剥标签、压空白、超长截断", () => {
  assert.equal(stripTags("<p>hello</p>"), "hello");
  assert.equal(stripTags("<script>bad()</script>ok"), "ok");
  assert.equal(stripTags("a &amp; b&nbsp;c"), "a & b c");
  assert.equal(excerpt("<p>" + "x".repeat(300) + "</p>", 10), "xxxxxxxxxx…");
});

test("compileMatcher：短英文词按词边界，'pro' 不应命中 'product'", () => {
  const m = compileMatcher(["cursor", "ai"]);
  assert.equal(m("Cursor IDE"), true);
  assert.equal(m("VS Code"), false);
  const pro = compileMatcher(["pro"]);
  assert.equal(pro("Pro plan"), true);
  assert.equal(pro("product page"), false);
});

test("compileMatcher：excludeKeywords 命中即排除", () => {
  const m = compileMatcher(["free"], ["freemium"]);
  assert.equal(m("free tier"), true);
  assert.equal(m("freemium model"), false);
});

test("parseFeed：兼容 RSS item 与 Atom entry，取 link/pubDate", () => {
  const rss = `<rss><channel><item><title><![CDATA[Hello &amp; world]]></title>
    <link>https://example.com/a</link><pubDate>Mon, 05 Oct 2026 01:00:00 GMT</pubDate></item></channel></rss>`;
  const [a] = parseFeed(rss);
  assert.equal(a.title, "Hello & world"); // CDATA 内实体在 excerpt→stripTags 阶段还原
  assert.equal(a.link, "https://example.com/a");
  assert.ok(a.date.includes("2026"));
  const atom = `<feed><entry><title>T</title><link href="https://example.com/b"/><updated>2026-10-05T01:00:00Z</updated></entry></feed>`;
  assert.equal(parseFeed(atom)[0].link, "https://example.com/b");
});

test("daysAgo：非法日期返回 null（调用方据此决定是否放行）", () => {
  assert.equal(daysAgo("not a date"), null);
  assert.ok(Math.abs(daysAgo(new Date().toISOString())) < 0.01);
});

/* ---------------- 2. 原子写入 ---------------- */
test("writeJSON：落盘后可解析，且不残留 .tmp", () => {
  const dir = tmpRoot();
  const p = join(dir, "sub", "a.json");
  writeJSON(p, { ok: 1, zh: "中文" });
  assert.deepEqual(readJSON(p, null), { ok: 1, zh: "中文" });
  assert.equal(existsSync(p + ".tmp"), false);
  assert.deepEqual(readdirSync(join(dir, "sub")), ["a.json"]);
  rmSync(dir, { recursive: true, force: true });
});

test("readJSON：损坏文件回落默认值——这正是必须先原子写的原因", () => {
  const dir = tmpRoot();
  const p = join(dir, "b.json");
  writeFileSync(p, '{"half": '); // 模拟写到一半被杀
  assert.deepEqual(readJSON(p, { fallback: true }), { fallback: true }); // 静默当成不存在
  rmSync(dir, { recursive: true, force: true });
});

/* ---------------- 3. record-history 幂等性 ---------------- */
const runInTmp = (scriptRel, extra = {}) => {
  const dir = tmpRoot();
  mkdirSync(join(dir, "data", "manual"), { recursive: true });
  cpSync(join(ROOT, "data", "manual", "plans.json"), join(dir, "data", "manual", "plans.json"));
  execFileSync(process.execPath, [join(ROOT, scriptRel)], { cwd: dir, stdio: "pipe", ...extra });
  return dir;
};

test("record-history：同一天连跑两次，价格历史与告警字节级不变", () => {
  const dir = runInTmp("scripts/record-history.mjs");
  const hist1 = readFileSync(join(dir, "data", "auto", "price-history.json"), "utf8");
  execFileSync(process.execPath, [join(ROOT, "scripts/record-history.mjs")], { cwd: dir, stdio: "pipe" });
  const hist2 = readFileSync(join(dir, "data", "auto", "price-history.json"), "utf8");
  assert.equal(hist2, hist1, "第二次运行改动了价格历史，幂等性被破坏");
  // 每个平台当日只应有一条记录
  const hist = JSON.parse(hist2);
  const planCount = JSON.parse(readFileSync(join(dir, "data", "manual", "plans.json"), "utf8")).plans.filter((p) => p.status !== "bad").length;
  assert.equal(Object.keys(hist.history).length, planCount);
  for (const dates of Object.values(hist.history)) assert.equal(Object.keys(dates).length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("record-history：plans.json 缺失时明确报错（而不是写出一份空历史）", () => {
  const dir = tmpRoot();
  mkdirSync(join(dir, "data", "manual"), { recursive: true });
  writeFileSync(join(dir, "data", "manual", "plans.json"), "{}");
  assert.throws(() => execFileSync(process.execPath, [join(ROOT, "scripts/record-history.mjs")], { cwd: dir, stdio: "pipe" }));
  assert.equal(existsSync(join(dir, "data", "auto", "price-history.json")), false, "不应产出空历史文件");
  rmSync(dir, { recursive: true, force: true });
});

/* ---------------- 4. validate.mjs 负向用例 ---------------- */
const validateInTmp = (mutate) => {
  const dir = tmpRoot();
  for (const d of ["data", "js", "scripts"]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
  mutate(dir);
  try {
    execFileSync(process.execPath, [join(ROOT, "scripts/validate.mjs")], { cwd: dir, stdio: "pipe" });
    return { code: 0, out: "" };
  } catch (e) {
    return { code: e.status, out: String(e.stdout || "") + String(e.stderr || "") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("validate：当前仓库数据通过校验", () => {
  const r = validateInTmp(() => {});
  assert.equal(r.code, 0, `校验未通过：${r.out}`);
});

test("validate：拦住写坏的 JSON（本来会安静上线，页面少一块内容）", () => {
  const r = validateInTmp((d) => writeFileSync(join(d, "data", "manual", "ide-plans.json"), '[{"name":"x",'));
  assert.notEqual(r.code, 0);
  assert.match(r.out, /ide-plans\.json/);
});

test("validate：拦住空快照（兜底数据为空等于没有降级能力）", () => {
  const r = validateInTmp((d) =>
    writeFileSync(join(d, "data", "auto", "snapshot.json"), JSON.stringify({ generatedAt: "2026-10-05", models: [] }))
  );
  assert.notEqual(r.code, 0);
  assert.match(r.out, /snapshot\.json/);
});

test("validate：拦住缺字段的计划条目（数据必须可溯源）", () => {
  const r = validateInTmp((d) => {
    const p = join(d, "data", "manual", "plans.json");
    const doc = JSON.parse(readFileSync(p, "utf8"));
    delete doc.plans[0].srcUrl;
    writeFileSync(p, JSON.stringify(doc, null, 1));
  });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /srcUrl/);
});

test("validate：拦住脚本语法错误（CI 里 node 直接起不来）", () => {
  const r = validateInTmp((d) => writeFileSync(join(d, "scripts", "broken.mjs"), "export const x = ;\n"));
  assert.notEqual(r.code, 0);
  assert.match(r.out, /broken\.mjs/);
});

/* ---------------- 5. list 条目级抽取（v7.3） ---------------- */
const LIST_HTML = `
<!-- 注释里的假卡片 <div class="plan-card">fake</div> 不算数 -->
<script>if (a < b) { render("<div class=\\"plan-card\\">js</div>"); }</script>
<main>
  <div class="wrap">
    <div class="plan-card"><h3>Lite</h3><span class="price">¥<b>19</b>.9</span><img src="dot.png"><p>2,000 积分</p></div>
    <div class="plan-card"><h3>Pro</h3><span class="price">49</span><p>12,000 积分</p></div>
  </div>
  <table><thead><tr><th>套餐</th><th>额度</th></tr></thead>
  <tbody><tr><td>Lite</td><td>10,000</td></tr><tr><td>Max</td><td>28,000</td></tr></tbody></table>
</main>`;

test("matchBlocks：注释与 script 里的假标签不参与配对，class 顺序无关", () => {
  const blocks = matchBlocks(LIST_HTML, ".plan-card");
  assert.equal(blocks.length, 2, `应命中 2 张卡片（注释/脚本里的不算），实际 ${blocks.length}`);
  assert.equal(pickText(blocks[0], "h3"), "Lite");
  // class 有多个时同样命中（属性解析按词匹配，不要求整串相等）
  assert.equal(matchBlocks(LIST_HTML, "div.plan-card").length, 2);
});

test("pickText：内联标签不加热空格（¥<b>19</b>.9 → ¥19.9），缺失返回空串", () => {
  const [card] = matchBlocks(LIST_HTML, ".plan-card");
  assert.equal(pickText(card, ".price"), "¥19.9");
  assert.equal(pickText(card, "p"), "2,000 积分");
  assert.equal(pickText(card, ".nope"), "");
  assert.equal(pickText(card, "td"), "");
});

test("选择器路径：容器取行 + 行内取单元格（list 源的实际用法）", () => {
  // 三级路径取行，fields 在行块内单级取单元格
  const [maxRow] = matchBlocks(LIST_HTML, "table:nth(1) tbody tr:nth(2)");
  assert.equal(pickText(maxRow, "td:nth(1)"), "Max");
  assert.equal(pickText(maxRow, "td:nth(2)"), "28,000");
  assert.equal(pickText(LIST_HTML, "tbody tr td:nth(1)"), "Lite");
});

test("parseSimpleSelector：非法语法抛错，绝不静默降级", () => {
  assert.throws(() => parseSimpleSelector("a b"), /不支持的选择器语法/); // 空格不是单级
  assert.throws(() => parseSimpleSelector("div[class]"), /不支持的选择器语法/); // 属性选择器
  assert.throws(() => parseSimpleSelector("div:nth(0)"), /≥1/); // k 必须 ≥1
  assert.throws(() => matchBlocks(LIST_HTML, "div .wrap .plan-card a"), /最多三级/); // 四级路径
  assert.equal(parseSimpleSelector(".a.b").classes.length, 2);
  assert.equal(parseSimpleSelector("tr:nth(3)").nth, 3);
});

test("parseListItems：端到端抽取与 0 条返回空数组", () => {
  const items = parseListItems(LIST_HTML, {
    itemSelector: ".plan-card",
    fields: { name: "h3", price: ".price" },
  });
  assert.deepEqual(
    items.map((i) => ({ name: i.name, price: i.price })),
    [
      { name: "Lite", price: "¥19.9" },
      { name: "Pro", price: "49" },
    ]
  );
  assert.deepEqual(parseListItems(LIST_HTML, { itemSelector: ".ghost", fields: { a: "b" } }), []);
});

test("diffListChanges：改值/新增/消失/无变化，同 key 按次序区分", () => {
  const base = [
    { name: "Lite", quota: "10,000" },
    { name: "Pro", quota: "60,000" },
    { name: "Max", quota: "140,000" },
  ];
  const cur = [
    { name: "Lite", quota: "12,000" },
    { name: "Pro", quota: "60,000" },
    { name: "Max", quota: "140,000" },
    { name: "Ultra", quota: "300,000" },
  ];
  assert.deepEqual(diffListChanges(base, cur, "name"), [
    { item: "Lite", field: "quota", from: "10,000", to: "12,000" },
    { item: "Ultra", field: "__entry__", from: null, to: "新增条目" },
  ]);
  assert.deepEqual(diffListChanges(cur, base, "name"), [
    { item: "Lite", field: "quota", from: "12,000", to: "10,000" },
    { item: "Ultra", field: "__entry__", from: "已移除", to: null },
  ]);
  assert.deepEqual(diffListChanges(base, base.slice(), "name"), []);
  // 同名两行（如同一模型两档缓存率）：#2 不该吞掉或错配
  const dupBase = [{ name: "M", v: "1" }, { name: "M", v: "2" }];
  const dupCur = [{ name: "M", v: "1" }, { name: "M", v: "9" }];
  assert.deepEqual(diffListChanges(dupBase, dupCur, "name"), [{ item: "M#2", field: "v", from: "2", to: "9" }]);
});

test("isStructuralBreakdown：0 条熔断；条目 ≥4 时过半变动熔断；少量条目逐条报", () => {
  const five = ["a", "b", "c", "d", "e"].map((n) => ({ name: n, v: "1" }));
  const threeChanged = five.map((x, i) => ({ ...x, v: i < 3 ? "2" : "1" }));
  assert.equal(isStructuralBreakdown(diffListChanges(five, threeChanged, "name"), 5, 5), true); // 3/5 过半
  assert.equal(isStructuralBreakdown(diffListChanges(five, five.slice(0, 4), "name"), 4, 5), false); // 移除 1 条(1/4)
  const three = ["a", "b", "c"].map((n) => ({ name: n, v: "1" }));
  const allThree = three.map((x) => ({ ...x, v: "2" }));
  assert.equal(isStructuralBreakdown(diffListChanges(three, allThree, "name"), 3, 3), false); // 条目 <4 逐条报
  assert.equal(isStructuralBreakdown([], 0, 5), true); // 解析出 0 条
  assert.equal(isStructuralBreakdown([], 3, 0), false); // 双方皆空（异常防御）
});

test("validate：拦住缺少 itemSelector 的 list 源（选择器契约必须显式声明）", () => {
  const r = validateInTmp((d) => {
    const p = join(d, "data", "manual", "sources.json");
    const doc = JSON.parse(readFileSync(p, "utf8"));
    doc.lists = [{ id: "bad", label: "x", url: "https://example.com", tier: "official", type: "list", fields: { a: "b" } }];
    writeFileSync(p, JSON.stringify(doc, null, 1));
  });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /itemSelector/);
});

test("validate：拦住 itemSelector 语法不支持的 list 源（四级路径/逗号）", () => {
  const r = validateInTmp((d) => {
    const p = join(d, "data", "manual", "sources.json");
    const doc = JSON.parse(readFileSync(p, "utf8"));
    doc.lists = [
      { id: "bad1", label: "x", url: "https://example.com", tier: "official", type: "list", itemSelector: "a b c d e", fields: { a: "b" } },
      { id: "bad2", label: "x", url: "https://example.com", tier: "official", type: "list", itemSelector: "div,span", fields: { a: "b" } },
    ];
    writeFileSync(p, JSON.stringify(doc, null, 1));
  });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /itemSelector/);
});
