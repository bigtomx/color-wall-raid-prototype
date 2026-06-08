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

/**
 * Global color-based targeting: across all wall cells, find the nearest
 * (largest layer = closest to player) intact cell whose color matches
 * `color`.  Within the same layer the cell closest to `attackerLane`
 * wins; final tie-break is left-to-right lane index.
 */
export function findColorTarget(
  allCells: WallCellState[],
  color: number,
  attackerLane?: number
): WallCellState | undefined {
  let best: WallCellState | undefined;
  for (const cell of allCells) {
    if (cell.destroyed || cell.hp <= 0 || cell.color !== color) {
      continue;
    }
    if (!best) {
      best = cell;
      continue;
    }
    // Prefer front (larger layer = nearer to player)
    if (cell.layer !== best.layer) {
      if (cell.layer > best.layer) {
        best = cell;
      }
      continue;
    }
    // Same layer — prefer closer to attacker horizontally
    if (attackerLane !== undefined) {
      const cellDist = Math.abs(cell.lane - attackerLane);
      const bestDist = Math.abs(best.lane - attackerLane);
      if (cellDist !== bestDist) {
        if (cellDist < bestDist) {
          best = cell;
        }
        continue;
      }
    }
    // Final stable tie-break: leftmost lane
    if (cell.lane < best.lane) {
      best = cell;
    }
  }
  return best;
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

/**
 * Check if at least one non-destroyed wall cell with the given color exists.
 * Used to decide whether a unit of this color has any viable attack target.
 */
export function hasColorTarget(
  allCells: WallCellState[],
  color: number
): boolean {
  return allCells.some(
    (cell) => !cell.destroyed && cell.hp > 0 && cell.color === color
  );
}

/**
 * Check if any remaining reserve unit has a color that matches
 * at least one non-destroyed wall cell. Used to decide whether
 * reserves can still change the outcome.
 */
export function hasReserveWithMatchingColor(
  reserveColors: number[],
  wallCells: WallCellState[]
): boolean {
  const remainingColors = new Set(
    wallCells.filter((c) => !c.destroyed && c.hp > 0).map((c) => c.color)
  );
  return reserveColors.some((color) => remainingColors.has(color));
}

/**
 * Can any remaining reserve actually change the outcome if deployed?
 * Requires BOTH:
 *  1. at least one reserve unit whose color matches a surviving wall cell
 *  2. at least one unoccupied seat for that reserve to deploy into
 */
export function canReservesDeployAndAttack(
  reserveColors: number[],
  wallCells: WallCellState[],
  seats: SeatState[]
): boolean {
  if (!hasReserveWithMatchingColor(reserveColors, wallCells)) {
    return false;
  }
  return seats.some((seat) => !seat.occupied);
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
      matchesUnitColor:
        unitColor === undefined || levelState.seatColors[seat.lane] === unitColor,
      remainingDurability: levelState.wallColumns[seat.lane].reduce(
        (sum, hp) => sum + hp,
        0
      )
    }))
    .filter((seat) => !seat.occupied)
    .sort((left, right) => {
      if (left.matchesUnitColor !== right.matchesUnitColor) {
        return left.matchesUnitColor ? -1 : 1;
      }

      if (right.remainingDurability !== left.remainingDurability) {
        return right.remainingDurability - left.remainingDurability;
      }

      return left.lane - right.lane;
    });

  return rankedSeats[0]?.index ?? null;
}
