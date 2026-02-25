import { describe, expect, it } from 'vitest';
import { applyIkGravityHold } from './ikGravityHold';

describe('ikGravityHold', () => {
  it('compensates shoulders by inverse collar delta when arm hold is enabled', () => {
    const current = { collar: 10, l_shoulder: 20, r_shoulder: -15 };
    const solved = { ...current, collar: 30, l_shoulder: 35, r_shoulder: -5 };
    const out = applyIkGravityHold({
      currentRotations: current,
      solvedRotations: solved,
      toggles: { ikGravityArmHoldEnabled: true, ikGravityLegHoldEnabled: false },
    });
    expect(out.l_shoulder).toBe(15);
    expect(out.r_shoulder).toBe(-25);
  });

  it('compensates hips by inverse pelvis delta when leg hold is enabled', () => {
    const current = { pelvis: -15, l_hip: 40, r_hip: -40 };
    const solved = { ...current, pelvis: 5, l_hip: 50, r_hip: -20 };
    const out = applyIkGravityHold({
      currentRotations: current,
      solvedRotations: solved,
      toggles: { ikGravityArmHoldEnabled: false, ikGravityLegHoldEnabled: true },
    });
    expect(out.l_hip).toBe(30);
    expect(out.r_hip).toBe(-40);
  });

  it('keeps arm and leg gravity hold toggles independent', () => {
    const current = { collar: 0, pelvis: 0, l_shoulder: 10, r_shoulder: 10, l_hip: 20, r_hip: -20 };
    const solved = { ...current, collar: 20, pelvis: -30, l_shoulder: 30, r_shoulder: 40, l_hip: 25, r_hip: -25 };
    const out = applyIkGravityHold({
      currentRotations: current,
      solvedRotations: solved,
      toggles: { ikGravityArmHoldEnabled: false, ikGravityLegHoldEnabled: true },
    });
    expect(out.l_shoulder).toBe(30);
    expect(out.r_shoulder).toBe(40);
    expect(out.l_hip).toBe(55);
    expect(out.r_hip).toBe(5);
  });

  it('normalizes angle wraparound near bounds', () => {
    const current = { collar: 170, pelvis: -175, l_shoulder: -170, r_shoulder: 170, l_hip: 160, r_hip: -170 };
    const solved = { ...current, collar: -170, pelvis: 175, l_shoulder: -165, r_shoulder: 175, l_hip: 165, r_hip: -165 };
    const out = applyIkGravityHold({
      currentRotations: current,
      solvedRotations: solved,
      toggles: { ikGravityArmHoldEnabled: true, ikGravityLegHoldEnabled: true },
    });
    expect(out.l_shoulder).toBe(175);
    expect(out.r_shoulder).toBe(155);
    expect(out.l_hip).toBe(175);
    expect(out.r_hip).toBe(-155);
  });

  it('returns solved rotations when both holds are disabled', () => {
    const solved = { collar: 25, pelvis: -10, l_shoulder: 12, r_shoulder: -12, l_hip: 22, r_hip: -22 };
    const out = applyIkGravityHold({
      currentRotations: { collar: 0, pelvis: 0, l_shoulder: 0, r_shoulder: 0, l_hip: 0, r_hip: 0 },
      solvedRotations: solved,
      toggles: { ikGravityArmHoldEnabled: false, ikGravityLegHoldEnabled: false },
    });
    expect(out).toEqual(solved);
  });
});
