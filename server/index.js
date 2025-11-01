const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

/* -------------------- Config -------------------- */
const PORT = process.env.PORT || 3000;
const ARENA = { w: 1280, h: 720, margin: 20 };      // world bounds (host canvas size)
const TICK_MS = 33;                                  // ~30 Hz physics tick
const SNAPSHOT_MS = 66;                              // ~15 Hz state broadcast
const SPEED_PPS = 220;                               // pixels per second at full tilt
const SPEED_PER_TICK = SPEED_PPS * (TICK_MS / 1000); // pixels per tick

/* -------------------- Server -------------------- */
const app = express();
app.use(cors());
app.use(express.static("public")); // when you build the client, put it here
app.get("/health", (_, res) => res.send("OK"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* -------------------- State -------------------- */
const players = new Map(); // id -> { id,name,tint,pos:{x,y},dir:{x,y},score }

/* -------------------- Helpers -------------------- */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function spawnPos(id) {
  // simple spread spawn: derive from socket id
  const xo = 120 + (id.charCodeAt(0) % 10) * 110;
  const yo = 120 + (id.charCodeAt(1) % 7) * 90;
  return { x: xo, y: yo };
}
function snapshot() {
  // small payload: id, x, y, s(=score), c(=tint)
  return {
    players: [...players.values()].map(p => ({
      id: p.id, x: p.pos.x | 0, y: p.pos.y | 0, s: p.score | 0, c: p.tint
    }))
  };
}

/* -------------------- Sockets -------------------- */
io.on("connection", (socket) => {
  // A client asks to join (controller)
  socket.on("join", (p) => {
    const name = String(p?.name || "anon").slice(0, 16);
    const tint = p?.tint || "#66ccff";
    const pos = spawnPos(socket.id);

    players.set(socket.id, {
      id: socket.id,
      name,
      tint,
      pos,
      dir: { x: 0, y: 0 },
      score: 0
    });

    socket.emit("joined", { id: socket.id });
    io.emit("lobby", [...players.values()].map(pl => ({
      id: pl.id, name: pl.name, tint: pl.tint
    })));
  });

  // Realtime input from controller (25 Hz)
  socket.on("input", (msg) => {
    const p = players.get(socket.id);
    if (!p) return;

    // ---- 360° analog movement ----
    const dx = clamp(Number(msg?.dx || 0), -1, 1);
    const dy = clamp(Number(msg?.dy || 0), -1, 1);
    p.dir.x = isFinite(dx) ? dx : 0;
    p.dir.y = isFinite(dy) ? dy : 0;

    // ---- Actions ----
    // action: 1 or 2 (e.g., pickup/drop, interact, etc.)
    if (msg?.action === 1) {
      io.emit("action", { by: p.id, action: 1 }); // broadcast for host FX/UI
      // TODO: add your game logic (e.g., pickup / check)
    }
    if (msg?.action === 2) {
      io.emit("action", { by: p.id, action: 2 });
      // TODO: add your game logic (e.g., drop / special)
    }
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("lobby", [...players.values()].map(pl => ({
      id: pl.id, name: pl.name, tint: pl.tint
    })));
  });
});

/* -------------------- Physics tick -------------------- */
setInterval(() => {
  for (const p of players.values()) {
    p.pos.x += p.dir.x * SPEED_PER_TICK;
    p.pos.y += p.dir.y * SPEED_PER_TICK;

    // clamp to arena bounds
    const m = ARENA.margin;
    p.pos.x = clamp(p.pos.x, m, ARENA.w - m);
    p.pos.y = clamp(p.pos.y, m, ARENA.h - m);
  }
}, TICK_MS);

/* -------------------- State snapshots -------------------- */
setInterval(() => {
  io.emit("snapshot", snapshot());
}, SNAPSHOT_MS);

/* -------------------- Start -------------------- */
server.listen(PORT, () => {
  console.log(`Server on http://localhost:${PORT}`);
});
