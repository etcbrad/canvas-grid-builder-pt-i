import type { PoseKeyframe } from 'pose-to-pose-engine/types';
import type { EasingFn } from './easing';
import { computeJointWorldForPose, computeWorldPoseForSkeleton, type RootTransform } from './fkEngine';
import { solveIK_AdvancedWithResult } from './ikSolver';
import type { BitruviusData, SkeletonRotations } from './modelData';
import { clamp, normA } from './utils';

export type SegmentIkTweenKey = string;

export interface SegmentIkTweenSettings {
  enabled: boolean;
  influence: number;
  solver: 'fabrik' | 'ccd' | 'hybrid';
  solveMode: 'single_chain' | 'limbs_only' | 'whole_body_graph';
  includeHands: boolean;
  includeFeet: boolean;
  includeHead: boolean;
  naturalBendEnabled: boolean;
  softReachEnabled: boolean;
  enforceJointLimits: boolean;
  damping: number;
}

export type SegmentIkTweenMap = Record<SegmentIkTweenKey, SegmentIkTweenSettings>;

export const DEFAULT_SEGMENT_IK_TWEEN_SETTINGS: SegmentIkTweenSettings = {
  enabled: false,
  influence: 0.65,
  solver: 'fabrik',
  solveMode: 'single_chain',
  includeHands: true,
  includeFeet: true,
  includeHead: false,
  naturalBendEnabled: true,
  softReachEnabled: false,
  enforceJointLimits: true,
  damping: 0.16,
};

const IK_CHAIN_ORDER: Array<'l_leg' | 'r_leg' | 'core' | 'l_arm' | 'r_arm'> = [
  'l_leg',
  'r_leg',
  'core',
  'l_arm',
  'r_arm',
];

const IK_LIMB_CHAINS: Array<'l_arm' | 'r_arm' | 'l_leg' | 'r_leg'> = [
  'l_arm',
  'r_arm',
  'l_leg',
  'r_leg',
];

const EFFECTOR_BY_CHAIN: Record<'l_arm' | 'r_arm' | 'l_leg' | 'r_leg' | 'core', string> = {
  l_arm: 'l_palm',
  r_arm: 'r_palm',
  l_leg: 'l_heel',
  r_leg: 'r_heel',
  core: 'head',
};

const isFiniteRotationMap = (rotations: SkeletonRotations): boolean => (
  Object.values(rotations).every((value) => Number.isFinite(value) && Math.abs(value) < 10000)
);

const isFinitePoint = (point: { x: number; y: number } | undefined): point is { x: number; y: number } => (
  Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.y)
);

const normalizeSolver = (value: unknown): SegmentIkTweenSettings['solver'] => (
  value === 'ccd' || value === 'hybrid' || value === 'fabrik'
    ? value
    : DEFAULT_SEGMENT_IK_TWEEN_SETTINGS.solver
);

const normalizeSolveMode = (value: unknown): SegmentIkTweenSettings['solveMode'] => (
  value === 'single_chain' || value === 'limbs_only' || value === 'whole_body_graph'
    ? value
    : DEFAULT_SEGMENT_IK_TWEEN_SETTINGS.solveMode
);

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => (
  typeof value === 'boolean' ? value : fallback
);

export const segmentKey = (fromFrame: number, toFrame: number): SegmentIkTweenKey => {
  const from = Math.round(fromFrame);
  const to = Math.round(toFrame);
  return `${from}->${to}`;
};

export const normalizeSegmentIkTweenSettings = (
  value?: Partial<SegmentIkTweenSettings> | null
): SegmentIkTweenSettings => {
  const source = value ?? {};
  return {
    enabled: normalizeBoolean(source.enabled, DEFAULT_SEGMENT_IK_TWEEN_SETTINGS.enabled),
    influence: clamp(
      Number.isFinite(source.influence as number)
        ? Number(source.influence)
        : DEFAULT_SEGMENT_IK_TWEEN_SETTINGS.influence,
      0,
      1
    ),
    solver: normalizeSolver(source.solver),
    solveMode: normalizeSolveMode(source.solveMode),
    includeHands: normalizeBoolean(source.includeHands, DEFAULT_SEGMENT_IK_TWEEN_SETTINGS.includeHands),
    includeFeet: normalizeBoolean(source.includeFeet, DEFAULT_SEGMENT_IK_TWEEN_SETTINGS.includeFeet),
    includeHead: normalizeBoolean(source.includeHead, DEFAULT_SEGMENT_IK_TWEEN_SETTINGS.includeHead),
    naturalBendEnabled: normalizeBoolean(
      source.naturalBendEnabled,
      DEFAULT_SEGMENT_IK_TWEEN_SETTINGS.naturalBendEnabled
    ),
    softReachEnabled: normalizeBoolean(
      source.softReachEnabled,
      DEFAULT_SEGMENT_IK_TWEEN_SETTINGS.softReachEnabled
    ),
    enforceJointLimits: normalizeBoolean(
      source.enforceJointLimits,
      DEFAULT_SEGMENT_IK_TWEEN_SETTINGS.enforceJointLimits
    ),
    damping: clamp(
      Number.isFinite(source.damping as number)
        ? Number(source.damping)
        : DEFAULT_SEGMENT_IK_TWEEN_SETTINGS.damping,
      0,
      0.35
    ),
  };
};

