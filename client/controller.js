import { socketConnect } from "./main.js";
const socket = socketConnect();

/* ---------- global UI state ---------- */
const state = {
  screen: "welcome",     // "welcome" | "controller"
  name: "",
  photo: null,
  myId: null,
  mySeq: null,
  myTeam: null,
};

document.documentElement.style.background = "#737373";
document.body.style.margin = "0";
document.body.style.background = "#737373";
document.body.style.color = "#000";
document.body.style.font = "16px system-ui";
document.body.style.touchAction = "none";

/* ---------- orientation prompt + lock ---------- */
const rotateOverlay = document.createElement("div");
rotateOverlay.style.cssText = `
  position:fixed; inset:0; display:none; align-items:center; justify-content:center;
  background:rgba(0,0,0,0.35); z-index:9999; text-align:center; padding:20px; color:#fff;
  backdrop-filter:saturate(80%) blur(2px);`;
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
      await el.requestFullscreen({ navigationUI: "hide" }).catch(()=>{});
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

/* ---------- responsive metrics ---------- */
function metrics() {
  const w = window.innerWidth, h = window.innerHeight;
  const s = Math.min(w, h);
  return {
    ringR: Math.round(s * 0.20),
    knobR: Math.round(s * 0.06),
    btnD:  Math.round(s * 0.22),
    fBig:  Math.max(16, Math.round(s * 0.045)),
    fMed:  Math.max(14, Math.round(s * 0.035)),
  };
}

/* ---------- rebuild the CURRENT screen on resize/orientation ---------- */
let uiRoot;
function render() {
  const m = metrics();
  document.body.innerHTML = "";
  document.body.appendChild(rotateOverlay);
  uiRoot = document.createElement("div");

  if (state.screen === "welcome") {
    buildWelcome(m);
  } else {
    buildController(m);
  }
  document.body.appendChild(uiRoot);

  // If not landscape, show overlay
  if (!window.matchMedia("(orientation: landscape)").matches) {
    rotateOverlay.style.display = "flex";
  } else {
    rotateOverlay.style.display = "none";
  }
}

// --- with this guarded version ---
let resizeTimer = null;
function scheduleRender() {
  // if user is typing, don't rebuild the DOM
  const ae = document.activeElement;
  const typing = ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable);
  if (typing) return;

  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => render(), 120);
}

window.addEventListener("orientationchange", scheduleRender);
window.addEventListener("resize", scheduleRender);
// also listen to visualViewport (triggers when soft keyboard opens)
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", scheduleRender);
}

/* =========================================================================
   WELCOME
   ========================================================================= */
function buildWelcome(m) {
  const box = document.createElement("div");
  box.style.cssText = `
    position:fixed; inset:2svh 2svw; border:6px solid #111; border-radius:28px;
    display:flex; flex-direction:column; align-items:center; justify-content:flex-start;
    gap:2vh; padding:2vh; background:#737373;`;

  const title = document.createElement("div");
  title.textContent = "Welcome";
  title.style.cssText = `color:#ff8cc6; font:700 ${Math.round(m.fBig*1.3)}px system-ui;`;
  box.appendChild(title);

  // Row 1: Name
  const row1 = document.createElement("div");
  row1.style.cssText = "display:flex; gap:2vw; align-items:center; width:90%; justify-content:center; flex-wrap:wrap;";
  const nameLbl = label(`Name (12 letters max):`, m.fBig);
  const nameInput = document.createElement("input");
  nameInput.maxLength = 12;
  nameInput.value = state.name || "";
  nameInput.placeholder = "Your name";
  nameInput.style.cssText = `
    width:min(60vw, 560px); padding:1.2em 1.3em; border-radius:28px; border:0;
    background:#ffb3d9; color:#111; font:600 ${m.fMed}px system-ui;`;
  row1.append(nameLbl, nameInput);
  box.appendChild(row1);

  // Row 2: Photo
  const row2 = document.createElement("div");
  row2.style.cssText = "display:flex; gap:2vw; align-items:center; width:90%; justify-content:center; flex-wrap:wrap;";
  const picLbl = label("Picture (optional):", m.fBig);
  const uploadBtn = pill("Upload", m.fMed);
  const file = document.createElement("input"); file.type="file"; file.accept="image/*"; file.capture="user"; file.style.display="none";
  const preview = circleImg(Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.25));
  if (state.photo) preview.src = state.photo;
  row2.append(picLbl, uploadBtn, preview);
  box.appendChild(row2);

  // Join
  const joinBtn = pill("Join", m.fMed);
  joinBtn.style.background="#3a6df0";
  joinBtn.disabled = (nameInput.value.trim().length === 0);
  box.appendChild(joinBtn);

  uiRoot.appendChild(box);

  uploadBtn.onclick = ()=> file.click();
  file.onchange = async ()=>{
    const f = file.files?.[0]; if (!f) return;
    state.photo = await toSquareDataURL(f, 384);
    preview.src = state.photo;
  };
  nameInput.addEventListener("input", ()=>{
    state.name = nameInput.value;
    joinBtn.disabled = (state.name.trim().length === 0);
  });

  joinBtn.onclick = async ()=>{
    state.name = nameInput.value.trim().slice(0,12);
    socket.emit("join", { name: state.name, photo: state.photo });
    // Lock orientation AFTER emitting join; the resize that follows won't reset screen
    await ensureLandscape();
    try { await navigator.wakeLock?.request?.("screen"); } catch {}
    // We do NOT change screen here. We wait for server "joined".
  };
}

