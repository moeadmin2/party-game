import { socketConnect } from "./main.js";

const socket = socketConnect();

/* ---------- GLOBAL STYLES / BACKGROUND ---------- */
document.documentElement.style.background = "#737373";
document.body.style.margin = "0";
document.body.style.background = "#737373";
document.body.style.color = "#000";
document.body.style.font = "16px system-ui";
document.body.style.touchAction = "none"; // prevent scroll/zoom on drag

/* ---------- ORIENTATION HELPERS ---------- */
const rotateOverlay = document.createElement("div");
rotateOverlay.style.cssText = `
  position:fixed; inset:0; display:none; align-items:center; justify-content:center;
  background:rgba(0,0,0,0.35); z-index:9999; text-align:center; padding:20px;
  backdrop-filter:saturate(80%) blur(2px);
`;
rotateOverlay.innerHTML = `
  <div style="background:#222;border-radius:16px;padding:18px 22px;max-width:480px;color:#fff">
    <div style="font:600 18px system-ui; margin-bottom:6px">Rotate to Landscape</div>
    <div style="font:14px system-ui; color:#ddd; margin-bottom:12px">
      For best control, use <b>landscape</b>. Some browsers need a user gesture.
    </div>
    <button id="forceLandscapeBtn"
      style="padding:10px 14px;border:0;border-radius:10px;background:#3a6df0;color:#fff;font-weight:600">
      Try Force Landscape
    </button>
  </div>
`;
document.body.appendChild(rotateOverlay);

function showRotateOverlay(){ rotateOverlay.style.display = "flex"; }
function hideRotateOverlay(){ rotateOverlay.style.display = "none"; }

async function ensureLandscape() {
  try {
    // Fullscreen greatly increases the chance that lock() works (Android).
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    }
    if (screen.orientation?.lock) {
      await screen.orientation.lock("landscape");
      hideRotateOverlay();
      return true;
    }
  } catch { /* ignore */ }
  // If we reach here, lock wasn't allowed (e.g., iOS). Ask user to rotate.
  if (!window.matchMedia("(orientation: landscape)").matches) showRotateOverlay();
  return false;
}

document.getElementById("forceLandscapeBtn")?.addEventListener("click", ensureLandscape);
window.addEventListener("orientationchange", () => {
  if (window.matchMedia("(orientation: landscape)").matches) hideRotateOverlay();
  else showRotateOverlay();
});
document.addEventListener("fullscreenchange", () => {
  // If they exit fullscreen, we may lose lock; keep the hint accurate.
  if (!document.fullscreenElement &&
      !window.matchMedia("(orientation: landscape)").matches) showRotateOverlay();
});

/* ---------- LAYOUT ---------- */
const root = document.createElement("div");
root.style.position = "fixed";
root.style.inset = "0";
root.style.display = "grid";
root.style.gridTemplateRows = "auto 1fr";
root.style.padding = "10px";
document.body.appendChild(root);

// Top bar (name, join, status)
const bar = document.createElement("div");
bar.style.display = "flex";
bar.style.gap = "8px";
bar.style.alignItems = "center";
bar.style.flexWrap = "wrap";
root.appendChild(bar);

bar.innerHTML = `
  <input id="name" placeholder="Name"
         style="padding:10px 12px;border-radius:10px;border:1px solid #333;background:#2e2e2e;color:#fff" />
  <input id="color" type="color" value="#66ccff"
         style="padding:0;width:46px;height:42px;border-radius:10px;border:1px solid #333;background:#2e2e2e"/>
  <button id="join"
          style="padding:10px 14px;border:0;border-radius:10px;background:#3a6df0;color:#fff">Join</button>
  <span id="status" style="color:#111;margin-left:6px"></span>
  <div style="margin-left:auto;display:flex;gap:18px;">
    <div id="text1" style="font:600 14px system-ui;color:#111">text1</div>
    <div id="text2" style="font:600 14px system-ui;color:#111">text2</div>
  </div>
`;

