#!/usr/bin/env node
// Robot Battle endless world check (#255: checkpoints). The boys' note on #167: "can you make it so that there are
// checkpoints and when you get knocked down you go to them?"; Daniel: "yes to checkpoints".
//
// Each run is its own headless Chrome (muted, not detached, killed with its profile deleted on every way out, as
// scripts/rb-world.mjs does). Made-up profiles only.
//   logic  - at 1280 x 800, through window.__rb:
//            * waves untouched: knocked down, the mech reboots where it fell; no checkpoint anywhere;
//            * the posts: one in every other chunk (a checkerboard: cx + cz even), none in a boss's chunk, inside its
//              chunk, off the start, clear of the obstacles; the same spots after the chunks go and come back;
//            * knocked down before any checkpoint is reached: it reboots where it fell, as before;
//            * reach checkpoint A (it goes green, its beacon off, the toast shows), drive on 400 m, knocked down: it
//              reboots at A, powered up, the chunks round it loaded;
//            * reach B: knocked down far off, back at B; touch A again: A is the checkpoint again;
//            * a squadmate (fixed into the squad in the world) comes back beside the mech at the checkpoint;
//            * the storage keys the same, nothing new in the record (a checkpoint is kept for the run only).
//   touch  - at 844 x 390 with touch: a checkpoint reached with the game's own loop running: the toast shows inside the
//            screen, at most 4 touch buttons, no sideways scroll.
//
// Usage:
//   node scripts/rb-world-checkpoints.mjs                     # ./robot-battle.html: logic, then touch
//   node scripts/rb-world-checkpoints.mjs --logic             # the logic run only
//   node scripts/rb-world-checkpoints.mjs path/or/url.html --json
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-checkpoints-'));
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
  const R = window.__rb, G = R.Game, W = R.World, C = R.WORLD.chunk, CP = R.WORLD.checkpoints || { grid: 2, reach: 6 };
  const reload = () => { W.sweep?.(); for (const k of [...W.chunks.keys()]) W.unload(k); W.update(true); W.sweep?.(); };
  const keys = () => Object.keys(localStorage).sort();
  const rec = () => JSON.parse(localStorage.getItem('robotbattle.facts.tester') || 'null');
  const m0 = () => G.humans[0].mech;
  const at = () => ({ x: m0().pos.x, z: m0().pos.z });
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // the world's robots near player 1 sent far off (so none downs it or mends it in a test), and player 1 kept up
  const calm = () => { for (const r of G.robots) if (r.wkey && !G.squad.includes(r) && Math.hypot(r.pos.x - m0().pos.x, r.pos.z - m0().pos.z) < 400) r.pos.x += 5000; };
  // player 1 knocked down, then the frames for its power-down to run out (PLAYER.downTime 8 s, and 1 s more)
  const knock = () => { calm(); R.hurt(0, 1e6); const down = m0().state; const p = at(); for (let i = 0; i < 9; i++) { calm(); R.step(60); } return { down, fell: p, state: m0().state, now: at(), moved: d2(p, at()) }; };
  // the checkpoint posts loaded (the hook; on a page without it, none)
  const cps = () => W.status().checkpoints || [];
  // a checkpoint to reach: the nearest post loaded; on a page without checkpoints, the middle of the nearest checkerboard chunk
  const pick = (skip = []) => { const p = at(), l = cps().filter((c) => !skip.includes(c.key)).sort((a, b) => d2(a, p) - d2(b, p));
    if (l.length) return l[0]; const cx = Math.floor(p.x / C), cz = Math.floor(p.z / C) + 1 + skip.length * 2; const k = ((cx + cz) % 2 + 2) % 2 ? cz + 1 : cz;
    return { key: cx + ',' + k, x: (cx + 0.5) * C, z: (k + 0.5) * C, fake: true }; };
  const reach = (c) => { R.teleport(0, c.x + 2, c.z); calm(); R.step(3); return W.status().checkpoint; };
  const st = (id) => R.state().robots.find((q) => q.id === id);
  // a Quick Fix done through the hooks (as scripts/rb-world-squad-saved.mjs does)
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
  };
  const findFoe = () => {
    for (let k = 0; k < 40; k++) {
      const p = m0().pos, r = G.robots.filter((q) => q.wkey && q.state === 'glitched' && q.type !== 'drone' && !R.ROBOT_TYPES[q.type].noSquad && !R.ROBOT_TYPES[q.type].boss)
        .sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z))[0];
      if (r) return r;
      R.worldGo(p.x + 200, p.z + 37 * (k % 3));
    }
    return null;
  };
  const fixOne = (name) => { const r = findFoe(); if (!r) return { none: true }; R.damage(r.id, 1e6, 'gun'); R.teleport(0, r.pos.x + 2.5, r.pos.z); const c = R.choose(r.id, 'fix', name); const solved = c.ok && solve(r.id); return { id: r.id, ok: c.ok, solved }; };
