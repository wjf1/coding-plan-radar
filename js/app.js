/* ============================================================
 * CodingPlan Radar — 前端应用逻辑
 * ------------------------------------------------------------
 * 模块划分（自上而下）：
 *   1. 常量与状态        —— models.dev 接入、供应商白名单、筛选/排序状态
 *   2. 订阅计划对比表     —— renderPlans()（搜索/筛选/排序，倍率列）
 *   3. 平台详情卡片      —— renderCards()（档位/三周期倍率/速度/坑点）
 *   4. IDE 榜 / 变更记录  —— renderIde() / renderChangelog()
 *   5. Token 实时价格榜  —— loadModels() 三级数据保障：
 *        本地缓存(24h) → models.dev 在线拉取 → 内置快照降级
 *   6. 成本计算器        —— renderCalc()（API 价 × 用量 vs 订阅额度）
 *   7. 每日巡检状态      —— loadAutoMeta() / loadPageAlerts()（Actions 产物）
 *   8. 信息源与白嫖板块  —— renderPromos() / renderFreebies() / renderSignals() / renderSourceHealth()
 *        数据分别来自 data/promos.json（人工确认的促销停售）、data/freebies.json（白嫖/免费额度）、
 *        data/signals.json（机器发现的线索）、data/sourcehealth.json（每源抓取成败，失效会如实标注）
 * 数据均来自 js/data.js 与 js/snapshot.js；页面结构见 index.html。
 * ============================================================ */
const MODELS_DEV_API = "https://models.dev/api.json";
const CACHE_KEY = "cp_modelsdev_cache_v1";
const CACHE_TTL = 24 * 3600 * 1000; // 24h
// 第一方 API 价供应商（排除 *-coding-plan 等 $0 订阅条目）
const OFFICIAL_PROVIDERS = {
  anthropic:"Anthropic", openai:"OpenAI", google:"Google", xai:"xAI",
  zhipuai:"智谱", zai:"Z.ai", moonshotai:"月之暗面", minimax:"MiniMax",
  deepseek:"DeepSeek", volcengine:"火山引擎", xiaomi:"小米", alibaba:"阿里云"
};
const CN_PROVIDERS = new Set(["zhipuai","zai","moonshotai","minimax","deepseek","volcengine","xiaomi","alibaba"]);

const statusMap = { ok:["b-ok","正常"], promo:["b-warn","促销中"], bad:["b-bad","已停售"] };
let planFilter="all", planSort="ratio", planQuery="";
let tFilter="all", tToolOnly=true, tSort="out", tQuery="";
let modelRows=[]; // {p,pid,id,n,i,o,c,t,r}

/* ================= 订阅计划对比表 ================= */
function renderPlans(){
  const tbody=document.getElementById("tbody");
  const rows=PLAN_DATA.filter(d=>{
    if(planFilter!=="all" && d.region!==planFilter) return false;
    if(planQuery){
      const s=(d.name+d.models+d.start+d.quota+d.vendor).toLowerCase();
      if(!s.includes(planQuery.toLowerCase())) return false;
    }
    return true;
  });
  rows.sort((a,b)=>{
    if(planSort==="name") return a.name.localeCompare(b.name);
    if(planSort==="price-desc") return b.startVal-a.startVal;
    if(planSort==="price") return a.startVal-b.startVal;
    // ratio: 无倍率的排最后
    return (b.ratio||0)-(a.ratio||0);
  });
  tbody.innerHTML=rows.map(d=>{
    const [cls,label]=statusMap[d.status];
    const regionTag=d.region==="intl"?"国际":"国内";
    const srcType=d.srcType==="official"
      ?'<span class="srcbadge src-official">官方直采</span>'
      :'<span class="srcbadge src-agg">聚合参考</span>';
    const ratio=d.ratio
      ?`<span class="ratio">${d.ratio}×<small>${d.ratioTier}</small></span>`
      :`<span class="ratio" style="color:var(--dim)">—<small>暂无折算数据</small></span>`;
    const speed=d.speed?`<span class="speedb">⚡ ≈${d.speed} TPS</span>`:"";
    return `<tr>
      <td class="p-name">${d.name}<small>${d.vendor} · ${regionTag}</small>${speed}</td>
      <td class="price">${d.start}</td>
      <td>${ratio}</td>
      <td class="models">${d.models}</td>
      <td class="quota">${d.quota}</td>
      <td><span class="badge ${cls}">${label}</span></td>
      <td class="src">${srcType}<br><a href="${d.srcUrl}" target="_blank">来源链接 ↗</a></td>
    </tr>`;
  }).join("");
}

