#!/usr/bin/env node
// Robot Battle: Apollo's centipede boss (#141, #117 N6; Orion's and Apollo's Q1 A / Q2 A / Q3 A / Q4 A).
//
// The page is served over http by this script (the models only load over http, never on file://), from the repo. Each run is
// its own headless Chrome (muted, not detached, killed with its profile deleted on every way out); the server is closed on
// every way out too.
//   logic    - at 1280 x 800, through window.__rb (manual ticks, so nothing depends on the machine's speed):
//              * waves (Q1 A): in Easy, Normal and Hard the boss waves to 40 and each one's boss (Waves.bossOf): the Knight on 5,
//                15, 25, 35 and the Centipede on 10, 20, 30, 40; wave 10 and wave 20 spawned fresh bring the Centipede (and no
//                Knight), wave 15 the Knight; Easy's wave 5 is still the Knight alone; Hard's Centipede has 1.25 x Normal's
//                health; ?wave=10 (a real start) brings it;
//              * each move, measured on player 1's mech (its health before and after): LASER hits (14) at 16 m in front and
//                misses at 23 m in front and 6 m to the side, landing at 0.15 s; CRUNCH hits (20) up close in front and misses
//                out of its reach and behind it; DIG pops up under a standing mech (22), and misses one that moved away after
//                it went under and one in a jump as it pops; a wind-up shows the ❗ and the move follows it;
//              * its own brain (no hooks), 60 s of game time with player 1 standing 25 m off, then up close: it lasers, digs
//                and crunches and lands hits, and each dig comes up where player 1 stood as it went under;
//              * underground (Q2 A): no balls in its hit shape, a hook's damage, the cannon's rounds and the 🧲 do nothing to it
//                (health, hits and shock unchanged), nothing locks on to it; it's hittable again once it's up;
//              * the hit shape covers the segments: a round at its tail (behind its front, from the side) lands;
//              * the satellite (#123) links to it (a boss first): its laser hits 1.5 x (21) and its shield halves a round's
//                damage (against the same round unlinked);
//              * beaten (Q4 A): its board is the boss's (bossPlan: one more math wire and one more puzzle than wave 10's), the
//                fix done through the hooks gives the 🪚 saw (bag, wall) and the Centipede trophy (latched with ||=: a second
//                fix doesn't move it), and it doesn't join the squad; the trophy and the saw on the 🏆 wall survive a reload and
//                a backup restored with both choices; a save made by main (ec659a0: the Knight trophy, 2 swords, 3 armour) loads
//                here as it stands and its backup restores here, nothing lost; a backup from this build restores into main and
//                main's garage and bag open with no errors.
//   model    - over http with the models in: the Centipede's model loads (ready, its triangles), a Centipede wears it with
//              its 36 joints; at its stance every joint's turn (YZX) and place match the raw .glb's own nodes loaded fresh with
//              GLTFLoader (legs ∓40°, mandibles x 12°: the non-zero rests), every pose in MODEL_POSES.centipede lists all 36
//              nodes, a LASER shows two beams from its lenses, and a dig hides its body underground.
//   fallback - with models/ blocked (Network.setBlockedURLs): its model fails, wave 10 (?wave=10, a real start) brings a
//              code-built Centipede with the same 36 joints, it plays 8 s in real time with no errors, its brain picks all three
//              moves and lands hits over 40 s of manual ticks, and its laser still lands.
//   perf     - at 390 x 844 with touch: wave 10 here (the Centipede) against main's wave 10 (ec659a0: the Knight), and wave 5
//              here (the Knight), each a real start (?wave=N) played for 5 s after a 1.5 s warm-up (player 1 can't go down):
//              the median ms between frames, 3 runs each taken in turn (the median of the 3), and one render's draw calls and
//              triangles; passes if the Centipede's wave is within PERF_MARGIN of main's.
//   WxH      - the boss bar at that size, with the touch controller hidden (keys and mouse) and shown (touch mode): it shows for
//              the Centipede in its own style (segments), named, its fill tracking its health (100 -> 50 -> its state down),
//              on screen and clear of every other HUD box and the controller's rings; the Knight's (the sword) the same.
//
// Usage:
//   node scripts/rb-centipede.mjs                    # every run: logic, model, fallback, perf, then each size
//   node scripts/rb-centipede.mjs --run logic        # one run (repeatable): logic | model | fallback | perf | WxH
//   node scripts/rb-centipede.mjs --main path.html   # main's page for the "into main" and perf runs (default: git show ec659a0)
//   node scripts/rb-centipede.mjs --shots DIR        # also save screenshots (the model, the bar per size, the dig)
//   node scripts/rb-centipede.mjs path.html --json
// Sizes: 360x740, 390x844, 412x915, 568x320, 667x375, 740x360, 844x390, 768x1024 and 1280x800 (#118 / #119's). Each run is
// its own Chrome launch.
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const SIZES = ['360x740', '390x844', '412x915', '568x320', '667x375', '740x360', '844x390', '768x1024', '1280x800'];
const MAIN_SHA = 'ec659a0';
const PERF_MARGIN = 0.15;   // the Centipede's wave 10 may be at most 15% slower a frame than main's wave 10
const args = process.argv.slice(2);
let json = false, target = null, shots = null, mainPage = null; const picked = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--run') picked.push(args[++i]);
  else if (args[i] === '--shots') shots = path.resolve(args[++i]);
  else if (args[i] === '--main') mainPage = path.resolve(args[++i]);
  else if (args[i] === '-h' || args[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
  else target = args[i];
}
const runs = picked.length ? picked : ['logic', 'model', 'fallback', 'perf', ...SIZES];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = path.resolve(target ?? path.join(repo, 'robot-battle.html'));
if (shots) fs.mkdirSync(shots, { recursive: true });
const mainHtml = () => (mainPage ? fs.readFileSync(mainPage) : execFileSync('git', ['-C', repo, 'show', MAIN_SHA + ':robot-battle.html'], { maxBuffer: 64e6 }));

// ---- the server: the page at /robot-battle.html, main's at /main.html, everything else from the repo (models/ ...)
let server = null, base = null, mainBuf = null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png' };
async function serve() {
  server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = null, body = null;
    if (u === '/robot-battle.html') f = page;
    else if (u === '/main.html') body = mainBuf ??= mainHtml();
    else { f = path.join(repo, path.normalize(u).replace(/^(\.\.[/\\])+/, '')); if (!f.startsWith(repo)) f = null; }
    try { body ??= f && fs.readFileSync(f); } catch { body = null; }
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-centipede-'));
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
const HARD_TIMEOUT_MS = 40 * 60 * 1000;
setTimeout(() => { console.error(`hard timeout: over ${HARD_TIMEOUT_MS / 60000} min; closing Chrome`); kill(shared).finally(() => { closeServer(); process.exit(124); }); }, HARD_TIMEOUT_MS).unref();

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
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('Network.enable');
  const C = { send, ev, errs, blocked: false };
  C.open = async (w, h, touch, q = '', file = 'robot-battle.html') => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!touch, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: !!touch, maxTouchPoints: touch ? 5 : 0 });
    await send('Page.navigate', { url: base + file + q });
    for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState === "complete" && !!window.__rb').catch(() => false)) return; }
    throw new Error('page did not load window.__rb: ' + file + q);
  };
  C.block = async (on) => { C.blocked = on; await send('Network.setBlockedURLs', { urls: on ? ['*/models/*'] : [] }); };
  C.shot = async (name) => { if (!shots) return; const sh = await send('Page.captureScreenshot', { format: 'png' }); if (sh.result?.data) fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(sh.result.data, 'base64')); };
  return C;
}

