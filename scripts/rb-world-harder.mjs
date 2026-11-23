#!/usr/bin/env node
// Robot Battle endless world check (#167, slice 2: harder farther out). Q2: "robot toughness and bosses scale with distance".
//
// Each run is its own headless Chrome (muted, not detached, killed with its profile deleted on every way out, as
// scripts/rb-world.mjs does). Made-up profiles only.
//   logic  - at 1280 x 800, through window.__rb:
//            * waves untouched: a waves run's chip is the wave (no level), its robots as tough as ever;
//            * the level: 1 at the start, one more every WORLD.harder.step m out; the toughness rises with it to its cap;
//            * every world robot's health is its type's × the toughness of the level it came out at (× the mode's);
//              one far out is tougher than the same type near the start;
//            * the HUD's chip shows the level, pulses on the way out, and gets the boss sword from the boss level;
//            * boss chunks: none inside the boss level's ring, some beyond it, the same ones after a reload;
//            * a boss group out where its chunk is: the boss as tough as its level, its satellite linked to it, its escorts;
//              the boss bar up near it and down when it's far off though still loaded;
//            * the boss beaten and fixed on its boss board: its rare part in the bag, its trophy latched, not in the squad,
//              its group never back; the storage keys the same (no world key, no world field in the record).
//   touch  - at 844 x 390 with touch: a world run, a boss downed: at most 4 touch buttons, FIX opens its board; the level chip
//            on screen and clear of the health bar and the pause button at 740 x 360, 844 x 390 and 667 x 375 (two digits too).
//
// Usage:
//   node scripts/rb-world-harder.mjs                    # ./robot-battle.html: logic, then touch
//   node scripts/rb-world-harder.mjs --logic            # the logic run only
//   node scripts/rb-world-harder.mjs path/or/url.html --json
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-harder-'));
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
  const R = window.__rb, G = R.Game, W = R.World, WH = R.WORLD.harder;
  const st = (id) => R.state().robots.find((q) => q.id === id);
  // a Quick Fix done through the hooks (as scripts/rb-world.mjs does): puzzles answered, plugs wired, burnt ones patched
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
  // a type's own health, unscaled (ROBOT_TYPES: what spawnRobot gives it on wave 1)
  const base = {}, baseOf = (type) => (base[type] = R.ROBOT_TYPES[type].health);
  // the chunks round player 1 dropped and loaded again (after a sweep), so the robots of the chunks there come out now
  const reload = () => { W.sweep(); for (const k of [...W.chunks.keys()]) W.unload(k); W.update(true); W.sweep(); };
  const goNear = (b) => { const C = R.WORLD.chunk, x = (b.cx + 0.5) * C, z = (b.cz + 0.5) * C, d = Math.hypot(x, z); R.worldGo(x - x / d * 60, z - z / d * 60); reload(); return W.status(); };
  const keys = () => Object.keys(localStorage).sort();
