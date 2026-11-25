#!/usr/bin/env node
// Robot Battle endless world check (#167, slice 7: two players anywhere).
//
// Two headless Chromes (muted, not detached, killed with their profiles deleted on every way out) play one room. Nothing
// listens and no relay runs: each page is answered from this repo through CDP (Fetch), with the one line the relay puts in
// it, at http://rb.test/, and its WebSocket is a stand-in whose frames this process passes between the pages by the relay's
// own rules (class Rooms below is taken from scripts/ww-relay.mjs: codes, rooms, refusals, caps). The relay's sockets
// themselves are not checked here.
//
//   rules   - no relay (the plain file): the entry is only in the world's pause menu, HOST / JOIN say one calm line, no
//             socket is opened; host, a wrong code, a full room, a busy server, a friend in another world, join, leave
//   play    - each sees the other move, turn, jump, go down; climb a summit, go into a cave and a tower together
//   robots  - every robot type drawn on both, hit and beaten from either, handed over, fixed or taken apart: one keeps it
//   things  - ground parts, kits, smashed props, a summit's flag, a ring: the same on both; each record has only its own
//   lines   - a pause, a dropped line, a silent line, a reload: each plays on with nothing lost; a join again
//   wire    - every frame sent: no name, id or record, at most 4096 bytes, inside the relay's caps; storage keys the same
//   touch   - 844 x 390, 740 x 360, 667 x 375: the pause menu and each page of the panel fit, at most 4 touch buttons
//
// Usage:  node scripts/rb-world-two.mjs [path/to/robot-battle.html] [--json] [--only rules,play] [--shots dir]
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let target = null, json = false, only = null, shots = null;
for (let i = 0; i < args.length; i++) { if (args[i] === '--json') json = true; else if (args[i] === '--only') only = args[++i].split(','); else if (args[i] === '--shots') shots = args[++i]; else target = args[i]; }
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
target = path.resolve(target || path.join(repo, 'robot-battle.html'));
const fileUrl = pathToFileURL(target).href, HOST = 'http://rb.test', url = HOST + '/robot-battle.html';

// made-up profiles (#161: no real child's name anywhere)
const KIDS = [{ id: 'tester', name: 'Tester', icon: 'bow', hex: '#3fb4ff', ladder: 'check', wiring: 'math', created: 1 }, { id: 'robo', name: 'Robo', icon: 'sun', hex: '#ff8a1f', ladder: 'start', wiring: 'math', created: 2 }];
const KIDS_SET = `localStorage.setItem('robotbattle.profiles', ${JSON.stringify(JSON.stringify(KIDS))})`;

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
const chromeBin = findChrome();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the relay's rules (scripts/ww-relay.mjs), between this process's own two ends ----
const MISS_MAX = 20, MISS_MS = 10000, MAX_MSG = 4096, MAX_ROOMS = 64, ROOM_SIZE = 2, RATE = 90, RATE_EVENTS = 30, CODE_LEN = 4, CODE_ICONS = 8, ROOM_TTL_MS = 30000;
const RESERVED = new Set(['host', 'join', 'leave', 'room', 'err', 'peer-join', 'peer-left']);
const Rooms = {
  map: new Map(), misses: { t: 0, n: 0 },
  key: (code) => (Array.isArray(code) && code.length === CODE_LEN && code.every((c) => Number.isInteger(c) && c >= 0 && c < CODE_ICONS) ? code.join('-') : null),
  host(p) {
    const old = p.room; this.leave(p); if (old && !old.peers.length) this.map.delete(old.code.join('-'));
    this.sweep();
    if (this.map.size >= MAX_ROOMS) { p.send({ t: 'err', why: 'busy' }); return; }
    let code, k; do { code = Array.from({ length: CODE_LEN }, () => crypto.randomInt(CODE_ICONS)); k = code.join('-'); } while (this.map.has(k));
    const room = { code, peers: [p], emptyAt: 0 }; this.map.set(k, room); p.room = room; p.you = 0; p.send({ t: 'room', code, you: 0 });
  },
  join(p, code) {
    this.sweep();
    const now = Date.now(); if (now - this.misses.t > MISS_MS) { this.misses.t = now; this.misses.n = 0; }
    if (this.misses.n >= MISS_MAX) { p.send({ t: 'err', why: 'busy' }); return; }
    const k = this.key(code), room = k && this.map.get(k);
    if (!room) { this.misses.n++; p.send({ t: 'err', why: 'nocode' }); return; }
    if (room.peers.includes(p)) { p.send({ t: 'room', code: room.code, you: p.you }); return; }
    if (room.peers.length >= ROOM_SIZE) { p.send({ t: 'err', why: 'full' }); return; }
    this.leave(p);
    p.you = room.peers.some((o) => o.you === 0) ? 1 : 0; room.peers.push(p); room.emptyAt = 0; p.room = room;
    p.send({ t: 'room', code: room.code, you: p.you, peers: room.peers.length });
    for (const o of room.peers) if (o !== p) o.send({ t: 'peer-join' });
  },
  leave(p) {
    const room = p.room; if (!room) return;
    p.room = null; room.peers = room.peers.filter((o) => o !== p);
    for (const o of room.peers) o.send({ t: 'peer-left' });
    if (!room.peers.length) room.emptyAt = Date.now();
  },
  sweep() { const now = Date.now(); for (const [k, r] of this.map) if (!r.peers.length && now - r.emptyAt >= ROOM_TTL_MS) this.map.delete(k); },
};
const Wire = { frames: [], over: 0, capped: 0, loseEv: 0 };
class Peer {
  constructor(raw, shut) { this.raw = raw; this.shut = shut; this.rate = { t: 0, n: 0 }; this.events = { t: 0, n: 0 }; this.room = null; this.mute = false; }
  send(m) { if (!this.mute) this.raw(typeof m === 'string' ? m : JSON.stringify(m)); }
  got(text) {
    const len = Buffer.byteLength(text); Wire.frames.push(text);
    if (len > MAX_MSG) { Wire.over++; this.shut(1009); return; }
    if (this.mute) return;
    let m; try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const now = Date.now(), B = m.t === 'st' ? this.rate : this.events;
    if (now - B.t > 1000) { B.t = now; B.n = 0; } if (++B.n > (m.t === 'st' ? RATE : RATE_EVENTS)) { Wire.capped++; return; }
    if (m.t === 'host') return Rooms.host(this); if (m.t === 'join') return Rooms.join(this, m.code); if (m.t === 'leave') return Rooms.leave(this);
    if (RESERVED.has(m.t) || !this.room) return;
    if (m.t === 'ev' && Wire.loseEv > 0) { Wire.loseEv--; return; }   // (a frame lost on the way: the page must send it again)
    for (const o of this.room.peers) if (o !== this) o.send(text);
  }
  gone() { Rooms.leave(this); }
}
const fake = () => { const got = []; const p = new Peer((s) => got.push(JSON.parse(s)), () => {}); p.log = got; return p; };

// ---- in the page, before its own scripts: the relay's line and the stand-in socket ----
const INJECT = `(() => {
  const socks = new Map(); let n = 0; window.__sockets = 0;
  class Stand { constructor(u) { window.__sockets++; this.url = u; this.readyState = 0; this.id = ++n; socks.set(this.id, this); __wire(JSON.stringify({ id: this.id, op: 'open', u })); }
    send(s) { if (this.readyState === 1) __wire(JSON.stringify({ id: this.id, op: 'msg', s })); }
    close() { if (this.readyState < 2) { this.readyState = 3; __wire(JSON.stringify({ id: this.id, op: 'close' })); } } }
  window.WebSocket = Stand;
  window.__toPage = (id, op, s) => { const w = socks.get(id); if (!w) return; if (op === 'open') { w.readyState = 1; w.onopen?.({}); } else if (op === 'msg') { if (w.readyState === 1) w.onmessage?.({ data: s }); } else { if (w.readyState === 3) return; w.readyState = 3; w.onclose?.({ code: 1006 }); } };
})();`;

