#!/usr/bin/env node
// Robot Battle wave picker check (#129): the waves each saved child has cleared (rec.waves.best), and the picker that starts a
// run at any of them or the next.
//
// Each run is its own headless Chrome (muted, not detached, killed with its profile deleted on every way out, as
// scripts/rb-fact-progress.mjs does):
//   logic   - at 1280 x 800, through window.__rb (clearing a wave the way play does: each robot downed, then taken apart):
//             * recording: clearing waves 1-3 records best = 3, saved; a reload keeps it; Guest records nothing (no record,
//               no field); a page opened with ?wave=7 records nothing (wave 7 cleared, best stays 3, and the picker is
//               hidden); __rb.waveTo(9) on an empty meadow records nothing; best is latched (a lower clear never lowers it);
//             * the picker range: best 3 offers waves 1-4 (no boss), best 4 offers 1-5 with 5 marked boss; nothing cleared:
//               no picker, and the run starts at wave 1 as today;
//             * starting at wave N (a real start, not manual): wave 3 and wave 5 (a boss wave) spawn the same robot types
//               as the same wave opened with ?wave=N (both through Waves.spawn), and Waves.list(N)'s types; the squad (its
//               ids, names, health) and the bag are the same before and after; clearing wave N then records N;
//               a pick a child can't have (another child's best + 1) is clamped to their own range;
//             * saves: a record saved before #129 (no waves field) loads with best 0; a backup with no waves field restores
//               (best 0); "Use the backup" and "Keep the best" never lower best (device 5 / backup 2 -> 5, device 2 /
//               backup 5 -> 5); and a backup from this build restores into main (3bd88e7, before #129) with both choices,
//               main keeping or ignoring the field and loading the child.
//   size    - at each size, with best = 3 and with best = 14 (15 tiles, three boss waves): the chip on the pilot pick and the
//             open picker all on screen (bounding boxes), the tiles at least 44 px, the panel scrolling only inside itself
//             and keeping the cursor's tile in view, no sideways overflow; picked by touch (a mouse click at desktop), by
//             the keyboard (ArrowUp opens it, arrows move, Enter picks, Escape closes) and by a gamepad (a stubbed
//             navigator.getGamepads, read by the game's own loop: d-pad up opens it, the d-pad moves, A picks, B closes).
//
// Usage:
//   node scripts/rb-wave-picker.mjs                        # ./robot-battle.html: logic, then every size
//   node scripts/rb-wave-picker.mjs --logic                # the logic run only
//   node scripts/rb-wave-picker.mjs --size 568x320         # one size only (repeatable); no logic run
//   node scripts/rb-wave-picker.mjs --main path.html       # main's page for the "into main" check (default: git show 3bd88e7)
//   node scripts/rb-wave-picker.mjs --shots DIR            # also save a screenshot of the open picker per size
//   node scripts/rb-wave-picker.mjs path/or/url.html --json
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
const MAIN_SHA = '3bd88e7';
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

