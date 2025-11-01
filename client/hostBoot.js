// client/hostBoot.js
import Phaser from "phaser";
import HostScene from "./host.js";

new Phaser.Game({
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: "#ffffff",
  parent: "app",
  scene: [HostScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720
  }
});
