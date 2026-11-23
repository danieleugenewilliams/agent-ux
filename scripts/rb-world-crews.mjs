#!/usr/bin/env node
// Robot Battle endless world check (#194: Copier and Ninja crews out in the world). Daniel's 1A, 2A, 3A:
//   1A: a Ninja crew can come out in the world from level 3 (300 m out), with 2 minions, and 3 minions from level 5
//       (600 m), the same as the waves; on Easy from level 6 (750 m). It is one more robot type in a chunk's seeded pick.
//   2A: the Copier comes in the world from level 4 (450 m out); on Easy from level 6 (750 m).
//   3A: it flies in to player 1 each time they first reach a new level from its starting level, every 2 levels (4, 6, 8 …).
//       Once per level in a run: back over a level line it doesn't come again. After a reload it can come again.
//
// One headless Chrome (muted, not detached, killed with its profile deleted on every way out, as scripts/rb-world.mjs
// does). Made-up profiles only.
//   logic  - at 1280 x 800, through window.__rb:
//            * waves untouched: the copier waves (Normal 4, 6, 8 …; Easy 6, 8 …) and the Ninja waves as they were;
//            * Normal: under level 3 a roaming robot is picked from the four types as before; from level 3 the Ninja crew is
//              a fifth; crews out in the world stand at level 3 (300 m) or more, 2 minions at levels 3-4, 3 from level 5;
//            * the Copier on Normal: none at level 3; at level 4 one flies in to player 1 (from near them, not the start),
//              scans and prints a clone (left far behind, it goes); back to 3 and to 4 again: none; level 5: none; level 6:
//              one; nothing new saved;
//            * Easy: no crew under level 6, crews from level 6 with 3 minions; no Copier at level 4, one at level 6;
//            * a reload: the Copier comes again at level 4.
//
// Usage:
//   node scripts/rb-world-crews.mjs                    # ./robot-battle.html
//   node scripts/rb-world-crews.mjs path/or/url.html --json
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check passes with no page errors; 1 on a failed check; 2 if the run could not finish.
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
const runs = ['logic'];
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-crews-'));
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
  const R = window.__rb, G = R.Game, W = R.World, WC = R.WORLD.chunk, STEP = R.WORLD.harder.step;
  const reload = () => { W.sweep(); for (const k of [...W.chunks.keys()]) W.unload(k); W.update(true); W.sweep(); };
  const keys = () => Object.keys(localStorage).sort();
  // the types a roaming robot is picked from at levels 1..20
  const pickAt = () => Array.from({ length: 20 }, (_, i) => ({ lv: i + 1, types: W.robotTypes(i + 1).slice() }));
  // the world robots out all swept away (moved far off, so World.sweep takes them as left behind), so the robot cap is free
  const clearOut = () => { for (const l of W.live.values()) for (const q of l) if (q.state === 'glitched') q.pos.x += 1e5; W.sweep(); };
  // walk player 1 round rings of spots, the chunks there loaded again each time, and note every Ninja crew that comes out (once a chunk)
  const hunt = (radii, n = 8) => { const seen = new Map();
    for (const d of radii) for (let i = 0; i < n; i++) { const a = (i + 0.37 * d / 100) / n * Math.PI * 2; clearOut(); R.worldGo(Math.cos(a) * d, Math.sin(a) * d); reload();
      for (const q of G.robots) if (q.type === 'ninja' && q.wkey && !seen.has(q.wkey)) { const mins = G.robots.filter((m) => m.type === 'minion' && m.crew === q.crew);
        seen.set(q.wkey, { id: q.id, key: q.wkey, lv: q.wlevel, at: Math.round(Math.hypot(q.pos.x, q.pos.z)), minions: mins.length, minLv: Math.min(...mins.map((m) => m.wlevel)) }); }
      for (const q of G.robots) if (q.type === 'minion' && q.wkey && !G.robots.some((z) => z.type === 'ninja' && z.crew === q.crew)) seen.set('lost' + q.id, { stray: q.id }); }
    return [...seen.values()]; };
  const copierN = () => R.Copier.made.length;
