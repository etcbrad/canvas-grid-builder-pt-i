import {
  BitruviusData,
  IKActivationStage,
  IKChain,
  SkeletonRotations,
  WorldCoords,
} from './modelData';
import { r2d, normA, clamp } from './utils';

export interface IKSolveOptions {
  stretchEnabled?: boolean;
  softReachEnabled?: boolean;
  naturalBendEnabled?: boolean;
  maxIterations?: number;
  tolerance?: number;
  epsilon?: number;
  damping?: number;
  poleWeight?: number;
  convergenceThreshold?: number;
  activeStage?: IKActivationStage;
  enforceJointLimits?: boolean;
  solver?: "fabrik" | "ccd" | "hybrid";
}

export interface IKSolveResult {
  chainId: string;
  rotations: SkeletonRotations;
  success: boolean;
  reason?: string;
  iterations: number;
  residual: number;
  target: { x: number; y: number };
}

interface IKSolveProfile {
  maxIterations: number;
  epsilon: number;
  damping: number;
  poleWeight: number;
  convergenceThreshold: number;
}

interface ChainMetadata {
  chainId: string;
  jointIds: string[];
  effector: string;
  stage: IKActivationStage;
  segmentLengths: number[];
  totalLength: number;
  stretchRatio: number;
  poleDirection: -1 | 0 | 1;
  profile: IKSolveProfile;
  valid: boolean;
}

const MIN_LENGTH = 1e-4;
const STAGE_ORDER: Record<IKActivationStage, number> = {
  arm: 1,
  leg: 2,
  spine_head: 3,
};
const DEFAULT_ACTIVE_STAGE: IKActivationStage = "spine_head";

const DEFAULT_PROFILE_BY_STAGE: Record<IKActivationStage, IKSolveProfile> = {
  arm: {
    maxIterations: 20,
    epsilon: 0.25,
    damping: 0.15,
    poleWeight: 0.4,
    convergenceThreshold: 0.2,
  },
  leg: {
    maxIterations: 22,
    epsilon: 0.2,
    damping: 0.1,
    poleWeight: 0.32,
    convergenceThreshold: 0.16,
  },
  spine_head: {
    maxIterations: 26,
    epsilon: 0.22,
    damping: 0.2,
    poleWeight: 0.18,
    convergenceThreshold: 0.18,
  },
};

const CHAIN_METADATA_CACHE = new WeakMap<BitruviusData, Map<string, ChainMetadata>>();

const inferChainStage = (chainId: string): IKActivationStage => {
  if (
    chainId.includes("arm") ||
    chainId.includes("hand") ||
    chainId.includes("shoulder")
  ) {
    return "arm";
  }
  if (
    chainId.includes("leg") ||
    chainId.includes("foot") ||
    chainId.includes("hip") ||
    chainId.includes("knee")
  ) {
    return "leg";
  }
  return "spine_head";
};

const inferPoleDirection = (chainId: string): -1 | 0 | 1 => {
  if (chainId.includes("l_")) return -1;
  if (chainId.includes("r_")) return 1;
  return 0;
};

const isFinitePoint = (point: { x: number; y: number }): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.y);

