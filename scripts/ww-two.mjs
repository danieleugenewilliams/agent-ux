#!/usr/bin/env node
// Wild World W3 (#160): two players on two devices in the same world, through the home game server (scripts/ww-relay.mjs).
//
// Every run starts its own relay on 127.0.0.1 (never 0.0.0.0) at a free port, and its own headless Chromes (muted, never
// detached, killed with their profiles deleted on every way out, and killed if a run takes over 5 minutes); the relay is killed
// on every way out too. The players are made with placeholder profiles ("Max", level 1, and "Sam", level 2).
//   relay    - Node only: the relay serves the repo's files and nothing outside it (path traversal, encoded or not, and dotfiles
//              such as .git are refused, checked with raw requests that no client tidies up first); wild-world.html (and only it)
//              carries the WW_RELAY line; rooms: a code of 4 pictures, a second player joins, a third is refused (full), a wrong
//              code is refused, messages pass through as sent, a message over the size limit closes that socket, a page from
//              another origin can't open the socket, a room left empty is forgotten after --room-ttl, and a rejoin takes the free seat.
//   together - two Chromes in one room: each sees the other's position (drawn, interpolated) within 200 ms and their change into an
//              animal; the two play at different levels (letter tiles and typing) at once; a meet on either adds the animal to both
//              books and both saves keep it; riding a horse, an elephant and a dolphin (mount, move with it, hop off); a form change
//              drops the rider safely; a race and a tag game start, finish and show the winner on both screens; a third player is
//              refused; a reload leaves and the same code rejoins; nothing about a player but an icon and a color is ever sent
//              (every WebSocket frame both ways is read); then the relay is killed: both keep a working single-player game with
//              their profile, animals and words, a calm notice, and after the relay comes back a reload still has everything.
//   pages    - the page from another origin (a plain static server, as on Pages): Host and Join explain in one line why not, and
//              the page makes no WebSocket or other request for it; the parent view saves every player to a file there and the
//              relay's page loads it (a same-name player is added to, never doubled).
//   touch    - a touch-only round on both devices (CDP touch events, 844x390): pause, 2 PLAYERS, HOST; the other pauses, 2 PLAYERS,
//              JOIN and taps the 4 pictures; the host changes into a horse with CHANGE; the other taps RIDE, rides while the host
//              walks with the stick, and taps HOP OFF.
//   WxH      - at that size in touch mode (with a stand-in friend on a Node socket): the pause menu alone and together, the
//              2 PLAYERS panel (Host/Join, the explanation, the keypad, the code, together) and the HUD during tag with the friend
//              off screen (the edge arrow): every control on screen, none overlapping, every target at least 44 px, no page scroll.
// Every Chrome also checks there were no page errors.
//
// Usage:
//   node scripts/ww-two.mjs                  # every run
//   node scripts/ww-two.mjs --run together   # one run (repeatable)
//   node scripts/ww-two.mjs --shots DIR      # also save screenshots (the PR's set: --shots docs/screenshots/wild-world)
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const SIZES = ['360x740', '568x320', '740x360', '844x390', '667x375', '768x1024', '820x1180'];
const RUN_TIMEOUT_MS = 5 * 60 * 1000;
const args = process.argv.slice(2);
let shots = null; const picked = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--run') picked.push(args[++i]);
  else if (args[i] === '--shots') shots = path.resolve(args[++i]);
  else if (args[i] === '-h' || args[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
}
const runs = picked.length ? picked : ['relay', 'together', 'pages', 'touch', ...SIZES];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (shots) fs.mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['Max', 'Sam'];

// ---- the relay: a child process on 127.0.0.1, killed on every way out
const relays = new Set();
async function startRelay({ port = 0, ttl = 30 } = {}) {
  const proc = spawn(process.execPath, [path.join(repo, 'scripts/ww-relay.mjs'), '--host', '127.0.0.1', '--port', String(port), '--room-ttl', String(ttl)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const R = { proc, out: '', exited: false }; relays.add(R);
  proc.on('exit', () => { R.exited = true; relays.delete(R); });
  proc.stdout.on('data', (d) => { R.out += d; }); proc.stderr.on('data', (d) => { R.out += d; });
  for (let i = 0; i < 100 && !R.url; i++) { const m = R.out.match(/http:\/\/127\.0\.0\.1:(\d+)\/wild-world\.html/); if (m) { R.url = m[0]; R.port = +m[1]; R.base = `http://127.0.0.1:${m[1]}/`; } else await sleep(50); if (R.exited) break; }
  if (!R.url) { killRelay(R); throw new Error('the relay did not start: ' + R.out); }
  return R;
}
function killRelay(R) { if (!R) return; try { R.proc.kill('SIGKILL'); } catch {} relays.delete(R); }
async function killRelayWait(R) { killRelay(R); for (let i = 0; i < 50 && !R.exited; i++) await sleep(20); }

// ---- a plain static server (another origin, like Pages): no relay marker, no socket
let staticServer = null, staticBase = null;
async function serveStatic() {
  if (staticServer) return staticBase;
  staticServer = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = u === '/wild-world.html' ? path.join(repo, 'wild-world.html') : null;
    if (!f) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); res.end(fs.readFileSync(f));
  });
  await new Promise((r) => staticServer.listen(0, '127.0.0.1', r));
  staticBase = `http://127.0.0.1:${staticServer.address().port}/`;
  return staticBase;
}
const closeStatic = () => { try { staticServer?.closeAllConnections?.(); staticServer?.close(); } catch {} staticServer = null; };

