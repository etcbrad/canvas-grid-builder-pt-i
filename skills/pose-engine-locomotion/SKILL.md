---
name: pose-engine-locomotion
description: Expand a local 2D pose engine with locomotion and movement shortcuts. Use when adding or tuning keyboard-driven actions (move up/down, walk, jump, strafes, crouch), implementing rig-aware motion macros in FK/IK, mapping OpenPose or DragonPose-style keypoints into engine joints, or validating new movement behavior entirely offline.
---

# Pose Engine Locomotion

Use this skill to add expressive movement without introducing remote services.

## Workflow

1. Identify the control surface.
- Start in shortcut wiring files (for this repo: `src/features/interaction/shortcuts.ts` and mode-level key handlers).
- Confirm where locomotion effects should apply (FK, IK, or both).

2. Choose one movement pattern.
- `nudge`: small root translation (up/down/left/right).
- `walk-step`: alternating gait phase with root drift + limb swing.
- `jump`: root lift + coordinated limb targets/rotations.
- `special`: crouch, hop, dash, recoil, climb, or ladder step.

3. Encode movement as deterministic macro logic.
- Keep movement constants explicit and tunable (`stride`, `lift`, `bob`, `height`).
- Prefer a single locomotion helper module and call it from keyboard/UI handlers.
- Preserve local-first behavior: no network calls, no cloud model dependency.

4. Support both IK and FK where practical.
- In IK mode, drive `ikSetTarget` for effectors and move the root anchor.
- In FK mode, apply rotation patches plus root anchor movement.
- Keep root anchoring stable by updating world root pin values when needed.

5. Add discoverability.
- Show shortcut hints in the mode panel.
- Prevent default browser behavior for movement keys that scroll (`Arrow*`, `Space`).

6. Validate quickly.
- Run typecheck, tests, and build for the target package before finishing.

## OpenPose / DragonPose-Inspired Transfer

Use external pose systems as reference shape generators, then map them locally.

1. Load [references/keypoint-mapping-openpose.md](references/keypoint-mapping-openpose.md) when keypoint data is part of the request.
2. Load [references/lotte-reiniger-cutout-directives.md](references/lotte-reiniger-cutout-directives.md) when asked for cutout style, silhouette animation, shadow-theatre look, or Reiniger-like movement grammar.
3. Normalize coordinates to engine world units before writing joint targets.
4. Gate low-confidence joints and blend toward prior frame state.
5. Convert raw frame deltas into reusable macros (walk, jump, crouch) instead of one-off hardcoded values.

Use dragonpose-style timeline blocking heuristics:
- Capture contact pose, passing pose, recoil, and up pose for walk.
- Capture anticipatory crouch, launch, apex, and landing for jump.
- Reuse these phases as shortcut-driven state machines.

## Local Script

Use `scripts/generate_motion_blueprint.py` to scaffold movement payloads quickly:

```bash
python3 scripts/generate_motion_blueprint.py --action walk_right --mode ik
python3 scripts/generate_motion_blueprint.py --action jump --mode fk --jump-height 64
python3 scripts/generate_motion_blueprint.py --action run_right --mode ik
python3 scripts/generate_motion_blueprint.py --action dash_left --mode ik
```

Treat script output as a starting point, then tune constants against real rig behavior.

Use `scripts/openpose_frames_to_motion_constants.py` when OpenPose-style JSON tracks are available:

```bash
python3 scripts/openpose_frames_to_motion_constants.py ./openpose_frames.json --format ts
python3 scripts/openpose_frames_to_motion_constants.py ./openpose_frames.json --format json
```

Paste generated constants into your locomotion helper and re-run local validation.

## Validation Checklist

- Confirm shortcuts trigger in the intended mode(s).
- Confirm no browser scroll side effects on arrow/space keys.
- Confirm root anchoring remains stable after repeated movement.
- Confirm locomotion still works with existing pins/constraints enabled.
- Run package `typecheck`, `test`, and `build`.
