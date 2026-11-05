#!/usr/bin/env node
// Family Knockout (#171): the five rounds, by their ids and names.
//
// The page is served over http on 127.0.0.1 by this script. Each run is its own headless Chrome (muted, never detached, killed
// with its profile deleted on every way out, and killed if the run takes over 5 minutes); the server is closed on every way out too.
//   order    - the rounds in window.__fg.LEVELS are, in this order, the five ids in ROUNDS with their type and icon (the order and
//              icons on main before #171), and the page's RACES, SURVIVALS and FINALS lists (read from the page source: they are
//              module-scoped) hold the same ids in the same places as on main.
//   <id>     - one run per round: __fg.test(id) starts it on a manual clock; the round title shows its name, the round's level is
//              that id, the countdown leads into play and the HUD shows the name; it plays 4 s on the manual clock and 2 s in real
//              time with no page errors.
//
// Usage:
//   node scripts/fk-rounds.mjs                    # every run
//   node scripts/fk-rounds.mjs --run order        # one run (repeatable): order | knockknock | hammerrun | skiprope | wallrush | tiledrop
//   node scripts/fk-rounds.mjs path.html --json
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

// the five rounds in their order on main: id, name, type, icon
const ROUNDS = [
  { id: 'knockknock', name: 'Knock Knock', type: 'race', icon: '\u{1F6AA}' },
  { id: 'hammerrun', name: 'Hammer Run', type: 'race', icon: '\u{1F528}' },
  { id: 'skiprope', name: 'Skip Rope', type: 'survival', icon: '\u{1F300}' },
  { id: 'wallrush', name: 'Wall Rush', type: 'survival', icon: '\u{1F9F1}' },
  { id: 'tiledrop', name: 'Tile Drop', type: 'final', icon: '⬢' },
];
const LISTS = { RACES: ['knockknock', 'hammerrun'], SURVIVALS: ['skiprope', 'wallrush'], FINALS: ['tiledrop'] };
const RUN_TIMEOUT_MS = 5 * 60 * 1000;
const args = process.argv.slice(2);
let json = false, target = null; const picked = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--run') picked.push(args[++i]);
  else if (args[i] === '-h' || args[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
  else target = args[i];
}
const runs = picked.length ? picked : ['order', ...ROUNDS.map((r) => r.id)];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = path.resolve(target ?? path.join(repo, 'family-knockout.html'));

// ---- the server: the page at /family-knockout.html, everything else from the repo
let server = null, base = null;
async function serve() {
  server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = u === '/family-knockout.html' ? page : path.join(repo, path.normalize(u).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(repo) && f !== page) f = null;
    let body = null; try { body = f && fs.readFileSync(f); } catch { body = null; }
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body);
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-rounds-'));
  const chrome = spawn(chromeBin, ['--headless=new', '--mute-audio', '--remote-debugging-port=0', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--window-size=1280,800', '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });   // not detached: it dies with us
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
const HARD_TIMEOUT_MS = 15 * 60 * 1000;
setTimeout(() => { console.error(`hard timeout: over ${HARD_TIMEOUT_MS / 60000} min; closing Chrome`); kill(shared).finally(() => { closeServer(); process.exit(2); }); }, HARD_TIMEOUT_MS).unref();

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
  C.open = async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: base + 'family-knockout.html' });
    for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState === "complete" && !!window.__fg && window.__fg.Game.state === "menu"').catch(() => false)) return; }
    throw new Error('page did not load window.__fg to the menu');
  };
  return C;
}