// ---- in the page: helpers. A clear stretch of meadow (no tree or rock within 34 m), an empty meadow, a frozen Centipede facing
// a point (its brain held in 'recover', so it neither walks nor starts a move unless a hook says), player 1's health, a fix
// done through the hooks (puzzles answered, math wires plugged or typed)
const H = String.raw`
  const R = window.__rb, G = R.Game, P0 = () => G.humans[0].mech;
  const foes = () => G.robots.filter((r) => r.state !== 'ally' && !G.squad.includes(r));
  const empty = () => {
    for (let p = 0; p < 6 && foes().length; p++) for (const r of foes()) {
      if (r.state !== 'down') R.damage(r.id, 1e6, 'gun');
      if (r.state === 'down') { R.teleport(0, r.pos.x + 2.5, r.pos.z); R.choose(r.id, 'parts', undefined, [r.parts[0]]); }
    }
    for (const c of [...R.Copier.list]) R.Copier.remove(c);
    return foes().length;
  };
  const clear = () => { for (let a = 0; a < 400; a++) { const x = Math.cos(a * 2.4) * (a % 60), z = Math.sin(a * 2.4) * (a % 60); if (R.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + 34)) return { x, z }; } return { x: 0, z: 0 }; };
  const freeze = (r) => { r.ai.mode = 'recover'; r.ai.t = 1e9; r.input.throttle = r.input.turn = 0; r.speed = 0; return r; };
  const cent = (x, z, face) => { const s = R.spawn('centipede', x, z), r = G.robots.find((q) => q.id === s.id); r.legHeading = r.torsoYaw = face ?? 0; freeze(r); return r; };
  const hp = () => P0().health;
  const heal = () => { const m = P0(); for (const a in m.damage) m.damage[a] = 0; m.health = m.maxHealth; m.push.set(0, 0, 0); m.hop = null; m.shield = 0; };
  const st = (r) => R.state().robots.find((q) => q.id === r.id);
  // (screenshots) player 1 d m to the +z side of (x, z), facing it, the camera behind; a frame drawn
  const look = (x, z, d) => { R.teleport(0, x + 3, z + d); const m = P0(); m.legHeading = m.torsoYaw = 0; R.aim(0, 0, 0.02); R.step(6); R.render(); };
  // the 🏆 wall as shown (a run started if none is, paused as the mouse let go does, the garage opened on the trophies)
  const wall = () => { R.manual(true); if (!G.pilot) R.start(0); document.dispatchEvent(new Event('pointerlockchange')); R.garage(true, 'trophies'); const d = R.Garage.dom(); R.garage(false); return d; };
  const stepUntil = (f, max = 600) => { for (let i = 0; i < max; i++) { if (f()) return i; R.step(1); } return -1; };
  // its own brain, unfrozen, on manual ticks: player 1 stands sec/2 s about 25 m off, then sec/2 s in front within CRUNCH's
  // reach; healed every second so it never goes down. Each dig that goes under: where it will come up and where player 1 stood
  const brain = (sec) => {
    empty(); const c0 = clear(), m = P0(); const s = R.spawn('centipede', c0.x, c0.z), c = G.robots.find((q) => q.id === s.id); R.teleport(0, c0.x + 6, c0.z - 25);
    const digs = [];
    for (let i = 0; i < sec * 60; i++) {
      if (i === sec * 30) { const d = c.spec.radius + R.MECH.radius + 1.5; R.teleport(0, c.pos.x - Math.sin(c.legHeading) * d, c.pos.z - Math.cos(c.legHeading) * d); }
      if (i % 60 === 0) heal();
      const was = !!c.under; R.step(1);
      if (!was && c.under) digs.push({ spot: { ...c.mv.spot }, stood: { x: m.pos.x, z: m.pos.z } });
    }
    const n = st(c).centipede; return { lasers: n.lasers, crunches: n.crunches, digs: n.digs, hits: n.hits, misses: n.misses, digSpots: digs.slice(0, 3), model: n.model, log: n.log.slice(-8).map((e) => e.what) };
  };
  const solve = (id) => {
    for (let pass = 0; pass < 12; pass++) {
      const s = R.state().robots.find((q) => q.id === id); if (!s) return true;
      for (const [k, q] of (s.board?.puzzles || []).entries()) if (!q.done) R.puzzle(id, k, q.answer);
      const t = R.state().robots.find((q) => q.id === id); if (!t) return true;
      const W = t.wires;
      for (let i = 0; i < W.plugs.length; i++) {
        if (W.link[i] >= 0) continue;
        if (W.burnt[i]) { R.patch(id, i); continue; }
        if (W.typed[i]) { R.type(id, i, W.facts[i].answer, 1500); continue; }
        const j = W.facts ? W.answers.findIndex((a, j) => a === W.facts[i].answer && !W.link.includes(j)) : W.ports.findIndex((p, j) => p.color === W.plugs[i].color && !W.link.includes(j));
        if (j >= 0) R.wire(id, [[i, j]], 1500);
      }
    }
    return !R.state().robots.find((q) => q.id === id);
  };
`;

