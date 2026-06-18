# syntax=docker/dockerfile:1.4
# ─────────────────────────────────────────────────────────────────────────────
#  SHIKAI search engine — single-file Docker image for Hugging Face Spaces.
#  All application code is embedded below. Just build & run; exposes :7860.
#  Access is password-gated (X-Shikai-Key header or ?key=). Override via the
#  API_PASSWORD env/secret in your Space settings.
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN pip install --no-cache-dir \
        flask==3.0.3 flask-cors==4.0.1 requests==2.32.3 \
        beautifulsoup4==4.12.3 gunicorn==22.0.0

WORKDIR /app

# ── Embedded application (all code lives in this Dockerfile) ─────────────────
COPY <<'__SHIKAI_APP_EOF__' /app/app.py
# ─────────────────────────────────────────────────────────────────────────────
#  SHIKAI — multi-engine search + AI overview + deep research + OTP + proxy
#  Runs on Hugging Face Spaces (Docker), port 7860.
# ─────────────────────────────────────────────────────────────────────────────
import os, re, json, time, base64, random, smtplib, hashlib, hmac, ssl
import urllib.parse, xml.etree.ElementTree as ET
import concurrent.futures
from email.mime.text import MIMEText

from flask import Flask, request, jsonify, Response, render_template_string
from flask_cors import CORS
from bs4 import BeautifulSoup
import requests as req_lib

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# ── Access gate: every route except /health and / requires the key ──────────
_OPEN_PATHS = {"/", "/health"}
@app.before_request
def _require_key():
    if request.method == "OPTIONS":            # let CORS preflight through
        return None
    if request.path in _OPEN_PATHS:
        return None
    key = request.headers.get("X-Shikai-Key", "") or request.args.get("key", "")
    if not (key and hmac.compare_digest(key, API_PASSWORD)):
        return jsonify({"error": "unauthorized", "hint": "missing/invalid access key"}), 401
    return None


# ── Config ───────────────────────────────────────────────────────────────────
AI_KEY   = os.environ.get("AI_KEY",   "sk-iOD7c3rjnMuQcIB93qlPGQA08rOKfXNMYg5lkJ9hukJwhK6g")
AI_URL   = os.environ.get("AI_URL",   "https://new.xinjianya.top/v1/chat/completions")
AI_MODEL = os.environ.get("AI_MODEL", "grok-4.20-multi-agent-medium")

# Backend access password (the app sends it AES-encrypted, decrypts at runtime)
API_PASSWORD = os.environ.get("API_PASSWORD", "shikai_ff59b8f9acb1670e51")

SMTP_USER = os.environ.get("SMTP_USER", "illusiongpt@gmail.com")
SMTP_PASS = os.environ.get("SMTP_PASS", "cqhacwnvwiqvxsbl")
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587

# HTTPS email providers (work on Hugging Face, which blocks SMTP egress).
# Set one of these as a Space secret; OTP will use it automatically.
BREVO_API_KEY  = os.environ.get("BREVO_API_KEY", "")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
MAIL_FROM      = os.environ.get("MAIL_FROM", SMTP_USER)

OTP_SECRET = os.environ.get("OTP_SECRET", "shikai-otp-" + SMTP_PASS)
SESSION_SECRET = os.environ.get("SESSION_SECRET", "shikai-session-" + SMTP_PASS)

# ── HTTP plumbing ────────────────────────────────────────────────────────────
_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
]
def _h(extra=None):
    h = {"User-Agent": random.choice(_UAS),
         "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
         "Accept-Language": "en-US,en;q=0.9", "Accept-Encoding": "gzip, deflate",
         "DNT": "1", "Connection": "keep-alive"}
    if extra: h.update(extra)
    return h
_WP_UA = {"User-Agent": "Shikai/1.0 (research; contact illusiongpt@gmail.com)"}
_S = req_lib.Session()
def _get(url, **kw):
    kw.setdefault("timeout", 13); kw.setdefault("headers", _h()); kw.setdefault("allow_redirects", True)
    try: return _S.get(url, **kw)
    except Exception: return None
def _soup(html): return BeautifulSoup(html, "html.parser")