// ---- order: the five rounds, their order, types and icons; the three round lists
async function runOrder(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open();
  const levels = await C.ev(`Object.entries(window.__fg.LEVELS).map(([k, L]) => ({ key: k, id: L.id, name: L.name, type: L.type, icon: L.icon }))`);
  ok(`5 rounds: ${levels.map((l) => l.key).join(', ')}`, levels.length === ROUNDS.length, levels);
  ROUNDS.forEach((r, i) => {
    const L = levels[i] || {};
    ok(`round ${i + 1} is ${r.id} "${r.name}" (${r.type} ${r.icon})`, L.key === r.id && L.id === r.id && L.name === r.name && L.type === r.type && L.icon === r.icon, L);
  });
  const src = fs.readFileSync(page, 'utf8');
  for (const [list, ids] of Object.entries(LISTS)) {
    const m = src.match(new RegExp(`^const ${list} = \\[([^\\]]*)\\];`, 'm'));
    const got = m ? [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) : null;
    ok(`${list} is [${ids.join(', ')}]`, JSON.stringify(got) === JSON.stringify(ids), got);
  }
  ok('the default test round is the first race', /test\(id = 'knockknock',/.test(src), null);
  return out;
}

// ---- one round: start it by id, see its name, play a few seconds
async function runRound(C, R) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open();
  let r = await C.ev(`(() => { const F = window.__fg; F.manual(true); const t = F.test(${JSON.stringify(R.id)}, 1, 12); F.step(30);
    const on = (id) => document.getElementById(id).classList.contains('on');
    return { t, state: F.Game.state, level: F.Game.level && F.Game.level.id, title: document.getElementById('rtName').textContent, titleOn: on('rtitle'), beans: F.Game.world.beans.length }; })()`);
  ok(`__fg.test('${R.id}') starts it: level ${r.level}, ${r.beans} beans, state ${r.state}`, r.t === 'ok' && r.level === R.id && r.state === 'preview' && r.beans === 12, r);
  ok(`the round title shows "${r.title}"`, r.titleOn && r.title === R.name, r);
  r = await C.ev(`(() => { const F = window.__fg; F.skipPreview(); F.step(1); const s1 = F.Game.state; let n = 0; while (F.Game.state === 'countdown' && n < 600) { F.step(10); n += 10; }
    return { s1, s2: F.Game.state, ticks: n, running: F.Game.running, hud: document.getElementById('hudRound').textContent, hudOn: document.getElementById('hud').classList.contains('on') }; })()`);
  ok(`countdown then play (${r.s1} -> ${r.s2} after ${(r.ticks / 120).toFixed(2)} s); the HUD shows "${r.hud}"`, r.s1 === 'countdown' && r.s2 === 'play' && r.running && r.hudOn && r.hud === R.name, r);
  r = await C.ev(`(() => { const F = window.__fg; const st = []; for (let i = 0; i < 4; i++) { F.step(120); st.push(F.Game.state); }   // the page's tick is 1/120 s: 4 x 120 ticks = 4 s
    const b = F.bean(0); return { st, level: F.Game.level.id, bean: b ? [b.pos.x, b.pos.y, b.pos.z].every(Number.isFinite) : null }; })()`);
  ok(`plays 4 s on the manual clock (${r.st.join(', ')})`, r.level === R.id && r.st.every((s) => s === 'play') && r.bean === true, r);
  await C.ev('window.__fg.manual(false), true');
  await sleep(2000);
  r = await C.ev(`({ state: window.__fg.Game.state, level: window.__fg.Game.level.id })`);
  ok(`runs 2 s in real time (state ${r.state})`, r.level === R.id, r);
  return out;
}

async function main() {
  await serve();
  const all = []; const unfinished = [];
  for (const run of runs) {
    const R = ROUNDS.find((x) => x.id === run);
    if (run !== 'order' && !R) { unfinished.push(run + ': unknown run'); continue; }
    const S = launch(); const t0 = Date.now(); let timer;
    try {
      const C = await connect(S);
      const job = run === 'order' ? runOrder(C) : runRound(C, R);
      const res = await Promise.race([job, new Promise((_, j) => { timer = setTimeout(() => j(new Error(`over ${RUN_TIMEOUT_MS / 60000} min: killed`)), RUN_TIMEOUT_MS); })]);
      res.push({ name: run + ': no page errors', pass: C.errs.length === 0, got: C.errs.length ? C.errs.slice(0, 10) : undefined });
      all.push(...res);
      const bad = res.filter((r) => !r.pass);
      if (!json) {
        console.log(`${run}: ${res.length - bad.length}/${res.length} pass  (${((Date.now() - t0) / 1000).toFixed(1)} s)${bad.length ? '  FAIL' : ''}`);
        for (const r of res) if (r.pass) console.log('  ok   ' + r.name);
        for (const r of bad) console.log('  FAIL ' + r.name + '\n       ' + JSON.stringify(r.got)?.slice(0, 1500));
      }
    } catch (e) {
      unfinished.push(run + ': ' + (e?.message || e));
      if (!json) console.log(`${run}: did not finish: ${e?.message || e}`);
    } finally { clearTimeout(timer); await kill(S); }
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
