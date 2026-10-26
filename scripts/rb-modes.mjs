#!/usr/bin/env node
// Robot Battle modes check (#132): Easy, Normal and Hard (MODES), picked per child on the pilot pick (rec.mode).
//
// Each run is its own headless Chrome (muted, not detached, killed with its profile deleted on every way out, as
// scripts/rb-wave-picker.mjs does):
//   logic   - at 1280 x 800, through window.__rb:
//             * spawns: for each mode, waves 1-7 each spawned fresh (the meadow emptied, Waves.spawn(n)), and the exact robots
//               counted by type (a drone swarm's drones and a Ninja's minions each counted), plus whether the copier came
//               (Copier.list) and the satellite (among the robots spawned), against the issue's table written out here;
//               ?wave=6 per mode for a saved child (a real start) brings that mode's wave 6;
//             * Hard: a Charger (waves 1 and 2) and the Knight (wave 5) at 1.25 x Normal's health (+-1 for rounding), and the
//               copier's clone; BOSS_WAVE still applies in Normal and Hard (extras off: wave 5 is the base four + the boss),
//               and Easy's wave 5 is the boss alone either way;
//             * the choice: saved per child (Apollo Hard, Orion Easy) across a reload; a new child starts on Normal; a record
//               saved before #132 (no mode field) loads as Normal; Guest can pick but nothing is saved (no stored record, Normal
//               after a reload); it can't change mid-run (the setter refuses, the run's mode stays, a hook-swapped child too);
//               the wave picker's best is one value across modes;
//             * saves: a parent reset keeps the mode; "Use the backup" and "Keep the best" keep this device's mode (device Hard
//               / backup Easy -> Hard, device without the field / backup Easy -> Normal); a backup from before #132 restores;
//               a backup from this build restores into main (c909368, before #132) with both choices, and the child loads.
//   size    - at each size, a child with a 10-letter name and the wave chip showing (best 14, the widest kidbar): the mode
//             chip, the kidbar and the pilots on screen, clear of the parent button and the health bar, at least 44 px, no
//             page overflow, no emoji; changed by touch (a mouse click at desktop: Normal -> Hard), the keyboard (ArrowDown:
//             Hard -> Easy) and a gamepad (a stubbed navigator.getGamepads read by the game's own loop: d-pad down Easy ->
//             Normal -> Hard); then pad A starts the run in Hard (a wave-1 Charger at 1.25 x), and the chip is gone and the
//             mode can't change.
//
// Usage:
//   node scripts/rb-modes.mjs                        # ./robot-battle.html: logic, then every size
//   node scripts/rb-modes.mjs --logic                # the logic run only
//   node scripts/rb-modes.mjs --size 568x320         # one size only (repeatable); no logic run
//   node scripts/rb-modes.mjs --main path.html       # main's page for the "into main" check (default: git show c909368)
//   node scripts/rb-modes.mjs --shots DIR            # also save a screenshot of the pilot pick per size
//   node scripts/rb-modes.mjs path/or/url.html --json
// Sizes by default: 390x844, 568x320, 667x375, 740x360, 844x390, 768x1024, 820x1180 and 1280x800 (desktop). Each size is
// its own Chrome launch.
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SIZES = ['390x844', '568x320', '667x375', '740x360', '844x390', '768x1024', '820x1180', '1280x800'];
const MAIN_SHA = 'c909368';
const args = process.argv.slice(2);
let json = false, target = null, logicOnly = false, shots = null, mainPage = null; const sizes = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--logic') logicOnly = true;
  else if (args[i] === '--size') sizes.push(args[++i]);
  else if (args[i] === '--shots') shots = path.resolve(args[++i]);
  else if (args[i] === '--main') mainPage = path.resolve(args[++i]);
  else if (args[i] === '-h' || args[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
  else target = args[i];
}
const runs = logicOnly ? ['logic'] : sizes.length ? sizes : ['logic', ...SIZES];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
target ??= path.join(repo, 'robot-battle.html');
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(path.resolve(target)).href;
const withQ = (u, q) => u + (u.includes('?') ? '&' : '?') + q;
if (shots) fs.mkdirSync(shots, { recursive: true });

// main's page (before #132), for "a backup from this build restores into main": a temp copy from git, removed at exit
let mainTmp = null;
function mainUrl() {
  if (mainPage) return pathToFileURL(mainPage).href;
  mainTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-modes-main-'));
  const f = path.join(mainTmp, 'robot-battle.html');
  fs.writeFileSync(f, execFileSync('git', ['-C', repo, 'show', MAIN_SHA + ':robot-battle.html'], { maxBuffer: 64e6 }));
  return pathToFileURL(f).href;
}

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

// ---- in the page ----
// clearWave(): every robot still to beat is downed (damage), the mech stepped up to it and it's taken apart for one part,
// as the prompt's 🔩 does; then the wave is checked. Returns whether the meadow is cleared and the clear screen is up.
const HELPERS = String.raw`
  const R = window.__rb, G = R.Game;
  const foes = () => G.robots.filter((r) => r.state !== 'ally' && !G.squad.includes(r));
  const clearWave = () => {
    for (let pass = 0; pass < 8 && !G.cleared; pass++) {
      for (const r of foes()) {
        if (r.state !== 'down') R.damage(r.id, 1e6, 'gun');
        if (r.state === 'down') { R.teleport(0, r.pos.x + 2.5, r.pos.z); R.choose(r.id, 'parts', undefined, [r.parts[0]]); }
      }
      R.Waves.check();
    }
    return { cleared: G.cleared, screen: R.state().clearScreen, wave: G.wave, left: foes().map((r) => r.type + ':' + r.state) };
  };
  const saved = (id) => { const v = localStorage.getItem('robotbattle.facts.' + id); return v ? JSON.parse(v) : null; };
  const types = () => foes().map((r) => r.type).sort();
`;

// ---- the issue's table, written out (Done when: "each mode spawns exactly the robots in the table for waves 1-7").
// Per wave: the robots by type (D = a drone swarm's drones; a Ninja crew is the Ninja and its minions: 2 on waves 3-4, 3 from
// wave 5), and whether a copier comes. The satellite is one of the robots (from wave 5 in Normal and Hard, 7 in Easy).
const NORMAL = {
  1: { charger: 1, sniper: 1, bouncer: 1, drone: 'D' },
  2: { charger: 2, sniper: 1, bouncer: 1, drone: 'D' },
  3: { charger: 2, sniper: 1, bouncer: 1, drone: 'D', ninja: 1, minion: 2 },
  4: { charger: 2, sniper: 2, bouncer: 1, drone: 'D', ninja: 1, minion: 2, copier: true },
  5: { charger: 2, sniper: 2, bouncer: 2, drone: 'D', ninja: 1, minion: 3, knight: 1, satellite: 1 },
  6: { charger: 3, sniper: 2, bouncer: 2, drone: 'D', ninja: 1, minion: 3, satellite: 1, copier: true },
  7: { charger: 3, sniper: 3, bouncer: 2, drone: 'D', ninja: 1, minion: 3, satellite: 1 },
};
const EXPECT = {
  easy: {
    1: { drone: 'D' },
    2: { drone: 'D', charger: 1 },
    3: { drone: 'D', charger: 1, bouncer: 1 },
    4: { drone: 'D', charger: 1, bouncer: 1, sniper: 1 },                       // (no copier: Easy's copier is from wave 6)
    5: { knight: 1 },                                                            // the Knight alone (no satellite, no copier)
    6: { charger: 2, sniper: 1, bouncer: 1, drone: 'D', ninja: 1, minion: 3, copier: true },   // half of 5 extras = 2: a Charger, the Ninja crew
    7: { charger: 2, sniper: 2, bouncer: 1, drone: 'D', ninja: 1, minion: 3, satellite: 1 },   // half of 6 = 3: a Charger, a Sniper, the crew
  },
  normal: NORMAL,
  hard: NORMAL,
};
const fmt = (o, D) => Object.keys(o).filter((k) => k !== 'copier').sort().map((k) => `${k}:${o[k] === 'D' ? D : o[k]}`).join(' ');

const HELP2 = String.raw`
  // every glitched or downed robot taken apart, and every copier out removed: an empty meadow for the next spawn
  const empty = () => {
    for (let p = 0; p < 6 && foes().length; p++) for (const r of foes()) {
      if (r.state !== 'down') R.damage(r.id, 1e6, 'gun');
      if (r.state === 'down') { R.teleport(0, r.pos.x + 2.5, r.pos.z); R.choose(r.id, 'parts', undefined, [r.parts[0]]); }
    }
    for (const c of [...R.Copier.list]) R.Copier.remove(c);
    return foes().length;
  };
  const count = (list) => { const c = {}; for (const r of list) c[r.type] = (c[r.type] || 0) + 1; return Object.keys(c).sort().map((k) => k + ':' + c[k]).join(' '); };
  const hpOf = (list, t) => list.filter((r) => r.type === t).map((r) => r.maxHealth);
  // wave n spawned fresh on an empty meadow: its robots by type, whether a copier came, and the Chargers' and Knight's health
  const wave = (n) => { const left = empty(), c0 = R.Copier.list.length, fresh = R.Waves.spawn(n);
    return { n, left, types: count(fresh), copier: R.Copier.list.length > c0, charger: hpOf(fresh, 'charger'), knight: hpOf(fresh, 'knight'), sat: hpOf(fresh, 'satellite') }; };
`;
const has = (fn) => `typeof window.__rb.${fn} === 'function'`;

let shared = null;
function launch() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-modes-'));
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
const rmMain = () => { if (mainTmp) try { fs.rmSync(mainTmp, { recursive: true, force: true }); } catch {} };
process.on('exit', () => { killSync(shared); rmMain(); });
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => { kill(shared).finally(() => process.exit(code)); });
const HARD_TIMEOUT_MS = 30 * 60 * 1000;   // (logic and 8 sizes take about 13 min on an idle machine)
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
    for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState === "complete" && !!window.__rb').catch(() => false)) return; }
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
// (Written again on pagehide and visibilitychange, after the game's own Squad.sync there, so a seeded squad isn't saved over by the empty meadow)
const SEED = (id, n, extra = '') => String.raw`(() => { const R = window.__rb; R.player('${id}'); R.Facts.rec.waves = { ...(R.Facts.rec.waves || {}), best: ${n} }; ${extra} R.Facts.save();
  const k = 'robotbattle.facts.${id}', v = localStorage.getItem(k); for (const t of ['pagehide', 'visibilitychange']) addEventListener(t, () => localStorage.setItem(k, v));
  return JSON.parse(v).waves; })()`;