# ── URL decoders ─────────────────────────────────────────────────────────────
def _bing_url(href):
    m = re.search(r"[?&]u=a1([A-Za-z0-9+/=_-]+)", href)
    if m:
        try:
            raw = m.group(1).replace("_","/").replace("-","+")
            d = base64.b64decode(raw + "="*(-len(raw)%4)).decode("utf-8","ignore")
            if d.startswith("http"): return d
        except Exception: pass
    return href
def _ddg_url(href):
    if "uddg=" in href:
        try: return urllib.parse.unquote(href.split("uddg=")[1].split("&")[0])
        except Exception: pass
    return href
def _yahoo_url(href):
    m = re.search(r"/RU=([^/;]+)", href)
    if m:
        try: return urllib.parse.unquote(m.group(1))
        except Exception: pass
    return href

# ── Scrapers (all run in parallel) ───────────────────────────────────────────
def scrape_bing(q, n):
    try:
        r = _get(f"https://www.bing.com/search?q={urllib.parse.quote(q)}&count={n+5}&setlang=en-us")
        if not r: return []
        out, seen = [], set()
        for b in _soup(r.text).select("li.b_algo"):
            h2a = b.select_one("h2 a"); sn = b.select_one(".b_caption p, .b_algoSlug")
            if not h2a: continue
            url = _bing_url(h2a.get("href",""))
            if not url.startswith("http") or url in seen: continue
            seen.add(url); out.append({"title":h2a.get_text(strip=True),"url":url,"snippet":sn.get_text(strip=True) if sn else "","source":"bing"})
            if len(out)>=n: break
        return out
    except Exception: return []
def scrape_ddg(q, n):
    try:
        r = _get(f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(q)}&kl=us-en", headers=_h({"Referer":"https://duckduckgo.com/"}))
        if not r: return []
        out, seen = [], set()
        for d in _soup(r.text).select("div.result"):
            a = d.select_one("a.result__a"); sn = d.select_one(".result__snippet")
            if not a: continue
            url = _ddg_url(a.get("href",""))
            if not url.startswith("http") or url in seen: continue
            seen.add(url); out.append({"title":a.get_text(strip=True),"url":url,"snippet":sn.get_text(strip=True) if sn else "","source":"ddg"})
            if len(out)>=n: break
        return out
    except Exception: return []
def scrape_brave(q, n):
    try:
        r = _get(f"https://search.brave.com/search?q={urllib.parse.quote(q)}&source=web", headers=_h({"Referer":"https://search.brave.com/"}))
        if not r: return []
        out, seen = [], set()
        for w in _soup(r.text).select("div.result-wrapper"):
            a=w.select_one("a.l1[href]"); t=w.select_one("div.title"); sn=w.select_one("div.generic-snippet")
            if not (a and t): continue
            url=a.get("href","")
            if not url.startswith("http") or url in seen: continue
            seen.add(url); out.append({"title":t.get_text(strip=True),"url":url,"snippet":sn.get_text(strip=True) if sn else "","source":"brave"})
            if len(out)>=n: break
        return out
    except Exception: return []
def scrape_startpage(q, n):
    try:
        r = _get(f"https://www.startpage.com/search?q={urllib.parse.quote(q)}", headers=_h({"Referer":"https://www.startpage.com/"}))
        if not r: return []
        out, seen = [], set()
        for res in _soup(r.text).select("div.result"):
            ue=res.select_one("a[data-testid='result-favicon']"); te=res.select_one("a[data-testid='gl-title-link']"); se=res.select_one("p")
            if not (ue and te): continue
            url=ue.get("href","")
            if not url.startswith("http") or url in seen: continue
            seen.add(url); out.append({"title":te.get_text(strip=True),"url":url,"snippet":se.get_text(strip=True) if se else "","source":"startpage"})
            if len(out)>=n: break
        return out
    except Exception: return []
def scrape_mojeek(q, n):
    try:
        r = _get(f"https://www.mojeek.com/search?q={urllib.parse.quote(q)}")
        if not r: return []
        out, seen = [], set(); ul=_soup(r.text).select_one("ul.results-standard")
        if not ul: return []
        for li in ul.find_all("li", recursive=False):
            at=li.select_one("h2 a.title"); ao=li.select_one("a.ob"); sn=li.select_one("p.s")
            if not at: continue
            url=at.get("href") or (ao.get("href","") if ao else "")
            if not url.startswith("http") or url in seen: continue
            seen.add(url); out.append({"title":at.get_text(strip=True),"url":url,"snippet":sn.get_text(strip=True) if sn else "","source":"mojeek"})
            if len(out)>=n: break
        return out
    except Exception: return []
