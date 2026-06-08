# Claude Task: Align Prototype With Reference View

## Read First

Before making any changes, read these files:

- `README.md`
- `src/game/GameScene.ts`
- `src/game/gameLogic.ts`
- `src/game/level.ts`
- `tests/gameLogic.test.ts`
- `docs/reference/target-view-notes.md`

Human reference only:

- `docs/reference/target-view.jpg`

## Objective

The current prototype does not match the target reference.

Your job is to move the existing prototype closer to the target reference with the smallest practical change set.

Focus on these two outcomes only:

1. The scene should feel like a slanted side / top-down depth view described in `docs/reference/target-view-notes.md`, not a flat horizontal 5-lane stage.
2. Soldiers should attack walls by color across the whole board, not only the lane directly in front of them.

## Confirmed Gameplay Rules

These rules are required and should override assumptions from the current implementation:

- Same-color soldiers only attack same-color walls.
- Target selection is not limited to the soldier's current lane.
- A soldier may attack matching walls in other columns / lanes.
- Do not change this into a "must hit the front-most wall only" rule.

## Constraints

- Keep the current stack: Phaser + TypeScript + Vite + Vitest.
- Treat `docs/reference/target-view-notes.md` as the primary source of truth for the target look. Do not rely on image understanding.
- Prefer the smallest viable refactor that can support the target look and target-selection rule.
- Do not add unrelated features such as audio, meta progression, menus, settlement pages, or large UI redesigns.
- Do not do broad cleanup or architecture work unless it is directly required for this task.
- Keep conclusions grounded in actual code, not generic game-dev advice.

## Important Current Mismatches To Inspect

Check these real implementation constraints first:

- `src/game/GameScene.ts`: scene layout and coordinate system currently read as a horizontal stage.
- `src/game/GameScene.ts`: `fireBullet` currently searches only inside `this.wallByLane[seat.lane]`.
- `src/game/gameLogic.ts`: target helpers are currently lane-local and do not express global color-based targeting.

## Required Working Style

Before coding:

1. Briefly explain what in the current code prevents the reference-like result.
2. Propose the smallest viable implementation approach.
3. State which files you will change and why.

During implementation:

- Keep edits scoped to this task.
- Reuse existing code where possible.
- If a rule in scene code and logic code diverges, unify them instead of duplicating more behavior.

## Minimum Expected Deliverable

Implement a first-pass version that:

- visually shifts the board toward a slanted depth layout closer to the text reference,
- keeps reserve units and combat readable,
- lets same-color units find and attack same-color wall targets globally,
- still supports win / lose / restart,
- keeps tests and build green.

It does not need to be a perfect ad clone in one pass, but it must be clearly closer to the text reference than the current version.

## Verification

After changes, run:

- `npm test`
- `npm run build`

Then report:

1. What changed in behavior
2. What changed visually
3. What is still only an approximation of the text reference
4. Exact test and build results
