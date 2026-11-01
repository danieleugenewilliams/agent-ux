#!/usr/bin/env node
// Wild World W1 (#157): the endless world, the 18 animals and changing.
//
// The page is served over http by this script. Each run is its own headless Chrome (muted, never detached, killed with its
// profile deleted on every way out, and killed if the run takes over 5 minutes); the server is closed on every way out too.
// The logic runs drive window.__ww on a manual clock (__ww.step), so no result depends on the machine's speed.
//   walk     - 5 km in one direction (+x) and back, on foot through __ww.input + step, rendering each 250 m: renderer.info.memory
//              geometries and textures, the scene's mesh count, the chunk count and the instance capacities are flat between
//              km 1 and km 5 (live animals vary only within the cap); coming back, the spawn chunk was unloaded and rebuilt
//              (a new generation) and its heights and every tree and rock placement match the first visit number for number.
//   frames   - the median ms between frames in play (real time, rAF) at the spawn, at km 5 and at the spawn again after the
//              round trip, 3 runs each (the median of the 3), with draw calls and triangles; the km 5 and back-at-spawn medians
//              must be within FRAME_MARGIN of the first.
//   biomes   - the biome function sampled on a 20 m grid: all four biomes lie within BIOME_RADIUS of spawn; every one of the 18
//              animals is found live in its own biome (and still there after 10 s of wandering).
//   anatomy  - all 18 animals built in world space (__ww.anatomy: the tagged body, head, neck, tail and tip boxes): every neck's
//              low end is in the body and its top end in the head; every tail's near end is in the body and its far end behind
//              the body (more -z) and not below the feet; the horse, cow, elephant, giraffe and lion tails hang down and back
//              from the top of the rump (Dad's mix), every other tail rises; every tip sits on the far end of its tail; every animal but the bear has
//              a tail. With --shots, a contact sheet of all 18 from the side and from the play camera behind.
//   tails    - every tailed animal from the default play camera at 820x1180, 844x390 and 360x740 (__ww.tailView): how much of each
//              tail's length faces the camera (1 side-on, 0 end-on); every line tail (at least 2x as long as wide) shows at least
//              0.4, and no tip is wider on screen than its tail. With --shots, a contact sheet of them all from behind (440 px tiles).
//   forms    - all 18 change in and out (requestChange, the puff), each power measured against the table in POWERS; a human who
//              only steers (look + input) meets a fish, a dolphin, an eagle and a shy rabbit; the human paddles at the top of deep
//              water and never goes under; a reload keeps the book.
//   touch    - a touch-only round at 390x844 in real time with CDP Input.dispatchTouchEvent: the stick moves, a drag looks, the
//              jump, power, change (pick an animal in the wheel) and view buttons each act exactly once per tap, the pause menu
//              opens the book and resumes; 4 or fewer right-hand buttons.
//   WxH      - at that size in touch mode: every control (stick, buttons, pause, HUD chips) on screen with no overlap and no page
//              scroll; the wheel's slots, the book's 18 cards and the pause menu fit with no overlap.
//   keys     - keyboard only at 1280x800 in real time (CDP key events; PLAY clicked with a real mouse first, then Space must jump):
//              move, jump, power, Q wheel + arrows + Enter, B book + Enter on a card, V view, H human, Esc pause + Tab + Enter.
//   gamepad  - gamepad only, a stand-in navigator.getGamepads driven by the script: A starts, the sticks move and look, A jumps,
//              Y wheel + d-pad + A, X power, RB view, Back book + A, Start pause + d-pad + A, B back.
// Since W2 (#158) every page load here turns the spelling gate off (__ww.spelling(false), for that page only) and plays as Guest,
// so changes happen at once; scripts/ww-spelling.mjs tests the gate.
// Every run also checks there were no page errors; the logic run checks the page has no emoji (non-ASCII only in the copied
// TouchPad header).
//
// Usage:
//   node scripts/ww-world.mjs                  # every run
//   node scripts/ww-world.mjs --run forms      # one run (repeatable): anatomy | tails | forms | biomes | walk | frames | touch | keys | gamepad | WxH
//   node scripts/ww-world.mjs --shots DIR      # also save screenshots (the PR's set: --shots docs/screenshots/wild-world)
//   node scripts/ww-world.mjs path.html --json
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const SIZES = ['360x740', '568x320', '768x1024', '820x1180', '740x360', '844x390', '667x375'];
const FRAME_MARGIN = 0.35;    // km 5 / back at spawn may be at most 35% slower a frame than spawn (headless frame time is noisy)
const BIOME_RADIUS = 700;     // every biome within 700 m of spawn
const RUN_TIMEOUT_MS = 5 * 60 * 1000;
const args = process.argv.slice(2);
let json = false, target = null, shots = null; const picked = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--run') picked.push(args[++i]);
  else if (args[i] === '--shots') shots = path.resolve(args[++i]);
  else if (args[i] === '-h' || args[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
  else target = args[i];
}
const runs = picked.length ? picked : ['anatomy', 'tails', 'forms', 'biomes', 'walk', 'frames', 'touch', 'keys', 'gamepad', ...SIZES];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = path.resolve(target ?? path.join(repo, 'wild-world.html'));
if (shots) fs.mkdirSync(shots, { recursive: true });

// ---- the server: the page at /wild-world.html, everything else from the repo
let server = null, base = null;
async function serve() {
  server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = u === '/wild-world.html' ? page : path.join(repo, path.normalize(u).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(repo) && f !== page) f = null;
    let body = null; try { body = f && fs.readFileSync(f); } catch { body = null; }
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
}
const closeServer = () => { try { server?.closeAllConnections?.(); server?.close(); } catch {} server = null; };

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let shared = null;
function launch() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-world-'));
  const chrome = spawn(chromeBin, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--window-size=1280,800', '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });   // not detached: it dies with us
  chrome.on('error', () => {});
  const S = { chrome, prof, exited: false, ws: null, cleaned: false };
  chrome.on('exit', () => { S.exited = true; });
  shared = S;
  return S;
}
function killSync(S) {
  if (!S || S.cleaned) return; S.cleaned = true;
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
process.on('exit', () => { killSync(shared); closeServer(); });
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => { kill(shared).finally(() => { closeServer(); process.exit(code); }); });
const HARD_TIMEOUT_MS = 45 * 60 * 1000;
setTimeout(() => { console.error(`hard timeout: over ${HARD_TIMEOUT_MS / 60000} min; closing Chrome`); kill(shared).finally(() => { closeServer(); process.exit(2); }); }, HARD_TIMEOUT_MS).unref();

async function connect(S) {
  let tgt, port;
  for (let i = 0; i < 450 && !tgt && !S.exited; i++) {
    try { const f = fs.readFileSync(path.join(S.prof, 'DevToolsActivePort'), 'utf8'); if (f.includes('\n')) port = parseInt(f, 10) || undefined; } catch {}
    if (port) try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!tgt) await sleep(200);
  }
  if (!tgt) throw new Error('Chrome did not start (' + chromeBin + ')');
  const ws = S.ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; ws.onclose = () => j(new Error('Chrome closed the connection')); });
  let id = 0; const pend = new Map(), errs = [];
  ws.onclose = () => { for (const [, f] of pend) f({ result: { exceptionDetails: { text: 'Chrome closed the connection' } } }); pend.clear(); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { pend.get(m.id)?.(m); pend.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) errs.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
  };
  const send = (method, params = {}) => new Promise((r) => { if (ws.readyState !== 1) return r({ result: { exceptionDetails: { text: 'Chrome closed the connection' } } }); const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const v = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (v.result?.exceptionDetails) throw new Error('page threw: ' + (v.result.exceptionDetails.exception?.description || v.result.exceptionDetails.text));
    return v.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  const C = { send, ev, errs };
  // W2 (#158) asks for a word before each change into an animal; these runs test W1's world and changing, so each page load turns
  // the spelling gate off for that page (__ww.spelling(false): not saved). They play as Guest; ww-spelling.mjs tests the gate.
  const noSpelling = () => ev('window.__ww.spelling ? window.__ww.spelling(false) : true').catch(() => {});
  C.open = async (w, h, touch, q = '', keepStorage = false) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!touch, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: !!touch, maxTouchPoints: touch ? 5 : 0 });
    if (!keepStorage) { await send('Page.navigate', { url: base + 'wild-world.html?blank' }); await sleep(300); await ev('try { localStorage.clear(); } catch (e) {} true').catch(() => {}); }
    await send('Page.navigate', { url: base + 'wild-world.html' + q });
    for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState === "complete" && !!window.__ww').catch(() => false)) { await noSpelling(); return; } }
    throw new Error('page did not load window.__ww');
  };
  C.reload = async () => {
    await send('Page.reload', {});
    await sleep(300);
    for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState === "complete" && !!window.__ww').catch(() => false)) { await noSpelling(); return; } }
    throw new Error('page did not reload window.__ww');
  };
  C.shot = async (name) => { if (!shots) return; const sh = await send('Page.captureScreenshot', { format: 'png' }); if (sh.result?.data) fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(sh.result.data, 'base64')); };
  // real touches (CDP): a tap, a drag, a held stick
  C.touch = async (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id: id ?? 1, radiusX: 4, radiusY: 4, force: 1 })) });
  C.tap = async (x, y, holdMs = 60) => { await C.touch('touchStart', [[x, y]]); await sleep(holdMs); await C.touch('touchEnd', []); await sleep(150); };
  return C;
}

// ---- in the page: helpers
const H = String.raw`
  const W = window.__ww, S = () => W.state();
  // a spot of the given biome, searching rings out from (x0, z0); land spots need dry ground, water spots deep water
  const findBiome = (b, x0 = W.SPAWN.x, z0 = W.SPAWN.z, opt = {}) => {
    for (let r = 0; r < 2500; r += 10) for (let k = 0, n = Math.max(1, Math.floor(r / 5)); k < n; k++) {
      const a = k / n * Math.PI * 2, x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
      if (W.biomeAt(x, z) !== b) continue;
      const g = W.heightAt(x, z);
      if (b === 'water' ? g < (opt.depth ?? -4) : g > 0.8 && (!opt.flat || Math.abs(W.heightAt(x + 6, z) - g) + Math.abs(W.heightAt(x, z + 6) - g) < 1.2)) return { x, z };
    }
    return null;
  };
  // an open run: no collider within 3 m of the straight line ahead (+x) for len m, on dry flat ground
  const openRun = (b, len = 60) => {
    for (let r = 0; r < 2500; r += 12) for (let k = 0, n = Math.max(1, Math.floor(r / 6)); k < n; k++) {
      const a = k / n * Math.PI * 2, x = W.SPAWN.x + Math.cos(a) * r, z = W.SPAWN.z + Math.sin(a) * r;
      if (b && W.biomeAt(x, z) !== b) continue;
      let ok = true; for (let d = 0; d <= len && ok; d += 4) { const g = W.heightAt(x + d, z); if (g < 0.8) ok = false; }
      if (!ok) continue;
      W.teleport(x, z); W.settle();
      const cols = W.propsNear(len + 8).filter((p) => p.col > 0 && !p.fallen && p.x > x - 2 && p.x < x + len + 4 && Math.abs(p.z - z) < p.col + 3);
      if (!cols.length) return { x, z };
    }
    return null;
  };
  const steps = (n) => W.step(n);
`;

