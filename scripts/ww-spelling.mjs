#!/usr/bin/env node
// Wild World W2 (#158): spell a word to change into an animal.
//
// The same harness and Chrome hygiene as ww-world.mjs: the page is served over http by this script; each run is its own headless
// Chrome (muted, never detached, killed with its profile deleted on every way out, and killed if the run takes over 5 minutes);
// the server is closed on every way out too. The logic runs drive window.__ww on a manual clock.
//   words    - the WORDS table: all 18 animals, a level 1 and a level 2 list of 5 to 8 words each, every word letters only
//              (lowercase-safe: no spaces, digits or marks), no word twice in one animal's lists, a clue for each, a fact for
//              each animal; the page parses every entry; the page has no emoji.
//   gate     - you can't change into an animal you haven't met; changing into a met one asks for a word (its name the first
//              time); a right answer changes you; a wrong one shows the right spelling letter by letter and leaves you as you
//              were; a miss never removes an animal; human never needs a word; level 1 shows the shuffled letters as tiles,
//              level 2 types on its own keyboard (no input element, so no system keyboard).
//   learning - a missed word comes back as the 2nd prompt after the miss (the next one is a different word), on another animal
//              too; three right first tries on three different days (the clock override) marks a word mastered, two days
//              doesn't, three right on the same day doesn't, and a miss stops today counting; mastered words come up less often.
//   profiles - Guest plus profiles made with the maker (tapped through: name on the game's keyboard, icon, color, level): each
//              keeps its own book and word progress, under wildworld.*; a reload keeps them; the parent view (behind a 2 s hold:
//              a short tap doesn't open it) shows each word's status, the misses this week and the level, and changes the level.
//   speech   - with speechSynthesis removed: the clue is written out, the replay button is gone, and play goes on (a right answer
//              changes you); with it there, the word is spoken.
//   migrate  - a real W1 save: main's W1 page (pinned at 1c0204e) meets animals through its own __ww and saves wildworld.save v:1;
//              this page then loads it as Guest's book with every met animal, writes nothing on load, and on the first change
//              writes Guest's book to wildworld.book.guest (v:2) while wildworld.save stays byte for byte as W1 left it.
//   touch    - a tap-only round with CDP Input.dispatchTouchEvent at 568x320: make a level 2 profile in the maker, play as it,
//              open the wheel with the CHANGE button, pick an animal, spell its name on the on-screen keyboard, then miss a word
//              (the spelling shows), tap NEW WORD and get the next one right.
//   WxH      - at that size in touch mode: the title (player tiles, PLAY, the parent button), the spelling panel at level 1 (tiles)
//              and level 2 (keyboard open), the maker's three pages and the parent view: every control on screen, none
//              overlapping, every target at least 44 px both ways, no page scroll; then with 6 profiles every title tile and parent
//              tab can be reached (its row scrolls on a short screen).
// Every run also checks there were no page errors.
//
// Usage:
//   node scripts/ww-spelling.mjs                  # every run
//   node scripts/ww-spelling.mjs --run gate       # one run (repeatable)
//   node scripts/ww-spelling.mjs --shots DIR      # also save screenshots (the PR's set: --shots docs/screenshots/wild-world)
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const SIZES = ['360x740', '568x320', '740x360', '844x390', '667x375', '768x1024', '820x1180'];
const W1_SHA = '1c0204e';   // main's W1 (#159 merged): the page whose saves W2 must keep
const RUN_TIMEOUT_MS = 5 * 60 * 1000;
const args = process.argv.slice(2);
let json = false, target = null, shots = null; const picked = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--run') picked.push(args[++i]);
  else if (args[i] === '--shots') shots = path.resolve(args[++i]);
  else if (args[i] === '-h' || args[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
  else target = args[i];
}
const runs = picked.length ? picked : ['words', 'gate', 'learning', 'profiles', 'speech', 'migrate', 'touch', ...SIZES];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = path.resolve(target ?? path.join(repo, 'wild-world.html'));
if (shots) fs.mkdirSync(shots, { recursive: true });

// main's W1 page, from git, for the migration run (served at /w1.html: the same origin, so the same localStorage)
let w1File = null, w1Dir = null;
function w1Page() {
  if (w1File) return w1File;
  w1Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-w1-'));
  w1File = path.join(w1Dir, 'w1.html');
  fs.writeFileSync(w1File, execFileSync('git', ['-C', repo, 'show', W1_SHA + ':wild-world.html']));
  return w1File;
}
const cleanW1 = () => { try { if (w1Dir) fs.rmSync(w1Dir, { recursive: true, force: true }); } catch {} w1Dir = null; };

// ---- the server: the page at /wild-world.html, W1 at /w1.html, everything else from the repo
let server = null, base = null;
async function serve() {
  server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = u === '/wild-world.html' ? page : u === '/w1.html' ? w1Page() : path.join(repo, path.normalize(u).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(repo) && f !== page && f !== w1File) f = null;
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-spelling-'));
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
process.on('exit', () => { killSync(shared); closeServer(); cleanW1(); });
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => { kill(shared).finally(() => { closeServer(); cleanW1(); process.exit(code); }); });
const HARD_TIMEOUT_MS = 30 * 60 * 1000;
setTimeout(() => { console.error(`hard timeout: over ${HARD_TIMEOUT_MS / 60000} min; closing Chrome`); kill(shared).finally(() => { closeServer(); cleanW1(); process.exit(2); }); }, HARD_TIMEOUT_MS).unref();

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
  const ready = async (what, name = '__ww') => { for (let i = 0; i < 150; i++) { await sleep(200); if (await ev(`document.readyState === "complete" && !!window.${name}`).catch(() => false)) return; } throw new Error('page did not ' + what + ' window.' + name); };
  C.open = async (w, h, touch, q = '', keepStorage = false, file = 'wild-world.html') => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!touch, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: !!touch, maxTouchPoints: touch ? 5 : 0 });
    if (!keepStorage) { await send('Page.navigate', { url: base + 'wild-world.html?blank' }); await sleep(300); await ev('try { localStorage.clear(); } catch (e) {} true').catch(() => {}); }
    await send('Page.navigate', { url: base + file + q });
    await ready('load');
  };
  C.reload = async () => { await send('Page.reload', {}); await sleep(300); await ready('reload'); };
  C.shot = async (name) => { if (!shots) return; const sh = await send('Page.captureScreenshot', { format: 'png' }); if (sh.result?.data) fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(sh.result.data, 'base64')); };
  C.touch = async (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id: id ?? 1, radiusX: 4, radiusY: 4, force: 1 })) });
  C.tap = async (x, y, holdMs = 60) => { await C.touch('touchStart', [[x, y]]); await sleep(holdMs); await C.touch('touchEnd', []); await sleep(120); };
  // tap the middle of the first element matching sel (throws if it isn't on screen)
  C.tapEl = async (sel, holdMs = 60) => {
    const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!r) throw new Error('nothing on screen to tap: ' + sel);
    await C.tap(Math.round(r.x), Math.round(r.y), holdMs); return r;
  };
  return C;
}

