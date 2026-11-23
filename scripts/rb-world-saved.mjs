#!/usr/bin/env node
// Robot Battle endless world: picked-up parts stay picked up (#189, the parts farm). A part picked up in the world goes
// in a saved child's record (world.taken), so it isn't there again after a reload, and backups carry the list.
//
// One headless Chrome (muted, not detached, killed with its profile deleted on every way out, as scripts/rb-world.mjs
// does). Made-up profiles only. Through window.__rb at 1280 x 800:
//   * an old save: a record written by main's page (MAIN_SHA, before #189; it played the world too) loads unchanged in
//     this build, with no world field, until the child picks up a world part; then the record's one new field is
//     world.taken and nothing else in it changed but that part's trophy;
//   * a reload: the part picked up isn't there (its chunk loaded, its key not among the parts), not after a walk away and
//     back either; other parts still are; the session's found count starts at 0 again;
//   * Guest: a part picked up writes nothing (no new key, nothing saved), and is back after a reload;
//   * backups: main's backup (no world field) restores onto an empty device with nothing changed or added, onto a device
//     with the same record with nothing written, and onto a device with world.taken under all three choices without
//     losing that list; this build's backup brings world.taken onto an empty device (the part stays gone in the world);
//     device and backup lists are joined by Keep the best and Use the backup, and Keep this device keeps its own; this
//     build's backup restores into main's page and the child loads.
//
// Usage:
//   node scripts/rb-world-saved.mjs                       # ./robot-battle.html
//   node scripts/rb-world-saved.mjs path/or/url.html --json
//   node scripts/rb-world-saved.mjs --main path.html      # main's page (default: git show MAIN_SHA:robot-battle.html)
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check passes with no page errors; 1 on a failed check; 2 if the run could not finish.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let target = null, json = false, mainPage = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--main') mainPage = path.resolve(args[++i]);
  else target = args[i];
}
const runs = ['saved'];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
target ||= path.join(repo, 'robot-battle.html');
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(path.resolve(target)).href;
// main before #189 (the endless world's slice 1 is in it; nothing of the world is saved there)
const MAIN_SHA = '32ac399';
let mainTmp = null;
function mainUrl() {
  if (mainPage) return pathToFileURL(mainPage).href;
  mainTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-saved-main-'));
  const f = path.join(mainTmp, 'robot-battle.html');
  fs.writeFileSync(f, execFileSync('git', ['-C', repo, 'show', MAIN_SHA + ':robot-battle.html'], { maxBuffer: 64e6 }));
  return pathToFileURL(f).href;
}
process.on('exit', () => { if (mainTmp) try { fs.rmSync(mainTmp, { recursive: true, force: true }); } catch {} });

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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-saved-'));
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
  const R = window.__rb, G = R.Game, W = R.World;
  const rec = (id) => JSON.parse(localStorage.getItem('robotbattle.facts.' + id) || 'null');
  const keys = () => Object.keys(localStorage).sort();
  const snap = () => Object.fromEntries(keys().filter((k) => k.startsWith('robotbattle.')).map((k) => [k, localStorage.getItem(k)]));
  const put = (s) => { localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); };
  const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v) ?? 'null');
  const without = (r, ...f) => { const o = JSON.parse(JSON.stringify(r)); for (const k of f) delete o[k]; return o; };
  // into the endless world as child id, frames off
  const enter = (id) => { R.player(id); R.world(true); const s = R.start(0); R.manual(true); return s.ok; };
  // walk onto the nearest part on the ground: { wkey, part, got (bag + n) }
  const pick = () => { const q = W.status().parts.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0]; if (!q) return null;
    const wkey = q.wkey ?? R.Hidden.list.find((z) => z.wkey && Math.abs(z.x - q.x) < 0.01 && Math.abs(z.z - q.z) < 0.01)?.wkey;   // (main's status has no wkey)
    const b0 = G.bag[q.part] || 0; R.teleport(0, q.x + 0.5, q.z); R.step(2); return { ...q, wkey, got: (G.bag[q.part] || 0) - b0 }; };
  // an empty device (nobody playing first: Backup.restore saves whoever is playing before it reads this device)
  const empty = () => { R.Facts.rec = null; R.Facts.child = null; G.child = null; localStorage.clear(); R.Profiles.load(); };
  const here = (k) => ({ loaded: W.chunks.has(k.split(':')[0]), there: W.status().parts.some((p) => p.wkey === k) });
