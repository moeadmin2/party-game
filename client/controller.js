import { socketConnect } from "./main.js";

const socket = socketConnect();

/* ---------- base styles ---------- */
document.documentElement.style.background = "#737373";
document.body.style.margin = "0";
document.body.style.background = "#737373";
document.body.style.color = "#000";
document.body.style.font = "16px system-ui";
document.body.style.touchAction = "none";

/* ---------- keep refs ---------- */
let myId = null;
let mySeq = null;
let myTeam = null;

/* ---------- orientation helpers ---------- */
const rotateOverlay = document.createElement("div");
rotateOverlay.style.cssText = `
  position:fixed; inset:0; display:none; align-items:center; justify-content:center;
  background:rgba(0,0,0,0.35); z-index:9999; text-align:center; padding:20px;
  backdrop-filter:saturate(80%) blur(2px); color:#fff;
`;
rotateOverlay.innerHTML = `
  <div style="background:#222;border-radius:16px;padding:18px 22px;max-width:480px;">
    <div style="font:600 18px system-ui; margin-bottom:6px">Rotate to Landscape</div>
    <div style="font:14px system-ui; color:#ddd; margin-bottom:12px">For best control, use <b>landscape</b>.</div>
    <button id="forceLandscapeBtn" style="padding:10px 14px;border:0;border-radius:10px;background:#3a6df0;color:#fff;font-weight:600">
      Try Force Landscape
    </button>
  </div>`;
document.body.appendChild(rotateOverlay);

async function ensureLandscape() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    }
    if (screen.orientation?.lock) {
      await screen.orientation.lock("landscape");
      rotateOverlay.style.display = "none";
      return true;
    }
  } catch {}
  if (!window.matchMedia("(orientation: landscape)").matches) rotateOverlay.style.display = "flex";
  return false;
}
document.getElementById("forceLandscapeBtn")?.addEventListener("click", ensureLandscape);

/* =========================================================================
   SCREEN 1: WELCOME (name ≤ 12, optional photo)
   ========================================================================= */