// ---- in the page: helpers
const H = String.raw`
  const W = window.__ww, S = () => W.state(), Q = () => W.prompt();
  // the right answer to the open prompt, or a wrong one of the same length
  const right = () => Q().word, wrong = () => { const w = Q().word; return w.slice(0, -1) + (w.slice(-1).toLowerCase() === 'z' ? 'q' : 'z'); };
`;

// ---- the WORDS table
async function runWords(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const html = fs.readFileSync(page, 'utf8'), lines = html.split('\n'), odd = [];
  lines.forEach((l, i) => { for (const ch of l) if (ch.charCodeAt(0) > 127) odd.push({ line: i + 1, ch: ch.codePointAt(0).toString(16), copied: /icon: '<svg…>'/.test(l) }); });
  ok(`no emoji: ${odd.length} non-ASCII characters, all U+2026 in the copied TouchPad header`, odd.every((o) => o.ch === '2026' && o.copied), odd.slice(0, 10));
  const wordsAt = lines.findIndex((l) => /^const WORDS = \{/.test(l)) + 1, moduleAt = lines.findIndex((l) => /<script type="module">/.test(l)) + 1;
  ok(`the WORDS table is near the top of the file (line ${wordsAt} of ${lines.length}, before the game's code at line ${moduleAt})`, wordsAt > 0 && wordsAt < moduleAt && wordsAt < 400, { wordsAt, moduleAt });
  await C.open(1280, 800, false);
  const r = await C.ev(String.raw`(() => { const W = window.__ww, out = { animals: W.ANIMALS.map((a) => a.id), raw: {}, lists: {} };
    for (const [id, w] of Object.entries(W.WORDS)) out.raw[id] = { fact: w.fact, level1: w.level1, level2: w.level2 };
    for (const [id, L] of Object.entries(W.LISTS)) out.lists[id] = { 1: L[1], 2: L[2] };
    return out; })()`);
  const bad = [], counts = [];
  for (const id of r.animals) {
    const w = r.raw[id];
    if (!w) { bad.push(id + ': no entry'); continue; }
    if (!w.fact || w.fact.length < 20 || !/[.!]$/.test(w.fact)) bad.push(id + ': no one-sentence fact');
    const seen = new Set();
    for (const lv of ['level1', 'level2']) {
      const arr = w[lv] || [];
      counts.push(arr.length);
      if (arr.length < 5 || arr.length > 8) bad.push(`${id} ${lv}: ${arr.length} words (5 to 8)`);
      if ((r.lists[id]?.[lv === 'level1' ? 1 : 2] || []).length !== arr.length) bad.push(`${id} ${lv}: the page parsed ${(r.lists[id]?.[lv === 'level1' ? 1 : 2] || []).length} of ${arr.length}`);
      for (const s of arr) {
        const i = s.indexOf(':'), word = s.slice(0, i).trim(), clue = s.slice(i + 1).trim();
        if (i < 0 || !/^[A-Za-z]+$/.test(word)) bad.push(`${id} ${lv}: "${s}" (a word is letters only)`);
        if (word.toLowerCase() === id) bad.push(`${id} ${lv}: its own name is asked anyway`);
        if (seen.has(word.toLowerCase())) bad.push(`${id}: "${word}" twice`); seen.add(word.toLowerCase());
        if (clue.length < 8) bad.push(`${id} ${lv}: "${word}" has no clue`);
        if (/[^\x20-\x7e]/.test(s)) bad.push(`${id}: "${s}" is not plain ASCII`);
      }
    }
  }
  const extra = Object.keys(r.raw).filter((id) => !r.animals.includes(id));
  ok(`all 18 animals have a fact and a level 1 and a level 2 list of 5 to 8 words (${Math.min(...counts)} to ${Math.max(...counts)}), every word letters only, none twice, each with a clue`, r.animals.length === 18 && !bad.length && !extra.length, { bad, extra });
  const lv1 = r.animals.flatMap((id) => r.raw[id].level1.map((s) => s.split(':')[0])), lv2 = r.animals.flatMap((id) => r.raw[id].level2.map((s) => s.split(':')[0]));
  const avg = (a) => a.reduce((s, w) => s + w.length, 0) / a.length;
  ok(`level 1 words are short (average ${avg(lv1).toFixed(1)} letters, longest ${Math.max(...lv1.map((w) => w.length))}), level 2 longer (average ${avg(lv2).toFixed(1)})`, avg(lv1) <= 4.5 && Math.max(...lv1.map((w) => w.length)) <= 6 && avg(lv2) >= 6, { lv1: avg(lv1), lv2: avg(lv2) });
  return out;
}

// ---- the gate: unmet, met, right, wrong, human, tiles and typing
async function runGate(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  const ev = (body) => C.ev(String.raw`(() => { ${H} W.manual(true); W.start(); W.seed(158); ${body} })()`);
  let r = await ev(String.raw`const o = { refused: W.requestChange('lion'), form: S().form, open: Q().open || false, overlay: S().overlay }; return o;`);
  ok(`an animal not met yet can't be changed into (requestChange ${r.refused}, still ${r.form}, no word asked)`, r.refused === false && r.form === 'human' && !r.open && r.overlay === null, r);
  r = await ev(String.raw`W.meet('lion'); const g = W.requestChange('lion'), q = Q(); return { g, q, form: S().form, overlay: S().overlay };`);
  ok(`changing into a met animal asks for a word first (${r.g}; the panel is open, still ${r.form}); the first time it's the name: "${r.q.word}" (${r.q.kind})`, r.g === 'gated' && r.q.open && r.form === 'human' && r.overlay === 'spell' && r.q.word === 'lion' && r.q.kind === 'name', r);
  ok(`level 1 (Guest's) shows the shuffled letters as tiles: ${JSON.stringify(r.q.tiles)}`, r.q.mode === 'tiles' && r.q.tiles.slice().sort().join('') === 'ilno' && r.q.tiles.join('') !== 'lion', r.q);
  r = await ev(String.raw`const tiles = document.querySelectorAll('#spPad .sp-tile').length, keys = document.querySelectorAll('#spPad .sp-key[data-k]').length, inputs = document.querySelectorAll('#spell input, #spell textarea, #spell [contenteditable]').length; return { tiles, keys, inputs };`);
  ok(`on screen: ${r.tiles} letter tiles and an undo key, no input element`, r.tiles === 4 && r.keys === 1 && r.inputs === 0, r);
  // tap the tiles into order (the hook-free way: each tile's own button)
  r = await ev(String.raw`const order = [], q = Q(); for (const ch of q.word) { const i = q.tiles.findIndex((c, k) => c === ch && !order.includes(k)); order.push(i); }
    for (const i of order) document.querySelector('#spPad .sp-tile[data-i="' + i + '"]')._tap(); return { form: S().form, overlay: S().overlay, met: S().met, changes: S().changes };`);
  ok(`tapping the tiles into order changes you (${r.form}) and closes the panel`, r.form === 'lion' && r.overlay === null, r);
  r = await ev(String.raw`const g = W.requestChange('human'); return { g, form: S().form, overlay: S().overlay, open: Q().open };`);
  ok(`changing back to human needs no word (${r.form}, no panel)`, r.form === 'human' && r.overlay === null && !r.open, r);
  // a wrong answer: the spelling shows, you stay human
  r = await ev(String.raw`W.requestChange('lion'); const q = Q(); const a = W.answer(wrong()); return { q, a, form: S().form, overlay: S().overlay, met: S().met };`);
  ok(`a later change asks a word about it (${r.q.word}: "${r.q.clue}"), not the name`, r.q.kind === 'word' && r.q.word !== 'lion' && r.q.animal === 'lion', r.q);
  ok(`a wrong answer doesn't change you (${r.form}) and shows the right spelling letter by letter (shown "${r.a.prompt.shown}", ${r.a.prompt.reveal} letters)`, r.a.right === false && r.form === 'human' && r.a.prompt.done === 'wrong' && r.a.prompt.shown === r.q.word && r.a.prompt.reveal === r.q.word.length && r.overlay === 'spell', r);
  r = await ev(String.raw`const btns = [...document.querySelectorAll('#spPad button')].map((b) => b.id); W.closeOverlay(); return { btns, met: S().met, form: S().form };`);
  ok(`after a miss: NEW WORD and OK; the lion is still in the book (${r.met.join(',')})`, r.btns.join() === 'spAgain,spOk' && r.met.includes('lion'), r);
  // real letter-by-letter reveal in real time
  // (real time: the tiles tapped as they lie, which the shuffle guarantees isn't the word)
  await C.ev(`(() => { const W = window.__ww; W.manual(false); W.requestChange('lion'); const q = W.prompt(); q.tiles.forEach((c, i) => document.querySelector('#spPad .sp-tile[data-i="' + i + '"]')._tap()); return true; })()`);
  const seen = [];
  for (let i = 0; i < 14; i++) { seen.push((await C.ev('window.__ww.prompt().reveal'))); await sleep(140); }
  r = await C.ev(`(() => { const q = window.__ww.prompt(); return { q, form: window.__ww.state().form }; })()`);
  const rising = seen.some((v, i) => i && v > seen[i - 1]) && seen[0] < r.q.word.length;
  ok(`the spelling appears one letter at a time (reveal over time: ${[...new Set(seen)].join(' ')} of ${r.q.word.length})`, r.q.done === 'wrong' && rising && r.q.reveal === r.q.word.length && r.form === 'human', { seen, q: r.q });
  await C.ev(`window.__ww.closeOverlay(); window.__ww.manual(true)`);
  // level 2: the keyboard
  r = await ev(String.raw`W.level(2); W.meet('elephant'); W.requestChange('elephant'); const q = Q();
    const keys = [...document.querySelectorAll('#spPad .sp-key')].map((k) => k.dataset.k), inputs = document.querySelectorAll('#spell input, #spell textarea, #spell [contenteditable]').length, tiles = document.querySelectorAll('#spPad .sp-tile').length;
    return { q, keys, inputs, tiles, clue: document.getElementById('spClue').textContent };`);
  ok(`level 2 types: an on-screen keyboard of ${r.keys.length} keys (a to z, delete, check), no tiles, no input element (no system keyboard)`, r.q.mode === 'type' && r.keys.length === 28 && r.keys.includes('del') && r.keys.includes('ok') && r.tiles === 0 && r.inputs === 0, r);
  ok(`level 2's clue shows the blanks after the first letter: "${r.clue}"`, /E _ _ _ _ _ _ _/.test(r.clue), r.clue);
  r = await ev(String.raw`for (const ch of 'elephant') document.querySelector('#spPad .sp-key[data-k="' + ch + '"]')._tap(); const typed = Q().typed; document.querySelector('#spPad .sp-key[data-k="ok"]')._tap(); return { typed, form: S().form, overlay: S().overlay };`);
  ok(`typing "${r.typed}" on the keys and checking changes you (${r.form})`, r.typed === 'elephant' && r.form === 'elephant' && r.overlay === null, r);
  // a miss never removes an animal: miss five times, everything met stays met and changeable
  r = await ev(String.raw`W.requestChange('human'); W.level(1); const met0 = S().met.slice().sort(); for (let i = 0; i < 5; i++) { W.requestChange('lion'); W.answer(wrong()); W.closeOverlay(); }
    const met1 = S().met.slice().sort(); W.requestChange('lion'); const a = W.answer(right()); return { met0, met1, a, form: S().form };`);
  ok(`five misses later every animal is still met (${r.met1.join(',')}) and a right answer still changes you (${r.form})`, r.met0.join() === r.met1.join() && r.a.right && r.form === 'lion', r);
  // keyboard on a computer: letters type, Enter checks
  r = await ev(String.raw`W.requestChange('human'); W.level(2); W.requestChange('elephant'); return Q();`);
  const word = r.word;
  for (const ch of word) await C.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Key' + ch.toUpperCase(), key: ch, text: ch, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) }), await C.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Key' + ch.toUpperCase(), key: ch, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) });
  const typed = (await C.ev('window.__ww.prompt().typed'));
  await C.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Enter', key: 'Enter', text: '\r', windowsVirtualKeyCode: 13 }); await C.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(900);
  r = await C.ev('window.__ww.state()');
  ok(`on a computer keyboard: typing "${typed}" and Enter changes you (${r.form})`, typed === word.toLowerCase() && r.form === 'elephant', { typed, word, form: r.form });
  return out;
}

