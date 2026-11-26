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
//            * #208 door (Daniel's pick A): the doorway, measured between the wall circles, is 11 m on a 16 m or 20 m
//              tower and 9.8 m on a 12 m one, with no wall circle outside the tower; the biggest world robot (the
//              Knight, 7.8 m across) fits through it; and a mech driven straight in 2 m off the door's middle, on held
//              keys, goes in on every size of tower without touching the wall;
//            * #228: every drive-in starts with player 1 up and whole (an earlier check could leave it powered down, its
//              controls dead for the whole drive); knocked out cold just before the sloped tower's drive, it still gets in;
//            * #217: a Charger and a Bouncer inside a tower that notice a player behind its back wall come out of its
//              door rather than push on the wall;
//            * #217 with #208's door widths: on a 12 m tower (9.8 m door) wayOut sends a robot straight out only when
//              its body clears the real doorway; a Bouncer and a Charger put beside the door by a side wall come out
//              through it and stay out, never touching the doorway's corner wall circles;
//            * #231: a Bouncer chasing a player who stands still behind a 12, 16 or 20 m tower for 60 s, 10, 14 or 20 m
//              back, goes round the tower (in at its door at most once, never a hop in), not in and out of the doorway or
//              round a corner;
//            * #236: a hop keeps out of the towers: a Bouncer's spring off player 1's head behind a tower that would come
//              down inside it stops at the wall; and a roaming Bouncer at a door, a Charger overlapping it from outside,
//              is never pushed in by separate();
//            * #236 (A1): a Bouncer at a door that isn't roaming (landing, crouched, stalking) is never pushed or shoved in,
//              and one hopping on the doorstep doesn't stomp player 1 through the doorway;
//            * #236 (Daniel's pick A1): a Bouncer chasing player 1, who stands 3 m inside a 12 or 16 m tower's door, never
//              lands inside and never stomps them in 30 s (its hops stop at the wall);
//            * #236: once player 1 is outside again that Bouncer stomps them; and one on a doorstep facing in, player 1
//              outside (in front, to a side, behind the tower), never freezes there and gets to them; nor does one
//              beside a wall, player 1 on that side of the tower;
//            * #244: a downed Bouncer at a door is never pushed or shoved in, and after it reboots it stays out; a Bouncer
//              whose hops at player 1 inside stop at the wall over Chargers doesn't bounce on their heads in place (5 at
//              most in a chain); and the 10 s door check puts the Bouncer back at the door (keepOut) itself, not by chance;
//            * #222: the Copier's saucer never passes through a tower, coming in over one to a player behind it or to a
//              player inside it (in, scan, print and out); dropSpot's fallback, every spot round the player blocked and a
//              tower right ahead, is outside every tower;
//            * #233: dropSpot's last fallback, every try round the player failed and the player inside a 12 m tower off its
//              door's line, is outside every tower; and so it is, 4 m clear, for a player inside any loaded tower;
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
  // #228: player 1 up and whole before a drive-in. A drive is 600 ticks (10 s), and a mech an earlier check left powered
  // down sits out PLAYER.downTime (8 s) with its controls dead, so it never got in (tower 5,4:t10,8, inTicks 0). Rebooted
  // through the game's own path (its down clock run out, one step), then mended to full; returns how it was before
  const ready = () => { const m = m0(), pre = { state: m.state, hp: Math.round(m.health), downT: +(m.downT || 0).toFixed(2) };
    if (m.state === 'down') { m.downT = 0; R.step(1); }
    for (const a in m.damage) m.damage[a] = 0; m.health = m.maxHealth; m.hop = null; m.push.set(0, 0, 0); return pre; };
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
    const all = R.worldTowers(), bad = [];
    for (const t of all) {
      const D = t.door.width, h = t.w / 2, m = h - WI.edge + 1e-3, P = t.people;
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
    const pre = ready(); pose(d.x + d.nx * 12, d.z + d.nz * 12, -d.nx, -d.nz); R.step(2);
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
    return { key, w: t0.w, pre, inAt, deep, p1, inside, s1: { inside: s1.inside, ghost: s1.ghost, innerShown: s1.innerShown, panelShown: s1.panelShown, shown: s1.people.map((q) => q.shown) }, turned, p2, outAt, cross,
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
    pose(me.x, me.z, nx, nz); R.step(2); const p0 = { x: m0().pos.x, z: m0().pos.z };
    const res = { key: t.key, walk: [], out: [] };
    // (held each step: world robots from chunks that load after the pose cleared again, and player 1's health kept full,
    // as a robot that comes out may go for it and leave it too battered for the drive-in checks after; how far player 1
    // has moved is reported, and a walk-in robot that came for player 1 fails as that, not as a robot stepping in)
    const hold = () => { calm(); m0().health = m0().maxHealth || 100; return Math.hypot(m0().pos.x - p0.x, m0().pos.z - p0.z); };
    const put = (type, p) => { const s = R.spawn(type, p.x + 30, p.z + 30); const q = G.robots.find((o) => o.id === s.id); q.pos.x = p.x; q.pos.z = p.z; q.ai.mode = 'roam'; q.ai.alert = 0; q.ai.wp = { ...behind }; q.ai.wpT = 1e9; q.home = { ...behind }; return q; };
    const away = (q) => { q.pos.x += 5000; };
    for (const type of ['bouncer', 'charger']) {
      let q = put(type, at(half + 3)), inside = 0, minB = Infinity, moved = 0, engagedT = 0;
      for (let k = 0; k < 240; k++) { R.step(5); moved = Math.max(moved, hold()); if (q.ai.mode !== 'roam') engagedT++; if (W.inTower(q.pos.x, q.pos.z, 0)) inside++; minB = Math.min(minB, (q.pos.x - t.x) * nx + (q.pos.z - t.z) * nz); }
      res.walk.push({ type, inside, minB: +minB.toFixed(2), mode: q.ai.mode, engagedT, moved: +moved.toFixed(2), loaded: !!real(t.key) }); away(q);
      q = put(type, at(-(half - 3)));
      let outAt = null, back = 0;
      for (let k = 0; k < 420; k++) { R.step(5); hold(); const inT = !!W.inTower(q.pos.x, q.pos.z, 0); if (!inT && outAt == null) outAt = +((k + 1) * 5 / 60).toFixed(1); else if (inT && outAt != null) back++; }
      res.out.push({ type, outAt, back, mode: q.ai.mode, loaded: !!real(t.key) }); away(q);
    }
    return res; })()`);
  ok(`#217: a roaming Bouncer and Charger aimed straight through a tower from its door never step inside it (${r.walk.map((w) => w.type + ' ' + w.inside + ' samples in').join(', ')})`, r.walk.length === 2 && r.walk.every((w) => w.inside === 0 && w.mode === 'roam' && w.engagedT === 0 && w.loaded), r);
  ok(`#217: a roaming Bouncer and Charger put inside a tower come out of its door (${r.out.map((w) => w.type + ' at ' + w.outAt + ' s').join(', ')}) and stay out`, r.out.length === 2 && r.out.every((w) => w.outAt != null && w.outAt <= 30 && w.back === 0 && w.loaded), r);

  // ---- #236 (Daniel's pick A): a hop keeps out of the towers. The way #238's trace saw a Bouncer get in: it stomped player 1
  // behind a tower and the 9 m spring off their head carried it over the back wall and down inside (hops had no wall
  // checks). Forced here through the game's own path: player 1 4 m out from the back wall of a 12 m tower, a glitched
  // Bouncer 10 m further out on the same line, crouched to hop; Math.random held at 0.5 for the run, so its hop lands on
  // player 1's head (no wild bounce) and the spring goes straight on, 9 m, which is past the back wall (on main it comes
  // down 5 m inside). It must stop at the wall or land outside: never a sample inside the tower, stepped one tick at a time
  r = await C.ev(String.raw`(() => { ${H} goCity(); calm(); R.step(2); const ts = R.worldTowers(), t = ts.find((q) => q.w === 12) || ts[0]; if (!t) return { none: true };
    const half = t.w / 2, nx = t.door.nx, nz = t.door.nz, at = (b) => ({ x: t.x + nx * b, z: t.z + nz * b }), me = at(-(half + 4)), start = at(-(half + 14));
    const rnd = Math.random; Math.random = () => 0.5;
    try {
      pose(me.x, me.z, nx, nz); R.step(2); const p0 = { x: m0().pos.x, z: m0().pos.z };
      const s = R.spawn('bouncer', start.x + 30, start.z + 30), q = G.robots.find((o) => o.id === s.id);
      q.pos.x = start.x; q.pos.z = start.z; q.pos.y = W.h(start.x, start.z); q.legHeading = q.torsoYaw = Math.atan2(nx, nz); q.ai.mode = 'crouch'; q.ai.t = 0.01; q.ai.alert = 0;
      const st0 = q.stomps || 0; let inside = 0, landB = null, wasAir = false, lands = [], moved = 0, hops = 0;
      for (let k = 0; k < 240; k++) { R.step(1); calm(); const m = m0(); m.health = m.maxHealth || 100; moved = Math.max(moved, Math.hypot(m.pos.x - p0.x, m.pos.z - p0.z));
        if (W.inTower(q.pos.x, q.pos.z, 0)?.key === t.key) inside++;
        if (q.air && !wasAir) hops++;
        if (wasAir && !q.air) lands.push(+loc(t, q.pos.x, q.pos.z).b.toFixed(2));
        wasAir = !!q.air; }
      const res = { key: t.key, w: t.w, stomps: (q.stomps || 0) - st0, hopsUp: hops, inside, lands, stops: q.hopStops || 0, moved: +moved.toFixed(2), loaded: !!real(t.key), wallOut: +(half + R.WORLD.inside.wallR).toFixed(2) };
      q.air = null; q.pos.x += 5000; return res;   // (#236: mid-hop, bouncerFly would put it back)
    } finally { Math.random = rnd; } })()`);
  ok(`#236: a Bouncer's spring off player 1's head, 4 m behind a ${r.w} m tower, that would come down inside it stops at the wall or lands outside (${r.stomps} stomps, ${r.hopsUp} times up, ${r.inside} ticks inside; landed at b ${(r.lands || []).join(', ')}, the back wall at -${r.w / 2})`, !r.none && r.loaded && r.stomps >= 1 && r.inside === 0 && r.lands.length >= 1 && r.lands.every((b) => b < -r.w / 2), r);

  // ---- #236: and nothing pushes a roaming robot in. The walk-in flake's way in, traced: a roaming Bouncer at a tower's door
  // with a glitched Charger (a spawned one, which calm() leaves) right by it; separate() pushed the Bouncer through the door,
  // after keepOut had looked at its step, and it was inside (roam, never engaged). Forced: player 1 60 m behind the tower,
  // a roaming Bouncer 0.6 m out from the door on its middle line and a roaming Charger 1 m further out, overlapping it by
  // 2.4 m, so separate() alone pushes the Bouncer 1.2 m in past the door (on main it's then inside). 30 ticks, one at a time
  r = await C.ev(String.raw`(() => { ${H} goCity(); calm(); R.step(2); const t = R.worldTowers(1)[0]; if (!t) return { none: true };
    const half = t.w / 2, nx = t.door.nx, nz = t.door.nz, at = (b) => ({ x: t.x + nx * b, z: t.z + nz * b }), me = at(-(half + 60));
    pose(me.x, me.z, nx, nz); R.step(2);
    const put = (type, b) => { const p = at(b), s = R.spawn(type, p.x + 30, p.z + 30), q = G.robots.find((o) => o.id === s.id);
      q.pos.x = p.x; q.pos.z = p.z; q.pos.y = W.h(p.x, p.z); q.speed = 0; q.legHeading = q.torsoYaw = Math.atan2(nx, nz); q.ai.mode = 'roam'; q.ai.alert = 0; q.ai.wp = at(half + 40); q.ai.wpT = 1e9; return q; };
    const b = put('bouncer', half + 0.6), c = put('charger', half + 1.6), d0 = Math.hypot(b.pos.x - c.pos.x, b.pos.z - c.pos.z);
    let inside = 0, minB = Infinity, engaged = 0;
    for (let k = 0; k < 30; k++) { R.step(1); calm(); if (W.inTower(b.pos.x, b.pos.z, 0)?.key === t.key) inside++; minB = Math.min(minB, loc(t, b.pos.x, b.pos.z).b); if (b.ai.mode !== 'roam') engaged++; }
    const res = { key: t.key, w: t.w, d0: +d0.toFixed(2), overlap: +(b.spec.radius + c.spec.radius - d0).toFixed(2), inside, minB: +minB.toFixed(2), engaged, apart: +Math.hypot(b.pos.x - c.pos.x, b.pos.z - c.pos.z).toFixed(2), loaded: !!real(t.key) };
    b.pos.x += 5000; c.pos.x += 5000; return res; })()`);
  ok(`#236: a roaming Bouncer at a tower's door, a Charger overlapping it ${r.overlap} m from outside, is never pushed in (${r.inside} of 30 ticks inside, nearest ${r.minB} m from the middle, the door at ${r.w / 2})`, !r.none && r.loaded && r.overlap > 2 && r.engaged === 0 && r.inside === 0 && r.minB >= r.w / 2, r);

  // ---- #236 (A1): nor an engaged Bouncer. Traced: one that had hopped at the door and was landing on the doorstep was knocked
  // in over it (a Copier's clone was about); keepOut looked only at roaming robots, and once inside it hopped on and stomped
  // player 1. Forced for each way of not roaming: player 1 3 m inside, a Charger overlapping it 2.4 m from outside, 30 ticks;
  // then a shove of its own (push, as a hit gives) straight in at the door, 30 more
  for (const mode of ['land', 'crouch', 'stalk']) {
    r = await C.ev(String.raw`(() => { ${H} goCity(); calm(); R.step(2); const t = R.worldTowers(1)[0]; if (!t) return { none: true };
      const half = t.w / 2, nx = t.door.nx, nz = t.door.nz, at = (b) => ({ x: t.x + nx * b, z: t.z + nz * b }), me = at(half - 3);
      pose(me.x, me.z, nx, nz); R.step(2);
      const put = (type, b) => { const p = at(b), s = R.spawn(type, p.x + 30, p.z + 30), q = G.robots.find((o) => o.id === s.id);
        q.pos.x = p.x; q.pos.z = p.z; q.pos.y = W.h(p.x, p.z); q.speed = 0; q.legHeading = q.torsoYaw = Math.atan2(nx, nz); q.ai.alert = 0; return q; };
      const b = put('bouncer', half + 0.6), c = put('charger', half + 1.6); c.ai.mode = 'roam'; c.ai.wp = at(half + 40); c.ai.wpT = 1e9;
      let inside = 0, minB = Infinity, other = 0; const st0 = b.stomps || 0;
      const go = (n) => { for (let k = 0; k < n; k++) { b.ai.mode = '${mode}'; b.ai.t = 10; R.step(1); calm(); m0().health = m0().maxHealth; if (W.inTower(b.pos.x, b.pos.z, 0)?.key === t.key) inside++; minB = Math.min(minB, loc(t, b.pos.x, b.pos.z).b); if (b.ai.mode !== '${mode}') other++; } };
      go(30); const pushed = inside; c.pos.x += 5000;
      const p = at(half + 0.6); b.pos.x = p.x; b.pos.z = p.z; b.speed = 0; b.push.set(-nx * 12, 0, -nz * 12); go(30);
      const res = { key: t.key, w: t.w, inside, pushed, shoved: inside - pushed, minB: +minB.toFixed(2), other, stomps: (b.stomps || 0) - st0, loaded: !!real(t.key) };
      b.air = null; b.pos.x += 5000; return res; })()`);
    ok(`#236 (A1): a Bouncer at a tower's door in '${mode}', player 1 inside, is never pushed in by a Charger (${r.pushed} of 30 ticks inside) or shoved in by a hit (${r.shoved} of 30)`, !r.none && r.loaded && r.other === 0 && r.inside === 0 && r.stomps === 0 && r.minB >= r.w / 2, r);
  }

  // ---- #244: nor a downed Bouncer. keepOut looked only at glitched robots, so a beaten Bouncer on the doorstep could be
  // pushed in, reboot in there and stomp player 1. Beaten through the game's own path (R.damage), 0.6 m out on the door's
  // middle line, player 1 3 m inside: a Charger overlapping it 2.4 m from outside, 30 ticks; a shove straight in at the
  // door, 30 more; then its down clock run out, and 10 s after it reboots. Never inside, before or after, and no stomp
  r = await C.ev(String.raw`(() => { ${H} goCity(); calm(); R.step(2); const t = R.worldTowers(1)[0]; if (!t) return { none: true };
    const half = t.w / 2, nx = t.door.nx, nz = t.door.nz, at = (b) => ({ x: t.x + nx * b, z: t.z + nz * b }), me = at(half - 3);
    const rnd = Math.random; let sd = 244; Math.random = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    try {
      pose(me.x, me.z, nx, nz); R.step(2);
      const put = (type, b) => { const p = at(b), s = R.spawn(type, p.x + 30, p.z + 30), q = G.robots.find((o) => o.id === s.id);
        q.pos.x = p.x; q.pos.z = p.z; q.pos.y = W.h(p.x, p.z); q.speed = 0; q.legHeading = q.torsoYaw = Math.atan2(nx, nz); q.ai.alert = 0; return q; };
      const b = put('bouncer', half + 0.6); R.damage(b.id, 1e6); const wasDown = b.state === 'down'; b.downT = 60;
      const c = put('charger', half + 1.6); c.ai.mode = 'roam'; c.ai.wp = at(half + 40); c.ai.wpT = 1e9;
      let inside = 0, minB = Infinity, upIn = 0; const st0 = b.stomps || 0;
      const go = (n) => { for (let k = 0; k < n; k++) { R.step(1); calm(); m0().health = m0().maxHealth; const inT = W.inTower(b.pos.x, b.pos.z, 0)?.key === t.key; if (inT) { inside++; if (b.state !== 'down') upIn++; } minB = Math.min(minB, loc(t, b.pos.x, b.pos.z).b); } };
      go(30); const pushed = inside; c.pos.x += 5000;
      const p = at(half + 0.6); b.pos.x = p.x; b.pos.z = p.z; b.speed = 0; b.push.set(-nx * 12, 0, -nz * 12); go(30); const shoved = inside - pushed, downAll = b.state === 'down';
      b.downT = 0.01; go(600);
      const res = { key: t.key, w: t.w, wasDown, downAll, rebooted: b.state === 'glitched' && (b.reboots || 0) > 0, inside, pushed, shoved, upIn, minB: +minB.toFixed(2), stomps: (b.stomps || 0) - st0, loaded: !!real(t.key) };
      b.air = null; b.pos.x += 5000; return res;
    } finally { Math.random = rnd; } })()`);
  ok(`#244: a downed Bouncer at a tower's door, player 1 inside, is never pushed in by a Charger (${r.pushed} of 30 ticks inside) or shoved in (${r.shoved} of 30), and after it reboots it stays out (${r.upIn} of 600 ticks inside, ${r.stomps} stomps)`, !r.none && r.loaded && r.wasDown && r.downAll && r.rebooted && r.inside === 0 && r.stomps === 0 && r.minB >= r.w / 2, r);

  // ---- #244: a Bouncer stopped at a tower's wall doesn't bounce on robots' heads in place. Seen: Chargers under the spot a
  // hop at player 1 inside stops (World.hopStop), and it sprang off their heads at player 1 again and again, stopped at the
  // same wall each time: up to 22 bounces in one chain (before #236, 5 at most). Forced: player 1 3 m inside a 16 m tower,
  // a Bouncer 8 m out on the door's middle line crouched to hop, two Chargers held still where its hop at player 1 stops
  // (one on the spot, one 1.5 m to its side), every other robot cleared each tick, 20 s, Math.random seeded: no chain over
  // 5 bounces, never inside, no stomp on player 1
  r = await C.ev(String.raw`(() => { ${H} let P = null;
    for (let k = 0; k < 30 && !P; k++) { if (!goCity(k)) break; const t = R.worldTowers().find((q) => q.w === 16); if (t) P = { k, key: t.key }; }
    if (!P) return { none: true };
    const rnd = Math.random; let sd = 244; Math.random = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    try {
      goCity(P.k); calm(); R.step(2); const t = tw(P.key), h = t.w / 2, nx = t.door.nx, nz = t.door.nz, at = (a, b) => ({ x: t.x - nz * a + nx * b, z: t.z + nx * a + nz * b });
      const me = at(0, h - 3), start = at(0, h + 8); pose(me.x, me.z, nx, nz); R.step(2);
      const put = (type, p) => { const s = R.spawn(type, p.x + 30, p.z + 30), q = G.robots.find((o) => o.id === s.id);
        q.pos.x = p.x; q.pos.z = p.z; q.pos.y = W.h(p.x, p.z); q.speed = 0; q.legHeading = q.torsoYaw = Math.atan2(-nx, -nz); q.ai.alert = 0; return q; };
      const q = put('bouncer', start), stop = W.hopStop(start.x, start.z, me.x, me.z, q.spec.radius); if (!stop) return { none: true, why: 'no stop' };
      const sb = loc(t, stop.x, stop.z), spots = [at(sb.a, sb.b), at(sb.a + 1.5, sb.b)], ch = spots.map((p) => put('charger', p));
      const hold = () => ch.forEach((c, i) => { c.pos.x = spots[i].x; c.pos.z = spots[i].z; c.pos.y = W.h(c.pos.x, c.pos.z); c.speed = 0; c.push.set(0, 0, 0); c.ai.mode = 'recover'; c.ai.t = 10; });
      const keep = new Set([q, ...ch]), others = () => { for (const o of G.robots) if (!keep.has(o) && o.state === 'glitched' && Math.abs(o.pos.x - t.x) < 2000) { o.air = null; o.pos.x += 5000; } };
      q.ai.mode = 'crouch'; q.ai.t = 0.01; hold(); others();
      const st0 = q.stomps || 0, sp0 = q.hopStops || 0, best0 = q.bestChain || 0; let inside = 0, hops = 0, wasAir = false, maxNow = 0;
      for (let k = 0; k < 1200; k++) { R.step(1); hold(); others(); m0().health = m0().maxHealth || 100; maxNow = Math.max(maxNow, q.bounces || 0);
        if (W.inTower(q.pos.x, q.pos.z, 0)?.key === t.key) inside++; if (q.air && !wasAir) hops++; wasAir = !!q.air; }
      const res = { key: P.key, w: t.w, stop: [+sb.a.toFixed(2), +sb.b.toFixed(2)], hops, stops: (q.hopStops || 0) - sp0, chain: maxNow, best: q.bestChain, best0, inside, stomps: (q.stomps || 0) - st0, loaded: !!real(P.key) };
      q.air = null; q.pos.x += 5000; ch.forEach((c) => { c.pos.x += 5000; }); return res;
    } finally { Math.random = rnd; } })()`);
  ok(`#244: a Bouncer whose hops at player 1, inside a 16 m tower, stop at the wall over two Chargers doesn't bounce on their heads in place (longest chain ${r.chain} bounces, at most 5; ${r.hops} times up, ${r.stops} stopped at the wall, ${r.inside} ticks inside, ${r.stomps} stomps)`, !r.none && r.loaded && r.stops >= 1 && r.chain >= 1 && r.chain <= 5 && r.inside === 0 && r.stomps === 0, r);

  // ---- #236 (A1): nor is player 1 stomped through the doorway. Seen: a Bouncer hopping in place on the doorstep, outside,
  // came down within a stomp's reach of player 1 3 m inside. Forced: a Bouncer 0.4 m out from the door, crouched to hop
  r = await C.ev(String.raw`(() => { ${H} goCity(); calm(); R.step(2); const t = R.worldTowers(1)[0]; if (!t) return { none: true };
    const half = t.w / 2, nx = t.door.nx, nz = t.door.nz, at = (b) => ({ x: t.x + nx * b, z: t.z + nz * b }), me = at(half - 3), p = at(half + 0.4), rnd = Math.random; Math.random = () => 0.5;
    try {
      pose(me.x, me.z, nx, nz); R.step(2);
      const s = R.spawn('bouncer', p.x + 30, p.z + 30), q = G.robots.find((o) => o.id === s.id);
      q.pos.x = p.x; q.pos.z = p.z; q.pos.y = W.h(p.x, p.z); q.legHeading = q.torsoYaw = Math.atan2(nx, nz); q.ai.mode = 'crouch'; q.ai.t = 0.01; q.ai.alert = 0;
      const st0 = q.stomps || 0; let lands = 0, inside = 0, air = false, meOut = 0;
      for (let k = 0; k < 120 && !lands; k++) { R.step(1); calm(); if (air && !q.air) lands++; air = !!q.air; if (q.stomps > st0) break; if (W.inTower(q.pos.x, q.pos.z, 0)?.key === t.key) inside++; if (W.inTower(m0().pos.x, m0().pos.z, 0)?.key !== t.key) meOut++; }
      const res = { key: t.key, w: t.w, lands, inside, meOut, stomps: (q.stomps || 0) - st0, gap: +Math.hypot(q.pos.x - m0().pos.x, q.pos.z - m0().pos.z).toFixed(2), loaded: !!real(t.key) };
      q.air = null; q.pos.x += 5000; return res;
    } finally { Math.random = rnd; } })()`);
  ok(`#236 (A1): a Bouncer hopping in place on a tower's doorstep doesn't stomp player 1, 3 m inside (${r.stomps} stomps, ${r.gap} m apart as it lands)`, !r.none && r.loaded && r.lands === 1 && r.inside === 0 && r.meOut === 0 && r.stomps === 0 && r.gap < 4, r);

  // ---- #236 (Daniel's pick A1, literal: "no hop ever lands inside a tower. A player inside a tower is safe from Bouncers,
  // which hop at the door"). The chase-in case: player 1 3 m in from the door of a 12 m and a 16 m tower, held still with
  // full health, every other robot cleared each tick (calm() leaves the Copier's clones, and one wandering in and hitting
  // player 1 shoved them about), a glitched Bouncer 10 m out from the door on its middle line, stalking them, for 30 s, one tick at a time.
  // On main it hopped in onto player 1 (inside by about 2.5 s, then stomps). Now it must never be inside the tower and never
  // stomp player 1: each hop stops at the wall. Math.random is seeded for each run
  for (const W0 of [12, 16]) {
    r = await C.ev(String.raw`(() => { ${H} let P = null;
      for (let k = 0; k < 30 && !P; k++) { if (!goCity(k)) break; const t = R.worldTowers().find((q) => q.w === ${W0}); if (t) P = { k, key: t.key }; }
      if (!P) return { none: true };
      const rnd = Math.random; let sd = 236; Math.random = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      try {
        goCity(P.k); calm(); R.step(2); const t = tw(P.key), h = t.w / 2, nx = t.door.nx, nz = t.door.nz;
        const at = (b) => ({ x: t.x + nx * b, z: t.z + nz * b }), me = at(h - 3), start = at(h + 10);
        pose(me.x, me.z, nx, nz); R.step(2); const p0 = { x: m0().pos.x, z: m0().pos.z }, meIn = W.inTower(p0.x, p0.z, 0)?.key === t.key;
        const s = R.spawn('bouncer', start.x + 30, start.z + 30), q = G.robots.find((o) => o.id === s.id);
        q.pos.x = start.x; q.pos.z = start.z; q.pos.y = W.h(start.x, start.z); q.legHeading = q.torsoYaw = Math.atan2(nx, nz); q.ai.mode = 'stalk'; q.ai.t = 0.6; q.ai.alert = 0;
        const st0 = q.stomps || 0, sp0 = q.hopStops || 0; let meOut = 0, inside = 0, firstIn = null, hops = 0, landsIn = 0, wasAir = false, engagedT = 0, moved = 0, maxB = -Infinity;
        const others = () => { for (const o of G.robots) if (o !== q && o.state === 'glitched' && Math.abs(o.pos.x - t.x) < 2000) { o.air = null; o.pos.x += 5000; } }; others();
        for (let k = 0; k < 1800; k++) { R.step(1); others(); const m = m0(); m.health = m.maxHealth || 100; moved = Math.max(moved, Math.hypot(m.pos.x - p0.x, m.pos.z - p0.z)); if (W.inTower(m.pos.x, m.pos.z, 0)?.key !== t.key) meOut++;
          if (q.ai.mode !== 'roam') engagedT++;
          const inT = W.inTower(q.pos.x, q.pos.z, 0)?.key === t.key; if (inT) { inside++; if (firstIn == null) firstIn = +((k + 1) / 60).toFixed(2); }
          if (q.air && !wasAir) hops++;
          if (wasAir && !q.air && inT) landsIn++;
          wasAir = !!q.air; maxB = Math.max(maxB, h - loc(t, q.pos.x, q.pos.z).b); }
        const res = { key: P.key, w: t.w, meIn, inside, firstIn, hops, landsIn, stops: (q.hopStops || 0) - sp0, stomps: (q.stomps || 0) - st0, engagedT, moved: +moved.toFixed(2), meOut, deepest: +maxB.toFixed(2), mode: q.ai.mode, loaded: !!real(P.key) };
        q.air = null; q.pos.x += 5000; return res;
      } finally { Math.random = rnd; } })()`);
    ok(`#236 (A1): a Bouncer chasing player 1, who stands 3 m inside a ${W0} m tower's door, never lands inside and never stomps them in 30 s (${r.hops} times up, ${r.stops} stopped at the wall, ${r.landsIn} landings inside, ${r.inside} of 1800 ticks inside${r.firstIn != null ? ', first in at ' + r.firstIn + ' s' : ''}, ${r.stomps} stomps)`, !r.none && r.w === W0 && r.loaded && r.meIn && r.meOut === 0 && r.moved < 0.5 && r.engagedT > 0 && r.hops >= 1 && r.inside === 0 && r.landsIn === 0 && r.stomps === 0, r);
  }

  // ---- #236: and the player who comes back out is fair game again. A Bouncer put back at the door (keepOut) with player 1
  // out of the tower froze there: facing in, its way round (World.round) led past the door's wall circles, avoid() held its
  // heading in, and keepOut undid every step (one stood on the door plane for 60 s, player 1 12 m straight out). (1) Player 1
  // 3 m inside a 16 m tower, a Bouncer 10 m out, 10 s; then player 1 put outside at each of 4 spots and held there: stomped
  // again within 30 s. (2) Forced: a Bouncer in 'stalk' on a 12, 16 or 20 m tower's doorstep facing in, on the middle line
  // and 2 m off it, player 1 straight out, off to a side, or behind: never still (under 0.5 m moved, and never off the
  // ground) for 8 s, never inside, and it stomps player 1 within 40 s
  const FZ = String.raw`const others = (q, t) => { for (const o of G.robots) if (o !== q && o.state === 'glitched' && Math.abs(o.pos.x - t.x) < 2000) { o.air = null; o.pos.x += 5000; } };
    const bounce = (p, fx, fz) => { const s = R.spawn('bouncer', p.x + 30, p.z + 30), q = G.robots.find((o) => o.id === s.id);
      q.pos.x = p.x; q.pos.z = p.z; q.pos.y = W.h(p.x, p.z); q.speed = 0; q.legHeading = q.torsoYaw = Math.atan2(-fx, -fz); q.ai.mode = 'stalk'; q.ai.t = 0.6; q.ai.alert = 0; return q; };
    const watch = (q, t, me, n, stop) => { let inside = 0, still = 0, worst = 0, ax = q.pos.x, az = q.pos.z, hitAt = null, near = Infinity; const st0 = q.stomps || 0;
      for (let k = 0; k < n; k++) { pose(me.x, me.z, -t.door.nx, -t.door.nz); R.step(1); others(q, t); const m = m0(); m.health = m.maxHealth || 100;
        if (W.inTower(q.pos.x, q.pos.z, 0)?.key === t.key) inside++;
        if (q.air || Math.hypot(q.pos.x - ax, q.pos.z - az) > 0.5) { ax = q.pos.x; az = q.pos.z; still = 0; } else worst = Math.max(worst, ++still);
        near = Math.min(near, Math.hypot(q.pos.x - me.x, q.pos.z - me.z));
        if (hitAt == null && (q.stomps || 0) > st0) hitAt = +((k + 1) / 60).toFixed(1); if (stop && hitAt != null) break; }
      return { inside, still: +(worst / 60).toFixed(1), hitAt, near: +near.toFixed(1), mode: q.ai.mode, end: [loc(t, q.pos.x, q.pos.z).a.toFixed(1), loc(t, q.pos.x, q.pos.z).b.toFixed(1)].join(',') }; };`;
  r = await C.ev(String.raw`(() => { ${H} ${FZ} let P = null;
    for (let k = 0; k < 30 && !P; k++) { if (!goCity(k)) break; const t = R.worldTowers().find((q) => q.w === 16); if (t) P = { k, key: t.key }; }
    if (!P) return { none: true };
    const rnd = Math.random; let sd = 243; Math.random = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    try { const rows = [];
      for (const [a, b] of [[0, 12], [9, 9], [-9, 9], [14, 4]]) {
        goCity(P.k); calm(); R.step(2); const t = tw(P.key), h = t.w / 2, nx = t.door.nx, nz = t.door.nz, at = (a, b) => ({ x: t.x - nz * a + nx * b, z: t.z + nx * a + nz * b });
        const me = at(0, h - 3); pose(me.x, me.z, nx, nz); R.step(2); const q = bounce(at(0, h + 10), -nx, -nz);
        const w0 = watch(q, t, me, 600);
        // (#244: then put back at the door by keepOut, as only chance had it before, so the outcome doesn't hang on it: once
        // down, on the doorstep 2.6 m off the middle facing in, and a shove in through the door, player 1 still inside)
        for (let k = 0; k < 120 && q.air; k++) { pose(me.x, me.z, -nx, -nz); R.step(1); others(q, t); }
        const d = at(2.6, h + 0.05); q.pos.x = d.x; q.pos.z = d.z; q.pos.y = W.h(d.x, d.z); q.lift = 0; q.speed = 0; q.turnVel = 0; q.input.throttle = q.input.turn = 0; q.ai.think = 0; q.ai.wp = null; q.legHeading = q.torsoYaw = Math.atan2(nx, nz);
        q.ai.mode = 'stalk'; q.ai.t = 0.6; q.push.set(-nx * 6, 0, -nz * 6); const wk = watch(q, t, me, 1), kept = !q.air && wk.inside === 0 && Math.hypot(q.pos.x - d.x, q.pos.z - d.z) < 0.01;
        const w = watch(q, t, at(a, h + b), 1800, true); rows.push({ a, b, first: w0, kept, ...w, loaded: !!real(P.key) }); q.air = null; q.pos.x += 5000;
      }
      return { key: P.key, rows };
    } finally { Math.random = rnd; } })()`);
  ok(`#236: a Bouncer that hopped 10 s at a 16 m tower's door, player 1 inside, stomps them again once they're outside, at 4 spots (${(r.rows || []).map((q) => q.a + ',' + q.b + ': ' + (q.hitAt == null ? 'never in 30 s, at ' + q.end : q.hitAt + ' s')).join('; ')})`, !r.none && r.rows.length === 4 && r.rows.every((q) => q.loaded && q.first.inside === 0 && q.first.hitAt == null && q.kept && q.inside === 0 && q.hitAt != null), r);
  for (const W0 of [12, 16, 20]) {
    r = await C.ev(String.raw`(() => { ${H} ${FZ} let P = null;
      for (let k = 0; k < 30 && !P; k++) { if (!goCity(k)) break; const t = R.worldTowers().find((q) => q.w === ${W0}); if (t) P = { k, key: t.key }; }
      if (!P) return { none: true };
      const rnd = Math.random; let sd = 243; Math.random = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      try { const rows = [];
        for (const a0 of [0, 2, -2]) for (const [a, b] of [[0, 12], [10, 8], [0, 'back']]) {
          goCity(P.k); calm(); R.step(2); const t = tw(P.key), h = t.w / 2, nx = t.door.nx, nz = t.door.nz, at = (a, b) => ({ x: t.x - nz * a + nx * b, z: t.z + nx * a + nz * b });
          const me = b === 'back' ? at(a, -(h + 12)) : at(a, h + b); pose(me.x, me.z, -nx, -nz); R.step(2); const q = bounce(at(a0, h + 0.05), -nx, -nz);
          rows.push({ a0, a, b, ...watch(q, t, me, 2400, true), loaded: !!real(P.key) }); q.air = null; q.pos.x += 5000;
        }
        return { key: P.key, rows };
      } finally { Math.random = rnd; } })()`);
    const bad = (r.rows || []).filter((q) => !q.loaded || q.inside || q.still >= 8 || q.hitAt == null);
    ok(`#236: a Bouncer on a ${W0} m tower's doorstep facing in, player 1 outside, doesn't freeze there: it goes for them (${(r.rows || []).length} places: ${bad.length} bad, longest still ${Math.max(0, ...(r.rows || []).map((q) => q.still))} s, ${(r.rows || []).filter((q) => q.hitAt != null).length} stomped player 1)`, !r.none && r.rows.length === 9 && !bad.length, bad.length ? bad : r);
  }

  // (3) And beside a wall with no door, its foe outside on that same side: World.round's corner was behind avoid()'s wall
  // circles there too (on main as well, now and then), and it stood facing the wall for good. Seen at two places of a 12 m
  // tower; the straight line to player 1 keeps out of the tower, so it hops at them
  r = await C.ev(String.raw`(() => { ${H} ${FZ} let P = null;
    for (let k = 0; k < 30 && !P; k++) { if (!goCity(k)) break; const t = R.worldTowers().find((q) => q.w === 12); if (t) P = { k, key: t.key }; }
    if (!P) return { none: true };
    const rnd = Math.random; let sd = 243; Math.random = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    try { const rows = [];
      for (const [a0, b0, a, b] of [[3, -8.3, 2.3, -16.1], [8.3, -3, 11.6, 1.7]]) {
        goCity(P.k); calm(); R.step(2); const t = tw(P.key), nx = t.door.nx, nz = t.door.nz, at = (a, b) => ({ x: t.x - nz * a + nx * b, z: t.z + nx * a + nz * b });
        const me = at(a, b); pose(me.x, me.z, -nx, -nz); R.step(2); const [fx, fz] = b0 < -6 ? [nx, nz] : [nz, -nx], q = bounce(at(a0, b0), fx, fz);
        rows.push({ a0, b0, ...watch(q, t, me, 2400, true), loaded: !!real(P.key) }); q.air = null; q.pos.x += 5000;
      }
      return { key: P.key, rows };
    } finally { Math.random = rnd; } })()`);
  ok(`#236: a Bouncer beside a 12 m tower's wall facing it, player 1 outside on that side, goes for them (${(r.rows || []).map((q) => 'from ' + q.a0 + ',' + q.b0 + ': still ' + q.still + ' s at most, ' + (q.hitAt == null ? 'no stomp in 40 s' : 'stomped at ' + q.hitAt + ' s')).join('; ')})`, !r.none && r.rows.length === 2 && r.rows.every((q) => q.loaded && q.inside === 0 && q.still < 8 && q.hitAt != null), r);

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
    // drive in through the door (player 1 made ready first, #228)
    const drive = () => { const pre = ready(); pose(t.door.x + t.door.nx * 12, t.door.z + t.door.nz * 12, -t.door.nx, -t.door.nz); R.step(2);
      let inTicks = 0, mOff = 0; R.hold('KeyW', true);
      for (let i = 0; i < 600; i++) { R.step(1); calm(); if (W.inTower(m.pos.x, m.pos.z, 2.5)?.key === best.key) { inTicks++; mOff = Math.max(mOff, Math.abs(m.pos.y - floor)); if (inTicks > 40) break; } }
      R.hold('KeyW', false); R.step(5); return { pre, inTicks, mOff: +mOff.toFixed(3) }; };
    // #228: forced, player 1 knocked out cold just before (a fresh 8 s down clock, past the 6.8 s left in the run that
    // missed): the drive still gets in. Then the drive as #208 has it
    R.hurt(0, 1e6); const knocked = { down: m.state === 'down', ...drive() };
    const { pre, inTicks, mOff } = drive();
    // the people's feet on the floor too (from where they're drawn: a waving one bobs up to 6 cm)
    const feet = T.people.map((q) => +(q.g.position.y - floor).toFixed(3));
    return { key: best.key, w: best.w, spread: +best.spread.toFixed(2), off: +off.toFixed(3), feet, pre, inTicks, mOff, knocked }; })()`);
  ok(`#208: a tower on a sloped block (${r.spread} m of hillside across its ${r.w} m): the ground inside is its floor (${r.off} m off at most)`, !r.none && r.spread > 1 && r.off <= 0.06, r);
  ok(`#208: driven in, the mech stands on the floor its people stand on (${r.mOff} m off over ${r.inTicks} ticks inside)`, !r.none && r.inTicks > 20 && r.mOff <= 0.06 && r.feet.length && r.feet.every((f) => f >= -0.06 && f <= 0.12), r);
  ok(`#228: player 1 powered down just before the drive-in (${r.knocked?.pre?.downT} s on its clock): made ready first, it still drives into ${r.key} (${r.knocked?.inTicks} ticks inside, ${r.knocked?.mOff} m off the floor)`, !r.none && r.knocked.down && r.knocked.pre.state === 'down' && r.knocked.pre.downT >= 7 && r.knocked.inTicks > 20 && r.knocked.mOff <= 0.06, r.knocked);

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

  // ---- #208 door (Daniel's pick A: 11 m on the 16 m and 20 m towers, 9.8 m on a 12 m one, the widest that fits between
  // its corners). For one tower of each size, from the cities out from the start: the doorway measured from the wall
  // circles themselves (the gap between the circles either side of the door's middle, on its face), the width the hooks
  // report, no wall circle outside the tower; the biggest robot that roams or guards the world fits through it; and a
  // mech (4.6 m across) driven straight in on held keys 2 m off the door's middle goes in without the wall moving it
  r = await C.ev(String.raw`(() => { ${H} const want = { 12: 9.8, 16: 11, 20: 11 }, picked = {};
    for (let k = 0; k < 30 && Object.keys(picked).length < 3; k++) { if (!goCity(k)) break;
      for (const t of R.worldTowers()) if (!picked[t.w]) picked[t.w] = { k, key: t.key }; }
    const RT = R.ROBOT_TYPES || {}, WR = R.WORLD.robots, kinds = [...WR.types, 'ninja', ...(R.WORLD.harder?.boss?.types || [])];
    const big = kinds.map((k) => [k, RT[k]?.spec?.radius]).filter(([, r]) => r > 0).sort((a, b) => b[1] - a[1])[0] || null;
    const res = [];
    for (const w of [12, 16, 20]) { const P = picked[w]; if (!P) { res.push({ w, none: true }); continue; }
      goCity(P.k); calm(); const t = tw(P.key), T = real(P.key), h = t.w / 2, m = m0();
      const obs = W.chunks.get(T.ch.key).obs.filter((o) => Math.abs(o.x - t.x) <= h + 3 && Math.abs(o.z - t.z) <= h + 3 && o.kind === 'rock' && o.r === WI.wallR);
      const face = obs.map((o) => ({ o, p: loc(t, o.x, o.z) })).filter(({ p }) => Math.abs(p.b - h) < 0.01);
      const lft = Math.max(...face.filter(({ p }) => p.a < 0).map(({ o, p }) => p.a + o.r)), rgt = Math.min(...face.filter(({ p }) => p.a > 0).map(({ o, p }) => p.a - o.r));
      const out = obs.filter((o) => { const p = loc(t, o.x, o.z); return Math.abs(p.a) > h + 0.01 || Math.abs(p.b) > h + 0.01; }).length;
      // drive in 2 m off the door's middle, straight at it
      const off = 2, ax = -t.door.nz, az = t.door.nx;
      const pre = ready(); pose(t.door.x + t.door.nx * 12 + ax * off, t.door.z + t.door.nz * 12 + az * off, -t.door.nx, -t.door.nz); R.step(2);
      let inAt = -1, drift = 0; R.hold('KeyW', true);
      for (let i = 0; i < 600 && inAt < 0; i++) { R.step(1); calm(); const p = loc(t, m.pos.x, m.pos.z); drift = Math.max(drift, Math.abs(p.a - off)); if (p.b < h - 4) inAt = i; }
      R.hold('KeyW', false); R.step(5);
      res.push({ w, key: P.key, gap: +(rgt - lft).toFixed(3), width: t.door.width, want: want[w], out, pre, inAt, drift: +drift.toFixed(3), inside: W.status().inTower === P.key });
    }
    return { res, big, mech: R.MECH?.radius ?? null }; })()`);
  for (const q of r.res) {
    ok(`#208: a ${q.w} m tower's doorway is ${q.want} m between its wall circles (measured ${q.gap}, reported ${q.width}), no wall circle outside the tower`, !q.none && Math.abs(q.gap - q.want) < 0.01 && Math.abs(q.width - q.want) < 0.01 && q.out === 0, q);
    ok(`#208: the biggest world robot (${r.big?.[0]}, ${r.big ? 2 * r.big[1] : '?'} m across) fits through a ${q.w} m tower's door (${q.gap} m)`, !q.none && r.big && q.gap > 2 * r.big[1], { q, big: r.big });
    ok(`#208: a mech driven straight in 2 m off the door's middle gets into a ${q.w} m tower untouched (in after ${q.inAt} ticks, pushed ${q.drift} m sideways)`, !q.none && q.inAt >= 0 && q.inside && q.drift < 0.05, q);
  }

  // ---- #217 (review of d53d014): a robot that notices a player while it's still inside a tower. A Charger (the one the
  // come-out check twice caught stuck in stalk) and a Bouncer, each put by the back wall of the nearest tower with player 1
  // 25 m behind that wall (well inside their notice: they engage at once, from inside): each comes out of the door within
  // 30 s instead of pushing on the back wall towards the player
  r = await C.ev(String.raw`(() => { ${H} goCity(); calm(); R.step(2); const t = R.worldTowers(1)[0], half = t.w / 2, nx = t.door.nx, nz = t.door.nz;
    const at = (b) => ({ x: t.x + nx * b, z: t.z + nz * b }), me = at(-(half + 25));
    pose(me.x, me.z, nx, nz); R.step(2);
    const res = { key: t.key, w: t.w, runs: [] };
    for (const type of ['charger', 'bouncer']) {
      const p = at(-(half - 3)), s = R.spawn(type, p.x + 30, p.z + 30), q = G.robots.find((o) => o.id === s.id);
      q.pos.x = p.x; q.pos.z = p.z; q.ai.mode = 'stalk'; q.ai.t = 0.6; q.ai.alert = 0;
      let outAt = null, engagedT = 0, minB = Infinity;
      for (let k = 0; k < 360 && outAt == null; k++) { R.step(5); calm(); const m = m0(); m.health = m.maxHealth || 100; if (q.ai.mode !== 'roam') engagedT++;
        minB = Math.min(minB, (q.pos.x - t.x) * nx + (q.pos.z - t.z) * nz); if (!W.inTower(q.pos.x, q.pos.z, 0)) outAt = +((k + 1) * 5 / 60).toFixed(1); }
      const e = loc(t, q.pos.x, q.pos.z);
      res.runs.push({ type, outAt, engagedT, mode: q.ai.mode, minB: +minB.toFixed(2), end: { a: +e.a.toFixed(2), b: +e.b.toFixed(2) }, loaded: !!real(t.key) }); q.pos.x += 5000;
    }
    return res; })()`);
  ok(`#217: a Charger and a Bouncer that notice a player behind a tower's back wall while inside it come out of its door (${(r.runs || []).map((q) => q.type + ' out at ' + q.outAt + ' s').join(', ')})`, r.runs.length === 2 && r.runs.every((q) => q.outAt != null && q.outAt <= 30 && q.engagedT > 0 && q.loaded && Math.abs(q.end.a) < r.w / 2 + 1), r);

  // ---- #217 with #208's door widths: a 12 m tower's doorway is 9.8 m (World.doorW), not WORLD.inside.door's 11, and the
  // way out has to use it. (1) The hook: for each world robot kind, across the inside by the door (b from half - 3.9 to
  // half - 0.5, a out to 5 m less its radius: where an 11 m door would call it lined up), wayOut only sends it straight out
  // when its body clears the real doorway by 0.5 m (|a| + radius + 0.5 <= doorW / 2); otherwise to the middle first.
  // (2) In play: a Bouncer and a Charger put beside the door, by the side wall, come out through the doorway within 30 s
  // and stay out, never touching the doorway's two corner wall circles on the way through (clearance to them, less their
  // radius, while it is inside and wayOut is steering it; once out it turns back for its roam spot behind the tower, and
  // may brush the wall outside, which is ordinary roaming)
  r = await C.ev(String.raw`(() => { ${H} let P = null;
    for (let k = 0; k < 30 && !P; k++) { if (!goCity(k)) break; const t = R.worldTowers().find((q) => q.w === 12); if (t) P = { k, key: t.key }; }
    if (!P) return { none: true };
    goCity(P.k); calm(); R.step(2); const t = tw(P.key), T = real(P.key), h = t.w / 2, D = t.door.width, ax = -t.door.nz, az = t.door.nx, nx = t.door.nx, nz = t.door.nz;
    const at = (a, b) => ({ x: t.x + ax * a + nx * b, z: t.z + az * a + nz * b });
    const RT = R.ROBOT_TYPES || {}, hook = [];
    for (const type of R.WORLD.robots.types) { const rad = RT[type]?.spec?.radius; if (!(rad > 0) || D / 2 - rad - 0.5 < 0.5) continue;
      let out = 0, mid = 0, bad = [];
      for (let b = h - 3.9; b <= h - 0.5 + 1e-6; b += 0.2) for (let a = -(5 - rad); a <= 5 - rad + 1e-6; a += 0.1) {
        const p = at(a, b); if (!W.inTower(p.x, p.z, 0)) continue; const o = W.wayOut(p.x, p.z, rad); if (!o) continue;
        if (loc(t, o.x, o.z).b > h) { out++; if (Math.abs(a) + rad + 0.5 > D / 2 + 1e-6) bad.push({ a: +a.toFixed(2), b: +(b - h).toFixed(2) }); } else mid++;
      }
      hook.push({ type, rad, out, mid, nBad: bad.length, bad: bad.slice(0, 3) });
    }
    const me = at(0, -(h + 60)), behind = at(0, -(h + 8)); pose(me.x, me.z, nx, nz); R.step(2);
    const walls = W.chunks.get(T.ch.key).obs.filter((o) => o.kind === 'rock' && o.r === WI.wallR && Math.abs(o.x - t.x) <= h + 3 && Math.abs(o.z - t.z) <= h + 3);
    const corners = walls.filter((o) => { const p = loc(t, o.x, o.z); return Math.abs(p.b - h) < 0.01 && Math.abs(Math.abs(p.a) - (D / 2 + WI.wallR)) < 0.01; }), play = [];
    for (const type of ['bouncer', 'charger']) for (const side of [-1, 1]) {
      const s = R.spawn(type, t.x + 30, t.z + 30), q = G.robots.find((o) => o.id === s.id), rad = q.spec.radius, p = at(side * (D / 2 - rad - 0.2), h - 2);
      q.pos.x = p.x; q.pos.z = p.z; q.ai.mode = 'roam'; q.ai.alert = 0; q.ai.wp = { ...behind }; q.ai.wpT = 1e9; q.home = { ...behind };
      let outAt = null, back = 0, clear = Infinity, crossA = null, steered = 0;
      for (let k = 0; k < 420; k++) { R.step(5); calm(); m0().health = m0().maxHealth || 100; const inT = !!W.inTower(q.pos.x, q.pos.z, 0), lp = loc(t, q.pos.x, q.pos.z);
        if (inT && outAt == null) { steered++; for (const o of corners) clear = Math.min(clear, Math.hypot(q.pos.x - o.x, q.pos.z - o.z) - o.r - rad); }
        if (!inT && outAt == null) { outAt = +((k + 1) * 5 / 60).toFixed(1); crossA = +lp.a.toFixed(2); } else if (inT && outAt != null) back++; }
      play.push({ type, side, rad, outAt, crossA, back, clear: +clear.toFixed(3), steered, loaded: !!real(P.key) }); q.pos.x += 5000;
    }
    return { key: P.key, w: t.w, D, walls: walls.length, corners: corners.length, hook, play }; })()`);
  ok(`#217/#208: on a 12 m tower (${r.D} m door) wayOut sends a robot straight out only when its body clears the real doorway (${(r.hook || []).map((q) => q.type + ' ' + q.out + ' out / ' + q.mid + ' to the middle, ' + q.nBad + ' too far over').join('; ')})`, !r.none && r.D === 9.8 && r.hook.length >= 2 && r.hook.every((q) => q.nBad === 0 && q.out > 0 && q.mid > 0), r);
  ok(`#217/#208: a Bouncer and a Charger beside a 12 m tower's door, by its side wall, come out through the doorway and stay out without touching the doorway's corner wall circles on the way (${(r.play || []).map((q) => q.type + ' out at ' + q.outAt + ' s, ' + q.clear + ' m clear').join('; ')})`, !r.none && r.corners === 2 && r.play.length === 4 && r.play.every((q) => q.outAt != null && q.outAt <= 30 && q.back === 0 && q.loaded && q.steered > 0 && q.clear > 0.05 && Math.abs(q.crossA) + q.rad <= r.D / 2 + 0.05), r);

  // ---- #231: a Bouncer chasing a player who stands still behind a tower (its door facing the Bouncer) goes round the
  // tower, not in and out of the doorway. The reviewer's probe of #225: player 1 behind the back wall of a 12 m tower, a
  // Bouncer in stalk 8 m out from the door; on main it went in 19 times in 60 s and never got round. #238's review: with
  // player 1 close behind (10 or 14 m) the first fix circled a front corner for the whole minute, on 12, 16 and 20 m towers.
  // So: each tower size, player 1 10 and 14 m behind the back wall (and 20 m on the 12 m tower: further back is past the
  // Bouncer's 45 m notice on the bigger ones), held still with full health for 60 s, the other robots cleared. Each passes
  // when it walks in at the door at most once, never hops in, and gets round (past the back wall, or a hop onto player 1).
  // Hop-ins are counted apart from walking in: with player 1 this close to the back wall a spring off their head came down
  // inside before #236; now a hop stops at the wall (World.hopStop), so any hop-in fails. Math.random is seeded for each
  // run (timing still varies run to run)
  for (const [W0, back] of [[12, 10], [12, 14], [12, 20], [16, 10], [16, 14], [20, 10], [20, 14]]) {
    r = await C.ev(String.raw`(() => { ${H} let P = null;
      for (let k = 0; k < 30 && !P; k++) { if (!goCity(k)) break; const t = R.worldTowers().find((q) => q.w === ${W0}); if (t) P = { k, key: t.key }; }
      if (!P) return { none: true };
      const rnd = Math.random; let sd = 231; Math.random = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      try {
        goCity(P.k); calm(); R.step(2); const t = tw(P.key), h = t.w / 2, nx = t.door.nx, nz = t.door.nz;
        const at = (b) => ({ x: t.x + nx * b, z: t.z + nz * b }), me = at(-(h + ${back})), start = at(h + 8);
        pose(me.x, me.z, nx, nz); R.step(2); const p0 = { x: m0().pos.x, z: m0().pos.z };
        const s = R.spawn('bouncer', start.x + 30, start.z + 30), q = G.robots.find((o) => o.id === s.id);
        q.pos.x = start.x; q.pos.z = start.z; q.pos.y = R.World.h(start.x, start.z); q.legHeading = q.torsoYaw = Math.atan2(nx, nz); q.ai.mode = 'stalk'; q.ai.t = 0.6; q.ai.alert = 0;
        const st0 = q.stomps || 0; let entries = 0, hopIns = 0, insideN = 0, wasIn = false, wasAir = false, engagedT = 0, roundAt = null, maxIn = -Infinity, moved = 0, closest = Infinity;
        for (let k = 0; k < 720; k++) { R.step(5); calm(); const m = m0(); m.health = m.maxHealth || 100; moved = Math.max(moved, Math.hypot(m.pos.x - p0.x, m.pos.z - p0.z));
          if (q.ai.mode !== 'roam') engagedT++;
          const inT = W.inTower(q.pos.x, q.pos.z, 0)?.key === t.key; if (inT) { insideN++; maxIn = Math.max(maxIn, h - loc(t, q.pos.x, q.pos.z).b); if (!wasIn) { if (wasAir || q.air) hopIns++; else entries++; } } wasIn = inT; wasAir = !!q.air;
          const lp = loc(t, q.pos.x, q.pos.z); closest = Math.min(closest, Math.hypot(q.pos.x - m.pos.x, q.pos.z - m.pos.z));
          if (roundAt == null && !inT && (lp.b < -h || (q.stomps || 0) > st0)) roundAt = +((k + 1) * 5 / 60).toFixed(1); }
        const e = loc(t, q.pos.x, q.pos.z), res = { key: P.key, w: t.w, D: t.door.width, entries, hopIns, insideN, engagedT, roundAt, stomps: (q.stomps || 0) - st0, maxIn: +maxIn.toFixed(2), closest: +closest.toFixed(1), moved: +moved.toFixed(2), mode: q.ai.mode, end: { a: +e.a.toFixed(1), b: +e.b.toFixed(1) }, loaded: !!real(P.key) };
        q.air = null; q.pos.x += 5000; return res;
      } finally { Math.random = rnd; } })()`);
    ok(`#231: a Bouncer chasing player 1, who stands still ${back} m behind a ${W0} m tower (${r.D} m door) for 60 s, goes round it, not in and out of the doorway (${r.entries} times in at the door, ${r.hopIns} hops in, ${r.insideN} of 720 samples inside; round at ${r.roundAt} s, ${r.stomps} stomps)`, !r.none && r.w === W0 && r.loaded && r.engagedT > 0 && r.moved < 0.5 && r.entries <= 1 && r.hopIns === 0 && r.roundAt != null, r);
  }

  // ---- #222: the Copier and the towers. (1) Its saucer sent in from 30 m past the nearest tower's door side to player 1
  // standing 20 m behind its back wall, so the straight way in runs through the tower (at COPIER.fly, 16 m up, under every
  // roof: the lowest is 22 m), then (2) to player 1 standing in the middle of that tower: through every phase (in, scan,
  // print, out) its rim (COPIER.shield, the shield's reach) never comes within a tower's walls below its roof. (3) dropSpot
  // with every spot round player 1 blocked (one big made-up obstacle, for that call only) and the spot COPIER.drop m
  // right ahead of them 3 m inside the tower, where the old fallback printed the clone: the spot it gives is outside every tower
  r = await C.ev(String.raw`(() => { ${H} goCity(); calm(); R.step(2); const t = R.worldTowers(1)[0], T = real(t.key), half = t.w / 2, nx = t.door.nx, nz = t.door.nz, K = R.COPIER;
    const at = (b) => ({ x: t.x + nx * b, z: t.z + nz * b }), res = { key: t.key, w: t.w, top: +T.top.toFixed(1), runs: [] };
    const fly = (me, from) => {
      pose(me.x, me.z, nx, nz); R.step(2); const c = R.Copier.launch(0); R.step(1);
      if (from) c.pos.set(from.x, m0().pos.y + K.fly, from.z);
      const o = { phases: [], hits: 0, first: null, lowest: Infinity, ticks: 0 };
      for (let k = 0; k < 3000 && R.Copier.list.includes(c); k++) { R.step(1); calm(); m0().health = m0().maxHealth || 100; o.ticks++;
        if (o.phases.at(-1) !== c.phase) o.phases.push(c.phase);
        const q = W.inTower(c.pos.x, c.pos.z, -K.shield); if (q) o.lowest = Math.min(o.lowest, +(c.pos.y - q.top).toFixed(2));
        if (q && c.pos.y - 1 < q.top) { o.hits++; o.first ||= { phase: c.phase, x: +c.pos.x.toFixed(1), y: +c.pos.y.toFixed(1), z: +c.pos.z.toFixed(1), top: +q.top.toFixed(1) }; } }
      o.gone = !R.Copier.list.includes(c); if (!o.gone) R.Copier.remove(c);
      for (const q of G.robots) if (q.clone) q.pos.x += 5000;
      return o; };
    res.runs.push({ what: 'behind', ...fly(at(-(half + 20)), at(half + 30)) });
    res.runs.push({ what: 'inside', ...fly({ x: t.x, z: t.z }, null) });
    const b = at(-(half + K.drop - 3)); pose(b.x, b.z, nx, nz); const m = m0(), big = { x: m.pos.x, z: m.pos.z, r: 60, h: 1 };
    R.obstacles.push(big); let s; try { s = R.Copier.dropSpot(m); } finally { R.obstacles.splice(R.obstacles.indexOf(big), 1); }
    res.drop = { s, ahead: !!W.inTower(m.pos.x - Math.sin(m.legHeading) * K.drop, m.pos.z - Math.cos(m.legHeading) * K.drop, 0), inTower: W.inTower(s.x, s.z, 0)?.key ?? null };
    return res; })()`);
  for (const q of r.runs || []) ok(`#222: the Copier's saucer, player 1 ${q.what === 'behind' ? 'behind a tower from it' : 'inside the tower'}, never passes through a tower (${q.hits} ticks in one; lowest ${q.lowest} m over a roof; phases ${q.phases.join(' > ')})`, q.hits === 0 && q.phases.includes('scan') && q.phases.includes('out') && q.gone && q.lowest < Infinity, { key: r.key, w: r.w, top: r.top, ...q });
  ok(`#222: dropSpot's fallback (every spot round player 1 blocked, a tower ${r.drop?.ahead ? 'right ahead' : 'NOT ahead'}) is outside every tower (${JSON.stringify(r.drop?.s)} in ${r.drop?.inTower})`, r.drop && r.drop.ahead && r.drop.inTower === null, r.drop);

  // ---- #233: dropSpot's last fallback. Every one of its 48 tries made to fail (World.inTower stubbed, for those calls
  // only: the -4 m check each try makes says "in a tower"), with player 1 at three spots inside a 12 m tower not lined up
  // with its door (by a side wall, by the other side wall nearer the door, behind the middle): where the old fallback
  // (wayOut's first stop, 2.5 m inside the door wall) printed the clone inside the tower, the spot it gives is outside
  // every tower, and clear of them by the 4 m every other try keeps
  r = await C.ev(String.raw`(() => { ${H} goCity(); calm(); R.step(2); const ts = R.worldTowers(), t = ts.find((q) => q.w === 12) || ts[0]; if (!t) return { none: true };
    const half = t.w / 2, at = (a, b) => ({ x: t.x - t.door.nz * a + t.door.nx * b, z: t.z + t.door.nx * a + t.door.nz * b }), res = { key: t.key, w: t.w, drops: [] };
    const orig = W.inTower, T = real(t.key);
    for (const [a, b] of [[half - 2.5, 0], [-(half - 2.5), half - 3], [0, -3]]) {
      const p = at(a, b); pose(p.x, p.z, t.door.nx, t.door.nz); const m = m0(), inside = orig.call(W, m.pos.x, m.pos.z, 0)?.key ?? null;
      let s, stubbed = 0; W.inTower = function (x, z, mm = 0) { if (mm === -4) { stubbed++; return T; } return orig.call(this, x, z, mm); };
      try { s = R.Copier.dropSpot(m); } finally { W.inTower = orig; }
      res.drops.push({ a: +a.toFixed(1), b: +b.toFixed(1), inside, stubbed, s, inTower: W.inTower(s.x, s.z, 0)?.key ?? null, near: W.inTower(s.x, s.z, -4)?.key ?? null });
    }
    res.restored = W.inTower === orig;
    // and for every loaded tower: the spot that fallback gives for a player inside it (COPIER.out m past its door wall) is
    // clear of every tower by 4 m
    res.all = 0; res.bad = []; for (const q of [...W.chunks.values()].flatMap((ch) => ch.towers)) { res.all++; const ob = q.w / 2 + R.COPIER.out, x = q.x + q.nx * ob, z = q.z + q.nz * ob;
      if (W.inTower(x, z, -4)) res.bad.push({ key: q.key, x: +x.toFixed(1), z: +z.toFixed(1), hit: W.inTower(x, z, -4).key }); }
    return res; })()`);
  ok(`#233: dropSpot's last fallback (all 48 tries failed, player 1 inside a ${r.w} m tower off its door's line) is outside every tower (${(r.drops || []).map((q) => JSON.stringify(q.s) + ' in ' + q.inTower).join('; ')}); for each of the ${r.all} loaded towers its spot is 4 m clear of them all (${r.bad?.length} not)`,
    !r.none && r.restored && r.drops.length === 3 && r.drops.every((q) => q.inside === r.key && q.stubbed === 48 && q.inTower === null && q.near === null) && r.all > 0 && r.bad.length === 0, r);

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