// main's page (before #129), for "a backup from this build restores into main": a temp copy from git, removed at exit
let mainTmp = null;
function mainUrl() {
  if (mainPage) return pathToFileURL(mainPage).href;
  mainTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-wave-main-'));
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
const has = (fn) => `typeof window.__rb.${fn} === 'function'`;

let shared = null;
function launch() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-wave-picker-'));
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
  for (let i = 0; i < 100 && !tgt; i++) {
    try { const f = fs.readFileSync(path.join(S.prof, 'DevToolsActivePort'), 'utf8'); if (f.includes('\n')) port = parseInt(f, 10) || undefined; } catch {}
    if (port) try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!tgt) await sleep(200);
  }
  if (!tgt) throw new Error('Chrome did not start (' + chromeBin + ')');
  const ws = S.ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map(), errs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { pend.get(m.id)?.(m); pend.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) errs.push('log: ' + m.params.entry.text);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
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
  if (!(await C.ev(has('waves')))) { ok('__rb.waves exists (the waves cleared and the picker\'s range)', false, 'missing'); ok('__rb.wavePick exists (the picker)', await C.ev(has('wavePick')), 'missing'); return out; }

  // ---- nothing cleared: no picker, and wave 1 as today
  let r = await C.ev(`(() => { const R = window.__rb; R.player('apollo'); return { w: R.waves(), chip: R.wavePick('state').shown }; })()`);
  ok('a fresh child: best 0, the picker offers only wave 1 and its chip is hidden', r.w.best === 0 && JSON.stringify(r.w.offer) === '[1]' && r.chip === false, r);

  // ---- recording: waves 1-3 cleared as play clears them
  r = await C.ev(String.raw`(() => { ${HELPERS} R.manual(true); R.player('apollo'); R.start(0); const steps = [];
    for (let w = 1; w <= 3; w++) { const n = R.nextWave(); const c = clearWave(); steps.push({ n: n.wave, ...c, best: R.waves().best }); }
    return { steps, best: R.waves().best, saved: saved('apollo')?.waves }; })()`);
  ok('clearing waves 1, 2 and 3 records best 1, 2 then 3 as each clear screen shows', r.steps.map((s) => s.cleared && s.screen && s.best).join() === '1,2,3', r.steps);
  ok('best 3 is saved in the record (rec.waves.best)', r.saved?.best === 3, r.saved);
  // latched: a lower wave's clear never lowers it (waveTo 1 on an empty meadow clears at once, but it isn't play either)
  r = await C.ev(`(() => { const R = window.__rb; const a = R.waveTo(9); return { a, best: R.waves().best }; })()`);
  ok('__rb.waveTo(9) on an empty meadow (cleared at once) records nothing: best stays 3', r.best === 3, r);
  r = await C.ev(String.raw`(() => { ${HELPERS} R.Facts.rec.waves.best = 3; R.Waves.counts = true; R.Facts.clearedWave?.(2); return R.waves().best; })()`);
  ok('best is latched: recording wave 2 after best 3 leaves 3', r === 3, r);
  // a reload keeps it; the picker now offers 1-4
  await C.open(1280, 800, false);
  r = await C.ev(`(() => { const R = window.__rb; R.player('apollo'); const s = R.wavePick('state'); return { w: R.waves(), s }; })()`);
  ok('a reload keeps best 3', r.w.best === 3, r.w);
  ok('best 3: the picker offers waves 1-4, none a boss wave, and its chip shows', JSON.stringify(r.w.offer) === '[1,2,3,4]' && r.w.boss.length === 0 && r.s.shown === true, r);
  r = await C.ev(`(() => { const R = window.__rb; R.wavePick('open'); const s = R.wavePick('state'); R.wavePick('close'); return s; })()`);
  ok('best 3: the open picker shows 4 tiles, numbered 1-4, with no ⚔️', r.on && r.tiles.map((t) => t.n).join() === '1,2,3,4' && r.tiles.every((t) => !t.boss), r);

  // ---- Guest records nothing
  r = await C.ev(String.raw`(() => { ${HELPERS} R.manual(true); R.player('guest'); R.start(0); R.nextWave(); const c = clearWave();
    return { c, rec: R.Facts.rec.waves ?? null, w: R.waves(), key: localStorage.getItem('robotbattle.facts.guest'), chip: R.wavePick('state').shown }; })()`);
  ok('Guest: wave 1 cleared (the clear screen up) records nothing: no waves field, no saved record, no picker', r.c.cleared && r.c.screen && (r.rec == null || !r.rec.best) && r.w.best === 0 && r.key == null && r.chip === false, r);

  // ---- ?wave=7 never counts
  await C.open(1280, 800, false, withQ(url, 'wave=7'));
  r = await C.ev(String.raw`(() => { ${HELPERS} R.player('apollo'); const chip = R.wavePick('state').shown; R.manual(true); R.start(0); const n = R.nextWave(); const c = clearWave();
    return { n: n.wave, c, best: R.waves().best, saved: saved('apollo')?.waves, chip }; })()`);
  ok('?wave=7: the picker chip is hidden (the address picks the wave)', r.chip === false, r);
  ok('?wave=7: wave 7 comes out and is cleared (the clear screen up), and best stays 3, saved', r.n === 7 && r.c.cleared && r.c.screen && r.best === 3 && r.saved?.best === 3, r);
  // any ?wave= counts for nothing, even ?wave=1: Orion (nothing cleared) clears wave 1 there and still has best 0
  await C.open(1280, 800, false, withQ(url, 'wave=1'));
  r = await C.ev(String.raw`(() => { ${HELPERS} R.player('orion'); R.manual(true); R.start(0); const n = R.nextWave(); const c = clearWave();
    return { n: n.wave, c, best: R.waves().best, saved: saved('orion')?.waves ?? null }; })()`);
  ok('?wave=1: Orion clears wave 1 (the clear screen up) and best stays 0', r.n === 1 && r.c.cleared && r.c.screen && r.best === 0 && !(r.saved?.best), r);

  // ---- best 4 offers 1-5 with 5 marked as the boss wave
  await C.open(1280, 800, false);
  r = await C.ev(SEED('apollo', 4));
  await C.open(1280, 800, false);
  r = await C.ev(`(() => { const R = window.__rb; R.player('apollo'); R.wavePick('open'); const s = R.wavePick('state'); R.wavePick('close'); return { w: R.waves(), s }; })()`);
  ok('best 4: the picker offers 1-5, wave 5 marked ⚔️ (a boss wave, Waves.boss)', JSON.stringify(r.w.offer) === '[1,2,3,4,5]' && JSON.stringify(r.w.boss) === '[5]' && r.s.tiles.find((t) => t.n === 5)?.boss && r.s.tiles.filter((t) => t.boss).length === 1, r);

  // ---- starting at wave N: the composition, the squad and the bag. Reference: the same wave from ?wave=N (Waves.spawn too)
  const refTypes = {};
  for (const n of [3, 5]) {
    await C.open(1280, 800, false, withQ(url, 'wave=' + n));
    refTypes[n] = await C.ev(String.raw`(() => { ${HELPERS} R.player('guest'); R.start(0); R.manual(true); return { types: types(), list: R.waveList(${n}), wave: G.wave }; })()`);
  }
  for (const n of [3, 5]) {
    await C.open(1280, 800, false);
    // a saved squad of two, and a bag, before the run starts
    await C.ev(SEED('apollo', 4, `R.Facts.rec.squad = [{ id: 'sq-a', type: 'charger', name: 'Bolt', health: 80, damage: {}, upg: { plating: 1, job: 0 } }, { id: 'sq-b', type: 'bouncer', name: 'Zip', health: 60, damage: {}, upg: { plating: 0, job: 0 } }];`));
    await C.open(1280, 800, false);
    r = await C.ev(String.raw`(() => { ${HELPERS} R.player('apollo'); G.bag = { armour: 2, motor: 1 };
      const sq = () => G.squad.map((q) => [q.uid, q.name, q.type, Math.round(q.health), q.maxHealth].join(':')).sort().join('|');
      const before = { squad: sq(), bag: JSON.stringify(G.bag), parts: G.parts };
      const p = R.wavePick('pick', ${n}); const s = R.start(0); R.manual(true);
      const t = types(), list = R.waveList(${n});
      return { p, wave: G.wave, types: t, list, before, after: { squad: sq(), bag: JSON.stringify(G.bag), parts: G.parts }, squadIds: G.squad.map((q) => q.uid) }; })()`);
    const ref = refTypes[n], uniq = (a) => [...new Set(a)].sort().join();
    ok(`picking wave ${n} and starting (a real start) brings out wave ${n}`, r.wave === n, r);
    ok(`wave ${n} from the picker: the same robots, type for type, as ?wave=${n}`, r.types.join() === ref.types.join(), { picker: r.types, url: ref.types });
    ok(`wave ${n} from the picker: every type Waves.list(${n}) names (${uniq(r.list)})${n === 5 ? ', the Knight and the satellite with them' : ''}`, uniq(r.types.filter((x) => x !== 'satellite' && x !== 'minion')) === uniq(r.list.flatMap((x) => (x === 'ninja' ? ['ninja'] : [x]))) && (n !== 5 || (r.types.includes('knight') && r.types.includes('satellite'))), { types: r.types, list: r.list });
    ok(`wave ${n} from the picker: the squad (ids, names, health) and the bag unchanged`, r.before.squad === r.after.squad && r.before.bag === r.after.bag && r.squadIds.length === 2, { before: r.before, after: r.after });
    if (n === 3) {
      r = await C.ev(String.raw`(() => { ${HELPERS} const c = clearWave(); return { c, best: R.waves().best }; })()`);
      ok('wave 3 from the picker (best 4): cleared, best stays 4', r.c.cleared && r.best === 4, r);
    } else {
      r = await C.ev(String.raw`(() => { ${HELPERS} const c = clearWave(); return { c, best: R.waves().best, saved: saved('apollo')?.waves?.best }; })()`);
      ok('wave 5 from the picker (best 4, the boss wave): cleared, best 5, saved', r.c.cleared && r.best === 5 && r.saved === 5, r);
    }
  }
  // the pick is clamped to whoever starts: Apollo picks 5, goes back, Orion (nothing cleared) starts at wave 1
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${HELPERS} R.player('apollo'); const p = R.wavePick('pick', 5); R.player(null); R.player('orion'); const w = R.waves(); R.start(0); R.manual(true); return { p, w, wave: G.wave }; })()`);
  ok('a pick is the child\'s own: Apollo picks 5, ◀ back, Orion (nothing cleared) starts at wave 1', r.wave === 1 && r.w.best === 0, r);

  // ---- saves
  await C.open(1280, 800, false);
  // a record saved before #129: no waves field
  await C.ev(`(() => { const R = window.__rb; R.player('orion'); const k = 'robotbattle.facts.orion', v = JSON.parse(localStorage.getItem(k)); delete v.waves; localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  await C.open(1280, 800, false);
  r = await C.ev(`(() => { const R = window.__rb; R.player('orion'); return { w: R.waves(), chip: R.wavePick('state').shown }; })()`);
  ok('a record saved before #129 (no waves field) loads with best 0 and no picker', r.w.best === 0 && r.chip === false, r);
  // backups: a backup without the field; then device vs backup either way, with "Use the backup" and "Keep the best"
  r = await C.ev(String.raw`(() => { const R = window.__rb, B = R.Backup;
    const set = (n) => { R.player('apollo'); if (n == null) delete R.Facts.rec.waves; else R.Facts.rec.waves = { best: n }; R.Facts.save(); };
    const bak = (n) => { set(n); return JSON.parse(JSON.stringify(R.backup())); };
    const res = {};
    const old = bak(null); delete old.data['facts.apollo'].waves;
    set(0); R.player('orion');
    res.oldBackup = R.restore(old, 'backup').ok; R.player('apollo'); res.oldBest = R.waves().best;
    const b2 = bak(2), b5 = bak(5);
    for (const [dev, b, nm] of [[5, b2, 'd5b2'], [2, b5, 'd2b5']]) for (const ch of ['backup', 'best']) {
      set(dev); R.player('orion');
      const x = R.restore(b, ch); R.player('apollo');
      res[nm + ch] = { ok: x.ok, best: R.waves().best, saved: JSON.parse(localStorage.getItem('robotbattle.facts.apollo')).waves?.best };
    }
    set(5); res.backup5 = bak(5);
    return res; })()`);
  ok('a backup made before #129 (no waves field) restores, and the child loads with best 0', r.oldBackup && r.oldBest === 0, r);
  for (const [k, want, label] of [['d5b2backup', 5, 'device 5, backup 2, "Use the backup"'], ['d5b2best', 5, 'device 5, backup 2, "Keep the best"'], ['d2b5backup', 5, 'device 2, backup 5, "Use the backup"'], ['d2b5best', 5, 'device 2, backup 5, "Keep the best"']]) {
    ok(`${label}: best ${want}, saved`, r[k]?.ok && r[k].best === want && r[k].saved === want, r[k]);
  }
  // into main (before #129): this build's backup restores there, with both choices, and the child loads
  const bk = r.backup5, mu = mainUrl();
  for (const ch of ['backup', 'best']) {
    await C.open(1280, 800, false, mu);
    const m = await C.ev(`(() => { const R = window.__rb; localStorage.clear(); const x = R.restore(${JSON.stringify(bk)}, '${ch}'); const p = R.player('apollo');
      return { ok: x.ok, why: x.why ?? null, player: p.ok, waves: JSON.parse(localStorage.getItem('robotbattle.facts.apollo') || 'null')?.waves ?? null, hasHook: typeof R.waves === 'function' }; })()`);
    ok(`a backup from this build restores into main (${MAIN_SHA}) with "${ch === 'backup' ? 'Use the backup' : 'Keep the best'}", and the child loads (main keeps or ignores waves)`, m.ok && m.player && !m.hasHook, m);
  }
  return out;
}

// the chip, the open picker and the kidbar measured
const BOX = String.raw`((sel) => {
  const W = innerWidth, H = innerHeight, bad = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
    if (el.closest('#wavePick .wtiles') && !el.matches('.wtiles')) continue;   // (tiles scrolled out of the panel are checked by INVIEW)
    if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) bad.push({ el: (el.id || el.className?.baseVal || el.className || el.tagName) + '', l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) });
  }
  return { W, H, bad, docX: document.documentElement.scrollWidth - W, docY: document.documentElement.scrollHeight - H };
})`;
// the tiles inside the panel's scroll box: the cursor's (and the picked one's) wholly in view; every tile at least 44 px
const INVIEW = String.raw`(() => {
  const box = document.querySelector('#wavePick .wtiles'); if (!box) return null; const b = box.getBoundingClientRect();
  const all = [...box.querySelectorAll('.wt')], cur = box.querySelector('.wt.cur'), r = cur?.getBoundingClientRect();
  return { n: all.length, min: Math.round(Math.min(...all.map((t) => Math.min(t.getBoundingClientRect().width, t.getBoundingClientRect().height)))),
    cur: cur ? +cur.dataset.n : null, curIn: !!r && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5 && r.left >= b.left - 0.5 && r.right <= b.right + 0.5,
    scrollX: box.scrollWidth - box.clientWidth, scrolls: box.scrollHeight > box.clientHeight + 1 };
})()`;
const at = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null; })()`;

async function runSize(C, size) {
  const [w, h] = size.split('x').map(Number), touch = w < 1200;
  const out = [], ok = (name, pass, got) => { out.push({ name: size + ': ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(w, h, touch);
  if (!(await C.ev(has('wavePick')))) { ok('__rb.wavePick exists', false, 'missing'); return out; }
  for (const best of [3, 14]) {
    const tag = `best ${best}`;
    await C.ev(SEED('apollo', best));
    await C.open(w, h, touch);
    // the game's own loop reads this pad (navigator.getGamepads stubbed before anything reads it)
    await C.ev(`(() => { window.__pad = { id: 'check pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; return true; })()`);
    await C.ev(`(() => { window.__rb.player('apollo'); return true; })()`);
    await sleep(150);
    let s = await C.ev(`__rb.wavePick('state')`);
    ok(`${tag}: on the pilot pick, the wave chip shows wave 1 (the default start)`, s.shown && s.pick === 1, s);
    let b = await C.ev(BOX + `('#start .kidbar, #start .kidbar > *, #start .pilots .pilot')`);
    ok(`${tag}: the pilot pick with the chip: the kidbar and the pilots on screen, no page overflow`, b.bad.length === 0 && b.docX <= 0, b);
    const hit = await C.ev(String.raw`(() => { const R = (q) => document.querySelector(q)?.getBoundingClientRect(), x = (a, b) => a && b && a.width && b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const mine = [...document.querySelectorAll('#start .kidbar > *, #start .pilots .pilot, #start .logo')].filter((e) => e.getClientRects().length);
      return mine.flatMap((e) => ['#parentB', '#hud .health'].filter((q) => x(e.getBoundingClientRect(), R(q))).map((q) => (e.id || e.className) + ' x ' + q)); })()`);
    ok(`${tag}: the chips and the pilots clear of the parent button and the health bar`, hit.length === 0, hit);
    // ---- touch (a click at desktop): open, then tile 3
    let c = await C.ev(at('#waveB'));
    ok(`${tag}: the chip is at least 44 px`, c && c.h >= 44 && c.w >= 44, c);
    if (c) await (touch ? C.tap(c.x, c.y) : C.click(c.x, c.y));
    s = await C.ev(`__rb.wavePick('state')`);
    ok(`${tag}: ${touch ? 'a tap' : 'a click'} on the chip opens the picker with tiles 1-${best + 1}`, s.on && s.tiles.length === best + 1 && s.tiles.map((t) => t.n).join() === Array.from({ length: best + 1 }, (_, i) => i + 1).join(), s);
    const bossN = s.tiles.filter((t) => t.boss).map((t) => t.n).join();
    ok(`${tag}: the boss waves are marked ⚔️ (${bossN || 'none'})`, bossN === (best >= 14 ? '5,10,15' : ''), s.tiles);
    b = await C.ev(BOX + `('#wavePick .wpanel, #wavePick .wpanel *')`);
    let v = await C.ev(INVIEW);
    ok(`${tag}: the open picker all on screen, tiles at least 44 px, no sideways scroll`, b.bad.length === 0 && b.docX <= 0 && v.min >= 44 && v.scrollX <= 1, { b, v });
    const over = await C.ev(String.raw`(() => { const p = document.querySelector('#wavePick .wpanel').getBoundingClientRect(), box = document.querySelector('#waveTiles').getBoundingClientRect(), bad = [];
      const pts = [[p.left + 14, p.top + 14], [p.right - 14, p.top + 14], [p.left + 14, p.bottom - 14], [p.right - 14, p.bottom - 14]];
      for (const t of document.querySelectorAll('#waveTiles .wt')) { const r = t.getBoundingClientRect(); if (r.top >= box.top && r.bottom <= box.bottom) pts.push([r.left + r.width / 2, r.top + r.height / 2]); }
      for (const [x, y] of pts) { const e = document.elementFromPoint(x, y); if (!e || !e.closest('#wavePick')) bad.push({ x: Math.round(x), y: Math.round(y), el: e ? (e.id || e.className?.baseVal || e.className || e.tagName) + '' : null }); }
      return bad; })()`);
    ok(`${tag}: nothing over the open picker (its corners and every tile in view are the picker's own)`, over.length === 0, over);
    ok(`${tag}: no emoji in the picker (icons only)`, (await C.ev(`__rb.emojiLeft('#wavePick')`)) === 0, await C.ev(`__rb.emojiLeft('#wavePick', true)`));
    if (shots) { const sh = await C.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, `picker-${best}-${size}.png`), Buffer.from(sh.result.data, 'base64')); }
    c = await C.ev(at('#wavePick .wt[data-n="3"]'));
    if (c) await (touch ? C.tap(c.x, c.y) : C.click(c.x, c.y));
    s = await C.ev(`__rb.wavePick('state')`);
    ok(`${tag}: ${touch ? 'a tap' : 'a click'} on tile 3 picks wave 3 and closes the picker; the chip shows 3`, !s.on && s.pick === 3 && s.chipN === 3, s);
    // ---- the keyboard: ArrowUp opens it (on the picked tile), ArrowRight x2 then Enter picks 5 (a boss wave)
    await C.key('ArrowUp', 38); await sleep(80);
    s = await C.ev(`__rb.wavePick('state')`);
    ok(`${tag}: ArrowUp on the pilot pick opens the picker, the cursor on the picked wave (3)`, s.on && s.cur === 3, s);
    await C.key('ArrowRight', 39); await C.key('ArrowRight', 39);
    s = await C.ev(`__rb.wavePick('state')`);
    if (best >= 4) {
      ok(`${tag}: ArrowRight x2 moves the cursor to 5`, s.on && s.cur === 5, s);
      await C.key('Enter', 13);
      s = await C.ev(`__rb.wavePick('state')`);
      ok(`${tag}: Enter picks wave 5 and closes; the chip shows 5 as a boss wave; no pilot was started`, !s.on && s.pick === 5 && s.chipN === 5 && s.chipBoss && (await C.ev('!__rb.Game.pilot')), s);
    } else {
      ok(`${tag}: ArrowRight x2 from 3 stops at the last tile (4)`, s.on && s.cur === 4, s);
      await C.key('Enter', 13);
      s = await C.ev(`__rb.wavePick('state')`);
      ok(`${tag}: Enter picks wave 4 and closes; no pilot was started`, !s.on && s.pick === 4 && s.chipN === 4 && (await C.ev('!__rb.Game.pilot')), s);
    }
    if (best >= 14) {
      // the cursor kept in view in a scrolling grid: ArrowDown to the bottom row
      await C.key('ArrowUp', 38); for (let i = 0; i < 6; i++) await C.key('ArrowDown', 40);
      v = await C.ev(INVIEW); s = await C.ev(`__rb.wavePick('state')`);
      ok(`${tag}: ArrowDown to the bottom row: the cursor (${v?.cur}) is wholly in view${v?.scrolls ? ' (the grid scrolls inside its panel)' : ''}`, s.on && v.curIn && v.cur > 10, { v, s: { cur: s.cur } });
      await C.key('Escape', 27);
    } else { await C.key('ArrowUp', 38); await C.key('Escape', 27); }
    s = await C.ev(`__rb.wavePick('state')`);
    ok(`${tag}: Escape closes the picker without changing the pick, still on the pilot pick`, !s.on && s.pick === (best >= 4 ? 5 : 4) && (await C.ev('!__rb.Game.pilot && !!__rb.Game.child')), s);
    // ---- the gamepad: d-pad up opens it, d-pad left picks 2 ... A picks; then B closes without a change
    const before = s.pick;
    await C.ev(`(() => { navigator.getGamepads = () => [window.__pad]; return true; })()`); await sleep(120);
    await C.padBtn(12);
    s = await C.ev(`__rb.wavePick('state')`);
    ok(`${tag}: pad d-pad up on the pilot pick opens the picker`, s.on && s.cur === before, s);
    for (let i = 0; i < before - 2; i++) await C.padBtn(14);
    s = await C.ev(`__rb.wavePick('state')`);
    ok(`${tag}: pad d-pad left moves the cursor to 2`, s.on && s.cur === 2, s);
    await C.padBtn(0);
    s = await C.ev(`__rb.wavePick('state')`);
    ok(`${tag}: pad A picks wave 2 and closes; no pilot was started`, !s.on && s.pick === 2 && s.chipN === 2 && (await C.ev('!__rb.Game.pilot')), s);
    await C.padBtn(12); await C.padBtn(15); await C.padBtn(1);
    s = await C.ev(`__rb.wavePick('state')`);
    ok(`${tag}: pad B closes the picker without changing the pick (still 2), still on the pilot pick`, !s.on && s.pick === 2 && (await C.ev('!__rb.Game.pilot && !!__rb.Game.child')), s);
    // and the run starts there: pad A on the pilot pick starts wave 2
    await C.padBtn(0); await sleep(150);
    const g = await C.ev(`({ wave: __rb.Game.wave, pilot: !!__rb.Game.pilot })`);
    ok(`${tag}: pad A on the pilot pick then starts the run at wave 2`, g.pilot && g.wave === 2, g);
    await C.ev(`(() => { navigator.getGamepads = () => []; window.__rb.manual(true); return true; })()`);
  }
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
