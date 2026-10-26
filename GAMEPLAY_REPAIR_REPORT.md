# Serpet gameplay, arena, minimap and reward repair — 2026-10-26

## Applied source-level changes
- Renderer/camera: initialize perspective aspect using nonzero dimensions; keep renderer, camera and postprocessing sized to the actual container with ResizeObserver (not just window resize); release observer on engine teardown; ensure far clipping is updated after camera mode changes.
- Arena: when difficulty changes and a new run resets, rescale floor and wall together to the physics arena radius; keep the shader's local-space radius consistent. Prevent visuals disagreeing with wall collision and minimap radius.
- Minimap: world-boundary circle now uses the arena's actual world origin relative to the player's location, instead of falsely centering the arena on the moving player.
- Controls/movement: prevent browser arrow-key scrolling during play; cap large frame deltas in head displacement to reduce leaps following stalls.
- Rewards/collectibles: place rewards away from head/body, other pickups and obstacles; use area-uniform radial sampling and bounded retries; lengthen short-lived golden pickup lifetime from 5 to 12 seconds; release glow materials on reset, expiry, pickup and destruction.
- Power-ups: clear the previous timed power-up's state when replacing it, so speed/shield/magnet effects don't remain stacked invisibly.
- Growth/shrink: update speed-ramp callback after shrinking; eliminate duplicate growth speed-ramp assignment.
- Removed per-second scene-state console spam.

## Checks performed
- TypeScript *transpileModule* syntax diagnostic: passed for Engine.ts and Minimap.ts (zero syntax diagnostics).
- Static inspection of the modified paths completed.
- Full `npm run build`: **not passed/not run** because the dependency installation is incomplete (`vite: not found`).
- Full `npm run typecheck`: **not passed** because installed `@types` packages are incomplete.
- Interactive gameplay/browser check: **not performed**.

These are targeted fixes, **not** proof all game defects have been eliminated. On a machine with network access, run `npm ci && npm run typecheck && npm run build && npm run dev`; manually exercise all camera modes, screen resizing, rewards including timed and power-up replacements, wall/obstacle/self collisions, difficulties, minimap orientation and mobile controls.