def scrape_yahoo(q, n):
    try:
        r = _get(f"https://search.yahoo.com/search?p={urllib.parse.quote(q)}&n={n+5}")
        if not r: return []
        out, seen = [], set()
        for res in _soup(r.text).select("div.algo"):
            a=res.select_one("div.compTitle a, h3 a"); h3=res.select_one("h3 span, h3"); sn=res.select_one(".compText p, p")
            if not a: continue
            url=_yahoo_url(a.get("href",""))
            if not url.startswith("http") or url in seen: continue
            seen.add(url); out.append({"title":(h3.get_text(strip=True) if h3 else a.get_text(strip=True)),"url":url,"snippet":sn.get_text(strip=True) if sn else "","source":"yahoo"})
            if len(out)>=n: break
        return out
    except Exception: return []
def scrape_ecosia(q, n):
    try:
        r = _get(f"https://www.ecosia.org/search?q={urllib.parse.quote(q)}", headers=_h({"Referer":"https://www.ecosia.org/"}))
        if not r: return []
        out, seen = [], set()
        for e in _soup(r.text).select("article.result, div.web-result"):
            a=e.select_one("a[href]"); t=e.select_one("h2, h3"); sn=e.select_one("p")
            if not (a and t): continue
            url=a.get("href","")
            if not url.startswith("http") or url in seen: continue
            seen.add(url); out.append({"title":t.get_text(strip=True),"url":url,"snippet":sn.get_text(strip=True) if sn else "","source":"ecosia"})
            if len(out)>=n: break
        return out
    except Exception: return []
def scrape_wikipedia(q, n):
    try:
        r = _get("https://en.wikipedia.org/w/api.php", headers=_WP_UA,
                 params={"action":"query","list":"search","srsearch":q,"srlimit":n,"format":"json","utf8":1})
        if not r: return []
        out=[]
        for i in r.json().get("query",{}).get("search",[]):
            out.append({"title":i["title"],"url":f"https://en.wikipedia.org/wiki/{urllib.parse.quote(i['title'].replace(' ','_'))}",
                        "snippet":BeautifulSoup(i.get('snippet',''),'html.parser').get_text(),"source":"wikipedia"})
        return out
    except Exception: return []
def scrape_archive(q, n):
    try:
        r = _get("https://archive.org/advancedsearch.php", params={"q":q,"fl[]":["identifier","title","description"],"rows":n,"output":"json","page":1})
        if not r: return []
        out=[]
        for doc in r.json().get("response",{}).get("docs",[])[:n]:
            ident=doc.get("identifier",""); desc=doc.get("description","")
            if isinstance(desc,list): desc=" · ".join(str(d) for d in desc[:3])
            out.append({"title":str(doc.get("title","") or ident)[:120],"url":f"https://archive.org/details/{ident}","snippet":str(desc)[:300],"source":"archive"})
        return out
    except Exception: return []
def scrape_gnews(q, n):
    try:
        r = _get(f"https://news.google.com/rss/search?q={urllib.parse.quote(q)}&hl=en-US&gl=US&ceid=US:en", headers=_h({"Accept":"application/rss+xml,text/xml"}))
        if not r: return []
        out=[]
        for item in ET.fromstring(r.text).findall(".//item")[:n]:
            title=item.findtext("title",""); link=item.findtext("link","")
            se=item.find("source"); sname=se.text.strip() if se is not None and se.text else ""
            dtext=BeautifulSoup(item.findtext("description",""),"html.parser").get_text(" ",strip=True)
            if not (title and link): continue
            if sname and title.endswith(f" - {sname}"): title=title[:-(len(sname)+3)]
            out.append({"title":title.strip(),"url":link,"snippet":(f"via {sname} — {dtext}" if sname else dtext)[:300],"source":"gnews"})
        return out
    except Exception: return []

ENGINES = {"ddg":scrape_ddg,"bing":scrape_bing,"brave":scrape_brave,"startpage":scrape_startpage,
           "mojeek":scrape_mojeek,"yahoo":scrape_yahoo,"ecosia":scrape_ecosia,
           "wikipedia":scrape_wikipedia,"archive":scrape_archive,"gnews":scrape_gnews}
DEFAULT_ENGINES = ",".join(ENGINES.keys())

