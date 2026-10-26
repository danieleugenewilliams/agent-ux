#!/usr/bin/env node
// Robot Battle wiring lock check (#134): only a parent changes a child's Quick Fix wiring (rec.wiring, math or colour).
// It's a per-child switch in the parent view (behind the PARENT.hold hold); nothing a child reaches changes it.
//
// Each run is its own headless Chrome (muted, not detached, killed with its profile deleted on every way out, as
// scripts/rb-modes.mjs does):
//   logic        - at 1280 x 800, through window.__rb:
//                  * existing records keep their mode: a stored record on math and one on colour load as they are (nothing
//                    is migrated), and a new profile starts on math;
//                  * the parent switch, both directions, on whoever is playing: math -> colour -> math through
//                    __rb.parentDo('wiring', child, mode), each saved, and the next Quick Fix uses it (r.wires.facts: a fact
//                    per plug in math wiring, none in colour); the same mid-run (paused, the parent view, back to play);
//                    on another child's tab only that child's stored record changes; a child with no record yet gets one;
//                    it survives a reload; the parent view shows it (data(c).wiring and the buttons' aria-pressed);
//                  * Guest: colour wiring, a Quick Fix with no facts, no Guest tab in the parent view, and the hook refuses
//                    to put Guest on math;
//                  * backups, both ways (device math / backup colour and device colour / backup math): "Use the backup" takes
//                    the backup's wiring, "Keep the best" and "Keep this device" keep this device's (as before #134), a
//                    fresh device takes the backup's, and the file carries rec.wiring;
//                  * the gamepad in the parent view doesn't change it (the view's buttons are touch and keyboard, as before).
//   sweep-mouse  - (a run per screen: sweep-mouse:who, :pick, :play, :pause, :garage:<tab>) at 1280 x 800, Apollo on math: every visible control on who's playing, the pilot pick, play (the HUD), the
//   sweep-touch  - at 844 x 390 with touch, Orion on colour (the touch pause menu):
//                  pause screen and each garage tab is clicked (a tap with touch) after a reload into that screen, and then
//                  every control that click brought up, in turn; then Tab to each focusable control and Enter, and again
//                  with Space; then every game key; then every gamepad button (a stubbed navigator.getGamepads read by the
//                  game's own loop). After each, the playing child's live rec.wiring and both children's stored records are
//                  what they were seeded with. The counts swept are reported, so an empty sweep can't pass.
//   size         - at each size, a child with a 10-letter name and the wave chip showing (the widest kidbar): no wiring chip
//                  on the pilot pick or the pause screen, the kidbar and the pilots on screen, clear of each other, the parent
//                  button and the health bar, at least 44 px, no page overflow; then the parent view opened by the real hold
//                  (a touch or mouse press on the parent button for PARENT.hold): the wiring switch on screen once scrolled to,
//                  each button at least 44 px, its text not cut, nothing over it, and room beside it for a second switch
//                  (#142's: a copy of the group put next to it fits on the same row or wraps under it, on screen); changed by
//                  touch (a click at desktop) to colour, then by the keyboard (Tab to math, Enter; Tab to colour, Space; Tab
//                  back, Enter) with the focus kept on the button pressed; each change saved.
//
// Usage:
//   node scripts/rb-wiring-lock.mjs                        # ./robot-battle.html: logic, both sweeps, then every size
//   node scripts/rb-wiring-lock.mjs --run logic            # one run (repeatable): logic, sweep-mouse, sweep-touch or a size
//   node scripts/rb-wiring-lock.mjs --size 568x320         # one size only (repeatable)
//   node scripts/rb-wiring-lock.mjs --shots DIR            # also save a screenshot of the pilot pick and the parent view per size
//   node scripts/rb-wiring-lock.mjs path/or/url.html --json
// Sizes by default: 390x844, 568x320, 667x375, 740x360, 844x390, 768x1024, 820x1180 and 1280x800 (desktop). Each run is its
// own Chrome launch.
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SIZES = ['390x844', '568x320', '667x375', '740x360', '844x390', '768x1024', '820x1180', '1280x800'];
const args = process.argv.slice(2);
let json = false, target = null, shots = null; const picked = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--run' || args[i] === '--size') picked.push(args[++i]);
  else if (args[i] === '--shots') shots = path.resolve(args[++i]);
  else if (args[i] === '-h' || args[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
  else target = args[i];
}
// (each sweep is a run per screen, each its own Chrome: 'sweep-mouse' alone means all of its screens)
const SCREENS = ['who', 'pick', 'play', 'pause', 'garage:trophies', 'garage:mech', 'garage:squad', 'garage:paint', 'garage:body'];
const runs = (picked.length ? picked : ['logic', 'sweep-mouse', 'sweep-touch', ...SIZES]).flatMap((r) => (/^sweep-(mouse|touch)$/.test(r) ? SCREENS.map((q) => r + ':' + q) : [r]));
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
target ??= path.join(repo, 'robot-battle.html');
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(path.resolve(target)).href;
if (shots) fs.mkdirSync(shots, { recursive: true });

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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-wiring-'));
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
// what wiring each child has: the playing child's live record (live) and every seeded child's stored record (saved)
const READ = (ids) => `(() => { const R = window.__rb, out = { playing: R.Game.child?.id ?? null, live: R.Facts.rec ? R.Facts.rec.wiring : null, saved: {} };
  for (const id of ${JSON.stringify(ids)}) { const s = localStorage.getItem('robotbattle.facts.' + id); out.saved[id] = s ? JSON.parse(s).wiring : null; } return out; })()`;
// where the screen is, to tell when a key or a button moved it on (then the sweep reloads into the screen before going on)
const WHERE = `(() => { const R = window.__rb, s = R.state(), G = R.Game; return JSON.stringify({ t: s.title, ui: s.progress.ui, gar: R.garage().on ? R.garage().tab : null, st: G.state, p: !!G.paused,
  wp: !!document.querySelector('#start .wpick.on'), mk: !!s.who?.maker, fix: !!document.querySelector('#fix.on, #picker.on, #bag.on, #mend.on, #home.on, #namer.on'), clr: !!s.clearScreen }); })()`;
// every control a tap would reach now: a button, chip, tile or other clickable thing on screen, the topmost at its middle,
// outside the parent view. Each with a key (to find it again after a reload) and its middle
const CONTROLS = String.raw`(() => {
  const sel = 'button, [role=button], [data-act], [data-k], [data-t], [data-w], [data-tp], .tp-btn, .tp-stick, .chip, .pilot, .cell, .wt, .tm, .gtab, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]), [onclick]';
  const W = innerWidth, H = innerHeight, out = [], seen = new Map();
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest('#parent')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    const x = Math.min(W - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(H - 1, Math.max(0, r.top + r.height / 2));
    if (r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H) continue;
    const top = document.elementFromPoint(x, y); if (!top || !(top === el || el.contains(top))) continue;
    if (getComputedStyle(el).pointerEvents === 'none') continue;
    const base = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).filter((c) => !['on', 'cur', 'holding'].includes(c)).join('.') : '')
      + ['k', 't', 'w', 'tp', 'act', 'p', 'm', 'a', 'b'].filter((d) => el.dataset[d] != null).map((d) => '[' + d + '=' + el.dataset[d] + ']').join('');
    const n = seen.get(base) || 0; seen.set(base, n + 1);
    out.push({ key: base + '#' + n, x: Math.round(x), y: Math.round(y), label: el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 24) });
  }
  return out;
})()`;

const SEED_WAVES = (id, n) => `(() => { const R = window.__rb; R.player('${id}'); R.Facts.rec.waves = { ...(R.Facts.rec.waves || {}), best: ${n} }; R.Facts.save(); return true; })()`;

// a Quick Fix on the next robot of wave 1 not yet tried: it's downed, the mech stepped up to it and its Quick Fix opened;
// fix = it has a fact per plug (math wiring) or none (colour). (R.manual(true): nothing moves between the steps)
const QUICKFIX = String.raw`(() => { const R = window.__rb, G = R.Game;
  const m = R.state().players[0]; if (!m) return { ok: false, why: 'nobody playing' };
  const s = R.spawn('charger', m.x + 6, m.z), r = G.robots.find((q) => q.id === s?.id); if (!r) return { ok: false, why: 'no robot spawned' }; R.damage(r.id, 1e6, 'gun'); R.teleport(0, r.pos.x + 2.5, r.pos.z); const c = R.choose(r.id, 'fix');
  return { ok: !!c.ok, why: c.why ?? null, wiring: R.wiring().wiring, facts: r.wires?.facts ? r.wires.facts.filter(Boolean).length : 0, plugs: r.wires?.plugs?.length ?? null }; })()`;

async function runLogic(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false);
  const hasSwitch = await C.ev(`(() => { const R = window.__rb; R.player('apollo'); R.parent(true, 'apollo'); const b = document.querySelectorAll('#pBody [data-act="wiring"][data-w]').length; R.parent(false); return b; })()`);
  ok('the parent view has a wiring switch (#pBody [data-act=wiring][data-w], a button per mode)', hasSwitch === 2, hasSwitch);

  // ---- existing records keep their mode (nothing migrated); a new profile starts on math
  let r = await C.ev(`(() => { const R = window.__rb; R.player('apollo'); R.Facts.rec.wiring = 'math'; R.Facts.save(); R.player('orion'); R.Facts.rec.wiring = 'colour'; R.Facts.save(); R.player(null);
    return { a: JSON.parse(localStorage.getItem('robotbattle.facts.apollo')).wiring, o: JSON.parse(localStorage.getItem('robotbattle.facts.orion')).wiring }; })()`);
  ok('(setup) Apollo\'s stored record on math, Orion\'s on colour, written straight to the record', r.a === 'math' && r.o === 'colour', r);
  await C.open(1280, 800, false);
  r = await C.ev(`(() => { const R = window.__rb; const a = R.player('apollo').wiring, o = R.player('orion').wiring; const z = R.addProfile('Newbie'); const n = R.player(z.id).wiring; R.player('apollo');
    return { a, o, n, z: z.id, sa: JSON.parse(localStorage.getItem('robotbattle.facts.apollo')).wiring, so: JSON.parse(localStorage.getItem('robotbattle.facts.orion')).wiring }; })()`);
  ok('after a reload, a record on math stays math and one on colour stays colour (stored and loaded: nothing migrated)', r.a === 'math' && r.o === 'colour' && r.sa === 'math' && r.so === 'colour', r);
  ok('a new profile starts on math wiring', r.n === 'math', r);
  const zid = r.z;

  // ---- the parent switch on whoever is playing (Apollo), both directions; the next Quick Fix uses it
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { const R = window.__rb; R.manual(true); R.player('apollo'); R.parent(true, 'apollo');
    const v0 = R.parent().children.find((c) => c.id === 'apollo').wiring;
    const press = () => [...document.querySelectorAll('#pBody [data-act="wiring"][data-w]')].map((b) => b.dataset.w + ':' + b.getAttribute('aria-pressed')).join(' ');
    const p0 = press(), x = R.parentDo('wiring', 'apollo', 'colour'), p1 = press(), live = R.wiring().wiring, saved = JSON.parse(localStorage.getItem('robotbattle.facts.apollo')).wiring, v1 = x.view?.children?.find((c) => c.id === 'apollo')?.wiring;
    R.parent(false); return { v0, p0, x: { ok: x.ok, why: x.why, wiring: x.wiring }, p1, live, saved, v1 }; })()`);
  ok('the parent view shows Apollo on math (data().wiring, the math button pressed)', r.v0 === 'math' && r.p0 === 'math:true colour:false', r);
  ok('parent: Apollo math -> colour, live and saved, and the view shows it', r.x.ok && r.live === 'colour' && r.saved === 'colour' && r.v1 === 'colour' && r.p1 === 'math:false colour:true', r);
  r = await C.ev(`(() => { const R = window.__rb; R.start(0); return true; })()`);
  r = await C.ev(QUICKFIX);
  ok('... and the next Quick Fix is colour wiring (no facts on the board)', r.ok && r.wiring === 'colour' && r.facts === 0 && r.plugs > 0, r);
  // mid-run: pause, the parent view, back to math, play on
  r = await C.ev(String.raw`(() => { const R = window.__rb; R.parent(true, 'apollo'); const paused = R.Game.paused; const x = R.parentDo('wiring', 'apollo', 'math'); R.parent(false);
    document.querySelector('#go')?.click(); return { paused, ok: x.ok, live: R.wiring().wiring, saved: JSON.parse(localStorage.getItem('robotbattle.facts.apollo')).wiring, playing: !R.Game.paused && R.Game.state === 'play' }; })()`);
  ok('mid-run, paused: parent: Apollo colour -> math, live and saved, then back to play', r.paused && r.ok && r.live === 'math' && r.saved === 'math', r);
  r = await C.ev(QUICKFIX);
  ok('... and the next Quick Fix is math wiring (a fact per plug)', r.ok && r.wiring === 'math' && r.facts > 0 && r.facts === r.plugs, r);
  r = await C.ev(String.raw`(() => { const R = window.__rb; R.parent(true, 'apollo'); const x = R.parentDo('wiring', 'apollo', 'colour'); R.parent(false); return { ok: x.ok, live: R.wiring().wiring }; })()`);
  const r2 = await C.ev(QUICKFIX);
  ok('mid-run again: math -> colour, and the Quick Fix after that is colour', r.ok && r.live === 'colour' && r2.ok && r2.facts === 0, { r, r2 });
  // with no mode given the switch flips (the act alone)
  r = await C.ev(`(() => { const R = window.__rb; R.parent(true, 'apollo'); const a = R.parentDo('wiring', 'apollo').wiring, b = R.parentDo('wiring', 'apollo').wiring; const bad = R.parentDo('wiring', 'apollo', 'rainbow'); R.parent(false); return { a, b, bad: bad.ok, now: R.wiring().wiring }; })()`);
  ok('the act with no mode flips it (colour -> math -> colour); a mode that isn\'t math or colour is refused', r.a === 'math' && r.b === 'colour' && !r.bad && r.now === 'colour', r);
  // it survives a reload
  await C.open(1280, 800, false);
  r = await C.ev(`(() => { const R = window.__rb; return R.player('apollo').wiring; })()`);
  ok('after a reload Apollo is still on colour', r === 'colour', r);
  // another child's tab: only that child's stored record changes
  r = await C.ev(String.raw`(() => { const R = window.__rb; R.manual(true); R.player('apollo'); R.parent(true, 'orion'); const x = R.parentDo('wiring', 'orion', 'math'); R.parent(false);
    return { ok: x.ok, playing: R.Game.child.id, apollo: R.wiring().wiring, sa: JSON.parse(localStorage.getItem('robotbattle.facts.apollo')).wiring, so: JSON.parse(localStorage.getItem('robotbattle.facts.orion')).wiring }; })()`);
  ok('on Orion\'s tab while Apollo plays: Orion\'s stored record goes to math; Apollo stays colour', r.ok && r.playing === 'apollo' && r.apollo === 'colour' && r.sa === 'colour' && r.so === 'math', r);
  r = await C.ev(`(() => { const R = window.__rb; R.player('orion'); R.start(0); return true; })()`);
  r = await C.ev(QUICKFIX);
  ok('... and Orion\'s next Quick Fix is math wiring', r.ok && r.wiring === 'math' && r.facts > 0, r);
  // a child with no record yet (a new profile never played): the switch makes their record, on colour
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { const R = window.__rb; const z = R.addProfile('Fresh'); const before = localStorage.getItem('robotbattle.facts.' + z.id); R.player('apollo'); R.parent(true, z.id);
    const x = R.parentDo('wiring', z.id, 'colour'); R.parent(false); const s = localStorage.getItem('robotbattle.facts.' + z.id); return { id: z.id, before, ok: x.ok, saved: s ? JSON.parse(s).wiring : null, loads: R.player(z.id).wiring }; })()`);
  ok('a child with no record yet: the parent switch saves colour for them, and they load on colour', r.before == null && r.ok && r.saved === 'colour' && r.loads === 'colour', r);

  // ---- Guest: colour wiring, no tab, the hook refuses math, a Quick Fix with no facts
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { const R = window.__rb; R.manual(true); const g = R.player('guest'); const x = R.wiring('math'); const now = R.wiring().wiring;
    R.parent(true); const tabs = R.parent().chips.map((c) => c.id), y = R.parentDo('wiring', 'guest', 'math'); R.parent(false);
    return { g: g.wiring, x: x.ok, now, tabs, y: y.ok, still: R.wiring().wiring, key: localStorage.getItem('robotbattle.facts.guest') }; })()`);
  ok('Guest plays on colour wiring', r.g === 'colour' && r.now === 'colour' && r.still === 'colour', r);
  ok('Guest has no tab in the parent view, and the parent act refuses Guest', !r.tabs.includes('guest') && !r.y, r);
  ok('the setWiring hook refuses to put Guest on math (Guest keeps colour; nothing stored for Guest)', !r.x && r.key == null, r);
  r = await C.ev(`(() => { window.__rb.start(0); return true; })()`);
  r = await C.ev(QUICKFIX);
  ok('Guest\'s Quick Fix is colour wiring (no facts)', r.ok && r.wiring === 'colour' && r.facts === 0, r);

  // ---- backups, both ways
  await C.open(1280, 800, false);
  r = await C.ev(String.raw`(() => { const R = window.__rb;
    const set = (m) => { R.player('apollo'); R.Facts.rec.wiring = m; R.Facts.save(); };
    const back = (m) => { set(m); return JSON.parse(JSON.stringify(R.backup())); };
    const saved = () => JSON.parse(localStorage.getItem('robotbattle.facts.apollo')).wiring;
    const res = { files: {} };
    for (const [dev, bak] of [['math', 'colour'], ['colour', 'math']]) {
      const B = back(bak); res.files[bak] = B.data?.['facts.apollo']?.wiring ?? null;
      for (const ch of ['backup', 'best', 'device']) { set(dev); R.player('orion'); const x = R.restore(B, ch); R.player('apollo'); res[dev + '/' + bak + '/' + ch] = { ok: x.ok, live: R.wiring().wiring, saved: saved() }; }
    }
    const B = back('colour'); localStorage.clear(); const x = R.restore(B, 'best'); res.fresh = { ok: x.ok, saved: JSON.parse(localStorage.getItem('robotbattle.facts.apollo') || 'null')?.wiring ?? null };
    return res; })()`);
  ok('a backup carries each child\'s wiring (facts.apollo.wiring: colour, math)', r.files.colour === 'colour' && r.files.math === 'math', r.files);
  for (const [dev, bak] of [['math', 'colour'], ['colour', 'math']]) {
    const k = (ch) => r[`${dev}/${bak}/${ch}`];
    ok(`device ${dev}, backup ${bak}: "Use the backup" takes the backup's (${bak})`, k('backup')?.ok && k('backup').live === bak && k('backup').saved === bak, k('backup'));
    ok(`device ${dev}, backup ${bak}: "Keep the best" keeps this device's (${dev})`, k('best')?.ok && k('best').live === dev && k('best').saved === dev, k('best'));
    ok(`device ${dev}, backup ${bak}: "Keep this device" keeps this device's (${dev})`, k('device')?.ok && k('device').live === dev && k('device').saved === dev, k('device'));
  }
  ok('a fresh device restoring a backup with Apollo on colour: Apollo is on colour', r.fresh.ok && r.fresh.saved === 'colour', r.fresh);
  await C.open(1280, 800, false);
  r = await C.ev(`(() => window.__rb.player('apollo').wiring)()`);
  ok('... and loads on colour after a reload', r === 'colour', r);

  // ---- the gamepad in the parent view doesn't change it (its buttons are touch and keyboard)
  await C.ev(`(() => { const R = window.__rb; R.player('apollo'); R.Facts.rec.wiring = 'math'; R.Facts.save(); R.parent(true, 'apollo'); return true; })()`);
  await C.padOn(); await sleep(150);
  const seen = [];
  for (const b of [0, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16]) { await C.padBtn(b); seen.push(await C.ev(`window.__rb.wiring().wiring + (window.__rb.state().progress.ui === 'parent' ? '' : ':closed')`)); }
  ok('pad buttons in the parent view (all but B and Start, which close it) leave Apollo on math', seen.every((s) => s === 'math'), seen);
  return out;
}

