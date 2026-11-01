#!/usr/bin/env node
// Robot Battle #161: no child's name ships in the game. Nothing is seeded, every save made before keeps working, the two
// ladders have neutral ids ('start' and 'check') and either one can be picked in the profile maker and the parent view.
//
// Each run is its own headless Chrome (muted, not detached, killed with its profile deleted on every way out, and killed if a
// run takes over 5 minutes). The pages are served by a small local server (closed on every way out) so that every build
// shares one origin, and so one browser storage:
//   /robot-battle.html  the page under test (./robot-battle.html unless a path is given)
//   /base.html          the build before #161 (robot-battle.html at 1c0204e): it seeds two profiles on a fresh device
//   /pre49.html         the build before profiles (#49) existed (robot-battle.html at 796c87c): records, no list
// The older builds are fetched with git into memory; their seeded players are always picked by index, never by name.
//
//   names   - no name in the source: robot-battle.html, wild-world.html and every file in scripts/ are searched for the two seeded names
//             (as a hash of every 5- and 6-letter run, so this file doesn't hold the names either).
//   fresh   - a fresh device (empty storage): the title shows Guest and ➕ only, no profile, and nothing is written by loading.
//   current - a device with the list made before #161 (base.html seeded it; a third profile added; both seeded children
//             played): loading this build leaves storage byte-identical; then the same scripted play (time and randomness
//             frozen) on base.html and on this build, each from that storage, ends in byte-identical storage, and the keys
//             the play didn't touch are byte-identical to before it.
//   pre49   - storage from before #49 (pre49.html played as both children: records, no list): this build makes a profile per
//             record (their ids, ladders and wiring, names "Player 1" and "Player 2"), saves that list once, leaves every
//             record byte-identical on load, and each child's progress (facts, step, garage) is intact once picked. The
//             "list can't be read" fallback makes the same profiles from the records and writes nothing.
//   backups - restores: a backup made by pre49.html (no list) onto a fresh device; one made by base.html (the list with the
//             old ladder ids); one made by this build (new ladder ids); each with every choice, the profiles, records,
//             ladders, garages and settings coming back value for value.
//   real    - with --backup FILE (repeatable): each real backup restores onto a fresh device completely, and each child
//             loads from it on their ladder; only counts are printed, never a name or a value (skipped with no --backup).
//   ladder  - a new profile can pick either ladder (the hook, and the maker's buttons by touch, keys and pad), and the
//             parent view switches a profile's ladder both ways, keeping every fact; the same ladder writes nothing.
//   WxH     - the profile maker at that size: every control on screen, none overlapping another, the maker not scrolling;
//             a touch-only pass (CDP touch events) makes a profile on the quick check; then the keys.
//
// Usage:
//   node scripts/rb-no-names.mjs                           # every run (the real-backup check skipped)
//   node scripts/rb-no-names.mjs --backup ~/path/backup.json   # and restore that backup (repeatable)
//   node scripts/rb-no-names.mjs --run current             # one run (repeatable): names | fresh | current | pre49 | backups | real | ladder | WxH
//   node scripts/rb-no-names.mjs --shots DIR               # also save screenshots of the maker and the parent view
//   node scripts/rb-no-names.mjs path/to/robot-battle.html --json
// Sizes: 360x740, 568x320, 740x360, 844x390, 667x375, 768x1024 and 820x1180.
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const SIZES = ['360x740', '568x320', '740x360', '844x390', '667x375', '768x1024', '820x1180'];
const BASE_SHA = '1c0204e', PRE49_SHA = '796c87c';
const RUN_TIMEOUT_MS = 5 * 60 * 1000;
const args = process.argv.slice(2);
let json = false, target = null, shots = null; const picked = [], backups = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--run' || args[i] === '--size') picked.push(args[++i]);
  else if (args[i] === '--shots') shots = path.resolve(args[++i]);
  else if (args[i] === '--backup') backups.push(path.resolve(args[++i]));
  else if (args[i] === '-h' || args[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
  else target = args[i];
}
const runs = picked.length ? picked : ['names', 'fresh', 'current', 'pre49', 'backups', 'real', 'ladder', ...SIZES];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = path.resolve(target ?? path.join(repo, 'robot-battle.html'));
if (shots) fs.mkdirSync(shots, { recursive: true });
const older = {};
const olderHtml = (sha) => (older[sha] ??= execFileSync('git', ['-C', repo, 'show', sha + ':robot-battle.html'], { maxBuffer: 64e6 }));

// ---- the server: this build, the build before #161 and the build before #49, one origin
let server = null, base = null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png' };
async function serve() {
  server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let body = null;
    // (anything else, the models the game loads, from the repo)
    let f = null;
    if (!/^\/(robot-battle|base|pre49)\.html$/.test(u)) { f = path.join(repo, path.normalize(u).replace(/^(\.\.[/\\])+/, '')); if (!f.startsWith(repo + path.sep)) f = null; }
    try { body = u === '/robot-battle.html' ? fs.readFileSync(page) : u === '/base.html' ? olderHtml(BASE_SHA) : u === '/pre49.html' ? olderHtml(PRE49_SHA) : f && fs.statSync(f).isFile() ? fs.readFileSync(f) : null; } catch { body = null; }
    if (u === '/none') { body = Buffer.from('<!doctype html><title>none</title>'); f = 'none.html'; }   // (C.blank's page)
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f || u)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
}
const closeServer = () => { try { server?.closeAllConnections?.(); server?.close(); } catch {} server = null; };

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const b of [path.join(os.homedir(), 'Library/Caches/ms-playwright'), path.join(os.homedir(), '.cache/ms-playwright')]) {
    if (!fs.existsSync(b)) continue;
    for (const d of fs.readdirSync(b).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()) {
      for (const sub of ['chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell']) {
        const p = path.join(b, d, sub); if (fs.existsSync(p)) return p;
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-no-names-'));
  const chrome = spawn(chromeBin, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--window-size=1280,800', '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
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
process.on('exit', () => { killSync(shared); closeServer(); });
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => { kill(shared).finally(() => { closeServer(); process.exit(code); }); });
const HARD_TIMEOUT_MS = 60 * 60 * 1000;
setTimeout(() => { console.error(`hard timeout: over ${HARD_TIMEOUT_MS / 60000} min; closing Chrome`); kill(shared).finally(() => { closeServer(); process.exit(124); }); }, HARD_TIMEOUT_MS).unref();

const KEYS = {};   // code -> [key, windowsVirtualKeyCode]
for (let c = 65; c <= 90; c++) KEYS['Key' + String.fromCharCode(c)] = [String.fromCharCode(c + 32), c];
Object.assign(KEYS, { Enter: ['Enter', 13], Space: [' ', 32], Escape: ['Escape', 27], Backspace: ['Backspace', 8], Tab: ['Tab', 9],
  ArrowLeft: ['ArrowLeft', 37], ArrowUp: ['ArrowUp', 38], ArrowRight: ['ArrowRight', 39], ArrowDown: ['ArrowDown', 40] });

async function connect(S) {
  let tgt, port;
  for (let i = 0; i < 450 && !tgt && !S.exited; i++) {
    try { const f = fs.readFileSync(path.join(S.prof, 'DevToolsActivePort'), 'utf8'); if (f.includes('\n')) port = parseInt(f, 10) || undefined; } catch {}
    if (port) try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!tgt) await sleep(200);
  }
  if (!tgt) throw new Error('Chrome did not start (' + chromeBin + ')');
  const ws = S.ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; ws.onclose = () => j(new Error('Chrome closed the connection')); });
  let id = 0; const pend = new Map(), errs = [];
  ws.onclose = () => { for (const [, f] of pend) f({ result: { exceptionDetails: { text: 'Chrome closed the connection' } } }); pend.clear(); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { pend.get(m.id)?.(m); pend.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) errs.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
  };
  const send = (method, params = {}) => new Promise((r) => { if (ws.readyState !== 1) return r({ result: { exceptionDetails: { text: 'Chrome closed the connection' } } }); const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const v = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (v.result?.exceptionDetails) throw new Error('page threw: ' + (v.result.exceptionDetails.exception?.description || v.result.exceptionDetails.text));
    return v.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  const C = { send, ev, errs };
  // the frozen clock and dice (current's scripted play): installed before any page script runs, from the next navigation on
  let frozen = null;
  C.freeze = async (on) => {
    if (frozen) { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: frozen }); frozen = null; }
    if (on) frozen = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const T = 1793000000000; let s = 161;
      Date.now = () => T; Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647); })();` })).result?.identifier ?? null;
  };
  C.open = async (w, h, touch, file = 'robot-battle.html') => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!touch, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: !!touch, maxTouchPoints: touch ? 5 : 0 });
    await send('Page.navigate', { url: base + file });
    for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState === "complete" && !!window.__rb').catch(() => false)) return; }
    throw new Error('page did not load window.__rb: ' + file);
  };
  // a blank page on the same origin (storage set or read with no game running)
  C.blank = async () => {
    await send('Page.navigate', { url: base + 'none' });
    for (let i = 0; i < 50; i++) { await sleep(100); if (await ev('document.readyState === "complete" && location.pathname === "/none"').catch(() => false)) return; }
    throw new Error('blank page did not load');
  };
  C.tap = async (x, y, holdMs = 40) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] }); await sleep(holdMs);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(150);
  };
  C.click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(150);
  };
  C.key = async (code) => {
    const [k, vk] = KEYS[code] || [code, 0], text = code === 'Enter' ? '\r' : code === 'Space' ? ' ' : null;
    await send('Input.dispatchKeyEvent', text ? { type: 'keyDown', code, key: k, text, unmodifiedText: text, windowsVirtualKeyCode: vk } : { type: 'rawKeyDown', code, key: k, windowsVirtualKeyCode: vk }); await sleep(60);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk }); await sleep(90);
  };
  C.type = async (text) => { await send('Input.insertText', { text }); await sleep(120); };
  C.padOn = () => ev(`(() => { window.__pad = { id: 'check pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.__pad]; return true; })()`);
  C.padBtn = async (n) => { await ev(`(window.__pad.buttons[${n}].pressed = true, window.__pad.buttons[${n}].value = 1, true)`); await sleep(130); await ev(`(window.__pad.buttons[${n}].pressed = false, window.__pad.buttons[${n}].value = 0, true)`); await sleep(130); };
  C.shot = async (name) => { if (!shots) return; const sh = await send('Page.captureScreenshot', { format: 'png' }); if (sh.result?.data) fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(sh.result.data, 'base64')); };
  // every robotbattle.* key in storage, raw ({ key: string })
  C.storage = () => ev(`(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('robotbattle.')) o[k] = localStorage.getItem(k); } return o; })()`);
  C.setStorage = (o) => ev(`(() => { localStorage.clear(); const o = ${JSON.stringify(o)}; for (const k in o) localStorage.setItem(k, o[k]); return localStorage.length; })()`);
  return C;
}

// ---- helpers
const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v) ?? 'null');
// the keys of two raw storage snapshots that differ (by position in the sorted key list, so no id or name is printed)
const differ = (a, b) => { const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(); return keys.map((k, i) => (a[k] === b[k] ? null : `#${i}${k in a ? '' : ' (new)'}${k in b ? '' : ' (gone)'}`)).filter(Boolean); };
// the same FNV-1a hash the game keys the old ladder ids by (LADDER_OLD): the two seeded names hash to these
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };
const NAME_HASHES = new Set(['1pg53w2', '10kxt4a']);

