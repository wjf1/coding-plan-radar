// 数据新鲜度：纯函数层，零 DOM。
// 浏览器经 <script> 直接用 globalThis.FRESH；单测经 Node vm 求值同一份源码。
// 之所以这样拆：本仓库无构建步骤，纯函数是唯一能同时被两边复用又可测试的形态。
globalThis.FRESH = (function () {
  const DAY = 86400000;
  const FRESH_DAYS = 30;
  const STALE_DAYS = 60;
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const daysSince = (iso, now) => {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return Math.floor((now - t) / DAY);
  };

  const levelOf = (iso, now) => {
    const n = daysSince(iso, now);
    if (n === null) return "unknown";
    if (n > STALE_DAYS) return "bad";
    if (n > FRESH_DAYS) return "warn";
    return "ok";
  };

  // 在售平台才计入统计，与 index.html 的 #st-plat 口径保持一致
  const active = (plans) => plans.filter((d) => d.status !== "bad");

  function statsOf(plans, now = Date.now()) {
    const list = active(plans);
    const lv = list.map((d) => levelOf(d.pricedAt, now));
    const count = (x) => lv.filter((v) => v === x).length;
    const stale = count("bad");
    const warn = count("warn");
    const unknown = count("unknown");
    return {
      total: list.length,
      fresh: count("ok"),
      warn,
      stale,
      unknown,
      official: list.filter((d) => d.srcType === "official").length,
      worst: stale ? "bad" : warn || unknown ? "warn" : "ok",
    };
  }

  function rowsOf(plans, now = Date.now()) {
    return active(plans)
      .map((d) => ({
        name: d.name,
        pricedAt: d.pricedAt,
        pricedBy: d.pricedBy,
        srcType: d.srcType,
        days: daysSince(d.pricedAt, now),
        level: levelOf(d.pricedAt, now),
      }))
      .sort((a, b) => (b.days ?? -1) - (a.days ?? -1)); // 最陈旧在前：最需行动的排上面
  }

  // 一格一平台，按核价日从新到旧排。分布本身就是信息，读它不需要理解任何日期口径。
  const segmentsHtml = (plans, now) =>
    active(plans)
      .slice()
      .sort((a, b) => String(b.pricedAt).localeCompare(String(a.pricedAt)))
      .map((d) => {
        const lv = levelOf(d.pricedAt, now);
        const cls = lv === "bad" ? "b" : lv === "warn" ? "w" : lv === "unknown" ? "u" : "";
        return `<i class="${cls}" title="${esc(d.name)}：${esc(d.pricedAt || "未知")}"></i>`;
      })
      .join("");

  function pillHtml(plans, now = Date.now()) {
    const s = statsOf(plans, now);
    // 11 段分布条放卡片里，不放这条 pill：实测 logo+导航链接已占掉约 810px，
    // pill 带条时固有宽 363px > 容器给的 336px，会在固定 60px 高的头部里折成两行被裁掉。
    return `<a class="pill-fresh ${s.worst}" href="#freshness"><span class="pdot"></span>价格核价 ${s.fresh}/${s.total} 新鲜</a>`;
  }

  const byLabel = (by) =>
    by === "auto-merged"
      ? '<span class="badge b-chip">机器抽价 · 人工合并</span>'
      : by === "human"
        ? '<span class="badge b-ok">人工核价</span>'
        : '<span class="badge b-warn">核价日期未知</span>';

  const barHtml = (days, level) => {
    if (days === null) return '<span class="fresh-bar"><i style="width:100%;background:var(--warn)"></i></span>';
    const pct = Math.max(4, Math.min(100, Math.round((1 - days / 90) * 100)));
    const color = level === "bad" ? "var(--bad)" : level === "warn" ? "var(--warn)" : "var(--ok)";
    return `<span class="fresh-bar"><i style="width:${pct}%;background:${color}"></i></span>`;
  };

  function cardHtml(plans, opt = {}) {
    const now = opt.now ?? Date.now();
    const s = statsOf(plans, now);
    const rows = rowsOf(plans, now);
    const today = new Date(now).toISOString().slice(0, 10);
    const autoChip = opt.degraded
      ? `<span class="badge b-warn">⚠ 自动巡检未完成（${esc((opt.failed || []).join("、") || "有脚本异常")}）</span>`
      : `<span class="badge b-ok">自动巡检 ${esc(opt.autoCheck || "—")}</span>`;
    const needReview = s.warn + s.stale + s.unknown;
    return `<div class="card">
      <div class="head"><h3>🗓 数据新鲜度</h3>${autoChip}<span style="color:var(--dim);font-size:12px">截至 ${esc(today)}</span></div>
      <div class="stats" style="justify-content:flex-start;margin:2px 0 6px">
        <div class="stat"><b>${s.fresh}/${s.total}</b><small>30 天内复核</small></div>
        <div class="stat"><b>${s.official}/${s.total}</b><small>官方直采</small></div>
        <div class="stat"><b>${needReview}</b><small>需复核（超 30 天）</small></div>
      </div>
      <div class="fresh-segrow"><span class="fresh-seg">${segmentsHtml(plans, now)}</span><small>每格一个在售平台，按核价日从新到旧排；绿≤${FRESH_DAYS} 天、黄≤${STALE_DAYS} 天、红更久</small></div>
      <div class="fresh-grid">
        <div class="hd">平台</div><div class="hd">最近核价</div><div class="hd">出处 · 来源</div><div class="hd hide-sm">距今</div>
        ${rows
          .map(
            (r) => `<div><b>${esc(r.name)}</b></div>
          <div>${r.level === "unknown" ? "核价日期未知" : esc(r.pricedAt || "—")}</div>
          <div><span class="srcbadge ${r.srcType === "official" ? "src-official" : "src-agg"}">${r.srcType === "official" ? "官方直采" : "聚合参考"}</span>${byLabel(r.pricedBy)}</div>
          <div class="hide-sm">${r.days === null ? "未知" : r.days + " 天"} ${barHtml(r.days, r.level)}</div>`
          )
          .join("")}
      </div>
      <p style="font-size:12px;color:var(--dim);margin-top:10px">
        <b>距今</b>只说明"多久没人复核过这条价格"，不代表价格一定变了；<b>出处</b>说明这个数字来自官方页还是聚合站——两者要一起看。
        超过 ${FRESH_DAYS} 天标黄、超过 ${STALE_DAYS} 天标红。价格与额度数字一律人工确认后才进表，自动巡检负责发现官方页与订阅源的变动。
      </p>
    </div>`;
  }

  return { FRESH_DAYS, STALE_DAYS, daysSince, levelOf, statsOf, rowsOf, pillHtml, cardHtml };
})();