`;

async function runLogic(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'logic: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  if (!(await C.ev(`typeof window.__rb.worldBosses === 'function'`))) { ok('__rb.worldBosses exists', false, 'missing'); return out; }

  // ---- waves, untouched
  let r = await C.ev(String.raw`(() => { ${H} R.player('tester'); const k0 = keys(); R.start(0); R.manual(true); const wv = document.querySelector('#waveHud');
    const robots = G.robots.map((q) => ({ type: q.type, hp: q.maxHealth })), types = [...new Set(robots.map((q) => q.type))];
    const fresh = {}; for (const t of types) { fresh[t] = baseOf(t); }
    return { wave: G.wave, world: G.world, n: document.querySelector('#waveN').textContent, lvl: wv.classList.contains('lvl'), label: wv.getAttribute('aria-label'), on: wv.classList.contains('on'),
      robots, fresh, k0, k1: keys(), wl: getComputedStyle(wv.querySelector('.wl')).display, wi: getComputedStyle(wv.querySelector('.wi')).display }; })()`);
  ok('waves: the chip is wave 1 by the wave icon (no level, no mountain)', r.wave === 1 && !r.world && r.on && r.n === '1' && !r.lvl && r.label === 'Wave' && r.wl === 'none' && r.wi !== 'none', r);
  ok('waves: wave 1\'s robots as tough as ever (each its type\'s own health)', r.robots.length > 0 && r.robots.every((q) => q.hp === r.fresh[q.type]), r);
  ok('waves: no new storage key', r.k1.every((k) => r.k0.includes(k) || !/world/i.test(k)), r);

  // ---- the level and its toughness
  await C.ev(`localStorage.clear()`); await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const s = WH.step, at = (d) => R.worldAt(d, 0), pts = [0, s - 1, s, 2 * s + 5, 4 * s, 10 * s, 20 * s, 40 * s].map((d) => ({ d, ...at(d) }));
    const diag = R.worldAt(3 * s * Math.SQRT1_2 + 1, 3 * s * Math.SQRT1_2 + 1);
    return { s, pts, diag, max: WH.toughMax }; })()`);
  const L = r.pts;
  ok(`level 1 at the start and out to ${r.s - 1} m, 2 at ${r.s} m, one more every ${r.s} m (${L.map((p) => p.d + ' m: ' + p.level).join(', ')})`,
    L[0].level === 1 && L[1].level === 1 && L[2].level === 2 && L[3].level === 3 && L[4].level === 5 && L[5].level === 11 && r.diag.level === 4, r);
  ok(`toughness 1 at level 1, rising with the level, capped at ${r.max} (${L.map((p) => p.tough).join(', ')})`,
    L[0].tough === 1 && L.every((p, i) => !i || p.tough >= L[i - 1].tough) && L[5].tough > L[2].tough && L[7].tough === r.max && L[6].tough <= r.max, r);

  // ---- boss chunks: none inside the boss level's ring, some beyond, the same after a reload
  const B1 = await C.ev(`window.__rb.worldBosses(3000)`);
  const from = await C.ev(`window.__rb.WORLD.harder.boss.from`), step = await C.ev(`window.__rb.WORLD.harder.step`);
  const C96 = await C.ev(`window.__rb.WORLD.chunk`);
  const inner = B1.filter((b) => Math.hypot((b.cx + 0.5) * C96, (b.cz + 0.5) * C96) < (from - 1) * step);
  ok(`no boss chunk inside ${(from - 1) * step} m (level ${from}); ${B1.length} boss chunks within 3 km, all at level ${from} or more`, B1.length > 5 && inner.length === 0 && B1.every((b) => b.level >= from), { n: B1.length, inner, sample: B1.slice(0, 5) });
  ok('both bosses out there (Knight and Centipede chunks)', B1.some((b) => b.type === 'knight') && B1.some((b) => b.type === 'centipede'), B1.slice(0, 10));

  // ---- a world run
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.world(true); R.start(0); R.manual(true); R.step(2); const wv = document.querySelector('#waveHud');
    window.__k0 = keys();
    return { s: W.status(), n: document.querySelector('#waveN').textContent, on: wv.classList.contains('on'), lvl: wv.classList.contains('lvl'), boss: wv.classList.contains('boss'), label: wv.getAttribute('aria-label'),
      wl: getComputedStyle(wv.querySelector('.wl')).display, wi: getComputedStyle(wv.querySelector('.wi')).display }; })()`);
  ok('a world run: the chip shows level 1 by the mountain (aria "Level"), no sword', r.s.on && r.s.level === 1 && r.on && r.lvl && !r.boss && r.n === '1' && r.label === 'Level' && r.wl !== 'none' && r.wi === 'none', r);

  // every world robot: its type's health × the toughness where it came out (× the mode's: Normal 1)
  r = await C.ev(String.raw`(() => { ${H} const seen = [];
    // (#167 slice 3: a ring's champion has its own toughness, WORLD.rings.tough: scripts/rb-world-rings.mjs checks it)
    const look = () => { for (const q of G.robots) if (q.wkey && q.state === 'glitched' && q.wlevel && !q.ring && !seen.some((s) => s.id === q.id)) seen.push({ id: q.id, type: q.type, lv: q.wlevel, hp: q.maxHealth }); };
    look(); for (const d of [300, 700, 1100, 1500, 1900]) { R.worldGo(d, 37); reload(); look(); }
    const bad = seen.filter((q) => q.hp !== Math.round(baseOf(q.type) * R.World.tough(q.lv)));
    const byType = {}; for (const q of seen) { (byType[q.type] ||= []).push(q); }
    const pair = Object.values(byType).map((l) => l.sort((a, b) => a.lv - b.lv)).find((l) => l.length > 1 && l[l.length - 1].lv > l[0].lv);
    return { n: seen.length, levels: [...new Set(seen.map((q) => q.lv))].sort((a, b) => a - b), bad: bad.slice(0, 5), pair: pair ? [pair[0], pair[pair.length - 1]] : null, base: { ...base } }; })()`);
  ok(`every world robot's health is its type's × its level's toughness (${r.n} robots, levels ${r.levels.join(', ')})`, r.n >= 8 && r.bad.length === 0 && r.levels.length >= 4, r);
  ok(`one far out is tougher than the same type near the start (${r.pair ? `${r.pair[0].type}: level ${r.pair[0].lv} ${r.pair[0].hp} -> level ${r.pair[1].lv} ${r.pair[1].hp}` : 'no pair'})`, !!r.pair && r.pair[1].hp > r.pair[0].hp, r);
  // Hard: × the mode's 1.25 on top
  r = await C.ev(String.raw`(() => { ${H} const was = G.mode; G.mode = 'hard'; R.worldGo(2600, -400); reload();
    const q = G.robots.find((z) => z.wkey && z.state === 'glitched' && z.wlevel && Math.hypot(z.pos.x - 2600, z.pos.z + 400) < 300); G.mode = was;
    return q ? { type: q.type, lv: q.wlevel, hp: q.maxHealth, want: Math.round(baseOf(q.type) * R.World.tough(q.wlevel) * 1.25) } : null; })()`);
  ok('in Hard: × the mode\'s 1.25 on top of the level\'s toughness', r && r.hp === r.want, r);

  // ---- the HUD chip on the way out: the number, the pulse, the sword from the boss level
  r = await C.ev(String.raw`(() => { ${H} const wv = document.querySelector('#waveHud'), out = [];
    for (const d of [0, (WH.boss.from - 2) * WH.step + 10, (WH.boss.from - 1) * WH.step + 10, 10 * WH.step + 10]) { R.worldGo(d, 0); wv.classList.remove('new'); R.step(2);
      out.push({ d, n: document.querySelector('#waveN').textContent, lvl: W.lvl, boss: wv.classList.contains('boss'), w2: wv.classList.contains('w2'), pulse: wv.classList.contains('new'),
        sword: getComputedStyle(wv.querySelector('.bw')).display !== 'none', mountain: getComputedStyle(wv.querySelector('.wl')).display !== 'none' }); }
    return out; })()`);
  ok(`the chip follows the level out (${r.map((q) => q.n).join(' -> ')}), pulsing on the way up`, r[0].n === '1' && r[1].n === String(from - 1) && r[2].n === String(from) && r[3].n === '11' && r[1].pulse && r[2].pulse && r[3].pulse, r);
  ok(`under level ${from} the mountain; from level ${from} the boss sword, edged gold; two digits slim (w2)`, r[1].mountain && !r[1].boss && !r[1].sword && r[2].boss && r[2].sword && !r[2].mountain && r[3].w2 && !r[2].w2, r);

  // ---- a boss group where its chunk is
  r = await C.ev(String.raw`(() => { ${H} const all = R.worldBosses(2000).sort((a, b) => Math.hypot(a.cx, a.cz) - Math.hypot(b.cx, b.cz));
    // a Normal-mode boss far enough out for a satellite and an escort (level from + escorts.every on)
    const b = all.find((q) => q.level >= WH.boss.from + WH.boss.escorts.every) || all[0]; if (!b) return { none: true };
    const s = goNear(b), key = b.cx + ',' + b.cz + ':r', grp = s.bosses.find((q) => q.key === key);
    if (!grp) return { none: 'not out', b, s: { bosses: s.bosses, live: s.live } };
    const list = W.live.get(key), boss = list.find((q) => q.type === b.type), sat = list.find((q) => q.type === 'satellite'), esc = list.filter((q) => q !== boss && q !== sat);
    R.step(30);
    const want = Math.min(WH.boss.escorts.max, Math.floor((boss.wlevel - WH.boss.from) / WH.boss.escorts.every));
    const p = G.humans[0].mech.pos, dist = Math.hypot(boss.pos.x - p.x, boss.pos.z - p.z);
    return { b, key, type: boss.type, lv: boss.wlevel, hp: boss.maxHealth, want: Math.round(baseOf(b.type) * R.World.tough(boss.wlevel)), sat: !!sat, satHp: sat?.maxHealth, satWant: Math.round(baseOf('satellite') * R.World.tough(boss.wlevel)),
      linked: !!sat && boss.linkBy === sat.id, esc: esc.length, escWant: want, dist, home: boss.home, bossId: boss.id }; })()`);
  ok(`a boss group comes out at its chunk: ${r.type} at level ${r.lv}, health ${r.hp} = its type's × the level's toughness`, !r.none && r.hp === r.want && r.lv >= from, r);
  ok(`... with its satellite (as tough), linked to it, and ${r.escWant} escort(s) round it`, r.sat && r.satHp === r.satWant && r.linked && r.esc === r.escWant && r.escWant >= 1, r);
  const bossKey = r.key, bossType = r.type;

  // the boss bar: up near it, down far off though its chunk is still loaded
  r = await C.ev(String.raw`(() => { ${H} const boss = G.robots.find((q) => q.wkey === ${JSON.stringify(bossKey)} && q.type === ${JSON.stringify(bossType)});
    R.teleport(0, boss.pos.x + 60, boss.pos.z); R.manual(false); return { id: boss.id }; })()`);
  await new Promise((res) => setTimeout(res, 400));
  const nearBar = await C.ev(`(() => { const R = window.__rb, rt = document.querySelector('#bossBar').parentElement; R.manual(true); return { on: rt.classList.contains('boss-on'), name: document.querySelector('#bossName').textContent }; })()`);
  r = await C.ev(String.raw`(() => { ${H} const boss = G.robots.find((q) => q.id === ${r.id}); R.teleport(0, boss.pos.x + WH.bar + 40, boss.pos.z); R.manual(false);
    return { loaded: G.robots.includes(boss) }; })()`);
  await new Promise((res) => setTimeout(res, 400));
  const farBar = await C.ev(`(() => { const R = window.__rb, rt = document.querySelector('#bossBar').parentElement; R.manual(true); return { on: rt.classList.contains('boss-on') }; })()`);
  ok('the boss bar is up 60 m from the boss, with its name', nearBar.on && nearBar.name.length > 0, nearBar);
  ok(`... and down ${r.loaded ? 'with the boss still loaded' : ''} past ${await C.ev('window.__rb.WORLD.harder.bar')} m`, r.loaded && !farBar.on, { r, farBar });

  // ---- beaten and fixed on its boss board: the rare part, the trophy, no squad place; the group never back; keys the same
  r = await C.ev(String.raw`(() => { ${H} const boss = G.robots.find((q) => q.wkey === ${JSON.stringify(bossKey)} && q.type === ${JSON.stringify(bossType)});
    const rare = R.ROBOT_TYPES[boss.type].rare, bag0 = G.bag[rare] || 0, won0 = R.Bosses.won.length;
    R.damage(boss.id, 1e6, 'gun'); let ch = null; for (const o of [2.5, 5, 7]) { R.teleport(0, boss.pos.x + o, boss.pos.z); ch = R.choose(boss.id, 'fix'); if (ch.ok) break; }
    const s = st(boss.id), board = s?.board ? { wave: s.board.wave, slots: s.board.slots.length, boss: R.bossPlan(s.board.wave, 'gun', boss.type).slots, plain: R.plan(s.board.wave, 'gun').slots } : null;
    const solved = solve(boss.id), won = R.Bosses.won.slice(won0);
    const rec = JSON.parse(localStorage.getItem('robotbattle.facts.tester') || 'null');
    const out = { ch: ch?.ok, why: ch?.why, board, solved, won, bag: (G.bag[rare] || 0) - bag0, squad: G.squad.some((q) => q.id === boss.id), inRobots: G.robots.includes(boss),
      trophy: !!rec?.garage?.bosses?.[boss.type], recWorld: rec ? Object.keys(rec).filter((k) => /world|level/i.test(k)) : null };
    // walk far away and back: the group (partly beaten) is swept as gone, and nothing of it comes out again
    const p = G.humans[0].mech.pos, px = p.x, pz = p.z; R.worldGo(px + 3000, pz); W.sweep(); R.worldGo(px, pz); reload();
    out.gone = W.gone.has(${JSON.stringify(bossKey)}); out.again = G.robots.filter((q) => q.wkey === ${JSON.stringify(bossKey)}).length;
    out.k0 = window.__k0; out.k1 = keys();
    return out; })()`);
  ok(`the boss beaten: its Quick Fix opens on its boss board (${r.board?.slots} slots, the boss plan's; a plain robot's ${r.board?.plain})`, r.ch && r.board && r.board.slots === r.board.boss && r.board.slots > r.board.plain, r);
  ok(`... fixed: its rare part in the bag (+${r.bag}), its trophy latched in the record, and it doesn't join the squad`, r.solved && r.won.length === 1 && r.won[0].type === bossType && r.bag === 1 && r.trophy && !r.squad && !r.inRobots, r);
  ok('its group never back (swept as gone; nothing of it after a walk away and back)', r.gone && r.again === 0, r);
  ok('the save keys the same, no world or level field in the record', JSON.stringify(r.k0) === JSON.stringify(r.k1) && Array.isArray(r.recWorld) && r.recWorld.length === 0, { k0: r.k0, k1: r.k1, recWorld: r.recWorld });

  // ---- no boss comes out inside the boss level's ring (a walk round it), and the boss chunks are the same after a reload
  r = await C.ev(String.raw`(() => { ${H} const R0 = (WH.boss.from - 1) * WH.step - 2 * R.WORLD.chunk, seen = [];
    for (let a = 0; a < 16; a++) { R.worldGo(Math.cos(a * 0.39) * R0, Math.sin(a * 0.39) * R0); reload(); for (const q of G.robots) if (q.wkey && R.ROBOT_TYPES[q.type].boss) seen.push({ type: q.type, lv: q.wlevel, at: R.World.level(q.home.x, q.home.z), x: Math.round(q.home.x), z: Math.round(q.home.z) }); }
    return { R0, seen, low: seen.filter((q) => q.lv < WH.boss.from || q.at < WH.boss.from) }; })()`);
  ok(`a walk round ${r.R0} m out: every boss that comes out in the chunks loaded round it (${r.seen.length}) is at level ${from} or more, none nearer`, r.low.length === 0, r);
  await C.open(1280, 800, false);
  const B2 = await C.ev(`window.__rb.worldBosses(3000)`);
  ok(`the same boss chunks after a reload (${B2.length})`, JSON.stringify(B1) === JSON.stringify(B2), { B1: B1.length, B2: B2.length });
  return out;
}

