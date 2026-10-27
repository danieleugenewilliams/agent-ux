#!/usr/bin/env node
// Robot Battle division check (#142): the ÷ partners of the 81 ordered pairs (a·b ÷ b = a, a and b 1–9) as facts of their own.
//
// Each run is its own headless Chrome (muted, not detached, killed with its profile deleted on every way out, as
// scripts/rb-wiring-lock.mjs does):
//   logic   - at 1280 x 800, through window.__rb:
//             * the 81 facts: every key round-trips (key -> fact -> key), factOf parses '÷54,6', 54 ÷ 6 is 9 and its × partner
//               is 6 × 9; not-facts are refused (55 ÷ 6, 90 ÷ 9, 54 ÷ 0);
//             * Q2: a ÷ fact opens only once its × partner is Known (or Mastered); New and Learning partners keep it locked;
//               one already answered stays open when its partner drops back; a fresh child has none open;
//             * Q3: a ÷ fact climbs New -> Learning -> Known -> Mastered by the same rules as ×: a × fact and a ÷ fact given the
//               same answers (a seeded walk of fast, slow, too slow, wrong and next-day steps) have the same stage, streak,
//               fast days, miss day, review box, due and polish after every step, and Facts.progress reads the same;
//             * × untouched: every × entry, the × New facts in play, the step, the cheers, the ⭐ count and the garage's
//               unlocks are byte-identical before and after hundreds of ÷ answers;
//             * Q5: on for Orion and Apollo (records from before #142 too) and a new profile, off for Guest (and the hook can't
//               turn it on); the parent switch turns it off (no ÷ wire after that) and on, on the live record or a saved one;
//               a reset keeps it; it survives a reload;
//             * Q4, repairs: the wires' facts (Facts.pickWire, as a Quick Fix board asks it) hold at most 1 ÷ fact in any 3 in a
//               row, and a ÷ fact does come while one is waiting; real Quick Fix boards (wave 1 and up) over many robots: ÷ wires
//               in the right share (at most 1 a board, at most 1 in 3 overall, over boards of 1–4 wires), every answer on a board distinct, a matched ÷ wire's decoys near its answer (1–9), its
//               text "54 ÷ 6" (never turned round); a ÷ wire answered right fast, right slow and wrong through the board is
//               recorded with its time, checked against its answer, and moves its stage as × does; colour wiring and Guest
//               get no ÷ wire;
//             * saves: a record from before #142 loads with no ÷ progress; a backup from this build restores here (every
//               choice), and into main (origin/main's robot-battle.html, fetched by git into a temporary copy): main accepts it
//               for every choice and keeps the ÷ facts, then reloads with no page errors; a backup made by main restores here.
//   size    - at each size, Apollo's grid with ÷ facts at every stage, a locked one and a polish: the ×/÷ toggle by touch (a
//             click at desktop), the keyboard (X, and Tab then Enter on the toggle) and the gamepad (X), each switching the grid;
//             on the ÷ grid a cell picked by touch, the arrows and the d-pad, its info showing its progress; every part of the
//             panel on screen with no scrolling, the title, info and legend not overlapping, cells at least 20 px; no answer
//             anywhere (no "=", no answer in the info, the column headers blank, the row headers the divisors, every label
//             "a ÷ b: stage"). Then the parent view on Apollo's tab: its ÷ grid (toggle by touch / keyboard / pad), a ÷ fact's
//             info with its progress and no answer, the slowest ÷ facts, on screen once scrolled to with no sideways overflow;
//             the Division switch beside Quick Fix wiring, each button at least 44 px, changed by touch (a click at desktop)
//             and by the keyboard with the focus kept, saved; the gamepad's buttons leave it as it is.
//
// Usage:
//   node scripts/rb-division.mjs                      # ./robot-battle.html: logic, then every size
//   node scripts/rb-division.mjs --run logic          # one run (repeatable): logic or a size
//   node scripts/rb-division.mjs --shots DIR          # also save screenshots of the ÷ grid and the parent view per size
//   node scripts/rb-division.mjs --main FILE          # main's robot-battle.html (default: git show origin/main:robot-battle.html)
//   node scripts/rb-division.mjs path/or/url.html --json
// Sizes by default: 390x844, 568x320, 667x375, 740x360, 844x390, 768x1024, 820x1180 and 1280x800 (desktop).
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SIZES = ['390x844', '568x320', '667x375', '740x360', '844x390', '768x1024', '820x1180', '1280x800'];
const args = process.argv.slice(2);
let json = false, target = null, shots = null, mainFile = null; const picked = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--run' || args[i] === '--size') picked.push(args[++i]);
  else if (args[i] === '--shots') shots = path.resolve(args[++i]);
  else if (args[i] === '--main') mainFile = path.resolve(args[++i]);
  else if (args[i] === '-h' || args[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
  else target = args[i];
}
const runs = picked.length ? picked : ['logic', ...SIZES];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
target ??= path.join(repo, 'robot-battle.html');
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(path.resolve(target)).href;
if (shots) fs.mkdirSync(shots, { recursive: true });
// main's game, for the backup check: a temporary copy (deleted on the way out) unless --main names one
let mainTmp = null;
function mainUrl() {
  if (mainFile) return pathToFileURL(mainFile).href;
  if (!mainTmp) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-division-main-'));
    fs.writeFileSync(path.join(dir, 'robot-battle.html'), execFileSync('git', ['-C', repo, 'show', 'origin/main:robot-battle.html'], { maxBuffer: 64e6 }));
    mainTmp = dir;
  }
  return pathToFileURL(path.join(mainTmp, 'robot-battle.html')).href;
}
process.on('exit', () => { if (mainTmp) try { fs.rmSync(mainTmp, { recursive: true, force: true }); } catch {} });

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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-division-'));
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
const HARD_TIMEOUT_MS = 40 * 60 * 1000;
setTimeout(() => { console.error(`hard timeout: over ${HARD_TIMEOUT_MS / 60000} min; closing Chrome`); kill(shared).finally(() => process.exit(124)); }, HARD_TIMEOUT_MS).unref();

