# Serpet UI, control and rendering repair — 2026-10-26

## Changes
- Fixed game rendering layer appearing in front of menu/HUD and blocking the start/configuration UI.
- Kept menu vertically scrollable on short and mobile screens, reduced menu padding and enabled touch scrolling.
- Added accessible button focus styles and touch-friendly hit behavior, retained disabled states.
- Added an explicit graphics-error retry button so a WebGL failure does not leave a dead screen.
- Hardened high-DPI/WebGL render sizing when the viewport resizes.
- Prevented held keys from activating pause/view/restart repeatedly and suppressed global shortcuts while focused on controls.
- Cleared stuck keyboard input when focus leaves the page; pause the game when window loses focus.
- Paused update/render work when the page is hidden, avoiding unnecessary background work.
- Hide the minimap on the menu and pause screens, show it during gameplay only.
- Applied reduced-motion accessibility fallback for CSS animations.

## Validation
- TypeScript syntax transpilation: PASS for App.tsx, Engine.ts, Minimap.ts.
- Full `npm run typecheck`: BLOCKED — existing node_modules contains empty @types folders, so TypeScript cannot resolve ambient declarations.
- Full `npm run build`: BLOCKED — vite executable missing from installed node_modules.
- Browser gameplay / screenshot test: NOT RUN in this environment.

## Reproduction and checks on a machine with working npm internet access
1. `npm ci`
2. `npm run typecheck`
3. `npm run build`
4. `npm run dev`
5. In a WebGL-capable browser, verify menu buttons, difficulty and arena selection, vertical scrolling on a small mobile viewport, click Play, W/A/D + mouse + Shift, Space pause/resume, V camera mode, restart/menu, collectible behavior and scene performance.

## Important
This is a code repair, not a certified fully playable release. In particular runtime animation smoothness, camera motion and end-to-end input gameplay still require browser testing.