async function runTouch(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'touch: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  // the level chip at the three phone sizes (one and two digits): on screen, clear of the health bar and the pause button
  for (const [w, h] of [[740, 360], [844, 390], [667, 375]]) {
    await C.ev(`localStorage.clear()`).catch(() => {});
    await C.open(w, h, true);
    await C.ev(`(() => { const R = window.__rb; R.player('tester'); R.world(true); R.start(0); R.manual(false); return true; })()`);
    for (const d of [0, 1600]) {
      await C.ev(`(() => { window.__rb.manual(true); window.__rb.worldGo(${d}, 0); window.__rb.step(2); window.__rb.manual(false); return true; })()`);
      await new Promise((res) => setTimeout(res, 300));
      const m = await C.ev(String.raw`(() => { const box = (s) => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
        const x = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
        const wv = box('#waveHud'), hp = box('#health'), pz = box('.tp-pause') || box('#pauseB');
        return { wv, hp, pz, n: document.querySelector('#waveN').textContent, tp: document.documentElement.classList.contains('tp-mode'), W: innerWidth, H: innerHeight, overHp: x(wv, hp), overPause: x(wv, pz), docX: document.documentElement.scrollWidth - innerWidth }; })()`);
      ok(`${w}x${h}, level ${m.n}: the chip on screen, clear of the health bar and pause`, m.tp && m.wv && m.wv.l >= 0 && m.wv.t >= 0 && m.wv.r <= m.W && m.wv.b <= m.H && !m.overHp && !m.overPause && m.docX <= 0, m);
    }
  }
  // a boss downed: at most 4 touch buttons, FIX opens its board
  let r = await C.ev(String.raw`(() => { ${H} R.manual(true); const b = R.worldBosses(2000).sort((a, b) => Math.hypot(a.cx, a.cz) - Math.hypot(b.cx, b.cz))[0]; goNear(b);
    const boss = G.robots.find((q) => q.wkey === b.cx + ',' + b.cz + ':r' && q.type === b.type); if (!boss) return { none: true, b };
    for (const q of G.robots) if (q.wkey === boss.wkey && q !== boss) R.damage(q.id, 1e6, 'gun');
    R.damage(boss.id, 1e6, 'gun'); R.teleport(0, boss.pos.x + 5, boss.pos.z); R.manual(false); return { id: boss.id, type: boss.type }; })()`);
  // (it falls over on the game's own clock: wait for its FIX, standing by it, up to 6 s)
  let fx = null;
  for (let t = 0; t < 20 && !fx && !r.none; t++) {
    await new Promise((res) => setTimeout(res, 300));
    fx = await C.ev(String.raw`(() => { const R = window.__rb, b = R.Game.robots.find((q) => q.id === ${r.id ?? -1}); if (b) R.teleport(0, b.pos.x + 5, b.pos.z); const el = [...document.querySelectorAll('.tp-btn[data-tp="fix"]')].find((e) => !e.classList.contains('tp-off') && e.getClientRects().length); if (!el) return null; const q = el.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
  }
  const n0 = await C.ev(`[...document.querySelectorAll('.tp-btn:not(.tp-off):not(.tp-pause)')].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none').length`);
  if (fx) await C.tap(fx.x, fx.y);
  await new Promise((res) => setTimeout(res, 300));
  const ui = await C.ev(`(() => { const R = window.__rb, s = R.state(); return { repair: s.repair ?? s.players?.[0]?.repair ?? null, fix: document.querySelector('#fix')?.classList.contains('on') ?? null, fixMode: R.FixUI?.mode ?? null }; })()`);
  ok(`a boss downed in reach: at most 4 touch buttons (${n0}), FIX shows and a tap opens its board`, !r.none && n0 <= 4 && !!fx && (ui.fix || !!ui.repair || !!ui.fixMode), { r, n0, fx, ui });
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
