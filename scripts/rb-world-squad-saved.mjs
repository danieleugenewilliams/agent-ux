#!/usr/bin/env node
// Robot Battle endless world: squadmates fixed in the world stay after a reload (#190, Daniel's option E). In the world a
// robot fixed into the squad is a squadbot at once (no recruit stage, no chevron) and saved straight away in the child's
// record, as an ordinary squad entry with wave 0. The waves keep their recruit stage.
//
// One headless Chrome (muted, not detached, killed with its profile deleted on every way out, as scripts/rb-world.mjs
// does). Made-up profiles only. Through window.__rb at 1280 x 800:
//   * the world: a robot fixed into the squad is saved at once (in the saved squad before any frame or pause, wave 0),
//     with saved / no recruit / no chevron; the name typed in the name panel is the one saved; no new storage key;
//   * a reload: the child picked, the squadmate is back beside the mech with the same id, name and type, still saved;
//   * a full squad: a 4th world fix sends the picked one home (squadGone 'home') and saves the newcomer;
//   * Guest: a world fix writes nothing;
//   * the waves: a fix is still a recruit (chevron, not saved) until a later wave clears; then it's saved;
//   * an old save: a record written by main's page (MAIN_SHA, before #190) with a waves squadbot in it opens untouched
//     in this build and the child loads it unchanged, the squadbot brought; main's world recruit was never saved;
//   * backups: format 2; this build's backup with a world squadbot restores onto an empty device here (the squadbot back
//     after a reload) and into main's page (the child loads with it); main's backup restores here unchanged.
//
// Usage:
//   node scripts/rb-world-squad-saved.mjs                       # ./robot-battle.html
//   node scripts/rb-world-squad-saved.mjs path/or/url.html --json
//   node scripts/rb-world-squad-saved.mjs --main path.html      # main's page (default: git show MAIN_SHA:robot-battle.html)
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
// main before #190 (#189's world parts saved; a robot fixed into the squad in the world is a recruit there, never saved)
const MAIN_SHA = 'c003886';
let mainTmp = null;
function mainUrl() {
  if (mainPage) return pathToFileURL(mainPage).href;
  mainTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-squad-saved-main-'));
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-squad-saved-'));
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
  const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v) ?? 'null');
  const st = (id) => R.state().robots.find((q) => q.id === id);
  const mate = (id) => R.state().squad.find((q) => q.id === id);
  // into the endless world (or the waves) as child id, frames off
  const enter = (id, world = true) => { R.player(id); R.world(world); const s = R.start(0); R.manual(true); return s.ok; };
  // a Quick Fix done through the hooks (as scripts/rb-world.mjs does): puzzles answered, plugs wired, burnt ones patched
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
  // the nearest glitched world robot that can join the squad (not a drone, a clone or a boss), walking further out until one is loaded
  const findFoe = (skip = []) => {
    for (let k = 0; k < 40; k++) {
      const p = G.humans[0].mech.pos, r = G.robots.filter((q) => q.wkey && q.state === 'glitched' && q.type !== 'drone' && !R.ROBOT_TYPES[q.type].noSquad && !R.ROBOT_TYPES[q.type].boss && !skip.includes(q.wkey))
        .sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z))[0];
      if (r) return r;
      R.worldGo(p.x + 200, p.z + 37 * (k % 3));
    }
    return null;
  };
  // beat robot r and open its Quick Fix (name: typed, or none so the name panel asks)
  const beat = (r, name) => { R.damage(r.id, 1e6, 'gun'); R.teleport(0, r.pos.x + 2.5, r.pos.z); return R.choose(r.id, 'fix', name); };
  // fix a world robot into the squad: { id, uid, solved, ui (the panel open after the fix) }
  const fixOne = (name, skip = []) => { const r = findFoe(skip); if (!r) return { none: true }; const c = beat(r, name); const solved = c.ok && solve(r.id); return { id: r.id, wkey: r.wkey, ok: c.ok, why: c.why, solved, uid: r.uid ?? null, ui: R.state().ui }; };
  const inSave = (uid) => (R.squadSave()?.squad || []).find((e) => e.id === uid) ?? null;
  // every robot of the wave that isn't in the squad: beaten and taken apart
  const clearWave = () => { for (let t = 0; t < 6; t++) { const left = G.robots.filter((q) => q.state !== 'ally' && !G.squad.includes(q)); if (!left.length) break;
    for (const q of left) { if (q.state !== 'down') R.damage(q.id, 1e6, 'gun'); if (!G.robots.includes(q)) continue; R.teleport(0, q.pos.x + 2.5, q.pos.z); const s = st(q.id); R.choose(q.id, 'parts', undefined, s?.parts?.length ? [s.parts[0]] : []); } R.step(2); }
    return R.Waves.check(); };
  const empty = () => { R.Facts.rec = null; R.Facts.child = null; G.child = null; localStorage.clear(); R.Profiles.load(); };
