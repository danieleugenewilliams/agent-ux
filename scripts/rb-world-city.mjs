#!/usr/bin/env node
// Robot Battle endless world check (#167, slice 4: city insides). The boys' ask: "make it so that you can go inside the
// buildings and add some people in every building"; Q6: the people are friendly and just live there (they wave, robots
// leave them alone).
//
// Each run is its own headless Chrome (muted, not detached, killed with its profile deleted on every way out, as
// scripts/rb-world.mjs does). Made-up profiles only.
//   logic  - at 1280 x 800, through window.__rb:
//            * waves untouched: no tower, no person in a waves run;
//            * every loaded tower has a door on one face (the same after the chunks go and come back) and 2-4 people
//              inside, off its walls and out of the way in from the door; the doorway open, the walls whole elsewhere;
//            * a mech drives in through the door (held keys, the real movement), turns round inside and drives back out;
//              driving at a wall with no door never gets it in;
//            * in (or at the door): the tower goes see-through, its insides and people show; out and away: solid again;
//            * the people: not robots (never in the robots, props or obstacles); they turn to a mech near them and wave,
//              step out of its way and walk home after;
//            * no world robot starts, or roams to, inside a tower; no hidden part, and no repair kit (#191), inside one;
//            * #217: a roaming robot (a Bouncer, a Charger) aimed through a tower from its door never steps in; one put
//              inside walks out of its door and stays out;
//            * #208: on the most sloped tower's block, the ground inside is its floor and a mech driven in stands on it,
//              level with its people; every tower spot out to 40 chunks (ring- and cave-side ones too) level inside,
//              and every ring's floor still flat;
//            * the storage keys the same, nothing new in the record.
//   touch  - at 844 x 390 with touch: a world run, player 1 inside a tower: at most 4 touch buttons, no sideways scroll.
//
// Usage:
//   node scripts/rb-world-city.mjs                     # ./robot-battle.html: logic, then touch
//   node scripts/rb-world-city.mjs --logic             # the logic run only
//   node scripts/rb-world-city.mjs path/or/url.html --json
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-city-'));
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
  const R = window.__rb, G = R.Game, W = R.World, WI = R.WORLD.inside, C = R.WORLD.chunk;
  const reload = () => { W.sweep(); for (const k of [...W.chunks.keys()]) W.unload(k); W.update(true); W.sweep(); };
  const keys = () => Object.keys(localStorage).sort();
  const rec = () => JSON.parse(localStorage.getItem('robotbattle.facts.tester') || 'null');
  const m0 = () => G.humans[0].mech;
  // a city chunk's middle, out in rings of chunks from the start (skip: pass over that many)
  const findCity = (skip = 0) => { for (let rr = 0; rr < 40; rr++) for (let cx = -rr; cx <= rr; cx++) for (let cz = -rr; cz <= rr; cz++) {
    if (Math.max(Math.abs(cx), Math.abs(cz)) !== rr) continue; const x = (cx + 0.5) * C, z = (cz + 0.5) * C;
    if (W.place(x, z) !== 'city' || W.place(x - C / 4, z - C / 4) !== 'city' || W.place(x + C / 4, z + C / 4) !== 'city') continue; if (skip-- > 0) continue; return { x, z }; } return null; };
  // go to the city, its chunks loaded; the world's robots near cleared (so none pushes or shoots the mech in a drive test)
  const goCity = (skip = 0) => { const c = findCity(skip); if (!c) return null; R.worldGo(c.x, c.z); reload(); return c; };
  const calm = () => { for (const r of G.robots) if (r.wkey && r.state === 'glitched') { r.pos.x += 5000; } };
  const tw = (key) => R.worldTowers().find((t) => t.key === key);
  const real = (key) => [...W.chunks.values()].flatMap((ch) => ch.towers).find((t) => t.key === key);
  // player 1 at (x, z) facing along (fx, fz) (forward is (-sin, -cos) of the heading)
  const pose = (x, z, fx, fz) => { R.teleport(0, x, z); const m = m0(), hd = Math.atan2(-fx, -fz); m.legHeading = hd; m.torsoYaw = hd; m.speed = 0; m.turnVel = 0; };
  // where p is in tower t's frame: a across its door, b out towards it
  const loc = (t, x, z) => ({ a: (x - t.x) * -t.door.nz + (z - t.z) * t.door.nx, b: (x - t.x) * t.door.nx + (z - t.z) * t.door.nz });
