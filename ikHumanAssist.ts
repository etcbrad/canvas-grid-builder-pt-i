import { SkeletonRotations } from './modelData';
import { clamp, normA } from './utils';

export interface HumanAssistToggles {
  humanCounterbalanceEnabled?: boolean;
  humanMirrorEnabled?: boolean;
  humanFollowThroughEnabled?: boolean;
  humanCollarNeckFollowEnabled?: boolean;
}

export interface HumanAssistInput {
  activeChainId: string;
  currentRotations: SkeletonRotations;
  solvedRotations: SkeletonRotations;
  previousRotations: SkeletonRotations;
  toggles: HumanAssistToggles;
  dtMs: number;
}

const BASE_FRAME_MS = 1000 / 60;
const BASE_CLAMP_DEG = 4;
const COUNTERBALANCE_WEIGHT = 0.24;
const MIRROR_WEIGHT = 0.16;
const FOLLOW_THROUGH_WEIGHT = 0.12;
const COLLAR_WEIGHT = 0.18;
const NECK_WEIGHT = 0.12;

const resolveTemporalAlpha = (baseAlpha: number, dtMs: number): number => {
  const safeDt = clamp(dtMs || BASE_FRAME_MS, 4, 48);
  return 1 - Math.pow(1 - baseAlpha, safeDt / BASE_FRAME_MS);
};

const addDelta = (out: SkeletonRotations, jointId: string, delta: number): void => {
  const prev = out[jointId] ?? 0;
  out[jointId] = normA(prev + delta);
};

export const applyHumanAssist = ({
  activeChainId,
  currentRotations,
  solvedRotations,
  previousRotations,
  toggles,
  dtMs,
}: HumanAssistInput): SkeletonRotations => {
  const {
    humanCounterbalanceEnabled = true,
    humanMirrorEnabled = true,
    humanFollowThroughEnabled = true,
    humanCollarNeckFollowEnabled = true,
  } = toggles;

  const out: SkeletonRotations = { ...solvedRotations };
  const assistAlpha = resolveTemporalAlpha(0.32, dtMs);
  const perFrameClamp = BASE_CLAMP_DEG * (clamp(dtMs || BASE_FRAME_MS, 4, 48) / BASE_FRAME_MS);

  const chainMap: Record<string, { source: string[]; opposite: string[] }> = {
    l_arm: { source: ['l_shoulder', 'l_elbow', 'l_palm'], opposite: ['r_shoulder', 'r_elbow', 'r_palm'] },
    r_arm: { source: ['r_shoulder', 'r_elbow', 'r_palm'], opposite: ['l_shoulder', 'l_elbow', 'l_palm'] },
    l_leg: { source: ['l_hip', 'l_knee', 'l_heel'], opposite: ['r_hip', 'r_knee', 'r_heel'] },
    r_leg: { source: ['r_hip', 'r_knee', 'r_heel'], opposite: ['l_hip', 'l_knee', 'l_heel'] },
  };

  const pair = chainMap[activeChainId];
  if (!pair) return out;

  const avgSourceDelta =
    pair.source.reduce((sum, jointId) => {
      const prev = currentRotations[jointId] ?? 0;
      const next = solvedRotations[jointId] ?? prev;
      return sum + normA(next - prev);
    }, 0) / Math.max(1, pair.source.length);

  pair.opposite.forEach((jointId, index) => {
    let delta = 0;
    if (humanCounterbalanceEnabled) {
      delta += -avgSourceDelta * COUNTERBALANCE_WEIGHT;
    }
    if (humanMirrorEnabled) {
      delta += avgSourceDelta * MIRROR_WEIGHT;
    }
    if (humanFollowThroughEnabled) {
      const tail = normA((previousRotations[jointId] ?? 0) - (currentRotations[jointId] ?? 0));
      delta += tail * FOLLOW_THROUGH_WEIGHT * (index === 0 ? 0.8 : 1);
    }
    delta = clamp(delta * assistAlpha, -perFrameClamp, perFrameClamp);
    addDelta(out, jointId, delta);
  });

  if (humanCollarNeckFollowEnabled && (activeChainId === 'l_arm' || activeChainId === 'r_arm')) {
    const collarDelta = clamp(avgSourceDelta * COLLAR_WEIGHT * assistAlpha, -perFrameClamp, perFrameClamp);
    const neckDelta = clamp(avgSourceDelta * NECK_WEIGHT * assistAlpha, -perFrameClamp, perFrameClamp);
    addDelta(out, 'collar', collarDelta);
    addDelta(out, 'neck', neckDelta);
    addDelta(out, 'nose', neckDelta * 0.8);
    addDelta(out, 'head', neckDelta * 0.5);
  }

  return out;
};