async function runLogic(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  if (!(await C.ev(`!!window.__rb.CENTIPEDE && !!window.__rb.ROBOT_TYPES.centipede && typeof window.__rb.centipedeAttack === 'function'`))) {
    ok('the Centipede is in the game (__rb.CENTIPEDE, ROBOT_TYPES.centipede, __rb.centipedeAttack)', false, 'missing'); return out;
  }
  // ---- waves (Q1 A), every mode
  let r = await C.ev(String.raw`(() => { ${H} const o = {};
    for (const m of ['easy', 'normal', 'hard']) o[m] = { waves: R.bossWaves(40, m), of: R.bossWaves(40, m).map((n) => R.Waves.bossOf(n)) };
    return o; })()`);
  for (const m of ['easy', 'normal', 'hard']) ok(`${m}: boss waves 5..40 alternate, Knight on 5, 15, 25, 35 and Centipede on 10, 20, 30, 40`, r[m].waves.join() === '5,10,15,20,25,30,35,40' && r[m].of.join() === 'knight,centipede,knight,centipede,knight,centipede,knight,centipede', r[m]);
  const sp = {};
  for (const m of ['easy', 'normal', 'hard']) {
    await C.open(1280, 800, false);
    sp[m] = await C.ev(String.raw`(() => { ${H} R.manual(true); R.player('guest'); R.mode('${m}'); R.start(0); const w = {};
      for (const n of [5, 10, 15, 20]) { empty(); const f = R.Waves.spawn(n); w[n] = { cent: f.filter((q) => q.type === 'centipede').map((q) => q.maxHealth), knight: f.filter((q) => q.type === 'knight').length, n: f.length }; }
      return w; })()`);
    ok(`${m}: waves 10 and 20 bring one Centipede and no Knight; 5 and 15 the Knight and no Centipede`, [10, 20].every((n) => sp[m][n].cent.length === 1 && sp[m][n].knight === 0) && [5, 15].every((n) => sp[m][n].knight === 1 && sp[m][n].cent.length === 0), sp[m]);
  }
  ok(`Easy's wave 5 is still the Knight alone (${sp.easy[5].n} robot)`, sp.easy[5].n === 1 && sp.easy[5].knight === 1, sp.easy[5]);
  ok(`Hard's wave-10 Centipede has 1.25 x Normal's health (${sp.normal[10].cent[0]} -> ${sp.hard[10].cent[0]})`, Math.abs(sp.hard[10].cent[0] - sp.normal[10].cent[0] * 1.25) <= 1, { normal: sp.normal[10], hard: sp.hard[10] });
  await C.open(1280, 800, false, '?wave=10');
  r = await C.ev(String.raw`(() => { ${H} R.player('guest'); R.start(0); R.manual(true); return { wave: G.wave, types: foes().map((q) => q.type) }; })()`);
  ok('?wave=10 (a real start) brings wave 10 with the Centipede', r.wave === 10 && r.types.includes('centipede') && !r.types.includes('knight'), r);

  // ---- each move, measured
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.manual(true); R.player('guest'); R.start(0); empty(); const c0 = clear(), K = R.CENTIPEDE, out = {};
    const c = cent(c0.x, c0.z, 0), fwd = (d, side = 0) => R.teleport(0, c0.x + side, c0.z - d);   // (it faces -z)
    const laser = (d, side) => { heal(); fwd(d, side); const h0 = hp(); R.centipedeAttack(c.id, 'laser'); const before = []; for (let i = 0; i < 8; i++) { R.step(1); before.push(hp()); } R.step(4); R.render();
      const s = st(c).centipede, e = { d, side, dealt: h0 - hp(), early: h0 - before[before.length - 1], beams: s.beams, beamLen: s.beamLen }; stepUntil(() => !c.mv); freeze(c); return e; };
    out.laserIn = laser(16, 0); out.laserOut = laser(23, 0); out.laserSide = laser(10, 6);
    const crunch = (d, back) => { heal(); R.teleport(0, c0.x, back ? c0.z + d : c0.z - d); const h0 = hp(); R.centipedeAttack(c.id, 'crunch'); R.step(Math.ceil(K.crunch.at * 60) + 2); const e = { d, back, dealt: h0 - hp() }; stepUntil(() => !c.mv); freeze(c); return e; };
    const reach = c.spec.radius + R.MECH.radius + K.crunch.reach;
    out.reach = reach; out.crunchIn = crunch(reach - 1.5, false); out.crunchOut = crunch(reach + 1.5, false); out.crunchBack = crunch(reach - 1.5, true);
    // a wind-up: the ❗ while it lasts, then the move (its brain's own)
    heal(); fwd(16); const w = R.centipedeAttack(c.id, 'windup-laser'); const hot = st(c).hot, wind = st(c).centipede.w;
    stepUntil(() => c.mv, 200); const mv = c.mv?.w; stepUntil(() => !c.mv); out.windup = { hot, wind, then: mv, windT: K.laser.windup }; freeze(c);
    out.cn = st(c).centipede;
    return out; })()`);
  ok(`LASER hits a mech 16 m in front (${r.laserIn.dealt} = 14), at 0.15 s (nothing by 0.133 s), its beams out`, r.laserIn.dealt === 14 && r.laserIn.early === 0 && r.laserIn.beams && r.laserIn.beamLen > 5, r.laserIn);
  ok(`LASER misses a mech 23 m in front (its near edge past 18 m) (${r.laserOut.dealt})`, r.laserOut.dealt === 0, r.laserOut);
  ok(`LASER misses a mech 6 m to the side (${r.laserSide.dealt})`, r.laserSide.dealt === 0, r.laserSide);
  ok(`CRUNCH hits a mech up close in front (${r.crunchIn.dealt} = 20, reach ${r.reach.toFixed(1)} m centre to centre)`, r.crunchIn.dealt === 20, r.crunchIn);
  ok(`CRUNCH misses a mech out of its reach (${r.crunchOut.dealt}) and one behind it (${r.crunchBack.dealt})`, r.crunchOut.dealt === 0 && r.crunchBack.dealt === 0, { out: r.crunchOut, back: r.crunchBack });
  ok('a wind-up shows the ❗ (hot) and its move follows when it ends', r.windup.hot && r.windup.wind === 'laser' && r.windup.then === 'laser', r.windup);

  // ---- its own brain picks its moves (no hooks): 60 s of game time
  r = await C.ev(String.raw`(() => { ${H} R.manual(true); R.player('guest'); R.start(0); return brain(60); })()`);
  const tot = (o) => o.laser + o.crunch + o.dig;
  ok(`its brain, 60 s on its own: it lasers (${r.lasers}), digs (${r.digs}) and crunches (${r.crunches}), and lands hits (${tot(r.hits)})`, r.lasers > 0 && r.digs > 0 && r.crunches > 0 && tot(r.hits) > 0, r);
  ok('... and each dig it chose comes up where player 1 stood as it went under', r.digSpots.length > 0 && r.digSpots.every((d) => Math.hypot(d.spot.x - d.stood.x, d.spot.z - d.stood.z) < 0.01), r.digSpots);

  // ---- DIG: standing, moved away, jumped; and immunity underground
  r = await C.ev(String.raw`(() => { ${H} R.manual(true); R.player('guest'); R.start(0); empty(); const c0 = clear(), K = R.CENTIPEDE, out = {};
    const c = cent(c0.x, c0.z, 0);
    const dig = (how) => {
      heal(); c.pos.x = c0.x; c.pos.z = c0.z; c.legHeading = 0; R.teleport(0, c0.x, c0.z - 15); const h0 = hp();
      R.centipedeAttack(c.id, 'dig'); const tUnder = stepUntil(() => c.under, 120) / 60;
      const e = { how, tUnder, spot: { ...c.mv.spot } };
      if (how === 'immune') {
        const hp0 = c.health, hits0 = st(c).hits.gun || 0;
        e.balls = st(c).centipede.balls.length; e.hook = R.damage(c.id, 50, 'gun').health === hp0;
        // the cannon, aimed at it as it tunnels, a burst and a pulse; the lock-on
        const m = P0(); R.aim(0, Math.atan2(-(c.pos.x - m.pos.x), -(c.pos.z - m.pos.z)), -0.2); R.fire(0, 'gun'); R.step(12); R.fire(0, 'em'); R.step(12);
        e.after = { health: c.health, hp0, hits: (st(c).hits.gun || 0) - hits0, shock: c.shock, under: c.under, lock: m.lockHigh ?? null };
      }
      if (how === 'moved') R.teleport(0, c0.x + 9, c0.z - 15);
      if (how === 'jumped') stepUntil(() => !c.mv || c.mv.ph !== 'tunnel' || Math.hypot(c.mv.spot.x - c.pos.x, c.mv.spot.z - c.pos.z) < 2.7, 400), P0().hop = { y: 0, v: Math.sqrt(2 * 12 * 2.6), peak: 0 };
      stepUntil(() => !c.under, 600); e.popT = c.mv ? c.mv.pt : null; e.at = { x: c.pos.x - e.spot.x, z: c.pos.z - e.spot.z };
      stepUntil(() => !c.mv, 120); e.dealt = h0 - hp(); e.last = st(c).centipede.last; freeze(c);
      if (how === 'immune') { const hp1 = c.health; R.damage(c.id, 10, 'gun'); e.upHit = hp1 - c.health; }
      return e; };
    out.stand = dig('stand'); out.moved = dig('moved'); out.jumped = dig('jumped'); out.immune = dig('immune'); out.cn = st(c).centipede; return out; })()`);
  ok(`DIG goes under by 0.5 s and pops up under a standing mech: hit (${r.stand.dealt} = 22)`, Math.abs(r.stand.tUnder - 0.5) < 0.04 && r.stand.dealt === 22 && Math.hypot(r.stand.at.x, r.stand.at.z) < 0.01, r.stand);
  ok(`DIG misses a mech that moved 9 m away after it went under (${r.moved.dealt})`, r.moved.dealt === 0, r.moved);
  ok(`DIG misses a mech in a jump as it pops up (${r.jumped.dealt})`, r.jumped.dealt === 0, r.jumped);
  ok('underground (Q2 A): no hit shape, and a hook\'s damage, the cannon\'s rounds and the 🧲 do nothing to it', r.immune.balls === 0 && r.immune.hook && r.immune.after.health === r.immune.after.hp0 && r.immune.after.hits === 0 && r.immune.after.shock === 0 && r.immune.after.under, r.immune);
  ok(`... and once it's up it can be hurt again (${r.immune.upHit})`, r.immune.upHit === 10, r.immune);

  // ---- the hit shape covers the segments: a round at its tail lands
  r = await C.ev(String.raw`(() => { ${H} R.manual(true); R.player('guest'); R.start(0); empty(); const c0 = clear(); const c = cent(c0.x, c0.z, 0);
    const b = st(c).centipede.balls, tail = b[b.length - 2];   // (its 7th tail segment, about 12 m behind its front)
    R.teleport(0, tail[0] + 16, tail[2]); const m = P0(), h0 = c.health, g0 = st(c).hits.gun || 0;
    R.aim(0, Math.atan2(-(tail[0] - m.pos.x), -(tail[2] - m.pos.z)), -0.12); R.fire(0, 'gun'); R.step(30);
    return { balls: b.length, tail, behind: Math.hypot(tail[0] - c0.x, tail[2] - c0.z), dealt: h0 - c.health, hits: (st(c).hits.gun || 0) - g0 }; })()`);
  ok(`its hit shape is 11 balls (head, neck, front, 8 tail segments) and a round at its tail (${r.behind.toFixed(1)} m behind its front) lands`, r.balls === 11 && r.behind > 9 && r.hits >= 1 && r.dealt > 0, r);

  // ---- the satellite: linked, 1.5 x its laser, its shield halves a round
  r = await C.ev(String.raw`(() => { ${H} R.manual(true); R.player('guest'); R.start(0); empty(); const c0 = clear(), out = {};
    const shot = (c) => { R.teleport(0, c0.x + 14, c0.z); const m = P0(), h0 = c.health, g0 = st(c).hits.gun || 0; R.aim(0, Math.atan2(-(c.pos.x - m.pos.x), -(c.pos.z - m.pos.z)), -0.05); R.fire(0, 'gun'); R.step(30); const n = (st(c).hits.gun || 0) - g0; return { per: n ? (h0 - c.health) / n : null, n }; };
    let c = cent(c0.x, c0.z, 0); out.plain = shot(c); R.damage(c.id, 1e6); R.teleport(0, c.pos.x + 2.5, c.pos.z); R.choose(c.id, 'parts', undefined, [c.parts[0]]);
    c = cent(c0.x, c0.z, 0); const s = R.spawn('satellite', c0.x + 6, c0.z + 6); stepUntil(() => c.linkBy, 300); freeze(c);
    out.linkBy = c.linkBy ?? null; out.sat = s.id; out.linked = st(G.robots.find((q) => q.id === s.id)).satellite.linked;
    heal(); R.teleport(0, c0.x, c0.z - 16); const h0 = hp(); R.centipedeAttack(c.id, 'laser'); stepUntil(() => !c.mv); out.laser = h0 - hp(); freeze(c);
    out.linkedShot = shot(c); out.stillLinked = c.linkBy === s.id; return out; })()`);
  ok(`the satellite links to the Centipede (linkBy ${r.linkBy}, its links ${JSON.stringify(r.linked)})`, r.linkBy === r.sat && r.linked.length >= 1, r);
  ok(`linked, its laser hits 1.5 x (${r.laser} = 21)`, r.laser === 21, r);
  ok(`linked, its shield halves a cannon round (${r.plain.per} -> ${r.linkedShot.per})`, r.plain.per > 0 && r.linkedShot.per > 0 && Math.abs(r.linkedShot.per - r.plain.per * 0.5) < 0.01 && r.stillLinked, r);

  // ---- beaten (Q4 A): its board, the fix, the saw and the trophy; latched; no squad place
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.manual(true); R.player('apollo'); R.start(0); empty(); R.waveTo(10); const c0 = clear(), out = {};
    const beat = () => { const c = cent(c0.x, c0.z, 0); R.damage(c.id, 1e6, 'gun'); R.teleport(0, c.pos.x + 2.5, c.pos.z); const ch = R.choose(c.id, 'fix'); return { c, ch }; };
    let { c, ch } = beat(); const s = st(c);
    out.board = { slots: s.board.slots.length, math: s.board.math, puzzles: s.board.slots.filter((q) => q.kind === 'puzzle').length, wave: s.board.wave };
    out.plan = R.bossPlan(10, s.faults?.by ?? 'gun', 'centipede'); out.normal = R.plan(10, 'gun');
    out.ch = ch.ok; out.solved = solve(c.id);
    out.won = R.Bosses.won.map((b) => ({ ...b })); out.bag = G.bag.saw || 0; out.squad = G.squad.length; out.bosses = R.Garage.bosses();
    const at0 = out.bosses.centipede?.at;
    R.clock(60000); ({ c } = beat()); out.solved2 = solve(c.id); out.bosses2 = R.Garage.bosses(); out.bag2 = G.bag.saw || 0; out.same = out.bosses2.centipede?.at === at0;
    out.wall = wall()?.slots?.saw ?? null;
    out.saved = JSON.parse(localStorage.getItem('robotbattle.facts.apollo'))?.garage?.bosses ?? null;
    return out; })()`);
  ok(`its board is a boss's: wave 10's plus 1 math wire and 1 puzzle (${r.board.math} wires + ${r.board.puzzles} puzzles = ${r.board.slots}, against ${r.normal.math} + ${r.normal.puzzles.length})`,
    r.board.math === r.plan.math && r.board.slots === r.plan.slots && r.board.math === Math.min(4, r.normal.math + 1) && r.board.puzzles === Math.min(2, r.normal.puzzles.length + 1), r);
  ok('the fix, done through the hooks, gives the 🪚 saw (bag 1) and the Centipede trophy, and it doesn\'t join the squad', r.solved && r.won.length === 1 && r.won[0].type === 'centipede' && r.won[0].part === 'saw' && r.won[0].trophy === true && r.bag === 1 && r.squad === 0 && !!r.bosses.centipede, r);
  ok('a second Centipede fixed: a second saw, and the trophy is latched (its first time kept: ||=)', r.solved2 && r.bag2 === 2 && r.same, { b1: r.bosses, b2: r.bosses2 });
  ok('the 🏆 wall: the saw found (x2) and wearing the Centipede trophy; saved in the record', r.wall?.found && r.wall.n === 2 && r.wall.boss === 'centipede' && r.wall.trophyIcon === 'trophy' && !!r.saved?.centipede, { wall: r.wall, saved: r.saved });

  // reload; backups both ways
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} R.player('apollo'); const sw = wall()?.slots?.saw; const b = R.Garage.bosses();
    const bk = JSON.parse(JSON.stringify(R.backup())); const res = {};
    for (const ch of ['backup', 'best']) { localStorage.clear(); const x = R.restore(bk, ch); R.player('apollo'); res[ch] = { ok: x.ok, bosses: R.Garage.bosses(), saw: R.Garage.trophies().saw }; }
    return { wall: sw, b, res, bk }; })()`);
  ok('after a reload: the Centipede trophy and the saw on the 🏆 wall', !!r.b.centipede && r.wall?.boss === 'centipede' && r.wall.n === 2, { wall: r.wall, b: r.b });
  for (const ch of ['backup', 'best']) ok(`a backup restored with "${ch === 'backup' ? 'Use the backup' : 'Keep the best'}" keeps the Centipede trophy and the saws`, r.res[ch].ok && !!r.res[ch].bosses.centipede && r.res[ch].saw?.count === 2, r.res[ch]);
  const bk = r.bk;
  // an old save and a backup made by main: Orion with the Knight trophy, 2 swords and 3 armour plates, saved by main (the same
  // origin, so the same storage); then this build loads that save as it stands, and restores that backup, with nothing lost
  await C.open(1280, 800, false, '', 'main.html');
  const old = await C.ev(String.raw`(() => { const R = window.__rb; localStorage.clear(); R.player('orion'); R.manual(true); R.start(0);
    R.Garage.collect('sword', 'knight'); R.Garage.collect('sword', 'knight'); for (let i = 0; i < 3; i++) R.Garage.collect('armour', 'charger'); R.Garage.latchBoss('knight'); R.Facts.save();
    return { bk: JSON.parse(JSON.stringify(R.backup())), bosses: R.Garage.bosses(), tr: R.Garage.trophies() }; })()`);
  const same = (x) => x.bosses.knight?.at === old.bosses.knight.at && x.sword?.count === 2 && x.sword.from.knight === 2 && x.armour?.count === 3 && x.armour.from.charger === 3 && !x.bosses.centipede && !x.saw?.found;
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} const p = R.player('orion'), t = R.Garage.trophies(); const d = wall(); return { player: p.ok, bosses: R.Garage.bosses(), sword: t.sword, armour: t.armour, saw: t.saw, wallSword: d?.slots?.sword ?? null }; })()`);
  ok(`a save made by main (${MAIN_SHA}) loads here with nothing lost: the Knight trophy, 2 swords, 3 armour plates (the saw not found yet)`, r.player && same(r) && r.wallSword?.boss === 'knight', r);
  r = await C.ev(String.raw`(() => { ${H} localStorage.clear(); const x = R.restore(${JSON.stringify(old.bk)}, 'backup'); const p = R.player('orion'), t = R.Garage.trophies(); return { ok: x.ok, player: p.ok, bosses: R.Garage.bosses(), sword: t.sword, armour: t.armour, saw: t.saw }; })()`);
  ok(`a backup made by main restores here with nothing lost (the same)`, r.ok && r.player && same(r), r);
  // this build's backup into main: restores, the child loads, main's garage (trophies) and bag open
  for (const ch of ['backup', 'best']) {
    await C.open(1280, 800, false, '', 'main.html');
    r = await C.ev(String.raw`(() => { ${H} localStorage.clear(); const x = R.restore(${JSON.stringify(bk)}, '${ch}'); const p = R.player('apollo');
      const d = wall(); const bag = R.bag(); R.bag();
      return { ok: x.ok, player: p.ok, wall: !!d, centipede: !!window.__rb.ROBOT_TYPES.centipede, bag, bosses: R.Garage.bosses() }; })()`);
    ok(`this build's backup restores into main (${MAIN_SHA}) with "${ch === 'backup' ? 'Use the backup' : 'Keep the best'}": the child loads, its garage and bag open`, r.ok && r.player && r.wall && !r.centipede && r.bag === true, r);
  }
  return out;
}

