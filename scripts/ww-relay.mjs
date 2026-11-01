#!/usr/bin/env node
// Wild World W3 (#160): the home game server for two players on two iPads.
//
//   node scripts/ww-relay.mjs                 # serves this repo and relays rooms on port 8160, on every network of this Mac
//   node scripts/ww-relay.mjs --host 127.0.0.1 --port 0     # this computer only, any free port (the tests)
//
// It does two things on one port:
//   1. serves the repo's files (GET/HEAD only), so an iPad on the home Wi-Fi opens http://<this-mac>:8160/wild-world.html.
//      Only files inside the repo: no path that leaves it (.. or a symlink out), no dotfile or dot-folder (.git, .claude, .env).
//      wild-world.html is sent with one extra line, <script>window.WW_RELAY={v:1}</script>, which is how the page knows it can
//      offer two players (the Pages copy and a plain file never have it, so they explain instead and make no request).
//   2. relays messages between the two players of a room over a WebSocket at /ww. Hand-rolled RFC 6455 (Node has no WebSocket
//      server and this file takes no npm packages): the upgrade handshake, masked client frames, text frames, fragments,
//      ping/pong and close. No extensions (Safari asks for permessage-deflate; it is not echoed, so frames stay plain).
//
// Why a WebSocket and not SSE plus POST: one socket both ways, so a player's move is one small frame with no request per move;
// a closed socket is a clear "the other player is gone" on both sides at once (EventSource retries on its own and never says
// it's over); and the page needs nothing but the browser's own WebSocket.
//
// Rooms: a player sends {t:'host'} and gets a code of 4 animal pictures ({t:'room', code:[0-7 x4], you:0}); the other sends
// {t:'join', code} and both are told ({t:'room', you:1} and {t:'peer-join'}). At most 2 players a room (a third gets
// {t:'err', why:'full'}); at most MAX_ROOMS rooms. Every other message is passed, as sent, to the other player; nothing is kept,
// logged or looked at beyond its type. A room nobody is in is forgotten after --room-ttl seconds (default 30: long enough for
// a reload to come back with the same code). Messages are at most MAX_MSG bytes (a bigger one closes that socket, 1009); a
// socket that sends more than RATE position updates ('st') a second has the extra dropped (other messages always pass). The server pings every PING_MS; a socket that
// hasn't answered in DEAD_MS (an iPad that went to sleep) is closed, so its room learns it is empty.
// A browser's upgrade is refused (403) unless its Origin is this server itself, so another web page can't join a room.
//
// Options: --port N (default 8160; 0 = any free port), --host ADDR (default 0.0.0.0), --root DIR (default this repo),
//          --room-ttl SECONDS (default 30). On start it prints the URL to open on both iPads.
// Node 22+, no dependencies.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
if (args.includes('-h') || args.includes('--help')) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
const PORT = Number(opt('port', 8160));
const HOST = opt('host', '0.0.0.0');
const ROOT = fs.realpathSync(path.resolve(opt('root', path.join(path.dirname(fileURLToPath(import.meta.url)), '..'))));
const ROOM_TTL_MS = Math.max(0.2, Number(opt('room-ttl', 30))) * 1000;
const MAX_BACKLOG = 256 * 1024, RATE_EVENTS = 30;   // bytes waiting for one slow reader; other messages a socket may send a second
const MISS_MAX = 20, MISS_MS = 10000;   // wrong room codes allowed server-wide per window (see Rooms.join)
const MAX_MSG = 4096, MAX_ROOMS = 64, ROOM_SIZE = 2, RATE = 90, PING_MS = 5000, DEAD_MS = 20000, CODE_LEN = 4, CODE_ICONS = 8;
const RESERVED = new Set(['host', 'join', 'leave', 'room', 'err', 'peer-join', 'peer-left']);
const MARK = '<script>window.WW_RELAY={v:1}</script>';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