def run_search(q, n, engines):
    results, seen = [], set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(engines)) as ex:
        futs = {ex.submit(ENGINES[e], q, n): e for e in engines}
        for f in concurrent.futures.as_completed(futs):
            try:
                for r in f.result():
                    u = r.get("url","")
                    if u and u not in seen:
                        seen.add(u); results.append(r)
            except Exception: pass
    return results

# ── AI helpers ───────────────────────────────────────────────────────────────
def _ai_headers(stream=True):
    h = {
        "Authorization": f"Bearer {AI_KEY}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream" if stream else "application/json",
        # browser-like fingerprint — some upstreams 403 datacenter/bot requests
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Origin": "https://new.xinjianya.top",
        "Referer": "https://new.xinjianya.top/",
    }
    return h

def ai_stream(messages, max_tokens=600, temperature=0.3):
    """Generator yielding raw text deltas from the AI model."""
    payload = {"model": AI_MODEL, "messages": messages, "stream": True,
               "max_tokens": max_tokens, "temperature": temperature}
    resp = req_lib.post(AI_URL, json=payload, headers=_ai_headers(), stream=True, timeout=90)
    resp.raise_for_status()
    for raw in resp.iter_lines(decode_unicode=True):
        if not raw or not raw.startswith("data: "): continue
        data = raw[6:].strip()
        if data == "[DONE]": break
        try:
            delta = json.loads(data)["choices"][0]["delta"].get("content","")
            if delta: yield delta
        except Exception: pass

def ai_complete(messages, max_tokens=400, temperature=0.2):
    """Non-streaming completion → string."""
    try:
        payload = {"model": AI_MODEL, "messages": messages, "stream": False,
                   "max_tokens": max_tokens, "temperature": temperature}
        r = req_lib.post(AI_URL, json=payload, headers=_ai_headers(stream=False), timeout=60)
        return r.json()["choices"][0]["message"]["content"]
    except Exception as e:
        return ""

def sse(obj): return f"data: {json.dumps(obj)}\n\n"

# ── OTP store ────────────────────────────────────────────────────────────────
_OTP = {}   # email -> (code, expiry_ts, attempts)

