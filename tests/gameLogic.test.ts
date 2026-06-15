import { describe, expect, test } from "vitest";
import {
  applyDamageToLane,
  canReservesDeployAndAttack,
  findBestSeat,
  findColorTarget,
  findFrontTarget,
  getLaneRemainingDurability,
  hasColorTarget,
  hasReserveWithMatchingColor,
  type SeatState
} from "../src/game/gameLogic";

const RED = 0xff0000;
const BLUE = 0x0000ff;

describe("findBestSeat", () => {
  test("picks the leftmost empty seat first", () => {
    const seatIndex = findBestSeat({
      seats: [
        { lane: 0, occupied: false, color: RED },
        { lane: 1, occupied: false, color: RED },
        { lane: 2, occupied: true, color: RED },
        { lane: 3, occupied: false, color: RED },
        { lane: 4, occupied: true, color: RED }
      ],
      wallColumns: [
        [3, 2],
        [5],
        [9, 9],
        [4, 4, 4],
        []
      ],
      wallColors: [
        [RED, RED],
        [RED],
        [RED, RED],
        [RED, RED, RED],
        []
      ],
      seatColors: [RED, RED, RED, RED, RED]
    });

    expect(seatIndex).toBe(0);
  });

  test("breaks ties from left to right", () => {
    const seatIndex = findBestSeat({
      seats: [
        { lane: 0, occupied: false, color: RED },
        { lane: 1, occupied: false, color: RED },
        { lane: 2, occupied: true, color: RED },
        { lane: 3, occupied: true, color: RED },
        { lane: 4, occupied: true, color: RED }
      ],
      wallColumns: [[6], [6], [10], [], []],
      wallColors: [[RED], [RED], [RED], [], []],
      seatColors: [RED, RED, RED, RED, RED]
    });

    expect(seatIndex).toBe(0);
  });

  test("returns null when no seat is available", () => {
    const seatIndex = findBestSeat({
      seats: [
        { lane: 0, occupied: true, color: RED },
        { lane: 1, occupied: true, color: RED },
        { lane: 2, occupied: true, color: RED },
        { lane: 3, occupied: true, color: RED },
        { lane: 4, occupied: true, color: RED }
      ],
      wallColumns: [[1], [2], [3], [4], [5]],
      wallColors: [[RED], [RED], [RED], [RED], [RED]],
      seatColors: [RED, RED, RED, RED, RED]
    });

    expect(seatIndex).toBeNull();
  });

  test("ignores unit color when a more-left empty seat exists", () => {
    const seatIndex = findBestSeat(
      {
        seats: [
          { lane: 0, occupied: false, color: RED },
          { lane: 1, occupied: false, color: BLUE },
          { lane: 2, occupied: false, color: RED }
        ],
        wallColumns: [[10], [5], [8]],
        wallColors: [[RED], [BLUE], [RED]],
        seatColors: [RED, BLUE, RED]
      },
      BLUE
    );

    expect(seatIndex).toBe(0);
  });

  test("falls back to the next leftmost empty seat when leftmost is occupied", () => {
    const seatIndex = findBestSeat(
      {
        seats: [
          { lane: 0, occupied: true, color: RED },
          { lane: 1, occupied: false, color: BLUE },
          { lane: 2, occupied: false, color: RED }
        ],
        wallColumns: [[10], [5], [8]],
        wallColors: [[RED], [BLUE], [RED]],
        seatColors: [RED, BLUE, RED]
      },
      BLUE
    );

    expect(seatIndex).toBe(1);
  });
});

