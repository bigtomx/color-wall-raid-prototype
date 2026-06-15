import Phaser from "phaser";
import { levelOne, type LevelConfig, type UnitSpec } from "./level";
import {
  canReservesDeployAndAttack,
  findBestSeat,
  findColorTarget,
  hasColorTarget,
  type SeatState,
  type WallCellState
} from "./gameLogic";
import {
  buildAdWallVisual,
  getAdReserveSlot,
  getAdSeatPoint,
  type AdClusterProfile
} from "./adBattlefieldLayout";

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
  body: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  attackTimer?: Phaser.Time.TimerEvent;
};

type SeatView = {
  lane: number;
  x: number;
  y: number;
  shadow: Phaser.GameObjects.Ellipse;
  line: Phaser.GameObjects.Ellipse;
  occupied: boolean;
  actor?: UnitActor;
};

type WallCellView = {
  state: WallCellState;
  screenX: number;
  screenY: number;
  radius: number;
  scale: number;
  cluster: AdClusterProfile;
  depthOrder: number;
  hitX: number;
  hitY: number;
};

const GAME_WIDTH = 540;
const GAME_HEIGHT = 960;
const CENTER_X = GAME_WIDTH / 2;
const PURPLE = 0x7340e6;
const GRAY = 0x2d3b49;
const WHITE = 0xf2f4fb;
const RED = 0xe24d4d;
const GREEN = 0xb7eb45;

