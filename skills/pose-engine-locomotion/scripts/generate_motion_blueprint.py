#!/usr/bin/env python3
"""Generate local locomotion blueprint payloads for FK/IK shortcut tuning."""

from __future__ import annotations

import argparse
import json
from typing import Any, Dict


Action = str
Mode = str


def _walk_payload(direction: int, mode: Mode, stride: float, lift: float) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "root_delta": {
            "x": direction * stride * 0.55,
            "y": 0,
        },
        "notes": [
            "Use alternating gait phase state for repeated walk commands.",
            "Direction +1 means right/forward; -1 means left/backward.",
        ],
    }

    if mode == "ik":
        payload["ik_targets"] = {
            "swing_foot": {"dx": direction * stride, "dy": -lift},
            "plant_foot": {"dx": -direction * stride * 0.3, "dy": 0},
            "lead_hand": {"dx": direction * stride * 0.5, "dy": -lift * 0.3},
            "trail_hand": {"dx": -direction * stride * 0.5, "dy": lift * 0.15},
        }
    else:
        payload["fk_rotations_deg"] = {
            "l_hip": -34 * direction,
            "r_hip": 10 * direction,
            "l_knee": 24,
            "r_knee": -18,
            "l_shoulder": 22 * direction,
            "r_shoulder": -22 * direction,
        }

    return payload


def _run_payload(direction: int, mode: Mode, stride: float, lift: float) -> Dict[str, Any]:
    run_stride = stride * 1.65
    run_lift = lift * 1.3
    payload: Dict[str, Any] = {
        "root_delta": {
            "x": direction * run_stride * 0.54,
            "y": 0,
        },
        "notes": [
            "Use a separate run phase state from walk for cleaner cadence.",
            "Tune run_lift first if feet over-penetrate ground.",
        ],
    }

    if mode == "ik":
        payload["ik_targets"] = {
            "swing_foot": {"dx": direction * run_stride, "dy": -run_lift},
            "plant_foot": {"dx": -direction * run_stride * 0.32, "dy": 0},
            "lead_hand": {"dx": direction * run_stride * 0.54, "dy": -run_lift * 0.42},
            "trail_hand": {"dx": -direction * run_stride * 0.54, "dy": run_lift * 0.2},
        }
    else:
        payload["fk_rotations_deg"] = {
            "l_hip": -52 * direction,
            "r_hip": 18 * direction,
            "l_knee": 40,
            "r_knee": -28,
            "l_shoulder": 34 * direction,
            "r_shoulder": -34 * direction,
        }

    return payload


def _jump_payload(mode: Mode, jump_height: float) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "root_delta": {
            "x": 0,
            "y": -jump_height,
        },
        "notes": [
            "Apply this as a tap impulse; use a separate landing command or gravity pass to settle.",
        ],
    }

    if mode == "ik":
        payload["ik_targets"] = {
            "l_foot": {"dx": -8, "dy": -jump_height * 0.57},
            "r_foot": {"dx": 8, "dy": -jump_height * 0.57},
            "l_hand": {"dx": -12, "dy": -jump_height * 0.75},
            "r_hand": {"dx": 12, "dy": -jump_height * 0.75},
        }
    else:
        payload["fk_rotations_deg"] = {
            "l_hip": -42,
            "r_hip": 42,
            "l_knee": 34,
            "r_knee": -34,
            "l_shoulder": -78,
            "r_shoulder": 78,
        }

    return payload


def _nudge_payload(dx: float, dy: float) -> Dict[str, Any]:
    return {
        "root_delta": {"x": dx, "y": dy},
        "notes": ["Nudge commands should be repeatable and small in magnitude."],
    }


def _crouch_payload(enter: bool, crouch_drop: float) -> Dict[str, Any]:
    return {
        "root_delta": {"x": 0, "y": crouch_drop if enter else -crouch_drop},
        "notes": [
            "Treat crouch as a toggle pair: crouch_enter then crouch_exit.",
        ],
        "fk_rotations_deg": {
            "torso": 18 if enter else 0,
            "l_hip": -22 if enter else -18,
            "r_hip": 22 if enter else 18,
            "l_knee": 62 if enter else 0,
            "r_knee": -62 if enter else 0,
        },
    }


