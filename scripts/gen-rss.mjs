// 每日任务：从站内变更记录生成 RSS 2.0 订阅源（rss.xml）
//   1. 读取 data/manual/changelog.json（站内「变更记录」板块的唯一数据源）
//   2. 取最近 ≤20 条，按日期降序生成 <item>（title=vX.Y，link=站点首页，pubDate=RFC 822，description=text 全文）
//   3. 写入站点根目录 rss.xml（先写 .tmp 再 rename，沿用 lib.mjs 的原子写惯例）
// 失败语义：文件缺失 / 非法 JSON / 顶层非数组 / 条目字段异常一律抛错非零退出；
// 字段校验与 XML 拼接全部在写盘之前完成——任何异常都不会留下半截或空壳 RSS。
import { readJSON, writeFileAtomic } from "./lib.mjs";

// 站点元信息固定常量：data/manual/ 下没有 meta.json（巡检日期在 data/auto/meta.json 且只有 autoCheck 字段），
// 标题/描述随站点文案维护在这里即可。
const SITE_URL = "https://wjf1.github.io/coding-plan-radar/";
const SITE_TITLE = "CodingPlan Radar";
const SITE_DESC = "AI 编程订阅计划（Coding Plan）对比站 —— 看得见数据来源的订阅指南";
const CHANGELOG_PATH = "data/manual/changelog.json";
const RSS_PATH = "rss.xml";
const MAX_ITEMS = 20;

/** XML 文本转义：& < > " ' 五个字符——text 里的尖括号/与符号不得破坏 XML 结构 */
const escXml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// 刻意不用 readJSON 的容错默认值语义（损坏文件会被当成「不存在」静默回落）：
// RSS 是对外产物，数据源异常必须显式失败，而不是生成一份空壳订阅源。
const changelog = readJSON(CHANGELOG_PATH, null);
if (!changelog) throw new Error(`${CHANGELOG_PATH} 缺失或不是合法 JSON——RSS 不允许凭空生成`);
if (!Array.isArray(changelog)) {
  throw new Error(`${CHANGELOG_PATH} 顶层必须是数组，实际为 ${typeof changelog}`);
}

// 字段校验与日期解析全部在写文件之前完成：任何一条异常都不落盘
const items = changelog
  .map((it, i) => {
    const at = `第 ${i + 1} 条（${it?.v ?? "?"}）`;
    if (typeof it !== "object" || it === null) throw new Error(`${CHANGELOG_PATH} ${at} 不是对象`);
    for (const k of ["date", "v", "text"]) {
      if (typeof it[k] !== "string" || !it[k].trim()) {
        throw new Error(`${CHANGELOG_PATH} ${at} 缺少 ${k} 字段或为空`);
      }
    }
    const t = Date.parse(`${it.date}T00:00:00Z`);
    if (Number.isNaN(t)) throw new Error(`${CHANGELOG_PATH} ${at} 的 date 无法解析：${it.date}`);
    return { ...it, pubDate: new Date(t).toUTCString() }; // toUTCString 即 RFC 822/1123 格式
  })
  .sort((a, b) => b.date.localeCompare(a.date)) // 防人工插入错位：RSS 条目固定按日期降序
  .slice(0, MAX_ITEMS);

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<rss version="2.0">\n<channel>\n` +
  `  <title>${escXml(SITE_TITLE)}</title>\n` +
  `  <link>${escXml(SITE_URL)}</link>\n` +
  `  <description>${escXml(SITE_DESC)}</description>\n` +
  `  <language>zh-CN</language>\n` +
  `  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n` +
  items
    .map(
      (it) =>
        `  <item>\n` +
        `    <title>${escXml(it.v)}</title>\n` +
        `    <link>${escXml(SITE_URL)}</link>\n` +
        `    <pubDate>${it.pubDate}</pubDate>\n` +
        `    <description>${escXml(it.text)}</description>\n` +
        `  </item>\n`
    )
    .join("") +
  `</channel>\n</rss>\n`;

// 写盘前自查：<item> 数量必须与条目数一致（防转义/拼接错误静默产出空壳 RSS）
const found = (xml.match(/<item>/g) || []).length;
if (found !== items.length) {
  throw new Error(`生成的 <item> 数量（${found}）与条目数（${items.length}）不一致，放弃写盘`);
}

writeFileAtomic(RSS_PATH, xml);
console.log(`  ✓ rss.xml：${items.length} 条变更记录（最新 ${items[0]?.date ?? "无"}）`);
