/* ─────────────────────────────────────────────────────────────────────────
   SHIKAI app logic — auth (OTP) · search · deep research · browser · AI editor
   ───────────────────────────────────────────────────────────────────────── */
"use strict";

// Backend (Hugging Face Space). Change here if you fork the space.
const API = "https://krazyguylol99-shikaihelp.hf.space";

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

const store = {
  get t(){ return localStorage.getItem("shikai_token"); },
  get e(){ return localStorage.getItem("shikai_email"); },
  set(tok,email){ localStorage.setItem("shikai_token",tok); localStorage.setItem("shikai_email",email); },
  clear(){ localStorage.removeItem("shikai_token"); localStorage.removeItem("shikai_email"); },
};

/* ── falling leaves ─────────────────────────────────────────────────────── */
function spawnLeaves(){
  const box = $("#leaves"); if(!box) return;
  box.innerHTML = "";
  const N = 18;
  for(let i=0;i<N;i++){
    const l = document.createElement("div");
    l.className = "leaf";
    const dur = 5 + Math.random()*6;
    l.style.left = Math.random()*100 + "%";
    l.style.setProperty("--drift", (Math.random()*120-60)+"px");
    l.style.animationDuration = dur+"s";
    l.style.animationDelay = (-Math.random()*dur)+"s";
    const s = 7+Math.random()*8; l.style.width=s+"px"; l.style.height=s+"px";
    l.style.opacity = .4+Math.random()*.5;
    box.appendChild(l);
  }
}

/* ── screen routing ─────────────────────────────────────────────────────── */
function show(screen){
  $$(".screen").forEach(s=>s.classList.toggle("active", s.id===screen));
  $$(".nav-item").forEach(n=>n.classList.toggle("active", n.dataset.screen===screen));
}
function enterApp(){
  $("#nav").style.display = "flex";
  show("search");
  $("#acctEmail").textContent = store.e || "—";
  $("#acctAvatar").textContent = (store.e||"S")[0].toUpperCase();
  setTimeout(()=>$("#q")?.focus(), 300);
}

/* ── auth: messages ─────────────────────────────────────────────────────── */
const msg = $("#auth-msg");
function setMsg(text, kind="info"){ msg.textContent=text; msg.className="auth-msg "+kind; }

/* ── auth: send OTP ─────────────────────────────────────────────────────── */
async function sendOTP(){
  const email = $("#email").value.trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ setMsg("Enter a valid email address","err"); return; }
  const btn = $("#send-btn"); const old = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Sending…';
  try{
    const r = await fetch(API+"/otp/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});
    const d = await r.json();
    if(d.ok){
      $("#otp-email").textContent = email;
      $("#step-email").classList.remove("active");
      $("#step-otp").classList.add("active");
      setMsg("Code sent — check your inbox","ok");
      $$(".otp-box")[0].focus();
    } else setMsg(d.error||"Failed to send code","err");
  }catch(e){ setMsg("Network error — is the backend awake?","err"); }
  btn.disabled=false; btn.innerHTML=old;
}