// ---- Chrome
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const b of [path.join(os.homedir(), 'Library/Caches/ms-playwright'), path.join(os.homedir(), '.cache/ms-playwright')]) {
    if (!fs.existsSync(b)) continue;
    for (const d of fs.readdirSync(b).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()) {
      for (const sub of ['chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell']) {
        const p = path.join(b, d, sub); if (fs.existsSync(p)) return p;
      }
    }
  }
  for (const p of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) if (fs.existsSync(p)) return p;
  throw new Error('no Chrome found: set CHROME=/path/to/chrome');
}
const chromeBin = findChrome();
const chromes = new Set();
function launch() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-two-'));
  const chrome = spawn(chromeBin, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--window-size=1280,800', '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });   // not detached: it dies with us
  chrome.on('error', () => {});
  const S = { chrome, prof, exited: false, ws: null, cleaned: false };
  chrome.on('exit', () => { S.exited = true; });
  chromes.add(S);
  return S;
}
function killSync(S) {
  if (!S || S.cleaned) return; S.cleaned = true; chromes.delete(S);
  try { S.ws?.close(); } catch {}
  try { S.chrome.kill('SIGKILL'); } catch {}
  try { fs.rmSync(S.prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch {}
}
async function kill(S) {
  if (!S || S.cleaned) return;
  try { S.chrome.kill('SIGKILL'); } catch {}
  for (let i = 0; i < 50 && !S.exited; i++) await sleep(20);
  killSync(S);
}
const killAll = async () => { for (const S of [...chromes]) await kill(S); for (const R of [...relays]) killRelay(R); closeStatic(); };
process.on('exit', () => { for (const S of [...chromes]) killSync(S); for (const R of [...relays]) killRelay(R); closeStatic(); });
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => { killAll().finally(() => process.exit(code)); });
const HARD_TIMEOUT_MS = 30 * 60 * 1000;
setTimeout(() => { console.error(`hard timeout: over ${HARD_TIMEOUT_MS / 60000} min; closing Chrome`); killAll().finally(() => process.exit(2)); }, HARD_TIMEOUT_MS).unref();

async function connect(S, tag) {
  let tgt, port;
  for (let i = 0; i < 450 && !tgt && !S.exited; i++) {
    try { const f = fs.readFileSync(path.join(S.prof, 'DevToolsActivePort'), 'utf8'); if (f.includes('\n')) port = parseInt(f, 10) || undefined; } catch {}
    if (port) try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!tgt) await sleep(200);
  }
  if (!tgt) throw new Error('Chrome did not start (' + chromeBin + ')');
  const ws = S.ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; ws.onclose = () => j(new Error('Chrome closed the connection')); });
  let id = 0; const pend = new Map(), errs = [], frames = [], requests = [], sockets = [];
  ws.onclose = () => { for (const [, f] of pend) f({ result: { exceptionDetails: { text: 'Chrome closed the connection' } } }); pend.clear(); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { pend.get(m.id)?.(m); pend.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) errs.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    else if (m.method === 'Network.webSocketFrameSent') frames.push({ dir: 'sent', data: m.params.response.payloadData });
    else if (m.method === 'Network.webSocketFrameReceived') frames.push({ dir: 'got', data: m.params.response.payloadData });
    else if (m.method === 'Network.webSocketCreated') sockets.push(m.params.url);
    else if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  };
  const send = (method, params = {}) => new Promise((r) => { if (ws.readyState !== 1) return r({ result: { exceptionDetails: { text: 'Chrome closed the connection' } } }); const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const v = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (v.result?.exceptionDetails) throw new Error(tag + ': page threw: ' + (v.result.exceptionDetails.exception?.description || v.result.exceptionDetails.text));
    return v.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('Network.enable');
  const C = { send, ev, errs, frames, requests, sockets, tag };
  const ready = async (what) => { for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState === "complete" && !!window.__ww').catch(() => false)) return; } throw new Error(tag + ': page did not ' + what); };
  C.size = async (w, h, touch) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!touch, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: !!touch, maxTouchPoints: touch ? 5 : 0 });
  };
  C.open = async (base, w, h, touch, keepStorage = false) => {
    await C.size(w, h, touch);
    if (!keepStorage) { await send('Page.navigate', { url: base + 'wild-world.html?blank' }); await sleep(300); await ev('try { localStorage.clear(); } catch (e) {} true').catch(() => {}); }
    await send('Page.navigate', { url: base + 'wild-world.html' });
    await ready('load');
  };
  C.reload = async () => { await send('Page.reload', {}); await sleep(300); await ready('reload'); };
  C.shot = async (name) => { if (!shots) return; const sh = await send('Page.captureScreenshot', { format: 'png' }); if (sh.result?.data) fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(sh.result.data, 'base64')); };
  C.touch = async (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id: id ?? 1, radiusX: 4, radiusY: 4, force: 1 })) });
  C.tap = async (x, y, holdMs = 60) => { await C.touch('touchStart', [[x, y]]); await sleep(holdMs); await C.touch('touchEnd', []); await sleep(120); };
  C.tapEl = async (sel, holdMs = 60) => {
    const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || !e.getClientRects().length || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!r) throw new Error(tag + ': nothing on screen to tap: ' + sel + ' (' + JSON.stringify(await ev('({ overlay: window.__ww.state().overlay, net: window.__ww.net(), panel: document.getElementById("twPanel").innerHTML.slice(0, 300) })').catch(() => null)) + ')');
    await C.tap(Math.round(r.x), Math.round(r.y), holdMs); return r;
  };
  C.until = async (expr, ms = 3000, step = 25) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await ev(expr).catch(() => null); if (v) return v; await sleep(step); } return v; };
  return C;
}

// ---- in the page
const H = String.raw`const W = window.__ww, S = () => W.state();
  const become = (id) => { if (id !== 'human') W.meet(id); const g = W.requestChange(id); let lv = null; if (g === 'gated') { const q = W.prompt(); lv = q.mode; W.answer(q.word); } return { form: S().form, mode: lv }; };`;
const inPage = (C, body) => C.ev(String.raw`(() => { ${H} ${body} })()`);
const setup = (C, name, level) => inPage(C, `const r = W.addProfile('${name}', '${name === 'Max' ? 'star' : 'rocket'}', '${name === 'Max' ? '#ffd23f' : '#5cc8ff'}', ${level}); W.profile(r.id); W.start(); W.manual(true); W.seed(160); return r.id;`);
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// a Node client on the relay (a third player, or a stand-in friend for the layout runs)
function nodeClient(R) {
  return new Promise((res, rej) => {
    const w = new WebSocket(R.base.replace('http', 'ws') + 'ww'), q = []; w.q = q;
    w.onmessage = (e) => { try { q.push(JSON.parse(e.data)); } catch {} };
    w.onopen = () => res(w); w.onerror = () => rej(new Error('node client could not connect'));
    w.next = async (type, ms = 2000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const i = q.findIndex((m) => !type || m.t === type); if (i >= 0) return q.splice(i, 1)[0]; await sleep(15); } return null; };
    w.put = (m) => w.send(JSON.stringify(m));
  });
}

// raw HTTP: the path goes out exactly as written (fetch and http.get tidy up ../ before sending)
function rawGet(port, rawPath, extra = '') {
  return new Promise((res) => {
    const s = net.connect(port, '127.0.0.1'); let data = '';
    s.on('connect', () => s.write(`GET ${rawPath} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n${extra}\r\n`));
    s.on('data', (d) => { data += d; }); s.on('end', () => res(data)); s.on('error', () => res(data));
    setTimeout(() => { s.destroy(); res(data); }, 3000);
  });
}