`;

async function runLogic(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'logic: ' + name, pass: !!pass, got: pass && !json ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  if (!(await C.ev(`typeof window.__rb.worldTowers === 'function'`))) { ok('__rb.worldTowers exists', false, 'missing'); return out; }

  // ---- waves, untouched
  let r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.start(0); R.manual(true); R.step(30); const s = W.status();
    return { wave: G.wave, world: G.world, chunks: s.chunks, towers: s.towers, people: s.people, inTower: s.inTower, robots: G.robots.length }; })()`);
  ok('waves: no tower and no person in a waves run', r.wave === 1 && !r.world && r.chunks === 0 && r.towers === 0 && r.people === 0 && r.inTower === null && r.robots > 0, r);

  // ---- a world run, in a city (a fresh page, as a run starts)
  await C.ev(`localStorage.clear()`); await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.world(true); R.start(0); R.manual(true); R.step(2); window.__k0 = keys(); window.__r0 = Object.keys(rec() || {}).sort();
    const c = goCity(); if (!c) return { none: true }; R.step(2);
    const all = R.worldTowers(), D = WI.door, bad = [];
    for (const t of all) {
      const h = t.w / 2, m = h - WI.edge + 1e-3, P = t.people;
      const n = P.length >= WI.people[0] && P.length <= WI.people[1];
      const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([x, z]) => x === t.door.nx && z === t.door.nz) && Math.abs(Math.abs(t.door.x - t.x) + Math.abs(t.door.z - t.z) - h) < 1e-3;
      const homes = P.map((q) => loc(t, q.home.x, q.home.z));
      const off = homes.every((p) => Math.abs(p.a) <= m && Math.abs(p.b) <= m), lane = homes.every((p) => !(Math.abs(p.a) < D / 2 && p.b > -(h - WI.edge) * 0.3));
      const apart = homes.every((p, i) => homes.every((q, j) => i === j || Math.hypot(p.a - q.a, p.b - q.b) >= 0.99));
      // the doorway open: no wall circle across it (a mech's whole width gets through), the walls whole elsewhere
      const T = real(t.key), obs = W.chunks.get(T.ch.key).obs.filter((o) => Math.abs(o.x - t.x) <= h + 0.01 && Math.abs(o.z - t.z) <= h + 0.01);
      const inGap = obs.filter((o) => { const p = loc(t, o.x, o.z); return p.b > h - 0.01 && Math.abs(p.a) - o.r < D / 2 - 0.01; });
      if (!n || !side || !off || !lane || !apart || inGap.length || !obs.length) bad.push({ key: t.key, n: P.length, side, off, lane, apart, inGap: inGap.length, walls: obs.length });
    }
    const s = W.status();
    return { c, n: all.length, bad: bad.slice(0, 4), people: s.people, sum: all.reduce((k, t) => k + t.people.length, 0), place: s.place, robotsHavePeople: G.robots.some((q) => q.person || q.g?.userData?.person) }; })()`);
  ok(`a city (${r.place}): ${r.n} towers loaded, each with a door on one of its faces and ${WI_PEOPLE()} people inside (${r.sum} in all)`, !r.none && r.n >= 3 && r.bad.length === 0 && r.people === r.sum, r);
  ok('the doorways open (no wall across a door, the walls there everywhere else)', !r.none && r.bad.every((b) => !b.inGap && b.walls), r);

  // the same doors and people after the chunks go and come back
  r = await C.ev(String.raw`(() => { ${H} const sig = () => R.worldTowers().map((t) => [t.key, t.side, t.people.map((q) => [q.home.x, q.home.z])]).sort((a, b) => a[0] < b[0] ? -1 : 1);
    const a = JSON.stringify(sig()); const p = m0().pos, px = p.x, pz = p.z; R.worldGo(px + 3000, pz); W.sweep(); R.worldGo(px, pz); reload(); const b = JSON.stringify(sig());
    return { same: a === b, n: sig().length }; })()`);
  ok(`the same doors and the same people after the chunks go and come back (${r.n} towers)`, r.same && r.n > 0, r);

  // ---- drive in through the door (held keys), turn round inside, drive back out
  r = await C.ev(String.raw`(() => { ${H} calm();
    const t0 = R.worldTowers().find((t) => t.w === 12) || R.worldTowers()[0], key = t0.key, d = t0.door, h = t0.w / 2, m = m0();
    pose(d.x + d.nx * 12, d.z + d.nz * 12, -d.nx, -d.nz); R.step(2);
    let inAt = -1, deep = -1e9, i;
    R.hold('KeyW', true);
    for (i = 0; i < 900 && inAt < 0; i++) { R.step(1); calm(); const p = loc(t0, m.pos.x, m.pos.z); deep = Math.max(deep, h - Math.max(Math.abs(p.a), Math.abs(p.b))); if (W.inTower(m.pos.x, m.pos.z, 2.5) && W.inTower(m.pos.x, m.pos.z, 2.5).key === key && p.b < h - 4) inAt = i; }
    R.step(20); R.hold('KeyW', false); R.step(30);
    const p1 = loc(t0, m.pos.x, m.pos.z), inside = W.status().inTower === key;
    R.render(); R.render(); const s1 = tw(key);
    // turn round: ◀ held until it faces the door
    const facing = () => -Math.sin(m.legHeading) * d.nx + -Math.cos(m.legHeading) * d.nz;
    R.hold('KeyA', true); let turned = -1; for (let k = 0; k < 900 && turned < 0; k++) { R.step(1); calm(); if (facing() > 0.97) turned = k; } R.hold('KeyA', false);
    const p2 = loc(t0, m.pos.x, m.pos.z);
    // drive out
    R.hold('KeyW', true); let outAt = -1, cross = null;
    for (let k = 0; k < 900 && outAt < 0; k++) { R.step(1); calm(); const p = loc(t0, m.pos.x, m.pos.z); if (cross == null && p.b > h) cross = p.a; if (p.b > h + 8) outAt = k; }
    R.hold('KeyW', false); R.step(30);
    // well away, facing the tower (the camera behind): solid again, its insides and people put away
    pose(d.x + d.nx * 18, d.z + d.nz * 18, -d.nx, -d.nz); R.step(5); for (let k = 0; k < 4; k++) R.render(); const s2 = tw(key);
    window.__key = key;
    return { key, w: t0.w, inAt, deep, p1, inside, s1: { inside: s1.inside, ghost: s1.ghost, innerShown: s1.innerShown, panelShown: s1.panelShown, shown: s1.people.map((q) => q.shown) }, turned, p2, outAt, cross,
      s2: { inside: s2.inside, ghost: s2.ghost, innerShown: s2.innerShown, panelShown: s2.panelShown, shown: s2.people.map((q) => q.shown) }, rule: W.inTower(m.pos.x, m.pos.z, -WI.ghost)?.key === key }; })()`);
  ok(`a mech drives in through the door of a ${r.w} m tower with the drive key held (in after ${r.inAt} ticks)`, r.inAt >= 0 && r.inside && r.p1.b < r.w / 2 - 3, r);
  ok('inside, the tower goes see-through: its floor, lamps and lift show, the door panel is put away, its people show', r.s1.inside && r.s1.ghost && r.s1.innerShown && !r.s1.panelShown && r.s1.shown.length && r.s1.shown.every(Boolean), r.s1);
  ok(`it turns round inside (${r.turned} ticks) and drives back out through the door (across it ${r.cross?.toFixed?.(2)} m off its middle)`, r.turned >= 0 && r.outAt >= 0 && r.cross != null && Math.abs(r.cross) < 3.5 && Math.abs(r.p2.a) < r.w / 2 && Math.abs(r.p2.b) < r.w / 2, r);
  ok('out and away: the tower solid again, its insides and people put away, the door panel back', !r.s2.inside && !r.s2.ghost && !r.s2.innerShown && r.s2.panelShown && r.s2.shown.every((v) => !v) && !r.rule, r.s2);

  // ---- a wall with no door: driving at it never gets in (each of the other three faces)
  r = await C.ev(String.raw`(() => { ${H} calm(); const t = tw(window.__key), h = t.w / 2, m = m0(), res = [];
    for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (fx === t.door.nx && fz === t.door.nz) continue;
      pose(t.x + fx * (h + 8), t.z + fz * (h + 8), -fx, -fz); R.step(2);
      let closest = 1e9, got = false; R.hold('KeyW', true);
      for (let k = 0; k < 360; k++) { R.step(1); calm(); const dd = (m.pos.x - t.x) * fx + (m.pos.z - t.z) * fz; closest = Math.min(closest, dd - h); if (W.inTower(m.pos.x, m.pos.z, 0)) got = true; }
      R.hold('KeyW', false); R.step(10); res.push({ f: [fx, fz], closest: +closest.toFixed(2), got });
    }
    return { res, w: t.w }; })()`);
  ok(`driving at each wall with no door never gets in (held ${r.res.length} x 6 s; closest ${Math.min(...r.res.map((q) => q.closest))} m off the face)`, r.res.length === 3 && r.res.every((q) => !q.got && q.closest > 1.5), r);

  // ---- the people: wave at a mech near, step out of its way, walk home after; not robots
  r = await C.ev(String.raw`(() => { ${H} calm(); const t = tw(window.__key), m = m0(), n0 = G.robots.length;
    const tr = real(window.__key);
    // stood just inside the door, facing in
    pose(t.x + t.door.nx * (t.w / 2 - 2.6), t.z + t.door.nz * (t.w / 2 - 2.6), -t.door.nx, -t.door.nz); R.step(90);
    const s = tw(t.key), mp = m.pos;
    const ppl = s.people.map((q) => ({ d: Math.hypot(q.x - mp.x, q.z - mp.z), wave: q.wave, off: Math.abs(Math.atan2(Math.sin(Math.atan2(mp.x - q.x, mp.z - q.z) - q.face), Math.cos(Math.atan2(mp.x - q.x, mp.z - q.z) - q.face))) }));
    const arm = tr.people.map((q) => +q.armR.rotation.z.toFixed(2));
    // not robots: never in the robots, props or obstacles; nothing the aim can lock onto
    const notRobot = tr.people.every((q) => !G.robots.includes(q) && !G.robots.some((b) => b.mesh === q.g || b.group === q.g)) && !R.Props.list.some((p) => tr.people.some((q) => p.mesh === q.g || p.g === q.g))
      && !W.chunks.get(tr.ch.key).obs.some((o) => tr.people.some((q) => Math.hypot(o.x - q.x, o.z - q.z) < 0.01 && o.r < 1));
    // stand on one: it steps out of the way; go: it walks home
    const q = tr.people[0]; pose(q.home.x, q.home.z, -t.door.nx, -t.door.nz); R.step(10);
    const pushed = Math.hypot(q.x - m.pos.x, q.z - m.pos.z), inWalls = Math.abs(q.x - t.x) < t.w / 2 && Math.abs(q.z - t.z) < t.w / 2;
    pose(t.door.x + t.door.nx * 30, t.door.z + t.door.nz * 30, -t.door.nx, -t.door.nz); R.step(900);
    const home = Math.hypot(q.x - q.home.x, q.z - q.home.z), waveAway = tr.people.map((p) => +p.wave.toFixed(2));
    return { ppl, arm, notRobot, pushed: +pushed.toFixed(2), inWalls, home: +home.toFixed(3), waveAway, rob: G.robots.length - n0, mr: R.MECH?.radius ?? 2.3 }; })()`);
  const nearP = r.ppl.filter((q) => q.d < 11), farP = r.ppl.filter((q) => q.d > 12.5);
  ok(`a mech near: the people within ${12} m (${nearP.length}) turn to face it and wave (the right arm up), the others don't`, nearP.length >= 1 && nearP.every((q) => q.wave > 0.95 && q.off < 0.2) && farP.every((q) => q.wave === 0) && r.arm.some((a) => a > 1.8), r);
  ok('the people are not robots: never in the robots, props or obstacles', r.notRobot, r);
  ok(`a mech on a person's spot: they step out of its way (${r.pushed} m off its middle), staying inside the walls`, r.pushed >= 2.3 + 0.7 && r.inWalls, r);
  ok(`the mech gone: they walk back home (${r.home} m off) and stop waving`, r.home < 0.05 && r.waveAway.every((v) => v === 0), r);

  // ---- robots leave them alone: no world robot starts or roams inside a tower; no hidden part (nor repair kit, #191) in one
  r = await C.ev(String.raw`(() => { ${H} const res = { starts: [], roams: 0, roamBad: [], parts: [], kits: [], kitsSeen: 0 };
    for (let k = 0; k < 4; k++) { if (!goCity(k)) break; R.step(2);
      for (const q of G.robots) if (q.wkey && W.inTower(q.pos.x, q.pos.z, -1)) res.starts.push({ id: q.id, type: q.type, x: q.pos.x, z: q.pos.z });
      for (const p of W.status().parts) if (W.inTower(p.x, p.z, 0)) res.parts.push(p);
      for (const q of W.status().kits) { res.kitsSeen++; if (W.inTower(q.x, q.z, 0)) res.kits.push(q); }
      for (const t of R.worldTowers(6)) for (let j = 0; j < 60; j++) { const s = W.roamSpot({ x: t.door.x + t.door.nx * 3, z: t.door.z + t.door.nz * 3 }); res.roams++; if (W.inTower(s.x, s.z, 0)) res.roamBad.push(s); }
    }
    // and in play: a minute of roaming in a city, no robot ends up inside one
    goCity(); for (const q of G.robots) if (q.wkey) q.pos.y = q.pos.y; R.teleport(0, m0().pos.x, m0().pos.z);
    let inside = 0; for (let k = 0; k < 12; k++) { R.step(300); for (const q of G.robots) if (q.wkey && q.state === 'glitched' && !q.target && W.inTower(q.pos.x, q.pos.z, 0)) inside++; G.humans[0].mech.health = G.humans[0].mech.maxHealth || 100; }
    res.inPlay = inside; res.roamBad = res.roamBad.slice(0, 3); return res; })()`);
  ok(`no world robot starts inside a tower, and none roams to a spot in one (${r.roams} roam spots picked next to doors)`, r.starts.length === 0 && r.roamBad.length === 0 && r.roams > 0, r);
  ok('no hidden part is put inside a tower', r.parts.length === 0, r);
  ok(`no repair kit (#191) is put inside a tower (${r.kitsSeen} kits looked at in the cities)`, r.kitsSeen > 0 && r.kits.length === 0, { kits: r.kits.slice(0, 3), kitsSeen: r.kitsSeen });
  ok('a minute of play in the city: no roaming robot inside a tower', r.inPlay === 0, r);

  // ---- #217: a roaming robot doesn't wander in through a door, and one inside comes back out. Placed, not left to chance:
  // the nearest tower, player 1 60 m behind it (past every robot's notice, its chunk still loaded), the other robots
  // cleared; a Bouncer (the one seen stuck) and a Charger each roaming with its waypoint straight through the tower from
  // just outside its door (20 s: never inside), then each put by the back wall heading for a spot behind it (out within 30 s
  // and staying out)
  r = await C.ev(String.raw`(() => { ${H} goCity(); calm(); R.step(2); const t = R.worldTowers(1)[0], half = t.w / 2, nx = t.door.nx, nz = t.door.nz;
    const at = (b) => ({ x: t.x + nx * b, z: t.z + nz * b }), behind = at(-(half + 8)), me = at(-(half + 60));
    pose(me.x, me.z, nx, nz); R.step(2);
    const res = { key: t.key, walk: [], out: [] };
    const put = (type, p) => { const s = R.spawn(type, p.x + 30, p.z + 30); const q = G.robots.find((o) => o.id === s.id); q.pos.x = p.x; q.pos.z = p.z; q.ai.mode = 'roam'; q.ai.alert = 0; q.ai.wp = { ...behind }; q.ai.wpT = 1e9; q.home = { ...behind }; return q; };
    const away = (q) => { q.pos.x += 5000; };
    for (const type of ['bouncer', 'charger']) {
      let q = put(type, at(half + 3)), inside = 0, minB = Infinity;
      for (let k = 0; k < 240; k++) { R.step(5); if (W.inTower(q.pos.x, q.pos.z, 0)) inside++; minB = Math.min(minB, (q.pos.x - t.x) * nx + (q.pos.z - t.z) * nz); }
      res.walk.push({ type, inside, minB: +minB.toFixed(2), mode: q.ai.mode, loaded: !!real(t.key) }); away(q);
      q = put(type, at(-(half - 3)));
      let outAt = null, back = 0;
      for (let k = 0; k < 420; k++) { R.step(5); const inT = !!W.inTower(q.pos.x, q.pos.z, 0); if (!inT && outAt == null) outAt = +((k + 1) * 5 / 60).toFixed(1); else if (inT && outAt != null) back++; }
      res.out.push({ type, outAt, back, mode: q.ai.mode, loaded: !!real(t.key) }); away(q);
    }
    return res; })()`);
  ok(`#217: a roaming Bouncer and Charger aimed straight through a tower from its door never step inside it (${r.walk.map((w) => w.type + ' ' + w.inside + ' samples in').join(', ')})`, r.walk.length === 2 && r.walk.every((w) => w.inside === 0 && w.mode === 'roam' && w.loaded), r);
  ok(`#217: a roaming Bouncer and Charger put inside a tower come out of its door (${r.out.map((w) => w.type + ' at ' + w.outAt + ' s').join(', ')}) and stay out`, r.out.length === 2 && r.out.every((w) => w.outAt != null && w.outAt <= 30 && w.back === 0 && w.loaded), r);

  // ---- #208: on a sloped city block the mech stands on the floor the people stand on (no floating, no sinking). The
  // tower with the most slope under it (its hillside before flattening, World.baseH, over its walls) of the cities near
  // the start; the ground the mech walks on (World.h) across its inside against its floor; then a drive in on held keys
  r = await C.ev(String.raw`(() => { ${H} let best = null;
    for (let k = 0; k < 12; k++) { if (!goCity(k)) break;
      for (const t of [...W.chunks.values()].flatMap((ch) => ch.towers)) {
        const h = t.w / 2; let lo = 1e9, hi = -1e9;
        for (let a = -h; a <= h + 1e-6; a += h / 5) for (let b = -h; b <= h + 1e-6; b += h / 5) { const y = W.baseH(t.x + a, t.z + b); lo = Math.min(lo, y); hi = Math.max(hi, y); }
        if (!best || hi - lo > best.spread) best = { k, key: t.key, w: t.w, spread: hi - lo };
      } }
    if (!best) return { none: true };
    goCity(best.k); calm(); const T = real(best.key), t = tw(best.key), h = t.w / 2, m = m0();
    const floor = T.inner.position.y + 0.05;   // (the floor's top: its slab's middle 0.15 down, 0.4 thick)
    // the ground across the inside, against the floor
    let off = 0; for (let a = -h; a <= h + 1e-6; a += h / 8) for (let b = -h; b <= h + 1e-6; b += h / 8) off = Math.max(off, Math.abs(W.h(t.x + a, t.z + b) - floor));
    // drive in through the door
    pose(t.door.x + t.door.nx * 12, t.door.z + t.door.nz * 12, -t.door.nx, -t.door.nz); R.step(2);
    let inTicks = 0, mOff = 0; R.hold('KeyW', true);
    for (let i = 0; i < 600; i++) { R.step(1); calm(); if (W.inTower(m.pos.x, m.pos.z, 2.5)?.key === best.key) { inTicks++; mOff = Math.max(mOff, Math.abs(m.pos.y - floor)); if (inTicks > 40) break; } }
    R.hold('KeyW', false); R.step(5);
    // the people's feet on the floor too (from where they're drawn: a waving one bobs up to 6 cm)
    const feet = T.people.map((q) => +(q.g.position.y - floor).toFixed(3));
    return { key: best.key, w: best.w, spread: +best.spread.toFixed(2), off: +off.toFixed(3), feet, inTicks, mOff: +mOff.toFixed(3) }; })()`);
  ok(`#208: a tower on a sloped block (${r.spread} m of hillside across its ${r.w} m): the ground inside is its floor (${r.off} m off at most)`, !r.none && r.spread > 1 && r.off <= 0.06, r);
  ok(`#208: driven in, the mech stands on the floor its people stand on (${r.mOff} m off over ${r.inTicks} ticks inside)`, !r.none && r.inTicks > 20 && r.mOff <= 0.06 && r.feet.length && r.feet.every((f) => f >= -0.06 && f <= 0.12), r);

  // ---- #208: every tower spot out to 40 chunks each way, the ring-side ones too (a ring's or a cave's blend once pulled
  // the corners of a tower's inside off its floor, by up to 3 m): the ground across the inside (a 13 x 13 grid) against
  // the ground at its middle, where its floor and people are drawn; and every ring's 26 m floor still flat (the ground's
  // formula across all of it; the drawn ground, 4 m triangles, inside a grid cell's diagonal of its edge)
  r = await C.ev(String.raw`(() => { ${H} const N = 40, Gr = R.WORLD.rings, Kc = R.WORLD.cave; let spots = 0, bad = [], worst = 0, nearRing = 0, nearCave = 0, rings = 0, ringOff = 0;
    for (let cx = -N; cx <= N; cx++) for (let cz = -N; cz <= N; cz++) {
      const g = W.ringAt(cx, cz), cv = W.cave(cx, cz);
      if (g) { rings++; for (let a = -Gr.flat; a <= Gr.flat; a += Gr.flat / 6) for (let b = -Gr.flat; b <= Gr.flat; b += Gr.flat / 6) { const d = Math.hypot(a, b); if (d <= Gr.flat) ringOff = Math.max(ringOff, Math.abs(W.rawH(g.x + a, g.z + b) - g.y), d <= Gr.flat - 6 ? Math.abs(W.h(g.x + a, g.z + b) - g.y) : 0); } }
      for (const p of W.cityPlan(cx, cz)) { if (!p.pad) continue; spots++;
        if (g && Math.hypot(p.x - g.x, p.z - g.z) < 70) nearRing++;
        if (cv && Math.hypot(p.x - cv.mx, p.z - cv.mz) < 75) nearCave++;
        const y0 = W.h(p.x, p.z), h = p.w / 2; let off = 0;
        for (let a = -h; a <= h + 1e-6; a += h / 6) for (let b = -h; b <= h + 1e-6; b += h / 6) off = Math.max(off, Math.abs(W.h(p.x + a, p.z + b) - y0));
        worst = Math.max(worst, off); if (off > 0.06) bad.push({ cx, cz, x: +p.x.toFixed(1), z: +p.z.toFixed(1), w: p.w, off: +off.toFixed(2) });
      } }
    return { spots, nearRing, nearCave, rings, ringOff: +ringOff.toFixed(3), worst: +worst.toFixed(3), bad: bad.slice(0, 5), nBad: bad.length }; })()`);
  ok(`#208: every tower spot in 81 x 81 chunks (${r.spots}, ${r.nearRing} within 70 m of a ring, ${r.nearCave} within 75 m of a cave): the ground inside is level with its middle (${r.worst} m off at most)`, r.spots > 1000 && r.nearRing > 0 && r.nBad === 0, r);
  ok(`#208: every ring's floor in those chunks (${r.rings}) is still flat (${r.ringOff} m off at most)`, r.rings > 0 && r.ringOff <= 0.06, r);

  // ---- saves
  r = await C.ev(String.raw`(() => { ${H} return { k0: window.__k0, k1: keys(), r0: window.__r0, r1: Object.keys(rec() || {}).sort() }; })()`);
  ok('the storage keys the same, nothing new in the record', JSON.stringify(r.k0) === JSON.stringify(r.k1) && r.r0.every((k) => r.r1.includes(k)) && r.r1.every((k) => r.r0.includes(k) || !/tower|people|inside|city/i.test(k)), r);
  return out;
}
const WI_PEOPLE = () => '2-4';