`;

async function runSaved(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'saved: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const mu = mainUrl();
  await C.open(1280, 800, false);
  if (!(await C.ev(`typeof window.__rb.World?.take === 'function'`))) { ok('World.take exists', false, 'missing'); return out; }

  // ---- an old save: made on main (before #189), with a world part picked up there
  await C.ev(CLEAR);
  await C.open(1280, 800, false, mu);
  let r = await C.ev(String.raw`(() => { ${H} const entered = enter('tester'); const p = pick(); R.Facts.save();
    return { entered, p, rec: rec('tester'), snap: snap(), backup: JSON.parse(JSON.stringify(R.backup())), hasTake: typeof W.take === 'function' }; })()`);
  const M = r;
  ok(`main (${MAIN_SHA}): a part picked up in the world, and nothing of it saved (no world field, no world key)`, r.entered && r.p?.got === 1 && !r.hasTake && r.rec && !('world' in r.rec) && Object.keys(r.snap).every((k) => !/world/i.test(k)), r);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const raw0 = snap(); R.player('tester'); const r1 = rec('tester');
    const same = canon(r1) === canon(${JSON.stringify(M.rec)}), keys0 = keys(); enter('tester'); const back = here(${JSON.stringify(M.p.wkey)});
    const p = pick(); const r2 = rec('tester');
    return { raw: canon(raw0) === canon(${JSON.stringify(M.snap)}), same, noWorld: !('world' in r1), back, p, keys0, keys1: keys(), world: r2.world, rest: canon(without(r2, 'world', 'garage')) === canon(without(r1, 'world', 'garage')),
      n0: r1.garage.trophies[p?.part]?.n || 0, n1: r2.garage.trophies[p?.part]?.n || 0, saved: W.status().saved }; })()`);
  ok('main\'s save opens in this build untouched, and the child loads it unchanged with no world field', r.raw && r.same && r.noWorld, r);
  ok('(main saved nothing of the world, so the part picked up there is still in the world once: expected)', r.back.loaded && r.back.there, r.back);
  ok('a part picked up here: the record\'s one new field is world.taken = [its key]; only its trophy changed besides', r.p?.got === 1 && JSON.stringify(r.world) === JSON.stringify({ taken: [r.p.wkey] }) && r.rest && r.n1 === r.n0 + 1 && r.saved === 1, r);
  ok('no new storage key', JSON.stringify(r.keys1) === JSON.stringify(r.keys0), { keys0: r.keys0, keys1: r.keys1 });
  const K = r.p.wkey;

  // ---- a reload
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const entered = enter('tester'); const a = here(${JSON.stringify(K)}), s = W.status();
    R.worldGo(2500, 300); R.worldGo(0, 0); const b = here(${JSON.stringify(K)});
    return { entered, a, b, parts: s.parts.length, found: s.found, saved: s.saved, hud: document.querySelector('#foundN')?.textContent }; })()`);
  ok('after a reload the part picked up isn\'t there (its chunk loaded, its key not among the parts)', r.entered && r.a.loaded && !r.a.there, r);
  ok('... nor after a walk away and back; other parts still are; found starts at 0 this session, 1 saved', r.b.loaded && !r.b.there && r.parts > 0 && r.found === 0 && r.saved === 1, r);
  const NEW = await C.ev(String.raw`(() => { ${H} R.Facts.save(); return { snap: snap(), backup: JSON.parse(JSON.stringify(R.backup())) }; })()`);
  ok('this build\'s backup carries world.taken in the record', JSON.stringify(NEW.backup.data['facts.tester']?.world) === JSON.stringify({ taken: [K] }) && NEW.backup.format === 2, NEW.backup.data['facts.tester']?.world);

  // ---- Guest saves nothing
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('guest'); const k0 = snap(); enter('guest'); const p = pick(); return { p, same: canon(snap()) === canon(k0), saved: W.status().saved, gk: keys().filter((k) => /guest|world/i.test(k) && k !== 'robotbattle.child') }; })()`);
  const GK = r.p?.wkey;
  ok('Guest picks up a part: nothing written (storage the same), nothing saved', r.p?.got === 1 && r.same && r.saved === 0 && r.gk.length === 0, r);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} enter('guest'); return here(${JSON.stringify(GK)}); })()`);
  ok('... and after a reload it\'s back for Guest', r.loaded && r.there, r);

  // ---- backups
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const MB = ${JSON.stringify(M.backup)}, NB = ${JSON.stringify(NEW.backup)}, MS = ${JSON.stringify(M.snap)}, NS = ${JSON.stringify(NEW.snap)}, K = ${JSON.stringify(K)}, out = {};
    // main's backup onto an empty device
    empty(); const a = R.restore(MB, 'best'); out.empty = { ok: a.ok, why: a.why, same: canon(rec('tester')) === canon(MB.data['facts.tester']), world: 'world' in (rec('tester') || {}) };
    // main's backup onto a device with the same record (main's save): nothing written, whatever the choice
    out.sameDev = {};
    for (const ch of ['device', 'backup', 'best']) { put(MS); R.Profiles.load(); R.player('tester'); const b = R.restore(MB, ch); const q = b.summary?.kids.find((z) => z.child === 'tester'); out.sameDev[ch] = { ok: b.ok, write: q?.write, world: 'world' in rec('tester') }; }
    // main's backup onto a device with world.taken: the list kept under every choice
    out.keep = {};
    for (const ch of ['device', 'backup', 'best']) { put(NS); R.Profiles.load(); R.player('tester'); const b = R.restore(MB, ch); out.keep[ch] = { ok: b.ok, taken: rec('tester').world?.taken }; }
    // this build's backup onto an empty device
    empty(); const c = R.restore(NB, 'best'); out.newEmpty = { ok: c.ok, why: c.why, taken: rec('tester')?.world?.taken };
    // two lists: device [K], backup [another key]
    const NB2 = JSON.parse(JSON.stringify(NB)); NB2.data['facts.tester'].world = { taken: ['7,-3:p1'] };
    out.join = {};
    for (const ch of ['device', 'backup', 'best']) { put(NS); R.Profiles.load(); R.player('tester'); const b = R.restore(NB2, ch); out.join[ch] = { ok: b.ok, taken: (rec('tester').world?.taken || []).slice().sort() }; }
    // a damaged list in a backup (hand-edited): it still restores, and the game reads only the keys that are strings
    const NB3 = JSON.parse(JSON.stringify(NB)); NB3.data['facts.tester'].world = { taken: [K, 5, null, K] };
    empty(); const d = R.restore(NB3, 'backup'); R.player('tester'); out.damaged = { ok: d.ok, why: d.why, saved: W.status().saved };
    return out; })()`);
  ok('main\'s backup onto an empty device: restored, the record exactly as backed up (no world field added)', r.empty.ok && r.empty.same && !r.empty.world, r.empty);
  ok('main\'s backup onto a device with that same record: nothing written for the child with any choice', Object.values(r.sameDev).every((q) => q.ok && q.write === false && !q.world), r.sameDev);
  ok('main\'s backup onto a device with world.taken: the list kept with Keep this device, Use the backup and Keep the best', Object.values(r.keep).every((q) => q.ok && JSON.stringify(q.taken) === JSON.stringify([K])), r.keep);
  ok('this build\'s backup onto an empty device brings world.taken', r.newEmpty.ok && JSON.stringify(r.newEmpty.taken) === JSON.stringify([K]), r.newEmpty);
  const both = JSON.stringify([K, '7,-3:p1'].sort());
  ok('two lists: Keep the best and Use the backup join them; Keep this device keeps its own', r.join.best.ok && JSON.stringify(r.join.best.taken) === both && r.join.backup.ok && JSON.stringify(r.join.backup.taken) === both && r.join.device.ok && JSON.stringify(r.join.device.taken) === JSON.stringify([K]), r.join);
  ok('a hand-damaged list still restores, read as its string keys only (1)', r.damaged.ok && r.damaged.saved === 1, r.damaged);
  // the part stays gone in the world after this build's backup restored onto an empty device
  await C.ev(String.raw`(() => { ${H} empty(); R.restore(${JSON.stringify(NEW.backup)}, 'best'); return true; })()`);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} enter('tester'); return here(${JSON.stringify(K)}); })()`);
  ok('restored onto an empty device: the part stays gone in the world', r.loaded && !r.there, r);

  // ---- this build's backup into main's page
  await C.ev(`localStorage.clear()`);
  await C.open(1280, 800, false, mu);
  r = await C.ev(String.raw`(() => { const R = window.__rb; localStorage.clear(); R.Profiles.load(); const x = R.restore(${JSON.stringify(NEW.backup)}, 'best'); const p = R.player('tester');
    return { ok: x.ok, why: x.why, player: p.ok, kept: JSON.parse(localStorage.getItem('robotbattle.facts.tester') || 'null')?.world ?? null }; })()`);
  ok(`this build's backup restores into main (${MAIN_SHA}) and the child loads (main ${r.kept ? 'keeps' : 'drops'} world.taken)`, r.ok && r.player, r);
  return out;
}

async function main() {
  const all = []; const unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now();
    try {
      const C = await connect(S);
      const res = await runSaved(C);
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
