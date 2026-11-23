#!/usr/bin/env node
// Robot Battle endless world: repair kits out in the world (#191, Daniel's A then v). One kit in every chunk, at a seeded
// spot a mech can stand on, and both more kits (an extra kit by a seeded chance that rises with the level) and stronger
// kits (HEAL.kit grown with the level, as robot toughness grows) farther out. Kits aren't saved.
//
// One headless Chrome (muted, not detached, killed with its profile deleted on every way out, as scripts/rb-world.mjs
// does). Made-up profiles only. Through window.__rb at 1280 x 800:
//   * the waves: the meadow's 6 kits as before, each mending HEAL.kit (75);
//   * the world: every loaded chunk has its kits (World.kitsAt's n, at least 1), near the start and far out, each where a
//     mech can stand (off obstacles, out of caves, off a ring's floor);
//   * seeded: the same kits at the same spots after a walk away and back, and after a reload with the chunks loaded in
//     another order;
//   * more farther out: the extra-kit chance is min(max, more x (level - 1)), 0 at level 1, and far chunks have more kits
//     on average than near ones;
//   * stronger farther out: a kit mends round(HEAL.kit x World.tough(level at the kit)): 75 near the start, more far out,
//     and walking onto one mends exactly that; a world robot's dropped kit mends by its level;
//   * not saved: a kit picked up writes nothing to storage, and is back when its chunk loads again and after a reload;
//   * no page errors.
//
// Usage:
//   node scripts/rb-world-kits.mjs                       # ./robot-battle.html
//   node scripts/rb-world-kits.mjs path/or/url.html --json
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
const runs = ['kits'];
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-kits-'));
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

// ---- in the page (either build: main's or this one) ----
const H = String.raw`
  const R = window.__rb, G = R.Game, W = R.World, WORLD = R.WORLD;
  const keys = () => Object.keys(localStorage).sort();
  const snap = () => Object.fromEntries(keys().filter((k) => k.startsWith('robotbattle.')).map((k) => [k, localStorage.getItem(k)]));
  const enter = (id, world = true) => { R.player(id); R.world(world); const s = R.start(0); R.manual(true); return s.ok; };
  const kits = () => W.status().kits;
  const byKey = () => Object.fromEntries(kits().map((k) => [k.wkey, [k.x, k.z, k.mend]]));
  // every loaded chunk: { has (its kits loaded), want (World.kitsAt's n) }
  const perChunk = () => [...W.chunks.values()].map((ch) => ({ key: ch.key, has: kits().filter((k) => k.wkey.split(':')[0] === ch.key).length, want: W.kitsAt(ch.cx, ch.cz).n }));
  const standable = () => kits().filter((k) => !(R.obstacles.every((o) => Math.hypot(o.x - k.x, o.z - k.z) > o.r + 1) && !W.inCave(k.x, k.z)
    && (!W.ringAt(Math.floor(k.x / WORLD.chunk), Math.floor(k.z / WORLD.chunk)) || (() => { const g = W.ringAt(Math.floor(k.x / WORLD.chunk), Math.floor(k.z / WORLD.chunk)); return !W.inRing(g, k.x, k.z, -3); })())));
  const mendOk = () => kits().filter((k) => !(k.level === W.level(k.x, k.z) && k.mend === Math.round(R.state().rules.heal.kit * W.tough(k.level))));
  // walk onto kit k with a mech that can take all of it (max health raised for the test): what it mended
  const walkOnto = (k) => { const m = G.humans[0].mech, mh = m.maxHealth; m.maxHealth = 5000; m.health = 1; const t = R.teleport(0, k.x + 0.4, k.z); m.maxHealth = mh; m.health = Math.min(m.health, mh); return t.kit; };
`;

