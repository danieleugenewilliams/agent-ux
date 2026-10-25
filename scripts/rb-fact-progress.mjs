#!/usr/bin/env node
// Robot Battle fact progress check (#133): Facts.progress and what the grid and the parent view show from it.
//
// Two kinds of run, each in its own headless Chrome (muted, not detached, killed with its profile deleted on every
// way out, as scripts/rb-jump-sweep.mjs does):
//   logic   - at 1280 x 800, through window.__rb and the tracker's clock (__rb.clock):
//             * every stage: New with streak 0 / 1, Learning with 0 / 1 fast days, Known with 2 fast days, Mastered,
//               Mastered needing a polish, Orion's quick check (1 fast answer -> Known);
//             * today counted vs not; a miss today blocks today;
//             * progress agrees with what answer() then does: fixtures answered fast once a day reach Mastered in
//               exactly toMastered days; a Known fact with 2 fast days goes Mastered on a new day exactly when progress
//               said 1 more; a polish clears with one fast answer the same day it slipped; and a seeded random walk
//               (fast / slow / too-slow / miss / next day, on Apollo's and Orion's facts) checks every answer against the
//               progress read just before it;
//             * Apollo's records: 1 x 6 (Known, days [d1, today]) and 2 x 3 (Learning, days [today]);
//             * reading never writes: the saved record, the stage counts, the star total and the backup are the same
//               before and after opening the grid and the parent view and tapping facts; entries keep their old fields
//               only; a saved record reloads as it was, with the same progress.
//   size    - at each size: the grid's tap info (by touch, then the keyboard's arrows) and the parent view (a touch on a
//             cell) show the progress for Apollo's records, every element on screen (bounding boxes), the grid panel not
//             scrolling, no horizontal overflow, the rules key there, and no answer in the grid's info.
//
// Usage:
//   node scripts/rb-fact-progress.mjs                        # ./robot-battle.html: logic, then every size
//   node scripts/rb-fact-progress.mjs --logic                # the logic run only
//   node scripts/rb-fact-progress.mjs --size 568x320         # one size only (repeatable); no logic run
//   node scripts/rb-fact-progress.mjs --shots DIR            # also save a screenshot of the grid and parent view per size
//   node scripts/rb-fact-progress.mjs path/or/url.html --json
// Sizes by default: 390x844, 568x320, 768x1024, 820x1180, 1280x800 (#133), and 740x360, 844x390, 667x375 (the
// sideways phones in docs/review-lenses.md). Each size is its own Chrome launch.
// Chrome: CHROME=/path, else Playwright's chrome-headless-shell, else Google Chrome / Chromium. Node 22+.
// Exit 0 only if every check in every run passes with no page errors; 1 on a failed check; 2 if a run could not finish.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SIZES = ['390x844', '568x320', '768x1024', '820x1180', '1280x800', '740x360', '844x390', '667x375'];
const args = process.argv.slice(2);
let json = false, target = null, logicOnly = false, shots = null; const sizes = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true;
  else if (args[i] === '--logic') logicOnly = true;
  else if (args[i] === '--size') sizes.push(args[++i]);
  else if (args[i] === '--shots') shots = path.resolve(args[++i]);
  else if (args[i] === '-h' || args[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
  else target = args[i];
}
const runs = logicOnly ? ['logic'] : sizes.length ? sizes : ['logic', ...SIZES];
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

// ---- in the page: shared helpers, then the records the checks read ----
// D = a day (ms). fast = right in 1.5 s (a typical time that can't spell a product), slow = right in 4 s (not fast, not
// too slow), crawl = right in 7 s (over FACT.slow: a Mastered fact slips), miss = wrong.
const HELPERS = String.raw`
  const R = window.__rb, D = 864e5, out = [];
  const ok = (name, pass, got) => { out.push({ name, pass: !!pass, got: pass ? undefined : got }); return !!pass; };
  const fast = (a, b) => R.answer(a, b, a * b, 1500), slow = (a, b) => R.answer(a, b, a * b, 4000);
  const crawl = (a, b) => R.answer(a, b, a * b, 7000), miss = (a, b) => R.answer(a, b, a * b + 1, 1500);
  const day = () => R.clock(D);
  const P = (a, b, child) => R.progress(a, b, child);
  const entry = (a, b) => R.Facts.rec.facts['×' + Math.min(a, b) + ',' + Math.max(a, b)];
  const today = () => R.Facts.day();
  const has = (p, o) => !!p && Object.entries(o).every(([k, v]) => (v && typeof v === 'object' ? has(p[k], v) : p[k] === v));
  const js = (x) => JSON.stringify(x);
`;
// Apollo's records, as #133 describes them, built through answer() and the clock (the day the grid is read is "today"):
//   1 x 6 Known, days [d1, today]; 2 x 3 Learning, days [today]; 1 x 7 Mastered; 1 x 8 Mastered needing a polish;
//   1 x 9 Learning after a miss today (days [d1] kept, today blocked); 1 x 1 New, streak 0; 1 x 2 New, streak 1 (slow);
//   1 x 3 New, streak 1 (fast: today counted); 1 x 4 Learning with 0 fast days (two slow); 2 x 7 Known (for "no answer")
const BUILD = String.raw`
  R.manual(true); R.player('apollo');
  fast(1, 7); fast(1, 7); fast(1, 8); fast(1, 8); fast(1, 9); fast(1, 9); fast(2, 7); fast(2, 7);
  day();                                     // d1, the day before "today"
  fast(1, 6); fast(1, 6); fast(1, 7); fast(1, 8); fast(1, 9); fast(2, 7);
  day();
  fast(1, 7); fast(1, 8); miss(1, 8);        // 1 x 7 Mastered; 1 x 8 Mastered, then slips: a polish
  fast(1, 6); miss(1, 9);                    // 1 x 6 Known (days [d1, today]); 1 x 9 was Known (days [d0, d1]): a miss today, Learning, blocked
  fast(2, 3); fast(2, 3);                    // 2 x 3 Learning, days [today]
  slow(1, 2); fast(1, 3); slow(1, 4); slow(1, 4);
`;

const LOGIC = String.raw`(() => {
  ${HELPERS}
  if (typeof R.progress !== 'function') { ok('__rb.progress exists (Facts.progress)', false, typeof R.progress); return out; }
  if (typeof R.Facts.progress !== 'function') ok('Facts.progress exists', false, typeof R.Facts.progress);

  // ---- Orion's quick check (step 1 is kind 'check'): a fact never answered goes to Known on 1 fast answer
  R.manual(true); R.player('orion');
  let p = P(3, 7);
  ok('check step: a fresh fact needs 1 fast answer -> Known', has(p, { stage: 'new', next: 'known', need: { kind: 'check', have: 0, want: 1 }, toMastered: 3, today: 'open', todayCounted: false }), p);
  let r = fast(3, 7);
  ok('check step: answer() then makes it Known, as progress said', r.to === 'known', r);
  p = P(3, 7);
  ok('check step: after it, Known with 1 fast day: 2 more to Mastered, today counted', has(p, { stage: 'known', next: 'mastered', need: { kind: 'days', have: 1, want: 3 }, toMastered: 2, todayCounted: true, today: 'counted' }), p);
  p = P(4, 7);
  r = slow(4, 7);
  ok('check step: a slow first answer is Learning (progress still said check)', p.need?.kind === 'check' && r.to === 'learning', { p, r });
  p = P(4, 7);
  ok('check step: after a slow check, Learning with 0 fast days', has(p, { stage: 'learning', next: 'known', need: { kind: 'days', have: 0, want: 2 }, toMastered: 3, today: 'open' }), p);

  // ---- Apollo's records
  ${BUILD}
  const T = today();
  p = P(1, 1);
  ok('New, streak 0: right in a row 0/2 -> Learning, 3 fast days to Mastered', has(p, { stage: 'new', next: 'learning', need: { kind: 'streak', have: 0, want: 2 }, toMastered: 3, today: 'open', todayCounted: false }), p);
  p = P(1, 2);
  ok('New, streak 1 (slow): 1/2, today still open', has(p, { stage: 'new', next: 'learning', need: { kind: 'streak', have: 1, want: 2 }, toMastered: 3, today: 'open' }), p);
  p = P(1, 3);
  ok('New, streak 1 (fast): 1/2, today counted, 2 to Mastered', has(p, { stage: 'new', need: { kind: 'streak', have: 1, want: 2 }, toMastered: 2, today: 'counted', todayCounted: true }), p);
  p = P(1, 4);
  ok('Learning with 0 fast days: 0/2 -> Known, 3 to Mastered', has(p, { stage: 'learning', next: 'known', need: { kind: 'days', have: 0, want: 2 }, toMastered: 3, today: 'open' }), p);
  p = P(2, 3);
  ok("Apollo's 2 x 3 (Learning, days [today]): 1/2 -> Known, 2 more fast days to Mastered, today counted", has(p, { stage: 'learning', next: 'known', need: { kind: 'days', have: 1, want: 2 }, toMastered: 2, today: 'counted', todayCounted: true }) && js(entry(2, 3).days) === js([T]), { p, days: entry(2, 3).days, T });
  p = P(1, 6);
  ok("Apollo's 1 x 6 (Known, days [d, today]): 2/3 -> Mastered, 1 more fast day, today counted", has(p, { stage: 'known', next: 'mastered', need: { kind: 'days', have: 2, want: 3 }, toMastered: 1, today: 'counted', todayCounted: true }) && entry(1, 6).days.length === 2 && entry(1, 6).days[1] === T, { p, days: entry(1, 6).days, T });
  p = P(1, 7);
  ok('Mastered: nothing more to do', has(p, { stage: 'mastered', next: null, need: null, toMastered: 0, polish: false }), p);
  p = P(1, 8);
  ok('Mastered needing a polish: 1 fast answer to shine (today needn\'t be open)', has(p, { stage: 'mastered', need: { kind: 'polish', have: 0, want: 1 }, toMastered: 0, polish: true }), p);
  p = P(1, 9);
  ok('a miss today blocks today: Known -> Learning, 1 fast day kept, today blocked', has(p, { stage: 'learning', next: 'known', need: { kind: 'days', have: 1, want: 2 }, toMastered: 2, today: 'blocked', todayCounted: false }) && entry(1, 9).missDay === T, { p, e: entry(1, 9) });
  p = P(5, 5);
  ok('a fact never answered (not on the ladder yet) reads as New and writes nothing', has(p, { stage: 'new', need: { kind: 'streak', have: 0, want: 2 }, toMastered: 3 }) && !R.Facts.rec.facts['×5,5'], p);

  // today counted: another fast answer the same day changes neither days nor stage
  let before = js(entry(1, 6).days); r = fast(1, 6);
  ok('today counted: a 2nd fast answer the same day leaves 1 x 6 Known with the same days', r.to === 'known' && js(entry(1, 6).days) === before, { r, before, after: entry(1, 6).days });
  before = js(entry(1, 9).days); r = fast(1, 9);
  ok('today blocked: a fast answer after the miss leaves 1 x 9 Learning with the same days', r.to === 'learning' && js(entry(1, 9).days) === before && P(1, 9).today === 'blocked', { r, before, after: entry(1, 9).days });
  // polish: one fast answer clears it, the same day it slipped
  r = fast(1, 8);
  p = P(1, 8);
  ok('polish: a fast answer the same day clears it, as progress said', r.polished === true && has(p, { stage: 'mastered', need: null, polish: false }), { r, p });

  // ---- the next day: answer() does what progress said
  day();
  p = P(1, 6);
  ok('next day: 1 x 6 today open, still 1 more', has(p, { stage: 'known', today: 'open', toMastered: 1, need: { have: 2, want: 3 } }), p);
  r = fast(1, 6);
  ok('a Known fact with 2 fast days, answered fast on a new day, is Mastered exactly when progress said 1 more', r.from === 'known' && r.to === 'mastered', r);
  p = P(1, 9);
  ok('next day: 1 x 9 is no longer blocked', has(p, { today: 'open', stage: 'learning', need: { have: 1, want: 2 } }), p);
  // fixtures answered fast once a day reach Mastered in exactly toMastered days
  for (const [a, b] of [[2, 3], [1, 9], [1, 1], [1, 4], [2, 8]]) {
    const p0 = P(a, b); let n = 0, to = p0.stage;
    for (let d = 0; d < 6 && to !== 'mastered'; d++) {
      const q = P(a, b);
      // New needs 2 right in a row: answered twice on its first day (the 2nd the same day doesn't count again)
      if (q.today === 'open') { n++; to = fast(a, b).to; if (to === 'new') to = fast(a, b).to; }
      if (to !== 'mastered') day();
    }
    ok(a + ' x ' + b + ': fast once a day, Mastered after exactly toMastered (' + p0.toMastered + ') counted days', to === 'mastered' && n === p0.toMastered, { p0, n, to });
  }

  // ---- a seeded random walk: every answer checked against the progress read just before it
  let seed = 133; const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  const walk = (child, facts, steps) => {
    R.player(child); let bad = 0, first = null;
    for (let i = 0; i < steps; i++) {
      const x = rnd();
      if (x < 0.12) { day(); continue; }
      const [a, b] = facts[Math.floor(rnd() * facts.length)];
      const p = P(a, b), kind = x < 0.55 ? 'fast' : x < 0.7 ? 'slow' : x < 0.8 ? 'crawl' : 'miss';
      const e0 = R.Facts.rec.facts['×' + a + ',' + b], d0 = e0 ? e0.days.length : 0;
      const res = { fast, slow, crawl, miss }[kind](a, b), e = res.fact, q = P(a, b);
      const counts = kind === 'fast' && p.today === 'open';   // a fast right answer on a day that hasn't counted or been missed
      const errs = [];
      if (kind !== 'miss' && !(p.stage === 'mastered' && kind === 'crawl') && e.days.length !== d0 + (counts ? 1 : 0)) errs.push('days ' + d0 + ' -> ' + e.days.length + ' (today ' + p.today + ')');
      if (p.need?.kind === 'check' && kind !== 'miss') { if (res.to !== (kind === 'fast' ? 'known' : 'learning')) errs.push('check -> ' + res.to); }
      else if (p.need?.kind === 'streak' && kind !== 'miss') { if ((res.to !== 'new') !== (p.need.have + 1 >= p.need.want)) errs.push('streak ' + p.need.have + '/' + p.need.want + ' -> ' + res.to); }
      else if (p.need?.kind === 'days' && kind !== 'miss') { if ((res.to === p.next) !== (p.need.have + (counts ? 1 : 0) >= p.need.want)) errs.push('days ' + p.need.have + '/' + p.need.want + ' ' + p.today + ' -> ' + res.to); }
      else if (p.need?.kind === 'polish' && kind === 'fast') { if (!res.polished || q.polish) errs.push('polish not cleared'); }
      if (p.stage !== 'mastered' && kind !== 'miss' && p.need?.kind !== 'check' && (res.to === 'mastered') !== (p.toMastered - (counts ? 1 : 0) <= 0)) errs.push('toMastered ' + p.toMastered + ' -> ' + res.to);
      if (kind === 'miss' && (q.today !== 'blocked' || q.todayCounted)) errs.push('a miss did not block today: ' + q.today);
      if (counts && !(q.todayCounted && q.today === 'counted')) errs.push('a counted day not shown as counted');
      if (q.stage !== e.s || q.toMastered !== (e.s === 'mastered' ? 0 : Math.max(0, 3 - e.days.length))) errs.push('progress after does not read the entry');
      if (errs.length) { bad++; first ||= { i, child, fact: a + 'x' + b, kind, p, res: { from: res.from, to: res.to, polished: res.polished }, errs }; }
    }
    return { bad, first };
  };
  const ap = walk('apollo', [[2, 2], [2, 4], [2, 5], [2, 6], [2, 9], [1, 5]], 900);
  ok('random walk (Apollo, 900 steps): every answer matches the progress read before it', ap.bad === 0, ap);
  const or = walk('orion', [[5, 6], [5, 7], [6, 6], [6, 8], [7, 9], [8, 9]], 900);
  ok('random walk (Orion, from the quick check, 900 steps): every answer matches', or.bad === 0, or);
  return out;
})()`;

// reading never writes: the saved record, stage counts, star total and backup before and after the grid and parent view
const SNAP = String.raw`(() => { const R = window.__rb, b = R.backup(); delete b.exported;
  return JSON.stringify({ rec: localStorage.getItem('robotbattle.facts.apollo'), counts: R.grid('apollo').counts, star: R.mastered('apollo'), backup: b }); })()`;
const FIELDS = String.raw`(() => { const ok = new Set(['op', 'a', 'b', 's', 'streak', 'n', 'right', 'ms', 'hist', 'days', 'missDay', 'due', 'box', 'miss', 'last', 'polish']);
  const r = JSON.parse(localStorage.getItem('robotbattle.facts.apollo')); return Object.entries(r.facts).flatMap(([k, e]) => Object.keys(e).filter((f) => !ok.has(f)).map((f) => k + '.' + f)); })()`;
const UI_PREP = String.raw`(() => { const R = window.__rb; R.player('apollo'); R.start(0); return true; })()`;
const UI_READS = String.raw`(() => { const R = window.__rb;
  R.showGrid(true); for (const [a, b] of [[1, 6], [2, 3], [5, 5], [9, 9], [1, 8]]) R.tapCell(a, b); R.showGrid(false);
  R.parent(true, 'apollo'); for (const [a, b] of [[1, 6], [4, 4], [2, 3]]) document.querySelector('#pBody .fgrid .cell[data-a="' + a + '"][data-b="' + b + '"]').click();
  R.parent(false); return true; })()`;

// ---- the size runs: after BUILD, the grid by touch and keys, then the parent view by touch ----
const SETUP = String.raw`(() => { ${HELPERS} ${BUILD} R.start(0); return R.Facts.day(); })()`;
const BOX = String.raw`((sel, root) => {
  const W = innerWidth, H = innerHeight, bad = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
    if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) bad.push({ el: (el.id || el.className?.baseVal || el.className || el.tagName) + '', l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) });
  }
  const p = root && document.querySelector(root);
  return { W, H, bad, scrollY: p ? p.scrollHeight - p.clientHeight : null, scrollX: p ? p.scrollWidth - p.clientWidth : null, docX: document.documentElement.scrollWidth - W };
})`;

// the grid panel's column: the title, the tap info and the legend one under another (a squeezed row overlaps the next),
// and the info's and the legend's parts inside their own boxes
const STACK = String.raw`(() => {
  const R = (el) => el.getBoundingClientRect(), bad = [], q = (s) => document.querySelector(s);
  const [t, i, l] = [R(q('#grid .panel .top')), R(q('#gridInfo')), R(q('#gridLegend'))];
  if (t.bottom > i.top + 0.5) bad.push({ top: Math.round(t.bottom), info: Math.round(i.top) });
  if (i.bottom > l.top + 0.5) bad.push({ info: Math.round(i.bottom), legend: Math.round(l.top) });
  for (const [box, sel] of [[i, '#gridInfo *'], [l, '#gridLegend *']]) for (const el of document.querySelectorAll(sel)) {
    const r = R(el); if (!r.width && !r.height) continue;
    if (el.closest('.polm')) continue;   // (#115's ✨ mark sits over its cell's corner on purpose)
    if (r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5 || r.left < box.left - 0.5 || r.right > box.right + 0.5) bad.push({ el: (el.className?.baseVal ?? el.className) || el.tagName, t: Math.round(r.top), b: Math.round(r.bottom), boxT: Math.round(box.top), boxB: Math.round(box.bottom) });
  }
  return bad.slice(0, 8);
})()`;

let shared = null;   // the Chrome process of the run under way, for cleanup on a signal
function launch() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-fact-progress-'));
  // port 0, muted, not detached: as scripts/rb-jump-sweep.mjs (#105)
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
const HARD_TIMEOUT_MS = 12 * 60 * 1000;
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
  let id = 0; const pend = new Map(), errs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { pend.get(m.id)?.(m); pend.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) errs.push('log: ' + m.params.entry.text);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const v = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (v.result?.exceptionDetails) throw new Error('page threw: ' + (v.result.exceptionDetails.exception?.description || v.result.exceptionDetails.text));
    return v.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  const open = async (w, h, touch) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!touch, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: !!touch, maxTouchPoints: touch ? 5 : 0 });
    await send('Page.navigate', { url });
    for (let i = 0; i < 150; i++) { await sleep(200); if (await ev('document.readyState === "complete" && !!window.__rb').catch(() => false)) return; }
    throw new Error('page did not load window.__rb: ' + url);
  };
  const tap = async (x, y) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] }); await sleep(40);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(80);
  };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(60);
  };
  const key = async (code, vk) => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: code, windowsVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code, windowsVirtualKeyCode: vk }); await sleep(60);
  };
  return { send, ev, open, tap, click, key, errs };
}

