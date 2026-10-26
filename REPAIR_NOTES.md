# Repair notes (2026-10-26)

Changes:
- Protected 3D engine initialization with user-visible WebGL error feedback instead of a blank application.
- Prevented zero-height/width resize computations and duplicate destroy cleanup.
- Released postprocessing resources, shared textures, scene geometries/materials, and pointer lock on teardown.
- Removed hard-coded z-index of the game canvas, and prevented its CSS from forcing it above overlays.
- Guarded localStorage migration from privacy/storage exceptions that could crash startup.

**Verification limitations:** Dependencies could not be installed in this isolated environment (npm ci timed out); consequently no successful TypeScript build or interactive browser play-test can be claimed. See `npm run typecheck`, `npm run build`, and manual tests below after `npm ci` on a networked machine.

Manual checks: Start, pause/resume, arrow/WASD, restart, food scoring, wall/self/obstacle collisions, level changes, minimap, mouse/touch controls, sound, refresh saving, resize and browser console.