// ---- forms: every change and every power, measured
async function runForms(C) {
  const out = [], ok = (name, pass, got, note) => { out.push({ name, pass: !!pass, got: pass ? undefined : got, note: pass ? note : undefined }); return !!pass; };
  // no emoji: the only non-ASCII characters are the two ellipses in the TouchPad block's own header comment (copied as-is)
  const html = fs.readFileSync(page, 'utf8').split('\n'), odd = [];
  html.forEach((l, i) => { for (const ch of l) if (ch.charCodeAt(0) > 127) odd.push({ line: i + 1, ch: ch.codePointAt(0).toString(16), copied: /icon: '<svg…>'/.test(l) }); });
  ok(`no emoji: ${odd.length} non-ASCII characters, all U+2026 in the copied TouchPad header`, odd.every((o) => o.ch === '2026' && o.copied), odd.slice(0, 10));
  await C.open(1280, 800, false);
  const ev = (body) => C.ev(String.raw`(() => { ${H} W.manual(true); W.start(); ${body} })()`);
  // ---- all 18 change in and out, through requestChange; an unmet animal is refused; W2's gate holds a change until it says go
  let r = await ev(String.raw`W.reset(); const o = { refused: W.requestChange('cow'), form0: S().form, forms: [] };
    for (const a of W.ANIMALS) { const c0 = S().changes; W.become(a.id); W.step(2); const s1 = S(); W.become('human'); W.step(2); const s2 = S();
      o.forms.push({ id: a.id, in: s1.form, out: s2.form, n: s2.changes - c0, puffIn: s1.puff, puffOut: s2.puff }); }
    let held = null; W.Change.gate = (id, go) => { held = { id, go }; };
    o.gated = W.requestChange('cow'); o.formWhileGated = S().form; held.go(); o.formAfterGo = S().form; W.Change.gate = null; W.become('human');
    return o;`);
  ok('an animal not met yet is refused (requestChange false, still human)', r.refused === false && r.form0 === 'human', r);
  ok(`all 18 forms change in and back to human, each with a puff (${r.forms.filter((f) => f.in === f.id && f.out === 'human' && f.n === 2).length}/18)`, r.forms.length === 18 && r.forms.every((f) => f.in === f.id && f.out === "human" && f.n === 2 && f.puffIn > 0 && f.puffOut > 0), r.forms);
  ok('W2 hook: with Change.gate set, requestChange waits ("gated") until the gate says go', r.gated === 'gated' && r.formWhileGated === 'human' && r.formAfterGo === 'cow', r);
  // ---- speed: the human, the cheetah's burst, the horse's gallop (an open run along +x on dry ground)
  r = await ev(String.raw`const run = openRun('farm', 70) || openRun(null, 70); if (!run) return { run: null };
    const go = (form, power, n) => { W.become('human'); W.teleport(run.x, run.z); W.become(form); W.look(Math.PI / 2, 0.3); W.step(3); const x0 = S().x;
      W.input({ y: -1, powerP: !!power }); W.step(n); const s = S(); W.input({}); return { d: +(s.x - x0).toFixed(2), speed: s.speed }; };
    const o = { run, human: go('human', false, 60), cheetah: go('cheetah', true, 60), horse: go('horse', true, 60) };
    // cheetah after its burst (1.8 s), horse still galloping at 8 s (teleported back to stay on the open run)
    go('cheetah', true, 60); W.input({ y: -1 }); W.step(120); o.cheetahAfter = S().speed;
    go('horse', true, 60); for (let i = 0; i < 7; i++) { W.teleport(run.x, run.z); W.input({ y: -1 }); W.step(60); } o.horseAt8 = S().speed; o.gallopLeft = S().gallop; W.input({});
    W.become('human'); return o;`);
  ok(`the cheetah's burst is faster than the human: ${r.cheetah?.d} m vs ${r.human?.d} m in 1 s (x${(r.cheetah?.d / r.human?.d).toFixed(2)})`, r.run && r.cheetah.d > r.human.d * 3, r);
  ok(`the cheetah's burst is short: ${r.cheetahAfter?.toFixed(1)} m/s at 3 s (its walk is 8)`, r.cheetahAfter > 0 && r.cheetahAfter < 9, r);
  ok(`the horse gallops fast and long: ${r.horse?.d} m in 1 s (x${(r.horse?.d / r.human?.d).toFixed(2)} the human), still ${r.horseAt8?.toFixed(1)} m/s at 8 s`, r.horse?.d > r.human?.d * 2 && r.horseAt8 > 13, r);
  // ---- jumps: human, rabbit's long hop, cat's pounce (+ its jump in the air)
  r = await ev(String.raw`const run = openRun('farm', 40) || openRun(null, 40);
    const jump = (form, how, extra) => { W.become('human'); W.teleport(run.x, run.z); W.become(form); W.face(Math.PI / 2); W.step(3); const s0 = S(); let top = 0;
      W.input(how === 'power' ? { powerP: true } : { jumpP: true }); let n = 0; for (; n < 240; n++) { W.step(1); const s = S(); top = Math.max(top, s.y - s0.y);
        if (extra && n === 20) W.input({ jumpP: true }); else W.input({}); if (n > 3 && s.grounded) break; }
      const s = S(); return { top: +top.toFixed(2), dist: +Math.hypot(s.x - s0.x, s.z - s0.z).toFixed(2), ticks: n }; };
    const o = { human: jump('human', 'jump'), rabbit: jump('rabbit', 'power'), cat: jump('cat', 'power'), catDouble: jump('cat', 'power', true) };
    W.become('human'); return o;`);
  ok(`the rabbit's long hop: ${r.rabbit.top} m high (human ${r.human.top} m) and ${r.rabbit.dist} m forward`, r.rabbit.top > r.human.top * 2 && r.rabbit.dist > 8, r);
  ok(`the cat's pounce: the highest, ${r.cat.top} m (rabbit ${r.rabbit.top} m), straight up (${r.cat.dist} m sideways); a jump in the air takes it to ${r.catDouble.top} m`, r.cat.top > r.rabbit.top && r.cat.dist < 1 && r.catDouble.top > r.cat.top + 0.5, r);
  // ---- chicken's flutter: from 20 m up it falls slowly; the human doesn't
  r = await ev(String.raw`const run = openRun('farm', 10) || openRun(null, 10);
    const drop = (form, power) => { W.become('human'); W.teleport(run.x, run.z); W.become(form); const g = S().ground; W.teleport(run.x, run.z, g + 20); if (power) W.input({ powerP: true }); let minVy = 0;
      for (let i = 0; i < 90; i++) { W.step(1); W.input({}); minVy = Math.min(minVy, S().vy); } return { minVy: +minVy.toFixed(2), fell: +(g + 20 - S().y).toFixed(2) }; };
    const o = { chicken: drop('chicken', true), human: drop('human', false) }; W.become('human'); return o;`);
  ok(`the chicken flutters: falls at most ${-r.chicken.minVy} m/s (${r.chicken.fell} m in 1.5 s); the human falls ${-r.human.minVy} m/s`, r.chicken.minVy >= -1.6 && r.human.minVy < -10, r);
  // ---- pig's roll and fox's dig: they move with no stick input
  r = await ev(String.raw`const run = openRun('farm', 60) || openRun(null, 60);
    const go = (form, n) => { W.become('human'); W.teleport(run.x, run.z); W.become(form); W.face(Math.PI / 2); W.step(3); const s0 = S(); W.input({ powerP: true }); W.step(1); W.input({}); W.step(n);
      const s = S(); return { dx: +(s.x - s0.x).toFixed(2), dz: +(s.z - s0.z).toFixed(2) }; };
    const o = { pig: go('pig', 150), fox: go('fox', 60), human: go('human', 150) }; W.become('human'); return o;`);
  ok(`the pig rolls ${r.pig.dx} m with no stick (the human stays: ${r.human.dx} m)`, r.pig.dx > 15 && Math.abs(r.human.dx) < 0.01, r);
  ok(`the fox digs and pops up ${r.fox.dx} m ahead`, r.fox.dx > 17 && r.fox.dx < 21 && Math.abs(r.fox.dz) < 1, r);
  // ---- eagle flies up, glides, swoops
  r = await ev(String.raw`const run = openRun('farm', 10) || openRun(null, 10); W.become('human'); W.teleport(run.x, run.z); W.become('eagle'); W.face(Math.PI / 2); W.step(3);
    const g0 = S().ground; W.input({ jump: true, jumpP: true }); W.step(180); const up = S().y - g0; W.input({}); let minVy = 0; for (let i = 0; i < 150; i++) { W.step(1); minVy = Math.min(minVy, S().vy); }
    const x0 = S().x; W.input({ powerP: true }); W.step(1); W.input({}); W.step(30); const sw = (S().x - x0) / (31 / 60);
    W.become('human'); W.teleport(run.x, run.z); W.input({ jump: true, jumpP: true }); let humanTop = 0; for (let i = 0; i < 180; i++) { W.step(1); humanTop = Math.max(humanTop, S().y - g0); } W.input({});
    return { up: +up.toFixed(2), minVy: +minVy.toFixed(2), swoop: +sw.toFixed(1), humanTop: +humanTop.toFixed(2) };`);
  ok(`the eagle gains height: ${r.up} m in 3 s of flapping (the human holding jump: ${r.humanTop} m), glides down at ${-r.minVy} m/s, swoops at ${r.swoop} m/s`, r.up > 10 && r.humanTop < 2 && r.minVy >= -2.6 && r.minVy < -1 && r.swoop > 15, r);
  // ---- water: the human paddles at the top; the fish stays under and dives deep; the dolphin is fastest and leaps out
  r = await ev(String.raw`const w = findBiome('water', W.SPAWN.x, W.SPAWN.z, { depth: -6 }); if (!w) return { w: null };
    const o = { w, ground: W.heightAt(w.x, w.z) };
    W.become('human'); W.teleport(w.x, w.z); W.settle(); let hmin = 1e9, hmax = -1e9, eyeMin = 1e9;
    for (let i = 0; i < 180; i++) { W.step(1); const s = S(); hmin = Math.min(hmin, s.y); hmax = Math.max(hmax, s.y); eyeMin = Math.min(eyeMin, s.y + s.eye); }
    W.input({ jump: true, jumpP: true }); W.step(60); W.input({}); for (let i = 0; i < 60; i++) { W.step(1); eyeMin = Math.min(eyeMin, S().y + S().eye); }
    o.human = { min: +hmin.toFixed(2), max: +hmax.toFixed(2), eyeMin: +eyeMin.toFixed(2), under: S().under };
    W.become('fish'); W.step(60); let fmax = -1e9; for (let i = 0; i < 300; i++) { W.step(1); fmax = Math.max(fmax, S().y); }
    W.input({ jump: true }); for (let i = 0; i < 120; i++) { W.step(1); fmax = Math.max(fmax, S().y); }
    W.input({ power: true }); W.step(180); const deep = S().y; W.input({});
    o.fish = { max: +fmax.toFixed(2), deep: +deep.toFixed(2), floor: +S().ground.toFixed(2), under: S().under };
    const sp = (form) => { W.become('human'); W.teleport(w.x, w.z); W.become(form); W.look(Math.PI / 2, 0.3); W.step(30); const x0 = S().x; W.input({ y: -1 }); W.step(60); W.input({}); return +(S().x - x0).toFixed(2); };
    o.speed = { fish: sp('fish'), dolphin: sp('dolphin'), human: sp('human') };
    W.become('human'); W.teleport(w.x, w.z); W.become('dolphin'); W.step(90); const yd = S().y; W.input({ powerP: true }); let top = -1e9; for (let i = 0; i < 120; i++) { W.step(1); W.input({}); top = Math.max(top, S().y); }
    W.step(120); o.dolphin = { cruise: +yd.toFixed(2), top: +top.toFixed(2), back: +S().y.toFixed(2) };
    W.become('human'); return o;`);
  ok(`the human paddles at the top of deep water (feet ${r.human?.min}..${r.human?.max} m, eyes never below ${r.human?.eyeMin} m, sea 0)`, r.w && r.human.eyeMin > 0.2 && r.human.min > -1.4 && !r.human.under, r);
  ok(`the fish stays under water (highest ${r.fish?.max} m, even holding up) and dives to the floor holding power (${r.fish?.deep} m, floor ${r.fish?.floor} m)`, r.w && r.fish.max < -0.4 && r.fish.deep < r.fish.floor + 0.6 && r.fish.deep < -4, r);
  ok(`the dolphin swims fastest (${r.speed?.dolphin} m in 1 s; fish ${r.speed?.fish}, human ${r.speed?.human}), cruises under (${r.dolphin?.cruise} m) and leaps out to ${r.dolphin?.top} m, then back in (${r.dolphin?.back} m)`,
    r.w && r.speed.dolphin > r.speed.fish && r.speed.fish > r.speed.human && r.dolphin.cruise < -0.5 && r.dolphin.top > 2 && r.dolphin.back < 0, r);
  // ---- bear smash (small, in front) and elephant stomp (all around, twice as far, big ones too), in a forest
  r = await ev(String.raw`const pick = () => { for (let tries = 0; tries < 40; tries++) {
      const f = findBiome('forest', W.SPAWN.x + tries * 97, W.SPAWN.z - tries * 61); if (!f) continue; W.become('human'); W.teleport(f.x, f.z); W.settle();
      const small = W.propsNear(14).filter((p) => p.knock && !p.big && !p.fallen && p.t !== 'bush');
      for (const p of small) { const sx = p.x - 3, sz = p.z; if (W.heightAt(sx, sz) < 1) continue; W.teleport(sx, sz); W.face(Math.PI / 2); const near = W.propsNear(10);
        if (near.some((q) => q.knock && q.dot < -0.3 && q.d < 4.5) && near.some((q) => q.big && q.d < 9.5)) return { x: sx, z: sz }; } }
      return null; };
    const at = pick(); if (!at) return { at: null };
    const before = W.propsNear(11);
    W.become('bear'); W.face(Math.PI / 2); W.step(2); W.input({ powerP: true }); W.step(1); W.input({});
    const bear = S().lastSmash, afterBear = W.propsNear(11);
    const fell = afterBear.filter((p) => p.fallen), behind = fell.filter((p) => p.dot < 0.5), bigFell = fell.filter((p) => p.big);
    // the elephant at the same spot (the bear's knocks stay down): everything knockable within 10 m goes, big trees too
    W.become('human'); W.become('elephant'); W.face(Math.PI / 2); W.step(2); W.input({ powerP: true }); W.step(1); W.input({});
    const ele = S().lastSmash, afterEle = W.propsNear(11);
    const left = afterEle.filter((p) => p.knock && !p.fallen && p.d <= 9.9);
    W.become('human');
    return { at, bear, ele, bearFell: fell.length, bearBehind: behind.length, bearBig: bigFell.length,
      eleFell: afterEle.filter((p) => p.fallen).length, eleBig: afterEle.filter((p) => p.fallen && p.big).length, eleBehind: afterEle.filter((p) => p.fallen && p.dot < -0.3).length, left: left.length, standing0: before.filter((p) => p.knock).length };`);
  ok(`the bear smashes ${r.bear?.count} small things just in front (none behind: ${r.bearBehind}; no big tree: ${r.bearBig}; farthest ${r.bear?.maxD} m)`, r.at && r.bear.count > 0 && r.bearBehind === 0 && r.bearBig === 0 && r.bear.maxD <= 5, r);
  ok(`the elephant stomps ${r.ele?.count} more all around (behind too: ${r.eleBehind}; big trees: ${r.eleBig}; out to ${r.ele?.maxD} m), nothing knockable left within 10 m (${r.left})`, r.at && r.ele.count > 0 && r.eleBehind > 0 && r.eleBig > 0 && r.ele.maxD > 5 && r.left === 0, r);
  // ---- wolf howl: day -> night -> day
  r = await ev(String.raw`W.become('wolf'); const d0 = S().day; W.input({ powerP: true }); W.step(1); W.input({}); W.step(150); const d1 = S().day; W.step(120); W.input({ powerP: true }); W.step(1); W.input({}); W.step(150); const d2 = S().day; W.become('human'); return { d0, d1, d2 };`);
  ok(`the wolf's howl turns day into night and back (${r.d0} -> ${r.d1} -> ${r.d2})`, r.d0 === 1 && r.d1 < 0.05 && r.d2 > 0.95, r);
  // ---- giraffe: the fog pulls back and more of the world loads
  r = await ev(String.raw`W.become('giraffe'); W.step(2); const f0 = S().fogFar, c0 = W.settle(); W.input({ powerP: true }); W.step(1); W.input({}); const f1 = S().fogFar, c1 = W.settle();
    W.step(40); W.input({ powerP: true }); W.step(1); W.input({}); const f2 = S().fogFar, c2 = W.settle(); W.become('human'); return { f0, f1, f2, c0, c1, c2 };`);
  ok(`the giraffe looks far: fog ${r.f0} -> ${r.f1} m (chunks ${r.c0} -> ${r.c1}), and back (${r.f2} m, ${r.c2})`, r.f1 > r.f0 * 1.5 && r.c1 > r.c0 && r.f2 === r.f0 && r.c2 === r.c0, r);
  // ---- dog sniff: the arrow points at the nearest animal not met yet
  r = await ev(String.raw`W.reset(); W.meet('dog'); W.become('dog'); W.step(2); W.input({ powerP: true }); W.step(1); W.input({}); const s = S(), t = s.sniffTarget;
    const want = t ? Math.atan2(t.x - s.x, t.z - s.z) : null; W.become('human');
    return { on: s.arrowOn, t, err: t ? Math.abs(Math.atan2(Math.sin(s.arrowYaw - want), Math.cos(s.arrowYaw - want))) : null, met: s.met };`);
  ok(`the dog sniffs: an arrow points at the nearest unmet animal (${r.t?.type}, ${r.t?.d?.toFixed(0)} m, off by ${r.err?.toFixed(3)} rad)`, r.on && r.t && !r.met.includes(r.t.type) && r.err < 0.02, r);
  // ---- deer quiet steps, lion roar, cow moo: on the live animals
  r = await ev(String.raw`W.reset();
    const findType = (type, b) => { for (let t = 0; t < 30; t++) { const f = findBiome(b, W.SPAWN.x + t * 131, W.SPAWN.z + t * 89); if (!f) continue; W.become('human'); W.teleport(f.x, f.z); W.settle(); W.step(25);
      const a = W.animalsNear(80).find((q) => q.type === type); if (a) return a; } return null; };
    const rab = findType('rabbit', 'forest'); if (!rab) return { rab: null };
    const standOff = (a, d) => { for (let k = 0; k < 12; k++) { const ang = k / 12 * Math.PI * 2, x = a.x + Math.cos(ang) * d, z = a.z + Math.sin(ang) * d; if (W.heightAt(x, z) > 0.8) { W.teleport(x, z); return true; } } return false; };
    const flee = (form, quiet, dist) => { W.become('human'); W.reset(); const a = W.animalsNear(90).find((q) => q.key === rab.key) || W.animalsNear(90).find((q) => q.type === 'rabbit'); if (!a) return null; W.become(form); W.reset();
      if (quiet) { W.input({ powerP: true }); W.step(1); W.input({}); } standOff(a, dist); const d0 = W.animalsNear(90).find((q) => q.key === a.key).d; W.step(45); const b = W.animalsNear(90).find((q) => q.key === a.key); return { d0, d1: b ? b.d : null, met: S().met.includes('rabbit') }; };
    const o = { rab, human: flee('human', false, 5), deer: flee('deer', true, 6.3), reachHuman: null, reachDeer: null };
    W.become('human'); o.reachHuman = W.meetReach('rabbit'); W.become('deer'); W.input({ powerP: true }); W.step(1); W.input({}); o.reachDeer = W.meetReach('rabbit'); W.become('human');
    return o;`);
  ok(`deer's quiet steps: a rabbit runs from the human out to its 7 m (${r.human?.d0} -> ${r.human?.d1} m) but not from the quiet deer (${r.deer?.d0} -> ${r.deer?.d1} m)`, r.rab && r.human && r.deer && r.human.d1 - r.human.d0 > 1.5 && r.human.d1 > 6.8 && !r.human.met && Math.abs(r.deer.d1 - r.deer.d0) < 0.3 && !r.deer.met, r);
  ok(`deer's quiet steps: meets from twice as far (rabbit reach ${r.reachHuman?.toFixed(2)} m human, ${r.reachDeer?.toFixed(2)} m quiet deer)`, r.reachDeer > r.reachHuman * 1.8, r);
  r = await ev(String.raw`const crowd = (b) => { for (let t = 0; t < 60; t++) { const f = findBiome(b, W.SPAWN.x + t * 71, W.SPAWN.z + t * 113); if (!f) continue; W.become('human'); W.teleport(f.x, f.z); W.settle(); W.step(25);
      const near = W.animalsNear(22).filter((a) => W.FORMS[a.type].beh !== 'fly'); if (near.length >= 2) return f; } return null; };
    const test = (form, b, r0) => { const f = crowd(b); if (!f) return null; W.become('human'); W.teleport(f.x, f.z); W.step(2); W.become(form); const keys = W.animalsNear(r0).filter((a) => W.FORMS[a.type].beh !== 'fly').map((a) => a.key);
      const dist = () => { const all = W.animalsNear(1e9).filter((a) => keys.includes(a.key)); return all.reduce((s, q) => s + q.d, 0) / Math.max(1, all.length); };
      const d0 = dist(); W.input({ powerP: true }); W.step(1); W.input({}); W.step(240); return { n: keys.length, d0: +d0.toFixed(2), d1: +dist().toFixed(2) }; };
    const o = { lion: test('lion', 'savanna', 25), cow: test('cow', 'farm', 22) }; W.become('human'); return o;`);
  ok(`the lion roars: nearby animals run off (mean ${r.lion?.d0} -> ${r.lion?.d1} m, ${r.lion?.n} animals)`, r.lion && r.lion.d1 > r.lion.d0 + 4, r);
  ok(`the cow moos: nearby animals come over (mean ${r.cow?.d0} -> ${r.cow?.d1} m, ${r.cow?.n} animals)`, r.cow && r.cow.d1 < r.cow.d0 - 3, r);
  // ---- meeting with no hooks: a human who only steers (look + stick) meets a fish, a dolphin, an eagle and a rabbit
  r = await ev(String.raw`const chase = (type, b) => {
      for (let t = 0; t < 40; t++) { const f = findBiome(b, W.SPAWN.x + t * 157, W.SPAWN.z - t * 101, { depth: -3 }); if (!f) continue; W.become('human'); W.reset(); W.teleport(f.x, f.z); W.settle(); W.step(25);
        const a = W.animalsNear(60).find((q) => q.type === type); if (!a) continue;
        for (let i = 0; i < 4000; i++) { if (i % 10 === 0) { const b2 = W.animalsNear(1e9).find((q) => q.key === a.key); if (!b2) break; const s = S(); W.look(Math.atan2(b2.x - s.x, b2.z - s.z)); W.input({ y: -1 }); }
          W.step(1); if (S().met.includes(type)) { W.input({}); return { met: true, ticks: i, from: a.d }; } }
        W.input({}); return { met: false, from: a.d, at: S() }; }
      return null; };
    const o = { fish: chase('fish', 'water'), dolphin: chase('dolphin', 'water'), eagle: chase('eagle', 'water'), rabbit: chase('rabbit', 'forest') }; W.input({}); return o;`);
  for (const t of ['fish', 'dolphin', 'eagle', 'rabbit']) ok(`a human who only steers meets the ${t} (from ${r[t]?.from} m in ${(r[t]?.ticks / 60).toFixed(1)} s)`, r[t]?.met, r[t]);
  // ---- the book and a reload
  r = await ev(String.raw`W.reset(); W.meet('fox'); W.meet('eagle'); W.meet('cow'); W.become('fox'); W.openBook(); const cards = document.querySelectorAll('#grid .card').length, open = document.querySelectorAll('#grid .card:not(.locked)').length; W.closeOverlay();
    return { cards, open, met: S().met, form: S().form, saved: JSON.parse(localStorage.getItem('wildworld.book.guest')) };`);
  ok(`the book shows all 18 (${r.cards}), the 3 met ones open (${r.open}); saved as Guest's book, wildworld.book.guest with v:2 (W2, #158)`, r.cards === 18 && r.open === 3 && r.saved?.v === 2 && r.saved.met.length === 3, r);
  await C.reload();
  const r2 = await C.ev(`(() => { const s = window.__ww.state(); return { met: s.met.sort(), form: s.form, keys: Object.keys(localStorage).filter((k) => k.startsWith('wildworld.')) }; })()`);
  ok(`a reload keeps the book (${r2.met.join(', ')}) and the form (${r2.form})`, r2.met.join() === 'cow,eagle,fox' && r2.form === 'fox' && r2.keys.join() === 'wildworld.book.guest', r2);
  return out;
}

