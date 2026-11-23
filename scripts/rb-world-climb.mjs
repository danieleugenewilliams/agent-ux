#!/usr/bin/env node
// Robot Battle endless world check (#167, slice 5: climbing the mountains). The boys' ask: "make it so that you can climb
// the mountain" (their drawing 5: a tall mountain, a player at its foot saying "Wow!").
//
// Each run is its own headless Chrome (muted, not detached, killed with its profile deleted on every way out, as
// scripts/rb-world.mjs does). Made-up profiles only.
//   logic  - at 1280 x 800, through window.__rb:
//            * waves untouched: a meadow drive never comes into the climb (no grade, no climb pose, no camera lift);
//            * summits: every mountains / snow top high enough has one, the highest ground in its chunk and well inside
//              it, the same after the chunks go and come back; the ground's heights not changed by them;
//            * a climb from a mountain's foot to its summit with the drive key held (the real movement): it gets there,
//              slower up the steep stretches but never below the floor and never stuck, clambering on the steep ones
//              (the lean, the clamber footfall), and the flag goes up gold, its beacon off, once;
//            * flat ground: the walk as it was; downhill: a little faster, never more than climb.fast;
//            * the steepest slope found: the mech still gets up it;
//            * a jump on a slope (spring legs): in the air the slope changes nothing, it lands back on the ground;
//            * the camera: never below the ground on the way down, and looking over the slope on the way up;
//            * the world's robots move as before (they never come into the climb);
//            * the storage keys the same, nothing new in the record.
//   touch  - at 844 x 390 with touch: player 1 clambering up a slope: at most 4 touch buttons, no sideways scroll.
//
// Usage:
//   node scripts/rb-world-climb.mjs                     # ./robot-battle.html: logic, then touch
//   node scripts/rb-world-climb.mjs --logic             # the logic run only
//   node scripts/rb-world-climb.mjs path/or/url.html --json
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let target = null, json = false, logicOnly = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--logic') logicOnly = true;
  else target = args[i];
}
const runs = logicOnly ? ['logic'] : ['logic', 'touch'];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
target ||= path.join(repo, 'robot-battle.html');
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(path.resolve(target)).href;

// made-up profiles (#161: no real child's name anywhere)
const KIDS = [{ id: 'tester', name: 'Tester', icon: 'bow', hex: '#3fb4ff', ladder: 'check', wiring: 'math', created: 1 }, { id: 'robo', name: 'Robo', icon: 'sun', hex: '#ff8a1f', ladder: 'start', wiring: 'math', created: 2 }];
const KIDS_SET = `localStorage.setItem('robotbattle.profiles', ${JSON.stringify(JSON.stringify(KIDS))})`;
const KIDS_JS = `(() => { const R = window.__rb; if (localStorage.getItem('robotbattle.profiles') == null && !Object.keys(localStorage).some((k) => k.startsWith('robotbattle.facts.')) && R.Profiles) { ${KIDS_SET}; R.Profiles.load(); R.Title.home(); R.Title.drawKids(); R.Title.draw(); } return true; })()`;
const CLEAR = `(localStorage.clear(), ${KIDS_SET})`;

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

let shared = null;
function launch() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-climb-'));
  const chrome = spawn(chromeBin, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--allow-file-access-from-files', '--window-size=1280,800', '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
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
process.on('exit', () => { killSync(shared); });
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => { kill(shared).finally(() => process.exit(code)); });
const HARD_TIMEOUT_MS = 15 * 60 * 1000;   // 
setTimeout(() => { console.error(`hard timeout: over ${HARD_TIMEOUT_MS / 60000} min; closing Chrome`); kill(shared).finally(() => process.exit(124)); }, HARD_TIMEOUT_MS).unref();

