#!/usr/bin/env node
// Robot Battle endless world check (#167, slice 3: boxing / battle rings). Q4 (e): "the boxing/battle rings out in the
// world (page 1)": an arena you step into for a fight that's tougher than a roaming robot, and winning it pays a lot of parts.
//
// Each run is its own headless Chrome (muted, not detached, killed with its profile deleted on every way out, as
// scripts/rb-world.mjs does). Made-up profiles only.
//   logic  - at 1280 x 800, through window.__rb:
//            * waves untouched: no ring, no champion in a waves run;
//            * ring chunks: none nearer the start than the boss level (World.ringAway), none in a cave or boss chunk, the same
//              after a reload;
//              each one's pay as many parts as its level gives, from the pool (never a boss's rare part);
//            * a ring where its chunk is: its floor flat, its posts, its champion (the Knight) waiting in the middle, far
//              tougher than any roaming robot of its level, no roaming robot of its own; it stays put while no one's in;
//            * stepping in starts the fight (ropes red, the champion awake); hitting it from outside does too; it can't
//              leave the ring;
//            * beating it pays its parts into the bag and the trophies (from the meadow) at once, the ropes go gold, the
//              beacon off; once only: never again, not after the chunk goes and comes back (no fresh champion then);
//            * #201: a fight left unfinished starts again with a fresh champion; a champion beaten and left behind stays
//              where it fell, down, its clock held while its ring is unloaded (away past its down time), and is there to
//              fix (its Quick Fix opens) or salvage when the player comes back; salvaged, the ring is empty after that;
//            * #218: a champion beaten that reboots at its ring (left there past its down time) and is then left glitched is
//              still there when its chunk loads again: the same champion, glitched, inside the ropes, the ring still won,
//              no fresh champion and no second payout;
//            * the storage keys the same; the record's one new field is world.rings, holding that ring's key (#200).
//   touch  - at 844 x 390 with touch: a world run, a ring's champion downed: at most 4 touch buttons, FIX opens its board.
//   saved  - #200, a ring pays once even after a reload. At 1280 x 800, through window.__rb, with main's page from before
//            #200 (MAIN_SHA, by git show) for the old saves:
//            * an old save: a record made on main with a ring won there (nothing of it saved) loads unchanged in this build
//              with no ring list; that ring pays once more here (main never saved it), and then the record's one new
//              field is world.rings = [its key], nothing else changed but the trophies, no new storage key;
//            * a page reload: that ring is won (ropes gold, beacon off, no champion), stepping in and waiting pays nothing,
//              not after a walk away and back either; another ring still has its champion waiting;
//            * Guest: a ring won writes nothing, and its champion is back after a reload;
//            * backups: main's backup restores onto an empty device unchanged, and onto a device with world.rings under
//              all three choices without losing the list; this build's backup brings world.rings onto an empty device (the
//              ring stays won there); two lists are joined by Keep the best and Use the backup, Keep this device keeps its
//              own; a hand-damaged list still restores; this build's backup restores into main's page and the child loads.
//
// Usage:
//   node scripts/rb-world-rings.mjs                    # ./robot-battle.html: logic, touch, then saved
//   node scripts/rb-world-rings.mjs --logic            # the logic run only (--saved: the saved run only)
//   node scripts/rb-world-rings.mjs --main path.html   # main's page for the saved run (default: git show MAIN_SHA:robot-battle.html)
//   node scripts/rb-world-rings.mjs path/or/url.html --json
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let target = null, json = false, only = null, mainPage = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--logic') only = 'logic';
  else if (args[i] === '--saved') only = 'saved';
  else if (args[i] === '--main') mainPage = path.resolve(args[++i]);
  else target = args[i];
}
const runs = only ? [only] : ['logic', 'touch', 'saved'];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
target ||= path.join(repo, 'robot-battle.html');
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(path.resolve(target)).href;
// main before #200 (the rings are in it, slice 3; a ring won there isn't saved)
const MAIN_SHA = 'a2f7742';
let mainTmp = null;
function mainUrl() {
  if (mainPage) return pathToFileURL(mainPage).href;
  mainTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-rings-main-'));
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-world-rings-'));
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
  const R = window.__rb, G = R.Game, W = R.World, WR = R.WORLD.rings;
  const st = (id) => R.state().robots.find((q) => q.id === id);
  const reload = () => { W.sweep(); for (const k of [...W.chunks.keys()]) W.unload(k); W.update(true); W.sweep(); };
  // the nearest rings (by their middle) that aren't won yet (#200: this run or saved; main's page has only the run's)
  const won = (k) => (W.ringIsWon ? W.ringIsWon(k) : W.ringsWon.has(k));
  const near = () => R.worldRings(2600).filter((g) => !won(g.cx + ',' + g.cz)).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  // stand 60 m short of ring g (on the way out from the start), its chunk loaded
  const goNear = (g) => { const d = Math.hypot(g.x, g.z); R.worldGo(g.x - g.x / d * 60, g.z - g.z / d * 60); reload(); return W.rings.get(g.cx + ',' + g.cz) || null; };
  const ringOf = (g) => W.status().rings.find((q) => q.key === g.cx + ',' + g.cz) || null;
  const keys = () => Object.keys(localStorage).sort();
  const rec = () => JSON.parse(localStorage.getItem('robotbattle.facts.tester') || 'null');
  const snap = () => Object.fromEntries(keys().filter((k) => k.startsWith('robotbattle.')).map((k) => [k, localStorage.getItem(k)]));
  const put = (s) => { localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); };
  const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v) ?? 'null');
  const without = (r, ...f) => { const o = JSON.parse(JSON.stringify(r)); for (const k of f) delete o[k]; return o; };
  // #194: the Copier flies in the first time a run reaches level 4, 6, 8...; these checks jump thousands of metres at a time,
  // so mark every level as come for (World.enter clears the list; main's page has none) and keep its clone out of the ring checks
  const noCopier = () => { for (let l = 1; l <= 200; l++) W.copied?.add(l); };
  const enter = (id) => { R.player(id); R.world(true); const s = R.start(0); noCopier(); R.manual(true); R.step(2); return s.ok; };
  // an empty device (nobody playing first: Backup.restore saves whoever is playing before it reads this device)
  const empty = () => { R.Facts.rec = null; R.Facts.child = null; G.child = null; localStorage.clear(); R.Profiles.load(); };
  // step into ring g and beat its champion: { s0, s } (the ring's state before and after)
  const win = (g) => { R.teleport(0, g.x - WR.half + 3, g.z); R.step(3); const s0 = ringOf(g); if (s0?.champ) R.damage(s0.champ.id, 1e6, 'gun'); R.step(3); return { s0, s: ringOf(g) }; };
  const champs = (g) => G.robots.filter((q) => q.ring === g.cx + ',' + g.cz && q.state !== 'ally').length;
  const trophies = () => { const r = rec(), t = r?.garage?.trophies || r?.trophies || {}; const o = {}; for (const [k, v] of Object.entries(t)) o[k] = { n: v.n, meadow: v.from?.meadow || 0 }; return o; };
  noCopier();