// ---- names: no seeded name anywhere in the page or the scripts (every 5- and 6-letter run, any case, hashed)
async function runNames() {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  // (the hash list itself: the game's LADDER_OLD holds the same two)
  const src = fs.readFileSync(page, 'utf8');
  ok("the game's LADDER_OLD keys are these two hashes", [...NAME_HASHES].every((h) => src.includes(`'${h}'`)));
  const files = [page, path.join(repo, 'wild-world.html'), ...fs.readdirSync(path.join(repo, 'scripts')).map((f) => path.join(repo, 'scripts', f)).filter((f) => fs.statSync(f).isFile())];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8').toLowerCase(); let hits = 0;
    for (let i = 0; i < text.length; i++) for (const n of [5, 6]) if (i + n <= text.length && NAME_HASHES.has(fnv(text.slice(i, i + n)))) hits++;
    ok(`${path.relative(repo, f)}: neither seeded name appears (${text.length} characters searched)`, hits === 0, { hits });
  }
  return out;
}

// a fresh device: storage emptied on a blank page of the same origin, then the page opened
async function freshOpen(C, w, h, touch, file = 'robot-battle.html') { await C.blank(); await C.ev('(localStorage.clear(), true)'); await C.open(w, h, touch, file); }
// a play through the hooks only (no dice: every answer is given, never asked), the same on every build: child i answers
// facts, a part is collected for their garage, then the next. ids: the children to play, in order
const PLAY = (ids) => String.raw`(() => { const R = window.__rb; R.manual(true);
  const facts = [[2, 3, 6, 1500], [2, 3, 6, 1400], [4, 5, 20, 1500], [4, 5, 21, 1500], [6, 7, 42, 4000], [1, 9, 9, 900], [3, 3, 9, 2200]];
  for (const id of ${JSON.stringify(ids)}) { const p = R.player(id); if (!p.ok) return { ok: false, why: 'no player ' + ${JSON.stringify(ids)}.indexOf(id) };
    for (const [a, b, v, ms] of facts) R.answer(a, b, v, ms);
    R.clock(864e5); for (const [a, b, v, ms] of facts.slice(0, 3)) R.answer(a, b, v, ms);
    if (R.Garage?.collect) { R.Garage.collect('armour', 'charger'); R.Facts.save(); } }
  return { ok: true }; })()`;
// the records in a raw storage snapshot ({ id: parsed record })
const recsOf = (raw) => Object.fromEntries(Object.entries(raw).filter(([k]) => /^robotbattle\.facts\./.test(k)).map(([k, v]) => [k.slice('robotbattle.facts.'.length), JSON.parse(v)]));