async function connect(S) {
  let tgt, port;
  for (let i = 0; i < 450 && !tgt && !S.exited; i++) {   // (up to 90 s: a loaded machine starts Chrome slowly)
    try { const f = fs.readFileSync(path.join(S.prof, 'DevToolsActivePort'), 'utf8'); if (f.includes('\n')) port = parseInt(f, 10) || undefined; } catch {}
    if (port) try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!tgt) await sleep(200);
  }
  if (!tgt) throw new Error('Chrome did not start (' + chromeBin + ')');
  const ws = S.ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; ws.onclose = () => j(new Error('Chrome closed the connection')); });
  let id = 0; const pend = new Map(), errs = [];
  // (Chrome gone mid-run: every call still waiting fails, so the run is reported as not finished rather than hanging)
  ws.onclose = () => { for (const [, f] of pend) f({ result: { exceptionDetails: { text: 'Chrome closed the connection' } } }); pend.clear(); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { pend.get(m.id)?.(m); pend.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) errs.push('log: ' + m.params.entry.text);
  };
  const send = (method, params = {}) => new Promise((r) => { if (ws.readyState !== 1) return r({ result: { exceptionDetails: { text: 'Chrome closed the connection' } } }); const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const v = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (v.result?.exceptionDetails) throw new Error('page threw: ' + (v.result.exceptionDetails.exception?.description || v.result.exceptionDetails.text));
    return v.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  const open = async (w, h, touch, u = url) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!touch, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: !!touch, maxTouchPoints: touch ? 5 : 0 });
    await send('Page.navigate', { url: u });
    for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState === "complete" && !!window.__rb').catch(() => false)) { if (u === url) await ev(KIDS_JS); return; } }
    throw new Error('page did not load window.__rb: ' + u);
  };
  const tap = async (x, y) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] }); await sleep(40);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(120);
  };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(120);
  };
  const key = async (code, vk) => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: code, windowsVirtualKeyCode: vk }); await sleep(70);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code, windowsVirtualKeyCode: vk }); await sleep(90);
  };
  // a gamepad button (standard mapping: 0 A, 1 B, 12-15 the d-pad), pressed for a few frames of the game's own loop
  const padBtn = async (n) => { await ev(`window.__pad.buttons[${n}].pressed = true`); await sleep(120); await ev(`window.__pad.buttons[${n}].pressed = false`); await sleep(120); };
  return { send, ev, open, tap, click, key, padBtn, errs };
}


// ---- in the page ----
const H = String.raw`
  const R = window.__rb, G = R.Game, W = R.World, WC = R.WORLD.climb, WS = WC.summit, C = R.WORLD.chunk;
  const reload = () => { W.sweep(); for (const k of [...W.chunks.keys()]) W.unload(k); W.update(true); W.sweep(); };
  const keys = () => Object.keys(localStorage).sort();
  const rec = () => JSON.parse(localStorage.getItem('robotbattle.facts.tester') || 'null');
  const m0 = () => G.humans[0].mech;
  // the world's robots sent far off (so none pushes, shoots or downs the mech in a drive test), and player 1 kept up
  const calm = () => { for (const r of G.robots) if (r.wkey && r.state === 'glitched' && Math.hypot(r.pos.x - m0().pos.x, r.pos.z - m0().pos.z) < 400) r.pos.x += 5000; const m = m0(); m.health = m.maxHealth; };
  // player 1 heading for (x, z) (its legs, torso and aim): steered by hand, driven by the held key
  const head = (x, z) => { const m = m0(), hd = Math.atan2(-(x - m.pos.x), -(z - m.pos.z)); m.legHeading = hd; m.torsoYaw = hd; m.input.aimYaw = hd; return hd; };
  const pose = (x, z, tx, tz) => { R.teleport(0, x, z); const m = m0(); m.speed = 0; m.turnVel = 0; head(tx, tz); };
  // a summit's foot: 70 m out, the lowest of 16 ways round
  const foot = (s, d = 70) => { let b = null; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d, h = W.h(x, z); if (!b || h < b.h) b = { x, z, h }; } return b; };
  const summits = () => R.worldSummits(1500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
`;

