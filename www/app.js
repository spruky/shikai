/* ───────────────────────────────────────────────────────────────────────────
   SHIKAI app — search · AI overview · deep research · fullscreen AI browser
   AI calls go DIRECT from the app (creds AES-encrypted). HF only does search/proxy.
   ──────────────────────────────────────────────────────────────────────────── */
"use strict";

const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc= s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// Search backend (HF Space)
const API = "https://krazyguylol99-shikaihelp.hf.space";

/* ── encrypted credentials (AES-256-GCM, decrypted at runtime) ───────────────
   blob holds: aiUrl, aiKey, aiModel, apiKey  — nothing readable in the APK.   */
const _BLOB = {
  k:"7LbzYPMYMs8fAysejr4RAyCbD6/zW7tRgAYL06HodmA=",
  iv:"5kvaXXPK9GDf5D32",
  ct:"KHhLu646PM4XpgXsFvMt/aHPuepRbgteKFv9gCnea5fWe96u0UHiKmKJdxejfivDa2CMFPTwZrRrhmKbz/kvMmNDivOGbsuUyUKvyDFXyNEtfH6G271IJvt4IVh7iuZ5ECVlxh5QbMh1Ff/qTduCg50tmTHvsXxdrB86wgsGykNmmbbKKmN6s7fC3m422fIQ7gMwDvG4jiQG561jD5FV/oYSILR6iVNfX4egOeRGdUVd26yfr7SruTWpZv+magTICcwiA2Ki"
};
let CREDS = null;   // {aiUrl, aiKey, aiModel, apiKey}
const _b64 = s=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
async function unlock(){
  try{
    const key=await crypto.subtle.importKey("raw",_b64(_BLOB.k),"AES-GCM",false,["decrypt"]);
    const pt =await crypto.subtle.decrypt({name:"AES-GCM",iv:_b64(_BLOB.iv)},key,_b64(_BLOB.ct));
    CREDS=JSON.parse(new TextDecoder().decode(pt));
  }catch(e){ console.error("unlock failed",e); CREDS={}; }
}
const apiHeaders = (ex)=>Object.assign({"X-Shikai-Key":CREDS?.apiKey||""},ex||{});
const withKey = u=>u+(u.includes("?")?"&":"?")+"key="+encodeURIComponent(CREDS?.apiKey||"");

