import { describe, expect, test } from "vitest";
import {
  buildAdWallVisual,
  getAdClusterProfile,
  getAdReserveSlot,
  getAdSeatPoint,
  projectAdWallCell
} from "../src/game/adBattlefieldLayout";

const GRAY = 0x2d3b49;
const WHITE = 0xf2f4fb;
const RED = 0xe24d4d;
const GREEN = 0xb7eb45;

describe("projectAdWallCell", () => {
  test("projects front cells lower and larger than back cells", () => {
    const back = projectAdWallCell({
      lane: 2,
      layer: 0,
      totalLanes: 5,
      totalLayers: 8
    });
    const front = projectAdWallCell({
      lane: 2,
      layer: 7,
      totalLanes: 5,
      totalLayers: 8
    });

    expect(front.y).toBeGreaterThan(back.y);
    expect(front.scale).toBeGreaterThan(back.scale);
    expect(front.radius).toBeGreaterThan(back.radius);
  });

  test("spreads lanes across the tray width", () => {
    const left = projectAdWallCell({
      lane: 0,
      layer: 5,
      totalLanes: 5,
      totalLayers: 8
    });
    const right = projectAdWallCell({
      lane: 4,
      layer: 5,
      totalLanes: 5,
      totalLayers: 8
    });

    expect(right.x).toBeGreaterThan(left.x);
  });
});

describe("getAdClusterProfile", () => {
  test("renders the white core as a broader cluster than the red seam", () => {
    const whiteCore = getAdClusterProfile({
      color: WHITE,
      lane: 2,
      layer: 4
    });
    const redSeam = getAdClusterProfile({
      color: RED,
      lane: 3,
      layer: 4
    });

    expect(whiteCore.columns).toBeGreaterThan(redSeam.columns);
    expect(whiteCore.rows).toBeGreaterThanOrEqual(redSeam.rows);
  });

  test("uses tapered, side-leaning wall stacks instead of flat patches", () => {
    const whiteCore = getAdClusterProfile({
      color: WHITE,
      lane: 2,
      layer: 5
    });

    expect(whiteCore.rows).toBeGreaterThan(whiteCore.columns);
    expect(whiteCore.taper).toBeGreaterThan(0);
    expect(whiteCore.rowSkew).toBeGreaterThan(0);
  });

  test("keeps the gray front walls denser than the far green field", () => {
    const grayFront = getAdClusterProfile({
      color: GRAY,
      lane: 4,
      layer: 7
    });
    const greenBack = getAdClusterProfile({
      color: GREEN,
      lane: 4,
      layer: 1
    });

    expect(grayFront.scaleBoost).toBeGreaterThan(greenBack.scaleBoost);
    expect(grayFront.depthLift).toBeGreaterThan(greenBack.depthLift);
  });
});

describe("seat and reserve projection", () => {
  test("places seats along the same front edge from left to right", () => {
    const left = getAdSeatPoint(0, 5);
    const right = getAdSeatPoint(4, 5);

    expect(right.x).toBeGreaterThan(left.x);
    expect(Math.abs(right.y - left.y)).toBeLessThan(40);
  });

  test("widens the tray toward the viewer for a side-looking battlefield", () => {
    const backLeft = projectAdWallCell({
      lane: 0,
      layer: 0,
      totalLanes: 5,
      totalLayers: 8
    });
    const backRight = projectAdWallCell({
      lane: 4,
      layer: 0,
      totalLanes: 5,
      totalLayers: 8
    });
    const frontLeft = projectAdWallCell({
      lane: 0,
      layer: 7,
      totalLanes: 5,
      totalLayers: 8
    });
    const frontRight = projectAdWallCell({
      lane: 4,
      layer: 7,
      totalLanes: 5,
      totalLayers: 8
    });

    expect(frontLeft.x).toBeLessThan(backLeft.x);
    expect(frontRight.x).toBeGreaterThan(backRight.x);
    expect(frontRight.x - frontLeft.x).toBeGreaterThan(
      backRight.x - backLeft.x
    );
  });

  test("stacks reserve units diagonally by queue depth", () => {
    const first = getAdReserveSlot({
      colorIndex: 0,
      queueIndex: 0,
      totalColors: 5
    });
    const third = getAdReserveSlot({
      colorIndex: 0,
      queueIndex: 2,
      totalColors: 5
    });

    expect(third.x).toBeGreaterThan(first.x);
    expect(third.y).toBeGreaterThan(first.y);
    expect(third.scale).toBeLessThan(first.scale);
  });
});

describe("buildAdWallVisual", () => {
  test("combines projection and cluster profile into a render-ready visual", () => {
    const visual = buildAdWallVisual({
      lane: 2,
      layer: 5,
      totalLanes: 5,
      totalLayers: 8,
      color: WHITE,
      hp: 18
    });

    expect(visual.cluster.columns).toBeGreaterThan(0);
    expect(visual.projected.scale).toBeGreaterThan(0);
    expect(visual.projected.y).toBeGreaterThan(0);
    expect(visual.depthOrder).toBeGreaterThan(0);
  });
});