async function runLogic(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'logic: ' + name, pass: !!pass, got: pass && !json ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  if (!(await C.ev(`typeof window.__rb.worldSummits === 'function'`))) { ok('__rb.worldSummits exists', false, 'missing'); return out; }

  // ---- waves, untouched: a meadow drive never comes into the climb
  let r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.start(0); R.manual(true); R.step(30); const m = m0(), y0 = m.pos.y;
    R.hold('KeyW', true); R.hold('KeyA', true); R.step(240); R.hold('KeyA', false); R.step(120); R.hold('KeyW', false); R.step(20); R.render(); R.render();
    return { wave: G.wave, world: G.world, grade: m.grade, k: m.climbK, climb: m.climb, slope: G.humans[0].rig.slope, feetClimb: m.feet.climb, moved: Math.hypot(m.pos.x, m.pos.z),
      robots: G.robots.filter((q) => q.climbK !== undefined || q.climb !== undefined).length, summits: W.status().summits.length }; })()`);
  ok('waves: a meadow drive never comes into the climb (no grade, no clamber, no camera lift, no summit)', r.wave === 1 && !r.world && r.grade === undefined && r.k === undefined && r.climb === undefined && r.slope === undefined && r.feetClimb === undefined && r.moved > 5 && r.robots === 0 && r.summits === 0, r);

  // ---- a world run (a fresh page, as a run starts)
  await C.ev(`localStorage.clear()`); await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.world(true); R.start(0); R.manual(true); R.step(2); window.__k0 = keys(); window.__r0 = Object.keys(rec() || {}).sort();
    const all = summits(), bad = [];
    for (const s of all) {
      // the highest ground in its chunk (the drawn ground, on its 4 m grid), and not on the chunk's edge
      let top = -1e9, n = R.WORLD.seg; for (let a = 0; a <= n; a++) for (let b = 0; b <= n; b++) top = Math.max(top, W.h(s.cx * C + a * 4, s.cz * C + b * 4));
      const inside = s.x - s.cx * C >= 4 * WS.edge && (s.cx + 1) * C - s.x >= 4 * WS.edge && s.z - s.cz * C >= 4 * WS.edge && (s.cz + 1) * C - s.z >= 4 * WS.edge;
      if (!(Math.abs(top - s.y) < 1e-3 && inside && s.y >= WS.min && (s.place === 'mountains' || s.place === 'snow') && !W.ringAt(s.cx, s.cz))) bad.push({ s, top, inside });
    }
    // and every mountains / snow chunk whose highest ground is high enough and well inside it has one (out to 1 km)
    let missing = 0, looked = 0; const n = R.WORLD.seg;
    for (let cx = -10; cx < 10; cx++) for (let cz = -10; cz < 10; cz++) {
      let top = -1e9, ti = 0, tj = 0, edge = -1e9;
      for (let a = 0; a <= n; a++) for (let b = 0; b <= n; b++) { const y = W.vert(cx * n + a, cz * n + b), inn = a >= WS.edge && a <= n - WS.edge && b >= WS.edge && b <= n - WS.edge; if (!inn) edge = Math.max(edge, y); else if (y > top) { top = y; ti = a; tj = b; } }
      const pl = W.place(cx * C + ti * 4, cz * C + tj * 4);
      if (top > edge && top >= WS.min && (pl === 'mountains' || pl === 'snow') && !W.ringAt(cx, cz) && !W.cave(cx, cz)) { looked++; if (!W.summitAt(cx, cz)) missing++; }
    }
    return { n: all.length, places: all.reduce((o, q) => (o[q.place] = (o[q.place] || 0) + 1, o), {}), bad: bad.slice(0, 3), nearest: all[0], looked, missing }; })()`);
  ok(`summits: ${r.n} within 1.5 km (${JSON.stringify(r.places)}), each the highest ground in its chunk, well inside it, at least 24 m up, on a mountain or snowy mountain`, r.n >= 20 && r.bad.length === 0 && r.places.mountains > 0 && r.places.snow > 0, r);
  ok(`every high enough mountain / snow top within 1 km has its summit (${r.looked} looked at)`, r.looked > 0 && r.missing === 0, r);
  ok(`the nearest summit is near the start (${Math.round(Math.hypot(r.nearest?.x, r.nearest?.z))} m off, ${r.nearest?.y} m up)`, r.nearest && Math.hypot(r.nearest.x, r.nearest.z) < 400, r.nearest);

  // the same summits after the chunks go and come back; loaded, each with its flag (red, low on the pole) and beacon
  r = await C.ev(String.raw`(() => { ${H} const s = summits()[0]; R.worldGo(s.x + 40, s.z + 40); calm(); R.step(2);
    const sig = () => JSON.stringify(W.status().summits.map((q) => [q.key, q.x, q.z, q.y]).sort());
    const a = sig(), st = W.status().summits.find((q) => q.key === s.cx + ',' + s.cz); R.worldGo(s.x + 3000, s.z); W.sweep(); R.worldGo(s.x + 40, s.z + 40); reload(); R.step(2);
    return { same: a === sig(), n: W.status().summits.length, st, ground: R.worldAt(s.x, s.z).h, y: s.y }; })()`);
  ok(`the same summits after the chunks go and come back (${r.n} loaded); the nearest one's flag red and low, its beacon on, at the top of the ground`, r.same && r.n > 0 && r.st && !r.st.up && r.st.beacon && r.st.flagY < 2 && Math.abs(r.ground - r.y) < 1e-3, r);

  // ---- the climb: from the nearest summit's foot to its flag, the drive key held
  r = await C.ev(String.raw`(() => { ${H} const s = summits()[0], f = foot(s), m = m0(), key = s.cx + ',' + s.cz, up0 = W.status().summitsUp;
    pose(f.x, f.z, s.x, s.z); calm(); R.step(2); m.feet.climb = 0;
    R.hold('KeyW', true); let i, minK = 9, maxOn = 0, steep = 0, stuck = 0, last = { x: m.pos.x, z: m.pos.z, y: m.pos.y }, upAt = -1, steepK = [], lean = 0;
    for (i = 0; i < 4000 && upAt < 0; i++) {
      head(s.x, s.z); R.step(1); calm();
      if (m.speed > 1 && m.grade > 0) minK = Math.min(minK, m.climbK);
      if (m.grade > WC.steep + 0.1 && m.speed > 1) { steep++; if (steepK.length < 400) steepK.push(m.climbK); }
      maxOn = Math.max(maxOn, m.climb);
      if (m.climb > 0.99 && m.model) { R.render(); lean = Math.min(lean, m.model.body.rotation.x); }
      if (i % 60 === 59) { if (Math.hypot(m.pos.x - last.x, m.pos.z - last.z) < 0.5) stuck++; last = { x: m.pos.x, z: m.pos.z, y: m.pos.y }; }
      if (W.status().summitsUp > up0) upAt = i;
    }
    R.hold('KeyW', false);
    const st0 = W.status().summits.find((q) => q.key === key); R.step(120); const st = W.status().summits.find((q) => q.key === key);
    // it stays climbed: back down and up again changes nothing
    R.teleport(0, f.x, f.z); R.step(5); R.teleport(0, s.x + 2, s.z); R.step(5);
    return { s, f, upAt, minK, maxOn, steep, stuck, feet: m.feet.climb, thud: m.feet.thud, lean, st0, st, up: W.status().summitsUp - up0, sk: steepK.length ? Math.max(...steepK) : null }; })()`);
  ok(`a climb from a mountain's foot (${r.f?.h?.toFixed?.(1)} m) to its summit (${r.s?.y} m), the drive key held: there in ${r.upAt} ticks, never stuck`, r.upAt > 0 && r.stuck <= 2, r);
  ok(`up the slope it's slower, but never below the floor (slowest × ${r.minK?.toFixed?.(2)}; floor ${0.45})`, r.minK < 0.8 && r.minK >= 0.45 - 1e-9 && r.sk < 1, r);
  ok(`on the steep stretches (${r.steep} ticks) it clambers: leaning in (${r.lean?.toFixed?.(2)} rad) with the clamber footfall (${r.feet} of ${r.thud})`, r.steep > 30 && r.maxOn > 0.99 && r.lean < -0.25 && r.feet > 3, r);
  ok('at the top the flag goes up the pole, gold, its beacon off; the summit counted once and stays climbed', r.st0?.up && r.st?.up && r.st.lift === 1 && r.st.flagY > 5 && !r.st.beacon && r.up === 1, { st0: r.st0, st: r.st, up: r.up });

  // ---- flat ground: the walk as it was; downhill: a little faster
  r = await C.ev(String.raw`(() => { ${H} const m = m0(); pose(0, 0, 0, -100); calm(); R.hold('KeyW', true); R.step(60);
    const flat = { k: m.climbK, on: m.climb, grade: m.grade }; const p0 = { x: m.pos.x, z: m.pos.z }; R.step(30); const flatD = Math.hypot(m.pos.x - p0.x, m.pos.z - p0.z); R.hold('KeyW', false); R.step(30);
    // down from the summit, the lowest way
    const s = summits()[0], f = foot(s); pose(s.x + (f.x - s.x) * 0.25, s.z + (f.z - s.z) * 0.25, f.x, f.z); calm(); R.hold('KeyW', true);
    let maxK = 0, down = 0, onDown = 0; for (let i = 0; i < 240; i++) { head(f.x, f.z); R.step(1); calm(); if (m.speed > 1 && m.grade < -0.2) { down++; maxK = Math.max(maxK, m.climbK); onDown = Math.max(onDown, m.climb); } }
    R.hold('KeyW', false); R.step(30);
    return { flat, flatD, top: R.MECH?.topSpeed, maxK, down, onDown }; })()`);
  ok(`on the flat the walk is as it was (× ${r.flat.k}, no clamber; ${r.flatD.toFixed(2)} m in 0.5 s)`, r.flat.k === 1 && r.flat.on === 0 && Math.abs(r.flat.grade) < 0.02, r);
  ok(`downhill it goes a little faster (× ${r.maxK.toFixed(2)}, at most ${1.15}), and doesn't clamber`, r.down > 20 && r.maxK > 1.05 && r.maxK <= 1.15 + 1e-9 && r.onDown < 0.01, r);

  // ---- the steepest slope near the start: the mech still gets up it
  r = await C.ev(String.raw`(() => { ${H} const m = m0(); let b = null;
    for (const s of summits().slice(0, 6)) for (let a = 0; a < 24; a++) for (let d = 6; d < 60; d += 3) { const x = s.x + Math.cos(a / 24 * 6.283) * d, z = s.z + Math.sin(a / 24 * 6.283) * d, dx = Math.cos(a / 24 * 6.283), dz = Math.sin(a / 24 * 6.283);
      const g = (W.h(x - dx * 2, z - dz * 2) - W.h(x + dx * 2, z + dz * 2)) / 4; if (!b || g > b.g) b = { x, z, g, tx: x - dx * 50, tz: z - dz * 50 }; }
    // clear what stands on it (a tree or a rock would stop any mech; this is about the slope)
    pose(b.x + (b.x - b.tx) * 0.06, b.z + (b.z - b.tz) * 0.06, b.tx, b.tz); calm(); const y0 = m.pos.y, near = R.obstacles ? null : null;
    const saved = []; for (const ch of W.chunks.values()) for (const o of ch.obs) if (Math.hypot(o.x - b.x, o.z - b.z) < 20) { saved.push([o, o.r]); o.r = 0; }
    R.hold('KeyW', true); let minK = 9; for (let i = 0; i < 180; i++) { head(b.tx, b.tz); R.step(1); calm(); if (m.speed > 1) minK = Math.min(minK, m.climbK); } R.hold('KeyW', false);
    for (const [o, rr] of saved) o.r = rr;
    return { g: b.g, deg: Math.atan(b.g) * 180 / Math.PI, rose: m.pos.y - y0, minK }; })()`);
  ok(`the steepest slope found (${r.deg.toFixed(0)}°): the mech still climbs it (up ${r.rose.toFixed(1)} m in 3 s, × ${r.minK.toFixed(2)} at the slowest)`, r.g > 1 && r.rose > 3 && r.minK >= 0.45 - 1e-9, r);

  // ---- a jump on a slope (spring legs): in the air the slope changes nothing; it lands back on the ground
  r = await C.ev(String.raw`(() => { ${H} const m = m0(), s = summits()[0], f = foot(s); m.upg = { ...(m.upg || {}), spring: 1 };
    pose(s.x + (f.x - s.x) * 0.5, s.z + (f.z - s.z) * 0.5, s.x, s.z); calm(); R.hold('KeyW', true); R.step(30);
    const j = R.jump(0); let airK = [], landed = -1; for (let i = 0; i < 240 && landed < 0; i++) { head(s.x, s.z); R.step(1); calm(); if (m.hop) airK.push(m.climbK); else if (i > 2) landed = i; }
    R.step(5); R.hold('KeyW', false); const onGround = Math.abs(m.pos.y - W.h(m.pos.x, m.pos.z)) < 1e-6;
    return { ok: j.ok, why: j.why, air: airK.length, airAll1: airK.every((k) => k === 1), landed, onGround, jumps: m.jumps }; })()`);
  ok(`a jump on a slope: in the air the slope changes nothing (${r.air} ticks × 1), it lands back on the ground`, r.ok && r.air > 5 && r.airAll1 && r.landed > 0 && r.onGround, r);

  // ---- the camera: coming down, never under the ground between it and the mech; going up, looking over the slope
  r = await C.ev(String.raw`(() => { ${H} const m = m0(), h = G.humans[0], s = summits()[0], f = foot(s), V = h.rig.cam.position.constructor;
    const below = () => { const c = h.rig.cam.position, t = h.rig.target; let worst = 1e9; for (let k = 0; k <= 10; k++) { const u = k / 10, x = c.x + (t.x - c.x) * u, z = c.z + (t.z - c.z) * u, y = c.y + (t.y - c.y) * u; worst = Math.min(worst, y - W.h(x, z)); } return worst; };
    const ahead = () => { const d = new V(); h.rig.cam.getWorldDirection(d); const c = h.rig.cam.position; let hit = -1; for (let k = 1; k <= 40; k++) { const x = c.x + d.x * k, z = c.z + d.z * k, y = c.y + d.y * k; if (y < W.h(x, z)) { hit = k; break; } } return hit; };
    // down: from near the top, facing down the slope (the hill behind the mech)
    pose(s.x + (f.x - s.x) * 0.15, s.z + (f.z - s.z) * 0.15, f.x, f.z); calm(); h.rig.snap = true; R.hold('KeyW', true);
    let worstDown = 1e9; for (let i = 0; i < 200; i++) { head(f.x, f.z); R.step(1); calm(); R.render(); worstDown = Math.min(worstDown, below()); }
    // up: from the foot, facing up (the view must not run into the hill just ahead)
    pose(s.x + (f.x - s.x) * 0.7, s.z + (f.z - s.z) * 0.7, s.x, s.z); calm(); h.rig.snap = true;
    let worstUp = 1e9, intoHill = 0, n = 0; for (let i = 0; i < 200; i++) { head(s.x, s.z); R.step(1); calm(); R.render(); worstUp = Math.min(worstUp, below()); const a = ahead(); n++; if (a > 0 && a < 12) intoHill++; }
    R.hold('KeyW', false); R.step(10);
    return { worstDown, worstUp, intoHill, n }; })()`);
  ok(`the camera: never under the ground between it and the mech, coming down (${r.worstDown.toFixed(2)} m clear at the closest) or going up (${r.worstUp.toFixed(2)} m)`, r.worstDown > 0.5 && r.worstUp > 0.5, r);
  ok(`going up, the view looks over the slope, not into the hill (into it within 12 m on ${r.intoHill} of ${r.n} frames)`, r.intoHill === 0, r);

  // ---- the world's robots move as before: they never come into the climb
  r = await C.ev(String.raw`(() => { ${H} // somewhere new (robots come with its chunks), on the mountains: the robots there walk the slopes and none comes into it
    const ss = summits(); let robots = 0, moved = 0, touched = 0;
    for (const s of ss.slice(3, 12)) { R.worldGo(s.x + 30, s.z + 30); const m = m0(); m.health = m.maxHealth; const near = G.robots.filter((q) => q.wkey && q.state !== 'glitched' ? true : q.wkey).map((q) => [q, q.pos.x, q.pos.z]);
      for (let i = 0; i < 120; i++) { R.step(1); m0().health = m0().maxHealth; }
      robots += near.length; moved += near.filter(([q, x, z]) => Math.hypot(q.pos.x - x, q.pos.z - z) > 0.5).length;
      touched += G.robots.filter((q) => q.climbK !== undefined || q.climb !== undefined || q.grade !== undefined).length; if (robots >= 6 && moved >= 2) break; }
    return { robots, moved, touched }; })()`);
  ok(`the world's robots move as before: none comes into the climb (${r.robots} robots on mountains, ${r.moved} seen walking)`, r.robots > 0 && r.moved > 0 && r.touched === 0, r);

  // ---- saves
  r = await C.ev(String.raw`(() => { ${H} return { k0: window.__k0, k1: keys(), r0: window.__r0, r1: Object.keys(rec() || {}).sort() }; })()`);
  ok('the storage keys the same, nothing new in the record', JSON.stringify(r.k0) === JSON.stringify(r.k1) && r.r0.every((k) => r.r1.includes(k)) && r.r1.every((k) => r.r0.includes(k) || !/climb|summit|mountain/i.test(k)), r);
  return out;
}

