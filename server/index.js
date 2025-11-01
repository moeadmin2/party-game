// server/index.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

/* -------------------- Config -------------------- */
const PORT = process.env.PORT || 3000;

// Match your host frame: strokeRoundedRect(10, 10, 1260, 700, 34)
const FRAME = { x: 10, y: 10, w: 1260, h: 700 };

// Rates
const TICK_MS = 16;   // physics ~60 Hz
const SNAPSHOT_MS = 33; // broadcast ~30 Hz

// Movement
const SPEED_PPS = 220;
const SPEED_PER_TICK = SPEED_PPS * (TICK_MS / 1000);

// Avatar collision (big circles only)
const PLAYER_RADIUS = 48;
const BOUNCE = 0.12;

/* -------------------- Server -------------------- */
const app = express();
app.use(cors());
app.use(express.static("public"));
app.get("/health", (_, res) => res.send("OK"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* -------------------- State -------------------- */
const players = new Map(); // id -> { id,name,tint,team,n,photo,pos:{x,y},dir:{x,y} }

/* -------------------- Helpers -------------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const midX = () => FRAME.x + FRAME.w / 2;

function spawnPos(id) {
  const xo = FRAME.x + 130 + (id.charCodeAt(0) % 10) * 110;
  const yo = FRAME.y + 150 + (id.charCodeAt(1) % 7) * 80;
  return { x: xo, y: yo };
}

function computeTeam(x) {
  return x < midX() ? "X" : "O";
}

function lobbyPayload() {
  return [...players.values()].map(p => ({
    id: p.id,
    name: p.name,
    tint: p.tint,
    team: p.team,
    n: p.n,
    photo: p.photo || null,
  }));
}

function snapshotPayload() {
  return {
    players: [...players.values()].map(p => ({
      id: p.id,
      x: p.pos.x | 0,
      y: p.pos.y | 0,
      team: p.team || null, // include live team for host UI
    })),
  };
}

/* -------------------- Sockets -------------------- */
io.on("connection", (socket) => {
  socket.on("join", (data) => {
    const name = String(data?.name || "anon").slice(0, 16);
    const tint = data?.tint || "#66ccff";
    const n = (typeof data?.n === "number") ? data.n : undefined;
    const photo = typeof data?.photo === "string" ? data.photo : undefined;

    const pos = spawnPos(socket.id);
    const team = computeTeam(pos.x);

    players.set(socket.id, {
      id: socket.id,
      name, tint, team, n, photo,
      pos,
      dir: { x: 0, y: 0 },
    });

    socket.emit("joined", { id: socket.id });
    io.emit("lobby", lobbyPayload());

    // If join contained a photo, also broadcast it so current host updates immediately
    if (photo) {
      io.emit("addtexture", { id: socket.id, data: photo });
    }
  });

  // Controller uploads/updates avatar image
  socket.on("addtexture", (msg) => {
    const p = players.get(socket.id);
    if (!p) return;
    const data = typeof msg?.data === "string" ? msg.data : null;
    if (!data) return;

    p.photo = data;               // persist
    io.emit("addtexture", { id: socket.id, data }); // live update
    io.emit("lobby", lobbyPayload());               // hydrate late joiners
  });

  // Live input
  socket.on("input", (msg) => {
    const p = players.get(socket.id);
    if (!p) return;

    const dx = clamp(Number(msg?.dx || 0), -1, 1);
    const dy = clamp(Number(msg?.dy || 0), -1, 1);
    p.dir.x = Number.isFinite(dx) ? dx : 0;
    p.dir.y = Number.isFinite(dy) ? dy : 0;

    if (msg?.action === 1) io.emit("action", { by: p.id, action: 1 });
    if (msg?.action === 2) io.emit("action", { by: p.id, action: 2 });
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("lobby", lobbyPayload());
  });
});

/* -------------------- Physics -------------------- */
setInterval(() => {
  for (const p of players.values()) {
    p.pos.x += p.dir.x * SPEED_PER_TICK;
    p.pos.y += p.dir.y * SPEED_PER_TICK;

    const minX = FRAME.x + PLAYER_RADIUS;
    const maxX = FRAME.x + FRAME.w - PLAYER_RADIUS;
    const minY = FRAME.y + PLAYER_RADIUS;
    const maxY = FRAME.y + FRAME.h - PLAYER_RADIUS;

    p.pos.x = clamp(p.pos.x, minX, maxX);
    p.pos.y = clamp(p.pos.y, minY, maxY);

    // Auto-assign team based on current x-position
    const newTeam = computeTeam(p.pos.x);
    if (newTeam !== p.team) {
      p.team = newTeam;
      // Optional: emit a small event if you want instant UI updates
      io.emit("teamchange", { id: p.id, team: p.team });
    }
  }

  // Avatar-Avatar collisions only
  const list = [...players.values()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      let dx = b.pos.x - a.pos.x;
      let dy = b.pos.y - a.pos.y;
      let dist = Math.hypot(dx, dy);

      const minDist = PLAYER_RADIUS + PLAYER_RADIUS;
      if (dist < 1e-6) { dx = 1; dy = 0; dist = 1; }

      if (dist < minDist) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        const push = overlap / 2;
        a.pos.x -= nx * push; a.pos.y -= ny * push;
        b.pos.x += nx * push; b.pos.y += ny * push;

        a.pos.x -= a.dir.x * BOUNCE * overlap;
        a.pos.y -= a.dir.y * BOUNCE * overlap;
        b.pos.x -= b.dir.x * BOUNCE * overlap;
        b.pos.y -= b.dir.y * BOUNCE * overlap;

        const minX = FRAME.x + PLAYER_RADIUS;
        const maxX = FRAME.x + FRAME.w - PLAYER_RADIUS;
        const minY = FRAME.y + PLAYER_RADIUS;
        const maxY = FRAME.y + FRAME.h - PLAYER_RADIUS;

        a.pos.x = clamp(a.pos.x, minX, maxX);
        a.pos.y = clamp(a.pos.y, minY, maxY);
        b.pos.x = clamp(b.pos.x, minX, maxX);
        b.pos.y = clamp(b.pos.y, minY, maxY);
      }
    }
  }
}, TICK_MS);

/* -------------------- Snapshots -------------------- */
setInterval(() => {
  io.emit("snapshot", snapshotPayload());
}, SNAPSHOT_MS);

/* -------------------- Start -------------------- */
server.listen(PORT, () => {
  console.log(`Server on http://localhost:${PORT}`);
});
