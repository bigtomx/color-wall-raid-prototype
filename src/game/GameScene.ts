import Phaser from "phaser";
import { levelOne, type LevelConfig, type UnitSpec } from "./level";
import {
  findBestSeat,
  findFrontTarget,
  type SeatState,
  type WallCellState
} from "./gameLogic";

type ReserveUnitView = {
  spec: UnitSpec;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
};

type UnitActor = {
  spec: UnitSpec;
  lane: number;
  state: "deploying" | "attacking";
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Arc;
  body: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  attackTimer?: Phaser.Time.TimerEvent;
};

type SeatView = {
  lane: number;
  x: number;
  y: number;
  pad: Phaser.GameObjects.Ellipse;
  ring: Phaser.GameObjects.Ellipse;
  occupied: boolean;
  actor?: UnitActor;
};

type WallCellView = {
  state: WallCellState;
  gfx: Phaser.GameObjects.Graphics;
  hpText: Phaser.GameObjects.Text;
};

const GAME_WIDTH = 540;
const GAME_HEIGHT = 960;
const WALL_TOP_Y = 160;
const WALL_CELL_H = 50;
const WALL_BOX_W = 52;
const WALL_BOX_D = 22;
const SEAT_Y = 730;
const LANE_SPACING = 96;
const CENTER_X = GAME_WIDTH / 2;