async function runTouch(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'touch: ' + name, pass: !!pass, got: pass && !json ? undefined : got }); return !!pass; };
  await C.ev(`localStorage.clear()`).catch(() => {});
  await C.open(844, 390, true);
  await C.ev(`(() => { const R = window.__rb; R.player('tester'); R.world(true); R.start(0); R.manual(false); return true; })()`);
  // on the steep side of the nearest summit, facing up it, the drive held (the game's own loop running)
  const r = await C.ev(String.raw`(() => { ${H} R.manual(true); const s = summits()[0], f = foot(s); let b = null;
    for (let u = 0.15; u < 0.9; u += 0.05) { const x = s.x + (f.x - s.x) * u, z = s.z + (f.z - s.z) * u, d = Math.hypot(f.x - s.x, f.z - s.z), g = (W.h(x - (f.x - s.x) / d * 2, z - (f.z - s.z) / d * 2) - W.h(x + (f.x - s.x) / d * 2, z + (f.z - s.z) / d * 2)) / 4; if (!b || g > b.g) b = { x, z, g }; }
    pose(b.x, b.z, s.x, s.z); calm(); R.step(2); R.hold('KeyW', true); window.__climbS = s; R.manual(false); return { g: b.g }; })()`);
  let on = 0;
  for (let i = 0; i < 25 && on < 0.99; i++) { await sleep(100); on = await C.ev(`(() => { const R = window.__rb, s = window.__climbS, m = R.Game.humans[0].mech, hd = Math.atan2(-(s.x - m.pos.x), -(s.z - m.pos.z)); m.legHeading = hd; m.torsoYaw = hd; m.input.aimYaw = hd; return m.climb || 0; })()`); }
  const n0 = await C.ev(`[...document.querySelectorAll('.tp-btn:not(.tp-off):not(.tp-pause)')].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none').length`);
  await C.ev(`window.__rb.hold('KeyW', false)`);
  ok(`player 1 clambering up a slope (grade ${r.g?.toFixed?.(2)}; clamber ${on.toFixed(2)}): at most 4 touch buttons (${n0})`, on > 0.9 && n0 <= 4, { r, on, n0 });
  const doc = await C.ev(`document.documentElement.scrollWidth - innerWidth`);
  ok('no sideways scroll', doc <= 0, doc);
  return out;
}


