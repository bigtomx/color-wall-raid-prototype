export type UnitSpec = {
  label: number;
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

const laneColors = [0xff5555, 0xf5c842, 0x66cc66, 0x5599ff, 0xaa66dd];

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
  reserveUnits: Array.from({ length: 12 }, (_, index) => {
    const tint = laneColors[index % laneColors.length];
    return {
      label: 200,
      damage: 2 + (index % 3),
      attackInterval: 240 - (index % 3) * 18,
      deployDuration: 280,
      tint
    };
  })
};