// Main play area: 2 columns (left joystick, right buttons)
const pad = document.createElement("div");
pad.style.position = "relative";
pad.style.display = "grid";
pad.style.gridTemplateColumns = "1fr 1fr";
pad.style.gap = "10px";
pad.style.height = "100%";
root.appendChild(pad);

/* ---------- LEFT: JOYSTICK ---------- */
const joyBox = document.createElement("div");
joyBox.style.position = "relative";
joyBox.style.display = "flex";
joyBox.style.alignItems = "center";
joyBox.style.justifyContent = "center";
pad.appendChild(joyBox);

// Sizes
const JOY_SIZE = 220;
const RING_R = 95;      // cyan ring radius
const KNOB_R = 28;      // pink knob radius
const STICK_W = 6;

joyBox.style.height = "100%";
joyBox.style.minHeight = `${JOY_SIZE}px`;

// Ring
const ring = document.createElement("div");
ring.style.position = "relative";
ring.style.width = `${RING_R*2}px`;
ring.style.height = `${RING_R*2}px`;
ring.style.borderRadius = "50%";
ring.style.boxSizing = "border-box";
ring.style.border = "10px solid #56e1e6";
ring.style.background = "transparent";
joyBox.appendChild(ring);

// Center red dot
const centerDot = document.createElement("div");
centerDot.style.cssText = `
  position:absolute; left:50%; top:50%; width:10px; height:10px;
  background:#ff2d2d; border-radius:50%; transform:translate(-50%,-50%);
`;
ring.appendChild(centerDot);

// Stick (black)
const stick = document.createElement("div");
stick.style.position = "absolute";
stick.style.left = "50%";
stick.style.top = "50%";
stick.style.width = `${STICK_W}px`;
stick.style.height = "0px";
stick.style.transformOrigin = "50% 100%";
stick.style.background = "black";
stick.style.borderRadius = "3px";
stick.style.transform = "translate(-50%,-100%) rotate(0rad)";
ring.appendChild(stick);

// Knob (pink)
const knob = document.createElement("div");
knob.style.position = "absolute";
knob.style.width = `${KNOB_R*2}px`;
knob.style.height = `${KNOB_R*2}px`;
knob.style.borderRadius = "50%";
knob.style.background = "#ffb3d9";
knob.style.left = "50%";
knob.style.top = "50%";
knob.style.transform = "translate(-50%,-50%)";
ring.appendChild(knob);

/* ---------- RIGHT: BUTTONS (1 NE of 2) ---------- */
const btnArea = document.createElement("div");
btnArea.style.position = "relative";
btnArea.style.display = "flex";
btnArea.style.alignItems = "center";
btnArea.style.justifyContent = "center";
pad.appendChild(btnArea);

// Container so we can absolutely place 1 relative to 2 (NE)
const btnField = document.createElement("div");
btnField.style.position = "relative";
btnField.style.width = "280px";
btnField.style.height = "280px";
btnArea.appendChild(btnField);

function roundButton(label){
  const b = document.createElement("button");
  b.textContent = label;
  b.style.position = "absolute";
  b.style.width = "140px";
  b.style.height = "140px";
  b.style.borderRadius = "50%";
  b.style.border = "0";
  b.style.background = "#45a5ff";
  b.style.color = "#051018";
  b.style.font = "bold 32px system-ui";
  b.style.boxShadow = "0 8px 20px rgba(0,0,0,0.35)";
  b.style.touchAction = "none";
  b.style.userSelect = "none";
  b.addEventListener("pointerdown", ()=> pulse(b));
  return b;
}
const btn2 = roundButton("2"); // place button 2 first
btn2.style.left = "40px";
btn2.style.top  = "130px";
const btn1 = roundButton("1"); // button 1 to the NE of 2
btn1.style.left = "140px";     // right of 2
btn1.style.top  = "20px";      // above 2
btnField.appendChild(btn2);
btnField.appendChild(btn1);

function pulse(el){
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.94)' }, { transform: 'scale(1)' }], { duration: 120 });
  try { navigator.vibrate?.(20); } catch {}
}

