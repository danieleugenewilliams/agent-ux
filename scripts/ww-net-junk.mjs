#!/usr/bin/env node
// Wild World two players (#249): a frame off the wire whose type is a prototype key ('__proto__', 'constructor', 'toString',
// 'hasOwnProperty', 'valueOf') finds no handler in Net.emit: no page error, and the line carries on (a real frame after them
// is still handled).
//
// One headless Chrome (muted, not detached, killed with its profile deleted on every way out, and after 5 minutes at most).
// Nothing listens and no relay runs: the page is answered from this repo through CDP (Fetch) at http://ww.test/, with the one
// line the relay puts in it (window.WW_RELAY), and its WebSocket is a stand-in this process answers (a room, then the junk).
// Every frame reaches the page from its own event loop, as a real socket's do, so a throw in ws.onmessage is a page error.
// The profile is made up (#161).
//
// Usage:  node scripts/ww-net-junk.mjs [path/to/wild-world.html]
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check passes with no page errors; 1 on a failed check; 2 if the run could not finish.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(process.argv[2] || path.join(repo, 'wild-world.html'));
const HOST = 'http://ww.test', url = HOST + '/wild-world.html';
const JUNK = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const base of [path.join(os.homedir(), 'Library/Caches/ms-playwright'), path.join(os.homedir(), '.cache/ms-playwright')]) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()) {
      for (const sub of ['chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell']) {
        const p = path.join(base, d, sub); if (fs.existsSync(p)) return p;
      }
    }
  }
  for (const p of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) if (fs.existsSync(p)) return p;
  throw new Error('no Chrome found: set CHROME=/path/to/chrome');
}

// ---- in the page, before its own scripts: the stand-in socket (its frames go to this process through the __wire binding)
const INJECT = `(() => {
  const socks = new Map(); let n = 0;
  class Stand { constructor(u) { this.url = u; this.readyState = 0; this.id = ++n; socks.set(this.id, this); __wire(JSON.stringify({ id: this.id, op: 'open', u })); }
    send(s) { if (this.readyState === 1) __wire(JSON.stringify({ id: this.id, op: 'msg', s })); }
    close() { if (this.readyState < 2) { this.readyState = 3; __wire(JSON.stringify({ id: this.id, op: 'close' })); } } }
  window.WebSocket = Stand;
  window.__toPage = (id, op, s) => setTimeout(() => { const w = socks.get(id); if (!w) return; if (op === 'open') { w.readyState = 1; w.onopen?.({}); } else if (w.readyState === 1) w.onmessage?.({ data: s }); });
})();`;

let S = null;
function launch() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-net-junk-'));
  const chrome = spawn(findChrome(), ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--window-size=1280,800', '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });   // not detached: it dies with us
  chrome.on('error', () => {});
  S = { chrome, prof, exited: false, ws: null, cleaned: false };
  chrome.on('exit', () => { S.exited = true; });
  return S;
}
function killSync() { if (!S || S.cleaned) return; S.cleaned = true; try { S.ws?.close(); } catch {} try { S.chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(S.prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch {} }
async function kill() { if (!S || S.cleaned) return; try { S.chrome.kill('SIGKILL'); } catch {} for (let i = 0; i < 50 && !S.exited; i++) await sleep(20); killSync(); }
process.on('exit', killSync);
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => { kill().finally(() => process.exit(code)); });
setTimeout(() => { console.error('hard timeout: over 5 min; closing Chrome'); kill().finally(() => process.exit(2)); }, 5 * 60 * 1000).unref();

async function connect() {
  let tgt, port;
  for (let i = 0; i < 450 && !tgt && !S.exited; i++) {
    try { const f = fs.readFileSync(path.join(S.prof, 'DevToolsActivePort'), 'utf8'); if (f.includes('\n')) port = parseInt(f, 10) || undefined; } catch {}
    if (port) try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!tgt) await sleep(200);
  }
  if (!tgt) throw new Error('Chrome did not start');
  const ws = S.ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map(), C = { errs: [], sock: null, sent: [] };
  const send = (method, params = {}) => new Promise((r) => { if (ws.readyState !== 1) return r({ result: { exceptionDetails: { text: 'Chrome closed the connection' } } }); const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  C.toPage = (op, s) => send('Runtime.evaluate', { expression: `window.__toPage && __toPage(${C.sock}, '${op}', ${JSON.stringify(s ?? '')})` });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { pend.get(m.id)?.(m); pend.delete(m.id); }
    else if (m.method === 'Runtime.bindingCalled') {
      const w = JSON.parse(m.params.payload);
      if (w.op === 'open') { C.sock = w.id; C.toPage('open'); }
      else if (w.op === 'msg') { const f = JSON.parse(w.s); C.sent.push(f); if (f.t === 'host') C.toPage('msg', JSON.stringify({ t: 'room', code: [0, 1, 2, 3], you: 0 })); }
    }
    else if (m.method === 'Fetch.requestPaused') {
      const rid = m.params.requestId;
      if (new URL(m.params.request.url).href !== url) { send('Fetch.fulfillRequest', { requestId: rid, responseCode: 404, body: '' }); return; }
      const s = fs.readFileSync(target, 'utf8'), i = s.indexOf('<head>');
      const body = Buffer.from(s.slice(0, i + 6) + '\n<script>window.WW_RELAY={v:1}</script>' + s.slice(i + 6));
      send('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'text/html; charset=utf-8' }], body: body.toString('base64') });
    }
    else if (m.method === 'Runtime.exceptionThrown') C.errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') C.errs.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  C.ev = async (expression) => {
    const v = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (v.result?.exceptionDetails) throw new Error('page threw: ' + (v.result.exceptionDetails.exception?.description || v.result.exceptionDetails.text));
    return v.result?.result?.value;
  };
  C.until = async (expr, ms = 3000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await C.ev(expr).catch(() => null); if (v) return v; await sleep(25); } return v; };
  await send('Runtime.enable'); await send('Page.enable'); await send('Runtime.addBinding', { name: '__wire' });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT }); await send('Fetch.enable', { patterns: [{ urlPattern: HOST + '/*' }] });
  await send('Page.navigate', { url });
  if (!(await C.until('document.readyState === "complete" && !!window.__ww', 30000))) throw new Error('page did not load window.__ww: ' + url);
  return C;
}