const KEYS = {};   // code -> [key, windowsVirtualKeyCode]
for (let c = 65; c <= 90; c++) KEYS['Key' + String.fromCharCode(c)] = [String.fromCharCode(c + 32), c];
for (let d = 0; d <= 9; d++) KEYS['Digit' + d] = [String(d), 48 + d];
Object.assign(KEYS, { Enter: ['Enter', 13], Space: [' ', 32], Escape: ['Escape', 27], Backspace: ['Backspace', 8], Tab: ['Tab', 9],
  ArrowLeft: ['ArrowLeft', 37], ArrowUp: ['ArrowUp', 38], ArrowRight: ['ArrowRight', 39], ArrowDown: ['ArrowDown', 40], Minus: ['-', 189], Equal: ['=', 187], Comma: [',', 188], Period: ['.', 190], Slash: ['/', 191] });

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
    for (let i = 0; i < 150; i++) { await sleep(150); if (await ev('document.readyState === "complete" && !!window.__rb').catch(() => false)) return; }
    throw new Error('page did not load window.__rb: ' + u);
  };
  const tap = async (x, y, holdMs = 40) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] }); await sleep(holdMs);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(120);
  };
  const click = async (x, y, holdMs = 0) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); if (holdMs) await sleep(holdMs);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(120);
  };
  const key = async (code, shift = false) => {
    const [k, vk] = KEYS[code] || [code, 0], modifiers = shift ? 8 : 0;
    // (Enter and Space with their text, as a real key sends, so a focused button clicks)
    const text = code === 'Enter' ? '\r' : code === 'Space' ? ' ' : null;
    await send('Input.dispatchKeyEvent', text ? { type: 'keyDown', code, key: k, text, unmodifiedText: text, windowsVirtualKeyCode: vk, modifiers } : { type: 'rawKeyDown', code, key: k, windowsVirtualKeyCode: vk, modifiers }); await sleep(60);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk, modifiers }); await sleep(80);
  };
  // a gamepad button (standard mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 10-11 the sticks,
  // 12-15 the d-pad, 16 Home), pressed for a few frames of the game's own loop
  const padOn = () => ev(`(() => { window.__pad = { id: 'check pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.__pad]; return true; })()`);
  const padBtn = async (n) => { await ev(`(window.__pad.buttons[${n}].pressed = true, window.__pad.buttons[${n}].value = 1, true)`); await sleep(120); await ev(`(window.__pad.buttons[${n}].pressed = false, window.__pad.buttons[${n}].value = 0, true)`); await sleep(120); };
  return { send, ev, open, tap, click, key, padOn, padBtn, errs };
}

// ---- in the page ----
const HELPERS = String.raw`
  const R = window.__rb, F = R.Facts, DAY = 864e5, out = [];
  const ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const js = (x) => JSON.stringify(x);
  const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v) ?? 'null');
  const day = () => R.clock(DAY);
  // answer x fact a x b, or ÷ fact a ÷ b: right fast / right slow / too slow / wrong
  const ans = (op, a, b, how) => { const f = R.factOf({ op, a, b }); const v = how === 'miss' ? f.answer + 1 : f.answer, ms = { fast: 1500, slow: 4000, crawl: 7000, miss: 1500 }[how]; return R.answer(a, b, v, ms, op); };
  // a × fact's entry set straight in the record (setup only): Known (fast on 2 earlier days) or Mastered
  const setX = (a, b, s) => { const f = R.makeFact('×', a, b), t = F.day(), now = F.now();
    F.rec.facts[f.key] = { op: '×', a: f.a, b: f.b, s, streak: 3, n: 4, right: 4, ms: [1500, 1500], hist: [1, 1], days: s === 'mastered' ? [t - 3, t - 2, t - 1] : s === 'known' ? [t - 2, t - 1] : s === 'learning' ? [t - 1] : [], missDay: null, due: now + 5 * DAY, box: 1, miss: false, last: now - DAY };
    F.rec.inPlay = F.rec.inPlay.filter((k) => k !== f.key); F.save(); };
  const ent = (op, a, b) => F.rec.facts[R.factOf({ op, a, b }).key];
`;

// a Quick Fix on a new robot: downed, the mech beside it, its fix opened. Its wires' facts (op, key, answer, text), ports'
// answers and decoys (R.manual(true): nothing moves between the steps)
const QUICKFIX = String.raw`(() => { const R = window.__rb, G = R.Game;
  const m = R.state().players[0]; if (!m) return { ok: false, why: 'nobody playing' };
  const s = R.spawn('charger', m.x + 6, m.z), r = G.robots.find((q) => q.id === s?.id); if (!r) return { ok: false, why: 'no robot spawned' }; R.damage(r.id, 1e6, 'gun'); R.teleport(0, r.pos.x + 2.5, r.pos.z); const c = R.choose(r.id, 'fix');
  const st = R.state().robots.find((q) => q.id === r.id);
  return { ok: !!c.ok, why: c.why ?? null, id: r.id, facts: st?.wires?.facts ?? null, typed: st?.wires?.typed ?? null, answers: st?.wires?.answers ?? null, decoys: st?.board?.decoys ?? [], ports: st?.board?.ports ?? null }; })()`;

