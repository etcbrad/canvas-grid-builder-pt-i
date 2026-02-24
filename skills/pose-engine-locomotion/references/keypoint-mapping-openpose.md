# Keypoint Mapping (OpenPose / DragonPose Style)

Use this reference when converting 2D keypoint tracks into local rig actions.

## Suggested Joint Mapping

- `root`: midpoint of left and right hip keypoints
- `waist`: slightly above root along root->neck direction
- `collar`: shoulder midpoint
- `neck`: OpenPose neck keypoint
- `l_shoulder`, `l_elbow`, `l_hand`: left shoulder, elbow, wrist
- `r_shoulder`, `r_elbow`, `r_hand`: right shoulder, elbow, wrist
- `l_hip`, `l_knee`, `l_foot`: left hip, knee, ankle
- `r_hip`, `r_knee`, `r_foot`: right hip, knee, ankle

## Coordinate and Scale Normalization

1. Translate all keypoints so hip midpoint becomes origin.
2. Estimate body scale from shoulder width or hip-to-neck distance.
3. Convert pixel units into rig units using a fixed scalar.
4. Smooth with an exponential filter before writing targets.

## Confidence and Noise Handling

- Ignore keypoints with confidence below a threshold (for example `0.2`).
- Hold last valid point for short dropouts.
- Decay toward neutral pose if a chain is missing for long spans.

## Motion Phase Extraction

Derive reusable phases from keypoint time series:

- Walk: contact -> passing -> contact (opposite side) -> passing
- Jump: crouch -> launch -> apex -> landing
- Step-up: plant -> lift -> transfer -> settle

Convert phases into shortcut macros instead of frame-by-frame imperative logic.
