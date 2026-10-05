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
    ["feeds", "pages", "apis"].flatMap((k) =>
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
const decodeEntities = (s) =>
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
