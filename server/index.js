// server/index.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

/* ---------------- Config ---------------- */
const PORT = process.env.PORT || 3000;
const ARENA = { w: 1280, h: 720, margin: 20 };
const TICK_MS = 16;          // 60 Hz physics
const SNAPSHOT_MS = 33;      // ~30 Hz broadcast
const SPEED_PPS = 260;       // pixels per second
const SPEED_PER_TICK = SPEED_PPS * (TICK_MS / 1000);
const GRACE_MS = 60_000;     // keep avatar alive for 60s after disconnect
const halfX = () => ARENA.w / 2;

/* ---------------- App/IO ---------------- */
const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/health", (_, res) => res.send("OK"));

// Optional static serving if client/dist exists (no wildcard patterns)
const distDir = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.path.startsWith("/socket.io")) return next();
    if (req.method !== "GET") return next();
    const indexFile = path.join(distDir, "index.html");
    if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
    next();
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket"],
  perMessageDeflate: false,
  pingInterval: 4000,   // more forgiving for background/sleep
  pingTimeout: 20000,   // 20s timeout
});

/* ---------------- State ---------------- */
// Player records are keyed by persistent pid; socketId can change.
const playersByPid = new Map();   // pid -> player
const pidBySocket = new Map();    // socketId -> pid
let joinSeq = 0;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function spawnPos(pid) {
  const a = pid.charCodeAt(0) || 65;
  const b = pid.charCodeAt(1) || 66;
  const xo = 300 + (a % 7) * 90;
  const yo = 180 + (b % 5) * 110;
  return { x: xo, y: yo };
}

function lobbyPayload() {
  return [...playersByPid.values()].map(p => ({
    id: p.socketId, n: p.seq, name: p.name, photo: p.photo || null
  }));
}
function snapshotPayload() {
  return {
    players: [...playersByPid.values()].map(p => ({
      id: p.socketId,
      n: p.seq,
      name: p.name,
      x: p.pos.x,
      y: p.pos.y,
      team: p.team || null,
      photo: p.photo || null,
    }))
  };
}

/* ---------------- Socket helpers ---------------- */
function bindSocketToPlayer(pid, socket) {
  // Detach previous socket mapping if any
  for (const [sid, mappedPid] of pidBySocket.entries()) {
    if (mappedPid === pid && sid !== socket.id) pidBySocket.delete(sid);
  }
  pidBySocket.set(socket.id, pid);

  const p = playersByPid.get(pid);
  p.socketId = socket.id;
  if (p._graceTimer) {
    clearTimeout(p._graceTimer);
    p._graceTimer = null;
  }
}

function ensurePlayer(pid, init) {
  let p = playersByPid.get(pid);
  if (!p) {
    p = {
      pid,
      socketId: null,
      seq: ++joinSeq,
      name: (init?.name || "anon").slice(0, 12),
      photo: init?.photo || null,
      pos: spawnPos(pid),
      dir: { x: 0, y: 0 },
      team: null,
      _graceTimer: null,
    };
    playersByPid.set(pid, p);
  } else {
    // Update profile if newly provided
    if (init?.name) p.name = String(init.name).slice(0, 12);
    if (init?.photo) p.photo = init.photo;
  }
  return p;
}

/* ---------------- Sockets ---------------- */
io.on("connection", (socket) => {
  // RTT echo
  socket.on("rt", (t0) => socket.emit("rt", t0, Date.now()));

  // Client sends 'join' with persistent pid + profile when they hit Join.
  socket.on("join", (msg = {}) => {
    const pid = String(msg.pid || "").slice(0, 64); // from client localStorage
    if (!pid) return; // reject if missing pid

    const p = ensurePlayer(pid, { name: msg.name, photo: msg.photo });
    bindSocketToPlayer(pid, socket);

    socket.emit("joined", { id: p.socketId, n: p.seq });
    io.emit("lobby", lobbyPayload());
  });

  // Resume hook: on reconnect (app background/foreground), client can ping resume.
  socket.on("resume", (pid) => {
    if (!pid) return;
    const p = playersByPid.get(pid);
    if (!p) return; // unknown pid; client should send a fresh 'join'
    bindSocketToPlayer(pid, socket);
    socket.emit("joined", { id: p.socketId, n: p.seq });
    io.emit("lobby", lobbyPayload());
  });

  socket.on("input", (msg) => {
    const pid = pidBySocket.get(socket.id);
    if (!pid) return;
    const p = playersByPid.get(pid);
    if (!p) return;

    if (typeof msg.dx === "number" || typeof msg.dy === "number") {
      const dx = clamp(Number(msg?.dx || 0), -1, 1);
      const dy = clamp(Number(msg?.dy || 0), -1, 1);
      p.dir.x = isFinite(dx) ? dx : 0;
      p.dir.y = isFinite(dy) ? dy : 0;
    }
    if (msg?.action === 1) io.volatile.emit("action", { by: p.socketId, action: 1 });
    if (msg?.action === 2) io.volatile.emit("action", { by: p.socketId, action: 2 });
  });

  socket.on("disconnect", () => {
    const pid = pidBySocket.get(socket.id);
    pidBySocket.delete(socket.id);
    if (!pid) return;

    const p = playersByPid.get(pid);
    if (!p) return;

    // Start grace timer; keep the avatar in-game for GRACE_MS.
    if (p._graceTimer) clearTimeout(p._graceTimer);
    p._graceTimer = setTimeout(() => {
      playersByPid.delete(pid);
      io.emit("lobby", lobbyPayload());
    }, GRACE_MS);
  });
});

/* ---------------- Ticks ---------------- */
setInterval(() => {
  for (const p of playersByPid.values()) {
    p.pos.x += p.dir.x * SPEED_PER_TICK;
    p.pos.y += p.dir.y * SPEED_PER_TICK;
    const m = ARENA.margin;
    p.pos.x = clamp(p.pos.x, m, ARENA.w - m);
    p.pos.y = clamp(p.pos.y, m, ARENA.h - m);
    const newTeam = p.pos.x < halfX() ? "X" : "O";
    if (newTeam !== p.team) p.team = newTeam;
  }
}, TICK_MS);

setInterval(() => {
  io.volatile.emit("snapshot", snapshotPayload());
}, SNAPSHOT_MS);

/* ---------------- Start ---------------- */
server.listen(PORT, () => {
  console.log(`Server on http://localhost:${PORT}`);
});
