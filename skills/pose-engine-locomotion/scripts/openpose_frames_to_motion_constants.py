#!/usr/bin/env python3
"""Derive locomotion constants from local OpenPose-style keypoint JSON frames."""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


COCO_PARTS: List[str] = [
    "nose",
    "neck",
    "r_shoulder",
    "r_elbow",
    "r_wrist",
    "l_shoulder",
    "l_elbow",
    "l_wrist",
    "r_hip",
    "r_knee",
    "r_ankle",
    "l_hip",
    "l_knee",
    "l_ankle",
    "r_eye",
    "l_eye",
    "r_ear",
    "l_ear",
]

XYC = Tuple[float, float, float]
Frame = Dict[str, Any]


def _median(values: Sequence[float], fallback: float) -> float:
    clean = [v for v in values if isinstance(v, (int, float))]
    if not clean:
        return fallback
    return float(statistics.median(clean))


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _extract_people_entry(frame: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(frame, dict):
        return None
    if "people" in frame and isinstance(frame["people"], list):
        if not frame["people"]:
            return None
        person = frame["people"][0]
        if isinstance(person, dict):
            return person
        return None
    return frame


def _extract_keypoints_array(frame: Any) -> Optional[List[float]]:
    person = _extract_people_entry(frame)
    if not person:
        return None
    key = "pose_keypoints_2d"
    arr = person.get(key)
    if not isinstance(arr, list):
        return None
    if len(arr) < len(COCO_PARTS) * 3:
        return None
    return [float(v) for v in arr]


def _load_frames(payload: Any) -> List[List[float]]:
    if isinstance(payload, dict) and isinstance(payload.get("frames"), list):
        items = payload["frames"]
    elif isinstance(payload, list):
        items = payload
    else:
        items = [payload]

    frames: List[List[float]] = []
    for item in items:
        arr = _extract_keypoints_array(item)
        if arr:
            frames.append(arr)
    return frames


def _part(frame: List[float], name: str) -> Optional[XYC]:
    idx = COCO_PARTS.index(name) * 3
    x, y, c = frame[idx], frame[idx + 1], frame[idx + 2]
    if c <= 0:
        return None
    return x, y, c


def _midpoint(a: Optional[XYC], b: Optional[XYC], min_conf: float) -> Optional[Tuple[float, float]]:
    if not a or not b:
        return None
    if a[2] < min_conf or b[2] < min_conf:
        return None
    return ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5)


def _stride_stats(hip_x: Sequence[float]) -> Tuple[float, float]:
    deltas = [hip_x[i + 1] - hip_x[i] for i in range(len(hip_x) - 1)]
    abs_deltas = [abs(d) for d in deltas if abs(d) > 1e-6]
    walk_stride = _median(abs_deltas, 30.0) * 2.1
    run_stride = walk_stride * 1.65
    return walk_stride, run_stride


def _dash_distance(hip_x: Sequence[float]) -> float:
    deltas = sorted(abs(hip_x[i + 1] - hip_x[i]) for i in range(len(hip_x) - 1))
    if not deltas:
        return 64.0
    p90_index = int(0.9 * (len(deltas) - 1))
    return max(48.0, deltas[p90_index] * 4.5)


def derive_motion_constants(frames: List[List[float]], min_conf: float) -> Dict[str, float]:
    hip_midpoints: List[Tuple[float, float]] = []
    shoulder_midpoints: List[Tuple[float, float]] = []

    for frame in frames:
        l_hip = _part(frame, "l_hip")
        r_hip = _part(frame, "r_hip")
        l_shoulder = _part(frame, "l_shoulder")
        r_shoulder = _part(frame, "r_shoulder")

        hip_mid = _midpoint(l_hip, r_hip, min_conf)
        shoulder_mid = _midpoint(l_shoulder, r_shoulder, min_conf)
        if hip_mid:
            hip_midpoints.append(hip_mid)
        if shoulder_mid:
            shoulder_midpoints.append(shoulder_mid)

    if len(hip_midpoints) < 2:
        raise ValueError("Not enough confident hip samples to derive motion constants.")

    hip_x = [p[0] for p in hip_midpoints]
    hip_y = [p[1] for p in hip_midpoints]
    walk_stride, run_stride = _stride_stats(hip_x)
    dash_distance = _dash_distance(hip_x)

    baseline_hip_y = _median(hip_y, hip_y[0])
    min_hip_y = min(hip_y)
    max_hip_y = max(hip_y)
    jump_height_px = max(12.0, baseline_hip_y - min_hip_y)
    crouch_drop_px = max(10.0, max_hip_y - baseline_hip_y)

    shoulder_y = [p[1] for p in shoulder_midpoints] if shoulder_midpoints else hip_y
    upper_motion = _median([abs(hip_y[i] - shoulder_y[min(i, len(shoulder_y) - 1)]) for i in range(len(hip_y))], 80.0)

    # Convert image-space deltas into engine-friendly defaults.
    # This ratio is intentionally conservative and should be tuned on import output.
    px_to_world = 0.42

    constants = {
        "WALK_SWING_FORWARD_PX": _clamp(walk_stride * px_to_world, 20.0, 72.0),
        "WALK_SWING_LIFT_PX": _clamp(jump_height_px * px_to_world * 0.42, 14.0, 42.0),
        "RUN_SWING_FORWARD_PX": _clamp(run_stride * px_to_world, 34.0, 112.0),
        "RUN_SWING_LIFT_PX": _clamp(jump_height_px * px_to_world * 0.58, 20.0, 64.0),
        "JUMP_HEIGHT_PX": _clamp(jump_height_px * px_to_world, 24.0, 120.0),
        "CROUCH_ROOT_DROP_PX": _clamp(crouch_drop_px * px_to_world, 16.0, 56.0),
        "DASH_ROOT_ADVANCE_PX": _clamp(dash_distance * px_to_world, 42.0, 140.0),
        "DASH_FOOT_DRIVE_PX": _clamp(dash_distance * px_to_world * 0.5, 24.0, 74.0),
        "ROOT_NUDGE_STEP_PX": _clamp(_median([abs(x) for x in [walk_stride * px_to_world * 0.18]], 14.0), 8.0, 26.0),
        "REFERENCE_BODY_SPAN_PX": _clamp(upper_motion, 40.0, 240.0),
    }
    return {k: round(v, 2) for k, v in constants.items()}


def _render_ts(constants: Dict[str, float]) -> str:
    lines = ["// Generated from OpenPose-style frames", "export const LOCOMOTION_TUNING = {"]
    for key, value in constants.items():
        lines.append(f"  {key}: {value},")
    lines.append("} as const;")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert local OpenPose keypoint frames into locomotion constants."
    )
    parser.add_argument("input", help="Path to JSON file containing OpenPose-style frame data.")
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.2,
        help="Minimum keypoint confidence for frame usage.",
    )
    parser.add_argument(
        "--format",
        choices=["json", "ts"],
        default="ts",
        help="Output format.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = _load_json(Path(args.input))
    frames = _load_frames(payload)
    if not frames:
        raise SystemExit("No valid OpenPose-style frames found in input.")
    constants = derive_motion_constants(frames, min_conf=args.min_confidence)
    if args.format == "json":
        print(json.dumps(constants, indent=2, sort_keys=True))
    else:
        print(_render_ts(constants))


if __name__ == "__main__":
    main()
