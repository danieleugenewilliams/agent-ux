#!/usr/bin/env node
// Robot Battle endless world: parts on the ground give more farther out (#197, Daniel's D: both B and C). By the level at a
// chunk's middle (World.level: one every 150 m):
//   B: one extra part in a chunk for every 4 levels (600 m) past the start, at most 3 extra (up to 4 in a chunk, 5 in a
//      junkyard, from level 13, 1.8 km out);
//   C: from level 6 (750 m out) a ground part may be one of the rarer parts a boxing ring pays (ram, scope, rotor, spring,
//      jet boots, solar), the chance 5% at level 6, rising 5% a level to at most 50% at level 15 (2.1 km).
//
// One headless Chrome (muted, not detached, killed with its profile deleted on every way out, as scripts/rb-world.mjs
// does). Made-up profiles only. Through window.__rb at 1280 x 800:
//   * the rule: every chunk out to 3.6 km has base + min(3, floor((level - 1) / 4)) parts, and each part's rare chance is
//     0 before level 6, then min(0.5, 0.05 x (level - 5)) (World.partsAt);
//   * loaded chunks: near the start (levels 1-4) one part a chunk (two in a junkyard), none rare; far out (level 13+) up
//     to 4 (5), every chunk's part count as the rule says; about half the far parts rare, none near, some in between;
//   * the same spots as before: a chunk's first part (first two in a junkyard) is where it is with the extras and rare
//     kinds turned off, its key the same; the extras come after it;
//   * seeded: the same parts, kinds and spots after a walk away and back;
//   * a rare part walked over goes in the bag and the trophies;
//   * saves: a far chunk's first part picked up and saved stays gone after a reload (an existing save's keys still
//     match), while its extra parts are there to pick up;
//   * no page errors.
//
// Usage:
//   node scripts/rb-world-parts.mjs                       # ./robot-battle.html
//   node scripts/rb-world-parts.mjs path/or/url.html --json
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
const runs = ['parts'];
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-parts-'));
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
  const R = window.__rb, G = R.Game, W = R.World, WORLD = R.WORLD, C = WORLD.chunk;
  const RARE = ['ram', 'scope', 'rotor', 'spring', 'jetboots', 'solar'], COMMON = ['armour', 'battery', 'motor', 'wiring'];
  const enter = (id, world = true) => { R.player(id); R.world(world); const s = R.start(0); R.manual(true); return s.ok; };
  // the rule as decided (worked out here, not read from the page)
  const lvAt = (cx, cz) => W.level((cx + 0.5) * C, (cz + 0.5) * C);
  const baseAt = (cx, cz) => W.placeRaw((cx + 0.5) * C, (cz + 0.5) * C).b === R.PLACES.indexOf('junkyard') ? 2 : 1;
  const wantN = (cx, cz) => baseAt(cx, cz) + Math.min(3, Math.floor((lvAt(cx, cz) - 1) / 4));
  const wantChance = (lv) => lv < 6 ? 0 : Math.min(0.5, 0.05 * (lv - 5));
  // every loaded chunk: its level, spots (every part's seeded spot, picked up or not), parts loaded (key, kind, spot)
  const chunks = () => [...W.chunks.values()].map((ch) => ({ key: ch.key, cx: ch.cx, cz: ch.cz, level: lvAt(ch.cx, ch.cz), base: baseAt(ch.cx, ch.cz), want: wantN(ch.cx, ch.cz),
    spots: (ch.partSpots || []).length, parts: ch.parts.filter((q) => !q.found).map((q) => ({ wkey: q.wkey, part: q.part, x: Math.round(q.x * 1000) / 1000, z: Math.round(q.z * 1000) / 1000 })) }));
  const byKey = () => Object.fromEntries(chunks().flatMap((c) => c.parts.map((p) => [p.wkey, [p.x, p.z, p.part]])));
  const unload = () => { R.worldGo(20000, -20000); };