// on foot along x (look +x or -x, stick forward) until x passes `to`; if the guy is stuck (a tree, a barn) for 10 s he is nudged
// 4 m on and the nudge is counted. Returns { ticks, nudges }.
const WALK = String.raw`
  const walkTo = (to) => { const dir = Math.sign(to - S().x); W.look(dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0.3); W.input({ y: -1 }); let t = 0, nudges = 0, lastX = S().x;
    while ((to - S().x) * dir > 0) { W.step(60); t += 60; if (t % 600 === 0) { const x = S().x; if (Math.abs(x - lastX) < 5) { W.teleport(x + 4 * dir, S().z); nudges++; } lastX = x; } }
    W.input({}); return { ticks: t, nudges }; };
`;
async function runWalk(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  const ev = (body) => C.ev(String.raw`(() => { ${H} ${WALK} W.manual(true); W.start(); ${body} })()`);
  const snap = String.raw`const snap = () => { W.renderAround(); const i = W.info(); return { ...i, ...W.render(), x: S().x, z: S().z }; };
    const all25 = () => { const c = S().chunk, o = {}; for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) o[(c[0] + dx) + ',' + (c[1] + dz)] = W.chunk(c[0] + dx, c[1] + dz); return o; };`;
  let r = await ev(String.raw`${snap} W.settle(); W.step(30); const c = S().chunk; return { c, at: snap(), chunks: all25(), x0: S().x, z0: S().z };`);
  const c0 = r.c, first = r.chunks, x0 = r.x0, z0 = r.z0, spawn0 = r.at;
  const marks = {}; let nudges = 0, ticks = 0;
  for (let m = 250; m <= 5000; m += 250) {
    r = await ev(String.raw`${snap} const w = walkTo(${x0 + m}); return { w, at: snap() };`);
    nudges += r.w.nudges; ticks += r.w.ticks;
    if (m === 1000 || m === 5000) marks[m] = r.at;
  }
  const k1 = marks[1000], k5 = marks[5000];
  const capOf = (i) => Object.fromEntries(Object.entries(i.instances).map(([k, v]) => [k, v.capacity]));
  const fixed = (i) => i.meshes - i.animalMeshes;
  ok(`walked 5 km east on foot (${(ticks / 60).toFixed(0)} s of game time, ${nudges} nudges past a tree): now x ${k5.x.toFixed(0)}`, k5.x - x0 >= 5000, { k5, nudges });
  ok(`geometries flat: km 1 ${k1.geometries}, km 5 ${k5.geometries} (spawn ${spawn0.geometries}); textures ${k1.textures} / ${k5.textures}`, k1.geometries === k5.geometries && k5.geometries === spawn0.geometries && k1.textures === k5.textures, { k1, k5 });
  ok(`chunks flat: ${k1.chunks} / ${k5.chunks}; scene meshes less the animals' ${fixed(k1)} / ${fixed(k5)} (all meshes ${k1.meshes} / ${k5.meshes}, animals ${k1.animals} / ${k5.animals} of at most ${20})`,
    k1.chunks === 25 && k5.chunks === 25 && fixed(k1) === fixed(k5) && k5.animals <= 20 && k1.animals <= 20, { k1, k5 });
  ok(`instance buffers flat (fixed capacity, ${Object.values(capOf(k5)).reduce((a, b) => a + b, 0)} in all) and drawn = live props (km 1 ${k1.liveInstances}, km 5 ${k5.liveInstances})`,
    JSON.stringify(capOf(k1)) === JSON.stringify(capOf(k5)) && Object.values(k5.instances).every((v) => v.count === v.live && v.live <= v.capacity), { k1: k1.instances, k5: k5.instances });
  // and back to spawn: every one of the 25 chunks loaded there was unloaded and rebuilt, and is the same number for number
  for (let m = 4750; m >= 0; m -= 250) { r = await ev(String.raw`const w = walkTo(${x0 + m}); return { w };`); nudges += r.w.nudges; }
  r = await ev(String.raw`${snap} W.teleport(W.SPAWN.x, W.SPAWN.z); W.settle(); W.step(30); return { at: snap(), chunks: all25() };`);
  const again = r.chunks, back = r.at, keys = Object.keys(first);
  let hd = 0, pd = 0, nH = 0, nP = 0, trees = 0, rocks = 0; const rebuilt = [], kinds = [];
  for (const k of keys) {
    const a = first[k], b = again[k]; if (!a || !b) { kinds.push(k + ' missing'); continue; }
    if (b.gen !== a.gen && b.uuid !== a.uuid) rebuilt.push(k);
    nH += a.heights.length; for (let i = 0; i < a.heights.length; i++) hd = Math.max(hd, Math.abs(a.heights[i] - b.heights[i]));
    if (a.props.length !== b.props.length || a.props.some((p, i) => p[0] !== b.props[i][0])) { kinds.push(k); continue; }
    nP += a.props.length; trees += a.props.filter((p) => /pine|oak|acacia/.test(p[0])).length; rocks += a.props.filter((p) => p[0] === 'rock').length;
    for (let i = 0; i < a.props.length; i++) for (let j = 1; j < 5; j++) pd = Math.max(pd, Math.abs(a.props[i][j] - b.props[i][j]));
  }
  ok(`back at spawn all ${keys.length} chunks there were rebuilt (${rebuilt.length} with a new generation and a new geometry; spawn chunk ${c0}: generation ${first[c0.join()].gen} -> ${again[c0.join()]?.gen})`, rebuilt.length === keys.length && keys.length === 25, { rebuilt: rebuilt.length });
  ok(`the same terrain: ${nH} heights over the 25 chunks, largest difference ${hd} m`, nH === 25 * 289 && hd === 0 && !kinds.length, { hd, kinds });
  ok(`the same props: ${nP} placements (${trees} trees, ${rocks} rocks), largest difference ${pd} (position and scale)`, !kinds.length && nP > 500 && trees > 50 && rocks > 20 && pd === 0, { nP, trees, rocks, pd, kinds });
  ok(`back at spawn the counts match the start: geometries ${spawn0.geometries} -> ${back.geometries}, textures ${spawn0.textures} -> ${back.textures}, chunks ${back.chunks}`, back.geometries === spawn0.geometries && back.textures === spawn0.textures && back.chunks === 25, { spawn0, back });
  out.walk = { k1, k5, spawn0, back, nudges };
  console.log('  walk ' + JSON.stringify({ spawn: { g: spawn0.geometries, m: spawn0.meshes, calls: spawn0.calls, tris: spawn0.tris }, km1: { g: k1.geometries, m: k1.meshes, a: k1.animals, calls: k1.calls, tris: k1.tris, inst: k1.liveInstances }, km5: { g: k5.geometries, m: k5.meshes, a: k5.animals, calls: k5.calls, tris: k5.tris, inst: k5.liveInstances }, back: { g: back.geometries, m: back.meshes } }));
  return out;
}

