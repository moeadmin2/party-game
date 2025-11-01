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
  for (const sp of snap.players || []) {
    const prev = players.get(sp.id) || {};
    players.set(sp.id, { ...prev, ...sp });
  }
});

class Avatar extends Phaser.GameObjects.Container {
  constructor(scene, p) {
    super(scene, p.x || 0, p.y || 0);
    this.setSize(120, 120);
    scene.add.existing(this);

    // Outer thin circle
    const g = scene.add.graphics();
    g.lineStyle(3, 0x111111, 1);
    g.strokeCircle(0, 0, 48);
    this.add(g);

    // Arrow (team color, on left or right side)
    this.arrow = scene.add.triangle(0, 0, 0, 0, 18, 8, 18, -8, 0xffffff, 1);
    this.add(this.arrow);

    // Top texts
    this.num = scene.add.text(0, -48 + 2, "", { fontFamily: "system-ui", fontSize: "18px", color: "#111" }).setOrigin(0.5, 0);
    this.name = scene.add.text(0, -48 + 20, "", { fontFamily: "system-ui", fontSize: "16px", color: "#111" }).setOrigin(0.5, 0);
    this.add(this.num);
    this.add(this.name);

    // Photo masked circle
    const phSize = 70;
    this.photo = scene.add.image(0, 14, "__ph__");
    this.photo.setDisplaySize(phSize, phSize);
    const maskG = scene.add.graphics();
    maskG.fillStyle(0xffffff, 1).fillCircle(0, 14, 34);
    const mask = maskG.createGeometryMask();
    this.photo.setMask(mask);
    this.add(this.photo);
    this.add(maskG);

    const innerRing = scene.add.graphics();
    innerRing.lineStyle(2, 0x111111, 1).strokeCircle(0, 14, 34);
    this.add(innerRing);

    this.updateFrom(p);
  }

  updateFrom(p) {
    if (typeof p.x === "number") this.x = p.x;
    if (typeof p.y === "number") this.y = p.y;
    if (p.n != null) this.num.setText(String(p.n));
    if (p.name != null) this.name.setText(String(p.name).slice(0, 12));

    // Team arrow: pink for X (left), blue for O (right)
    if (p.team) {
      const isX = p.team === "X";
      const color = isX ? 0xff8cc6 : 0x45a5ff;
      this.arrow.setFillStyle(color, 1);
      // place arrow outside the circle, pointing outward
      const side = isX ? -1 : 1;
      this.arrow.setPosition(side * (-48 - 12), 0);
      this.arrow.setAngle(isX ? 180 : 0);
    }

    if (p.photo && p.photo !== this.getData("photo_src")) {
      this.setData("photo_src", p.photo);
      const key = "ph-" + p.id;
      try { this.scene.textures.remove(key); } catch {}
      this.scene.textures.addBase64(key, p.photo);
      this.photo.setTexture(key).setDisplaySize(70, 70);
    }
  }
}

class HostScene extends Phaser.Scene {
  init() { this.avatars = new Map(); }
  preload() {
    // tiny gray placeholder
    this.textures.addBase64("__ph__", PH);
  }
  create() {
    this.cameras.main.setBackgroundColor("#ffffff");

    // Frame
    this.frame = this.add.graphics();
    this.frame.lineStyle(10, 0x111111, 1);
    this.frame.strokeRoundedRect(10, 10, 1260, 700, 34);

    // Title + headers
    this.add.text(640, 26, "Party game...", { fontFamily: "system-ui", fontSize: "40px", color: "#45a5ff" }).setOrigin(0.5, 0);
    this.add.text(250, 90, "X", { fontFamily: "system-ui", fontSize: "40px", color: "#ff8cc6" }).setOrigin(0.5);
    this.add.text(1030, 90, "O", { fontFamily: "system-ui", fontSize: "40px", color: "#45a5ff" }).setOrigin(0.5);

    // Middle divider
    const mid = this.add.graphics();
    mid.lineStyle(6, 0x111111, 1);
    mid.lineBetween(640, 130, 640, 640);

    // Reconcile avatars regularly
    this.time.addEvent({ delay: 100, loop: true, callback: () => this.reconcile() });
  }

  reconcile() {
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

new Phaser.Game({
  type: Phaser.CANVAS,
  parent: document.body,
  width: 1280,
  height: 720,
  backgroundColor: "#ffffff",
  scene: [HostScene],
});

const PH = "data:image/svg+xml;base64," + btoa(`<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'>
  <rect width='100' height='100' fill='#f2f2f2'/>
  <circle cx='50' cy='42' r='18' fill='#d9d9d9'/>
  <rect x='24' y='62' width='52' height='20' rx='10' fill='#d9d9d9'/>
</svg>`);
