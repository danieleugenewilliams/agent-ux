#!/usr/bin/env node
// Robot Battle endless world check (#167, slice 1: World): a new mode next to the waves, picked on the pilot pick.
//
// Each run is its own headless Chrome (muted, not detached, killed with its profile deleted on every way out, as
// scripts/rb-modes.mjs does). Made-up profiles only.
//   logic  - at 1280 x 800, through window.__rb:
//            * waves untouched: the world chip off by default, a run starts wave 1 in the meadow with no chunks; the wave
//              chip hides while World is picked; World can't be picked mid-run;
//            * the world: picked by the hook, E on the pilot pick and the pad's X; a run starts with no wave, the meadow put
//              away, the chunks round the start loaded, the start clear (no obstacle or robot near it), nextWave refused;
//            * places: all six (mountains, city, junkyard, desert, snowy mountains, cave) within 900 m of the start; the
//              same seed gives the same world after a reload; towers with the antenna on the tallest in a city, a cave's
//              walls where a cave is;
//            * parts on the ground: walked onto, into the bag and the found count (HUD and pause menu), not back when the
//              chunk loads again; a world robot beaten and fixed on a math board into the squad, another salvaged, neither
//              back; the save keys unchanged (no world key; #189: the record's one new field is world.taken, holding the
//              part picked up: scripts/rb-world-saved.mjs checks it over a reload and through a backup);
//            * bounded: a 6 km walk out and back keeps chunks, geometries, obstacles, props and robots bounded.
//   touch  - at 844 x 390 with touch: the world chip tapped on (at least 44 px, clear of the kidbar's other chips), a pilot
//            tapped to start, at most 4 touch buttons, a robot downed and FIX tapped opens its board.
//
// Usage:
//   node scripts/rb-world.mjs                    # ./robot-battle.html: logic, then touch
//   node scripts/rb-world.mjs --logic            # the logic run only
//   node scripts/rb-world.mjs path/or/url.html --json
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-'));
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

// a record for child id with best = n written straight to storage (as this build would save it); the page is then reloaded.

// ---- in the page ----
const H = String.raw`
  const R = window.__rb, G = R.Game, W = R.World;
  const st = (id) => R.state().robots.find((q) => q.id === id);
  // a Quick Fix done through the hooks (as scripts/rb-centipede.mjs does): puzzles answered, plugs wired, burnt ones patched
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
  // the nearest glitched world robot (not a drone: one robot, one key), walking further out until one is loaded
  const findFoe = (skip = []) => {
    for (let k = 0; k < 40; k++) {
      const p = G.humans[0].mech.pos, r = G.robots.filter((q) => q.wkey && q.state === 'glitched' && q.type !== 'drone' && !skip.includes(q.wkey))
        .sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z))[0];
      if (r) return r;
      R.worldGo(p.x + 200, p.z + 37 * (k % 3));
    }
    return null;
  };
  const keys = () => Object.keys(localStorage).sort();
`;
// a grid scan of the places within radius rad (step m): the first spot of each place, nearest the start first
const SCAN = (rad, step) => String.raw`(() => { const R = window.__rb, first = {}, n = {};
  for (let x = -${rad}; x <= ${rad}; x += ${step}) for (let z = -${rad}; z <= ${rad}; z += ${step}) {
    if (Math.hypot(x, z) > ${rad}) continue;
    const p = R.worldAt(x, z).place; n[p] = (n[p] || 0) + 1;
    if (!first[p] || Math.hypot(x, z) < Math.hypot(first[p][0], first[p][1])) first[p] = [x, z];
  }
  return { first, n }; })()`;
const SIG = String.raw`(() => { const R = window.__rb; let s = ''; for (let x = -1200; x <= 1200; x += 23) for (let z = -1200; z <= 1200; z += 29) { const a = R.worldAt(x, z); s += a.place[0] + a.h.toFixed(2); }
  let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return { h, n: s.length }; })()`;

