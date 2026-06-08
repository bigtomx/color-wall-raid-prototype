# Claude Task V2: Rebuild The Battlefield As A Slanted Depth Grid

## Important Context

The previous attempt is still far from the target. It only skewed the old 5-lane wall by changing `getLaneX(lane, layer)` and scaling cubes by `0.85 ** layer`.

That approach is not enough.

Do not keep tuning the old 5-lane layout. The core problem is the spatial model.

## Read First

Read these files before making changes:

- `README.md`
- `src/game/GameScene.ts`
- `src/game/gameLogic.ts`
- `src/game/level.ts`
- `tests/gameLogic.test.ts`
- `docs/reference/target-view-notes.md`
- `docs/reference/claude-task-side-view.md`

Assume you cannot read image files. Use `docs/reference/target-view-notes.md` as the visual target.

## User Goal

The game should look much closer to the reference:

- A slanted side / top-down battlefield with depth.
- A continuous tray-like board, not 5 separated vertical lanes.
- Dense colored wall masses, closer to colored ball stacks than floating cube labels.
- Reserve soldiers arranged in diagonal depth lines below the board.
- Same-color soldiers attack same-color wall targets globally across the board.

## Confirmed Gameplay Rules

- Same-color soldiers only attack same-color walls.
- Targeting is global across the board.
- A soldier may attack matching walls in another column.
- Do not restrict attacks to the soldier's direct lane.
- Do not change this into a front-wall-only rule.

## What Went Wrong In The Previous Attempt

Treat these as root causes to fix, not as cosmetic details:

1. `levelOne` still represents the wall as 5 lane columns, so the screen still reads as 5 isolated wall strips.
2. `createWall()` still loops `wallColumns.map((column, lane) => column.map((hp, layer) => ...))`, so the render model is still lane/layer, not a 2D battlefield.
3. `createWallCell()` shrinks blocks by layer but keeps fixed vertical spacing, which makes blocks look detached and floating.
4. Seats still use a flat horizontal row.
5. Reserve units still use a rectangular grid.
6. Wall art is still cube + HP text, while the target reads as dense colored balls.

## Required Direction

Replace the old visual model with a depth-grid model.

Minimum acceptable model:

- Use board coordinates like `{ column, depth }` or `{ xIndex, zIndex }` for wall cells.
- Add one projection helper that converts board coordinates into screen coordinates:
  - `screenX = boardOriginX + columnOffset + depthOffsetX`
  - `screenY = boardOriginY + depthOffsetY`
  - `scale` should change gently with depth.
- Draw far cells first and near cells later so overlap reads correctly.
- Keep cells close enough that they form dense color masses, not scattered pieces.

The exact math is up to you, but the result must visually read as a slanted battlefield.

## Visual Requirements

For this pass, prioritize the look over preserving the old wall-block style.

Required:

- Replace wall blocks with compact colored circular / bead-like wall pieces.
- Remove or greatly de-emphasize HP text on individual wall pieces. The reference is not a wall of numbers.
- Make the board area feel like one tray or field with perspective.
- Arrange reserve units in diagonal depth lines, not a flat `6 x 2` grid.
- Keep the game readable on the existing `540 x 960` canvas.

Allowed:

- Keep simple Phaser primitives.
- Keep the current soldier body style if needed.
- Keep basic bullet circles and burst particles.
- Approximate the reference rather than cloning it perfectly.

Not allowed:

- Merely changing constants in `getLaneX`.
- Merely shrinking old cubes by depth.
- Leaving the wall as 5 isolated columns.
- Adding unrelated features such as audio, menus, progression, or new screens.

## Suggested Implementation Shape

You may choose a better local implementation, but this is the expected scale of change:

1. Update `level.ts` so the wall can describe a depth grid or a generated color field.
2. Update `gameLogic.ts` so global color targeting works on all wall cells, with tests.
3. Update `GameScene.ts` so wall cells render from projected board coordinates instead of lane-only coordinates.
4. Update seat / deployed unit placement to use the same projection style or an aligned diagonal front row.
5. Update reserve unit placement to diagonal color-coded queues below the board.

Keep the refactor focused. Do not split the project into many new files unless that clearly reduces complexity.

## Targeting Requirement

For global color targeting:

- Search all intact wall cells.
- Filter by `cell.color === unit.tint`.
- Prefer a visually reasonable target, such as the nearest matching cell by projected screen distance from the attacker, with a stable tie-breaker.
- If you use depth or distance for targeting, test the rule in `gameLogic.test.ts`.

Avoid a rule that always picks leftmost lane at the lowest layer if that produces visually strange cross-screen shots.

## Completion Criteria

Before reporting done, verify all of these:

- The first rendered screen no longer looks like 5 separated wall lanes.
- Wall pieces form dense colored regions across a slanted depth board.
- Reserve units are arranged diagonally or in depth-oriented rows.
- Same-color soldiers can attack matching wall pieces outside their original column.
- Win, lose, and restart still work.
- `npm test` passes.
- `npm run build` passes.

## Report Format

After implementation, report:

1. Which old 5-lane assumptions were removed or replaced.
2. What the new board projection model is.
3. How global same-color targeting chooses a target.
4. What still remains approximate compared with `target-view-notes.md`.
5. Exact `npm test` and `npm run build` results.