// A frame's work, timed: one tick and one render, waited out on the GPU (a 1-pixel read), 150 times after 30 to warm up; the median ms.
// (The ms between requestAnimationFrame calls is also taken, for the record, but headless Chrome snaps it to 16.7 / 33.3 / 50 ms,
// so a frame that costs 32 ms or 34 ms reads 33 or 50: too coarse to compare.) The camera faces the same way (north) every time.
const FRAMES = String.raw`new Promise((done) => { const W = window.__ww, gl = W.renderer.getContext(), px = new Uint8Array(4), t = [];
  W.manual(true); W.look(0, 0.32);
  for (let i = 0; i < 180; i++) { const t0 = performance.now(); W.step(1); W.renderer.render(W.scene, W.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i >= 30) t.push(performance.now() - t0); }
  t.sort((a, b) => a - b); const r = W.render();
  const raf = []; let last = 0, n = 0; W.manual(false);
  const f = (now) => { if (last) raf.push(now - last); last = now; if (++n < 90) requestAnimationFrame(f); else { W.manual(true); raf.sort((a, b) => a - b); done({ med: t[t.length >> 1], p90: t[Math.floor(t.length * 0.9)], raf: raf[raf.length >> 1], calls: r.calls, tris: r.tris }); } };
  requestAnimationFrame(f); })`;