// ===========================================================================
// relay: Node only
// ===========================================================================
async function runRelay() {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const R = await startRelay({ ttl: 1 });
  ok(`the relay starts on 127.0.0.1 and prints the URL to open (${R.url})`, /^http:\/\/127\.0\.0\.1:\d+\/wild-world\.html$/.test(R.url), R.out);
  // files
  const status = (raw) => +(raw.match(/^HTTP\/1\.1 (\d+)/) || [])[1];
  const page = await rawGet(R.port, '/wild-world.html'), other = await rawGet(R.port, '/robot-battle.html'), readme = await rawGet(R.port, '/README.md');
  ok(`it serves the repo's files: wild-world.html (${status(page)}) with the WW_RELAY line, another page (${status(other)}) without it`, status(page) === 200 && page.includes('window.WW_RELAY={v:1}') && /<title>Wild World<\/title>/.test(page) && status(other) === 200 && !other.includes('WW_RELAY') && status(readme) === 200, { page: status(page), other: status(other) });
  const bad = ['/../../../../etc/passwd', '/..%2f..%2f..%2fetc%2fpasswd', '/%2e%2e/%2e%2e/%2e%2e/etc/passwd', '/scripts/../../../etc/hosts', '/.git/config', '/.git/HEAD', '/%2egit/config', '/.gitignore', '/.claude/settings.json', '/docs/../.git/HEAD', '/scripts/%2e%2e/.git/HEAD', '/wild-world.html%00.png', '/..\\..\\etc\\passwd'];
  const res = [];
  for (const p of bad) { const r = await rawGet(R.port, p); res.push({ p, s: status(r), leak: /root:|\[core\]|ref: refs|localhost/.test(r.split('\r\n\r\n').slice(1).join('')) }); }
  ok(`path traversal and dotfiles are refused (${res.map((r) => r.s).join(', ')}), and nothing leaks: ${bad.length} raw paths`, res.every((r) => r.s >= 400 && r.s < 500 && !r.leak), res);
  // rooms
  const a = await nodeClient(R); a.put({ t: 'host' }); const room = await a.next('room');
  ok(`HOST gets a room code of 4 pictures (${JSON.stringify(room?.code)}), seat 0`, room && Array.isArray(room.code) && room.code.length === 4 && room.code.every((c) => Number.isInteger(c) && c >= 0 && c < 8) && room.you === 0, room);
  const b = await nodeClient(R); b.put({ t: 'join', code: room.code }); const rb = await b.next('room'), pj = await a.next('peer-join');
  ok(`JOIN with the code: seat 1 (${rb?.you}), and the host is told (${pj?.t})`, rb && rb.you === 1 && rb.peers === 2 && pj, { rb, pj });
  const c = await nodeClient(R); c.put({ t: 'join', code: room.code }); const rc = await c.next();
  ok(`a third player is refused: the room holds 2 (${JSON.stringify(rc)})`, rc && rc.t === 'err' && rc.why === 'full', rc);
  c.put({ t: 'st', x: 99 }); await sleep(150);
  ok(`the refused player's messages reach nobody`, !a.q.some((m) => m.x === 99) && !b.q.some((m) => m.x === 99), { a: a.q, b: b.q });
  const wrong = room.code.map((x) => (x + 1) % 8); c.put({ t: 'join', code: wrong }); const rw = await c.next();
  c.put({ t: 'join', code: [1, 2, 3] }); const rw2 = await c.next();
  ok(`a wrong code is refused (${rw?.why}), and a malformed one (${rw2?.why})`, rw?.why === 'nocode' && rw2?.why === 'nocode', { rw, rw2 });
  const t0 = Date.now(); a.put({ t: 'st', x: 1.5, f: 'horse', extra: [1, 2] }); const got = await b.next('st');
  ok(`a message passes to the other player as sent (${JSON.stringify(got)}, ${Date.now() - t0} ms)`, got && got.x === 1.5 && got.f === 'horse' && JSON.stringify(got.extra) === '[1,2]', got);
  b.put({ t: 'room', code: [0, 0, 0, 0], you: 0 }); b.put({ t: 'peer-left' }); await sleep(150);
  ok(`a player can't fake the server's own messages (room, peer-left)`, !a.q.some((m) => m.t === 'room' || m.t === 'peer-left'), a.q);
  b.send(JSON.stringify({ t: 'st', pad: 'x'.repeat(5000) })); await sleep(300); const left = await a.next('peer-left');
  ok(`a message over the size limit (5 KB) closes that socket (${b.readyState === 3 ? 'closed' : 'open'}), and the host hears they left`, b.readyState === 3 && left, { ready: b.readyState, left });
  const b2 = await nodeClient(R); b2.put({ t: 'join', code: room.code }); const rb2 = await b2.next('room');
  ok(`the same code rejoins into the free seat (${rb2?.you})`, rb2 && rb2.you === 1, rb2);
  // origin: another web page can't open the socket; this page's own origin can
  const key = 'dGhlIHNhbXBsZSBub25jZQ==', up = (origin) => rawGet(R.port, '/ww', `Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n${origin ? 'Origin: ' + origin + '\r\n' : ''}`);
  const evil = await up('http://example.com'), mine = await up(`http://127.0.0.1:${R.port}`);
  ok(`an upgrade from another origin is refused (${status(evil)}); from the relay's own page it switches (${status(mine)}, the RFC 6455 accept key)`, status(evil) === 403 && status(mine) === 101 && mine.includes('s3pPLMBiTxaQ9kYGzzhZRbK+xOo='), { evil: evil.slice(0, 80), mine: mine.slice(0, 160) });
  // expiry: a room nobody is in is forgotten after --room-ttl (1 s here)
  a.close(); b2.close(); await sleep(1700);
  const d = await nodeClient(R); d.put({ t: 'join', code: room.code }); const rd = await d.next();
  ok(`a room left empty is forgotten after the TTL (${JSON.stringify(rd)})`, rd && rd.t === 'err' && rd.why === 'nocode', rd);
  for (const w of [c, d]) try { w.close(); } catch {}
  await killRelayWait(R);
  return out;
}