function renderCards(){
  document.getElementById("cards").innerHTML=PLAN_DATA.filter(d=>d.status!=="bad").map(d=>{
    const [cls,label]=statusMap[d.status];
    const srcType=d.srcType==="official"
      ?'<span class="srcbadge src-official">官方直采</span>'
      :'<span class="srcbadge src-agg">聚合参考</span>';
    const ratioLine=d.ratio?`<div class="kv"><b>额度倍率：</b>${d.ratio}×（${d.ratioTier}，社区折算口径）</div>`:"";
    const periods=d.periods?`<div class="periods">
      <div><b>5 小时额度</b>${d.periods.h5||"—"}</div>
      <div><b>每周额度</b>${d.periods.wk||d.periods.mo||"—"}</div>
      <div><b>每月额度</b>${d.periods.mo||"—"}</div>
    </div>`:"";
    const speedLine=d.speed?`<div class="kv"><b>实测速度：</b>≈ ${d.speed} TPS（awesome-coding-plan 实测口径）</div>`:"";
    const pitfall=d.pitfalls?`<div class="pitfall">⚠ <b>坑点与社区反馈：</b>${d.pitfalls}</div>`:"";
    return `<div class="card">
      <div class="head"><h3>${d.name}</h3><span class="badge b-chip">${d.vendor}</span><span class="badge ${cls}">${label}</span></div>
      <div class="tagline">${d.start} 起 · ${d.region==="intl"?"国际平台":"国内平台"}</div>
      <div class="tiers">${d.tiers.map(t=>`<div class="t-row"><span class="t-name">${t[0]}</span><span class="t-price">${t[1]}</span>${t[2]?`<span class="t-note">${t[2]}</span>`:""}</div>`).join("")}</div>
      <div class="kv"><b>核心模型：</b>${d.models}</div>
      <div class="kv"><b>额度口径：</b>${d.quota}</div>
      ${ratioLine}${speedLine}${periods}${pitfall}
      <div class="tags">${d.tags.map(t=>`<span class="tag2">${t}</span>`).join("")}</div>
      ${d.note?`<div class="kv" style="color:var(--warn);font-size:12.5px">⚠ ${d.note}</div>`:""}
      <div class="foot">${srcType}<span>${d.srcNote}</span><a href="${d.srcUrl}" target="_blank">查看来源 ↗</a></div>
    </div>`;
  }).join("");
}

function renderRepos(){
  document.getElementById("repos-grid").innerHTML=GH_REPOS.map(r=>`
    <div class="repo">
      <div class="rt"><h3><a href="${r.url}" target="_blank">${r.name} ↗</a></h3><span class="tag2">${r.tag}</span></div>
      <p>${r.desc}</p>
      <div class="meta"><span>${r.stars}</span></div>
    </div>`).join("");
}

function renderIde(){
  document.getElementById("idetbody").innerHTML=IDE_PLANS.map(p=>`
    <tr><td class="p-name">${p.name}${p.hl?' <span class="badge b-warn">社区推荐</span>':""}</td>
    <td class="price">${p.price}</td><td class="ratio" style="font-size:14px">${p.ratio}</td>
    <td class="quota">${p.note}</td></tr>`).join("");
}

function renderChangelog(){
  document.getElementById("changelog").innerHTML=CHANGELOG.map(c=>`
    <div class="cl-item"><span class="cv">${c.v}</span><b>${c.date}</b> — ${c.text}</div>`).join("");
}

