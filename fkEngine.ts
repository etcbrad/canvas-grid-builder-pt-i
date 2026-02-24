import type { BitruviusData, JointLimits, SkeletonRotations, WorldCoords } from './modelData';
import { clamp, d2r, normA, r2d } from './utils';

export interface RootTransform {
  x?: number;
  y?: number;
  rotate?: number;
}

export type FkAnimationPreset = 'idle_breath' | 'walk_cycle';

export interface FkAnimationSettings {
  enabled?: boolean;
  preset?: FkAnimationPreset;
  intensity?: number;
  speed?: number;
}

export interface FkAnimationKeyframe {
  frame: number;
  pose: SkeletonRotations;
}

export interface FkAnimationSampleOptions {
  loop?: boolean;
  frameCount?: number;
  easing?: (t: number) => number;
  jointLimits?: Record<string, JointLimits>;
}

const linearEasing = (t: number): number => t;

const clampJointRotation = (
  rotationDeg: number,
  jointLimit: JointLimits | undefined
): number => {
  if (!jointLimit) {
    return normA(rotationDeg);
  }
  return clamp(rotationDeg, jointLimit.min, jointLimit.max);
};

const clonePose = (pose: SkeletonRotations): SkeletonRotations => ({ ...pose });

const normalizeKeyframes = (keyframes: FkAnimationKeyframe[]): FkAnimationKeyframe[] => (
  keyframes
    .filter((keyframe) => Number.isFinite(keyframe.frame) && keyframe.pose && typeof keyframe.pose === 'object')
    .map((keyframe) => ({
      frame: Math.max(0, Math.round(keyframe.frame)),
      pose: clonePose(keyframe.pose),
    }))
    .sort((a, b) => a.frame - b.frame)
);

export const computeJointWorldForPose = (
  jointId: string,
  jointDefs: BitruviusData['JOINT_DEFS'],
  rotations: SkeletonRotations,
  canvasCenter: [number, number],
  rootTransform?: RootTransform
): WorldCoords => {
  const path: string[] = [];
  let currentJointId: string | null = jointId;
  while (currentJointId) {
    path.unshift(currentJointId);
    currentJointId = jointDefs[currentJointId]?.parent ?? null;
  }

  const rootX = rootTransform?.x ?? 0;
  const rootY = rootTransform?.y ?? 0;
  const rootRotate = rootTransform?.rotate ?? 0;
  let worldX = canvasCenter[0] + rootX;
  let worldY = canvasCenter[1] + rootY;
  let worldAngle = d2r((rotations.root || 0) + rootRotate);
  let parentAngle = 0;

  for (const pathJointId of path) {
    if (pathJointId === 'root') {
      parentAngle = worldAngle;
      continue;
    }

    const jointDef = jointDefs[pathJointId];
    if (!jointDef) {
      continue;
    }

    const [pivotX, pivotY] = jointDef.pivot;
    const cosA = Math.cos(worldAngle);
    const sinA = Math.sin(worldAngle);
    worldX += pivotX * cosA - pivotY * sinA;
    worldY += pivotX * sinA + pivotY * cosA;
    parentAngle = worldAngle;
    worldAngle += d2r(rotations[pathJointId] || 0);
  }

  return {
    x: worldX,
    y: worldY,
    angle: normA(r2d(worldAngle)),
    parentAngle: normA(r2d(parentAngle)),
  };
};

export const computeWorldPoseForSkeleton = (
  jointDefs: BitruviusData['JOINT_DEFS'],
  rotations: SkeletonRotations,
  canvasCenter: [number, number],
  rootTransform?: RootTransform
): Record<string, WorldCoords> => {
  const worldByJoint: Record<string, WorldCoords> = {};
  Object.keys(jointDefs).forEach((jointId) => {
    worldByJoint[jointId] = computeJointWorldForPose(
      jointId,
      jointDefs,
      rotations,
      canvasCenter,
      rootTransform
    );
  });
  return worldByJoint;
};

const interpolatePose = (
  fromPose: SkeletonRotations,
  toPose: SkeletonRotations,
  alpha: number,
  jointLimits: Record<string, JointLimits> | undefined
): SkeletonRotations => {
  const out: SkeletonRotations = {};
  const allJointIds = new Set<string>([
    ...Object.keys(fromPose),
    ...Object.keys(toPose),
  ]);

  allJointIds.forEach((jointId) => {
    const from = fromPose[jointId] ?? 0;
    const to = toPose[jointId] ?? from;
    const delta = normA(to - from);
    const interpolated = from + delta * alpha;
    out[jointId] = clampJointRotation(interpolated, jointLimits?.[jointId]);
  });

  return out;
};