async function runLogic(C) {
  const out = [];
  await C.open(1280, 800, false);
  // ---- the facts, Q2 the gate, Q3 the rules, × untouched
  let res = await C.ev(String.raw`(() => { ${HELPERS}
    const keys = R.DIV_FACTS.map((f) => f.key);
    ok('81 ÷ facts, each key once', keys.length === 81 && new Set(keys).size === 81, keys.length);
    ok('every ÷ key round-trips: key -> fact -> key, answer = dividend / divisor, divisor and answer 1–9', R.DIV_FACTS.every((f) => { const g = R.factOf(f.key); return g && g.key === f.key && g.op === '÷' && g.answer * g.b === g.a && g.b >= 1 && g.b <= 9 && g.answer >= 1 && g.answer <= 9; }));
    const f = R.factOf('÷54,6');
    ok("factOf('÷54,6') is 54 ÷ 6 = 9, its × partner 6 × 9", f && f.answer === 9 && R.partnerOf(f)?.key === '×6,9' && R.factOf({ op: '/', a: 54, b: 6 })?.key === '÷54,6', f);
    ok('not ÷ facts are refused: 55 ÷ 6, 90 ÷ 9 (answer 10), 54 ÷ 0, 0 ÷ 5', [[55, 6], [90, 9], [54, 0], [0, 5]].every(([a, b]) => R.makeFact('÷', a, b) === null));
    ok('the × facts keep their keys (7 × 8 and 8 × 7 are ×7,8)', R.makeFact('×', 8, 7)?.key === '×7,8' && R.factOf('×7,8')?.answer === 56);
    // a fresh Apollo
    R.manual(true); localStorage.clear(); R.player('apollo');
    ok('a fresh Apollo: division on, no ÷ fact open', R.division().division === true && R.division().open === 0, R.division());
    let any = false; for (let i = 0; i < 30; i++) if (R.nextWire().op === '÷') any = true;
    ok('... and no ÷ wire with none open (30 wires)', !any);
    // Q2: partners New, Learning, Known, Mastered
    setX(6, 9, 'learning'); setX(7, 8, 'known'); setX(3, 4, 'mastered');
    const open = (a, b) => R.progress(a, b, null, '÷').open;
    ok('a ÷ fact with its × partner Learning is locked (54 ÷ 6, 54 ÷ 9)', !open(54, 6) && !open(54, 9));
    ok('both ÷ partners of a Known × fact open (56 ÷ 8, 56 ÷ 7)', open(56, 8) && open(56, 7));
    ok('both ÷ partners of a Mastered × fact open (12 ÷ 3, 12 ÷ 4)', open(12, 3) && open(12, 4));
    ok('a ÷ fact whose × partner is New (never answered) is locked (63 ÷ 7)', !open(63, 7));
    ok('the open count is 4', R.division().open === 4, R.division());
    let er = R.answer(54, 6, 9, 1500, '÷');
    ok('answering a locked ÷ fact through the hook still records it (it is a fact) ...', er.ok && er.key === '÷54,6', er);
    ok('... and once answered it is open (it stays open: its progress is its own)', open(54, 6) && !open(54, 9));
    delete F.rec.facts['÷54,6']; F.save();
    // 6 x 9 to Known through answers (from scratch): then it opens
    delete F.rec.facts['×6,9']; ans('×', 6, 9, 'fast'); ans('×', 6, 9, 'fast');
    ok('6 × 9 at Learning (2 right in a row): 54 ÷ 6 and 54 ÷ 9 still locked', ent('×', 6, 9).s === 'learning' && !open(54, 6) && !open(54, 9), ent('×', 6, 9).s);
    day(); ans('×', 6, 9, 'fast');
    ok('6 × 9 answered to Known: 54 ÷ 6 and 54 ÷ 9 open', ent('×', 6, 9).s === 'known' && open(54, 6) && open(54, 9), ent('×', 6, 9));
    ans('÷', 54, 6, 'fast'); ans('×', 6, 9, 'miss');
    ok('6 × 9 missed (back to Learning): 54 ÷ 6, answered, stays open; 54 ÷ 9, never answered, locks again', ent('×', 6, 9).s === 'learning' && open(54, 6) && !open(54, 9), { x: ent('×', 6, 9).s });

    // Q3: the same answers to a × fact and a ÷ fact leave them the same (a seeded walk)
    localStorage.clear(); R.player('apollo'); setX(7, 9, 'known');
    let seed = 142; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    // (due and polish are times: the two answers are a millisecond or so apart, so they're compared to the second)
    const sec = (t) => (t ? Math.round(t / 1000) : t ?? null);
    const pick = (e) => ({ s: e.s, streak: e.streak, n: e.n, right: e.right, days: e.days, missDay: e.missDay, due: sec(e.due), box: e.box, miss: e.miss, polish: sec(e.polish), ms: e.ms, hist: e.hist });
    const strip = (p) => { const { key, ...rest } = p; return rest; };
    let same = true, firstBad = null, trace = [], climbed = new Set();
    for (let i = 0; i < 900; i++) {
      const u = rnd(), how = u < 0.45 ? 'fast' : u < 0.6 ? 'slow' : u < 0.68 ? 'crawl' : u < 0.8 ? 'miss' : 'day';
      if (how === 'day') { day(); continue; }
      const px = R.progress(2, 8, null, '×'), pd = R.progress(63, 7, null, '÷');
      const x = ans('×', 2, 8, how), d = ans('÷', 63, 7, how);
      const ex = pick(ent('×', 2, 8)), ed = pick(ent('÷', 63, 7));
      climbed.add(ed.s);
      const pdS = { ...strip(pd) }; delete pdS.open; delete pdS.op; delete pdS.fact; const pxS = { ...strip(px) }; delete pxS.op; delete pxS.fact;
      if (canon(ex) !== canon(ed) || x.right !== d.right || x.fast !== d.fast || x.to !== d.to || canon(pxS) !== canon(pdS)) { same = false; firstBad ??= { i, how, ex, ed, x: x.to, d: d.to, pxS, pdS }; }
      if (i < 12) trace.push(how + ':' + d.to);
    }
    ok('a seeded walk (900 answers, fast / slow / too slow / wrong / next day): 2 × 8 and 63 ÷ 7 have the same stage, streak, fast days, miss day, box, due, polish and progress after every answer', same, firstBad);
    ok('... and the ÷ fact went through every stage (New, Learning, Known, Mastered)', ['new', 'learning', 'known', 'mastered'].every((s) => climbed.has(s)), [...climbed]);
    // the plain climb, step by step
    localStorage.clear(); R.player('apollo'); setX(5, 9, 'known');
    const steps = [];
    steps.push(ans('÷', 45, 9, 'fast').to); steps.push(ans('÷', 45, 9, 'fast').to);
    day(); steps.push(ans('÷', 45, 9, 'fast').to);
    day(); steps.push(ans('÷', 45, 9, 'fast').to);
    ok('45 ÷ 9: New -> (2 right in a row) Learning -> (fast on a 2nd day) Known -> (a 3rd day) Mastered', js(steps) === js(['new', 'learning', 'known', 'mastered']), steps);
    ans('÷', 45, 9, 'miss');
    ok('... a miss: it keeps its ⭐ and needs a polish (#115, as ×)', ent('÷', 45, 9).s === 'mastered' && !!ent('÷', 45, 9).polish);
    ok('... 45 ÷ 9 never joined the × facts in play, nor cheered a table', !F.rec.inPlay.includes('÷45,9') && !Object.keys(F.rec.cheered).length, { inPlay: F.rec.inPlay, cheered: F.rec.cheered });

    // × untouched by ÷ answers
    localStorage.clear(); R.player('apollo');
    for (const [a, b] of [[1, 2], [1, 3], [2, 2], [2, 9]]) { ans('×', a, b, 'fast'); ans('×', a, b, 'fast'); }
    for (const [a, b, s] of [[6, 9, 'known'], [7, 8, 'known'], [3, 4, 'mastered'], [5, 5, 'known'], [4, 9, 'mastered'], [2, 6, 'known']]) setX(a, b, s);
    const xOnly = () => { const r = F.rec, fx = Object.fromEntries(Object.entries(r.facts).filter(([k]) => k[0] === '×'));
      return canon({ fx, inPlay: r.inPlay, step: r.step, opened: r.opened, cheered: r.cheered, unlocks: r.garage.unlocks, mastery: R.mastered(), grid: R.grid().rows, slow: R.Progress.data('apollo').slowest.map((q) => q.key + ':' + q.ms + ':' + q.n) }); };
    const before = xOnly();
    const opened = [...F.divOpen().values()];
    seed = 7; let n = 0;
    for (let i = 0; i < 400; i++) { const f = opened[Math.floor(rnd() * opened.length)], u = rnd(); if (u < 0.1) { day(); continue; } ans('÷', f.a, f.b, u < 0.6 ? 'fast' : u < 0.75 ? 'slow' : u < 0.85 ? 'crawl' : 'miss'); n++; }
    const after = xOnly();
    ok('× progress byte-identical after ' + n + ' ÷ answers (every × entry, × in play, step, cheers, unlocks, ⭐ count, grid, slowest × facts)', before === after, { before: before.slice(0, 300), after: after.slice(0, 300) });
    ok('... and the ÷ answers are there, under their own keys', Object.keys(F.rec.facts).filter((k) => k[0] === '÷').length === opened.length);
    return out; })()`);
  out.push(...res);

  // ---- Q5: the setting
  await C.open(1280, 800, false);
  res = await C.ev(String.raw`(() => { ${HELPERS}
    R.manual(true); localStorage.clear();
    // records as main wrote them (no division field) for Orion and Apollo
    for (const id of ['orion', 'apollo']) { R.player(id); delete F.rec.division; F.save(); }
    ok('Orion and Apollo (records with no division field, as before #142): on', R.player('orion') && R.division().division === true && R.player('apollo') && R.division().division === true);
    const z = R.addProfile('Divvy'); R.player(z.id);
    ok('a new profile: on', R.division().division === true, R.division());
    R.player('guest');
    ok('Guest: off', R.division().division === false);
    const g = R.division(true);
    ok('Guest: the hook can\'t turn it on, and nothing is stored for Guest', !g.ok && g.division === false && localStorage.getItem('robotbattle.facts.guest') == null, g);
    for (const [a, b] of [[6, 9], [7, 8], [3, 4]]) setX(a, b, 'known');
    let gx = 0; for (let i = 0; i < 30; i++) if (R.nextWire().op === '÷') gx++;
    ok('Guest with Known × facts: no ÷ wire in 30', gx === 0, gx);
    // the parent switch, on whoever is playing (Apollo), and on a saved record (Orion)
    R.player('apollo'); for (const [a, b] of [[6, 9], [7, 8], [3, 4]]) setX(a, b, 'known');
    R.parent(true, 'apollo');
    const off = R.parentDo('division', 'apollo', 'off');
    const saved = () => JSON.parse(localStorage.getItem('robotbattle.facts.apollo')).division;
    ok('parent: Apollo off, live and saved, and the view shows it', off.ok && R.division().division === false && saved() === false && off.view.children.find((c) => c.id === 'apollo').division === false, { off: off.ok, saved: saved() });
    let dx = 0; R.nextWire({ reset: true }); for (let i = 0; i < 60; i++) if (R.nextWire().op === '÷') dx++;
    ok('... and no ÷ wire after that (60 wires)', dx === 0, dx);
    const on = R.parentDo('division', 'apollo', 'on');
    dx = 0; R.nextWire({ reset: true }); for (let i = 0; i < 30; i++) if (R.nextWire().op === '÷') dx++;
    ok('parent: Apollo on again (live and saved: no field), and ÷ wires come again', on.ok && R.division().division === true && saved() === undefined && dx > 0, { dx, saved: saved() });
    const flip = R.parentDo('division', 'apollo'), back = R.parentDo('division', 'apollo'), bad = R.parentDo('division', 'apollo', 'maybe');
    ok('with no value it flips (off, on); a value that isn\'t on or off is refused', flip.division === false && back.division === true && !bad.ok, { flip, back, bad: bad.ok });
    const oo = R.parentDo('division', 'orion', 'off');
    ok("on Orion's tab while Apollo plays: Orion's saved record goes off, Apollo stays on", oo.ok && JSON.parse(localStorage.getItem('robotbattle.facts.orion')).division === false && R.division().division === true);
    R.parent(false);
    // a reset keeps it
    R.parent(true, 'orion'); R.parentDo('reset', 'orion'); const rc = R.parentDo('confirm', 'orion'); R.parent(false);
    ok('a reset of Orion keeps division off', rc.ok && JSON.parse(localStorage.getItem('robotbattle.facts.orion')).division === false, rc);
    return out; })()`);
  out.push(...res);
  await C.open(1280, 800, false);
  res = await C.ev(String.raw`(() => { ${HELPERS} R.manual(true); R.player('orion'); const o = R.division().division; R.player('apollo'); const a = R.division().division;
    ok('after a reload: Orion still off, Apollo on', o === false && a === true, { o, a });
    R.player('orion'); R.division(true); return out; })()`);
  out.push(...res);

  // ---- Q4: the share of ÷ wires
  res = await C.ev(String.raw`(() => { ${HELPERS}
    localStorage.clear(); R.manual(true); R.player('apollo');
    for (let a = 1; a <= 9; a++) for (let b = a; b <= 9; b++) setX(a, b, 'known');
    R.nextWire({ reset: true });
    const seq = []; for (let i = 0; i < 300; i++) { const f = R.nextWire(); seq.push(f.op); if (f.op === '÷') ans('÷', f.a, f.b, i % 5 ? 'fast' : 'miss'); else ans('×', f.a, f.b, 'fast'); if (i % 40 === 39) day(); }
    let worst = 0; for (let i = 0; i + 3 <= seq.length; i++) worst = Math.max(worst, seq.slice(i, i + 3).filter((o) => o === '÷').length);
    const nd = seq.filter((o) => o === '÷').length;
    ok('300 wires (Facts.pickWire): at most 1 ÷ in any 3 in a row', worst <= 1, { worst, head: seq.slice(0, 30).join('') });
    ok('... and with ÷ facts waiting, the ÷ share is 1 in 3 (' + nd + ' of 300)', nd >= 90 && nd <= 100, nd);
    return out; })()`);
  out.push(...res);

  // real Quick Fix boards (wave 2: math boards with a band and decoys), Apollo with every × fact Known
  res = [];
  await C.open(1280, 800, false);
  await C.ev(String.raw`(() => { ${HELPERS} localStorage.clear(); R.manual(true); R.player('apollo'); for (let a = 1; a <= 9; a++) for (let b = a; b <= 9; b++) setX(a, b, 'known'); R.start(0); R.waveTo(2); return true; })()`);
  let nWires = 0, nDiv = 0, perBoard = [], distinct = true, decoysOk = true, textOk = true, matched = 0, boards = 0, why = null;
  // (waves 0 (wires by how hard the robot was hit: up to 4), 1–2 (1 wire), 3–4 (2) and 5 on (3): boards of every size)
  for (let i = 0; i < 60; i++) {
    if (i % 15 === 0) await C.ev(`window.__rb.waveTo(${[0, 2, 3, 5][i / 15]})`);
    await C.ev('window.__rb.clock(90e3)');   // (a minute and a half of play between robots: a miss comes back after FACT.missBack)
    const q = await C.ev(QUICKFIX);
    if (!q.ok || !q.facts) { why = q; break; }
    boards++;
    const d = q.facts.filter((f) => f.op === '÷');
    nWires += q.facts.length; nDiv += d.length; perBoard.push(d.length + '/' + q.facts.length);
    const all = [...q.facts.map((f) => f.answer), ...q.decoys];
    if (new Set(all).size !== all.length) distinct = false;
    for (const [j, f] of q.facts.entries()) {
      if (f.op !== '÷') continue;
      if (f.text !== `${f.a} ÷ ${f.b}`) textOk = false;
      if (!q.typed[j]) { matched++; if (!q.decoys.every((v) => v >= 1 && v <= 9)) decoysOk = false; }
    }
    // answer the board's ÷ wires through it (typed: the keypad; matched: the port): right fast, right slow or wrong in turn
    for (const [j, f] of q.facts.entries()) {
      if (f.op !== '÷') continue;
      const how = ['fast', 'slow', 'miss'][(nDiv + j) % 3], value = how === 'miss' ? f.answer + 1 : f.answer, ms = how === 'slow' ? 4000 : 1500;
      const before = await C.ev(`window.__rb.Facts.rec.facts['${f.key}'] ? JSON.parse(JSON.stringify(window.__rb.Facts.rec.facts['${f.key}'])) : null`);
      let r;
      if (q.typed[j]) r = await C.ev(`window.__rb.type(${JSON.stringify(q.id)}, ${j}, ${value}, ${ms})`);
      else { const port = q.answers.findIndex((v) => v === value); if (port < 0) continue; r = await C.ev(`window.__rb.wire(${JSON.stringify(q.id)}, [[${j}, ${port}]], ${ms})`); }
      const after = await C.ev(`JSON.parse(JSON.stringify(window.__rb.Facts.rec.facts['${f.key}'] ?? null))`);
      const log = await C.ev(`(() => { const r = window.__rb.Game.robots.find((x) => x.id === ${JSON.stringify(q.id)}); return r?.wires?.log ? r.wires.log.filter((e) => e.key === '${f.key}').map((e) => ({ ...e })) : [] })()`);
      const L = log[log.length - 1];
      res.push({ name: `board ${boards}: ${f.text} answered ${how} (${q.typed[j] ? 'typed' : 'matched'}): recorded with its time, checked right/wrong, its entry moved on as × does`,
        pass: !!L && L.ms === ms && L.right === (how !== 'miss') && L.fast === (how === 'fast') && after.n === (before?.n || 0) + 1 && after.ms[after.ms.length - 1] === ms && (how === 'miss' ? after.miss === true && after.streak === 0 : after.streak === (before?.streak || 0) + 1),
        got: { L, before, after, r: r?.result ?? r?.results } });
    }
    await C.ev(`window.__rb.leaveFix()`);
  }
  const sizes = new Set(perBoard.map((p) => +p.split('/')[1]));
  res.push({ name: `60 Quick Fix boards opened with math wires (${boards}), of 1, 2, 3 and 4 wires`, pass: boards === 60 && [1, 2, 3, 4].every((n) => sizes.has(n)), got: why ?? [...sizes] });
  res.push({ name: `... ÷ wires in the right share: ${nDiv} of ${nWires}, at most 1 in 3 (one wire's slack) and at least 1 in 5`, pass: nDiv * 3 <= nWires + 3 && nDiv * 5 >= nWires, got: perBoard.join(' ') });
  res.push({ name: '... at most 1 ÷ wire on any board (3 and 4 wires included), and a ÷ wire on boards of 3 and 4', pass: perBoard.every((p) => +p.split('/')[0] <= 1) && perBoard.some((p) => p === '1/3') && perBoard.some((p) => p === '1/4'), got: perBoard.join(' ') });
  res.push({ name: '... every answer on a board distinct (×, ÷ and decoys)', pass: distinct });
  res.push({ name: '... a ÷ wire reads "a ÷ b", never turned round', pass: textOk });
  res.push({ name: `... a matched (New) ÷ wire's decoys are answers 1–9 (${matched} matched)`, pass: decoysOk && matched > 0, got: matched });
  out.push(...res);

  // colour wiring and Guest: no ÷ wires on a board
  await C.open(1280, 800, false);
  res = await C.ev(String.raw`(() => { ${HELPERS} R.manual(true); R.player('apollo'); for (const [a, b] of [[6, 9], [7, 8], [3, 4]]) setX(a, b, 'known'); R.wiring('colour'); R.start(0); R.waveTo(2); return out; })()`);
  let q = await C.ev(QUICKFIX);
  out.push({ name: 'Apollo on colour wiring: the Quick Fix has no facts (no ÷)', pass: q.ok && q.facts == null, got: q });
  await C.ev(`(() => { const R = window.__rb; R.wiring('math'); R.player('guest'); R.start(0); R.waveTo(2); return true; })()`);
  q = await C.ev(QUICKFIX);
  out.push({ name: 'Guest: the Quick Fix has no ÷ wire (colour)', pass: q.ok && !(q.facts || []).some((f) => f.op === '÷'), got: q });

  // ---- saves
  await C.open(1280, 800, false);
  res = await C.ev(String.raw`(() => { ${HELPERS}
    R.manual(true); localStorage.clear(); R.player('apollo');
    ans('×', 2, 3, 'fast'); ans('×', 2, 3, 'fast'); setX(6, 9, 'known'); delete F.rec.division; F.save();
    const raw = localStorage.getItem('robotbattle.facts.apollo');
    ok('(setup) a record as main writes it: no ÷ keys, no division, no divPlay', !/÷|division|divPlay/.test(raw));
    return out; })()`);
  out.push(...res);
  await C.open(1280, 800, false);
  res = await C.ev(String.raw`(() => { ${HELPERS} R.manual(true); R.player('apollo');
    const c = F.divCounts();
    ok('it loads with no ÷ progress (0 answered, 0 Mastered), division on, 6 × 9\'s partners open', c.mastered === 0 && Object.keys(F.rec.facts).every((k) => k[0] === '×') && R.division().division && c.open === 2, c);
    return out; })()`);
  out.push(...res);
  // a backup from this build: ÷ facts for Apollo, Orion off
  const B = await C.ev(String.raw`(() => { ${HELPERS} R.manual(true); R.player('apollo'); ans('÷', 54, 6, 'fast'); ans('÷', 54, 6, 'fast'); day(); ans('÷', 54, 6, 'fast');
    R.player('orion'); R.division(false); R.player('apollo'); return JSON.parse(JSON.stringify(R.backup())); })()`);
  out.push({ name: 'a backup from this build: format 2, Apollo\'s ÷ facts in it, Orion\'s division off', pass: B.format === 2 && B.data['facts.apollo'].facts['÷54,6']?.s === 'known' && B.data['facts.orion'].division === false, got: { format: B.format, e: B.data['facts.apollo']?.facts?.['÷54,6'] } });
  for (const ch of ['backup', 'best', 'device']) {
    res = await C.ev(String.raw`(() => { ${HELPERS} const B = ${JSON.stringify(B)}; localStorage.clear(); R.player(null); const x = R.restore(B, '${ch}'); const a = JSON.parse(localStorage.getItem('robotbattle.facts.apollo') || 'null');
      ok('this build: a fresh device restores it ("${ch}"), Apollo\'s ÷ facts kept', x.ok && a?.facts?.['÷54,6']?.s === 'known', { ok: x.ok, why: x.why });
      return out; })()`);
    out.push(...res);
  }
  // into main
  const MU = mainUrl();
  for (const ch of ['backup', 'best', 'device']) {
    await C.open(1280, 800, false, MU);
    const isMain = await C.ev(`!window.__rb.DIV_FACTS`);
    res = await C.ev(String.raw`(() => { const R = window.__rb, out = []; const B = ${JSON.stringify(B)}; localStorage.clear(); R.manual(true);
      R.player('apollo'); R.answer(2, 3, 6, 1500); R.answer(2, 3, 6, 1500); R.player(null);   // (a device with progress, so 'best' and 'device' merge)
      const x = R.restore(B, '${ch}'); const a = JSON.parse(localStorage.getItem('robotbattle.facts.apollo') || 'null');
      out.push({ name: 'main (${ch}): it accepts a backup from this build', pass: !!x.ok, got: x.why });
      const want = '${ch}' === 'device' ? true : a?.facts?.['÷54,6']?.s === 'known';
      out.push({ name: "main (${ch}): Apollo's ÷ facts kept in the stored record" + ('${ch}' === 'device' ? ' (Keep this device: this device\'s record, as main always does)' : ''), pass: !!a && want, got: a ? Object.keys(a.facts) : null });
      return out; })()`);
    out.push({ name: `(the page is main's: no DIV_FACTS)`, pass: isMain });
    out.push(...res);
    await C.open(1280, 800, false, MU);
    res = await C.ev(String.raw`(() => { const R = window.__rb; R.manual(true); R.player('apollo'); R.start(0); R.parent(true, 'apollo'); R.parent(false); R.showGrid(true); R.showGrid(false);
      return [{ name: 'main (${ch}): reloads, plays and opens the parent view and grid with it', pass: !!R.Facts.rec && R.Facts.rec.child === 'apollo' }]; })()`);
    out.push(...res);
  }
  // a backup made by main restores here
  await C.open(1280, 800, false, MU);
  const BM = await C.ev(String.raw`(() => { const R = window.__rb; localStorage.clear(); R.manual(true); R.player('apollo'); R.answer(2, 3, 6, 1500); R.answer(2, 3, 6, 1500); R.player('orion'); R.answer(4, 5, 20, 1500); return JSON.parse(JSON.stringify(R.backup())); })()`);
  await C.open(1280, 800, false);
  res = await C.ev(String.raw`(() => { ${HELPERS} const B = ${JSON.stringify(BM)}; localStorage.clear(); R.player(null); const x = R.restore(B, 'best'); R.player('apollo');
    ok('a backup made by main restores here: Apollo\'s 2 × 3 Learning, no ÷ progress, division on', x.ok && ent('×', 2, 3)?.s === 'learning' && F.divCounts().mastered === 0 && R.division().division === true, { ok: x.ok, why: x.why });
    return out; })()`);
  out.push(...res);
  return out;
}

