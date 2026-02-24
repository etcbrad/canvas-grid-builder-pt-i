import { describe, expect, it } from 'vitest';
import { bitruviusData as modelData } from './modelData';
import {
  applyFkAnimationOverlay,
  computeJointWorldForPose,
  computeWorldPoseForSkeleton,
  sampleFkAnimation,
} from './fkEngine';

describe('fkEngine', () => {
  it('computes deterministic joint world transforms with root offsets', () => {
    const basePose = {
      ...modelData.POSES['Neutral'],
      root: 0,
    };
    const world = computeJointWorldForPose(
      'l_elbow',
      modelData.JOINT_DEFS,
      basePose,
      [0, 0],
      { x: 10, y: -5, rotate: 0 }
    );
    expect(world.x).toBeCloseTo(-130, 5);
    expect(world.y).toBeCloseTo(-111, 5);
  });

  it('builds a full world map for all joints', () => {
    const worldMap = computeWorldPoseForSkeleton(
      modelData.JOINT_DEFS,
      modelData.POSES['T-Pose'],
      [0, 0]
    );

    expect(Object.keys(worldMap).length).toBe(Object.keys(modelData.JOINT_DEFS).length);
    expect(worldMap.head).toBeDefined();
    expect(worldMap.l_heel).toBeDefined();
  });

  it('samples keyframes using shortest-angle interpolation', () => {
    const pose = sampleFkAnimation(
      [
        { frame: 0, pose: { head: 170 } },
        { frame: 10, pose: { head: -170 } },
      ],
      5,
      { loop: false }
    );

    expect(pose.head).toBeCloseTo(-180, 5);
  });

  it('supports looped sampling and frame wrapping', () => {
    const pose = sampleFkAnimation(
      [
        { frame: 0, pose: { pelvis: 0 } },
        { frame: 10, pose: { pelvis: 90 } },
      ],
      14,
      { loop: true, frameCount: 12 }
    );

    expect(pose.pelvis).toBeCloseTo(18, 5);
  });

  it('applies FK animation overlay and respects limits', () => {
    const animated = applyFkAnimationOverlay(
      { ...modelData.POSES['T-Pose'], xiphoid: 0 },
      6,
      24,
      {
        enabled: true,
        preset: 'idle_breath',
        intensity: 1,
        speed: 1,
      },
      {
        xiphoid: { min: -1, max: 1 },
      }
    );

    expect(animated.xiphoid).toBeGreaterThanOrEqual(-1);
    expect(animated.xiphoid).toBeLessThanOrEqual(1);
  });
});