// ---- fresh: a device that has never played
async function runFresh(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'fresh: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await freshOpen(C, 1280, 800, false);
  const r = await C.ev(String.raw`(() => { const R = window.__rb, who = R.state().who;
    const tiles = [...document.querySelectorAll('#kids [data-k]')].map((b) => ({ k: b.dataset.k, text: b.textContent.trim(), label: b.getAttribute('aria-label') }));
    const par = R.parent(true); R.parent(false);
    return { tiles: who.tiles, dom: tiles, profiles: R.profiles(), children: R.CHILDREN.map((C) => C.id), cur: who.cur, empty: par.empty, noneShown: par.children.length,
      player0: R.player(0).child, back: R.player(null).ok }; })()`);
  ok('the title shows Guest and ➕ only (tiles: guest, +)', r.tiles.join() === 'guest,+' && r.dom.map((t) => t.k).join() === 'guest,+', r.tiles);
  ok('the only name on the tiles is Guest (and ➕ says New player)', r.dom[0].text === 'Guest' && r.dom[0].label === 'Guest' && r.dom[1].text === '' && r.dom[1].label === 'New player', r.dom);
  ok('no profile: __rb.profiles() is empty and CHILDREN is Guest alone', r.profiles.length === 0 && r.children.join() === 'guest', { n: r.profiles.length, children: r.children.length });
  ok('the cursor starts on Guest; tile 0 picks Guest', r.cur === 'guest' && r.player0 === 'guest' && r.back, { cur: r.cur, p0: r.player0 });
  ok('the parent view says there are no players yet', r.empty && r.noneShown === 0, r);
  const raw = await C.storage();
  ok('loading writes no list and no record (keys written: ' + (Object.keys(raw).map((k) => k.slice(12)).join(', ') || 'none') + ')', !('robotbattle.profiles' in raw) && !Object.keys(raw).some((k) => k.startsWith('robotbattle.facts.')), Object.keys(raw));
  await C.open(1280, 800, false);
  const again = await C.ev(`window.__rb.state().who.tiles.join()`);
  ok('after a reload: still Guest and ➕ only', again === 'guest,+', again);
  return out;
}

// ---- current: a device with the list made before #161
async function runCurrent(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'current: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  // base.html seeds its two profiles; a third is made; the two seeded children and the third play
  await freshOpen(C, 1280, 800, false, 'base.html');
  ok('(the page is the build before #161: no ladderId, its seed on)', await C.ev(`!window.__rb.ladderId && window.__rb.profiles().length === 2`));
  const made = await C.ev(String.raw`(() => { const R = window.__rb; const a = R.addProfile('Max'); return { ok: a.ok, ids: R.profiles().map((p) => p.id) }; })()`);
  ok('(setup) base.html seeded 2 profiles and a third was made', made.ok && made.ids.length === 3, { ok: made.ok, n: made.ids.length });
  const setup = await C.ev(PLAY(made.ids));
  ok('(setup) all three played on base.html', setup.ok, setup);
  const S0 = await C.storage();
  ok('(setup) storage has the list and 3 records', 'robotbattle.profiles' in S0 && Object.keys(recsOf(S0)).length === 3, Object.keys(S0).length);
  // this build loads it: nothing written
  await C.open(1280, 800, false);
  const S1 = await C.storage();
  ok('this build loads it: storage byte-identical (every key)', differ(S0, S1).length === 0, differ(S0, S1));
  const v = await C.ev(String.raw`(() => { const R = window.__rb; return { list: R.profiles(), tracks: R.profiles().map((p) => R.ladderId(p.ladder)), tiles: R.state().who.tiles }; })()`);
  const L0 = JSON.parse(S0['robotbattle.profiles']);
  ok('its profiles are the saved list as it stands (ids, names, icons, colours, ladders, wiring, created)', canon(v.list) === canon(L0), 'differs');
  ok('the seeded ladders read as check (the first) and start (the second and the new one)', v.tracks.join() === 'check,start,start', v.tracks);
  ok('the tiles: the three, Guest, ➕', v.tiles.length === 5 && v.tiles.slice(0, 3).join() === made.ids.join() && v.tiles.slice(3).join() === 'guest,+', v.tiles.length);
  // each child picked (their record loaded and saved, as picking does): only robotbattle.child changes
  await C.ev(`(() => { const R = window.__rb; R.manual(true); for (const id of ${JSON.stringify(made.ids)}) R.player(id); return true; })()`);
  const S2 = await C.storage(), d2 = differ(S0, S2), childKey = Object.keys({ ...S0, ...S2 }).sort().indexOf('robotbattle.child');
  ok('picking each child writes nothing but who played last (robotbattle.child): the list and every record byte-identical', d2.every((d) => d === '#' + childKey), d2);
  // the same scripted play (frozen clock and dice) on base.html and on this build, from that storage
  await C.freeze(true);
  const ends = {};
  for (const file of ['base.html', 'robot-battle.html']) {
    await C.blank(); await C.setStorage(S0); await C.open(1280, 800, false, file);
    const p = await C.ev(PLAY([made.ids[0], made.ids[2]]));
    ok(`(${file}) the scripted play ran (the first and third children)`, p.ok, p);
    ends[file] = await C.storage();
  }
  await C.freeze(false);
  const dd = differ(ends['base.html'], ends['robot-battle.html']);
  ok('the same play on base.html and on this build ends in byte-identical storage', dd.length === 0, dd);
  ok('(the play wrote: the records of the first and third children changed)', [0, 2].every((i) => ends['robot-battle.html']['robotbattle.facts.' + made.ids[i]] !== S0['robotbattle.facts.' + made.ids[i]]));
  const untouched = ['robotbattle.profiles', 'robotbattle.facts.' + made.ids[1]];
  ok("keys the play didn't touch (the list, the second child's record) are byte-identical to before it", untouched.every((k) => ends['robot-battle.html'][k] === S0[k]), untouched.map((k) => ends['robot-battle.html'][k] === S0[k]));
  const tr = recsOf(ends['robot-battle.html']), r0 = recsOf(S0);
  ok("the played records keep the ladder id they were saved with (none renamed)", made.ids.every((id) => tr[id].ladder === r0[id].ladder), 'renamed');
  return out;
}