async function runLogic(C) {
  await C.open(1280, 800, false);
  const res = await C.ev(LOGIC);
  if (!Array.isArray(res)) throw new Error('logic did not return its checks');
  const out = res.slice(), ok = (name, pass, got) => out.push({ name, pass: !!pass, got: pass ? undefined : got });
  if (res.length < 3) return out;   // no progress hook: the rest has nothing to read
  // reads never write
  await C.ev(UI_PREP);   // (picking Apollo and starting play save his record: that isn't a read)
  const s0 = await C.ev(SNAP);
  await C.ev(UI_READS);
  const s1 = await C.ev(SNAP);
  ok('opening the grid and the parent view and tapping facts writes nothing (record, counts, star total, backup)', s0 === s1, s0 === s1 ? null : (() => { let i = 0; while (s0[i] === s1[i]) i++; return { at: i, before: s0.slice(Math.max(0, i - 120), i + 200), after: s1.slice(Math.max(0, i - 120), i + 200) }; })());
  const extra = await C.ev(FIELDS);
  ok('no new saved field on any entry', extra.length === 0, extra);
  // a saved record reloads as it was, with the same progress (the clock offset put back: it isn't saved)
  const before = await C.ev(`JSON.stringify({ off: __rb.Facts.offset, facts: JSON.parse(localStorage.getItem('robotbattle.facts.apollo')).facts, p: [[1,6],[2,3],[1,9],[1,8],[1,1]].map(([a,b]) => __rb.progress(a, b, 'apollo')) })`);
  const B = JSON.parse(before);
  await C.open(1280, 800, false);
  const after = await C.ev(`(() => { __rb.manual(true); __rb.clock(${B.off}); __rb.player('apollo'); return JSON.stringify({ off: __rb.Facts.offset, facts: __rb.Facts.rec.facts, p: [[1,6],[2,3],[1,9],[1,8],[1,1]].map(([a,b]) => __rb.progress(a, b)) }); })()`);
  const A = JSON.parse(after);
  ok('a saved record reloads with the same facts and the same progress', JSON.stringify(A.facts) === JSON.stringify(B.facts) && JSON.stringify(A.p) === JSON.stringify(B.p), { before: B.p, after: A.p });
  return out;
}