/* ================= 订阅 vs API 成本计算器 ================= */
let calcTok=500;
function livePrice(m){
  // 优先用实时拉取到的第一方 API 价：精确名 > 含关键词的最短名（避免 GLM-5.3 误匹配 GLM-5.3-Flash）
  const kw=m.match.toLowerCase();
  const hits=modelRows.filter(r=>r.pid===m.pid && r.n.toLowerCase().includes(kw) && r.o>0);
  const hit=hits.find(r=>r.n.toLowerCase()===kw) || hits.find(r=>r.n.length===Math.min(...hits.map(h=>h.n.length)));
  return hit?{i:hit.i,o:hit.o,live:true}:null;
}
function renderCalc(){
  const m=CALC_MODELS[+document.getElementById("calcmodel").value];
  const pr=livePrice(m);
  const fIn=pr?pr.i:m.fIn, fOut=pr?pr.o:m.fOut;
  document.getElementById("calcprice").textContent=
    `实际计价：输入 $${fIn} / 输出 $${fOut} 每百万 tokens${pr?"（models.dev 实时）":"（内置价）"}`;
  const apiCost=calcTok*fOut + calcTok*3*fIn; // 1 输出 : 3 输入
  const totalTok=calcTok*4*1e6;
  const cands=CALC_PLANS.map(p=>({...p,fit:p.quota==null?null:p.quota>=totalTok}))
    .sort((a,b)=>{
      if(a.fit===null&&b.fit===null) return a.price-b.price;
      if(a.fit===null) return 1; if(b.fit===null) return -1;
      if(a.fit!==b.fit) return a.fit?-1:1;
      return a.price-b.price;
    });
  const cheapest=cands[0];
  const bestFit=cands.find(c=>c.fit===true);
  const fmt$=v=>"¥"+(Math.round(v*10)/10).toLocaleString("zh-CN");
  let verdict;
  if(bestFit && apiCost>bestFit.price){
    verdict=`<div class="verdict plan">💡 <b>建议订阅：${bestFit.name}（${fmt$(bestFit.price)}/月）</b><br>
      你的用量按 API 计费约 <b>${fmt$(apiCost)}/月</b>，是订阅价的 <b>${Math.round(apiCost/bestFit.price*10)/10} 倍</b>；该档月额度（${bestFit.note}）可覆盖你的用量。可再对照速度与坑点选择次便宜的合适档。</div>`;
  }else if(cheapest && apiCost<=cheapest.price){
    verdict=`<div class="verdict api">💡 <b>建议按量计费（API）</b><br>
      你的用量按 API 计费约 <b>${fmt$(apiCost)}/月</b>，低于最便宜的合适订阅（${cheapest.name} ${fmt$(cheapest.price)}/月）。经济档模型（如 DeepSeek V4 Flash，输出 $0.6/M）+ 按量付费对你更省钱。</div>`;
  }else{
    verdict=`<div class="verdict plan">💡 <b>建议订阅 + 超出按量</b><br>
      API 成本约 ${fmt$(apiCost)}/月；没有已折算额度的订阅能完全覆盖，选低价档（如 OpenCode Go / Cursor Pro）覆盖日常、峰值按量后付。</div>`;
  }
  document.getElementById("calc-out").innerHTML=verdict+`
    <table><thead><tr><th>候选订阅</th><th>月费</th><th>月额度（社区折算）</th><th>覆盖你的用量?</th></tr></thead><tbody>
    ${cands.slice(0,6).map(c=>`<tr>
      <td class="p-name">${c.name}</td><td class="price">${fmt$(c.price)}</td>
      <td class="quota">${c.note}</td>
      <td>${c.fit===true?'<span class="badge b-ok">够用</span>':c.fit===false?'<span class="badge b-bad">不够</span>':'<span class="badge b-chip">未知</span>'}</td>
    </tr>`).join("")}</tbody></table>`;
}
function bindCalc(){
  document.querySelectorAll(".presets .chip").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll(".presets .chip").forEach(x=>x.classList.remove("on"));
    b.classList.add("on"); calcTok=+b.dataset.tok;
    document.getElementById("tok").value=calcTok; renderCalc();
  }));
  document.getElementById("tok").addEventListener("input",e=>{
    calcTok=Math.max(1,+e.target.value||1);
    document.querySelectorAll(".presets .chip").forEach(x=>x.classList.toggle("on",+x.dataset.tok===calcTok));
    renderCalc();
  });
  document.getElementById("calcmodel").addEventListener("change",renderCalc);
}

/* ================= Token 实时价格榜 ================= */
function setStatus(state,msg){
  const dot=document.getElementById("token-dot");
  document.getElementById("token-msg").textContent=msg;
  dot.className="dot "+(state==="live"?"live":state==="fallback"?"fallback":"");
}