/* ── direct AI streaming (OpenAI-compatible SSE) ───────────────────────────── */
async function aiStream(messages, onDelta, {signal, max_tokens=600, temperature=0.3}={}){
  const res = await fetch(CREDS.aiUrl,{
    method:"POST", signal,
    headers:{"Authorization":`Bearer ${CREDS.aiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({model:CREDS.aiModel,messages,stream:true,max_tokens,temperature})
  });
  if(!res.ok){ throw new Error("AI "+res.status); }
  const reader=res.body.getReader(); const dec=new TextDecoder(); let buf="";
  while(true){
    const {done,value}=await reader.read(); if(done) break;
    buf+=dec.decode(value,{stream:true});
    const lines=buf.split("\n"); buf=lines.pop();
    for(const ln of lines){
      const t=ln.trim(); if(!t.startsWith("data:")) continue;
      const p=t.slice(5).trim(); if(p==="[DONE]") return;
      try{ const d=JSON.parse(p).choices?.[0]?.delta?.content; if(d) onDelta(d); }catch(_){}
    }
  }
}
async function aiComplete(messages, opts={}){
  let out=""; await aiStream(messages, d=>out+=d, {max_tokens:opts.max_tokens||400, temperature:opts.temperature??0.2, signal:opts.signal});
  return out.trim();
}

/* ── search backend SSE (only used for /proxy now; kept generic) ───────────── */
async function backendSSE(url, onEvent, signal){
  const res=await fetch(url,{signal,headers:apiHeaders()});
  const reader=res.body.getReader(); const dec=new TextDecoder(); let buf="";
  while(true){
    const {done,value}=await reader.read(); if(done) break;
    buf+=dec.decode(value,{stream:true});
    const lines=buf.split("\n"); buf=lines.pop();
    for(const ln of lines){
      if(!ln.startsWith("data: ")) continue;
      const p=ln.slice(6).trim(); if(p==="[DONE]"){onEvent({__done:true});return;}
      try{onEvent(JSON.parse(p));}catch(_){}
    }
  }
}

/* ── routing ───────────────────────────────────────────────────────────────── */
function show(screen){
  $$(".screen").forEach(s=>s.classList.toggle("active",s.id===screen));
  $$(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.screen===screen));
}
function enterApp(){
  $("#splash").classList.remove("active");
  $("#nav").hidden=false;
  show("search");
  setTimeout(()=>$("#q")?.focus(),300);
}

/* ── falling leaves ─────────────────────────────────────────────────────────*/
function spawnLeaves(){
  const box=$("#leaves"); if(!box) return; box.innerHTML="";
  for(let i=0;i<16;i++){
    const l=document.createElement("div"); l.className="leaf";
    const dur=5+Math.random()*6, sz=6+Math.random()*8;
    l.style.left=Math.random()*100+"%";
    l.style.setProperty("--drift",(Math.random()*140-70)+"px");
    l.style.animationDuration=dur+"s";
    l.style.animationDelay=(-Math.random()*dur)+"s";
    l.style.width=sz+"px"; l.style.height=sz+"px";
    box.appendChild(l);
  }
}

/* ════════════════════════ SEARCH ════════════════════════ */
let _ctrl=null;
function doSearch(){
  const raw=$("#q").value.trim(); if(!raw) return;
  if(_ctrl){_ctrl.abort();} _ctrl=new AbortController();
  $("#q").blur();
  const m=raw.match(/^\/(search|research)\s+(.+)/i);
  if(m) research(m[2].trim()); else normalSearch(raw);
}
function resetUI(){
  $("#stats").classList.remove("show"); $("#stats").innerHTML="";
  $("#results").innerHTML="";
  $("#aiCard").classList.remove("show"); $("#aiAnswer").innerHTML=""; $("#aiDetail").innerHTML="";
  $("#research").classList.remove("show");
  ["rPlan","rStatus","rReport","rSummary","rSources"].forEach(id=>$("#"+id).hidden=true);
  ["rPlanBody","rReportBody","rSummaryBody","rSourcesBody"].forEach(id=>$("#"+id).innerHTML="");
}

async function normalSearch(q){
  resetUI();
  $("#loader").classList.add("show"); $("#ltxt").textContent="querying 10 engines…";
  let data;
  try{
    const r=await fetch(`${API}/search?q=${encodeURIComponent(q)}&n=8`,{signal:_ctrl.signal,headers:apiHeaders()});
    data=await r.json();
  }catch(e){
    $("#loader").classList.remove("show");
    if(e.name!=="AbortError") $("#results").innerHTML=`<div class="empty">network error — ${esc(e.message)}</div>`;
    return;
  }
  $("#loader").classList.remove("show");
  $("#stats").innerHTML=`<span style="color:var(--t2)">${esc(q)}</span><span><span class="v">${data.count}</span> results</span><span><span class="v">${data.took_ms}</span>ms</span><span><span class="v">10</span> engines</span>`;
  $("#stats").classList.add("show");
  if(!data.results?.length){ $("#results").innerHTML=`<div class="empty">no results found</div>`; return; }
  $("#results").innerHTML=data.results.map((r,i)=>{
    let dom=""; try{dom=new URL(r.url).hostname.replace(/^www\./,"");}catch(_){}
    return `<div class="card" style="animation-delay:${(i*.025).toFixed(3)}s">
      <div class="card-top"><span class="card-dom">${esc(dom||r.url)}</span><span class="sd sd-${esc(r.source)}"></span></div>
      <div class="card-title"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title||"Untitled")}</a></div>
      ${r.snippet?`<div class="card-snip">${esc(r.snippet)}</div>`:""}</div>`;
  }).join("");
  aiOverview(q,data.results);
}

async function aiOverview(q,results){
  const card=$("#aiCard"),ansEl=$("#aiAnswer"),detEl=$("#aiDetail");
  const ctx=results.filter(r=>r.snippet?.trim()).slice(0,8).map(r=>`- ${r.title}: ${r.snippet.slice(0,200)}`).join("\n");
  card.classList.add("show"); ansEl.innerHTML='<span class="cur"></span>'; detEl.innerHTML="";
  const prompt=`Respond in English only.\nUser searched: "${q}"\n\nSearch snippets:\n${ctx}\n\nReply EXACTLY:\nANSWER: <one direct sentence, max 12 words, no period>\nDETAIL: <3-4 sentence factual paragraph>`;
  let buf="",ans="",det="",done=false;
  const render=()=>{
    const a=buf.match(/ANSWER:\s*(.+?)(?:\n|$)/s), d=buf.match(/DETAIL:\s*([\s\S]*)/);
    if(a){ans=a[1].trim();done=true;} if(d){det=d[1].trim();}
    if(done){ansEl.textContent=ans;detEl.innerHTML=esc(det)+(det?'<span class="cur"></span>':"");}
    else ansEl.innerHTML=esc(buf.replace(/^ANSWER:\s*/,""))+'<span class="cur"></span>';
  };
  try{
    await aiStream([{role:"user",content:prompt}], d=>{buf+=d;render();}, {signal:_ctrl.signal,max_tokens:400});
    ansEl.textContent=ans||"—"; detEl.textContent=det;
  }catch(e){ if(e.name!=="AbortError"){ansEl.textContent="AI unavailable";detEl.textContent=String(e.message);} }
}

/* ════════════════════════ DEEP RESEARCH (no AI overview) ════════════════════
   Orchestrated client-side: AI plan → parallel backend search → AI report → AI summary */
async function research(q){
  resetUI();
  $("#research").classList.add("show");
  $("#stats").innerHTML=`<span style="color:var(--t2)">deep research</span><span><span class="v">${esc(q)}</span></span>`;
  $("#stats").classList.add("show");
  const setStatus=t=>{ $("#rStatus").hidden=false; $("#rStatusTxt").textContent=t; };
  const sig=_ctrl.signal;

  try{
    // 1) plan
    setStatus("Planning research…");
    const planRaw=await aiComplete([{role:"user",content:
      `You are a research planner for: "${q}".\nOutput 4 focused web-search queries covering the topic. Return ONLY a JSON array of strings.`}],
      {max_tokens:200,temperature:0.4,signal:sig});
    let queries=[]; const mm=planRaw.match(/\[[\s\S]*\]/);
    if(mm){ try{ queries=JSON.parse(mm[0]).map(String).slice(0,4); }catch(_){} }
    if(!queries.length) queries=[q,`${q} overview`,`${q} latest`,`${q} explained`];
    $("#rPlan").hidden=false;
    $("#rPlanBody").innerHTML=queries.map(x=>`<span class="qchip">${esc(x)}</span>`).join("");

    // 2) parallel search via backend
    setStatus(`Searching ${queries.length} angles in parallel…`);
    const seen=new Set(), sources=[];
    const batches=await Promise.all(queries.map(sq=>
      fetch(`${API}/search?q=${encodeURIComponent(sq)}&n=4&engines=ddg,bing,brave,mojeek,wikipedia,gnews`,
        {signal:sig,headers:apiHeaders()}).then(r=>r.json()).catch(()=>({results:[]}))
    ));
    for(const b of batches) for(const r of (b.results||[])) if(!seen.has(r.url)){seen.add(r.url);sources.push(r);}
    const srcSlice=sources.slice(0,30);
    $("#rSources").hidden=false; $("#rSrcCount").textContent=`Sources · ${srcSlice.length}`;
    $("#rSourcesBody").innerHTML=srcSlice.map((s,i)=>{
      let dom=""; try{dom=new URL(s.url).hostname.replace(/^www\./,"");}catch(_){}
      return `<div class="src" data-n="${i+1}"><div class="num">${i+1}</div><div class="meta">
        <div class="st"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title||"Untitled")}</a></div>
        <div class="su">${esc(dom||s.url)}</div></div></div>`;
    }).join("");

    // 3) synthesize report (streamed)
    setStatus("Synthesizing report…");
    const ctx=srcSlice.slice(0,16).map((s,i)=>`[${i+1}] ${s.title} (${s.url}): ${(s.snippet||"").slice(0,240)}`).join("\n");
    $("#rReport").hidden=false;
    let report="";
    const renderReport=()=>{ $("#rReportBody").innerHTML=esc(report).replace(/\[(\d+)\]/g,'<span class="cite" data-n="$1">[$1]</span>')+'<span class="cur"></span>'; };
    await aiStream([{role:"user",content:
      `English only. You are a deep-research assistant.\nTopic: "${q}"\n\nSources:\n${ctx}\n\nWrite a thorough, well-structured report (4-6 paragraphs). Cite sources inline like [1], [3]. Be factual; do not invent sources.`}],
      d=>{report+=d;renderReport();}, {signal:sig,max_tokens:1000,temperature:0.35});
    $("#rReportBody").innerHTML=esc(report).replace(/\[(\d+)\]/g,'<span class="cite" data-n="$1">[$1]</span>');

    // 4) final summary (the user-requested TL;DR after research)
    setStatus("Writing summary…");
    $("#rSummary").hidden=false;
    let summary="";
    await aiStream([{role:"user",content:
      `English only. Based on this research report, write a clear 3-4 sentence executive summary (TL;DR) for the user. No citations, no headers, just the key takeaways.\n\nReport:\n${report.slice(0,3000)}`}],
      d=>{summary+=d; $("#rSummaryBody").innerHTML=esc(summary)+'<span class="cur"></span>';},
      {signal:sig,max_tokens:300,temperature:0.4});
    $("#rSummaryBody").textContent=summary;

    $("#rStatus").hidden=true;
  }catch(e){
    if(e.name!=="AbortError") setStatus("Error: "+e.message);
    else $("#rStatus").hidden=true;
  }

  // citation click → scroll to source
  $("#rReportBody").onclick=e=>{
    const c=e.target.closest(".cite"); if(!c) return;
    const el=$(`.src[data-n="${c.dataset.n}"]`); el?.scrollIntoView({behavior:"smooth",block:"center"});
  };
}

/* ════════════════════════ FULLSCREEN BROWSER ════════════════════════ */
const frame=$("#browserFrame");
let _editOn=false, _curUrl="";

function normalizeTarget(v){
  v=v.trim(); if(!v) return null;
  if(/^https?:\/\//i.test(v)) return v;
  if(/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v)) return "https://"+v;
  return null; // treat as search
}
function openBrowser(target){
  _curUrl=target;
  $("#fsUrl").textContent=target.replace(/^https?:\/\//,"");
  $("#fsLoading").classList.add("show");
  $("#fsbrowser").classList.add("show");
  frame.src=withKey(`${API}/proxy?url=${encodeURIComponent(target)}`);
}
function closeBrowser(){ $("#fsbrowser").classList.remove("show"); setTimeout(()=>{frame.src="about:blank";},340); }
function browseFromHome(){
  const v=$("#url").value.trim(); if(!v) return;
  const t=normalizeTarget(v);
  if(t){ $("#url").blur(); openBrowser(t); }
  else { $("#q").value=v; show("search"); doSearch(); }   // not a URL → search it
}
frame.addEventListener("load",()=>$("#fsLoading").classList.remove("show"));
function frameCmd(cmd,extra={}){ try{ frame.contentWindow.postMessage(Object.assign({shikaiCmd:cmd},extra),"*"); }catch(_){}}

/* AI control sheet */
function openSheet(){ $("#aiSheet").classList.add("show"); $("#backdrop").classList.add("show"); $("#aiResult").hidden=true; setTimeout(()=>$("#aiEditInput").focus(),200); }
function closeSheet(){ $("#aiSheet").classList.remove("show"); $("#backdrop").classList.remove("show"); }
function getFrameContext(){
  return new Promise(resolve=>{
    let done=false;
    const h=ev=>{ const d=ev.data||{}; if(d.shikai==="context"){done=true;window.removeEventListener("message",h);resolve(d);} };
    window.addEventListener("message",h); frameCmd("getContext");
    setTimeout(()=>{ if(!done){window.removeEventListener("message",h);resolve({});} },1500);
  });
}
async function runAIControl(){
  const instruction=$("#aiEditInput").value.trim(); if(!instruction) return;
  const tBtn=$("#tAI"), apply=$("#aiEditApply"); const old=apply.innerHTML;
  apply.disabled=true; apply.innerHTML='<span class="spin"></span>'; tBtn.classList.add("busy");
  const resEl=$("#aiResult"); resEl.hidden=false; resEl.textContent="Thinking…";
  try{
    const ctx=await getFrameContext();
    const pageText=(ctx.text||"").slice(0,4000);
    const prompt=
`You are an AI that controls a web page live. The user is viewing: ${_curUrl}
Page text (truncated):
${pageText}

