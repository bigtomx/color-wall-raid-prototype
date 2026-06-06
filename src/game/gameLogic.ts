export type SeatState = {
  lane: number;
  occupied: boolean;
};

export type WallCellState = {
  lane: number;
  layer: number;
  hp: number;
  destroyed: boolean;
};

export type LevelState = {
  seats: SeatState[];
  wallColumns: number[][];
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
  cells: WallCellState[]
): WallCellState | undefined {
  return [...cells]
    .filter((cell) => !cell.destroyed && cell.hp > 0)
    .sort((left, right) => left.layer - right.layer)[0];
}

export function applyDamageToLane(
  cells: WallCellState[],
  damage: number
): WallCellState | undefined {
  const target = findFrontTarget(cells);

  if (!target) {
    return undefined;
  }

  target.hp = Math.max(0, target.hp - damage);
  if (target.hp === 0) {
    target.destroyed = true;
  }

  return target;
}

export function findBestSeat(levelState: LevelState): number | null {
  const rankedSeats = levelState.seats
    .map((seat, index) => ({
      index,
      lane: seat.lane,
      occupied: seat.occupied,
      remainingDurability: levelState.wallColumns[seat.lane].reduce(
        (sum, hp) => sum + hp,
        0
      )
    }))
    .filter((seat) => !seat.occupied)
    .sort((left, right) => {
      if (right.remainingDurability !== left.remainingDurability) {
        return right.remainingDurability - left.remainingDurability;
      }

      return left.lane - right.lane;
    });

  return rankedSeats[0]?.index ?? null;
}