const shared = new Set();
function launch() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-two-'));
  const chrome = spawn(chromeBin, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--allow-file-access-from-files', '--window-size=1280,800', '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
  chrome.on('error', () => {});
  const S = { chrome, prof, exited: false, ws: null, cleaned: false };
  chrome.on('exit', () => { S.exited = true; });
  shared.add(S); return S;
}
function killSync(S) { if (!S || S.cleaned) return; S.cleaned = true; try { S.ws?.close(); } catch {} try { S.chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(S.prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch {} }
async function kill(S) { if (!S || S.cleaned) return; try { S.chrome.kill('SIGKILL'); } catch {} for (let i = 0; i < 50 && !S.exited; i++) await sleep(20); killSync(S); }
process.on('exit', () => { for (const S of shared) killSync(S); });
const killAll = () => Promise.all([...shared].map(kill));
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => { killAll().finally(() => process.exit(code)); });
const HARD_TIMEOUT_MS = 15 * 60 * 1000;
setTimeout(() => { console.error(`hard timeout: over ${HARD_TIMEOUT_MS / 60000} min; closing Chrome`); killAll().finally(() => process.exit(124)); }, HARD_TIMEOUT_MS).unref();

async function connect(S) {
  let tgt, port;
  for (let i = 0; i < 450 && !tgt && !S.exited; i++) {
    try { const f = fs.readFileSync(path.join(S.prof, 'DevToolsActivePort'), 'utf8'); if (f.includes('\n')) port = parseInt(f, 10) || undefined; } catch {}
    if (port) try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!tgt) await sleep(200);
  }
  if (!tgt) throw new Error('Chrome did not start (' + chromeBin + ')');
  const ws = S.ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; ws.onclose = () => j(new Error('Chrome closed the connection')); });
  let id = 0; const pend = new Map(), errs = [], peers = new Map(); const C = { errs, peers, seed: null, dead: false };
  ws.onclose = () => { for (const [, f] of pend) f({ result: { exceptionDetails: { text: 'Chrome closed the connection' } } }); pend.clear(); };
  const send = C.send = (method, params = {}) => new Promise((r) => { if (ws.readyState !== 1) return r({ result: { exceptionDetails: { text: 'Chrome closed the connection' } } }); const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const toPage = (i, op, s) => send('Runtime.evaluate', { expression: `window.__toPage && __toPage(${i}, '${op}', ${JSON.stringify(s ?? '')})` });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { pend.get(m.id)?.(m); pend.delete(m.id); }
    else if (m.method === 'Runtime.bindingCalled') {
      const w = JSON.parse(m.params.payload);
      if (w.op === 'open') { if (C.refuse) { toPage(w.id, 'close'); return; } const p = new Peer((s) => toPage(w.id, 'msg', s), () => { toPage(w.id, 'close'); p.gone(); }); p.url = w.u; peers.set(w.id, p); C.peer = p; C.sock = w.id; toPage(w.id, 'open'); }
      else if (w.op === 'msg') peers.get(w.id)?.got(w.s);
      else { peers.get(w.id)?.gone(); peers.delete(w.id); }
    }
    else if (m.method === 'Fetch.requestPaused') {
      const u = new URL(m.params.request.url), rid = m.params.requestId;
      if (u.origin !== HOST) { send('Fetch.continueRequest', { requestId: rid }); return; }
      const name = decodeURIComponent(u.pathname.slice(1)), f = name === 'robot-battle.html' ? target : path.join(repo, name);
      if (!f.startsWith(repo) && f !== target || !fs.existsSync(f) || !fs.statSync(f).isFile()) { send('Fetch.fulfillRequest', { requestId: rid, responseCode: 404, body: '' }); return; }
      let body = fs.readFileSync(f); if (name === 'robot-battle.html') { const s = body.toString('utf8'), i = s.indexOf('<head>'); body = Buffer.from(s.slice(0, i + 6) + '\n<script>window.WW_RELAY={v:1}</script>' + s.slice(i + 6)); }
      send('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'content-type', value: name.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }], body: body.toString('base64') });
    }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) errs.push('log: ' + m.params.entry.text);
  };
  const ev = C.ev = async (expression) => {
    const v = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (v.result?.exceptionDetails) throw new Error('page threw: ' + (v.result.exceptionDetails.exception?.description || v.result.exceptionDetails.text));
    return v.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('Runtime.addBinding', { name: '__wire' });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT }); await send('Fetch.enable', { patterns: [{ urlPattern: HOST + '/*' }] });
  C.size = async (w, h, touch) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!touch, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: !!touch, maxTouchPoints: touch ? 5 : 0 });
  };
  C.open = async (w, h, touch, u = url, fresh = true) => {
    await C.size(w, h, touch);
    for (let pass = fresh ? 0 : 1; pass < 2; pass++) {
      for (const p of peers.values()) p.gone(); peers.clear();
      await send('Page.navigate', { url: 'about:blank' }); await sleep(100);
      await send('Page.navigate', { url: u });
      let up = false; for (let i = 0; i < 150 && !up; i++) { await sleep(200); up = await ev('document.readyState === "complete" && !!window.__rb').catch(() => false); }
      if (!up) throw new Error('page did not load window.__rb: ' + u);
      if (pass === 0) await ev(`(localStorage.clear(), ${KIDS_SET}, true)`);
    }
  };
  C.world = (who) => ev(`(() => { const R = window.__rb; R.player('${who}'); R.world(true); R.start(0); R.manual(true); R.step(2); return R.Game.world; })()`);
  C.tap = async (x, y) => { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] }); await sleep(40); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(150); };
  C.tapEl = async (sel) => { const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; })()`); if (!r) return false; await C.tap(r.x, r.y); return true; };
  C.shot = async (name) => { if (!shots) return; fs.mkdirSync(shots, { recursive: true }); const r = await send('Page.captureScreenshot', { format: 'png' }); if (r.result?.data) fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(r.result.data, 'base64')); };
  C.drop = () => { toPage(C.sock, 'close'); C.peer.gone(); };
  C.st = () => ev('window.__rb.twoStatus()');
  C.js = (b) => ev(`(() => { const R = window.__rb, G = R.Game, W = R.World, T = R.two, m0 = () => G.humans[0].mech, keys = () => Object.keys(localStorage).sort(), rec = (id) => JSON.parse(localStorage.getItem('robotbattle.facts.' + id) || 'null');
    const pup = (n) => G.robots.find((r) => r.nid === n);
${SOLVE}
    ${b} })()`);
  return C;
}
const SOLVE = String.raw`  const st = (id) => R.state().robots.find((q) => q.id === id);
  const solve = (id) => {
    for (let pass = 0; pass < 12; pass++) {
      const s = st(id); if (!s || s.state === 'ally') return true;
      for (const [k, q] of (s.board?.puzzles || []).entries()) if (!q.done) R.puzzle(id, k, q.answer);
      const t = st(id); if (!t || t.state === 'ally') return true;
      const Wi = t.wires; if (!Wi) break;
      for (let i = 0; i < Wi.plugs.length; i++) {
        if (Wi.link[i] >= 0) continue;
        if (Wi.burnt[i]) { R.patch(id, i); continue; }
        if (Wi.typed[i]) { R.type(id, i, Wi.facts[i].answer, 1500); continue; }
        const j = Wi.facts ? Wi.answers.findIndex((a, j) => a === Wi.facts[i].answer && !Wi.link.includes(j)) : Wi.ports.findIndex((p, j) => p.color === Wi.plugs[i].color && !Wi.link.includes(j));
        if (j >= 0) R.wire(id, [[i, j]], 1500);
      }
    }
    const s = st(id); return !s || s.state === 'ally';
  };`;

let A, B;
// both pages' games run on (steps of 4 ticks, with the wire in between), until f() or for ms
async function run(ms, f) {
  const t0 = Date.now(); let v;
  for (;;) {
    await Promise.all([A, B].map((C) => C.ev(`(() => { const R = window.__rb; R.Game.paused || R.step(4); R.render(); const m = R.Game.humans[0]?.mech; if (m && !window.__hurts) m.health = m.maxHealth; return 1; })()`)));
    if (f && (v = await f())) return v;
    if (Date.now() - t0 > ms) return f ? v : true;
    await sleep(25);
  }
}
const together = () => Promise.all([A.st(), B.st()]).then(([a, b]) => a.net === 'together' && b.net === 'together' && a.peer?.hi && b.peer?.hi && a.peer.m && b.peer.m);
async function meet(x = 60, z = 60) {
  await Promise.all([A.world('tester'), B.world('robo')]);
  await A.js(`R.worldGo(${x}, ${z}); return 1;`); await B.js(`R.worldGo(${x} + 300, ${z}); return 1;`);
  await A.js(`T.host(); return 1;`); await run(5000, async () => (await A.st()).code);
  const code = (await A.st()).code; await B.js(`T.join(${JSON.stringify(code)}); return 1;`);
  if (!(await run(8000, together))) throw new Error('the two pages did not get together: ' + JSON.stringify([await A.st(), await B.st()]).slice(0, 600));
  await run(400); return code;
}
// the world's own robots near are cleared off both pages (a quiet field), as if swept
const QUIET = `for (const r of [...G.robots]) if (!r.net && r.state !== 'ally' && !r.ring) R.two.unlist(r), G.robots.includes(r) && R.two.away(r);`;
async function quiet() { await A.js(QUIET + 'return 1;'); await B.js(QUIET + 'return 1;'); await run(1600); await A.js(QUIET + 'return 1;'); await B.js(QUIET + 'return 1;'); await run(1500); }
const near = (a, b, d = 0.8) => Math.hypot(a.x - b.x, a.z - b.z) < d;

const RUNS = {
  async rules(ok) {
    // no relay: the plain file
    await A.open(1280, 800, false, fileUrl);
    let r = await A.js(`R.player('tester'); R.start(0); R.manual(true); R.step(2); const may = T.may(), shown = (id) => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; };
      return { may, btn: shown('twoB'), open: T.open(), on: T.on, socks: window.__sockets }; `);
    ok('waves: no two players (no button, the panel stays shut)', !r.may && !r.btn && !r.open && !r.on && r.socks === 0, r);
    await A.open(1280, 800, false, fileUrl); await A.world('tester');
    r = await A.js(`T.open(); const a = T.status(); T.host(); const b = T.status(); T.joinPage(); const c = T.status(); return { a, b, c, txt: document.querySelector('#two .tw-msg').textContent, cls: document.querySelector('#two .tw-msg').className, socks: window.__sockets };`);
    ok(`no relay: one calm line ("${r.txt}"), no socket`, r.txt === 'Two players works at home: ask a parent to start the game server' && /calm/.test(r.cls) && r.b.page === 'off' && r.c.page === 'off' && r.socks === 0, r);
    await Promise.all([A.open(1280, 800, false), B.open(1280, 800, false)]); await A.world('tester'); await B.world('robo');
    r = await A.js(`T.open(); return T.status();`); ok('with the relay: HOST and JOIN, no line', r.available && r.page === 'off' && r.msg === '', r);
    A.refuse = true; await A.js(`T.host(); return 1;`); await sleep(300); r = await A.st(); A.refuse = false;
    ok('the server not there: it says so, and can be tried again', r.net === 'off' && r.page === 'off' && /Could not reach/.test(r.msg), r);
    await A.js(`T.host(); return 1;`); await sleep(300); r = await A.st();
    ok(`host: a code of 4 pictures (${r.code}), waiting`, r.page === 'wait' && r.net === 'waiting' && r.code?.length === 4 && r.you === 0 && A.peer.url === 'ws://rb.test/ww', { r, u: A.peer.url });
    const code = r.code, wrong = code.map((n) => (n + 1) % 8);
    await B.js(`T.open(); T.joinPage(); return 1;`); for (const n of wrong) await B.js(`T.tapKey(${n}); return 1;`); await sleep(300); r = await B.st();
    ok('a wrong code: said so, the pictures empty again', r.page === 'join' && r.net === 'off' && r.msg === 'No game has those pictures. Try again!' && r.entry.length === 0, r);
    const f = fake(); Rooms.join(f, code); await sleep(200);
    for (const n of code) await B.js(`T.tapKey(${n}); return 1;`); await sleep(300); r = await B.st();
    ok('a full room: said so', r.page === 'join' && r.msg === 'That game has two players already', r);
    f.send = () => {}; f.got(JSON.stringify({ t: 'hi', g: 'ww', v: 1, world: 'x', av: { icon: 'fox', color: '#ffffff' } })); await sleep(300); r = await A.st();
    ok('a friend in another game: refused calmly, the room left', r.net === 'off' && !r.peer && /different world/.test(r.msg) && r.calm, r);
    f.gone();
    Rooms.misses = { t: Date.now(), n: MISS_MAX }; for (const n of code) await B.js(`T.joinPage(); return 1;`); for (const n of code) await B.js(`T.tapKey(${n}); return 1;`); await sleep(300); r = await B.st(); Rooms.misses = { t: 0, n: 0 };
    ok('a busy server: said so', r.net === 'off' && /busy/.test(r.msg), r);
    await A.js(`T.close(); return 1;`); await B.js(`T.close(); return 1;`);
    await meet(); const [a, b] = [await A.st(), await B.st()];
    ok('join: both together, the host 0 and the joiner 1', a.you === 0 && b.you === 1 && a.page === 'together' && b.page === 'together', { a, b });
    ok("each has the other's icon and colour", a.peer.av.icon === 'sun' && a.peer.av.color === '#ff8a1f' && b.peer.av.icon === 'bow' && b.peer.av.color === '#3fb4ff', { a: a.peer.av, b: b.peer.av });
    await B.js(`T.leave(); return 1;`); await run(500); const [c, d] = [await A.st(), await B.st()];
    ok('leave: the one left waits with the same pictures, the other is out; no friend on either', c.net === 'waiting' && c.page === 'wait' && !c.peer && c.mechs === 1 && d.net === 'off' && !d.peer && d.mechs === 1, { c, d });
    await B.js(`T.join(${JSON.stringify(c.code)}); return 1;`); ok('and joins again with them', await run(6000, together), await B.st());
  },
  async play(ok) {
    await meet(); await quiet();
    const pos = (C) => C.js(`const m = m0(); return { x: m.pos.x, y: m.pos.y, z: m.pos.z, h: m.legHeading, speed: m.speed };`);
    let a = await pos(A), b = await pos(B), sa = await A.st(), sb = await B.st();
    ok(`the joiner starts beside the host (${Math.hypot(a.x - b.x, a.z - b.z).toFixed(1)} m)`, Math.hypot(a.x - b.x, a.z - b.z) > 3 && Math.hypot(a.x - b.x, a.z - b.z) < 12, { a, b });
    ok('each sees the other where they are', near(sa.peer.m, b) && near(sb.peer.m, a), { sa: sa.peer.m, sb: sb.peer.m, a, b });
    await A.js(`R.hold('KeyW', true); return 1;`); await run(1500); const mid = await B.st(), a1 = await pos(A); await A.js(`R.hold('KeyW', false); return 1;`); await run(1200);
    a = await pos(A); sb = await B.st();
    ok(`the host drives ${Math.hypot(a.x - sa.peer.m.x, a.z - sa.peer.m.z).toFixed(0)} m: the friend's screen follows as it goes and at the end`, Math.hypot(mid.peer.m.x - a1.x, mid.peer.m.z - a1.z) < 6 && near(sb.peer.m, a) && Math.abs(sb.peer.m.y - a.y) < 0.5, { mid: mid.peer.m, a1, end: sb.peer.m, a });
    await A.js(`R.aim(0, 1.2, 0.1); return 1;`); await run(500); let r = await B.js(`const m = T.peer.m; return { t: m.torsoYaw, p: m.aimPitch };`); ok('its aim follows', Math.abs(r.t - 1.2) < 0.1, r);
    await A.js(`R.fire(0, 'punch'); R.step(1); return 1;`); r = await run(1500, async () => (await B.js(`return T.peer.m.swing?.w || null;`))); ok('its punch is seen', r === 'punch', r);
    const n0 = (await B.st()).peer.shotsIn; await A.js(`R.fire(0, 'gun'); return 1;`); r = await run(1500, async () => (await B.st()).peer.shotsIn > n0); ok('its shot is seen', r, r);
    r = await B.js(`return R.Bullets.list.filter((q) => q.ghost).every((q) => q.dmg === 0);`); ok('(and does nothing there)', r, r);
    await A.js(`window.__hurts = true; R.hurt(0, 1e5, 'hit'); return 1;`); r = await run(2500, async () => (await B.st()).peer.m.state === 'down'); ok("the friend's mech down is seen down", r, await B.st()); await A.js(`window.__hurts = false; return 1;`);
    r = await run(20000, async () => (await B.st()).peer.m.state === 'up'); ok('and up again (no game over)', r, await B.st());
    // the tag / arrow
    await B.js(`const m = m0(), p = T.peer.m.pos; R.teleport(0, p.x + 24, p.z); R.aim(0, Math.PI / 2); G.humans[0].rig.snap = true; return 1;`); await run(400); const t1 = (await B.st()).peer.shown, v1 = await B.ev(`document.getElementById('peerTag').classList.contains('on')`);
    await B.shot('two-desktop-tag');
    await B.js(`R.aim(0, -Math.PI / 2); G.humans[0].rig.snap = true; return 1;`); await run(400); const t2 = (await B.st()).peer.shown;
    await B.shot('two-desktop-arrow');
    ok('facing the friend: their face over their mech; facing away: an arrow at the edge', t1?.on === 'tag' && v1 && t2?.on === 'arrow' && t2.x >= 42 && t2.x <= 1238 && t2.y >= 40 && t2.y <= 680, { t1, t2 });
    // places, together
    const place = await A.js(`const s = R.worldSummits(1500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0], cv = R.worldCaves(1500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0]; return { s, cv };`);
    for (const [nm, x, z] of [['a summit', place.s.x, place.s.z], ['a cave', (place.cv.x + place.cv.bx) / 2, (place.cv.z + place.cv.bz) / 2]]) {
      await A.js(`R.worldGo(${x}, ${z}); return 1;`); await B.js(`R.worldGo(${x} + 2, ${z}); return 1;`); await run(900); await run(3000, async () => near((await A.st()).peer.m, await pos(B), 0.1) && near((await B.st()).peer.m, await pos(A), 0.1));
      a = await pos(A); b = await pos(B); sa = await A.st(); sb = await B.st();
      ok(`${nm}: together in it, each at the same height on both screens`, near(sa.peer.m, b) && near(sb.peer.m, a) && Math.abs(sb.peer.m.y - a.y) < 0.3 && Math.abs(sa.peer.m.y - b.y) < 0.3, { a, b, sa: sa.peer.m, sb: sb.peer.m });
      if (nm === 'a summit') { const up = await Promise.all([A, B].map((C) => C.js(`return [...W.summits.values()].filter((s) => s.up).length;`))); ok('the summit flag is up on both', up[0] > 0 && up[1] > 0, up); }
    }
    let tw = null; for (const [x, z] of [[300, 0], [0, 300], [-300, 0], [0, -300], [600, 0], [0, 600], [-600, 0], [0, -600], [500, 500], [-500, 500], [800, 200]]) { tw = await A.js(`R.worldGo(${x}, ${z}); return R.worldTowers(1)[0] || null;`); if (tw) break; }
    if (!tw) ok('a tower found', false, tw); else {
      await A.js(`R.worldGo(${tw.x}, ${tw.z}); return 1;`); await B.js(`R.worldGo(${tw.x} + 3, ${tw.z}); return 1;`); await run(900); await run(3000, async () => near((await A.st()).peer.m, await pos(B), 0.1) && near((await B.st()).peer.m, await pos(A), 0.1)); a = await pos(A); b = await pos(B); sa = await A.st(); sb = await B.st();
      const inn = await Promise.all([A, B].map((C) => C.js(`return !!W.inTower(m0().pos.x, m0().pos.z);`)));
      ok('a tower: both inside it together', near(sa.peer.m, b) && near(sb.peer.m, a) && inn[0] && inn[1], { a, b, inn, tw, sa: sa.peer.m, sb: sb.peer.m });
    }
  },
  async robots(ok) {
    await meet(); await quiet();
    const types = await A.js(`return Object.keys(R.ROBOT_TYPES);`), bad = [];
    for (const y of types) {
      const at = await A.js(`const p = m0().pos; return [p.x, p.z];`);
      await B.js(`R.worldGo(${at[0]} + 6, ${at[1]}); return 1;`);
      const own = await A.js(`const L = [].concat(R.spawn('${y}', ${at[0]} + 14, ${at[1]} + 14)); return L.map((r) => r.id);`);
      const got = await run(4000, async () => { const b = await B.st(), l = b.peer.puppets.filter((r) => r.type === y); return l.length ? l : null; });
      if (!got) { bad.push([y, 'not seen', (await A.st()).own.map((r) => r.type)]); await quiet(); continue; }
      await run(500);
      const a = await A.st(), b = await B.st(); const pos = b.peer.puppets.every((p) => { const o = a.own.find((q) => q.nid === p.nid); return !o || Math.hypot(o.x - p.x, o.z - p.z) < 3.5; });
      const nid = b.peer.puppets.find((r) => r.type === y)?.nid; const own1 = a.own.find((q) => q.nid === nid);
      if (!pos) bad.push([y, 'apart']);
      // hit from the friend's page
      await B.js(`const r = pup('${nid}'); if (r) { r.under = false; R.damage(r.id, 7, 'gun'); } return 1;`);
      const h = await run(2500, async () => { const q = (await A.st()).own.find((r) => r.nid === nid); return q && q.health < own1.health - 1; }); if (!h) bad.push([y, 'hit not felt', own1, (await A.st()).own.find((q) => q.nid === nid)]);
      // beaten by its owner: down on both, at the same place; then asked for and taken apart by the friend
      await A.js(`const r = G.robots.find((q) => q.nid === '${nid}'); if (r) { r.under = false; R.damage(r.id, 1e7, 'gun'); } return 1;`);
      const dn = await run(3000, async () => (await B.st()).peer.puppets.find((r) => r.nid === nid)?.state === 'down'); if (!dn) { bad.push([y, 'not down on B']); }
      else {
        const res = await B.js(`const r = pup('${nid}'); let c = null; for (const o of [2.5, 5, 7]) { R.teleport(0, r.pos.x + o, r.pos.z); c = R.choose(r.id, 'fix'); if (c.ok || c.why === 'asked') break; } return { ok: c.ok, why: c.why };`);
        if (res.why !== 'asked') bad.push([y, 'not asked for', res]);
        const mine = await run(3000, async () => { const b2 = await B.st(); return b2.own.find((r) => r.nid === nid) && (await A.st()).peer.puppets.find((r) => r.nid === nid); });
        if (!mine) bad.push([y, 'not handed over']); else {
          const f = await B.js(`const r = pup('${nid}'); return { board: !!r.wires, rep: G.humans[0].repair?.kind || null, ui: R.state().ui || null, st: r.state };`);
          if (!f.board || f.rep !== 'fix') bad.push([y, 'no fix opened', f]);
          const solved = await B.js(`const r = pup('${nid}'); let s = false, e = null; try { s = solve(r.id); } catch (x) { e = String(x); } return { s, e, left: G.robots.includes(r), squad: G.squad.includes(r) };`);
          if (!solved.s) bad.push([y, 'not solved', solved]);
          const gone = await run(3000, async () => !(await A.st()).peer.puppets.some((r) => r.nid === nid) && !(await A.st()).own.some((r) => r.nid === nid)); if (!gone) bad.push([y, 'still on the owner']);
        }
      }
      await B.js(`for (const r of [...G.squad]) R.sendHome(r.id), R.sendHome(r.id); return 1;`); await A.js(`R.leaveFix(); return 1;`); await quiet();
    }
    ok(`every robot type (${types.length}): drawn on both, hit from the friend's page, down on both, handed over, fixed by the friend, gone from the owner`, bad.length === 0, bad);
    // both at one robot
    let at = await A.js(`const p = m0().pos; return [p.x, p.z];`); await B.js(`R.worldGo(${at[0]} + 6, ${at[1]}); return 1;`);
    let id = await A.js(`return R.spawn('charger', ${at[0]} + 3, ${at[1]} + 2).id;`); let nid = await run(4000, async () => (await B.st()).peer.puppets.find((r) => r.type === 'charger')?.nid);
    await A.js(`R.damage(${id}, 1e7, 'gun'); return 1;`); await run(2500, async () => (await B.st()).peer.puppets.find((r) => r.nid === nid)?.state === 'down');
    const ca = await A.js(`const r = G.robots.find((q) => q.id === ${id}); R.teleport(0, r.pos.x + 3, r.pos.z); const c = R.choose(${id}, 'fix'); return c.ok;`); const seen = await run(2000, async () => (await B.st()).peer.puppets.find((r) => r.nid === nid)?.fixing);
    const busy = await B.js(`const r = pup('${nid}'); R.teleport(0, r.pos.x - 3, r.pos.z); const c = R.choose(r.id, 'fix'); return c.why;`); await run(700);
    const still = await A.js(`return G.humans[0].repair?.r.id === ${id};`);
    ok('one is fixing it: the friend sees that and cannot take it', ca && seen && busy === 'busy' && still, { ca, seen, busy, still });
    const race = await B.js(`const r = pup('${nid}'); r.repairBy = null; const c = R.choose(r.id, 'fix'); return c.why;`); await run(1200); const toast = await B.ev(`document.getElementById('twToast').textContent`);
    ok('asked for in the same moment: no, with a calm line', race === 'asked' && /fixing that one/.test(toast) && await A.js(`return G.humans[0].repair?.r.id === ${id};`), { race, toast });
    await A.js(`R.leaveFix(); return 1;`);
    // the friend's squadmate is seen
    const sq = await A.js(`const r = G.robots.find((q) => q.id === ${id}); R.teleport(0, r.pos.x + 3, r.pos.z); const c = R.choose(${id}, 'fix', 'Boltz'); return c.ok && solve(${id}) && G.squad.length;`);
    const mate = await run(3000, async () => (await B.st()).mates[0]); ok("the friend's squadmate walks on this screen too, with no name sent", sq === 1 && mate?.type === 'charger' && mate.name !== 'Boltz' && !Wire.frames.some((f) => /Boltz/.test(f)), { sq, mate });
    // a robot hurts the friend's mech
    await quiet(); await A.js(`const p = T.peer.m; window.__x = p; return 1;`);
    const hp0 = await B.js(`window.__hurts = true; m0().health = m0().maxHealth; return m0().health;`);
    await A.js(`T.hurtPeer(T.peer.m, 9, 'hit'); return 1;`); const hp = await run(2000, async () => { const h = await B.js(`return m0().health;`); return h < hp0 ? h : 0; }); ok("a robot's hit on the friend's mech takes their energy, on their page", hp && hp0 - hp >= 4 && hp0 - hp <= 10, { hp0, hp }); await B.js(`window.__hurts = false; return 1;`);
    // a lost event is sent again
    at = await A.js(`const p = m0().pos; return [p.x, p.z];`); await B.js(`R.worldGo(${at[0]} + 6, ${at[1]}); return 1;`); await run(300);
    Wire.loseEv = 2; await A.js(`R.spawn('bouncer', ${at[0]} + 20, ${at[1]} + 20); return 1;`); const lost = await run(5000, async () => (await B.st()).peer.puppets.some((r) => r.type === 'bouncer')); ok('an event lost on the way is sent again', lost && Wire.loseEv === 0, lost);
    // one chunk's robots on both pages: one copy
    await quiet(); const cell = await A.js(`let best = null; for (const ch of W.chunks.values()) {} for (let d = 100; d < 900 && !best; d += 60) { R.worldGo(d, d); for (const [k, l] of W.live) if (!l.boss && l.length) { best = { k, x: l[0].pos.x, z: l[0].pos.z, n: l.length }; break; } } return best;`);
    if (!cell) ok('a chunk with robots', false, cell); else {
      await A.js(`R.worldGo(${cell.x} + 50, ${cell.z}); return 1;`); await B.js(`R.worldGo(${cell.x} - 50, ${cell.z}); return 1;`); await run(3500);
      const [a, b] = [await A.st(), await B.st()]; const ka = [...a.own.map((r) => r.key), ...a.peer.puppets.map((r) => r.key)].filter((k) => k === cell.k).length, kb = [...b.own.map((r) => r.key), ...b.peer.puppets.map((r) => r.key)].filter((k) => k === cell.k).length;
      const ids = (s) => [...s.own.filter((r) => r.key === cell.k).map((r) => r.nid), ...s.peer.puppets.filter((r) => r.key === cell.k).map((r) => r.nid)].sort().join();
      ok(`a chunk's robots both pages brought out: the same ${ka} on both`, ka > 0 && ka === kb && ids(a) === ids(b), { ka, kb, a: ids(a), b: ids(b), cell });
    }
  },
  async things(ok) {
    await meet(); await quiet(); const keys0 = [await A.js('return keys();'), await B.js('return keys();')];
    // a part
    const part = await A.js(`let q = null; for (let d = 60; d < 900 && !q; d += 50) { R.worldGo(d, -d); q = R.Hidden.list.find((c) => c.wkey && !c.found && W.chunks.size); } return q && { x: q.x, z: q.z, k: q.wkey };`);
    await B.js(`R.worldGo(${part.x} + 25, ${part.z}); return 1;`); await run(500);
    const there = await B.js(`return R.Hidden.list.some((q) => q.wkey === '${part.k}' && !q.found);`), bag0 = await B.js(`return JSON.stringify(G.bag);`);
    await A.js(`R.teleport(0, ${part.x}, ${part.z}); return 1;`); const gone = await run(2500, async () => B.js(`return !R.Hidden.list.some((q) => q.wkey === '${part.k}' && !q.found);`));
    ok('a part on the ground is there on both; picked up by one, it goes from both, and only the finder has it', there && gone && (await B.js(`return JSON.stringify(G.bag);`)) === bag0 && await A.js(`return JSON.stringify(rec('tester')?.world || {}).includes('${part.k}');`) && !(await B.js(`return JSON.stringify(rec('robo')?.world || {}).includes('${part.k}');`)), { there, gone });
    // a kit
    const at = await A.js(`const p = m0().pos; return [p.x, p.z];`); await A.js(`R.Kits.drop({ pos: { x: ${at[0]} + 14, z: ${at[1]} }, legHeading: 0, wlevel: 1 }); return 1;`).catch(() => null);
    const kitHook = await A.js(`return !!R.Kits;`);
    if (!kitHook) ok('__rb.Kits', false); else {
      const k = await run(2500, async () => B.js(`const k = R.Kits.list.find((q) => q.nid); return k && { x: k.x, z: k.z, n: k.nid };`)); const ka = await A.js(`const k = R.Kits.list.find((q) => q.nid); return k && { x: k.x, z: k.z, n: k.nid };`);
      ok('a dropped kit lies at the same place on both', k && ka && near(k, ka, 0.1) && k.n === ka.n, { k, ka });
      await B.js(`window.__hurts = true; m0().health = 20; R.teleport(0, ${k?.x}, ${k?.z}); return 1;`); const kg = await run(2500, async () => A.js(`return !R.Kits.list.some((q) => q.nid === '${k?.n}');`)); const bh = await B.js(`const h = m0().health; window.__hurts = false; return h;`);
      ok('whoever steps on it is mended, and it goes from both', kg && bh > 20, { kg, bh });
    }
    // a prop
    const prop = await A.js(`const p = m0().pos, q = R.Props.list.filter((c) => c.wkey && !c.broken).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; return q && { k: q.wkey, x: q.x, z: q.z };`);
    await B.js(`R.worldGo(${prop.x} + 15, ${prop.z}); return 1;`); await run(300);
    const pb = await B.js(`return !!R.Props.list.find((q) => q.wkey === '${prop.k}' && !q.broken);`); await A.js(`R.Props.smash(R.Props.list.find((q) => q.wkey === '${prop.k}'), 'gun', 1, 0); return 1;`);
    const broke = await run(2500, async () => B.js(`const q = R.Props.list.find((c) => c.wkey === '${prop.k}'); return !q || q.broken;`));
    ok("a smashed prop is smashed on both; only the smasher's record has it", pb && broke && await A.js(`return JSON.stringify(rec('tester')?.world || {}).includes('${prop.k}') || [...W.broken].includes('${prop.k}');`) && !(await B.js(`return JSON.stringify(rec('robo')?.world || {}).includes('${prop.k}');`)), { pb, broke });
    // a ring
    const ring = await A.js(`return R.worldRings(1200).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];`);
    await A.js(`R.worldGo(${ring.x} + 30, ${ring.z}); return 1;`); await run(600); await B.js(`R.worldGo(${ring.x} + 36, ${ring.z}); return 1;`); await run(3000);
    const champs = await Promise.all([A, B].map((C) => C.js(`const g = [...W.rings.values()].find((q) => Math.hypot(q.g.x - ${ring.x}, q.g.z - ${ring.z}) < 1); return g && { state: g.state, n: G.robots.filter((r) => r.ring === g.g.key).length, nid: g.champ?.nid, net: !!g.champ?.net };`)));
    ok('a ring has one champion, the same on both', champs[0]?.n === 1 && champs[1]?.n === 1 && champs[0].nid === champs[1].nid && champs[0].net !== champs[1].net, champs);
    const own = champs[0]?.net ? B : A; await own.js(`const r = G.robots.find((q) => q.ring && !q.net && Math.hypot(q.pos.x - ${ring.x}, q.pos.z - ${ring.z}) < 30); R.damage(r.id, 1e7, 'gun'); return 1;`);
    const won = await run(4000, async () => { const w = await Promise.all([A, B].map((C) => C.js(`const g = [...W.rings.values()].find((q) => Math.hypot(q.g.x - ${ring.x}, q.g.z - ${ring.z}) < 1); return g && [g.state, g.paid?.length || 0];`))); return w.every((q) => q?.[0] === 'won' && q[1] > 0) ? w : null; });
    ok('the champion beaten: the ring pays both', !!won, won);
    await quiet();
    // each record only its own: a robot fixed by B
    const at2 = await A.js(`const p = m0().pos; return [p.x, p.z];`);
    const cell = await A.js(`let best = null; for (let d = 100; d < 1200 && !best; d += 60) { R.worldGo(-d, d); for (const [k, l] of W.live) if (l.length === 1 && !l.boss) { best = { k, id: l[0].id, x: l[0].pos.x, z: l[0].pos.z }; break; } } return best;`); void at2;
    await B.js(`R.worldGo(${cell.x} + 20, ${cell.z}); return 1;`); await A.js(`R.worldGo(${cell.x} - 20, ${cell.z}); return 1;`); await run(2500);
    const n = await A.js(`const r = G.robots.find((q) => q.wkey === '${cell.k}'); r && !r.net && R.damage(r.id, 1e7, 'gun'); return r && r.nid;`); await B.js(`const r = pup('${n}'); r && !r.net && R.damage(r.id, 1e7, 'gun'); return 1;`);
    await run(3000, async () => B.js(`return pup('${n}')?.state === 'down';`));
    await B.js(`const r = pup('${n}'); for (const o of [2.5, 5, 7]) { R.teleport(0, r.pos.x + o, r.pos.z); const c = R.choose(r.id, 'fix'); if (c.ok || c.why === 'asked') break; } return 1;`);
    await run(3000, async () => B.js(`return G.humans[0].repair?.kind === 'fix';`)); const fx = await B.js(`const r = pup('${n}'); return solve(r.id);`);
    await run(1500); const ra = await A.js(`return { rec: JSON.stringify(rec('tester')?.world || {}).includes('${cell.k}'), gone: W.gone.has('${cell.k}'), left: G.robots.some((r) => r.wkey === '${cell.k}') };`), rb = await B.js(`return { rec: JSON.stringify(rec('robo')?.world || {}).includes('${cell.k}'), squad: G.squad.length };`);
    ok("a world robot fixed by the friend: it is gone here for this session, and only the fixer's record and squad have it", fx && !ra.rec && ra.gone && !ra.left && rb.rec && rb.squad >= 1, { fx, ra, rb });
    const keys1 = [await A.js('return keys();'), await B.js('return keys();')]; const K = ['robotbattle'];
    const own2 = (k, id, other) => k.every((q) => q.startsWith(K[0])) && !k.includes('robotbattle.facts.' + other); ok('storage: only the keys it had, and no key of the friend', own2(keys1[0], 'tester', 'robo') && own2(keys1[1], 'robo', 'tester') && keys1.every((k, i) => k.every((q) => keys0[i].includes(q) || /^robotbattle\.(facts|squad|garage|body|touch|waves)/.test(q))), { keys0, keys1 });
  },
  async lines(ok) {
    const code = await meet(); await quiet(); const at = await A.js(`const p = m0().pos; return [p.x, p.z];`);
    const spawnOn = async (C, y) => { await C.js(`R.spawn('${y}', ${at[0]} + 25, ${at[1]} + 25); return 1;`); };
    await spawnOn(A, 'charger'); await run(4000, async () => (await B.st()).peer.puppets.some((r) => r.type === 'charger'));
    // a pause hands its robots over
    await A.ev(`(() => { const R = window.__rb; R.Game.paused = false; R.two.isStopped0 = R.two.isStopped; R.two.isStopped = () => true; return 1; })()`);
    let r = await run(3000, async () => { const b = await B.st(); return b.own.some((q) => q.type === 'charger') && b.peer.paused; }); const a1 = await A.st();
    ok("a pause: the friend plays on, the robots are theirs, and the paused mech isn't a target", r && !a1.own.some((q) => q.type === 'charger') && a1.peer.puppets.some((q) => q.type === 'charger') && await B.js(`return T.peer.m.away === true;`), a1);
    await A.ev(`(() => { const R = window.__rb; R.two.isStopped = R.two.isStopped0; return 1; })()`); await run(500);
    const snap = (C, who) => C.js(`return { bag: JSON.stringify(G.bag), rec: JSON.stringify(rec('${who}')), x: m0().pos.x, z: m0().pos.z, hp: m0().health };`);
    await spawnOn(A, 'bouncer'); await run(3000, async () => (await B.st()).peer.puppets.some((q) => q.type === 'bouncer'));
    const b0 = await snap(B, 'robo'), b0h = await B.st();
    B.drop(); await run(600); let [a, b] = [await A.st(), await B.st()];
    const b1 = await snap(B, 'robo');
    ok('a dropped line: one is alone, the other waits; no friend left on either', b.net === 'dropped' && !b.peer && b.mechs === 1 && a.net === 'waiting' && !a.peer && a.mechs === 1 && a.mates.length === 0, { a, b });
    ok('nothing lost: the bag, the record and the place are as they were', b0.bag === b1.bag && b0.rec === b1.rec && near(b0, b1, 4), { b0, b1 });
    ok("the friend's robots here are this page's own now", b0h.peer.puppets.every((p) => b.own.some((q) => q.id === p.id)) && b.own.some((q) => q.type === 'bouncer'), { was: b0h.peer.puppets, now: b.own });
    const p0 = await B.js(`return G.robots.filter((q) => q.type === 'bouncer').map((q) => [q.pos.x, q.pos.z]);`); await B.js(`R.step(400); return 1;`); const p1 = await B.js(`return G.robots.filter((q) => q.type === 'bouncer').map((q) => [q.pos.x, q.pos.z]);`);
    ok('and they move on their own', p0.some((q, i) => p1[i] && Math.hypot(q[0] - p1[i][0], q[1] - p1[i][1]) > 1), { p0, p1 });
    r = await B.js(`const x = m0().pos.x, z = m0().pos.z; R.hold('KeyW', true); R.step(120); R.hold('KeyW', false); R.step(20); return Math.hypot(m0().pos.x - x, m0().pos.z - z);`); ok(`and it drives on (${r.toFixed(0)} m)`, r > 3, r);
    ok('it says so calmly', /two player game stopped/.test(await B.ev(`document.getElementById('twToast').textContent`)), 0);
    await B.js(`T.join(${JSON.stringify(code)}); return 1;`); ok('and joins again with the same pictures', await run(6000, together), [await A.st(), await B.st()]);
    const [a2, b2] = [await A.js('const p = m0().pos; return [p.x, p.z];'), await B.js('const p = m0().pos; return [p.x, p.z];')]; ok('beside the friend', Math.hypot(a2[0] - b2[0], a2[1] - b2[1]) < 12, { a2, b2 });
    // silent
    for (const C of [A, B]) C.peer.mute = true; const t0 = Date.now(); r = await run(12000, async () => { const [x, y] = [await A.st(), await B.st()]; return x.net === 'dropped' && y.net === 'dropped' && Date.now() - t0; });
    ok(`a silent line: each plays on alone after ${r} ms`, r > 5000 && r < 11500 && (await A.st()).mechs === 1, r);
    A.peer.gone(); B.peer.gone();
    // reload
    const c2 = await meet(); await run(300); await B.open(1280, 800, false, url, false); await sleep(500); a = await A.st();
    ok('a reload: the one left waits and plays on', a.net === 'waiting' && !a.peer && a.mechs === 1, a);
    await B.world('robo'); await B.js(`T.join(${JSON.stringify(c2)}); return 1;`); ok('and the reloaded page joins again with the same pictures', await run(8000, together), [await A.st(), await B.st()]);
    await A.js(`T.leave(); return 1;`); await run(400); b = await B.st(); await A.js(`T.join(${JSON.stringify(c2)}); return 1;`);
    ok('the host leaves and joins again: together, beside the one who stayed', b.net === 'waiting' && await run(8000, together) && await (async () => { await run(300); const [p, q] = [await A.js('const p = m0().pos; return [p.x, p.z];'), await B.js('const p = m0().pos; return [p.x, p.z];')]; return Math.hypot(p[0] - q[0], p[1] - q[1]) < 12; })(), b);
    // nonsense off the wire
    const junk = [{ t: 'st' }, { t: 'st', m: 'x', r: 5, s: {}, q: [[1]], h: null }, { t: 'st', m: [1, 2, 3, 4, 5, 6, 7, null], r: [['0:1', 1]], s: [['gun', 1]], q: [['a', 'b']] }, { t: 'ev', n: 1, l: 'x' }, { t: 'hi', av: { icon: '<img>', color: 'red' }, g: 'rb', v: 1, seed: await A.ev('window.__rb.WORLD.seed') },
      { t: 'st', k: 0, m: [1, 2, 3, 4, 5, 6, 7, 8], h: ['x', -5], d: 'no', w: ['__proto__', 1], s: [['constructor', 1, 2, 3, 4, 5, 6, 'p', 1, 1, 1]], q: [[1, 'constructor', '#fff', 1]], r: [['9:9'], null, ['1:1', ...Array(14).fill('x')]] }, { t: '__proto__' }];
    for (const m of junk) B.peer.send(m);
    const n = await B.js(`return T.peer.inSeq;`); B.peer.send({ t: 'ev', n: n + 1, l: [null, { e: '__proto__' }, { e: 'new', n: '0:7', y: 'constructor' }, { e: 'new', n: '0:8', y: 'charger', p: 'x', g: 'red', ps: ['constructor'] }, { e: 'hurt', n: 'x' }, { e: 'me', a: 'x' }, { e: 'give', n: 3 }, { e: 'part', k: 4 }, { e: 'kit' }, { e: 'smash', k: {} }, { e: 'summit', k: 'nope' }, { e: 'gone' }, { e: 'no' }, { e: 'want', n: '1:99999' }] });
    await run(800); ok('nonsense off the wire does nothing bad', B.errs.length === 0 && await B.js(`return Number.isFinite(m0().pos.x) && T.peer.av.color !== 'red' && T.peer.av.icon !== '<img>';`), B.errs);
  },
  async wire(ok) {
    ok(`every frame fits the relay (${Wire.frames.length} frames, the longest ${Math.max(0, ...Wire.frames.map((f) => f.length))} bytes; none dropped by its caps)`, Wire.over === 0 && Wire.capped === 0, { over: Wire.over, capped: Wire.capped });
    const bad = Wire.frames.filter((f) => /tester|\brobo\b|"Robo"|Boltz|facts|mastery|robotbattle|profile|garage|"name"/i.test(f)); ok('no frame carries a name, an id or a record', Wire.frames.length > 100 && bad.length === 0, bad.slice(0, 3));
    const types = [...new Set(Wire.frames.map((f) => { try { return JSON.parse(f).t; } catch { return 'bad'; } }))].sort(); ok(`only these messages are sent: ${types}`, types.every((t) => ['ev', 'hi', 'host', 'join', 'leave', 'st'].includes(t)), types);
    const his = Wire.frames.map((f) => JSON.parse(f)).filter((m) => m.t === 'hi' && m.g === 'rb'); ok('hello is only the game, the world, an icon, a colour and a place', his.length > 1 && his.every((m) => Object.keys(m).sort().join() === 'av,g,seed,t,v,world,x,z' && Object.keys(m.av).sort().join() === 'color,icon'), his[0]);
  },
  async touch(ok) {
    const sizes = [[844, 390], [740, 360], [667, 375]];
    await Promise.all([A.open(844, 390, true), B.open(844, 390, true)]);
    await meet(); await A.js(`T.leave(); R.manual(false); return 1;`); await B.js(`T.leave(); return 1;`); await sleep(400);
    const fit = (C, sel) => C.ev(`(() => { const W = innerWidth, H = innerHeight, out = [], L = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'); for (const e of L) { const b = e.getBoundingClientRect(); if (b.left < -1 || b.top < -1 || b.right > W + 1 || b.bottom > H + 1) out.push([e.id || e.className, Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]); } const bx = L.map((e) => [e, e.getBoundingClientRect()]), over = [];
      const G = [...document.querySelectorAll('#parentB, #start button')].filter((e) => !L.includes(e) && !e.closest('#two') && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'); if (L[0]?.classList.contains('tm')) for (const g of G) { const b = g.getBoundingClientRect(); for (const [e, r] of bx) if (b.left < r.right - 1 && b.right > r.left + 1 && b.top < r.bottom - 1 && b.bottom > r.top + 1) over.push([g.id || g.className, e.id]); }
      return { n: L.length, out, over, scroll: document.documentElement.scrollWidth - W }; })()`);
    for (const [w, h] of sizes) {
      await A.size(w, h, true); await sleep(300); await A.js(`window.dispatchEvent(new Event('resize')); return 1;`);
      await A.ev(`(() => { const p = [...document.querySelectorAll('.tp-pause')].find((e) => e.getClientRects().length); window.__pb = p ? (() => { const b = p.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })() : null; return 1; })()`);
      const pb = await A.ev('window.__pb'); if (pb) await A.tap(pb.x, pb.y); await sleep(400);
      const menu = await fit(A, '#tpMenu .tm'); ok(`${w} x ${h}: the pause menu (${menu.n} tiles, 2 players among them) fits`, menu.n >= 7 && menu.out.length === 0 && menu.scroll <= 0 && menu.over.length === 0 && await A.ev(`document.getElementById('tmTwo').getClientRects().length > 0`), { menu, pb }); await A.shot(`two-menu-${w}`);
      const tapped = await A.tapEl('#tmTwo'); await sleep(300); const on = (await A.st()).on; const p1 = await fit(A, '#twPanel, #twPanel button, #twPanel .tw-msg'); await A.shot(`two-panel-${w}`);
      ok(`${w} x ${h}: a tap opens the panel (HOST, JOIN), and it fits`, tapped && on && p1.n >= 4 && !p1.out.length, { tapped, on, p1 });
      await A.tapEl('#twPanel [data-a="join"]'); await sleep(200); const p2 = await fit(A, '#twPanel, #twPanel button, #twPanel .tw-slot'); await A.shot(`two-join-${w}`); ok(`${w} x ${h}: the 8 pictures fit`, p2.n >= 14 && !p2.out.length, p2);
      await A.tapEl('#twPanel [data-a="x"]'); await A.tapEl('#twPanel [data-a="host"]'); await sleep(400); const p3 = await fit(A, '#twPanel, #twPanel button, #twPanel .tw-code span'); await A.shot(`two-host-${w}`); ok(`${w} x ${h}: the code's 4 pictures fit`, (await A.st()).page === 'wait' && p3.n >= 6 && !p3.out.length, p3);
      await A.tapEl('#twPanel [data-a="leave"]'); await sleep(300); await A.tapEl('#twPanel [data-a="x"]'); await A.js(`document.getElementById('go')?.click(); return 1;`); await sleep(300);
    }
    // a touch-only round
    await A.size(844, 390, true); await sleep(300);
    for (const C of [A, B]) { await C.js(`R.manual(false); return 1;`); const p = await C.ev(`(() => { const e = [...document.querySelectorAll('.tp-pause')].find((q) => q.getClientRects().length); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`); if (p) await C.tap(p.x, p.y); await sleep(300); await C.tapEl('#tmTwo'); await sleep(250); }
    await A.tapEl('#twPanel [data-a="host"]'); await sleep(500); const code = (await A.st()).code || []; await B.tapEl('#twPanel [data-a="join"]'); await sleep(250);
    for (const n of code) await B.tapEl(`#twPanel [data-i="${n}"]`); let t = false; for (let i = 0; i < 40 && !t; i++) { await sleep(150); t = await together(); }
    ok('by touch alone: pause, 2 players, HOST; pause, 2 players, JOIN, the 4 pictures: together', t, [await A.st(), await B.st()].map((s) => [s.page, s.net, s.msg]));
    await sleep(2200); const on = [await A.st(), await B.st()]; const pa = await A.js('return G.paused;'), pbb = await B.js('return G.paused;'); ok('the panel shuts and both games run on', !on[0].on && !on[1].on && !pa && !pbb, { pa, pbb });
    await sleep(800); const btn = await B.ev(`[...document.querySelectorAll('.tp-btn:not(.tp-off):not(.tp-pause)')].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none').length`); ok(`playing together: at most 4 touch buttons (${btn})`, btn >= 1 && btn <= 4, btn);
    await B.shot('two-touch-play'); await A.shot('two-touch-play-host'); const f = await fit(B, '#peerTag.on, #peerArrow.on'); ok('the face or the arrow is on the screen', f.n === 1 && !f.out.length && f.scroll <= 0, f);
    // the waves page
    await A.js(`T.leave(); return 1;`); await A.open(844, 390, true, url, false); const r = await A.js(`R.player('tester'); R.world(false); R.start(0); return { w: G.world, may: T.may(), socks: window.__sockets };`); const two = await A.ev(`getComputedStyle(document.getElementById('tmTwo')).display`); ok('waves on the same page: no 2 players tile, no socket', !r.w && !r.may && r.socks === 0 && two === 'none', { r, two });
  },
};