async function runModel(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'model: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  let r = await C.ev(`window.__rb.models(true).then((m) => ({ status: m.status.centipede, info: m.info.centipede }))`);
  ok(`its model loads over http (${r.status}, ${r.info?.tris} triangles)`, r.status === 'ready' && r.info?.tris === 5252, r);
  r = await C.ev(String.raw`(async () => { ${H} R.manual(true); R.player('guest'); R.start(0); empty(); const c0 = clear(); const c = cent(c0.x, c0.z, 0); R.step(30); R.render();
    const P = R.MODEL_POSES.centipede, names = R.MODELS.centipede.joints, J = c.model.gl.joints, D = Math.PI / 180;
    const whole = [['stance', P.stance], ['curl', P.curl], ['laser', P.laser], ['crunch', P.crunch], ['dig', P.dig], ...P.walk.map((p, i) => ['walk' + i, p]), ...Object.entries(P.tl).flatMap(([k, T]) => T.keys.map(([t, p]) => [k + '@' + t, p]))]
      .filter(([, p]) => names.some((n) => !Array.isArray(p[n]))).map(([k]) => k);
    // the raw .glb, loaded fresh (no prep): each joint's own turn and place against ours at its stance
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'), g = await new GLTFLoader().loadAsync(R.MODELS.dir + R.MODELS.centipede.file), T3 = R.THREE;
    const off = [], q = new T3.Quaternion();
    for (const n of names) {
      const o = g.scene.getObjectByName(n), j = J[n]; if (!o || !j) { off.push(n + ': missing'); continue; }
      q.setFromEuler(new T3.Euler(...P.stance[n].map((v) => v * D), 'YZX'));
      const dq = 1 - Math.abs(o.quaternion.dot(j.quaternion)), dqp = 1 - Math.abs(o.quaternion.dot(q)), dp = o.position.distanceTo(j.position);
      if (dq > 1e-5 || dqp > 1e-5 || dp > 1e-4) off.push({ n, dq, dqp, dp });
    }
    const deg = (n) => J[n].rotation.toArray().slice(0, 3).map((v) => Math.round(v / D * 10) / 10);
    const s = st(c).centipede;
    return { model: s.model, joints: s.joints, whole, off, legL: deg('CE_Leg_3_L'), legR: deg('CE_Leg_3_R'), mand: deg('CE_Mandible_L'), order: J.CE_Leg_3_L.rotation.order, lenses: c.model.lenses.filter(Boolean).length }; })()`);
  ok(`a Centipede wears it (${r.model}), with its 36 joints and both laser lenses`, r.model === 'centipede' && r.joints === 36 && r.lenses === 2, r);
  ok('every pose, gait sample and key in MODEL_POSES.centipede lists all 36 nodes (none filled with 0)', r.whole.length === 0, r.whole);
  ok(`at its stance every joint's turn and place match the raw .glb's (legs ${r.legL} / ${r.legR}, a mandible ${r.mand}, YZX)`, r.off.length === 0 && r.legL[2] === 40 && r.legR[2] === -40 && r.mand[0] === 12 && r.order === 'YZX', r.off.slice(0, 6));
  if (shots) {
    await C.ev(String.raw`(() => { ${H} const c = G.robots.find((q) => q.type === 'centipede'); c.legHeading = c.torsoYaw = Math.PI / 2; R.step(10); look(c.pos.x, c.pos.z, 24); return true; })()`);
    await sleep(500); await C.shot('model-stance');
    // a close look: ours at its stance (left) beside the raw .glb loaded fresh with no prep (right), both grown and turned the
    // same, from in front and to the side, drawn straight to the canvas (no HUD camera)
    await C.ev(String.raw`(async () => { ${H} const c = G.robots.find((q) => q.type === 'centipede'), T3 = R.THREE, sc = c.model.root.parent; c.legHeading = c.torsoYaw = 0; R.step(2); R.render();
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'), g = await new GLTFLoader().loadAsync(R.MODELS.dir + R.MODELS.centipede.file);
      const raw = new T3.Group(); raw.add(g.scene); raw.rotation.y = Math.PI; raw.scale.setScalar(R.MODELS.centipede.scale); raw.position.set(c.pos.x + 9, c.pos.y, c.pos.z); sc.add(raw);
      P0().model && (P0().model.root.visible = false);
      const cam = new T3.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 400); cam.position.set(c.pos.x + 4.5 - 13, c.pos.y + 9, c.pos.z - 19); cam.lookAt(c.pos.x + 4.5, c.pos.y + 3, c.pos.z + 3);
      R.renderer.render(sc, cam); window.__rawCent = raw; return true; })()`);
    await C.shot('model-vs-raw');
    await C.ev(`(() => { window.__rawCent.parent.remove(window.__rawCent); return true; })()`);
  }
  r = await C.ev(String.raw`(() => { ${H} const c = G.robots.find((q) => q.type === 'centipede'); heal(); R.teleport(0, c.pos.x, c.pos.z - 16); R.centipedeAttack(c.id, 'laser'); R.step(12); R.render(); const s = st(c).centipede; return { beams: s.beams, len: s.beamLen }; })()`);
  ok(`a LASER shows two beams from its lenses (${r.len} m)`, r.beams && r.len > 5, r);
  if (shots) { await C.ev(String.raw`(() => { ${H} const c = G.robots.find((q) => q.type === 'centipede'); stepUntil(() => !c.mv); freeze(c); c.legHeading = c.torsoYaw = Math.PI / 2; look(c.pos.x - 6, c.pos.z, 26); R.centipedeAttack(c.id, 'laser'); R.step(15); R.render(); return true; })()`); await sleep(300); await C.shot('model-laser'); }
  r = await C.ev(String.raw`(() => { ${H} const c = G.robots.find((q) => q.type === 'centipede'); stepUntil(() => !c.mv); freeze(c); heal(); R.teleport(0, c.pos.x, c.pos.z - 20);
    R.centipedeAttack(c.id, 'dig'); stepUntil(() => c.under, 120); R.step(20); R.render(); const s = st(c).centipede; return { under: s.under, shown: s.bodyShown, trail: s.mv?.trail, ph: s.mv?.ph }; })()`);
  ok(`a dig: underground its body is hidden, and its dirt trail is out (${r.trail} puffs)`, r.under && !r.shown && r.trail >= 3, r);
  if (shots) { await C.ev(String.raw`(() => { ${H} const c = G.robots.find((q) => q.type === 'centipede'); const m = P0(); R.teleport(0, c.mv.spot.x + 18, c.mv.spot.z + 18); m.legHeading = m.torsoYaw = Math.atan2(18, 18); R.aim(0, m.legHeading, -0.05); R.step(4); R.render(); return true; })()`); await sleep(300); await C.shot('model-dig-trail'); }
  return out;
}