// ---- pre49: records, no list
async function runPre49(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'pre49: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await freshOpen(C, 1280, 800, false, 'pre49.html');
  ok('(the page is the build before #49: no Profiles)', await C.ev(`!window.__rb.Profiles && !window.__rb.profiles`));
  const ids = await C.ev(`window.__rb.CHILDREN.filter((C) => !C.guest).map((C) => C.id)`);
  const p = await C.ev(PLAY(ids));
  ok('(setup) pre49.html: both its children played', p.ok && ids.length === 2, p);
  await C.ev(`(window.__rb.player(0), true)`);   // (the first is who played last)
  const S0 = await C.storage();
  ok('(setup) storage: 2 records and no list (as before #49)', !('robotbattle.profiles' in S0) && Object.keys(recsOf(S0)).length === 2, Object.keys(S0).length);
  const R0 = recsOf(S0);
  await C.open(1280, 800, false);
  const S1 = await C.storage();
  const v = await C.ev(String.raw`(() => { const R = window.__rb; return { list: R.profiles(), tracks: R.profiles().map((p) => R.ladderId(p.ladder)), tiles: R.state().who.tiles, cur: R.state().who.cur }; })()`);
  ok('a profile for each record, with its id (the storage keys keep working)', v.list.length === 2 && v.list.map((q) => q.id).sort().join() === ids.slice().sort().join(), v.list.length);
  ok('their names are plain: "Player 1", "Player 2" (oldest record first)', v.list.map((q) => q.name).join() === 'Player 1,Player 2', v.list.map((q) => q.name));
  ok("each profile's ladder is its record's, as saved (not renamed), and reads as that ladder", v.list.every((q) => q.ladder === R0[q.id].ladder), 'differs');
  ok('the quick-check child (pre49 tile 0) reads check, the other start', v.tracks[v.list.findIndex((q) => q.id === ids[0])] === 'check' && v.tracks[v.list.findIndex((q) => q.id === ids[1])] === 'start', v.tracks);
  ok("each profile's wiring is its record's; a different icon and colour each", v.list.every((q) => q.wiring === R0[q.id].wiring) && v.list[0].icon !== v.list[1].icon && v.list[0].hex !== v.list[1].hex, 'differs');
  ok('the tiles: both, Guest, ➕; the cursor on who played last', v.tiles.length === 4 && v.tiles.slice(2).join() === 'guest,+' && v.cur === ids[0], v.tiles.length);
  const d1 = differ(S0, S1);
  ok('the list is saved once (the only key written); every record and setting byte-identical', 'robotbattle.profiles' in S1 && d1.length === 1 && d1[0].endsWith('(new)') && canon(JSON.parse(S1['robotbattle.profiles'])) === canon(v.list), d1);
  await C.open(1280, 800, false);
  const S2 = await C.storage();
  ok('after a reload: the same list, nothing written', differ(S1, S2).length === 0, differ(S1, S2));
  // each child picked: their progress as it was
  const q = await C.ev(String.raw`(() => { const R = window.__rb, out = {}; R.manual(true);
    for (const id of ${JSON.stringify(ids)}) { R.player(id); const f = R.facts(); out[id] = { facts: f.facts, step: f.step, ladder: f.ladder, practice: f.practice, trophies: f.garage?.trophies, track: f.summary.track, mastered: R.mastered(id).mastered }; }
    return out; })()`);
  const canonEq = (a, b) => canon(a) === canon(b);
  ok('picked: every fact entry as recorded, the step, the ladder and the practice minutes', ids.every((id) => canonEq(q[id].facts, R0[id].facts) && q[id].step === R0[id].step && q[id].ladder === R0[id].ladder && canonEq(q[id].practice, R0[id].practice)), 'differs');
  ok('picked: the garage trophies as recorded', ids.every((id) => canonEq(q[id].trophies ?? {}, R0[id].garage?.trophies ?? {})), 'differs');
  ok('picked: the tracker reads their ladders (check, start)', q[ids[0]].track === 'check' && q[ids[1]].track === 'start', [q[ids[0]].track, q[ids[1]].track]);
  // the list can't be read: the same profiles from the records, nothing written
  await C.blank(); await C.setStorage({ ...S0, 'robotbattle.profiles': '{not a list' }); await C.open(1280, 800, false);
  const f = await C.ev(`window.__rb.profiles()`), S3 = await C.storage();
  ok("a list that can't be read: the same profiles made from the records", canon(f) === canon(v.list), 'differs');
  ok("... and nothing written (the broken list and every record as they were)", differ({ ...S0, 'robotbattle.profiles': '{not a list' }, S3).length === 0, differ({ ...S0, 'robotbattle.profiles': '{not a list' }, S3));
  return out;
}

// restore bk onto a fresh device of file with choice ch; then the storage, and the restore's result
async function restoreFresh(C, file, bk, ch) {
  await freshOpen(C, 1280, 800, false, file);
  const x = await C.ev(`(() => { const x = window.__rb.restore(${JSON.stringify(bk)}, ${JSON.stringify(ch)}); return { ok: x.ok, why: x.ok ? null : 'refused', writes: x.summary?.writes?.length ?? 0 }; })()`);
  return { x, raw: await C.storage() };
}
// does storage raw hold every profile, record and setting of backup bk, value for value? { ok, profiles, records, facts,
// garages, settings, bad: [which part differs, by kind and position only] }
function holds(raw, bk) {
  const bad = [], D = bk.data, keys = Object.keys(D).sort();
  const got = (k) => { try { return JSON.parse(raw['robotbattle.' + k]); } catch { return undefined; } };
  if (D.profiles != null && canon(got('profiles')) !== canon(D.profiles)) bad.push('profiles');
  const recs = keys.filter((k) => k.startsWith('facts.'));
  recs.forEach((k, i) => { if (canon(got(k)) !== canon(D[k])) bad.push('record #' + i); });
  for (const k of ['child', 'pilot']) if (k in D && got(k) !== D[k]) bad.push('setting ' + k);
  const other = keys.filter((k) => k !== 'profiles' && k !== 'child' && k !== 'pilot' && !k.startsWith('facts.'));
  other.forEach((k, i) => { if (canon(got(k)) !== canon(D[k])) bad.push('other #' + i); });
  return { ok: !bad.length, profiles: Array.isArray(D.profiles) ? D.profiles.length : 0, records: recs.length, facts: recs.reduce((t, k) => t + Object.keys(D[k]?.facts || {}).length, 0),
    garages: recs.filter((k) => D[k]?.garage && typeof D[k].garage === 'object').length, settings: ['child', 'pilot'].filter((k) => k in D).length, other: other.length, bad };
}

