import Phaser from "phaser";
import { levelOne, type LevelConfig, type UnitSpec } from "./level";
import {
  applyDamageToLane,
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
  sphere: Phaser.GameObjects.Arc;
  shadow: Phaser.GameObjects.Ellipse;
  hpText: Phaser.GameObjects.Text;
};

const GAME_WIDTH = 540;
const GAME_HEIGHT = 960;
const TOP_MARGIN = 112;
const SEAT_Y = 614;
const LANE_SPACING = 88;
const CENTER_X = GAME_WIDTH / 2;

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
    this.cameras.main.setBackgroundColor("#1f2430");
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
      cell.shadow.destroy();
      cell.sphere.destroy();
      cell.hpText.destroy();
    });
    this.wallByLane = [];

    this.reserveUnits.forEach((unit) => unit.container.destroy());
    this.reserveUnits = [];

    this.bullets.clear(true, true);
  }

  private createBackdrop(): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2b3142, 0x202632, 0x161b25, 0x10141d, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const stage = this.add.graphics();
    stage.fillStyle(0xd14b76, 0.95);
    stage.fillRoundedRect(44, 114, 452, 560, 18);
    stage.fillStyle(0x232c38, 1);
    stage.fillRoundedRect(52, 122, 436, 544, 16);

    const lower = this.add.graphics();
    lower.fillGradientStyle(0x17202a, 0x151c25, 0x0f141b, 0x0c1118, 1);
    lower.fillRoundedRect(32, 680, 476, 226, 28);
  }

  private createFrame(): void {
    this.add
      .text(CENTER_X, 44, "Color Wall Raid", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "34px",
        fontStyle: "700",
        color: "#ffffff"
      })
      .setOrigin(0.5);

    this.add
      .text(CENTER_X, 84, "点击底部小兵，自动补位并持续射击", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "18px",
        color: "#d4dbe5"
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(CENTER_X, 690, "", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "18px",
        color: "#fdf4c8"
      })
      .setOrigin(0.5);
  }

  private createWall(): void {
    this.wallByLane = this.level.wallColumns.map((column, lane) =>
      column.map((hp, layer) => this.createWallCell(lane, layer, hp))
    );
  }

  private createWallCell(lane: number, layer: number, hp: number): WallCellView {
    const laneX = this.getLaneX(lane);
    const y = TOP_MARGIN + layer * 48;
    const scale = Phaser.Math.Linear(1.15, 0.84, layer / 8);
    const tint = this.getLaneTint(lane);

    const shadow = this.add.ellipse(
      laneX + 18,
      y + 10,
      44 * scale,
      15 * scale,
      0x000000,
      0.28
    );
    const sphere = this.add.circle(laneX, y, 22 * scale, tint, 1);
    sphere.setStrokeStyle(3, 0xffffff, 0.25);
    const hpText = this.add
      .text(laneX, y, String(hp), {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: `${Math.max(16, 17 * scale)}px`,
        fontStyle: "700",
        color: "#ffffff"
      })
      .setOrigin(0.5);

    return {
      state: { lane, layer, hp, destroyed: false },
      sphere,
      shadow,
      hpText
    };
  }

  private createSeats(): void {
    this.laneStates = [];
    for (let lane = 0; lane < this.level.seatCount; lane += 1) {
      const x = this.getLaneX(lane);
      const pad = this.add.ellipse(x, SEAT_Y + 12, 74, 22, 0x000000, 0.26);
      const ring = this.add.ellipse(x, SEAT_Y, 68, 22, 0xffffff, 0.14);
      ring.setStrokeStyle(2, 0xffffff, 0.35);

      this.seats.push({
        lane,
        x,
        y: SEAT_Y,
        pad,
        ring,
        occupied: false
      });
      this.laneStates.push({ lane, occupied: false });
    }
  }

  private createReserveUnits(): void {
    this.reserveUnits = this.level.reserveUnits.map((spec, index) => {
      const col = index % 6;
      const row = Math.floor(index / 6);
      const x = 84 + col * 72;
      const y = 762 + row * 94;
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
      container.setSize(56, 72);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-28, -24, 56, 72),
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

    const seatIndex = findBestSeat({
      seats: this.laneStates,
      wallColumns: this.wallByLane.map((cells) =>
        cells.filter((cell) => !cell.state.destroyed).map((cell) => cell.state.hp)
      )
    });

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
    const target = findFrontTarget(laneCells.map((cell) => cell.state));

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

    const bullet = this.add.circle(seat.x, seat.y - 22, 6, 0xffffff, 1);
    bullet.setStrokeStyle(2, actor.spec.tint, 0.95);
    this.bullets.add(bullet);

    this.tweens.add({
      targets: bullet,
      x: targetView.sphere.x,
      y: targetView.sphere.y,
      duration: 170,
      ease: "Quad.Out",
      onComplete: () => {
        bullet.destroy();
        const hit = applyDamageToLane(
          laneCells.map((cell) => cell.state),
          actor.spec.damage
        );
        if (!hit) {
          return;
        }
        const hitView = laneCells.find((cell) => cell.state.layer === hit.layer);
        if (hitView) {
          this.updateWallCell(hitView);
        }
        this.checkEndConditions();
      }
    });
  }

  private updateWallCell(cell: WallCellView): void {
    cell.hpText.setText(String(cell.state.hp));

    if (!cell.state.destroyed) {
      cell.sphere.setFillStyle(0xffffff, 1);
      this.tweens.add({
        targets: cell.sphere,
        scale: 1.08,
        duration: 80,
        yoyo: true,
        onComplete: () => {
          cell.sphere.setFillStyle(this.getLaneTint(cell.state.lane), 1);
        }
      });
      return;
    }

    this.spawnBurst(cell.sphere.x, cell.sphere.y, this.getLaneTint(cell.state.lane));
    this.tweens.add({
      targets: [cell.sphere, cell.shadow, cell.hpText],
      alpha: 0,
      scale: 1.22,
      y: `-=${12}`,
      duration: 180,
      onComplete: () => {
        cell.sphere.destroy();
        cell.shadow.destroy();
        cell.hpText.destroy();
      }
    });
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
      const y = 762 + row * 94;
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
    const remainingCells = this.wallByLane.flat().filter((cell) => !cell.state.destroyed);
    if (remainingCells.length === 0) {
      this.finishLevel("win");
      return;
    }

    if (this.reserveUnits.length > 0) {
      return;
    }

    const hasOpenLane = this.seats.some((seat) => {
      const laneHasWall = this.wallByLane[seat.lane].some((cell) => !cell.state.destroyed);
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
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x04070b, 0.64);
    dim.setOrigin(0);
    const panel = this.add.rectangle(CENTER_X, 470, 320, 220, 0x111722, 0.94);
    panel.setStrokeStyle(2, 0xffffff, 0.18);
    const title = this.add
      .text(CENTER_X, 412, result === "win" ? "整面墙清空了" : "火力断档了", {
        fontFamily: "Trebuchet MS, Arial, sans-serif",
        fontSize: "32px",
        fontStyle: "700",
        color: result === "win" ? "#f3ff95" : "#ffd4d4"
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(
        CENTER_X,
        458,
        result === "win" ? "广告味道的爽感已经跑通" : "再试一次，把兵线铺满五列",
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
    return CENTER_X - ((this.level.lanes - 1) * LANE_SPACING) / 2 + lane * LANE_SPACING;
  }

  private getLaneTint(lane: number): number {
    return [0x8b4dfa, 0xef5555, 0xf3f3f3, 0x334a63, 0xaee641][lane] ?? 0xffffff;
  }
}

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: "app",
  backgroundColor: "#1f2430",
  scene: [GameScene]
};