// ---- the sweep: every control a child reaches, then every key and pad button, on each screen
async function runSweep(C, touch, only) {
  const [w, h] = touch ? [844, 390] : [1280, 800], who = touch ? 'orion' : 'apollo', mode = touch ? 'colour' : 'math', ids = ['apollo', 'orion'];
  const out = [], ok = (name, pass, got) => { out.push({ name: `sweep-${touch ? 'touch' : 'mouse'}:${only}: ${name}`, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(w, h, touch);
  // seed: Apollo on math, Orion on colour; whoever is swept has a wave cleared (so the wave chip shows) and parts in the bag
  await C.ev(`(() => { const R = window.__rb; R.player('apollo'); R.Facts.rec.wiring = 'math'; R.Facts.save(); R.player('orion'); R.Facts.rec.wiring = 'colour'; R.Facts.save(); return true; })()`);
  await C.ev(SEED_WAVES(who, 3));
  const want = { apollo: 'math', orion: 'colour' };
  const GTABS = await C.ev(`window.__rb.garage().tabs.map((t) => t.id)`);
  if (only === 'who') ok(`the garage's tabs are the ones swept (${GTABS.join(', ')})`, SCREENS.filter((q) => q.startsWith('garage:')).map((q) => q.slice(7)).join() === GTABS.join(), GTABS);
  const screens = [only];
  const enter = async (s) => {
    await C.open(w, h, touch);
    const r = await C.ev(String.raw`(async () => { const R = window.__rb, s = ${JSON.stringify(s)}; const wait = (ms) => new Promise((f) => setTimeout(f, ms));
      // (a touch run: touch mode on, as a finger on the screen turns it on, so the on-screen controller shows in play)
      if (${!!touch}) dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
      R.player('${who}'); if (s === 'who') { R.player(null); return R.state().title; }
      if (s === 'pick') return R.state().title;
      R.start(0); await wait(120); if (s === 'play') return R.state().title ?? 'play';
      document.dispatchEvent(new Event('pointerlockchange')); await wait(80);
      if (s === 'pause') return R.state().title;
      const g = R.garage(true, s.split(':')[1]); await wait(80); return g.on ? 'garage:' + g.tab : 'no garage'; })()`);
    if (touch) await C.padOn();   // (not on the mouse run: a pad connected changes nothing, but keep that run padless until its pad sweep)
    await sleep(100);
    return r;
  };
  const check = async (what) => {
    const r = await C.ev(READ(ids));
    const bad = r.saved.apollo !== want.apollo || r.saved.orion !== want.orion || (r.playing && r.playing in want && r.live !== want[r.playing]);
    if (bad) { fails.push({ what, ...r }); await C.ev(`(() => { const R = window.__rb; for (const [id, m] of Object.entries(${JSON.stringify(want)})) { const k = 'robotbattle.facts.' + id, v = JSON.parse(localStorage.getItem(k)); v.wiring = m; localStorage.setItem(k, JSON.stringify(v)); }
      if (R.Facts.rec && R.Game.child && ${JSON.stringify(want)}[R.Game.child.id]) R.Facts.rec.wiring = ${JSON.stringify(want)}[R.Game.child.id]; return true; })()`); }
  };
  const fails = [], counts = {}, unentered = [];
  for (const s of screens) {
    const got = await enter(s);
    const expect = { who: 'who', pick: 'title', play: 'play', pause: 'pause' }[s] ?? s;
    if (got !== expect) { unentered.push({ s, got }); continue; }
    const base = await C.ev(CONTROLS), where0 = await C.ev(WHERE), keys0 = new Set(base.map((q) => q.key));
    counts[s] = { controls: 0, second: 0, tabs: 0, keys: 0, pad: 0, reloads: 0 };
    // (a reload into the screen only when the last press moved it on, or brought something up: else the next press is on the same screen)
    let dirty = false;
    const back = async () => { await enter(s); counts[s].reloads++; dirty = false; };
    const moved = async () => (await C.ev(WHERE)) !== where0;
    for (const c of base) {
      if (dirty) await back();
      const now = (await C.ev(CONTROLS)).find((q) => q.key === c.key); if (!now) { await back(); continue; }
      const hold = c.key.startsWith('button#parentB') ? 300 : undefined;   // (the parent button: a short press, not the hold)
      await (touch ? C.tap(now.x, now.y, hold) : C.click(now.x, now.y, hold)); await sleep(60); counts[s].controls++;
      await check(`${s}: ${touch ? 'tap' : 'click'} ${c.key} (${c.label})`);
      // then everything that press brought up, in turn, while the screen it brought up stays
      const fresh = (await C.ev(CONTROLS)).filter((q) => !keys0.has(q.key));
      if (fresh.length || await moved()) dirty = true;
      if (!fresh.length) continue;
      const where1 = await C.ev(WHERE);
      for (const f of fresh.slice(0, 40)) {
        const at = (await C.ev(CONTROLS)).find((q) => q.key === f.key); if (!at) continue;
        await (touch ? C.tap(at.x, at.y) : C.click(at.x, at.y)); counts[s].second++;
        await check(`${s}: ${c.key} then ${f.key} (${f.label})`);
        if ((await C.ev(WHERE)) !== where1) break;
      }
    }
    // the keyboard: Tab to each focusable control and press Enter (then again with Space)
    for (const press of ['Enter', 'Space']) {
      let firstKey = null;
      if (!dirty) await C.ev(`(document.activeElement?.blur?.(), true)`); else await back();
      for (let k = 1; k <= 30; k++) {
        if (dirty) { await back(); for (let i = 0; i < k; i++) await C.key('Tab'); } else await C.key('Tab');
        const f = await C.ev(`(() => { const e = document.activeElement; if (!e || e === document.body) return null; return (e.id ? '#' + e.id : e.tagName) + '|' + (e.getAttribute('aria-label') || e.textContent.trim().slice(0, 16)); })()`);
        if (!f) break;
        if (f === firstKey) break; firstKey ??= f;
        if (f.startsWith('#parent') && !f.startsWith('#parentB')) continue;
        await C.key(press); counts[s].tabs++;
        await check(`${s}: Tab x${k} to ${f}, ${press}`);
        if (await moved() || (await C.ev(CONTROLS)).some((q) => !keys0.has(q.key))) dirty = true;
      }
    }
    // every game key
    if (dirty || await moved()) await back();
    for (const code of Object.keys(KEYS).filter((k) => k !== 'Tab')) {
      await C.key(code); counts[s].keys++;
      await check(`${s}: key ${code}`);
      if (await moved()) await back();
    }
    // every gamepad button
    if (await moved()) await back();
    await C.padOn(); await sleep(100);
    for (let b = 0; b <= 16; b++) {
      await C.padBtn(b); counts[s].pad++;
      await check(`${s}: pad button ${b}`);
      if (await moved()) { await back(); await C.padOn(); await sleep(100); }
    }
    if (!json) console.error(`  (${s}: ${JSON.stringify(counts[s])})`);
  }
  ok(`every screen entered (${screens.join(', ')})`, unentered.length === 0, unentered);
  ok('the sweep pressed something on every screen entered (controls, Tab stops, keys and pad buttons)', Object.values(counts).every((c) => c.controls > 0 && c.keys > 0 && c.pad > 0), counts);
  const tot = Object.values(counts).reduce((t, c) => ({ controls: t.controls + c.controls, second: t.second + c.second, tabs: t.tabs + c.tabs, keys: t.keys + c.keys, pad: t.pad + c.pad }), { controls: 0, second: 0, tabs: 0, keys: 0, pad: 0 });
  ok(`no ${touch ? 'tap' : 'click'}, Tab + Enter / Space, key or pad button changes anyone's wiring (${who} plays on ${mode}; ${tot.controls} controls + ${tot.second} brought up by them, ${tot.tabs} Tab stops, ${tot.keys} keys, ${tot.pad} pad buttons: ${JSON.stringify(counts)})`, fails.length === 0, fails.slice(0, 12));
  return out;
}

// the elements measured on screen
const BOX = String.raw`((sel) => {
  const W = innerWidth, H = innerHeight, bad = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
    if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) bad.push({ el: (el.id || el.className?.baseVal || el.className || el.tagName) + '', l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) });
  }
  return { W, H, bad, docX: document.documentElement.scrollWidth - W, docY: document.documentElement.scrollHeight - H };
})`;
const at = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null; })()`;
const KIDBAR_HIT = String.raw`(() => { const R = (q) => document.querySelector(q)?.getBoundingClientRect(), x = (a, b) => a && b && a.width && b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const mine = [...document.querySelectorAll('#start .kidbar > *, #start .pilots .pilot')].filter((e) => e.getClientRects().length);
  const self = []; const k = [...document.querySelectorAll('#start .kidbar > *')].filter((e) => e.getClientRects().length);
  for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) if (x(k[i].getBoundingClientRect(), k[j].getBoundingClientRect())) self.push(k[i].id + ' x ' + k[j].id);
  const small = k.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map((e) => e.id);
  return { hits: [...self, ...mine.flatMap((e) => ['#parentB', '#hud .health'].filter((q) => x(e.getBoundingClientRect(), R(q))).map((q) => (e.id || e.className) + ' x ' + q))], small, chips: k.map((e) => e.id) }; })()`;
// the wiring switch in the parent view, scrolled to: each button's box, size, whether its text is cut, and what's at its middle
const SWITCH = String.raw`(() => { const B = [...document.querySelectorAll('#pBody [data-act="wiring"][data-w]')]; if (!B.length) return null;
  const panel = document.querySelector('#parentPanel'); B[0].scrollIntoView({ block: 'center' }); const P = panel.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  return B.map((b) => { const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, e = document.elementFromPoint(x, y);
    return { w: b.dataset.w, pressed: b.getAttribute('aria-pressed'), l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height), x, y,
      inView: r.left >= -0.5 && r.top >= -0.5 && r.right <= W + 0.5 && r.bottom <= H + 0.5 && r.left >= P.left - 0.5 && r.right <= P.right + 0.5 && r.top >= P.top - 0.5 && r.bottom <= P.bottom + 0.5,
      cut: b.scrollWidth > b.clientWidth + 1 || [...b.querySelectorAll('span')].some((s) => s.scrollWidth > s.clientWidth + 1), top: !!e && b.contains(e) }; }); })()`;
// room for #142's switch: a copy of the wiring group beside it fits (the same row, or wrapped under), on screen and in the panel
const ROOM = String.raw`(() => { const g = document.querySelector('#pBody [data-act="wiring"]')?.closest('.pset'); if (!g) return null; const c = g.cloneNode(true); c.dataset.copy = '1'; g.after(c);
  const P = document.querySelector('#parentPanel'), pr = P.getBoundingClientRect(), a = g.getBoundingClientRect(), b = c.getBoundingClientRect();
  const sameParent = c.parentElement === g.parentElement, overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom, inPanel = b.left >= pr.left - 0.5 && b.right <= pr.right + 0.5;
  const docX = document.documentElement.scrollWidth - innerWidth, panelX = P.scrollWidth - P.clientWidth; c.remove();
  return { sameParent, overlap, inPanel, beside: Math.abs(a.top - b.top) < 2, docX, panelX }; })()`;

async function runSize(C, size) {
  const [w, h] = size.split('x').map(Number), touch = w < 1200;
  const out = [], ok = (name, pass, got) => { out.push({ name: size + ': ' + name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(w, h, touch);
  const id = await C.ev(`(() => { const R = window.__rb; const z = R.addProfile('Maximilian'); return z.id; })()`);
  await C.ev(SEED_WAVES(id, 14));
  await C.open(w, h, touch);
  await C.ev(`(() => { window.__rb.player('${id}'); return true; })()`);
  await sleep(150);
  // ---- the pilot pick without the wiring chip
  let s = await C.ev(`(() => { const el = document.querySelector('#wireB, #start .kidbar [aria-label*="wiring" i]'); return { chip: !!el && el.getClientRects().length > 0, wave: window.__rb.wavePick('state').shown, mode: !!document.querySelector('#modeB')?.getClientRects().length }; })()`);
  ok('the pilot pick has no wiring chip (the wave and mode chips show)', !s.chip && s.wave && s.mode, s);
  let b = await C.ev(BOX + `('#start .kidbar, #start .kidbar > *, #start .pilots .pilot')`);
  ok('the kidbar and the pilots on screen, no page overflow', b.bad.length === 0 && b.docX <= 0, b);
  let hit = await C.ev(KIDBAR_HIT);
  ok(`the chips (${hit.chips.join(', ')}) clear of each other, and the chips and pilots clear of the parent button and the health bar; every chip at least 44 px`, hit.hits.length === 0 && hit.small.length === 0, hit);
  if (shots) { const sh = await C.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, `wiring-pick-${size}.png`), Buffer.from(sh.result.data, 'base64')); }
  // ---- the pause screen: no wiring chip there either
  s = await C.ev(String.raw`(async () => { const R = window.__rb; R.start(0); await new Promise((f) => setTimeout(f, 120)); document.dispatchEvent(new Event('pointerlockchange')); await new Promise((f) => setTimeout(f, 80));
    const el = document.querySelector('#wireB, #start .kidbar [aria-label*="wiring" i]'); return { title: R.state().title, chip: !!el && el.getClientRects().length > 0 && !!el.closest('#start.on') }; })()`);
  ok('the pause screen has no wiring chip', s.title === 'pause' && !s.chip, s);
  // ---- the parent view, opened by the real hold
  const pb = await C.ev(`(() => { const p = ${at('#parentB')}; if (!p) return null; const e = document.elementFromPoint(p.x, p.y); return { ...p, top: e ? (e.id || e.tagName) + '' : null, on: !!e && document.querySelector('#parentB').contains(e) }; })()`);
  if (pb) {
    const x = Math.round(pb.x), y = Math.round(pb.y);
    if (touch) await C.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
    else { await C.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await C.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); }
    // (held until the view opens, as a parent does: at least PARENT.hold, at most 8 s on a loaded machine)
    const t0 = Date.now(); await sleep(1000); pb.holding = await C.ev(`window.__rb.state().progress.holding`);
    while (Date.now() - t0 < 8000 && (await C.ev(`window.__rb.state().progress.ui`)) !== 'parent') await sleep(200);
    pb.heldMs = Date.now() - t0;
    if (touch) await C.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await C.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  await sleep(150);
  const ui = await C.ev(`window.__rb.state().progress.ui`);
  ok(`the parent view opens on the ${touch ? 'touch' : 'mouse'} hold (PARENT.hold) on the parent button`, ui === 'parent' && pb.heldMs >= 2000, { ui, pb });
  if (ui !== 'parent') await C.ev(`window.__rb.parent(true, '${id}')`);
  const tab = await C.ev(`(() => { const R = window.__rb; if (R.parent().tab !== '${id}') R.parentDo('tab', '${id}'); return R.parent().tab; })()`);
  let sw = await C.ev(SWITCH);
  ok('the parent view has a wiring switch on the child\'s tab (a button for math, one for colour)', tab === id && sw?.length === 2 && sw.map((q) => q.w).join() === 'math,colour', { tab, sw });
  if (!sw || sw.length !== 2) return out;
  ok('the switch shows math (a new profile\'s): math pressed, colour not', sw[0].pressed === 'true' && sw[1].pressed === 'false', sw);
  ok('both buttons on screen and inside the panel once scrolled to, at least 44 x 44, their text not cut, nothing over them', sw.every((q) => q.inView && q.width >= 44 && q.height >= 44 && !q.cut && q.top), sw);
  ok('the two buttons don\'t overlap', sw[0].r <= sw[1].l + 0.5 || sw[0].b <= sw[1].t + 0.5, sw);
  b = await C.ev(BOX + `('#parent .panel')`);
  ok('the parent view on screen, no page overflow', b.bad.length === 0 && b.docX <= 0, b);
  const room = await C.ev(ROOM);
  ok(`room for a second switch beside it (#142): a copy of the group sits ${room?.beside ? 'beside it' : 'under it'}, without overlap, inside the panel, no sideways scroll`, room && room.sameParent && !room.overlap && room.inPanel && room.docX <= 0 && room.panelX <= 0, room);
  if (shots) { const sh = await C.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, `wiring-parent-${size}.png`), Buffer.from(sh.result.data, 'base64')); }
  const READ1 = `(() => { const R = window.__rb, s = localStorage.getItem('robotbattle.facts.${id}'); const B = [...document.querySelectorAll('#pBody [data-act="wiring"][data-w]')];
    return { live: R.wiring().wiring, saved: s ? JSON.parse(s).wiring : null, pressed: B.map((b) => b.dataset.w + ':' + b.getAttribute('aria-pressed')).join(' '), focus: document.activeElement?.dataset?.w ?? null, ui: R.state().progress.ui }; })()`;
  // ---- touch (a click at desktop): colour
  const cb = sw[1];
  await (touch ? C.tap(cb.x, cb.y) : C.click(cb.x, cb.y));
  s = await C.ev(READ1);
  ok(`${touch ? 'a tap' : 'a click'} on colour: the child goes to colour wiring, saved, colour pressed`, s.live === 'colour' && s.saved === 'colour' && s.pressed === 'math:false colour:true' && s.ui === 'parent', s);
  // ---- the keyboard: Tab to math, Enter
  const tabTo = async (want, back) => {
    for (let i = 0; i < 200; i++) { await C.key('Tab', back); const f = await C.ev(`document.activeElement?.closest?.('#pBody') && document.activeElement.dataset.act === 'wiring' ? document.activeElement.dataset.w : null`); if (f === want) return i + 1; }
    return 0;
  };
  await C.ev(`(() => { document.activeElement?.blur?.(); document.querySelector('#parentX').focus(); return true; })()`);
  let n = await tabTo('math');
  await C.key('Enter'); s = await C.ev(READ1);
  ok(`the keyboard: Tab (${n}x) to math, Enter: math, saved, and the focus stays on math`, n > 0 && s.live === 'math' && s.saved === 'math' && s.pressed === 'math:true colour:false' && s.focus === 'math', { n, ...s });
  n = await tabTo('colour');
  await C.key('Space'); s = await C.ev(READ1);
  ok(`Tab (${n}x) on to colour, Space: colour, saved, the focus on colour`, n === 1 && s.live === 'colour' && s.saved === 'colour' && s.focus === 'colour', { n, ...s });
  n = await tabTo('math', true);
  await C.key('Enter'); s = await C.ev(READ1);
  ok(`Shift+Tab (${n}x) back to math, Enter: math again, saved`, n === 1 && s.live === 'math' && s.saved === 'math' && s.focus === 'math', { n, ...s });
  return out;
}

async function main() {
  const all = []; const unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now();
    try {
      const C = await connect(S);
      const res = run === 'logic' ? await runLogic(C) : run.startsWith('sweep-') ? await runSweep(C, run.startsWith('sweep-touch'), run.split(':').slice(1).join(':')) : await runSize(C, run);
      if (C.errs.length) res.push({ name: run + ': no page errors', pass: false, got: C.errs.slice(0, 10) });
      else res.push({ name: run + ': no page errors', pass: true });
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
  if (json) console.log(JSON.stringify({ url, runs, checks: all, failed: failed.length, unfinished }, null, 1));
  else console.log(`${url}\n${all.length - failed.length}/${all.length} checks pass${unfinished.length ? `, ${unfinished.length} run(s) did not finish` : ''}: ${failed.length || unfinished.length ? 'FAIL' : 'PASS'}`);
  return unfinished.length ? 2 : failed.length ? 1 : 0;
}

let code = 2;
try { code = await main(); }
catch (e) { console.error('check failed: ' + (e?.stack || e?.message || e)); }
finally { await kill(shared); }
process.exit(code);