// ---- learning: the miss comes back, mastery on three days, known words less often
async function runLearning(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  const ev = (body) => C.ev(String.raw`(() => { ${H} W.manual(true); W.start(); W.seed(7); ${body} })()`);
  // first changes done (names), then a miss on the cow
  let r = await ev(String.raw`for (const a of ['cow', 'pig', 'horse']) { W.meet(a); W.requestChange(a); W.answer(right()); W.requestChange('human'); }
    const seq = []; W.requestChange('cow'); const missed = Q().word; W.answer(wrong()); W.closeOverlay(); seq.push({ word: missed, animal: 'cow', right: false });
    W.requestChange('cow'); const next1 = Q().word; W.answer(right()); seq.push({ word: next1, animal: 'cow' }); W.requestChange('human');
    W.requestChange('pig'); const next2 = Q(); W.answer(right()); seq.push({ word: next2.word, animal: 'pig', back: next2.back, clue: next2.clue, of: next2.of }); W.requestChange('human');
    return { missed, next1, next2, seq };`);
  ok(`after a miss ("${r.missed}") the very next prompt is another word ("${r.next1}"): you try another word`, r.next1 !== r.missed, r);
  ok(`the missed word comes back as the 2nd prompt after the miss, even changing into another animal (the pig asked "${r.next2.word}" with its own clue: "${r.next2.clue}")`, r.next2.word === r.missed && r.next2.back && r.next2.of === 'cow', r);
  r = await ev(String.raw`const p = W.progress(); return p.words[${JSON.stringify(r.missed)}.toLowerCase()];`);
  ok(`answered right on its return, it's learning, with today not counted toward mastery (days ${JSON.stringify(r.days)})`, r.s === 'learning' && r.days.length === 0 && r.missDay != null && r.back == null, r);
  // mastery: three right first tries on three different days (W.ask aims a prompt at one word)
  r = await ev(String.raw`const res = {};
    const tryDays = (word, animal, days) => { for (const d of days) { W.clock(d); W.requestChange('human'); W.ask(animal, word); W.answer(right()); } W.requestChange('human'); return W.progress().words[word]; };
    W.meet('lion'); W.requestChange('lion'); W.answer(right()); W.requestChange('human');
    res.three = tryDays('mane', 'lion', [0, 1, 2]);
    res.two = tryDays('roar', 'lion', [0, 1]);
    res.sameDay = tryDays('pride', 'lion', [3, 3, 3]);
    // a miss on day 4 then right on day 4 again: day 4 doesn't count
    W.clock(4); W.ask('lion', 'meat'); W.answer('meet'); W.closeOverlay(); W.ask('lion', 'meat'); W.answer(right()); W.requestChange('human'); res.missDay = W.progress().words.meat;
    res.missLater = tryDays('meat', 'lion', [5, 6]);
    // a mastered word that's missed slips back to learning, keeping two of its days
    W.clock(9); W.ask('lion', 'mane'); W.answer('mame'); W.closeOverlay(); res.slip = W.progress().words.mane; W.clock(10); W.ask('lion', 'mane'); W.answer('mane'); W.requestChange('human'); res.back = W.progress().words.mane;
    W.clock(0); return res;`);
  ok(`right the first time on 3 different days: mastered (days ${r.three.days.length}, ${r.three.s})`, r.three.s === 'mastered' && r.three.days.length === 3, r.three);
  ok(`on 2 days: not yet (${r.two.s}, ${r.two.days.length} days)`, r.two.s === 'learning' && r.two.days.length === 2, r.two);
  ok(`3 times right on the same day: not mastered (${r.sameDay.s}, ${r.sameDay.days.length} day)`, r.sameDay.s === 'learning' && r.sameDay.days.length === 1 && r.sameDay.right === 3, r.sameDay);
  ok(`a miss stops that day counting (${r.missDay.days.length} days after a miss then a right answer the same day); two later days still leave it 1 short (${r.missLater.days.length}, ${r.missLater.s})`, r.missDay.days.length === 0 && r.missLater.days.length === 2 && r.missLater.s === 'learning', r);
  ok(`a mastered word missed slips back to learning keeping 2 days (${r.slip.s}, ${r.slip.days.length}); right on a new day it's mastered again (${r.back.s})`, r.slip.s === 'learning' && r.slip.days.length === 2 && r.back.s === 'mastered', r);
  // known words come up less often: over 600 prompts for the lion with 'mane' mastered, mane comes up less than any learning word
  r = await ev(String.raw`W.clock(20); const n = {}; for (let i = 0; i < 600; i++) { W.requestChange('human'); W.requestChange('lion'); const q = Q(); n[q.word] = (n[q.word] || 0) + 1; W.answer(right()); }
    W.requestChange('human'); const st = Object.fromEntries(Object.keys(n).map((w) => [w, W.progress().words[w.toLowerCase()]?.s])); W.clock(0); return { n, st };`);
  const ms = Object.entries(r.n).filter(([w]) => r.st[w] === 'mastered'), ls = Object.entries(r.n).filter(([w]) => r.st[w] !== 'mastered');
  const maxM = Math.max(...ms.map(([, c]) => c)), minL = Math.min(...ls.map(([, c]) => c));
  ok(`mastered words come up less often: over 600 prompts for the lion each mastered word (${ms.map(([w, c]) => w + ' ' + c).join(', ')}) came up less than any word still learning (${ls.map(([w, c]) => w + ' ' + c).join(', ')})`, ms.length >= 1 && ls.length >= 1 && maxM > 0 && maxM < minL, r);
  ok(`no word is asked twice in a row (the pick skips the word just asked)`, true);
  r = await ev(String.raw`let last = null, twice = 0; for (let i = 0; i < 200; i++) { W.requestChange('human'); W.requestChange('lion'); const q = Q(); if (q.word === last) twice++; last = q.word; W.answer(right()); } W.requestChange('human'); return twice;`);
  out.pop(); ok(`no word is asked twice in a row (200 prompts: ${r} repeats)`, r === 0, r);
  return out;
}

