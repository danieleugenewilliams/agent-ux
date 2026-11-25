#!/usr/bin/env node
// Robot Battle endless world check (#167, slice 6: the dark in the caves). The boys' ask: "the farther you go the darker it
// gets"; Daniel's Q7: "the mech gets headlights so the boys can still see deep in, with the light shrinking as it gets darker".
//
// Each run is its own headless Chrome (muted, not detached, killed with its profile deleted on every way out, as
// scripts/rb-world.mjs does). Made-up profiles only.
//   logic  - at 1280 x 800, through window.__rb:
//            * waves untouched: no headlight made, the daylight, sky and haze as they were;
//            * the open world: full daylight, the headlights off, the same number of lights in and out of a cave;
//            * driven in with the drive key held (the real movement): every step in is darker (sun, sky light, sky, haze, and
//              the picture itself), the headlights come on and their reach, width and strength shrink, never to nothing;
//            * deep in: the picture is much darker than at the door, but with the headlights on what's ahead is far brighter
//              than without them, on the way in and turned round to the door;
//            * the headlights follow the aim, and the walls stay solid but for those in the camera's way;
//            * driven out: the daylight, sky and haze exactly as before; after a jump out of it (a teleport) too;
//            * the mech down deep in: the headlights dimmed, not out;
//            * nothing moved: caves, parts, kits the same; the storage keys the same, nothing new in the record.
//   touch  - at 844 x 390, 740 x 360 and 667 x 375 with touch, deep in a cave: at most 4 touch buttons, no scroll, every one
//            on screen, and what's ahead still lit.
//
// Usage:
//   node scripts/rb-world-cave.mjs                     # ./robot-battle.html: logic, then touch
//   node scripts/rb-world-cave.mjs --logic             # the logic run only
//   node scripts/rb-world-cave.mjs path/or/url.html --json
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-cave-'));
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
  const R = window.__rb, G = R.Game, W = R.World, D = R.WORLD.dark;
  const keys = () => Object.keys(localStorage).sort();
  const rec = () => JSON.parse(localStorage.getItem('robotbattle.facts.tester') || 'null');
  const m0 = () => G.humans[0].mech;
  // the world's robots sent far off (so none pushes, shoots or downs the mech in a drive test), and player 1 kept up
  const calm = () => { for (const r of G.robots) if (r.wkey && r.state === 'glitched' && Math.hypot(r.pos.x - m0().pos.x, r.pos.z - m0().pos.z) < 400) r.pos.x += 5000; const m = m0(); m.health = m.maxHealth; };
  const head = (x, z) => { const m = m0(), hd = Math.atan2(-(x - m.pos.x), -(z - m.pos.z)); m.legHeading = hd; m.torsoYaw = hd; m.input.aimYaw = hd; return hd; };
  const cave = () => R.worldCaves(1500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  // player 1 stood u of the way in (0 the door, 1 the deepest; < 0 outside), facing in or out
  const stand = (c, u, out = false) => { const x = c.x + (c.bx - c.x) * u, z = c.z + (c.bz - c.z) * u, dx = (c.bx - c.x) * 2, dz = (c.bz - c.z) * 2; R.worldGo(x, z); calm(); head(out ? x - dx : x + dx, out ? z - dz : z + dz); m0().aimPitch = 0; R.step(1); calm(); G.humans[0].rig.snap = true; R.render(); return W.status().dark; };
  const scene = () => { let o = m0().model.root; while (o.parent) o = o.parent; return o; };
  const lights = () => { const n = {}; scene().traverse((o) => { if (o.isLight) n[o.type] = (n[o.type] || 0) + 1; }); return n; };
  const light = (t) => { let f = null; scene().traverse((o) => { if (o.isLight && o.type === t && !f) f = o; }); return f; };
  // the picture's mean brightness (0..255) in a box of the screen (shares of its width and height), in the frame just drawn
  const px = (x0, y0, x1, y1) => { R.render(); const src = document.getElementById('c'), cv = document.createElement('canvas'); cv.width = 160; cv.height = 100; const g = cv.getContext('2d'); g.drawImage(src, 0, 0, 160, 100);
    const a = g.getImageData(Math.round(x0 * 160), Math.round(y0 * 100), Math.round((x1 - x0) * 160), Math.round((y1 - y0) * 100)).data; let s = 0; for (let i = 0; i < a.length; i += 4) s += 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]; return s / (a.length / 4); };
  const whole = () => px(0, 0, 1, 1), ahead = () => px(0.4, 0.36, 0.6, 0.54);   // (ahead: round the reticle, over the mech's head)
  // the same with the headlights put out for that one picture
  const unlit = (f) => { const B = light('SpotLight'), d = Object.getOwnPropertyDescriptor(B, 'intensity'); Object.defineProperty(B, 'intensity', { configurable: true, get: () => 0, set: () => {} }); const v = f(); Object.defineProperty(B, 'intensity', d); R.render(); return v; };
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return (n >> 16) + (n >> 8 & 255) + (n & 255); };
`;

async function runLogic(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'logic: ' + name, pass: !!pass, got: pass && !json ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  if (!(await C.ev(`typeof window.__rb.worldCaves === 'function'`))) { ok('__rb.worldCaves exists', false, 'missing'); return out; }

  // ---- waves, untouched
  let r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.start(0); R.manual(true); R.step(30); R.hold('KeyW', true); R.step(120); R.hold('KeyW', false); R.render();
    return { wave: G.wave, world: G.world, dark: W.status().dark, lights: lights(), hemi: light('HemisphereLight').intensity, sun: light('DirectionalLight').intensity, fog: '#' + scene().fog.color.getHexString(), far: scene().fog.far }; })()`);
  ok('waves untouched: no headlight made, the daylight and the haze as they were', r.wave === 1 && !r.world && r.dark === null && !r.lights.SpotLight && r.hemi === 1.25 && r.sun === 2.6 && r.fog === '#bfe3ff' && r.far === 210, r);

  // ---- a world run (a fresh page, as a run starts)
  await C.ev(`localStorage.clear()`); await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.world(true); R.start(0); R.manual(true); R.step(2); R.render(); window.__k0 = keys(); window.__r0 = Object.keys(rec() || {}).sort();
    const all = R.worldCaves(1500), bad = all.filter((c) => W.depthAt(c.x, c.z) !== 0 && W.depthAt(c.x, c.z) > 0.001 || Math.abs(W.depthAt(c.bx, c.bz) - 1) > 0.001 || !R.worldAt((c.x + c.bx) / 2, (c.z + c.bz) / 2).cave);
    const d0 = W.status().dark; window.__d0 = d0; const c = cave();
    return { n: all.length, bad, d0, lights: lights(), c, sig: JSON.stringify(all) }; })()`);
  ok(`the open world: full daylight, its haze, the headlights off`, r.d0.depth === 0 && r.d0.hemi === 1.25 && r.d0.sun === 2.6 && r.d0.fog === '#bfe3ff' && r.d0.far === 175 && r.d0.beam === 0 && r.d0.lamps === 0, r.d0);
  ok(`every cave within 1.5 km (${r.n}): depth 0 at its door, 1 as far back as a mech gets`, r.n >= 5 && r.bad.length === 0, r.bad);
  const lights0 = r.lights;

  // ---- driven in, the drive key held, from outside the door to the back wall
  r = await C.ev(String.raw`(() => { ${H} const c = cave(); stand(c, -0.4); const sig = JSON.stringify([W.status().parts, W.status().kits]), m = m0(), seen = []; R.hold('KeyW', true);
    let still = 0, last = null; for (let i = 0; i < 900 && still < 40; i++) { head(c.bx * 3 - c.x * 2, c.bz * 3 - c.z * 2); R.step(1); calm(); const q = [m.pos.x, m.pos.z]; still = i > 60 && last && Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.005 ? still + 1 : 0; last = q;
      if (i % 12 === 0) { R.render(); seen.push(W.status().dark); } }
    R.hold('KeyW', false); R.step(30); R.render(); seen.push(W.status().dark);
    return { seen, end: seen[seen.length - 1], lights: lights(), same: sig === JSON.stringify([W.status().parts, W.status().kits]), place: W.status().place }; })()`);
  const steps = []; for (const q of r.seen) if (!steps.length || q.depth > steps[steps.length - 1].depth + 0.02) steps.push(q);
  const down = (f) => steps.every((q, i) => !i || f(q) < f(steps[i - 1]));
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return (n >> 16) + (n >> 8 & 255) + (n & 255); };
  ok(`driven in with the drive key to the back (depth ${r.end.depth}): ${steps.length} steps in, each darker (sun, sky light, the sky, the haze)`, r.place === 'cave' && r.end.depth > 0.97 && steps.length >= 10 && down((q) => q.sun) && down((q) => q.hemi) && down((q) => lum(q.fog)) && down((q) => lum(q.sky[0])) && down((q) => lum(q.sky[2])) && down((q) => q.far), steps);
  ok(`the headlights: both lamps on inside, their reach, width and strength shrinking with the dark, never to nothing (deepest: ${r.end.reach} m, ${r.end.wide} rad, ${r.end.beam})`, down((q) => q.reach) && down((q) => q.wide) && steps.filter((q) => q.depth > 0.05).every((q) => q.lamps === 2 && q.beam > 0) && r.end.lamps === 2 && steps.filter((q) => q.depth >= 0.3).every((q, i, a) => !i || q.beam < a[i - 1].beam) && r.end.reach > 28 && r.end.wide > 0.6 && r.end.beam > 5, steps);
  ok('no light comes or goes at the door (the lights are the same in number): no material is rebuilt there', JSON.stringify(r.lights) === JSON.stringify(lights0) && r.lights.SpotLight === 1, [lights0, r.lights]);
  ok('the parts and kits lie where they lay', r.same, r.same);

  // ---- the picture
  r = await C.ev(String.raw`(() => { ${H} const c = cave(), row = []; for (const u of [-0.5, 0.1, 0.35, 0.6, 0.97]) { stand(c, u); row.push({ u, unlit: unlit(whole), lit: whole(), ahead: ahead(), aheadUnlit: unlit(ahead), mech: px(0.42, 0.56, 0.58, 0.76) }); }
    stand(c, 0.97, true); const back = { ahead: px(0.31, 0.36, 0.38, 0.55), aheadUnlit: unlit(() => px(0.31, 0.36, 0.38, 0.55)) }; return { row, back }; })()`);
  const f1 = (v) => v.toFixed(1);
  ok(`the picture darkens each step in, without the headlights (${r.row.map((q) => f1(q.unlit)).join(' > ')}), to under a fifth of the open air's`, r.row.every((q, i) => !i || q.unlit < r.row[i - 1].unlit) && r.row[4].unlit < r.row[0].unlit / 5, r.row);
  ok(`and the lit picture is far darker deep in than outside (${f1(r.row[0].lit)} -> ${f1(r.row[4].lit)})`, r.row[4].lit < r.row[0].lit / 3, r.row);
  ok(`deep in, the headlights show what's ahead (brightness ${f1(r.row[4].ahead)}, against ${f1(r.row[4].aheadUnlit)} without them; half way ${f1(r.row[3].ahead)} / ${f1(r.row[3].aheadUnlit)})`, r.row[4].ahead > 50 && r.row[4].ahead > r.row[4].aheadUnlit * 5 && r.row[3].ahead > 50 && r.row[3].ahead > r.row[3].aheadUnlit * 5, r.row);
  ok(`turned round, the way out shows in them too (${f1(r.back.ahead)} / ${f1(r.back.aheadUnlit)})`, r.back.ahead > 15 && r.back.ahead > r.back.aheadUnlit * 1.5, r.back);
  ok(`the mech is seen in them, neither black nor dazzling (${r.row.slice(2).map((q) => f1(q.mech)).join(', ')})`, r.row.slice(2).every((q) => q.mech > 30 && q.mech < 170), r.row);
  // the pool of light on the back wall shrinks: the lit share of the picture, at the same stand, at each depth's settings
  r = await C.ev(String.raw`(() => { ${H} const c = cave(); stand(c, 0.5); const real = W.depthAt, share = (d) => { W.depthAt = () => d; R.render(); const src = document.getElementById('c'), cv = document.createElement('canvas'); cv.width = 160; cv.height = 100; const g = cv.getContext('2d'); g.drawImage(src, 0, 0, 160, 100); const a = g.getImageData(0, 0, 160, 100).data; let n = 0; for (let i = 0; i < a.length; i += 4) if (0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2] > 60) n++; return n / 16000; };
    const s = [0.4, 0.6, 0.8, 1].map(share); W.depthAt = real; R.render(); return s; })()`);
  ok(`seen from one spot, the pool of light is smaller the darker it is (${r.map((v) => (v * 100).toFixed(1) + '%').join(' > ')} of the picture)`, r.every((v, i) => v > 0.02 && (!i || v < r[i - 1])), r);

  // ---- the aim, the walls
  r = await C.ev(String.raw`(() => { ${H} const c = cave(); stand(c, 0.6); const B = light('SpotLight'), dir = () => { R.render(); const v = B.target.position.clone().sub(B.position); return [Math.atan2(-v.x, -v.z), v.y]; };
    const m = m0(), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)), errs = []; for (const a of [0, 1.2, 2.9, -2]) { m.torsoYaw = a; m.input.aimYaw = a; errs.push(Math.abs(wrap(dir()[0] - a))); }
    const lv = dir()[1]; m.aimPitch = 0.4; const up = dir()[1]; m.aimPitch = 0;
    const cv = [...W.chunks.values()].flatMap((ch) => ch.caves).find((q) => Math.hypot(q.c.x - c.x, q.c.z - c.z) < 1), see = () => { R.render(); return cv.parts.slice(0, 4).map((p) => p.material.transparent); };
    stand(c, 0.6); const inn = see(); const roof = [0.6, 0.75, 0.97].flatMap((u) => [0, 0.5, -0.4].map((p) => { stand(c, u); m.aimPitch = p; G.humans[0].rig.snap = true; const t = see()[3]; m.aimPitch = 0; return t; })); const side = []; for (const s of [1, -1]) { stand(c, 0.6); const h0 = m.torsoYaw + s * Math.PI / 2; m.torsoYaw = m.input.aimYaw = m.legHeading = h0; G.humans[0].rig.snap = true; side.push(see()); }
    stand(c, -1.2); const outside = see();
    return { errs, lv, up, inn, roof, side, outside }; })()`);
  ok('the headlights point where the mech looks, round and up', r.errs.every((e) => e < 0.25) && r.up > r.lv + 3, r);
  ok('looking in, the walls each side and at the back are solid; turned side on, only the wall behind the camera is see-through', !r.inn[0] && !r.inn[1] && !r.inn[2] && r.side.every((q) => q[0] !== q[1] && !q[2]) && r.side[0][0] !== r.side[1][0], r);

  ok('well inside, the roof is solid, aim level, up or down (the camera keeps under it)', r.roof.every((t) => !t), r.roof);

  // ---- out again: driven, and by a teleport
  r = await C.ev(String.raw`(() => { ${H} const c = cave(), m = m0(); stand(c, 0.97, true); R.hold('KeyW', true); let i, dark = W.status().dark.depth; for (i = 0; i < 900; i++) { head(c.x * 3 - c.bx * 2, c.z * 3 - c.bz * 2); R.step(1); calm(); if (Math.hypot(m.pos.x - c.bx, m.pos.z - c.bz) > 30) break; } R.hold('KeyW', false); R.step(5); R.render(); const a = W.status().dark;
    stand(c, 0.97); const deep = W.status().dark.depth; R.worldGo(c.x + (c.x - c.bx) * 3, c.z + (c.z - c.bz) * 3); calm(); R.step(1); R.render(); return { i, dark, a, deep, b: W.status().dark, d0: window.__d0 }; })()`);
  ok(`driven out (${r.i} ticks): the daylight, the sky and the haze exactly as before, the headlights off`, r.dark > 0.9 && r.i < 900 && JSON.stringify(r.a) === JSON.stringify(r.d0), r);
  ok('and after a teleport out', r.deep > 0.9 && JSON.stringify(r.b) === JSON.stringify(r.d0), r);

  // ---- down deep in: dimmed, not out
  r = await C.ev(String.raw`(() => { ${H} const c = cave(); const up = stand(c, 0.9).beam, m = m0(), g = m.glow; m.glow = 0; R.render(); const down = W.status().dark.beam; m.glow = g; R.render(); return { up, down, back: W.status().dark.beam }; })()`);
  ok(`powered down deep in, the headlights dim but don't go out (${r.up} -> ${r.down})`, r.down > 0 && r.down < r.up * 0.6 && r.back === r.up, r);

  // ---- saves
  r = await C.ev(String.raw`(() => { ${H} return { k0: window.__k0, k1: keys(), r0: window.__r0, r1: Object.keys(rec() || {}).sort() }; })()`);
  ok('the storage keys the same, nothing new in the record', JSON.stringify(r.k0) === JSON.stringify(r.k1) && JSON.stringify(r.r0) === JSON.stringify(r.r1), r);
  return out;
}