// ===========================================================================
// together: two Chromes in one room
// ===========================================================================
async function runTogether(CA, CB) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  let R = await startRelay({ ttl: 30 });
  await CA.open(R.base, 320, 240, false); await CB.open(R.base, 320, 240, false);
  const idA = await setup(CA, 'Max', 1), idB = await setup(CB, 'Sam', 2);
  let a = await CA.ev('window.__ww.net()');
  ok(`on the relay's page two players is available (${a.available}, ${a.state})`, a.available && a.state === 'off', a);
  await CA.ev('window.__ww.host()');
  a = await CA.until('(() => { const n = window.__ww.net(); return n.state === "waiting" && n.code ? n : null; })()');
  ok(`HOST: waiting with a code of 4 pictures (${JSON.stringify(a?.code)})`, a && a.code.length === 4, a);
  const code = a.code;
  const sA0 = await CA.ev('window.__ww.state()'), sB0 = await CB.ev('window.__ww.state()');
  await CB.ev(`window.__ww.join(${JSON.stringify(code)})`);
  const tog = await CB.until('window.__ww.net().state === "together" && window.__ww.peer() && window.__ww.peer().av', 4000) && await CA.until('window.__ww.net().state === "together" && window.__ww.peer() && window.__ww.peer().av', 4000);
  let nA = await CA.ev('window.__ww.net()'), nB = await CB.ev('window.__ww.net()');
  ok(`JOIN with the code: together on both (host seat ${nA.you}, joiner seat ${nB.you})`, tog && nA.state === 'together' && nB.state === 'together' && nA.you === 0 && nB.you === 1, { nA, nB });
  await sleep(400);
  let sA = await CA.ev('window.__ww.state()'), sB = await CB.ev('window.__ww.state()');
  ok(`the one who joins starts next to the host (${hd(sA, sB).toFixed(1)} m away; was ${hd(sA0, sB0).toFixed(1)} m), in the same world (seed ${sA.seed ?? 157})`, hd(sA, sB) < 5, { sA, sB });
  let pA = await CA.ev('window.__ww.peer()'), pB = await CB.ev('window.__ww.peer()');
  ok(`each sees the other's face: an icon and a color, nothing else (${JSON.stringify(pB.av)} / ${JSON.stringify(pA.av)})`, JSON.stringify(Object.keys(pA.av).sort()) === '["color","icon"]' && pB.av.icon === 'star' && pA.av.icon === 'rocket', { a: pA.av, b: pB.av });
  ok(`each draws the other's model in the world (${pA.model?.form} at ${pA.model?.x}, ${pB.model?.form})`, pA.model?.inScene && pB.model?.inScene && pA.model.form === 'human' && pB.model.form === 'human', { pA, pB });

  // ---- the position, drawn, within 200 ms (5 moves each way): the time from the move to the other screen drawing them there
  const lat = async (Cm, Cs, label) => {
    const draw = [], arrive = [];
    for (let k = 0; k < 5; k++) {
      const t0 = await Cm.ev(`(() => { const s = window.__ww.state(); window.__ww.teleport(s.x + ${k % 2 ? -5 : 5}, s.z + 1.5); window.__ww.step(0); window.__TGT = window.__ww.state(); return { t: Date.now(), x: window.__TGT.x, z: window.__TGT.z }; })()`);
      let seen = null; const t1 = Date.now();
      while (Date.now() - t1 < 1500) { const p = await Cs.ev('window.__ww.peer()'); if (p.last && Math.hypot(p.last.x - t0.x, p.last.z - t0.z) < 0.05 && !arrive[k]) arrive[k] = p.last.wall - t0.t; if (p.shown && Math.hypot(p.shown.x - t0.x, p.shown.z - t0.z) < 0.1) { seen = p.now - t0.t; break; } await sleep(4); }
      draw.push(seen); await sleep(250);
    }
    const okd = draw.every((v) => v != null && v < 200);
    ok(`${label}: the other screen draws each move within 200 ms (drawn after ${draw.join(', ')} ms; the message came after ${arrive.join(', ')} ms)`, okd, { draw, arrive });
  };
  await lat(CA, CB, 'the host moves'); await lat(CB, CA, 'the joiner moves');

  // ---- a change into an animal shows on the other side; different levels at once
  // timed from the change itself (the page's clock just after the right answer changes them), not from before the spelling
  let rA = await inPage(CA, `const r = become('horse'); r.at = Date.now(); return r;`), t0 = rA.at;
  const formSeen = (C, f) => C.until(`(() => { const p = window.__ww.peer(); return p && p.model && p.model.form === "${f}" ? { at: Date.now(), came: p.formAt } : null; })()`, 2000, 5);
  let seen = await formSeen(CB, 'horse');
  ok(`the host spells at level 1 (${rA.mode}) and changes into a horse (${rA.form}); the other screen shows the horse after ${seen ? seen.at - t0 : '-'} ms (the message came after ${seen ? seen.came - t0 : '-'} ms)`, rA.mode === 'tiles' && rA.form === 'horse' && seen && seen.at - t0 < 200, { rA, seen, t0 });
  let rB = await inPage(CB, `const r = become('lion'); r.at = Date.now(); return r;`); t0 = rB.at;
  seen = await formSeen(CA, 'lion');
  ok(`at the same time the joiner spells at level 2 (${rB.mode}) and changes into a lion; the host sees it after ${seen ? seen.at - t0 : '-'} ms (the message came after ${seen ? seen.came - t0 : '-'} ms)`, rB.mode === 'type' && rB.form === 'lion' && seen && seen.at - t0 < 200, { rB, seen, t0 });
  const lv = [await CA.ev('window.__ww.progress()'), await CB.ev('window.__ww.progress()')];
  ok(`each keeps their own profile, level and words (${lv[0].level}: ${Object.keys(lv[0].words).join(',')}; ${lv[1].level}: ${Object.keys(lv[1].words).join(',')})`, lv[0].level === 1 && lv[1].level === 2 && lv[0].who === idA && lv[1].who === idB && lv[0].words.horse && lv[1].words.lion && !lv[0].words.lion && !lv[1].words.horse, lv);
  await inPage(CB, `return become('human');`);

  // ---- the shared book
  await CA.ev(`window.__ww.meet('giraffe')`); await CB.ev(`window.__ww.meet('fish')`);
  const bookB = await CB.until('window.__ww.state().met.includes("giraffe") ? window.__ww.state().met : null'), bookA = await CA.until('window.__ww.state().met.includes("fish") ? window.__ww.state().met : null');
  const savedB = await CB.ev(`JSON.parse(localStorage.getItem('wildworld.book.${idB}')).met`), savedA = await CA.ev(`JSON.parse(localStorage.getItem('wildworld.book.${idA}')).met`);
  ok(`a meet on either adds the animal to both books (the host's giraffe: ${!!bookB}; the joiner's fish: ${!!bookA}), each saved in its own player's book`, bookA && bookB && savedA.includes('giraffe') && savedA.includes('fish') && savedB.includes('giraffe') && savedB.includes('fish'), { savedA, savedB });

  // ---- riding: horse, elephant, dolphin
  const ride = async (form, where) => {
    if (where) { await CA.ev(`window.__ww.teleport(${where.x}, ${where.z}); window.__ww.settle()`); }
    const f = await inPage(CA, `return become('${form}').form;`);
    let s = await CA.ev('window.__ww.state()');
    await CB.ev(`window.__ww.teleport(${s.x + 1.6}, ${s.z + 0.8}); window.__ww.settle(); window.__ww.step(1)`); await sleep(350);
    await CB.ev('window.__ww.step(1)');
    const can = await CB.ev('window.__ww.ride()');
    const m = await CB.ev('window.__ww.mount()'); await sleep(250);
    const rA0 = await CA.ev('window.__ww.ride()'), b0 = await CB.ev('window.__ww.state()');
    // the animal walks (real time, small steps), the rider comes along
    await CA.ev(`window.__ww.face(${form === 'dolphin' ? 'window.__DOLPHIN_YAW' : 0})`);
    for (let k = 0; k < 24; k++) { await CA.ev('window.__ww.input({ y: -1 }); window.__ww.step(4)'); await sleep(35); }
    await CA.ev('window.__ww.input({})'); await sleep(350); await CB.ev('window.__ww.step(1)');
    const sa = await CA.ev('window.__ww.state()'), sb = await CB.ev('window.__ww.state()'), seenA = await CA.ev('window.__ww.peer()');
    const seatY = sa.y + window_seat(form);
    const moved = hd(b0, sb), close = hd(sa, sb);
    ok(`${form}: the human can ride (RIDE offered: ${can.can}), mounts (${m}); the ${form}'s screen carries them (${rA0.carrying})`, f === form && can.can && m && rA0.carrying, { f, can, m, rA0 });
    ok(`${form}: the ${form} walks ${moved.toFixed(1)} m and the rider comes along, sitting on its back (${close.toFixed(2)} m from its middle, ${(sb.y - sa.y).toFixed(2)} m up${form === 'dolphin' ? ', head above the sea' : ''}); on the ${form}'s screen too (${hd(seenA.shown, sa).toFixed(2)} m)`,
      moved > 6 && close < 0.8 && Math.abs(sb.y - seatY) < 0.35 + (form === 'dolphin' ? 0.6 : 0) && hd(seenA.shown, sa) < 0.6 && seenA.rd && (form !== 'dolphin' || sb.y + 1.78 > 0.3), { sa, sb, seenA, moved, close });
    const off = await CB.ev('window.__ww.dismount()'); await sleep(250);
    const sb2 = await CB.ev('window.__ww.state()'), r2 = await CB.ev('window.__ww.ride()'), rA2 = await CA.ev('window.__ww.ride()');
    const safe = form === 'dolphin' ? sb2.y > -1.4 && sb2.y < -1.0 && !sb2.under : Math.abs(sb2.y - sb2.ground) < 0.05 && sb2.grounded;
    ok(`${form}: HOP OFF puts the rider down beside it (${hd(sb2, sa).toFixed(1)} m away, ${form === 'dolphin' ? 'paddling at the top' : 'on the ground'}: y ${sb2.y}), and the ${form} carries no one (${rA2.carrying})`, off && !r2.on && safe && hd(sb2, sa) > 0.8 && hd(sb2, sa) < 4 && !rA2.carrying, { sb2, r2, rA2 });
    return sa;
  };
  const window_seat = (form) => ({ horse: 1.75, elephant: 2.5, dolphin: 0.68 }[form] - 0.92);
  await ride('horse');
  await ride('elephant');
  // the dolphin: deep water, 30 m of it ahead
  const sea = await inPage(CA, `const s = S(); for (let r = 40; r < 3000; r += 24) for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      let deep = true; for (let d = -6; d <= 36 && deep; d += 3) { for (const side of [-4, 0, 4]) if (W.heightAt(x + Math.sin(a) * d + Math.cos(a) * side, z + Math.cos(a) * d - Math.sin(a) * side) > -4) deep = false; }
      if (deep) { window.__DOLPHIN_YAW = a; return { x, z, yaw: a }; } } return null;`);
  if (!ok(`found deep water for the dolphin (${sea ? sea.x.toFixed(0) + ', ' + sea.z.toFixed(0) : 'none'})`, !!sea, sea)) return out;
  await CB.ev(`window.__ww.teleport(${sea.x + 2}, ${sea.z})`);
  await ride('dolphin', sea);
  // a form change drops the rider safely: back on land, the host a horse with a rider, then human
  await CA.ev(`window.__ww.teleport(${sA.x}, ${sA.z}); window.__ww.settle()`); await inPage(CA, `return become('horse');`);
  let s = await CA.ev('window.__ww.state()');
  await CB.ev(`window.__ww.teleport(${s.x + 1.6}, ${s.z + 0.8}); window.__ww.settle()`); await sleep(350); await CB.ev('window.__ww.step(1)');
  const m2 = await CB.ev('window.__ww.mount()'); await sleep(250);
  await inPage(CA, `return become('human');`);
  const dropped = await CB.until('!window.__ww.ride().on', 1500, 10);
  await CB.ev('window.__ww.step(2)');
  const sb3 = await CB.ev('window.__ww.state()'); s = await CA.ev('window.__ww.state()');
  const carry = await CA.ev('window.__ww.ride().carrying');
  ok(`a form change drops the rider: the horse turns human, the rider is put down beside them on the ground (${hd(sb3, s).toFixed(1)} m away, ${(sb3.y - sb3.ground).toFixed(2)} m off the ground), no one carried`, m2 && dropped && sb3.grounded && Math.abs(sb3.y - sb3.ground) < 0.05 && hd(sb3, s) > 0.8 && hd(sb3, s) < 4 && !carry, { m2, sb3, s });
  const refuse = await CB.ev('window.__ww.mount()');
  ok(`a human can't ride a human (${refuse})`, refuse === false, refuse);

  // ---- a race: the host starts it, the joiner wins
  await CA.ev('window.__ww.manual(false)'); await CB.ev('window.__ww.manual(false)');
  await CA.ev('window.__ww.startGame("race")');
  const gB = await CB.until('window.__ww.game() && window.__ww.game().kind === "race" ? window.__ww.game() : null'), gA = await CA.ev('window.__ww.game()');
  ok(`RACE starts on both: the same flag (${gA?.marker?.x}, ${gA?.marker?.z}), ${Math.round(hd(gA.marker, s))} m ahead, a countdown (${gB?.countdown} s) with the flag's light and the chip showing (${gA?.chip} / ${gB?.chip})`,
    gA && gB && gA.marker.x === gB.marker.x && gA.marker.z === gB.marker.z && gB.countdown > 1 && gA.goal && gB.goal && gA.chip && gB.chip && gA.frozen, { gA, gB });
  const frz = await CA.ev(`(() => { const s0 = window.__ww.state(); window.__ww.manual(true); window.__ww.input({ y: -1 }); window.__ww.step(30); window.__ww.input({}); const s1 = window.__ww.state(); window.__ww.manual(false); return Math.hypot(s1.x - s0.x, s1.z - s0.z); })()`);
  ok(`nobody can move during the countdown (moved ${frz.toFixed(2)} m)`, frz < 0.01, frz);
  await sleep(3300);
  await CB.ev(`window.__ww.teleport(${gA.marker.x + 1}, ${gA.marker.z})`);
  const rsB = await CB.until('window.__ww.game().result', 2500), rsA = await CA.until('window.__ww.game().result', 2500);
  const gA2 = await CA.ev('window.__ww.game()'), gB2 = await CB.ev('window.__ww.game()');
  ok(`the joiner reaches the flag first: both screens show it ("${gB2.toast}" / "${gA2.toast}"), the flag goes`, rsA && rsB && rsB.win === 1 && rsB.me && !rsA.me && /You win the race/.test(gB2.toast || '') && /Your friend wins the race/.test(gA2.toast || '') && !gA2.goal && !gB2.goal, { gA2, gB2 });
  await CA.shot('two-race-result');

  // ---- tag: the joiner starts it (and is it), tags the host, the host is it when time runs out
  await sleep(500);
  await CB.ev('window.__ww.startGame("tag", 7)');
  const tA = await CA.until('window.__ww.game() && window.__ww.game().kind === "tag" ? window.__ww.game() : null'), tB = await CB.until('window.__ww.game() && window.__ww.game().kind === "tag" ? window.__ww.game() : null');
  ok(`TAG starts on both from the joiner's pause menu (asked of the host, the referee): the joiner is it (${tB?.meIt}), the host isn't (${tA?.meIt}); chips "${tA?.chip}" / "${tB?.chip}"`, tA && tB && tA.id === tB.id && tB.meIt === true && tA.meIt === false, { tA, tB });
  await sleep(3200);
  s = await CA.ev('window.__ww.state()');
  await CB.ev(`window.__ww.teleport(${s.x + 0.6}, ${s.z})`);
  const passed = await CA.until('window.__ww.game().meIt === true ? window.__ww.game() : null', 2000), passedB = await CB.until('window.__ww.game().meIt === false ? window.__ww.game() : null', 2000);
  ok(`a touch passes "it": the host is it now (${passed?.meIt}; ${passed?.tags} tag), and the joiner's screen agrees (${passedB?.chip})`, passed && passedB && passed.tags === 1 && passedB.it === 0, { passed, passedB });
  await CB.ev(`window.__ww.teleport(${s.x + 25}, ${s.z + 10})`);
  const tr = await CA.until('window.__ww.game().result', 8000), trB = await CB.until('window.__ww.game().result', 3000);
  const tA2 = await CA.ev('window.__ww.game()'), tB2 = await CB.ev('window.__ww.game()');
  ok(`time runs out with the host it: both screens show the joiner won ("${tB2.toast}" / "${tA2.toast}")`, tr && trB && tr.win === 1 && trB.me && !tr.me && /You win at tag/.test(tB2.toast || '') && /Your friend wins at tag/.test(tA2.toast || ''), { tA2, tB2 });
  await CB.shot('two-tag-result');
  await CA.ev('window.__ww.manual(true)'); await CB.ev('window.__ww.manual(true)');

  // ---- a third player is refused; the two stay together
  const c3 = await nodeClient(R); c3.put({ t: 'join', code }); const r3 = await c3.next(); try { c3.close(); } catch {}
  await sleep(200);
  nA = await CA.ev('window.__ww.net()'); nB = await CB.ev('window.__ww.net()');
  ok(`a third player is refused (${r3?.why}) and the two stay together (${nA.state}, ${nB.state})`, r3?.t === 'err' && r3.why === 'full' && nA.state === 'together' && nB.state === 'together', { r3, nA, nB });

  // ---- privacy: every frame both ways, on both Chromes
  const allFrames = [...CA.frames, ...CB.frames], names = [...NAMES, idA, idB], found = [];
  const okTypes = new Set(['host', 'join', 'leave', 'room', 'peer-join', 'peer-left', 'err', 'hi', 'st', 'meet', 'mount', 'dismount', 'drop', 'game', 'want', 'reach', 'it', 'over']);
  for (const f of allFrames) { for (const n of names) if (f.data.includes(n)) found.push(n + ' in ' + f.data.slice(0, 120)); let m = null; try { m = JSON.parse(f.data); } catch {} if (!m || !okTypes.has(m.t) || /level|name|words|who/i.test(Object.keys(m).join(' ')) || (m.av && Object.keys(m.av).sort().join() !== 'color,icon')) found.push('odd frame ' + f.data.slice(0, 120)); }
  ok(`nothing about a player goes over the wire but an icon and a color: ${allFrames.length} WebSocket frames read, no name, profile id, level or words`, allFrames.length > 50 && !found.length, found.slice(0, 8));

  // ---- a reload: the joiner leaves (the host is told), the save keeps the shared animals, the same code rejoins
  await CB.reload();
  const left = await CA.until('window.__ww.net().state === "waiting" ? window.__ww.net() : null', 3000);
  const bookAfter = await CB.ev(`(() => { const b = JSON.parse(localStorage.getItem('wildworld.book.${idB}')); return { met: b.met, who: window.__ww.state().who, live: window.__ww.state().met }; })()`);
  ok(`a reload: the host is told their friend left and keeps the code (${left?.state}); the joiner's save, after the reload, still has the host's giraffe (${bookAfter.met.join(',')})`, left && bookAfter.met.includes('giraffe') && bookAfter.live.includes('giraffe') && bookAfter.who === idB, { left, bookAfter });
  await inPage(CB, 'W.start(); W.manual(true); return true;');
  await CB.ev(`window.__ww.join(${JSON.stringify(code)})`);
  const back = await CB.until('window.__ww.net().state === "together" && window.__ww.peer() && window.__ww.peer().av', 4000) && await CA.until('window.__ww.net().state === "together" && window.__ww.peer() && window.__ww.peer().av', 4000);
  ok(`the same code joins again: together (${(await CB.ev('window.__ww.net()')).state})`, !!back, await CB.ev('window.__ww.net()'));
  await sleep(300);

  // ---- the relay dies: both keep playing alone, with everything
  const before = { A: await CA.ev('window.__ww.progress()'), B: await CB.ev('window.__ww.progress()'), mA: (await CA.ev('window.__ww.state()')).met, mB: (await CB.ev('window.__ww.state()')).met };
  const port = R.port; await killRelayWait(R);
  const dA = await CA.until('window.__ww.net().state === "dropped"', 3000), dB = await CB.until('window.__ww.net().state === "dropped"', 3000);
  const noteA = await CA.ev('document.getElementById("toast").classList.contains("on") ? document.getElementById("toastText").textContent : null'), noteB = await CB.ev('document.getElementById("toast").classList.contains("on") ? document.getElementById("toastText").textContent : null');
  ok(`the relay is killed: both notice (${dA}, ${dB}) with a calm notice ("${noteA}" / "${noteB}"), and the friend is gone from the world`, dA && dB && /stopped/.test(noteA || '') && /stopped/.test(noteB || '') && !(await CA.ev('window.__ww.peer()')) && !(await CB.ev('window.__ww.peer()')), { noteA, noteB });
  await CA.shot('two-dropped');
  for (const [C, label, mine] of [[CA, 'host', before.mA], [CB, 'joiner', before.mB]]) {
    const r = await inPage(C, `const s0 = S(); W.input({ y: -1 }); W.step(60); W.input({}); const s1 = S(); W.meet('cow'); const b = become('cow'); const s2 = S(); W.requestChange('human');
      return { moved: Math.hypot(s1.x - s0.x, s1.z - s0.z), met: s2.met, form: b.form, who: s2.who, prog: W.progress(), saved: JSON.parse(localStorage.getItem('wildworld.book.' + s2.who)).met, overlay: s2.overlay };`);
    const before1 = label === 'host' ? before.A : before.B;
    ok(`${label} alone: walks (${r.moved.toFixed(1)} m), meets a cow and changes into it (${r.form}), same profile (${r.who === before1.who}), every animal kept (${mine.every((m) => r.met.includes(m))}) and saved, every word kept (${Object.keys(before1.words).length} words)`,
      r.moved > 3 && r.form === 'cow' && r.who === before1.who && mine.every((m) => r.met.includes(m)) && r.saved.includes('cow') && Object.keys(before1.words).every((w) => r.prog.words[w]), r);
  }
  // the relay comes back on the same port (the same origin, so the same saves): a reload still has everything
  R = await startRelay({ port, ttl: 30 });
  await CA.reload(); await CB.reload();
  const after = { A: await CA.ev('window.__ww.state()'), B: await CB.ev('window.__ww.state()') };
  ok(`with the relay back, a reload on both still has every animal (${after.A.met.length} and ${after.B.met.length}, the shared giraffe and fish and the cow) and the same player`, after.A.who === idA && after.B.who === idB && ['giraffe', 'fish', 'cow'].every((m) => after.A.met.includes(m) && after.B.met.includes(m)), after);
  await killRelayWait(R);
  return out;
}