async function runSize(C, size) {
  const [w, h] = size.split('x').map(Number), touch = w < 1200;
  await C.open(w, h, touch);
  const out = [], ok = (name, pass, got) => out.push({ name: size + ': ' + name, pass: !!pass, got: pass ? undefined : got });
  await C.ev(SETUP);
  if (!(await C.ev('typeof __rb.progress === "function"'))) { ok('__rb.progress exists', false, 'missing'); }
  await C.ev('__rb.showGrid(true)');
  const cellAt = async (sel) => C.ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; })()`);
  const info = (sel) => C.ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const rd = (n) => { let s = ''; for (const c of n.childNodes) s += c.nodeType === 3 ? c.data : c.nodeType !== 1 ? '' : c.matches('svg.ic') ? '{' + c.dataset.icon + '}' : rd(c); return s; };
    const need = el.querySelector('[data-want]'); return { text: rd(el).replace(/\\s+/g, ' ').trim(), prog: [...el.querySelectorAll('.gprog, .pprog')].map(rd).join(' | ').replace(/\\s+/g, ' ').trim(), have: need ? +need.dataset.have : null, want: need ? +need.dataset.want : null, today: el.querySelector('[data-today]')?.dataset.today ?? null }; })()`);
  const grid = async (label, want) => {
    const g = await info('#gridInfo');
    for (const s of want) ok(`grid ${label} shows "${s}"`, g?.text.includes(s), g);
    const fact = label.split(' ')[0].split('x').map(Number), ans = fact[0] * fact[1];
    ok(`grid ${label}: no answer (no "=", the product not in its progress)`, g && !g.text.includes('=') && (ans < 4 || !new RegExp('(^|[^0-9.])' + ans + '([^0-9]|$)').test(g.prog)) && (ans < 10 ? true : !g.text.includes(String(ans))), g);
    const b = await C.ev(BOX + `('#grid .panel, #grid .panel .top, #grid .panel .top *, #gridCells .cell, #gridInfo, #gridInfo *, #gridLegend, #gridLegend .lg', '#grid .panel')`);
    ok(`grid ${label}: everything on screen, no scrolling`, b.bad.length === 0 && b.scrollY <= 1 && b.scrollX <= 1 && b.docX <= 0, b);
    const st = await C.ev(STACK);
    ok(`grid ${label}: title, info and legend don't overlap; the info's and legend's parts stay inside them`, st.length === 0, st);
    return g;
  };
  // by touch (a mouse click at desktop): 1 x 6, then 2 x 3
  let c = await cellAt('#gridCells .cell[data-a="1"][data-b="6"]');
  if (c) await (touch ? C.tap(c.x, c.y) : C.click(c.x, c.y));
  ok('grid: cells at least 20 px (a thumb on a phone)', c && c.w >= 20, c);
  await grid('1x6 (Known, days [d, today])', ['1 more fast day to {star}', 'today {check}']);
  let g = await info('#gridInfo');
  ok('grid 1x6: its pips say 2 of 3, today counted', g && g.have === 2 && g.want === 3 && g.today === 'counted', g);
  if (shots) { const s = await C.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, `grid-1x6-${size}.png`), Buffer.from(s.result.data, 'base64')); }
  c = await cellAt('#gridCells .cell[data-a="2"][data-b="3"]');
  if (c) await (touch ? C.tap(c.x, c.y) : C.click(c.x, c.y));
  await grid('2x3 (Learning, days [today])', ['2 more fast days to {star}', 'today {check}']);
  g = await info('#gridInfo');
  ok('grid 2x3: its pips say 1 of 2 (to Known), today counted', g && g.have === 1 && g.want === 2 && g.today === 'counted', g);
  if (shots) { const s = await C.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, `grid-2x3-${size}.png`), Buffer.from(s.result.data, 'base64')); }
  // the keyboard: from 2 x 3, the arrows walk the cursor; ArrowUp then ArrowRight x3 lands on 1 x 6
  await C.key('ArrowUp', 38); for (let i = 0; i < 3; i++) await C.key('ArrowRight', 39);
  g = await info('#gridInfo');
  ok('grid by keyboard: the arrows land on 1 x 6 and show its progress', g?.text.includes('1 × 6') && g.text.includes('1 more fast day to {star}'), g);
  // the other stages, each must fit too (picked with the hook: the same drawGrid)
  for (const [a, b, label, want] of [[1, 9, 'blocked', ['today {cross}']], [1, 8, 'polish', ['{sparkle}']], [1, 7, 'mastered', ['{star}']], [1, 1, 'new', ['3 fast days to {star}']], [2, 7, 'known', []], [1, 4, 'learning', ['3 fast days to {star}']]]) {
    await C.ev(`__rb.tapCell(${a}, ${b})`);
    await grid(`${a}x${b} (${label})`, want);
  }
  await C.ev('__rb.showGrid(false)');
  // the parent view: a touch on 1 x 6 in its grid
  await C.ev(`__rb.parent(true, 'apollo')`);
  c = await cellAt('#pBody .fgrid .cell[data-a="1"][data-b="6"]');
  if (c) await (touch ? C.tap(c.x, c.y) : C.click(c.x, c.y));
  const pi = await info('#pBody .pgrid .ginfo');
  ok('parent: the tapped fact shows its progress: 1 more fast day to Mastered, today counted', pi?.text.includes('1 × 6') && pi.text.includes('1 more fast day to {star}') && pi.today === 'counted', pi);
  const key = await C.ev(`(() => { const k = document.querySelector('#pBody .pkey'); return k ? k.textContent.replace(/\\s+/g, ' ') : null; })()`);
  ok('parent: the rules key is there (2 right in a row, 2 days, 3 days, a miss)', key && /2 right in a row/.test(key) && /2 days/.test(key) && /3 days/.test(key) && /miss/.test(key), key);
  const pb = await C.ev(`(() => { const i = document.querySelector('#pBody .pgrid .ginfo'); i.scrollIntoView({ block: 'nearest' }); return true; })()`) && await C.ev(BOX + `('#pBody .pgrid .ginfo, #pBody .pgrid .ginfo *', '#parentPanel')`);
  ok('parent: the tapped fact\'s info all on screen once scrolled to, no sideways overflow', pb.bad.length === 0 && pb.scrollX <= 1 && pb.docX <= 0, pb);
  const kb = await C.ev(`(() => { const k = document.querySelector('#pBody .pkey'); k?.scrollIntoView({ block: 'nearest' }); return true; })()`) && await C.ev(BOX + `('#pBody .pkey, #pBody .pkey *', '#parentPanel')`);
  ok('parent: the rules key all on screen once scrolled to', kb.bad.length === 0 && kb.scrollX <= 1, kb);
  if (shots) {
    await C.ev(`document.querySelector('#pBody .pgrid .ginfo').scrollIntoView({ block: 'nearest' })`);
    const s = await C.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, `parent-1x6-${size}.png`), Buffer.from(s.result.data, 'base64'));
  }
  await C.ev(`__rb.parent(false)`);
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
