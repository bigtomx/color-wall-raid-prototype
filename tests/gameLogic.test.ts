import { describe, expect, test } from "vitest";
import {
  applyDamageToLane,
  findBestSeat,
  findFrontTarget,
  getLaneRemainingDurability
} from "../src/game/gameLogic";

const RED = 0xff0000;
const BLUE = 0x0000ff;

describe("findBestSeat", () => {
  test("picks the empty seat facing the largest remaining wall durability", () => {
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

    expect(seatIndex).toBe(3);
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

  test("assigns unit to the seat matching its color", () => {
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

    expect(seatIndex).toBe(1);
  });

  test("returns null when no seat matches unit color", () => {
    const seatIndex = findBestSeat(
      {
        seats: [
          { lane: 0, occupied: false, color: RED },
          { lane: 1, occupied: true, color: BLUE }
        ],
        wallColumns: [[10], [5]],
        wallColors: [[RED], [BLUE]],
        seatColors: [RED, BLUE]
      },
      BLUE
    );

    expect(seatIndex).toBeNull();
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