async function runLogic(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'logic: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  if (!(await C.ev(`typeof window.__rb.world === 'function'`))) { ok('__rb.world exists', false, 'missing'); return out; }
  // ---- waves, untouched
  let r = await C.ev(String.raw`(() => { ${H} R.player('tester'); const w0 = R.world(); const k0 = keys();
    const b = document.querySelector('#worldB'), vis = !!b && b.getClientRects().length > 0;
    R.start(0); R.manual(true); const s = R.state();
    return { w0, vis, label: b?.getAttribute('aria-label'), wave: G.wave, world: G.world, sw: s.world, chunks: W.chunks.size, meadow: !!R.World.status().meadow, robots: G.robots.length, k0, k1: keys(), mid: R.world(true) }; })()`);
  ok('on the pilot pick the world chip shows, on Waves (not picked)', r.vis && r.w0.pick === false && r.w0.shown && /waves/i.test(r.label), r);
  ok('waves picked (the default): the run starts wave 1 in the meadow, no chunks, state().world null', r.wave === 1 && r.world === false && r.sw === null && r.chunks === 0 && r.meadow && r.robots > 0, r);
  ok('World can\'t be picked mid-run', r.mid.ok === false && r.mid.why === 'playing' && r.mid.on === false, r.mid);
  ok('no new storage key from the waves run', JSON.stringify(r.k1.filter((k) => !r.k0.includes(k))) === JSON.stringify([]) || r.k1.every((k) => !/world/i.test(k)), { k0: r.k0, k1: r.k1 });

  // ---- picking it: E, the pad's X, the hook; the wave chip hides while it's picked
  await C.ev(CLEAR); await C.open(1280, 800, false);
  await C.ev(`(() => { const R = window.__rb; R.player('tester'); R.Facts.rec.waves = { ...(R.Facts.rec.waves || {}), best: 6 }; R.Facts.save(); return true; })()`);
  await C.open(1280, 800, false);
  await C.ev(`(() => { window.__pad = { id: 'check pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; window.__rb.player('tester'); return true; })()`);
  await sleep(150);
  const wp0 = await C.ev(`window.__rb.wavePick('state').shown`);
  await C.key('KeyE', 69); await sleep(80);
  r = await C.ev(`(() => { const R = window.__rb, b = document.querySelector('#worldB'); return { ...R.world(), chip: b.dataset.w, label: b.getAttribute('aria-label'), wave: R.wavePick('state').shown, pilot: !!R.Game.pilot }; })()`);
  ok('E on the pilot pick: World picked (the chip a mountain), the wave chip hidden, no pilot started', wp0 && r.pick && r.chip === 'world' && /world/i.test(r.label) && !r.wave && !r.pilot, { wp0, r });
  await C.ev(`(() => { navigator.getGamepads = () => [window.__pad]; return true; })()`); await sleep(120);
  await C.padBtn(2);
  r = await C.ev(`(() => { const R = window.__rb; return { ...R.world(), chip: document.querySelector('#worldB').dataset.w, wave: R.wavePick('state').shown }; })()`);
  ok('pad X: back to Waves (the wave chip back)', !r.pick && r.chip === 'waves' && r.wave, r);
  await C.padBtn(2);
  r = await C.ev(`window.__rb.world()`);
  ok('pad X again: World', r.pick === true, r);
  await C.padBtn(0); await sleep(200);
  await C.ev(`(() => { navigator.getGamepads = () => []; window.__rb.manual(true); return true; })()`);
  r = await C.ev(String.raw`(() => { ${H} const s = W.status(), p = G.humans[0].mech.pos;
    const near = R.obstacles.filter((o) => Math.hypot(o.x - p.x, o.z - p.z) < 30 + o.r).length, foes = G.robots.filter((q) => q.state !== 'ally' && Math.hypot(q.pos.x - p.x, q.pos.z - p.z) < 60).length;
    const nw = R.nextWave(); const hud = document.querySelector('#foundN')?.textContent;
    return { s, near, foes, nw: { ok: nw.ok, why: nw.why }, wave: G.wave, cleared: G.cleared, hud, waveHud: R.state().wave }; })()`);
  ok('pad A starts the run in the world: no wave, the meadow put away, 25 chunks loaded, the fog drawn in', r.s.on && r.wave === 0 && !r.s.meadow && r.s.chunks === 25 && r.s.fog[1] < 200, r);
  ok('the start is clear: no obstacle within 30 m, no robot within 60 m', r.near === 0 && r.foes === 0, r);
  ok('no waves in the world: nextWave refused, never cleared', r.nw.ok === false && r.nw.why === 'world' && !r.cleared, r);
  ok('the HUD\'s found count reads 0', r.hud?.trim() === '0', r.hud);

  // ---- places
  const scan = await C.ev(SCAN(900, 12));
  const places = ['mountains', 'city', 'junkyard', 'desert', 'snow', 'cave'];
  ok('all six places within 900 m of the start: ' + places.map((p) => p + ' ' + (scan.n[p] || 0)).join(', '), places.every((p) => scan.first[p]), scan);
  const sig1 = await C.ev(SIG);
  r = await C.ev(String.raw`(() => { ${H} const out = {};
    const city = ${JSON.stringify(scan.first.city || [0, 0])}; R.worldGo(city[0], city[1]); const a = W.status(); out.city = { place: a.place, towers: a.towers, antennas: a.antennas };
    const cave = ${JSON.stringify(scan.first.cave || [0, 0])}; R.worldGo(cave[0], cave[1]); const b = W.status(); const hall = [...W.chunks.values()].flatMap((ch) => ch.caves)[0]?.c;
    out.cave = { place: b.place, caves: b.caves, inCave: !!hall && R.worldAt(hall.mx, hall.mz).cave, hallPlace: hall ? R.worldAt(hall.mx, hall.mz).place : null };
    // the antenna: on the tallest tower of its chunk
    out.tall = [...W.chunks.values(), ...[]].every((ch) => { const t = ch.towers.find((q) => q.antenna); return !t || ch.towers.every((q) => q.top <= t.top); });
    return out; })()`);
  ok('in a city: towers, and an antenna on the tallest', r.city.place === 'city' && r.city.towers > 0 && r.city.antennas > 0, r.city);
  ok('in cave country: a cave built, its hall inside it', r.cave.place === 'cave' && r.cave.caves > 0 && r.cave.inCave && r.cave.hallPlace === 'cave', r.cave);
  ok('each chunk\'s antenna is on its tallest tower', r.tall, r);

  // ---- parts on the ground
  r = await C.ev(String.raw`(() => { ${H} R.worldGo(0, 0); const s0 = W.status(), q = s0.parts.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0]; if (!q) return { none: true, s0 };
    const bag0 = G.bag[q.part] || 0, t = R.teleport(0, q.x + 0.5, q.z); R.step(2); const s1 = W.status();
    window.__q = { q, bag0, bag1: G.bag[q.part] || 0, found: s1.found }; R.manual(false); return { wait: true }; })()`);
  await sleep(300);   // (the HUD is drawn with the frame)
  r = await C.ev(String.raw`(() => { ${H} R.manual(true); const { q, bag0, bag1, found } = window.__q, hud = document.querySelector('#foundN')?.textContent;
    document.dispatchEvent(new Event('pointerlockchange')); const tm = document.querySelector('#tmFoundN')?.textContent, paused = G.paused; document.querySelector('#go')?.click();
    // walk away (its chunk unloaded) and back: it isn't there again
    R.worldGo(q.x + 2000, q.z); const away = W.chunks.size; R.worldGo(0, 0); const back = W.status().parts.some((p) => p.x === q.x && p.z === q.z);
    return { q, bag0, bag1, found, hud, tm, paused, back, away }; })()`);
  ok('a part on the ground, walked onto: into the bag, found 1', !r.none && r.bag1 === r.bag0 + 1 && r.found === 1, r);
  ok('the found count reads 1 on the HUD and in the pause menu', r.hud?.trim() === '1' && r.tm?.trim() === '1', r);
  ok('its chunk unloaded and loaded again: the part isn\'t back', !r.back, r);

  // ---- robots: one fixed on a math board into the squad, one salvaged; neither comes back
  r = await C.ev(String.raw`(() => { ${H} const out = {};
    const a = findFoe(); if (!a) return { none: 'no robot found' };
    R.damage(a.id, 1e6, 'gun'); R.teleport(0, a.pos.x + 2.5, a.pos.z); const ch = R.choose(a.id, 'fix'); const sa = st(a.id);
    out.fix = { ok: ch.ok, why: ch.why, board: sa?.board ? { wave: sa.board.wave, math: sa.board.math, slots: sa.board.slots?.length } : null, facts: sa?.wires?.facts ? sa.wires.facts.filter(Boolean).length : 0 };
    out.solved = solve(a.id); out.squad = G.squad.includes(a); out.akey = a.wkey;
    const b = findFoe([a.wkey]); if (!b) return { ...out, none: 'no second robot' };
    R.damage(b.id, 1e6, 'gun'); R.teleport(0, b.pos.x + 2.5, b.pos.z); const parts0 = G.parts; const c = R.choose(b.id, 'parts', undefined, [b.parts[0]]);
    out.salvage = { ok: c.ok, gone: !G.robots.includes(b), bag: c.bag[b.parts[0]] || 0 }; out.bkey = b.wkey;
    W.sweep(); out.gone = [W.gone.has(a.wkey), W.gone.has(b.wkey)];
    // walk far away and back: neither key spawns again
    const p = G.humans[0].mech.pos, px = p.x, pz = p.z; R.worldGo(px + 3000, pz); W.sweep(); R.worldGo(px, pz); W.sweep();
    out.again = G.robots.filter((q) => q.state === 'glitched' && (q.wkey === a.wkey || q.wkey === b.wkey)).length;
    out.key = 'robotbattle.facts.tester'; const rec = JSON.parse(localStorage.getItem(out.key) || 'null'); out.recWorld = rec && Object.keys(rec).filter((k) => /world/i.test(k)); out.recWorldIn = rec?.world ? Object.keys(rec.world) : null; out.taken = rec?.world?.taken ?? null; out.picked = window.__q?.q?.wkey ?? null;
    out.keys = keys();
    return out; })()`);
  ok('a world robot beaten: its Quick Fix opens on a math board (wave 1\'s plan: a fact per plug)', !r.none && r.fix.ok && r.fix.board && r.fix.board.wave === 1 && r.fix.facts > 0, r);
  ok('... fixed through the board, it joins the squad', r.solved && r.squad, r);
  ok('another beaten and salvaged: taken apart, its part in the bag', r.salvage?.ok && r.salvage.gone && r.salvage.bag >= 1, r);
  ok('both gone for good (swept as gone; not back after a walk away and back)', r.gone?.every(Boolean) && r.again === 0, r);
  ok('the save: no world key; the record\'s one world field is world.taken, holding just the part picked up (#189)', r.keys && r.keys.every((k) => !/world/i.test(k)) && JSON.stringify(r.recWorld) === '["world"]'
    && JSON.stringify(r.recWorldIn) === '["taken"]' && JSON.stringify(r.taken) === JSON.stringify([r.picked]) && !!r.picked, r);

  // ---- bounded: three 6 km walks out (east-north-east) and back; the page draws between the steps. Caches that fill
  // once (a tower size built once, the shared props) may grow on the first lap; nothing may grow lap on lap
  // (no new robots on these walks, so the counts compare like for like: the robots are checked on their own above and by the cap)
  await C.ev(`(() => { const R = window.__rb; R.WORLD.robots.chance = 0; R.worldGo(0, 0); R.manual(false); return true; })()`);
  await sleep(600);
  const base = await C.ev(`window.__rb.World.status()`);
  const peak = { chunks: 0, geometries: 0, obstacles: 0, props: 0, worldRobots: 0, live: 0, hidden: 0, textures: 0 }, laps = [];
  for (let lap = 0; lap < 3; lap++) {
    for (let k = 1; k <= 40; k++) {
      const d = k <= 20 ? k * 300 : (40 - k) * 300;
      const s = await C.ev(`(() => { const R = window.__rb; R.worldGo(${d}, ${Math.round(d * 0.4)}); return R.World.status(); })()`);
      await sleep(100);
      for (const f of Object.keys(peak)) peak[f] = Math.max(peak[f], s[f]);
    }
    await sleep(2500);   // (a sweep: the far robots go)
    laps.push(await C.ev(`window.__rb.World.status()`));
  }
  const pick = (s) => ({ geometries: s.geometries, textures: s.textures, obstacles: s.obstacles, props: s.props, hidden: s.hidden, robots: s.robots, chunks: s.chunks });
  const [l1, , l3] = laps;
  ok(`on the walks at most 49 chunks (peak ${peak.chunks}) and at most 8 robot groups out (peak ${peak.live})`, peak.chunks <= 49 && peak.live <= 8, peak);
  ok(`geometries and textures don't grow lap on lap (start ${base.geometries}; back at the start after laps 1-3: ${laps.map((l) => l.geometries).join(', ')})`,
    l3.geometries <= l1.geometries + 8 && l3.textures <= l1.textures + 2 && peak.geometries < base.geometries * 3, { base: pick(base), laps: laps.map(pick), peak });
  ok(`obstacles, props, parts and robots back at the start the same each lap (${pick(l1).obstacles}/${pick(l3).obstacles} obstacles, ${l1.props}/${l3.props} props, ${l1.hidden}/${l3.hidden} parts, ${l1.robots}/${l3.robots} robots)`,
    l3.obstacles === l1.obstacles && l3.props === l1.props && l3.hidden <= l1.hidden && l3.robots <= l1.robots + 2 && l3.chunks === l1.chunks, { base: pick(base), laps: laps.map(pick) });
  // determinism: the same world after a reload
  await C.open(1280, 800, false);
  const sig2 = await C.ev(SIG);
  ok('the same world after a reload (places and heights over 2.4 km: signature equal)', sig1.h === sig2.h && sig1.n === sig2.n, { sig1, sig2 });
  return out;
}