export const sampleFkAnimation = (
  keyframes: FkAnimationKeyframe[],
  frame: number,
  options: FkAnimationSampleOptions = {}
): SkeletonRotations => {
  const normalized = normalizeKeyframes(keyframes);
  if (!normalized.length) {
    return {};
  }
  if (normalized.length === 1) {
    return clonePose(normalized[0].pose);
  }

  const loop = options.loop !== false;
  const easing = options.easing ?? linearEasing;
  const firstFrame = normalized[0].frame;
  const lastFrame = normalized[normalized.length - 1].frame;
  const configuredFrameCount = Number.isFinite(options.frameCount)
    ? Math.max(1, Math.round(options.frameCount as number))
    : undefined;
  const cycleLength = Math.max(
    configuredFrameCount ?? 0,
    lastFrame + 1,
    firstFrame + 1
  );

  let sampleFrame = Number.isFinite(frame) ? frame : firstFrame;
  let effectiveKeyframes = normalized;
  if (loop) {
    const wrapped = ((sampleFrame % cycleLength) + cycleLength) % cycleLength;
    sampleFrame = wrapped < firstFrame ? wrapped + cycleLength : wrapped;
    effectiveKeyframes = [
      ...normalized,
      {
        frame: firstFrame + cycleLength,
        pose: normalized[0].pose,
      },
    ];
  } else {
    sampleFrame = clamp(sampleFrame, firstFrame, lastFrame);
  }

  let lower = effectiveKeyframes[0];
  let upper = effectiveKeyframes[effectiveKeyframes.length - 1];
  for (let index = 0; index < effectiveKeyframes.length - 1; index += 1) {
    const candidateLower = effectiveKeyframes[index];
    const candidateUpper = effectiveKeyframes[index + 1];
    if (sampleFrame >= candidateLower.frame && sampleFrame <= candidateUpper.frame) {
      lower = candidateLower;
      upper = candidateUpper;
      break;
    }
  }

  if (upper.frame <= lower.frame) {
    return clonePose(lower.pose);
  }

  const span = upper.frame - lower.frame;
  const rawT = clamp((sampleFrame - lower.frame) / span, 0, 1);
  const easedT = clamp(easing(rawT), 0, 1);
  return interpolatePose(lower.pose, upper.pose, easedT, options.jointLimits);
};

const applyOffset = (
  pose: SkeletonRotations,
  jointId: string,
  offsetDeg: number,
  jointLimits: Record<string, JointLimits> | undefined
): void => {
  const current = pose[jointId] ?? 0;
  const next = current + offsetDeg;
  pose[jointId] = clampJointRotation(next, jointLimits?.[jointId]);
};

const applyIdleBreathOverlay = (
  pose: SkeletonRotations,
  phase: number,
  intensity: number,
  jointLimits: Record<string, JointLimits> | undefined
): void => {
  const breath = Math.sin(phase);
  const secondary = Math.sin(phase + Math.PI * 0.5);
  applyOffset(pose, 'xiphoid', breath * 4 * intensity, jointLimits);
  applyOffset(pose, 'spine_b', breath * 3.2 * intensity, jointLimits);
  applyOffset(pose, 'collar', breath * 2.4 * intensity, jointLimits);
  applyOffset(pose, 'neck', -breath * 1.8 * intensity, jointLimits);
  applyOffset(pose, 'head', -breath * 1.2 * intensity, jointLimits);
  applyOffset(pose, 'pelvis', secondary * 1.6 * intensity, jointLimits);
  applyOffset(pose, 'l_shoulder', -breath * 5.5 * intensity, jointLimits);
  applyOffset(pose, 'r_shoulder', breath * 5.5 * intensity, jointLimits);
  applyOffset(pose, 'l_elbow', breath * 2.2 * intensity, jointLimits);
  applyOffset(pose, 'r_elbow', -breath * 2.2 * intensity, jointLimits);
  applyOffset(pose, 'l_hip', secondary * 2.8 * intensity, jointLimits);
  applyOffset(pose, 'r_hip', -secondary * 2.8 * intensity, jointLimits);
};

const applyWalkCycleOverlay = (
  pose: SkeletonRotations,
  phase: number,
  intensity: number,
  jointLimits: Record<string, JointLimits> | undefined
): void => {
  const swing = Math.sin(phase);
  const strideLiftLeft = Math.max(0, Math.sin(phase + Math.PI * 0.5));
  const strideLiftRight = Math.max(0, Math.sin(phase - Math.PI * 0.5));
  applyOffset(pose, 'pelvis', Math.sin(phase + Math.PI * 0.5) * 5.5 * intensity, jointLimits);
  applyOffset(pose, 'xiphoid', -Math.sin(phase + Math.PI * 0.5) * 4.5 * intensity, jointLimits);
  applyOffset(pose, 'l_hip', swing * 22 * intensity, jointLimits);
  applyOffset(pose, 'r_hip', -swing * 22 * intensity, jointLimits);
  applyOffset(pose, 'l_knee', strideLiftLeft * 24 * intensity, jointLimits);
  applyOffset(pose, 'r_knee', -strideLiftRight * 24 * intensity, jointLimits);
  applyOffset(pose, 'l_heel', strideLiftLeft * 10 * intensity, jointLimits);
  applyOffset(pose, 'r_heel', -strideLiftRight * 10 * intensity, jointLimits);
  applyOffset(pose, 'l_shoulder', -swing * 18 * intensity, jointLimits);
  applyOffset(pose, 'r_shoulder', swing * 18 * intensity, jointLimits);
  applyOffset(pose, 'l_elbow', -swing * 7 * intensity, jointLimits);
  applyOffset(pose, 'r_elbow', swing * 7 * intensity, jointLimits);
};

export const applyFkAnimationOverlay = (
  basePose: SkeletonRotations,
  frame: number,
  fps: number,
  settings: FkAnimationSettings = {},
  jointLimits?: Record<string, JointLimits>
): SkeletonRotations => {
  if (!settings.enabled) {
    return clonePose(basePose);
  }

  const intensity = clamp(settings.intensity ?? 0.45, 0, 1);
  if (intensity <= 1e-6) {
    return clonePose(basePose);
  }

  const speed = clamp(settings.speed ?? 1, 0.25, 4);
  const safeFps = Math.max(1, Math.abs(fps) || 24);
  const phase = ((frame / safeFps) * speed) * Math.PI * 2;
  const nextPose = clonePose(basePose);
  const preset = settings.preset ?? 'idle_breath';
  if (preset === 'walk_cycle') {
    applyWalkCycleOverlay(nextPose, phase, intensity, jointLimits);
  } else {
    applyIdleBreathOverlay(nextPose, phase, intensity, jointLimits);
  }
  return nextPose;
};