async function runLogic(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  if (!(await C.ev(has('mode')))) { ok('__rb.mode exists (the mode chip and the run\'s mode)', false, 'missing'); ok('__rb.MODES exists (the one config)', await C.ev('!!window.__rb.MODES'), 'missing'); return out; }
  const D = await C.ev('window.__rb.ROBOT_TYPES.drone.swarm');
  ok('MODES holds easy, normal and hard', await C.ev(`(() => { const M = window.__rb.MODES; return ['easy', 'normal', 'hard'].every((k) => M[k]); })()`), await C.ev('Object.keys(window.__rb.MODES)'));

  // ---- spawns, waves 1-7, per mode (Guest: nothing is saved)
  const got = {};
  for (const m of ['easy', 'normal', 'hard']) {
    await C.open(1280, 800, false);
    got[m] = await C.ev(String.raw`(() => { ${HELPERS} ${HELP2} R.manual(true); R.player('guest'); const p = R.mode('${m}'); R.start(0);
      const run = R.mode().run, waves = []; for (let n = 1; n <= 7; n++) waves.push(wave(n)); return { p, run, waves }; })()`);
    ok(`${m}: the run takes the mode picked (Guest picked ${m})`, got[m].p.ok && got[m].run === m, got[m]);
    for (const w of got[m].waves) {
      const want = EXPECT[m][w.n], wantT = fmt(want, D);
      ok(`${m} wave ${w.n}: exactly ${wantT}${want.copier ? ' + the copier' : ''}`, w.left === 0 && w.types === wantT && w.copier === !!want.copier, { got: w.types, copier: w.copier, left: w.left, want: wantT, wantCopier: !!want.copier });
    }
  }
  // ---- Hard's health: 1.25 x Normal's, on a Charger (wave 1: no toughness yet; wave 2) and the Knight (wave 5), and the satellite
  const N = got.normal.waves, H = got.hard.waves, near = (h, n) => n > 0 && Math.abs(h - n * 1.25) <= 1;
  const base = await C.ev('({ charger: window.__rb.ROBOT_TYPES.charger.health, knight: window.__rb.ROBOT_TYPES.knight.health })');
  ok(`hard: a wave-1 Charger has 1.25 x Normal's health (${N[0].charger[0]} -> ${H[0].charger[0]}; its base ${base.charger})`, N[0].charger[0] === base.charger && H[0].charger[0] === Math.round(base.charger * 1.25), { normal: N[0].charger, hard: H[0].charger });
  ok(`hard: every wave-2 Charger has 1.25 x Normal's (${N[1].charger.join('/')} -> ${H[1].charger.join('/')})`, H[1].charger.length === 2 && H[1].charger.every((h, i) => near(h, N[1].charger[i])), { normal: N[1].charger, hard: H[1].charger });
  ok(`hard: the Knight (wave 5) has 1.25 x Normal's (${N[4].knight[0]} -> ${H[4].knight[0]})`, near(H[4].knight[0], N[4].knight[0]) && H[4].knight[0] > base.knight, { normal: N[4].knight, hard: H[4].knight });
  ok(`hard: the satellite (wave 5) has 1.25 x Normal's (${N[4].sat[0]} -> ${H[4].sat[0]})`, near(H[4].sat[0], N[4].sat[0]), { normal: N[4].sat, hard: H[4].sat });
  ok('easy: waves 1-5 keep Normal\'s health (a wave-2 Charger, the wave-5 Knight)', got.easy.waves[1].charger[0] === N[1].charger[0] && got.easy.waves[4].knight[0] === N[4].knight[0], { easy2: got.easy.waves[1].charger, easy5: got.easy.waves[4].knight });
  // the copier's clone in Hard: 1.25 x a Normal clone (both from the same mech)
  const clone = {};
  for (const m of ['normal', 'hard']) {
    await C.open(1280, 800, false);
    clone[m] = await C.ev(String.raw`(() => { ${HELPERS} ${HELP2} R.manual(true); R.player('guest'); R.mode('${m}'); R.start(0); wave(4);
      for (let i = 0; i < 60 * 40 && !G.robots.some((r) => r.clone); i++) R.step(1);
      const c = G.robots.find((r) => r.clone); return c ? { hp: c.maxHealth, of: c.clone.ofMax } : null; })()`);
  }
  ok(`hard: the copier's clone has 1.25 x Normal's health (${clone.normal?.hp} -> ${clone.hard?.hp})`, clone.normal && clone.hard && clone.normal.of === clone.hard.of && Math.abs(clone.hard.hp - clone.normal.hp * 1.25) <= 1, clone);

  // ---- BOSS_WAVE still applies in Normal and Hard; Easy's wave 5 is the boss alone either way. Waves.list(n, mode)
  let r = await C.ev(`(() => { const R = window.__rb, B = R.BOSS_WAVE, was = B.extras; const a = { normal: R.waveList(5, 'normal'), hard: R.waveList(5, 'hard'), easy: R.waveList(5, 'easy') };
    B.extras = false; const b = { normal: R.waveList(5, 'normal'), hard: R.waveList(5, 'hard'), easy: R.waveList(5, 'easy') }; B.extras = was; return { a, b }; })()`);
  ok('BOSS_WAVE.extras off: Normal\'s and Hard\'s wave 5 become the base four + the Knight; Easy\'s stays the Knight alone', r.b.normal.join() === 'charger,sniper,bouncer,drone,knight' && r.b.hard.join() === r.b.normal.join() && r.b.easy.join() === 'knight' && r.a.easy.join() === 'knight' && r.a.normal.length === 9, r);
  r = await C.ev(`(() => { const R = window.__rb; return { e: R.satelliteWaves(12, 'easy'), n: R.satelliteWaves(12, 'normal'), ec: R.copierWaves(12, 'easy'), nc: R.copierWaves(12, 'normal'), eb: R.bossWaves(12, 'easy'), nb: R.bossWaves(12, 'normal') }; })()`);
  ok('the satellite comes from wave 7 in Easy (5 in Normal); the copier from 6 (4 in Normal); boss waves 5 and 10 in both', r.e.join() === '7,8,9,10,11,12' && r.n.join() === '5,6,7,8,9,10,11,12' && r.ec.join() === '6,8,10,12' && r.nc.join() === '4,6,8,10,12' && r.eb.join() === '5,10' && r.nb.join() === '5,10', r);

  // ---- the choice, saved per child; a new child on Normal; Guest's not saved
  await C.open(1280, 800, false);
  r = await C.ev(`(() => { const R = window.__rb; R.player('apollo'); const a0 = R.mode().pick, a = R.mode('hard'); R.player('orion'); const o = R.mode('easy');
    const z = R.addProfile('Zed'); R.player(z.id); const zp = R.mode().pick; R.player('guest'); const g = R.mode('easy'), gp = R.mode().pick;
    return { a0, a, o, z: z.id, zp, g, gp, sa: JSON.parse(localStorage.getItem('robotbattle.facts.apollo')).mode, so: JSON.parse(localStorage.getItem('robotbattle.facts.orion')).mode, guestKey: localStorage.getItem('robotbattle.facts.guest') }; })()`);
  ok('a child starts on Normal; Apollo picks Hard and Orion Easy, each saved in their own record (rec.mode)', r.a0 === 'normal' && r.a.ok && r.o.ok && r.sa === 'hard' && r.so === 'easy', r);
  ok('a new child (Zed) starts on Normal', r.zp === 'normal', r);
  ok('Guest can pick (Easy), and nothing is stored for Guest', r.g.ok && r.gp === 'easy' && r.guestKey == null, r);
  const zid = r.z;
  await C.open(1280, 800, false);
  r = await C.ev(`(() => { const R = window.__rb; const out = {}; for (const c of ['apollo', 'orion', '${zid}', 'guest']) { R.player(c); out[c] = R.mode().pick; } out.chip = document.querySelector('#modeB')?.dataset.m; out.guestKey = localStorage.getItem('robotbattle.facts.guest'); return out; })()`);
  ok('after a reload: Apollo Hard, Orion Easy, Zed Normal, Guest back on Normal (not saved)', r.apollo === 'hard' && r.orion === 'easy' && r[zid] === 'normal' && r.guest === 'normal' && r.guestKey == null, r);
  // a record saved before #132 (no mode field) loads as Normal
  // (the live record too, so the game's own save as the page goes doesn't write the field back)
  r = await C.ev(`(() => { const R = window.__rb; R.player('orion'); delete R.Facts.rec.mode; const k = 'robotbattle.facts.orion', v = JSON.parse(localStorage.getItem(k)); delete v.mode; localStorage.setItem(k, JSON.stringify(v));
    for (const t of ['pagehide', 'visibilitychange']) addEventListener(t, () => { const w = JSON.parse(localStorage.getItem(k)); delete w.mode; localStorage.setItem(k, JSON.stringify(w)); });
    return JSON.parse(localStorage.getItem(k)).mode ?? null; })()`);
  ok('(setup) Orion\'s stored record has no mode field', r === null, r);
  await C.open(1280, 800, false);
  r = await C.ev(`(() => { const R = window.__rb; R.player('orion'); return R.mode(); })()`);
  ok('a record saved before #132 (no mode field) loads as Normal', r.pick === 'normal', r);
  // a parent reset keeps the mode (a setting, as the wiring is)
  r = await C.ev(`(() => { const R = window.__rb; R.player('apollo'); const x = R.Facts.reset('apollo'); R.player('orion'); R.player('apollo'); return { x, pick: R.mode().pick, saved: JSON.parse(localStorage.getItem('robotbattle.facts.apollo')).mode }; })()`);
  ok('a parent reset of Apollo keeps Hard', r.x.ok && r.pick === 'hard' && r.saved === 'hard', r);
  // it can't change mid-run: the setter refuses, the run's mode stays (and a child swapped in by a hook doesn't change it)
  r = await C.ev(String.raw`(() => { ${HELPERS} ${HELP2} R.manual(true); R.player('apollo'); R.start(0); const run0 = R.mode().run, x = R.mode('easy'); R.player('orion');
    const run1 = R.mode().run, w = wave(1); return { run0, x, run1, w, orion: R.mode().pick }; })()`);
  ok('mid-run: the mode can\'t be changed (refused), and the run stays Hard even with Orion (Easy) swapped in by a hook', r.run0 === 'hard' && !r.x.ok && r.run1 === 'hard' && r.w.types === fmt(NORMAL[1], D) && r.w.charger[0] === Math.round(base.charger * 1.25), r);

  // ---- ?wave=6 uses the child's mode (a real start)
  for (const [c, m] of [['orion', 'easy'], ['apollo', 'hard']]) {
    await C.open(1280, 800, false);
    await C.ev(`(() => { const R = window.__rb; R.player('${c}'); R.mode('${m}'); return true; })()`);
    await C.open(1280, 800, false, withQ(url, 'wave=6'));
    r = await C.ev(String.raw`(() => { ${HELPERS} ${HELP2} R.player('${c}'); R.start(0); R.manual(true); const t = count(foes()); return { wave: G.wave, run: R.mode().run, t, copier: R.Copier.list.length > 0, charger: hpOf(foes(), 'charger') }; })()`);
    const want = fmt(EXPECT[m][6], D);
    ok(`?wave=6 for ${c} (${m}): wave 6 is ${m}'s (${want}${EXPECT[m][6].copier ? ', the copier' : ''})`, r.wave === 6 && r.run === m && r.t === want && r.copier === !!EXPECT[m][6].copier, { got: r, want });
    if (m === 'hard') ok('?wave=6 in Hard: its Chargers at 1.25 x wave 6\'s Normal health', r.charger.length === 3 && r.charger.every((h) => near(h, got.normal.waves[5].charger[0])), { hard: r.charger, normal: got.normal.waves[5].charger });
  }

  // ---- the wave picker's best is one value across modes
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${HELPERS} R.player('orion'); R.Facts.rec.waves = { best: 0 }; R.Facts.save(); R.manual(true); R.start(0); const steps = [];
    for (let w = 1; w <= 2; w++) { R.nextWave(); clearWave(); steps.push(R.waves().best); } return { steps, run: R.mode().run }; })()`);
  ok('the wave picker\'s best is one value: Orion (Easy) clears waves 1-2 and best is 2', r.run === 'easy' && r.steps.join() === '1,2', r);
  await C.open(1280, 800, false);
  r = await C.ev(`(() => { const R = window.__rb; R.player('orion'); R.mode('hard'); return { best: R.waves().best, offer: R.waves().offer, pick: R.mode().pick }; })()`);
  ok('... and in Hard her best is still 2 (offer 1-3): not kept per mode', r.best === 2 && r.offer.join() === '1,2,3' && r.pick === 'hard', r);

  // ---- saves: backups. Use the backup and Keep the best both keep this device's mode (a preference, not progress)
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { const R = window.__rb;
    const set = (m) => { R.player('apollo'); if (m == null) delete R.Facts.rec.mode; else R.Facts.rec.mode = m; R.Facts.save(); if (m == null) { const k = 'robotbattle.facts.apollo', v = JSON.parse(localStorage.getItem(k)); delete v.mode; localStorage.setItem(k, JSON.stringify(v)); } };
    const bak = (m) => { set(m); return JSON.parse(JSON.stringify(R.backup())); };
    const res = {};
    const old = bak('normal'); delete old.data['facts.apollo'].mode;
    set('easy'); R.player('orion'); res.oldBackup = R.restore(old, 'backup'); R.player('apollo'); res.oldPick = R.mode().pick;
    set('hard'); R.player('orion'); res.oldBest = R.restore(old, 'best'); R.player('apollo'); res.oldBestPick = R.mode().pick;
    const bE = bak('easy');
    for (const [dev, nm] of [['hard', 'dHard'], [null, 'dNone']]) for (const ch of ['backup', 'best']) {
      set(dev); R.player('orion');
      const x = R.restore(bE, ch); R.player('apollo');
      res[nm + ch] = { ok: x.ok, pick: R.mode().pick, saved: JSON.parse(localStorage.getItem('robotbattle.facts.apollo')).mode ?? null };
    }
    res.backupHard = bak('hard');
    return res; })()`);
  ok('a backup made before #132 (no mode field) restores: "Use the backup" keeps this device\'s Easy, "Keep the best" its Hard', r.oldBackup.ok && r.oldPick === 'easy' && r.oldBest.ok && r.oldBestPick === 'hard', r);
  for (const [k, want, label] of [['dHardbackup', 'hard', 'device Hard, backup Easy, "Use the backup"'], ['dHardbest', 'hard', 'device Hard, backup Easy, "Keep the best"'],
    ['dNonebackup', 'normal', 'device without the field (Normal), backup Easy, "Use the backup"'], ['dNonebest', 'normal', 'device without the field (Normal), backup Easy, "Keep the best"']]) {
    ok(`${label}: this device's mode, ${want}`, r[k]?.ok && r[k].pick === want && (r[k].saved ?? 'normal') === want, r[k]);
  }
  // into main (before #132): this build's backup restores there, with both choices, and the child loads
  const bk = r.backupHard, mu = mainUrl();
  ok('this build\'s backup carries the mode (facts.apollo.mode = hard)', bk?.data?.['facts.apollo']?.mode === 'hard', bk?.data?.['facts.apollo']?.mode);
  for (const ch of ['backup', 'best']) {
    await C.open(1280, 800, false, mu);
    const m = await C.ev(`(() => { const R = window.__rb; localStorage.clear(); const x = R.restore(${JSON.stringify(bk)}, '${ch}'); const p = R.player('apollo');
      return { ok: x.ok, why: x.why ?? null, player: p.ok, mode: JSON.parse(localStorage.getItem('robotbattle.facts.apollo') || 'null')?.mode ?? null, hasHook: typeof R.mode === 'function' }; })()`);
    ok(`a backup from this build restores into main (${MAIN_SHA}) with "${ch === 'backup' ? 'Use the backup' : 'Keep the best'}", and the child loads (main ${m.mode ? 'keeps' : 'ignores'} the field)`, m.ok && m.player && !m.hasHook, m);
  }
  return out;
}

