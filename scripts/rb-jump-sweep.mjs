#!/usr/bin/env node
// Robot Battle clean-jump sweep ("t7", from #46 / PR #54; issue #87).
//
// Runs Orion's mech at fence 126 in headless Chrome and jumps it from every launch point in a grid:
//   levels 1-2 x angles 0 / 0.4 / 0.7 / 1.0 rad x offsets -0.85 / -0.5 / 0 / 0.5 / 0.85 m
//   x launches 3.0-7.0 m before the fence line every 0.25 m  =  2 x 4 x 5 x 17 = 680 cases.
// Each case: a 40 m run-up holding W, jump at the launch point, run on 90 ticks past landing, all on
// manual ticks (Game.manual, no robots), so the result does not depend on the machine's speed.
//
// Usage:
//   node scripts/rb-jump-sweep.mjs                      # ./robot-battle.html, 1 run
//   node scripts/rb-jump-sweep.mjs --runs 3             # 3 runs, each on a freshly loaded page
//   node scripts/rb-jump-sweep.mjs path/to/robot-battle.html
//   node scripts/rb-jump-sweep.mjs http://localhost:8000/robot-battle.html --json
// Chrome: set CHROME=/path/to/chrome, otherwise Playwright's chrome-headless-shell under
// ~/Library/Caches/ms-playwright or ~/.cache/ms-playwright, otherwise Google Chrome / Chromium.
// Needs Node 22+ (global WebSocket and fetch).
//
// Output, per run:
//   cases   - how many cases ran. Always 680; anything else means the sweep did not finish.
//   clears  - cases where the fence ended whole (the jump passed it cleanly). 449 since PR #54.
//             This is NOT the case count (issue #87 was 449 read as the case count).
//   broken  - cases where it broke, split by how (stomp = came down on it / landed short; walk).
//   shoves  - cases with a position step over 0.1 m in one tick (a teleport/shove). Must be 0.
//   dented  - clears where the fence lost hp after the jump started (a stomp or bump on a clean pass). Must be 0.
//   scuffed - clears where the fence was below full hp at the end. Launching under ~3.3 m the body
//             touches it while still on the ground and walking dents it before the jump (as in PR #54),
//             so a scuff is not a failure in itself; the count (6 since PR #54) is part of BASELINE.
//   digest  - a hash of every case's outcome, to compare runs and commits (f62bf314 from PR #54's
//             head 26a78f9 through f02bfbd). Informational: it is not checked.
// Exit 0 only if every run has 680 cases, 0 shoves, 0 dented, no page errors, matches BASELINE
// (clears / walk / stomp / scuffed), and all runs give the same outcomes.
// If a change to jumping is meant to move the baseline, update BASELINE below in the same PR and say why.
// Chrome runs muted, and is killed with its temporary profile deleted however the script ends: finish, error,
// Ctrl-C / SIGTERM, or a hard timeout of 5 minutes for the whole script (one run takes about a minute).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// What the sweep gives since PR #54 (#46). A clean pass that turns into a stomp moves clears and stomp.
const BASELINE = { cases: 680, clears: 449, walk: 112, stomp: 119, scuffed: 6 };

