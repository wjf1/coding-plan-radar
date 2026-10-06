// 公用工具：带 UA/超时的抓取、JSON 读写、源健康记录
// 所有脚本共用，保证「源失效不再静默」这一条在所有管道里一致生效。
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CodingPlanRadar/1.0 (+https://wjf1.github.io/coding-plan-radar/)";
export const TIMEOUT_MS = 25000;
export const today = () => new Date().toISOString().slice(0, 10);

export const readJSON = (p, fallback) => {
  try {
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback;
  } catch (e) {
    console.log(`  ! 读取 ${p} 失败（${e.message}），使用默认值`);
    return fallback;
  }
};

export const writeJSON = (p, obj) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileAtomic(p, JSON.stringify(obj, null, 1) + "\n");
};

/** 原子写入：先写同目录 .tmp，再 rename 覆盖目标。
 *  writeFileSync 会先截断目标文件，进程若在写入中途退出（Actions 取消、超时、磁盘满），
 *  仓库里就留下半截 JSON；而 readJSON 的容错会把损坏文件当成「不存在」并回落到默认值，
 *  等于整库数据被静默清空。rename 在同一文件系统内是原子的，读到的只可能是完整的新版或旧版。 */
export const writeFileAtomic = (p, text) => {
  const tmp = `${p}.tmp`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, p);
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {}
    throw e;
  }
};

/** 抓取文本；失败抛出带可读信息的错误，绝不返回空字符串让人误以为成功 */
export async function fetchText(url, { timeout = TIMEOUT_MS, headers = {} } = {}) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "*/*", ...headers },
    signal: AbortSignal.timeout(timeout),
    redirect: "follow",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!text.trim()) throw new Error(`HTTP ${res.status} 但响应体为空`);
  return { text, status: res.status };
}

/** GitHub API 请求头：有 GITHUB_TOKEN 时用上（未认证仅 60 次/小时，Actions 里务必带上） */
export const ghHeaders = () => {
  const t = process.env.GITHUB_TOKEN;
  return t ? { authorization: `Bearer ${t}`, "x-github-api-version": "2022-11-28" } : {};
};

/* ---------------- 源健康记录 ---------------- */
const HEALTH_PATH = "data/auto/sourcehealth.json";

export function loadHealth() {
  return readJSON(HEALTH_PATH, { updatedAt: null, sources: {} });
}

/** 记录一次抓取结果：ok=true 清零失败计数；ok=false 按天累加（同一天多次失败只算一天） */
export function recordHealth(health, src, { ok, status = null, error = null, detail = null }) {
  const prev = health.sources[src.id] || { consecutiveFailures: 0 };
  const d = today();
  const entry = {
    id: src.id,
    label: src.label,
    url: src.url || "",
    tier: src.tier,
    type: src.type,
    lastChecked: d,
    ...(ok
      ? {
          lastOk: d,
          consecutiveFailures: 0,
          ok: true,
          httpStatus: status,
          error: null,
          // 必须清掉，否则"失败→恢复→再失败"时同一天的重复失败会被误判为同一天而不再累加
          lastFailDate: null,
        }
      : {
          lastFailDate: d,
          consecutiveFailures:
            prev.lastFailDate === d ? prev.consecutiveFailures || 0 : (prev.consecutiveFailures || 0) + 1,
          ok: false,
          httpStatus: status,
          error: error ? String(error).slice(0, 200) : null,
          blockedFrom: prev.blockedFrom || (prev.ok === false ? null : d),
        }),
    ...(detail ? { detail } : {}),
  };
  health.sources[src.id] = { ...prev, ...entry };
  return entry;
}

export function saveHealth(health, sources = null) {
  health.updatedAt = today();
  // 停用的源应从健康表中移除：否则站点会给一个"已主动停用"的源永久挂红点，
  // 看起来像故障，实际上是我们自己关掉的。
  if (sources) pruneHealth(health, sources);
  // 按 tier 排序，便于页面阅读
  const order = { official: 0, realtime: 1, agg: 2, community: 3 };
  health.sources = Object.fromEntries(
    Object.entries(health.sources).sort(
      ([, a], [, b]) => (order[a.tier] ?? 9) - (order[b.tier] ?? 9) || a.id.localeCompare(b.id)
    )
  );
  writeJSON(HEALTH_PATH, health);
}

/** 删除健康表中已不在启用清单里的源 */
export function pruneHealth(health, sources) {
  const active = new Set(
    ["feeds", "pages", "lists", "apis"].flatMap((k) =>
      (sources[k] || []).filter((s) => s.enabled !== false).map((s) => s.id)
    )
  );
  const removed = Object.keys(health.sources).filter((id) => !active.has(id));
  for (const id of removed) delete health.sources[id];
  return removed;
}