function flattenModels(api){
  const rows=[];
  for(const [pid,pv] of Object.entries(api)){
    const pName=OFFICIAL_PROVIDERS[pid];
    if(!pName) continue; // 只保留第一方 API 价供应商
    for(const m of Object.values(pv.models||{})){
      const c=m.cost||{};
      if(!c.output||c.output<=0) continue;
      const mod=m.modalities||{};
      if(mod.output && !mod.output.includes("text")) continue; // 排除图像/语音模型
      rows.push({p:pName,pid,id:m.id,n:m.name||m.id,i:c.input||0,o:c.output,
        c:(m.limit||{}).context||0,t:!!m.tool_call,r:!!m.reasoning});
    }
  }
  return rows;
}

async function loadModels(){
  // 1) 本地缓存（24h）
  try{
    const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");
    if(cached && Date.now()-cached.ts<CACHE_TTL && cached.rows?.length){
      modelRows=cached.rows;
      setStatus("live",`实时数据源：models.dev（GitHub: sst/models.dev）· 本地缓存 ${new Date(cached.ts).toLocaleString("zh-CN")} · ${modelRows.length} 款模型`);
      renderTokens(); renderCalc(); return;
    }
  }catch(e){}
  // 2) 在线拉取
  try{
    const res=await fetch(MODELS_DEV_API,{cache:"no-cache"});
    if(!res.ok) throw new Error("HTTP "+res.status);
    const api=await res.json();
    modelRows=flattenModels(api);
    if(!modelRows.length) throw new Error("empty");
    localStorage.setItem(CACHE_KEY,JSON.stringify({ts:Date.now(),rows:modelRows}));
    setStatus("live",`实时数据源：models.dev（GitHub: sst/models.dev）· 拉取成功 ${new Date().toLocaleString("zh-CN")} · ${modelRows.length} 款模型`);
  }catch(err){
    // 3) 降级到内置快照
    modelRows=MODEL_SNAPSHOT.map(m=>({...m,t:!!m.t,r:!!m.r}));
    setStatus("fallback",`在线拉取失败（${err.message}），已降级为内置快照（2026-09-13，${modelRows.length} 款）· 请检查网络后刷新`);
  }
  renderTokens(); renderCalc();
}

function renderTokens(){
  const tbody=document.getElementById("ttbody");
  let rows=modelRows.filter(m=>{
    if(tToolOnly && !m.t) return false;
    if(tFilter==="cn" && !CN_PROVIDERS.has(m.pid)) return false;
    if(tFilter==="intl" && CN_PROVIDERS.has(m.pid)) return false;
    if(tQuery && !(m.n+" "+m.id).toLowerCase().includes(tQuery.toLowerCase())) return false;
    return true;
  });
  rows.sort((a,b)=> tSort==="in"?a.i-b.i : tSort==="out-desc"?b.o-a.o : a.o-b.o);
  if(!rows.length){ tbody.innerHTML='<tr><td colspan="6" style="color:var(--dim)">无匹配模型</td></tr>'; return; }
  // 输出价最低的前 8 名标记高性价比
  const cheapSet=new Set(rows.slice(0,8).map(r=>r.pid+r.n));
  const fmtC=c=>c>=1e6?(c/1e6)+"M":c>=1000?Math.round(c/1000)+"K":c;
  tbody.innerHTML=rows.slice(0,80).map(m=>`<tr>
    <td class="p-name">${m.n}<small>${m.id}</small></td>
    <td><span class="badge b-chip">${m.p}</span></td>
    <td class="num">$${m.i}</td>
    <td class="num ${cheapSet.has(m.pid+m.n)?"cheap":""}">$${m.o}${cheapSet.has(m.pid+m.n)?' <span class="spark">⚡性价比</span>':""}</td>
    <td class="num">${fmtC(m.c)||"—"}</td>
    <td>${m.t?'<span class="tag2">工具</span> ':""}${m.r?'<span class="tag2">推理</span>':""}</td>
  </tr>`).join("");
}