// ---- backups: made before #49, before #161 and by this build; and the real ones given with --backup
async function runBackups(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'backups: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  // a backup made by pre49.html (records, no list)
  await freshOpen(C, 1280, 800, false, 'pre49.html');
  const ids49 = await C.ev(`window.__rb.CHILDREN.filter((C) => !C.guest).map((C) => C.id)`);
  await C.ev(PLAY(ids49)); await C.ev(`(window.__rb.player(0), true)`);
  const BK49 = await C.ev(`JSON.parse(JSON.stringify(window.__rb.backup()))`);
  ok('(setup) pre49.html made a backup with 2 records and no list', !('profiles' in BK49.data) && Object.keys(BK49.data).filter((k) => k.startsWith('facts.')).length === 2, Object.keys(BK49.data).length);
  for (const ch of ['backup', 'best']) {
    const { x, raw } = await restoreFresh(C, 'robot-battle.html', BK49, ch), h = holds(raw, BK49);
    const list = JSON.parse(raw['robotbattle.profiles'] || 'null');
    ok(`pre-#49 backup onto a fresh device ("${ch}"): accepted, a profile per record (their ids, "Player 1", "Player 2")`, x.ok && list?.length === 2 && list.map((p) => p.id).sort().join() === ids49.slice().sort().join() && list.map((p) => p.name).join() === 'Player 1,Player 2', { x, n: list?.length });
    ok(`pre-#49 backup ("${ch}"): every record and setting back, value for value (${h.records} records, ${h.facts} facts, ${h.settings} settings)`, h.ok, h.bad);
  }
  // onto a device that has profiles already: the new ones are numbered past theirs
  await freshOpen(C, 1280, 800, false);
  const pn = await C.ev(String.raw`(() => { const R = window.__rb; R.addProfile('Player 1'); const x = R.restore(${JSON.stringify(BK49)}, 'backup'); return { ok: x.ok, names: R.profiles().map((p) => p.name) }; })()`);
  ok('pre-#49 backup onto a device with a "Player 1": accepted, its profiles are Player 2 and Player 3', pn.ok && pn.names.join() === 'Player 1,Player 2,Player 3', pn);

  // a backup made by base.html (the list, the ladder ids from before #161)
  await freshOpen(C, 1280, 800, false, 'base.html');
  const idsB = await C.ev(`(window.__rb.addProfile('Max'), window.__rb.profiles().map((p) => p.id))`);
  await C.ev(PLAY(idsB));
  const BKB = await C.ev(`JSON.parse(JSON.stringify(window.__rb.backup()))`);
  ok('(setup) base.html made a backup with its list (3 profiles) and 3 records', BKB.data.profiles?.length === 3 && Object.keys(BKB.data).filter((k) => k.startsWith('facts.')).length === 3, Object.keys(BKB.data).length);
  for (const ch of ['backup', 'best']) {
    const { x, raw } = await restoreFresh(C, 'robot-battle.html', BKB, ch), h = holds(raw, BKB);
    ok(`backup from before #161 onto a fresh device ("${ch}"): accepted; every profile (old ladder ids as saved), record and setting back, value for value (${h.profiles} profiles, ${h.records} records, ${h.facts} facts, ${h.garages} garages)`, x.ok && h.ok, { x, bad: h.bad });
  }
  // the same device restoring it again, every choice: nothing changes
  for (const ch of ['backup', 'best', 'device']) {
    await C.ev(`(() => { window.__rb.restore(${JSON.stringify(BKB)}, ${JSON.stringify(ch)}); return true; })()`);
    const h = holds(await C.storage(), BKB);
    ok(`... restored again onto itself ("${ch}"): still value for value`, h.ok, h.bad);
  }
  const tr = await C.ev(String.raw`(() => { const R = window.__rb; R.manual(true); return ${JSON.stringify(idsB)}.map((id) => (R.player(id), R.facts().summary.track)); })()`);
  ok('... and each child plays on their ladder (check, start, start)', tr.join() === 'check,start,start', tr);
  // this build's backup of that device (old ids kept) goes back into base.html
  const BKB2 = await C.ev(`JSON.parse(JSON.stringify(window.__rb.backup()))`);
  ok("this build's backup of those profiles keeps their ladder ids as saved", BKB2.data.profiles.every((p, i) => p.ladder === BKB.data.profiles[i].ladder), 'renamed');
  {
    const { x, raw } = await restoreFresh(C, 'base.html', BKB2, 'backup'), h = holds(raw, BKB2);
    // (base.html seeds its two on load, so their created time is that load's: every other field of the list compared)
    const strip = (L) => (L || []).map(({ created, ...p }) => p), lists = canon(strip(JSON.parse(raw['robotbattle.profiles'] || 'null'))) === canon(strip(BKB2.data.profiles));
    ok("... and restores into base.html (before #161): every record and setting value for value, the list the same but its seeded profiles' created times", x.ok && h.bad.every((b) => b === 'profiles') && lists, { x, bad: h.bad, lists });
  }

  // a backup made by this build (profiles made since #161: ladder ids start and check)
  await freshOpen(C, 1280, 800, false);
  const idsN = await C.ev(`(() => { const R = window.__rb; R.addProfile('Ada', null, null, 'check'); R.addProfile('Bo'); return R.profiles().map((p) => p.id); })()`);
  await C.ev(PLAY(idsN));
  const BKN = await C.ev(`JSON.parse(JSON.stringify(window.__rb.backup()))`);
  ok('(setup) this build made a backup: Ada on check, Bo on start', BKN.data.profiles?.map((p) => p.ladder).join() === 'check,start' && BKN.data['facts.' + idsN[0]]?.ladder === 'check', BKN.data.profiles?.map((p) => p.ladder));
  for (const ch of ['backup', 'best']) {
    const { x, raw } = await restoreFresh(C, 'robot-battle.html', BKN, ch), h = holds(raw, BKN);
    ok(`this build's backup onto a fresh device ("${ch}"): every profile, record and setting back, value for value (${h.profiles} profiles, ${h.records} records)`, x.ok && h.ok, { x, bad: h.bad });
  }
  {
    const { x } = await restoreFresh(C, 'base.html', BKN, 'backup');
    ok("(known limit) base.html, from before #161, refuses a profile made since: it doesn't know the ladder ids start and check", !x.ok, x);
  }

  return out;
}

// ---- real: each backup given with --backup restores onto a fresh device completely (counts only, never a name or value)
async function runReal(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'real: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  for (const [i, f] of backups.entries()) {
    const label = `real backup ${i + 1} of ${backups.length}`;
    let bk = null; try { bk = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { bk = null; }
    if (!ok(`${label}: the file reads as JSON`, !!bk && bk.data, 'unreadable')) continue;
    for (const ch of ['backup', 'best']) {
      const { x, raw } = await restoreFresh(C, 'robot-battle.html', fs.readFileSync(f, 'utf8'), ch), h = holds(raw, bk);
      ok(`${label} onto a fresh device ("${ch}"): accepted, and every profile, record, ladder, garage and setting back value for value: ${h.profiles} profiles, ${h.records} records, ${h.facts} fact entries, ${h.garages} garages, ${h.settings} settings, ${h.other} other keys`, x.ok && h.ok, { ok: x.ok, bad: h.bad });
    }
    // each child plays from it: the ladder the record names, the same Mastered count as the backup's record
    const ids = Object.keys(bk.data).filter((k) => k.startsWith('facts.')).map((k) => k.slice(6));
    const want = ids.map((id) => bk.data['facts.' + id].ladder);
    const pl = await C.ev(String.raw`(() => { const R = window.__rb; R.manual(true); const want = ${JSON.stringify(want)};
      return ${JSON.stringify(ids)}.map((id, i) => { const p = R.player(id), f = R.facts(); const B = R.backupLib.count(${JSON.stringify(bk.data)}['facts.' + id]);
        return { ok: p.ok, ladder: f?.ladder === want[i], track: !!f?.summary?.track && f.summary.track === R.ladderId(want[i]), mastered: R.mastered(id).mastered === B.mastered, step: f?.step === B.step }; }); })()`);
    const profLadders = await C.ev(`window.__rb.profiles().map((p) => !!window.__rb.ladderId(p.ladder))`);
    ok(`${label}: each of the ${ids.length} children loads on the ladder their record names, with the same step and Mastered count; every profile's ladder is one this build reads (${profLadders.filter(Boolean).length}/${profLadders.length})`,
      pl.every((q) => q.ok && q.ladder && q.track && q.mastered && q.step) && profLadders.every(Boolean), pl.map((q, j) => ({ child: '#' + j, ok: q.ok, ladder: q.ladder, track: q.track, mastered: q.mastered, step: q.step })));
    if (!json) console.log(`  ${label}: ${holds(await C.storage(), bk).records} records restored; counts above`);
  }
  if (!backups.length) ok('(no --backup given: the real-backup check is skipped)', true);
  return out;
}