async function runFallback(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'fallback: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.block(true);
  await C.open(1280, 800, false, '?wave=10');
  let r = await C.ev(`window.__rb.models(true).then((m) => ({ status: m.status.centipede }))`);
  ok(`with models/ blocked its model fails (${r.status})`, r.status === 'failed', r);
  r = await C.ev(String.raw`(() => { ${H} R.player('guest'); R.start(0); return { wave: G.wave, types: foes().map((q) => q.type) }; })()`);
  ok('?wave=10 starts wave 10 with the Centipede', r.wave === 10 && r.types.includes('centipede'), r);
  await sleep(8000);
  r = await C.ev(String.raw`(() => { ${H} R.manual(true); const c = G.robots.find((q) => q.type === 'centipede'); const s = st(c); return { ticks: G.ticks, model: s.centipede.model, joints: s.centipede.joints, state: s.state, log: s.centipede.log.slice(-6) }; })()`);
  const brainF = await C.ev(String.raw`(() => { ${H} R.manual(true); return brain(40); })()`);
  ok(`the code-built one's brain, 40 s on manual ticks: it lasers (${brainF.lasers}), digs (${brainF.digs}) and crunches (${brainF.crunches}) and lands hits`, brainF.model === null && brainF.lasers > 0 && brainF.digs > 0 && brainF.crunches > 0 && brainF.hits.laser + brainF.hits.crunch + brainF.hits.dig > 0, brainF);
  ok(`it's code-built (model ${r.model}) with the same 36 joints, and wave 10 played 8 s of real time (${r.ticks} ticks: at least 60, a second of game time, on a loaded machine)`, r.model === null && r.joints === 36 && r.ticks >= 60, r);
  r = await C.ev(String.raw`(() => { ${H} empty(); const c0 = clear(); const c = cent(c0.x, c0.z, 0); heal(); R.teleport(0, c0.x, c0.z - 16); const h0 = hp(); R.centipedeAttack(c.id, 'laser'); stepUntil(() => !c.mv); return { dealt: h0 - hp(), model: st(c).centipede.model }; })()`);
  ok(`the code-built one's laser lands (${r.dealt})`, r.dealt === 14 && r.model === null, r);
  if (shots) { await C.ev(String.raw`(() => { ${H} const c = G.robots.find((q) => q.type === 'centipede'); stepUntil(() => !c.mv); freeze(c); c.legHeading = c.torsoYaw = Math.PI / 2; R.step(10); look(c.pos.x, c.pos.z, 24); return true; })()`); await sleep(400); await C.shot('fallback-code-built'); }
  await C.block(false);
  return out;
}

