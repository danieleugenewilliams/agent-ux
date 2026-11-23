#!/usr/bin/env node
// Robot Battle endless world check (#193: the math ramp grows with distance). Daniel's call, C and (ii): a roaming robot's
// facts step up with the level it came out at, warm out to 1 km (levels 1-7), mix 1-2 km (levels 8-14), stretch from
// level 15 (2,100 m) on; only the facts step up, the board keeps wave 1's shape everywhere; a world boss keeps its boss board.
//
// One headless Chrome (muted, not detached, killed with its profile deleted on every way out, as scripts/rb-world.mjs
// does). Made-up profiles only.
//   logic  - at 1280 x 800, through window.__rb:
//            * World.band: warm at levels 1-7, mix at 8-14, stretch from 15; by the metres: 1,049 m warm, 1,050 m mix,
//              2,099 m mix, 2,100 m stretch;
//            * waves untouched: a robot downed in waves 1-6 gets that wave's board (PACE: warm, warm, mix, mix, stretch,
//              stretch, with its counts and target);
//            * world robots downed out to 3 km: each one's board band is its own level's (r.wlevel, as its toughness), at
//              least one in each band; every board is wave 1's (1 math wire, 2 puzzles, wave 1's sizes and 15 s target);
//            * its Quick Fix opened: the tracker is asked for the wire's fact with that band (warm, none for mix, stretch);
//            * a world boss downed out there: its own boss board (bossPlan for wave 1, slots and band), not the world's band.
//
// Usage:
//   node scripts/rb-world-ramp.mjs                    # ./robot-battle.html
//   node scripts/rb-world-ramp.mjs path/or/url.html --json
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-ramp-'));
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
  // the decided steps (#193, C): the band at level lv
  const want = (lv) => (lv >= 15 ? 'stretch' : lv >= 8 ? 'mix' : 'warm');
  // the chunks round player 1 dropped and loaded again (after a sweep), so the robots of the chunks there come out now
  const reload = () => { W.sweep(); for (const k of [...W.chunks.keys()]) W.unload(k); W.update(true); W.sweep(); };
  const goNear = (b) => { const C = R.WORLD.chunk, x = (b.cx + 0.5) * C, z = (b.cz + 0.5) * C, d = Math.hypot(x, z); R.worldGo(x - x / d * 60, z - z / d * 60); reload(); return W.status(); };
  // every band the tracker is asked for a wire's fact with (Facts.pickWire's opts.band; null: none, the tracker's normal pick)
  const spy = () => { const F = R.Facts, orig = F.pickWire, seen = []; F.pickWire = function (o = {}) { const f = orig.call(this, o); seen.push({ band: o.band ?? null, why: f?.why ?? null }); return f; }; return { seen, undo: () => { F.pickWire = orig; } }; };
  // a downed robot's Quick Fix opened by player 1 beside it (so its wires' facts are picked), then left
  const openFix = (q) => { let ch = null; for (const o of [2.5, 5, 7]) { R.teleport(0, q.pos.x + o, q.pos.z); ch = R.choose(q.id, 'fix'); if (ch.ok) break; } const facts = q.wires?.facts?.map((f) => f.key) ?? null; R.leaveFix(); return { ok: !!ch?.ok, why: ch?.why, facts }; };
  const boardOf = (q) => { const B = q.board; return B && { wave: B.wave, band: B.band, math: B.math, n: B.n, target: B.target, sizes: { ...B.sizes }, boss: B.boss }; };