// the parent view's ladder buttons, as shown: [{ w, on, box }]
const PLAD = String.raw`(() => [...document.querySelectorAll('#pBody [data-act="ladder"][data-w]')].map((b) => { const r = b.getBoundingClientRect(); return { w: b.dataset.w, on: b.classList.contains('on'), pressed: b.getAttribute('aria-pressed'), x: r.left + r.width / 2, y: r.top + r.height / 2, bw: Math.round(r.width), bh: Math.round(r.height), l: r.left, t: r.top, r: r.right, b: r.bottom, text: b.textContent.trim() }; }))()`;
const mk = (k) => String.raw`(() => { const b = document.querySelector('#maker [data-mk="${k}"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, on: b.classList.contains('on'), w: r.width, h: r.height }; })()`;

// ---- ladder: either ladder, from the maker and the parent view
async function runLadder(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'ladder: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await freshOpen(C, 1280, 800, false);
  let r = await C.ev(String.raw`(() => { const R = window.__rb; R.manual(true);
    const a = R.addProfile('Ada', null, null, 'check'), b = R.addProfile('Bo'), c = R.addProfile('Cy', null, null, 'nope'), d = R.addProfile('Di', null, null, 'start');
    const t = (id) => (R.player(id), R.facts()); const ta = t(a.id), tb = t(b.id), td = t(d.id); R.player(null);
    return { a: a.ladder, b: b.ladder, c: c.why, d: d.ladder, ra: ta.ladder, sa: ta.summary.track, ka: ta.summary.ladder[0].kind, rb: tb.ladder, sb: tb.summary.track, rd: td.ladder, n: R.profiles().length }; })()`);
  ok("the hook: a profile on 'check' gets the quick check (step 1 a check of every fact)", r.a === 'check' && r.ra === 'check' && r.sa === 'check' && r.ka === 'check', r);
  ok("the hook: left out, or 'start': the ladder from ×1 and ×2", r.b === 'start' && r.rb === 'start' && r.sb === 'start' && r.d === 'start' && r.rd === 'start', r);
  ok("the hook: any other ladder is refused (no such ladder), nothing made", r.c === 'no such ladder' && r.n === 3, r);
  // the maker by mouse: ➕, a name typed, Quick check clicked, ✔
  await C.ev(`(window.__rb.player(null), true)`);
  let plus = await C.ev(`(() => { const r = document.querySelector('#kids [data-k="+"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await C.click(plus.x, plus.y);
  r = await C.ev(`window.__rb.state().who.maker`);
  ok('the maker opens from ➕ on Start from the beginning (start picked)', r && r.ladder === 'start', r);
  await C.type('Eve');
  let b = await C.ev(mk('ladder:check')); await C.click(b.x, b.y);
  r = await C.ev(String.raw`(() => ({ m: window.__rb.state().who.maker, on: [...document.querySelectorAll('#maker [data-mk^="ladder:"]')].map((b) => b.dataset.mk + ':' + b.classList.contains('on') + ':' + b.getAttribute('aria-pressed')) }))()`);
  ok('a click on Quick check picks it (shown on, aria-pressed)', r.m?.ladder === 'check' && r.on.join() === 'ladder:start:false:false,ladder:check:true:true', r);
  b = await C.ev(mk('ok')); await C.click(b.x, b.y);
  r = await C.ev(`(() => { const R = window.__rb, p = R.profiles().find((q) => q.name === 'Eve'); return { p: p?.ladder, child: R.Game.child?.name, track: R.facts()?.summary.track }; })()`);
  ok('✔: Eve is made on the quick check and picked (her record on check)', r.p === 'check' && r.child === 'Eve' && r.track === 'check', r);
  // a programmatic click (detail 0, no pointer: the keys' Enter / Space on a focused button) doesn't pick: the touch-tap rule
  await C.ev(`(window.__rb.player(null), window.__rb.maker('open'), true)`);
  r = await C.ev(`(() => { document.querySelector('#maker [data-mk="ladder:check"]').click(); return window.__rb.state().who.maker.ladder; })()`);
  ok('a click with no pointer (e.detail 0, the keys) leaves the pick to Maker.key: still start', r === 'start', r);
  // the keys: the name typed, the arrows down to Quick check (picked as the cursor lands), Enter saves
  await C.ev(`(() => { document.getElementById('mkName').focus(); return true; })()`);
  await C.type('Flo');
  let at = null;
  for (let i = 0; i < 12 && at !== 'ladder:check'; i++) { await C.key(at && at.startsWith('ladder:') ? 'ArrowRight' : 'ArrowDown'); at = await C.ev(`window.__rb.state().who.maker?.at`); }
  r = await C.ev(`window.__rb.state().who.maker`);
  ok('the keys: the arrows reach Quick check and landing on it picks it', r?.at === 'ladder:check' && r.ladder === 'check', r);
  await C.key('Enter');
  r = await C.ev(`(() => { const R = window.__rb, p = R.profiles().find((q) => q.name.toLowerCase() === 'flo'); return { p: p?.ladder, maker: !!R.state().who.maker, track: R.facts()?.summary.track }; })()`);
  ok('the keys: Enter on Quick check saves (Flo on check)', r.p === 'check' && !r.maker && r.track === 'check', r);
  // the pad: d-pad to Start from the beginning from Quick check, A picks, Start saves
  await C.ev(`(window.__rb.player(null), window.__rb.manual(false), true)`); await C.padOn();   // (the pad is read by the game's own loop)
  await C.ev(`(window.__rb.maker('open'), window.__rb.maker('name', 'Gus'), window.__rb.maker('ladder', 'check'), true)`);
  for (let i = 0; i < 14; i++) { at = await C.ev(`window.__rb.state().who.maker?.at`); if (at === 'ladder:start') break; await C.padBtn(at && at.startsWith('ladder:') ? 14 : 13); }
  await C.padBtn(0);
  r = await C.ev(`window.__rb.state().who.maker`);
  ok('the pad: the d-pad reaches Start from the beginning, A picks it', r?.at === 'ladder:start' && r.ladder === 'start', r);
  await C.padBtn(9);
  r = await C.ev(`(() => { const R = window.__rb, p = R.profiles().find((q) => q.name === 'Gus'); return { p: p?.ladder }; })()`);
  ok('the pad: Start saves (Gus on start)', r.p === 'start', r);
  // the parent view: Ada (check) with progress, switched to start by a click, then back by the hook
  await C.open(1280, 800, false);
  const ada = await C.ev(`window.__rb.profiles().find((p) => p.name === 'Ada').id`);
  await C.ev(String.raw`(() => { const R = window.__rb; R.manual(true); R.player(${JSON.stringify(ada)}); for (const [a, b] of [[2, 3], [4, 5], [6, 7], [8, 9]]) { R.answer(a, b, a * b, 1500); } R.player(null); return true; })()`);
  const before = JSON.parse((await C.storage())['robotbattle.facts.' + ada]);
  await C.ev(`(window.__rb.parent(true, ${JSON.stringify(ada)}), true)`);
  let pl = await C.ev(PLAD);
  ok('the parent view shows the ladder switch: Start from the beginning, Quick check (on)', pl.length === 2 && pl[0].w === 'start' && !pl[0].on && pl[1].w === 'check' && pl[1].on && pl[1].pressed === 'true' && /Start from the beginning/.test(pl[0].text) && /Quick check/.test(pl[1].text), pl);
  ok('its buttons are big targets (at least 44 x 44 px)', pl.every((q) => q.bw >= 44 && q.bh >= 44), pl.map((q) => q.bw + 'x' + q.bh));
  await C.ev(`(document.querySelector('#pBody [data-act="ladder"][data-w="start"]').scrollIntoView({ block: 'center' }), true)`); await sleep(100);
  pl = await C.ev(PLAD); await C.click(pl[0].x, pl[0].y);
  let after = JSON.parse((await C.storage())['robotbattle.facts.' + ada]);
  r = await C.ev(String.raw`(() => { const R = window.__rb, v = R.parent(); return { prof: R.profiles().find((p) => p.id === ${JSON.stringify(ada)}).ladder, track: v.children.find((c) => c.id === ${JSON.stringify(ada)}).track, focus: document.activeElement?.dataset?.w ?? null }; })()`);
  pl = await C.ev(PLAD);
  ok('a click on Start from the beginning: her profile and record go to start, the view shows it', r.prof === 'start' && after.ladder === 'start' && r.track === 'start' && pl[0].on && !pl[1].on, { r, rec: after.ladder });
  ok('... every fact kept, value for value; step 1 opened by the parent, then any step her facts already pass', canon(after.facts) === canon(before.facts) && after.opened[0].by === 'parent' && after.step >= 1, { step: after.step, opened: after.opened });
  const s0 = await C.storage();
  await C.click(pl[0].x, pl[0].y);
  ok('the same ladder again writes nothing (storage byte-identical)', differ(s0, await C.storage()).length === 0, differ(s0, await C.storage()));
  r = await C.ev(`window.__rb.parentDo('ladder', ${JSON.stringify(ada)}, 'check')`);
  after = JSON.parse((await C.storage())['robotbattle.facts.' + ada]);
  ok("back to the quick check (parentDo 'ladder'): profile and record on check, every fact kept", r.ok && after.ladder === 'check' && canon(after.facts) === canon(before.facts) && r.view.children.find((c) => c.id === ada).track === 'check', { ok: r.ok, rec: after.ladder });
  r = await C.ev(`window.__rb.parentDo('ladder', ${JSON.stringify(ada)}, 'sideways')`);
  ok('any other ladder is refused', !r.ok && r.why === 'no such ladder', r);
  // a profile from before #161 (old ladder id) switched and switched back
  await C.blank();
  await C.ev('(localStorage.clear(), true)'); await C.open(1280, 800, false, 'base.html');
  const ids = await C.ev(`window.__rb.profiles().map((p) => p.id)`); await C.ev(PLAY(ids));
  const raw0 = await C.storage();
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { const R = window.__rb; R.parent(true, ${JSON.stringify(ids[1])}); const t0 = R.parent().children.find((c) => c.id === ${JSON.stringify(ids[1])}).track;
    const x = R.parentDo('ladder', ${JSON.stringify(ids[1])}, 'check'), y = R.parentDo('ladder', ${JSON.stringify(ids[1])}, 'start'); R.parent(false); return { t0, x: x.ok, y: y.ok }; })()`);
  const raw1 = await C.storage(), rec1 = JSON.parse(raw1['robotbattle.facts.' + ids[1]]), rec0 = JSON.parse(raw0['robotbattle.facts.' + ids[1]]);
  ok("a profile saved before #161 (the seeded start child): the view reads start; switched to check and back, it's on start with every fact kept", r.t0 === 'start' && r.x && r.y && rec1.ladder === 'start' && canon(rec1.facts) === canon(rec0.facts), { r, ladder: rec1.ladder === 'start' });
  ok("... and the other child's record is untouched (byte-identical)", raw1['robotbattle.facts.' + ids[0]] === raw0['robotbattle.facts.' + ids[0]], 'differs');
  // a step a parent opened (the real records have steps 2 to 6 opened this way, far past what their facts pass) survives a
  // switch and a switch back: the same step and the same openings
  r = await C.ev(String.raw`(() => { const R = window.__rb, id = ${JSON.stringify(ids[1])}; R.parent(true, id); for (let i = 0; i < 4; i++) R.parentDo('step', id);
    const k = 'robotbattle.facts.' + id, a = JSON.parse(localStorage.getItem(k)); R.parentDo('ladder', id, 'check'); const m = JSON.parse(localStorage.getItem(k));
    R.parentDo('ladder', id, 'start'); const b = JSON.parse(localStorage.getItem(k)); R.parent(false);
    return { a: a.step, m: m.step, b: b.step, mLad: m.ladder, opened: JSON.stringify(a.opened) === JSON.stringify(b.opened), facts: JSON.stringify(a.facts) === JSON.stringify(b.facts) }; })()`);
  ok('steps a parent opened survive a switch to check and back: the same step and openings, every fact kept', r.a >= 5 && r.mLad === 'check' && r.b === r.a && r.opened && r.facts, r);
  return out;
}

