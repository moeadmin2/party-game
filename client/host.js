// client/host.js
import Phaser from "phaser";
import { socketConnect } from "./main.js";

const socket = socketConnect();

// Store Phaser objects for each player id
const actors = new Map(); // id -> { container, circle, initials, picMask, picImage, teamText }

const FRAME = { x: 10, y: 10, w: 1260, h: 700 };
const CIRCLE_R = 48;
const TEAM_FONT = { fontFamily: "system-ui", fontSize: "24px", color: "#ffffff" };
const TEX_ADD_EVENT = "addtexture"; // TextureManager event name

function makeInitials(name) {
  const s = (name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

function ensureActor(scene, p) {
  let a = actors.get(p.id);
  if (!a) {
    const container = scene.add.container(p.x ?? FRAME.x + 100, p.y ?? FRAME.y + 100);

    const circle = scene.add.circle(0, 0, CIRCLE_R, 0xffffff, 1)
      .setStrokeStyle(4, 0x000000);

    const teamText = scene.add.text(0, -CIRCLE_R - 28, p.team || "", TEAM_FONT)
      .setOrigin(0.5, 0.5);

    const initials = scene.add.text(0, 0, makeInitials(p.name), {
      fontFamily: "system-ui",
      fontSize: "24px",
      color: "#111111",
      fontStyle: "bold",
    }).setOrigin(0.5);

    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(0, 0, CIRCLE_R - 4);
    const maskGeom = g.createGeometryMask();

    const picImage = scene.add.image(0, 0, "__ph__")
      .setDisplaySize(CIRCLE_R * 2 - 8, CIRCLE_R * 2 - 8)
      .setMask(maskGeom)
      .setVisible(false);

    container.add([circle, picImage, initials, teamText]);
    a = { container, circle, initials, picMask: maskGeom, picImage, teamText };
    actors.set(p.id, a);
  }
  return a;
}

function applyPhotoTexture(scene, id, base64) {
  const key = `ph-${id}`;
  if (scene.textures.exists(key)) scene.textures.remove(key);

  const onAdd = (addedKey /*, texture */) => {
    if (addedKey !== key) return;
    const a = actors.get(id);
    if (!a) return;
    a.picImage.setTexture(key).setVisible(true);
    a.initials.setVisible(false);
    scene.textures.off(TEX_ADD_EVENT, onAdd);
  };

  scene.textures.on(TEX_ADD_EVENT, onAdd);
  scene.textures.addBase64(key, base64);
}

export default class HostScene extends Phaser.Scene {
  constructor() { super("HostScene"); }

  preload() {
    // tiny placeholder so image has something before real photo arrives
    this.textures.addBase64("__ph__", PH_PLACEHOLDER);
  }

  create() {
    const g = this.add.graphics();
    g.lineStyle(6, 0x111111, 1);
    g.strokeRoundedRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h, 34);

    g.lineStyle(2, 0x666666, 1);
    g.beginPath();
    g.moveTo(FRAME.x + FRAME.w / 2, FRAME.y);
    g.lineTo(FRAME.x + FRAME.w / 2, FRAME.y + FRAME.h);
    g.strokePath();

    // Titles X / O
    this.add.text(250, 90, "X", { fontFamily: "system-ui", fontSize: "40px", color: "#ff8cc6" }).setOrigin(0.5);
    this.add.text(1030, 90, "O", { fontFamily: "system-ui", fontSize: "40px", color: "#45a5ff" }).setOrigin(0.5);

    // Socket wiring
    socket.on("lobby", (list) => {
      list.forEach(p => {
        const a = ensureActor(this, { id: p.id, name: p.name, team: p.team });
        a.teamText.setText(p.team || "");
        if (p.photo) {
          applyPhotoTexture(this, p.id, p.photo);
        } else {
          a.picImage.setVisible(false);
          a.initials.setText(makeInitials(p.name)).setVisible(true);
        }
      });
      const ids = new Set(list.map(p => p.id));
      for (const id of actors.keys()) {
        if (!ids.has(id)) { const a = actors.get(id); a.container.destroy(true); actors.delete(id); }
      }
    });

    socket.on("addtexture", ({ id, data }) => {
      if (!actors.has(id)) ensureActor(this, { id });
      applyPhotoTexture(this, id, data);
    });

    socket.on("teamchange", ({ id, team }) => {
      const a = actors.get(id);
      if (a) a.teamText.setText(team || "");
    });

    socket.on("snapshot", (snap) => {
      if (!snap?.players) return;
      snap.players.forEach(p => {
        const a = ensureActor(this, p);
        a.container.setPosition(p.x, p.y);
        if (p.team) a.teamText.setText(p.team);
      });
    });

    // Optional little pulse on button press
    socket.on("action", (evt) => {
      const a = actors.get(evt.by);
      if (!a) return;
      this.tweens.add({ targets: a.container, scale: 1.08, yoyo: true, duration: 100, ease: "Quad.easeInOut" });
    });
  }
}

const PH_PLACEHOLDER = "data:image/svg+xml;base64," + btoa(
  `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'>
    <rect width='100' height='100' fill='#f2f2f2'/>
    <circle cx='50' cy='42' r='18' fill='#d9d9d9'/>
    <rect x='24' y='62' width='52' height='20' rx='10' fill='#d9d9d9'/>
  </svg>`
);
