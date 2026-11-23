#!/usr/bin/env node
// Robot Battle boss trophy check (#195: a world boss's trophy records where it was won, not wave 0).
//
// One headless Chrome (muted, not detached, killed with its profile deleted on every way out, as scripts/rb-world.mjs
// does). Made-up profiles only. At 1280 x 800, through window.__rb:
//   * waves: a boss trophy latched in a waves run is { at, wave } as ever (no world field), and the waves' Bosses.won too;
//   * the world: one latched in the endless world is { at, world: true, level, dist }: the world level and the metres from
//     the start where it was won, no wave 0; saved in the record so, and the same after a reload;
//   * old saves: trophies saved before #195 ({ at, wave: 0 } from the world or a hand-dropped Knight, { at, wave: 10 } from
//     the waves) load as they were, a later win doesn't change them (||=), and a backup restored with "Use the backup" and
//     with "Keep the best" keeps them, next to a new world trophy, and the 🏆 wall wears them all.
// (A world boss really beaten and fixed on its board, through bossFixed, is checked in scripts/rb-world-harder.mjs.)
//
// Usage:
//   node scripts/rb-boss-trophy.mjs                    # ./robot-battle.html
//   node scripts/rb-boss-trophy.mjs path/or/url.html --json
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check passes with no page errors; 1 on a failed check; 2 if the run could not finish.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let target = null, json = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else target = args[i];
}
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runs = ['logic'];
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-boss-trophy-'));
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
const HARD_TIMEOUT_MS = 5 * 60 * 1000;
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
  const R = window.__rb, G = R.Game;
  const rec = (id) => JSON.parse(localStorage.getItem('robotbattle.facts.' + id) || 'null');
  // the 🏆 wall read back (as scripts/rb-centipede.mjs does): each part's slot, and the boss trophy it wears
  const wall = () => { R.manual(true); if (!G.pilot) R.start(0); document.dispatchEvent(new Event('pointerlockchange')); R.garage(true, 'trophies'); const d = R.Garage.dom(); R.garage(false); return d; };
  const worldOn = () => { R.world(true); R.start(0); R.manual(true); };