const args = process.argv.slice(2);
let runs = 1, json = false, target = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--runs') runs = Math.max(1, parseInt(args[++i], 10) || 1);
  else if (args[i] === '--json') json = true;
  else if (args[i] === '-h' || args[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
  else target = args[i];
}
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
target ??= path.join(repo, 'robot-battle.html');
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(path.resolve(target)).href;

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

// The sweep itself, evaluated in the page. Returns every case's outcome.
const SWEEP = String.raw`(() => {
  const R = window.__rb; R.manual(true); R.player('orion'); R.start(0); R.step(1);
  const M = R.Game.humans[0].mech, FID = 126;
  const fence = () => R.Props.list.find((p) => p.id === FID);
  function restore(f) {
    if (f.broken) { f.broken = false; f.by = null; for (const o of f.obs) if (!R.obstacles.includes(o)) R.obstacles.push(o); }
    f.hp = f.maxHp; M.over = null;
  }
  function runAng(level, launch, ang, side) {
    const f = fence();
    const [a, b] = [f.obs[0], f.obs[f.obs.length - 1]];
    let lx = b.x - a.x, lz = b.z - a.z; const L = Math.hypot(lx, lz); lx /= L; lz /= L;
    const nx = lz, nz = -lx, cx = f.x + lx * side, cz = f.z + lz * side;
    const fx = -nx * Math.cos(ang) + lx * Math.sin(ang), fz = -nz * Math.cos(ang) + lz * Math.sin(ang);
    M.upg = { ...(M.upg || {}), spring: level };
    R.teleport(0, cx - fx * 40, cz - fz * 40); M.legHeading = Math.atan2(-fx, -fz);
    const dist = () => ((M.pos.x - cx) * nx + (M.pos.z - cz) * nz) / Math.cos(ang);   // along the path
    R.hold('KeyW', true);
    let jumped = false, prev = [M.pos.x, M.pos.z], maxStep = 0, land = -1, hpAtJump = null;
    for (let t = 0; t < 1200; t++) {
      if (!jumped && dist() <= launch) { hpAtJump = f.hp; R.jump(0); jumped = true; }
      R.step(1);
      const st = Math.hypot(M.pos.x - prev[0], M.pos.z - prev[1]); prev = [M.pos.x, M.pos.z];
      if (st > maxStep) maxStep = st;
      if (jumped && !M.hop && land < 0) land = t;
      if (land >= 0 && t > land + 90) break;
    }
    R.hold('KeyW', false); M.speed = 0;
    return { lvl: level, ang, side, launch, jumped, landed: land >= 0, hp: +f.hp.toFixed(3), hpAtJump: hpAtJump == null ? null : +hpAtJump.toFixed(3), maxHp: f.maxHp, broken: !!f.broken, by: f.by ?? null, maxStep: +maxStep.toFixed(4) };
  }
  const cases = [];
  for (const lvl of [1, 2]) for (const ang of [0, 0.4, 0.7, 1.0]) for (const side of [-0.85, -0.5, 0, 0.5, 0.85]) for (let i = 0; i <= 16; i++) {
    restore(fence());
    cases.push(runAng(lvl, 3.0 + 0.25 * i, ang, side));
  }
  return cases;
})()`;

const chromeBin = findChrome();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-jump-sweep-'));
// Port 0: Chrome picks a free port and writes it to DevToolsActivePort in its own profile, so a sweep never
// attaches to another Chrome that already holds a fixed or randomly picked port (and drives that one's tab).
// --mute-audio: the game plays sound, and a sweep must never be heard (#105).
// detached: Chrome leads its own process group, so cleanup kills it and every helper process it started.
const chrome = spawn(chromeBin, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files', '--window-size=1280,800', '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore', detached: true });
chrome.on('error', () => {});   // a failed spawn shows up as "Chrome did not start" below
let chromeExited = false;
chrome.on('exit', () => { chromeExited = true; });
let ws;

// Close Chrome and delete its profile on every way out (#105): normal finish and thrown errors (the finally at
// the bottom), SIGINT / SIGTERM, the hard timeout, and any other process.exit (the 'exit' handler, sync only).
const HARD_TIMEOUT_MS = 5 * 60 * 1000;
let cleaned = false;
function killChrome() {
  try { ws?.close(); } catch {}
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch {}   // the whole process group
  try { chrome.kill('SIGKILL'); } catch {}
}
function cleanupSync() {
  if (cleaned) return;
  cleaned = true;
  killChrome();
  try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch {}
}
async function cleanup() {
  if (cleaned) return;
  killChrome();
  for (let i = 0; i < 50 && !chromeExited && chrome.pid; i++) await sleep(20);   // let it stop writing to the profile
  cleanupSync();
}
process.on('exit', cleanupSync);
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.on(sig, () => { cleanup().finally(() => process.exit(code)); });
setTimeout(() => {
  console.error(`hard timeout: the sweep ran over ${HARD_TIMEOUT_MS / 60000} min; closing Chrome`);
  cleanup().finally(() => process.exit(124));
}, HARD_TIMEOUT_MS).unref();

async function main() {
let tgt;
let port;
for (let i = 0; i < 75 && !tgt; i++) {
  try { const f = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8'); if (f.includes('\n')) port = parseInt(f, 10) || undefined; } catch {}   // whole first line only
  if (port) try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  if (!tgt) await sleep(200);
}
if (!tgt) { console.error('Chrome did not start (' + chromeBin + ')'); return 2; }
ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pend = new Map(); let errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id) { pend.get(m.id)?.(m); pend.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
const results = [];
for (let r = 0; r < runs; r++) {
  errs = [];
  await send('Page.navigate', { url });
  let ready = false;
  for (let i = 0; i < 150 && !ready; i++) { await sleep(200); const v = await send('Runtime.evaluate', { expression: 'document.readyState === "complete" && !!window.__rb', returnByValue: true }); ready = !!v.result?.result?.value; }
  if (!ready) { console.error('page did not load window.__rb: ' + url); return 2; }
  const t0 = Date.now();
  const v = await send('Runtime.evaluate', { expression: SWEEP, returnByValue: true });
  if (v.result?.exceptionDetails) { console.error('sweep threw: ' + (v.result.exceptionDetails.exception?.description || v.result.exceptionDetails.text)); return 2; }
  const cases = v.result?.result?.value || [];
  const by = {}; for (const c of cases) if (c.broken) by[c.by ?? '?'] = (by[c.by ?? '?'] || 0) + 1;
  const res = {
    run: r + 1, cases: cases.length, clears: cases.filter((c) => !c.broken).length, broken: by,
    shoves: cases.filter((c) => c.maxStep > 0.1), dented: cases.filter((c) => !c.broken && c.hpAtJump != null && c.hp < c.hpAtJump - 1e-6),
    scuffed: cases.filter((c) => !c.broken && c.hp < c.maxHp).length,
    notJumped: cases.filter((c) => !c.jumped || !c.landed).length,
    maxStep: Math.max(0, ...cases.map((c) => c.maxStep)), digest: hash(JSON.stringify(cases)), errors: errs.slice(), ms: Date.now() - t0,
  };
  const got = { cases: res.cases, clears: res.clears, walk: by.walk || 0, stomp: by.stomp || 0, scuffed: res.scuffed };
  res.offBaseline = Object.keys(BASELINE).filter((k) => got[k] !== BASELINE[k]).map((k) => `${k} ${got[k]} (baseline ${BASELINE[k]})`);
  if (Object.keys(by).some((k) => !(k in BASELINE))) res.offBaseline.push('broken by ' + JSON.stringify(by));
  res.pass = res.offBaseline.length === 0 && res.shoves.length === 0 && res.dented.length === 0 && res.notJumped === 0 && res.errors.length === 0;
  results.push(res);
  if (!json) {
    console.log(`run ${res.run}: cases ${res.cases}  clears ${res.clears}  broken ${JSON.stringify(res.broken)}  shoves ${res.shoves.length}  dented ${res.dented.length}  scuffed ${res.scuffed}  ` +
      `max step ${res.maxStep.toFixed(3)} m  digest ${res.digest}  errors ${res.errors.length}  (${(res.ms / 1000).toFixed(1)} s)  ${res.pass ? 'PASS' : 'FAIL'}`);
    for (const c of [...res.shoves, ...res.dented].slice(0, 20)) console.log('  ' + JSON.stringify(c));
    for (const e of res.errors.slice(0, 10)) console.log('  error: ' + e);
    if (res.offBaseline.length) console.log('  off baseline: ' + res.offBaseline.join(', ') + '  (update BASELINE only if jumping was changed on purpose)');
  }
}
const same = results.every((r) => r.digest === results[0].digest);
const pass = results.every((r) => r.pass) && same;
if (json) console.log(JSON.stringify({ url, runs: results, same, pass }, null, 1));
else console.log(`${url}\n${runs} run(s), ${same ? 'all identical' : 'RUNS DIFFER'}: ${pass ? 'PASS' : 'FAIL'}`);
return pass ? 0 : 1;
}

let code = 2;
try { code = await main(); }
catch (e) { console.error('sweep failed: ' + (e?.stack || e?.message || e)); }
finally { await cleanup(); }
process.exit(code);