// ===========================================================================
// pages: another origin (as on Pages); and the saves to a file and back
// ===========================================================================
async function runPages(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const sb = await serveStatic();
  await C.open(sb, 844, 390, true);
  await setup(C, 'Max', 1);
  await C.ev(`window.__ww.meet('horse'); window.__ww.meet('lion'); window.__ww.manual(false); true`);
  const r0 = C.requests.length, s0 = C.sockets.length;
  await C.tap(420, 150); await sleep(200);
  await C.tapEl('.tp-root [data-tp="pause"]'); await sleep(250);
  await C.tapEl('#pTwoBtn'); await sleep(250);
  let n = await C.ev('window.__ww.net()');
  ok(`on another origin the pause menu still has 2 PLAYERS, and its panel shows HOST and JOIN (${n.page}; available ${n.available})`, n.open && n.page === 'off' && !n.available, n);
  await C.tapEl('#twHost'); await sleep(250);
  let msg = await C.ev('document.getElementById("twMsg").textContent'); n = await C.ev('window.__ww.net()');
  ok(`HOST explains in one line instead of failing: "${msg}"`, msg === 'Two players works at home: ask a parent to start the game server' && n.state === 'off', { msg, n });
  await C.shot('two-pages-why');
  await C.ev('window.__ww.Two.msg = ""; window.__ww.Two.draw()');
  await C.tapEl('#twJoin'); await sleep(250);
  msg = await C.ev('document.getElementById("twMsg").textContent'); n = await C.ev('window.__ww.net()');
  ok(`JOIN explains the same way ("${msg}") and opens no keypad (${n.page})`, msg === 'Two players works at home: ask a parent to start the game server' && n.page === 'off', { msg, n });
  ok(`and the page tried no WebSocket (${C.sockets.length - s0}) and no other request (${C.requests.slice(r0).join(', ') || 'none'}) for it`, C.sockets.length === s0 && C.requests.length === r0, { sockets: C.sockets, requests: C.requests.slice(r0) });
  await C.tapEl('#twX'); await sleep(200);
  // the saves: to a file here, loaded on the relay's page (a different origin, so different storage)
  const file = await C.ev(`JSON.stringify(window.__ww.backup())`);
  const fj = JSON.parse(file);
  ok(`the parent view's save file holds every player (${fj.profiles.map((p) => p.name).join(', ')} and Guest), their books and words`, fj.app === 'wild-world' && fj.profiles.length === 1 && Object.keys(fj.books).length === 2 && fj.books[fj.profiles[0].id].met.includes('lion'), fj);
  await C.ev('window.__ww.openTitle(); window.__ww.openParent(); true');
  const btns = await C.ev(`['pvSave', 'pvLoad'].map((id) => { const e = document.getElementById(id); const r = e && e.getBoundingClientRect(); return e ? { id, w: Math.round(r.width), h: Math.round(r.height), label: e.getAttribute('aria-label') } : null; })`);
  ok(`the parent view has Save to a file and Load from a file (${btns.map((b) => b && b.label).join('; ')}), each at least 44 px`, btns.every((b) => b && b.w >= 44 && b.h >= 44), btns);
  await C.ev('window.__ww.closeOverlay()');
  const R = await startRelay({ ttl: 5 });
  await C.open(R.base, 844, 390, true);
  const before = await C.ev('window.__ww.profiles().map((p) => p.name)');
  const rs = await C.ev(`window.__ww.restore(${JSON.stringify(file)})`);
  let after = await C.ev(`(() => { const W = window.__ww, p = W.profiles().find((q) => q.name === 'Max'); W.profile(p.id); return { names: W.profiles().map((q) => q.name), met: W.state().met, level: p.level }; })()`);
  ok(`the relay's page starts empty (${before.join(', ')}); loading the file brings the player over (${after.names.join(', ')}) with their animals (${after.met.join(', ')}) and level`, before.join() === 'Guest' && rs.ok && rs.added === 1 && after.met.includes('lion') && after.met.includes('horse') && after.level === 1, { rs, after });
  await C.ev(`window.__ww.meet('fish')`);
  const rs2 = await C.ev(`window.__ww.restore(${JSON.stringify(file)})`);
  after = await C.ev(`({ names: window.__ww.profiles().map((q) => q.name), met: window.__ww.state().met })`);
  ok(`loading it again adds to the same player, never doubles them, and loses nothing (${after.names.join(', ')}; ${after.met.join(', ')})`, rs2.ok && rs2.added === 0 && rs2.merged === 1 && after.names.filter((x) => x === 'Max').length === 1 && after.met.includes('fish') && after.met.includes('lion'), { rs2, after });
  const junk = await C.ev(`window.__ww.restore('{"nope":1}')`);
  ok(`a file that isn't a save is refused ("${junk.why}")`, junk.ok === false, junk);
  await C.reload();
  after = await C.ev(`({ names: window.__ww.profiles().map((q) => q.name), met: window.__ww.state().met })`);
  ok(`and a reload keeps it (${after.names.join(', ')}; ${after.met.length} animals)`, after.names.includes('Max') && after.met.includes('lion'), after);
  await killRelayWait(R);
  return out;
}

