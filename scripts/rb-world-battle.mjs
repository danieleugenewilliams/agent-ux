#!/usr/bin/env node
// Robot Battle endless world check (#167, slice 8: Battle mode between the two players).
//
// The same stand-in relay as scripts/rb-world-two.mjs: two headless Chromes (muted, not detached, killed with their profiles
// deleted on every way out), each page answered from this repo through CDP (Fetch) at http://rb.test/ with the relay's line in
// it, and its WebSocket a stand-in whose frames this process passes between the pages by the relay's own rules (class Rooms is
// taken from scripts/ww-relay.mjs). Dad's decisions on #167 for Battle, each checked:
//
//   battle - 1 b: opt-in on both: no hits with neither on, or only one on (either one); hits land with both on, a badge shows;
//            5 a / 6 a: FIRE's gun and the punch hit the friend's mech, both ways, as built (the punch's damage is the mech's own);
//            4 b: a robot leaves both fighting mechs alone (it does hurt them with Battle off) and a squadmate stays out;
//            2 b: a knockdown: "I win!" on both screens, then both mechs reboot where they stand with full energy;
//            3 a: the storage the same on both pages (keys and every record); off on either: no more hits; leave: off
//   touch  - 844 x 390 with touch, together: the pause menu with the Battle tile fits, a tap on each page turns it on, the badge
//            fits on the screen, and at most 4 touch buttons while it's on
//
// Usage:  node scripts/rb-world-battle.mjs [path/to/robot-battle.html] [--json] [--only battle,touch] [--shots dir]
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
    const len = Buffer.byteLength(text); if (!this.fake) Wire.frames.push(text);   // (the pages' own frames)
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
const fake = () => { const got = []; const p = new Peer((s) => got.push(JSON.parse(s)), () => {}); p.log = got; p.fake = true; return p; };

// ---- in the page, before its own scripts: the relay's line and the stand-in socket ----
const INJECT = `(() => {
  const socks = new Map(); let n = 0; window.__sockets = 0;
  class Stand { constructor(u) { window.__sockets++; this.url = u; this.readyState = 0; this.id = ++n; socks.set(this.id, this); __wire(JSON.stringify({ id: this.id, op: 'open', u })); }
    send(s) { if (this.readyState === 1) __wire(JSON.stringify({ id: this.id, op: 'msg', s })); }
    close() { if (this.readyState < 2) { this.readyState = 3; __wire(JSON.stringify({ id: this.id, op: 'close' })); } } }
  window.WebSocket = Stand;
  window.__toPage = (id, op, s) => setTimeout(() => __deliver(id, op, s));   // (later, from the page's own event loop, as a real socket's events come: a throw there is the page's error)
  const __deliver = (id, op, s) => { const w = socks.get(id); if (!w) return; if (op === 'open') { w.readyState = 1; w.onopen?.({}); } else if (op === 'msg') { if (w.readyState === 1) w.onmessage?.({ data: s }); } else { if (w.readyState === 3) return; w.readyState = 3; w.onclose?.({ code: 1006 }); } };
})();`;

const shared = new Set();
function launch() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-battle-'));
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

// each page's Battle status (the hook; on a page without Battle, none) and its own mech
const BT = async (C) => (await C.st()).battle || {};
const me = (C) => C.js(`const m = m0(); return { h: m.health, max: m.maxHealth, st: m.state, x: m.pos.x, z: m.pos.z, downs: m.downs, paused: G.paused, hidden: document.hidden, fp: !!T.peer?.paused };`);
const setB = (C, on) => C.js(`return T.setBattle ? T.setBattle(${on}) : null;`);
const T0 = Date.now(), trace = (s) => process.env.RB_TRACE && console.error(`[${((Date.now() - T0) / 1000).toFixed(0)} s] ${s}`);
// the friend's mech d m straight ahead of this one, each facing the other (yaw 0 looks along -z)
async function face(d = 6) {
  const a = await A.js(`const m = m0(); return { x: m.pos.x, z: m.pos.z };`);
  await B.js(`R.teleport(0, ${a.x}, ${a.z - d}); R.aim(0, Math.PI, 0); return 1;`); await A.js(`R.aim(0, 0, 0); return 1;`);
  await run(5000, async () => { const [f, b] = [await A.js('return T.peer?.m ? { x: T.peer.m.pos.x, z: T.peer.m.pos.z } : null;'), await me(B)]; return f && Math.hypot(f.x - b.x, f.z - b.z) < 0.5; });
}
// C uses weapon w n times, through the same attack code as the keys; each waits for its hit to be sent (if it lands) and
// then for the wire to carry it
async function hit(C, w = 'gun', n = 3) {
  for (let i = 0; i < n; i++) {
    const d0 = (await BT(C)).dealt ?? 0; await C.js(`R.fire(0, '${w}'); return 1;`);
    await run(1600, async () => ((await BT(C)).dealt ?? 0) > d0);
  }
  await run(900);
}
// every key and record (a prop a stray round smashes is kept in the world's record as it always is: world.broken is left out)
const snap = (C) => C.ev(`JSON.stringify(Object.keys(localStorage).sort().map((k) => { let v = localStorage.getItem(k); if (/^robotbattle\\.facts\\./.test(k)) try { const o = JSON.parse(v); if (o?.world) { delete o.world.broken; if (!Object.keys(o.world).length) delete o.world; } v = JSON.stringify(o); } catch {} return [k, v]; }))`);
const hurts = (on) => Promise.all([A, B].map((C) => C.ev(`(window.__hurts = ${on}, 1)`)));
const full = () => Promise.all([A, B].map((C) => C.js(`const m = m0(); m.health = m.maxHealth; return 1;`)));
const tgt = (r) => A.js(`return R.target ? R.target(${r}) : 'no hook';`);