/** 连续失败达到阈值 → 视为该源已失效（页面据此显示，不再假装巡检成功） */
export const FAIL_THRESHOLD = 3;
export const isDead = (e) => e && e.ok === false && (e.consecutiveFailures || 0) >= FAIL_THRESHOLD;

/* ---------------- 文本处理 ---------------- */
export const stripTags = (s) =>
  String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** 清理 RSS 摘要尾部的站点签名（如 GitHub Changelog 的 "The post … appeared first on …"） */
const stripFeedTail = (s) =>
  String(s || "")
    .replace(/\s*The post [\s\S]*? appeared first on [\s\S]*?\.?\s*$/i, "")
    .trim();

/** 解码 HTML 命名/数字实体（&#8230; / &hellip; 等），未识别的实体替换为空格 */
export const decodeEntities = (s) =>
  String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      try { return String.fromCodePoint(parseInt(n, 16)); } catch { return " "; }
    })
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(+n); } catch { return " "; }
    })
    .replace(/&([a-z]+);/gi, (_, n) =>
      ({ amp: "&", quot: '"', apos: "'", nbsp: " ", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", middot: "·" })[n.toLowerCase()] ?? " "
    );

export const excerpt = (s, n = 180) => {
  let t = stripTags(s);
  t = decodeEntities(stripFeedTail(t)).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
};

export const hash16 = (s) => {
  // 轻量非加密哈希（Node 内建 crypto 亦可，此处避免引入依赖复杂度）
  let h1 = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + s.length.toString(16);
};

/* ---------------- 极简 RSS / Atom 解析（零依赖） ---------------- */
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
};
const cdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();

export function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  return blocks.map((b) => {
    const link =
      cdata(tag(b, "link")) ||
      (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] ||
      cdata(tag(b, "guid")) ||
      "";
    return {
      title: excerpt(cdata(tag(b, "title")), 200),
      link: link.trim(),
      date: cdata(tag(b, "pubDate")) || cdata(tag(b, "updated")) || cdata(tag(b, "published")) || "",
      desc: excerpt(cdata(tag(b, "description")) || cdata(tag(b, "summary")) || cdata(tag(b, "content")), 300),
    };
  });
}

export const daysAgo = (dateStr) => {
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 86400000;
};

/** 关键词匹配器：短英文词加词边界，避免 "pro" 命中 "product" 这类假阳性；中文按包含匹配
 *  支持 excludeKeywords：命中排除词的条目直接过滤掉
 */
export function compileMatcher(keywords, excludeKeywords) {
  const include = (!keywords || !keywords.length)
    ? () => true
    : (() => {
        const rules = keywords.map((k) => {
          const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const ascii = /^[\x00-\x7F]+$/.test(k);
          return new RegExp(ascii ? `\\b${escaped}s?\\b` : escaped, "i");
        });
        return (text) => rules.some((r) => r.test(text));
      })();
  const exclude = (!excludeKeywords || !excludeKeywords.length)
    ? () => false
    : (() => {
        const rules = excludeKeywords.map((k) => {
          const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const ascii = /^[\x00-\x7F]+$/.test(k);
          return new RegExp(ascii ? `\\b${escaped}s?\\b` : escaped, "i");
        });
        return (text) => rules.some((r) => r.test(text));
      })();
  return (text) => include(text) && !exclude(text);
}

/* ---------------- 极简 HTML 条目抽取（零依赖，type=list 页面源专用，v7.3） ----------------
 * 动机：整页哈希只能得出「这个 800KB 页面变了」，然后人工上去找哪一行变了；
 * 条目级抽取直接给出「哪个档位的哪个字段从什么变成了什么」（借鉴 AIHOT web_list 的思路，
 * 但选择器引擎是本仓库自己的零依赖实现，只支持一个克制的子集）。
 *
 * 支持的选择器语法（超出即抛错——宁可不解析，也不静默错抓）：
 *   单级：tag / .class / #id / tag.class#id 任意组合，可加 :nth(k) 后缀取第 k 个匹配（k 从 1 起）
 *   路径：「A B C」最多三级的后代路径，用于先定位容器再取行（如 table:nth(1) tbody tr）
 *   四级及以上、逗号分组、属性选择器等一律不支持，parseSimpleSelector 会抛错。
 */

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);
// 与 stripTags 一致：script/style 内容整体丢弃，里面的 <div 等假标签不参与配对
const SCRIPT_STYLE_RE = /<(script|style)\b[\s\S]*?<\/\1\s*>/gi;
// 统一的标签 token：注释/CDATA 整体吞掉；闭合标签走 g1；开放标签走 g2(名) g3(属性) g4(自闭合)
const TOKEN_SRC =
  String.raw`<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/([a-zA-Z][a-zA-Z0-9-]*)[^>]*>` +
  String.raw`|<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>`;
