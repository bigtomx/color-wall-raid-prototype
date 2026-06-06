import { describe, expect, test } from "vitest";
import {
  applyDamageToLane,
  findBestSeat,
  findFrontTarget,
  getLaneRemainingDurability
} from "../src/game/gameLogic";

describe("findBestSeat", () => {
  test("picks the empty seat facing the largest remaining wall durability", () => {
    const seatIndex = findBestSeat({
      seats: [
        { lane: 0, occupied: false },
        { lane: 1, occupied: false },
        { lane: 2, occupied: true },
        { lane: 3, occupied: false },
        { lane: 4, occupied: true }
      ],
      wallColumns: [
        [3, 2],
        [5],
        [9, 9],
        [4, 4, 4],
        []
      ]
    });

    expect(seatIndex).toBe(3);
  });

  test("breaks ties from left to right", () => {
    const seatIndex = findBestSeat({
      seats: [
        { lane: 0, occupied: false },
        { lane: 1, occupied: false },
        { lane: 2, occupied: true },
        { lane: 3, occupied: true },
        { lane: 4, occupied: true }
      ],
      wallColumns: [[6], [6], [10], [], []]
    });

    expect(seatIndex).toBe(0);
  });

  test("returns null when no seat is available", () => {
    const seatIndex = findBestSeat({
      seats: [
        { lane: 0, occupied: true },
        { lane: 1, occupied: true },
        { lane: 2, occupied: true },
        { lane: 3, occupied: true },
        { lane: 4, occupied: true }
      ],
      wallColumns: [[1], [2], [3], [4], [5]]
    });

    expect(seatIndex).toBeNull();
  });
});

describe("wall targeting", () => {
  test("finds the nearest intact cell in the lane", () => {
    const target = findFrontTarget([
      { lane: 2, layer: 0, hp: 0, destroyed: true },
      { lane: 2, layer: 1, hp: 5, destroyed: false },
      { lane: 2, layer: 2, hp: 6, destroyed: false }
    ]);

    expect(target?.layer).toBe(1);
  });

  test("sums only intact durability for lane ranking", () => {
    const value = getLaneRemainingDurability([
      { lane: 1, layer: 0, hp: 0, destroyed: true },
      { lane: 1, layer: 1, hp: 7, destroyed: false },
      { lane: 1, layer: 2, hp: 3, destroyed: false }
    ]);

    expect(value).toBe(10);
  });

  test("applies damage to the nearest intact cell before advancing", () => {
    const lane = [
      { lane: 1, layer: 0, hp: 3, destroyed: false },
      { lane: 1, layer: 1, hp: 4, destroyed: false }
    ];

    applyDamageToLane(lane, 2);
    expect(lane[0]).toMatchObject({ hp: 1, destroyed: false });

    applyDamageToLane(lane, 1);
    expect(lane[0]).toMatchObject({ hp: 0, destroyed: true });

    applyDamageToLane(lane, 2);
    expect(lane[1]).toMatchObject({ hp: 2, destroyed: false });
  });
});