// the maker as laid out now: every control (each [data-mk] that shows, the preview, the why line) with its box; on = inside the
// viewport; hits = pairs of controls that overlap; scroll = how far the maker (or the page) could scroll
const MAKER = String.raw`(() => { const W = innerWidth, H = innerHeight, m = document.getElementById('maker');
  const vis = (e) => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const els = [...m.querySelectorAll('[data-mk]')].filter(vis).map((e) => e.closest('.mkName') || e);
  const box = (e) => { const r = e.getBoundingClientRect(); return { k: e.dataset?.mk || e.querySelector('[data-mk]')?.dataset.mk || e.id, l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
  const B = [...new Set(els)].map(box).concat([box(document.getElementById('mkPrev'))]);
  const off = B.filter((b) => b.l < -0.5 || b.t < -0.5 || b.r > W + 0.5 || b.b > H + 0.5).map((b) => b.k);
  const hits = []; for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { const a = B[i], b = B[j]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) hits.push(a.k + ' x ' + b.k); }
  const lad = B.filter((b) => /^ladder:/.test(b.k));
  const clip = [...m.querySelectorAll('[data-mk^="ladder:"] span')].filter((s) => s.scrollWidth > s.clientWidth + 1 || s.scrollHeight > s.clientHeight + 1).length;
  return { shown: getComputedStyle(m).display !== 'none', n: B.length, off, hits, scroll: m.scrollHeight - m.clientHeight, docX: document.documentElement.scrollWidth - W, docY: document.documentElement.scrollHeight - H,
    ladder: lad, clip, small: B.filter((b) => b.k !== 'mkPrev' && (b.w < 36 || b.h < 36)).map((b) => b.k + ' ' + b.w + 'x' + b.h) }; })()`;