async function runFrames(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const got = { spawn: [], km5: [], back: [] };
  for (let round = 0; round < 3; round++) {
    await C.open(1280, 800, false);
    const x0 = await C.ev(String.raw`(() => { ${H} W.manual(true); W.start(); W.settle(); return S().x; })()`);
    got.spawn.push(await C.ev(FRAMES));
    await C.ev(String.raw`(() => { ${H} ${WALK} W.manual(true); walkTo(${x0} + 5000); W.settle(); return true; })()`);
    got.km5.push(await C.ev(FRAMES));
    await C.ev(String.raw`(() => { ${H} ${WALK} W.manual(true); walkTo(${x0}); const z = S().z; W.teleport(${x0}, z); W.settle(); return true; })()`);
    got.back.push(await C.ev(FRAMES));
    if (!json) console.log(`  frames round ${round + 1}: spawn ${got.spawn[round].med.toFixed(2)} ms (rAF ${got.spawn[round].raf.toFixed(1)}), km 5 ${got.km5[round].med.toFixed(2)} ms (rAF ${got.km5[round].raf.toFixed(1)}), back ${got.back[round].med.toFixed(2)} ms (rAF ${got.back[round].raf.toFixed(1)})`);
  }
  const med = (k) => got[k].map((x) => x.med).sort((a, b) => a - b)[1];
  const s = med('spawn'), k = med('km5'), b = med('back');
  const sum = { spawn: +s.toFixed(2), km5: +k.toFixed(2), back: +b.toFixed(2), calls: { spawn: got.spawn[0].calls, km5: got.km5[0].calls, back: got.back[0].calls }, tris: { spawn: got.spawn[0].tris, km5: got.km5[0].tris, back: got.back[0].tris } };
  out.frames = sum;
  ok(`a frame's work flat (median of 3 runs, headless swiftshader at 1280x800): spawn ${sum.spawn} ms, km 5 ${sum.km5} ms, back at spawn ${sum.back} ms (margin ${FRAME_MARGIN * 100}%); draw calls ${sum.calls.spawn} / ${sum.calls.km5} / ${sum.calls.back}, triangles ${sum.tris.spawn} / ${sum.tris.km5} / ${sum.tris.back}`,
    k <= s * (1 + FRAME_MARGIN) && b <= s * (1 + FRAME_MARGIN), sum);
  return out;
}

// ---- biomes and where the animals live
async function runBiomes(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  const ev = (body) => C.ev(String.raw`(() => { ${H} W.manual(true); W.start(); ${body} })()`);
  let r = await ev(String.raw`const near = {}, counts = {}; let n = 0;
    for (let x = -${BIOME_RADIUS}; x <= ${BIOME_RADIUS}; x += 20) for (let z = -${BIOME_RADIUS}; z <= ${BIOME_RADIUS}; z += 20) { const d = Math.hypot(x, z); if (d > ${BIOME_RADIUS}) continue;
      const b = W.biomeAt(W.SPAWN.x + x, W.SPAWN.z + z); n++; counts[b] = (counts[b] || 0) + 1; if (!(b in near) || d < near[b]) near[b] = d; }
    return { near, counts, n, spawn: W.SPAWN, spawnBiome: W.biomeAt(W.SPAWN.x, W.SPAWN.z) };`);
  ok(`all four biomes within ${BIOME_RADIUS} m of spawn (nearest: ${Object.entries(r.near).map(([b, d]) => b + ' ' + d.toFixed(0) + ' m').join(', ')}; share of ${r.n} samples: ${Object.entries(r.counts).map(([b, c]) => b + ' ' + Math.round(c / r.n * 100) + '%').join(', ')}); spawn is on the ${r.spawnBiome}`,
    ['farm', 'forest', 'savanna', 'water'].every((b) => r.near[b] <= BIOME_RADIUS) && r.spawnBiome === 'farm', r);
  // every animal found live in its own biome, and still in it after 10 s of wandering
  const found = {};
  for (const b of ['farm', 'forest', 'savanna', 'water']) {
    r = await ev(String.raw`const want = W.ANIMALS.filter((a) => a.biome === '${b}').map((a) => a.id), got = {};
      // spots of this biome on a 150 m grid out from spawn, nearest first
      const spots = []; for (let x = -1200; x <= 1200; x += 150) for (let z = -1200; z <= 1200; z += 150) { const px = W.SPAWN.x + x, pz = W.SPAWN.z + z; if (W.biomeAt(px, pz) === '${b}' && ('${b}' === 'water' ? W.heightAt(px, pz) < -3 : W.heightAt(px, pz) > 0.8)) spots.push({ x: px, z: pz, d: Math.hypot(x, z) }); }
      spots.sort((p, q) => p.d - q.d);
      for (const f of spots.slice(0, 60)) { if (want.every((id) => got[id])) break;
        W.teleport(f.x, f.z); W.settle(); W.step(25);
        for (const a of W.animalsNear(90)) if (want.includes(a.type) && !got[a.type]) got[a.type] = { ...a, at: f };
        // ten seconds of wandering for those found here; they stay in their biome
        W.step(600); for (const a of W.animalsNear(1e9)) if (got[a.type] && got[a.type].key === a.key) got[a.type].after = a.biome; }
      return got;`);
    Object.assign(found, r);
  }
  const animals = await C.ev('window.__ww.ANIMALS.map((a) => ({ id: a.id, biome: a.biome }))');
  for (const a of animals) {
    const f = found[a.id];
    ok(`the ${a.id} lives in the ${a.biome}: found at ${f ? f.x.toFixed(0) + ', ' + f.z.toFixed(0) : '-'} in the ${f?.biome} (home ${f?.home}; after 10 s: ${f?.after ?? 'out of range'})`, f && f.biome === a.biome && f.home === a.biome && (f.after == null || f.after === a.biome), f);
  }
  // showcase screenshots: each biome with an animal form
  for (const [b, form] of [['farm', 'horse'], ['forest', 'bear'], ['savanna', 'giraffe'], ['water', 'dolphin']]) {
    await ev(String.raw`const f = findBiome('${b}', W.SPAWN.x, W.SPAWN.z, { depth: -5 }); W.become('human'); W.teleport(f.x, f.z); W.settle(); W.become('${form}'); W.look(0.6, 0.28); W.step(40); W.render(); return true;`);
    await sleep(1000); await C.shot(`biome-${b}-${form}`);
  }
  // the eagle high over the farm, and a wolf's night in the forest
  await ev(String.raw`W.become('human'); W.teleport(W.SPAWN.x, W.SPAWN.z); W.settle(); W.become('eagle'); W.look(2.2, 0.35); W.input({ jump: true, jumpP: true }); W.step(150); W.input({}); W.step(10); return true;`);
  await sleep(1000); await C.shot('eagle-flying');
  await ev(String.raw`const f = findBiome('forest', W.SPAWN.x, W.SPAWN.z); W.become('human'); W.teleport(f.x, f.z); W.settle(); W.become('wolf'); W.look(-0.8, 0.25); W.input({ powerP: true }); W.step(1); W.input({}); W.step(150); return true;`);
  await sleep(1000); await C.shot('wolf-night');
  return out;
}