// Apollo for the sizes: × facts Known / Mastered so ÷ facts open, then ÷ facts at every stage through answers:
//   56 ÷ 8 Known (days [d1, today]); 56 ÷ 7 Learning; 12 ÷ 4 Mastered; 12 ÷ 3 Mastered needing a polish; 45 ÷ 9 New, streak 1;
//   63 ÷ 7 locked (7 × 9 never answered); 54 ÷ 6 open, never answered
const SEED = String.raw`(() => { ${HELPERS}
  R.manual(true); localStorage.clear(); R.player('apollo');
  for (const [a, b, s] of [[7, 8, 'known'], [3, 4, 'mastered'], [5, 9, 'known'], [6, 9, 'known']]) setX(a, b, s);
  ans('÷', 56, 8, 'fast'); ans('÷', 56, 8, 'fast'); ans('÷', 12, 4, 'fast'); ans('÷', 12, 4, 'fast'); ans('÷', 12, 3, 'fast'); ans('÷', 12, 3, 'fast');
  day(); ans('÷', 12, 4, 'fast'); ans('÷', 12, 3, 'fast');
  day(); ans('÷', 12, 4, 'fast'); ans('÷', 12, 3, 'fast'); ans('÷', 12, 3, 'miss'); ans('÷', 56, 8, 'fast');
  ans('÷', 56, 7, 'fast'); ans('÷', 56, 7, 'fast'); ans('÷', 45, 9, 'slow');
  R.start(0); return F.divCounts(); })()`;