/* =========================================================================
   CONTROLLER
   ========================================================================= */
let text1Ref, text2Ref, teamRef, nameRef, numRef, photoRef, b1, b2;

function buildController(m) {
  uiRoot.style.cssText = `
    position:fixed; inset:2svh 2svw; border:6px solid #111; border-radius:28px;
    display:grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto 1fr;
    gap:1.2vh; padding:1.2vh; background:#737373;`;

  // Header
  const header = document.createElement("div");
  header.style.cssText = "grid-column:1 / span 2; display:flex; align-items:center; justify-content:center; gap:1.2vw;";
  photoRef = circleImg(Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.28));
  if (state.photo) photoRef.src = state.photo;
  const meta = document.createElement("div");
  meta.style.cssText = "display:flex; flex-direction:column; align-items:center; gap:0.6vh;";
  nameRef = divText(m.fBig, "#ff8cc6", 700); nameRef.textContent = state.name || "";
  teamRef = divText(Math.round(m.fBig*0.85), "#ff8cc6", 700);
  numRef  = divText(Math.round(m.fBig*0.75), "#ff8cc6", 700);
  meta.append(nameRef, teamRef, numRef); header.append(photoRef, meta); uiRoot.appendChild(header);

  // Left: joystick
  const left = document.createElement("div");
  left.style.cssText = "display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1vh;";
  const joy = buildJoystick(m, (info)=>{ text1Ref.textContent = info; });
  text1Ref = divText(m.fMed, "#111", 600); text1Ref.textContent = "text1";
  left.append(joy, text1Ref); uiRoot.appendChild(left);

  // Right: buttons
  const right = document.createElement("div");
  right.style.cssText = "position:relative; display:flex; align-items:center; justify-content:center;";
  const field = document.createElement("div");
  field.style.cssText = `position:relative; width:${m.btnD*2}px; height:${m.btnD*2}px;`;
  b2 = roundBtn("2", m.btnD, m.fBig); b2.style.left = `${m.btnD*0.15}px`; b2.style.top = `${m.btnD*0.9}px`;
  b1 = roundBtn("1", m.btnD, m.fBig);  b1.style.left = `${m.btnD*0.95}px`; b1.style.top = `${m.btnD*0.1}px`;
  field.append(b2, b1); right.appendChild(field);
  text2Ref = divText(m.fMed, "#111", 600); text2Ref.style.position="absolute"; text2Ref.style.left="0"; text2Ref.style.top="0"; text2Ref.textContent="text2";
  right.appendChild(text2Ref); uiRoot.appendChild(right);

  // wire
  b1.addEventListener("pointerdown", ()=>{ text2Ref.textContent="text2: 1"; socket.emit("input", { action:1 }); });
  b2.addEventListener("pointerdown", ()=>{ text2Ref.textContent="text2: 2"; socket.emit("input", { action:2 }); });

  // fill known labels
  if (state.mySeq != null) numRef.textContent = String(state.mySeq);
  if (state.myTeam) teamRef.textContent = `Team ${state.myTeam}`;
}