function welcomeScreen() {
  document.body.innerHTML = "";
  document.body.appendChild(rotateOverlay);

  const box = document.createElement("div");
  box.style.cssText = `
    position:fixed; inset:24px; border:6px solid #111; border-radius:28px;
    display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding:28px; gap:28px;
    background:#737373;
  `;
  const title = document.createElement("div");
  title.textContent = "Welcome";
  title.style.cssText = "color:#ff8cc6; font:700 40px system-ui; margin-top:4px;";
  box.appendChild(title);

  // Form rows
  const row1 = document.createElement("div");
  row1.style.cssText = "display:flex; gap:20px; align-items:center; width:90%; justify-content:center;";
  const nameLbl = pillLabel("Name (12 letters max):");
  const nameInput = document.createElement("input");
  nameInput.maxLength = 12;
  nameInput.placeholder = "Your name";
  nameInput.style.cssText = "width:520px; padding:16px 18px; border-radius:28px; border:0; background:#ffb3d9; color:#111; font:600 20px system-ui;";
  row1.append(nameLbl, nameInput);
  box.appendChild(row1);

  const row2 = document.createElement("div");
  row2.style.cssText = "display:flex; gap:24px; align-items:center; width:90%; justify-content:center;";
  const picLbl = pillLabel("Picture (optional):");
  const uploadBtn = pillButton("Upload");
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/*";
  file.capture = "user";
  file.style.display = "none";

  const preview = circleImg(180); // circular preview
  row2.append(picLbl, uploadBtn, preview);
  box.appendChild(row2);

  const joinBtn = pillButton("Join");
  joinBtn.style.background = "#3a6df0";
  joinBtn.style.marginTop = "8px";
  joinBtn.disabled = true;
  box.appendChild(joinBtn);

  document.body.appendChild(box);

  let photoDataURL = null;

  uploadBtn.onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    photoDataURL = await toSquareDataURL(f, 256);
    preview.src = photoDataURL;
  };

  nameInput.addEventListener("input", () => {
    joinBtn.disabled = nameInput.value.trim().length === 0;
  });

  joinBtn.onclick = async () => {
    const name = nameInput.value.trim().slice(0, 12);
    socket.emit("join", { name, photo: photoDataURL });
    await ensureLandscape();
    try { await navigator.wakeLock?.request?.("screen"); } catch {}
    // wait for "joined" to flip to game screen
  };
}

socket.on("joined", (info) => {
  myId = info.id;
  mySeq = info.n;
  gameScreen(); // switch to controller UI
});

/* =========================================================================
   SCREEN 2: CONTROLLER (joystick + two buttons + profile)
   ========================================================================= */
let text1Ref, text2Ref, teamRef, nameRef, numRef, photoRef;

function gameScreen() {
  document.body.innerHTML = "";
  document.body.appendChild(rotateOverlay);

  const root = document.createElement("div");
  root.style.cssText = `
    position:fixed; inset:24px; border:6px solid #111; border-radius:28px;
    display:grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto 1fr;
    gap:10px; padding:18px; background:#737373;
  `;

  // Profile header (center column span)
  const header = document.createElement("div");
  header.style.cssText = "grid-column: 1 / span 2; display:flex; align-items:center; justify-content:center; gap:18px;";
  photoRef = circleImg(180);
  const meta = document.createElement("div");
  meta.style.cssText = "display:flex; flex-direction:column; align-items:center; gap:8px;";
  nameRef = document.createElement("div");
  nameRef.style.cssText = "font:700 34px system-ui; color:#ff8cc6";
  teamRef = document.createElement("div");
  teamRef.style.cssText = "font:700 28px system-ui; color:#ff8cc6";
  numRef = document.createElement("div");
  numRef.style.cssText = "font:700 24px system-ui; color:#ff8cc6";
  meta.append(nameRef, teamRef, numRef);
  header.append(photoRef, meta);
  root.appendChild(header);

  // Left: joystick + text1
  const left = document.createElement("div");
  left.style.cssText = "display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;";
  const joy = buildJoystick((info) => { text1Ref.textContent = info; }); // updates text1
  text1Ref = document.createElement("div");
  text1Ref.style.cssText = "font:600 18px system-ui; color:#111";
  text1Ref.textContent = "text1";
  left.append(joy, text1Ref);
  root.appendChild(left);

  // Right: buttons + text2
  const right = document.createElement("div");
  right.style.cssText = "position:relative; display:flex; align-items:center; justify-content:center;";
  const field = document.createElement("div");
  field.style.cssText = "position:relative; width:320px; height:320px;";
  const b2 = roundBtn("2"); b2.style.left = "60px";  b2.style.top = "150px";
  const b1 = roundBtn("1"); b1.style.left = "180px"; b1.style.top = "40px"; // NE of 2
  field.append(b2, b1);
  right.appendChild(field);

  text2Ref = document.createElement("div");
  text2Ref.style.cssText = "position:absolute; left:0; top:0; font:600 18px system-ui; color:#111";
  text2Ref.textContent = "text2";
  right.appendChild(text2Ref);

  root.appendChild(right);
  document.body.appendChild(root);

  // wire actions
  b1.addEventListener("pointerdown", () => { text2Ref.textContent = "text2: 1"; socket.emit("input", { action: 1 }); });
  b2.addEventListener("pointerdown", () => { text2Ref.textContent = "text2: 2"; socket.emit("input", { action: 2 }); });
}

/* ---------- live updates from server (team/name/photo) ---------- */
socket.on("snapshot", (snap) => {
  if (!myId) return;
  const me = (snap.players || []).find(p => p.id === myId);
  if (!me) return;
  myTeam = me.team || null;

  if (nameRef) nameRef.textContent = me.name || "";
  if (numRef) numRef.textContent = String(me.n ?? "");
  if (teamRef) teamRef.textContent = myTeam ? `Team ${myTeam}` : "";
  if (me.photo && photoRef && photoRef.getAttribute("data-src") !== me.photo) {
    photoRef.src = me.photo;
    photoRef.setAttribute("data-src", me.photo);
  }
});

/* ---------- UI builders ---------- */
function pillLabel(text) {
  const d = document.createElement("div");
  d.textContent = text;
  d.style.cssText = "color:#111; font:600 40px system-ui;";
  return d;
}
function pillButton(text) {
  const b = document.createElement("button");
  b.textContent = text;
  b.style.cssText = "padding:14px 22px; border:0; border-radius:28px; background:#ffb3d9; color:#111; font:700 20px system-ui;";
  b.style.touchAction = "none";
  return b;
}
function circleImg(sz) {
  const img = document.createElement("img");
  img.width = img.height = sz;
  img.style.cssText = `width:${sz}px;height:${sz}px;border-radius:50%;object-fit:cover;border:3px solid #111;background:#eee`;
  img.src = PH;
  return img;
}
function roundBtn(label){
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText = `
    position:absolute;width:150px;height:150px;border-radius:50%;border:0;background:#45a5ff;
    color:#051018;font:bold 34px system-ui;box-shadow:0 8px 20px rgba(0,0,0,0.35);touch-action:none;user-select:none;
  `;
  b.addEventListener("pointerdown", ()=>{ b.animate([{transform:'scale(1)'},{transform:'scale(0.94)'},{transform:'scale(1)'}],{duration:120}); try{navigator.vibrate?.(20);}catch{} });
  return b;
}

function buildJoystick(onText) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex; align-items:center; justify-content:center;";

  const RING_R = 95, KNOB_R = 28;
  const ring = document.createElement("div");
  ring.style.cssText = `position:relative;width:${RING_R*2}px;height:${RING_R*2}px;border-radius:50%;
                        box-sizing:border-box;border:10px solid #56e1e6;background:transparent;`;
  const centerDot = document.createElement("div");
  centerDot.style.cssText = "position:absolute;left:50%;top:50%;width:10px;height:10px;background:#ff2d2d;border-radius:50%;transform:translate(-50%,-50%);";
  const stick = document.createElement("div");
  stick.style.cssText = "position:absolute;left:50%;top:50%;width:6px;height:0px;background:black;border-radius:3px;transform-origin:50% 100%;transform:translate(-50%,-100%) rotate(0rad);";
  const knob = document.createElement("div");
  knob.style.cssText = `position:absolute;width:${KNOB_R*2}px;height:${KNOB_R*2}px;border-radius:50%;background:#ff8cc6;left:50%;top:50%;transform:translate(-50%,-50%);`;
  ring.append(centerDot, stick, knob);
  wrap.appendChild(ring);

  const MAX_R = RING_R;
  let dir = { x: 0, y: 0 }, dragging = false, lastSend = 0;

  const rect = () => ring.getBoundingClientRect();
  const center = () => { const r = rect(); return { cx: r.left + r.width/2, cy: r.top + r.height/2 }; };
  const setKnob = (px,py)=>{ knob.style.left = `${px}px`; knob.style.top = `${py}px`; };
  const resetKnob = ()=>{ knob.style.left = "50%"; knob.style.top = "50%"; stick.style.height = "0px"; stick.style.transform = "translate(-50%,-100%) rotate(0rad)"; onText?.("text1"); };

  function onPointer(e) {
    const { cx, cy } = center();
    const x = e.clientX - cx, y = e.clientY - cy;
    const dist = Math.hypot(x, y), ang = Math.atan2(y, x);
    const cl = Math.min(dist, MAX_R), nx = Math.cos(ang)*cl, ny = Math.sin(ang)*cl;

    const r = rect(); setKnob(nx + r.width/2, ny + r.height/2);
    stick.style.height = `${cl}px`; stick.style.transform = `translate(-50%,-100%) rotate(${ang + Math.PI/2}rad)`;

    dir.x = nx / MAX_R; dir.y = ny / MAX_R;
    let deg = ang * 180 / Math.PI; if (deg < 0) deg += 360;
    const mag = cl / MAX_R;
    onText?.(`text1: ${deg.toFixed(0)}° | mag ${mag.toFixed(2)} | dx ${dir.x.toFixed(2)} dy ${dir.y.toFixed(2)}`);
  }

  function pd(e){ dragging = true; ring.setPointerCapture?.(e.pointerId); onPointer(e); }
  function pm(e){ if (dragging) onPointer(e); }
  function pu(){ dragging = false; dir = {x:0,y:0}; resetKnob(); }

  ring.addEventListener("pointerdown", pd);
  ring.addEventListener("pointermove", pm);
  ring.addEventListener("pointerup", pu);
  ring.addEventListener("pointercancel", pu);
  ring.addEventListener("lostpointercapture", pu);

  setInterval(()=> {
    const now = performance.now();
    if (now - lastSend < 32) return;
    lastSend = now;
    socket.emit("input", { dx: Number(dir.x.toFixed(3)), dy: Number(dir.y.toFixed(3)) });
  }, 40);

  return wrap;
}

/* ---------- utils ---------- */
async function toSquareDataURL(file, size = 256) {
  const img = new Image(); img.src = URL.createObjectURL(file); await img.decode();
  const s = Math.min(img.width, img.height); const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d");
  g.drawImage(img, (img.width - s)/2, (img.height - s)/2, s, s, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.8);
}
const PH = "data:image/svg+xml;base64," + btoa(`<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
  <rect width='200' height='200' fill='#eee'/><circle cx='100' cy='84' r='36' fill='#d7d7d7'/><rect x='52' y='124' rx='20' width='96' height='40' fill='#d7d7d7'/>
</svg>`);

/* ---------- boot ---------- */
socket.on("connect", () => { /* noop; UI builds immediately */ });
welcomeScreen();