// ---- profiles: the maker, separate progress, a reload, the parent view
async function runProfiles(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  let r = await C.ev(String.raw`(() => { const W = window.__ww; return { tiles: [...document.querySelectorAll('#who .ptile')].map((t) => t.dataset.id), profiles: W.profiles().map((p) => p.id), who: W.state().who }; })()`);
  ok(`no built-in profiles: the title offers Guest and New (${r.tiles.join(', ')})`, r.tiles.join() === 'guest,new' && r.profiles.join() === 'guest' && r.who === 'guest', r);
  // the maker, through its own buttons (mouse clicks)
  const click = async (sel) => { const p = await C.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`); if (!p) throw new Error('no ' + sel);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await C.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 }); await sleep(60); };
  await click('#who .ptile[data-id="new"]');
  for (const ch of 'max') await click(`#mkKeys .sp-key[data-k="${ch}"]`);
  r = await C.ev('window.__ww.maker()');
  ok(`the maker opens on its own keyboard; tapping m, a, x spells "${r?.name}"`, r?.page === 'name' && r.name === 'Max', r);
  await click('#mkNext'); await click('#mkIcons .mk-ic[data-icon="star"]'); await click('#mkColors .mk-col:nth-child(5)'); await click('#mkNext');
  r = await C.ev(`(() => ({ m: window.__ww.maker(), save: document.getElementById('mkSave').disabled }))()`);
  ok(`then an icon and a color (${r.m.icon}, ${r.m.color}); on the level page SAVE waits for a level`, r.m.page === 'level' && r.m.icon === 'star' && r.save === true, r);
  await click('.mk-lv[data-level="1"]'); await click('#mkSave');
  r = await C.ev(String.raw`(() => { const W = window.__ww; return { profiles: W.profiles(), who: W.state().who, tiles: [...document.querySelectorAll('#who .ptile')].map((t) => t.dataset.id), overlay: W.state().overlay, keys: Object.keys(localStorage).filter((k) => k.startsWith('wildworld.')).sort() }; })()`);
  const max = r.profiles.find((p) => p.name === 'Max');
  ok(`SAVE makes the profile (Max, level ${max?.level}) and picks it; its tile is on the title`, max && max.level === 1 && max.icon === 'star' && r.who === max.id && r.tiles.includes(max.id) && r.overlay === null, r);
  r = await C.ev(String.raw`(() => { const W = window.__ww; return { dup: W.addProfile('max', 'sun', '#ffd23f', 2), guest: W.addProfile('Guest', 'sun', '#ffd23f', 2), bad: W.addProfile('M4x', 'sun', '#ffd23f', 2), sam: W.addProfile('Sam', 'moon', '#b98cff', 2) }; })()`);
  ok(`names are checked: "max" again (${r.dup.why}), "Guest" (${r.guest.why}), "M4x" (${r.bad.why}); Sam is made at level 2`, !r.dup.ok && !r.guest.ok && !r.bad.ok && r.sam.ok && r.sam.level === 2, r);
  const samId = r.sam.id, maxId = max.id;
  // separate progress: Max meets the lion and spells; Sam meets the fox; Guest meets the cow
  const ev = (body) => C.ev(String.raw`(() => { ${H} W.manual(true); W.seed(3); ${body} })()`);
  r = await ev(String.raw`W.profile(${JSON.stringify(maxId)}); W.start(); W.meet('lion'); W.requestChange('lion'); const q1 = Q(); W.answer(right()); W.requestChange('human'); W.requestChange('lion'); const q2 = Q(); W.answer(wrong()); W.closeOverlay();
    const maxP = W.progress(), maxS = S();
    W.openTitle(); W.profile(${JSON.stringify(samId)}); W.start(); const samMet0 = S().met.slice(); W.meet('fox'); W.requestChange('fox'); const q3 = Q(); W.answer(right()); const samP = W.progress(), samS = S();
    W.openTitle(); W.profile('guest'); W.start(); W.meet('cow'); const gS = S();
    return { q1, q2, q3, maxP, maxS, samMet0, samP, samS, gS };`);
  ok(`each profile has its own book: Max ${JSON.stringify(r.maxS.met)}, Sam ${JSON.stringify(r.samS.met)} (none of Max's when picked: ${JSON.stringify(r.samMet0)}), Guest ${JSON.stringify(r.gS.met)}`, r.maxS.met.join() === 'lion' && r.samMet0.length === 0 && r.samS.met.join() === 'fox' && r.gS.met.join() === 'cow', r);
  ok(`and its own words at its own level: Max (level 1, tiles) has ${Object.keys(r.maxP.words).join(', ')}; Sam (level 2, typing) has ${Object.keys(r.samP.words).join(', ')}`, r.q1.mode === 'tiles' && r.q3.mode === 'type' && r.maxP.words.lion && r.maxP.words[r.q2.word.toLowerCase()]?.missed === 1 && !r.samP.words.lion && r.samP.words.fox && !r.maxP.words.fox, r);
  r = await C.ev(`Object.keys(localStorage).filter((k) => k.startsWith('wildworld.')).sort()`);
  ok(`everything is under wildworld.* (${r.join(', ')}); Guest's words aren't saved`, r.includes('wildworld.profiles') && r.includes('wildworld.book.' + maxId) && r.includes('wildworld.words.' + maxId) && r.includes('wildworld.words.' + samId) && r.includes('wildworld.book.guest') && !r.includes('wildworld.words.guest'), r);
  // a reload keeps it all
  await C.ev(`window.__ww.profile(${JSON.stringify(samId)})`);
  await C.reload();
  r = await C.ev(String.raw`(() => { const W = window.__ww, s0 = W.state(), p0 = W.progress(); W.profile(${JSON.stringify(maxId)}); const s1 = W.state(), p1 = W.progress(); return { s0, p0, s1, p1, tiles: [...document.querySelectorAll('#who .ptile.cur')].map((t) => t.dataset.id) }; })()`);
  ok(`a reload keeps who was playing (${r.s0.who === samId ? 'Sam' : r.s0.who}), each book (Sam ${r.s0.met}, Max ${r.s1.met}), each level (${r.s0.level}, ${r.s1.level}) and the word progress`, r.s0.who === samId && r.s0.met.join() === 'fox' && r.s0.level === 2 && r.p0.words.fox?.s === 'learning' && r.s1.met.join() === 'lion' && r.s1.level === 1 && r.p1.words.lion?.s === 'learning' && Object.values(r.p1.words).some((e) => e.missed === 1), r);
  // the parent view: hold 2 s (a mouse here; the touch run holds with a finger)
  const at = await C.ev(`(() => { const r = document.getElementById('parentB').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await C.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y }); await C.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 }); await sleep(500);
  await C.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 }); await sleep(2000);
  const short = await C.ev('window.__ww.state().overlay');
  await C.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 }); await sleep(2300);
  await C.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 }); await sleep(200);
  r = await C.ev('(() => ({ o: window.__ww.state().overlay, p: window.__ww.parent() }))()');
  ok(`the parent view is behind a hold: a half-second press doesn't open it (${short}); holding 2 s does (${r.o})`, short === null && r.o === 'parent', { short, r });
  const maxWords = r.p.words;
  ok(`it opens on who's playing (Max): misses this week ${r.p.missesWeek}, level ${r.p.level}, every word's status (lion ${maxWords.lion}, mane ${maxWords.mane}, savanna not shown at level 1: ${maxWords.savanna === undefined})`, r.p.tab === maxId && r.p.missesWeek === 1 && r.p.level === 1 && maxWords.lion === 'learning' && maxWords.cub && maxWords.savanna === undefined, r.p);
  await C.shot('parent-view');
  r = await C.ev(String.raw`(() => { const W = window.__ww; document.querySelector('.pv-tab[data-id="${samId}"]')._tap(); const a = W.parent(); document.querySelector('.pv-lv[data-level="1"]')._tap(); const b = W.parent(); const saved = JSON.parse(localStorage.getItem('wildworld.profiles')).find((p) => p.id === '${samId}').level;
    document.querySelector('.pv-tab[data-id="guest"]')._tap(); const g = W.parent(); return { a, b, saved, g }; })()`);
  ok(`per profile: Sam's tab (level ${r.a.level}, fox ${r.a.words.fox}, savanna ${r.a.words.savanna}); the parent sets Sam to level ${r.b.level} (saved: ${r.saved})`, r.a.tab === samId && r.a.level === 2 && r.a.words.fox === 'learning' && r.a.words.savanna === 'new' && r.b.level === 1 && r.saved === 1, r);
  ok(`Guest's tab: ${r.g.summary}`, r.g.tab === 'guest' && /Misses this week: 0/.test(r.g.summary), r.g);
  // mastered shows as mastered in the parent view
  r = await C.ev(String.raw`(() => { ${H} W.closeOverlay(); W.profile('${maxId}'); W.manual(true); W.start(); for (const d of [1, 2, 3]) { W.clock(d); W.ask('lion', 'paw'); W.answer('paw'); W.requestChange('human'); } W.clock(0); W.openTitle(); W.openParent(); return W.parent(); })()`);
  ok(`a word right the first time on 3 days shows as mastered there (paw: ${r.words.paw})`, r.words.paw === 'mastered', r);
  await C.ev('window.__ww.closeOverlay()');
  return out;
}

// ---- speech: removed, and there
async function runSpeech(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  let r = await C.ev(String.raw`(() => { ${H} W.manual(true); W.start(); W.meet('dog'); const had = !!window.speechSynthesis; const c0 = W.say.count; W.requestChange('dog'); const q = Q(); W.answer(right()); return { had, c0, q, spoke: W.say.count - c0, last: W.say.last, form: S().form }; })()`);
  if (r.had) ok(`with speech there, the word is spoken in en-US (${r.spoke} time: "${r.last}") and the replay button shows`, r.spoke >= 1 && r.last === 'dog' && r.q.sayShown && r.form === 'dog', r);
  else ok('this Chrome has no speechSynthesis: the with-speech check is skipped (the no-speech checks below still run)', true);
  const id = await C.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: undefined, configurable: true });` });
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { ${H} W.manual(true); W.start(); W.meet('dog'); W.meet('giraffe'); W.requestChange('dog'); const q1 = Q(); W.answer(right()); W.requestChange('human'); W.level(2); W.requestChange('giraffe'); const q2 = Q(); const clue = document.getElementById('spClue').textContent;
    const a = W.answer(right()); return { gone: window.speechSynthesis === undefined, q1, q2, clue, a, form: S().form }; })()`);
  ok(`with speechSynthesis removed: no replay button, the clue written out ("${r.q1.clue}" / "${r.clue}"), and a right answer still changes you (${r.form})`, r.gone && !r.q1.speech && !r.q1.sayShown && r.q1.clue.length > 5 && !r.q2.sayShown && /G _ _ _ _ _ _/.test(r.clue) && r.a.right && r.form === 'giraffe', r);
  r = await C.ev(String.raw`(() => { ${H} W.requestChange('human'); W.requestChange('giraffe'); const q = Q(); W.answer(wrong()); const shown = Q().shown; W.closeOverlay(); return { q, shown, form: S().form }; })()`);
  ok(`and a miss still shows the spelling (${r.shown}) with no speech`, r.shown === r.q.word && r.form === 'human', r);
  await C.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: id.result?.identifier });
  return out;
}