const clonePoints = (points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> =>
  points.map((point) => ({ x: point.x, y: point.y }));

const isFiniteRotationMap = (rotations: SkeletonRotations): boolean =>
  Object.values(rotations).every(
    (value) => Number.isFinite(value) && Math.abs(value) < 10000
  );

const blend = (from: number, to: number, damping: number): number =>
  from + (to - from) * (1 - damping);

const resolveProfile = (
  chain: IKChain,
  stage: IKActivationStage,
  options: IKSolveOptions
): IKSolveProfile => {
  const defaults = DEFAULT_PROFILE_BY_STAGE[stage];
  return {
    maxIterations: Math.max(
      1,
      Math.floor(options.maxIterations ?? chain.maxIterations ?? defaults.maxIterations)
    ),
    epsilon: Math.max(0.0001, options.epsilon ?? options.tolerance ?? chain.epsilon ?? defaults.epsilon),
    damping: clamp(options.damping ?? chain.damping ?? defaults.damping, 0, 0.95),
    poleWeight: clamp(options.poleWeight ?? chain.poleWeight ?? defaults.poleWeight, 0, 1),
    convergenceThreshold: Math.max(
      0,
      options.convergenceThreshold ?? chain.convergenceThreshold ?? defaults.convergenceThreshold
    ),
  };
};

const getChainMetadata = (chainId: string, bitruviusData: BitruviusData): ChainMetadata | null => {
  let byChain = CHAIN_METADATA_CACHE.get(bitruviusData);
  if (!byChain) {
    byChain = new Map<string, ChainMetadata>();
    CHAIN_METADATA_CACHE.set(bitruviusData, byChain);
  }
  const cached = byChain.get(chainId);
  if (cached) {
    return cached;
  }

  const chain = bitruviusData.IK_CHAINS[chainId];
  if (!chain || !Array.isArray(chain.joints) || chain.joints.length < 2) {
    return null;
  }

  const stage = chain.activationStage ?? inferChainStage(chainId);
  const profile = resolveProfile(chain, stage, {});
  const jointIds = [...chain.joints];
  const segmentLengths: number[] = [];
  let totalLength = 0;
  let valid = true;

  for (let i = 0; i < jointIds.length - 1; i += 1) {
    const nextId = jointIds[i + 1];
    const nextJoint = bitruviusData.JOINT_DEFS[nextId];
    if (!nextJoint) {
      valid = false;
      segmentLengths.push(0);
      continue;
    }
    const len = Math.hypot(nextJoint.pivot[0], nextJoint.pivot[1]);
    if (!Number.isFinite(len) || len <= MIN_LENGTH) {
      valid = false;
    }
    segmentLengths.push(len);
    totalLength += len;
  }

  const metadata: ChainMetadata = {
    chainId,
    jointIds,
    effector: chain.effector,
    stage,
    segmentLengths,
    totalLength,
    stretchRatio: chain.stretchRatio ?? 1.1,
    poleDirection: chain.poleDirection ?? inferPoleDirection(chainId),
    profile,
    valid: valid && totalLength > MIN_LENGTH,
  };
  byChain.set(chainId, metadata);
  return metadata;
};

const clampTargetToReach = (
  root: { x: number; y: number },
  target: { x: number; y: number },
  totalReach: number,
  softReachEnabled: boolean
): { x: number; y: number } => {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= totalReach || dist <= MIN_LENGTH) {
    return target;
  }

  const softDistance = softReachEnabled ? totalReach * 0.12 : 0;
  if (softDistance <= MIN_LENGTH) {
    const hardScale = totalReach / dist;
    return { x: root.x + dx * hardScale, y: root.y + dy * hardScale };
  }

  const softStart = totalReach - softDistance;
  const overflow = dist - softStart;
  const dampedOverflow = softDistance * (1 - Math.exp(-overflow / softDistance));
  const clampedDist = Math.min(totalReach, softStart + dampedOverflow);
  const scale = clampedDist / dist;
  return { x: root.x + dx * scale, y: root.y + dy * scale };
};

const applyPoleBias = (
  points: Array<{ x: number; y: number }>,
  segmentLengths: number[],
  target: { x: number; y: number },
  poleDirection: -1 | 0 | 1,
  poleWeight: number,
  damping: number
): void => {
  if (poleDirection === 0 || points.length < 3 || segmentLengths.length < 1) {
    return;
  }

  const root = points[0];
  const towardTargetX = target.x - root.x;
  const towardTargetY = target.y - root.y;
  const towardTargetLen = Math.hypot(towardTargetX, towardTargetY);
  if (towardTargetLen <= MIN_LENGTH) {
    return;
  }

  const dirX = towardTargetX / towardTargetLen;
  const dirY = towardTargetY / towardTargetLen;
  const normalX = -dirY * poleDirection;
  const normalY = dirX * poleDirection;
  const baseLen = segmentLengths[0];
  const offset = baseLen * poleWeight;

  const desired = {
    x: root.x + dirX * baseLen + normalX * offset,
    y: root.y + dirY * baseLen + normalY * offset,
  };
  points[1] = {
    x: blend(points[1].x, desired.x, damping),
    y: blend(points[1].y, desired.y, damping),
  };
};