`;

async function runParts(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'parts: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  await C.ev(CLEAR);
  await C.open(1280, 800, false);

  // ---- the rule over every chunk out to 3.6 km
  let r = await C.ev(String.raw`(() => { ${H} if (typeof R.worldParts !== 'function') return { missing: true };
    const all = R.worldParts(3600), bad = all.filter((c) => c.n !== wantN(c.cx, c.cz) || Math.abs(c.chance - wantChance(c.level)) > 1e-9 || c.level !== lvAt(c.cx, c.cz));
    const at = (lv) => all.find((c) => c.level === lv && c.base === 1);
    return { n: all.length, bad: bad.slice(0, 5), lv: [1, 4, 5, 6, 9, 13, 15, 21].map((l) => { const c = at(l); return c && [l, c.n, Math.round(c.chance * 100)]; }), kinds: WORLD.partsFar?.kinds }; })()`);
  ok('the rule: every chunk to 3.6 km has 1 (junkyard 2) + min(3, floor((level - 1) / 4)) parts, each with a rare chance of min(50%, 5% x (level - 5)) from level 6 (World.partsAt)', !r.missing && r.n > 5000 && r.bad.length === 0, r);
  ok('... level 1-4: 1 part, 0%; level 5 (600 m): 2; level 6 (750 m): 5%; level 13 (1.8 km): 4; level 15 (2.1 km) on: 50%; the rare kinds are the ring\'s six', !r.missing && JSON.stringify(r.lv) === JSON.stringify([[1, 1, 0], [4, 1, 0], [5, 2, 0], [6, 2, 5], [9, 3, 20], [13, 4, 40], [15, 4, 50], [21, 4, 50]]) && JSON.stringify(r.kinds) === JSON.stringify(['ram', 'scope', 'rotor', 'spring', 'jetboots', 'solar']), r);

  // ---- loaded chunks near and far
  r = await C.ev(String.raw`(() => { ${H} const entered = enter('tester'); const groups = {};
    const spots = { near: [[0, 0], [250, 150]], mid: [[1050, 0], [0, -1100], [-800, 800]], far: [[2400, 300], [-300, 2600], [-2200, -1600], [1900, -2300], [2900, 1200]] };
    for (const [g, list] of Object.entries(spots)) { const seen = new Map(); for (const [x, z] of list) { R.worldGo(x, z); for (const c of chunks()) seen.set(c.key, c); } groups[g] = [...seen.values()]; }
    const sum = (l) => { const parts = l.flatMap((c) => c.parts); return { chunks: l.length, parts: parts.length, rare: parts.filter((p) => RARE.includes(p.part)).length, odd: parts.filter((p) => !RARE.includes(p.part) && !COMMON.includes(p.part)).length,
      wrong: l.filter((c) => c.spots > c.want || c.parts.length !== c.spots).map((c) => ({ key: c.key, level: c.level, want: c.want, spots: c.spots, parts: c.parts.length })),
      exact: l.filter((c) => c.spots === c.want).length, mean: parts.length / (l.length || 1) }; };
    const near = groups.near.filter((c) => c.level <= 4), far = groups.far.filter((c) => c.level >= 13), mid = groups.mid.filter((c) => c.level >= 6 && c.level <= 9);
    return { entered, near: sum(near), mid: sum(mid), far: sum(far), farMax: Math.max(...far.map((c) => c.parts.length)) }; })()`);
  ok('near the start (levels 1-4): one part a chunk (two in a junkyard), none of them rare', r.entered && r.near.chunks >= 20 && r.near.wrong.length === 0 && r.near.exact >= r.near.chunks - 1 && r.near.mean < 1.3 && r.near.rare === 0, r.near);
  ok('far out (level 13+): every chunk\'s part count as the rule says (4, 5 in a junkyard), so far more parts than near', r.far.chunks >= 60 && r.far.wrong.length === 0 && r.far.exact >= r.far.chunks * 0.95 && r.far.mean > 3.5 && r.farMax >= 4, r.far);
  ok('... and about half the far parts are rare ones (35-65%), some of the mid ones (levels 6-9) are, fewer than far', r.far.parts > 0 && r.far.rare / r.far.parts > 0.35 && r.far.rare / r.far.parts < 0.65 && r.mid.rare > 0 && r.mid.rare / r.mid.parts < r.far.rare / r.far.parts && r.far.odd === 0 && r.mid.odd === 0, { far: r.far, mid: r.mid });

  // ---- the same spots as before: with the extras and rare kinds off (as on main), each chunk's first part (first two
  // in a junkyard) is at the same spot with the same key
  r = await C.ev(String.raw`(() => { ${H} const F = WORLD.partsFar; if (!F) return { missing: true };
    const spots = [[0, 0], [2400, 300], [-2200, -1600]], get = () => { const m = {}; for (const [x, z] of spots) { unload(); R.worldGo(x, z); Object.assign(m, byKey()); } return m; };
    const keep = { most: F.most, rareMax: F.rareMax }; F.most = 0; F.rareMax = 0; const off = get(); F.most = keep.most; F.rareMax = keep.rareMax; const on = get();
    const moved = Object.keys(off).filter((k) => !on[k] || on[k][0] !== off[k][0] || on[k][1] !== off[k][1]);
    const kindChanged = Object.keys(off).filter((k) => on[k] && on[k][2] !== off[k][2]);
    const changedOk = kindChanged.every((k) => RARE.includes(on[k][2]));
    const extras = Object.keys(on).filter((k) => !(k in off));
    return { off: Object.keys(off).length, on: Object.keys(on).length, moved: moved.slice(0, 5), kindChanged: kindChanged.length, changedOk, extras: extras.length }; })()`);
  ok('the same spots as before: every chunk\'s first part (two in a junkyard) has the same key at the same spot as with the extras off; a kind that differs is a rare one', !r.missing && r.off >= 60 && r.moved.length === 0 && r.changedOk && r.extras > r.off, r);

  // ---- seeded
  r = await C.ev(String.raw`(() => { ${H} R.worldGo(2400, 300); const a = byKey(); R.worldGo(-2600, -900); R.worldGo(2400, 300); const b = byKey(); return { n: Object.keys(a).length, same: JSON.stringify(a) === JSON.stringify(b) }; })()`);
  ok('seeded: the same parts, kinds and spots after a walk away and back', r.n >= 75 && r.same, r);

  // ---- a rare part walked over: into the bag and the trophies
  r = await C.ev(String.raw`(() => { ${H} R.worldGo(2400, 300); const q = chunks().flatMap((c) => c.parts).find((p) => RARE.includes(p.part)); if (!q) return { none: true };
    const bag0 = G.bag[q.part] || 0, t = R.teleport(0, q.x, q.z); return { q, found: t.found, bag: (G.bag[q.part] || 0) - bag0, gone: !(q.wkey in byKey()), trophy: R.Garage?.rec?.().trophies?.[q.part]?.n ?? null }; })()`);
  ok('a rare part walked over goes in the bag (and the trophies) and is gone from the ground', !r.none && r.found === r.q.part && r.bag === 1 && r.gone && (r.trophy == null || r.trophy >= 1), r);

  // ---- saves: a far chunk's first part picked up and saved stays gone after a reload; its extras are there
  r = await C.ev(String.raw`(() => { ${H} R.worldGo(-300, 2600); const c = chunks().find((c) => c.level >= 13 && c.base === 1 && c.parts.length === 4 && c.parts.some((p) => p.wkey === c.key + ':p0'));
    if (!c) return { none: true }; const p0 = c.parts.find((p) => p.wkey === c.key + ':p0'); const t = R.teleport(0, p0.x, p0.z); R.Facts.save();
    return { key: c.key, p0, found: t.found, saved: R.Facts.rec?.world?.taken || [] }; })()`);
  const SAVED = r;
  ok('saves: a far chunk\'s first part (key \'cx,cz:p0\', as before #197) picked up goes in world.taken', !r.none && r.found === r.p0.part && r.saved.includes(r.p0.wkey), r);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} enter('tester'); R.worldGo(-300, 2600); const c = chunks().find((c) => c.key === ${JSON.stringify(SAVED.key || '')});
    return c ? { keys: c.parts.map((p) => p.wkey).sort(), spots: c.spots, saved: W.status().saved } : { none: true }; })()`);
  ok('... after a reload it stays gone, while that chunk\'s three extra parts are there to pick up', !SAVED.none && !r.none && r.spots === 4 && JSON.stringify(r.keys) === JSON.stringify([1, 2, 3].map((k) => SAVED.key + ':p' + k)) && r.saved >= 1, r);
  return out;
}

async function main() {
  const all = []; const unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now();
    try {
      const C = await connect(S);
      const res = await runParts(C);
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
