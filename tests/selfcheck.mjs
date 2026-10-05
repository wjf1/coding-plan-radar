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
const { hash16, stripTags, excerpt, compileMatcher, parseFeed, daysAgo, writeJSON, readJSON } = await import(
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
