import { SkeletonRotations } from './modelData';
import { clamp } from './utils';

export type LegIntentMode = 'none' | 'walk' | 'sway' | 'sit' | 'jump';
export type PostureState = 'stand' | 'kneel' | 'ground_sit';
export type PoseDirection = 'front' | 'left' | 'right' | 'back';

export interface JumpAssistState {
  active: boolean;
  phase: 'idle' | 'crouch' | 'launch' | 'recover';
  timerMs: number;
}

export interface LegIntentInput {
  mode: LegIntentMode;
  activeChainId: string;
  target: { x: number; y: number };
  currentRotations: SkeletonRotations;
  dtMs: number;
  jumpState: JumpAssistState;
  jumpTrigger: boolean;
  postureState?: PostureState;
  postureRoll?: number;
  poseDirection?: PoseDirection;
  weightShiftLateral?: number;
  weightShiftDepth?: number;
}

export interface LegIntentOutput {
  target: { x: number; y: number };
  counterpartTargets: Record<string, { x: number; y: number }>;
  rotationOffsets: Partial<SkeletonRotations>;
  jumpState: JumpAssistState;
}

const oppositeChainByLeg: Record<string, string> = {
  l_leg: 'r_leg',
  r_leg: 'l_leg',
};

const idleJumpState = (): JumpAssistState => ({ active: false, phase: 'idle', timerMs: 0 });

const addRotationOffset = (
  output: LegIntentOutput,
  jointId: keyof SkeletonRotations,
  delta: number
): void => {
  if (!Number.isFinite(delta) || Math.abs(delta) < 1e-6) {
    return;
  }
  output.rotationOffsets[jointId] = (output.rotationOffsets[jointId] ?? 0) + delta;
};

const applyPostureRoll = (
  state: PostureState,
  roll: number,
  output: LegIntentOutput
): void => {
  const t = clamp(roll, 0, 1);
  if (t <= 0 || state === 'stand') {
    return;
  }

  if (state === 'kneel') {
    output.rotationOffsets.pelvis = (output.rotationOffsets.pelvis ?? 0) + 6 * t;
    output.rotationOffsets.torso_base = (output.rotationOffsets.torso_base ?? 0) + 3 * t;
    output.rotationOffsets.l_hip = (output.rotationOffsets.l_hip ?? 0) + 18 * t;
    output.rotationOffsets.r_hip = (output.rotationOffsets.r_hip ?? 0) - 18 * t;
    output.rotationOffsets.l_knee = (output.rotationOffsets.l_knee ?? 0) + 68 * t;
    output.rotationOffsets.r_knee = (output.rotationOffsets.r_knee ?? 0) - 68 * t;
    output.rotationOffsets.l_heel = (output.rotationOffsets.l_heel ?? 0) - 8 * t;
    output.rotationOffsets.r_heel = (output.rotationOffsets.r_heel ?? 0) + 8 * t;
    output.target.y += 10 * t;
    return;
  }

  // ground_sit
  output.rotationOffsets.pelvis = (output.rotationOffsets.pelvis ?? 0) + 12 * t;
  output.rotationOffsets.torso_base = (output.rotationOffsets.torso_base ?? 0) + 8 * t;
  output.rotationOffsets.l_hip = (output.rotationOffsets.l_hip ?? 0) + 42 * t;
  output.rotationOffsets.r_hip = (output.rotationOffsets.r_hip ?? 0) - 42 * t;
  output.rotationOffsets.l_knee = (output.rotationOffsets.l_knee ?? 0) + 96 * t;
  output.rotationOffsets.r_knee = (output.rotationOffsets.r_knee ?? 0) - 96 * t;
  output.rotationOffsets.l_heel = (output.rotationOffsets.l_heel ?? 0) - 14 * t;
  output.rotationOffsets.r_heel = (output.rotationOffsets.r_heel ?? 0) + 14 * t;
  output.target.y += 18 * t;
};

