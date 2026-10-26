#!/usr/bin/env node
// Open Water live Chesapeake check (#144): the real New York clock, the date-aware sun and moon, the live Open-Meteo
// weather (stubbed: no request ever leaves the browser for open-meteo.com), the URL params that override them, and the
// "Live · Chesapeake" label in the Conditions panel at each device size.
//
// Every run is its own headless Chrome (muted, not detached, killed with its profile deleted on every way out, as
// scripts/rb-fact-progress.mjs does). The browser's time zone is set to Asia/Tokyo, so a page that read the local
// clock instead of America/New_York fails. Date is replaced before the page runs: Date.now() and new Date() return
// window.__fakeNow, which a check moves to test the clock's tick. fetch() is wrapped: a request to open-meteo.com is
// recorded (URL and init) and answered by the stub the check picks (window.__owStub); every other fetch passes through.
// navigator.geolocation is stubbed and must never be called. The Network domain also blocks *open-meteo.com* and
// counts requests to it, so a real request is impossible and would fail a check. (three.js itself still loads from
// cdn.jsdelivr.net, as the page always does.)
//
// Runs, each at 1280 x 800 (?dpr=0.3: they read state, not pixels) through window.__game (state, as main has it) and
// window.__ow (#144's hook):
//   sky     - clock: 2026-06-21 13:15Z opens at 09:15 (EDT), not 18:06; the tick follows a new minute; a real input on the
//             Time slider stops the tick; 2026-11-01 05:30Z and 06:30Z both read 01:30 (EDT, then EST: the repeated
//             hour), 12:00Z reads 07:00 and 2026-10-31 12:00Z reads 08:00; 2026-12-21 17:00Z reads 12:00.
//             sun (the scene's own SKYU.uSunDir, and __ow.skyAt): max elevation 76.7 deg on 2026-06-21 and 29.8 deg on
//             2026-12-21, due south at noon (+x is north), east in the morning (+z is east), west in the evening; sunset
//             after 20:00 in June and before 17:00 in December.
//             moon: the 2026-03-03 eclipse (full) and the 2026-08-12 eclipse (new), a waxing quarter on 2026-08-20, a
//             waning one on 2026-03-11 and a waxing crescent on 2026-08-15; the disk's phase uniform follows the moon.
//   weather - the request (the issue's exact URL, credentials omitted, no referrer, no geolocation), the scene already
//             drawing on its defaults when it asks, then each WMO code group at its boundaries sets the button and the
//             sea state (the wind inverted through the slider), the wind direction, the heading and the cloud cover; a
//             failure, a bad answer and a 3 s timeout leave Sunny and 0.4 with no page error; an answer that lands after
//             the player changed Weather and/or Sea never overrides what they changed.
//   params  - ?weather=&sea= (no request at all), ?t= (no tick), ?weather= alone and ?sea= alone.
//   size    - at each size: Help closed and the panel opened the way a player does (the touch menu's Conditions on a
//             touch screen), the live label shown, every part of the panel on screen, the label on one line inside its
//             row (the row no taller than the Time row) and no page overflow.
//
// Usage:
//   node scripts/ow-live.mjs                        # ./ocean.html: sky, weather, params, then every size
//   node scripts/ow-live.mjs --logic                # sky, weather and params only
//   node scripts/ow-live.mjs --run weather          # one named run (repeatable)
//   node scripts/ow-live.mjs --size 568x320         # one size only (repeatable); no logic run
//   node scripts/ow-live.mjs --shots DIR            # also save a screenshot of the panel per size
//   node scripts/ow-live.mjs path/or/url.html --json
// Sizes by default: 568x320 (#144), 740x360, 844x390, 667x375 (the sideways phones in docs/review-lenses.md), 390x844,
// 1024x768 and 1280x800. Each size is its own Chrome launch.
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SIZES = ['568x320', '740x360', '844x390', '667x375', '390x844', '1024x768', '1280x800'];
const args = process.argv.slice(2);
let json = false, target = null, logicOnly = false, shots = null; const sizes = [], named = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--logic') logicOnly = true;
  else if (args[i] === '--size') sizes.push(args[++i]);
  else if (args[i] === '--run') named.push(args[++i]);
  else if (args[i] === '--shots') shots = path.resolve(args[++i]);
  else if (args[i] === '-h' || args[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
  else target = args[i];
}
const LOGIC_RUNS = ['sky', 'weather', 'params'];
const runs = logicOnly ? LOGIC_RUNS : named.length ? named : sizes.length ? sizes : [...LOGIC_RUNS, ...SIZES];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
target ??= path.join(repo, 'ocean.html');
const baseUrl = /^(https?|file):/.test(target) ? target : pathToFileURL(path.resolve(target)).href;
if (shots) fs.mkdirSync(shots, { recursive: true });
const WX_URL = 'https://api.open-meteo.com/v1/forecast?latitude=36.77&longitude=-76.29&current=weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=America%2FNew_York';

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

// ---- injected before the page's own scripts on every navigation ----
// window.__owStub: { mode: 'ok' | 'touch' | 'manual' | 'fail' | 'bad' | 'hang', body } ('touch' changes the player's controls
// while the request is out, then answers; 'manual' waits for __owResolve(); 'hang'
// never answers, so only the page's own timeout ends it). Every stubbed request honours init.signal.
const INJECT = String.raw`(() => {
  const RealDate = Date;
  window.__fakeNow = window.__fakeNow ?? RealDate.now();
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(window.__fakeNow); }
    static now() { return window.__fakeNow; }
  }
  window.Date = FakeDate;
  window.__owReq = [];
  window.__rafN = 0;
  const rAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => rAF((t) => { window.__rafN++; cb(t); });
  window.__geoCalls = 0;
  try {
    const geo = { getCurrentPosition() { window.__geoCalls++; }, watchPosition() { window.__geoCalls++; return 0; }, clearWatch() {} };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => geo });
  } catch (e) {}
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (!/open-meteo\.com/.test(url || '')) return realFetch(input, init);
    const S = window.__owStub || { mode: 'fail' };
    const g = window.__game;   // what the scene showed when it asked: the defaults, a frame already drawn
    window.__owAtCall = g ? { weather: g.state.weather, sea: g.state.sea, label: document.getElementById('wLab')?.textContent ?? null, frames: window.__rafN } : null;
    window.__owReq.push({ url, credentials: init.credentials ?? null, referrerPolicy: init.referrerPolicy ?? null, method: init.method || 'GET', hasBody: init.body != null, headers: init.headers ? JSON.stringify(init.headers) : null, mode: S.mode, at: window.__fakeNow });
    return new Promise((resolve, reject) => {
      const sig = init.signal;
      const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
      if (sig) { if (sig.aborted) return abort(); sig.addEventListener('abort', abort, { once: true }); }
      const answer = () => {
        if (S.mode === 'fail') return reject(new TypeError('Failed to fetch'));
        const body = S.mode === 'bad' ? '<html>not json</html>' : JSON.stringify(S.body);
        resolve(new Response(body, { status: S.status || 200, headers: { 'content-type': 'application/json' } }));
      };
      if (S.mode === 'hang') return;
      if (S.mode === 'manual') { window.__owResolve = answer; return; }
      if (S.mode === 'touch') {   // the player changes controls while the request is out (a real click and input), then the answer comes
        return setTimeout(() => {
          if (S.weather) document.querySelector('.seg button[data-w="' + S.weather + '"]').click();
          if (S.sea != null) { const s = document.getElementById('sea'); s.value = S.sea; s.dispatchEvent(new Event('input', { bubbles: true })); }
          answer();   // in the same task: a busy swiftshader start can make any later timer lose to the page's 3 s one
        }, 0);
      }
      setTimeout(answer, S.delay || 0);
    });
  };
})();`;

const STUB = (o) => `window.__owStub = ${JSON.stringify(o)};`;
const body = (code, wind = 5, dir = 225, cloud = 30) => ({ latitude: 36.77, longitude: -76.29, current: { time: '2026-06-21T09:15', interval: 900, weather_code: code, cloud_cover: cloud, wind_speed_10m: wind, wind_direction_10m: dir } });

// the page's slider maps s -> wind (m/s) = 1.5 + 19 s^2 + 2.5 s; the live answer must invert it (less the weather's windAdd)
const windFromSlider = (s) => 1.5 + 19 * s * s + 2.5 * s;
const WIND_ADD = { sunny: 0, rain: 3, storm: 10 };
const invSea = (u) => { u = Math.max(0, u - 1.5); return Math.min(1, Math.max(0, (-2.5 + Math.sqrt(6.25 + 76 * u)) / 38)); };

let shared = null;   // the Chrome process of the run under way, for cleanup on a signal
function launch() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-live-'));
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
process.on('exit', () => killSync(shared));
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => { kill(shared).finally(() => process.exit(code)); });
// under the 10 min a foreground tool call may run, so a timed-out caller never orphans Chrome
const HARD_TIMEOUT_MS = 9 * 60 * 1000;
setTimeout(() => { console.error(`hard timeout: over ${HARD_TIMEOUT_MS / 60000} min; closing Chrome`); kill(shared).finally(() => process.exit(124)); }, HARD_TIMEOUT_MS).unref();