/* ================= 交互绑定 ================= */
function bind(){
  document.querySelectorAll(".chip[data-filter]").forEach(c=>c.addEventListener("click",()=>{
    document.querySelectorAll(".chip[data-filter]").forEach(x=>x.classList.remove("on"));
    c.classList.add("on"); planFilter=c.dataset.filter; renderPlans();
  }));
  document.getElementById("search").addEventListener("input",e=>{planQuery=e.target.value.trim();renderPlans();});
  document.getElementById("sort").addEventListener("change",e=>{planSort=e.target.value;renderPlans();});
  document.querySelectorAll("#compare thead th[data-k]").forEach(th=>th.addEventListener("click",()=>{
    const k=th.dataset.k;
    if(k==="price") planSort=planSort==="price"?"price-desc":"price";
    else if(k==="ratio") planSort="ratio";
    else planSort="name";
    document.getElementById("sort").value=planSort; renderPlans();
  }));

  document.querySelectorAll(".chip[data-tfilter]").forEach(c=>c.addEventListener("click",()=>{
    document.querySelectorAll(".chip[data-tfilter]").forEach(x=>x.classList.remove("on"));
    c.classList.add("on"); tFilter=c.dataset.tfilter; renderTokens();
  }));
  const toolBtn=document.querySelector(".chip[data-ttool]");
  toolBtn.addEventListener("click",()=>{
    tToolOnly=!tToolOnly; toolBtn.classList.toggle("on",tToolOnly); renderTokens();
  });
  document.getElementById("tsearch").addEventListener("input",e=>{tQuery=e.target.value.trim();renderTokens();});
  document.getElementById("tsort").addEventListener("change",e=>{tSort=e.target.value;renderTokens();});
  document.querySelectorAll("#tokens thead th[data-tk]").forEach(th=>th.addEventListener("click",()=>{
    const k=th.dataset.tk;
    tSort = (k==="in") ? "in" : (tSort==="out"?"out-desc":"out");
    renderTokens();
  }));
  bindCalc();
}

/* ================= 每日自动巡检状态 · 信息源健康 ================= */
// 来源分级标签：官方直采 > 实时数据源 > 聚合参考 > 社区情报（仅作线索）
const TIER_MAP = {
  official: ["src-official", "官方直采"],
  realtime: ["src-realtime", "实时数据源"],
  agg: ["src-agg", "聚合参考"],
  community: ["src-community", "社区情报"],
};
function tierBadge(tier){
  const [cls,label]=TIER_MAP[tier]||TIER_MAP.agg;
  return `<span class="srcbadge ${cls}">${label}</span>`;
}
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fetchJSON = async p => (await fetch(p,{cache:"no-cache"})).json();

async function loadAutoMeta(){
  const el=document.getElementById("auto-pill");
  if(!el) return;
  try{
    const m=await fetchJSON("data/meta.json");
    if(m.autoCheck) el.textContent="自动巡检："+m.autoCheck;
  }catch(e){ el.textContent="自动巡检：待首次运行"; }
}

// 页面变动提醒（alerts.json）：官方页有变动 → 人工核价
async function loadPageAlerts(){
  try{
    const list=await fetchJSON("data/alerts.json");
    const open=list.filter(a=>!a.resolved);
    const box=document.getElementById("page-alerts");
    if(!open.length || !box) return;
    box.innerHTML=open.map(a=>`
      <div class="alert warn"><span class="ico">🔎</span><div>
        <b>${esc(a.label)} 内容有变动，价格待人工核实</b>
        <small>${tierBadge(a.tier||"official")} 自动巡检发现于 ${esc(a.detected)} · 原始页面：<a href="${esc(a.url)}" target="_blank">${esc(a.url)}</a></small>
      </div></div>`).join("");
  }catch(e){/* alerts 数据不存在时静默 */}
}