async function runKits(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'kits: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  await C.ev(CLEAR);
  await C.open(1280, 800, false);

  // ---- the waves: the meadow's kits as before
  let r = await C.ev(String.raw`(() => { ${H} const entered = enter('tester', false); const s = R.state(); const k = s.kits.find((q) => q.from === 'meadow');
    const got = k ? walkOnto(k) : null; return { entered, world: !!G.world, n: s.kits.length, from: [...new Set(s.kits.map((q) => q.from))], mends: [...new Set(s.kits.map((q) => q.mend))], got, heal: s.rules.heal.kit, left: R.state().kits.length }; })()`);
  ok('the waves: the meadow\'s 6 kits, each mending HEAL.kit (75); one walked onto mends 75 and is used up', r.entered && !r.world && r.n === 6 && r.from.join() === 'meadow' && r.mends.join() === '75' && r.heal === 75 && r.got === 75 && r.left === 5, r);

  // ---- the world: kits in every chunk
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const entered = enter('tester'); const out = { entered, spots: [] };
    for (const [x, z] of [[0, 0], [2500, 300], [-1800, 1900], [3300, -400]]) { R.worldGo(x, z); const pc = perChunk();
      out.spots.push({ x, z, chunks: pc.length, short: pc.filter((c) => c.has !== c.want || c.has < 1), bad: standable(), mend: mendOk(), n: kits().length, level: W.status().level, mends: [...new Set(kits().map((k) => k.mend))].sort((a, b) => a - b) }); }
    return out; })()`);
  ok('the world: every loaded chunk has its kits (World.kitsAt\'s n, at least 1), near the start and far out', r.entered && r.spots.every((s) => s.chunks >= 25 && s.short.length === 0), r.spots.map((s) => ({ ...s, mends: undefined })));
  ok('... each where a mech can stand: off obstacles, out of caves, off a ring\'s floor', r.spots.every((s) => s.bad.length === 0), r.spots.map((s) => s.bad));
  ok('... each mends round(HEAL.kit x World.tough(its level)), its level the one at its spot', r.spots.every((s) => s.mend.length === 0), r.spots.map((s) => s.mend));
  ok('... 75 near the start, more far out (3 km: up to 3x)', r.spots[0].mends[0] === 75 && r.spots[3].mends[0] > 150 && r.spots[3].mends.at(-1) <= 225, r.spots.map((s) => ({ level: s.level, mends: s.mends })));

  // ---- seeded: same kits after a walk away and back
  r = await C.ev(String.raw`(() => { ${H} R.worldGo(0, 0); const a = byKey(); R.worldGo(2600, -900); R.worldGo(0, 0); const b = byKey(); return { n: Object.keys(a).length, same: JSON.stringify(a) === JSON.stringify(b), a }; })()`);
  ok('seeded: the same kits at the same spots after a walk away and back', r.n >= 25 && r.same, r);
  const A = r.a;
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} enter('tester'); R.worldGo(96 * 4, 96 * 3); R.worldGo(-96 * 2, -96); R.worldGo(0, 0); const b = byKey(), a = ${JSON.stringify(A)};
    const diff = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])); return { diff, n: Object.keys(b).length }; })()`);
  ok('... and after a reload, with the chunks loaded in another order', r.diff.length === 0 && r.n >= Object.keys(A).length, r);

  // ---- more farther out
  r = await C.ev(String.raw`(() => { ${H} const K = WORLD.kits, all = R.worldKits(3600);
    const badChance = all.filter((c) => Math.abs(c.chance - Math.min(K.max, K.more * (c.level - 1))) > 1e-9 || c.n < K.n || c.n > K.n + 1);
    const mean = (f) => { const l = all.filter(f); return { chunks: l.length, mean: l.reduce((t, c) => t + c.n, 0) / (l.length || 1) }; };
    return { K: { ...K }, badChance: badChance.slice(0, 5), lv1: all.filter((c) => c.level === 1).map((c) => c.n), near: mean((c) => c.level <= 3), far: mean((c) => c.level >= 16), mid: mean((c) => c.level >= 6 && c.level <= 10) }; })()`);
  ok('more farther out: the extra-kit chance is min(max, more x (level - 1)), and a chunk has n or n + 1 kits', r.K.n === 1 && r.K.more > 0 && r.badChance.length === 0, r);
  ok('... level 1 chunks have exactly one kit; far chunks have more on average than mid ones, and mid more than near', r.lv1.length > 0 && r.lv1.every((n) => n === 1) && r.far.mean > r.mid.mean && r.mid.mean > r.near.mean && r.far.mean > 1.3, { near: r.near, mid: r.mid, far: r.far });

  // ---- stronger farther out, walking onto one; not saved
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} enter('tester'); R.Facts.save(); const s0 = snap();
    const near = kits().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0]; const gotNear = walkOnto(near); const nearGone = !kits().some((k) => k.wkey === near.wkey);
    R.worldGo(2700, 1300); const far = kits().sort((a, b) => b.mend - a.mend)[0]; const gotFar = walkOnto(far); const farGone = !kits().some((k) => k.wkey === far.wkey);
    const heals = G.humans[0].heals.kit;
    const s1 = snap(); R.Facts.save(); const s2 = snap();
    R.worldGo(-2500, -2500); R.worldGo(2700, 1300); const farBack = kits().find((k) => k.wkey === far.wkey);
    R.worldGo(0, 0); const nearBack = kits().find((k) => k.wkey === near.wkey);
    return { near, gotNear, nearGone, far, gotFar, farGone, heals, same1: JSON.stringify(s0) === JSON.stringify(s1), keys: JSON.stringify(Object.keys(s0)) === JSON.stringify(Object.keys(s2)),
      kitInRec: Object.entries(s2).filter(([k, v]) => /kit/i.test(k) || (k.startsWith('robotbattle.facts.') && /:k\d/.test(v))).map(([k]) => k), farBack, nearBack }; })()`);
  ok('stronger farther out: walking onto the kit by the start mends 75, and it\'s used up', r.near.mend === 75 && r.gotNear === 75 && r.nearGone, r);
  ok('... walking onto a far kit mends its own mend (more than 75), and it\'s used up', r.far.mend > 75 && r.gotFar === r.far.mend && r.farGone, r);
  ok('not saved: picking kits up writes nothing to storage (no new key, no kit key in the record)', r.same1 && r.keys && r.kitInRec.length === 0, r);
  ok('... and each is back, the same, when its chunk loads again', r.farBack && r.farBack.x === r.far.x && r.farBack.mend === r.far.mend && r.nearBack && r.nearBack.x === r.near.x, { farBack: r.farBack, nearBack: r.nearBack });
  const NEAR = r.near;
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} enter('tester'); return kits().find((k) => k.wkey === ${JSON.stringify(NEAR.wkey)}) || null; })()`);
  ok('... and after a reload', r && r.x === NEAR.x && r.mend === 75, r);

  // ---- a world robot's dropped kit mends by its level
  r = await C.ev(String.raw`(() => { ${H} R.worldGo(2400, 900); let q = null;
    for (let t = 0; t < 12 && !q; t++) { q = G.robots.find((z) => z.wkey && z.state === 'glitched' && !z.swarm && z.swarm !== 0 && !R.ROBOT_TYPES[z.type].noKit && !z.ring && z.downs === 0) || null; if (!q) R.worldGo(2400 + 200 * (t + 1), 900); }
    if (!q) return { none: true }; const before = R.Kits.list.length; R.damage(q.id, 1e6, 'gun'); const k = R.Kits.list.at(-1);
    return { type: q.type, lv: q.wlevel, added: R.Kits.list.length - before, from: k.from, mend: k.mend, want: Math.round(75 * W.tough(q.wlevel)) }; })()`);
  ok('a world robot beaten for the first time drops a kit that mends by its level', !r.none && r.added === 1 && r.from === 'robot' && r.lv > 1 && r.mend === r.want && r.mend > 75, r);
  return out;
}

async function main() {
  const all = []; const unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now();
    try {
      const C = await connect(S);
      const res = await runKits(C);
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