async function main() {
  const all = [], unfinished = [];
  const names = Object.keys(RUNS).filter((n) => !only || only.includes(n));
  const S1 = launch(), S2 = launch(); A = await connect(S1); B = await connect(S2);
  for (const n of names) {
    const t0 = Date.now(), res = []; const ok = (name, pass, got) => { res.push({ name: n + ': ' + name, pass: !!pass, got: pass && !json ? undefined : got }); return !!pass; };
    try {
      A.errs.length = B.errs.length = 0; Wire.loseEv = 0;
      if (n !== 'rules' && n !== 'touch' && n !== 'wire') await Promise.all([A.open(1280, 800, false), B.open(1280, 800, false)]);
      await RUNS[n](ok);
      for (const [w, C] of [['first', A], ['second', B]]) res.push({ name: `${n}: no page errors (${w} page)`, pass: C.errs.length === 0, got: C.errs.slice(0, 6) });
    } catch (e) { unfinished.push(n + ': ' + (e?.stack || e)); if (!json) console.log(`${n}: did not finish: ${e?.message || e}`, [...A.errs, ...B.errs].slice(0, 4)); }
    all.push(...res); const bad = res.filter((r) => !r.pass);
    if (!json) { console.log(`${n}: ${res.length - bad.length}/${res.length} pass  (${((Date.now() - t0) / 1000).toFixed(1)} s)${bad.length ? '  FAIL' : ''}`); for (const r of bad) console.log('  FAIL ' + r.name + '\n       ' + JSON.stringify(r.got)?.slice(0, 1500)); }
  }
  await killAll();
  const failed = all.filter((r) => !r.pass);
  if (json) console.log(JSON.stringify({ target, runs: names, checks: all, failed: failed.length, unfinished }, null, 1));
  else console.log(`${target}\n${all.length - failed.length}/${all.length} checks pass${unfinished.length ? `, ${unfinished.length} run(s) did not finish` : ''}: ${failed.length || unfinished.length ? 'FAIL' : 'PASS'}`);
  return unfinished.length ? 2 : failed.length ? 1 : 0;
}

let code = 2;
try { code = await main(); } catch (e) { console.error('check failed: ' + (e?.stack || e?.message || e)); } finally { await killAll(); }
process.exit(code);
