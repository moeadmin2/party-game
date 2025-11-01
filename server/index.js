// server/index.js
const path = require("path");
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
const halfX = () => ARENA.w / 2;

/* ---------------- App/IO ---------------- */
const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" })); // base64 photos
app.use(express.urlencoded({ extended: false }));

// Serve built client if available
app.use(express.static(path.join(__dirname, "..", "client", "dist")));
app.get("/health", (_, res) => res.send("OK"));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "dist", "index.html"), (err) => {
    if (err) res.end(); // dev mode
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket"],     // lower latency
  perMessageDeflate: false,      // no compression
  pingInterval: 2500,
  pingTimeout: 8000,
});

/* ---------------- State ---------------- */
const players = new Map(); // id -> {...}
let joinSeq = 0;

/* ---------------- Helpers ---------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function spawnPos(id) {
  const xo = 300 + (id.charCodeAt(0) % 7) * 90;
  const yo = 180 + (id.charCodeAt(1) % 5) * 110;
  return { x: xo, y: yo };
}
function lobbyPayload() {
  return [...players.values()].map(p => ({
    id: p.id, n: p.seq, name: p.name, photo: p.photo || null
  }));
}
function snapshotPayload() {
  return {
    players: [...players.values()].map(p => ({
      id: p.id,
      n: p.seq,
      name: p.name,
      x: p.pos.x,
      y: p.pos.y,
      team: p.team || null,
      photo: p.photo || null,
    }))
  };
}

/* ---------------- Sockets ---------------- */
io.on("connection", (socket) => {
  // RTT echo
  socket.on("rt", (t0) => socket.emit("rt", t0, Date.now()));

  socket.on("join", (msg) => {
    const name = String(msg?.name || "anon").slice(0, 12);
    const photo = msg?.photo || null;

    players.set(socket.id, {
      id: socket.id,
      seq: ++joinSeq,
      name,
      photo,
      pos: spawnPos(socket.id),
      dir: { x: 0, y: 0 },
      team: null,
    });

    socket.emit("joined", { id: socket.id, n: joinSeq });
    io.emit("lobby", lobbyPayload());
  });

  socket.on("input", (msg) => {
    const p = players.get(socket.id);
    if (!p) return;

    if (typeof msg.dx === "number" || typeof msg.dy === "number") {
      const dx = clamp(Number(msg?.dx || 0), -1, 1);
      const dy = clamp(Number(msg?.dy || 0), -1, 1);
      p.dir.x = isFinite(dx) ? dx : 0;
      p.dir.y = isFinite(dy) ? dy : 0;
    }
    if (msg?.action === 1) io.volatile.emit("action", { by: p.id, action: 1 });
    if (msg?.action === 2) io.volatile.emit("action", { by: p.id, action: 2 });
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("lobby", lobbyPayload());
  });
});

/* ---------------- Ticks ---------------- */
setInterval(() => {
  for (const p of players.values()) {
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
