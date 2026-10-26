#!/usr/bin/env node
// Open Water photoreal yacht check (#145): models/yacht.glb (dewilliams.co's boat.py, sailing) replaces the player's
// procedural yacht inside player.inner; the procedural one shows until the model loads and stays if it fails.
//
// Every run is its own headless Chrome (muted, not detached, killed with its profile deleted on every way out, as
// scripts/ow-live.mjs does). The page is served from a 127.0.0.1 server this script starts and stops (fetch can't read
// file://), so models/yacht.glb loads as it does on Pages. Every run pins ?t=&sea=&weather=, so the page makes no live
// weather request; fetch() is wrapped anyway: open-meteo.com is answered by a failing stub and blocked in the Network
// domain, and a request for yacht.glb can be answered by a stubbed 404 (window.__glbStub). Date is pinned
// (window.__fakeNow), so the sun is where the run expects it. Draw calls are counted by wrapping WebGL2's draw* calls,
// and frame time is the rAF interval, so the same numbers come from main's ocean.html (served from `git show`).
//
// Runs (logic at 1280 x 800, ?dpr=0.3: they read state, not pixels) through window.__game and window.__ow.yacht:
//   load     - one request for models/yacht.glb; status ok; yacht_hull / yacht_main_pivot / yacht_jib_pivot inside
//              player.inner (so heel, pitch and roll apply); the procedural hull hidden; at most 6,115 triangles; every
//              glb material through fogPatch; every glb mesh on layer 1 (the water reflection); the AI boats still
//              buildBoat's, and the player's Lh (uBoats, the wake) still 11.
//   sails    - on each tack (beam reach, sails up, not luffing): the boom angle read from yacht_main_pivot's transform
//              follows player.boom within 1 deg and swings to the lee side (sailSide); the main and the jib belly to
//              leeward; the jib head stays on the forestay. Head to wind: the luff flutter shows on the pivot. Sails
//              lowered (sailTarget 0): main and jib hidden, the boom still there; raised again: both back at full size.
//   fish     - ?mode=fish: the sails are down, the boom stays; the fishing eye clears the exported hull.
//   stub404  - yacht.glb answered by a stubbed 404: status failed, the procedural boat still shows, no page error.
//   cockpit  - ?cam=cockpit: the helm's eye clears every part of the exported hull by more than the near plane (rays in
//              all directions), stands 1.2-2.4 m over the cockpit sole, and the wheel is in front of it.
//   perf, perf-main - 390 x 844 (touch, ?dpr=1): median frame time and draw calls per frame over 150 frames, on this
//              page and on main's (git show origin/main:ocean.html). With both: draw calls no more than main's, and
//              median frame time no more than 15% over main's (swiftshader: relative numbers only).
//   WxH      - at each device size: the model loads, the yacht is on screen in the chase view, no page overflow, and
//              no page error; the median frame time is printed.
//   shots-day, shots-dusk, shots-night (with --shots DIR) - the chase and cockpit cameras in Sunny, Rain and Storm at
//              13:00, 18:20 and 21:30 on 2026-10-25, 960 x 540, saved as DIR/<tod>-<weather>-<cam>.png.
//
// Usage:
//   node scripts/ow-yacht.mjs                       # load, sails, fish, stub404, cockpit, perf-main, perf, every size
//   node scripts/ow-yacht.mjs --logic               # load, sails, fish, stub404, cockpit
//   node scripts/ow-yacht.mjs --perf                # perf-main and perf, then the comparison
//   node scripts/ow-yacht.mjs --size 844x390        # one size only (repeatable)
//   node scripts/ow-yacht.mjs --run sails           # one named run (repeatable)
//   node scripts/ow-yacht.mjs --shots DIR           # the three shot runs, saving 18 screenshots in DIR
//   node scripts/ow-yacht.mjs --page other.html --json   # another page in the repo
// Sizes by default: 568x320, 740x360, 844x390, 667x375 (docs/review-lenses.md), 390x844, 1024x768 and 1280x800.
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Each run has a 4 min deadline and the whole check 9.5 min (OW_RUN_TIMEOUT_MS / OW_HARD_TIMEOUT_MS override them); on a
// busy machine run --logic, --perf, the sizes and --shots as separate calls.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZES = ['568x320', '740x360', '844x390', '667x375', '390x844', '1024x768', '1280x800'];
const LOGIC_RUNS = ['load', 'sails', 'fish', 'stub404', 'cockpit'], PERF_RUNS = ['perf-main', 'perf'], SHOT_RUNS = ['shots-day', 'shots-dusk', 'shots-night'];
const args = process.argv.slice(2);
let json = false, page = 'ocean.html', logicOnly = false, perfOnly = false, shots = null; const sizes = [], named = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--logic') logicOnly = true;
  else if (args[i] === '--perf') perfOnly = true;
  else if (args[i] === '--size') sizes.push(args[++i]);
  else if (args[i] === '--run') named.push(args[++i]);
  else if (args[i] === '--shots') shots = path.resolve(args[++i]);
  else if (args[i] === '--page') page = args[++i];
  else if (args[i] === '-h' || args[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
  else { console.error('unknown argument: ' + args[i]); process.exit(2); }
}
const runs = [...(logicOnly ? LOGIC_RUNS : []), ...(perfOnly ? PERF_RUNS : []), ...named, ...sizes, ...(shots ? SHOT_RUNS : [])];
if (!runs.length) runs.push(...LOGIC_RUNS, ...PERF_RUNS, ...SIZES);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (shots) fs.mkdirSync(shots, { recursive: true });

// ---- the local server: the repo as Pages serves it, plus main's ocean.html at /__main/ocean.html
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.css': 'text/css' };
let mainHtml = null;
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/__main/ocean.html') {
    try { mainHtml ??= execFileSync('git', ['-C', repo, 'show', 'origin/main:ocean.html']); } catch { res.writeHead(500); return res.end('git show failed'); }
    res.writeHead(200, { 'content-type': TYPES['.html'] }); return res.end(mainHtml);
  }
  const f = path.join(repo, u);
  if (!f.startsWith(repo + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const pageUrl = (main) => origin + (main ? '/__main/ocean.html' : '/' + page);

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

// ---- injected before the page's own scripts on every navigation
const INJECT = String.raw`(() => {
  const RealDate = Date;
  window.__fakeNow = window.__fakeNow ?? RealDate.now();
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(window.__fakeNow); }
    static now() { return window.__fakeNow; }
  }
  window.Date = FakeDate;
  window.__glbReq = []; window.__wxReq = 0;
  // frame time and draw calls: each rAF callback records the interval and the draws issued since the previous one
  window.__perf = { dt: [], draws: [], tris: [] };
  let draws = 0, tris = 0, lastT = null;
  const wrap = (proto) => {
    if (!proto) return;
    for (const [name, countArg] of [['drawElements', 1], ['drawArrays', 2], ['drawElementsInstanced', 1], ['drawArraysInstanced', 2], ['drawRangeElements', 3]]) {
      const real = proto[name]; if (!real) continue;
      proto[name] = function (...a) { draws++; if (a[0] === 4) tris += (a[countArg] || 0) / 3 * (name.endsWith('Instanced') ? (a[name === 'drawElementsInstanced' ? 4 : 3] || 1) : 1); return real.apply(this, a); };
    }
  };
  wrap(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  const rAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => rAF((t) => {
    const P = window.__perf;
    if (lastT !== null && P.on) { P.dt.push(t - lastT); P.draws.push(draws); P.tris.push(tris); }
    lastT = t; draws = 0; tris = 0; cb(t);
  });
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (/open-meteo\.com/.test(url)) { window.__wxReq++; return Promise.reject(new TypeError('Failed to fetch')); }
    if (/yacht\.glb/.test(url)) {
      window.__glbReq.push(url);
      if (window.__glbStub === '404') return Promise.resolve(new Response(null, { status: 404, statusText: 'Not Found' }));
    }
    return realFetch(input, init);
  };
})();`;

let shared = null;
function launch() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-yacht-'));
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
process.on('exit', () => { killSync(shared); try { server.close(); } catch {} });
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => { kill(shared).finally(() => process.exit(code)); });
const RUN_TIMEOUT_MS = +process.env.OW_RUN_TIMEOUT_MS || 4 * 60 * 1000, HARD_TIMEOUT_MS = +process.env.OW_HARD_TIMEOUT_MS || 9.5 * 60 * 1000;
const all = [], unfinished = [], perfRes = {};
setTimeout(() => {
  console.error(`hard timeout: over ${HARD_TIMEOUT_MS / 60000} min; closing Chrome`);
  kill(shared).finally(() => { unfinished.push('the rest: hard timeout'); summary(); process.exit(2); });
}, HARD_TIMEOUT_MS).unref();

async function connect(S) {
  let tgt, port;
  for (let i = 0; i < 100 && !tgt; i++) {
    try { const f = fs.readFileSync(path.join(S.prof, 'DevToolsActivePort'), 'utf8'); if (f.includes('\n')) port = parseInt(f, 10) || undefined; } catch {}
    if (port) try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!tgt) await sleep(200);
  }
  if (!tgt) throw new Error('Chrome did not start (' + chromeBin + ')');
  const ws = S.ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map(), errs = [], net = { glb: 0, wx: 0 };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { pend.get(m.id)?.(m); pend.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) errs.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    else if (m.method === 'Network.requestWillBeSent') { const u = m.params.request.url; if (/yacht\.glb/.test(u)) net.glb++; if (/open-meteo/.test(u)) net.wx++; }
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const v = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (v.result?.exceptionDetails) throw new Error('page threw: ' + (v.result.exceptionDetails.exception?.description || v.result.exceptionDetails.text));
    return v.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['*open-meteo.com*'] });
  await send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' });
  let injected = null;
  const open = async (w, h, touch, { query = '', now = Date.parse('2026-10-25T16:00:00Z'), glb = 'real', main = false } = {}) => {
    if (injected) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected });
    const r = await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__fakeNow = ${now}; window.__glbStub = ${JSON.stringify(glb)}; try { localStorage.setItem('ow.helpSeen', '1'); } catch (e) {}\n${INJECT}` });
    injected = r.result?.identifier;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!touch, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: !!touch, maxTouchPoints: touch ? 5 : 0 });
    await send('Page.navigate', { url: pageUrl(main) + (query ? '?' + query : '') });
    for (let i = 0; i < 300; i++) { await sleep(200); if (await ev('document.readyState === "complete" && !!window.__game').catch(() => false)) return; }
    throw new Error('page did not load window.__game: ' + pageUrl(main) + '?' + query);
  };
  return { send, ev, open, errs, net };
}

// ---- in the page
const PIN = 't=13&sea=0.4&weather=sunny';   // no live clock, no live weather request
const FRAMES = (n = 3) => `new Promise((r) => { let k = 0; const f = () => (++k >= ${n} ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })`;
async function until(C, expr, ms = 30000) { const t = Date.now(); while (Date.now() - t < ms) { if (await C.ev(expr).catch(() => false)) return true; await sleep(150); } return false; }
const LOADED = `!!(window.__ow && window.__ow.yacht && window.__ow.yacht.status !== 'loading')`;
const near = (a, b, e) => typeof a === 'number' && Math.abs(a - b) <= e;
const DEG = 180 / Math.PI;

// the yacht as the scene has it: node transforms read back through matrixWorld, in player.inner's frame
const YREAD = String.raw`(async () => {
  const THREE = await import('three');
  const g = window.__game, p = g.player, inner = p.inner, Y = window.__ow && window.__ow.yacht;
  g.player.group.updateWorldMatrix(true, true);
  const toInv = new THREE.Matrix4().copy(inner.matrixWorld).invert();
  const toInner = (obj, v) => new THREE.Vector3(v[0], v[1], v[2]).applyMatrix4(obj.matrixWorld).applyMatrix4(toInv);
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const under = (o, anc) => { for (; o; o = o.parent) if (o === anc) return true; return false; };
  const procHull = p.mirror && p.mirror.children.find((o) => o.isMesh);
  const out = { status: Y ? Y.status : null, reason: Y ? Y.reason : null, procShown: !!procHull && shown(procHull),
    boom: p.boom, sail: p.sail, luff: p.luff, sideS: p.sideS, sailSide: p.sailSide, Lh: p.Lh };
  const hull = inner.getObjectByName('yacht_hull'), main = inner.getObjectByName('yacht_main_pivot'), jib = inner.getObjectByName('yacht_jib_pivot');
  out.nodes = { hull: !!hull, main: !!main, jib: !!jib, inInner: !!(hull && main && jib && under(hull, inner) && under(main, inner) && under(jib, inner)), hullShown: !!hull && shown(hull) };
  if (!main || !jib) return out;
  // the boom: its end 4.5 m aft of the gooseneck, through the pivot node's own transform
  const o = toInner(main, [0, 0, 0]), e = toInner(main, [-4.5, 0, 0]);
  out.boomNode = Math.atan2(e.z - o.z, -(e.x - o.x));
  const meshes = (n) => { const a = []; n.traverse((x) => { if (x.isMesh) a.push(x); }); return a; };
  const tall = (ms) => ms.map((m) => { m.geometry.computeBoundingBox(); return { m, h: m.geometry.boundingBox.max.y - m.geometry.boundingBox.min.y }; }).sort((a, b) => b.h - a.h);
  const mainMs = tall(meshes(main)), jibMs = tall(meshes(jib));
  const centre = (m) => { m.geometry.computeBoundingSphere(); const c = m.geometry.boundingSphere.center; return toInner(m, [c.x, c.y, c.z]); };
  const sailM = mainMs[0] && mainMs[0].m, boomM = mainMs.find((x) => x.h < 0.5)?.m, jibM = jibMs[0] && jibMs[0].m;
  out.main = sailM ? { shown: shown(sailM), z: centre(sailM).z } : null;
  out.boomMesh = boomM ? { shown: shown(boomM) } : null;
  if (sailM) { const b = new THREE.Box3().setFromObject(sailM); out.main.top = b.max.y; }
  if (jibM) {
    const P = jibM.geometry.attributes.position; let k = 0; for (let i = 1; i < P.count; i++) if (P.getY(i) > P.getY(k)) k = i;
    const head = toInner(jibM, [P.getX(k), P.getY(k), P.getZ(k)]), tack = toInner(jib, [0, 0, 0]);
    const b = new THREE.Box3().setFromObject(jibM);
    out.jib = { shown: shown(jibM), z: centre(jibM).z, head: head.toArray(), tack: tack.toArray(), top: b.max.y, width: b.max.x - b.min.x };
  }
  if (Y && Y.stay) out.stay = Y.stay.toArray ? Y.stay.toArray() : Y.stay;   // rest forestay: tack -> head, inner frame
  return out;
})()`;

const res = () => { const out = []; return { out, ok: (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; } }; };
const LQ = 'dpr=0.3&' + PIN;

async function runLoad(C) {
  const { out, ok } = res();
  await C.open(1280, 800, false, { query: LQ });
  const done = await until(C, LOADED, 60000);
  await C.ev(FRAMES(3));
  const r = await C.ev(YREAD);
  ok('load: the yacht finished loading (window.__ow.yacht.status)', done && r.status === 'ok', r);
  ok('load: exactly one request for models/yacht.glb', (await C.ev('window.__glbReq.length')) === 1 && (await C.ev('window.__glbReq[0]')).endsWith('/models/yacht.glb'), await C.ev('window.__glbReq'));
  ok('load: yacht_hull, yacht_main_pivot and yacht_jib_pivot are inside player.inner (heel, pitch, roll apply)', r.nodes.inInner && r.nodes.hullShown, r.nodes);
  ok('load: the procedural hull is hidden once the model is in', r.status === 'ok' && !r.procShown, r);
  const m = await C.ev(`(() => { const inner = window.__game.player.inner, root = inner.getObjectByName('yacht_hull')?.parent; if (!root) return null;
    let tris = 0, mats = new Set(), meshes = 0, layer1 = 0; root.traverse((o) => { if (!o.isMesh) return; meshes++; if (o.layers.isEnabled(1)) layer1++;
      const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; (Array.isArray(o.material) ? o.material : [o.material]).forEach((x) => mats.add(x)); });
    const fog = [...mats].map((x) => /uFogDen/.test(String(x.onBeforeCompile)));
    return { tris, meshes, layer1, mats: mats.size, fogged: fog.filter(Boolean).length }; })()`);
  ok('load: at most 6,115 triangles in the model as drawn', m && m.tris > 1000 && m.tris <= 6115, m);
  ok('load: every glb material goes through fogPatch (fog, haze, rain darkening)', m && m.mats > 0 && m.fogged === m.mats, m);
  ok('load: every glb mesh is on layer 1 (the water reflection)', m && m.meshes > 0 && m.layer1 === m.meshes, m);
  const ai = await C.ev(`window.__game.boats.map((b) => ({ Lh: b.Lh, glb: !!b.inner.getObjectByName('yacht_hull'), proc: b.mirror.children.some((o) => o.isMesh && o.visible) }))`);
  ok('load: the AI boats keep buildBoat (no glb in them)', ai.length === 6 && ai.every((b) => !b.glb && b.proc), ai);
  ok('load: the player\'s Lh stays 11 (uBoats, the wake shader)', r.Lh === 11, r.Lh);
  ok('load: no request reached open-meteo.com', C.net.wx === 0 && (await C.ev('window.__wxReq')) === 0, C.net);
  return out;
}

async function runSails(C) {
  const { out, ok } = res();
  await C.open(1280, 800, false, { query: LQ });
  const done = await until(C, LOADED, 60000);
  if (!ok('sails: the yacht loaded', done && (await C.ev('window.__ow.yacht.status')) === 'ok', await C.ev('window.__ow && window.__ow.yacht'))) return out;
  const sample = async (n) => { const a = []; for (let i = 0; i < n; i++) { await C.ev(FRAMES(1)); a.push(await C.ev(YREAD)); } return a; };
  for (const [tack, off] of [['starboard-tack (sails to port)', -Math.PI / 2], ['port-tack (sails to starboard)', Math.PI / 2]]) {
    // a beam reach: the wind on one side, sails settled on the other, auto-trim on
    await C.ev(`(() => { const p = window.__game.player; p.psi = window.__game.sea.windAngle + ${off}; p.autoTrim = true; p.sailTarget = 1; p.sail = 1; })()`);
    const settled = await until(C, `(() => { const p = window.__game.player; p.psi = window.__game.sea.windAngle + ${off}; return Math.abs(Math.abs(p.sideS) - 1) < 1e-6 && p.luff < 0.005 && p.sail > 0.99; })()`, 60000);
    const s = (await sample(8)).filter((r) => r.boomNode != null);
    const lee = s[0]?.sailSide;
    const worst = s.reduce((m, r) => Math.max(m, Math.abs(Math.abs(r.boomNode) - r.boom)), 0);
    ok(`sails ${tack}: settled (sideS +-1, not luffing, sails up)`, settled && s.length === 8, s[0]);
    ok(`sails ${tack}: the boom angle read from yacht_main_pivot is within 1 deg of player.boom`, s.length > 0 && worst * DEG <= 1, { worstDeg: worst * DEG, sample: s.slice(0, 2).map((r) => ({ node: r.boomNode, boom: r.boom })) });
    ok(`sails ${tack}: the boom swings to the lee side (sign = sailSide)`, s.length > 0 && s.every((r) => Math.sign(r.boomNode) === r.sailSide && r.boom > 0.1), s.map((r) => [r.boomNode, r.sailSide]));
    const r = s[0] || {};
    ok(`sails ${tack}: the main and the jib belly to leeward`, r.main && r.jib && Math.sign(r.main.z) === lee && Math.sign(r.jib.z) === lee && r.main.shown && r.jib.shown, { main: r.main, jib: r.jib, lee });
    if (r.jib && r.stay) {
      const [tx, ty, tz] = r.stay.slice(0, 3), [hx, hy, hz] = r.stay.slice(3, 6), [px, py, pz] = r.jib.head;
      const d = [hx - tx, hy - ty, hz - tz], L = Math.hypot(...d), q = [px - tx, py - ty, pz - tz], t = (q[0] * d[0] + q[1] * d[1] + q[2] * d[2]) / L;
      const off2 = Math.hypot(q[0] - d[0] * t / L, q[1] - d[1] * t / L, q[2] - d[2] * t / L);
      ok(`sails ${tack}: the jib head stays on the forestay (within 5 cm)`, off2 < 0.05, { off: off2, head: r.jib.head, stay: r.stay });
    } else ok(`sails ${tack}: the jib head stays on the forestay (within 5 cm)`, false, { jib: r.jib, stay: r.stay });
  }
  // head to wind: luffing; the flutter shows on the pivot node
  await C.ev(`(() => { const p = window.__game.player; p.autoTrim = true; })()`);
  await until(C, `(() => { const p = window.__game.player; p.psi = window.__game.sea.windAngle + Math.PI + 0.3; return p.luff > 0.9; })()`, 60000);
  const lf = [];
  for (let i = 0; i < 10; i++) { await C.ev(`(() => { const p = window.__game.player; p.psi = window.__game.sea.windAngle + Math.PI + 0.3; })()`); await C.ev(FRAMES(1)); lf.push(await C.ev(YREAD)); }
  const ang = lf.map((r) => r.boomNode).filter((v) => v != null), mean = ang.reduce((a, b) => a + b, 0) / (ang.length || 1), sd = Math.sqrt(ang.reduce((a, b) => a + (b - mean) ** 2, 0) / (ang.length || 1));
  ok('sails: head to wind the sails luff: the main pivot flutters (sd > 0.3 deg over 10 frames)', lf[0]?.luff > 0.9 && sd * DEG > 0.3, { luff: lf[0]?.luff, sdDeg: sd * DEG, ang });
  // lower, then raise
  await C.ev(`(() => { const p = window.__game.player; p.psi = window.__game.sea.windAngle + Math.PI / 2; p.sailTarget = 0; })()`);
  const down = await until(C, `window.__game.player.sail < 0.02`, 90000);
  await C.ev(FRAMES(2));
  let r = await C.ev(YREAD);
  ok('sails: lowered (sailTarget 0): the main and the jib are hidden, the boom stays', down && r.main && !r.main.shown && r.jib && !r.jib.shown && r.boomMesh?.shown, { down, main: r.main, jib: r.jib, boom: r.boomMesh });
  await C.ev(`window.__game.player.sailTarget = 1`);
  const up = await until(C, `window.__game.player.sail > 0.995`, 90000);
  await C.ev(FRAMES(2));
  r = await C.ev(YREAD);
  ok('sails: raised again: the main reaches the masthead area and the jib is back at full width', up && r.main?.shown && r.jib?.shown && r.main.top > 14 && r.jib.top > 12 && r.jib.width > 2.5, { up, main: r.main, jib: r.jib });
  return out;
}

// rays from the camera in every direction against the exported hull: the nearest hit, the hit straight down
const EYE = String.raw`(async () => {
  const THREE = await import('three');
  const g = window.__game, hull = g.player.inner.getObjectByName('yacht_hull'); if (!hull) return null;
  g.player.group.updateWorldMatrix(true, true);
  const eye = g.camera.position.clone(), rc = new THREE.Raycaster(); rc.near = 0; rc.far = 3;
  let min = Infinity, at = null; const N = 600;
  for (let i = 0; i < N; i++) {
    const y = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), th = i * 2.399963;
    const d = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
    rc.set(eye, d); const h = rc.intersectObject(hull, true)[0];
    if (h && h.distance < min) { min = h.distance; at = d.toArray(); }
  }
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(g.player.group.quaternion);
  rc.set(eye, down); rc.far = 5; const hd = rc.intersectObject(hull, true)[0];
  // the wheel: a hull hit in front of the eye, within 1.5 m, inside the view (the camera's -z)
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion); let front = Infinity;
  for (let i = 0; i < 200; i++) {
    const a = (i % 20 - 9.5) * 0.04, b = (Math.floor(i / 20) - 6) * 0.05;
    const d = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a); d.y += b; d.normalize();
    rc.set(eye, d); rc.far = 1.5; const h = rc.intersectObject(hull, true)[0]; if (h) front = Math.min(front, h.distance);
  }
  return { min, at, down: hd ? hd.distance : null, front: front === Infinity ? null : front, near: g.camera.near, mode: g.cam.mode };
})()`;

async function runCockpit(C) {
  const { out, ok } = res();
  await C.open(1280, 800, false, { query: LQ + '&cam=cockpit' });
  const done = await until(C, LOADED, 60000);
  await C.ev(FRAMES(3));
  if (!ok('cockpit: the yacht loaded', done && (await C.ev('window.__ow.yacht.status')) === 'ok', await C.ev('window.__ow && window.__ow.yacht'))) return out;
  for (const look of [0, 1.2, -1.2]) {
    await C.ev(`window.__game.cam.lookYaw = ${look}`); await C.ev(FRAMES(2));
    const e = await C.ev(EYE);
    ok(`cockpit (look ${look}): every part of the hull is more than the near plane + 5 cm from the eye`, e && e.mode === 'cockpit' && e.min > e.near + 0.05, e);
    if (look === 0) {
      ok('cockpit: the eye stands 1.2-2.4 m over the cockpit sole', e && e.down > 1.2 && e.down < 2.4, e);
      ok('cockpit: the wheel is in front of the eye (a hull hit ahead within 1.5 m)', e && e.front != null && e.front > e.near, e);
    }
  }
  await C.ev(`window.__game.cam.lookYaw = 0`);
  return out;
}

async function runFish(C) {
  const { out, ok } = res();
  await C.open(1280, 800, false, { query: LQ + '&mode=fish' });
  const done = await until(C, LOADED, 60000);
  await C.ev(FRAMES(3));
  const r = await C.ev(YREAD);
  ok('fish: the yacht loaded', done && r.status === 'ok', r);
  ok('fish: ?mode=fish has the sails down: main and jib hidden', r.sail < 0.03 && r.main && !r.main.shown && r.jib && !r.jib.shown, { sail: r.sail, main: r.main, jib: r.jib });
  ok('fish: the boom stays on its gooseneck', !!r.boomMesh?.shown, r.boomMesh);
  const e = await C.ev(EYE);
  ok('fish: the fishing eye clears every part of the hull by more than the near plane', e && e.mode === 'fish' && e.min > e.near + 0.05, e);
  return out;
}

async function runStub(C) {
  const { out, ok } = res();
  await C.open(1280, 800, false, { query: LQ, glb: '404' });
  const done = await until(C, LOADED, 30000);
  await C.ev(FRAMES(5)); await sleep(500);
  const r = await C.ev(YREAD);
  ok('stub404: yacht.glb was asked for and answered 404 by the stub (nothing on the network)', (await C.ev('window.__glbReq.length')) >= 1 && C.net.glb === 0, { req: await C.ev('window.__glbReq'), net: C.net });
  ok('stub404: status failed', done && r.status === 'failed', r);
  ok('stub404: the procedural boat still shows, and no glb node is in player.inner', r.procShown && !r.nodes.hull, r);
  ok('stub404: the sails still pose on the procedural rig', await C.ev(`(() => { const p = window.__game.player; return p.mainSail.visible && Math.abs(p.mainPivot.rotation.y) > 0.02; })()`));
  return out;
}

async function runPerf(C, which) {
  const { out, ok } = res();
  const main = which === 'perf-main';
  await C.open(390, 844, true, { query: 'dpr=1&' + PIN, main });
  if (!main) await until(C, LOADED, 60000);
  await sleep(4000);
  const st = main ? null : await C.ev('window.__ow && window.__ow.yacht && window.__ow.yacht.status');
  if (!main) ok('perf: the yacht loaded', st === 'ok', st);
  const m = await C.ev(`(async () => { const P = window.__perf; P.dt = []; P.draws = []; P.tris = []; P.on = true; await ${FRAMES(150)}; P.on = false;
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }, p90 = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * 0.9)]; };
    return { frames: P.dt.length, ms: med(P.dt), p90: p90(P.dt), draws: med(P.draws), tris: Math.round(med(P.tris)) }; })()`);
  perfRes[which] = m;
  ok(`${which}: 150 frames measured at 390 x 844`, m.frames >= 140, m);
  if (!json) console.log(`  ${which}: median ${m.ms.toFixed(1)} ms/frame (p90 ${m.p90.toFixed(1)}), ${m.draws} draw calls, ${m.tris} triangles per frame`);
  if (perfRes.perf && perfRes['perf-main']) {
    const a = perfRes.perf, b = perfRes['perf-main'];
    ok('perf vs main: no more draw calls per frame than main', a.draws <= b.draws, { branch: a, main: b });
    ok('perf vs main: median frame time no more than 15% over main\'s', a.ms <= b.ms * 1.15, { branch: a, main: b });
  }
  return out;
}

async function runSize(C, size) {
  const [w, h] = size.split('x').map(Number), touch = w < 1200;
  const { out, ok } = res();
  await C.open(w, h, touch, { query: PIN });
  const done = await until(C, LOADED, 60000);
  await C.ev(FRAMES(3));
  const r = await C.ev(`(async () => { const THREE = await import('three'); const g = window.__game, Y = window.__ow && window.__ow.yacht, hull = g.player.inner.getObjectByName('yacht_hull');
    let ndc = null; if (hull) { g.player.group.updateWorldMatrix(true, true); const b = new THREE.Box3().setFromObject(hull), c = b.getCenter(new THREE.Vector3()).project(g.camera); ndc = [c.x, c.y, c.z]; }
    const cv = document.getElementById('c').getBoundingClientRect();
    return { status: Y ? Y.status : null, ndc, docX: document.documentElement.scrollWidth - innerWidth, docY: document.documentElement.scrollHeight - innerHeight, cv: [cv.left, cv.top, cv.width, cv.height], W: innerWidth, H: innerHeight }; })()`);
  ok('the yacht loaded', done && r.status === 'ok', r);
  ok('the yacht is on screen in the chase view', r.ndc && Math.abs(r.ndc[0]) < 1 && Math.abs(r.ndc[1]) < 1 && r.ndc[2] < 1, r);
  ok('the canvas fills the viewport, no page overflow', r.docX <= 0 && r.docY <= 0 && r.cv[0] === 0 && r.cv[1] === 0 && r.cv[2] === r.W && r.cv[3] === r.H, r);
  const m = await C.ev(`(async () => { const P = window.__perf; P.dt = []; P.draws = []; P.on = true; await ${FRAMES(40)}; P.on = false; const s = [...P.dt].sort((x, y) => x - y); return { ms: s[Math.floor(s.length / 2)], draws: [...P.draws].sort((x, y) => x - y)[Math.floor(P.draws.length / 2)] }; })()`);
  if (!json) console.log(`  ${size}: median ${m.ms.toFixed(1)} ms/frame, ${m.draws} draw calls`);
  return out.map((x) => ({ ...x, name: size + ': ' + x.name }));
}

const SHOT_TOD = { 'shots-day': ['day', 13], 'shots-dusk': ['dusk', 18.33], 'shots-night': ['night', 21.5] };
async function runShots(C, run) {
  const { out, ok } = res();
  const [label, tod] = SHOT_TOD[run];
  for (const wx of ['sunny', 'rain', 'storm']) {
    await C.open(960, 540, false, { query: `t=${tod}&sea=0.4&weather=${wx}&simTime=40&hideUI&dpr=1` });
    const done = await until(C, LOADED, 60000);
    ok(`${label} ${wx}: the yacht loaded`, done && (await C.ev('window.__ow.yacht.status')) === 'ok', await C.ev('window.__ow && window.__ow.yacht'));
    for (const cm of ['chase', 'cockpit']) {
      await C.ev(`(() => { const c = window.__game.cam; c.mode = '${cm}'; c.lookYaw = 0; c.lookPitch = -0.03; })()`);
      await C.ev(FRAMES(4));
      const s = await C.send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(s.result.data, 'base64');
      fs.writeFileSync(path.join(shots, `${label}-${wx}-${cm}.png`), buf);
      ok(`${label} ${wx} ${cm}: screenshot saved`, buf.length > 10000, buf.length);
    }
  }
  return out;
}

function summary() {
  const failed = all.filter((r) => !r.pass);
  if (json) console.log(JSON.stringify({ url: pageUrl(false), runs, checks: all, failed: failed.length, unfinished, perf: perfRes }, null, 1));
  else console.log(`${pageUrl(false)}\n${all.length - failed.length}/${all.length} checks pass${unfinished.length ? `, ${unfinished.length} run(s) did not finish` : ''}: ${failed.length || unfinished.length ? 'FAIL' : 'PASS'}`);
  return unfinished.length ? 2 : failed.length ? 1 : 0;
}

async function main() {
  for (const run of runs) {
    const S = launch(); const t0 = Date.now();
    try {
      const C = await connect(S);
      const job = run === 'load' ? runLoad(C) : run === 'sails' ? runSails(C) : run === 'fish' ? runFish(C) : run === 'stub404' ? runStub(C)
        : run === 'cockpit' ? runCockpit(C) : run.startsWith('perf') ? runPerf(C, run) : run.startsWith('shots-') ? runShots(C, run) : /^\d+x\d+$/.test(run) ? runSize(C, run) : Promise.reject(new Error('unknown run ' + run));
      job.catch(() => {});
      let timer;
      const r = await Promise.race([job, new Promise((_, j) => { timer = setTimeout(() => j(new Error(`over ${RUN_TIMEOUT_MS / 60000} min`)), RUN_TIMEOUT_MS); })]).finally(() => clearTimeout(timer));
      r.push(C.errs.length ? { name: run + ': no page errors', pass: false, got: C.errs.slice(0, 10) } : { name: run + ': no page errors', pass: true });
      all.push(...r);
      const bad = r.filter((x) => !x.pass);
      if (!json) {
        console.log(`${run}: ${r.length - bad.length}/${r.length} pass  (${((Date.now() - t0) / 1000).toFixed(1)} s)${bad.length ? '  FAIL' : ''}`);
        for (const x of bad) console.log('  FAIL ' + x.name + '\n       ' + JSON.stringify(x.got)?.slice(0, 900));
      }
    } catch (e) {
      unfinished.push(run + ': ' + (e?.message || e));
      if (!json) console.log(`${run}: did not finish: ${e?.message || e}`);
    } finally { await kill(S); }
  }
  return summary();
}

let code = 2;
try { code = await main(); }
catch (e) { console.error('check failed: ' + (e?.stack || e?.message || e)); }
finally { await kill(shared); server.close(); }
process.exit(code);