/* ── auth: verify OTP ───────────────────────────────────────────────────── */
async function verifyOTP(){
  const code = $$(".otp-box").map(b=>b.value).join("");
  const email = $("#otp-email").textContent;
  if(code.length!==6){ setMsg("Enter all 6 digits","err"); return; }
  const btn=$("#verify-btn"); const old=btn.innerHTML;
  btn.disabled=true; btn.innerHTML='<span class="spin"></span> Verifying…';
  try{
    const r=await fetch(API+"/otp/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,code})});
    const d=await r.json();
    if(d.ok){ store.set(d.token,d.email); setMsg("Welcome to Shikai","ok"); setTimeout(enterApp,400); }
    else { setMsg(d.error||"Verification failed","err"); $$(".otp-box").forEach(b=>{b.value="";b.classList.remove("filled")}); $$(".otp-box")[0].focus(); }
  }catch(e){ setMsg("Network error","err"); }
  btn.disabled=false; btn.innerHTML=old;
}

/* ── OTP box UX ─────────────────────────────────────────────────────────── */
function wireOTP(){
  const boxes = $$(".otp-box");
  boxes.forEach((b,i)=>{
    b.addEventListener("input",()=>{
      b.value=b.value.replace(/\D/g,"").slice(0,1);
      b.classList.toggle("filled", !!b.value);
      if(b.value && i<boxes.length-1) boxes[i+1].focus();
      if(boxes.every(x=>x.value)) verifyOTP();
    });
    b.addEventListener("keydown",e=>{
      if(e.key==="Backspace" && !b.value && i>0){ boxes[i-1].focus(); boxes[i-1].value=""; boxes[i-1].classList.remove("filled"); }
    });
    b.addEventListener("paste",e=>{
      e.preventDefault();
      const t=(e.clipboardData.getData("text")||"").replace(/\D/g,"").slice(0,6);
      t.split("").forEach((ch,j)=>{ if(boxes[j]){boxes[j].value=ch;boxes[j].classList.add("filled");} });
      if(t.length===6) verifyOTP(); else boxes[Math.min(t.length,5)].focus();
    });
  });
}

/* ── SSE reader (fetch stream) ──────────────────────────────────────────── */
async function sseStream(url, onEvent, signal){
  const res = await fetch(url,{signal});
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf="";
  while(true){
    const {done,value} = await reader.read();
    if(done) break;
    buf += dec.decode(value,{stream:true});
    const lines = buf.split("\n"); buf = lines.pop();
    for(const ln of lines){
      if(!ln.startsWith("data: ")) continue;
      const p = ln.slice(6).trim();
      if(p==="[DONE]"){ onEvent({__done:true}); return; }
      try{ onEvent(JSON.parse(p)); }catch(_){}
    }
  }
}

/* ── search dispatcher ──────────────────────────────────────────────────── */
let _searchCtrl=null;
function go(){
  const raw = $("#q").value.trim();
  if(!raw) return;
  if(_searchCtrl){ _searchCtrl.abort(); _searchCtrl=null; }
  const m = raw.match(/^\/(search|research)\s+(.+)/i);
  if(m) deepResearch(m[2].trim());
  else normalSearch(raw);
}

function resetSearchUI(){
  $("#stats").classList.remove("show");
  $("#results").innerHTML="";
  $("#aiCard").classList.remove("show");
  $("#aiAnswer").innerHTML=""; $("#aiDetail").innerHTML="";
  $("#research").classList.remove("show");
  ["rPlan","rStatus","rReport","rSources"].forEach(id=>$("#"+id).style.display="none");
  $("#rPlanBody").innerHTML=""; $("#rReportBody").innerHTML=""; $("#rSourcesBody").innerHTML="";
}

/* ── normal search (+ AI overview) ──────────────────────────────────────── */
async function normalSearch(q){
  resetSearchUI();
  $("#loader").classList.add("show"); $("#ltxt").textContent="querying 10 engines in parallel…";
  _searchCtrl = new AbortController();
  let data;
  try{
    const r = await fetch(`${API}/search?q=${encodeURIComponent(q)}&n=8`,{signal:_searchCtrl.signal});
    data = await r.json();
  }catch(e){ $("#loader").classList.remove("show"); $("#results").innerHTML=`<div class="empty">network error — ${esc(e.message)}</div>`; return; }
  $("#loader").classList.remove("show");

  $("#stats").innerHTML = `<span style="color:var(--t2)">${esc(q)}</span><span><span class="v">${data.count}</span> results</span><span><span class="v">${data.took_ms}</span>ms</span><span><span class="v">10</span> engines</span>`;
  $("#stats").classList.add("show");

  if(!data.results||!data.results.length){ $("#results").innerHTML=`<div class="empty">no results found</div>`; return; }
  $("#results").innerHTML = data.results.map((r,i)=>{
    let dom=""; try{dom=new URL(r.url).hostname.replace(/^www\./,"");}catch(_){}
    return `<div class="card" style="animation-delay:${(i*.028).toFixed(3)}s">
      <div class="card-top"><span class="card-dom">${esc(dom||r.url)}</span><span class="sd sd-${esc(r.source)}"></span></div>
      <div class="card-title"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title||"Untitled")}</a></div>
      ${r.snippet?`<div class="card-snip">${esc(r.snippet)}</div>`:""}
    </div>`;
  }).join("");

  streamAI(q, data.results);
}

async function streamAI(q, results){
  const card=$("#aiCard"), ansEl=$("#aiAnswer"), detEl=$("#aiDetail");
  const snippets = results.filter(r=>r.snippet&&r.snippet.trim()).slice(0,8).map(r=>({title:r.title,snippet:r.snippet}));
  card.classList.add("show");
  ansEl.innerHTML='<span class="cur"></span>'; detEl.innerHTML="";
  let buf="", ans="", det="", answerDone=false;
  const render=()=>{
    const a=buf.match(/ANSWER:\s*(.+?)(?:\n|$)/s), d=buf.match(/DETAIL:\s*([\s\S]*)/);
    if(a){ans=a[1].trim();answerDone=true;}
    if(d){det=d[1].trim();}
    if(answerDone){ ansEl.textContent=ans; detEl.innerHTML=esc(det)+(det?'<span class="cur"></span>':""); }
    else ansEl.innerHTML=esc(buf.replace(/^ANSWER:\s*/,""))+'<span class="cur"></span>';
  };
  const url=`${API}/ai?q=${encodeURIComponent(q)}&snippets=${encodeURIComponent(JSON.stringify(snippets))}`;
  try{
    await sseStream(url, ev=>{
      if(ev.__done){ ansEl.textContent=ans||"—"; detEl.textContent=det; return; }
      if(ev.e){ ansEl.textContent="AI unavailable"; detEl.textContent=ev.e; return; }
      if(ev.t){ buf+=ev.t; render(); }
    }, _searchCtrl?.signal);
  }catch(e){ if(e.name!=="AbortError"){ansEl.textContent="AI error";detEl.textContent=e.message;} }
}

/* ── deep research (/search command) — NO AI overview ───────────────────── */
async function deepResearch(q){
  resetSearchUI();
  $("#research").classList.add("show");
  $("#stats").innerHTML=`<span style="color:var(--t2)">deep research</span><span><span class="v">${esc(q)}</span></span>`;
  $("#stats").classList.add("show");
  $("#rStatus").style.display="block"; $("#rStatusTxt").textContent="Planning research…";
  _searchCtrl=new AbortController();

  let sources=[], report="";
  const renderReport=()=>{
    const html = esc(report).replace(/\[(\d+)\]/g,'<span class="cite" data-n="$1">[$1]</span>');
    $("#rReportBody").innerHTML = html + '<span class="cur"></span>';
  };
  const renderSources=()=>{
    $("#rSrcCount").textContent = `Sources · ${sources.length}`;
    $("#rSourcesBody").innerHTML = sources.map((s,i)=>{
      let dom=""; try{dom=new URL(s.url).hostname.replace(/^www\./,"");}catch(_){}
      return `<div class="src" data-n="${i+1}"><div class="num">${i+1}</div><div class="meta">
        <div class="st"><a href="${esc(s.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${esc(s.title||"Untitled")}</a></div>
        <div class="su">${esc(dom||s.url)}</div></div></div>`;
    }).join("");
  };

  try{
    await sseStream(`${API}/research?q=${encodeURIComponent(q)}`, ev=>{
      if(ev.__done){ $("#rStatus").style.display="none"; if(report) $("#rReportBody").innerHTML=esc(report).replace(/\[(\d+)\]/g,'<span class="cite" data-n="$1">[$1]</span>'); return; }
      if(ev.e){ $("#rStatusTxt").textContent="Error: "+ev.e; return; }
      if(ev.phase==="plan" && ev.queries){
        $("#rPlan").style.display="block";
        $("#rPlanBody").innerHTML = ev.queries.map(x=>`<span class="qchip">${esc(x)}</span>`).join("");
      }
      if(ev.status){ $("#rStatus").style.display="block"; $("#rStatusTxt").textContent=ev.status; }
      if(ev.phase==="sources" && ev.sources){ sources=ev.sources; $("#rSources").style.display="block"; renderSources(); }
      if(ev.phase==="answer"){
        if(ev.status){ $("#rStatusTxt").textContent=ev.status; }
        if(ev.t){ $("#rReport").style.display="block"; report+=ev.t; renderReport(); }
      }
    }, _searchCtrl.signal);
  }catch(e){ if(e.name!=="AbortError") $("#rStatusTxt").textContent="error: "+e.message; }

  // citation → scroll to source
  $("#rReportBody").addEventListener("click",e=>{
    const c=e.target.closest(".cite"); if(!c) return;
    const el=$(`.src[data-n="${c.dataset.n}"]`); if(el) el.scrollIntoView({behavior:"smooth",block:"center"});
  });
}

/* ── browser ────────────────────────────────────────────────────────────── */
let _editOn=false;
const frame=$("#browserFrame");
function browse(){
  let u=$("#url").value.trim(); if(!u) return;
  if(!/^https?:\/\//i.test(u)){
    if(/^[\w-]+(\.[\w-]+)+/.test(u)) u="https://"+u;        // looks like a domain
    else { go2search(u); return; }                          // else treat as search query
  }
  $("#frameEmpty").style.display="none";
  $("#frameLoading").classList.add("show");
  frame.src = `${API}/proxy?url=${encodeURIComponent(u)}`;
}
function go2search(query){
  $("#q").value=query; show("search"); go();
}
frame.addEventListener("load",()=>$("#frameLoading").classList.remove("show"));

function frameCmd(cmd, extra={}){ try{ frame.contentWindow.postMessage(Object.assign({shikaiCmd:cmd},extra),"*"); }catch(e){} }

/* AI editor sheet */
function openSheet(){ $("#aiSheet").classList.add("show"); $("#backdrop").classList.add("show"); $("#aiEditInput").focus(); }
function closeSheet(){ $("#aiSheet").classList.remove("show"); $("#backdrop").classList.remove("show"); }

// request page context from the proxied frame (best-effort)
function getFrameContext(){
  return new Promise(resolve=>{
    let done=false;
    const h=ev=>{ const d=ev.data||{}; if(d.shikai==="context"){ done=true; window.removeEventListener("message",h); resolve(d.html||""); } };
    window.addEventListener("message",h);
    frameCmd("getContext");
    setTimeout(()=>{ if(!done){ window.removeEventListener("message",h); resolve(""); } }, 1200);
  });
}
async function applyAIEdit(){
  const instruction=$("#aiEditInput").value.trim(); if(!instruction) return;
  const btn=$("#aiEditApply"); const old=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spin"></span> Thinking…';
  try{
    const context=await getFrameContext();
    const r=await fetch(API+"/ai/edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({instruction,context})});
    const d=await r.json();
    if(d.css) frameCmd("applyCSS",{css:d.css});
    if(d.js)  frameCmd("applyJS",{js:d.js});
    closeSheet(); $("#aiEditInput").value="";
  }catch(e){ alert("AI edit failed: "+e.message); }
  btn.disabled=false; btn.innerHTML=old;
}

/* injected-frame postMessage listener (loaded notifications etc.) */
window.addEventListener("message",ev=>{
  const d=ev.data||{};
  if(d.shikai==="loaded"){ $("#frameLoading").classList.remove("show"); }
});

/* ── wire everything ────────────────────────────────────────────────────── */
function init(){
  spawnLeaves(); wireOTP();

  $("#send-btn").addEventListener("click",sendOTP);
  $("#email").addEventListener("keydown",e=>{if(e.key==="Enter")sendOTP();});
  $("#verify-btn").addEventListener("click",verifyOTP);
  $("#resend-btn").addEventListener("click",sendOTP);
  $("#back-email").addEventListener("click",()=>{ $("#step-otp").classList.remove("active"); $("#step-email").classList.add("active"); setMsg(""); });

  $("#go").addEventListener("click",go);
  $("#q").addEventListener("keydown",e=>{if(e.key==="Enter")go();});

  $("#bGo").addEventListener("click",browse);
  $("#bReload").addEventListener("click",()=>{ if(frame.src) frame.contentWindow.location.reload(); });
  $("#url").addEventListener("keydown",e=>{if(e.key==="Enter")browse();});
  $("#bInspect").addEventListener("click",()=>frameCmd("inspect"));
  $("#bEdit").addEventListener("click",function(){ _editOn=!_editOn; this.classList.toggle("on",_editOn); frameCmd("edit"); });
  $("#bAI").addEventListener("click",openSheet);
  $("#aiEditCancel").addEventListener("click",closeSheet);
  $("#backdrop").addEventListener("click",closeSheet);
  $("#aiEditApply").addEventListener("click",applyAIEdit);

  $$(".nav-item").forEach(n=>n.addEventListener("click",()=>show(n.dataset.screen)));
  $("#signout").addEventListener("click",()=>{ store.clear(); $("#nav").style.display="none"; show("auth"); $("#step-otp").classList.remove("active"); $("#step-email").classList.add("active"); $$(".otp-box").forEach(b=>{b.value="";b.classList.remove("filled")}); setMsg(""); spawnLeaves(); });

  // auto-login
  if(store.t) enterApp();
  else show("auth");
}
document.addEventListener("DOMContentLoaded",init);