`;

async function runLogic(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'logic: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  if (!(await C.ev(`typeof window.__rb.World.robotTypes === 'function' && typeof window.__rb.World.copierAt === 'function'`))) ok('World.robotTypes and World.copierAt exist (#194)', false, 'missing');

  // ---- waves, untouched
  let r = await C.ev(String.raw`(() => { ${H} const L = (m) => [3, 4, 5, 6, 7].map((n) => R.Waves.list(n, m).filter((t) => t === 'ninja').length);
    return { cn: R.copierWaves(20, 'normal'), ce: R.copierWaves(20, 'easy'), ch: R.copierWaves(20, 'hard'), nn: L('normal'), ne: L('easy'), mf: [R.NINJA?.from ?? null] }; })()`);
  ok(`waves: copier waves as they were (Normal ${r.cn.join(',')}; Easy ${r.ce.join(',')})`, r.cn.join() === '4,6,8,10,12,14,16,18,20' && r.ce.join() === '6,8,10,12,14,16,18,20' && r.ch.join() === r.cn.join(), r);
  ok(`waves: a Ninja crew on waves 3-7 as before (Normal ${r.nn.join(',')}; Easy ${r.ne.join(',')})`, r.nn.join() === '1,1,1,1,1' && r.ne.join() === '0,0,0,1,1', r);

  // ---- Normal: the crew chunks
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); window.__k0 = keys(); R.world(true); R.start(0); R.manual(true); R.step(2);
    if (!W.robotTypes) return { none: true };
    const T = R.WORLD.robots.types.join(), all = pickAt(), near = all.filter((c) => c.lv < 3 && c.types.join() !== T), far = all.filter((c) => c.lv >= 3 && c.types.join() !== T + ',ninja');
    return { from: W.crewFrom(), near, far }; })()`);
  ok('Normal: under level 3 a robot is picked from the four types as before; from level 3 the Ninja crew is a fifth', !r.none && r.from === 3 && !r.near.length && !r.far.length, r);

  // ---- Normal: crews out in the world
  r = await C.ev(String.raw`(() => { ${H} if (!W.robotTypes) return { none: true }; const c = hunt([200, 330, 400, 470, 560, 680, 820, 1000], 10);
    const crews = c.filter((q) => q.id), stray = c.filter((q) => q.stray), lo = crews.filter((q) => q.lv < 3), wrongN = crews.filter((q) => q.minions !== (q.lv >= 5 ? 3 : 2));
    return { crews, stray, lo, wrongN, at34: crews.filter((q) => q.lv >= 3 && q.lv < 5).length, at5: crews.filter((q) => q.lv >= 5).length, minAt: Math.min(...crews.map((q) => q.at)), st: W.status().crews }; })()`);
  ok(`Normal: Ninja crews come out in the world, never under level 3 (${r.crews?.length} seen, nearest ${r.minAt} m)`, !r.none && r.crews.length >= 3 && !r.lo.length && r.minAt >= 300 && !r.stray.length, r);
  ok(`Normal: 2 minions at levels 3-4 (${r.at34} crews), 3 from level 5 (${r.at5} crews), each as tough as its level`, !r.none && r.at34 >= 1 && r.at5 >= 1 && !r.wrongN.length && r.crews.every((q) => q.minLv >= 3), r);
  ok('World.status lists the crews out', !r.none && Array.isArray(r.st), r.st);

  // ---- the Copier on Normal (3A)
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); window.__k0 = keys(); R.world(true); R.start(0); R.manual(true); R.step(2);
    const o = {}; R.worldGo(330, 10); R.step(30); o.l3 = { lvl: W.lvl, n: copierN() };
    R.worldGo(470, 10); R.step(5); o.l4 = { lvl: W.lvl, n: copierN(), c: R.Copier.list.map((c) => R.Copier.state(c)) };
    let s = null, t = 0; for (; t < 1500; t += 30) { R.step(30); s = R.Copier.list[0] && R.Copier.state(R.Copier.list[0]); if (s && s.phase !== 'wait' && !o.came) { const p = G.humans[0].mech.pos; o.came = { d: Math.round(Math.hypot(s.x - p.x, s.z - p.z)) }; } if (s && (s.phase === 'scan' || s.phase === 'print')) break; }
    o.scan = { s, t };
    for (let k = 0; k < 400 && !G.robots.some((q) => q.clone); k += 20) R.step(20);
    o.clone = G.robots.filter((q) => q.clone).length;
    R.worldGo(470, 550); R.step(5); W.sweep(); o.cloneFar = { lvl: W.lvl, n: G.robots.filter((q) => q.clone).length };   // (level 5: no Copier level)
    R.worldGo(330, 10); R.step(5); R.worldGo(470, 10); R.step(5); o.back = { lvl: W.lvl, n: copierN() };
    R.worldGo(620, 10); R.step(5); o.l5 = { lvl: W.lvl, n: copierN() };
    R.worldGo(770, 10); R.step(5); o.l6 = { lvl: W.lvl, n: copierN(), last: R.Copier.made.at(-1), lv: R.Copier.list.at(-1)?.level };
    o.copied = W.status().copied; o.k1 = keys(); o.k0 = window.__k0; o.world = Object.keys(R.Facts?.rec?.world || {});
    return o; })()`);
  ok(`Normal: no Copier at level 3 (level ${r.l3.lvl}: ${r.l3.n})`, r.l3.lvl === 3 && r.l3.n === 0, r.l3);
  ok(`Normal: the Copier sent on reaching level 4 (${r.l4.n})`, r.l4.lvl === 4 && r.l4.n === 1 && r.l4.c.length === 1 && r.l4.c[0].level === 4, r.l4);
  ok(`... it comes in from about WAVE.edge off player 1 (${r.came?.d} m) and is over them scanning within 12 s (${(r.scan.t / 60).toFixed(1)} s)`, r.came && r.came.d <= 110 && r.scan.s && (r.scan.s.phase === 'scan' || r.scan.s.phase === 'print') && r.scan.t < 720 && r.scan.s.over < 3, { came: r.came, scan: r.scan });
  ok(`... and prints a clone of player 1 (${r.clone})`, r.clone === 1, r.clone);
  ok(`... a clone left glitched far behind goes, as a roaming robot does (${r.cloneFar.n} left)`, r.cloneFar.lvl === 5 && r.cloneFar.n === 0, r.cloneFar);
  ok(`Normal: back over the level line and to level 4 again: no second Copier (${r.back.n}); level 5: none (${r.l5.n})`, r.back.lvl === 4 && r.back.n === 1 && r.l5.lvl === 5 && r.l5.n === 1, { back: r.back, l5: r.l5 });
  ok(`Normal: level 6: the Copier again (${r.l6.n}); levels it came for: ${JSON.stringify(r.copied)}`, r.l6.lvl === 6 && r.l6.n === 2 && r.l6.lv === 6 && JSON.stringify(r.copied) === '[4,6]', r);
  ok('nothing new saved: no new storage key, the record\'s world keeps only its own keys', r.k1.every((k) => r.k0.includes(k)) && r.world.every((k) => ['taken', 'rings'].includes(k)), { k0: r.k0, k1: r.k1, world: r.world });

  // ---- a reload: the Copier can come again at level 4
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.world(true); R.start(0); R.manual(true); R.step(2); R.worldGo(470, 10); R.step(5); return { lvl: W.lvl, n: copierN() }; })()`);
  ok(`after a reload the Copier comes again at level 4 (${r.n})`, r.lvl === 4 && r.n === 1, r);

  // ---- Easy
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.mode('easy'); R.world(true); R.start(0); R.manual(true); R.step(2);
    if (!W.robotTypes) return { none: true, mode: R.Waves.mode() };
    const T = R.WORLD.robots.types.join(), all = pickAt(), bad = all.filter((c) => c.lv < 6 && c.types.join() !== T), missing = all.filter((c) => c.lv >= 6 && c.types.join() !== T + ',ninja');
    const seen = hunt([330, 470, 600, 700, 800, 950], 8).filter((q) => q.id), near = seen.filter((q) => q.lv < 6 || q.at < 750), far = seen.filter((q) => q.lv >= 6);
    const o = { mode: R.Waves.mode(), from: W.crewFrom(), bad: bad.slice(0, 5), missing: missing.slice(0, 5), near, far };
    R.worldGo(470, 10); R.step(5); o.l4 = { lvl: W.lvl, n: copierN() };
    R.worldGo(620, 10); R.step(5); R.worldGo(770, 10); R.step(5); o.l6 = { lvl: W.lvl, n: copierN() };
    return o; })()`);
  ok('Easy: the Ninja crew is in the pick from level 6, not before', !r.none && r.mode === 'easy' && r.from === 6 && !r.bad.length && !r.missing.length, r);
  ok(`Easy: no crew out under level 6 (${r.near?.length}), crews past it with 3 minions (${r.far?.length})`, !r.none && !r.near.length && r.far.length >= 1 && r.far.every((q) => q.lv >= 6 && q.minions === 3), r);
  ok(`Easy: no Copier at level 4 (${r.l4?.n}), one at level 6 (${r.l6?.n})`, !r.none && r.l4.lvl === 4 && r.l4.n === 0 && r.l6.lvl === 6 && r.l6.n === 1, r);
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
