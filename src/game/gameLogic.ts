export type SeatState = {
  lane: number;
  occupied: boolean;
  color: number;
};

export type WallCellState = {
  lane: number;
  layer: number;
  hp: number;
  destroyed: boolean;
  color: number;
};

export type LevelState = {
  seats: SeatState[];
  wallColumns: number[][];
  wallColors: number[][];
  seatColors: number[];
};

export function getLaneRemainingDurability(cells: WallCellState[]): number {
  return cells.reduce((sum, cell) => {
    if (cell.destroyed) {
      return sum;
    }

    return sum + Math.max(cell.hp, 0);
  }, 0);
}

export function findFrontTarget(
  cells: WallCellState[],
  color?: number
): WallCellState | undefined {
  return [...cells]
    .filter(
      (cell) =>
        !cell.destroyed &&
        cell.hp > 0 &&
        (color === undefined || cell.color === color)
    )
    .sort((left, right) => left.layer - right.layer)[0];
}

export function applyDamageToLane(
  cells: WallCellState[],
  damage: number,
  color?: number
): WallCellState | undefined {
  const target = findFrontTarget(cells, color);

  if (!target) {
    return undefined;
  }

  target.hp = Math.max(0, target.hp - damage);
  if (target.hp === 0) {
    target.destroyed = true;
  }

  return target;
}

export function findBestSeat(
  levelState: LevelState,
  unitColor?: number
): number | null {
  const rankedSeats = levelState.seats
    .map((seat, index) => ({
      index,
      lane: seat.lane,
      occupied: seat.occupied,
      seatColor: levelState.seatColors[seat.lane],
      remainingDurability: levelState.wallColumns[seat.lane].reduce(
        (sum, hp) => sum + hp,
        0
      )
    }))
    .filter((seat) => {
      if (seat.occupied) {
        return false;
      }
      if (unitColor !== undefined && seat.seatColor !== unitColor) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      if (right.remainingDurability !== left.remainingDurability) {
        return right.remainingDurability - left.remainingDurability;
      }

      return left.lane - right.lane;
    });

  return rankedSeats[0]?.index ?? null;
}