// the frames as they're drawn in play (not manual: ticks, render, the browser's own frame), over `ms` after a warm-up: the median
// and 90th-percentile ms between frames (requestAnimationFrame), and one render's draw calls and triangles (every pass)
const FRAMES = (ms) => String.raw`new Promise((done) => { const R = window.__rb, t = []; let last = 0, t0 = 0;
  const f = (now) => { if (!t0) t0 = now; else t.push(now - last); last = now; if (now - t0 < ${ms}) requestAnimationFrame(f); else {
    t.sort((a, b) => a - b); const I = R.renderer.info; I.autoReset = false; I.reset(); R.render(); const calls = I.render.calls, tris = I.render.triangles; I.autoReset = true;
    done({ med: t[t.length >> 1], p90: t[Math.floor(t.length * 0.9)], frames: t.length, calls, tris, robots: R.Game.robots.map((q) => q.type) }); } };
  setTimeout(() => requestAnimationFrame(f), 1500); })`;
async function runPerf(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name: 'perf: ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const cases = [['main wave 10 (Knight)', 'main.html', 10], ['this wave 10 (Centipede)', 'robot-battle.html', 10], ['this wave 5 (Knight)', 'robot-battle.html', 5]], got = {};
  for (let round = 0; round < 3; round++) for (const [k, file, w] of cases) {
    await C.open(390, 844, true, '?wave=' + w, file);
    await C.ev(`window.__rb.models ? window.__rb.models(true) : null`);
    await C.ev(String.raw`(() => { const R = window.__rb; R.player('guest'); R.start(0); dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true })); const m = R.Game.humans[0].mech; m.maxHealth = m.health = 1e6; return true; })()`);
    (got[k] ||= []).push(await C.ev(FRAMES(5000)));
    if (!json) console.log(`  perf ${k} round ${round + 1}: ${got[k][round].med.toFixed(1)} ms`);
  }
  const med = (k) => got[k].map((x) => x.med).sort((a, b) => a - b)[1];
  const m = med(cases[0][0]), c = med(cases[1][0]), kn = med(cases[2][0]);
  const summary = { main10: +m.toFixed(2), cent10: +c.toFixed(2), knight5: +kn.toFixed(2), ratio: +(c / m).toFixed(3), calls: Object.fromEntries(cases.map(([k]) => [k, got[k][0].calls])), tris: Object.fromEntries(cases.map(([k]) => [k, got[k][0].tris])), robots: Object.fromEntries(cases.map(([k]) => [k, got[k][0].robots.length])) };
  out.perf = summary;
  ok(`390x844: the Centipede's wave 10 ${c.toFixed(2)} ms a frame against main's wave 10 ${m.toFixed(2)} ms (x${(c / m).toFixed(2)}, margin ${PERF_MARGIN * 100}%); this build's wave 5 ${kn.toFixed(2)} ms`, c <= m * (1 + PERF_MARGIN), summary);
  if (!json) console.log('  perf ' + JSON.stringify(summary));
  return out;
}