const applyDirectionalAssist = (
  poseDirection: PoseDirection,
  weightShiftLateral: number,
  weightShiftDepth: number,
  output: LegIntentOutput
): void => {
  const lateral = clamp(weightShiftLateral, -1, 1);
  const depth = clamp(weightShiftDepth, -1, 1);

  if (Math.abs(lateral) > 0.001) {
    addRotationOffset(output, 'pelvis', 8 * lateral);
    addRotationOffset(output, 'torso_base', -6 * lateral);
    addRotationOffset(output, 'xiphoid', -4 * lateral);
    addRotationOffset(output, 'collar', -3 * lateral);

    if (lateral > 0) {
      // Shift to right support leg: keep right stiffer, free left leg.
      addRotationOffset(output, 'l_hip', 9 * lateral);
      addRotationOffset(output, 'r_hip', 3 * lateral);
      addRotationOffset(output, 'l_knee', 11 * lateral);
      addRotationOffset(output, 'r_knee', 3 * lateral);
    } else {
      const mag = -lateral;
      // Shift to left support leg: keep left stiffer, free right leg.
      addRotationOffset(output, 'r_hip', -9 * mag);
      addRotationOffset(output, 'l_hip', -3 * mag);
      addRotationOffset(output, 'r_knee', -11 * mag);
      addRotationOffset(output, 'l_knee', -3 * mag);
    }

    output.target.x += lateral * 8;
  }

  if (Math.abs(depth) > 0.001) {
    // Positive depth leans "into" motion and increases fold; negative pulls back.
    addRotationOffset(output, 'pelvis', 5 * depth);
    addRotationOffset(output, 'torso_base', -8 * depth);
    addRotationOffset(output, 'xiphoid', -7 * depth);
    addRotationOffset(output, 'collar', -4 * depth);
    addRotationOffset(output, 'neck', -2 * depth);
    addRotationOffset(output, 'l_hip', 10 * depth);
    addRotationOffset(output, 'r_hip', -10 * depth);
    addRotationOffset(output, 'l_knee', 14 * depth);
    addRotationOffset(output, 'r_knee', -14 * depth);
    output.target.y += 8 * depth;
  }

  if (poseDirection === 'left' || poseDirection === 'right') {
    const yaw = poseDirection === 'left' ? -1 : 1;
    addRotationOffset(output, 'pelvis', 6 * yaw);
    addRotationOffset(output, 'torso_base', 5 * yaw);
    addRotationOffset(output, 'collar', 4 * yaw);
    addRotationOffset(output, 'neck', 2 * yaw);
    addRotationOffset(output, 'head', 2 * yaw);
    addRotationOffset(output, 'l_shoulder', 8 * yaw);
    addRotationOffset(output, 'r_shoulder', 8 * yaw);
    return;
  }

  if (poseDirection === 'back') {
    addRotationOffset(output, 'pelvis', 12);
    addRotationOffset(output, 'torso_base', 9);
    addRotationOffset(output, 'collar', 7);
    addRotationOffset(output, 'neck', 5);
    addRotationOffset(output, 'head', 3);
    addRotationOffset(output, 'l_shoulder', 14);
    addRotationOffset(output, 'r_shoulder', -14);
    output.target.y += 6;
  }
};

export const resolveLegIntent = ({
  mode,
  activeChainId,
  target,
  dtMs,
  jumpState,
  jumpTrigger,
  postureState = 'stand',
  postureRoll = 0,
  poseDirection = 'front',
  weightShiftLateral = 0,
  weightShiftDepth = 0,
}: LegIntentInput): LegIntentOutput => {
  const output: LegIntentOutput = {
    target: { ...target },
    counterpartTargets: {},
    rotationOffsets: {},
    jumpState: jumpState ?? idleJumpState(),
  };

  applyPostureRoll(postureState, postureRoll, output);
  applyDirectionalAssist(poseDirection, weightShiftLateral, weightShiftDepth, output);

  if (mode === 'none' || (activeChainId !== 'l_leg' && activeChainId !== 'r_leg')) {
    return output;
  }

  const oppositeChain = oppositeChainByLeg[activeChainId];
  if (mode === 'walk') {
    output.counterpartTargets[oppositeChain] = {
      x: target.x * 0.98,
      y: target.y - 10,
    };
    output.rotationOffsets.pelvis = activeChainId === 'l_leg' ? 2.5 : -2.5;
    return output;
  }

  if (mode === 'sway') {
    output.rotationOffsets.pelvis = activeChainId === 'l_leg' ? -4 : 4;
    output.rotationOffsets.torso_base = output.rotationOffsets.pelvis * 0.55;
    return output;
  }

  if (mode === 'sit') {
    output.rotationOffsets.pelvis = 8;
    output.rotationOffsets.l_hip = 24;
    output.rotationOffsets.r_hip = -24;
    output.rotationOffsets.l_knee = 42;
    output.rotationOffsets.r_knee = -42;
    output.target.y += 12;
    return output;
  }

  // Jump intent: manual trigger -> crouch -> launch -> recover.
  const nextState: JumpAssistState = { ...output.jumpState };
  if (jumpTrigger && !nextState.active) {
    nextState.active = true;
    nextState.phase = 'crouch';
    nextState.timerMs = 0;
  }

  if (!nextState.active) {
    output.jumpState = nextState;
    return output;
  }

  nextState.timerMs += Math.max(0, dtMs);
  if (nextState.phase === 'crouch' && nextState.timerMs >= 90) {
    nextState.phase = 'launch';
    nextState.timerMs = 0;
  } else if (nextState.phase === 'launch' && nextState.timerMs >= 120) {
    nextState.phase = 'recover';
    nextState.timerMs = 0;
  } else if (nextState.phase === 'recover' && nextState.timerMs >= 170) {
    output.jumpState = idleJumpState();
    return output;
  }

  if (nextState.phase === 'crouch') {
    output.rotationOffsets.pelvis = 9;
    output.rotationOffsets.l_knee = 35;
    output.rotationOffsets.r_knee = -35;
    output.target.y += 10;
  } else if (nextState.phase === 'launch') {
    output.rotationOffsets.pelvis = -6;
    output.target.y -= 18;
  } else {
    const decay = clamp(1 - nextState.timerMs / 170, 0, 1);
    output.rotationOffsets.pelvis = -3 * decay;
    output.target.y -= 6 * decay;
  }

  output.jumpState = nextState;
  return output;
};
