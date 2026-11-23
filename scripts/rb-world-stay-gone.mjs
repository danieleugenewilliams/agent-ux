#!/usr/bin/env node
// Robot Battle endless world: beaten robots and smashed props stay gone (#198, Daniel's A). A world robot fixed or taken
// apart (its whole group, once any of it is) and a prop smashed in the world go in a saved child's record (world.gone,
// world.broken), so neither is there again after a reload, and backups carry both lists. A robot fixed into a saved
// squadbot can't be fixed into a second one after a reload.
//
// One headless Chrome (muted, not detached, killed with its profile deleted on every way out, as scripts/rb-world.mjs
// does). Made-up profiles only. Through window.__rb at 1280 x 800, never saving by hand before a reload (the game must):
//   * an old save: a record written by main's page (MAIN_SHA, before #198; a prop smashed and a robot taken apart in the
//     world there) loads unchanged in this build, with no world.gone or world.broken; that robot and prop are back once
//     (main saved nothing of them: expected, and the check that the reload checks below can see one come back);
//   * a reload: a prop smashed (in a desert or junkyard chunk, where a prop takes random numbers as it's built) isn't
//     there, and every other prop in its chunk stands where it stood; a robot taken apart doesn't come out again, not
//     after a walk away and back either; the record gained only world.broken and world.gone;
//   * a robot fixed into the squad and the page reloaded straight away: one squadbot of it in the save, and the robot
//     doesn't come out again;
//   * Guest: a prop smashed and a robot taken apart write nothing, and are back after a reload;
//   * backups: this build's backup carries both lists; onto an empty device it brings them (the prop stays gone in the
//     world); device and backup lists are joined by Keep the best and Use the backup, and Keep this device keeps its
//     own; main's backup (no lists) restores onto a device with the lists without losing them under every choice.
//
// Usage:
//   node scripts/rb-world-stay-gone.mjs                       # ./robot-battle.html
//   node scripts/rb-world-stay-gone.mjs path/or/url.html --json
//   node scripts/rb-world-stay-gone.mjs --main path.html      # main's page (default: git show MAIN_SHA:robot-battle.html)
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
const runs = ['stay-gone'];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
target ||= path.join(repo, 'robot-battle.html');
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(path.resolve(target)).href;
// main before #198 (worlds robots beaten and props smashed come back after a reload there)
const MAIN_SHA = '519774a';
let mainTmp = null;
function mainUrl() {
  if (mainPage) return pathToFileURL(mainPage).href;
  mainTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-stay-gone-main-'));
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-stay-gone-'));
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
  const st = (id) => R.state().robots.find((q) => q.id === id);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const enter = (id) => { R.player(id); R.world(true); const s = R.start(0); R.manual(true); return s.ok; };
  // the world props standing in chunk ck: [{ wkey, x, z }] by key
  const propsIn = (ck) => R.Props.list.filter((p) => p.wkey && p.wkey.split(':')[0] === ck).map((p) => ({ wkey: p.wkey, x: r3(p.x), z: r3(p.z) })).sort((a, b) => (a.wkey < b.wkey ? -1 : 1));
  // a prop that takes random numbers as it's built (a desert cactus, a junkyard junk pile), with more props after it in its
  // chunk; walking out east until one is loaded
  const findProp = () => {
    for (let k = 0; k < 30; k++) {
      const c = R.Props.list.filter((p) => p.wkey && !p.broken && ((p.kind === 'tree' && W.place(p.x, p.z) === 'desert') || (p.kind === 'rock' && W.place(p.x, p.z) === 'junkyard' && p.col === '#8a5a3a' && p.s > 1.5)))
        .filter((p) => { const [ck, n] = p.wkey.split(':'); return R.Props.list.some((q) => q.wkey && q.wkey.split(':')[0] === ck && +q.wkey.split(':')[1] > +n); })
        .sort((a, b) => +a.wkey.split(':')[1] - +b.wkey.split(':')[1])[0];
      if (c) return c;
      const p = G.humans[0].mech.pos; R.worldGo(p.x + 150, p.z + 41 * (k % 3));
    }
    return null;
  };
  const smash = (p) => R.Props.hit(p, 1e9, 'gun', 1, 0);
  // the nearest glitched world robot that can join the squad (not a drone, a clone or a boss), walking out until one is loaded
  const findFoe = (skip = []) => {
    for (let k = 0; k < 40; k++) {
      const p = G.humans[0].mech.pos, r = G.robots.filter((q) => q.wkey && q.state === 'glitched' && q.type !== 'drone' && !R.ROBOT_TYPES[q.type].noSquad && !R.ROBOT_TYPES[q.type].boss && !skip.includes(q.wkey))
        .sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z))[0];
      if (r) return r;
      R.worldGo(p.x + 200, p.z + 37 * (k % 3));
    }
    return null;
  };
  // beaten and taken apart: { wkey, home }
  const takeApart = (skip = []) => { const r = findFoe(skip); if (!r) return null; R.damage(r.id, 1e6, 'gun'); R.teleport(0, r.pos.x + 2.5, r.pos.z); const s = st(r.id);
    const c = R.choose(r.id, 'parts', undefined, s?.parts?.length ? [s.parts[0]] : []); return { ok: c.ok, wkey: r.wkey, home: { ...r.home }, gone: !G.robots.includes(r) }; };
  // a Quick Fix done through the hooks (as scripts/rb-world-squad-saved.mjs does)
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
  // the chunk of a robot's home loaded, with player 1 well away from where it would come out; is its robot out?
  const robotBack = (wkey, home) => { R.worldGo(home.x + 110, home.z); R.worldGo(home.x + 110, home.z);
    return { loaded: W.chunks.has(wkey.split(':')[0]), live: W.live.has(wkey), out: G.robots.filter((q) => q.wkey === wkey && q.state === 'glitched').length }; };
  const empty = () => { R.Facts.rec = null; R.Facts.child = null; G.child = null; localStorage.clear(); R.Profiles.load(); };