// ---- migrate: a real W1 save
async function runMigrate(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const W1MET = ['horse', 'cow', 'fox', 'eagle', 'lion', 'dolphin'];
  await C.open(1280, 800, false, '', false, 'w1.html');
  let r = await C.ev(String.raw`(() => { const W = window.__ww; W.manual(true); W.start(); for (const a of ${JSON.stringify(W1MET)}) W.meet(a); W.become('fox'); W.toggleView(); return { gate: typeof W.profile, raw: localStorage.getItem('wildworld.save'), keys: Object.keys(localStorage).filter((k) => k.startsWith('wildworld.')) }; })()`);
  const w1 = JSON.parse(r.raw);
  ok(`main's W1 (${W1_SHA}) saved a book: wildworld.save v:${w1.v} with ${w1.met.length} animals, as a fox, first person`, r.gate === 'undefined' && w1.v === 1 && w1.met.length === 6 && w1.form === 'fox' && w1.fp === true && r.keys.join() === 'wildworld.save', r);
  await C.open(1280, 800, false, '', true);
  r = await C.ev(String.raw`(() => { const W = window.__ww, s = W.state(); return { s, raw: localStorage.getItem('wildworld.save'), keys: Object.keys(localStorage).filter((k) => k.startsWith('wildworld.')).sort(), tiles: [...document.querySelectorAll('#who .ptile')].map((t) => t.dataset.id) }; })()`);
  ok(`this page opens it as Guest's book: every met animal (${r.s.met.join(', ')}), the fox, first person`, r.s.who === 'guest' && W1MET.every((a) => r.s.met.includes(a)) && r.s.met.length === 6 && r.s.form === 'fox' && r.s.fp === true, r.s);
  ok(`and writes nothing on load (keys: ${r.keys.join(', ')}; wildworld.save unchanged)`, r.keys.join() === 'wildworld.save' && r.raw === JSON.stringify(w1) || (r.keys.join() === 'wildworld.save' && JSON.stringify(JSON.parse(r.raw)) === JSON.stringify(w1)), r);
  const raw0 = r.raw;
  r = await C.ev(String.raw`(() => { ${H} W.manual(true); W.start(); W.seed(1); W.requestChange('lion'); const q = Q(); W.answer(right()); W.meet('pig');
    return { q, s: S(), book: JSON.parse(localStorage.getItem('wildworld.book.guest')), raw: localStorage.getItem('wildworld.save') }; })()`);
  ok(`the first change asks the name (${r.q.word}) and changes; Guest's book is then written as wildworld.book.guest v:${r.book?.v} with all ${r.book?.met.length} (the 6 plus the pig)`, r.q.kind === 'name' && r.s.form === 'lion' && r.book?.v === 2 && W1MET.every((a) => r.book.met.includes(a)) && r.book.met.includes('pig') && r.book.met.length === 7, r);
  ok(`wildworld.save stays byte for byte as W1 left it (a W1 tab still open only writes its own key)`, r.raw === raw0, { raw: r.raw, raw0 });
  await C.reload();
  r = await C.ev(`(() => ({ s: window.__ww.state() }))()`);
  ok(`a reload keeps Guest's book (${r.s.met.length} animals, the ${r.s.form})`, r.s.met.length === 7 && r.s.form === 'lion', r);
  // a profile made later starts with an empty book; Guest's stays
  r = await C.ev(String.raw`(() => { const W = window.__ww, p = W.addProfile('Max', 'paw', '#5cc8ff', 1); W.profile(p.id); const a = W.state().met.length; W.profile('guest'); return { a, b: W.state().met.length }; })()`);
  ok(`a new profile starts with its own empty book (${r.a}); Guest keeps the ${r.b}`, r.a === 0 && r.b === 7, r);
  return out;
}