// ===========================================================================
// touch: a touch-only round on both devices
// ===========================================================================
async function runTouch(CA, CB) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const R = await startRelay({ ttl: 30 });
  await CA.open(R.base, 844, 390, true); await CB.open(R.base, 844, 390, true);
  await setup(CA, 'Max', 1); await setup(CB, 'Sam', 2);
  await CA.ev(`window.__ww.meet('horse'); window.__ww.spelling(false); window.__ww.manual(false); true`); await CB.ev('window.__ww.manual(false); true');
  for (const C of [CA, CB]) { await C.tap(420, 150); await sleep(200); }
  await CA.tapEl('.tp-root [data-tp="pause"]'); await sleep(250); await CA.tapEl('#pTwoBtn'); await sleep(250); await CA.tapEl('#twHost');
  const code = await CA.until('(() => { const n = window.__ww.net(); return n.state === "waiting" && n.code ? n.code : null; })()');
  const shown = await CA.ev('[...document.querySelectorAll("#twCode span")].map((s) => +s.dataset.c)');
  ok(`HOST by touch: the panel shows the code as 4 pictures (${JSON.stringify(shown)})`, code && JSON.stringify(shown) === JSON.stringify(code), { code, shown });
  await CA.shot('touch-two-host');
  await CB.tapEl('.tp-root [data-tp="pause"]'); await sleep(250); await CB.tapEl('#pTwoBtn'); await sleep(250); await CB.tapEl('#twJoin'); await sleep(250);
  for (let k = 0; k < 4; k++) { await CB.tapEl(`#twKeys .tw-key[data-c="${shown[k]}"]`); if (k === 2) await CB.shot('touch-two-join'); }
  const tog = await CB.until('window.__ww.net().state === "together"', 4000) && await CA.until('window.__ww.net().state === "together"', 4000);
  ok(`JOIN by touch: tapping the 4 pictures joins (${await CB.ev('window.__ww.net().state')})`, !!tog, await CB.ev('window.__ww.net()'));
  const closed = await CA.until('window.__ww.state().overlay === null', 3000) && await CB.until('window.__ww.state().overlay === null', 3000);
  ok(`both panels close by themselves and play goes on`, !!closed, { a: await CA.ev('window.__ww.state().overlay'), b: await CB.ev('window.__ww.state().overlay') });
  await CA.tapEl('.tp-root [data-tp="change"]'); await sleep(300); await CA.tapEl('#ring .wslot[data-id="horse"]'); await sleep(400);
  const fA = (await CA.ev('window.__ww.state()')).form;
  const seenHorse = await CB.until('(() => { const p = window.__ww.peer(); return p && p.form === "horse"; })()', 2000);
  ok(`the host taps CHANGE and the horse (${fA}); the other screen shows the horse (${!!seenHorse})`, fA === 'horse' && seenHorse, fA);
  let s = await CA.ev('window.__ww.state()');
  await CB.ev(`window.__ww.teleport(${s.x + 1.6}, ${s.z + 0.8}); true`);
  const rideBtn = await CB.until(`(() => { const b = document.querySelector('.tp-root [data-tp="power"]'); return b && getComputedStyle(b).display !== 'none' && b.textContent.trim() === 'RIDE' ? b.textContent.trim() : null; })()`, 2000);
  const nBtns = await CB.ev(`[...document.querySelectorAll('.tp-root .tp-btn:not(.tp-pause)')].filter((e) => getComputedStyle(e).display !== 'none').length`);
  ok(`next to the horse the guy's (powerless) power button is RIDE (${rideBtn}), still ${nBtns} buttons`, rideBtn === 'RIDE' && nBtns <= 4, { rideBtn, nBtns });
  await CB.tapEl('.tp-root [data-tp="power"]'); await sleep(300);
  let rb = await CB.ev('window.__ww.ride()');
  const hop = await CB.ev(`document.querySelector('.tp-root [data-tp="jump"]').textContent.trim()`);
  ok(`a tap on RIDE: riding (${rb.on}); JUMP is now ${hop}`, rb.on && hop === 'HOP OFF', { rb, hop });
  // the host walks with the stick for a second; the rider comes along
  const b0 = await CB.ev('window.__ww.state()');
  await CA.touch('touchStart', [[110, 300, 2]]); await sleep(60);
  for (let k = 1; k <= 6; k++) { await CA.touch('touchMove', [[110, 300 - k * 10, 2]]); await sleep(30); }
  await sleep(1300); await CA.touch('touchEnd', []); await sleep(400);
  const sa = await CA.ev('window.__ww.state()'), sb = await CB.ev('window.__ww.state()');
  ok(`the host walks the horse with the stick (${hd(s, sa).toFixed(1)} m) and the rider comes along (${hd(b0, sb).toFixed(1)} m; ${hd(sa, sb).toFixed(2)} m from its middle)`, hd(s, sa) > 4 && hd(b0, sb) > 4 && hd(sa, sb) < 0.9, { s, sa, b0, sb });
  await CB.shot('touch-two-ride');
  await CB.tapEl('.tp-root [data-tp="jump"]'); await sleep(350);
  rb = await CB.ev('window.__ww.ride()'); const sb2 = await CB.ev('window.__ww.state()');
  ok(`a tap on HOP OFF: down beside the horse (${rb.on ? 'still riding' : 'off'}, ${hd(sa, sb2).toFixed(1)} m away, on the ground: ${sb2.grounded})`, !rb.on && sb2.grounded && hd(sa, sb2) > 0.8 && hd(sa, sb2) < 4, { rb, sb2 });
  await killRelayWait(R);
  return out;
}

