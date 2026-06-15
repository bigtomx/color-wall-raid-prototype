export type UnitSpec = {
  ammo: number;
  damage: number;
  attackInterval: number;
  deployDuration: number;
  tint: number;
};

export type LevelConfig = {
  seatCount: number;
  lanes: number;
  wallColumns: number[][];
  wallColors: number[][];
  reserveUnits: UnitSpec[];
};

const PURPLE = 0x7340e6;
const GRAY = 0x2d3b49;
const WHITE = 0xf2f4fb;
const RED = 0xe24d4d;
const GREEN = 0xb7eb45;

export const levelOne: LevelConfig = {
  seatCount: 5,
  lanes: 5,
  wallColumns: [
    [8, 10, 11, 12, 14, 14, 15],
    [9, 10, 12, 13, 14, 15, 16, 18],
    [12, 12, 14, 16, 18, 18, 20, 22],
    [10, 11, 12, 13, 14, 14, 15, 16],
    [8, 9, 10, 12, 12, 13, 14]
  ],
  wallColors: [
    [PURPLE, PURPLE, PURPLE, PURPLE, GRAY, GRAY, GRAY],
    [PURPLE, PURPLE, GRAY, GRAY, GRAY, GRAY, GRAY, GRAY],
    [PURPLE, WHITE, WHITE, WHITE, WHITE, WHITE, RED, GRAY],
    [GREEN, GREEN, GREEN, RED, WHITE, WHITE, GRAY, GRAY],
    [GREEN, GREEN, GREEN, GREEN, GRAY, GRAY, GRAY]
  ],
  reserveUnits: Array.from({ length: 10 }, (_, index) => {
    const tint = [PURPLE, GRAY, WHITE, RED, GREEN][index % 5];
    return {
      ammo: 56,
      damage: 1,
      attackInterval: 240 - (index % 3) * 18,
      deployDuration: 280,
      tint
    };
  })
};