const applyJointLimit = (
  index: number,
  candidate: { x: number; y: number },
  points: Array<{ x: number; y: number }>,
  jointIds: string[],
  segmentLengths: number[],
  bitruviusData: BitruviusData,
  currentRots: SkeletonRotations,
  center: [number, number],
  computeWorld: (
    jointId: string,
    rotations: SkeletonRotations,
    canvasCenter: [number, number]
  ) => WorldCoords
): { x: number; y: number } => {
  const jointId = jointIds[index];
  const lim = bitruviusData.JOINT_LIMITS[jointId];
  if (!lim) {
    return candidate;
  }

  const current = points[index];
  const parentGlobalAngle = index === 0
    ? (() => {
      const parentId = bitruviusData.JOINT_DEFS[jointId]?.parent;
      return parentId ? computeWorld(parentId, currentRots, center).angle : 0;
    })()
    : r2d(
      Math.atan2(
        current.y - points[index - 1].y,
        current.x - points[index - 1].x
      )
    );

  const candidateGlobal = r2d(
    Math.atan2(candidate.y - current.y, candidate.x - current.x)
  );
  let local = normA(candidateGlobal - parentGlobalAngle);
  if (local < lim.min || local > lim.max) {
    local = clamp(local, lim.min, lim.max);
    const clampedGlobal = ((parentGlobalAngle + local) * Math.PI) / 180;
    return {
      x: current.x + Math.cos(clampedGlobal) * segmentLengths[index],
      y: current.y + Math.sin(clampedGlobal) * segmentLengths[index],
    };
  }
  return candidate;
};

const solvePointsFabrik = (
  points: Array<{ x: number; y: number }>,
  segmentLengths: number[],
  base: { x: number; y: number },
  target: { x: number; y: number },
  maxIterations: number,
  epsilon: number,
  convergenceThreshold: number,
  enforceJointLimits: boolean,
  metadata: ChainMetadata,
  bitruviusData: BitruviusData,
  currentRots: SkeletonRotations,
  center: [number, number],
  computeWorld: (
    jointId: string,
    rotations: SkeletonRotations,
    canvasCenter: [number, number]
  ) => WorldCoords,
  damping: number
): { points: Array<{ x: number; y: number }>; iterations: number } => {
  const numPoints = points.length;
  let iterations = 0;
  let previousDist = Number.POSITIVE_INFINITY;
  for (let iter = 0; iter < maxIterations; iter += 1) {
    iterations = iter + 1;
    const end = points[numPoints - 1];
    const currentDist = Math.hypot(end.x - target.x, end.y - target.y);
    if (currentDist <= epsilon) break;
    if (iter > 0 && Math.abs(previousDist - currentDist) <= convergenceThreshold * 0.01) break;
    previousDist = currentDist;

    points[numPoints - 1] = { x: target.x, y: target.y };
    for (let i = numPoints - 2; i >= 0; i -= 1) {
      const next = points[i + 1];
      const current = points[i];
      const dist = Math.hypot(current.x - next.x, current.y - next.y);
      if (dist <= MIN_LENGTH) continue;
      const ratio = segmentLengths[i] / dist;
      points[i] = {
        x: next.x + (current.x - next.x) * ratio,
        y: next.y + (current.y - next.y) * ratio,
      };
    }

    points[0] = { x: base.x, y: base.y };
    for (let i = 0; i < numPoints - 1; i += 1) {
      const current = points[i];
      const next = points[i + 1];
      const dist = Math.hypot(next.x - current.x, next.y - current.y);
      if (dist <= MIN_LENGTH) continue;
      const ratio = segmentLengths[i] / dist;
      let solved = {
        x: current.x + (next.x - current.x) * ratio,
        y: current.y + (next.y - current.y) * ratio,
      };
      if (enforceJointLimits) {
        solved = applyJointLimit(
          i,
          solved,
          points,
          metadata.jointIds,
          metadata.segmentLengths,
          bitruviusData,
          currentRots,
          center,
          computeWorld
        );
      }
      points[i + 1] = {
        x: blend(next.x, solved.x, damping),
        y: blend(next.y, solved.y, damping),
      };
      if (!isFinitePoint(points[i + 1])) break;
    }
  }
  return { points, iterations };
};

const solvePointsCcd = (
  points: Array<{ x: number; y: number }>,
  segmentLengths: number[],
  target: { x: number; y: number },
  maxIterations: number,
  epsilon: number
): { points: Array<{ x: number; y: number }>; iterations: number } => {
  const n = points.length;
  let iterations = 0;
  for (let iter = 0; iter < maxIterations; iter += 1) {
    iterations = iter + 1;
    for (let i = n - 2; i >= 0; i -= 1) {
      const joint = points[i];
      const eff = points[n - 1];
      const a1 = Math.atan2(eff.y - joint.y, eff.x - joint.x);
      const a2 = Math.atan2(target.y - joint.y, target.x - joint.x);
      const da = a2 - a1;
      const c = Math.cos(da);
      const s = Math.sin(da);
      for (let k = i + 1; k < n; k += 1) {
        const dx = points[k].x - joint.x;
        const dy = points[k].y - joint.y;
        points[k] = {
          x: joint.x + dx * c - dy * s,
          y: joint.y + dx * s + dy * c,
        };
      }
    }
    for (let j = 0; j < n - 1; j += 1) {
      const a = points[j];
      const b = points[j + 1];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d <= MIN_LENGTH) continue;
      const ratio = segmentLengths[j] / d;
      points[j + 1] = {
        x: a.x + (b.x - a.x) * ratio,
        y: a.y + (b.y - a.y) * ratio,
      };
    }
    const eff = points[n - 1];
    if (Math.hypot(eff.x - target.x, eff.y - target.y) <= epsilon) break;
  }
  return { points, iterations };
};

