// Shared boot + socket helper (used by both host and controller)
import { io } from "socket.io-client";

// If you serve client from your Node server, same origin works.
// You can override with ?server=https://public.example.com
export const SERVER =
  new URLSearchParams(location.search).get("server") || window.location.origin;

export function socketConnect() {
  const socket = io(SERVER, { transports: ["websocket"] });
  socket.on("connect", () => console.log("Connected to", SERVER));
  socket.on("connect_error", (e) => console.error("Socket error:", e.message));
  return socket;
}

// Lazy-load the correct module based on button click or ?role=...
document.getElementById("host").onclick = () => import("./host.js");
document.getElementById("ctrl").onclick = () => import("./controller.js");

const role = new URLSearchParams(location.search).get("role");
if (role === "host") import("./host.js");
if (role === "controller") import("./controller.js");