/* ---------- live server events ---------- */
socket.on("joined", (info)=>{
  state.myId = info.id;
  state.mySeq = info.n;
  // SWITCH SCREEN once server acknowledges the join
  state.screen = "controller";
  render();
});

socket.on("snapshot", (snap)=>{
  if (!state.myId) return;
  const me = (snap.players || []).find(p => p.id === state.myId);
  if (!me) return;
  state.myTeam = me.team || null;
  if (nameRef) nameRef.textContent = me.name || state.name || "";
  if (numRef)  numRef.textContent  = String(me.n ?? state.mySeq ?? "");
  if (teamRef) teamRef.textContent = state.myTeam ? `Team ${state.myTeam}` : "";
  if (me.photo && photoRef && photoRef.getAttribute("data-src") !== me.photo){
    photoRef.src = me.photo; photoRef.setAttribute("data-src", me.photo);
  }
});

/* ---------- helpers ---------- */
function label(text, f){ const d=document.createElement("div"); d.textContent=text; d.style.cssText=`color:#111;font:600 ${f}px system-ui;`; return d; }
function pill(text, f){ const b=document.createElement("button"); b.textContent=text;
  b.style.cssText=`padding:0.8em 1.2em;border:0;border-radius:28px;background:#ffb3d9;color:#111;font:700 ${f}px system-ui;touch-action:none;`; return b; }
function circleImg(sz){ const img=document.createElement("img"); img.width=img.height=sz;
  img.style.cssText=`width:${sz}px;height:${sz}px;border-radius:50%;object-fit:cover;border:3px solid #111;background:#eee`; img.src=PH; return img; }
function divText(f, color, weight){ const d=document.createElement("div"); d.style.cssText=`font:${weight} ${f}px system-ui;color:${color}`; return d; }
function roundBtn(label, d, f){ const b=document.createElement("button"); b.textContent=label;
  b.style.cssText=`position:absolute;width:${d}px;height:${d}px;border-radius:50%;border:0;background:#45a5ff;color:#051018;font:bold ${Math.round(f*0.85)}px system-ui;box-shadow:0 8px 20px rgba(0,0,0,0.35);touch-action:none;user-select:none;`; 
  b.addEventListener("pointerdown", ()=>{ b.animate([{transform:'scale(1)'},{transform:'scale(0.94)'},{transform:'scale(1)'}],{duration:120}); try{navigator.vibrate?.(20);}catch{} }); return b; }