function tintBrightness(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

export class GameScene extends Phaser.Scene {
  private level: LevelConfig = levelOne;
  private seats: SeatView[] = [];
  private wallByLane: WallCellView[][] = [];
  private reserveUnits: ReserveUnitView[] = [];
  private laneStates: SeatState[] = [];
  private bullets!: Phaser.GameObjects.Group;
  private overlay?: Phaser.GameObjects.Container;
  private statusText?: Phaser.GameObjects.Text;
  private resultState: "running" | "win" | "lose" = "running";
  private loseTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super("game");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#3a2020");
    this.createBackdrop();
    this.bullets = this.add.group();
    this.createFrame();
    this.startLevel();
  }

  private startLevel(): void {
    this.resultState = "running";
    this.loseTimer?.remove(false);
    this.overlay?.destroy();
    this.clearGameplayObjects();
    this.createWall();
    this.createSeats();
    this.createReserveUnits();
    this.updateHud();
  }

  private clearGameplayObjects(): void {
    this.seats.forEach((seat) => {
      seat.actor?.attackTimer?.remove(false);
      seat.pad.destroy();
      seat.ring.destroy();
      seat.actor?.container.destroy();
    });
    this.seats = [];

    this.wallByLane.flat().forEach((cell) => {
      cell.gfx.destroy();
      cell.hpText.destroy();
    });
    this.wallByLane = [];

    this.reserveUnits.forEach((unit) => unit.container.destroy());
    this.reserveUnits = [];

    this.bullets.clear(true, true);
  }

  private createBackdrop(): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x6b3030, 0x552828, 0x402020, 0x381818, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const ground = this.add.graphics();
    ground.fillStyle(0x8b4040, 1);
    ground.beginPath();
    ground.moveTo(30, 120);
    ground.lineTo(GAME_WIDTH - 30, 120);
    ground.lineTo(GAME_WIDTH - 10, 770);
    ground.lineTo(10, 770);
    ground.closePath();
    ground.fillPath();

    const surface = this.add.graphics();
    surface.fillStyle(0x7a3838, 1);
    surface.beginPath();
    surface.moveTo(30, 120);
    surface.lineTo(GAME_WIDTH - 30, 120);
    surface.lineTo(GAME_WIDTH - 50, 145);
    surface.lineTo(50, 145);
    surface.closePath();
    surface.fillPath();

    const lower = this.add.graphics();
    lower.fillGradientStyle(0x2a1818, 0x241515, 0x1e1212, 0x181010, 1);
    lower.fillRoundedRect(16, 780, GAME_WIDTH - 32, 170, 24);
  }

  private createFrame(): void {
    this.add
      .text(CENTER_X, 36, "Color Wall Raid", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "30px",
        fontStyle: "700",
        color: "#ffffff"
      })
      .setOrigin(0.5);

    this.add
      .text(CENTER_X, 70, "同色小兵摧毁同色城墙", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "16px",
        color: "#e0c8b0"
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(CENTER_X, 790, "", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "16px",
        color: "#fdf4c8"
      })
      .setOrigin(0.5);
  }

  private createWall(): void {
    this.wallByLane = this.level.wallColumns.map((column, lane) =>
      column.map((hp, layer) =>
        this.createWallCell(lane, layer, hp, this.level.wallColors[lane][layer])
      )
    );
  }

  private createWallCell(
    lane: number,
    layer: number,
    hp: number,
    color: number
  ): WallCellView {
    const laneX = this.getLaneX(lane);
    const y = WALL_TOP_Y + layer * WALL_CELL_H;
    const w = WALL_BOX_W;
    const d = WALL_BOX_D;
    const h = WALL_CELL_H - 6;

    const gfx = this.add.graphics();
    this.drawIsoBox(gfx, laneX, y, w, h, d, color);

    const hpText = this.add
      .text(laneX, y + h * 0.45, String(hp), {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "16px",
        fontStyle: "700",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2
      })
      .setOrigin(0.5);

    return {
      state: { lane, layer, hp, destroyed: false, color },
      gfx,
      hpText
    };
  }

  private drawIsoBox(
    gfx: Phaser.GameObjects.Graphics,
    cx: number,
    topY: number,
    w: number,
    h: number,
    d: number,
    color: number
  ): void {
    const left = cx - w / 2;
    const right = cx + w / 2;

    const topColor = tintBrightness(color, 1.2);
    const frontColor = tintBrightness(color, 0.88);
    const rightColor = tintBrightness(color, 0.55);

    // Top face (brightest — light from above)
    gfx.fillStyle(topColor, 1);
    gfx.beginPath();
    gfx.moveTo(left, topY);
    gfx.lineTo(right, topY);
    gfx.lineTo(right + d, topY + d);
    gfx.lineTo(left + d, topY + d);
    gfx.closePath();
    gfx.fillPath();

    // Front face
    gfx.fillStyle(frontColor, 1);
    gfx.beginPath();
    gfx.moveTo(left, topY);
    gfx.lineTo(left + d, topY + d);
    gfx.lineTo(left + d, topY + d + h);
    gfx.lineTo(left, topY + h);
    gfx.closePath();
    gfx.fillPath();

    // Right face (darkest)
    gfx.fillStyle(rightColor, 1);
    gfx.beginPath();
    gfx.moveTo(right, topY);
    gfx.lineTo(right + d, topY + d);
    gfx.lineTo(right + d, topY + d + h);
    gfx.lineTo(right, topY + h);
    gfx.closePath();
    gfx.fillPath();

    // Top edge highlight
    gfx.lineStyle(1, 0xffffff, 0.35);
    gfx.beginPath();
    gfx.moveTo(left, topY);
    gfx.lineTo(right, topY);
    gfx.strokePath();

    // Outline
    gfx.lineStyle(1, 0x000000, 0.2);
    gfx.beginPath();
    gfx.moveTo(left, topY);
    gfx.lineTo(right, topY);
    gfx.lineTo(right + d, topY + d);
    gfx.lineTo(left + d, topY + d);
    gfx.closePath();
    gfx.strokePath();

    gfx.beginPath();
    gfx.moveTo(left, topY);
    gfx.lineTo(left, topY + h);
    gfx.lineTo(left + d, topY + d + h);
    gfx.moveTo(right, topY);
    gfx.lineTo(right, topY + h);
    gfx.lineTo(right + d, topY + d + h);
    gfx.strokePath();
  }

  private createSeats(): void {
    this.laneStates = [];
    for (let lane = 0; lane < this.level.seatCount; lane += 1) {
      const x = this.getLaneX(lane);
      const pad = this.add.ellipse(x, SEAT_Y + 10, 70, 20, 0x000000, 0.3);
      const ring = this.add.ellipse(x, SEAT_Y, 64, 20, 0xffffff, 0.12);
      ring.setStrokeStyle(2, 0xffffff, 0.3);

      const seatColor = this.level.wallColors[lane]?.[0] ?? 0xffffff;

      this.seats.push({
        lane,
        x,
        y: SEAT_Y,
        pad,
        ring,
        occupied: false
      });
      this.laneStates.push({ lane, occupied: false, color: seatColor });
    }
  }

  private createReserveUnits(): void {
    this.reserveUnits = this.level.reserveUnits.map((spec, index) => {
      const col = index % 6;
      const row = Math.floor(index / 6);
      const x = 84 + col * 72;
      const y = 840 + row * 80;
      const container = this.add.container(x, y);
      const glow = this.add.circle(0, 34, 26, 0xffffff, 0.16);
      const body = this.add.circle(0, 12, 22, spec.tint, 1);
      body.setStrokeStyle(3, 0xffffff, 0.3);
      const label = this.add
        .text(0, -18, String(spec.label), {
          fontFamily: "Trebuchet MS, Arial, sans-serif",
          fontSize: "16px",
          fontStyle: "700",
          color: "#f5f7fb"
        })
        .setOrigin(0.5);

      const legLeft = this.add.rectangle(-10, 42, 9, 12, spec.tint, 1);
      const legRight = this.add.rectangle(10, 42, 9, 12, spec.tint, 1);
      container.add([glow, body, label, legLeft, legRight]);
      container.setSize(68, 88);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-34, -32, 68, 88),
        Phaser.Geom.Rectangle.Contains
      );
      container.on("pointerdown", () => this.handleReserveUnitClick(view));

      const view: ReserveUnitView = { spec, container, body, label };
      return view;
    });
  }

  private handleReserveUnitClick(unitView: ReserveUnitView): void {
    if (this.resultState !== "running") {
      return;
    }

    const seatIndex = findBestSeat(
      {
        seats: this.laneStates,
        wallColumns: this.wallByLane.map((cells) =>
          cells.filter((cell) => !cell.state.destroyed).map((cell) => cell.state.hp)
        ),
        wallColors: this.level.wallColors,
        seatColors: this.laneStates.map((s) => s.color)
      },
      unitView.spec.tint
    );

    this.pulseReserveUnit(unitView);
    if (seatIndex === null) {
      this.tweens.add({
        targets: unitView.container,
        x: unitView.container.x + 10,
        yoyo: true,
        duration: 70,
        repeat: 1
      });
      return;
    }

    this.reserveUnits = this.reserveUnits.filter((item) => item !== unitView);
    unitView.container.disableInteractive();
    this.deployUnitToSeat(unitView.spec, seatIndex, unitView.container);
    this.reflowReserveUnits();
    this.updateHud();
  }

  private pulseReserveUnit(unitView: ReserveUnitView): void {
    this.tweens.add({
      targets: [unitView.body, unitView.label],
      scale: 1.08,
      alpha: 0.9,
      yoyo: true,
      duration: 90
    });
  }

  private deployUnitToSeat(
    spec: UnitSpec,
    seatIndex: number,
    reserveContainer: Phaser.GameObjects.Container
  ): void {
    const seat = this.seats[seatIndex];
    seat.occupied = true;
    this.laneStates[seatIndex].occupied = true;
    seat.ring.setFillStyle(0xffffff, 0.24);

    const glow = this.add.circle(0, 22, 28, 0xffffff, 0.12);
    const body = this.add.circle(0, 0, 24, spec.tint, 1);
    body.setStrokeStyle(3, 0xffffff, 0.35);
    const label = this.add
      .text(0, -28, String(spec.label), {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "17px",
        fontStyle: "700",
        color: "#ffffff"
      })
      .setOrigin(0.5);
    const container = this.add.container(
      reserveContainer.x,
      reserveContainer.y,
      [glow, body, label]
    );
    container.setScale(0.85);

    const actor: UnitActor = {
      spec,
      lane: seat.lane,
      state: "deploying",
      container,
      glow,
      body,
      label
    };
    seat.actor = actor;

    reserveContainer.destroy();

    this.tweens.add({
      targets: container,
      x: seat.x,
      y: seat.y,
      scale: 1,
      ease: "Back.Out",
      duration: spec.deployDuration,
      onComplete: () => {
        actor.state = "attacking";
        this.beginAttacking(seat);
      }
    });
  }

  private beginAttacking(seat: SeatView): void {
    const actor = seat.actor;
    if (!actor) {
      return;
    }

    this.fireBullet(seat);
    actor.attackTimer = this.time.addEvent({
      delay: actor.spec.attackInterval,
      loop: true,
      callback: () => this.fireBullet(seat)
    });
  }

  private fireBullet(seat: SeatView): void {
    if (this.resultState !== "running") {
      return;
    }

    const actor = seat.actor;
    if (!actor || actor.state !== "attacking") {
      return;
    }

    const laneCells = this.wallByLane[seat.lane];
    const target = findFrontTarget(
      laneCells.map((cell) => cell.state),
      actor.spec.tint
    );

    if (!target) {
      actor.attackTimer?.remove(false);
      return;
    }

    const targetView = laneCells.find((cell) => cell.state.layer === target.layer);
    if (!targetView) {
      return;
    }

    actor.glow.setFillStyle(0xffffff, 0.24);
    this.tweens.add({
      targets: actor.glow,
      alpha: 0.06,
      duration: 120
    });

    const targetX = targetView.hpText.x;
    const targetY = targetView.hpText.y;

    const bullet = this.add.circle(seat.x, seat.y - 22, 6, 0xffffff, 1);
    bullet.setStrokeStyle(2, actor.spec.tint, 0.95);
    this.bullets.add(bullet);

    this.tweens.add({
      targets: bullet,
      x: targetX,
      y: targetY,
      duration: 170,
      ease: "Quad.Out",
      onComplete: () => {
        bullet.destroy();
        // Apply damage directly to the targeted cell (already resolved at fire time)
        // to avoid race conditions where another bullet changes state mid-flight.
        target.hp = Math.max(0, target.hp - actor.spec.damage);
        if (target.hp === 0) {
          target.destroyed = true;
        }
        this.updateWallCell(targetView);
        this.checkEndConditions();
      }
    });
  }

  private updateWallCell(cell: WallCellView): void {
    cell.hpText.setText(String(cell.state.hp));

    if (!cell.state.destroyed) {
      // Kill any running tween on this text to avoid stacking
      this.tweens.killTweensOf(cell.hpText);
      cell.hpText.setScale(1);
      this.tweens.add({
        targets: cell.hpText,
        scale: 1.2,
        duration: 60,
        yoyo: true
      });
      return;
    }

    const cx = cell.hpText.x;
    const cy = cell.hpText.y;
    this.spawnBurst(cx, cy, cell.state.color);

    // Immediately hide to avoid alpha-tween flickering the entire column
    cell.gfx.setVisible(false);
    cell.hpText.setVisible(false);
    cell.gfx.destroy();
    cell.hpText.destroy();
  }

  private spawnBurst(x: number, y: number, tint: number): void {
    for (let i = 0; i < 8; i += 1) {
      const particle = this.add.circle(x, y, Phaser.Math.Between(3, 6), tint, 0.95);
      this.tweens.add({
        targets: particle,
        x: x + Phaser.Math.Between(-28, 28),
        y: y + Phaser.Math.Between(-18, 22),
        alpha: 0,
        scale: 0.4,
        duration: 260,
        onComplete: () => particle.destroy()
      });
    }
  }

  private reflowReserveUnits(): void {
    this.reserveUnits.forEach((unit, index) => {
      const col = index % 6;
      const row = Math.floor(index / 6);
      const x = 84 + col * 72;
      const y = 840 + row * 80;
      this.tweens.add({
        targets: unit.container,
        x,
        y,
        duration: 180,
        ease: "Quad.Out"
      });
    });
  }

  private checkEndConditions(): void {
    const remainingCells = this.wallByLane
      .flat()
      .filter((cell) => !cell.state.destroyed);
    if (remainingCells.length === 0) {
      this.finishLevel("win");
      return;
    }

    if (this.reserveUnits.length > 0) {
      return;
    }

    const hasOpenLane = this.seats.some((seat) => {
      const laneHasWall = this.wallByLane[seat.lane].some(
        (cell) => !cell.state.destroyed
      );
      return laneHasWall && !seat.occupied;
    });

    if (hasOpenLane && !this.loseTimer) {
      this.loseTimer = this.time.delayedCall(1400, () => {
        const stillOpenLane = this.seats.some((seat) => {
          const laneHasWall = this.wallByLane[seat.lane].some(
            (cell) => !cell.state.destroyed
          );
          return laneHasWall && !seat.occupied;
        });
        if (stillOpenLane) {
          this.finishLevel("lose");
        }
      });
    }
  }

  private finishLevel(result: "win" | "lose"): void {
    if (this.resultState !== "running") {
      return;
    }

    this.resultState = result;
    this.seats.forEach((seat) => seat.actor?.attackTimer?.remove(false));
    this.bullets.clear(true, true);
    this.showOverlay(result);
  }

  private showOverlay(result: "win" | "lose"): void {
    const container = this.add.container(0, 0);
    const dim = this.add.rectangle(
      0,
      0,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x04070b,
      0.64
    );
    dim.setOrigin(0);
    const panel = this.add.rectangle(CENTER_X, 470, 320, 220, 0x111722, 0.94);
    panel.setStrokeStyle(2, 0xffffff, 0.18);
    const title = this.add
      .text(
        CENTER_X,
        412,
        result === "win" ? "整面墙清空了" : "火力断档了",
        {
          fontFamily: "Trebuchet MS, Arial, sans-serif",
          fontSize: "32px",
          fontStyle: "700",
          color: result === "win" ? "#f3ff95" : "#ffd4d4"
        }
      )
      .setOrigin(0.5);
    const sub = this.add
      .text(
        CENTER_X,
        458,
        result === "win"
          ? "广告味道的爽感已经跑通"
          : "再试一次，把兵线铺满五列",
        {
          fontFamily: "Trebuchet MS, Arial, sans-serif",
          fontSize: "18px",
          color: "#d8e0ea",
          align: "center"
        }
      )
      .setOrigin(0.5);
    const button = this.add.rectangle(CENTER_X, 530, 198, 58, 0xff5f7b, 1);
    button.setStrokeStyle(2, 0xffffff, 0.26);
    const buttonText = this.add
      .text(CENTER_X, 530, "重新开始", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "24px",
        fontStyle: "700",
        color: "#ffffff"
      })
      .setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });
    button.on("pointerdown", () => this.startLevel());

    container.add([dim, panel, title, sub, button, buttonText]);
    this.overlay = container;
  }

  private updateHud(): void {
    const occupied = this.seats.filter((seat) => seat.occupied).length;
    const left = this.reserveUnits.length;
    this.statusText?.setText(
      `待命 ${left}  |  战斗席位 ${occupied}/${this.level.seatCount}`
    );
  }

  private getLaneX(lane: number): number {
    return (
      CENTER_X -
      ((this.level.lanes - 1) * LANE_SPACING) / 2 +
      lane * LANE_SPACING
    );
  }
}

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: "app",
  backgroundColor: "#3a2020",
  scene: [GameScene]
};
