#!/usr/bin/env node
// Family Knockout (#169): the save key prefix moved to 'familyknockout.'; saves under the pre-#169 prefix carry over on load.
//
// The page is served over http on 127.0.0.1 by this script. Each run is its own headless Chrome (muted, never detached, killed
// with its profile deleted on every way out, and killed if the run takes over 5 minutes); the server is closed on every way out.
// Saves are seeded on a blank page of the same origin before the game page loads, so the carry-over sees them on its first run.
//   carry      - every key the game writes (music, mode, beans, players, crowns, skill) seeded under the old prefix with realistic
//                values: after load each is under 'familyknockout.' byte for byte, the game reads them (window.__fg.Game), and
//                the old keys are still there, unchanged. A change made in the menu after load is written under the new prefix
//                only (the old key keeps its value), and survives a reload (the old key does not win it back).
//   keep-new   - an existing 'familyknockout.' key is not overwritten by its old key; a key with no new twin still carries over.
//   fresh      - a profile with no saves loads to the menu with the defaults, and no key under either prefix appears by itself.
// Every run also checks there were no page errors.
//
// Usage:
//   node scripts/fk-saves.mjs                 # every run
//   node scripts/fk-saves.mjs --run carry     # one run (repeatable): carry | keep-new | fresh
//   node scripts/fk-saves.mjs path.html --json
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const OLD = 'fgclone.', NEW = 'familyknockout.';
const RUN_TIMEOUT_MS = 5 * 60 * 1000;
const args = process.argv.slice(2);
let json = false, target = null; const picked = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--run') picked.push(args[++i]);
  else if (args[i] === '-h' || args[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
  else target = args[i];
}
const runs = picked.length ? picked : ['carry', 'keep-new', 'fresh'];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = path.resolve(target ?? path.join(repo, 'family-knockout.html'));

// ---- the server: the page at /family-knockout.html, an empty same-origin page at /blank.html, everything else from the repo
let server = null, base = null;
async function serve() {
  server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (u === '/blank.html') { res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); res.end('<!doctype html><title>blank</title>'); return; }
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-saves-'));
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
const HARD_TIMEOUT_MS = 10 * 60 * 1000;
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
  const waitGame = async (what) => {
    for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState === "complete" && !!window.__fg && window.__fg.Game.state === "menu"').catch(() => false)) return; }
    throw new Error(`page did not ${what} window.__fg to the menu`);
  };
  // clear storage and write the seed (raw strings) on a blank page of the same origin, then load the game page
  C.open = async (seed = {}) => {
    await send('Page.navigate', { url: base + 'blank.html' }); await sleep(300);
    await ev(`(() => { localStorage.clear(); const s = ${JSON.stringify(seed)}; for (const k in s) localStorage.setItem(k, s[k]); return localStorage.length; })()`);
    await send('Page.navigate', { url: base + 'family-knockout.html' });
    await waitGame('load');
  };
  C.reload = async () => { await send('Page.reload', {}); await sleep(300); await waitGame('reload'); };
  C.storage = () => ev('(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; })()');
  C.game = () => ev('(() => { const G = window.__fg.Game; return { state: G.state, mode: G.mode, beanCount: G.beanCount, players: G.players, crowns: G.crowns, skill: G.skill }; })()');
  return C;
}