// ===========================================================================
// device lenses
// ===========================================================================
const LAYOUT = String.raw`(() => { const W = innerWidth, H = innerHeight;
  const vis = (e) => { if (!e || !e.getClientRects().length) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0; };
  // round things (the controller's rings, the friend's arrow) are circles; everything else is its box (as ww-world.mjs)
  const box = (e) => { const r = e.getBoundingClientRect(); return { n: e.id || (e.dataset.c != null ? 'key' + e.dataset.c : '') || e.dataset.tp || e.className, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, round: getComputedStyle(e).borderRadius === '50%' }; };
  const on = (q) => q.l >= -0.5 && q.t >= -0.5 && q.r <= W + 0.5 && q.b <= H + 0.5;
  const circ = (p) => ({ x: (p.l + p.r) / 2, y: (p.t + p.b) / 2, r: (p.r - p.l) / 2 });
  const hit = (p, q) => {
    if (!(p.l < q.r - 0.5 && q.l < p.r - 0.5 && p.t < q.b - 0.5 && q.t < p.b - 0.5)) return false;
    if (p.round && q.round) { const a = circ(p), b = circ(q); return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 0.5; }
    if (p.round || q.round) { const c = circ(p.round ? p : q), s = p.round ? q : p; const dx = Math.max(s.l - c.x, 0, c.x - s.r), dy = Math.max(s.t - c.y, 0, c.y - s.b); return Math.hypot(dx, dy) < c.r - 0.5; }
    return true;
  };
  const pairs = (list) => { const o = []; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (hit(list[i], list[j])) o.push(list[i].n + ' x ' + list[j].n); return o; };
  const scroll = { x: document.documentElement.scrollWidth - W, y: document.documentElement.scrollHeight - H };
  const check = (sel, extra = [], minSize = 44) => { const els = [...document.querySelectorAll(sel)].filter(vis), b = els.map(box), x = extra.map((q) => document.querySelector(q)).filter(vis).map(box), all = [...b, ...x];
    return { n: b.length, names: b.map((q) => q.n), off: all.filter((q) => !on(q)).map((q) => q.n), hits: pairs(all), small: b.filter((q) => Math.min(q.w, q.h) < minSize - 0.5).map((q) => q.n + ' ' + Math.round(q.w) + 'x' + Math.round(q.h)), min: Math.round(Math.min(...b.map((q) => Math.min(q.w, q.h)))), scroll }; };
  return { check };
})()`;
async function runSize(C, size) {
  const [w, h] = size.split('x').map(Number), out = [], ok = (name, pass, got) => { out.push({ name: size + ': ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const good = (r) => !r.off.length && !r.hits.length && !r.small.length && r.scroll.x <= 0 && r.scroll.y <= 0;
  const R = await startRelay({ ttl: 5 });
  await C.open(R.base, w, h, true);
  await setup(C, 'Max', 1);
  await C.ev(`window.__ww.meet('horse'); window.__ww.spelling(false); window.__ww.requestChange('horse'); true`);
  await C.tap(Math.round(w * 0.6), Math.round(h * 0.3)); await sleep(150);
  const check = (sel, extra) => C.ev(String.raw`(() => { const L = ${LAYOUT}; return L.check(${JSON.stringify(sel)}, ${JSON.stringify(extra || [])}); })()`);
  await C.ev('window.__ww.openPause()');
  let r = await check('#pause .big');
  ok(`the pause menu alone: ${r.n} buttons (${r.names.join(', ')}) on screen, none overlapping, each at least 44 px (smallest ${r.min})`, r.n === 6 && r.names.includes('pTwoBtn') && good(r), r);
  await C.shot(`two-${size}-pause`);
  await C.ev('window.__ww.openTwo()');
  r = await check('#two button');
  ok(`2 PLAYERS: HOST and JOIN and close (${r.n}) on screen, none overlapping, each at least 44 px (smallest ${r.min})`, r.n === 3 && good(r), r);
  await C.shot(`two-${size}-off`);
  await C.ev('window.__ww.Two.joinPage()');
  r = await check('#two button', ['#twSlots', '.tw-head h2']);
  ok(`JOIN's picture keypad: ${r.n} buttons (back, close, 8 pictures, delete) and the 4 slots on screen, none overlapping, each at least 44 px (smallest ${r.min})`, r.n === 11 && good(r), r);
  await C.ev('window.__ww.Two.tapKey(2); window.__ww.Two.tapKey(5)');
  await C.shot(`two-${size}-join`);
  await C.ev('window.__ww.Two.back(); window.__ww.host()');
  const code = await C.until('(() => { const n = window.__ww.net(); return n.state === "waiting" && n.code ? n.code : null; })()');
  r = await check('#two button', ['#twCode', '.tw-head h2']);
  ok(`HOST: the code's 4 pictures and ${r.n} buttons (close, cancel) on screen, none overlapping, each at least 44 px`, code && r.n === 2 && good(r), r);
  await C.shot(`two-${size}-host`);
  // a stand-in friend on a Node socket joins and stands 15 m behind the camera (so the edge arrow shows)
  const f = await nodeClient(R); f.put({ t: 'join', code }); await f.next('room');
  const s = await C.ev('(() => { const s = window.__ww.state(); return { x: s.x, y: s.y, z: s.z, yaw: s.camYaw }; })()');
  const at = { x: +(s.x - Math.sin(s.yaw) * 15).toFixed(2), z: +(s.z - Math.cos(s.yaw) * 15).toFixed(2) };
  f.put({ t: 'hi', v: 1, seed: 157, av: { icon: 'rocket', color: '#5cc8ff' }, x: at.x, y: s.y, z: at.z, form: 'elephant' });
  const pulse = setInterval(() => { try { f.put({ t: 'st', x: at.x, y: s.y, z: at.z, yaw: 0, f: 'elephant', s: 0, g: 1, rd: 0 }); } catch {} }, 50);
  try {
    const tog = await C.until('window.__ww.net().state === "together" && window.__ww.peer() && window.__ww.peer().av', 3000);
    await C.ev('window.__ww.openTwo()');
    r = await check('#two button', ['#twWith', '.tw-head h2']);
    ok(`together: the friend's face and ${r.n} buttons (close, leave) on screen, none overlapping, each at least 44 px`, tog && r.n === 2 && good(r), r);
    await C.shot(`two-${size}-together`);
    await C.ev('window.__ww.closeOverlay(); window.__ww.openPause()');
    r = await check('#pause .big');
    ok(`the pause menu together: ${r.n} buttons (with RACE and TAG; PLAYER waits) on screen, none overlapping, each at least 44 px (smallest ${r.min})`, r.n === 7 && r.names.includes('pRaceBtn') && r.names.includes('pTagBtn') && !r.names.includes('pWhoBtn') && good(r), r);
    await C.shot(`two-${size}-pause-together`);
    await C.ev('window.__ww.closeOverlay(); window.__ww.startGame("tag", 60); window.__ww.manual(true); window.__ww.step(1)');
    await sleep(300); await C.ev('window.__ww.step(1)');
    r = await C.ev(String.raw`(() => { const L = ${LAYOUT}; const c = L.check('.tp-root .tp-ring.tp-stick, .tp-root .tp-btn, #formChip, #gameChip, #bookChip', ['#peerArrow'], 40); return { ...c, arrow: window.__ww.peer().arrowOn, chip: window.__ww.game().chip }; })()`);
    ok(`the HUD in tag: stick, ${r.n - 3} buttons, the pause button, the animal chip and the game chip ("${r.chip}"; the book chip steps aside) and the friend's edge arrow (${r.arrow}) all on screen, none overlapping, no scroll`,
      r.arrow && r.chip && r.n === 8 && !r.names.includes('bookChip') && !r.off.length && !r.hits.length && r.scroll.x <= 0 && r.scroll.y <= 0, r);
    await C.shot(`two-${size}-hud`);
  } finally { clearInterval(pulse); try { f.close(); } catch {} }
  // the explanation, as on Pages
  const sb = await serveStatic();
  await C.open(sb, w, h, true); await setup(C, 'Max', 1);
  await C.ev('window.__ww.openPause(); window.__ww.openTwo(); document.getElementById("twHost")._tap(); true');
  r = await check('#two button', ['#twMsg', '.tw-head h2']);
  const msg = await C.ev('document.getElementById("twMsg").textContent');
  ok(`as on Pages: the one-line explanation under HOST and JOIN fits ("${msg.slice(0, 40)}..."), nothing overlapping`, /ask a parent/.test(msg) && r.n === 3 && good(r), r);
  await killRelayWait(R);
  return out;
}

async function main() {
  const all = []; const unfinished = [];
  for (const run of runs) {
    const two = run === 'together' || run === 'touch', S = run === 'relay' ? [] : two ? [launch(), launch()] : [launch()];
    const t0 = Date.now(); let timer, Cs = [];
    try {
      for (let i = 0; i < S.length; i++) Cs.push(await connect(S[i], i ? 'B' : 'A'));
      const job = run === 'relay' ? runRelay() : run === 'together' ? runTogether(...Cs) : run === 'pages' ? runPages(Cs[0]) : run === 'touch' ? runTouch(...Cs) : runSize(Cs[0], run);
      const res = await Promise.race([job, new Promise((_, j) => { timer = setTimeout(() => j(new Error(`over ${RUN_TIMEOUT_MS / 60000} min: killed`)), RUN_TIMEOUT_MS); })]);
      for (const C of Cs) res.push({ name: `${run}: no page errors (${C.tag})`, pass: C.errs.length === 0, got: C.errs.length ? C.errs.slice(0, 10) : undefined });
      all.push(...res);
      const bad = res.filter((r) => !r.pass);
      console.log(`${run}: ${res.length - bad.length}/${res.length} pass  (${((Date.now() - t0) / 1000).toFixed(1)} s)${bad.length ? '  FAIL' : ''}`);
      for (const r of res) if (r.pass) console.log('  ok   ' + r.name);
      for (const r of bad) console.log('  FAIL ' + r.name + '\n       ' + JSON.stringify(r.got)?.slice(0, 1500));
    } catch (e) {
      unfinished.push(run + ': ' + (e?.message || e));
      console.log(`${run}: did not finish: ${e?.stack || e?.message || e}`);
      for (const C of Cs) if (C.errs.length) console.log('  page errors (' + C.tag + '): ' + JSON.stringify(C.errs.slice(0, 5)));
    } finally { clearTimeout(timer); for (const s of S) await kill(s); for (const R of [...relays]) killRelay(R); }
  }
  const failed = all.filter((r) => !r.pass);
  console.log(`${all.length - failed.length}/${all.length} checks pass${unfinished.length ? `, ${unfinished.length} run(s) did not finish` : ''}: ${failed.length || unfinished.length ? 'FAIL' : 'PASS'}`);
  return unfinished.length ? 2 : failed.length ? 1 : 0;
}

let code = 2;
try { code = await main(); }
catch (e) { console.error('check failed: ' + (e?.stack || e?.message || e)); }
finally { await killAll(); }
process.exit(code);