async function runTouch(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'touch: ' + name, pass: !!pass, got: pass && !json ? undefined : got }); return !!pass; };
  await C.ev(`localStorage.clear()`).catch(() => {});
  await C.open(844, 390, true);
  await C.ev(`(() => { const R = window.__rb; R.player('tester'); R.world(true); R.start(0); R.manual(false); return true; })()`);
  let r = await C.ev(String.raw`(() => { ${H} R.manual(true); const c = goCity(); if (!c) return { none: true }; calm(); const t = R.worldTowers()[0];
    pose(t.x + t.door.nx * (t.w / 2 - 3), t.z + t.door.nz * (t.w / 2 - 3), -t.door.nx, -t.door.nz); R.step(5); R.manual(false); return { key: t.key }; })()`);
  await new Promise((res) => setTimeout(res, 1200));
  const s = await C.ev(`(() => { const R = window.__rb, W = R.World, t = R.worldTowers().find((q) => q.key === ${JSON.stringify(r.key || '')}); return { inTower: W.status().inTower, ghost: t?.ghost, shown: t?.people.map((q) => q.shown) }; })()`);
  const n0 = await C.ev(`[...document.querySelectorAll('.tp-btn:not(.tp-off):not(.tp-pause)')].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none').length`);
  ok(`player 1 inside a tower (it see-through, its people shown): at most 4 touch buttons (${n0})`, !r.none && s.inTower === r.key && s.ghost && s.shown?.every(Boolean) && n0 <= 4, { r, s, n0 });
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