`;

async function runLogic(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'logic: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  if (!(await C.ev(`typeof window.__rb.worldBosses === 'function'`))) { ok('__rb.worldBosses exists', false, 'missing'); return out; }

  // ---- the steps
  let r = await C.ev(String.raw`(() => { ${H} const has = typeof W.band === 'function';
    const lv = Array.from({ length: 25 }, (_, i) => i + 1), bands = has ? lv.map((l) => W.band(l)) : null;
    const m = [0, 1049, 1050, 2099, 2100, 3000].map((d) => ({ d, level: R.worldAt(d, 0).level, band: has ? W.band(R.worldAt(d, 0).level) : null }));
    return { has, bands, wantB: lv.map(want), m }; })()`);
  ok('World.band: warm at levels 1-7, mix at 8-14, stretch from 15 on', r.has && JSON.stringify(r.bands) === JSON.stringify(r.wantB), r);
  ok(`by the metres: ${r.m.map((p) => p.d + ' m L' + p.level + ' ' + p.band).join(', ')}`, r.has && JSON.stringify(r.m.map((p) => p.band)) === JSON.stringify(['warm', 'warm', 'mix', 'mix', 'stretch', 'stretch']), r.m);

  // ---- waves, untouched: each wave's board is its PACE band's
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.start(0); R.manual(true); const rows = [];
    for (let w = 1; w <= 6; w++) { R.waveTo(w); const s = R.spawn('charger', 40 + w * 6, 40); const q = G.robots.find((z) => z.id === s.id); R.damage(q.id, 1e6, 'gun');
      const P = R.plan(w, 'gun'); rows.push({ w, b: boardOf(q), want: { band: P.band, math: P.math, n: P.puzzles.length, target: P.target } }); }
    return { world: G.world, rows }; })()`);
  ok(`waves: waves 1-6 keep PACE's boards (${r.rows.map((x) => x.b?.band).join(', ')})`, !r.world && r.rows.every((x) => x.b && x.b.wave === x.w && x.b.band === x.want.band && x.b.math === x.want.math && x.b.n === x.want.n && x.b.target === x.want.target)
    && JSON.stringify(r.rows.map((x) => x.b.band)) === JSON.stringify(['warm', 'warm', 'mix', 'mix', 'stretch', 'stretch']), r.rows);

  // ---- the world: roaming robots downed out to 3 km
  await C.ev(`localStorage.clear()`); await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.world(true); R.start(0); R.manual(true); R.step(2);
    const P1 = R.plan(1, 'gun'), rows = [], per = {}, S = spy();
    try {
      for (const d of [150, 600, 1000, 1300, 1700, 2000, 2300, 2700, 3000]) {
        R.worldGo(d, 37); reload();
        const list = G.robots.filter((q) => q.wkey && q.wlevel && q.state === 'glitched' && !R.ROBOT_TYPES[q.type].boss && !q.ring && Math.hypot(q.pos.x - d, q.pos.z - 37) < 260);
        for (const q of list.slice(0, 2)) {
          R.damage(q.id, 1e6, 'gun'); if (q.state !== 'down') continue;
          const n0 = S.seen.length, fx = openFix(q);
          rows.push({ id: q.id, type: q.type, lv: q.wlevel, at: R.World.level(q.pos.x, q.pos.z), b: boardOf(q), fix: fx.ok, why: fx.why, asked: S.seen.slice(n0) });
          R.choose(q.id, 'parts', undefined, q.parts.slice(0, 1));   // (then taken apart, so the downed ones don't hold the robot cap)
        }
      }
    } finally { S.undo(); }
    for (const x of rows) per[want(x.lv)] = (per[want(x.lv)] || 0) + 1;
    return { rows, per, P1: { math: P1.math, n: P1.puzzles.length, target: P1.target, sizes: P1.sizes } }; })()`);
  const rows = r.rows, P1 = r.P1;
  ok(`world robots downed in every band (${rows.length}: warm ${r.per.warm || 0}, mix ${r.per.mix || 0}, stretch ${r.per.stretch || 0}; levels ${[...new Set(rows.map((x) => x.lv))].sort((a, b) => a - b).join(', ')})`,
    (r.per.warm || 0) >= 1 && (r.per.mix || 0) >= 1 && (r.per.stretch || 0) >= 1, r.per);
  const badBand = rows.filter((x) => x.b?.band !== (x.lv >= 15 ? 'stretch' : x.lv >= 8 ? 'mix' : 'warm'));
  ok('each one\'s facts band is its own level\'s (warm 1-7, mix 8-14, stretch 15+)', rows.length > 0 && badBand.length === 0, badBand.slice(0, 6).map((x) => ({ type: x.type, lv: x.lv, band: x.b?.band })));
  const badShape = rows.filter((x) => !x.b || x.b.wave !== 1 || x.b.math !== P1.math || x.b.n !== P1.n || x.b.target !== P1.target || JSON.stringify(x.b.sizes) !== JSON.stringify(P1.sizes) || x.b.boss);
  ok(`every world board keeps wave 1's shape (${P1.math} math wire, ${P1.n} puzzles, ${P1.target / 1000} s, wave 1's sizes) at every level`, rows.length > 0 && P1.math === 1 && P1.n === 2 && badShape.length === 0, { P1, bad: badShape.slice(0, 4) });
  const opened = rows.filter((x) => x.fix);
  const badAsk = opened.filter((x) => { const w = x.lv >= 15 ? 'stretch' : x.lv >= 8 ? 'mix' : 'warm', a = x.asked.map((s) => s.band); return a.length !== 1 || a[0] !== (w === 'mix' ? null : w); });
  ok(`its Quick Fix asks the tracker by the band (warm: warm, mix: the normal pick, stretch: stretch; ${opened.length} opened)`,
    opened.length >= 3 && ['warm', 'mix', 'stretch'].every((w) => opened.some((x) => (x.lv >= 15 ? 'stretch' : x.lv >= 8 ? 'mix' : 'warm') === w)) && badAsk.length === 0,
    { opened: opened.length, notOpened: rows.filter((x) => !x.fix).map((x) => x.why), bad: badAsk.slice(0, 4).map((x) => ({ lv: x.lv, asked: x.asked })) });

  // ---- a world boss: its own boss board, band and all
  r = await C.ev(String.raw`(() => { ${H} const all = R.worldBosses(3000).sort((a, b) => Math.hypot(a.cx, a.cz) - Math.hypot(b.cx, b.cz));
    const b = all.find((q) => q.level < 15) || all[0]; if (!b) return { none: true }; goNear(b);
    const boss = G.robots.find((q) => q.wkey === b.cx + ',' + b.cz + ':r' && q.type === b.type); if (!boss) return { none: 'not out', b };
    R.damage(boss.id, 1e6, 'gun'); const P = R.bossPlan(1, 'gun', boss.type);
    return { type: boss.type, lv: boss.wlevel, b: boardOf(boss), want: { band: P.band, slots: P.slots, math: P.math, n: P.puzzles.length, target: P.target } }; })()`);
  ok(`a world boss (${r.type}, level ${r.lv}) keeps its own boss board: ${r.want?.slots} slots, band ${r.want?.band} (not the world's ${r.lv >= 15 ? 'stretch' : r.lv >= 8 ? 'mix' : 'warm'})`,
    !r.none && r.b && r.b.boss && r.b.band === r.want.band && r.b.math === r.want.math && r.b.n === r.want.n && r.b.target === r.want.target, r);
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