// ---------------------------------------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------------------------------------
function resolveFile(rawPath) {
  let p;
  try { p = decodeURIComponent(rawPath.split('?')[0].split('#')[0]); } catch { return { code: 400 }; }
  if (p.includes('\0') || p.includes('\\')) return { code: 400 };
  if (p === '/' || p === '') return { redirect: '/wild-world.html' };
  const segs = p.split('/').filter((s) => s !== '');
  if (segs.some((s) => s.startsWith('.'))) return { code: 403 };   // .., ., .git, .env, .claude ...
  const abs = path.join(ROOT, ...segs);
  let real;
  try { real = fs.realpathSync(abs); } catch { return { code: 404 }; }
  if (real !== ROOT && !real.startsWith(ROOT + path.sep)) return { code: 403 };   // a symlink out of the repo
  if (path.relative(ROOT, real).split(path.sep).some((s) => s.startsWith('.'))) return { code: 403 };
  let st; try { st = fs.statSync(real); } catch { return { code: 404 }; }
  if (!st.isFile()) return { code: 404 };
  return { file: real };
}
function serveFile(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); res.end(); return; }
  const r = resolveFile(req.url || '/');
  if (r.redirect) { res.writeHead(302, { location: r.redirect }); res.end(); return; }
  if (!r.file) { res.writeHead(r.code, { 'content-type': 'text/plain; charset=utf-8' }); res.end(r.code === 403 ? 'Not here.\n' : r.code === 400 ? 'Bad path.\n' : 'Not found.\n'); return; }
  let body;
  try { body = fs.readFileSync(r.file); } catch { res.writeHead(404); res.end(); return; }
  if (path.basename(r.file) === 'wild-world.html') {
    const s = body.toString('utf8'), i = s.indexOf('<head>');
    body = Buffer.from(i >= 0 ? s.slice(0, i + 6) + '\n' + MARK + s.slice(i + 6) : MARK + s, 'utf8');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(r.file).toLowerCase()] || 'application/octet-stream', 'content-length': body.length,
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : body);
}