`;
// a waves squadbot as main's page saves one (an ordinary squad entry; made up)
const OLD_BOT = { id: 'old-bot-1', type: 'charger', name: 'Rusty', gold: false, glow: null, upg: { plating: 1, job: 0 }, health: 40, damage: { hull: 0, legs: 0, power: 0, wiring: 0 }, down: false, at: 1000, wave: 2 };

async function runSaved(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'squad: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const mu = mainUrl();
  await C.open(1280, 800, false);

  // ---- the world: fixed into the squad, saved at once
  await C.ev(CLEAR);
  await C.open(1280, 800, false);
  let r = await C.ev(String.raw`(() => { ${H} const entered = enter('tester'); const k0 = keys(); const f = fixOne(); if (f.none) return { entered, none: true };
    const r0 = G.robots.find((q) => q.id === f.id); f.uid = r0?.uid ?? null;
    const saved0 = inSave(f.uid);   // (no frame stepped, no pause: straight from the fix)
    R.step(1); R.render(); const m = mate(f.id);   // (a frame: the squad chips drawn)
    // the name panel: a name typed and ✔
    document.getElementById('nameIn').value = 'Bolt'; document.getElementById('nameOk').click();
    const saved1 = inSave(f.uid);
    R.step(3);
    return { entered, f, saved0, saved1, m: m && { saved: m.saved, recruit: m.recruit, recruitWave: m.recruitWave, chip: m.chip?.recruit, uid: m.uid }, k0, k1: keys(), squadN: rec('tester').squad.length, ui: R.state().ui, type: r0?.type }; })()`);
  const W1 = r;
  ok('in the world, a robot fixed into the squad (the name panel then open)', r.entered && !r.none && r.f.ok && r.f.solved && r.f.ui === 'name', r);
  ok('... is saved at once: in the saved squad straight from the fix, wave 0', !!r.saved0 && r.saved0.wave === 0 && r.squadN === 1, r);
  ok('... a squadbot: saved, not a recruit, no chevron on its chip, recruitWave 0', r.m && r.m.saved && !r.m.recruit && r.m.chip === false && r.m.recruitWave === 0, r.m);
  ok('... the name typed in the name panel is the one saved', r.saved1?.name === 'Bolt', r.saved1);
  ok('... no new storage key', JSON.stringify(r.k0) === JSON.stringify(r.k1), { k0: r.k0, k1: r.k1 });

  // ---- a reload: back beside the mech
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const p = R.player('tester'); const sq = R.state().squad; const m = sq.find((q) => q.uid === ${JSON.stringify(W1.f.uid)});
    const entered = enter('tester'); R.step(2); const m2 = R.state().squad.find((q) => q.uid === ${JSON.stringify(W1.f.uid)});
    return { p: p.ok, n: sq.length, m: m && { name: m.name, type: m.type, saved: m.saved, chip: m.chip?.recruit, dist: m.dist }, entered, inWorld: !!m2 && m2.saved, save: R.squadSave()?.squad?.length }; })()`);
  ok('after a reload the child is picked and the squadmate is back beside the mech: same id, name and type, still saved', r.p && r.n === 1 && r.m && r.m.name === 'Bolt' && r.m.type === W1.type && r.m.saved && r.m.dist != null && r.m.dist < 20, r);
  ok('... and it comes into the world with the mech, still saved', r.entered && r.inWorld && r.save === 1, r);

  // ---- a full squad: the 4th world fix sends one home and saves the newcomer
  r = await C.ev(String.raw`(() => { ${H} const out = { fixes: [] }; const skip = [];
    while (G.squad.length < 3) { const f = fixOne('Mate' + G.squad.length, skip); if (f.none || !f.solved) return { ...out, stuck: f }; skip.push(f.wkey); out.fixes.push(f.id); }
    const s3 = (R.squadSave()?.squad || []).map((e) => e.id);
    const foe = findFoe(skip); if (!foe) return { ...out, none: true };
    const c = beat(foe, 'Newbie'); const goer = G.squad[0], goUid = goer.uid; const h1 = R.sendHome(goer.id); const h2 = R.state().ui === 'home' ? R.sendHome(goer.id) : null;
    const solved = solve(foe.id); const sv = R.squadSave();
    return { ...out, s3: s3.length, ask: c.ask, h1: h1.ok, h2: h2?.ok ?? null, solved, ids: sv.squad.map((e) => e.id), names: sv.squad.map((e) => e.name), newUid: foe.uid, goUid, gone: sv.gone.find((g) => g.id === goUid)?.how ?? null, squadN: G.squad.length }; })()`);
  ok('a full squad (3 saved): a 4th world fix asks who goes home', r.s3 === 3 && r.ask === 'home', r);
  ok('... the one picked goes home for good (squadGone \'home\'), the newcomer saved in its place', r.solved && r.squadN === 3 && r.gone === 'home' && !r.ids.includes(r.goUid) && r.ids.includes(r.newUid) && r.ids.length === 3 && r.names.includes('Newbie'), r);

  // ---- Guest: nothing written
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('guest'); const k0 = snap(); enter('guest'); const f = fixOne('Gus'); R.step(3); return { f, same: canon(snap()) === canon(k0), save: R.squadSave(), m: mate(f.id) }; })()`);
  ok('Guest: a world fix joins the squad but writes nothing (storage the same, no saved squad)', r.f.solved && !!r.m && r.same && r.save === null, r);

  // ---- the waves: still a recruit until a later wave clears
  await C.ev(CLEAR);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const entered = enter('robo', false); if (G.wave === 0) R.nextWave(); R.step(2); const w = { ok: G.wave === 1 };
    const foe = G.robots.filter((q) => q.state === 'glitched' && q.type !== 'drone' && !R.ROBOT_TYPES[q.type].noSquad && !R.ROBOT_TYPES[q.type].boss)[0]; if (!foe) return { entered, w, none: true };
    const c = beat(foe, 'Wavey'); const solved = solve(foe.id); R.step(1); R.render(); const m = mate(foe.id), uid = foe.uid;
    const a = { saved: m?.saved, recruit: m?.recruit, chip: m?.chip?.recruit, inSave: !!inSave(uid) };
    const cl1 = clearWave(); const b = { cleared: cl1, wave: G.wave, saved: mate(foe.id)?.saved, inSave: !!inSave(uid) };
    const w2 = R.nextWave(); R.step(2); const cl2 = clearWave(); const z = { cleared: cl2, wave: G.wave, saved: mate(foe.id)?.saved, inSave: inSave(uid) };
    return { entered, w: w.ok, solved, c: c.ok, a, b, w2: w2.ok, z }; })()`);
  ok('the waves: a fix is still a recruit (chevron on its chip, not in the saved squad)', r.entered && r.w && r.solved && r.a.saved === false && r.a.recruit && r.a.chip === true && !r.a.inSave, r);
  ok('... the wave it was fixed in clears: still a recruit, not saved', r.b?.cleared && r.b.saved === false && !r.b.inSave, r.b);
  ok('... a later wave clears: it earns its place and is saved (wave 1)', r.w2 && r.z?.cleared && r.z.saved === true && r.z.inSave?.wave === 1, r.z);

  // ---- an old save: made on main (before #190), a waves squadbot in it and a world recruit fixed there
  await C.ev(CLEAR);
  await C.open(1280, 800, false, mu);
  r = await C.ev(String.raw`(() => { ${H} ${KIDS_SET}; R.Profiles.load(); R.player('tester'); R.Facts.save(); R.player('robo');
    const o = rec('tester'); o.squad = [${JSON.stringify(OLD_BOT)}]; localStorage.setItem('robotbattle.facts.tester', JSON.stringify(o)); R.player('tester'); const brought = R.state().squad.length; const entered = enter('tester'); const f = fixOne('Mainbot'); R.step(2); R.Facts.save();
    return { brought, entered, f, rec: rec('tester'), snap: snap(), backup: JSON.parse(JSON.stringify(R.backup())), saved: (R.squadSave()?.squad || []).map((e) => e.id) }; })()`);
  const M = r;
  ok(`main (${MAIN_SHA}): a record with a waves squadbot, and a world fix there that main doesn't save`, r.brought === 1 && r.f.solved && JSON.stringify(r.saved) === JSON.stringify([OLD_BOT.id]) && r.rec.squad.length === 1, r);
  await C.open(1280, 800, false);
  // (the record as main's page left it, its last write the one on pagehide)
  r = await C.ev(String.raw`(() => { ${H} const s0 = snap(), k0 = keys(), r0 = JSON.parse(s0['robotbattle.facts.tester']); R.player('tester'); const r1 = rec('tester');
    const sq = R.state().squad.map((q) => ({ uid: q.uid, saved: q.saved, name: q.name }));
    return { same: canon(r1) === canon(r0), bot: (r0.squad || []).map((e) => e.id), sq, keys: keys(), k0, r0: canon(r0).slice(0, 600), r1: canon(r1).slice(0, 600) }; })()`);
  ok('main\'s save opens in this build and the child loads it unchanged (no key added, the record as main wrote it)', r.same && JSON.stringify(r.bot) === JSON.stringify([OLD_BOT.id]) && JSON.stringify(r.k0) === JSON.stringify(r.keys), r);
  ok('... its waves squadbot brought beside the mech, saved (main\'s world recruit was never saved, so it isn\'t back: expected)', r.sq.length === 1 && r.sq[0].uid === OLD_BOT.id && r.sq[0].saved && r.sq[0].name === OLD_BOT.name, r.sq);

  // ---- backups
  // this build's backup with a world squadbot in it
  r = await C.ev(String.raw`(() => { ${H} enter('tester'); const f = fixOne('Worldy'); R.step(2); R.Facts.save(); return { f, uid: G.robots.find((q) => q.id === f.id)?.uid ?? null, backup: JSON.parse(JSON.stringify(R.backup())) }; })()`);
  const NB = r.backup, WUID = r.uid;
  const nbe = (NB.data['facts.tester']?.squad || []).find((e) => e.id === WUID);
  ok('this build\'s backup: format 2, the world squadbot in the record\'s squad as an ordinary entry with wave 0', NB.format === 2 && r.f.solved && nbe && nbe.wave === 0 && nbe.name === 'Worldy' && (NB.data['facts.tester'].squad || []).some((e) => e.id === OLD_BOT.id), { format: NB.format, squad: NB.data['facts.tester']?.squad });
  r = await C.ev(String.raw`(() => { ${H} const out = {};
    empty(); const a = R.restore(${JSON.stringify(NB)}, 'best'); out.newEmpty = { ok: a.ok, why: a.why, ids: (rec('tester')?.squad || []).map((e) => e.id) };
    empty(); const b = R.restore(${JSON.stringify(M.backup)}, 'best'); out.mainEmpty = { ok: b.ok, why: b.why, same: canon(rec('tester')) === canon(${JSON.stringify(M.backup)}.data['facts.tester']) };
    empty(); R.restore(${JSON.stringify(NB)}, 'best'); return out; })()`);
  ok('this build\'s backup onto an empty device: both squadbots restored (the world one too)', r.newEmpty.ok && r.newEmpty.ids.includes(WUID) && r.newEmpty.ids.includes(OLD_BOT.id), r.newEmpty);
  ok('main\'s backup onto an empty device here: the record exactly as backed up', r.mainEmpty.ok && r.mainEmpty.same, r.mainEmpty);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); return R.state().squad.map((q) => ({ uid: q.uid, saved: q.saved, name: q.name })); })()`);
  ok('... restored and reloaded: the world squadbot is back beside the mech', r.some((q) => q.uid === WUID && q.saved && q.name === 'Worldy'), r);
  // into main's page
  await C.ev(`localStorage.clear()`);
  await C.open(1280, 800, false, mu);
  r = await C.ev(String.raw`(() => { const R = window.__rb; localStorage.clear(); R.Profiles.load(); const x = R.restore(${JSON.stringify(NB)}, 'best'); const p = R.player('tester');
    return { ok: x.ok, why: x.why, player: p.ok, sq: R.state().squad.map((q) => ({ uid: q.uid, saved: q.saved })) }; })()`);
  ok(`this build's backup restores into main (${MAIN_SHA}) and the child loads with the world squadbot`, r.ok && r.player && r.sq.some((q) => q.uid === WUID && q.saved), r);
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