/* ================= 促销 / 停售（data/promos.json，人工确认） ================= */
async function renderPromos(){
  const box=document.getElementById("promo-timeline");
  const hero=document.getElementById("hero-promos");
  let j;
  try{ j=await fetchJSON("data/promos.json"); }
  catch(e){
    if(box) box.innerHTML='<p style="color:var(--dim)">动态数据加载失败（data/promos.json）</p>';
    return;
  }
  const items=(j.items||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const stOf=k=>(j.statusMap||{})[k]||{label:k,cls:""};

  if(hero){
    const top=items.filter(p=>p.kind==="promo"||p.kind==="delist").slice(0,2);
    hero.innerHTML=top.map(p=>`
      <div class="alert ${p.kind==="delist"?"bad":"warn"}"><span class="ico">${p.kind==="delist"?"⛔":"🔥"}</span><div>
        <b>${esc(p.title)}</b>
        <small>${p.expires?`${p.kind==="promo"?"活动截止":"生效"} ${esc(p.expires)} · `:""}来源：${p.source&&p.source.url?`<a href="${esc(p.source.url)}" target="_blank">${esc(p.source.label)}</a>`:esc(p.source&&p.source.label||"待补")} · ${esc(p.date)}${p.verified?"":' · <span class="vflag">⚠ 待重新核实</span>'}</small>
      </div></div>`).join("");
  }

  if(!box) return;
  if(!items.length){ box.innerHTML='<p style="color:var(--dim)">暂无记录</p>'; return; }
  box.innerHTML=items.map(p=>{
    const st=stOf(p.kind);
    const src=p.source&&p.source.url
      ? `<a href="${esc(p.source.url)}" target="_blank">${esc(p.source.label)}</a>`
      : esc(p.source&&p.source.label||"来源待补");
    return `<div class="tl-item">
      <div class="date">${esc(p.date)}${p.expires?` · ${p.kind==="promo"?"截止":"生效"} ${esc(p.expires)}`:""}</div>
      <h4>${esc(p.title)}</h4>
      <p>${esc(p.body)}</p>
      <div class="src-line">${tierBadge(p.source&&p.source.tier)}<span class="badge b-chip">${esc(st.label)}</span>${p.verified?"":'<span class="vflag">⚠ 待重新核实</span>'}<span>来源：${src}</span></div>
      ${p.note?`<div class="src-line">${esc(p.note)}</div>`:""}
    </div>`;
  }).join("");
}

/* ================= 白嫖 / 免费额度（data/freebies.json，人工确认） ================= */
async function renderFreebies(){
  const box=document.getElementById("freebies-grid");
  if(!box) return;
  try{
    const j=await fetchJSON("data/freebies.json");
    const items=j.items||[];
    const cnt=document.getElementById("st-free");
    if(cnt) cnt.textContent=items.length;
    box.innerHTML=items.map(f=>`
      <div class="free">
        <div class="fh"><h3>${esc(f.name)}</h3><span class="badge b-chip">${esc(f.vendor)}</span>${tierBadge(f.tier)}</div>
        <div class="offer">${esc(f.offer)}</div>
        <div class="kv"><b>额度：</b>${esc(f.limit||"—")}</div>
        <div class="kv"><b>门槛：</b>${esc(f.requires||"—")}</div>
        ${f.note?`<div class="kv">${esc(f.note)}</div>`:""}
        <div class="foot"><span>证据：${esc(f.evidence||"—")} · 核对 ${esc(j.checked||"—")}</span><a href="${esc(f.source)}" target="_blank">查看来源 ↗</a></div>
      </div>`).join("");
    const retBox=document.getElementById("freebies-retired");
    const ret=j.retired||[];
    if(retBox) retBox.innerHTML=ret.map(r=>`
      <div class="alert bad"><span class="ico">⛔</span><div>
        <b>${esc(r.name)} 已失效，不要再照着旧教程折腾</b>
        <small>${esc(r.reason)}${r.source?` · <a href="${esc(r.source)}" target="_blank">官方说明 ↗</a>`:""}</small>
      </div></div>`).join("");
  }catch(e){
    box.innerHTML='<p style="color:var(--dim)">白嫖数据加载失败（data/freebies.json）</p>';
  }
}

/* ================= 自动发现的线索队列（data/signals.json，机器产出） ================= */
function sigRow(s){
  return `<div class="sig">
    <div class="sh">${tierBadge(s.tier)}<a href="${esc(s.url)}" target="_blank">${esc(s.title)}</a></div>
    <div class="sd">${esc(s.sourceLabel)} · 本站发现于 ${esc(s.firstSeen)}${s.date?` · 原文时间 ${esc(String(s.date).slice(0,16))}`:""}</div>
    ${s.excerpt?`<div class="sd">${esc(s.excerpt)}</div>`:""}
  </div>`;
}
async function renderSignals(){
  const box=document.getElementById("signal-queue");
  if(!box) return;
  let j;
  try{ j=await fetchJSON("data/signals.json"); }
  catch(e){ box.innerHTML='<div class="pol"><p style="color:var(--dim)">线索数据尚未生成（data/signals.json），首次自动巡检后出现。</p></div>'; return; }
  const items=j.items||[];
  const promo=items.filter(i=>i.tier!=="community" && i.kind!=="availability").slice(0,12);
  const avail=items.filter(i=>i.kind==="availability").slice(0,8);
  const comm=items.filter(i=>i.tier==="community").slice(0,8);
  box.innerHTML=`
    <div class="pol" style="grid-column:1/-1">
      <div class="ico">🔎</div><h4>促销 / 价格 / 停售相关线索（${promo.length}）</h4>
      <p style="margin-bottom:6px">来自官方 changelog、价格库与免费模型清单的机器线索。<b>机器只负责发现，未经人工确认不会写进价格表。</b></p>
      ${promo.length?promo.map(sigRow).join(""):'<p style="color:var(--dim);font-size:13px">暂无线索</p>'}
    </div>
    <div class="pol" style="grid-column:1/-1">
      <div class="ico">🩺</div><h4>官方状态页事件（${avail.length}）</h4>
      <p style="margin-bottom:6px">仅服务可用性事件，用来<b>证伪或证实「降级 / 停售」类传言</b>；与促销无关，故单独列出不混排。</p>
      ${avail.length?avail.map(sigRow).join(""):'<p style="color:var(--dim);font-size:13px">暂无事件</p>'}
    </div>
    <div class="pol" style="grid-column:1/-1">
      <div class="ico">💬</div><h4>社区情报线索（${comm.length}）</h4>
      <p style="margin-bottom:6px">黄色标注，<b>仅作线索提示，不作为数据结论</b>。若长期为空，请查看下方「信息源健康」，那里会如实显示哪个源没抓到东西。</p>
      ${comm.length?comm.map(sigRow).join(""):'<p style="color:var(--dim);font-size:13px">暂无线索</p>'}
    </div>`;
}

/* ================= 信息源健康（data/sourcehealth.json，机器产出） ================= */
async function renderSourceHealth(){
  const box=document.getElementById("source-health");
  if(!box) return;
  try{
    const j=await fetchJSON("data/sourcehealth.json");
    const list=Object.values(j.sources||{});
    if(!list.length){ box.innerHTML=""; return; }
    const chips=list.map(s=>{
      const dead=s.ok===false&&(s.consecutiveFailures||0)>=3;
      const cls=dead?"bad":(s.unstable||s.ok===false)?"warn":"";
      const extra=dead?"（已失效）":s.unstable?"（需人工核对）":"";
      const tip=dead?`连续 ${s.consecutiveFailures} 天抓取失败${s.error?`（${s.error}）`:""}`
        :s.unstable?"页面内容在多个渲染变体间跳变，哈希对比不可靠，已暂停自动预警，价格需人工核对"
        :s.ok===false?`上次抓取失败${s.error?`（${s.error}）`:""}`
        :`最后成功 ${s.lastOk||"—"}${s.detail?` · ${s.detail}`:""}`;
      return `<span class="h-item ${dead?"dead":""}" title="${esc(tip)}"><span class="h-dot ${cls}"></span>${esc(s.label)}${extra}</span>`;
    }).join("");
    box.innerHTML=`<div class="health">${chips}</div>
      <p style="font-size:12px;color:var(--dim);margin-top:8px">绿点＝最近一次抓取成功；黄点＝失败未达阈值，或该页内容不稳定（已暂停自动预警、需人工核对）；红点＝连续 3 天失败，判定为<b>已失效</b>——站点会如实标注，不再假装该源在正常工作。巡检时间：${esc(j.updatedAt||"—")}。部分社区源（LINUX DO / V2EX）在中国大陆线路不可达，仅 GitHub Actions 海外出口可抓，其成败同样在此如实呈现。</p>`;
  }catch(e){ box.innerHTML=""; }
}

/* ================= init ================= */
document.getElementById("st-plat").textContent=PLAN_DATA.filter(d=>d.status!=="bad").length;
document.getElementById("st-tier").textContent=PLAN_DATA.reduce((s,d)=>s+d.tiers.length,0);
loadAutoMeta();
bind(); renderPlans(); renderCards(); renderRepos(); renderIde(); renderChangelog(); renderCalc(); loadModels(); loadPageAlerts();
renderPromos(); renderFreebies(); renderSignals(); renderSourceHealth();