const RUNS = {
  async battle(ok) {
    await meet(); await quiet(); trace('met');
    const s0 = [await snap(A), await snap(B)];
    await hurts(true); await face(6);
    // a robot goes for a mech with Battle off (so the check with it on means something)
    const a0 = await A.js(`const m = m0(); return { x: m.pos.x, z: m.pos.z };`);
    const rid = await A.js(`const c = R.spawn('charger', ${a0.x} + 7, ${a0.z} - 3); return c?.id ?? null;`); await run(300);
    const t0 = await tgt(rid);
    ok(`Battle off: a robot near goes for a mech (${t0})`, rid != null && (t0 === 'me' || t0 === 'friend'), { rid, t0 });
    await A.js(`G.robots.find((q) => q.id === ${rid})?.pos.set(9999, 0, 9999); return 1;`);
    trace('robot off');

    // 1 b: neither on, only the host on, only the joiner on: no hits
    await full(); await face(6); let b0 = await me(B); await hit(A, 'gun'); let b1 = await me(B);
    ok('neither has Battle on: the gun does not hurt the friend', b1.h === b0.h && b0.h === b0.max, { b0, b1 });
    const hostOn = await setB(A, true); await run(600); let [ba, bb] = [await BT(A), await BT(B)];
    const tagA = await A.ev(`(() => { const e = document.getElementById('battleTag'); return e ? { on: e.classList.contains('on'), live: e.classList.contains('live'), txt: e.textContent } : null; })()`);
    const toastB = await B.ev(`document.getElementById('twToast').textContent`);
    ok('only the host turns it on: the badge says it waits; the friend is told how to join in', hostOn === true && ba.me && !ba.armed && bb.friend && !bb.me && tagA?.on && !tagA.live && /waiting/.test(tagA.txt) && /Battle/.test(toastB), { hostOn, ba, bb, tagA, toastB });
    b0 = await me(B); await hit(A, 'gun'); b1 = await me(B); let a1 = await me(A); await hit(B, 'gun'); let a2 = await me(A);
    ok('only the host on: no hits either way', b1.h === b0.h && a2.h === a1.h, { b0, b1, a1, a2 });
    await setB(A, false); await setB(B, true); await run(600); await face(6);
    b0 = await me(B); await hit(A, 'gun'); b1 = await me(B); a1 = await me(A); await hit(B, 'gun'); a2 = await me(A);
    ok('only the joiner on: no hits either way', b1.h === b0.h && a2.h === a1.h && !(await BT(B)).armed, { b0, b1, a1, a2 });
    trace('one on');

    // both on: hits land, both ways; the badge is lit on both
    await setB(A, true); await run(600); [ba, bb] = [await BT(A), await BT(B)];
    ok('both on: armed on both pages, the badge lit on both', ba.armed && bb.armed && ba.fight && bb.fight && ba.badge && ba.live && bb.badge && bb.live, { ba, bb });
    await face(6); b0 = await me(B); await hit(A, 'gun'); b1 = await me(B);
    ok(`both on: the host's gun hits the friend's mech (${b0.h} to ${Math.round(b1.h)})`, b1.h < b0.h - 1 && b1.st === 'up', { b0, b1, dealt: (await BT(A)).dealt });
    a1 = await me(A); await hit(B, 'gun'); a2 = await me(A);
    ok(`and the joiner's gun hits the host's (${a1.h} to ${Math.round(a2.h)})`, a2.h < a1.h - 1, { a1, a2 });
    await full(); await face(4); b0 = await me(B); await hit(A, 'punch', 1); b1 = await me(B);
    ok(`the punch lands too (${b0.h} to ${Math.round(b1.h)})`, b1.h < b0.h - 1, { b0, b1 });
    trace('both on');

    // 4 b: a robot leaves both fighting mechs alone
    await full(); await face(6);
    const a3 = await A.js(`const m = m0(); return { x: m.pos.x, z: m.pos.z };`);
    const rid2 = await A.js(`const c = R.spawn('charger', ${a3.x} + 7, ${a3.z} - 3); return c?.id ?? null;`);
    await run(3000); const t1 = await tgt(rid2), [ra, rb] = [await me(A), await me(B)];
    const guard = await A.js(`const m = m0(), h0 = m.health; R.hurt(0, 30, 'ram'); return { h0, h1: m.health };`);
    ok(`both on: a robot near goes for neither mech (${t1}); 3 s beside it, neither hurt; a robot's ram does nothing`, rid2 != null && t1 === null && ra.h === ra.max && rb.h === rb.max && guard.h1 === guard.h0, { rid2, t1, ra, rb, guard });
    trace('robots');

    // 2 b: a knockdown ends the round: "I win!" on both, then both reboot where they stand with full energy
    await A.js(`G.robots.find((q) => q.id === ${rid2})?.pos.set(9999, 0, 9999); return 1;`);
    await full(); await face(6);
    await B.js(`const m = m0(); m.health = 6; return 1;`); await A.js(`const m = m0(); m.health = Math.round(m.maxHealth * 0.5); return 1;`);
    const pre = await me(B); await hit(A, 'gun', 1); await run(2500, async () => (await BT(A)).round);
    const [ka, kb, ma, mb] = [await BT(A), await BT(B), await me(A), await me(B)];
    ok(`a knockdown: "I win!" on both screens (the winner's: "${ka.screen}"; the friend's: "${kb.screen}")`, mb.st === 'down' && /I win!/.test(ka.screen || '') && /You won/.test(ka.screen) && /I win!/.test(kb.screen || '') && /friend won/.test(kb.screen) && ka.round?.won && kb.round && !kb.round.won, { ka, kb, ma, mb });
    const mid = await run(1500, async () => (await me(B)).st !== 'down'); const kb2 = await BT(B);
    ok('the knocked-down mech waits for the winner screen (no early reboot)', !mid && kb2.screen, { mid, kb2 });
    // (the winner screen is BATTLE.show s of game time: a few times that here, where each step of 4 ticks takes a render)
    const up = await run(40000, async () => { const [x, y] = [await BT(A), await BT(B)]; return !x.round && !y.round; });
    const [ea, eb, fa, fb] = [await me(A), await me(B), await BT(A), await BT(B)];
    ok('then both reboot with full energy, where they stand (no checkpoint reached), the screens gone, Battle still on', up && ea.st === 'up' && eb.st === 'up' && ea.h === ea.max && eb.h === eb.max && Math.hypot(eb.x - pre.x, eb.z - pre.z) < 1.5 && Math.hypot(ea.x - ma.x, ea.z - ma.z) < 1.5 && !fa.screen && !fb.screen && fa.armed && fb.armed, { ea, eb, fa, fb, pre, ma });
    await face(6); b0 = await me(B); await hit(A, 'gun', 1); b1 = await me(B);
    ok('and the next round goes on: hits land again', b1.h < b0.h - 1, { b0, b1 });
    trace('knockdown');
    // 3 a: nothing saved (checked before the squad below: a world squadmate is saved, as always)
    const s1 = [await snap(A), await snap(B)];
    const diff = (x, y) => { const X = new Map(JSON.parse(x)), Y = new Map(JSON.parse(y)), out = []; for (const k of new Set([...X.keys(), ...Y.keys()])) if (X.get(k) !== Y.get(k)) { const x0 = X.get(k) || '', y0 = Y.get(k) || ''; let i = 0; while (i < x0.length && x0[i] === y0[i]) i++; out.push([k, x0.slice(Math.max(0, i - 60), i + 60), y0.slice(Math.max(0, i - 60), i + 60)]); } return out; };
    const d = [diff(s0[0], s1[0]), diff(s0[1], s1[1])];
    ok('the storage the same on both pages: the same keys, and every record unchanged', !d[0].length && !d[1].length, d);

    // 4 b: the robot beaten and fixed into the host's squad: it stays out of the fight
    const sq = await A.js(`const r = G.robots.find((q) => q.id === ${rid2}); if (!r) return 'gone'; R.teleport(0, ${a3.x} + 30, ${a3.z}); r.pos.set(${a3.x} + 33, r.pos.y, ${a3.z}); r.under = false; R.damage(r.id, 1e7, 'gun'); R.step(2); const c = R.choose(r.id, 'fix', 'Boltz'); return c.ok && solve(r.id) && G.squad.length;`);
    await A.js(`R.leaveFix?.(); G.paused = false; return 1;`).catch(() => 0);
    await A.js(`R.teleport(0, ${a3.x}, ${a3.z}); return 1;`); await full(); await face(6); await run(3000); const [qa, qb] = [await me(A), await me(B)];
    ok('a squadmate stays out: 3 s beside the fight, neither mech hurt', sq === 1 && qa.h === qa.max && qb.h === qb.max && !qa.paused, { sq, qa, qb });
    await A.js(`for (const r of [...G.squad]) R.sendHome(r.id), R.sendHome(r.id); return 1;`); await run(800);
    trace('squad');

    // off on either: no more hits; the host's desktop button turns it off
    await full(); await A.js(`G.paused = true; return 1;`);
    const btn = await A.ev(`(() => { const e = document.getElementById('battleB'); if (!e) return null; const was = e.getAttribute('aria-pressed'); e.click(); return { was, now: e.getAttribute('aria-pressed') }; })()`);
    await A.js(`G.paused = false; return 1;`); await run(600); [ba, bb] = [await BT(A), await BT(B)];
    ok('the pause button turns it off: not armed on either page', btn?.was === 'true' && btn.now === 'false' && !ba.me && !ba.armed && !bb.armed && !ba.badge, { btn, ba, bb });
    await face(6); b0 = await me(B); await hit(A, 'gun', 2); b1 = await me(B); a1 = await me(A); await hit(B, 'gun', 2); a2 = await me(A);
    ok('off on one side: no hits either way', b1.h === b0.h && a2.h === a1.h, { b0, b1, a1, a2 });
    await setB(A, true); await run(500); await B.js(`T.leave(); return 1;`); await run(800); [ba, bb] = [await BT(A), await BT(B)];
    ok('a leave: Battle off on both, no badge', !ba.me && !bb.me && !ba.badge && !bb.badge, { ba, bb });
    trace('off'); await hurts(false);

  },
  async touch(ok) {
    await Promise.all([A.open(844, 390, true), B.open(844, 390, true)]); await meet(); await quiet();
    const fit = (C, sel) => C.ev(`(() => { const W = innerWidth, H = innerHeight, out = [], L = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'); for (const e of L) { const b = e.getBoundingClientRect(); if (b.left < -1 || b.top < -1 || b.right > W + 1 || b.bottom > H + 1) out.push([e.id || e.className, Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]); } return { n: L.length, out, scroll: document.documentElement.scrollWidth - W }; })()`);
    for (const C of [A, B]) {
      await C.js(`R.manual(false); return 1;`); await sleep(300);
      const p = await C.ev(`(() => { const e = [...document.querySelectorAll('.tp-pause')].find((q) => q.getClientRects().length); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
      if (p) await C.tap(p.x, p.y); await sleep(400);
      const menu = await fit(C, '#tpMenu .tm'); await C.shot(`battle-menu-${C === A ? 'host' : 'friend'}`);
      const tile = await C.ev(`(() => { const e = document.getElementById('tmBattle'); return !!e && e.getClientRects().length > 0; })()`);
      ok(`${C === A ? 'host' : 'friend'}: the pause menu (${menu.n} tiles, Battle among them) fits`, tile && menu.n >= 8 && !menu.out.length && menu.scroll <= 0, { menu, tile });
      const tapped = await C.tapEl('#tmBattle'); await sleep(300);
      ok(`${C === A ? 'host' : 'friend'}: a tap turns Battle on (the tile says ON)`, tapped && (await BT(C)).me && await C.ev(`document.getElementById('tmBattle').getAttribute('aria-pressed') === 'true'`), { tapped, b: await BT(C) });
      await C.js(`document.getElementById('go')?.click(); return 1;`); await sleep(400);
    }
    await sleep(1200); const [ba, bb] = [await BT(A), await BT(B)];
    ok('both tapped on: armed on both, both games running', ba.armed && bb.armed && !(await A.js('return G.paused;')) && !(await B.js('return G.paused;')), { ba, bb });
    const tag = await fit(B, '#battleTag.on'); await B.shot('battle-touch-play');
    ok('the badge is on the screen', tag.n === 1 && !tag.out.length, tag);
    for (const C of [A, B]) { const n = await C.ev(`[...document.querySelectorAll('.tp-btn:not(.tp-off):not(.tp-pause)')].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none').length`); ok(`${C === A ? 'host' : 'friend'}: Battle on, at most 4 touch buttons (${n})`, n >= 1 && n <= 4, n); }
    await A.js(`R.manual(true); return 1;`); await B.js(`R.manual(true); return 1;`);
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
      if (n !== 'touch') await Promise.all([A.open(1280, 800, false), B.open(1280, 800, false)]);
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
