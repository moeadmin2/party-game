// client/host.js
import Phaser from "phaser";
import { socketConnect } from "./main.js";

const socket = socketConnect();
let players = new Map(); // id -> merged info

socket.on("lobby", (list) => {
  for (const p of list) {
    const prev = players.get(p.id) || {};
    players.set(p.id, { ...prev, ...p });
  }
});
socket.on("snapshot", (snap) => {
  for (const sp of (snap?.players || [])) {
    const prev = players.get(sp.id) || {};
    players.set(sp.id, { ...prev, ...sp });
  }
});

class Avatar extends Phaser.GameObjects.Container {
  constructor(scene, p) {
    super(scene, p.x || 0, p.y || 0);
    this.setSize(120, 120);
    scene.add.existing(this);

    // Target position for interpolation
    this.tx = p.x || 0;
    this.ty = p.y || 0;

    // Outer circle
    const g = scene.add.graphics();
    g.lineStyle(3, 0x111111, 1).strokeCircle(0, 0, 48);
    this.add(g);

    // Team arrow (X = pink left, O = blue right)
    this.arrow = scene.add.triangle(0, 0, 0, 0, 18, 8, 18, -8, 0xffffff, 1);
    this.add(this.arrow);

    // Top texts: line1 (team or number), line2 (name)
    this.num = scene.add.text(0, -48 + 2, "", { fontFamily: "system-ui", fontSize: "18px", color: "#111" }).setOrigin(0.5, 0);
    this.name = scene.add.text(0, -48 + 20, "", { fontFamily: "system-ui", fontSize: "16px", color: "#111" }).setOrigin(0.5, 0);
    this.add(this.num);
    this.add(this.name);

    // Photo masked circle (lowered ~15%)
    const phSize = 70;
    this.photo = scene.add.image(0, 21, "__ph__").setDisplaySize(phSize, phSize);
    const maskG = scene.add.graphics().fillStyle(0xffffff, 1).fillCircle(0, 21, 34);
    const mask = maskG.createGeometryMask();
    this.photo.setMask(mask);
    this.add(this.photo);
    this.add(maskG);

    const innerRing = scene.add.graphics();
    innerRing.lineStyle(2, 0x111111, 1).strokeCircle(0, 21, 34);
    this.add(innerRing);

    this.updateFrom(p, true);
  }

  updateFrom(p, instant = false) {
    // Target position from server
    if (typeof p.x === "number") this.tx = p.x;
    if (typeof p.y === "number") this.ty = p.y;
    if (instant) { this.x = this.tx; this.y = this.ty; }

    // Top line: show team if known, else sequential number
    if (p.team === "X" || p.team === "O") this.num.setText(p.team);
    else if (p.n != null) this.num.setText(String(p.n));

    // Second line: player name
    if (p.name != null) this.name.setText(String(p.name).slice(0, 12));

    // Team arrow color/side
    if (p.team) {
      const isX = p.team === "X";
      const color = isX ? 0xff8cc6 : 0x45a5ff;
      this.arrow.setFillStyle(color, 1);
      const side = isX ? -1 : 1;
      this.arrow.setPosition(side * (-48 - 12), 0).setAngle(isX ? 180 : 0);
    }

    // Photo (load Base64 safely)
    if (p.photo && p.photo !== this.getData("photo_src")) {
      this.setData("photo_src", p.photo);
      const key = "ph-" + p.id;

      // If texture exists already, use it; otherwise wait for 'addtexture'
      if (this.scene.textures.exists(key)) {
        this.photo.setTexture(key).setDisplaySize(70, 70);
      } else {
        const onAdd = (texKey) => {
          if (texKey === key) {
            this.photo.setTexture(key).setDisplaySize(70, 70);
            this.scene.textures.off("addtexture", onAdd);
          }
        };
        this.scene.textures.on("addtexture", onAdd);
        try { this.scene.textures.addBase64(key, p.photo); } catch {}
      }
    }
  }

  // called every frame by the scene (see update loop below)
  step(dt) {
    // simple critically-damped lerp toward target (server-authoritative)
    const lerp = 1 - Math.pow(0.001, dt); // ~smooth regardless of fps
    this.x += (this.tx - this.x) * lerp;
    this.y += (this.ty - this.y) * lerp;
  }
}

let snapFpsText, lastSnap = performance.now();

class HostScene extends Phaser.Scene {
  init() { this.avatars = new Map(); }
  preload() { this.textures.addBase64("__ph__", PH); }
  create() {
    this.cameras.main.setBackgroundColor("#ffffff");
    const frame = this.add.graphics();
    frame.lineStyle(10, 0x111111, 1).strokeRoundedRect(10, 10, 1260, 700, 34);

    this.add.text(640, 26, "Party game...", { fontFamily: "system-ui", fontSize: "40px", color: "#45a5ff" }).setOrigin(0.5, 0);
    this.add.text(250, 90, "X", { fontFamily: "system-ui", fontSize: "40px", color: "#ff8cc6" }).setOrigin(0.5);
    this.add.text(1030, 90, "O", { fontFamily: "system-ui", fontSize: "40px", color: "#45a5ff" }).setOrigin(0.5);
    const mid = this.add.graphics(); mid.lineStyle(6, 0x111111, 1).lineBetween(640, 130, 640, 640);

    snapFpsText = this.add.text(12, 680, "", { fontFamily: "system-ui", fontSize: "16px", color: "#444" });

    this.time.addEvent({ delay: 100, loop: true, callback: () => this.syncAvatars() });

    // per-frame update for interpolation
    this.events.on("update", (time, delta) => {
      const dt = Math.max(0.001, delta / 1000); // seconds
      for (const a of this.avatars.values()) a.step(dt);
    });
  }

  syncAvatars() {
    for (const [id, p] of players.entries()) {
      let a = this.avatars.get(id);
      if (!a) {
        a = new Avatar(this, p);
        this.avatars.set(id, a);
      } else {
        a.updateFrom(p);
      }
    }
    for (const [id, a] of this.avatars.entries()) {
      if (!players.has(id)) { a.destroy(); this.avatars.delete(id); }
    }
  }
}

socket.on("snapshot", () => {
  const now = performance.now();
  const dt = now - lastSnap; lastSnap = now;
  if (snapFpsText) snapFpsText.setText(`snap ~${Math.max(1, Math.round(1000 / dt))} fps`);
});

new Phaser.Game({
  type: Phaser.CANVAS,
  parent: document.getElementById("app") || document.body,
  width: 1280,
  height: 720,
  backgroundColor: "#ffffff",
  scene: [HostScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720
  }
});

const PH = "data:image/svg+xml;base64," + btoa(`<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'>
  <rect width='100' height='100' fill='#f2f2f2'/>
  <circle cx='50' cy='42' r='18' fill='#d9d9d9'/>
  <rect x='24' y='62' width='52' height='20' rx='10' fill='#d9d9d9'/>
</svg>`);
