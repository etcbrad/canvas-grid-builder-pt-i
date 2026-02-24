# Motion Expansion Playbook

Use this list to extend movement shortcuts while staying local-first.

## Core Macros

- `nudge_up` / `nudge_down`: direct root anchor movement
- `walk_left` / `walk_right`: alternating gait phase with arm counter-swing
- `run_left` / `run_right`: larger stride and stronger swing cadence
- `jump`: root impulse + limb target lift
- `crouch_enter` / `crouch_exit`: toggle pair for compressed stance
- `dash_left` / `dash_right`: horizontal impulse with lead-foot drive

## Advanced Macros

- `crouch_hold`: lower root, increase knee bend, keep feet planted
- `hop_left` / `hop_right`: lateral root impulse plus opposite arm swing
- `dash`: large horizontal root impulse with compact limb posture
- `stair_step`: one-foot lift with short forward root translation
- `climb_pull`: hand target raise plus root follow-through
- `recoil_back`: short backward root impulse after impact pose

## Shortcut Design Rules

- Keep one command per key in the base map.
- Use phase state for cyclical actions (`walk`, `run`, `climb`).
- Reserve modifier keys for precision variants.
- Keep constants grouped and named in a locomotion helper module.

## Stability Rules

- Update root world pin when translating the whole body.
- In IK, avoid changing too many targets at once on a single tap.
- In FK, keep shoulder/hip counter-motion balanced to prevent drift.
- Clamp extreme values and prefer small deltas across repeated taps.