// ---- WxH: the profile maker at a size, touch only, then the mouse
async function runSize(C, size) {
  const [w, h] = size.split('x').map(Number), out = [], ok = (name, pass, got) => { out.push({ name: size + ': ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  for (const touch of [true, false]) {
    const how = touch ? 'touch' : 'mouse', press = (x, y) => (touch ? C.tap(x, y) : C.click(x, y));
    await freshOpen(C, w, h, touch);
    const plus = await C.ev(`(() => { const r = document.querySelector('#kids [data-k="+"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await press(plus.x, plus.y); await sleep(250);
    const m = await C.ev(MAKER);
    ok(`${how}: ➕ opens the maker`, m.shown && (await C.ev(`!!window.__rb.state().who.maker`)), m.shown);
    ok(`${how}: all ${m.n} controls on screen (the name, 16 icons, 10 colours, both ladders, ✖ ✔, the tile)`, m.n === 32 && m.off.length === 0, m.off);
    ok(`${how}: no control overlaps another`, m.hits.length === 0, m.hits);
    ok(`${how}: nothing scrolls (the maker ${m.scroll} px, the page ${m.docX} / ${m.docY} px)`, m.scroll <= 0 && m.docX <= 0 && m.docY <= 0, { scroll: m.scroll, docX: m.docX, docY: m.docY });
    ok(`${how}: the ladder buttons are big targets (${m.ladder.map((b) => b.w + 'x' + b.h).join(', ')}), their words whole`, m.ladder.length === 2 && m.ladder.every((b) => b.w >= 120 && b.h >= 48) && m.clip === 0, { ladder: m.ladder, clip: m.clip });
    ok(`${how}: every other control at least 36 px`, m.small.length === 0, m.small);
    if (touch && shots) await C.shot(`maker-${size}`);
    // make one on the quick check, by this input alone
    const nb = await C.ev(`(() => { const r = document.getElementById('mkName').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await press(nb.x, nb.y); await C.type(touch ? 'Kit' : 'Lu');
    for (const k of ['ladder:check', 'icon:rocket', 'color:#4cd964']) { const b = await C.ev(mk(k)); await press(b.x, b.y); }
    const st = await C.ev(`window.__rb.state().who.maker`);
    ok(`${how}: a ${touch ? 'tap' : 'click'} picks Quick check, an icon and a colour`, st?.ladder === 'check' && st.icon === 'rocket' && st.color === '#4cd964', st);
    if (touch && shots) await C.shot(`maker-${size}-check`);
    const okb = await C.ev(mk('ok')); await press(okb.x, okb.y);
    const r = await C.ev(`(() => { const R = window.__rb, p = R.profiles()[0]; return { n: R.profiles().length, name: p?.name, ladder: p?.ladder, child: R.Game.child?.id === p?.id, track: R.facts()?.summary.track }; })()`);
    ok(`${how}: ✔ makes the profile on the quick check and picks it`, r.n === 1 && r.name === (touch ? 'Kit' : 'Lu') && r.ladder === 'check' && r.child && r.track === 'check', r);
  }
  // the parent view's switch at this size (touch): on screen once scrolled to, big targets, a tap switches it
  await C.open(w, h, true);
  const id = await C.ev(`window.__rb.profiles()[0].id`);
  await C.ev(`(window.__rb.parent(true, ${JSON.stringify(id)}), document.querySelector('#pBody [data-act="ladder"]').scrollIntoView({ block: 'center' }), true)`); await sleep(150);
  let pl = await C.ev(PLAD);
  const docX = await C.ev(`document.documentElement.scrollWidth - innerWidth`);
  ok(`parent view: the ladder switch on screen once scrolled to (${pl.map((q) => q.bw + 'x' + q.bh).join(', ')}), no sideways overflow`, pl.length === 2 && pl.every((q) => q.l >= 0 && q.t >= 0 && q.r <= w && q.b <= h && q.bw >= 44 && q.bh >= 44) && docX <= 0, { pl, docX });
  if (shots) await C.shot(`parent-${size}`);
  await C.tap(pl[0].x, pl[0].y);
  pl = await C.ev(PLAD);
  ok('parent view: a tap on Start from the beginning switches the ladder', pl[0].on && (await C.ev(`window.__rb.profiles()[0].ladder`)) === 'start', pl.map((q) => q.on));
  return out;
}

async function main() {
  await serve();
  const all = [], unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now(); let timer = null;
    try {
      const work = (async () => {
        if (run === 'names') return runNames();
        const C = await connect(S);
        const res = run === 'fresh' ? await runFresh(C) : run === 'current' ? await runCurrent(C) : run === 'pre49' ? await runPre49(C) : run === 'backups' ? await runBackups(C)
          : run === 'ladder' ? await runLadder(C) : run === 'real' ? await runReal(C) : /^\d+x\d+$/.test(run) ? await runSize(C, run) : (() => { throw new Error('no such run'); })();
        res.push({ name: run + ': no page errors', pass: C.errs.length === 0, got: C.errs.length ? C.errs.slice(0, 10) : undefined });
        return res;
      })();
      const res = await Promise.race([work, new Promise((_, j) => { timer = setTimeout(() => j(new Error(`over ${RUN_TIMEOUT_MS / 60000} min: killed`)), RUN_TIMEOUT_MS); })]);
      all.push(...res);
      const bad = res.filter((r) => !r.pass);
      if (!json) {
        console.log(`${run}: ${res.length - bad.length}/${res.length} pass  (${((Date.now() - t0) / 1000).toFixed(1)} s)${bad.length ? '  FAIL' : ''}`);
        for (const r of bad) console.log('  FAIL ' + r.name + '\n       ' + JSON.stringify(r.got)?.slice(0, 1200));
      }
    } catch (e) {
      unfinished.push(run + ': ' + (e?.message || e));
      if (!json) console.log(`${run}: did not finish: ${e?.message || e}`);
    } finally { clearTimeout(timer); await kill(S); }
  }
  const failed = all.filter((r) => !r.pass);
  if (json) console.log(JSON.stringify({ page, runs, checks: all, failed: failed.length, unfinished }, null, 1));
  else console.log(`${path.relative(repo, page) || page}\n${all.length - failed.length}/${all.length} checks pass${unfinished.length ? `, ${unfinished.length} run(s) did not finish` : ''}: ${failed.length || unfinished.length ? 'FAIL' : 'PASS'}`);
  return unfinished.length ? 2 : failed.length ? 1 : 0;
}

let code = 2;
try { code = await main(); }
catch (e) { console.error('check failed: ' + (e?.stack || e?.message || e)); }
finally { await kill(shared); closeServer(); }
process.exit(code);