// the boss bar at a size: keys and mouse (the controller hidden), then touch mode (shown)
const BAR = String.raw`(() => { const R = window.__rb; R.render(); const b = R.state().boss, el = document.getElementById('bossBar'), r0 = el.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  const vis = (e) => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const box = (r) => ({ l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) });
  const others = [...document.querySelectorAll('#hud .health, #hud .wave, #hud .weapons .wpn, #hud .speed, #hud .compass, #hud .mastery, #hud .counts > *, #hud .mate, #hud .reticle, .tp-root .tp-ring')].filter((e) => !el.contains(e) && vis(e));
  const hits = others.filter((e) => { const q = e.getBoundingClientRect(); return q.left < r0.right - 1 && r0.left < q.right - 1 && q.top < r0.bottom - 1 && r0.top < q.bottom - 1; }).map((e) => (e.id || e.className) + ' ' + JSON.stringify(box(e.getBoundingClientRect())));
  return { bar: b.bar, up: b.up, box: box(r0), on: r0.left >= -0.5 && r0.top >= -0.5 && r0.right <= W + 0.5 && r0.bottom <= H + 0.5, hits, tp: document.documentElement.classList.contains('tp-mode'), rings: document.querySelectorAll('.tp-root .tp-ring').length, docX: document.documentElement.scrollWidth - W }; })()`;