// ---- touch-only round (real time, CDP touches)
async function runTouch(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const W0 = 390, H0 = 844;
  await C.open(W0, H0, true);
  const rect = (sel) => C.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
  const st = () => C.ev('window.__ww.state()');
  await C.shot('touch-title');
  let p = await rect('#playBtn'); await C.tap(p.x, p.y); await sleep(500);
  let s = await st();
  ok(`tapping PLAY starts the game, the touch controller shows (${s.screen}, showing ${s.touch.showing})`, s.screen === 'play' && s.touch.showing && s.touch.touchMode, s);
  const btns = () => C.ev(`[...document.querySelectorAll('.tp-root .tp-btn:not(.tp-pause)')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.dataset.tp)`);
  let b = await btns();
  ok(`as the human, ${b.length} right-hand buttons (${b.join(', ')}): no power yet`, b.length === 3 && !b.includes('power'), b);
  // the stick: push up for 1.2 s
  s = await st(); const a0 = { x: s.x, z: s.z };
  await C.touch('touchStart', [[90, H0 - 150]]); for (let i = 1; i <= 6; i++) { await C.touch('touchMove', [[90, H0 - 150 - i * 10]]); await sleep(30); } await sleep(1200); await C.touch('touchEnd', []); await sleep(200);
  s = await st();
  ok(`the stick moves the guy (${Math.hypot(s.x - a0.x, s.z - a0.z).toFixed(1)} m)`, Math.hypot(s.x - a0.x, s.z - a0.z) > 3, s);
  // a drag on the right looks around
  const y0 = s.camYaw;
  await C.touch('touchStart', [[260, 300]]); for (let i = 1; i <= 8; i++) { await C.touch('touchMove', [[260 + i * 10, 300]]); await sleep(25); } await C.touch('touchEnd', []); await sleep(250);
  s = await st();
  ok(`a drag on the right turns the camera (yaw ${y0.toFixed(2)} -> ${s.camYaw.toFixed(2)})`, s.camYaw < y0 - 0.3, { y0, y1: s.camYaw });
  // jump once
  const j0 = s.jumps; p = await rect('.tp-root [data-tp="jump"]'); await C.tap(p.x, p.y); await sleep(900);
  s = await st();
  ok(`one tap on JUMP is one jump (${s.jumps - j0})`, s.jumps - j0 === 1, s);
  // change: open the wheel, pick the rabbit (met through the hook first: the setup, not the controls)
  await C.ev(`window.__ww.meet('rabbit')`); await sleep(100);
  p = await rect('.tp-root [data-tp="change"]'); await C.tap(p.x, p.y); await sleep(400);
  s = await st();
  ok(`one tap on CHANGE opens the wheel once (${s.overlay}, opened ${s.wheels})`, s.overlay === 'wheel' && s.wheels === 1, s);
  await C.shot('touch-wheel');
  const c0 = s.changes; p = await rect('.wslot[data-id="rabbit"]'); await C.tap(p.x, p.y); await sleep(600);
  s = await st();
  ok(`one tap on the rabbit in the wheel is one change (${s.changes - c0}): now ${s.form}, wheel closed`, s.changes - c0 === 1 && s.form === 'rabbit' && !s.overlay, s);
  b = await btns();
  ok(`as an animal, ${b.length} right-hand buttons (${b.join(', ')}): 4 or fewer`, b.length <= 4 && b.includes('power'), b);
  // power once
  const pw0 = s.powers; p = await rect('.tp-root [data-tp="power"]'); await C.tap(p.x, p.y); await sleep(1200);
  s = await st();
  ok(`one tap on the power (LONG HOP) is one power (${s.powers - pw0})`, s.powers - pw0 === 1, s);
  // view: first person and back
  const v0 = s.views; p = await rect('.tp-root [data-tp="cam"]'); await C.tap(p.x, p.y); await sleep(300);
  s = await st(); const fp1 = s.fp;
  await C.shot('touch-first-person');
  await C.tap(p.x, p.y); await sleep(300); s = await st();
  ok(`VIEW toggles first person once per tap (${s.views - v0} taps: ${fp1} then ${s.fp})`, s.views - v0 === 2 && fp1 === true && s.fp === false, s);
  // the pause menu: open, the book, close, pause again, play
  p = await rect('.tp-root [data-tp="pause"]'); await C.tap(p.x, p.y); await sleep(300); s = await st();
  ok(`the pause button opens the pause menu once (${s.overlay}, ${s.pauses})`, s.overlay === 'pause' && s.pauses === 1, s);
  await C.shot('touch-pause');
  p = await rect('#pBookBtn'); await C.tap(p.x, p.y); await sleep(300); s = await st();
  ok(`ANIMAL BOOK in the pause menu opens the book (${s.overlay}, ${s.books})`, s.overlay === 'book' && s.books === 1, s);
  await C.shot('touch-book');
  p = await rect('#bookX'); await C.tap(p.x, p.y); await sleep(300); s = await st();
  ok(`the book's close button goes back to play (${s.overlay})`, s.overlay === null && s.touch.showing, s);
  p = await rect('.tp-root [data-tp="pause"]'); await C.tap(p.x, p.y); await sleep(300);
  p = await rect('#resumeBtn'); await C.tap(p.x, p.y); await sleep(300); s = await st();
  ok(`PLAY in the pause menu resumes (${s.overlay}, paused ${s.pauses} times)`, s.overlay === null && s.pauses === 2 && s.touch.showing, s);
  await C.shot('touch-play');
  return out;
}

// ---- anatomy: necks meet heads, tails come out of the back end and stay on, tips stay on their tails (the boys' playtest)
const ANAT_T = 0.03;   // "touching": within 3 cm
const HANG = ['horse', 'cow', 'elephant', 'giraffe', 'lion'];   // Dad's mix (hand-back 2): long tails that hang
function checkAnatomy(a) {
  const T = ANAT_T, bad = [];
  const inBox = (p, b) => p[0] >= b.min[0] - T && p[0] <= b.max[0] + T && p[1] >= b.min[1] - T && p[1] <= b.max[1] + T && p[2] >= b.min[2] - T && p[2] <= b.max[2] + T;
  const bodies = a.parts.filter((q) => q.role === 'body'), heads = a.parts.filter((q) => q.role === 'head');
  if (bodies.length !== 1) return { bad: ['body: ' + bodies.length + ' boxes'], tails: 0, necks: 0, tips: 0 };
  const B = bodies[0], bc = B.min.map((v, i) => (v + B.max[i]) / 2), f = (p) => p.map((v) => +v.toFixed(2));
  let tails = 0, necks = 0, tips = 0, lastTail = null;
  for (const q of a.parts) {
    if (q.role === 'neck') {
      necks++; const [lo, hi] = q.ends[0][1] < q.ends[1][1] ? q.ends : [q.ends[1], q.ends[0]];
      if (!inBox(lo, B)) bad.push(`neck's low end ${f(lo)} is not in the body`);
      if (!heads.some((h) => inBox(hi, h))) bad.push(`neck's top end ${f(hi)} does not meet the head`);
    } else if (q.role === 'tail') {
      tails++; const d = (p) => Math.hypot(p[0] - bc[0], p[1] - bc[1], p[2] - bc[2]);
      const [near, far] = q.swing ? q.ends : d(q.ends[0]) <= d(q.ends[1]) ? q.ends : [q.ends[1], q.ends[0]];
      if (!inBox(near, B)) bad.push(`tail's near end ${f(near)} is not on the body`);
      if (!(far[2] < B.min[2])) bad.push(`tail's far end ${f(far)} is not behind the body (back at z ${B.min[2].toFixed(2)})`);
      if (far[1] < a.at[1] - 1e-6) bad.push(`tail's far end ${f(far)} is below the feet`);
      if (HANG.includes(a.id)) {   // Dad's mix: these long tails hang from the top of the rump, down and a little back (not tucked into the legs)
        if (!(far[1] < near[1])) bad.push(`tail should hang down (near end y ${near[1].toFixed(2)}, far end y ${far[1].toFixed(2)})`);
        if (!(far[2] < near[2] - 0.1)) bad.push(`hanging tail is tucked in, not back from vertical (near z ${near[2].toFixed(2)}, far z ${far[2].toFixed(2)})`);
        if (!(near[1] >= B.max[1] - 0.15)) bad.push(`hanging tail doesn't start at the top of the rump (y ${near[1].toFixed(2)}, back at ${B.max[1].toFixed(2)})`);
      } else if (far[1] < near[1] - 1e-6) bad.push(`tail droops instead of rising (near end y ${near[1].toFixed(2)}, far end y ${far[1].toFixed(2)})`);
      lastTail = { far };
    } else if (q.role === 'tip') {
      tips++; const c = q.min.map((v, i) => (v + q.max[i]) / 2);
      const gap = lastTail ? Math.hypot(c[0] - lastTail.far[0], c[1] - lastTail.far[1], c[2] - lastTail.far[2]) : Infinity;
      if (gap > q.size * 0.6 + T) bad.push(`tip at ${f(c)} is ${gap.toFixed(2)} m off its tail's end`);
    }
  }
  if (a.id !== 'bear' && !tails) bad.push('no tail');
  return { bad, tails, necks, tips };
}
async function runAnatomy(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  const all = await C.ev(`window.__ww.ANIMALS.map((a) => window.__ww.anatomy(a.id))`);
  const res = all.map((a) => ({ id: a.id, ...checkAnatomy(a) })), broken = res.filter((r) => r.bad.length);
  for (const r of res) ok(`${r.id}: ${r.necks ? r.necks + ' neck meets the head, ' : ''}${r.tails ? r.tails + ' tail on the body and behind it' : 'no tail (a bear)'}${r.tips ? ', ' + r.tips + ' tip on its tail' : ''}`, !r.bad.length, r.bad);
  ok(`anatomy: ${res.length - broken.length}/18 animals pass${broken.length ? ' (broken: ' + broken.map((r) => r.id).join(', ') + ')' : ''}`, res.length === 18 && !broken.length, broken.map((r) => r.id));
  if (shots) {
    // a contact sheet: each animal from the side and from the play camera behind it (3 animals = 6 views a row)
    const url = await C.ev(String.raw`(() => { const W = window.__ww, T = W.THREE, R = W.renderer, S = 200, cols = 6, ids = W.ANIMALS.map((a) => a.id), rows = Math.ceil(ids.length * 2 / cols);
      const sc = new T.Scene(); sc.background = new T.Color(0x8fd3ff); sc.add(new T.HemisphereLight(0xffffff, 0x6a8f4a, 1.2)); const dl = new T.DirectionalLight(0xfff2d6, 1.4); dl.position.set(3, 6, 2); sc.add(dl);
      const ground = new T.Mesh(new T.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: 0x8ad25a })); sc.add(ground);
      const cam = new T.PerspectiveCamera(40, 1, 0.05, 200), rt = new T.WebGLRenderTarget(S, S), buf = new Uint8Array(S * S * 4);
      const cv = document.createElement('canvas'); cv.width = cols * S; cv.height = rows * S; const cx = cv.getContext('2d'), img = cx.createImageData(S, S);
      const toS = (v) => Math.round(255 * ((v /= 255) <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
      cx.font = 'bold 14px sans-serif'; let k = 0;
      for (const id of ids) {
        const m = W.makeModel(id); sc.add(m); const F = W.FORMS[id]; const box = new T.Box3().setFromObject(m), c = box.getCenter(new T.Vector3()), sz = box.getSize(new T.Vector3()), r = Math.max(sz.x, sz.y, sz.z);
        for (const view of ['side', 'behind']) {
          if (view === 'side') { cam.position.set(c.x + r * 1.9, c.y + r * 0.15, c.z); cam.lookAt(c); }
          else { const L = new T.Vector3(0, F.camH * 0.62, 0); cam.position.set(0, L.y + Math.sin(0.32) * F.camD, -Math.cos(0.32) * F.camD); cam.lookAt(L); }
          R.setRenderTarget(rt); R.render(sc, cam); R.readRenderTargetPixels(rt, 0, 0, S, S, buf);
          for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const s = ((S - 1 - y) * S + x) * 4, d = (y * S + x) * 4; img.data[d] = toS(buf[s]); img.data[d + 1] = toS(buf[s + 1]); img.data[d + 2] = toS(buf[s + 2]); img.data[d + 3] = 255; }
          const px = (k % cols) * S, py = Math.floor(k / cols) * S; cx.putImageData(img, px, py); cx.fillStyle = '#183153'; cx.fillText(id + ' - ' + view, px + 6, py + 18); k++;
        }
        sc.remove(m);
      }
      R.setRenderTarget(null); rt.dispose(); return cv.toDataURL('image/png'); })()`);
    fs.writeFileSync(path.join(shots, 'animals-side-behind.png'), Buffer.from(url.split(',')[1], 'base64'));
  }
  return out;
}

