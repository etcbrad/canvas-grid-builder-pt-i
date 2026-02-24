import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEGMENT_IK_TWEEN_SETTINGS,
  pruneSegmentIkTweenMap,
  sampleIkTweenPreviewPose,
  segmentKey,
  type SegmentIkTweenMap,
  type SegmentIkTweenSettings,
} from './animationIkTween';
import { createInterpolator } from './adapters/poseInterpolator';
import { bitruviusData as modelData, type SkeletonRotations } from './modelData';
import { linear } from './easing';

interface FakeClip {
  sampleFrame: (frame: number) => SkeletonRotations;
  getKeyframes: () => Array<{ id: string; frame: number; pose: SkeletonRotations }>;
}

const createClip = (
  keyframes: Array<{ frame: number; pose: SkeletonRotations }>,
  frameCount: number = 60
): FakeClip => {
  const interpolate = createInterpolator(linear);
  const normalized = keyframes
    .map((keyframe) => ({
      id: `frame-${Math.round(keyframe.frame)}`,
      frame: Math.round(keyframe.frame),
      pose: keyframe.pose,
    }))
    .sort((a, b) => a.frame - b.frame);

  const sampleFrame = (frame: number): SkeletonRotations => {
    if (!normalized.length) {
      return {};
    }
    if (normalized.length === 1) {
      return normalized[0].pose;
    }
    const safeFrameCount = Math.max(1, Math.round(frameCount));
    const wrapped = ((frame % safeFrameCount) + safeFrameCount) % safeFrameCount;
    for (let index = 0; index < normalized.length - 1; index += 1) {
      const from = normalized[index];
      const to = normalized[index + 1];
      if (wrapped >= from.frame && wrapped < to.frame) {
        const span = Math.max(1, to.frame - from.frame);
        const t = (wrapped - from.frame) / span;
        return interpolate(from.pose, to.pose, t);
      }
    }
    if (wrapped >= normalized[normalized.length - 1].frame) {
      return normalized[normalized.length - 1].pose;
    }
    return normalized[0].pose;
  };

  return {
    sampleFrame,
    getKeyframes: () => normalized.map((keyframe) => ({ ...keyframe, pose: { ...keyframe.pose } })),
  };
};

const withBasePose = (patch: Partial<SkeletonRotations>): SkeletonRotations => ({
  ...modelData.POSES['T-Pose'],
  ...patch,
});

const delta = (a: number, b: number): number => Math.abs(a - b);

const buildSettings = (patch: Partial<SegmentIkTweenSettings>): SegmentIkTweenSettings => ({
  ...DEFAULT_SEGMENT_IK_TWEEN_SETTINGS,
  ...patch,
});

const sampleWithSettings = (
  clip: FakeClip,
  currentFrame: number,
  settings: SegmentIkTweenSettings
): SkeletonRotations => {
  const keyframes = clip.getKeyframes()
    .filter((keyframe) => typeof keyframe.frame === 'number')
    .sort((a, b) => a.frame - b.frame);
  const from = keyframes[0]?.frame ?? 0;
  const to = keyframes[1]?.frame ?? from + 1;
  const key = segmentKey(from, to);
  const map: SegmentIkTweenMap = {
    [key]: settings,
  };
  return sampleIkTweenPreviewPose({
    clip,
    currentFrame,
    easingFn: linear,
    segmentIkTweenMap: map,
    bitruviusData: modelData,
  });
};