async function main() {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); };
  launch(); const C = await connect();
  await C.ev(`(() => { const W = window.__ww; try { localStorage.clear(); } catch (e) {} const r = W.addProfile('Tester', 'star', '#ffd23f', 1); W.profile(r.id); W.start(); W.manual(true); return 1; })()`);
  let n = await C.ev('window.__ww.net()');
  ok(`on the relay's page (stand-in) two players is available (${n.available})`, n.available && n.state === 'off', n);
  await C.ev('window.__ww.host()');
  n = await C.until(`(() => { const n = window.__ww.net(); return n.state === 'waiting' ? n : null; })()`);
  ok(`HOST over the stand-in socket: waiting with a code (${n?.state}, ${JSON.stringify(n?.code)})`, n && n.state === 'waiting' && n.code?.length === 4, n);
  const e0 = C.errs.length, g0 = n?.got ?? 0;
  for (const t of JUNK) await C.toPage('msg', JSON.stringify({ t }));
  const g1 = await C.until(`(() => { const n = window.__ww.net(); return n.got >= ${g0 + JUNK.length} ? n.got : null; })()`); await sleep(200);
  n = await C.ev('window.__ww.net()');
  ok(`frames typed ${JUNK.join(', ')} all reach Net (${(g1 ?? n.got) - g0} of ${JUNK.length})`, (g1 ?? 0) - g0 === JUNK.length, n);
  ok(`and none throws (${C.errs.length - e0} page errors)`, C.errs.length === e0, C.errs.slice(e0, e0 + 10));
  ok(`the line is still waiting after them (${n.state})`, n.state === 'waiting', n);
  await C.toPage('msg', JSON.stringify({ t: 'peer-join' }));
  n = await C.until(`(() => { const n = window.__ww.net(); return n.state === 'together' ? n : null; })()`);
  await sleep(300); const hi = C.sent.some((f) => f.t === 'hi');
  ok(`a real frame after them is still handled: a friend joins (${n?.state}, Two page ${n?.page}) and the page says hi (${hi})`, n && n.state === 'together' && hi, { n, sent: C.sent.map((f) => f.t) });
  ok('no page errors', C.errs.length === 0, C.errs.slice(0, 10));
  return out;
}

let code = 2;
try {
  const res = await main(), bad = res.filter((r) => !r.pass);
  for (const r of res) console.log((r.pass ? '  ok   ' : '  FAIL ') + r.name + (r.pass ? '' : '\n       ' + JSON.stringify(r.got)?.slice(0, 1500)));
  console.log(`${res.length - bad.length}/${res.length} checks pass: ${bad.length ? 'FAIL' : 'PASS'}`);
  code = bad.length ? 1 : 0;
} catch (e) { console.error('check could not finish: ' + (e?.stack || e?.message || e)); }
finally { await kill(); }
process.exit(code);