// the elements measured on screen
const BOX = String.raw`((sel) => {
  const W = innerWidth, H = innerHeight, bad = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
    if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) bad.push({ el: (el.id || el.className?.baseVal || el.className || el.tagName) + '', l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) });
  }
  return { W, H, bad, docX: document.documentElement.scrollWidth - W, docY: document.documentElement.scrollHeight - H };
})`;
const at = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null; })()`;
const CHIP = `(() => { const R = window.__rb, s = R.mode(), el = document.querySelector('#modeB'); return { ...s, chip: el?.dataset.m ?? null, lit: el ? el.querySelectorAll('.mbars i.on').length : null, label: el?.getAttribute('aria-label') ?? null, pilot: !!R.Game.pilot }; })()`;

async function runSize(C, size) {
  const [w, h] = size.split('x').map(Number), touch = w < 1200;
  const out = [], ok = (name, pass, got) => { out.push({ name: size + ': ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(w, h, touch);
  if (!(await C.ev(has('mode')))) { ok('__rb.mode exists', false, 'missing'); return out; }
  // the widest kidbar: a 10-letter name and the wave chip (best 14)
  const id = await C.ev(`(() => { const R = window.__rb; const z = R.addProfile('Maximilian'); return z.id; })()`);
  await C.ev(SEED(id, 14));
  await C.open(w, h, touch);
  await C.ev(`(() => { window.__pad = { id: 'check pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; return true; })()`);
  await C.ev(`(() => { window.__rb.player('${id}'); return true; })()`);
  await sleep(150);
  let s = await C.ev(CHIP);
  ok('on the pilot pick: the mode chip shows Normal (2 bars lit) for a child who never picked', s.shown && s.pick === 'normal' && s.chip === 'normal' && s.lit === 2 && /Normal/.test(s.label), s);
  ok('the wave chip shows beside it (the widest kidbar)', await C.ev(`window.__rb.wavePick('state').shown`), null);
  let b = await C.ev(BOX + `('#start .kidbar, #start .kidbar > *, #start .pilots .pilot')`);
  ok('the kidbar (4 chips) and the pilots on screen, no page overflow', b.bad.length === 0 && b.docX <= 0, b);
  const hit = await C.ev(String.raw`(() => { const R = (q) => document.querySelector(q)?.getBoundingClientRect(), x = (a, b) => a && b && a.width && b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const mine = [...document.querySelectorAll('#start .kidbar > *, #start .pilots .pilot, #start .logo')].filter((e) => e.getClientRects().length);
    const self = []; const k = [...document.querySelectorAll('#start .kidbar > *')].filter((e) => e.getClientRects().length);
    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) if (x(k[i].getBoundingClientRect(), k[j].getBoundingClientRect())) self.push(k[i].id + ' x ' + k[j].id);
    return [...self, ...mine.flatMap((e) => ['#parentB', '#hud .health'].filter((q) => x(e.getBoundingClientRect(), R(q))).map((q) => (e.id || e.className) + ' x ' + q))]; })()`);
  ok('the chips clear of each other, and the chips and pilots clear of the parent button and the health bar', hit.length === 0, hit);
  let c = await C.ev(at('#modeB'));
  ok('the mode chip is at least 44 px', c && c.h >= 44 && c.w >= 44, c);
  const hitTest = await C.ev(`(() => { const el = document.querySelector('#modeB'), r = el.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && el.contains(e); })()`);
  ok('nothing over the mode chip (elementFromPoint at its middle is the chip)', hitTest, null);
  ok('no emoji in the kidbar (icons only)', (await C.ev(`__rb.emojiLeft('#start .kidbar')`)) === 0, await C.ev(`__rb.emojiLeft('#start .kidbar', true)`));
  if (shots) { const sh = await C.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, `modes-${size}.png`), Buffer.from(sh.result.data, 'base64')); }
  // ---- touch (a click at desktop): Normal -> Hard
  if (c) await (touch ? C.tap(c.x, c.y) : C.click(c.x, c.y));
  s = await C.ev(CHIP);
  ok(`${touch ? 'a tap' : 'a click'} on the chip: Normal -> Hard (3 bars), saved, no pilot started`, s.pick === 'hard' && s.chip === 'hard' && s.lit === 3 && s.saved === 'hard' && !s.pilot, s);
  // ---- the keyboard: ArrowDown on the pilot pick cycles Hard -> Easy
  await C.key('ArrowDown', 40); await sleep(80);
  s = await C.ev(CHIP);
  ok('ArrowDown on the pilot pick: Hard -> Easy (1 bar), saved, no pilot started', s.pick === 'easy' && s.chip === 'easy' && s.lit === 1 && s.saved === 'easy' && !s.pilot, s);
  // ---- the gamepad: d-pad down Easy -> Normal -> Hard
  await C.ev(`(() => { navigator.getGamepads = () => [window.__pad]; return true; })()`); await sleep(120);
  await C.padBtn(13);
  s = await C.ev(CHIP);
  ok('pad d-pad down: Easy -> Normal', s.pick === 'normal' && s.chip === 'normal' && !s.pilot, s);
  await C.padBtn(13);
  s = await C.ev(CHIP);
  ok('pad d-pad down again: Normal -> Hard, saved', s.pick === 'hard' && s.chip === 'hard' && s.saved === 'hard' && !s.pilot, s);
  // the wave picker still opens with ▲ (the d-pad's up) and closes with B, untouched by the mode chip
  await C.padBtn(12); const wp = await C.ev(`__rb.wavePick('state').on`); await C.padBtn(1);
  ok('the wave picker still opens on d-pad up (and B closes it)', wp && !(await C.ev(`__rb.wavePick('state').on`)), wp);
  // ---- pad A starts the run in Hard; then the chip is gone and the mode can't change
  await C.padBtn(0); await sleep(150);
  const g = await C.ev(String.raw`(() => { const R = window.__rb, G = R.Game; const ch = G.robots.filter((r) => r.type === 'charger' && r.state !== 'ally').map((r) => r.maxHealth);
    const x = R.mode('easy'), el = document.querySelector('#modeB'); return { pilot: !!G.pilot, wave: G.wave, run: R.mode().run, ch, base: R.ROBOT_TYPES.charger.health, x, vis: !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !!el.closest('#start.on') }; })()`);
  ok('pad A starts the run in Hard: wave 1\'s Charger at 1.25 x its health', g.pilot && g.wave === 1 && g.run === 'hard' && g.ch.length === 1 && g.ch[0] === Math.round(g.base * 1.25), g);
  ok('mid-run the mode chip is gone and the mode can\'t change', !g.vis && !g.x.ok && g.run === 'hard', g);
  await C.ev(`(() => { navigator.getGamepads = () => []; window.__rb.manual(true); return true; })()`);
  // the pause screen (the kidbar shows there): no mode chip. (The mouse let go pauses, as it does in play.)
  const p = await C.ev(`(() => { document.dispatchEvent(new Event('pointerlockchange')); const el = document.querySelector('#modeB'), st = document.querySelector('#start');
    return { paused: window.__rb.Game.paused, pause: st.classList.contains('on') && !st.classList.contains('title'), kidbar: document.querySelector('#start .kidbar').getClientRects().length > 0, vis: el.getClientRects().length > 0 }; })()`);
  ok('on the pause screen the mode chip doesn\'t show', p.paused && p.pause && !p.vis, p);
  return out;
}


async function main() {
  const all = []; const unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now();
    try {
      const C = await connect(S);
      const res = run === 'logic' ? await runLogic(C) : await runSize(C, run);
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
finally { await kill(shared); rmMain(); }
process.exit(code);
