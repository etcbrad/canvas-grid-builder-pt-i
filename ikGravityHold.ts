import { SkeletonRotations } from './modelData';
import { normA } from './utils';

export interface IkGravityHoldToggles {
  ikGravityArmHoldEnabled?: boolean;
  ikGravityLegHoldEnabled?: boolean;
}

export interface IkGravityHoldInput {
  currentRotations: SkeletonRotations;
  solvedRotations: SkeletonRotations;
  toggles: IkGravityHoldToggles;
}

const applyDelta = (
  out: SkeletonRotations,
  currentRotations: SkeletonRotations,
  jointId: string,
  delta: number
): void => {
  const base = out[jointId] ?? currentRotations[jointId] ?? 0;
  out[jointId] = normA(base + delta);
};

export const applyIkGravityHold = ({
  currentRotations,
  solvedRotations,
  toggles,
}: IkGravityHoldInput): SkeletonRotations => {
  const {
    ikGravityArmHoldEnabled = true,
    ikGravityLegHoldEnabled = true,
  } = toggles;

  const out: SkeletonRotations = { ...solvedRotations };

  if (ikGravityArmHoldEnabled) {
    const currentCollar = currentRotations.collar ?? 0;
    const solvedCollar = solvedRotations.collar ?? currentCollar;
    const collarDelta = normA(solvedCollar - currentCollar);
    applyDelta(out, currentRotations, 'l_shoulder', -collarDelta);
    applyDelta(out, currentRotations, 'r_shoulder', -collarDelta);
  }

  if (ikGravityLegHoldEnabled) {
    const currentPelvis = currentRotations.pelvis ?? 0;
    const solvedPelvis = solvedRotations.pelvis ?? currentPelvis;
    const pelvisDelta = normA(solvedPelvis - currentPelvis);
    applyDelta(out, currentRotations, 'l_hip', -pelvisDelta);
    applyDelta(out, currentRotations, 'r_hip', -pelvisDelta);
  }

  return out;
};