describe("wall targeting", () => {
  test("finds the nearest intact cell in the lane", () => {
    const target = findFrontTarget([
      { lane: 2, layer: 0, hp: 0, destroyed: true, color: RED },
      { lane: 2, layer: 1, hp: 5, destroyed: false, color: RED },
      { lane: 2, layer: 2, hp: 6, destroyed: false, color: RED }
    ]);

    expect(target?.layer).toBe(1);
  });

  test("sums only intact durability for lane ranking", () => {
    const value = getLaneRemainingDurability([
      { lane: 1, layer: 0, hp: 0, destroyed: true, color: RED },
      { lane: 1, layer: 1, hp: 7, destroyed: false, color: RED },
      { lane: 1, layer: 2, hp: 3, destroyed: false, color: RED }
    ]);

    expect(value).toBe(10);
  });

  test("applies damage to the nearest intact cell before advancing", () => {
    const lane = [
      { lane: 1, layer: 0, hp: 3, destroyed: false, color: RED },
      { lane: 1, layer: 1, hp: 4, destroyed: false, color: RED }
    ];

    applyDamageToLane(lane, 2);
    expect(lane[0]).toMatchObject({ hp: 1, destroyed: false });

    applyDamageToLane(lane, 1);
    expect(lane[0]).toMatchObject({ hp: 0, destroyed: true });

    applyDamageToLane(lane, 2);
    expect(lane[1]).toMatchObject({ hp: 2, destroyed: false });
  });

  test("color-matched soldier skips cells of a different color", () => {
    const lane = [
      { lane: 0, layer: 0, hp: 5, destroyed: false, color: BLUE },
      { lane: 0, layer: 1, hp: 3, destroyed: false, color: RED }
    ];

    const result = applyDamageToLane(lane, 2, RED);
    expect(result?.layer).toBe(1);
    expect(lane[1]).toMatchObject({ hp: 1, destroyed: false });
    expect(lane[0]).toMatchObject({ hp: 5, destroyed: false });
  });
});

describe("findColorTarget (global cross-column targeting)", () => {
  test("picks the front-most (largest layer) matching-color cell", () => {
    const cells = [
      { lane: 0, layer: 0, hp: 5, destroyed: false, color: RED },
      { lane: 1, layer: 0, hp: 6, destroyed: false, color: BLUE },
      { lane: 2, layer: 1, hp: 4, destroyed: false, color: RED }
    ];

    // layer 1 > layer 0 → lane 2 is the front target
    expect(findColorTarget(cells, RED)?.lane).toBe(2);
  });

  test("same-layer tie: prefers cell closer to attacker by horizontal distance", () => {
    const cells = [
      { lane: 0, layer: 0, hp: 5, destroyed: false, color: RED },
      { lane: 3, layer: 0, hp: 5, destroyed: false, color: RED }
    ];

    // attacker at lane 1 → lane 0 is distance 1, lane 3 is distance 2
    expect(findColorTarget(cells, RED, 1)?.lane).toBe(0);
  });

  test("same-layer equal distance tie: falls back to leftmost lane", () => {
    const cells = [
      { lane: 3, layer: 0, hp: 5, destroyed: false, color: RED },
      { lane: 1, layer: 0, hp: 5, destroyed: false, color: RED }
    ];

    // attacker at lane 2: lane 1 distance 1, lane 3 distance 1 → leftmost
    expect(findColorTarget(cells, RED, 2)?.lane).toBe(1);
  });

  test("ignores destroyed cells", () => {
    const cells = [
      { lane: 0, layer: 1, hp: 0, destroyed: true, color: RED },
      { lane: 1, layer: 0, hp: 3, destroyed: false, color: RED }
    ];

    expect(findColorTarget(cells, RED)?.lane).toBe(1);
  });

  test("returns undefined when no matching color exists", () => {
    const cells = [
      { lane: 0, layer: 0, hp: 5, destroyed: false, color: BLUE }
    ];

    expect(findColorTarget(cells, RED)).toBeUndefined();
  });

  test("skips cells with hp <= 0 even if not marked destroyed", () => {
    const cells = [
      { lane: 0, layer: 1, hp: 0, destroyed: false, color: RED },
      { lane: 1, layer: 0, hp: 4, destroyed: false, color: RED }
    ];

    expect(findColorTarget(cells, RED)?.lane).toBe(1);
  });

  test("picks nearer same-color cell over farther one in different column", () => {
    const cells = [
      { lane: 0, layer: 2, hp: 10, destroyed: false, color: BLUE },
      { lane: 3, layer: 3, hp: 10, destroyed: false, color: BLUE },
      { lane: 0, layer: 0, hp: 8, destroyed: false, color: RED },
      { lane: 1, layer: 2, hp: 6, destroyed: false, color: RED },
      { lane: 4, layer: 3, hp: 9, destroyed: false, color: RED }
    ];

    // RED attacker: layer 3 cells exist → should pick layer 3 (lane 4)
    expect(findColorTarget(cells, RED)?.lane).toBe(4);
    // BLUE attacker: layer 3 exists → lane 3
    expect(findColorTarget(cells, BLUE)?.lane).toBe(3);
  });
});

