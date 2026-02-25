# Feature integration audit (repo-wide)

This is a best-effort inventory of “features” as they appear in this repo as of the current code on disk (not runtime-verified beyond what is referenced below).

Legend:
- **Fully integrated** = implemented + wired into the active app surface (`App.tsx` → `components/CanvasGrid.tsx` → `renderer.ts`).
- **Partially integrated** = some code/UI exists, but wiring is incomplete, gated behind dev-only paths, depends on missing/external deps, or is not covered by automated checks.
- **Mentioned only** = referenced in docs/skills/sibling projects, but not present in the active app.

## Fully integrated (implemented + wired)

- [x] **Canvas grid overlays** (major/minor grid + rule-of-thirds + head-grid tooling)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/components/CanvasGrid.tsx:1`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/renderer.ts:119`
- [x] **Vitruvian/grid geometry adapter** (head unit sizing, plot payload, runtime geometry)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/adapters/vitruvianGrid.ts:417`
- [x] **Bitruvius anatomical skeleton renderer** (skeleton draw + view modes like Noir/Skeletal/Lotte)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/renderer.ts:119`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/viewModes.ts:1`
- [x] **FK editing engine** (pose → world transforms; FK interaction path)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/fkEngine.ts:1`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/components/CanvasGrid.tsx:4`
- [x] **IK solving pipeline** (FABRIK/CCD/Hybrid; multiple solve scopes)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/ikSolver.ts:1`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/components/CanvasGrid.tsx:6`
- [x] **Constraint bridge / FK↔IK handshake** (anti-snap switching, pinned stability)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/App.tsx:244`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/components/CanvasGrid.tsx:1694`
- [x] **Humanized IK + Leg intent assist** (counterbalance/mirror/follow-through; Walk/Sway/Sit/Jump intent)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/ikHumanAssist.ts:1`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/ikLegIntent.ts:1`
- [x] **IK gravity holds** (arm/leg “gravity hold” toggles)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/ikGravityHold.ts:1`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/components/CanvasGrid.tsx:25`
- [x] **Animation timeline runtime** (keyframes, playback, FPS/frameCount, easing, segment in-betweens)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/App.tsx:261`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/components/CanvasGrid.tsx:145`
- [x] **Segment IK tween overlay (“IK Tween”)** (per-segment solver settings + influence)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/animationIkTween.ts:1`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/App.tsx:657`
- [x] **Onion-skin ghosts** (past/future frames)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/App.tsx:256`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/components/OnionSkinControls.tsx:1`
- [x] **Undo/redo for timeline state** (history snapshots include segment IK tween map)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/App.tsx:318`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/App.tsx:565`
- [x] **Overlay layers** (background image layer + foreground layer)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/renderer.ts:19`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/App.tsx:2362`
- [x] **Body-part mask layers + Mask Editor** (projection/costume; transforms, blend, filter)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/components/CanvasGrid.tsx:4031`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/renderer.ts:32`
- [x] **Pose Library panel (in-canvas UI)** (capture/apply workflows visible in CanvasGrid)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/components/CanvasGrid.tsx:4478`
- [x] **Export** (canvas image export + MediaRecorder-based video export with webm fallback)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/exportUtils.ts:1`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/App.tsx:575`
- [x] **Dev + unit test harness** (Vite + Vitest; multiple unit tests for FK/IK/geometry/tween)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/package.json:1`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/vitest.config.ts:1`

## Partially integrated (present, but incomplete / risky / not fully wired)

- [ ] **“Transfer Engine” (autosave/import/export compatibility)**
  - Why partial: The module is defined + surfaced as a core module, but the active app surface does not show a clear end-user import/export workflow beyond canvas export; some persistence exists (localStorage for IK pose programs) but is narrow.
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/App.tsx:268`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/components/CanvasGrid.tsx:879`
- [ ] **“Overlay Engine” as a separable module**
  - Why partial: Overlay capabilities exist (image layers, masks), but the module boundary is largely a toggle/label; most code paths don’t strongly isolate overlay logic behind the module id.
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/App.tsx:264`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/renderer.ts:19`
- [ ] **AI Studio / Gemini API key integration**
  - Why partial: README instructs configuring `GEMINI_API_KEY`, and Vite injects it into the frontend build, but no app feature appears to consume it (and the injection is flagged as a TODO in `progress.md`).
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/README.md:1`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/vite.config.ts:1`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/progress.md:503`
- [ ] **External alias dependency `pose-to-pose-engine`**
  - Why partial: `vite.config.ts` aliases to `../FrankenBitruvius/...` which is outside this repo; if that path isn’t present locally, builds/typecheck can fail or drift.
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/vite.config.ts:19`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/adapters/poseInterpolator.ts:2`
- [ ] **Playwright-based runtime audit loop**
  - Why partial: `playwright` is installed and `web_game_playwright_client.js` exists, but the app’s deterministic test bridge (`window.render_game_to_text`, `window.advanceTime`) is referenced in notes and has had drift historically; not enforced by CI here.
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/package.json:1`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/web_game_playwright_client.js:1`, `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/progress.md:512`
- [ ] **Standalone “tests” that are not in Vitest**
  - Why partial: Files like `testJitterSnapbackRemoval.ts` exist but are not referenced by `vitest` (no `describe/it`, not imported), so they don’t run as part of `npm test`.
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/testJitterSnapbackRemoval.ts:1`
- [ ] **`Bitruvius-Core-Motion/` subtree**
  - Why partial: It appears to be a sibling project or library and is explicitly excluded from this repo’s `vitest` config; it may not be part of the active app build.
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/vitest.config.ts:9`

## Mentioned but not integrated at all (docs/skills/sibling projects)

- [ ] **CAD system integration / engineering simulation / medical animation** (use-cases listed in `CascadeProjects/windsurf-project`)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/CascadeProjects/windsurf-project/README.md:142`
- [ ] **Physics simulation integration / machine learning integration / neural network IK** (future features checklist in `CascadeProjects/windsurf-project`)
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/CascadeProjects/windsurf-project/README.md:210`
- [ ] **Locomotion “skill” wiring references to `src/features/interaction/shortcuts.ts`**
  - Evidence: `/Users/bradleygeiser/Downloads/canvas-grid-builder-pt-i/skills/pose-engine-locomotion/SKILL.md:13`
  - Status: There is no `src/` directory in this repo root; that referenced wiring surface is not present.

## Quick “what to do next” checklist (if you want to tighten integration)

- [ ] Decide whether `GEMINI_API_KEY` should exist client-side at all; if not, remove Vite `define` injection.
- [ ] Replace the `pose-to-pose-engine` alias with a local dependency strategy (workspace package, vendored code, or published package).
- [ ] Either convert the ad-hoc `test*.ts` scripts into real Vitest tests or move them under an explicit `scripts/` folder.
- [ ] Clarify what “Transfer Engine” means in-app (import/export format + autosave UX) and either implement or rename it to match reality.

