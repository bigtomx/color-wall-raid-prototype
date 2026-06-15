# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server on port 4173
npm run build      # TypeScript type-check + Vite production build
npm test           # Run all Vitest tests
```

Vitest does not have a watch-mode flag in the scripts; use `npx vitest` for watch mode.

## Architecture

This is a Phaser 3 + TypeScript prototype of a "color wall raid" ad-style game. The canvas is 540×960 (portrait mobile).

### Layer separation (important)

- **`src/game/gameLogic.ts`** — Pure data functions, no Phaser dependency. All game rules live here: seat selection (`findBestSeat`), wall targeting (`findFrontTarget`, `findColorTarget`), damage application (`applyDamageToLane`), and color target checks (`hasColorTarget`). These are directly unit-tested.
- **`src/game/GameScene.ts`** — Phaser scene. Handles rendering, input, tweens, and game flow. Calls into `gameLogic.ts` for all rule decisions. When adding new game rules, put the logic in `gameLogic.ts` and call it from the scene.
- **`src/game/level.ts`** — Level configuration data (`LevelConfig`, `UnitSpec`). Defines wall layout, colors, and reserve unit specs.
- **`src/main.ts`** — Entry point. Creates the Phaser game instance and injects page CSS.

### Core game loop

1. Player clicks a reserve unit (bottom pool).
2. `handleReserveUnitClick` calls `hasColorTarget` to verify the unit's color still has walls to attack, then `findBestSeat` to pick the best empty seat (same-color seats preferred, any empty seat as fallback).
3. Unit animates to the seat via `deployUnitToSeat`.
4. Once deployed, `beginAttacking` starts a repeating timer that calls `fireBullet`.
5. `fireBullet` uses `findColorTarget` across all wall cells (not just the soldier's lane) to find the nearest same-color wall, then fires a bullet tween to it.
6. On hit, damage is applied to the `WallCellState` directly (the state object is shared between `wallByLane` views and the targeting logic).
7. `checkEndConditions` runs after each hit: win if no walls remain, lose if no reserve units left and no active attackers.

### Key data structures

- `WallCellState` — mutable per-cell state (lane, layer, hp, destroyed, color). Shared by reference between scene views and logic functions.
- `SeatState` — per-seat state (lane, occupied, color).
- `WallCellView` / `SeatView` / `UnitActor` — scene-layer view objects that hold Phaser game objects and reference the logic-layer state.

### Coordinate system

`getLaneX(lane, layer)` computes horizontal position with depth parallax (`- layer * 20`). Wall cells are rendered as isometric boxes via `drawIsoBox` with perspective scaling (`Math.pow(0.85, layer)`). Seats use `getLaneX(lane)` (layer defaults to 0).

## Testing

Tests are in `tests/gameLogic.test.ts` and only cover `gameLogic.ts` pure functions. The Phaser scene is not unit-tested. When adding game rules, write the logic as pure functions in `gameLogic.ts` and test them directly.

## docs/reference/

Contains task briefs and reference notes for aligning the prototype with target visuals. `target-view-notes.md` is a text summary of the reference image; `claude-task-*.md` files are scoped task documents. Do not read `.jpg` files.