async function runTouch(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'touch: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(844, 390, true);
  await C.ev(`(() => { window.__rb.player('tester'); return true; })()`); await sleep(150);
  let c = await C.ev(at('#worldB'));
  ok('the world chip at least 44 px', c && c.w >= 44 && c.h >= 44, c);
  const b = await C.ev(BOX + `('#start .kidbar, #start .kidbar > *')`);
  ok('the kidbar on screen with it, no page overflow', b.bad.length === 0 && b.docX <= 0, b);
  const hit = await C.ev(String.raw`(() => { const x = (a, b) => a.width && b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const k = [...document.querySelectorAll('#start .kidbar > *')].filter((e) => e.getClientRects().length), self = [];
    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) if (x(k[i].getBoundingClientRect(), k[j].getBoundingClientRect())) self.push(k[i].id + ' x ' + k[j].id);
    const el = document.querySelector('#worldB'), r = el.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { self, top: !!e && el.contains(e) }; })()`);
  ok('the chips clear of each other, nothing over the world chip', hit.self.length === 0 && hit.top, hit);
  if (c) await C.tap(c.x, c.y);
  let r = await C.ev(`window.__rb.world()`);
  ok('a tap on the chip: World picked, no pilot started', r.pick && !(await C.ev('!!window.__rb.Game.pilot')), r);
  const p = await C.ev(at('#start .pilots .pilot'));
  if (p) await C.tap(p.x, p.y);
  await sleep(400);
  r = await C.ev(String.raw`(() => { const R = window.__rb, s = R.World.status(); const btn = [...document.querySelectorAll('.tp-btn:not(.tp-off):not(.tp-pause)')].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none').length;
    return { on: s.on, pilot: !!R.Game.pilot, chunks: s.chunks, btn, tp: document.querySelector('.tp-root')?.classList.contains('tp-showing') }; })()`);
  ok('a tap on a pilot starts the run in the world', r.on && r.pilot && r.chunks === 25, r);
  ok(`at most 4 touch buttons (${r.btn})`, r.btn <= 4, r);
  // a robot beaten, then FIX tapped: its board opens
  r = await C.ev(String.raw`(() => { const R = window.__rb, G = R.Game; R.manual(true); const m = G.humans[0].mech.pos, s = R.spawn('charger', m.x + 8, m.z), q = G.robots.find((z) => z.id === s?.id);
    if (!q) return { none: true }; R.damage(q.id, 1e6, 'gun'); R.teleport(0, q.pos.x + 2.5, q.pos.z); R.manual(false); return { id: q.id }; })()`);
  await sleep(500);
  const fx = await C.ev(String.raw`(() => { const el = [...document.querySelectorAll('.tp-btn[data-tp="fix"]')].find((e) => !e.classList.contains('tp-off') && e.getClientRects().length); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (fx) await C.tap(fx.x, fx.y);
  await sleep(300);
  const ui = await C.ev(`(() => { const R = window.__rb, s = R.state(); return { repair: s.repair ?? null, fix: document.querySelector('#fix')?.classList.contains('on') ?? null, btn: [...document.querySelectorAll('.tp-btn:not(.tp-off):not(.tp-pause)')].filter((e) => e.getClientRects().length).length }; })()`);
  ok('a downed robot in reach: FIX shows (still at most 4 buttons) and a tap on it opens its board', !r.none && !!fx && (ui.fix || !!ui.repair), { r, fx, ui });
  return out;
}

const BOX = String.raw`((sel) => {
  const W = innerWidth, H = innerHeight, bad = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
    if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) bad.push({ el: (el.id || el.className?.baseVal || el.className || el.tagName) + '', l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) });
  }
  return { W, H, bad, docX: document.documentElement.scrollWidth - W, docY: document.documentElement.scrollHeight - H };
})`;
const at = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null; })()`;


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