`;

async function runLogic(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'logic: ' + name, pass: !!pass, got: pass && !json ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);

  // ---- waves, untouched
  let r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.start(0); R.manual(true); R.step(30); R.teleport(0, 20, 14); R.step(2); const k = knock();
    return { wave: G.wave, world: G.world, ...k, cps: (W.status().checkpoints || []).length, cp: W.status().checkpoint ?? null, toast: !!document.querySelector('#cpToast.on') }; })()`);
  ok('waves: knocked down, the mech reboots where it fell; no checkpoint anywhere', r.wave === 1 && !r.world && r.down === 'down' && r.state === 'up' && r.moved < 1 && r.cps === 0 && r.cp === null && !r.toast, r);

  // ---- a world run (a fresh page, as a run starts)
  await C.ev(`localStorage.clear()`); await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.world(true); R.start(0); R.manual(true); R.step(2); window.__k0 = keys(); window.__r0 = Object.keys(rec() || {}).sort();
    return { world: G.world, has: Array.isArray(W.status().checkpoints) }; })()`);
  ok('into the world; World.status().checkpoints there', r.world && r.has, r);

  // ---- the posts: where they stand, and the same after the chunks go and come back
  r = await C.ev(String.raw`(() => { ${H} const seen = new Map(), bad = [];
    for (const [x, z] of [[0, 0], [700, 250], [-900, 600], [300, -1200]]) {
      R.worldGo(x, z); const l = cps(), loaded = [...W.chunks.values()];
      for (const c of l) {
        const cx = Math.floor(c.x / C), cz = Math.floor(c.z / C), ch = W.chunks.get(c.key);
        if (c.key !== cx + ',' + cz) bad.push(['not in its chunk', c]);
        if ((((cx + cz) % CP.grid) + CP.grid) % CP.grid) bad.push(['not a checkerboard chunk', c]);
        if (W.bossAt(cx, cz)) bad.push(['in a boss chunk', c]);
        if (Math.hypot(c.x, c.z) <= CP.from) bad.push(['at the start', c]);
        const own = [...ch.obs, ...ch.props.flatMap((p) => p.obs || [])];
        if (own.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < o.r + 1)) bad.push(['in an obstacle', c]);
        if (W.inCave(c.x, c.z) || W.inTower(c.x, c.z)) bad.push(['in a cave or tower', c]);
        if (c.reached || c.lamp !== 'blue' || !c.beacon) bad.push(['not blue with its beacon before it is reached', c]);
        seen.set(c.key, c.x + ',' + c.z);
      }
      // every checkerboard chunk loaded with no post: only a boss chunk, or the start's (or none fits)
      const without = loaded.filter((ch) => !(((ch.cx + ch.cz) % CP.grid + CP.grid) % CP.grid) && !l.some((c) => c.key === ch.key));
      window.__without = (window.__without || 0) + without.filter((ch) => !W.bossAt(ch.cx, ch.cz) && Math.hypot((ch.cx + 0.5) * C, (ch.cz + 0.5) * C) > 150).length;
      reload(); const again = cps();
      for (const c of l) { const b = again.find((q) => q.key === c.key); if (!b || b.x !== c.x || b.z !== c.z) bad.push(['moved after a reload', c, b]); }
    }
    return { n: seen.size, bad: bad.slice(0, 6), without: window.__without, near: (R.worldGo(0, 0), cps().map((c) => Math.round(Math.hypot(c.x, c.z)))).sort((a, b) => a - b).slice(0, 3) }; })()`);
  ok(`the posts (${r.n}): each in a checkerboard chunk, inside it, off the start, not in a boss chunk, an obstacle, a cave or a tower; blue, beacon on; the same after a reload`, r.n > 20 && r.bad.length === 0, r);
  ok(`almost every checkerboard chunk away from the start has a post (${r.without} without), and one is near the start (${r.near})`, r.without <= 2 && r.near[0] < 160, r);

  // ---- knocked down before any checkpoint: where it fell
  r = await C.ev(String.raw`(() => { ${H} R.worldGo(-260, 410); calm(); R.step(2); return { cp: W.status().checkpoint ?? null, ...knock() }; })()`);
  ok('knocked down before any checkpoint is reached: it reboots where it fell', r.cp === null && r.down === 'down' && r.state === 'up' && r.moved < 1, r);

  // ---- reach A, drive on, knocked down: back at A
  r = await C.ev(String.raw`(() => { ${H} R.worldGo(150, 150); const A = pick(); window.__A = A; const cp = reach(A); R.render();
    const s = cps().find((c) => c.key === A.key), toast = document.querySelector('#cpToast.on'), tr = toast?.getBoundingClientRect();
    R.worldGo(A.x + 400, A.z + 150); const far = Math.round(d2(at(), A)), aLoaded = W.chunks.has(A.key);
    const k = knock(); R.step(2);
    return { A, cp, s, toast: !!toast, text: toast?.textContent, svg: !!toast?.querySelector('svg'), tr: tr && [tr.left, tr.top, tr.right, tr.bottom], far, aLoaded, ...k, dA: d2(at(), A), loaded: W.chunks.has(A.key), cps: cps().length, status: W.status().checkpoint }; })()`);
  ok('reach checkpoint A: it is player 1\'s checkpoint, green, its beacon off, the toast (the flag icon, "Checkpoint!") shows', !r.A.fake && r.cp?.key === r.A.key && r.s?.reached && r.s?.lamp === 'green' && r.s?.beacon === false && r.toast && /Checkpoint/.test(r.text) && r.svg, r);
  ok(`drive on ${r.far} m (A's chunk unloaded), knocked down: it reboots back at A, powered up, the chunks round it loaded`, r.far > 350 && !r.aLoaded && r.down === 'down' && r.state === 'up' && r.dA < 4 && r.loaded && r.cps > 0, r);

  // ---- reach B: back at B; A touched again: back at A
  r = await C.ev(String.raw`(() => { ${H} const A = window.__A; R.worldGo(A.x + 250, A.z - 200); const B = pick([A.key]); const cp = reach(B);
    R.worldGo(B.x - 380, B.z + 120); const k1 = knock(); const dB = d2(at(), B);
    R.worldGo(A.x, A.z + 30); const cpA = reach(A); R.worldGo(A.x + 300, A.z + 300); const k2 = knock(); const dA = d2(at(), A);
    return { A: A.key, B: B.key, fake: !!B.fake, cp: cp?.key, k1, dB, cpA: cpA?.key, k2, dA, reached: W.status().cpReached }; })()`);
  ok('reach B, knocked down far off: back at B', !r.fake && r.cp === r.B && r.k1.down === 'down' && r.k1.state === 'up' && r.dB < 4, r);
  ok('A touched again is the checkpoint again: knocked down, back at A', r.cpA === r.A && r.k2.state === 'up' && r.dA < 4 && r.reached >= 2, r);

  // ---- a squadmate comes back with the mech
  r = await C.ev(String.raw`(() => { ${H} const f = fixOne('Bolt'); R.step(2); const A = window.__A; R.worldGo(A.x, A.z + 30); reach(A);
    R.worldGo(A.x - 350, A.z - 250); const k = knock(); R.step(2); const mate = G.squad.find((q) => q.id === f.id);
    return { f, n: G.squad.length, dA: d2(at(), A), k, mate: mate && Math.round(Math.hypot(mate.pos.x - m0().pos.x, mate.pos.z - m0().pos.z)), ys: mate && Math.round((mate.pos.y - R.World.h(mate.pos.x, mate.pos.z)) * 10) / 10 }; })()`);
  ok(`a squadmate fixed in the world comes back beside the mech at the checkpoint (${r.mate} m off)`, r.f?.solved && r.n >= 1 && r.dA < 4 && r.k.state === 'up' && r.mate != null && r.mate < 16, r);

  // ---- saves
  r = await C.ev(String.raw`(() => { ${H} return { k0: window.__k0, k1: keys(), r0: window.__r0, r1: Object.keys(rec() || {}).sort(), cpInSave: /checkpoint|cpReached/i.test(JSON.stringify(Object.fromEntries(keys().map((k) => [k, localStorage.getItem(k)])))) }; })()`);
  ok('the storage keys the same, nothing new in the record, no checkpoint saved', JSON.stringify(r.k0) === JSON.stringify(r.k1) && JSON.stringify(r.r0.filter((k) => r.r1.includes(k))) === JSON.stringify(r.r0) && r.r1.every((k) => r.r0.includes(k) || !/checkpoint|^cp/i.test(k)) && !r.cpInSave, r);
  return out;
}