def _dash_payload(direction: int, dash_distance: float) -> Dict[str, Any]:
    return {
        "root_delta": {"x": direction * dash_distance, "y": -6},
        "notes": [
            "Dash should be a single non-repeating impulse.",
        ],
        "ik_targets": {
            "lead_foot": {"dx": direction * (dash_distance * 0.53), "dy": -4},
            "trail_foot": {"dx": -direction * 12, "dy": 0},
            "lead_hand": {"dx": direction * 30, "dy": -12},
            "trail_hand": {"dx": -direction * 30, "dy": 6},
        },
    }


def build_payload(
    action: Action,
    mode: Mode,
    stride: float,
    lift: float,
    jump_height: float,
    nudge_step: float,
    crouch_drop: float,
    dash_distance: float,
) -> Dict[str, Any]:
    if action == "nudge_up":
        return _nudge_payload(0, -nudge_step)
    if action == "nudge_down":
        return _nudge_payload(0, nudge_step)
    if action == "walk_left":
        return _walk_payload(direction=-1, mode=mode, stride=stride, lift=lift)
    if action == "walk_right":
        return _walk_payload(direction=1, mode=mode, stride=stride, lift=lift)
    if action == "run_left":
        return _run_payload(direction=-1, mode=mode, stride=stride, lift=lift)
    if action == "run_right":
        return _run_payload(direction=1, mode=mode, stride=stride, lift=lift)
    if action == "jump":
        return _jump_payload(mode=mode, jump_height=jump_height)
    if action == "crouch_enter":
        return _crouch_payload(enter=True, crouch_drop=crouch_drop)
    if action == "crouch_exit":
        return _crouch_payload(enter=False, crouch_drop=crouch_drop)
    if action == "dash_left":
        return _dash_payload(direction=-1, dash_distance=dash_distance)
    if action == "dash_right":
        return _dash_payload(direction=1, dash_distance=dash_distance)
    raise ValueError(f"Unsupported action: {action}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a local movement blueprint for pose-engine locomotion shortcuts."
    )
    parser.add_argument(
        "--action",
        required=True,
        choices=[
            "nudge_up",
            "nudge_down",
            "walk_left",
            "walk_right",
            "run_left",
            "run_right",
            "jump",
            "crouch_enter",
            "crouch_exit",
            "dash_left",
            "dash_right",
        ],
        help="Shortcut action to scaffold.",
    )
    parser.add_argument(
        "--mode",
        choices=["ik", "fk"],
        default="ik",
        help="Target control mode for generated values.",
    )
    parser.add_argument(
        "--stride",
        type=float,
        default=34.0,
        help="Walk stride in world units (for walk actions).",
    )
    parser.add_argument(
        "--lift",
        type=float,
        default=26.0,
        help="Vertical foot lift in world units (for walk actions).",
    )
    parser.add_argument(
        "--jump-height",
        type=float,
        default=56.0,
        help="Jump height in world units (for jump action).",
    )
    parser.add_argument(
        "--nudge-step",
        type=float,
        default=14.0,
        help="Root nudge step for nudge actions.",
    )
    parser.add_argument(
        "--crouch-drop",
        type=float,
        default=28.0,
        help="Root drop amount for crouch actions.",
    )
    parser.add_argument(
        "--dash-distance",
        type=float,
        default=64.0,
        help="Horizontal dash distance in world units.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = build_payload(
        action=args.action,
        mode=args.mode,
        stride=args.stride,
        lift=args.lift,
        jump_height=args.jump_height,
        nudge_step=args.nudge_step,
        crouch_drop=args.crouch_drop,
        dash_distance=args.dash_distance,
    )
    print(
        json.dumps(
            {
                "action": args.action,
                "mode": args.mode,
                "payload": payload,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