export const pruneSegmentIkTweenMap = (
  segmentIkTweenMap: SegmentIkTweenMap,
  validSegmentKeys: Iterable<SegmentIkTweenKey>
): SegmentIkTweenMap => {
  const valid = new Set(validSegmentKeys);
  let changed = false;
  const next: SegmentIkTweenMap = {};
  Object.entries(segmentIkTweenMap).forEach(([key, settings]) => {
    if (!valid.has(key)) {
      changed = true;
      return;
    }
    const normalized = normalizeSegmentIkTweenSettings(settings);
    next[key] = normalized;
    if (normalized !== settings) {
      changed = true;
    }
  });
  if (!changed && Object.keys(next).length === Object.keys(segmentIkTweenMap).length) {
    return segmentIkTweenMap;
  }
  return next;
};

interface FrameKeyframe {
  frame: number;
  pose: SkeletonRotations;
}

const toSortedFrameKeyframes = (
  keyframes: PoseKeyframe<SkeletonRotations>[]
): FrameKeyframe[] => (
  keyframes
    .filter((keyframe): keyframe is PoseKeyframe<SkeletonRotations> & { frame: number } => (
      typeof keyframe.frame === 'number' && Number.isFinite(keyframe.frame)
    ))
    .map((keyframe) => ({
      frame: Math.round(keyframe.frame),
      pose: keyframe.pose,
    }))
    .sort((a, b) => a.frame - b.frame)
);

const resolveActiveSegment = (
  keyframes: FrameKeyframe[],
  frame: number
): { from: FrameKeyframe; to: FrameKeyframe } | null => {
  if (keyframes.length < 2 || !Number.isFinite(frame)) {
    return null;
  }
  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const from = keyframes[index];
    const to = keyframes[index + 1];
    if (!from || !to || to.frame <= from.frame) {
      continue;
    }
    if (frame >= from.frame && frame < to.frame) {
      return { from, to };
    }
  }
  return null;
};

const blendPoseByInfluence = (
  basePose: SkeletonRotations,
  solvedPose: SkeletonRotations,
  influence: number
): SkeletonRotations => {
  if (influence <= 0) {
    return basePose;
  }
  if (influence >= 1) {
    return solvedPose;
  }
  const keys = new Set<string>([...Object.keys(basePose), ...Object.keys(solvedPose)]);
  const blended: SkeletonRotations = { ...basePose };
  keys.forEach((jointId) => {
    const base = basePose[jointId] ?? 0;
    const solved = solvedPose[jointId] ?? base;
    blended[jointId] = normA(base + normA(solved - base) * influence);
  });
  return blended;
};

const resolveChainIds = (settings: SegmentIkTweenSettings): string[] => {
  const selected = new Set<string>();
  if (settings.includeHands) {
    selected.add('l_arm');
    selected.add('r_arm');
  }
  if (settings.includeFeet) {
    selected.add('l_leg');
    selected.add('r_leg');
  }
  if (settings.includeHead) {
    selected.add('core');
  }
  if (settings.solveMode === 'limbs_only' || settings.solveMode === 'whole_body_graph') {
    IK_LIMB_CHAINS.forEach((chainId) => selected.add(chainId));
  }
  if (settings.solveMode === 'whole_body_graph') {
    selected.add('core');
  }
  return IK_CHAIN_ORDER.filter((chainId) => selected.has(chainId));
};