/* ---------- TOP BAR HOOKS ---------- */
const nameI  = document.getElementById("name");
const colorI = document.getElementById("color");
const joinB  = document.getElementById("join");
const status = document.getElementById("status");
const text1  = document.getElementById("text1");
const text2  = document.getElementById("text2");

socket.on("connect", () => (status.textContent = "Connected"));
socket.on("joined",  (msg) => (status.textContent = `Joined as ${msg.id}`));

joinB.onclick = async () => {
  const name = (nameI.value || "anon").slice(0,16);
  socket.emit("join", { name, tint: colorI.value });

  // Try to force landscape after a user gesture
  await ensureLandscape();

  // Keep screen on
  try { await navigator.wakeLock?.request?.("screen"); } catch {}
};

/* ---------- JOYSTICK LOGIC ---------- */
let dir = { x: 0, y: 0 };     // normalized -1..1
let dragging = false;
let lastSend = 0;

const ringRect = () => ring.getBoundingClientRect();
const center = () => {
  const r = ringRect();
  return { cx: r.left + r.width/2, cy: r.top + r.height/2 };
};
const MAX_R = RING_R;

function setKnob(px, py) {
  knob.style.left = `${px}px`;
  knob.style.top  = `${py}px`;
}
function resetKnob() {
  knob.style.left = "50%";
  knob.style.top  = "50%";
  stick.style.height = "0px";
  stick.style.transform = "translate(-50%,-100%) rotate(0rad)";
  text1.textContent = "text1"; // clear when released
}

function onPointer(e) {
  const { cx, cy } = center();
  const x = e.clientX - cx;
  const y = e.clientY - cy;
  const dist = Math.hypot(x, y);
  const angle = Math.atan2(y, x);        // radians
  const clamped = Math.min(dist, MAX_R);
  const nx = Math.cos(angle) * clamped;
  const ny = Math.sin(angle) * clamped;

  // Visual position
  const r = ringRect();
  const px = (nx + r.width/2);
  const py = (ny + r.height/2);
  setKnob(px, py);

  // Stick
  stick.style.height = `${clamped}px`;
  stick.style.transform = `translate(-50%,-100%) rotate(${angle + Math.PI/2}rad)`;

  // Normalized direction -1..1
  dir.x = nx / MAX_R;
  dir.y = ny / MAX_R;

  // UI text: degrees (0° = right, 90° = down; adjust if you prefer up=0°)
  let deg = angle * 180 / Math.PI;
  if (deg < 0) deg += 360;
  const mag = (clamped / MAX_R);
  text1.textContent = `text1: ${deg.toFixed(0)}°  |  mag ${mag.toFixed(2)}  |  dx ${dir.x.toFixed(2)} dy ${dir.y.toFixed(2)}`;
}

function joyPointerDown(e){
  dragging = true;
  ring.setPointerCapture?.(e.pointerId);
  onPointer(e);
}
function joyPointerMove(e){
  if(!dragging) return;
  onPointer(e);
}
function joyPointerUp(){
  dragging = false;
  dir = { x: 0, y: 0 };
  resetKnob();
}

ring.addEventListener("pointerdown", joyPointerDown);
ring.addEventListener("pointermove", joyPointerMove);
ring.addEventListener("pointerup", joyPointerUp);
ring.addEventListener("pointercancel", joyPointerUp);
ring.addEventListener("lostpointercapture", joyPointerUp);

/* ---------- SEND INPUTS (25 Hz) ---------- */
setInterval(()=>{
  const now = performance.now();
  if (now - lastSend < 32) return;
  lastSend = now;
  socket.emit("input", {
    dx: Number(dir.x.toFixed(3)),
    dy: Number(dir.y.toFixed(3))
  });
}, 40);

/* ---------- BUTTON EVENTS + text2 ---------- */
btn1.addEventListener("pointerdown", () => {
  text2.textContent = "text2: 1";
  socket.emit("input", { dx: 0, dy: 0, action: 1 });
});
btn2.addEventListener("pointerdown", () => {
  text2.textContent = "text2: 2";
  socket.emit("input", { dx: 0, dy: 0, action: 2 });
});