User instruction: "${instruction}"

Decide what to do and return ONLY JSON:
{"say":"<one short sentence to the user>","css":"<css to inject or empty>","js":"<js to run in the page or empty>"}
- For restyle/hide/dark-mode use css.
- For interaction (scroll, click, fill, extract) use js.
- For questions about the page, answer in "say" (and js empty).
Keep js safe and self-contained. No markdown.`;
    let out=""; await aiStream([{role:"user",content:prompt}], d=>out+=d, {max_tokens:700,temperature:0.3});
    let obj={}; const m=out.match(/\{[\s\S]*\}/); if(m){ try{obj=JSON.parse(m[0]);}catch(_){} }
    if(obj.css) frameCmd("applyCSS",{css:obj.css});
    if(obj.js)  frameCmd("applyJS",{js:obj.js});
    resEl.textContent=obj.say || (obj.css||obj.js ? "Done." : (out.slice(0,300)||"No action."));
    $("#aiEditInput").value="";
  }catch(e){ resEl.textContent="AI error: "+e.message; }
  apply.disabled=false; apply.innerHTML=old; tBtn.classList.remove("busy");
}

window.addEventListener("message",ev=>{
  const d=ev.data||{};
  if(d.shikai==="loaded") $("#fsLoading").classList.remove("show");
});

/* quicklinks on browser home */
const QUICK=[
  {n:"Google",u:"https://www.google.com",c:"#4285f4",t:"G"},
  {n:"YouTube",u:"https://m.youtube.com",c:"#ff0000",t:"▶"},
  {n:"Wikipedia",u:"https://en.wikipedia.org",c:"#636466",t:"W"},
  {n:"Reddit",u:"https://www.reddit.com",c:"#ff4500",t:"r"},
  {n:"GitHub",u:"https://github.com",c:"#24292e",t:"⌥"},
  {n:"X",u:"https://x.com",c:"#000",t:"𝕏"},
  {n:"HN",u:"https://news.ycombinator.com",c:"#ff6600",t:"Y"},
  {n:"Maps",u:"https://www.google.com/maps",c:"#34a853",t:"◉"},
];
function buildQuick(){
  $("#quicklinks").innerHTML=QUICK.map(q=>
    `<div class="ql" data-u="${q.u}"><div class="ico" style="background:${q.c}">${q.t}</div><span>${q.n}</span></div>`
  ).join("");
  $$("#quicklinks .ql").forEach(el=>el.onclick=()=>openBrowser(el.dataset.u));
}

/* ── init ───────────────────────────────────────────────────────────────────*/
function init(){
  unlock();           // decrypt creds in background
  spawnLeaves();
  buildQuick();

  $("#go").onclick=doSearch;
  $("#q").addEventListener("keydown",e=>{ if(e.key==="Enter"){e.preventDefault();doSearch();} });

  $("#bGo").onclick=browseFromHome;
  $("#url").addEventListener("keydown",e=>{ if(e.key==="Enter"){e.preventDefault();browseFromHome();} });

  $("#fsBack").onclick=closeBrowser;
  $("#fsReload").onclick=()=>{ if(_curUrl) openBrowser(_curUrl); };
  $("#tInspect").onclick=()=>frameCmd("inspect");
  $("#tEdit").onclick=function(){ _editOn=!_editOn; this.classList.toggle("on",_editOn); frameCmd("edit"); };
  $("#tAI").onclick=openSheet;
  $("#aiEditCancel").onclick=closeSheet;
  $("#backdrop").onclick=closeSheet;
  $("#aiEditApply").onclick=runAIControl;

  // AI control quick chips
  const chips=["dark mode","hide ads & popups","summarise this page","make text bigger","extract all links"];
  $("#aiChips").innerHTML=chips.map(c=>`<span class="ai-chip">${c}</span>`).join("");
  $$("#aiChips .ai-chip").forEach(el=>el.onclick=()=>{ $("#aiEditInput").value=el.textContent; });

  $$(".nav-item").forEach(n=>n.onclick=()=>show(n.dataset.screen));

  // splash → app
  let entered=false; const enter=()=>{ if(entered)return; entered=true; enterApp(); };
  $("#splashEnter").onclick=enter;
  $("#splash").onclick=enter;
  setTimeout(enter,2000);
}
document.addEventListener("DOMContentLoaded",init);