// ---- a tap-only round at level 2 (CDP touch), at 568x320
async function runTouch(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(568, 320, true);
  const st = () => C.ev('window.__ww.state()');
  await C.tapEl('#who .ptile[data-id="new"]');
  for (const ch of 'sam') await C.tapEl(`#mkKeys .sp-key[data-k="${ch}"]`);
  await C.tapEl('#mkNext'); await C.tapEl('#mkIcons .mk-ic[data-icon="rocket"]'); await C.tapEl('#mkNext'); await C.tapEl('.mk-lv[data-level="2"]'); await C.tapEl('#mkSave');
  let s = await st(), prof = await C.ev('window.__ww.profile()');
  ok(`taps make a level 2 profile in the maker (${prof.name}, ${prof.icon}, level ${prof.level})`, prof.name === 'Sam' && prof.level === 2 && prof.icon === 'rocket' && s.overlay === null, { prof, s });
  await C.tapEl(`#who .ptile[data-id="${prof.id}"]`); await sleep(300);
  s = await st();
  ok(`a tap on its tile plays as it (${s.screen})`, s.screen === 'play' && s.who === prof.id, s);
  await C.ev(`window.__ww.meet('giraffe')`); await sleep(2600);
  await C.tap(400, 120); await sleep(300);   // a touch on the ground: touch mode on
  await C.tapEl('.tp-root [data-tp="change"]'); await sleep(300);
  await C.tapEl('#ring .wslot[data-id="giraffe"]'); await sleep(300);
  let q = await C.ev('window.__ww.prompt()');
  ok(`the CHANGE button and a tap on the giraffe in the wheel ask for its name, typed (${q.mode}: "${q.clue}")`, q.open && q.word === 'giraffe' && q.mode === 'type', q);
  await C.shot('spell-568x320-type');
  for (const ch of 'giraffe') await C.tapEl(`#spPad .sp-key[data-k="${ch}"]`, 40);
  q = await C.ev('window.__ww.prompt()');
  await C.tapEl('#spPad .sp-key[data-k="ok"]'); await sleep(1000);
  s = await st();
  ok(`tapping g-i-r-a-f-f-e (typed "${q.typed}") and the check key changes you (${s.form})`, q.typed === 'giraffe' && s.form === 'giraffe' && s.overlay === null, { q, s });
  // back to human (pause, BE HUMAN), then a miss, NEW WORD, and a right answer
  await C.tapEl('.tp-root [data-tp="pause"]'); await sleep(250); await C.tapEl('#pHumanBtn'); await sleep(300);
  await C.tapEl('.tp-root [data-tp="change"]'); await sleep(300); await C.tapEl('#ring .wslot[data-id="giraffe"]'); await sleep(300);
  q = await C.ev('window.__ww.prompt()');
  const bad = q.word.toLowerCase().split('').map((c) => (c === 'z' ? 'q' : 'z')).join('');
  for (const ch of bad) await C.tapEl(`#spPad .sp-key[data-k="${ch}"]`, 40);
  await C.tapEl('#spPad .sp-key[data-k="ok"]'); await sleep(450 + 330 * q.word.length + 400);
  let q2 = await C.ev('window.__ww.prompt()'); s = await st();
  ok(`a wrong word ("${bad}" for "${q.word}") leaves you human (${s.form}) and spells it out (${q2.shown})`, q2.done === 'wrong' && q2.shown === q.word && s.form === 'human', { q2, s });
  await C.shot('spell-568x320-miss');
  await C.tapEl('#spAgain'); await sleep(300);
  q2 = await C.ev('window.__ww.prompt()');
  ok(`NEW WORD asks another (${q2.word})`, q2.open && q2.word !== q.word && !q2.done, q2);
  for (const ch of q2.word.toLowerCase()) await C.tapEl(`#spPad .sp-key[data-k="${ch}"]`, 40);
  await C.tapEl('#spPad .sp-key[data-k="ok"]'); await sleep(1000);
  s = await st();
  ok(`spelling it on the keys changes you (${s.form})`, s.form === 'giraffe' && s.overlay === null, s);
  // the parent hold with a finger
  await C.tapEl('.tp-root [data-tp="pause"]'); await sleep(250); await C.tapEl('#pWhoBtn'); await sleep(300);
  await C.tapEl('#parentB', 400); await sleep(2000);
  const short = (await st()).overlay;
  await C.tapEl('#parentB', 2300); await sleep(200);
  s = await st();
  ok(`on the title, a short press on the lock doesn't open the parent view (${short}); a 2 s hold does (${s.overlay})`, short === null && s.overlay === 'parent', { short, s });
  return out;
}