async function runSize(C, size) {
  const [w, h] = size.split('x').map(Number), out = [], ok = (name, pass, got) => { out.push({ name: size + ': ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  for (const touch of [false, true]) for (const type of ['centipede', 'knight']) {
    await C.open(w, h, touch);
    const how = touch ? 'controller shown' : 'controller hidden';
    await C.ev(String.raw`(() => { ${H} R.manual(true); R.player('guest'); R.start(0); empty(); const c0 = clear(); R.teleport(0, c0.x, c0.z + 30);
      const s = R.spawn('${type}', c0.x, c0.z); const r = G.robots.find((q) => q.id === s.id); r.ai.mode = 'recover'; r.ai.t = 1e9;
      if (${touch}) dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true })); else document.documentElement.classList.remove('tp-mode');
      return true; })()`);
    await sleep(350);
    let b = await C.ev(BAR);
    const style = type === 'centipede' ? 'segments' : 'sword';
    if (touch) ok(`${type}, ${how}: touch mode is on with the controller's rings`, b.tp && b.rings > 0, b);
    ok(`${type}, ${how}: the bar shows (${b.bar.style}, "${b.bar.name}") at full`, b.bar.shown && b.bar.style === style && b.bar.fill === 100 && b.up?.type === type, b);
    ok(`${type}, ${how}: the bar on screen ${JSON.stringify(b.box)} and clear of every other HUD box${touch ? ' and the controller' : ''}`, b.on && b.hits.length === 0 && b.docX <= 0, b);
    if (type === 'centipede') {
      await C.ev(`(() => { const R = window.__rb, r = R.Game.robots.find((q) => q.type === 'centipede'); R.damage(r.id, r.maxHealth / 2, 'gun'); return true; })()`); await sleep(300);
      const half = await C.ev(BAR);
      await C.ev(`(() => { const R = window.__rb, r = R.Game.robots.find((q) => q.type === 'centipede'); R.damage(r.id, 1e6, 'gun'); return true; })()`); await sleep(300);
      const down = await C.ev(BAR);
      ok(`${type}, ${how}: its fill tracks its health (50% -> ${half.bar.fill}; down: ${down.bar.down}, still on screen and clear)`, Math.abs(half.bar.fill - 50) < 0.6 && down.bar.down && down.bar.shown && down.on && down.hits.length === 0, { half: half.bar, down: down.bar, hits: down.hits });
      if (shots) await C.shot(`bar-${size}-${touch ? 'touch' : 'keys'}`);
    }
  }
  return out;
}

async function main() {
  await serve();
  const all = []; const unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now();
    try {
      const C = await connect(S);
      const res = run === 'logic' ? await runLogic(C) : run === 'model' ? await runModel(C) : run === 'fallback' ? await runFallback(C) : run === 'perf' ? await runPerf(C) : await runSize(C, run);
      const errs = C.errs.filter((e) => !(run === 'fallback' && /models\/robot-battle\/.*\.glb|ERR_BLOCKED_BY_CLIENT/.test(e)));
      res.push({ name: run + ': no page errors', pass: errs.length === 0, got: errs.length ? errs.slice(0, 10) : undefined });
      all.push(...res);
      const bad = res.filter((r) => !r.pass);
      if (!json) {
        console.log(`${run}: ${res.length - bad.length}/${res.length} pass  (${((Date.now() - t0) / 1000).toFixed(1)} s)${bad.length ? '  FAIL' : ''}`);
        for (const r of bad) console.log('  FAIL ' + r.name + '\n       ' + JSON.stringify(r.got)?.slice(0, 1200));
      }
    } catch (e) {
      unfinished.push(run + ': ' + (e?.message || e));
      if (!json) console.log(`${run}: did not finish: ${e?.message || e}`);
    } finally { await kill(S); }
  }
  const failed = all.filter((r) => !r.pass);
  if (json) console.log(JSON.stringify({ page, runs, checks: all, failed: failed.length, unfinished }, null, 1));
  else console.log(`${page}\n${all.length - failed.length}/${all.length} checks pass${unfinished.length ? `, ${unfinished.length} run(s) did not finish` : ''}: ${failed.length || unfinished.length ? 'FAIL' : 'PASS'}`);
  return unfinished.length ? 2 : failed.length ? 1 : 0;
}

let code = 2;
try { code = await main(); }
catch (e) { console.error('check failed: ' + (e?.stack || e?.message || e)); }
finally { await kill(shared); closeServer(); }
process.exit(code);