function tintBrightness(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
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

function getRegionOffset(color: number, lane: number, layer: number): {
  x: number;
  y: number;
} {
  if (color === WHITE) {
    return {
      x: lane <= 2 ? 14 : -14,
      y: layer >= 4 ? 4 : -2
    };
  }

  if (color === RED) {
    return {
      x: lane >= 3 ? -22 : 10,
      y: layer >= 4 ? 6 : 0
    };
  }

  if (color === GRAY) {
    return {
      x: lane <= 1 ? -10 : lane >= 4 ? 10 : 0,
      y: layer >= 4 ? 12 : 6
    };
  }

  if (color === GREEN) {
    return {
      x: lane >= 3 ? 8 : 2,
      y: -6
    };
  }

  if (color === PURPLE) {
    return {
      x: lane <= 1 ? -10 : -2,
      y: -6
    };
  }

  return { x: 0, y: 0 };
}

export class AdBattlefieldScene extends Phaser.Scene {
  private level: LevelConfig = levelOne;
  private seats: SeatView[] = [];
  private laneStates: SeatState[] = [];
  private wallCells: WallCellView[] = [];
  private wallGfx!: Phaser.GameObjects.Graphics;
  private reserveUnits: ReserveUnitView[] = [];
  private bullets!: Phaser.GameObjects.Group;
  private overlay?: Phaser.GameObjects.Container;
  private statusText?: Phaser.GameObjects.Text;
  private resultState: "running" | "win" | "lose" = "running";
  private loseTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super("ad-battlefield");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#0f141c");
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
      seat.shadow.destroy();
      seat.line.destroy();
      seat.actor?.container.destroy();
    });
    this.seats = [];
    this.laneStates = [];

    this.wallGfx?.destroy();
    this.wallCells = [];

    this.reserveUnits.forEach((unit) => unit.container.destroy());
    this.reserveUnits = [];

    this.bullets.clear(true, true);
  }

  private createBackdrop(): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x28303d, 0x1a212d, 0x141922, 0x0c1017, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const halo = this.add.graphics();
    halo.fillGradientStyle(0x384961, 0x2a3445, 0x1b222f, 0x10151d, 0.42);
    halo.fillEllipse(CENTER_X, 300, 520, 600);

    const tray = this.add.graphics();
    tray.fillStyle(0x676e86, 0.22);
    tray.lineStyle(8, 0xd7528f, 0.95);
    tray.beginPath();
    tray.moveTo(94, 136);
    tray.lineTo(356, 92);
    tray.lineTo(544, 524);
    tray.lineTo(4, 576);
    tray.closePath();
    tray.fillPath();
    tray.strokePath();

    const field = this.add.graphics();
    field.fillGradientStyle(0x596173, 0x505766, 0x474f5d, 0x3d4552, 1);
    field.beginPath();
    field.moveTo(110, 142);
    field.lineTo(346, 104);
    field.lineTo(530, 510);
    field.lineTo(18, 560);
    field.closePath();
    field.fillPath();

    const frontShadow = this.add.graphics();
    frontShadow.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.22);
    frontShadow.fillRoundedRect(18, 676, GAME_WIDTH - 36, 250, 28);
  }

  private createFrame(): void {
    this.add
      .text(CENTER_X, 30, "Color Wall Raid", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "24px",
        fontStyle: "700",
        color: "#ffffff"
      })
      .setOrigin(0.5);

    this.add
      .text(CENTER_X, 58, "同色火力持续清掉整片城墙", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "13px",
        color: "#d5d9df"
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(CENTER_X, 690, "", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "14px",
        color: "#f5f7fb"
      })
      .setOrigin(0.5);
  }

  private createWall(): void {
    this.wallGfx = this.add.graphics();
    this.wallCells = [];

    const totalLayers = Math.max(...this.level.wallColumns.map((column) => column.length));

    for (let layer = 0; layer < totalLayers; layer += 1) {
      for (let lane = 0; lane < this.level.lanes; lane += 1) {
        const hp = this.level.wallColumns[lane]?.[layer];
        const color = this.level.wallColors[lane]?.[layer];
        if (hp === undefined || color === undefined) {
          continue;
        }

        const visual = buildAdWallVisual({
          lane,
          layer,
          totalLanes: this.level.lanes,
          totalLayers,
          color,
          hp
        });
        const offset = getRegionOffset(color, lane, layer);
        const screenX = visual.projected.x + offset.x;
        const screenY = visual.projected.y + offset.y;

        this.wallCells.push({
          state: {
            lane,
            layer,
            hp,
            destroyed: false,
            color
          },
          screenX,
          screenY,
          radius: visual.projected.radius,
          scale: visual.projected.scale,
          cluster: visual.cluster,
          depthOrder: visual.depthOrder,
          hitX: screenX,
          hitY: screenY - visual.projected.radius * 0.9
        });
      }
    }

    this.redrawWall();
  }

  private redrawWall(): void {
    this.wallGfx.clear();
    const alive = this.wallCells
      .filter((cell) => !cell.state.destroyed)
      .sort((left, right) => left.depthOrder - right.depthOrder);

    alive.forEach((cell) => this.drawWallCluster(cell));
  }

  private drawWallCluster(cell: WallCellView): void {
    const ctx = (this.wallGfx as unknown as {
      context?: CanvasRenderingContext2D;
    }).context;
    const baseRadius = cell.radius * 0.78 * cell.cluster.scaleBoost;
    const spacingX = baseRadius * cell.cluster.xSpread;
    const spacingY = baseRadius * cell.cluster.ySpread;
    const bottomY = cell.screenY;

    this.wallGfx.fillStyle(0x000000, 0.16);
    this.wallGfx.fillEllipse(
      cell.screenX + baseRadius * 0.35,
      bottomY + baseRadius * 0.42,
      Math.max(baseRadius * 2.4, cell.cluster.columns * spacingX * 0.96),
      baseRadius * 0.9
    );

    for (let row = 0; row < cell.cluster.rows; row += 1) {
      const activeColumns = Math.max(
        1,
        Math.round(cell.cluster.columns - row * cell.cluster.taper)
      );
      const rowWidth = (activeColumns - 1) * spacingX;
      const rowStartX =
        cell.screenX -
        rowWidth / 2 +
        row * baseRadius * cell.cluster.rowSkew;
      const offsetX = row % 2 === 0 ? 0 : spacingX * 0.46;
      const y =
        bottomY -
        row * spacingY -
        row * baseRadius * cell.cluster.depthLift * 0.12;

      for (let col = 0; col < activeColumns; col += 1) {
        const x = rowStartX + col * spacingX + offsetX;
        this.drawBead(ctx, x, y, baseRadius, cell.state.color);
      }
    }
  }

  private drawBead(
    ctx: CanvasRenderingContext2D | undefined,
    x: number,
    y: number,
    radius: number,
    color: number
  ): void {
    if (ctx) {
      const cr = (color >> 16) & 0xff;
      const cg = (color >> 8) & 0xff;
      const cb = color & 0xff;
      const hiR = Math.min(255, cr + 110);
      const hiG = Math.min(255, cg + 110);
      const hiB = Math.min(255, cb + 110);
      const loR = Math.round(cr * 0.38);
      const loG = Math.round(cg * 0.38);
      const loB = Math.round(cb * 0.38);

      const shadow = ctx.createRadialGradient(
        x,
        y + radius * 0.16,
        radius * 0.28,
        x,
        y + radius * 0.16,
        radius * 1.05
      );
      shadow.addColorStop(0, "rgba(0,0,0,0)");
      shadow.addColorStop(1, "rgba(0,0,0,0.16)");
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.08, 0, Math.PI * 2);
      ctx.fill();

      const body = ctx.createRadialGradient(
        x - radius * 0.32,
        y - radius * 0.34,
        0,
        x,
        y,
        radius
      );
      body.addColorStop(0, `rgb(${hiR},${hiG},${hiB})`);
      body.addColorStop(0.58, `rgb(${cr},${cg},${cb})`);
      body.addColorStop(1, `rgb(${loR},${loG},${loB})`);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      const highlight = ctx.createRadialGradient(
        x - radius * 0.36,
        y - radius * 0.38,
        0,
        x - radius * 0.36,
        y - radius * 0.38,
        radius * 0.45
      );
      highlight.addColorStop(0, "rgba(255,255,255,0.48)");
      highlight.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = highlight;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    this.wallGfx.fillStyle(tintBrightness(color, 0.5), 0.3);
    this.wallGfx.fillCircle(x, y + radius * 0.12, radius * 1.06);
    this.wallGfx.fillStyle(color, 1);
    this.wallGfx.fillCircle(x, y, radius);
    this.wallGfx.fillStyle(tintBrightness(color, 1.08), 1);
    this.wallGfx.fillCircle(x, y, radius * 0.82);
    this.wallGfx.fillStyle(0xffffff, 0.32);
    this.wallGfx.fillCircle(x - radius * 0.26, y - radius * 0.28, radius * 0.2);
  }

  private createSeats(): void {
    this.seats = [];
    this.laneStates = [];

    for (let lane = 0; lane < this.level.seatCount; lane += 1) {
      const point = getAdSeatPoint(lane, this.level.seatCount);
      const shadow = this.add.ellipse(point.x, point.y + 8, 54, 14, 0x000000, 0.2);
      const line = this.add.ellipse(point.x, point.y, 46, 12, 0xffffff, 0.04);
      line.setStrokeStyle(2, 0xffffff, 0.18);

      this.seats.push({
        lane,
        x: point.x,
        y: point.y,
        shadow,
        line,
        occupied: false
      });

      const seatColor = this.level.wallColors[lane]?.[0] ?? 0xffffff;
      this.laneStates.push({
        lane,
        occupied: false,
        color: seatColor
      });
    }
  }

  private createReserveUnits(): void {
    const colorOrder = uniqueColors(this.level.reserveUnits, (spec) => spec.tint);
    const queueCounts = new Map<number, number>();

    this.reserveUnits = this.level.reserveUnits.map((spec) => {
      const colorIndex = colorOrder.indexOf(spec.tint);
      const queueIndex = queueCounts.get(spec.tint) ?? 0;
      queueCounts.set(spec.tint, queueIndex + 1);

      const slot = getAdReserveSlot({
        colorIndex,
        queueIndex,
        totalColors: colorOrder.length
      });

      const container = this.add.container(slot.x, slot.y);
      container.setScale(slot.scale);

      const shadow = this.add.ellipse(0, 22, 34, 10, 0x000000, 0.24);
      const body = this.add.circle(0, 4, 18, spec.tint, 1);
      body.setStrokeStyle(2, 0xffffff, 0.22);
      const shine = this.add.circle(-5, -3, 5, 0xffffff, 0.34);
      const footLeft = this.add.rectangle(-8, 24, 7, 8, spec.tint, 1);
      const footRight = this.add.rectangle(8, 24, 7, 8, spec.tint, 1);
      const label = this.add
        .text(0, -22, String(spec.ammo), {
          fontFamily: "Trebuchet MS, Arial, sans-serif",
          fontSize: "13px",
          fontStyle: "700",
          color: "#eef1f6"
        })
        .setOrigin(0.5);

      container.add([shadow, body, shine, footLeft, footRight, label]);
      container.setSize(72, 92);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-36, -24, 72, 92),
        Phaser.Geom.Rectangle.Contains
      );

      const view: ReserveUnitView = { spec, container, body, label };
      container.on("pointerdown", () => this.handleReserveUnitClick(view));
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
        wallColumns: this.level.wallColumns.map((column, lane) =>
          column.filter(
            (_, layer) =>
              !this.wallCells.find(
                (cell) => cell.state.lane === lane && cell.state.layer === layer
              )?.state.destroyed
          )
        ),
        wallColors: this.level.wallColors,
        seatColors: this.laneStates.map((seat) => seat.color)
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
      duration: 100
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
    seat.line.setFillStyle(0xffffff, 0.12);

    const glow = this.add.ellipse(0, 18, 52, 18, 0xffffff, 0.08);
    const body = this.add.circle(0, 0, 21, spec.tint, 1);
    body.setStrokeStyle(2, 0xffffff, 0.28);
    const shine = this.add.circle(-6, -6, 5, 0xffffff, 0.34);
    const footLeft = this.add.rectangle(-9, 24, 7, 8, spec.tint, 1);
    const footRight = this.add.rectangle(9, 24, 7, 8, spec.tint, 1);
    const label = this.add
      .text(0, -24, String(spec.ammo), {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "14px",
        fontStyle: "700",
        color: "#f5f7fb"
      })
      .setOrigin(0.5);

    const container = this.add.container(reserveContainer.x, reserveContainer.y, [
      glow,
      body,
      shine,
      footLeft,
      footRight,
      label
    ]);
    container.setScale(0.92);

    const actor: UnitActor = {
      spec,
      lane: seat.lane,
      state: "deploying",
      ammoLeft: spec.ammo,
      container,
      body,
      glow,
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
      this.wallCells.map((cell) => cell.state),
      actor.spec.tint,
      actor.lane
    );
    if (!target) {
      return;
    }

    const targetView = this.wallCells.find((cell) => cell.state === target);
    if (!targetView) {
      return;
    }

    actor.ammoLeft -= 1;
    actor.label.setText(String(actor.ammoLeft));

    const isLastShot = actor.ammoLeft <= 0;
    if (isLastShot) {
      actor.state = "expiring";
    }

    actor.glow.setFillStyle(0xffffff, 0.22);
    this.tweens.add({
      targets: actor.glow,
      alpha: 0.04,
      duration: 120
    });

    const bullet = this.add.ellipse(seat.x, seat.y - 12, 16, 6, 0xffffff, 0.95);
    bullet.setStrokeStyle(2, actor.spec.tint, 0.8);
    this.bullets.add(bullet);

    this.tweens.add({
      targets: bullet,
      x: targetView.hitX,
      y: targetView.hitY,
      angle: Phaser.Math.RadToDeg(
        Phaser.Math.Angle.Between(seat.x, seat.y, targetView.hitX, targetView.hitY)
      ),
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
    seat.line.setFillStyle(0xffffff, 0.04);
    this.checkEndConditions();
  }

  private updateWallCell(cell: WallCellView): void {
    this.spawnImpactSplash(cell.hitX, cell.hitY, cell.state.color);
    if (!cell.state.destroyed) {
      this.cameras.main.shake(45, 0.0015);
      return;
    }

    this.spawnWallBreak(cell.hitX, cell.hitY, cell.state.color);
    this.redrawWall();
    this.cameras.main.shake(90, 0.0035);
    this.checkEndConditions();
  }

  private spawnImpactSplash(x: number, y: number, tint: number): void {
    for (let i = 0; i < 4; i += 1) {
      const angle = -65 + i * 35 + Phaser.Math.Between(-8, 8);
      const streak = this.add.rectangle(x, y, Phaser.Math.Between(26, 40), 5, 0xffffff, 0.9);
      streak.setRotation(Phaser.Math.DegToRad(angle));
      streak.setOrigin(0.1, 0.5);
      this.tweens.add({
        targets: streak,
        x: x + Phaser.Math.Between(-12, 18),
        y: y + Phaser.Math.Between(-10, 18),
        alpha: 0,
        scaleX: 0.4,
        scaleY: 0.4,
        duration: 160,
        onComplete: () => streak.destroy()
      });
    }

    for (let i = 0; i < 5; i += 1) {
      const debris = this.add.circle(x, y, Phaser.Math.Between(2, 4), tint, 0.85);
      this.tweens.add({
        targets: debris,
        x: x + Phaser.Math.Between(-18, 18),
        y: y + Phaser.Math.Between(-12, 16),
        alpha: 0,
        scale: 0.4,
        duration: 180,
        onComplete: () => debris.destroy()
      });
    }
  }

  private spawnWallBreak(x: number, y: number, tint: number): void {
    for (let i = 0; i < 12; i += 1) {
      const shard = this.add.circle(x, y, Phaser.Math.Between(3, 7), tint, 0.92);
      this.tweens.add({
        targets: shard,
        x: x + Phaser.Math.Between(-32, 32),
        y: y + Phaser.Math.Between(-18, 28),
        alpha: 0,
        scale: 0.2,
        duration: 260,
        onComplete: () => shard.destroy()
      });
    }
  }

  private reflowReserveUnits(): void {
    const colorOrder = uniqueColors(this.level.reserveUnits, (spec) => spec.tint);
    const queueCounts = new Map<number, number>();

    this.reserveUnits.forEach((unit) => {
      const colorIndex = colorOrder.indexOf(unit.spec.tint);
      const queueIndex = queueCounts.get(unit.spec.tint) ?? 0;
      queueCounts.set(unit.spec.tint, queueIndex + 1);
      const slot = getAdReserveSlot({
        colorIndex,
        queueIndex,
        totalColors: colorOrder.length
      });

      this.tweens.add({
        targets: unit.container,
        x: slot.x,
        y: slot.y,
        scale: slot.scale,
        duration: 180,
        ease: "Quad.Out"
      });
    });
  }

  private checkEndConditions(): void {
    const remainingCells = this.wallCells.filter((cell) => !cell.state.destroyed);
    if (remainingCells.length === 0) {
      this.finishLevel("win");
      return;
    }

    const allCellStates = remainingCells.map((cell) => cell.state);
    const canSeatDealDamage = this.seats.some(
      (seat) =>
        seat.actor &&
        seat.actor.state === "attacking" &&
        seat.actor.ammoLeft > 0 &&
        hasColorTarget(allCellStates, seat.actor.spec.tint)
    );

    const reserveColors = this.reserveUnits.map((unit) => unit.spec.tint);
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
        const cells = this.wallCells.filter((cell) => !cell.state.destroyed);
        if (cells.length === 0) {
          this.finishLevel("win");
          return;
        }
        const states = cells.map((cell) => cell.state);
        const seatCan = this.seats.some(
          (seat) =>
            seat.actor &&
            seat.actor.state === "attacking" &&
            seat.actor.ammoLeft > 0 &&
            hasColorTarget(states, seat.actor.spec.tint)
        );
        const rColors = this.reserveUnits.map((unit) => unit.spec.tint);
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
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05080f, 0.62);
    dim.setOrigin(0);
    const panel = this.add.rectangle(CENTER_X, 470, 324, 220, 0x141d28, 0.95);
    panel.setStrokeStyle(2, 0xffffff, 0.16);
    const title = this.add
      .text(CENTER_X, 412, result === "win" ? "整片城墙清空了" : "火力断档了", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "30px",
        fontStyle: "700",
        color: result === "win" ? "#f7ff96" : "#ffd7d7"
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(
        CENTER_X,
        456,
        result === "win" ? "广告版战场已经跑通" : "再铺一波颜色队列试试",
        {
          fontFamily: "Trebuchet MS, Arial, sans-serif",
          fontSize: "18px",
          color: "#d4dbe4"
        }
      )
      .setOrigin(0.5);
    const button = this.add.rectangle(CENTER_X, 530, 198, 58, 0xff5f7b, 1);
    button.setStrokeStyle(2, 0xffffff, 0.22);
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
}

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: "app",
  backgroundColor: "#0f141c",
  scene: [AdBattlefieldScene]
};