const buildChainTargets = (
  fromPose: SkeletonRotations,
  toPose: SkeletonRotations,
  alpha: number,
  bitruviusData: BitruviusData,
  canvasCenter: [number, number],
  rootTransform?: RootTransform
): Record<string, { x: number; y: number }> => {
  const fromWorld = computeWorldPoseForSkeleton(
    bitruviusData.JOINT_DEFS,
    fromPose,
    canvasCenter,
    rootTransform
  );
  const toWorld = computeWorldPoseForSkeleton(
    bitruviusData.JOINT_DEFS,
    toPose,
    canvasCenter,
    rootTransform
  );
  const targets: Record<string, { x: number; y: number }> = {};
  IK_CHAIN_ORDER.forEach((chainId) => {
    const effectorId = EFFECTOR_BY_CHAIN[chainId];
    const fromPoint = fromWorld[effectorId];
    const toPoint = toWorld[effectorId];
    if (!isFinitePoint(fromPoint) || !isFinitePoint(toPoint)) {
      return;
    }
    targets[chainId] = {
      x: fromPoint.x + (toPoint.x - fromPoint.x) * alpha,
      y: fromPoint.y + (toPoint.y - fromPoint.y) * alpha,
    };
  });
  return targets;
};

export interface SampleIkTweenPreviewPoseInput {
  clip: {
    sampleFrame: (frame: number) => SkeletonRotations;
    getKeyframes: () => PoseKeyframe<SkeletonRotations>[];
  };
  currentFrame: number;
  easingFn: EasingFn;
  segmentInterpolationFrames?: Record<string, number>;
  segmentIkTweenMap?: SegmentIkTweenMap;
  bitruviusData: BitruviusData;
  canvasCenter?: [number, number];
  rootTransform?: RootTransform;
  ikEngineEnabled?: boolean;
}

export const sampleIkTweenPreviewPose = ({
  clip,
  currentFrame,
  easingFn,
  segmentInterpolationFrames = {},
  segmentIkTweenMap = {},
  bitruviusData,
  canvasCenter = [0, 0],
  rootTransform,
  ikEngineEnabled = true,
}: SampleIkTweenPreviewPoseInput): SkeletonRotations => {
  const fkSample = clip.sampleFrame(currentFrame);
  if (!ikEngineEnabled) {
    return fkSample;
  }

  const segment = resolveActiveSegment(toSortedFrameKeyframes(clip.getKeyframes()), currentFrame);
  if (!segment) {
    return fkSample;
  }

  const key = segmentKey(segment.from.frame, segment.to.frame);
  const rawSettings = segmentIkTweenMap[key];
  if (!rawSettings) {
    return fkSample;
  }

  const settings = normalizeSegmentIkTweenSettings(rawSettings);
  if (!settings.enabled || settings.influence <= 0) {
    return fkSample;
  }

  const segmentSpan = Math.max(1, segment.to.frame - segment.from.frame);
  const configuredDuration = segmentInterpolationFrames[key];
  const durationFrames = Number.isFinite(configuredDuration)
    ? Math.min(segmentSpan, Math.max(1, Math.round(configuredDuration as number)))
    : segmentSpan;
  const elapsedFrames = clamp(currentFrame - segment.from.frame, 0, segmentSpan);
  const rawT = durationFrames <= 0 ? 1 : clamp(elapsedFrames / durationFrames, 0, 1);
  const eased = easingFn(rawT);
  const alpha = Number.isFinite(eased) ? clamp(eased, 0, 1) : rawT;
  const chainTargets = buildChainTargets(
    segment.from.pose,
    segment.to.pose,
    alpha,
    bitruviusData,
    canvasCenter,
    rootTransform
  );

  const chainIds = resolveChainIds(settings);
  if (!chainIds.length) {
    return fkSample;
  }

  const computeWorld = (
    jointId: string,
    rotations: SkeletonRotations,
    center: [number, number]
  ) => computeJointWorldForPose(jointId, bitruviusData.JOINT_DEFS, rotations, center, rootTransform);

  let workingPose: SkeletonRotations = { ...fkSample };
  let solvedChainCount = 0;

  chainIds.forEach((chainId) => {
    if (!bitruviusData.IK_CHAINS[chainId]) {
      return;
    }
    const target = chainTargets[chainId];
    if (!isFinitePoint(target)) {
      return;
    }
    const result = solveIK_AdvancedWithResult(
      chainId,
      target.x,
      target.y,
      workingPose,
      canvasCenter,
      bitruviusData,
      computeWorld,
      {
        stretchEnabled: false,
        softReachEnabled: settings.softReachEnabled,
        naturalBendEnabled: settings.naturalBendEnabled,
        enforceJointLimits: settings.enforceJointLimits,
        damping: settings.damping,
        solver: settings.solver,
      }
    );
    if (!result.success || !isFiniteRotationMap(result.rotations)) {
      return;
    }
    workingPose = result.rotations;
    solvedChainCount += 1;
  });

  if (solvedChainCount <= 0) {
    return fkSample;
  }

  return blendPoseByInfluence(fkSample, workingPose, settings.influence);
};