describe("hasColorTarget", () => {
  test("returns true when an intact matching cell exists", () => {
    const cells = [
      { lane: 0, layer: 0, hp: 3, destroyed: false, color: RED },
      { lane: 1, layer: 0, hp: 5, destroyed: false, color: BLUE }
    ];
    expect(hasColorTarget(cells, RED)).toBe(true);
  });

  test("returns false when all matching cells are destroyed", () => {
    const cells = [
      { lane: 0, layer: 0, hp: 0, destroyed: true, color: RED },
      { lane: 1, layer: 0, hp: 5, destroyed: false, color: BLUE }
    ];
    expect(hasColorTarget(cells, RED)).toBe(false);
  });

  test("returns false when no cell has the target color", () => {
    const cells = [
      { lane: 0, layer: 0, hp: 5, destroyed: false, color: BLUE }
    ];
    expect(hasColorTarget(cells, RED)).toBe(false);
  });

  test("returns false for empty cell list", () => {
    expect(hasColorTarget([], RED)).toBe(false);
  });
});

describe("hasReserveWithMatchingColor", () => {
  test("returns true when a reserve color matches a remaining wall", () => {
    const walls = [
      { lane: 0, layer: 0, hp: 5, destroyed: false, color: RED },
      { lane: 1, layer: 0, hp: 3, destroyed: false, color: BLUE }
    ];
    expect(hasReserveWithMatchingColor([RED], walls)).toBe(true);
  });

  test("returns false when no reserve color matches remaining walls", () => {
    const walls = [
      { lane: 0, layer: 0, hp: 5, destroyed: false, color: RED }
    ];
    expect(hasReserveWithMatchingColor([BLUE], walls)).toBe(false);
  });

  test("returns false when reserve list is empty", () => {
    const walls = [
      { lane: 0, layer: 0, hp: 5, destroyed: false, color: RED }
    ];
    expect(hasReserveWithMatchingColor([], walls)).toBe(false);
  });

  test("ignores destroyed walls when checking colors", () => {
    const walls = [
      { lane: 0, layer: 0, hp: 0, destroyed: true, color: RED },
      { lane: 1, layer: 0, hp: 5, destroyed: false, color: BLUE }
    ];
    expect(hasReserveWithMatchingColor([RED], walls)).toBe(false);
  });

  test("matches when multiple reserve colors exist and one hits", () => {
    const walls = [
      { lane: 0, layer: 0, hp: 4, destroyed: false, color: RED },
      { lane: 1, layer: 0, hp: 6, destroyed: false, color: BLUE }
    ];
    expect(hasReserveWithMatchingColor([BLUE, 0x00ff00], walls)).toBe(true);
  });
});

const GREEN = 0x00ff00;

describe("canReservesDeployAndAttack", () => {
  test("returns true when matching reserve color and an empty seat exist", () => {
    const walls = [
      { lane: 0, layer: 0, hp: 5, destroyed: false, color: RED },
      { lane: 1, layer: 0, hp: 3, destroyed: false, color: GREEN }
    ];
    const seats: SeatState[] = [
      { lane: 0, occupied: true, color: RED },
      { lane: 1, occupied: false, color: GREEN }
    ];

    expect(canReservesDeployAndAttack([RED], walls, seats)).toBe(true);
  });

  test("returns false when reserve matches wall but every seat is occupied", () => {
    const walls = [
      { lane: 0, layer: 0, hp: 5, destroyed: false, color: RED },
      { lane: 1, layer: 0, hp: 3, destroyed: false, color: GREEN }
    ];
    const seats: SeatState[] = [
      { lane: 0, occupied: true, color: RED },
      { lane: 1, occupied: true, color: GREEN }
    ];

    // Reserve color RED matches wall, but no seat is free → cannot deploy
    expect(canReservesDeployAndAttack([RED], walls, seats)).toBe(false);
  });

  test("returns false when an empty seat exists but no reserve color matches", () => {
    const walls = [
      { lane: 0, layer: 0, hp: 5, destroyed: false, color: RED }
    ];
    const seats: SeatState[] = [
      { lane: 0, occupied: false, color: RED }
    ];

    expect(canReservesDeployAndAttack([BLUE], walls, seats)).toBe(false);
  });

  test("returns false when reserve list is empty", () => {
    const walls = [
      { lane: 0, layer: 0, hp: 5, destroyed: false, color: RED }
    ];
    const seats: SeatState[] = [
      { lane: 0, occupied: false, color: RED }
    ];

    expect(canReservesDeployAndAttack([], walls, seats)).toBe(false);
  });
});