function buildJoystick(m, onText){
  const wrap=document.createElement("div"); wrap.style.cssText="display:flex;align-items:center;justify-content:center;";
  const R = m.ringR, KN = m.knobR;
  const ring=document.createElement("div");
  ring.style.cssText=`position:relative;width:${R*2}px;height:${R*2}px;border-radius:50%;box-sizing:border-box;border:10px solid #56e1e6;background:transparent;`;
  const centerDot=document.createElement("div");
  centerDot.style.cssText="position:absolute;left:50%;top:50%;width:10px;height:10px;background:#ff2d2d;border-radius:50%;transform:translate(-50%,-50%);";
  const stick=document.createElement("div");
  stick.style.cssText="position:absolute;left:50%;top:50%;width:6px;height:0px;background:black;border-radius:3px;transform-origin:50% 100%;transform:translate(-50%,-100%) rotate(0rad);";
  const knob=document.createElement("div");
  knob.style.cssText=`position:absolute;width:${KN*2}px;height:${KN*2}px;border-radius:50%;background:#ff8cc6;left:50%;top:50%;transform:translate(-50%,-50%);`;
  ring.append(centerDot, stick, knob); wrap.appendChild(ring);

  const MAX_R=R; let dir={x:0,y:0}, dragging=false, lastSend=0;
  const rect=()=>ring.getBoundingClientRect(); const center=()=>{ const r=rect(); return {cx:r.left+r.width/2, cy:r.top+r.height/2}; };
  const setKnob=(px,py)=>{ knob.style.left=`${px}px`; knob.style.top=`${py}px`; };
  const resetKnob=()=>{ knob.style.left="50%"; knob.style.top="50%"; stick.style.height="0px"; stick.style.transform="translate(-50%,-100%) rotate(0rad)"; onText?.("text1"); };

  function onPointer(e){
    const {cx,cy}=center(); const x=e.clientX-cx, y=e.clientY-cy;
    const dist=Math.hypot(x,y), ang=Math.atan2(y,x); const cl=Math.min(dist,MAX_R);
    const nx=Math.cos(ang)*cl, ny=Math.sin(ang)*cl;
    const r=rect(); setKnob(nx+r.width/2, ny+r.height/2);
    stick.style.height=`${cl}px`; stick.style.transform=`translate(-50%,-100%) rotate(${ang+Math.PI/2}rad)`;
    dir.x = nx / MAX_R; dir.y = ny / MAX_R;
    let deg=ang*180/Math.PI; if (deg<0) deg+=360; const mag=cl/MAX_R;
    onText?.(`text1: ${deg.toFixed(0)}° | mag ${mag.toFixed(2)} | dx ${dir.x.toFixed(2)} dy ${dir.y.toFixed(2)}`);
  }
  function pd(e){ dragging=true; ring.setPointerCapture?.(e.pointerId); onPointer(e); }
  function pm(e){ if(dragging) onPointer(e); }
  function pu(){ dragging=false; dir={x:0,y:0}; resetKnob(); }
  ring.addEventListener("pointerdown", pd); ring.addEventListener("pointermove", pm);
  ring.addEventListener("pointerup", pu); ring.addEventListener("pointercancel", pu); ring.addEventListener("lostpointercapture", pu);

// replace the setInterval sender in buildJoystick():
let last = 0, lastDx=0, lastDy=0;
setInterval(() => {
  const now = performance.now();
  const changed = Math.abs(dir.x-lastDx) > 0.02 || Math.abs(dir.y-lastDy) > 0.02;
  if (now - last >= 30 || changed) {
    last = now; lastDx = dir.x; lastDy = dir.y;
    // volatile = OK to drop frames instead of buffering
    socket.volatile.emit("input", { dx:+dir.x.toFixed(3), dy:+dir.y.toFixed(3) });
  }
}, 30);

  return wrap;
}

/* ---------- photo util ---------- */
async function toSquareDataURL(file, size=384){
  const img=new Image(); img.src=URL.createObjectURL(file); await img.decode();
  const s=Math.min(img.width,img.height); const c=document.createElement("canvas"); c.width=c.height=size;
  const g=c.getContext("2d"); g.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,size,size);
  return c.toDataURL("image/jpeg",0.85);
}
const PH="data:image/svg+xml;base64,"+btoa(`<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
  <rect width='200' height='200' fill='#eee'/><circle cx='100' cy='84' r='36' fill='#d7d7d7'/><rect x='52' y='124' rx='20' width='96' height='40' fill='#d7d7d7'/>
</svg>`);

/* ---------- boot ---------- */
socket.on("connect", ()=>{});
socket.on("disconnect", ()=>console.warn("socket disconnected"));
render(); // start on welcome

let rtt=0, skew=0;
setInterval(() => socket.emit("rt", Date.now()), 1000);
socket.on("rt", (t0, tServer) => {
  const now = Date.now();
  rtt  = now - t0;                    // round-trip
  skew = (tServer + rtt/2) - now;     // server clock minus client clock
  if (text2Ref) text2Ref.textContent = `ping ${rtt} ms`;
});

b1.addEventListener("pointerdown", ()=>{ text2Ref.textContent=`ping ${rtt} ms`; socket.volatile.emit("input", { action:1 }); });
b2.addEventListener("pointerdown", ()=>{ text2Ref.textContent=`ping ${rtt} ms`; socket.volatile.emit("input", { action:2 }); });
