import { describe, expect, it } from 'vitest';
import { applyHumanAssist } from './ikHumanAssist';

describe('ikHumanAssist', () => {
  it('returns solved rotations unchanged for non-supported chains', () => {
    const base = { l_shoulder: 0, l_elbow: 0, l_palm: 0 };
    const solved = { ...base, l_shoulder: 12 };
    const out = applyHumanAssist({
      activeChainId: 'core',
      currentRotations: base,
      solvedRotations: solved,
      previousRotations: base,
      toggles: {},
      dtMs: 16,
    });
    expect(out).toEqual(solved);
  });

  it('applies opposite-side response when assist styles are enabled', () => {
    const current = { l_shoulder: 0, l_elbow: 0, l_palm: 0, r_shoulder: 0, r_elbow: 0, r_palm: 0, collar: 0, neck: 0 };
    const solved = { ...current, l_shoulder: 20, l_elbow: -10, l_palm: 8 };
    const out = applyHumanAssist({
      activeChainId: 'l_arm',
      currentRotations: current,
      solvedRotations: solved,
      previousRotations: current,
      toggles: {
        humanCounterbalanceEnabled: true,
        humanMirrorEnabled: true,
        humanFollowThroughEnabled: true,
        humanCollarNeckFollowEnabled: true,
      },
      dtMs: 16,
    });
    expect(Math.abs((out.r_shoulder ?? 0) - (solved.r_shoulder ?? 0))).toBeGreaterThan(0.01);
    expect(Math.abs((out.collar ?? 0) - (solved.collar ?? 0))).toBeGreaterThan(0.01);
    expect(Math.abs((out.neck ?? 0) - (solved.neck ?? 0))).toBeGreaterThan(0.01);
  });

  it('keeps combined assist bounded per frame', () => {
    const current = { l_shoulder: 0, l_elbow: 0, l_palm: 0, r_shoulder: 0, r_elbow: 0, r_palm: 0 };
    const solved = { ...current, l_shoulder: 100, l_elbow: 100, l_palm: 100 };
    const out = applyHumanAssist({
      activeChainId: 'l_arm',
      currentRotations: current,
      solvedRotations: solved,
      previousRotations: current,
      toggles: {
        humanCounterbalanceEnabled: true,
        humanMirrorEnabled: true,
        humanFollowThroughEnabled: true,
      },
      dtMs: 16,
    });
    expect(Math.abs(out.r_shoulder ?? 0)).toBeLessThanOrEqual(4.1);
    expect(Math.abs(out.r_elbow ?? 0)).toBeLessThanOrEqual(4.1);
  });
});