`;

async function runLogic(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'logic: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  if (!(await C.ev(`typeof window.__rb.worldRings === 'function'`))) { ok('__rb.worldRings exists', false, 'missing'); return out; }

  // ---- waves, untouched
  let r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.start(0); R.manual(true); R.step(30);
    return { wave: G.wave, world: G.world, rings: W.rings.size, champs: G.robots.filter((q) => q.ring || q.ringWait).length, robots: G.robots.length }; })()`);
  ok('waves: no ring and no champion in a waves run', r.wave === 1 && !r.world && r.rings === 0 && r.champs === 0 && r.robots > 0, r);

  // ---- ring chunks
  const R1 = await C.ev(`window.__rb.worldRings(3000)`);
  r = await C.ev(String.raw`(() => { ${H} const all = R.worldRings(3000), C = R.WORLD.chunk, P = WR.pay;
    const near0 = all.filter((g) => Math.hypot(g.x, g.z) <= W.ringAway() || g.level < R.WORLD.harder.boss.from), clash = all.filter((g) => W.cave(g.cx, g.cz) || W.bossAt(g.cx, g.cz));
    const outside = all.filter((g) => g.x - WR.half < g.cx * C || g.x + WR.half > (g.cx + 1) * C || g.z - WR.half < g.cz * C || g.z + WR.half > (g.cz + 1) * C);
    const badPay = all.filter((g) => g.pay.length !== Math.min(P.max, P.n + Math.floor((g.level - 1) / P.every)) || g.pay.some((p) => !P.pool.includes(p)));
    const rare = all.filter((g) => g.pay.some((p) => Object.values(R.ROBOT_TYPES).some((T) => T.rare === p)));
    const ls = all.map((g) => g.level);
    return { n: all.length, near0: near0.length, clash: clash.slice(0, 3), outside: outside.slice(0, 3), badPay: badPay.slice(0, 3), rare: rare.length, lmin: Math.min(...ls), lmax: Math.max(...ls),
      pays: [...new Set(all.map((g) => g.pay.length))].sort((a, b) => a - b), away: W.ringAway(), from: R.WORLD.harder.boss.from }; })()`);
  ok(`${r.n} ring chunks within 3 km, none within ${r.away} m of the start (none below the boss level, ${r.from}: its champion is a boss)`, r.n >= 8 && r.near0 === 0, r);
  ok('no ring in a cave or boss chunk, and each ring inside its own chunk', r.clash.length === 0 && r.outside.length === 0, r);
  ok(`each ring pays as many parts as its level gives (levels ${r.lmin}-${r.lmax}: ${r.pays.join(', ')} parts), from the pool, never a boss's rare part`, r.badPay.length === 0 && r.rare === 0 && r.pays.length >= 2 && r.pays[0] >= 6, r);

  // ---- a world run, by the nearest ring (a fresh page, as a run starts)
  await C.ev(`localStorage.clear()`); await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('tester'); R.world(true); R.start(0); noCopier(); R.manual(true); R.step(2); window.__k0 = keys(); window.__t0 = trophies();
    const g = near()[0], ring = goNear(g); window.__g = g; if (!ring) return { none: true, g };
    R.step(120);
    const s = ringOf(g), RW = R.WORLD.robots, lv = g.level;
    const roamMax = Math.max(...RW.types.map((t) => Math.round(R.ROBOT_TYPES[t].health * W.tough(lv))));
    const flat = [[0, 0], [WR.half, WR.half], [-WR.half, WR.half], [WR.half * 0.5, -WR.half], [WR.half + 0.8, WR.half + 0.8]].map(([dx, dz]) => Math.abs(W.h(g.x + dx, g.z + dz) - s.y));
    return { world: G.world, g, s, roamMax, want: Math.round(R.ROBOT_TYPES[WR.type].health * WR.tough * W.tough(lv)), flat: Math.max(...flat), roam: W.live.has(g.cx + ',' + g.cz + ':r'),
      knight: s.champ && s.champ.type === 'knight', moved: s.champ ? Math.hypot(s.champ.x - g.x, s.champ.z - g.z) : null, bossBar: document.querySelector('#bossBar').parentElement.classList.contains('boss-on') }; })()`);
  const g = r.g;
  ok(`a ring comes out where its chunk is (level ${g?.level}): waiting, its ropes idle, its beacon up`, !r.none && r.world && r.s && r.s.state === 'wait' && r.s.ropes === 'idle' && r.s.beacon, r);
  ok('its floor flat across the ropes (the ground lifted or cut to it)', !r.none && r.flat < 0.01, r);
  ok(`its champion the robot with the sword (the Knight), waiting in the middle, standing still with no one in (moved ${r.moved?.toFixed?.(2)} m)`, r.knight && r.s.champ.wait && r.s.champ.state === 'glitched' && r.moved < 0.01, r);
  ok(`the champion far tougher than any roaming robot of its level (${r.s?.champ?.max} vs at most ${r.roamMax})`, r.s?.champ?.max === r.want && r.want > 2 * r.roamMax, r);
  ok('no roaming robot of the ring chunk\'s own, and no boss bar while the champion waits', !r.roam && !r.bossBar, r);

  // ---- step in: the fight starts
  r = await C.ev(String.raw`(() => { ${H} const g = window.__g; R.teleport(0, g.x - WR.half + 3, g.z); R.step(3); const s = ringOf(g); return { s }; })()`);
  ok('stepping in through the ropes starts the fight: the ropes glow red, the champion awake', r.s.state === 'fight' && r.s.ropes === 'fight' && !r.s.champ.wait, r);
  // it can't leave: dragged out of the ring, it's held inside the ropes
  r = await C.ev(String.raw`(() => { ${H} const g = window.__g, s0 = ringOf(g), c = G.robots.find((q) => q.id === s0.champ.id); c.pos.x = g.x + 40; c.pos.z = g.z - 40; R.step(2);
    const s = ringOf(g); return { s, dx: Math.abs(s.champ.x - g.x), dz: Math.abs(s.champ.z - g.z), m: WR.half - c.spec.radius }; })()`);
  ok('the champion can\'t leave the ring (held inside the ropes)', r.dx <= r.m + 0.5 && r.dz <= r.m + 0.5, r);

  // ---- beaten: the payout, once
  r = await C.ev(String.raw`(() => { ${H} const g = window.__g, s0 = ringOf(g), bag0 = { ...G.bag }, t0 = trophies();
    R.damage(s0.champ.id, 1e6, 'gun'); R.step(3);
    const s = ringOf(g), bag1 = { ...G.bag }, t1 = trophies();
    const want = {}; for (const p of g.pay) want[p] = (want[p] || 0) + 1;
    const bagOk = Object.entries(want).every(([p, n]) => (bag1[p] || 0) - (bag0[p] || 0) === n), trOk = Object.entries(want).every(([p, n]) => (t1[p]?.n || 0) - (t0[p]?.n || 0) === n && (t1[p]?.meadow || 0) - (t0[p]?.meadow || 0) === n);
    const extra = Object.keys(bag1).filter((p) => !want[p] && (bag1[p] || 0) !== (bag0[p] || 0));
    // more time, then the chunk away and back: no second payout, no fresh champion (#201: the beaten one is still there, down)
    R.step(60); const bag2 = { ...G.bag };
    const p = G.humans[0].mech.pos, px = p.x, pz = p.z; R.worldGo(px + 3000, pz); W.sweep(); R.worldGo(px, pz); reload(); R.step(30);
    const s3 = ringOf(g), bag3 = { ...G.bag };
    const same = (a, b) => Object.keys({ ...a, ...b }).every((k) => (a[k] || 0) === (b[k] || 0));
    return { pay: g.pay, s, bagOk, trOk, extra, again: !same(bag1, bag2) || !same(bag1, bag3), s3, won: W.ringsWon.size, champs: G.robots.filter((q) => q.ring === g.cx + ',' + g.cz && q.state !== 'ally').length,
      k1: keys(), k0: window.__k0, recRing: Object.keys(rec() || {}).filter((k) => /^rings?([A-Z_]|$)|world/i.test(k)), rings: rec()?.world?.rings ?? null, key: g.cx + ',' + g.cz, saved: W.status().ringsSaved }; })()`);
  ok(`beaten: the ring pays its ${r.pay.length} parts into the bag at once (${r.pay.join(', ')})`, r.s.state === 'won' && r.s.paid === r.pay.length && r.bagOk && r.extra.length === 0, r);
  ok('... and into the trophies, as parts from the meadow', r.trOk, r);
  ok('... the ropes go gold and the beacon off', r.s.ropes === 'won' && !r.s.beacon, r.s);
  ok('once only: no second payout later or after the chunk goes and comes back, and no fresh champion then (#201: the one beaten is still there, down)', !r.again && r.s3 && r.s3.state === 'won' && r.s3.champ?.state === 'down' && r.s3.champ.id === r.s.champ?.id && r.champs === 1 && r.won === 1, r);
  ok('the save keys the same; the record\'s one new field is world.rings = [that ring\'s key] (#200)', JSON.stringify(r.k0) === JSON.stringify(r.k1) && JSON.stringify(r.recRing) === '["world"]' && JSON.stringify(r.rings) === JSON.stringify([r.key]) && r.saved === 1, r);

  // ---- hit from outside the ropes: the fight starts too
  r = await C.ev(String.raw`(() => { ${H} const g = near()[0], ring = goNear(g); if (!ring) return { none: true, g }; R.step(5); const s0 = ringOf(g);
    R.damage(s0.champ.id, 5, 'gun'); R.step(3); const s = ringOf(g), p = G.humans[0].mech.pos; return { s0: s0.state, s, inside: W.inRing(ring.g, p.x, p.z) }; })()`);
  ok('a champion hit from outside the ropes starts its fight too', !r.none && r.s0 === 'wait' && r.s.state === 'fight' && !r.inside, r);

  // ---- #201: a champion beaten and left behind is still there, down, when the player comes back (the same session)
  // (champsOf: ring g's champions in the robots, not fixed; beatIn: step into ring g and beat its champion)
  const C201 = String.raw`const champsOf = (g) => G.robots.filter((q) => q.ring === g.cx + ',' + g.cz && q.state !== 'ally').length;
    const beatIn = (g) => { R.teleport(0, g.x - WR.half + 3, g.z); R.step(3); const s0 = ringOf(g); if (s0?.champ) R.damage(s0.champ.id, 1e6, 'gun'); R.step(3); return { s0, s: ringOf(g) }; };`;
  // a fight left unfinished (the champion up) starts again from the start: a fresh champion, waiting
  r = await C.ev(String.raw`(() => { ${H} ${C201} const g = near()[0]; window.__g2 = g; const s0 = ringOf(g), p = G.humans[0].mech.pos, px = p.x, pz = p.z;
    R.worldGo(px + 3000, pz); W.sweep(); R.step(60); const gone = !G.robots.some((q) => q.id === s0.champ.id); R.worldGo(px, pz); reload(); R.step(5);
    const s = ringOf(g); return { s0, s, gone, champs: champsOf(g) }; })()`);
  ok('a fight left unfinished: its champion goes with its chunk and a fresh one waits when it comes back', r.s0.state === 'fight' && r.gone && r.s?.state === 'wait' && r.s.champ && r.s.champ.id !== r.s0.champ.id && r.s.champ.wait && r.champs === 1, r);
  // beaten, then left: away 50 s (past the Knight's 40 s down time), it stays down there, its clock held, and nothing pays again
  r = await C.ev(String.raw`(() => { ${H} ${C201} const g = window.__g2, w = beatIn(g), id = w.s?.champ?.id, c = G.robots.find((q) => q.id === id);
    const bag0 = { ...G.bag }, t0 = c?.downT, p = G.humans[0].mech.pos, px = p.x, pz = p.z;
    R.worldGo(px + 3000, pz); W.sweep(); R.step(60 * 50);
    const away = { loaded: W.rings.has(g.cx + ',' + g.cz), there: G.robots.includes(c), state: c?.state, downT: c?.downT };
    R.worldGo(px, pz); reload(); R.step(30); const s = ringOf(g), t1 = c?.downT;
    const same = Object.keys({ ...bag0, ...G.bag }).every((k) => (bag0[k] || 0) === (G.bag[k] || 0));
    return { w: w.s?.state, id, t0, away, s, t1, same, champs: champsOf(g), max: R.ROBOT_TYPES[WR.type].downTime }; })()`);
  ok(`beaten and left 50 s (its down time ${r.max} s): it stays where it fell, down, its clock held while its ring's away (${r.t0?.toFixed?.(2)} s left)`, r.w === 'won' && r.id != null && !r.away.loaded && r.away.there && r.away.state === 'down' && r.away.downT === r.t0 && r.max < 50, r);
  ok('... back at the ring: the same champion, still down, the ring still won, no fresh champion and no second payout; its clock runs again', r.s?.state === 'won' && r.s.champ?.id === r.id && r.s.champ.state === 'down' && r.champs === 1 && r.same && r.t1 < r.t0, r);
  // there to fix: its Quick Fix opens (backed out again: it stays down)
  r = await C.ev(String.raw`(() => { ${H} const g = window.__g2, id = ringOf(g)?.champ?.id, c = G.robots.find((q) => q.id === id); if (!c) return { none: true }; let ch = null;
    for (const o of [2.5, 5, 7]) { R.teleport(0, c.pos.x + o, c.pos.z); ch = R.choose(id, 'fix'); if (ch.ok) break; }
    const fixing = G.humans[0].repair?.r === c; R.leaveFix(); R.step(2); return { ok: ch?.ok, why: ch?.why, fixing, state: c.state }; })()`);
  ok('... there to fix: its Quick Fix opens', r.ok && r.fixing && r.state === 'down', r);
  // and to salvage: taken apart, it's gone, and after another walk away and back the ring is empty (still won)
  r = await C.ev(String.raw`(() => { ${H} ${C201} const g = window.__g2, id = ringOf(g)?.champ?.id, c = G.robots.find((q) => q.id === id); if (!c) return { none: true }; const s0 = st(id); let ch = null;
    for (const o of [2.5, 5, 7]) { R.teleport(0, c.pos.x + o, c.pos.z); ch = R.choose(id, 'parts', undefined, s0?.parts?.length ? [s0.parts[0]] : []); if (ch.ok) break; }
    const took = !G.robots.includes(c), p = G.humans[0].mech.pos, px = p.x, pz = p.z;
    R.worldGo(px + 3000, pz); W.sweep(); R.step(60); R.worldGo(px, pz); reload(); R.step(30);
    const s = ringOf(g); return { ok: ch?.ok, why: ch?.why, took, s, champs: champsOf(g) }; })()`);
  ok('... or to salvage: taken apart it\'s gone, and the ring empty after a walk away and back (still won)', r.ok && r.took && r.s?.state === 'won' && !r.s.champ && r.champs === 0, r);

  // ---- #218: a champion beaten that reboots at its ring and is left glitched is still there when its chunk loads again
  r = await C.ev(String.raw`(() => { ${H} ${C201} const g = near()[0], ring = goNear(g); if (!ring) return { none: true, g }; R.step(5);
    const w = beatIn(g), id = w.s?.champ?.id, c = G.robots.find((q) => q.id === id), bag0 = { ...G.bag };
    // stand well back from the ropes while its down time runs out with the ring loaded (out of its sword's reach)
    const d = Math.hypot(g.x, g.z); R.teleport(0, g.x - g.x / d * 60, g.z - g.z / d * 60); R.step(60 * (R.ROBOT_TYPES[WR.type].downTime + 5));
    const up = { state: c?.state, there: G.robots.includes(c), ring: ringOf(g)?.state };
    const p = G.humans[0].mech.pos, px = p.x, pz = p.z; R.worldGo(px + 3000, pz); W.sweep(); R.step(60 * 5);
    const away = { loaded: W.rings.has(g.cx + ',' + g.cz), there: G.robots.includes(c) };
    R.worldGo(px, pz); reload(); R.step(30);
    const s = ringOf(g), m = WR.half - (c?.spec.radius ?? 0) - 0.3;
    const same = Object.keys({ ...bag0, ...G.bag }).every((k) => (bag0[k] || 0) === (G.bag[k] || 0));
    return { w: w.s?.state, id, up, away, s, same, champs: champsOf(g), inside: !!s?.champ && Math.abs(s.champ.x - g.x) <= m + 0.01 && Math.abs(s.champ.z - g.z) <= m + 0.01 }; })()`);
  ok('#218: a champion beaten that reboots at its ring (left there past its down time) is glitched again, the ring still won', !r.none && r.w === 'won' && r.id != null && r.up.there && r.up.state === 'glitched' && r.up.ring === 'won', r);
  ok('... left glitched, it is still there when its chunk loads again: the same champion, glitched, inside the ropes, the ring still won, no fresh champion and no second payout', r.away?.there && !r.away.loaded && r.s?.state === 'won' && r.s.champ?.id === r.id && r.s.champ.state === 'glitched' && r.inside && r.champs === 1 && r.same, r);

  // ---- the same ring chunks after a reload
  await C.open(1280, 800, false);
  const R2 = await C.ev(`window.__rb.worldRings(3000)`);
  ok(`the same ring chunks after a reload (${R2.length}), the same pay`, JSON.stringify(R1) === JSON.stringify(R2), { R1: R1.length, R2: R2.length });
  return out;
}