const tokenRe = () => new RegExp(TOKEN_SRC, "g");

/** 解析单级选择器；语法非法直接抛错，调用方（probe / 校验）据此拒绝，绝不静默降级 */
export function parseSimpleSelector(sel) {
  const s = String(sel ?? "").trim();
  const m = /^(.+?)(?::nth\((\d+)\))?$/.exec(s);
  if (!m) throw new Error(`无法解析选择器：${s}`);
  const nth = m[2] !== undefined ? parseInt(m[2], 10) : null;
  if (nth !== null && (!Number.isInteger(nth) || nth < 1)) {
    throw new Error(`:nth(k) 的 k 必须是 ≥1 的整数：${s}`);
  }
  const base = m[1];
  const part = /^([a-zA-Z][a-zA-Z0-9-]*)?((?:[.#][a-zA-Z0-9_-]+)*)$/.exec(base);
  if (!part || (!part[1] && !part[2])) {
    throw new Error(`不支持的选择器语法：${s}（仅支持 tag/.class/#id 组合，可加 :nth(k)）`);
  }
  const out = { tag: part[1] ? part[1].toLowerCase() : null, id: null, classes: [], nth };
  for (const am of (part[2] || "").matchAll(/([.#])([a-zA-Z0-9_-]+)/g)) {
    if (am[1] === "#") {
      if (out.id) throw new Error(`选择器出现多个 #id：${s}`);
      out.id = am[2];
    } else out.classes.push(am[2]);
  }
  return out;
}

/** 开始标签（名 + 属性串）是否命中单级选择器 */
function tagMatches(name, attrs, sel) {
  if (sel.tag && name !== sel.tag) return false;
  if (sel.id || sel.classes.length) {
    const classM = /(?:\s|^)class\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(attrs);
    const classList = (classM ? (classM[1] ?? classM[2] ?? classM[3] ?? "") : "").split(/\s+/).filter(Boolean);
    for (const c of sel.classes) if (!classList.includes(c)) return false;
    if (sel.id) {
      const idM = /(?:\s|^)id\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(attrs);
      const elId = idM ? (idM[1] ?? idM[2] ?? idM[3] ?? "") : "";
      if (elId !== sel.id) return false;
    }
  }
  return true;
}

/** 从 from 起为 openName 找配对的闭合标签；HTML 容错（ stray 闭合忽略、未闭合的中间标签弹栈） */
function findClosingTag(html, from, openName) {
  const re = tokenRe();
  re.lastIndex = from;
  const stack = [openName];
  let m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) {
      const closeName = m[1].toLowerCase();
      const idx = stack.lastIndexOf(closeName);
      if (idx >= 0) {
        stack.length = idx;
        if (!stack.length) return m.index;
      }
    } else if (m[2]) {
      const name = m[2].toLowerCase();
      if (!VOID_ELEMENTS.has(name) && m[4] !== "/") stack.push(name);
    }
  }
  return -1;
}

/** 在单级选择器下找所有匹配元素，返回 innerHTML 数组；已先剥离 script/style/注释/CDATA */
function matchBlocksOnce(html, sel) {
  const out = [];
  const re = tokenRe();
  let m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined || !m[2]) continue; // 闭合 / 注释 / CDATA
    const name = m[2].toLowerCase();
    if (!tagMatches(name, m[3] || "", sel)) continue;
    if (VOID_ELEMENTS.has(name) || m[4] === "/") { out.push(""); continue; }
    const innerStart = m.index + m[0].length;
    const closeIdx = findClosingTag(html, innerStart, name);
    if (closeIdx < 0) continue; // 未闭合的残缺标签不猜，跳过
    out.push(html.slice(innerStart, closeIdx));
  }
  return out;
}

/** 去掉 script/style/注释/CDATA —— 后续配对与抽取只看真实 DOM 文本 */
const cleanHtml = (html) =>
  String(html || "")
    .replace(SCRIPT_STYLE_RE, " ")
    .replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, " ");

/** 按选择器（单级或「A B」两级路径）取所有匹配元素的 innerHTML；匹配不到返回 [] */
export function matchBlocks(html, selector) {
  const parts = String(selector ?? "").trim().split(/\s+/);
  if (parts.length > 3) throw new Error(`选择器最多三级（A B C）：${selector}`);
  let scopes = [cleanHtml(html)];
  for (const part of parts) {
    if (!part) continue;
    const sel = parseSimpleSelector(part);
    const next = [];
    for (const scope of scopes) {
      let blocks = matchBlocksOnce(scope, sel);
      if (sel.nth !== null) blocks = blocks.slice(sel.nth - 1, sel.nth);
      next.push(...blocks);
    }
    scopes = next;
    if (!scopes.length) break;
  }
  return scopes;
}

/** 块内文本：块级标签折叠为空格、内联标签直接剥掉（「¥<b>19</b>.9」→「¥19.9」）、实体解码 */
const BLOCK_TAG_RE =
  /<\/?(?:div|p|section|article|header|footer|main|nav|aside|li|ul|ol|tr|table|thead|tbody|tfoot|h[1-6]|br|hr|blockquote|pre|figure|figcaption|form|label|dl|dt|dd|th|td|caption|summary|details)\b[^>]*>/gi;
export const fieldText = (html) => {
  const t = String(html || "")
    .replace(SCRIPT_STYLE_RE, " ")
    .replace(BLOCK_TAG_RE, " ")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(t).replace(/\s+/g, " ").trim();
};

/** 按 list 源配置抽取条目数组；itemSelector 匹配不到时返回 []（建基线还是报警由调用方决定，这里绝不猜） */
export function parseListItems(html, cfg) {
  const rows = matchBlocks(html, cfg.itemSelector);
  const fieldKeys = Object.keys(cfg.fields || {});
  if (!fieldKeys.length) throw new Error(`list 源 ${cfg.id || "（无 id）"} 未配置 fields`);
  return rows.map((row, i) => {
    const it = { __index: i };
    for (const k of fieldKeys) it[k] = pickText(row, cfg.fields[k]);
    return it;
  });
}

export const pickText = (blockHtml, selector) => {
  const blocks = matchBlocks(blockHtml, selector);
  return blocks.length ? fieldText(blocks[0]) : "";
};

const clipChange = (s) => {
  s = String(s ?? "");
  return s.length > 120 ? s.slice(0, 119) + "…" : s;
};

/** 条目级 diff：字段值变化逐条列出，条目增删记为 __entry__；keyField 取条目主键（缺省 name），
 *  同 key 多次出现按出现次序 #2/#3 区分。返回 [] 表示无变化。from/to 各截断 120 字符防 issue 刷屏。 */
export function diffListChanges(baseItems, curItems, keyField = "name") {
  const keyOf = (it, n) => (String(it?.[keyField] ?? "").trim() || `#${n + 1}`);
  const keyed = (items) => {
    const map = new Map();
    const count = new Map();
    items.forEach((it, i) => {
      const k0 = keyOf(it, i);
      const c = (count.get(k0) || 0) + 1;
      count.set(k0, c);
      map.set(c > 1 ? `${k0}#${c}` : k0, it);
    });
    return map;
  };
  const base = keyed(baseItems || []);
  const cur = keyed(curItems || []);
  const changes = [];
  for (const [k, it] of cur) {
    const prev = base.get(k);
    if (!prev) { changes.push({ item: clipChange(k), field: "__entry__", from: null, to: "新增条目" }); continue; }
    for (const f of Object.keys(it)) {
      if (f === "__index") continue;
      const a = String(prev[f] ?? "");
      const b = String(it[f] ?? "");
      if (a !== b) changes.push({ item: clipChange(k), field: f, from: clipChange(a), to: clipChange(b) });
    }
  }
  for (const k of base.keys()) {
    if (!cur.has(k)) changes.push({ item: clipChange(k), field: "__entry__", from: "已移除", to: null });
  }
  return changes;
}

/** 结构变更熔断：解析出 0 条，或（基线条目足够多时）过半条目变动——多半是页面改版而非数据变化，
 *  此时逐字段 changes 没有意义，应整页告警等人工核对，且不更新基线（防把坏结构固化成新基线）。 */
export function isStructuralBreakdown(changes, curCount, baseCount) {
  if (baseCount > 0 && curCount === 0) return true;
  if (baseCount >= 4 && curCount > 0 && changes.length) {
    const touched = new Set(changes.map((c) => c.item)).size;
    if (touched / curCount > 0.5) return true;
  }
  return false;
}