`;
// an old trophy, as a save made before #195 has it: a Knight won in the world (or dropped in by hand), wave 0
const OLD = { knight: { at: 1000, wave: 0 } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function runLogic(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'logic: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);

  // ---- waves: as ever
  let r = await C.ev(String.raw`(() => { ${H} ${CLEAR}; R.player('robo'); R.start(0); R.manual(true);
    const fresh = R.Garage.latchBoss('centipede'); return { wave: G.wave, world: G.world, fresh, b: R.Garage.bosses(), saved: rec('robo')?.garage?.bosses ?? null }; })()`);
  const wb = r.b.centipede;
  ok(`waves: a boss trophy is { at, wave } as ever (wave ${r.wave}, no world field)`, r.fresh && !r.world && wb && Object.keys(wb).sort().join() === 'at,wave' && wb.wave === r.wave && r.wave >= 1 && same(r.saved, r.b), r);

  // ---- the world: the level and the distance, not wave 0 (a page of its own: the world is picked before a run starts)
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} ${CLEAR}; R.player('tester'); worldOn(); R.worldGo(1000, 0);
    const p = G.humans[0].mech.pos, px = p.x, pz = p.z;
    // a boss robot (its level, where it stood): the trophy takes those; none given (a hook's latch): where player 1 is
    const k = R.Garage.latchBoss('knight', { pos: { x: 300, y: 0, z: 400 }, wlevel: 4 });
    const c = R.Garage.latchBoss('centipede');
    return { world: G.world, wave: G.wave, k, c, b: R.Garage.bosses(), want: { level: R.World.level(px, pz), dist: Math.round(Math.hypot(px, pz)) }, saved: rec('tester')?.garage?.bosses ?? null }; })()`);
  const isWorld = (t) => t && t.world === true && !('wave' in t) && Number.isFinite(t.at) && Number.isInteger(t.level) && t.level >= 1 && Number.isInteger(t.dist) && t.dist >= 0;
  ok('the world: a boss trophy is { at, world: true, level, dist }, no wave 0', r.world && r.wave === 0 && r.k && r.c && isWorld(r.b.knight) && isWorld(r.b.centipede), r);
  ok('... the boss robot\'s own level and how far out it was (level 4, 500 m)', r.b.knight?.level === 4 && r.b.knight?.dist === 500, r.b);
  ok(`... latched with no robot: where player 1 is (level ${r.want.level}, ${r.want.dist} m)`, r.b.centipede?.level === r.want.level && r.b.centipede?.dist === r.want.dist && r.want.dist >= 900, { b: r.b, want: r.want });
  ok('... saved in the record so', same(r.saved, r.b), r);
  const worldB = r.b;
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); const d = wall(); return { b: R.Garage.bosses(), sword: d?.slots?.sword?.boss, saw: d?.slots?.saw?.boss }; })()`);
  ok('after a reload: the same, and the 🏆 wall wears both trophies', same(r.b, worldB) && r.sword === 'knight' && r.saw === 'centipede', r);

  // ---- old saves: a trophy saved before #195 loads as it was (the record written on a fresh page before anyone is picked,
  // so nothing in memory saves over it)
  r = await C.ev(String.raw`(() => { ${H} ${CLEAR}; R.player('tester'); R.Facts.save(); return rec('tester'); })()`);
  const oldRec = { ...r, garage: { ...r.garage, bosses: OLD } };
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} localStorage.setItem('robotbattle.facts.tester', ${JSON.stringify(JSON.stringify(oldRec))}); R.player('tester'); return R.Garage.bosses(); })()`);
  const b0 = r;
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); const b0 = R.Garage.bosses(), d = wall(); return { b0, sword: d?.slots?.sword?.boss }; })()`);
  ok('an old save\'s trophy ({ at, wave: 0 }) loads as it was, and after a reload the 🏆 wall wears it', same(b0, OLD) && same(r.b0, OLD) && r.sword === 'knight', { b0, r });
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('tester');
    // won again in the world: the old one is kept as it was (||=); a new type's is the world's
    worldOn(); R.worldGo(700, 0);
    const k = R.Garage.latchBoss('knight', { pos: { x: 0, y: 0, z: 650 }, wlevel: 5 }), c = R.Garage.latchBoss('centipede', { pos: { x: 0, y: 0, z: 650 }, wlevel: 5 });
    R.Facts.save(); return { world: G.world, k, c, b: R.Garage.bosses(), saved: rec('tester')?.garage?.bosses ?? null, bk: JSON.parse(JSON.stringify(R.backup())) }; })()`);
  ok('... the Knight won again in the world leaves it as it was; the Centipede\'s new trophy is the world\'s', r.world && r.k === false && r.c === true && same(r.b.knight, OLD.knight) && isWorld(r.b.centipede) && r.b.centipede.level === 5 && r.b.centipede.dist === 650 && same(r.saved, r.b), r);
  const mixed = r.b, bk = r.bk;
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const res = {};
    ${CLEAR}; let x = R.restore(${JSON.stringify(bk)}, 'backup'); R.player('tester'); res.backup = { ok: x.ok, b: R.Garage.bosses() };
    // Keep the best over a device whose Knight trophy is a newer world one: the one won first (the old one) is kept
    ${CLEAR}; R.player('tester'); worldOn(); R.worldGo(900, 0); R.Garage.latchBoss('knight', { pos: { x: 900, y: 0, z: 0 }, wlevel: 7 }); R.Facts.save(); res.device = R.Garage.bosses();
    x = R.restore(${JSON.stringify(bk)}, 'best'); R.player('tester'); const d = wall(); res.best = { ok: x.ok, b: R.Garage.bosses(), sword: d?.slots?.sword?.boss, saw: d?.slots?.saw?.boss };
    return res; })()`);
  ok('a backup with old and new trophies restored with "Use the backup": both as they were', r.backup.ok && same(r.backup.b, mixed), { r, mixed });
  ok('... with "Keep the best" over a newer world Knight: the old Knight (won first) and the world Centipede, both on the 🏆 wall', r.best.ok && isWorld(r.device.knight) && same(r.best.b.knight, OLD.knight) && same(r.best.b.centipede, mixed.centipede) && r.best.sword === 'knight' && r.best.saw === 'centipede', { r, mixed });
  return out;
}

async function main() {
  const all = []; const unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now();
    try {
      const C = await connect(S);
      const res = await runLogic(C);
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