// ---- tails from the play camera (the boys' playtest, round 2): every line tail reads as a line from behind, not a square
const TAIL_SIZES = ['820x1180', '844x390', '360x740'], TAIL_MIN = 0.4;
async function runTails(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const table = {};
  for (const size of TAIL_SIZES) {
    const [w, h] = size.split('x').map(Number);
    await C.open(w, h, false);
    const r = await C.ev(String.raw`(() => { ${H} W.manual(true); W.start(); const run = openRun('farm', 12) || openRun(null, 12); const o = {};
      for (const a of W.ANIMALS) { W.become('human'); W.teleport(run.x, run.z); W.become(a.id); W.look(0, 0.32); W.step(3); const v = W.tailView(); if (v.tails.length) o[a.id] = v.tails; }
      W.become('human'); return o; })()`);
    for (const [id, tails] of Object.entries(r)) for (const [i, t] of tails.entries()) (table[id + (tails.length > 1 ? '#' + i : '')] ||= {})[size] = t;
    if (shots && size === '820x1180') {
      // a contact sheet: every tailed animal from the play camera's own spot and angle behind it (zoomed to a 24-degree view so the
      // animal fills the tile; the change puff hidden), 440 px a tile
      const ids = Object.keys(r);
      const url = await C.ev(String.raw`(() => { const W = window.__ww, T = W.THREE, R = W.renderer, S = 440, cols = 4, ids = ${JSON.stringify(ids)}, rows = Math.ceil(ids.length / cols);
        const rt = new T.WebGLRenderTarget(S, S), buf = new Uint8Array(S * S * 4), cv = document.createElement('canvas'); cv.width = cols * S; cv.height = rows * S;
        const cx = cv.getContext('2d'), img = cx.createImageData(S, S), toS = (v) => Math.round(255 * ((v /= 255) <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
        cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height); cx.font = 'bold 22px sans-serif'; const p0 = { x: W.P.x, z: W.P.z };
        ids.forEach((id, k) => { W.become('human'); W.teleport(p0.x, p0.z); W.become(id); W.look(0, 0.32); W.step(3); W.P.pop = 1; W.render();
          W.scene.traverse((o) => { if (o.isPoints) o.visible = false; }); const cam = W.camera.clone(); cam.aspect = 1; cam.fov = 24; cam.updateProjectionMatrix(); R.setRenderTarget(rt); R.render(W.scene, cam); W.scene.traverse((o) => { if (o.isPoints) o.visible = true; }); R.readRenderTargetPixels(rt, 0, 0, S, S, buf);
          for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const s = ((S - 1 - y) * S + x) * 4, d = (y * S + x) * 4; img.data[d] = toS(buf[s]); img.data[d + 1] = toS(buf[s + 1]); img.data[d + 2] = toS(buf[s + 2]); img.data[d + 3] = 255; }
          const px = (k % cols) * S, py = Math.floor(k / cols) * S; cx.putImageData(img, px, py); cx.fillStyle = '#183153'; cx.fillText(id, px + 10, py + 30); });
        R.setRenderTarget(null); rt.dispose(); W.become('human'); return cv.toDataURL('image/png'); })()`);
      fs.writeFileSync(path.join(shots, 'tails-play-camera.png'), Buffer.from(url.split(',')[1], 'base64'));
    }
  }
  const rows = Object.entries(table);
  for (const [id, by] of rows) {
    const t0 = by[TAIL_SIZES[0]], line = t0.line, shown = TAIL_SIZES.map((s) => by[s]?.shown ?? null), worst = Math.min(...shown);
    const tipOk = TAIL_SIZES.every((s) => (by[s]?.tips || []).every((tp) => tp.widthPx <= by[s].widthPx + 0.5));
    const tips = TAIL_SIZES.map((s) => (by[s]?.tips || []).map((tp) => tp.widthPx + '/' + by[s].widthPx + ' px').join(' ')).join(', ');
    if (line) ok(`${id}: its tail shows ${shown.join(' / ')} from the play camera (${TAIL_SIZES.join(' / ')}; at least ${TAIL_MIN})${t0.tips.length ? `; tip no wider than the tail (tip/tail ${tips})` : ''}`, worst >= TAIL_MIN && tipOk, by);
    else ok(`${id}: a short or flat tail (not a line: under 2x as long as wide), shows ${shown.join(' / ')}${t0.tips.length ? `; tip no wider than the tail (${tips})` : ''}`, tipOk, by);
  }
  const lines = rows.filter(([, by]) => by[TAIL_SIZES[0]].line), worst = lines.map(([id, by]) => [id, Math.min(...TAIL_SIZES.map((s) => by[s].shown))]).sort((a, b) => a[1] - b[1]);
  console.log('  tails ' + JSON.stringify(Object.fromEntries(rows.map(([id, by]) => [id, TAIL_SIZES.map((s) => by[s]?.shown)]))));
  ok(`tails: ${lines.filter(([, by]) => TAIL_SIZES.every((s) => by[s].shown >= TAIL_MIN)).length}/${lines.length} line tails show at least ${TAIL_MIN} at all three sizes (worst: ${worst[0]?.[0]} ${worst[0]?.[1]})`, worst.every(([, v]) => v >= TAIL_MIN), worst);
  return out;
}

// ---- keyboard only (real time, CDP key events), after PLAY is clicked with a real mouse
const KEYS = { Space: [' ', 32], Enter: ['Enter', 13], Tab: ['Tab', 9], Escape: ['Escape', 27], ArrowRight: ['ArrowRight', 39], ShiftLeft: ['Shift', 16], KeyW: ['w', 87], KeyQ: ['q', 81], KeyV: ['v', 86], KeyB: ['b', 66], KeyH: ['h', 72] };
async function runKeys(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  const st = () => C.ev('window.__ww.state()');
  const key = async (code, hold = 50) => { const [k, vk] = KEYS[code], base = { code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, location: code === 'ShiftLeft' ? 1 : 0 };
    await C.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(k.length === 1 || k === 'Enter' ? { text: k === 'Enter' ? '\r' : k } : {}) }); await sleep(hold);
    await C.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }); await sleep(180); };
  const r = await C.ev(`(() => { const r = document.getElementById('playBtn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await C.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(400);
  let s = await st();
  ok(`a mouse click on PLAY starts (${s.screen}; focus left on: ${s.focus})`, s.screen === 'play', s);
  await key('Space'); await sleep(700); s = await st();
  ok(`then Space jumps (once: ${s.jumps}), not swallowed by the PLAY button`, s.jumps === 1, s);
  const a0 = { x: s.x, z: s.z }; await key('KeyW', 1000); s = await st();
  ok(`W walks (${Math.hypot(s.x - a0.x, s.z - a0.z).toFixed(1)} m)`, Math.hypot(s.x - a0.x, s.z - a0.z) > 3, s);
  await C.ev(`window.__ww.meet('rabbit'), window.__ww.meet('fox')`);
  await key('KeyQ'); s = await st();
  ok(`Q opens the wheel once (${s.overlay}, ${s.wheels})`, s.overlay === 'wheel' && s.wheels === 1, s);
  const c0 = s.changes; for (let i = 0; i < 11; i++) await key('ArrowRight', 20);
  const sel = await C.ev(`document.querySelector('.wslot.sel')?.dataset.id`);
  await key('Enter'); s = await st();
  ok(`arrows pick the rabbit in the wheel (${sel}) and Enter changes once (${s.changes - c0}): ${s.form}`, sel === 'rabbit' && s.form === 'rabbit' && s.changes - c0 === 1 && !s.overlay, s);
  await key('ShiftLeft'); await sleep(900); s = await st();
  ok(`Shift uses the power once (${s.powers})`, s.powers === 1, s);
  await key('KeyV'); const fp = (await st()).fp; await key('KeyV'); s = await st();
  ok(`V toggles the view (${fp} then ${s.fp}, ${s.views} presses)`, fp === true && s.fp === false && s.views === 2, s);
  await key('KeyB'); s = await st(); const f0 = s.focus;
  await key('Enter'); s = await st();
  ok(`B opens the book with the first met card focused (${f0}); Enter on it changes (${s.form})`, f0 === 'fox' && s.form === 'fox' && !s.overlay && s.books === 1, s);
  await key('KeyH'); s = await st();
  ok(`H changes back to human (${s.form})`, s.form === 'human', s);
  await key('Escape'); s = await st(); const p1 = s.overlay, foc = s.focus;
  await key('Tab'); const foc2 = (await st()).focus; await key('Enter'); s = await st();
  ok(`Esc pauses (${p1}, focus ${foc}); Tab moves to ${foc2}; Enter opens the book (${s.overlay})`, p1 === 'pause' && foc === 'resumeBtn' && foc2 === 'pBookBtn' && s.overlay === 'book' && s.books === 2, s);
  await key('Escape'); const o1 = (await st()).overlay; await key('Escape'); const o2 = (await st()).overlay; await key('Enter'); s = await st();
  ok(`Esc closes the book (${o1}), Esc pauses again (${o2}), Enter on PLAY resumes (${s.overlay}; paused ${s.pauses} times)`, o1 === null && o2 === 'pause' && s.overlay === null && s.pauses === 2, s);
  return out;
}

// ---- gamepad only (real time): a stand-in navigator.getGamepads the script presses buttons on
async function runGamepad(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const pad = { id: 'test pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__pad = pad; Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] }); })();` });
  await C.open(1280, 800, false);
  const st = () => C.ev('window.__ww.state()');
  const press = async (n, hold = 120) => { await C.ev(`window.__pad.buttons[${n}].pressed = true`); await sleep(hold); await C.ev(`window.__pad.buttons[${n}].pressed = false`); await sleep(200); };
  const axis = (i, v) => C.ev(`window.__pad.axes[${i}] = ${v}`);
  const A = 0, B = 1, X = 2, Y = 3, RB = 5, BACK = 8, START = 9, DOWN = 13, RIGHT = 15;
  await press(A); let s = await st();
  ok(`A on the title starts (${s.screen})`, s.screen === 'play', s);
  const a0 = { x: s.x, z: s.z }; await axis(1, -1); await sleep(1000); await axis(1, 0); await sleep(150); s = await st();
  const y0 = s.camYaw; await axis(2, 1); await sleep(500); await axis(2, 0); await sleep(150); const s2 = await st();
  ok(`the left stick walks (${Math.hypot(s.x - a0.x, s.z - a0.z).toFixed(1)} m), the right stick looks (yaw ${y0.toFixed(2)} -> ${s2.camYaw.toFixed(2)})`, Math.hypot(s.x - a0.x, s.z - a0.z) > 3 && s2.camYaw < y0 - 0.3, { s, s2 });
  await press(A); await sleep(700); s = await st();
  ok(`A jumps once (${s.jumps})`, s.jumps === 1, s);
  await C.ev(`window.__ww.meet('rabbit'), window.__ww.meet('fox')`);
  await press(Y); s = await st();
  ok(`Y opens the wheel once (${s.overlay}, ${s.wheels})`, s.overlay === 'wheel' && s.wheels === 1, s);
  const c0 = s.changes; for (let i = 0; i < 11; i++) await press(RIGHT, 60);
  const sel = await C.ev(`document.querySelector('.wslot.sel')?.dataset.id`); await press(A); s = await st();
  ok(`the d-pad picks the rabbit (${sel}) and A changes once (${s.changes - c0}): ${s.form}`, sel === 'rabbit' && s.form === 'rabbit' && s.changes - c0 === 1 && !s.overlay, s);
  await press(X); await sleep(900); s = await st();
  ok(`X uses the power once (${s.powers})`, s.powers === 1, s);
  await press(RB); const fp = (await st()).fp; await press(RB); s = await st();
  ok(`RB toggles the view (${fp} then ${s.fp})`, fp === true && s.fp === false && s.views === 2, s);
  await press(BACK); s = await st(); const f0 = s.focus; await press(A); s = await st();
  ok(`Back opens the book (first met card focused: ${f0}); A changes (${s.form})`, f0 === 'fox' && s.form === 'fox' && !s.overlay && s.books === 1, s);
  await press(START); s = await st(); const p1 = s.overlay; await press(DOWN); const foc = (await st()).focus; await press(A); const o1 = (await st()).overlay; await press(B); const o2 = (await st()).overlay;
  ok(`Start pauses (${p1}); the d-pad moves to ${foc}; A opens the book (${o1}); B goes back to play (${o2})`, p1 === 'pause' && foc === 'pBookBtn' && o1 === 'book' && o2 === null, { p1, foc, o1, o2 });
  await press(START); await press(A); s = await st();
  ok(`Start then A on PLAY resumes (${s.overlay}; paused ${s.pauses} times); the touch controller stays hidden (${s.touch.showing})`, s.overlay === null && s.pauses === 2 && !s.touch.showing && s.gamepadUsed > 0, s);
  return out;
}