describe('animationIkTween', () => {
  it('returns FK sample when segment IK tween is disabled', () => {
    const clip = createClip([
      { frame: 0, pose: withBasePose({ l_shoulder: -25, l_elbow: -20 }) },
      { frame: 20, pose: withBasePose({ l_shoulder: -85, l_elbow: -95 }) },
    ]);
    const sample = sampleWithSettings(clip, 10, buildSettings({ enabled: false }));
    expect(sample).toEqual(clip.sampleFrame(10));
  });

  it('returns FK sample when influence is zero', () => {
    const clip = createClip([
      { frame: 0, pose: withBasePose({ l_shoulder: -15, l_elbow: -10 }) },
      { frame: 20, pose: withBasePose({ l_shoulder: -90, l_elbow: -120 }) },
    ]);
    const sample = sampleWithSettings(clip, 10, buildSettings({
      enabled: true,
      influence: 0,
      includeHands: true,
      includeFeet: false,
      includeHead: false,
    }));
    expect(sample).toEqual(clip.sampleFrame(10));
  });

  it('hands-only solving changes arm chain while keeping untouched chains near FK', () => {
    const clip = createClip([
      { frame: 0, pose: withBasePose({ l_shoulder: -10, l_elbow: -15, l_palm: -5 }) },
      {
        frame: 20,
        pose: withBasePose({
          l_shoulder: -135,
          l_elbow: -100,
          l_palm: 45,
          pelvis: 4,
          l_hip: -12,
          r_hip: 12,
        }),
      },
    ]);

    const fk = clip.sampleFrame(10);
    const ik = sampleWithSettings(clip, 10, buildSettings({
      enabled: true,
      influence: 1,
      solveMode: 'single_chain',
      includeHands: true,
      includeFeet: false,
      includeHead: false,
      solver: 'fabrik',
    }));

    expect(delta(ik.l_shoulder ?? 0, fk.l_shoulder ?? 0)).toBeGreaterThan(0.4);
    expect(delta(ik.l_elbow ?? 0, fk.l_elbow ?? 0)).toBeGreaterThan(0.4);
    expect(delta(ik.l_hip ?? 0, fk.l_hip ?? 0)).toBeLessThan(0.25);
    expect(delta(ik.r_hip ?? 0, fk.r_hip ?? 0)).toBeLessThan(0.25);
  });

  it('whole-body graph scope involves broader chains than single-chain mode', () => {
    const clip = createClip([
      {
        frame: 0,
        pose: withBasePose({
          l_shoulder: -12,
          l_elbow: -14,
          xiphoid: 0,
          spine_b: 0,
          neck: 0,
          head: 0,
        }),
      },
      {
        frame: 24,
        pose: withBasePose({
          l_shoulder: -132,
          l_elbow: -96,
          l_palm: 48,
          xiphoid: 20,
          spine_b: 18,
          neck: 24,
          head: -22,
        }),
      },
    ]);

    const fk = clip.sampleFrame(12);
    const single = sampleWithSettings(clip, 12, buildSettings({
      enabled: true,
      influence: 1,
      solveMode: 'single_chain',
      includeHands: true,
      includeFeet: false,
      includeHead: false,
      solver: 'hybrid',
    }));
    const whole = sampleWithSettings(clip, 12, buildSettings({
      enabled: true,
      influence: 1,
      solveMode: 'whole_body_graph',
      includeHands: true,
      includeFeet: false,
      includeHead: false,
      solver: 'hybrid',
    }));

    const singleCoreDrift =
      delta(single.xiphoid ?? 0, fk.xiphoid ?? 0) +
      delta(single.spine_b ?? 0, fk.spine_b ?? 0) +
      delta(single.neck ?? 0, fk.neck ?? 0);
    const wholeCoreDrift =
      delta(whole.xiphoid ?? 0, fk.xiphoid ?? 0) +
      delta(whole.spine_b ?? 0, fk.spine_b ?? 0) +
      delta(whole.neck ?? 0, fk.neck ?? 0);

    expect(wholeCoreDrift).toBeGreaterThan(singleCoreDrift + 0.35);
  });

  it('supports fabrik, ccd, and hybrid solvers with finite output', () => {
    const clip = createClip([
      { frame: 0, pose: withBasePose({ l_shoulder: -20, l_elbow: -20 }) },
      { frame: 20, pose: withBasePose({ l_shoulder: -120, l_elbow: -90, l_palm: 35 }) },
    ]);

    (['fabrik', 'ccd', 'hybrid'] as const).forEach((solver) => {
      const sample = sampleWithSettings(clip, 9, buildSettings({
        enabled: true,
        influence: 1,
        solver,
        solveMode: 'single_chain',
        includeHands: true,
        includeFeet: true,
        includeHead: false,
      }));
      expect(Object.values(sample).every((value) => Number.isFinite(value))).toBe(true);
    });
  });

  it('respects joint limits when enabled and allows wider angles when disabled', () => {
    const clip = createClip([
      { frame: 0, pose: withBasePose({ l_shoulder: -15, l_elbow: -10, l_palm: 0 }) },
      {
        frame: 20,
        pose: withBasePose({
          l_shoulder: -250,
          l_elbow: -220,
          l_palm: 160,
          xiphoid: 26,
        }),
      },
    ]);

    const constrained = sampleWithSettings(clip, 18, buildSettings({
      enabled: true,
      influence: 1,
      solveMode: 'single_chain',
      includeHands: true,
      includeFeet: false,
      includeHead: false,
      enforceJointLimits: true,
      solver: 'fabrik',
    }));
    const unconstrained = sampleWithSettings(clip, 18, buildSettings({
      enabled: true,
      influence: 1,
      solveMode: 'single_chain',
      includeHands: true,
      includeFeet: false,
      includeHead: false,
      enforceJointLimits: false,
      solver: 'fabrik',
    }));

    const shoulderLimit = modelData.JOINT_LIMITS.l_shoulder;
    expect((constrained.l_shoulder ?? 0)).toBeGreaterThanOrEqual(shoulderLimit.min - 1e-6);
    expect((constrained.l_shoulder ?? 0)).toBeLessThanOrEqual(shoulderLimit.max + 1e-6);

    const unconstrainedExceeds = (
      (unconstrained.l_shoulder ?? 0) < shoulderLimit.min - 0.5 ||
      (unconstrained.l_shoulder ?? 0) > shoulderLimit.max + 0.5 ||
      delta(unconstrained.l_elbow ?? 0, constrained.l_elbow ?? 0) > 0.5
    );
    expect(unconstrainedExceeds).toBe(true);
  });

  it('prunes stale segment keys', () => {
    const map: SegmentIkTweenMap = {
      '0->10': buildSettings({ enabled: true, influence: 0.55 }),
      '10->20': buildSettings({ enabled: true, influence: 0.75 }),
      '20->30': buildSettings({ enabled: false, influence: 0.4 }),
    };

    const pruned = pruneSegmentIkTweenMap(map, ['10->20']);
    expect(Object.keys(pruned)).toEqual(['10->20']);
    expect(pruned['10->20'].influence).toBeCloseTo(0.75, 6);
  });
});
