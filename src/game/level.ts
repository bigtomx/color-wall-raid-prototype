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

const laneColors = [0x7340e6, 0x2d3b49, 0xf2f4fb, 0xe24d4d, 0xb7eb45];

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
    Array(7).fill(laneColors[0]),
    Array(8).fill(laneColors[1]),
    Array(8).fill(laneColors[2]),
    Array(8).fill(laneColors[3]),
    Array(7).fill(laneColors[4])
  ],
  reserveUnits: Array.from({ length: 10 }, (_, index) => {
    const tint = laneColors[index % laneColors.length];
    return {
      ammo: 56,
      damage: 1,
      attackInterval: 240 - (index % 3) * 18,
      deployDuration: 280,
      tint
    };
  })
};
