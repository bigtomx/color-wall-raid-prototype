import Phaser from "phaser";
import { levelOne, type LevelConfig, type UnitSpec } from "./level";
import {
  findBestSeat,
  findColorTarget,
  hasColorTarget,
  canReservesDeployAndAttack,
  type SeatState,
  type WallCellState
} from "./gameLogic";

// --- View types ----------------------------------------------------------

type ReserveUnitView = {
  spec: UnitSpec;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
};

type UnitActor = {
  spec: UnitSpec;
  lane: number;
  state: "deploying" | "attacking" | "expiring";
  ammoLeft: number;
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

/** Each wall sphere — lives in a board-grid, rendered as a 3D-ish ball. */
type WallCellView = {
  state: WallCellState;
  screenX: number;
  screenY: number;
  radius: number;
};

type Point = {
  x: number;
  y: number;
};

// --- Constants -----------------------------------------------------------

const GAME_WIDTH = 540;
const GAME_HEIGHT = 960;
const CENTER_X = GAME_WIDTH / 2;

// Board projection
const WALL_BACK_LEFT: Point = { x: 205, y: 80 };
const WALL_BACK_RIGHT: Point = { x: 335, y: 68 };
const WALL_FRONT_LEFT: Point = { x: 14, y: 650 };
const WALL_FRONT_RIGHT: Point = { x: 526, y: 634 };
const WALL_GRID_ROWS = 8;
const WALL_BEAD_BACK = 5;
const WALL_BEAD_FRONT = 10;
const WALL_LANE_BALL_SCALE = [1.0, 0.95, 1.1, 0.95, 1.05];

// Seat / reserve projection
const SEAT_FRONT_LEFT: Point = { x: 40, y: 748 };
const SEAT_FRONT_RIGHT: Point = { x: 500, y: 736 };
const RESERVE_QUEUE_BASE_LEFT: Point = { x: 36, y: 894 };
const RESERVE_QUEUE_BASE_RIGHT: Point = { x: 504, y: 880 };
const RESERVE_QUEUE_DROP_Y = 58;
const RESERVE_QUEUE_DRIFT_X = 12;

// --- Helpers -------------------------------------------------------------

function tintBrightness(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function lerpPoint(start: Point, end: Point, t: number): Point {
  return {
    x: lerp(start.x, end.x, t),
    y: lerp(start.y, end.y, t)
  };
}

function projectWall(
  lane: number,
  layer: number,
  totalLanes: number
): { x: number; y: number; radius: number; depthScale: number } {
  const rawT = (WALL_GRID_ROWS - 1) > 0 ? layer / (WALL_GRID_ROWS - 1) : 0;
  const rowT = Math.pow(rawT, 1.3);
  const laneT = totalLanes > 1 ? lane / (totalLanes - 1) : 0;
  const leftEdge = lerpPoint(WALL_BACK_LEFT, WALL_FRONT_LEFT, rowT);
  const rightEdge = lerpPoint(WALL_BACK_RIGHT, WALL_FRONT_RIGHT, rowT);
  const base = lerpPoint(leftEdge, rightEdge, laneT);
  const radius = lerp(WALL_BEAD_BACK, WALL_BEAD_FRONT, rowT);

  return {
    x: base.x,
    y: base.y,
    radius,
    depthScale: lerp(0.62, 1, rowT)
  };
}

function getLaneBallScale(lane: number): number {
  return WALL_LANE_BALL_SCALE[lane] ?? 1;
}

function projectSeat(lane: number, totalSeats: number): Point {
  const laneT = totalSeats > 1 ? lane / (totalSeats - 1) : 0;
  const front = lerpPoint(SEAT_FRONT_LEFT, SEAT_FRONT_RIGHT, laneT);
  return {
    x: front.x,
    y: front.y + Math.sin(laneT * Math.PI) * 10
  };
}

function uniqueColors<T>(items: T[], pickColor: (item: T) => number): number[] {
  const colors: number[] = [];
  items.forEach((item) => {
    const color = pickColor(item);
    if (!colors.includes(color)) {
      colors.push(color);
    }
  });
  return colors;
}

// --- Scene ---------------------------------------------------------------

export class GameScene extends Phaser.Scene {
  private level: LevelConfig = levelOne;
  private seats: SeatView[] = [];
  private wallCells: WallCellView[] = [];
  private wallGfx!: Phaser.GameObjects.Graphics;
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

  // ---- level lifecycle ---------------------------------------------------

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

    this.wallGfx?.destroy();
    this.wallCells = [];

    this.reserveUnits.forEach((unit) => unit.container.destroy());
    this.reserveUnits = [];

    this.bullets.clear(true, true);
  }

  // ---- backdrop ----------------------------------------------------------

  private createBackdrop(): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x4c2724, 0x3b1e1d, 0x291518, 0x1a1014, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const glow = this.add.graphics();
    glow.fillGradientStyle(0x8a4e48, 0x704039, 0x3f2426, 0x261519, 0.3);
    glow.fillEllipse(CENTER_X, 340, 420, 500);

    const wallGround = this.add.graphics();
    wallGround.fillStyle(0x342021, 1);
    wallGround.beginPath();
    wallGround.moveTo(WALL_BACK_LEFT.x, WALL_BACK_LEFT.y);
    wallGround.lineTo(WALL_BACK_RIGHT.x, WALL_BACK_RIGHT.y);
    wallGround.lineTo(WALL_FRONT_RIGHT.x, WALL_FRONT_RIGHT.y);
    wallGround.lineTo(WALL_FRONT_LEFT.x, WALL_FRONT_LEFT.y);
    wallGround.closePath();
    wallGround.fillPath();

    const surfaceEdge = this.add.graphics();
    surfaceEdge.fillStyle(0x53302c, 0.92);
    surfaceEdge.beginPath();
    surfaceEdge.moveTo(WALL_BACK_LEFT.x, WALL_BACK_LEFT.y);
    surfaceEdge.lineTo(WALL_BACK_RIGHT.x, WALL_BACK_RIGHT.y);
    surfaceEdge.lineTo(WALL_BACK_RIGHT.x + 8, WALL_BACK_RIGHT.y + 16);
    surfaceEdge.lineTo(WALL_BACK_LEFT.x + 8, WALL_BACK_LEFT.y + 16);
    surfaceEdge.closePath();
    surfaceEdge.fillPath();

    const leftWall = this.add.graphics();
    leftWall.fillStyle(0x2a1818, 0.85);
    leftWall.beginPath();
    leftWall.moveTo(WALL_BACK_LEFT.x, WALL_BACK_LEFT.y);
    leftWall.lineTo(WALL_FRONT_LEFT.x, WALL_FRONT_LEFT.y);
    leftWall.lineTo(WALL_FRONT_LEFT.x + 8, WALL_FRONT_LEFT.y + 16);
    leftWall.lineTo(WALL_BACK_LEFT.x + 8, WALL_BACK_LEFT.y + 16);
    leftWall.closePath();
    leftWall.fillPath();

    const rightWall = this.add.graphics();
    rightWall.fillStyle(0x2a1818, 0.85);
    rightWall.beginPath();
    rightWall.moveTo(WALL_BACK_RIGHT.x, WALL_BACK_RIGHT.y);
    rightWall.lineTo(WALL_FRONT_RIGHT.x, WALL_FRONT_RIGHT.y);
    rightWall.lineTo(WALL_FRONT_RIGHT.x + 8, WALL_FRONT_RIGHT.y + 16);
    rightWall.lineTo(WALL_BACK_RIGHT.x + 8, WALL_BACK_RIGHT.y + 16);
    rightWall.closePath();
    rightWall.fillPath();

    const rim = this.add.graphics();
    rim.lineStyle(4, 0x8f4b48, 0.95);
    rim.beginPath();
    rim.moveTo(WALL_FRONT_LEFT.x, WALL_FRONT_LEFT.y);
    rim.lineTo(WALL_FRONT_RIGHT.x, WALL_FRONT_RIGHT.y);
    rim.lineTo(WALL_BACK_RIGHT.x, WALL_BACK_RIGHT.y);
    rim.lineTo(WALL_BACK_LEFT.x, WALL_BACK_LEFT.y);
    rim.closePath();
    rim.strokePath();

    const battlefield = this.add.graphics();
    battlefield.fillGradientStyle(0x241315, 0x201214, 0x170d11, 0x12090d, 1);
    battlefield.beginPath();
    battlefield.moveTo(WALL_FRONT_LEFT.x, WALL_FRONT_LEFT.y);
    battlefield.lineTo(WALL_FRONT_RIGHT.x, WALL_FRONT_RIGHT.y);
    battlefield.lineTo(GAME_WIDTH - 8, 820);
    battlefield.lineTo(8, 820);
    battlefield.closePath();
    battlefield.fillPath();

    const lower = this.add.graphics();
    lower.fillGradientStyle(0x1f0f11, 0x1b0d10, 0x15090d, 0x10070b, 1);
    lower.fillRoundedRect(16, 836, GAME_WIDTH - 32, 112, 20);
  }

  // ---- HUD frame ---------------------------------------------------------

  private createFrame(): void {
    this.add
      .text(CENTER_X, 28, "Color Wall Raid", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "28px",
        fontStyle: "700",
        color: "#ffffff"
      })
      .setOrigin(0.5);

    this.add
      .text(CENTER_X, 56, "同色小兵摧毁同色城墙", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "14px",
        color: "#d8c0a8"
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(CENTER_X, 822, "", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "15px",
        color: "#fdf4c8"
      })
      .setOrigin(0.5);
  }

  // ---- wall (sphere grid) ------------------------------------------------

  private createWall(): void {
    this.wallCells = [];
    this.wallGfx = this.add.graphics();

    // Back-to-front so nearer spheres occlude farther ones
    for (let layer = 0; layer < WALL_GRID_ROWS; layer += 1) {
      for (let lane = 0; lane < this.level.lanes; lane += 1) {
        const columnHP = this.level.wallColumns[lane];
        const columnColors = this.level.wallColors[lane];
        if (layer >= columnHP.length) {
          continue;
        }

        const proj = projectWall(lane, layer, this.level.lanes);
        const cell: WallCellView = {
          state: {
            lane,
            layer,
            hp: columnHP[layer],
            destroyed: false,
            color: columnColors[layer]
          },
          screenX: proj.x,
          screenY: proj.y,
          radius: proj.radius
        };
        this.wallCells.push(cell);
        this.drawSphere(this.wallGfx, cell);
      }
    }
  }

  /** Full redraw of every surviving sphere — called after each cell destroy. */
  private redrawWall(): void {
    this.wallGfx.clear();

    // Back-to-front
    for (let layer = 0; layer < WALL_GRID_ROWS; layer += 1) {
      for (let lane = 0; lane < this.level.lanes; lane += 1) {
        const cell = this.wallCells.find(
          (c) => c.state.lane === lane && c.state.layer === layer
        );
        if (cell && !cell.state.destroyed) {
          this.drawSphere(this.wallGfx, cell);
        }
      }
    }
  }

  /**
   * Draw one wall cell as a dense cluster of hex-packed small 3D balls.
   * Each ball has a radial gradient body + specular highlight.
   * Cells are drawn back-to-front so nearer balls occlude farther ones.
   */
  private drawSphere(
    gfx: Phaser.GameObjects.Graphics,
    cell: WallCellView
  ): void {
    const { screenX: cx, screenY: cy, radius: r } = cell;
    const color = cell.state.color;
    const br = r * getLaneBallScale(cell.state.lane);
    const spacing = br * 1.6;
    const rowH = br * 1.4;

    const ctx = (gfx as unknown as { context?: CanvasRenderingContext2D })
      .context;

    const cr = (color >> 16) & 0xff;
    const cg = (color >> 8) & 0xff;
    const cb = color & 0xff;
    const hiR = Math.min(255, cr + 100);
    const hiG = Math.min(255, cg + 100);
    const hiB = Math.min(255, cb + 100);
    const loR = Math.round(cr * 0.42);
    const loG = Math.round(cg * 0.42);
    const loB = Math.round(cb * 0.42);

    if (ctx) {
      ctx.save();
      let row = 0;
      for (let dy = -r; dy <= r + 0.01; dy += rowH) {
        const offsetX = (row % 2) * spacing * 0.5;
        for (let dx = -r - spacing; dx <= r + spacing + 0.01; dx += spacing) {
          const bx = cx + dx + offsetX;
          const by = cy + dy;

          const bodyGrad = ctx.createRadialGradient(
            bx - br * 0.3,
            by - br * 0.3,
            0,
            bx,
            by,
            br
          );
          bodyGrad.addColorStop(0, `rgb(${hiR},${hiG},${hiB})`);
          bodyGrad.addColorStop(0.55, `rgb(${cr},${cg},${cb})`);
          bodyGrad.addColorStop(1, `rgb(${loR},${loG},${loB})`);
          ctx.fillStyle = bodyGrad;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fill();

          const specGrad = ctx.createRadialGradient(
            bx - br * 0.32,
            by - br * 0.35,
            0,
            bx - br * 0.32,
            by - br * 0.35,
            br * 0.45
          );
          specGrad.addColorStop(0, "rgba(255,255,255,0.45)");
          specGrad.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = specGrad;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fill();
        }
        row += 1;
      }
      ctx.restore();
    } else {
      let row = 0;
      for (let dy = -r; dy <= r + 0.01; dy += rowH) {
        const offsetX = (row % 2) * spacing * 0.5;
        for (let dx = -r - spacing; dx <= r + spacing + 0.01; dx += spacing) {
          const bx = cx + dx + offsetX;
          const by = cy + dy;
          gfx.fillStyle(tintBrightness(color, 0.52), 0.4);
          gfx.fillCircle(bx, by + br * 0.1, br * 1.04);
          gfx.fillStyle(color, 1);
          gfx.fillCircle(bx, by, br);
          gfx.fillStyle(tintBrightness(color, 1.08), 1);
          gfx.fillCircle(bx, by, br * 0.82);
          gfx.fillStyle(0xffffff, 0.32);
          gfx.fillCircle(bx - br * 0.26, by - br * 0.28, br * 0.22);
        }
        row += 1;
      }
    }
  }

  // ---- seats -------------------------------------------------------------

  private createSeats(): void {
    this.laneStates = [];
    for (let lane = 0; lane < this.level.seatCount; lane += 1) {
      const seatPoint = projectSeat(lane, this.level.seatCount);
      const pad = this.add.ellipse(seatPoint.x, seatPoint.y + 10, 62, 16, 0x000000, 0.25);
      const ring = this.add.ellipse(seatPoint.x, seatPoint.y, 56, 16, 0xffffff, 0.08);
      ring.setStrokeStyle(2, 0xffffff, 0.2);

      const seatColor = this.level.wallColors[lane]?.[0] ?? 0xffffff;

      this.seats.push({
        lane,
        x: seatPoint.x,
        y: seatPoint.y,
        pad,
        ring,
        occupied: false
      });
      this.laneStates.push({ lane, occupied: false, color: seatColor });
    }
  }

  // ---- reserve units (sphere style) --------------------------------------

  private createReserveUnits(): void {
    const colorOrder = uniqueColors(this.level.reserveUnits, (spec) => spec.tint);
    const queueCounts = new Map<number, number>();
    this.reserveUnits = this.level.reserveUnits.map((spec) => {
      const { x, y } = this.reservePos(spec.tint, queueCounts, colorOrder);
      const container = this.add.container(x, y);

      // Ground shadow ellipse
      const shadow = this.add.ellipse(0, 22, 34, 10, 0x000000, 0.25);
      // Sphere body
      const body = this.add.circle(0, 4, 19, spec.tint, 1);
      body.setStrokeStyle(2, 0xffffff, 0.22);
      // Specular highlight
      const highlight = this.add.circle(-6, -5, 6, 0xffffff, 0.38);
      // Ammo label above
      const label = this.add
        .text(0, -24, String(spec.ammo), {
          fontFamily: "Trebuchet MS, Arial, sans-serif",
          fontSize: "14px",
          fontStyle: "700",
          color: "#f0f2f6"
        })
        .setOrigin(0.5);

      container.add([shadow, body, highlight, label]);
      container.setSize(50, 66);
      container.setInteractive(
        new Phaser.Geom.Circle(0, 4, 26),
        Phaser.Geom.Circle.Contains
      );
      container.on("pointerdown", () => this.handleReserveUnitClick(view));

      const view: ReserveUnitView = { spec, container, body, label };
      return view;
    });
  }

  private reservePos(
    tint: number,
    queueCounts: Map<number, number>,
    colorOrder: number[]
  ): { x: number; y: number } {
    const colorIndex = Math.max(0, colorOrder.indexOf(tint));
    const laneT = colorOrder.length > 1 ? colorIndex / (colorOrder.length - 1) : 0;
    const anchor = lerpPoint(RESERVE_QUEUE_BASE_LEFT, RESERVE_QUEUE_BASE_RIGHT, laneT);
    const queueDepth = queueCounts.get(tint) ?? 0;
    queueCounts.set(tint, queueDepth + 1);

    return {
      x: anchor.x + queueDepth * RESERVE_QUEUE_DRIFT_X,
      y: anchor.y + queueDepth * RESERVE_QUEUE_DROP_Y
    };
  }

  // ---- deploy / attack / dismiss (logic preserved) -----------------------

  private handleReserveUnitClick(unitView: ReserveUnitView): void {
    if (this.resultState !== "running") {
      return;
    }

    const seatIndex = findBestSeat(
      {
        seats: this.laneStates,
        wallColumns: this.level.wallColumns.map((col, lane) =>
          col.filter(
            (_, layer) =>
              !this.wallCells.find(
                (c) => c.state.lane === lane && c.state.layer === layer
              )?.state.destroyed
          )
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
    seat.ring.setFillStyle(0xffffff, 0.22);

    const glow = this.add.circle(0, 16, 26, 0xffffff, 0.1);
    const body = this.add.circle(0, 0, 22, spec.tint, 1);
    body.setStrokeStyle(2, 0xffffff, 0.3);
    const highlight = this.add.circle(-6, -6, 6, 0xffffff, 0.32);
    const label = this.add
      .text(0, -26, String(spec.ammo), {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "16px",
        fontStyle: "700",
        color: "#ffffff"
      })
      .setOrigin(0.5);
    const container = this.add.container(reserveContainer.x, reserveContainer.y, [
      glow,
      body,
      highlight,
      label
    ]);
    container.setScale(0.85);

    const actor: UnitActor = {
      spec,
      lane: seat.lane,
      state: "deploying",
      ammoLeft: spec.ammo,
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

    const target = findColorTarget(
      this.wallCells.map((c) => c.state),
      actor.spec.tint,
      actor.lane
    );
    if (!target) {
      return;
    }

    const targetView = this.wallCells.find((c) => c.state === target);
    if (!targetView) {
      return;
    }

    // Consume one ammo
    actor.ammoLeft -= 1;
    actor.label.setText(String(actor.ammoLeft));

    const isLastShot = actor.ammoLeft <= 0;
    if (isLastShot) {
      actor.state = "expiring";
    }

    actor.glow.setFillStyle(0xffffff, 0.24);
    this.tweens.add({
      targets: actor.glow,
      alpha: 0.06,
      duration: 120
    });

    const targetX = targetView.screenX;
    const targetY = targetView.screenY;

    const bullet = this.add.circle(seat.x, seat.y - 18, 5, 0xffffff, 1);
    bullet.setStrokeStyle(2, actor.spec.tint, 0.9);
    this.bullets.add(bullet);

    this.tweens.add({
      targets: bullet,
      x: targetX,
      y: targetY,
      duration: 170,
      ease: "Quad.Out",
      onComplete: () => {
        bullet.destroy();
        target.hp = Math.max(0, target.hp - actor.spec.damage);
        if (target.hp === 0) {
          target.destroyed = true;
        }
        this.updateWallCell(targetView);
        if (isLastShot) {
          this.dismissActor(seat);
        } else {
          this.checkEndConditions();
        }
      }
    });
  }

  private dismissActor(seat: SeatView): void {
    const actor = seat.actor;
    if (!actor) {
      return;
    }

    actor.attackTimer?.remove(false);
    actor.container.destroy();
    seat.actor = undefined;
    seat.occupied = false;
    this.laneStates[seat.lane].occupied = false;
    seat.ring.setFillStyle(0xffffff, 0.08);
    this.checkEndConditions();
  }

  // ---- wall cell update ---------------------------------------------------

  private updateWallCell(cell: WallCellView): void {
    if (!cell.state.destroyed) {
      return;
    }

    this.spawnBurst(cell.screenX, cell.screenY, cell.state.color);
    this.redrawWall();
    this.checkEndConditions();
  }

  private spawnBurst(x: number, y: number, tint: number): void {
    for (let i = 0; i < 10; i += 1) {
      const r = Phaser.Math.Between(3, 7);
      const particle = this.add.circle(x, y, r, tint, 0.9);
      this.tweens.add({
        targets: particle,
        x: x + Phaser.Math.Between(-30, 30),
        y: y + Phaser.Math.Between(-20, 24),
        alpha: 0,
        scale: 0.3,
        duration: 280,
        onComplete: () => particle.destroy()
      });
    }
  }

  // ---- reserve reflow -----------------------------------------------------

  private reflowReserveUnits(): void {
    const colorOrder = uniqueColors(this.level.reserveUnits, (spec) => spec.tint);
    const queueCounts = new Map<number, number>();
    this.reserveUnits.forEach((unit) => {
      const { x, y } = this.reservePos(unit.spec.tint, queueCounts, colorOrder);
      this.tweens.add({
        targets: unit.container,
        x,
        y,
        duration: 180,
        ease: "Quad.Out"
      });
    });
  }

  // ---- end conditions (identical logic to original) -----------------------

  private checkEndConditions(): void {
    const remainingCells = this.wallCells.filter((c) => !c.state.destroyed);
    if (remainingCells.length === 0) {
      this.finishLevel("win");
      return;
    }

    const allCellStates = remainingCells.map((c) => c.state);

    const canSeatDealDamage = this.seats.some(
      (seat) =>
        seat.actor &&
        seat.actor.state === "attacking" &&
        seat.actor.ammoLeft > 0 &&
        hasColorTarget(allCellStates, seat.actor.spec.tint)
    );

    const reserveColors = this.reserveUnits.map((u) => u.spec.tint);
    const canReserveChange = canReservesDeployAndAttack(
      reserveColors,
      allCellStates,
      this.laneStates
    );

    if (canSeatDealDamage || canReserveChange) {
      if (this.loseTimer) {
        this.loseTimer.remove(false);
        this.loseTimer = undefined;
      }
      return;
    }

    if (!this.loseTimer) {
      this.loseTimer = this.time.delayedCall(1400, () => {
        const cells = this.wallCells.filter((c) => !c.state.destroyed);
        if (cells.length === 0) {
          this.finishLevel("win");
          return;
        }
        const states = cells.map((c) => c.state);
        const seatCan = this.seats.some(
          (s) =>
            s.actor &&
            s.actor.state === "attacking" &&
            s.actor.ammoLeft > 0 &&
            hasColorTarget(states, s.actor.spec.tint)
        );
        const rColors = this.reserveUnits.map((u) => u.spec.tint);
        const reserveCan = canReservesDeployAndAttack(
          rColors,
          states,
          this.laneStates
        );
        if (!seatCan && !reserveCan) {
          this.finishLevel("lose");
        } else {
          this.loseTimer = undefined;
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
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x04070b, 0.64);
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

  // ---- HUD ---------------------------------------------------------------

  private updateHud(): void {
    const occupied = this.seats.filter((seat) => seat.occupied).length;
    const left = this.reserveUnits.length;
    this.statusText?.setText(
      `待命 ${left}  |  战斗席位 ${occupied}/${this.level.seatCount}`
    );
  }
}

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: "app",
  backgroundColor: "#3a2020",
  scene: [GameScene]
};
