export type Point = {
  x: number;
  y: number;
};

export type AdWallProjectionInput = {
  lane: number;
  layer: number;
  totalLanes: number;
  totalLayers: number;
};

export type AdClusterProfileInput = {
  color: number;
  lane: number;
  layer: number;
};

export type AdReserveSlotInput = {
  colorIndex: number;
  queueIndex: number;
  totalColors: number;
};

export type AdClusterProfile = {
  columns: number;
  rows: number;
  xSpread: number;
  ySpread: number;
  scaleBoost: number;
  depthLift: number;
  rowSkew: number;
  taper: number;
};

const BOARD_BACK_LEFT: Point = { x: 188, y: 144 };
const BOARD_BACK_RIGHT: Point = { x: 340, y: 114 };
const BOARD_FRONT_LEFT: Point = { x: -6, y: 588 };
const BOARD_FRONT_RIGHT: Point = { x: 548, y: 528 };
const SEAT_LEFT: Point = { x: 92, y: 632 };
const SEAT_RIGHT: Point = { x: 444, y: 612 };
const RESERVE_LEFT: Point = { x: 70, y: 786 };
const RESERVE_RIGHT: Point = { x: 446, y: 758 };

const PURPLE = 0x7340e6;
const GRAY = 0x2d3b49;
const WHITE = 0xf2f4fb;
const RED = 0xe24d4d;
const GREEN = 0xb7eb45;

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function lerpPoint(start: Point, end: Point, t: number): Point {
  return {
    x: lerp(start.x, end.x, t),
    y: lerp(start.y, end.y, t)
  };
}

export function projectAdWallCell(input: AdWallProjectionInput): {
  x: number;
  y: number;
  scale: number;
  radius: number;
  laneT: number;
  rowT: number;
} {
  const rowT =
    input.totalLayers > 1
      ? Math.pow(input.layer / (input.totalLayers - 1), 1.32)
      : 0;
  const laneT = input.totalLanes > 1 ? input.lane / (input.totalLanes - 1) : 0;

  const leftEdge = lerpPoint(BOARD_BACK_LEFT, BOARD_FRONT_LEFT, rowT);
  const rightEdge = lerpPoint(BOARD_BACK_RIGHT, BOARD_FRONT_RIGHT, rowT);
  const point = lerpPoint(leftEdge, rightEdge, laneT);

  return {
    x: point.x,
    y: point.y,
    scale: lerp(0.58, 1.34, rowT),
    radius: lerp(9, 27, rowT),
    laneT,
    rowT
  };
}

export function getAdClusterProfile(
  input: AdClusterProfileInput
): AdClusterProfile {
  if (input.color === WHITE) {
    return {
      columns: 7,
      rows: 10,
      xSpread: 0.76,
      ySpread: 0.68,
      scaleBoost: 1.1,
      depthLift: 0.22,
      rowSkew: 0.16,
      taper: 0.34
    };
  }

  if (input.color === RED) {
    return {
      columns: 2,
      rows: 9,
      xSpread: 0.72,
      ySpread: 0.66,
      scaleBoost: 1.06,
      depthLift: 0.18,
      rowSkew: 0.12,
      taper: 0.16
    };
  }

  if (input.color === GRAY) {
    return {
      columns: 4,
      rows: 9,
      xSpread: 0.74,
      ySpread: 0.64,
      scaleBoost: input.layer >= 5 ? 1.22 : 1.1,
      depthLift: input.layer >= 5 ? 0.28 : 0.14,
      rowSkew: 0.14,
      taper: 0.2
    };
  }

  if (input.color === GREEN) {
    return {
      columns: 4,
      rows: 10,
      xSpread: 0.74,
      ySpread: 0.66,
      scaleBoost: 1.02,
      depthLift: 0.12,
      rowSkew: 0.18,
      taper: 0.18
    };
  }

  if (input.color === PURPLE) {
    return {
      columns: 4,
      rows: 10,
      xSpread: 0.74,
      ySpread: 0.66,
      scaleBoost: 1.03,
      depthLift: 0.16,
      rowSkew: 0.18,
      taper: 0.18
    };
  }

  return {
    columns: 5,
    rows: 4,
    xSpread: 0.82,
    ySpread: 0.72,
    scaleBoost: 1,
    depthLift: 0.12,
    rowSkew: 0.14,
    taper: 0.18
  };
}

export function getAdSeatPoint(index: number, totalSeats: number): {
  x: number;
  y: number;
  scale: number;
} {
  const t = totalSeats > 1 ? index / (totalSeats - 1) : 0;
  const point = lerpPoint(SEAT_LEFT, SEAT_RIGHT, t);
  return {
    x: point.x,
    y: point.y + Math.sin(t * Math.PI) * 8,
    scale: 1
  };
}

export function getAdReserveSlot(input: AdReserveSlotInput): {
  x: number;
  y: number;
  scale: number;
} {
  const colorT =
    input.totalColors > 1 ? input.colorIndex / (input.totalColors - 1) : 0;
  const base = lerpPoint(RESERVE_LEFT, RESERVE_RIGHT, colorT);
  return {
    x: base.x + input.queueIndex * 18,
    y: base.y + input.queueIndex * 68,
    scale: Math.max(0.74, 1 - input.queueIndex * 0.06)
  };
}

export function buildAdWallVisual(input: {
  lane: number;
  layer: number;
  totalLanes: number;
  totalLayers: number;
  color: number;
  hp: number;
}): {
  projected: ReturnType<typeof projectAdWallCell>;
  cluster: AdClusterProfile;
  depthOrder: number;
  hp: number;
  color: number;
} {
  const projected = projectAdWallCell(input);
  const cluster = getAdClusterProfile(input);

  return {
    projected,
    cluster,
    depthOrder: projected.rowT * 100 + projected.laneT,
    hp: input.hp,
    color: input.color
  };
}