async function runTouch(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'touch: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.ev(`localStorage.clear()`).catch(() => {});
  await C.open(844, 390, true);
  await C.ev(`(() => { const R = window.__rb; R.player('tester'); R.world(true); R.start(0); R.manual(false); return true; })()`);
  let r = await C.ev(String.raw`(() => { ${H} R.manual(true); const g = near()[0], ring = goNear(g); if (!ring) return { none: true, g };
    R.teleport(0, g.x - WR.half + 3, g.z); R.step(3); const s = ringOf(g); R.damage(s.champ.id, 1e6, 'gun'); R.teleport(0, g.x + 5, g.z); R.manual(false); return { id: s.champ.id }; })()`);
  let fx = null;
  for (let t = 0; t < 20 && !fx && !r.none; t++) {
    await new Promise((res) => setTimeout(res, 300));
    fx = await C.ev(String.raw`(() => { const R = window.__rb, b = R.Game.robots.find((q) => q.id === ${r.id ?? -1}); if (b) R.teleport(0, b.pos.x + 5, b.pos.z); const el = [...document.querySelectorAll('.tp-btn[data-tp="fix"]')].find((e) => !e.classList.contains('tp-off') && e.getClientRects().length); if (!el) return null; const q = el.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
  }
  const n0 = await C.ev(`[...document.querySelectorAll('.tp-btn:not(.tp-off):not(.tp-pause)')].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none').length`);
  if (!r.none) r.state = await C.ev(`(window.__rb.World.status().rings.find((q) => q.champ?.id === ${r.id ?? -1} || q.state === 'won') || {}).state`);
  if (fx) await C.tap(fx.x, fx.y);
  await new Promise((res) => setTimeout(res, 300));
  const ui = await C.ev(`(() => { const R = window.__rb, s = R.state(); return { repair: s.repair ?? s.players?.[0]?.repair ?? null, fix: document.querySelector('#fix')?.classList.contains('on') ?? null, fixMode: R.FixUI?.mode ?? null }; })()`);
  ok(`a ring's champion downed in reach (the ring ${r.state}): at most 4 touch buttons (${n0}), FIX shows and a tap opens its board`, !r.none && r.state === 'won' && n0 <= 4 && !!fx && (ui.fix || !!ui.repair || !!ui.fixMode), { r, n0, fx, ui });
  const doc = await C.ev(`document.documentElement.scrollWidth - innerWidth`);
  ok('no sideways scroll', doc <= 0, doc);
  return out;
}

// #200: a ring pays once, even after a reload; old saves and backups
async function runSaved(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'saved: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const mu = mainUrl();
  await C.open(1280, 800, false);
  if (!(await C.ev(`typeof window.__rb.World?.winRing === 'function'`))) { ok('World.winRing exists', false, 'missing'); return out; }

  // ---- an old save: made on main (before #200), with a ring won there
  await C.ev(CLEAR);
  await C.open(1280, 800, false, mu);
  let r = await C.ev(String.raw`(() => { ${H} const entered = enter('tester'); const g = near()[0], ring = goNear(g); if (!ring) return { none: true, g };
    R.step(5); const w = win(g); R.Facts.save();
    return { entered, g, w, rec: rec('tester'), snap: snap(), backup: JSON.parse(JSON.stringify(R.backup())), hasWin: typeof W.winRing === 'function' }; })()`);
  const M = r, g = r.g, K = g ? g.cx + ',' + g.cz : null;
  ok(`main (${MAIN_SHA}): a ring won there (level ${g?.level}), and nothing of it saved (no ring list in the record)`, !r.none && r.entered && r.w.s0?.state === 'fight' && r.w.s?.state === 'won' && !r.hasWin && r.rec && !Array.isArray(r.rec.world?.rings), r);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const raw0 = snap(); R.player('tester'); const r1 = rec('tester'), keys0 = keys();
    const same = canon(r1) === canon(${JSON.stringify(M.rec)});
    enter('tester'); const g = ${JSON.stringify(g)}; goNear(g); R.step(5); const s0 = ringOf(g), t0 = trophies(); const w = win(g); const t1 = trophies(), r2 = rec('tester');
    const want = {}; for (const p of g.pay) want[p] = (want[p] || 0) + 1;
    return { raw: canon(raw0) === canon(${JSON.stringify(M.snap)}), same, noRings: !Array.isArray(r1.world?.rings), s0, w, paid: Object.entries(want).every(([p, n]) => (t1[p]?.n || 0) - (t0[p]?.n || 0) === n),
      rings: r2.world?.rings ?? null, worldKeys: Object.keys(r2.world || {}), rest: canon(without(r2, 'world', 'garage')) === canon(without(r1, 'world', 'garage')),
      takenSame: canon(r2.world?.taken ?? null) === canon(r1.world?.taken ?? null), keys0, keys1: keys(), saved: W.status().ringsSaved }; })()`);
  ok('main\'s save opens in this build untouched, and the child loads it unchanged with no ring list', r.raw && r.same && r.noRings, r);
  ok('(main saved nothing of the ring, so here it has its champion waiting and pays once more: expected)', r.s0?.state === 'wait' && !!r.s0.champ && r.w.s?.state === 'won' && r.paid, { s0: r.s0, s: r.w.s, paid: r.paid });
  ok('won here: the record\'s one new field is world.rings = [its key]; only the trophies changed besides', JSON.stringify(r.rings) === JSON.stringify([K]) && r.rest && r.takenSame && r.saved === 1, r);
  ok('no new storage key', JSON.stringify(r.keys1) === JSON.stringify(r.keys0), { keys0: r.keys0, keys1: r.keys1 });

  // ---- a page reload
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const entered = enter('tester'); const g = ${JSON.stringify(g)}; goNear(g); R.step(10);
    const s = ringOf(g), st0 = W.status(), bag0 = { ...G.bag }, t0 = trophies();
    R.teleport(0, g.x, g.z); R.step(60); const sIn = ringOf(g);
    const p = G.humans[0].mech.pos, px = p.x, pz = p.z; R.worldGo(px + 3000, pz); W.sweep(); R.worldGo(px, pz); reload(); R.step(30);
    const s2 = ringOf(g), t1 = trophies(), bag1 = { ...G.bag };
    const same = (a, b) => Object.keys({ ...a, ...b }).every((k) => (a[k]?.n ?? a[k] ?? 0) === (b[k]?.n ?? b[k] ?? 0));
    const o = near()[0], ring2 = goNear(o); R.step(5); const s3 = o ? ringOf(o) : null;
    return { entered, s, sIn, s2, ringsWon: st0.ringsWon, ringsSaved: st0.ringsSaved, paid: !same(t0, t1) || !same(bag0, bag1), champs: champs(g), other: o && { key: o.cx + ',' + o.cz, s3 } }; })()`);
  ok('after a page reload the ring is won: ropes gold, beacon off, no champion (0 won this run, 1 saved)', r.entered && r.s?.state === 'won' && r.s.ropes === 'won' && !r.s.beacon && !r.s.champ && r.ringsWon === 0 && r.ringsSaved === 1, r);
  ok('... stepping in and waiting pays nothing, nor after a walk away and back, and no champion comes', r.sIn?.state === 'won' && r.s2?.state === 'won' && !r.s2.champ && !r.paid && r.champs === 0, r);
  ok('... another ring still has its champion waiting', r.other && r.other.key !== K && r.other.s3?.state === 'wait' && !!r.other.s3.champ, r.other);
  const NEW = await C.ev(String.raw`(() => { ${H} R.Facts.save(); return { snap: snap(), backup: JSON.parse(JSON.stringify(R.backup())) }; })()`);
  ok('this build\'s backup carries world.rings in the record (format 2)', JSON.stringify(NEW.backup.data['facts.tester']?.world?.rings) === JSON.stringify([K]) && NEW.backup.format === 2, NEW.backup.data['facts.tester']?.world);

  // ---- Guest saves nothing
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('guest'); const k0 = snap(); enter('guest'); const g = ${JSON.stringify(g)}; goNear(g); R.step(5); const s0 = ringOf(g), w = win(g);
    return { s0, s: w.s, same: canon(snap()) === canon(k0), saved: W.status().ringsSaved }; })()`);
  ok('Guest: the ring (won by another child) waits with its champion; Guest wins it and nothing is written or saved', r.s0?.state === 'wait' && !!r.s0.champ && r.s?.state === 'won' && r.same && r.saved === 0, r);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('guest'); enter('guest'); const g = ${JSON.stringify(g)}; goNear(g); R.step(5); return ringOf(g); })()`);
  ok('... and after a reload its champion is back for Guest', r?.state === 'wait' && !!r.champ, r);

  // ---- backups
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const MB = ${JSON.stringify(M.backup)}, NB = ${JSON.stringify(NEW.backup)}, NS = ${JSON.stringify(NEW.snap)}, K = ${JSON.stringify(K)}, out = {};
    empty(); const a = R.restore(MB, 'best'); out.empty = { ok: a.ok, why: a.why, same: canon(rec('tester')) === canon(MB.data['facts.tester']), rings: rec('tester')?.world?.rings ?? null };
    out.keep = {};
    for (const ch of ['device', 'backup', 'best']) { put(NS); R.Profiles.load(); R.player('tester'); const b = R.restore(MB, ch); out.keep[ch] = { ok: b.ok, rings: rec('tester').world?.rings }; }
    empty(); const c = R.restore(NB, 'best'); out.newEmpty = { ok: c.ok, why: c.why, rings: rec('tester')?.world?.rings };
    const NB2 = JSON.parse(JSON.stringify(NB)); NB2.data['facts.tester'].world = { ...NB2.data['facts.tester'].world, rings: ['9,-9'] };
    out.join = {};
    for (const ch of ['device', 'backup', 'best']) { put(NS); R.Profiles.load(); R.player('tester'); const b = R.restore(NB2, ch); out.join[ch] = { ok: b.ok, rings: (rec('tester').world?.rings || []).slice().sort() }; }
    const NB3 = JSON.parse(JSON.stringify(NB)); NB3.data['facts.tester'].world = { ...NB3.data['facts.tester'].world, rings: [K, 5, null, K] };
    empty(); const d = R.restore(NB3, 'backup'); R.player('tester'); out.damaged = { ok: d.ok, why: d.why, saved: W.status().ringsSaved };
    return out; })()`);
  ok('main\'s backup onto an empty device: restored, the record exactly as backed up (no ring list added)', r.empty.ok && r.empty.same && r.empty.rings === null, r.empty);
  ok('main\'s backup onto a device with world.rings: the list kept with Keep this device, Use the backup and Keep the best', Object.values(r.keep).every((q) => q.ok && JSON.stringify(q.rings) === JSON.stringify([K])), r.keep);
  ok('this build\'s backup onto an empty device brings world.rings', r.newEmpty.ok && JSON.stringify(r.newEmpty.rings) === JSON.stringify([K]), r.newEmpty);
  const both = JSON.stringify([K, '9,-9'].sort());
  ok('two lists: Keep the best and Use the backup join them; Keep this device keeps its own', r.join.best.ok && JSON.stringify(r.join.best.rings) === both && r.join.backup.ok && JSON.stringify(r.join.backup.rings) === both && r.join.device.ok && JSON.stringify(r.join.device.rings) === JSON.stringify([K]), r.join);
  ok('a hand-damaged list still restores, read as its string keys only (1)', r.damaged.ok && r.damaged.saved === 1, r.damaged);
  await C.ev(String.raw`(() => { ${H} empty(); R.restore(${JSON.stringify(NEW.backup)}, 'best'); return true; })()`);
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} enter('tester'); const g = ${JSON.stringify(g)}; goNear(g); R.step(5); return ringOf(g); })()`);
  ok('restored onto an empty device: the ring stays won in the world, no champion', r?.state === 'won' && !r.champ, r);

  // ---- this build's backup into main's page
  await C.ev(`localStorage.clear()`);
  await C.open(1280, 800, false, mu);
  r = await C.ev(String.raw`(() => { const R = window.__rb; localStorage.clear(); R.Profiles.load(); const x = R.restore(${JSON.stringify(NEW.backup)}, 'best'); const p = R.player('tester');
    return { ok: x.ok, why: x.why, player: p.ok, kept: JSON.parse(localStorage.getItem('robotbattle.facts.tester') || 'null')?.world?.rings ?? null }; })()`);
  ok(`this build's backup restores into main (${MAIN_SHA}) and the child loads (main ${r.kept ? 'keeps' : 'drops'} world.rings)`, r.ok && r.player, r);
  return out;
}

const BOX = String.raw`((sel) => {
  const W = innerWidth, H = innerHeight, bad = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
    if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) bad.push({ el: (el.id || el.className?.baseVal || el.className || el.tagName) + '', l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) });
  }
  return { W, H, bad, docX: document.documentElement.scrollWidth - W, docY: document.documentElement.scrollHeight - H };
})`;
const at = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null; })()`;


async function main() {
  const all = []; const unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now();
    try {
      const C = await connect(S);
      const res = run === 'logic' ? await runLogic(C) : run === 'touch' ? await runTouch(C) : await runSaved(C);
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