const BOX = String.raw`((sel, root) => {
  const W = innerWidth, H = innerHeight, bad = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
    if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) bad.push({ el: (el.id || el.className?.baseVal || el.className || el.tagName) + '', l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) });
  }
  const p = root && document.querySelector(root);
  return { W, H, bad: bad.slice(0, 8), scrollY: p ? p.scrollHeight - p.clientHeight : null, scrollX: p ? p.scrollWidth - p.clientWidth : null, docX: document.documentElement.scrollWidth - W };
})`;
const STACK = String.raw`(() => {
  const R = (el) => el.getBoundingClientRect(), bad = [], q = (s) => document.querySelector(s);
  const [t, i, l] = [R(q('#grid .panel .top')), R(q('#gridInfo')), R(q('#gridLegend'))];
  if (t.bottom > i.top + 0.5) bad.push({ top: Math.round(t.bottom), info: Math.round(i.top) });
  if (i.bottom > l.top + 0.5) bad.push({ info: Math.round(i.bottom), legend: Math.round(l.top) });
  for (const [box, sel] of [[t, '#grid .panel .top > *'], [i, '#gridInfo *'], [l, '#gridLegend *']]) for (const el of document.querySelectorAll(sel)) {
    const r = R(el); if (!r.width && !r.height) continue;
    if (el.closest('.polm')) continue;
    if (r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5 || r.left < box.left - 0.5 || r.right > box.right + 0.5) bad.push({ el: (el.className?.baseVal ?? el.className) || el.tagName, t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right), boxL: Math.round(box.left), boxR: Math.round(box.right) });
  }
  // the top row's parts side by side, not over each other
  const kids = [...q('#grid .panel .top').children].map(R).filter((r) => r.width);
  for (let a = 0; a < kids.length; a++) for (let b = a + 1; b < kids.length; b++) if (kids[a].right > kids[b].left + 0.5 && kids[b].right > kids[a].left + 0.5 && kids[a].bottom > kids[b].top + 0.5 && kids[b].bottom > kids[a].top + 0.5) bad.push({ overlap: [a, b] });
  return bad.slice(0, 8);
})()`;
const READ = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const rd = (n) => { let s = ''; for (const c of n.childNodes) s += c.nodeType === 3 ? c.data : c.nodeType !== 1 ? '' : c.matches('svg.ic') ? '{' + c.dataset.icon + '}' : rd(c); return s; };
  const need = el.querySelector('[data-want]'); return { text: rd(el).replace(/\\s+/g, ' ').trim(), have: need ? +need.dataset.have : null, want: need ? +need.dataset.want : null, today: el.querySelector('[data-today]')?.dataset.today ?? null }; })()`;
const AT = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, hit: !!top && (top === el || el.contains(top)) }; })()`;
// no answer in a fact's info: no "=", and the answer isn't a number in it once the fact itself and its typical time are taken out
const noAnswer = (text, f) => { if (!text || text.includes('=')) return false; const rest = text.replace(`${f[0]} ÷ ${f[1]}`, ' ').replace(/\d+(\.\d+)? s\b/g, ' '); return !new RegExp('(^|[^0-9.])' + (f[0] / f[1]) + '([^0-9]|$)').test(rest); };