// ---- device lenses: controls, wheel and book at each size (touch mode)
const LAYOUT = String.raw`(() => { const W = innerWidth, H = innerHeight;
  const vis = (e) => { if (!e || !e.getClientRects().length) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0; };
  // round things (the controller's rings, the wheel's slots) are circles; everything else is its box
  const box = (e) => { const r = e.getBoundingClientRect(); return { n: e.dataset.tp || e.dataset.id || e.id || e.className, l: r.left, t: r.top, r: r.right, b: r.bottom, round: getComputedStyle(e).borderRadius === '50%' }; };
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
  return { W, H, vis, box, on, pairs, scroll };
})()`;
async function runSize(C, size) {
  const [w, h] = size.split('x').map(Number), out = [], ok = (name, pass, got) => { out.push({ name: size + ': ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(w, h, true);
  await C.ev(String.raw`(() => { ${H} W.start(); W.meet('fox'); W.meet('cow'); W.meet('eagle'); W.become('fox'); return true; })()`);
  await C.tap(Math.round(w * 0.75), Math.round(h * 0.3)); await sleep(500);   // a touch on empty ground: touch mode on
  let r = await C.ev(String.raw`(() => { const L = ${LAYOUT};
    const els = [...document.querySelectorAll('.tp-root .tp-ring.tp-stick, .tp-root .tp-btn, .tp-root .tp-pause, #formChip, #bookChip')].filter(L.vis), boxes = els.map(L.box);
    return { n: boxes.length, off: boxes.filter((q) => !L.on(q)).map((q) => q.n), hits: L.pairs(boxes), scroll: L.scroll, showing: window.__ww.state().touch.showing, boxes }; })()`);
  ok(`${r.n} controls (stick, ${r.n - 4} buttons, pause, 2 HUD chips) all on screen, none overlapping, no scroll (${r.scroll.x}, ${r.scroll.y})`, r.showing && r.n === 8 && !r.off.length && !r.hits.length && r.scroll.x <= 0 && r.scroll.y <= 0, r);
  await sleep(300); await C.shot(`size-${size}-play`);
  await C.ev(`window.__ww.openWheel()`); await sleep(300);
  r = await C.ev(String.raw`(() => { const L = ${LAYOUT}; const slots = [...document.querySelectorAll('#ring .wslot')].map(L.box), x = L.box(document.getElementById('wheelX')), nm = L.box(document.getElementById('wname'));
    return { n: slots.length, size: Math.round(slots[0].r - slots[0].l), off: [...slots, x, nm].filter((q) => !L.on(q)).map((q) => q.n), hits: L.pairs([...slots, x, nm]), scroll: L.scroll }; })()`);
  ok(`the wheel fits: ${r.n} slots of ${r.size} px, all on screen, none overlapping each other, the close button or the name`, r.n === 19 && r.size >= 44 && !r.off.length && !r.hits.length && r.scroll.x <= 0 && r.scroll.y <= 0, r);
  await C.shot(`size-${size}-wheel`);
  await C.ev(`window.__ww.closeOverlay(); window.__ww.openBook()`); await sleep(300);
  r = await C.ev(String.raw`(() => { const L = ${LAYOUT}; const cards = [...document.querySelectorAll('#grid .card')].map(L.box), x = L.box(document.getElementById('bookX')), hd = L.box(document.getElementById('bookHead').querySelector('span'));
    return { n: cards.length, size: Math.round(cards[0].r - cards[0].l), off: [...cards, x, hd].filter((q) => !L.on(q)).map((q) => q.n), hits: L.pairs([...cards, x, hd]), scroll: L.scroll }; })()`);
  ok(`the book fits: ${r.n} cards of ${r.size} px, all on screen, none overlapping each other, the close button or the title`, r.n === 18 && r.size >= 44 && !r.off.length && !r.hits.length && r.scroll.x <= 0 && r.scroll.y <= 0, r);
  await C.shot(`size-${size}-book`);
  await C.ev(`window.__ww.closeOverlay(); window.__ww.openPause()`); await sleep(300);
  r = await C.ev(String.raw`(() => { const L = ${LAYOUT}; const b = [...document.querySelectorAll('#pause .big')].filter(L.vis).map(L.box); return { n: b.length, off: b.filter((q) => !L.on(q)).map((q) => q.n), hits: L.pairs(b), minH: Math.min(...b.map((q) => q.b - q.t)) }; })()`);
  ok(`the pause menu fits: ${r.n} buttons on screen, ${Math.round(r.minH)} px tall, none overlapping`, r.n >= 3 && !r.off.length && !r.hits.length && r.minH >= 44, r);
  await C.ev(`window.__ww.closeOverlay()`);
  return out;
}

async function runSmoke(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  const r = await C.ev(String.raw`(() => { ${H} W.manual(true); W.start(); W.step(60); return { s: S(), info: W.info(), r: W.render() }; })()`);
  ok('loads', !!r.s, r);
  console.log(JSON.stringify(r).slice(0, 1500));
  await C.shot('smoke');
  return out;
}

async function main() {
  await serve();
  const all = []; const unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now(); let timer;
    try {
      const C = await connect(S);
      const job = run === 'smoke' ? runSmoke(C) : run === 'walk' ? runWalk(C) : run === 'frames' ? runFrames(C) : run === 'biomes' ? runBiomes(C) : run === 'forms' ? runForms(C) : run === 'touch' ? runTouch(C) : run === 'keys' ? runKeys(C) : run === 'gamepad' ? runGamepad(C) : run === 'anatomy' ? runAnatomy(C) : run === 'tails' ? runTails(C) : runSize(C, run);
      const res = await Promise.race([job, new Promise((_, j) => { timer = setTimeout(() => j(new Error(`over ${RUN_TIMEOUT_MS / 60000} min: killed`)), RUN_TIMEOUT_MS); })]);
      res.push({ name: run + ': no page errors', pass: C.errs.length === 0, got: C.errs.length ? C.errs.slice(0, 10) : undefined });
      all.push(...res);
      const bad = res.filter((r) => !r.pass);
      if (!json) {
        console.log(`${run}: ${res.length - bad.length}/${res.length} pass  (${((Date.now() - t0) / 1000).toFixed(1)} s)${bad.length ? '  FAIL' : ''}`);
        for (const r of res) if (r.pass) console.log('  ok   ' + r.name);
        for (const r of bad) console.log('  FAIL ' + r.name + '\n       ' + JSON.stringify(r.got)?.slice(0, 1500));
      }
    } catch (e) {
      unfinished.push(run + ': ' + (e?.message || e));
      if (!json) console.log(`${run}: did not finish: ${e?.message || e}`);
    } finally { clearTimeout(timer); await kill(S); }
  }
  const failed = all.filter((r) => !r.pass);
  if (json) console.log(JSON.stringify({ page, runs, checks: all, failed: failed.length, unfinished }, null, 1));
  else console.log(`${page}\n${all.length - failed.length}/${all.length} checks pass${unfinished.length ? `, ${unfinished.length} run(s) did not finish` : ''}: ${failed.length || unfinished.length ? 'FAIL' : 'PASS'}`);
  return unfinished.length ? 2 : failed.length ? 1 : 0;
}

let code = 2;
try { code = await main(); }
catch (e) { console.error('check failed: ' + (e?.stack || e?.message || e)); }
finally { await kill(shared); closeServer(); }
process.exit(code);
