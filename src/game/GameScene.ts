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
const WALL_BACK_LEFT: Point = { x: 126, y: 124 };
const WALL_BACK_RIGHT: Point = { x: 416, y: 108 };
const WALL_FRONT_LEFT: Point = { x: 38, y: 456 };
const WALL_FRONT_RIGHT: Point = { x: 502, y: 434 };
const WALL_GRID_ROWS = 8;
const WALL_BEAD_BACK = 10;
const WALL_BEAD_FRONT = 18;
const WALL_LANE_SPANS = [3, 3, 4, 3, 4];

// Seat / reserve projection
const SEAT_FRONT_LEFT: Point = { x: 88, y: 564 };
const SEAT_FRONT_RIGHT: Point = { x: 450, y: 546 };
const RESERVE_QUEUE_BASE_LEFT: Point = { x: 72, y: 712 };
const RESERVE_QUEUE_BASE_RIGHT: Point = { x: 468, y: 700 };
const RESERVE_QUEUE_DROP_Y = 70;
const RESERVE_QUEUE_DRIFT_X = 13;

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
  const rowT = (WALL_GRID_ROWS - 1) > 0 ? layer / (WALL_GRID_ROWS - 1) : 0;
  const laneT = totalLanes > 1 ? lane / (totalLanes - 1) : 0;
  const leftEdge = lerpPoint(WALL_BACK_LEFT, WALL_FRONT_LEFT, rowT);
  const rightEdge = lerpPoint(WALL_BACK_RIGHT, WALL_FRONT_RIGHT, rowT);
  const base = lerpPoint(leftEdge, rightEdge, laneT);
  const radius = lerp(WALL_BEAD_BACK, WALL_BEAD_FRONT, rowT);

  return {
    x: base.x,
    y: base.y,
    radius,
    depthScale: lerp(0.72, 1, rowT)
  };
}

function getLaneSpan(lane: number): number {
  return WALL_LANE_SPANS[lane] ?? WALL_LANE_SPANS[WALL_LANE_SPANS.length - 1] ?? 3;
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
    glow.fillEllipse(CENTER_X, 238, 470, 360);

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
    surfaceEdge.lineTo(WALL_BACK_RIGHT.x + 10, WALL_BACK_RIGHT.y + 18);
    surfaceEdge.lineTo(WALL_BACK_LEFT.x + 10, WALL_BACK_LEFT.y + 18);
    surfaceEdge.closePath();
    surfaceEdge.fillPath();

    const rim = this.add.graphics();
    rim.lineStyle(4, 0x8f4b48, 0.9);
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
    battlefield.lineTo(GAME_WIDTH - 26, 646);
    battlefield.lineTo(28, 646);
    battlefield.closePath();
    battlefield.fillPath();

    const lower = this.add.graphics();
    lower.fillGradientStyle(0x1f0f11, 0x1b0d10, 0x15090d, 0x10070b, 1);
    lower.fillRoundedRect(16, 660, GAME_WIDTH - 32, 290, 24);
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
      .text(CENTER_X, 668, "", {
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
   * Draw one wall sphere with radial gradient (canvas 2D) or
   * layered circles (fallback) for a 3D ball look.
   */
  private drawSphere(
    gfx: Phaser.GameObjects.Graphics,
    cell: WallCellView
  ): void {
    const { screenX: cx, screenY: cy, radius: r } = cell;
    const color = cell.state.color;
    const span = getLaneSpan(cell.state.lane);
    const spacingX = r * 1.06;
    const backCount = Math.max(1, span - 1);
    const cluster: Array<{ dx: number; dy: number; scale: number }> = [];

    for (let index = 0; index < backCount; index += 1) {
      const centered = backCount === 1 ? 0 : index - (backCount - 1) / 2;
      cluster.push({
        dx: centered * spacingX + r * 0.44,
        dy: -r * 0.48,
        scale: 0.76
      });
    }

    for (let index = 0; index < span; index += 1) {
      const centered = span === 1 ? 0 : index - (span - 1) / 2;
      cluster.push({
        dx: centered * spacingX,
        dy: r * 0.32,
        scale: 0.94
      });
    }

    // Use raw canvas 2D for radial gradient if available
    const ctx = (gfx as unknown as { context?: CanvasRenderingContext2D })
      .context;

    if (ctx) {
      ctx.save();
      cluster.forEach((bead, index) => {
        const bx = cx + bead.dx;
        const by = cy + bead.dy;
        const br = r * bead.scale;

        const shadowGrad = ctx.createRadialGradient(
          bx,
          by + br * 0.18,
          br * 0.25,
          bx,
          by + br * 0.18,
          br * 1.06
        );
        shadowGrad.addColorStop(0, "rgba(0,0,0,0)");
        shadowGrad.addColorStop(1, "rgba(0,0,0,0.18)");
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.arc(bx, by, br * 1.08, 0, Math.PI * 2);
        ctx.fill();

        const bodyGrad = ctx.createRadialGradient(
          bx - br * 0.32,
          by - br * 0.34,
          0,
          bx,
          by,
          br
        );
        bodyGrad.addColorStop(0, `rgb(${Math.min(255, ((color >> 16) & 0xff) + 92)},${Math.min(255, ((color >> 8) & 0xff) + 92)},${Math.min(255, (color & 0xff) + 92)})`);
        bodyGrad.addColorStop(0.54, `rgb(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff})`);
        bodyGrad.addColorStop(
          1,
          `rgb(${Math.round(((color >> 16) & 0xff) * 0.45)},${Math.round(((color >> 8) & 0xff) * 0.45)},${Math.round((color & 0xff) * 0.45)})`
        );

        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();

        const specGrad = ctx.createRadialGradient(
          bx - br * 0.34,
          by - br * 0.38,
          0,
          bx - br * 0.34,
          by - br * 0.38,
          br * 0.48
        );
        specGrad.addColorStop(0, index === 4 ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.48)");
        specGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = specGrad;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(0,0,0,0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.stroke();
      });

      ctx.restore();
    } else {
      cluster.forEach((bead, index) => {
        const bx = cx + bead.dx;
        const by = cy + bead.dy;
        const br = r * bead.scale;

        gfx.fillStyle(tintBrightness(color, 0.52), 0.3);
        gfx.fillCircle(bx, by + br * 0.12, br * 1.06);
        gfx.fillStyle(tintBrightness(color, 0.68), 1);
        gfx.fillCircle(bx, by, br);
        gfx.fillStyle(tintBrightness(color, 1.05), 1);
        gfx.fillCircle(bx, by, br * 0.88);
        gfx.fillStyle(0xffffff, index === 4 ? 0.48 : 0.34);
        gfx.fillCircle(bx - br * 0.28, by - br * 0.3, br * 0.24);
        gfx.lineStyle(1, 0x000000, 0.2);
        gfx.strokeCircle(bx, by, br);
      });
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