async function connect(S) {
  let tgt, port;
  for (let i = 0; i < 100 && !tgt; i++) {
    try { const f = fs.readFileSync(path.join(S.prof, 'DevToolsActivePort'), 'utf8'); if (f.includes('\n')) port = parseInt(f, 10) || undefined; } catch {}
    if (port) try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!tgt) await sleep(200);
  }
  if (!tgt) throw new Error('Chrome did not start (' + chromeBin + ')');
  const ws = S.ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map(), errs = [], net = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { pend.get(m.id)?.(m); pend.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) errs.push('log: ' + m.params.entry.text);
    else if (m.method === 'Network.requestWillBeSent' && /open-meteo|geolocation/.test(m.params.request.url)) net.push(m.params.request.url);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const v = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (v.result?.exceptionDetails) throw new Error('page threw: ' + (v.result.exceptionDetails.exception?.description || v.result.exceptionDetails.text));
    return v.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['*open-meteo.com*'] });
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' });
  let injected = null;
  // open the page at a fake instant (ms) with a stub picked before any page script runs
  const open = async (w, h, touch, { query = '', now, stub = { mode: 'fail' } } = {}) => {
    if (injected) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected });
    const r = await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__fakeNow = ${now ?? Date.now()}; ${STUB(stub)}\n${INJECT}` });
    injected = r.result?.identifier;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!touch, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: !!touch, maxTouchPoints: touch ? 5 : 0 });
    await send('Page.navigate', { url: baseUrl + (query ? '?' + query : '') });
    for (let i = 0; i < 300; i++) { await sleep(200); if (await ev('document.readyState === "complete" && !!window.__game').catch(() => false)) return; }
    throw new Error('page did not load window.__game: ' + baseUrl + '?' + query);
  };
  const tap = async (x, y) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] }); await sleep(60);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(120);
  };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(80);
  };
  return { send, ev, open, tap, click, errs, net };
}

// ---- in the page ----
const READ = String.raw`(() => { const g = window.__game, s = g.state, wl = document.getElementById('wLab'), pressed = [...document.querySelectorAll('.seg button')].find((b) => b.getAttribute('aria-pressed') === 'true');
  return { tod: s.tod, sea: s.sea, weather: s.weather, todIn: +document.getElementById('tod').value, seaIn: +document.getElementById('sea').value, pressed: pressed?.dataset.w ?? null,
    label: wl ? wl.textContent : null, tLab: document.getElementById('tLab').textContent, windAngle: g.sea.windAngle, req: (window.__owReq || []).length, geo: window.__geoCalls,
    live: window.__ow ? JSON.parse(JSON.stringify(window.__ow.live)) : null, cover: window.__ow ? window.__ow.cover() : null }; })()`;
const FRAMES = `new Promise((r) => { let n = 0; const f = () => (++n >= 3 ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })`;
const hasOw = `typeof window.__ow === 'object' && typeof window.__ow.skyAt === 'function' && typeof window.__ow.moonAt === 'function'`;
const near = (a, b, e) => typeof a === 'number' && Math.abs(a - b) <= e;
const H = (iso) => Date.parse(iso);

const LQ = 'dpr=0.3';   // the logic runs read state, not pixels: a small canvas keeps swiftshader's frames quick
async function until(C, expr, ms = 30000) { const t = Date.now(); while (Date.now() - t < ms) { if (await C.ev(expr).catch(() => false)) return true; await sleep(100); } return false; }

// ---- the clock, the tick, the sun and the moon
async function runSky(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false, { query: LQ, now: H('2026-06-21T13:15:00Z'), stub: { mode: 'fail' } });
  let r = await C.ev(READ);
  ok('clock: 2026-06-21 13:15Z opens at 09:15 New York (EDT), in a Tokyo browser', near(r.tod, 9.25, 0.01) && near(r.todIn, 9.25, 0.05) && r.tLab === '09:15', r);
  const owOk = ok('window.__ow hook exists (skyAt, moonAt, live)', await C.ev(hasOw), await C.ev('typeof window.__ow'));
  if (owOk) {
    const dirs = await C.ev(`(async () => { const g = window.__game, U = window.__ow.SKYU, res = {};
      for (const h of [7, 13.1, 19]) { g.state.tod = h; await ${FRAMES}; const d = U.uSunDir.value, k = window.__ow.skyAt(h); res[h] = { scene: [d.x, d.y, d.z], hook: k.sunDir }; }
      g.state.tod = 9.25; return res; })()`);
    ok('sun (scene): east in the morning (07:00 z > 0), west at 19:00 (z < 0), south at 13:06 (x < 0)', dirs[7].scene[2] > 0.3 && dirs[19].scene[2] < -0.3 && dirs['13.1'].scene[0] < 0, dirs);
    ok('sun (scene): SKYU.uSunDir is the hook\'s skyAt direction', [7, 13.1, 19].every((h) => dirs[h].scene.every((v, i) => near(v, dirs[h].hook[i], 1e-4))), dirs);
    const sun = await C.ev(`(() => { const A = window.__ow, el = (h, D) => Math.asin(A.skyAt(h, D).sunDir[1]) * 180 / Math.PI;
      const scan = (D) => { let best = -99, at = 0, set = null; for (let m = 0; m < 1440; m++) { const e = el(m / 60, D); if (e > best) { best = e; at = m; } if (m > 720 && set == null && e < -0.833) set = m; } return { max: best, noon: at / 60, set: set / 60 }; };
      return { jun: scan({ y: 2026, mo: 5, d: 21 }), dec: scan({ y: 2026, mo: 11, d: 21 }) }; })()`);
    ok('sun: 2026-06-21 solar noon at 36.77 N is about 76.7 deg', near(sun.jun.max, 76.7, 0.3), sun.jun);
    ok('sun: 2026-12-21 solar noon is about 29.8 deg', near(sun.dec.max, 29.8, 0.3), sun.dec);
    ok('sun: June solar noon about 13:07 EDT, December about 12:05 EST', near(sun.jun.noon, 13.1, 0.15) && near(sun.dec.noon, 12.05, 0.15), sun);
    ok('sun: sets after 20:00 in June', sun.jun.set > 20, sun.jun);
    ok('sun: sets before 17:00 in December', sun.dec.set < 17 && sun.dec.set > 16, sun.dec);
    const moon = await C.ev(`(() => { const m = (iso) => { const x = window.__ow.moonAt(Date.parse(iso)); return { illum: x.illum, waxing: x.waxing }; };
      return { full: m('2026-03-03T11:38:00Z'), nw: m('2026-08-12T17:37:00Z'), q1: m('2026-08-20T02:46:00Z'), q3: m('2026-03-11T09:39:00Z'), cres: m('2026-08-15T00:30:00Z') }; })()`);
    ok('moon: the 2026-03-03 lunar eclipse reads full (illum > 0.97)', moon.full.illum > 0.97, moon.full);
    ok('moon: the 2026-08-12 solar eclipse reads new (illum < 0.03)', moon.nw.illum < 0.03, moon.nw);
    ok('moon: 2026-08-20 is a waxing quarter, 2026-03-11 a waning one', near(moon.q1.illum, 0.5, 0.12) && moon.q1.waxing === true && near(moon.q3.illum, 0.5, 0.12) && moon.q3.waxing === false, moon);
    ok('moon: 2026-08-15 is a waxing crescent', moon.cres.illum < 0.25 && moon.cres.waxing === true, moon.cres);
    const ph = await C.ev(`(async () => { await ${FRAMES}; const k = window.__ow.skyAt(window.__game.state.tod), U = window.__ow.SKYU; return { phase: U.uMoonPhase?.value, illum: k.moon.illum, want: 1 - 2 * k.moon.illum, moonDir: [U.uMoonDir.value.x, U.uMoonDir.value.y, U.uMoonDir.value.z], hook: k.moonDir }; })()`);
    ok('moon (scene): the disk\'s phase uniform is 1 - 2 x illum, its direction the hook\'s', ph.phase != null && near(ph.phase, ph.want, 1e-4) && ph.moonDir.every((v, i) => near(v, ph.hook[i], 1e-4)), ph);
  }
  // the tick: a new minute moves the clock and the slider; a real input on the slider stops it
  await C.ev(`window.__fakeNow += 60e3`);
  await until(C, `window.__game.state.tod > 9.26`);
  r = await C.ev(READ);
  ok('clock: the next minute ticks the time and the slider (09:16)', near(r.tod, 9.25 + 1 / 60, 0.005) && near(r.todIn, r.tod, 0.05) && r.tLab === '09:16', r);
  await C.ev(`(() => { const t = document.getElementById('tod'); t.value = 15; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await C.ev(`window.__fakeNow += 180e3`);
  const ticked = await until(C, `!!window.__ow && window.__ow.clock.min === 9 * 60 + 19`);
  r = await C.ev(READ);
  ok('clock: after the player moves the Time slider, the tick leaves it alone (the clock itself moved on to 09:19)', ticked && near(r.tod, 15, 1e-6) && r.tLab === '15:00', { ticked, r });

  // ---- December
  await C.open(1280, 800, false, { query: LQ, now: H('2026-12-21T17:00:00Z'), stub: { mode: 'fail' } });
  r = await C.ev(READ);
  ok('clock: 2026-12-21 17:00Z opens at 12:00 (EST)', near(r.tod, 12, 0.01) && r.tLab === '12:00', r);
  if (owOk) {
    const d = await C.ev(`(async () => { window.__game.state.tod = 12.08; await ${FRAMES}; const v = window.__ow.SKYU.uSunDir.value; return [v.x, v.y, v.z]; })()`);
    ok('sun (scene): 2026-12-21 near noon the scene\'s sun is about 29.8 deg up, due south', near(Math.asin(d[1]) * 180 / Math.PI, 29.8, 0.4) && d[0] < -0.8, d);
  }
  // ---- the DST boundary, through the tick
  await C.open(1280, 800, false, { query: LQ, now: H('2026-11-01T05:30:00Z'), stub: { mode: 'fail' } });
  r = await C.ev(READ);
  ok('clock: 2026-11-01 05:30Z reads 01:30 (EDT, before the change)', near(r.tod, 1.5, 0.01) && r.tLab === '01:30' && r.live?.dst === true, r);
  const steps = [['2026-11-01T06:30:00Z', 1.5, '01:30', false, '06:30Z reads 01:30 again (EST: the repeated hour)'], ['2026-11-01T12:00:00Z', 7, '07:00', false, '12:00Z reads 07:00, not 08:00'], ['2026-10-31T12:00:00Z', 8, '08:00', true, '2026-10-31 12:00Z reads 08:00 (EDT)']];
  for (const [iso, want, lab, dst, name] of steps) {
    await C.ev(`window.__fakeNow = ${H(iso)}`);
    await until(C, `!!window.__ow && window.__ow.live.dst === ${dst} && Math.abs(window.__game.state.tod - ${want}) < 0.01`);
    r = await C.ev(READ);
    ok('clock: ' + name, near(r.tod, want, 0.01) && r.tLab === lab && r.live?.dst === dst, r);
  }
  ok('sky: no request reached open-meteo.com (Network domain)', C.net.length === 0, C.net);
  return out;
}

// ---- the live weather
async function runWeather(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  // the stub notes what the scene showed when it asked (__owAtCall), then answers at once
  await C.open(1280, 800, false, { query: LQ, now: H('2026-06-21T13:15:00Z'), stub: { mode: 'ok', body: body(61, 9, 200, 90) } });
  await until(C, `(window.__owReq || []).length > 0 && !!window.__ow && window.__ow.live.status !== 'pending'`);
  await C.ev(FRAMES);
  let r = await C.ev(READ);
  const owOk = ok('window.__ow hook exists (skyAt, moonAt, live)', await C.ev(hasOw), await C.ev('typeof window.__ow'));
  ok('weather: exactly one request on open', r.req === 1, r.req);
  const q = await C.ev('window.__owReq[0] || null');
  ok('weather: the request is the issue\'s exact URL (fixed coordinates, nothing about the player)', q?.url === WX_URL, q);
  ok('weather: credentials omitted, no referrer, a plain GET with no body or headers', q && q.credentials === 'omit' && q.referrerPolicy === 'no-referrer' && q.method === 'GET' && !q.hasBody && !q.headers, q);
  const before = await C.ev('window.__owAtCall || null');
  ok('weather: the scene was already drawing on its defaults (Sunny, 0.4, no live label) when it asked', before && before.weather === 'sunny' && near(before.sea, 0.4, 1e-6) && !/live/i.test(before.label || '') && before.frames >= 1, before);
  ok('weather: the answer arrives: code 61 -> Rain, the button pressed', r.weather === 'rain' && r.pressed === 'rain', r);
  ok('weather: wind 9 m/s -> sea slider inverted through windFromSlider less Rain\'s windAdd', near(r.sea, invSea(9 - 3), 0.002) && near(r.seaIn, r.sea, 0.006) && near(windFromSlider(r.sea) + 3, 9, 0.05), { r, want: invSea(6) });
  ok('weather: wind from 200 deg -> windAngle toward 20 deg (+x north, +z east)', near(r.windAngle, 20 * Math.PI / 180, 1e-3), r.windAngle);
  ok('label: "Live · Chesapeake" while the live weather is in use', /Live · Chesapeake/.test(r.label || ''), r.label);
  ok('privacy: geolocation never asked for', r.geo === 0, r.geo);
  const head = await C.ev(`(() => { const g = window.__game, d = ((g.player.psi - g.sea.windAngle) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI; return { psi: g.player.psi, wa: g.sea.windAngle, rel: d }; })()`);
  ok('weather: the opening heading keeps its reach on the live wind (not in irons)', near(Math.abs(head.rel), Math.abs(((-0.49 - 1.35) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI), 1e-3), head);
  if (owOk) {
    const groups = [[0, 'sunny'], [3, 'sunny'], [45, 'sunny'], [48, 'sunny'], [51, 'rain'], [56, 'rain'], [67, 'rain'], [68, 'sunny'], [71, 'rain'], [77, 'rain'], [80, 'rain'], [86, 'rain'], [90, 'sunny'], [95, 'storm'], [99, 'storm']];
    for (const [code, want] of groups) {
      const wind = 4 + (code % 7);
      await C.ev(`${STUB({ mode: 'ok', body: body(code, wind, 90, 80) })} window.__ow.relive(); window.__ow.request()`);
      r = await C.ev(READ);
      ok(`weather: code ${code} -> ${want}, sea from ${wind} m/s`, r.weather === want && r.pressed === want && near(r.sea, invSea(wind - WIND_ADD[want]), 0.002), { r, want: invSea(wind - WIND_ADD[want]) });
    }
    await C.ev(`${STUB({ mode: 'ok', body: body(2, 4, 90, 80) })} window.__ow.relive(); window.__ow.request()`);
    r = await C.ev(READ);
    ok('weather: a Sunny answer with 80% cloud raises the cloud cover target above Sunny\'s 0.42', r.cover?.target > 0.6, r.cover);
    await C.ev(`${STUB({ mode: 'ok', body: body(1, 4, 90, 0) })} window.__ow.relive(); window.__ow.request()`);
    r = await C.ev(READ);
    ok('weather: 0% cloud lowers it below 0.42', r.cover?.target < 0.3, r.cover);
    for (const mode of ['fail', 'bad']) {
      await C.ev(`${STUB({ mode: 'ok', body: body(95, 15) })} window.__ow.relive(); window.__ow.request()`);   // a storm first, so the fallback has to undo it
      await C.ev(`${STUB({ mode, status: mode === 'bad' ? 500 : 200 })} window.__ow.relive(); window.__ow.request()`);
      r = await C.ev(READ);
      ok(`weather: a ${mode === 'fail' ? 'network failure' : 'bad answer (500, not JSON)'} -> Sunny and 0.4, no live label`, r.weather === 'sunny' && near(r.sea, 0.4, 1e-6) && r.live?.status === 'failed' && !/live/i.test(r.label || ''), r);
    }
    await C.ev(`${STUB({ mode: 'hang' })} window.__ow.relive(); window.__ow.request()`);
    r = await C.ev(READ);
    ok('weather: a request that never answers is given up at 3 s (timeout) -> Sunny and 0.4', r.live?.status === 'failed' && r.live?.reason === 'timeout' && r.live.ms >= 2950 && r.weather === 'sunny' && near(r.sea, 0.4, 1e-6) && !/live/i.test(r.label || ''), r);
  }
  ok('weather: no page error from a failure, a bad answer or the timeout', C.errs.length === 0, C.errs.slice(0, 5));

  // ---- a late answer never overrides what the player already touched: the stub clicks and slides while the request is out
  const late = async (touch, ans) => {
    await C.open(1280, 800, false, { query: LQ, now: H('2026-06-21T13:15:00Z'), stub: { mode: 'touch', ...touch, body: ans } });
    await until(C, `(window.__owReq || []).length > 0 && !!window.__ow && window.__ow.live.status !== 'pending'`);
    return C.ev(READ);
  };
  r = await late({ weather: 'rain', sea: 0.1 }, body(95, 15, 200, 90));
  ok('late answer: a Storm answer after the player picked Rain and Sea 0.1 changes neither', r.live?.status === 'ok' && r.weather === 'rain' && near(r.sea, 0.1, 1e-6), r);
  ok('late answer: no live label once the player has chosen', !/live/i.test(r.label || ''), r.label);
  r = await late({ sea: 0.1 }, body(95, 15, 200, 90));
  ok('late answer: Sea touched, Weather not: the answer sets Storm and leaves Sea at 0.1 (and no label: Sea was changed)', r.live?.status === 'ok' && r.weather === 'storm' && near(r.sea, 0.1, 1e-6) && !/live/i.test(r.label || ''), r);
  r = await late({ weather: 'storm' }, body(0, 6, 200, 90));
  ok('late answer: Weather touched, Sea not: Storm stays, the answer sets Sea from 6 m/s less Storm\'s 10 (0)', r.live?.status === 'ok' && r.weather === 'storm' && near(r.sea, invSea(6 - 10), 1e-6), r);
  ok('weather: no request reached open-meteo.com (Network domain)', C.net.length === 0, C.net);
  return out;
}

// ---- URL params
async function runParams(C) {
  const out = [], ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  await C.open(1280, 800, false, { query: LQ + '&weather=storm&sea=0.7', now: H('2026-06-21T13:15:00Z'), stub: { mode: 'ok', body: body(0, 3) } });
  await C.ev(FRAMES); await sleep(800); let r = await C.ev(READ);
  ok('params: ?weather=storm&sea=0.7 -> Storm, 0.7, and no weather request at all', r.weather === 'storm' && near(r.sea, 0.7, 1e-6) && r.req === 0 && !/live/i.test(r.label || ''), r);
  ok('params: the clock is still live with them (09:15)', near(r.tod, 9.25, 0.01), r);
  await C.open(1280, 800, false, { query: LQ + '&t=9.5', now: H('2026-06-21T20:00:00Z'), stub: { mode: 'ok', body: body(0, 3) } });
  await C.ev(`window.__fakeNow += 120e3`);
  const ticked = await until(C, `!!window.__ow && window.__ow.clock.min === 16 * 60 + 2`);
  r = await C.ev(READ);
  ok('params: ?t=9.5 -> 09:30, and the clock does not tick it', ticked && near(r.tod, 9.5, 1e-6) && r.tLab === '09:30', { ticked, r });
  await C.open(1280, 800, false, { query: LQ + '&weather=rain', now: H('2026-06-21T13:15:00Z'), stub: { mode: 'ok', body: body(0, 10) } });
  await until(C, `!!window.__ow && window.__ow.live.status === 'ok'`); r = await C.ev(READ);
  ok('params: ?weather=rain alone -> Rain stays, the request still sets Sea (10 m/s less Rain\'s 3), no live label', r.weather === 'rain' && r.req === 1 && near(r.sea, invSea(7), 0.002) && !/live/i.test(r.label || ''), { r, want: invSea(7) });
  await C.open(1280, 800, false, { query: LQ + '&sea=0.2', now: H('2026-06-21T13:15:00Z'), stub: { mode: 'ok', body: body(63, 12) } });
  await until(C, `!!window.__ow && window.__ow.live.status === 'ok'`); r = await C.ev(READ);
  ok('params: ?sea=0.2 alone -> Sea stays 0.2, the request sets Rain', r.weather === 'rain' && r.req === 1 && near(r.sea, 0.2, 1e-6), r);
  ok('params: no request reached open-meteo.com (Network domain)', C.net.length === 0, C.net);
  return out;
}

const BOX = String.raw`(() => {
  const W = innerWidth, H = innerHeight, bad = [];
  for (const el of document.querySelectorAll('#ui, #ui *')) {
    const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
    if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) bad.push({ el: (el.id || el.className || el.tagName) + '', l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) });
  }
  const R = (s) => document.querySelector(s).getBoundingClientRect();
  const wl = R('#wLab'), wrow = document.getElementById('wLab').parentElement.getBoundingClientRect(), trow = document.getElementById('tLab').parentElement.getBoundingClientRect(), ui = R('#ui');
  const lh = parseFloat(getComputedStyle(document.getElementById('wLab')).lineHeight) || 18;
  return { W, H, bad, ui: { t: Math.round(ui.top), b: Math.round(ui.bottom), h: Math.round(ui.height), hidden: document.getElementById('ui').classList.contains('hidden') },
    label: document.getElementById('wLab').textContent, labH: wl.height, lh, labInRow: wl.left >= wrow.left - 0.5 && wl.right <= wrow.right + 0.5 && wl.top >= wrow.top - 0.5 && wl.bottom <= wrow.bottom + 0.5,
    rowH: wrow.height, timeRowH: trow.height, docX: document.documentElement.scrollWidth - W, docY: document.documentElement.scrollHeight - H };
})()`;

async function runSize(C, size) {
  const [w, h] = size.split('x').map(Number), touch = w < 1200;
  const out = [], ok = (name, pass, got) => out.push({ name: size + ': ' + name, pass: !!pass, got: pass ? undefined : got });
  await C.open(w, h, touch, { now: H('2026-06-21T13:15:00Z'), stub: { mode: 'ok', body: body(3, 6, 200, 70) } });
  await sleep(600);
  // a first visit opens Help over everything: close it as a player would (its OK button)
  const okB = await C.ev(`(() => { const h = document.getElementById('help'); if (!h || h.classList.contains('hidden')) return null; const b = document.getElementById('helpOk'); b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (okB) { if (touch) await C.tap(okB.x, okB.y); else await C.click(okB.x, okB.y); }
  ok('Help closes from its OK button', await C.ev(`document.getElementById('help').classList.contains('hidden')`), okB);
  // open Conditions the way a player does: on a touch screen the controller hides it; the menu's Conditions brings it back
  const tp = await C.ev(`document.body.classList.contains('tp-on')`);
  if (touch && tp) {
    const m = await C.ev(`(() => { const b = document.querySelector('#tp [data-tp="menu"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (m) await C.tap(m.x, m.y);
    const row = await C.ev(`(() => { const d = [...document.querySelectorAll('#tp .tp-panel div')].find((x) => x.textContent.trim() === 'Conditions'); if (!d) return null; const r = d.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    ok('the touch menu has Conditions', !!row, row);
    if (row) await C.tap(row.x, row.y);
  } else await C.ev(`document.getElementById('ui').classList.contains('hidden') && document.getElementById('show').click()`);
  await sleep(500);
  const b = await C.ev(BOX);
  ok('the Conditions panel is open', !b.ui.hidden, b.ui);
  ok('the live label shows: "Live · Chesapeake"', /Live · Chesapeake/.test(b.label), b.label);
  ok('every part of the Conditions panel on screen', b.bad.length === 0, b);
  ok('the label on one line, inside its row, the row no taller than the Time row', b.labInRow && b.labH <= b.lh * 1.5 && b.rowH <= b.timeRowH + 0.5, b);
  ok('no horizontal or vertical page overflow', b.docX <= 0 && b.docY <= 0, b);
  if (shots) { const s = await C.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, `conditions-${size}.png`), Buffer.from(s.result.data, 'base64')); }
  ok('no request reached open-meteo.com', C.net.length === 0, C.net);
  return out;
}

async function main() {
  const all = []; const unfinished = [];
  for (const run of runs) {
    const S = launch(); const t0 = Date.now();
    try {
      const C = await connect(S);
      const res = run === 'sky' ? await runSky(C) : run === 'weather' ? await runWeather(C) : run === 'params' ? await runParams(C) : await runSize(C, run);
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
  if (json) console.log(JSON.stringify({ url: baseUrl, runs, checks: all, failed: failed.length, unfinished }, null, 1));
  else console.log(`${baseUrl}\n${all.length - failed.length}/${all.length} checks pass${unfinished.length ? `, ${unfinished.length} run(s) did not finish` : ''}: ${failed.length || unfinished.length ? 'FAIL' : 'PASS'}`);
  return unfinished.length ? 2 : failed.length ? 1 : 0;
}

let code = 2;
try { code = await main(); }
catch (e) { console.error('check failed: ' + (e?.stack || e?.message || e)); }
finally { await kill(shared); }
process.exit(code);