export const solveIK_AdvancedWithResult = (
  chainId: string,
  targetX: number,
  targetY: number,
  currentRots: SkeletonRotations,
  center: [number, number],
  bitruviusData: BitruviusData,
  computeWorld: (
    jointId: string,
    rotations: SkeletonRotations,
    canvasCenter: [number, number]
  ) => WorldCoords,
  options: IKSolveOptions = {}
): IKSolveResult => {
  const fail = (reason: string): IKSolveResult => ({
    chainId,
    rotations: currentRots,
    success: false,
    reason,
    iterations: 0,
    residual: Number.POSITIVE_INFINITY,
    target: { x: targetX, y: targetY },
  });

  if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
    return fail('invalid-target');
  }

  const metadata = getChainMetadata(chainId, bitruviusData);
  if (!metadata) {
    return fail('missing-chain');
  }
  if (!metadata.valid) {
    return fail('invalid-chain-topology');
  }

  const activeStage = options.activeStage ?? DEFAULT_ACTIVE_STAGE;
  if (STAGE_ORDER[metadata.stage] > STAGE_ORDER[activeStage]) {
    return fail('inactive-chain-stage');
  }

  const stretchEnabled = options.stretchEnabled !== false;
  const softReachEnabled = options.softReachEnabled !== false;
  const naturalBendEnabled = options.naturalBendEnabled !== false;
  const enforceJointLimits = options.enforceJointLimits !== false;

  const profile = resolveProfile(bitruviusData.IK_CHAINS[chainId], metadata.stage, options);
  const damping = profile.damping;

  const points: Array<{ x: number; y: number }> = [];
  for (const jointId of metadata.jointIds) {
    const world = computeWorld(jointId, currentRots, center);
    const point = { x: world.x, y: world.y };
    if (!isFinitePoint(point)) {
      return fail('non-finite-world-transform');
    }
    points.push(point);
  }
  if (points.length < 2) {
    return fail('chain-too-short');
  }
  const initialEffectorPoint = { ...points[points.length - 1] };

  const rootPoint = points[0];
  const stretchRatio = stretchEnabled ? metadata.stretchRatio : 1;
  const maxReach = metadata.totalLength * stretchRatio;
  const clampedTarget = clampTargetToReach(
    rootPoint,
    { x: targetX, y: targetY },
    maxReach,
    softReachEnabled
  );

  if (naturalBendEnabled) {
    applyPoleBias(
      points,
      metadata.segmentLengths,
      clampedTarget,
      metadata.poleDirection,
      profile.poleWeight,
      damping
    );
  }

  const base = { x: rootPoint.x, y: rootPoint.y };
  const numPoints = points.length;
  let finalPoints = clonePoints(points);
  let iterations = 0;
  const solver = options.solver ?? "fabrik";
  if (solver === "ccd") {
    const solved = solvePointsCcd(
      clonePoints(points),
      metadata.segmentLengths,
      clampedTarget,
      profile.maxIterations,
      profile.epsilon
    );
    finalPoints = solved.points;
    iterations = solved.iterations;
  } else if (solver === "hybrid") {
    const fabrik = solvePointsFabrik(
      clonePoints(points),
      metadata.segmentLengths,
      base,
      clampedTarget,
      profile.maxIterations,
      profile.epsilon,
      profile.convergenceThreshold,
      enforceJointLimits,
      metadata,
      bitruviusData,
      currentRots,
      center,
      computeWorld,
      damping
    );
    const ccd = solvePointsCcd(
      clonePoints(fabrik.points),
      metadata.segmentLengths,
      clampedTarget,
      Math.max(3, Math.floor(profile.maxIterations * 0.35)),
      profile.epsilon
    );
    finalPoints = ccd.points;
    iterations = fabrik.iterations + ccd.iterations;
  } else {
    const fabrik = solvePointsFabrik(
      clonePoints(points),
      metadata.segmentLengths,
      base,
      clampedTarget,
      profile.maxIterations,
      profile.epsilon,
      profile.convergenceThreshold,
      enforceJointLimits,
      metadata,
      bitruviusData,
      currentRots,
      center,
      computeWorld,
      damping
    );
    finalPoints = fabrik.points;
    iterations = fabrik.iterations;
  }
  const nextRots: SkeletonRotations = { ...currentRots };

  for (let i = 0; i < metadata.jointIds.length - 1; i += 1) {
    const jointId = metadata.jointIds[i];
    const current = finalPoints[i];
    const child = finalPoints[i + 1];
    if (!current || !child) {
      return fail('invalid-final-points');
    }

    const parentGlobalAngle = i === 0
      ? (() => {
        const parentId = bitruviusData.JOINT_DEFS[jointId]?.parent;
        return parentId ? computeWorld(parentId, currentRots, center).angle : 0;
      })()
      : (() => {
        const parent = finalPoints[i - 1];
        return r2d(Math.atan2(current.y - parent.y, current.x - parent.x));
      })();

    const boneGlobalAngle = r2d(Math.atan2(child.y - current.y, child.x - current.x));
    let localAngle = normA(boneGlobalAngle - parentGlobalAngle);
    const lim = bitruviusData.JOINT_LIMITS[jointId];
    if (lim && enforceJointLimits) {
      localAngle = clamp(localAngle, lim.min, lim.max);
    }

    if (damping > 0) {
      const prev = currentRots[jointId] ?? 0;
      const delta = normA(localAngle - prev);
      localAngle = normA(prev + delta * (1 - damping));
      if (lim && enforceJointLimits) {
        localAngle = clamp(localAngle, lim.min, lim.max);
      }
    }

    nextRots[jointId] = localAngle;
  }

  // Effector rotation (e.g. wrist) does not affect chain position but should react to drag direction smoothly.
  if (metadata.jointIds.length >= 2) {
    const effectorJointId = metadata.jointIds[metadata.jointIds.length - 1];
    const parentPoint = finalPoints[numPoints - 2];
    const effectorPoint = finalPoints[numPoints - 1];
    const parentGlobalAngle = r2d(
      Math.atan2(effectorPoint.y - parentPoint.y, effectorPoint.x - parentPoint.x)
    );
    const dragDx = clampedTarget.x - initialEffectorPoint.x;
    const dragDy = clampedTarget.y - initialEffectorPoint.y;
    const dragLen = Math.hypot(dragDx, dragDy);
    const dragInfluence = metadata.stage === "arm" ? 0.45 : metadata.stage === "leg" ? 0.2 : 0.15;
    const draggedGlobalAngle =
      dragLen > MIN_LENGTH ? r2d(Math.atan2(dragDy, dragDx)) : parentGlobalAngle;
    const desiredGlobalAngle = normA(
      parentGlobalAngle + normA(draggedGlobalAngle - parentGlobalAngle) * dragInfluence
    );
    let effectorLocal = normA(desiredGlobalAngle - parentGlobalAngle);
    const effectorLimit = bitruviusData.JOINT_LIMITS[effectorJointId];
    if (effectorLimit && enforceJointLimits) {
      effectorLocal = clamp(effectorLocal, effectorLimit.min, effectorLimit.max);
    }
    const previousEffector = currentRots[effectorJointId] ?? 0;
    effectorLocal = normA(
      previousEffector + normA(effectorLocal - previousEffector) * (1 - damping)
    );
    if (effectorLimit && enforceJointLimits) {
      effectorLocal = clamp(effectorLocal, effectorLimit.min, effectorLimit.max);
    }
    nextRots[effectorJointId] = effectorLocal;
  }

  if (!isFiniteRotationMap(nextRots)) {
    return fail('invalid-rotations');
  }

  const residual = Math.hypot(
    finalPoints[numPoints - 1].x - clampedTarget.x,
    finalPoints[numPoints - 1].y - clampedTarget.y
  );

  return {
    chainId,
    rotations: nextRots,
    success: Number.isFinite(residual),
    iterations,
    residual,
    target: clampedTarget,
  };
};

export const solveIK_Advanced = (
  chainId: string,
  targetX: number,
  targetY: number,
  currentRots: SkeletonRotations,
  center: [number, number],
  bitruviusData: BitruviusData,
  computeWorld: (
    jointId: string,
    rotations: SkeletonRotations,
    canvasCenter: [number, number]
  ) => WorldCoords,
  options: IKSolveOptions = {}
): SkeletonRotations =>
  solveIK_AdvancedWithResult(
    chainId,
    targetX,
    targetY,
    currentRots,
    center,
    bitruviusData,
    computeWorld,
    options
  ).rotations;