// a gamepad button pressed and let go across steps of the game's own tick (R.step: the check runs in manual mode, so the loop
// that reads the pad runs only when stepped)
const padStep = async (C, n) => { await C.ev(`(window.__pad.buttons[${n}].pressed = true, window.__pad.buttons[${n}].value = 1, window.__rb.step(2), true)`); await C.ev(`(window.__pad.buttons[${n}].pressed = false, window.__pad.buttons[${n}].value = 0, window.__rb.step(2), true)`); };
async function runSize(C, size) {
  const [w, h] = size.split('x').map(Number), touch = w < 1200, desk = !touch;
  const out = [], ok = (name, pass, got) => { out.push({ name: size + ': ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const shot = async (name) => { if (!shots) return; const s = await C.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, `${name}-${size}.png`), Buffer.from(s.result.data, 'base64')); };
  const press = async (c) => (touch ? C.tap(c.x, c.y) : C.click(c.x, c.y));
  await C.open(w, h, touch);
  await C.ev(SEED);
  await C.ev('__rb.showGrid(true)');
  const st = () => C.ev('window.__rb.state().progress.op');
  // the toggle: touch / click on ÷
  let c = await C.ev(AT('#gridOp .gopb'));
  ok('the grid has a ×/÷ toggle, at least 44 px and on top', c && c.w >= 44 && c.h >= 44 && c.hit, c);
  if (c) await press(c);
  ok(`${touch ? 'a tap' : 'a click'} on ÷ shows the ÷ grid`, (await st()) === '÷', await st());
  const fit = async (label, f) => {
    const b = await C.ev(BOX + `('#grid .panel, #grid .panel .top, #grid .panel .top *, #gridCells .cell, #gridInfo, #gridInfo *, #gridLegend, #gridLegend .lg', '#grid .panel')`);
    ok(`${label}: everything on screen, no scrolling`, b.bad.length === 0 && b.scrollY <= 1 && b.scrollX <= 1 && b.docX <= 0, b);
    const s = await C.ev(STACK);
    ok(`${label}: the top row, info and legend don't overlap; their parts inside them`, s.length === 0, s);
    if (f) { const g = await C.ev(READ('#gridInfo')); ok(`${label}: no answer in the info`, noAnswer(g?.text, f), g); return g; }
  };
  const g0 = await C.ev(`window.__rb.grid(null, '÷')`);
  ok('÷ grid: the headers are ÷, 9 blanks and the divisors 1–9 (no answers)', g0.heads && g0.heads.join('|') === ['÷', ...Array(9).fill(''), 1, 2, 3, 4, 5, 6, 7, 8, 9].join('|'), g0.heads);
  ok('÷ grid: every cell labelled "a ÷ b: stage", none with "="', g0.labels?.length === 81 && g0.labels.every((l) => /^\d+ ÷ \d: (New|Learning|Known|Mastered|locked)(, needs a polish)?$/.test(l)), g0.labels?.slice(0, 5));
  ok('÷ grid: the cells show the stages (Known, Learning, Mastered, locked) as Facts has them', g0.dom && JSON.stringify(g0.dom) === JSON.stringify(g0.rows) && g0.rows[7][6] === 'known' && g0.rows[6][7] === 'learning' && g0.rows[3][2] === 'mastered' && g0.rows[6][8] === 'locked', g0.rows);
  const cell = await C.ev(AT('#gridCells .cell[data-key="÷56,8"]'));
  ok('÷ grid: cells at least 20 px', cell && cell.w >= 20, cell);
  await fit('÷ grid, nothing picked');
  // a cell by touch
  if (cell) await press(cell);
  let g = await fit('÷ grid 56 ÷ 8 (Known)', [56, 8]);
  ok(`÷ grid: ${touch ? 'a tap' : 'a click'} on 56 ÷ 8 shows it, its pips 2 of 3, today counted`, g?.text.includes('56 ÷ 8') && g.have === 2 && g.want === 3 && g.today === 'counted' && g.text.includes('1 more fast day to {star}'), g);
  await shot('div-grid');
  // the keyboard: the arrows (56 ÷ 8 is row 8, place 7: up one is 49 ÷ 7, right one 56 ÷ 7)
  await C.key('ArrowUp'); await C.key('ArrowRight');
  g = await fit('÷ grid 56 ÷ 7 (Learning)', [56, 7]);
  ok('÷ grid by keyboard: up, right lands on 56 ÷ 7 (Learning) with its progress', g?.text.includes('56 ÷ 7') && g.want === 2 && g.text.includes('{star}'), g);
  // the gamepad's d-pad, through the game's own loop
  await C.padOn(); await sleep(150);
  await padStep(C, 13); await padStep(C, 15);   // down, right: from 56 ÷ 7 (row 7, place 8) to 72 ÷ 8 (row 8, place 9)
  g = await C.ev(READ('#gridInfo'));
  ok('÷ grid by gamepad d-pad: down, right lands on 72 ÷ 8', g?.text.includes('72 ÷ 8'), g);
  await padStep(C, 12); await padStep(C, 14);   // and back
  g = await C.ev(READ('#gridInfo'));
  ok('÷ grid by gamepad d-pad: up, left lands back on 56 ÷ 7', g?.text.includes('56 ÷ 7'), g);
  // the other stages fit, and show no answer
  for (const [a, b, label, want] of [[12, 4, 'mastered', '{star} Mastered!'], [12, 3, 'polish', '{sparkle}'], [45, 9, 'new', 'in a row 1/2'], [63, 7, 'locked', 'opens when its {times} is {known}'], [54, 6, 'open, never answered', '3 fast days to {star}']]) {
    const r = await C.ev(`window.__rb.tapCell(${a}, ${b})`);
    const gi = await fit(`÷ grid ${a} ÷ ${b} (${label})`, [a, b]);
    ok(`÷ grid ${a} ÷ ${b} (${label}) shows "${want}"`, r?.op === '÷' && gi?.text.includes(`${a} ÷ ${b}`) && gi.text.includes(want), gi);
  }
  await C.ev(`window.__rb.tapCell(63, 7)`); await shot('div-grid-locked');
  // switch back and forth: the keyboard's X, Tab + Enter on the toggle, the pad's X
  await C.key('KeyX');
  ok('keyboard X: back to the × grid', (await st()) === '×' && !!(await C.ev(`document.querySelector('#gridCells .cell:not([data-op])')`) ?? true), await st());
  await fit('× grid after the toggle');
  await C.key('KeyX');
  ok('keyboard X again: the ÷ grid', (await st()) === '÷', await st());
  let tabbed = false;
  for (let i = 0; i < 160 && !tabbed; i++) { await C.key('Tab'); tabbed = await C.ev(`document.activeElement?.matches?.('#gridOp .gopb') ?? false`); }
  if (tabbed) await C.key('Enter');
  ok('keyboard Tab to the toggle and Enter: the × grid, the focus kept on the toggle', tabbed && (await st()) === '×' && (await C.ev(`document.activeElement?.matches?.('#gridOp .gopb') ?? false`)), { tabbed, op: await st() });
  await padStep(C, 2);
  ok('gamepad X: the ÷ grid', (await st()) === '÷', await st());
  await padStep(C, 2);
  ok('gamepad X again: the × grid', (await st()) === '×', await st());
  await C.ev('__rb.showGrid(false)');
  // division off: the grid has no toggle, X does nothing
  await C.ev(`(() => { window.__rb.division(false); window.__rb.showGrid(true); return true; })()`);
  const noTog = await C.ev(`document.querySelectorAll('#gridOp .gopb').length`);
  await C.key('KeyX');
  ok('division off: no toggle on the grid, and X stays on ×', noTog === 0 && (await st()) === '×', { noTog, op: await st() });
  await C.ev(`(() => { window.__rb.showGrid(false); window.__rb.division(true); return true; })()`);

  // ---- the parent view
  await C.ev(`window.__rb.parent(true, 'apollo')`);
  c = await C.ev(AT('#pBody .pgop .gopb'));
  ok('parent: a ×/÷ toggle over the grid, at least 44 px and on top', c && c.w >= 44 && c.h >= 44 && c.hit, c);
  if (c) await press(c);
  ok(`parent: ${touch ? 'a tap' : 'a click'} on ÷ shows the ÷ grid`, (await st()) === '÷', await st());
  const pg = await C.ev(`window.__rb.grid('apollo', '÷')`);
  ok('parent ÷ grid: the headers the divisors only, every label "a ÷ b: stage", the stages as Facts has them', pg.heads?.join('|') === ['÷', ...Array(9).fill(''), 1, 2, 3, 4, 5, 6, 7, 8, 9].join('|') && pg.labels.every((l) => !l.includes('=')) && JSON.stringify(pg.dom) === JSON.stringify(pg.rows), { heads: pg.heads });
  c = await C.ev(AT('#pBody .fgrid .cell[data-key="÷56,8"]'));
  ok('parent ÷ grid: cells on top once scrolled to', c && c.hit && c.w >= 14, c);
  if (c) await press(c);
  let pi = await C.ev(READ('#pBody .pgrid .ginfo'));
  ok(`parent: ${touch ? 'a tap' : 'a click'} on 56 ÷ 8 shows its progress (fast days 2/3 -> Mastered, today counted), no answer`, pi?.text.includes('56 ÷ 8') && pi.text.includes('fast days 2/3') && pi.today === 'counted' && noAnswer(pi.text, [56, 8]), pi);
  const pb = await C.ev(`(() => { document.querySelector('#pBody .pgrid .ginfo').scrollIntoView({ block: 'nearest' }); return true; })()`) && await C.ev(BOX + `('#pBody .pgrid .ginfo, #pBody .pgrid .ginfo *', '#parentPanel')`);
  ok('parent: the fact\'s info on screen once scrolled to, no sideways overflow', pb.bad.length === 0 && pb.scrollX <= 1 && pb.docX <= 0, pb);
  const pt = await C.ev(`(() => { document.querySelector('#pBody .pgop').scrollIntoView({ block: 'nearest' }); return true; })()`) && await C.ev(BOX + `('#pBody .pgop, #pBody .pgop *', '#parentPanel')`);
  ok('parent: the toggle on screen once scrolled to', pt.bad.length === 0 && pt.scrollX <= 1, pt);
  await C.ev(`document.querySelector('#pBody .pgrid .ginfo').scrollIntoView({ block: 'nearest' })`);
  await shot('parent-div');
  const slow = await C.ev(`[...document.querySelectorAll('#pBody .pslow li')].map((l) => l.textContent.trim())`);
  ok('parent: the slowest list is of ÷ facts, written without answers', slow.length > 0 && slow.every((t) => /^\d+ ÷ \d/.test(t) && !t.includes('=')), slow);
  await C.ev(`window.__rb.tapCell ? true : true`);
  await C.ev(String.raw`(() => { const P = window.__rb.Progress; P.psel = [7, 9]; P.drawParent(); return true; })()`);   // 63 ÷ 7, locked
  pi = await C.ev(READ('#pBody .pgrid .ginfo'));
  ok('parent: a locked fact says it opens once its × partner is Known, without naming it (that would be its answer)', pi?.text.includes('63 ÷ 7') && /Locked/.test(pi.text) && !pi.text.includes('7 × 9') && !pi.text.includes('9 × 7') && noAnswer(pi.text, [63, 7]), pi);
  await C.key('KeyX');
  ok('parent: keyboard X back to the × grid', (await st()) === '×', await st());
  await C.padOn(); await sleep(100); await padStep(C, 2);
  ok('parent: gamepad X to the ÷ grid', (await st()) === '÷', await st());
  // the division switch, beside Quick Fix wiring
  const sw = await C.ev(String.raw`(() => { const g = [...document.querySelectorAll('#pBody .psets .pset')]; const d = g.find((x) => x.querySelector('[data-act="division"]')); if (!d) return null; d.scrollIntoView({ block: 'nearest' });
    const W = g.find((x) => x.querySelector('[data-act="wiring"]')), r = d.getBoundingClientRect(), rw = W.getBoundingClientRect();
    const btn = [...d.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(), t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return { w: q.width, h: q.height, hit: !!t && (t === b || b.contains(t)), cut: b.scrollWidth > b.clientWidth + 1, in: q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight }; });
    return { siblings: d.parentElement === W.parentElement, beside: Math.abs(r.top - rw.top) < 2 || r.top >= rw.bottom - 1, btn, docX: document.documentElement.scrollWidth - innerWidth, pressed: [...d.querySelectorAll('button')].map((b) => b.dataset.w + ':' + b.getAttribute('aria-pressed')).join(' ') }; })()`);
  ok('parent: the Division switch sits beside Quick Fix wiring (same row, or wrapped under it), on, its buttons at least 44 px, on screen, text not cut, nothing over them', sw && sw.siblings && sw.beside && sw.btn.every((b) => b.w >= 44 && b.h >= 44 && b.hit && !b.cut && b.in) && sw.docX <= 0 && sw.pressed === 'on:true off:false', sw);
  await shot('parent-switch');
  const saved = () => C.ev(`JSON.parse(localStorage.getItem('robotbattle.facts.apollo')).division ?? 'on'`);
  c = await C.ev(AT('#pBody [data-act="division"][data-w="off"]'));
  if (c) await press(c);
  ok(`parent: ${touch ? 'a tap' : 'a click'} on Off turns Apollo's division off, saved`, (await saved()) === false && (await C.ev('window.__rb.division().division')) === false, await saved());
  let tb = false;
  for (let i = 0; i < 40 && !tb; i++) { await C.key('Tab', true); tb = await C.ev(`document.activeElement?.matches?.('[data-act="division"][data-w="on"]') ?? false`); }
  if (tb) await C.key('Enter');
  ok('parent: keyboard Shift+Tab to On and Enter: on, saved, the focus kept on On', tb && (await saved()) === 'on' && (await C.ev(`document.activeElement?.matches?.('[data-act="division"][data-w="on"]') ?? false`)), { tb, saved: await saved() });
  for (let i = 0; i < 30; i++) { await C.key('Tab'); if (await C.ev(`document.activeElement?.matches?.('[data-act="division"][data-w="off"]') ?? false`)) break; }
  await C.key('Space');
  ok('parent: keyboard Tab to Off and Space: off, saved', (await saved()) === false, await saved());
  await C.ev(`window.__rb.parentDo('division', 'apollo', 'on')`);
  const seen = [];
  for (const b of [0, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16]) { await padStep(C, b); seen.push(await saved()); }
  ok('parent: (the pad reaches the view: still open after them, and X switched its grid)', (await C.ev('window.__rb.state().progress.ui')) === 'parent', await C.ev('window.__rb.state().progress.ui'));
  ok('parent: the gamepad\'s buttons (all but B and Start, which close it) leave division as it is', seen.every((v) => v === 'on'), seen);
  await C.ev(`window.__rb.parent(false)`);
  return out;
}

async function main() {
  const all = []; let unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now();
    try {
      const C = await connect(S);
      const res = run === 'logic' ? await runLogic(C) : await runSize(C, run);
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