// ---- device lenses
const LAYOUT = String.raw`(() => { const W = innerWidth, H = innerHeight;
  const vis = (e) => { if (!e || !e.getClientRects().length) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0; };
  const box = (e) => { const r = e.getBoundingClientRect(); return { n: e.id || e.dataset.k || e.dataset.i && 'tile' + e.dataset.i || e.dataset.id || e.dataset.icon || e.dataset.color || e.dataset.level || e.className, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const on = (q) => q.l >= -0.5 && q.t >= -0.5 && q.r <= W + 0.5 && q.b <= H + 0.5;
  const hit = (p, q) => p.l < q.r - 0.5 && q.l < p.r - 0.5 && p.t < q.b - 0.5 && q.t < p.b - 0.5;
  const pairs = (list) => { const o = []; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (hit(list[i], list[j])) o.push(list[i].n + ' x ' + list[j].n); return o; };
  const scroll = { x: document.documentElement.scrollWidth - W, y: document.documentElement.scrollHeight - H };
  const check = (sel, extra = []) => { const els = [...document.querySelectorAll(sel)].filter(vis), b = els.map(box), x = extra.map((q) => document.querySelector(q)).filter(vis).map(box), all = [...b, ...x];
    return { n: b.length, off: all.filter((q) => !on(q)).map((q) => q.n), hits: pairs(all), small: b.filter((q) => Math.min(q.w, q.h) < 44 - 0.5).map((q) => q.n + ' ' + Math.round(q.w) + 'x' + Math.round(q.h)), min: Math.round(Math.min(...b.map((q) => Math.min(q.w, q.h)))), scroll }; };
  return { check };
})()`;
async function runSize(C, size) {
  const [w, h] = size.split('x').map(Number), out = [], ok = (name, pass, got) => { out.push({ name: size + ': ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const good = (r) => !r.off.length && !r.hits.length && !r.small.length && r.scroll.x <= 0 && r.scroll.y <= 0;
  await C.open(w, h, true);
  await C.ev(`(() => { const W = window.__ww; W.addProfile('Max', 'star', '#ffd23f', 1); W.addProfile('Sam', 'rocket', '#5cc8ff', 2); W.openTitle(); return true; })()`);
  let r = await C.ev(String.raw`(() => { const L = ${LAYOUT}; return L.check('#title button'); })()`);
  ok(`the title: ${r.n} buttons (3 player tiles, New, PLAY, the parent lock) on screen, none overlapping, each at least 44 px (smallest ${r.min})`, r.n === 6 && good(r), r);
  await C.shot(`ww2-${size}-title`);
  // the spelling panel, level 1 (tiles) and level 2 (keyboard)
  for (const [lv, animal, label] of [[1, 'chicken', 'tiles'], [2, 'elephant', 'keyboard']]) {
    r = await C.ev(String.raw`(() => { const W = window.__ww; W.profile('guest'); W.manual(true); W.start(); W.level(${lv}); W.meet('${animal}'); W.requestChange('human'); W.requestChange('${animal}'); const L = ${LAYOUT};
      const c = L.check('#spell button', ['#spSlots', '#spClue']); return { ...c, q: W.prompt() }; })()`);
    ok(`the spelling panel at level ${lv} (${label}${lv === 2 ? ' open' : ''}: "${r.q.word}"): ${r.n} buttons on screen, none overlapping the clue, the letters or each other, each at least 44 px (smallest ${r.min})`, r.q.open && r.q.mode === (lv === 1 ? 'tiles' : 'type') && r.n === (lv === 1 ? r.q.word.length + 3 : 30) && good(r), r);
    await C.shot(`ww2-${size}-spell-${label}`);
    // the miss screen
    r = await C.ev(String.raw`(() => { const W = window.__ww, q = W.prompt(); W.answer(q.word.slice(0, -1) + 'q'); const L = ${LAYOUT}; const c = L.check('#spell button', ['#spSlots', '#spClue', '#spPad .tried']); return c; })()`);
    ok(`after a miss at level ${lv}: the spelling and its ${r.n} buttons on screen, none overlapping, each at least 44 px`, r.n === 4 && good(r), r);
    if (lv === 2) await C.shot(`ww2-${size}-spell-miss`);
    await C.ev('window.__ww.closeOverlay(); window.__ww.openTitle()');
  }
  // the maker's three pages
  await C.ev(`window.__ww.profile('guest'); window.__ww.openMaker()`);
  r = await C.ev(String.raw`(() => { const L = ${LAYOUT}; window.__ww.Maker.type('m'); window.__ww.Maker.type('o'); return L.check('#maker button', ['#mkName']); })()`);
  ok(`the maker's name page: its keyboard and ${r.n} buttons on screen, none overlapping, each at least 44 px (smallest ${r.min})`, r.n === 29 && good(r), r);
  await C.shot(`ww2-${size}-maker-name`);
  r = await C.ev(String.raw`(() => { const L = ${LAYOUT}; window.__ww.Maker.type('e'); window.__ww.Maker.next(); return L.check('#maker button', ['#mkName']); })()`);
  ok(`the maker's icon and color page: ${r.n} buttons on screen, none overlapping, each at least 44 px (smallest ${r.min})`, r.n === 18 && good(r), r);
  await C.shot(`ww2-${size}-maker-look`);
  r = await C.ev(String.raw`(() => { const L = ${LAYOUT}; window.__ww.Maker.next(); return L.check('#maker button', ['#mkName']); })()`);
  ok(`the maker's level page: ${r.n} buttons on screen, none overlapping, each at least 44 px (smallest ${r.min})`, r.n === 4 && good(r), r);
  await C.shot(`ww2-${size}-maker-level`);
  await C.ev('window.__ww.closeOverlay()');
  // the parent view
  r = await C.ev(String.raw`(() => { const W = window.__ww; W.openParent(); const L = ${LAYOUT}; const c = L.check('#parent button', ['#pvSum']), list = document.getElementById('pvList').getBoundingClientRect(); return { ...c, listH: Math.round(list.height), listOn: list.top >= 0 && list.bottom <= innerHeight + 0.5 }; })()`);
  ok(`the parent view: ${r.n} buttons (close, 3 player tabs, 2 levels) on screen, none overlapping, each at least 44 px; the word list (${r.listH} px tall) scrolls inside it`, r.n === 6 && good(r) && r.listOn && r.listH >= 44, r);
  await C.shot(`ww2-${size}-parent`);
  await C.ev('window.__ww.closeOverlay()');
  // a full house: PROFILE.max profiles. Every title tile and every parent tab can be reached (scrolled to, if its row scrolls)
  const REACH = String.raw`(sel, rowSel) => { const out = []; for (const e of document.querySelectorAll(sel)) { e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = e.getBoundingClientRect(), row = e.closest(rowSel).getBoundingClientRect();
      out.push({ id: e.dataset.id, ok: r.left >= row.left - 0.5 && r.right <= row.right + 0.5 && r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && Math.min(r.width, r.height) >= 43.5 }); } return out; }`;
  r = await C.ev(String.raw`(() => { const W = window.__ww; for (const n of ['Ann', 'Bo', 'Cy', 'Di']) W.addProfile(n, 'sun', '#ff8a3d', 1); W.openTitle(); const reach = ${REACH}; const t = reach('#who .ptile', '.who');
    const L = ${LAYOUT}; const c = L.check('#title .row button, #parentB'); window.scrollTo(0, 0); return { t, c, n: W.profiles().length }; })()`);
  ok(`a full house (${r.n - 1} profiles): every one of the ${r.t.length} title tiles can be reached on screen, PLAY and the lock still fit`, r.n === 7 && r.t.length === 7 && r.t.every((q) => q.ok) && good(r.c), r);
  await C.shot(`ww2-${size}-title-full`);
  r = await C.ev(String.raw`(() => { const W = window.__ww; W.openParent(); const reach = ${REACH}; const t = reach('.pv-tab', '.pv-tabs'); const L = ${LAYOUT}; const c = L.check('#parent button:not(.pv-tab)', ['#pvSum']), list = document.getElementById('pvList').getBoundingClientRect();
    return { t, c, listH: Math.round(list.height) }; })()`);
  ok(`and the parent view's ${r.t.length} tabs can each be reached; the levels and close button still fit and the list keeps ${r.listH} px`, r.t.length === 7 && r.t.every((q) => q.ok) && good(r.c) && r.listH >= 44, r);
  await C.ev('window.__ww.closeOverlay()');
  return out;
}

async function main() {
  await serve();
  const all = []; const unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now(); let timer;
    try {
      const C = await connect(S);
      const job = run === 'words' ? runWords(C) : run === 'gate' ? runGate(C) : run === 'learning' ? runLearning(C) : run === 'profiles' ? runProfiles(C) : run === 'speech' ? runSpeech(C) : run === 'migrate' ? runMigrate(C) : run === 'touch' ? runTouch(C) : runSize(C, run);
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
finally { await kill(shared); closeServer(); cleanW1(); }
process.exit(code);
