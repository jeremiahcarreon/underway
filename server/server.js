'use strict';
/* UNDERWAY game server
   - serves index.html
   - REST: admirals (name + PIN), game codes, join, game info + replay, leaderboard
   - WebSocket relay with durable per-player state and per-direction message sequence numbers
   Storage: SQLite via node:sqlite (single file, WAL). */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT || '8931', 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const GAME_ROOT = process.env.GAME_ROOT || path.join(__dirname, '..');
const INDEX = path.join(GAME_ROOT, 'index.html');
const MAX_BODY = 4 * 1024 * 1024;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'underway.db'));
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS admirals(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, pin_hash TEXT NOT NULL, salt TEXT NOT NULL, token TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_seen INTEGER);
CREATE TABLE IF NOT EXISTS games(code TEXT PRIMARY KEY, status TEXT NOT NULL, host_id INTEGER NOT NULL, guest_id INTEGER, host_navy TEXT, guest_navy TEXT, created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER, winner TEXT, end_reason TEXT, turns INTEGER, rematch_of TEXT, next_code TEXT, host_stats TEXT, guest_stats TEXT);
CREATE TABLE IF NOT EXISTS messages(game_code TEXT NOT NULL, to_role TEXT NOT NULL, seq INTEGER NOT NULL, from_role TEXT NOT NULL, type TEXT NOT NULL, payload TEXT, client_id TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(game_code, to_role, seq));
CREATE UNIQUE INDEX IF NOT EXISTS messages_client ON messages(game_code, client_id);
CREATE TABLE IF NOT EXISTS player_state(game_code TEXT NOT NULL, role TEXT NOT NULL, last_seq_in INTEGER NOT NULL DEFAULT 0, blob TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY(game_code, role));
`);
const q = {
  admiralByName: db.prepare('SELECT * FROM admirals WHERE name = ?'),
  admiralByToken: db.prepare('SELECT * FROM admirals WHERE token = ?'),
  admiralById: db.prepare('SELECT id, name FROM admirals WHERE id = ?'),
  insertAdmiral: db.prepare('INSERT INTO admirals(name, pin_hash, salt, token, created_at, last_seen) VALUES (?,?,?,?,?,?)'),
  touchAdmiral: db.prepare('UPDATE admirals SET last_seen = ? WHERE id = ?'),
  game: db.prepare('SELECT * FROM games WHERE code = ?'),
  insertGame: db.prepare('INSERT INTO games(code, status, host_id, created_at, rematch_of) VALUES (?,?,?,?,?)'),
  setGuest: db.prepare('UPDATE games SET guest_id = ? WHERE code = ? AND guest_id IS NULL'),
  setNavies: db.prepare('UPDATE games SET host_navy = COALESCE(?, host_navy), guest_navy = COALESCE(?, guest_navy) WHERE code = ?'),
  setLive: db.prepare("UPDATE games SET status = 'live', started_at = COALESCE(started_at, ?) WHERE code = ? AND status IN ('open','live')"),
  finishGame: db.prepare("UPDATE games SET status = 'finished', finished_at = COALESCE(finished_at, ?), winner = COALESCE(winner, ?), end_reason = COALESCE(end_reason, ?), turns = COALESCE(turns, ?) WHERE code = ?"),
  setStats: db.prepare('UPDATE games SET host_stats = CASE WHEN ? = \'host\' THEN ? ELSE host_stats END, guest_stats = CASE WHEN ? = \'guest\' THEN ? ELSE guest_stats END WHERE code = ?'),
  setNext: db.prepare('UPDATE games SET next_code = ? WHERE code = ?'),
  myGames: db.prepare('SELECT g.*, h.name AS host_name, u.name AS guest_name FROM games g JOIN admirals h ON h.id = g.host_id LEFT JOIN admirals u ON u.id = g.guest_id WHERE g.host_id = ? OR g.guest_id = ? ORDER BY g.created_at DESC LIMIT 30'),
  maxSeq: db.prepare('SELECT COALESCE(MAX(seq),0) AS m FROM messages WHERE game_code = ? AND to_role = ?'),
  msgByClient: db.prepare('SELECT seq, to_role FROM messages WHERE game_code = ? AND client_id = ?'),
  insertMsg: db.prepare('INSERT INTO messages(game_code, to_role, seq, from_role, type, payload, client_id, ts) VALUES (?,?,?,?,?,?,?,?)'),
  pending: db.prepare('SELECT seq, from_role, type, payload, ts FROM messages WHERE game_code = ? AND to_role = ? AND seq > ? ORDER BY seq'),
  state: db.prepare('SELECT last_seq_in, blob, updated_at FROM player_state WHERE game_code = ? AND role = ?'),
  upsertState: db.prepare('INSERT INTO player_state(game_code, role, last_seq_in, blob, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(game_code, role) DO UPDATE SET last_seq_in = MAX(player_state.last_seq_in, excluded.last_seq_in), blob = excluded.blob, updated_at = excluded.updated_at'),
  finished: db.prepare("SELECT g.*, h.name AS host_name, u.name AS guest_name FROM games g JOIN admirals h ON h.id = g.host_id LEFT JOIN admirals u ON u.id = g.guest_id WHERE g.status = 'finished' AND g.winner IS NOT NULL"),
};
const now = () => Date.now();
const other = r => (r === 'host' ? 'guest' : 'host');
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
const newToken = () => crypto.randomBytes(24).toString('base64url');
function newCode() { for (;;) { let c = ''; const b = crypto.randomBytes(6); for (let i = 0; i < 6; i++) c += CODE_ALPHABET[b[i] % CODE_ALPHABET.length]; if (!q.game.get(c)) return c; } }
function roleOf(game, admiralId) { if (!game) return null; if (game.host_id === admiralId) return 'host'; if (game.guest_id === admiralId) return 'guest'; return null; }
function publicGame(g) {
  const host = q.admiralById.get(g.host_id), guest = g.guest_id ? q.admiralById.get(g.guest_id) : null;
  return { code: g.code, status: g.status, host: host ? host.name : null, guest: guest ? guest.name : null, hostNavy: g.host_navy, guestNavy: g.guest_navy, createdAt: g.created_at, startedAt: g.started_at, finishedAt: g.finished_at, winner: g.winner, endReason: g.end_reason, turns: g.turns, rematchOf: g.rematch_of, nextCode: g.next_code };
}
const failures = new Map(); // login throttle: key -> {n, until}
function throttled(key) { const f = failures.get(key); return !!(f && f.until > now()); }
function noteFailure(key) { const f = failures.get(key) || { n: 0, until: 0 }; f.n++; if (f.n >= 8) { f.until = now() + 10 * 60 * 1000; f.n = 0; } failures.set(key, f); }

/* ---------- replay merge: both players' final saved views into one game object ---------- */
function replayFor(g) {
  const hs = q.state.get(g.code, 'host'), gs = q.state.get(g.code, 'guest');
  const hg = hs && hs.blob ? safeParse(hs.blob) : null, gg = gs && gs.blob ? safeParse(gs.blob) : null;
  const H = hg && hg.game, G = gg && gg.game; if (!H && !G) return null;
  const base = H || G;
  const pick = (game, role) => game && game.players && game.players[role] ? game.players[role] : null;
  const host = pick(H, 'host') || pick(G, 'host') || {}, guest = pick(G, 'guest') || pick(H, 'guest') || {};
  const hostName = q.admiralById.get(g.host_id), guestName = g.guest_id ? q.admiralById.get(g.guest_id) : null;
  const shots = (H ? H.log : G.log).filter(e => e.kind !== 'move');
  // each side's moves: union of its log entries and its moves array (deduped), so a partial save still replays
  const movesOf = (game, rec, role) => { const seen = new Set(); const out = []; const add = m => { const k = m.turn + ':' + m.ship + ':' + m.type; if (seen.has(k)) return; seen.add(k); out.push(Object.assign({}, m, { kind: 'move', player: role })); };
    if (game) game.log.filter(e => e.kind === 'move' && e.player === role).forEach(add); (rec.moves || []).forEach(add); return out; };
  const movesH = movesOf(H, host, 'host'), movesG = movesOf(G, guest, 'guest');
  const order = { move: 0, mine: 1, radar: 1, shot: 2 };
  const log = shots.concat(movesH, movesG).sort((a, b) => a.turn - b.turn || (order[a.kind] || 0) - (order[b.kind] || 0) || (a.n || 0) - (b.n || 0)).map((e, i) => Object.assign({}, e, { n: i }));
  return {
    v: 1, room: g.code, mode: 'net', stage: 'over', turn: g.turns || base.turn, winner: g.winner || base.winner, endReason: g.end_reason || base.endReason, first: base.first, seed: base.seed,
    players: {
      host: { id: 'host', name: hostName ? hostName.name : (host.name || 'Host'), navy: g.host_navy || host.navy, initialFleet: host.initialFleet || null, fleet: host.fleet || null, moves: host.moves || [], shots: host.shots || [], mines: host.mines || [], sightings: host.sightings || [], torpedoes: host.torpedoes || [], weapons: host.weapons || [] },
      guest: { id: 'guest', name: guestName ? guestName.name : (guest.name || 'Guest'), navy: g.guest_navy || guest.navy, initialFleet: guest.initialFleet || null, fleet: guest.fleet || null, moves: guest.moves || [], shots: guest.shots || [], mines: guest.mines || [], sightings: guest.sightings || [], torpedoes: guest.torpedoes || [], weapons: guest.weapons || [] },
    },
    log, stats: { host: safeParse(g.host_stats), guest: safeParse(g.guest_stats) },
  };
}
function safeParse(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }

/* ---------- leaderboard ---------- */
function leaderboard() {
  const rows = q.finished.all(); const adm = new Map(); const navies = new Map();
  const bump = (m, k, init) => { if (!m.has(k)) m.set(k, init()); return m.get(k); };
  rows.forEach(g => {
    if (!g.guest_id) return;
    [['host', g.host_id, g.host_name, g.host_navy, g.host_stats], ['guest', g.guest_id, g.guest_name, g.guest_navy, g.guest_stats]].forEach(([role, id, name, navy, statsJson]) => {
      const won = g.winner === role; const st = safeParse(statsJson) || {};
      const a = bump(adm, id, () => ({ name, games: 0, wins: 0, losses: 0, shots: 0, hits: 0, sunk: 0, fastestWin: null, navies: {} }));
      a.games++; if (won) { a.wins++; if (g.turns && (a.fastestWin == null || g.turns < a.fastestWin)) a.fastestWin = g.turns; } else a.losses++;
      a.shots += st.shots || 0; a.hits += st.hits || 0; a.sunk += st.shipsSunk || 0;
      if (navy) { const an = a.navies[navy] || (a.navies[navy] = { games: 0, wins: 0 }); an.games++; if (won) an.wins++; const n = bump(navies, navy, () => ({ navy, games: 0, wins: 0, admirals: {} })); n.games++; if (won) { n.wins++; n.admirals[name] = (n.admirals[name] || 0) + 1; } }
    });
  });
  const admirals = [...adm.values()].map(a => Object.assign(a, { winRate: a.games ? a.wins / a.games : 0, accuracy: a.shots ? a.hits / a.shots : 0 })).sort((x, y) => y.wins - x.wins || y.winRate - x.winRate || y.accuracy - x.accuracy || x.name.localeCompare(y.name));
  const byNavy = [...navies.values()].map(n => { const best = Object.entries(n.admirals).sort((a, b) => b[1] - a[1])[0]; return { navy: n.navy, games: n.games, wins: n.wins, bestAdmiral: best ? best[0] : null, bestWins: best ? best[1] : 0 }; }).sort((a, b) => b.wins - a.wins || a.navy.localeCompare(b.navy));
  return { admirals, navies: byNavy, games: rows.length };
}

/* ---------- HTTP ---------- */
function json(res, status, obj) { const body = JSON.stringify(obj); res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' }); res.end(body); }
function readBody(req) { return new Promise((resolve, reject) => { let size = 0; const chunks = []; req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; } chunks.push(c); }); req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('bad json')); } }); req.on('error', reject); }); }
function authToken(tokenLike) { const a = tokenLike ? q.admiralByToken.get(String(tokenLike)) : null; if (a) q.touchAdmiral.run(now(), a.id); return a; }

async function api(req, res, u) {
  const p = u.pathname, m = req.method;
  if (m === 'POST' && p === '/api/admiral') {
    const b = await readBody(req); const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 18); const pin = String(b.pin || '').trim();
    if (name.length < 2) return json(res, 400, { error: 'Name needs at least 2 characters' });
    if (!/^\d{4,8}$/.test(pin)) return json(res, 400, { error: 'PIN must be 4 to 8 digits' });
    const key = name.toLowerCase(); if (throttled(key)) return json(res, 429, { error: 'Too many wrong PINs. Try again in 10 minutes.' });
    let a = q.admiralByName.get(name);
    if (a) { if (hashPin(pin, a.salt) !== a.pin_hash) { noteFailure(key); return json(res, 401, { error: 'Wrong PIN for that Admiral name' }); } q.touchAdmiral.run(now(), a.id); return json(res, 200, { name: a.name, token: a.token, created: false }); }
    const salt = crypto.randomBytes(16).toString('hex'); const token = newToken();
    q.insertAdmiral.run(name, hashPin(pin, salt), salt, token, now(), now());
    return json(res, 201, { name, token, created: true });
  }
  if (m === 'GET' && p === '/api/me') {
    const a = authToken(u.searchParams.get('token')); if (!a) return json(res, 401, { error: 'Sign in first' });
    const games = q.myGames.all(a.id, a.id).map(g => Object.assign(publicGame(g), { role: roleOf(g, a.id) }));
    return json(res, 200, { name: a.name, games });
  }
  if (m === 'POST' && p === '/api/games') {
    const b = await readBody(req); const a = authToken(b.token); if (!a) return json(res, 401, { error: 'Sign in first' });
    let rematchOf = null;
    if (b.rematchOf) { const old = q.game.get(String(b.rematchOf).toUpperCase()); if (!old || !roleOf(old, a.id)) return json(res, 403, { error: 'Not your game' }); if (old.status !== 'finished') return json(res, 409, { error: 'That game is not finished' }); if (old.next_code) return json(res, 200, { code: old.next_code, rematchOf: old.code, existing: true }); rematchOf = old.code; }
    const code = newCode(); q.insertGame.run(code, 'open', a.id, now(), rematchOf); if (rematchOf) q.setNext.run(code, rematchOf);
    return json(res, 201, { code, rematchOf });
  }
  let mm;
  if ((mm = /^\/api\/games\/([A-Za-z0-9]{6})\/join$/.exec(p)) && m === 'POST') {
    const b = await readBody(req); const a = authToken(b.token); if (!a) return json(res, 401, { error: 'Sign in first' });
    const code = mm[1].toUpperCase(); const g = q.game.get(code); if (!g) return json(res, 404, { error: 'No game with that code' });
    let role = roleOf(g, a.id);
    if (!role) { if (g.status !== 'open' || g.guest_id) return json(res, 409, { error: g.status === 'finished' ? 'That game is over' : 'That game already has two Admirals' }); q.setGuest.run(a.id, code); role = 'guest'; }
    return json(res, 200, Object.assign(publicGame(q.game.get(code)), { role }));
  }
  if ((mm = /^\/api\/games\/([A-Za-z0-9]{6})$/.exec(p)) && m === 'GET') {
    const g = q.game.get(mm[1].toUpperCase()); if (!g) return json(res, 404, { error: 'No game with that code' });
    const out = publicGame(g); if (g.status === 'finished') out.replay = replayFor(g);
    return json(res, 200, out);
  }
  if (m === 'GET' && p === '/api/leaderboard') return json(res, 200, leaderboard());
  if (m === 'GET' && p === '/api/health') return json(res, 200, { ok: true, games: db.prepare('SELECT COUNT(*) AS c FROM games').get().c, live: liveCount() });
  return json(res, 404, { error: 'Not found' });
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) { api(req, res, u).catch(e => json(res, 400, { error: e.message || 'Bad request' })); return; }
  if (u.pathname === '/' || u.pathname === '/index.html') {
    fs.readFile(INDEX, (err, data) => { if (err) { res.writeHead(500); res.end('index.html missing'); return; } res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); res.end(data); });
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
});

/* ---------- WebSocket relay ---------- */
const live = new Map(); // code -> { host: ws|null, guest: ws|null }
function liveCount() { let n = 0; live.forEach(v => { if (v.host) n++; if (v.guest) n++; }); return n; }
function slot(code) { if (!live.has(code)) live.set(code, { host: null, guest: null }); return live.get(code); }
function sendTo(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (e) { } } }
function notePayload(code, type, payload, fromRole) {
  try {
    if (type === 'LOBBY_STATE' && payload) q.setNavies.run(payload.hostNavy || null, payload.guestNavy || null, code);
    if (type === 'NAVY_PICK' && payload) q.setNavies.run(fromRole === 'host' ? (payload.navy || null) : null, fromRole === 'guest' ? (payload.navy || null) : null, code);
    if (type === 'START') q.setLive.run(now(), code);
    if (type === 'GAME_OVER' && payload) {
      const winner = payload.winner === 'host' || payload.winner === 'guest' ? payload.winner : null;
      const stats = payload.stats ? JSON.stringify(payload.stats) : null; const turns = payload.stats && payload.stats.turns ? payload.stats.turns : null;
      q.finishGame.run(now(), winner, payload.reason || null, turns, code); if (stats) q.setStats.run(fromRole, stats, fromRole, stats, code);
    }
  } catch (e) { console.error('notePayload', e); }
}
const insertTx = (code, role, item) => {
  const to = other(role); const dup = q.msgByClient.get(code, item.id);
  if (dup) return { seq: dup.seq, dup: true };
  const seq = q.maxSeq.get(code, to).m + 1;
  db.exec('BEGIN');
  try {
    q.insertMsg.run(code, to, seq, role, item.type, JSON.stringify(item.payload === undefined ? null : item.payload), item.id, now());
    if (item.blob !== undefined) q.upsertState.run(code, role, item.lastSeqIn || 0, JSON.stringify(item.blob), now());
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { seq, dup: false };
};
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_BODY });
wss.on('connection', ws => {
  let ctx = null; // { code, role, admiral }
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.type === 'PING') { sendTo(ws, { type: 'PONG', ts: now() }); return; }
    if (m.type === 'HELLO') {
      const a = authToken(m.token); const code = String(m.code || '').toUpperCase(); const g = q.game.get(code);
      if (!a) { sendTo(ws, { type: 'ERROR', fatal: true, error: 'Sign in first' }); return; }
      if (!g) { sendTo(ws, { type: 'ERROR', fatal: true, error: 'No game with that code' }); return; }
      const role = roleOf(g, a.id); if (!role) { sendTo(ws, { type: 'ERROR', fatal: true, error: 'You are not a player in that game' }); return; }
      ctx = { code, role, admiral: a }; const s = slot(code); if (s[role] && s[role] !== ws) { try { s[role].close(4000, 'replaced by a newer connection'); } catch (e) { } } s[role] = ws;
      const st = q.state.get(code, role); const lastSeqIn = st ? st.last_seq_in : 0;
      const pending = q.pending.all(code, role, lastSeqIn).map(r => ({ seq: r.seq, from: r.from_role, type: r.type, payload: safeParse(r.payload), ts: r.ts }));
      const opp = s[other(role)]; const g2 = q.game.get(code);
      sendTo(ws, { type: 'WELCOME', role, game: publicGame(g2), blob: st && st.blob ? safeParse(st.blob) : null, lastSeqIn, pending, opponentOnline: !!(opp && opp.readyState === 1), serverTime: now() });
      sendTo(opp, { type: 'PRESENCE', opponentOnline: true });
      return;
    }
    if (!ctx) { sendTo(ws, { type: 'ERROR', error: 'Say HELLO first' }); return; }
    const { code, role } = ctx;
    if (m.type === 'SEND') {
      if (!m.id || !m.msg || typeof m.msg.type !== 'string') { sendTo(ws, { type: 'ERROR', error: 'bad SEND' }); return; }
      let r; try { r = insertTx(code, role, { id: String(m.id), type: m.msg.type, payload: m.msg.payload, blob: m.blob, lastSeqIn: m.lastSeqIn }); } catch (e) { sendTo(ws, { type: 'ERROR', error: 'store failed: ' + e.message }); return; }
      sendTo(ws, { type: 'SENT', id: m.id, seq: r.seq, dup: r.dup });
      if (!r.dup) { notePayload(code, m.msg.type, m.msg.payload, role); const opp = slot(code)[other(role)]; sendTo(opp, { type: 'MSG', seq: r.seq, from: role, type_: undefined, msg: { type: m.msg.type, payload: m.msg.payload }, ts: now() }); }
      return;
    }
    if (m.type === 'SAVE') { try { q.upsertState.run(code, role, m.lastSeqIn || 0, JSON.stringify(m.blob === undefined ? null : m.blob), now()); sendTo(ws, { type: 'SAVED', lastSeqIn: m.lastSeqIn || 0 }); } catch (e) { sendTo(ws, { type: 'ERROR', error: 'save failed: ' + e.message }); } return; }
    if (m.type === 'ACK') { try { q.upsertState.run(code, role, m.lastSeqIn || 0, q.state.get(code, role) ? q.state.get(code, role).blob : null, now()); } catch (e) { } return; }
  });
  ws.on('close', () => { if (!ctx) return; const s = slot(ctx.code); if (s[ctx.role] === ws) { s[ctx.role] = null; sendTo(s[other(ctx.role)], { type: 'PRESENCE', opponentOnline: false }); } });
});
server.listen(PORT, () => console.log('UNDERWAY server on http://0.0.0.0:' + PORT + '  data: ' + DATA_DIR));
process.on('SIGTERM', () => { server.close(); process.exit(0); });