// realistic saves, as the game writes them (JSON.stringify of each value); players is a customised roster
const PLAYERS = [
  { name: 'Speedy', color: '#7cff4f', color2: '#222222', pattern: 'dots', hat: 'crown' },
  { name: 'Wobble Bean', color: '#ff9b3f', color2: '#3f5bff', pattern: 'stripes', hat: 'cap' },
];
const SAVES = { music: false, mode: 2, beans: 30, players: PLAYERS, crowns: 7, skill: 'hard' };
const oldSeed = () => Object.fromEntries(Object.entries(SAVES).map(([k, v]) => [OLD + k, JSON.stringify(v)]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function checker() { const out = []; const ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; }; return { out, ok }; }

async function runCarry(C) {
  const { out, ok } = checker();
  const seed = oldSeed();
  await C.open(seed);
  let st = await C.storage(); const g = await C.game();
  const keys = Object.keys(SAVES);
  const exact = keys.filter((k) => st[NEW + k] === seed[OLD + k]);
  ok(`every old save is under '${NEW}' byte for byte (${exact.length}/${keys.length}: ${keys.join(', ')})`, exact.length === keys.length, { st, seed });
  const kept = keys.filter((k) => st[OLD + k] === seed[OLD + k]);
  ok(`the old keys are still there, unchanged (${kept.length}/${keys.length})`, kept.length === keys.length, st);
  ok(`no other keys appear (${Object.keys(st).length} keys: ${keys.length} old + ${keys.length} new)`, Object.keys(st).length === keys.length * 2, Object.keys(st));
  ok('the game reads them: mode 2, 30 beans, 7 crowns, skill hard, the customised players',
    g.mode === 2 && g.beanCount === 30 && g.crowns === 7 && g.skill === 'hard' && same(g.players, PLAYERS), g);
  // a change in the menu after load: skill EASY and a new name for player 1
  await C.ev(`(() => { document.querySelector('[data-skill="easy"]').click(); const n = document.getElementById('nameIn'); n.value = 'Zoom'; n.dispatchEvent(new Event('input')); return true; })()`);
  st = await C.storage();
  ok(`a change after load is saved under '${NEW}': skill ${st[NEW + 'skill']}, player 1 ${JSON.parse(st[NEW + 'players'] || '[]')[0]?.name}`,
    st[NEW + 'skill'] === '"easy"' && JSON.parse(st[NEW + 'players'] || '[]')[0]?.name === 'Zoom', st);
  ok(`the old keys are not written: skill ${st[OLD + 'skill']}, players unchanged`, st[OLD + 'skill'] === seed[OLD + 'skill'] && st[OLD + 'players'] === seed[OLD + 'players'], st);
  await C.reload();
  const g2 = await C.game(); st = await C.storage();
  ok(`after a reload the change holds (skill ${g2.skill}, player 1 ${g2.players[0]?.name}); the old keys do not win it back`,
    g2.skill === 'easy' && g2.players[0]?.name === 'Zoom' && st[NEW + 'skill'] === '"easy"' && st[OLD + 'skill'] === seed[OLD + 'skill'], { g2, st });
  return out;
}

async function runKeepNew(C) {
  const { out, ok } = checker();
  const seed = { ...oldSeed(), [NEW + 'crowns']: '12', [NEW + 'skill']: '"easy"' };
  await C.open(seed);
  const st = await C.storage(), g = await C.game();
  ok(`existing '${NEW}' keys are not overwritten: crowns ${st[NEW + 'crowns']} (old ${st[OLD + 'crowns']}), skill ${st[NEW + 'skill']} (old ${st[OLD + 'skill']})`,
    st[NEW + 'crowns'] === '12' && st[NEW + 'skill'] === '"easy"' && st[OLD + 'crowns'] === '7' && st[OLD + 'skill'] === '"hard"', st);
  ok(`the game reads the new values: crowns ${g.crowns}, skill ${g.skill}`, g.crowns === 12 && g.skill === 'easy', g);
  const others = ['music', 'mode', 'beans', 'players'];
  const carried = others.filter((k) => st[NEW + k] === seed[OLD + k]);
  ok(`keys with no new twin still carry over byte for byte (${carried.length}/${others.length})`, carried.length === others.length, st);
  ok('the game reads the carried ones: mode 2, 30 beans, the customised players', g.mode === 2 && g.beanCount === 30 && same(g.players, PLAYERS), g);
  return out;
}

async function runFresh(C) {
  const { out, ok } = checker();
  await C.open({});
  const st = await C.storage(), g = await C.game();
  ok(`a fresh profile loads to the menu (state ${g.state})`, g.state === 'menu', g);
  ok(`with the defaults: mode ${g.mode}, ${g.beanCount} beans, ${g.crowns} crowns, skill ${g.skill}, players ${g.players.map((p) => p.name).join(' / ')}`,
    g.mode === 1 && g.beanCount === 20 && g.crowns === 0 && g.skill === 'normal' && g.players[0]?.name === 'Player 1' && g.players[1]?.name === 'Player 2', g);
  ok(`no saves appear by themselves (${Object.keys(st).length} keys)`, Object.keys(st).length === 0, st);
  return out;
}

async function main() {
  await serve();
  const all = []; const unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now(); let timer;
    try {
      const C = await connect(S);
      const job = run === 'carry' ? runCarry(C) : run === 'keep-new' ? runKeepNew(C) : run === 'fresh' ? runFresh(C) : Promise.reject(new Error('unknown run ' + run));
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
