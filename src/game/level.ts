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
  reserveUnits: UnitSpec[];
};

const palette = [0x8d5cf6, 0x46566e, 0xf4b53f, 0xff5656, 0xb8e84a];

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
  reserveUnits: Array.from({ length: 12 }, (_, index) => {
    const tint = palette[index % palette.length];
    return {
      label: 200,
      damage: 2 + (index % 3),
      attackInterval: 240 - (index % 3) * 18,
      deployDuration: 280,
      tint
    };
  })
};