async function main() {
  const all = []; const unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now();
    try {
      const C = await connect(S);
      const res = run === 'logic' ? await runLogic(C) : await runTouch(C);
      if (C.errs.length) res.push({ name: run + ': no page errors', pass: false, got: C.errs.slice(0, 10) });
      else res.push({ name: run + ': no page errors', pass: true });
      all.push(...res);
      const bad = res.filter((r) => !r.pass);
      if (!json) {
        console.log(`${run}: ${res.length - bad.length}/${res.length} pass  (${((Date.now() - t0) / 1000).toFixed(1)} s)${bad.length ? '  FAIL' : ''}`);
        for (const r of bad) console.log('  FAIL ' + r.name + '\n       ' + JSON.stringify(r.got)?.slice(0, 900));
      }
    } catch (e) {
      unfinished.push(run + ': ' + (e?.message || e));
      if (!json) console.log(`${run}: did not finish: ${e?.message || e}`);
    } finally { await kill(S); }
  }
  const failed = all.filter((r) => !r.pass);
  if (json) console.log(JSON.stringify({ url, runs, checks: all, failed: failed.length, unfinished }, null, 1));
  else console.log(`${url}\n${all.length - failed.length}/${all.length} checks pass${unfinished.length ? `, ${unfinished.length} run(s) did not finish` : ''}: ${failed.length || unfinished.length ? 'FAIL' : 'PASS'}`);
  return unfinished.length ? 2 : failed.length ? 1 : 0;
}

let code = 2;
try { code = await main(); }
catch (e) { console.error('check failed: ' + (e?.stack || e?.message || e)); }
finally { await kill(shared); }
process.exit(code);