async function runTouch(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'touch: ' + name, pass: !!pass, got: pass && !json ? undefined : got }); return !!pass; };
  await C.ev(`localStorage.clear()`).catch(() => {});
  await C.open(844, 390, true);
  await C.ev(`(() => { const R = window.__rb; R.player('tester'); R.world(true); R.start(0); R.manual(false); return true; })()`);
  const r = await C.ev(String.raw`(() => { ${H} R.manual(true); R.worldGo(150, 150); const A = pick(); R.teleport(0, A.x + 12, A.z); calm(); R.manual(false); window.__A = A; return A; })()`);
  // the game's own loop: player 1 walked onto the post
  let shown = null;
  for (let i = 0; i < 30 && !shown; i++) {
    await C.ev(`(() => { const R = window.__rb, A = window.__A, m = R.Game.humans[0].mech; R.teleport(0, A.x + Math.max(2, 12 - ${i}), A.z); return true; })()`);
    await sleep(100);
    shown = await C.ev(`(() => { const e = document.querySelector('#cpToast.on'); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: innerWidth, h: innerHeight, text: e.textContent }; })()`);
  }
  ok('a checkpoint reached with the game running: the toast shows inside the screen', !r.fake && shown && shown.l >= 0 && shown.t >= 0 && shown.r <= shown.w && shown.b <= shown.h, { r, shown });
  const n0 = await C.ev(`[...document.querySelectorAll('.tp-btn:not(.tp-off):not(.tp-pause)')].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none').length`);
  ok(`at most 4 touch buttons (${n0})`, n0 <= 4, n0);
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
