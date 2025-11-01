import Phaser from "phaser";
import { socketConnect } from "./main.js";

// Socket + minimal lobby mirror so host can render who joined.
// You’ll extend this later with snapshots / items, etc.
const socket = socketConnect();
let players = [];

socket.on("lobby", (list) => {
  players = list || [];
});

class HostScene extends Phaser.Scene {
  create() {
    this.cameras.main.setBackgroundColor("#101015");

    // One persistent Graphics layer
    this.g = this.add.graphics();
    this.labelPool = [];

    // Redraw at ~15Hz (lighter than 60fps for static-ish lobby)
    this.time.addEvent({ delay: 66, loop: true, callback: () => this.draw() });
  }

  draw() {
    const g = this.g;
    g.clear();

    // Arena border
    g.lineStyle(2, 0x444444);
    g.strokeRect(10, 10, 1260, 700);

    // Reuse pooled labels (avoid text buildup each tick)
    for (const t of this.labelPool) t.setVisible(false);

    let labelIdx = 0;

    for (const p of players) {
      // Just fake a position from socket id for now
      const x = 120 + (p.id.charCodeAt(0) % 10) * 110;
      const y = 120 + (p.id.charCodeAt(1) % 7) * 90;
      const tint = parseInt((p.tint || "#66ccff").replace("#", "0x"), 16);

      // Body circle + outline
      g.fillStyle(0xffffff);
      g.fillCircle(x, y, 16);
      g.lineStyle(2, tint);
      g.strokeCircle(x, y, 16);

      // Facing triangle
      g.fillStyle(tint);
      g.fillTriangle(x, y - 16, x - 6, y - 4, x + 6, y - 4);

      // Name label (pooled)
      let label = this.labelPool[labelIdx];
      if (!label) {
        label = this.add.text(0, 0, "", {
          fontFamily: "system-ui",
          fontSize: "12px",
          color: "#fff",
        });
        this.labelPool.push(label);
      }
      label.setPosition(x + 20, y - 6);
      label.setText((p.name || "anon").slice(0, 16));
      label.setVisible(true);
      labelIdx++;
    }
  }
}

new Phaser.Game({
  type: Phaser.CANVAS,
  parent: document.body,
  width: 1280,
  height: 720,
  backgroundColor: "#101015",
  physics: { default: "arcade", arcade: { debug: false } },
  scene: [HostScene],
});