def _hash_otp(email, code):
    return hmac.new(OTP_SECRET.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()

def _make_token(email):
    payload = base64.urlsafe_b64encode(json.dumps({"e":email,"t":int(time.time())}).encode()).decode()
    sig = hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{payload}.{sig}"

def _otp_body(code):
    return (f"Your Shikai verification code is:\n\n        {code}\n\n"
            f"This code expires in 10 minutes.\n"
            f"If you didn't request this, ignore this email.\n\n— Shikai Search")

def _send_brevo(to_email, code):
    r = req_lib.post("https://api.brevo.com/v3/smtp/email",
        headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json", "Accept": "application/json"},
        json={"sender": {"name": "Shikai", "email": MAIL_FROM},
              "to": [{"email": to_email}],
              "subject": f"Shikai code: {code}",
              "textContent": _otp_body(code)}, timeout=20)
    if r.status_code not in (200, 201):
        raise Exception(f"brevo {r.status_code}: {r.text[:160]}")
    return "brevo"

def _send_resend(to_email, code):
    r = req_lib.post("https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
        json={"from": f"Shikai <{MAIL_FROM}>", "to": [to_email],
              "subject": f"Shikai code: {code}", "text": _otp_body(code)}, timeout=20)
    if r.status_code not in (200, 201):
        raise Exception(f"resend {r.status_code}: {r.text[:160]}")
    return "resend"

def _send_smtp(to_email, code):
    msg = MIMEText(_otp_body(code))
    msg["Subject"] = f"Shikai code: {code}"
    msg["From"] = f"Shikai <{SMTP_USER}>"
    msg["To"] = to_email
    ctx = ssl.create_default_context()
    last = None
    for port, ssl_mode in ((465, True), (587, False)):
        try:
            if ssl_mode:
                s = smtplib.SMTP_SSL(SMTP_HOST, port, timeout=15, context=ctx)
            else:
                s = smtplib.SMTP(SMTP_HOST, port, timeout=15); s.ehlo(); s.starttls(context=ctx); s.ehlo()
            with s:
                s.login(SMTP_USER, SMTP_PASS)
                s.sendmail(SMTP_USER, [to_email], msg.as_string())
            return f"smtp{port}"
        except Exception as e:
            last = f"{port}:{type(e).__name__}:{e}"
    raise Exception(last or "smtp failed")

def send_otp_email(to_email, code):
    """Try HTTPS providers first (work on HF), then SMTP (off-HF)."""
    errors = []
    if BREVO_API_KEY:
        try: return _send_brevo(to_email, code)
        except Exception as e: errors.append(str(e))
    if RESEND_API_KEY:
        try: return _send_resend(to_email, code)
        except Exception as e: errors.append(str(e))
    try: return _send_smtp(to_email, code)
    except Exception as e: errors.append(str(e))
    raise Exception(" | ".join(errors))

# ─────────────────────────────────────────────────────────────────────────────
#  ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template_string(LANDING)

@app.route("/health")
def health():
    return jsonify({"status":"ok","service":"shikai","engines":len(ENGINES),"model":AI_MODEL,"version":"1.0"})

@app.route("/engines")
def engines_list():
    return jsonify({"available":list(ENGINES.keys()),"default":DEFAULT_ENGINES.split(",")})

@app.route("/search")
def search():
    q = request.args.get("q","").strip()
    n = min(int(request.args.get("n","8")), 20)
    eng_raw = request.args.get("engines", DEFAULT_ENGINES)
    engines = [e.strip() for e in eng_raw.split(",") if e.strip() in ENGINES] or list(ENGINES.keys())
    fmt = request.args.get("format","json").lower()
    if not q: return jsonify({"error":"missing ?q="}), 400
    t0=time.time()
    results = run_search(q, n, engines)
    payload = {"query":q,"engines":engines,"count":len(results),"took_ms":round((time.time()-t0)*1000),"results":results}
    if fmt=="text":
        lines=[f"SHIKAI  q={q}  ({payload['count']} results, {payload['took_ms']}ms)","="*54]
        for i,r in enumerate(results,1):
            lines+=[f"[{i}] {r['title']}",f"    {r['url']}",f"    {r['snippet'][:200]}",""]
        return Response("\n".join(lines), mimetype="text/plain; charset=utf-8")
    if fmt=="pretty":
        return Response(json.dumps(payload,indent=2,ensure_ascii=False), mimetype="application/json")
    return jsonify(payload)

@app.route("/ai")
def ai_overview():
    """SSE AI overview grounded in provided snippets."""
    q = request.args.get("q","").strip()
    raw = request.args.get("snippets","")
    if not q: return jsonify({"error":"missing ?q="}), 400
    try: snippets = json.loads(urllib.parse.unquote(raw)) if raw else []
    except Exception: snippets = []
    ctx = "\n".join(f"- {s.get('title','')}: {s.get('snippet','')[:220]}" for s in snippets[:8] if s.get("snippet"))
    prompt = (f"IMPORTANT: respond in English only.\n"
              f'User searched: "{q}"\n\nSearch snippets:\n{ctx}\n\n'
              f"Reply EXACTLY in this structure, English only, no extra text:\n"
              f"ANSWER: <one direct sentence, max 12 words, no trailing period>\n"
              f"DETAIL: <3-4 sentence factual paragraph>")
    def gen():
        try:
            for delta in ai_stream([{"role":"user","content":prompt}], max_tokens=500, temperature=0.3):
                yield sse({"t":delta})
        except Exception as e:
            yield sse({"e":str(e)})
        yield "data: [DONE]\n\n"
    return Response(gen(), mimetype="text/event-stream", headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

@app.route("/research")
def research():
    """Deep research: AI plans sub-queries → parallel search → streamed synthesis with sources."""
    q = request.args.get("q","").strip()
    if not q: return jsonify({"error":"missing ?q="}), 400
    def gen():
        try:
            yield sse({"phase":"plan","status":"Planning research…"})
            plan_raw = ai_complete([{"role":"user","content":
                f'You are a research planner. For the topic: "{q}"\n'
                f"Output 4 focused web-search queries that together cover the topic. "
                f"Return ONLY a JSON array of strings, nothing else."}], max_tokens=200, temperature=0.4)
            queries = []
            m = re.search(r"\[.*\]", plan_raw, re.S)
            if m:
                try: queries = [str(x) for x in json.loads(m.group(0))][:4]
                except Exception: queries = []
            if not queries: queries = [q, f"{q} overview", f"{q} latest", f"{q} explained"]
            yield sse({"phase":"plan","queries":queries})

            # fast engine subset; all sub-queries searched in parallel
            fast = ["ddg","bing","brave","mojeek","wikipedia","gnews"]
            yield sse({"phase":"search","status":f"Searching {len(queries)} angles in parallel…"})
            all_sources, seen = [], set()
            with concurrent.futures.ThreadPoolExecutor(max_workers=len(queries)) as ex:
                futs = {ex.submit(run_search, sq, 4, fast): sq for sq in queries}
                for fut in concurrent.futures.as_completed(futs):
                    try:
                        for r in fut.result():
                            if r["url"] not in seen:
                                seen.add(r["url"]); all_sources.append(r)
                    except Exception: pass
            yield sse({"phase":"sources","sources":[{"title":r["title"],"url":r["url"],"source":r["source"]} for r in all_sources[:30]]})

            ctx = "\n".join(f"[{i+1}] {s['title']} ({s['url']}): {s['snippet'][:240]}" for i,s in enumerate(all_sources[:16]))
            yield sse({"phase":"answer","status":"Synthesizing…"})
            prompt = (f"IMPORTANT: English only. You are a deep-research assistant.\n"
                      f'Research topic: "{q}"\n\nSources:\n{ctx}\n\n'
                      f"Write a thorough, well-structured research report (4-6 paragraphs). "
                      f"Cite sources inline like [1], [3] referring to the numbered sources. "
                      f"Be factual and specific. Do not invent sources.")
            for delta in ai_stream([{"role":"user","content":prompt}], max_tokens=1000, temperature=0.35):
                yield sse({"phase":"answer","t":delta})
        except Exception as e:
            yield sse({"e":str(e)})
        yield "data: [DONE]\n\n"
    return Response(gen(), mimetype="text/event-stream", headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

@app.route("/ai/edit", methods=["POST"])
def ai_edit():
    """AI page editor: given page context + instruction, return CSS/JS to apply."""
    data = request.get_json(force=True, silent=True) or {}
    instruction = data.get("instruction","").strip()
    context = data.get("context","")[:2000]
    if not instruction: return jsonify({"error":"missing instruction"}), 400
    out = ai_complete([{"role":"user","content":
        f"You are a web page editor. The user is viewing a page.\n"
        f"Page context (truncated):\n{context}\n\n"
        f'User instruction: "{instruction}"\n\n'
        f"Return ONLY a JSON object: {{\"css\":\"...\",\"js\":\"...\"}} "
        f"with CSS and/or JS that fulfils the instruction when injected into the page. "
        f"Keep it safe and minimal. No markdown, no explanation."}], max_tokens=600, temperature=0.3)
    css, js = "", ""
    m = re.search(r"\{.*\}", out, re.S)
    if m:
        try:
            obj = json.loads(m.group(0)); css = obj.get("css",""); js = obj.get("js","")
        except Exception: pass
    return jsonify({"css":css,"js":js,"raw":out})

# ── OTP ──────────────────────────────────────────────────────────────────────
@app.route("/otp/send", methods=["POST"])
def otp_send():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email","") or "").strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return jsonify({"ok":False,"error":"invalid email"}), 400
    code = f"{random.randint(0, 999999):06d}"
    _OTP[email] = (code, time.time()+600, 0)
    try:
        send_otp_email(email, code)
        return jsonify({"ok":True,"message":"OTP sent"})
    except Exception as e:
        return jsonify({"ok":False,"error":f"send failed: {e}"}), 500

@app.route("/otp/verify", methods=["POST"])
def otp_verify():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email","") or "").strip().lower()
    code  = (data.get("code","") or "").strip()
    rec = _OTP.get(email)
    if not rec: return jsonify({"ok":False,"error":"no code requested"}), 400
    real, exp, att = rec
    if time.time() > exp:
        _OTP.pop(email, None); return jsonify({"ok":False,"error":"code expired"}), 400
    if att >= 5:
        _OTP.pop(email, None); return jsonify({"ok":False,"error":"too many attempts"}), 429
    if not hmac.compare_digest(code, real):
        _OTP[email] = (real, exp, att+1)
        return jsonify({"ok":False,"error":"wrong code"}), 401
    _OTP.pop(email, None)
    return jsonify({"ok":True,"token":_make_token(email),"email":email})

# ── Browser proxy (desktop UA + eruda inspector + AI editor toolbar) ─────────
@app.route("/proxy")
def proxy():
    url = request.args.get("url","").strip()
    if not url.startswith("http"): url = "https://" + url
    try:
        r = _S.get(url, headers=_h({"User-Agent":_UAS[0]}), timeout=20, allow_redirects=True)
        ctype = r.headers.get("Content-Type","text/html")
        if "text/html" not in ctype:
            return Response(r.content, mimetype=ctype)
        soup = _soup(r.text)
        # base href so relative assets resolve
        base = soup.new_tag("base", href=r.url)
        if soup.head: soup.head.insert(0, base)
        # injected toolbar + eruda + AI editor
        inject = INJECT_JS.replace("__BASE__", json.dumps(r.url))
        tag = soup.new_tag("script"); tag.string = inject
        (soup.body or soup).append(tag)
        html = str(soup)
        resp = Response(html, mimetype="text/html")
        # strip framing protections
        resp.headers["X-Frame-Options"] = "ALLOWALL"
        resp.headers["Content-Security-Policy"] = ""
        return resp
    except Exception as e:
        return Response(f"<h3 style='font-family:sans-serif;color:#e33'>Proxy error</h3><p>{e}</p>", mimetype="text/html")

# injected into proxied pages: eruda (inspect element) + designMode + AI edit
INJECT_JS = r"""
(function(){
  if (window.__shikai) return; window.__shikai = true;
  // eruda for inspect-element
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/eruda';
  s.onload = function(){ try{ eruda.init(); }catch(e){} };
  document.body.appendChild(s);
  // notify parent app that page is ready
  try { parent.postMessage({shikai:'loaded', url: __BASE__}, '*'); } catch(e){}
  // listen for commands from the app shell
  window.addEventListener('message', function(ev){
    var d = ev.data || {};
    if (d.shikaiCmd === 'inspect') { try{ eruda.show(); }catch(e){} }
    if (d.shikaiCmd === 'edit')    { document.designMode = (document.designMode==='on'?'off':'on'); }
    if (d.shikaiCmd === 'applyCSS' && d.css){ var st=document.createElement('style'); st.textContent=d.css; document.head.appendChild(st); }
    if (d.shikaiCmd === 'applyJS'  && d.js ){ try{ (0,eval)(d.js); }catch(e){ console.error(e);} }
  });
})();
"""

# ── Minimal landing page (sanity check in browser) ───────────────────────────
LANDING = r"""<!doctype html><html><head><meta charset=utf-8>
<title>Shikai API</title><meta name=viewport content="width=device-width,initial-scale=1">
<style>body{background:#0a0a0c;color:#e8e8f0;font-family:system-ui;margin:0;padding:40px;max-width:640px;margin:auto}
a{color:#dc2626}code{background:#18181b;padding:2px 6px;border-radius:4px;font-size:.85em}
h1{font-weight:600;letter-spacing:-.03em}.d{width:8px;height:8px;background:#dc2626;border-radius:50%;display:inline-block;box-shadow:0 0 10px #dc2626}
.e{color:#52525b;font-family:monospace;font-size:.8rem;margin:4px 0}</style></head>
<body><h1><span class=d></span> shikai search api</h1>
<p style="color:#a1a1aa">Multi-engine search + AI overview + deep research backend for the Shikai mobile app.</p>
<div class=e>GET /search?q=…&n=8&format=json|pretty|text</div>
<div class=e>GET /ai?q=…&snippets=[…]            (SSE)</div>
<div class=e>GET /research?q=…                   (SSE deep research)</div>
<div class=e>POST /otp/send   {email}</div>
<div class=e>POST /otp/verify {email,code}</div>
<div class=e>GET /proxy?url=…                    (in-app browser)</div>
<div class=e>GET /engines · GET /health</div>
<p style="color:#3f3f46;font-size:.75rem;margin-top:30px">model: """ + AI_MODEL + r""" · 10 engines · parallel</p>
</body></html>"""

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT","7860")), threaded=True)
__SHIKAI_APP_EOF__

EXPOSE 7860

# gthread workers keep SSE streams (AI overview / deep research) alive
CMD ["gunicorn","-b","0.0.0.0:7860","-k","gthread","--threads","16","--workers","2","--timeout","300","--graceful-timeout","30","app:app"]