`;

async function runSaved(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'stay-gone: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const mu = mainUrl();
  const J = JSON.stringify;

  // ---- an old save: made on main (before #198), a prop smashed and a robot taken apart there
  await C.open(1280, 800, false);
  await C.ev(CLEAR);
  await C.open(1280, 800, false, mu);
  let r = await C.ev(String.raw`(() => { ${H} const entered = enter('tester'); const p = findProp(); const pk = p?.wkey; if (p) smash(p); const t = takeApart(); R.Facts.save();
    return { entered, pk, t, rec: rec('tester'), snap: snap(), backup: JSON.parse(JSON.stringify(R.backup())) }; })()`);
  const M = r;
  ok(`main (${MAIN_SHA}): a prop smashed and a robot taken apart in the world, nothing of them saved`, r.entered && r.pk && r.t?.ok && r.t.gone && r.rec && !r.rec.world?.gone && !r.rec.world?.broken, r);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const raw = canon(snap()) === canon(${J(M.snap)}); R.player('tester'); const r1 = rec('tester'); const same = canon(r1) === canon(${J(M.rec)});
    enter('tester'); const ck = ${J(M.pk)}.split(':')[0], [cx, cz] = ck.split(',').map(Number);
    R.worldGo(cx * 96 + 48, cz * 96 + 48); const prop = R.Props.list.some((q) => q.wkey === ${J(M.pk)});
    const robot = robotBack(${J(M.t.wkey)}, ${J(M.t.home)}); const r2 = rec('tester');
    return { raw, same, prop, robot, world: r2?.world ?? null, unchanged: canon(r2) === canon(r1) }; })()`);
  ok('main\'s save opens in this build untouched, and the child loads it unchanged (no world.gone, no world.broken)', r.raw && r.same && !r.world?.gone && !r.world?.broken && r.unchanged, r);
  ok('(main saved nothing of them, so the prop and the robot are back once: expected, and the reload checks can see one back)', r.prop && r.robot.loaded && (r.robot.live || r.robot.out > 0), r);

  // ---- this build: a prop smashed and a robot taken apart; reload with no save by hand
  await C.ev(CLEAR);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const entered = enter('tester'); R.Facts.save(); const r0 = rec('tester');
    const p = findProp(); if (!p) return { entered, none: 'no prop' }; const pk = p.wkey, ck = pk.split(':')[0], before = propsIn(ck), px = p.x, pz = p.z;
    const hit = smash(p); const t = takeApart(); const r1 = rec('tester');
    return { entered, pk, ck, before, at: { x: px, z: pz }, hit, t, world: r1?.world ?? null, rest: canon(without(r1, 'world', 'garage', 'facts', 'last', 'fixMs', 'cheered', 'hints', 'practice', 'puzzles')) === canon(without(r0, 'world', 'garage', 'facts', 'last', 'fixMs', 'cheered', 'hints', 'practice', 'puzzles')), status: { goneSaved: W.status().goneSaved, brokenSaved: W.status().brokenSaved } }; })()`);
  const A = r;
  ok('a desert/junkyard prop smashed and a robot taken apart: world.broken = [the prop], world.gone = [the robot], saved by the game', !r.none && r.hit && r.t?.ok && r.t.gone && J(r.world?.broken) === J([r.pk]) && J(r.world?.gone) === J([r.t.wkey]) && r.rest, r);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const entered = enter('tester'); const pk = ${J(A.pk)}, ck = ${J(A.ck)};
    R.worldGo(${A.at.x} + 3, ${A.at.z}); const a = { loaded: W.chunks.has(ck), there: R.Props.list.some((q) => q.wkey === pk), props: propsIn(ck) };
    R.worldGo(${A.at.x} + 3000, ${A.at.z}); const away = W.chunks.has(ck); R.worldGo(${A.at.x} + 3, ${A.at.z}); const b = { loaded: W.chunks.has(ck), there: R.Props.list.some((q) => q.wkey === pk), props: propsIn(ck) };
    const robot = robotBack(${J(A.t.wkey)}, ${J(A.t.home)}); R.worldGo(${A.t.home.x} + 3000, ${A.t.home.z}); const robot2 = robotBack(${J(A.t.wkey)}, ${J(A.t.home)});
    return { entered, a, away, b, robot, robot2, s: { goneSaved: W.status().goneSaved, brokenSaved: W.status().brokenSaved } }; })()`);
  const rest = J(A.before.filter((p) => p.wkey !== A.pk));
  ok('after a reload the smashed prop isn\'t there (its chunk loaded)', r.entered && r.a.loaded && !r.a.there, r.a);
  ok('... and every other prop in its chunk stands where it stood (same keys, same spots)', J(r.a.props) === rest, { before: A.before, after: r.a.props });
  ok('... still so after a walk away (its chunk unloaded) and back', !r.away && r.b.loaded && !r.b.there && J(r.b.props) === rest, { away: r.away, b: r.b });
  ok('after a reload the robot taken apart doesn\'t come out (its chunk loaded), nor after a walk away and back', r.robot.loaded && !r.robot.live && r.robot.out === 0 && r.robot2.loaded && !r.robot2.live && r.robot2.out === 0, r);
  ok('the record holds both: 1 robot beaten, 1 prop smashed', r.s.goneSaved === 1 && r.s.brokenSaved === 1, r.s);

  // ---- a robot fixed into the squad, the page reloaded straight away
  r = await C.ev(String.raw`(() => { ${H} const f = findFoe([${J(A.t.wkey)}]); if (!f) return { none: true }; R.damage(f.id, 1e6, 'gun'); R.teleport(0, f.pos.x + 2.5, f.pos.z);
    const c = R.choose(f.id, 'fix', 'Boltz'); const solved = c.ok && solve(f.id); return { ok: c.ok, solved, wkey: f.wkey, home: { ...f.home }, uid: f.uid ?? null }; })()`);
  const F = r;
  ok('a world robot fixed into the squad', !r.none && r.ok && r.solved && r.uid, r);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const entered = enter('tester'); const sv = R.squadSave(); const robot = robotBack(${J(F.wkey)}, ${J(F.home)});
    return { entered, squad: (sv?.squad || []).map((e) => e.id), robot, gone: rec('tester')?.world?.gone }; })()`);
  ok('reloaded straight after the fix: one squadbot of it saved, and the robot doesn\'t come out again to be fixed twice', r.entered && J(r.squad) === J([F.uid]) && r.robot.loaded && !r.robot.live && r.robot.out === 0 && r.gone?.includes(F.wkey), r);
  const NEW = await C.ev(String.raw`(() => { ${H} return { snap: snap(), backup: JSON.parse(JSON.stringify(R.backup())) }; })()`);
  const NW = NEW.backup.data['facts.tester']?.world;
  ok('this build\'s backup carries world.gone and world.broken in the record', J(NW?.broken) === J([A.pk]) && J(NW?.gone) === J([A.t.wkey, F.wkey]) && NEW.backup.format === 2, NW);

  // ---- Guest saves nothing
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('guest'); const k0 = snap(); enter('guest'); const p = findProp(); const pk = p?.wkey, at = p ? { x: p.x, z: p.z } : null; if (p) smash(p); const t = takeApart();
    return { pk, at, t, same: canon(snap()) === canon(k0), s: { goneSaved: W.status().goneSaved, brokenSaved: W.status().brokenSaved } }; })()`);
  const GS = r;
  ok('Guest smashes a prop and takes a robot apart: nothing written (storage the same), nothing saved', r.pk && r.t?.ok && r.same && r.s.goneSaved === 0 && r.s.brokenSaved === 0, r);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} enter('guest'); R.worldGo(${GS.at?.x ?? 0} + 3, ${GS.at?.z ?? 0}); return { prop: R.Props.list.some((q) => q.wkey === ${J(GS.pk)}), robot: robotBack(${J(GS.t?.wkey)}, ${J(GS.t?.home)}) }; })()`);
  ok('... and after a reload both are back for Guest', r.prop && r.robot.loaded && (r.robot.live || r.robot.out > 0), r);

  // ---- backups
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const MB = ${J(M.backup)}, NB = ${J(NEW.backup)}, NS = ${J(NEW.snap)}, out = {};
    // main's backup onto a device with the lists: kept under every choice
    out.keep = {};
    for (const ch of ['device', 'backup', 'best']) { put(NS); R.Profiles.load(); R.player('tester'); const b = R.restore(MB, ch); const w = rec('tester').world || {}; out.keep[ch] = { ok: b.ok, gone: w.gone, broken: w.broken }; }
    // this build's backup onto an empty device
    empty(); const c = R.restore(NB, 'best'); out.newEmpty = { ok: c.ok, why: c.why, gone: rec('tester')?.world?.gone, broken: rec('tester')?.world?.broken };
    // two lists each: the backup's other keys
    const NB2 = JSON.parse(JSON.stringify(NB)); NB2.data['facts.tester'].world = { ...NB2.data['facts.tester'].world, gone: ['9,-4:r'], broken: ['9,-4:3'] };
    out.join = {};
    for (const ch of ['device', 'backup', 'best']) { put(NS); R.Profiles.load(); R.player('tester'); const b = R.restore(NB2, ch); const w = rec('tester').world || {}; out.join[ch] = { ok: b.ok, gone: (w.gone || []).slice().sort(), broken: (w.broken || []).slice().sort() }; }
    // a hand-damaged list still restores, read as its string keys only
    const NB3 = JSON.parse(JSON.stringify(NB)); NB3.data['facts.tester'].world = { ...NB3.data['facts.tester'].world, broken: [${J(A.pk)}, 5, null, ${J(A.pk)}] };
    empty(); const d = R.restore(NB3, 'backup'); R.player('tester'); out.damaged = { ok: d.ok, why: d.why, n: W.status().brokenSaved };
    return out; })()`);
  const G2 = J([A.t.wkey, F.wkey]), B1 = J([A.pk]);
  ok('main\'s backup onto a device with the lists: both kept with Keep this device, Use the backup and Keep the best', Object.values(r.keep).every((q) => q.ok && J(q.gone) === G2 && J(q.broken) === B1), r.keep);
  ok('this build\'s backup onto an empty device brings both lists', r.newEmpty.ok && J(r.newEmpty.gone) === G2 && J(r.newEmpty.broken) === B1, r.newEmpty);
  const gj = J([A.t.wkey, F.wkey, '9,-4:r'].sort()), bj = J([A.pk, '9,-4:3'].sort());
  ok('two lists: Keep the best and Use the backup join them; Keep this device keeps its own', ['best', 'backup'].every((ch) => r.join[ch].ok && J(r.join[ch].gone) === gj && J(r.join[ch].broken) === bj) && r.join.device.ok && J(r.join.device.gone) === J([A.t.wkey, F.wkey].sort()) && J(r.join.device.broken) === B1, r.join);
  ok('a hand-damaged list still restores, read as its string keys only (1)', r.damaged.ok && r.damaged.n === 1, r.damaged);
  await C.ev(String.raw`(() => { ${H} empty(); R.restore(${J(NEW.backup)}, 'best'); return true; })()`);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} enter('tester'); R.worldGo(${A.at.x} + 3, ${A.at.z}); return { loaded: W.chunks.has(${J(A.ck)}), there: R.Props.list.some((q) => q.wkey === ${J(A.pk)}), robot: robotBack(${J(A.t.wkey)}, ${J(A.t.home)}) }; })()`);
  ok('restored onto an empty device: the prop and the robot stay gone in the world', r.loaded && !r.there && r.robot.loaded && !r.robot.live && r.robot.out === 0, r);
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
