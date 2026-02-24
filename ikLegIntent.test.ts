import { describe, expect, it } from 'vitest';
import { resolveLegIntent } from './ikLegIntent';

describe('ikLegIntent', () => {
  const jumpState = { active: false, phase: 'idle' as const, timerMs: 0 };

  it('walk intent creates opposite leg assist target', () => {
    const out = resolveLegIntent({
      mode: 'walk',
      activeChainId: 'l_leg',
      target: { x: 100, y: 200 },
      currentRotations: {},
      dtMs: 16,
      jumpState,
      jumpTrigger: false,
    });
    expect(out.counterpartTargets.r_leg).toBeDefined();
  });

  it('sit intent increases fold offsets', () => {
    const out = resolveLegIntent({
      mode: 'sit',
      activeChainId: 'l_leg',
      target: { x: 0, y: 0 },
      currentRotations: {},
      dtMs: 16,
      jumpState,
      jumpTrigger: false,
    });
    expect((out.rotationOffsets.l_knee ?? 0) > 0).toBe(true);
    expect((out.rotationOffsets.r_knee ?? 0) < 0).toBe(true);
  });

  it('kneel posture roll adds knee and hip offsets even without leg intent', () => {
    const out = resolveLegIntent({
      mode: 'none',
      activeChainId: 'l_arm',
      target: { x: 0, y: 0 },
      currentRotations: {},
      dtMs: 16,
      jumpState,
      jumpTrigger: false,
      postureState: 'kneel',
      postureRoll: 0.75,
    });
    expect((out.rotationOffsets.l_knee ?? 0) > 0).toBe(true);
    expect((out.rotationOffsets.r_knee ?? 0) < 0).toBe(true);
    expect((out.rotationOffsets.pelvis ?? 0) > 0).toBe(true);
  });

  it('ground sit posture roll drives stronger fold than kneel', () => {
    const kneel = resolveLegIntent({
      mode: 'none',
      activeChainId: 'l_leg',
      target: { x: 0, y: 0 },
      currentRotations: {},
      dtMs: 16,
      jumpState,
      jumpTrigger: false,
      postureState: 'kneel',
      postureRoll: 1,
    });
    const groundSit = resolveLegIntent({
      mode: 'none',
      activeChainId: 'l_leg',
      target: { x: 0, y: 0 },
      currentRotations: {},
      dtMs: 16,
      jumpState,
      jumpTrigger: false,
      postureState: 'ground_sit',
      postureRoll: 1,
    });
    expect(Math.abs(groundSit.rotationOffsets.l_knee ?? 0)).toBeGreaterThan(Math.abs(kneel.rotationOffsets.l_knee ?? 0));
    expect(Math.abs(groundSit.rotationOffsets.r_knee ?? 0)).toBeGreaterThan(Math.abs(kneel.rotationOffsets.r_knee ?? 0));
  });

  it('jump trigger enters active pulse and then decays', () => {
    const started = resolveLegIntent({
      mode: 'jump',
      activeChainId: 'l_leg',
      target: { x: 0, y: 0 },
      currentRotations: {},
      dtMs: 16,
      jumpState,
      jumpTrigger: true,
    });
    expect(started.jumpState.active).toBe(true);
    const progressed = resolveLegIntent({
      mode: 'jump',
      activeChainId: 'l_leg',
      target: { x: 0, y: 0 },
      currentRotations: {},
      dtMs: 400,
      jumpState: started.jumpState,
      jumpTrigger: false,
    });
    expect(
      progressed.jumpState.phase === 'launch' ||
      progressed.jumpState.phase === 'recover' ||
      progressed.jumpState.phase === 'idle'
    ).toBe(true);
  });

  it('weight shift biases pelvis and knees for lateral posing', () => {
    const out = resolveLegIntent({
      mode: 'none',
      activeChainId: 'core',
      target: { x: 0, y: 0 },
      currentRotations: {},
      dtMs: 16,
      jumpState,
      jumpTrigger: false,
      weightShiftLateral: 0.8,
    });
    expect((out.rotationOffsets.pelvis ?? 0) > 0).toBe(true);
    expect((out.rotationOffsets.l_knee ?? 0) > 0).toBe(true);
  });

  it('back pose direction adds upper-body turn offsets', () => {
    const out = resolveLegIntent({
      mode: 'none',
      activeChainId: 'core',
      target: { x: 0, y: 0 },
      currentRotations: {},
      dtMs: 16,
      jumpState,
      jumpTrigger: false,
      poseDirection: 'back',
    });
    expect((out.rotationOffsets.collar ?? 0) > 0).toBe(true);
    expect((out.rotationOffsets.neck ?? 0) > 0).toBe(true);
  });
});