async function runTouch(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'touch: ' + name, pass: !!pass, got: pass && !json ? undefined : got }); return !!pass; };
  for (const [w, h] of [[844, 390], [740, 360], [667, 375]]) {
    await C.ev(`localStorage.clear()`).catch(() => {});
    await C.open(w, h, true);
    const r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.world(true); R.start(0); R.manual(true); R.step(2); const dark = stand(cave(), 0.9); return { dark, lit: ahead(), un: unlit(ahead) }; })()`);
    await C.ev(`window.__rb.manual(false)`); await sleep(400);
    const b = await C.ev(`[...document.querySelectorAll('.tp-btn:not(.tp-off):not(.tp-pause)')].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none').map((e) => { const q = e.getBoundingClientRect(); return [q.left, q.top, q.right, q.bottom].map(Math.round); })`);
    ok(`${w}x${h}, deep in a cave (depth ${r.dark.depth}): at most 4 touch buttons (${b.length}), each on screen`, r.dark.depth > 0.85 && b.length >= 1 && b.length <= 4 && b.every((q) => q[0] >= 0 && q[1] >= 0 && q[2] <= w && q[3] <= h), { r, b });
    ok(`${w}x${h}: what's ahead still lit (${r.lit.toFixed(1)}, against ${r.un.toFixed(1)} without the headlights)`, r.lit > 50 && r.lit > r.un * 5, r);
    const doc = await C.ev(`[document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight]`);
    ok(`${w}x${h}: no scroll`, doc[0] <= 0 && doc[1] <= 0, doc);
  }
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
