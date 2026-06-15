import Phaser from "phaser";
import { gameConfig } from "./game/AdBattlefieldScene";

const style = document.createElement("style");
style.textContent = `
  :root {
    color-scheme: dark;
    font-family: "Trebuchet MS", Arial, sans-serif;
    background:
      radial-gradient(circle at top, #384154 0%, #171b24 44%, #0a0d13 100%);
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    overflow: hidden;
  }

  #app {
    width: min(100vw, 560px);
    height: min(100vh, 960px);
    display: grid;
    place-items: center;
    padding: 12px;
  }

  canvas {
    width: min(100%, 540px) !important;
    height: auto !important;
    max-height: calc(100vh - 24px);
    border-radius: 28px;
    box-shadow:
      0 30px 90px rgba(0, 0, 0, 0.55),
      0 0 0 1px rgba(255, 255, 255, 0.08);
  }
`;
document.head.appendChild(style);

new Phaser.Game(gameConfig);