// ---------------------------------------------------------------------------------------------------------------------------
// WebSocket (RFC 6455), server side
// ---------------------------------------------------------------------------------------------------------------------------
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function frame(op, payload) {
  const n = payload.length; let head;
  if (n < 126) { head = Buffer.alloc(2); head[1] = n; }
  else if (n < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  head[0] = 0x80 | op;   // FIN, never masked from the server
  return Buffer.concat([head, payload]);
}
class Peer {
  constructor(sock) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.frag = null; this.fragOp = 0; this.open = true; this.room = null; this.seen = Date.now();
    this.rate = { t: 0, n: 0 }; this.events = { t: 0, n: 0 };
    sock.setNoDelay(true);   // Nagle plus delayed ACKs can hold a small frame back for 40-200 ms
    sock.on('data', (d) => this.data(d));
    sock.on('close', () => this.gone());
    sock.on('end', () => this.gone());   // the http server allows half-open sockets, so a client's FIN alone never fires 'close'
    sock.on('error', () => this.gone());
  }
  // a player whose device has stopped reading (or a socket that never reads) has its messages pile up here in the server's
  // memory; past MAX_BACKLOG it is closed rather than letting the other side fill the Mac's memory
  send(obj) { if (this.open && this.sock.writableLength > MAX_BACKLOG) { this.close(1008); return; } if (this.open) try { this.sock.write(frame(0x1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8'))); } catch {} }
  close(code = 1000) {
    if (!this.open) return;
    const p = Buffer.alloc(2); p.writeUInt16BE(code, 0);
    try { this.sock.write(frame(0x8, p)); } catch {}
    this.open = false; try { this.sock.end(); } catch {}
    setTimeout(() => { try { this.sock.destroy(); } catch {} }, 500).unref();
    this.gone();
  }
  data(d) {
    // no size check on the whole read: after a Wi-Fi stall one read can carry a second's worth of small frames, all fine.
    // Each frame's length is checked below, so what waits in buf is at most one partial frame (MAX_MSG + 14 bytes).
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.open) {
      const b = this.buf; if (b.length < 2) return;
      const fin = b[0] & 0x80, rsv = b[0] & 0x70, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (rsv || !masked) { this.close(1002); return; }   // no extensions were agreed; a client must mask
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; const big = b.readBigUInt64BE(2); if (big > BigInt(MAX_MSG)) { this.close(1009); return; } len = Number(big); off = 10; }
      if (len > MAX_MSG) { this.close(1009); return; }
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4), payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      this.seen = Date.now();
      if (op >= 0x8) {   // control frames: never fragmented, at most 125 bytes
        if (!fin || len > 125) { this.close(1002); return; }
        if (op === 0x8) { this.close(1000); return; }
        if (op === 0x9) { try { this.sock.write(frame(0xA, payload)); } catch {} }
        continue;   // 0xA pong: seen is updated above
      }
      if (op === 0x0) { if (!this.frag) { this.close(1002); return; } this.frag.push(payload); }
      else if (op === 0x1 || op === 0x2) { if (this.frag) { this.close(1002); return; } this.frag = [payload]; this.fragOp = op; }
      else { this.close(1002); return; }
      if (this.frag.reduce((s, p) => s + p.length, 0) > MAX_MSG) { this.close(1009); return; }
      if (fin) { const msg = Buffer.concat(this.frag), kind = this.fragOp; this.frag = null; if (kind === 0x1) this.message(msg.toString('utf8')); else this.close(1003); }
    }
  }
  message(text) {
    let m; try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    // only the position updates are limited (a newer one replaces a dropped one); the rare game events (a meet, a race's end,
    // a rider dropped) always go through
    if (m.t === 'st') { const now = Date.now(); if (now - this.rate.t > 1000) { this.rate.t = now; this.rate.n = 0; } if (++this.rate.n > RATE) return; }
    else { const now = Date.now(); if (now - this.events.t > 1000) { this.events.t = now; this.events.n = 0; } if (++this.events.n > RATE_EVENTS) return; }   // game events are a few a minute; a flood of them is dropped
    if (m.t === 'host') return Rooms.host(this);
    if (m.t === 'join') return Rooms.join(this, m.code);
    if (m.t === 'leave') return Rooms.leave(this);
    if (RESERVED.has(m.t) || !this.room) return;
    for (const o of this.room.peers) if (o !== this) o.send(text);   // passed on as sent
  }
  gone() { if (this.open) { this.open = false; try { this.sock.destroy(); } catch {} } Rooms.leave(this); Peers.delete(this); }
}
const Peers = new Set();

// ---------------------------------------------------------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------------------------------------------------------
const Rooms = {
  map: new Map(),   // "a-b-c-d" -> { code, peers: [], emptyAt }
  key: (code) => (Array.isArray(code) && code.length === CODE_LEN && code.every((c) => Number.isInteger(c) && c >= 0 && c < CODE_ICONS) ? code.join('-') : null),
  host(p) {
    const old = p.room;
    this.leave(p);
    if (old && !old.peers.length) this.map.delete(old.code.join('-'));   // a player hosting again drops the room only they held, so one socket can't fill MAX_ROOMS
    this.sweep();
    if (this.map.size >= MAX_ROOMS) { p.send({ t: 'err', why: 'busy' }); return; }
    let code, k, tries = 0;
    do { code = Array.from({ length: CODE_LEN }, () => crypto.randomInt(CODE_ICONS)); k = code.join('-'); } while (this.map.has(k) && ++tries < 200);
    if (this.map.has(k)) { p.send({ t: 'err', why: 'busy' }); return; }
    const room = { code, peers: [p], emptyAt: 0 };
    this.map.set(k, room); p.room = room; p.you = 0;
    p.send({ t: 'room', code, you: 0 });
  },
  // wrong codes, server-wide: there are only 8^4 = 4096 codes, so without a limit a device on the Wi-Fi could try them all in
  // well under a second and walk into a room whose host is waiting. A kid mistyping gets a few goes; past MISS_MAX wrong codes
  // in MISS_MS every join waits (answered 'busy', the right code too, so trying tells nothing) until the window ends.
  misses: { t: 0, n: 0 },
  join(p, code) {
    this.sweep();
    const now = Date.now(); if (now - this.misses.t > MISS_MS) { this.misses.t = now; this.misses.n = 0; }
    if (this.misses.n >= MISS_MAX) { p.send({ t: 'err', why: 'busy' }); return; }
    const k = this.key(code), room = k && this.map.get(k);
    if (!room) { this.misses.n++; p.send({ t: 'err', why: 'nocode' }); return; }
    if (room.peers.includes(p)) { p.send({ t: 'room', code: room.code, you: p.you }); return; }
    if (room.peers.length >= ROOM_SIZE) { p.send({ t: 'err', why: 'full' }); return; }
    this.leave(p);
    p.you = room.peers.some((o) => o.you === 0) ? 1 : 0;   // you 0 is the host (the referee in a race or tag); a rejoin takes the free seat
    room.peers.push(p); room.emptyAt = 0; p.room = room;
    p.send({ t: 'room', code: room.code, you: p.you, peers: room.peers.length });
    for (const o of room.peers) if (o !== p) o.send({ t: 'peer-join' });
  },
  leave(p) {
    const room = p.room; if (!room) return;
    p.room = null; room.peers = room.peers.filter((o) => o !== p);
    for (const o of room.peers) o.send({ t: 'peer-left' });
    if (!room.peers.length) room.emptyAt = Date.now();
  },
  sweep() { const now = Date.now(); for (const [k, r] of this.map) if (!r.peers.length && now - r.emptyAt >= ROOM_TTL_MS) this.map.delete(k); },
};
setInterval(() => {
  Rooms.sweep();
  const now = Date.now();
  for (const p of [...Peers]) { if (now - p.seen > DEAD_MS) p.close(1001); else if (p.open) try { p.sock.write(frame(0x9, Buffer.alloc(0))); } catch {} }
}, Math.min(PING_MS, Math.max(100, ROOM_TTL_MS / 2))).unref();

// ---------------------------------------------------------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------------------------------------------------------
const server = http.createServer(serveFile);
server.on('upgrade', (req, sock) => {
  const refuse = (code, why) => { try { sock.end(`HTTP/1.1 ${code} ${why}\r\nconnection: close\r\ncontent-length: 0\r\n\r\n`); } catch {} };
  sock.on('error', () => {});
  if ((req.url || '').split('?')[0] !== '/ww') return refuse(404, 'Not Found');
  const key = req.headers['sec-websocket-key'];
  if (req.method !== 'GET' || String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') return refuse(400, 'Bad Request');
  const origin = req.headers.origin;
  if (origin) { let oh = null; try { oh = new URL(origin).host; } catch {} if (oh !== req.headers.host) return refuse(403, 'Forbidden'); }   // only this server's own page
  if (Peers.size >= MAX_ROOMS * ROOM_SIZE) return refuse(503, 'Busy');
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  Peers.add(new Peer(sock));
});
server.on('clientError', (e, sock) => { try { sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch {} });

function lanAddress() {
  const ifs = os.networkInterfaces(), v4 = (list) => (list || []).find((a) => (a.family === 'IPv4' || a.family === 4) && !a.internal);
  for (const name of ['en0', 'en1', 'wlan0', 'eth0']) { const a = v4(ifs[name]); if (a) return a.address; }
  for (const list of Object.values(ifs)) { const a = v4(list); if (a) return a.address; }
  return null;
}
server.listen(PORT, HOST, () => {
  const port = server.address().port, local = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
  const ip = local ? '127.0.0.1' : HOST === '0.0.0.0' || HOST === '::' ? lanAddress() || '127.0.0.1' : HOST;
  console.log(`Wild World two players: open this on both iPads (the same Wi-Fi as this computer):`);
  console.log(`  http://${ip}:${port}/wild-world.html`);
  if (!local) { const hn = os.hostname().replace(/\.local$/i, ''); if (/^[A-Za-z0-9-]+$/.test(hn)) console.log(`  (or http://${hn}.local:${port}/wild-world.html, which stays the same if the address changes)`); }
  console.log(`Serving ${ROOT} on ${HOST}:${port}. Ctrl+C stops it.`);
});
server.on('error', (e) => { console.error('ww-relay: ' + (e.code === 'EADDRINUSE' ? `port ${PORT} is in use (another relay running?)` : e.message)); process.exit(1); });
const stop = () => { for (const p of [...Peers]) p.close(1001); server.close(); setTimeout(() => process.exit(0), 200).unref(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
