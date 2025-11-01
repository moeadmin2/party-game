// client/main.js
import { io } from "socket.io-client";

// Use same-origin by default (works when served by Node).
// If running Vite on a different port, pass &server=http://<PC-IP>:3000
export const SERVER =
  new URLSearchParams(location.search).get("server") || window.location.origin;

export function socketConnect() {
  const socket = io(SERVER, {
    transports: ["websocket"],
  });
  socket.on("connect", () => console.log("Connected to", SERVER));
  socket.on("connect_error", (e) => console.error("Socket error:", e.message));
  return socket;
}

// Route by ?role, or render chooser if missing.
const role = new URLSearchParams(location.search).get("role");
const root = document.getElementById("app") || document.body;

if (role === "host") {
  import("./host.js");
} else if (role === "controller") {
  import("./controller.js");
} else {
  root.innerHTML = `
    <div style="display:flex;min-height:100svh;align-items:center;justify-content:center;background:#737373;">
      <div style="display:flex;gap:16px;">
        <a href="?role=host" style="padding:12px 20px;border-radius:12px;background:#3a6df0;color:#fff;font:600 16px system-ui;text-decoration:none;">Host View</a>
        <a href="?role=controller" style="padding:12px 20px;border-radius:12px;background:#56e1e6;color:#051018;font:700 16px system-ui;text-decoration:none;">Controller</a>
      </div>
    </div>`;
}
