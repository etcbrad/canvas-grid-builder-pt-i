import React, { useRef, useEffect, useState, useCallback } from 'react';
import { d2r, r2d, normA, clamp } from '../utils';
import { BitruviusData, IKActivationStage, IKChain, SkeletonRotations, WorldCoords } from '../modelData';
import { solveIK_AdvancedWithResult } from '../ikSolver';
import { render, type GhostFrameRender, type ImageLayerState, type VisualModuleState } from '../renderer';
import { createVitruvianGridModel, createVitruvianPlotPayload } from '../adapters/vitruvianGrid';
import { applyHumanAssist } from '../ikHumanAssist';
import { type JumpAssistState, type LegIntentMode, type PoseDirection, type PostureState, resolveLegIntent } from '../ikLegIntent';




export interface MovementToggles {
  stretchEnabled?: boolean;
  softReachEnabled?: boolean;
  naturalBendEnabled?: boolean;
  fk360Enabled?: boolean;
  fkConstraintsEnabled?: boolean;
  handshakeEnabled?: boolean;
  fkRotationSensitivity?: number;
  fkRotationResponse?: number;
  rootX?: number;
  rootY?: number;
  rootRotate?: number;
  rootGroundLockEnabled?: boolean;
  rootXControlEnabled?: boolean;
  rootYControlEnabled?: boolean;
  rootRotateControlEnabled?: boolean;
  ikExtendedHandlesEnabled?: boolean;
  ikPreferFullChainEnabled?: boolean;
  ikUnconstrainedEnabled?: boolean;
  ikProfile?: "base" | "human";
  ikSolver?: "fabrik" | "ccd" | "hybrid";
  ikSolveMode?: "single_chain" | "limbs_only" | "whole_body_graph";
  legIntentMode?: LegIntentMode;
  humanCounterbalanceEnabled?: boolean;
  humanMirrorEnabled?: boolean;
  humanFollowThroughEnabled?: boolean;
  humanCollarNeckFollowEnabled?: boolean;
  postureState?: PostureState;
  postureRoll?: number;
  poseDirection?: PoseDirection;
  weightShiftLateral?: number;
  weightShiftDepth?: number;
}

interface CanvasGridProps {
  width: number;
  height: number;
  majorGridSize: number;
  majorGridColor: string;
  majorGridWidth: number;
  minorGridSize: number;
  minorGridColor: string;
  minorGridWidth: number;
  ruleOfThirdsColor: string;
  ruleOfThirdsWidth: number;
  bitruviusData: BitruviusData;
  mocapMode?: boolean;
  safeSwitch?: boolean;
  silhouetteMode?: boolean;
  lotteMode?: boolean;
  ikEnabled?: boolean;
  interactionMode?: "FK" | "IK";
  movementToggles?: MovementToggles;
  onInteractionModeChange?: () => void;
  onToggleLotteMode?: () => void;
  onReturnDefaultPose?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onMovementTogglesChange?: (toggles: MovementToggles) => void;
  onPoseApply?: (poseName: string) => void;
  onRotationsChange?: (rots: SkeletonRotations) => void;
  onMasterPinChange?: (pin: [number, number]) => void;
  ghostFrames?: GhostFrameRender[];
  visualModules?: Partial<VisualModuleState>;
  backgroundImageLayer?: ImageLayerState;
  foregroundImageLayer?: ImageLayerState;
  onUploadBackgroundImageLayer?: (file: File) => void;
  onUploadForegroundImageLayer?: (file: File) => void;
  onClearBackgroundImageLayer?: () => void;
  onClearForegroundImageLayer?: () => void;
  onPatchBackgroundImageLayer?: (patch: Partial<ImageLayerState>) => void;
  onPatchForegroundImageLayer?: (patch: Partial<ImageLayerState>) => void;
  gridOnlyMode?: boolean;
  onExitGridView?: () => void;
  isPlaying?: boolean;
  onTogglePlayback?: () => void;
  animationControlDisabled?: boolean;
  currentFrame?: number;
  frameCount?: number;
  fps?: number;
  easing?: string;
  easingOptions?: string[];
  keyframeFrames?: number[];
  isCurrentFrameKeyframe?: boolean;
  onSetCurrentFrame?: (frame: number) => void;
  onSetKeyframe?: () => void;
  onRemoveKeyframe?: () => void;
  onFpsChange?: (fps: number) => void;
  onFrameCountChange?: (frameCount: number) => void;
  onEasingChange?: (easing: string) => void;
  keyframePoseMap?: Record<number, SkeletonRotations>;
  onSavePoseToFrame?: (frame: number) => void;
  onApplyPoseToFrame?: (frame: number, poseName: string) => void;
  onSwapTimelineFrames?: (fromFrame: number, toFrame: number) => void;
  onInsertTweenBetween?: (fromFrame: number, toFrame: number) => void;
  onAdjustSegmentInBetweens?: (fromFrame: number, toFrame: number, delta: number) => void;
  onRemovePoseAtFrame?: (frame: number) => void;
  segmentInterpolationFrames?: Record<string, number>;
  onSetSegmentInterpolation?: (fromFrame: number, toFrame: number, frames: number | null) => void;
}

interface HeadGridHoverInfo {
  label: string;
  x: number;
  y: number;
  tileX: number;
  tileY: number;
  cellX: number;
  cellY: number;
  lineAxis: "x" | "y" | "xy" | "none";
  occludedByModel: boolean;
}

interface IKBackHandle {
  chainId: string;
  effectorId: string;
  guideJointId: string;
  offsetPx: number;
  hitRadiusPx: number;
}

const HEAD_PIECE_MODEL_BOUNDS = {
  width: 52.8,
  height: 54,
};

const DEFAULT_IMAGE_LAYER: ImageLayerState = {
  src: null,
  visible: true,
  opacity: 1,
  x: 50,
  y: 50,
  scale: 100,
  fitMode: 'free',
  blendMode: 'source-over',
};

const IMAGE_FIT_MODE_OPTIONS: Array<{ value: NonNullable<ImageLayerState['fitMode']>; label: string }> = [
  { value: 'free', label: 'Free' },
  { value: 'contain', label: 'Contain' },
  { value: 'cover', label: 'Cover' },
];

const FOREGROUND_BLEND_OPTIONS: Array<{ value: GlobalCompositeOperation; label: string }> = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
];

const POSE_LIBRARY_PRIORITY = [
  'T-Pose',
  'Neutral',
  'A-Pose',
  'Idle',
  'Walk-L',
  'Walk-R',
  'Run-L',
  'Run-R',
  'Reach-Up',
  'Guard',
  'Victory',
  'Kick-L',
  'Kick-R',
  'Bow',
  'Crouch',
  'Sit',
  'Jump',
  'Handshake',
];

const IK_BACK_HANDLES: IKBackHandle[] = [
  { chainId: 'l_arm', effectorId: 'l_palm', guideJointId: 'l_elbow', offsetPx: 24, hitRadiusPx: 18 },
  { chainId: 'r_arm', effectorId: 'r_palm', guideJointId: 'r_elbow', offsetPx: 24, hitRadiusPx: 18 },
  { chainId: 'l_leg', effectorId: 'l_heel', guideJointId: 'l_knee', offsetPx: 24, hitRadiusPx: 18 },
  { chainId: 'r_leg', effectorId: 'r_heel', guideJointId: 'r_knee', offsetPx: 24, hitRadiusPx: 18 },
  { chainId: 'core', effectorId: 'head', guideJointId: 'nose', offsetPx: 26, hitRadiusPx: 20 },
];
const LOW_FRICTION_IK_CHAINS = new Set(['l_arm', 'r_arm', 'l_leg', 'r_leg', 'core']);
const IK_FULL_CHAIN_BY_EFFECTOR: Record<string, string> = {
  l_palm: 'l_arm',
  r_palm: 'r_arm',
  l_heel: 'l_leg',
  r_heel: 'r_leg',
  head: 'core',
};
const IK_BASE_FRAME_MS = 1000 / 60;
const IK_EVENT_DT_MIN_MS = 4;
const IK_EVENT_DT_MAX_MS = 48;
const IK_SPEED_MULTIPLIER = 2;
const scaleIkAlphaForSpeed = (baseAlpha: number): number => 1 - Math.pow(1 - baseAlpha, IK_SPEED_MULTIPLIER);
const IK_TARGET_DEADZONE = 0.55;
const IK_TARGET_DEADZONE_LOW_FRICTION = 0.9;
const IK_TARGET_SMOOTH_ALPHA = scaleIkAlphaForSpeed(0.28);
const IK_TARGET_SMOOTH_ALPHA_LOW_FRICTION = scaleIkAlphaForSpeed(0.18);
const IK_TARGET_HOLD_EPSILON = 0.02;
const IK_TARGET_STATE_EPSILON = 0.08;
const IK_ROTATION_BLEND_ALPHA = scaleIkAlphaForSpeed(0.46);
const IK_ROTATION_BLEND_ALPHA_LOW_FRICTION = scaleIkAlphaForSpeed(0.26);
const IK_ROTATION_STEP_MAX = 7.5 * IK_SPEED_MULTIPLIER;
const IK_ROTATION_STEP_MAX_LOW_FRICTION = 4.2 * IK_SPEED_MULTIPLIER;
const IK_ROTATION_APPLY_EPSILON_DEG = 0.03;
const FK_GROUND_LITE_IK_BLEND_ALPHA = 0.72;
const FK_GROUND_LITE_IK_MAX_STEP = 9;
const FK_GROUND_LITE_TOE_PROXY_GAIN = 0.08;
const FK_GROUND_LITE_TOE_PROXY_MAX = 16;
const IK_DRAG_CHAIN_PRIORITY: Record<string, number> = {
  l_arm: 0,
  r_arm: 0,
  l_leg: 1,
  r_leg: 1,
  core: 2,
  spine: 3,
  l_hand: 4,
  r_hand: 4,
  l_foot: 5,
  r_foot: 5,
  head: 6,
  l_shoulder: 7,
  r_shoulder: 7,
  l_knee: 8,
  r_knee: 8,
  l_hip: 9,
  r_hip: 9,
};
const getIkDragPriority = (chainId: string): number => IK_DRAG_CHAIN_PRIORITY[chainId] ?? 99;

const blendValue = (from: number, to: number, alpha: number): number => from + (to - from) * alpha;
const resolveTemporalAlpha = (baseAlpha: number, dtMs: number): number => {
  const safeDt = clamp(dtMs, IK_EVENT_DT_MIN_MS, IK_EVENT_DT_MAX_MS);
  return 1 - Math.pow(1 - baseAlpha, safeDt / IK_BASE_FRAME_MS);
};
const blendRotations = (
  previous: SkeletonRotations,
  next: SkeletonRotations,
  alpha: number,
  maxStepDeg: number = Number.POSITIVE_INFINITY
): SkeletonRotations => {
  const out: SkeletonRotations = { ...previous };
  Object.entries(next).forEach(([jointId, nextValue]) => {
    const prevValue = previous[jointId] ?? 0;
    const delta = normA(nextValue - prevValue) * alpha;
    const clampedDelta = clamp(delta, -maxStepDeg, maxStepDeg);
    out[jointId] = normA(prevValue + clampedDelta);
  });
  return out;
};

const maxRotationDeltaDeg = (a: SkeletonRotations, b: SkeletonRotations): number => {
  let maxDelta = 0;
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach((key) => {
    const delta = Math.abs(normA((b[key] ?? 0) - (a[key] ?? 0)));
    if (delta > maxDelta) {
      maxDelta = delta;
    }
  });
  return maxDelta;
};

const mergeTargetsWithEpsilon = (
  previous: Record<string, { x: number; y: number }>,
  next: Record<string, { x: number; y: number }>,
  epsilon: number = IK_TARGET_STATE_EPSILON
): Record<string, { x: number; y: number }> => {
  let changed = false;
  const merged = { ...previous };
  Object.entries(next).forEach(([chainId, target]) => {
    const prevTarget = previous[chainId];
    if (!prevTarget || Math.hypot(prevTarget.x - target.x, prevTarget.y - target.y) > epsilon) {
      merged[chainId] = target;
      changed = true;
    }
  });
  return changed ? merged : previous;
};

type LegChainId = 'l_leg' | 'r_leg';
const LEG_CHAIN_IDS: LegChainId[] = ['l_leg', 'r_leg'];
const LEG_EFFECTOR_BY_CHAIN: Record<LegChainId, 'l_heel' | 'r_heel'> = {
  l_leg: 'l_heel',
  r_leg: 'r_heel',
};

const computeJointWorldForPose = (
  jointId: string,
  jointDefs: BitruviusData['JOINT_DEFS'],
  rotations: SkeletonRotations,
  canvasCenter: [number, number],
  rootTransform?: { x?: number; y?: number; rotate?: number }
): WorldCoords => {
  const path: string[] = [];
  let cur: string | null = jointId;
  while (cur) {
    path.unshift(cur);
    cur = jointDefs[cur]?.parent ?? null;
  }

  const rootX = rootTransform?.x ?? 0;
  const rootY = rootTransform?.y ?? 0;
  const rootRotate = rootTransform?.rotate ?? 0;
  let wx = canvasCenter[0] + rootX;
  let wy = canvasCenter[1] + rootY;
  let wa = d2r((rotations.root || 0) + rootRotate);
  let pa = 0;
  for (const joint of path) {
    if (joint === 'root') {
      pa = wa;
      continue;
    }
    const jDef = jointDefs[joint];
    if (!jDef) {
      continue;
    }
    const [px, py] = jDef.pivot;
    const c = Math.cos(wa);
    const s = Math.sin(wa);
    wx += px * c - py * s;
    wy += px * s + py * c;
    pa = wa;
    wa += d2r(rotations[joint] || 0);
  }

  return { x: wx, y: wy, angle: normA(r2d(wa)), parentAngle: normA(r2d(pa)) };
};

const IK_STAGE_ORDER: Record<IKActivationStage, number> = {
  arm: 1,
  leg: 2,
  spine_head: 3,
};
const IK_RUNTIME_STAGE: IKActivationStage = "spine_head";
const IK_SCOPE_LIMB_ORDER = ['l_arm', 'r_arm', 'l_leg', 'r_leg'] as const;
const IK_SCOPE_WHOLE_ORDER = ['l_leg', 'r_leg', 'core', 'spine', 'l_arm', 'r_arm'] as const;
type IkQuickPresetId = "precision" | "balanced_human" | "expressive_human" | "custom";

const IK_QUICK_PRESETS: Array<{
  id: Exclude<IkQuickPresetId, "custom">;
  label: string;
  description: string;
  patch: Partial<MovementToggles>;
}> = [
  {
    id: "precision",
    label: "Precision",
    description: "Tight single-chain control",
    patch: {
      ikProfile: "base",
      ikSolver: "fabrik",
      ikSolveMode: "single_chain",
      legIntentMode: "none",
      naturalBendEnabled: true,
      ikPreferFullChainEnabled: false,
      ikUnconstrainedEnabled: false,
      humanCounterbalanceEnabled: true,
      humanMirrorEnabled: true,
      humanFollowThroughEnabled: true,
      humanCollarNeckFollowEnabled: true,
      postureState: 'stand',
      postureRoll: 0,
      poseDirection: 'front',
      weightShiftLateral: 0,
      weightShiftDepth: 0,
    },
  },
  {
    id: "balanced_human",
    label: "Balanced",
    description: "Natural motion with stable follow-through",
    patch: {
      ikProfile: "human",
      ikSolver: "hybrid",
      ikSolveMode: "limbs_only",
      legIntentMode: "none",
      naturalBendEnabled: true,
      ikPreferFullChainEnabled: true,
      ikUnconstrainedEnabled: false,
      humanCounterbalanceEnabled: true,
      humanMirrorEnabled: true,
      humanFollowThroughEnabled: true,
      humanCollarNeckFollowEnabled: true,
      postureState: 'stand',
      postureRoll: 0,
      poseDirection: 'front',
      weightShiftLateral: 0,
      weightShiftDepth: 0,
    },
  },
  {
    id: "expressive_human",
    label: "Expressive",
    description: "Whole-body solving with freer reactions",
    patch: {
      ikProfile: "human",
      ikSolver: "hybrid",
      ikSolveMode: "whole_body_graph",
      legIntentMode: "sway",
      naturalBendEnabled: true,
      ikPreferFullChainEnabled: true,
      ikUnconstrainedEnabled: true,
      humanCounterbalanceEnabled: true,
      humanMirrorEnabled: true,
      humanFollowThroughEnabled: true,
      humanCollarNeckFollowEnabled: true,
      postureState: 'ground_sit',
      postureRoll: 0.45,
      poseDirection: 'front',
      weightShiftLateral: 0,
      weightShiftDepth: 0.2,
    },
  },
];

const LEG_INTENT_OPTIONS: Array<{ id: LegIntentMode; label: string }> = [
  { id: 'none', label: 'Idle' },
  { id: 'walk', label: 'Walk' },
  { id: 'sway', label: 'Sway' },
  { id: 'sit', label: 'Sit' },
  { id: 'jump', label: 'Jump' },
];

interface IkPoseProgram {
  label: string;
  poseDirection: PoseDirection;
  weightShiftLateral: number;
  weightShiftDepth: number;
  postureState: PostureState;
  postureRoll: number;
  legIntentMode: LegIntentMode;
}

type IkPoseProgramMap = Record<PoseDirection, IkPoseProgram>;

const IK_POSE_PROGRAM_STORAGE_KEY = 'canvas-grid.ikPosePrograms.v1';
const IK_POSE_DIRECTIONS: PoseDirection[] = ['front', 'left', 'right', 'back'];

const DEFAULT_IK_POSE_PROGRAMS: IkPoseProgramMap = {
  front: {
    label: 'Front',
    poseDirection: 'front',
    weightShiftLateral: 0,
    weightShiftDepth: 0,
    postureState: 'stand',
    postureRoll: 0,
    legIntentMode: 'none',
  },
  left: {
    label: 'Left',
    poseDirection: 'left',
    weightShiftLateral: -0.65,
    weightShiftDepth: 0.08,
    postureState: 'stand',
    postureRoll: 0,
    legIntentMode: 'none',
  },
  right: {
    label: 'Right',
    poseDirection: 'right',
    weightShiftLateral: 0.65,
    weightShiftDepth: 0.08,
    postureState: 'stand',
    postureRoll: 0,
    legIntentMode: 'none',
  },
  back: {
    label: 'Back',
    poseDirection: 'back',
    weightShiftLateral: 0,
    weightShiftDepth: -0.35,
    postureState: 'stand',
    postureRoll: 0,
    legIntentMode: 'none',
  },
};

const sanitizePoseDirection = (value: unknown): PoseDirection => (
  value === 'left' || value === 'right' || value === 'back' || value === 'front'
    ? value
    : 'front'
);

const sanitizePostureState = (value: unknown): PostureState => (
  value === 'kneel' || value === 'ground_sit' || value === 'stand'
    ? value
    : 'stand'
);

const sanitizeLegIntentMode = (value: unknown): LegIntentMode => (
  value === 'walk' || value === 'sway' || value === 'sit' || value === 'jump' || value === 'none'
    ? value
    : 'none'
);

const sanitizeIkPoseProgram = (
  slotDirection: PoseDirection,
  value: Partial<IkPoseProgram> | undefined
): IkPoseProgram => {
  const base = DEFAULT_IK_POSE_PROGRAMS[slotDirection];
  return {
    label: typeof value?.label === 'string' && value.label.trim().length > 0 ? value.label.trim() : base.label,
    poseDirection: sanitizePoseDirection(value?.poseDirection ?? slotDirection),
    weightShiftLateral: clamp(
      Number.isFinite(value?.weightShiftLateral as number)
        ? Number(value?.weightShiftLateral)
        : base.weightShiftLateral,
      -1,
      1
    ),
    weightShiftDepth: clamp(
      Number.isFinite(value?.weightShiftDepth as number)
        ? Number(value?.weightShiftDepth)
        : base.weightShiftDepth,
      -1,
      1
    ),
    postureState: sanitizePostureState(value?.postureState ?? base.postureState),
    postureRoll: clamp(
      Number.isFinite(value?.postureRoll as number)
        ? Number(value?.postureRoll)
        : base.postureRoll,
      0,
      1
    ),
    legIntentMode: sanitizeLegIntentMode(value?.legIntentMode ?? base.legIntentMode),
  };
};

const sanitizeIkPoseProgramMap = (value: unknown): IkPoseProgramMap => {
  const parsed = (value && typeof value === 'object') ? (value as Partial<Record<PoseDirection, Partial<IkPoseProgram>>>) : {};
  return {
    front: sanitizeIkPoseProgram('front', parsed.front),
    left: sanitizeIkPoseProgram('left', parsed.left),
    right: sanitizeIkPoseProgram('right', parsed.right),
    back: sanitizeIkPoseProgram('back', parsed.back),
  };
};

const matchesPreset = (toggles: MovementToggles, preset: Partial<MovementToggles>): boolean =>
  Object.entries(preset).every(([key, value]) => (toggles as Record<string, unknown>)[key] === value);

const resolveActiveIkQuickPreset = (toggles: MovementToggles): IkQuickPresetId => {
  const found = IK_QUICK_PRESETS.find((preset) => matchesPreset(toggles, preset.patch));
  return found?.id ?? "custom";
};

const isFiniteRotationMap = (rotations: SkeletonRotations): boolean =>
  Object.values(rotations).every((value) => Number.isFinite(value) && Math.abs(value) < 10000);

const isRuntimeIKChainEnabled = (
  chain: IKChain | undefined,
  data: BitruviusData
): boolean => {
  if (!chain || chain.joints.length < 2) {
    return false;
  }
  const stage = chain.activationStage ?? "spine_head";
  if (IK_STAGE_ORDER[stage] > IK_STAGE_ORDER[IK_RUNTIME_STAGE]) {
    return false;
  }
  for (let i = 1; i < chain.joints.length; i += 1) {
    const joint = data.JOINT_DEFS[chain.joints[i]];
    if (!joint) {
      return false;
    }
    const len = Math.hypot(joint.pivot[0], joint.pivot[1]);
    if (!Number.isFinite(len) || len <= 1e-4) {
      return false;
    }
  }
  return true;
};



const CanvasGrid: React.FC<CanvasGridProps> = ({
  width, height,
  majorGridSize,
  minorGridSize,
  bitruviusData,
  mocapMode = false,
  silhouetteMode = true,
  lotteMode = false,
  ikEnabled = true,
  interactionMode = "FK",
  movementToggles = {},
  onInteractionModeChange,
  onToggleLotteMode,
  onReturnDefaultPose,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onMovementTogglesChange,
  onPoseApply,
  onRotationsChange,
  onMasterPinChange,
  ghostFrames,
  visualModules,
  backgroundImageLayer,
  foregroundImageLayer,
  onUploadBackgroundImageLayer,
  onUploadForegroundImageLayer,
  onClearBackgroundImageLayer,
  onClearForegroundImageLayer,
  onPatchBackgroundImageLayer,
  onPatchForegroundImageLayer,
  gridOnlyMode = false,
  onExitGridView,
  isPlaying = false,
  onTogglePlayback,
  animationControlDisabled = false,
  currentFrame = 0,
  frameCount = 60,
  fps = 24,
  easing = '',
  easingOptions = [],
  keyframeFrames = [],
  isCurrentFrameKeyframe = false,
  onSetCurrentFrame,
  onSetKeyframe,
  onRemoveKeyframe,
  onFpsChange,
  onFrameCountChange,
  onEasingChange,
  keyframePoseMap = {},
  onSavePoseToFrame,
  onApplyPoseToFrame,
  onSwapTimelineFrames,
  onInsertTweenBetween,
  onAdjustSegmentInBetweens,
  onRemovePoseAtFrame,
  segmentInterpolationFrames = {},
  onSetSegmentInterpolation,
}) => {
  const {
    stretchEnabled = true,
    softReachEnabled = true,
    naturalBendEnabled = true,
    fk360Enabled = true,
    fkConstraintsEnabled = true,
    handshakeEnabled = true,
    fkRotationSensitivity = 0.85,
    fkRotationResponse = 0.85,
    rootX = 0,
    rootY = 0,
    rootRotate = 0,
    rootGroundLockEnabled = false,
    rootXControlEnabled = false,
    rootYControlEnabled = false,
    rootRotateControlEnabled = false,
    ikExtendedHandlesEnabled = true,
    ikPreferFullChainEnabled = false,
    ikUnconstrainedEnabled = false,
    ikProfile = "base",
    ikSolver = "fabrik",
    ikSolveMode = "single_chain",
    legIntentMode = "none",
    humanCounterbalanceEnabled = true,
    humanMirrorEnabled = true,
    humanFollowThroughEnabled = true,
    humanCollarNeckFollowEnabled = true,
    postureState = 'stand',
    postureRoll = 0,
    poseDirection = 'front',
    weightShiftLateral = 0,
    weightShiftDepth = 0,
  } = movementToggles;
  const resolvedBackgroundLayer = backgroundImageLayer ?? DEFAULT_IMAGE_LAYER;
  const resolvedForegroundLayer = foregroundImageLayer ?? DEFAULT_IMAGE_LAYER;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundUploadInputRef = useRef<HTMLInputElement>(null);
  const foregroundUploadInputRef = useRef<HTMLInputElement>(null);
  const rotationsRef = useRef<SkeletonRotations>(bitruviusData.initialRotations);
  const lastValidRotationsRef = useRef<SkeletonRotations>(bitruviusData.initialRotations);
  const ikSmoothedTargetRef = useRef<{ [chainId: string]: { x: number; y: number } }>({});
  const ikLastEventTsRef = useRef<{ [chainId: string]: number }>({});
  const ikGroundPinsRef = useRef<Partial<Record<LegChainId, { x: number; y: number }>>>({});
  const fkSliderLastInputRef = useRef<Record<string, number>>({});
  const jumpTriggerQueuedRef = useRef<boolean>(false);
  const jumpAssistStateRef = useRef<JumpAssistState>({ active: false, phase: 'idle', timerMs: 0 });
  const lastFkAngleRef = useRef<number>(0);
  const snapbackBackToFirstRafRef = useRef<number | null>(null);
  const prevIkInteractionRef = useRef<boolean>(ikEnabled && interactionMode === "IK");
  const [dragState, setDragState] = useState<{ id: string, type: "FK" | "IK" | "ROOT" } | null>(null);
  const [rootFkDragArmed, setRootFkDragArmed] = useState(false);
  const [hoveredJoint, setHoveredJoint] = useState<{ id: string; label: string; x: number; y: number } | null>(null);
  const [hoveredHeadGrid, setHoveredHeadGrid] = useState<HeadGridHoverInfo | null>(null);
  const [ikTargets, setIkTargets] = useState<{ [chainId: string]: { x: number, y: number } }>({});
  const ikInteractionActive = ikEnabled && interactionMode === "IK";
  const [showRefineMenu, setShowRefineMenu] = useState(false);
  const [showAnimationTimeline, setShowAnimationTimeline] = useState(true);
  const [timelinePanelMode, setTimelinePanelMode] = useState<'basic' | 'advanced'>('basic');
  const [timelineMinimized, setTimelineMinimized] = useState(false);
  const [timelineControlsMinimized, setTimelineControlsMinimized] = useState(false);
  const [timelineScrollIndex, setTimelineScrollIndex] = useState(0);
  const [timelineStepFrames, setTimelineStepFrames] = useState(1);
  const [timelineManualStepMode, setTimelineManualStepMode] = useState(false);
  const [dragFrameSlot, setDragFrameSlot] = useState<number | null>(null);
  const [poseLibraryFrame, setPoseLibraryFrame] = useState<number | null>(null);
  const [poseLibrarySearch, setPoseLibrarySearch] = useState('');
  const [refinePanelMode, setRefinePanelMode] = useState<'basic' | 'advanced'>('basic');
  const [showIkAdvancedControls, setShowIkAdvancedControls] = useState(false);
  const [fkBendOffsetByJoint, setFkBendOffsetByJoint] = useState<Record<string, number>>({});
  const [fkStretchOffsetByJoint, setFkStretchOffsetByJoint] = useState<Record<string, number>>({});
  const [ikPosePrograms, setIkPosePrograms] = useState<IkPoseProgramMap>(DEFAULT_IK_POSE_PROGRAMS);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = window.localStorage.getItem(IK_POSE_PROGRAM_STORAGE_KEY);
      if (!raw) {
        return;
      }
      setIkPosePrograms(sanitizeIkPoseProgramMap(JSON.parse(raw)));
    } catch {
      setIkPosePrograms(DEFAULT_IK_POSE_PROGRAMS);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(IK_POSE_PROGRAM_STORAGE_KEY, JSON.stringify(ikPosePrograms));
    } catch {
      // Ignore storage failures (private mode/quota).
    }
  }, [ikPosePrograms]);

  const isIkPoseProgramActive = useCallback((program: IkPoseProgram): boolean => {
    return (
      poseDirection === program.poseDirection &&
      Math.abs(weightShiftLateral - program.weightShiftLateral) < 0.03 &&
      Math.abs(weightShiftDepth - program.weightShiftDepth) < 0.03 &&
      postureState === program.postureState &&
      Math.abs(postureRoll - program.postureRoll) < 0.03 &&
      legIntentMode === program.legIntentMode
    );
  }, [poseDirection, weightShiftLateral, weightShiftDepth, postureState, postureRoll, legIntentMode]);

  const applyIkPoseProgram = useCallback((direction: PoseDirection) => {
    const program = ikPosePrograms[direction];
    onMovementTogglesChange?.({
      ...(movementToggles || {}),
      poseDirection: program.poseDirection,
      weightShiftLateral: program.weightShiftLateral,
      weightShiftDepth: program.weightShiftDepth,
      postureState: program.postureState,
      postureRoll: program.postureRoll,
      legIntentMode: program.legIntentMode,
    });
  }, [ikPosePrograms, movementToggles, onMovementTogglesChange]);

  const programIkPoseSlotFromCurrent = useCallback((direction: PoseDirection) => {
    setIkPosePrograms((prev) => ({
      ...prev,
      [direction]: sanitizeIkPoseProgram(direction, {
        ...prev[direction],
        poseDirection: direction,
        weightShiftLateral,
        weightShiftDepth,
        postureState,
        postureRoll,
        legIntentMode,
      }),
    }));
  }, [weightShiftLateral, weightShiftDepth, postureState, postureRoll, legIntentMode]);

  const openBackgroundUpload = useCallback(() => {
    backgroundUploadInputRef.current?.click();
  }, []);

  const openForegroundUpload = useCallback(() => {
    foregroundUploadInputRef.current?.click();
  }, []);

  const handleBackgroundUploadInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onUploadBackgroundImageLayer?.(file);
    }
    event.target.value = '';
  }, [onUploadBackgroundImageLayer]);

  const handleForegroundUploadInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onUploadForegroundImageLayer?.(file);
    }
    event.target.value = '';
  }, [onUploadForegroundImageLayer]);
  
  // Requirement: List activated at start
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [activeIKChains, setActiveIKChains] = useState<{ [chainId: string]: boolean }>(() => {
    const initial: { [chainId: string]: boolean } = {};
    Object.keys(bitruviusData.IK_CHAINS).forEach((chainId) => {
      initial[chainId] = isRuntimeIKChainEnabled(bitruviusData.IK_CHAINS[chainId], bitruviusData);
    });
    return initial;
  });
  const activeIkQuickPreset = resolveActiveIkQuickPreset({
    ikProfile,
    ikSolver,
    ikSolveMode,
    legIntentMode,
    naturalBendEnabled,
    ikPreferFullChainEnabled,
    ikUnconstrainedEnabled,
    humanCounterbalanceEnabled,
    humanMirrorEnabled,
    humanFollowThroughEnabled,
    humanCollarNeckFollowEnabled,
    postureState,
    postureRoll,
    poseDirection,
    weightShiftLateral,
    weightShiftDepth,
  });

  const resolveSolveChainOrder = useCallback((activeChainId: string): string[] => {
    const appendUnique = (list: string[], chainId: string) => {
      if (!list.includes(chainId)) list.push(chainId);
    };
    const out: string[] = [];
    appendUnique(out, activeChainId);
    if (ikSolveMode === "limbs_only") {
      IK_SCOPE_LIMB_ORDER.forEach((chainId) => appendUnique(out, chainId));
    } else if (ikSolveMode === "whole_body_graph") {
      IK_SCOPE_WHOLE_ORDER.forEach((chainId) => appendUnique(out, chainId));
    }
    return out.filter((chainId) =>
      activeIKChains[chainId] &&
      isRuntimeIKChainEnabled(bitruviusData.IK_CHAINS[chainId], bitruviusData)
    );
  }, [ikSolveMode, activeIKChains, bitruviusData]);

  const beginIkDrag = useCallback((chainId: string, seedTarget: { x: number; y: number }, center: [number, number]) => {
    ikSmoothedTargetRef.current[chainId] = seedTarget;
    ikLastEventTsRef.current[chainId] = performance.now();

    const seededPins: Partial<Record<LegChainId, { x: number; y: number }>> = {};
    LEG_CHAIN_IDS.forEach((legChainId) => {
      if (!activeIKChains[legChainId]) return;
      if (!isRuntimeIKChainEnabled(bitruviusData.IK_CHAINS[legChainId], bitruviusData)) return;
      const effectorId = LEG_EFFECTOR_BY_CHAIN[legChainId];
      const world = computeJointWorldForPose(
        effectorId,
        bitruviusData.JOINT_DEFS,
        rotationsRef.current,
        center
      );
      seededPins[legChainId] = { x: world.x, y: world.y };
    });
    ikGroundPinsRef.current = seededPins;
    setDragState({ id: chainId, type: "IK" });
  }, [activeIKChains, bitruviusData]);

  const resolveGroundPinnedTargets = useCallback((activeChainId: string): Record<string, { x: number; y: number }> => {
    if (ikSolveMode === 'single_chain') {
      return {};
    }
    if (
      legIntentMode === 'sit' ||
      legIntentMode === 'jump' ||
      postureState !== 'stand' ||
      postureRoll > 0.35 ||
      Math.abs(weightShiftDepth) > 0.45 ||
      poseDirection === 'back'
    ) {
      return {};
    }

    const pinnedChains: LegChainId[] = activeChainId === 'l_leg'
      ? ['r_leg']
      : activeChainId === 'r_leg'
        ? ['l_leg']
        : ['l_leg', 'r_leg'];
    const out: Record<string, { x: number; y: number }> = {};
    pinnedChains.forEach((chainId) => {
      if (!activeIKChains[chainId]) return;
      if (!isRuntimeIKChainEnabled(bitruviusData.IK_CHAINS[chainId], bitruviusData)) return;
      const pin = ikGroundPinsRef.current[chainId];
      if (!pin) return;
      out[chainId] = pin;
    });
    return out;
  }, [ikSolveMode, legIntentMode, postureState, postureRoll, weightShiftDepth, poseDirection, activeIKChains, bitruviusData]);

  // Requirement: Guides back out to the border (0 margin for guides)
  const UI_INSET = 12;
  const TIMELINE_RAIL_WIDTH = 280;
  const TIMELINE_RAIL_GAP = 10;
  const timelineReservedWidth =
    gridOnlyMode && showAnimationTimeline ? TIMELINE_RAIL_WIDTH + TIMELINE_RAIL_GAP : 0;
  const sceneViewport = React.useMemo(() => {
    if (!gridOnlyMode) {
      return {
        x: 0,
        y: 0,
        width,
        height,
        center: [width / 2, height / 2] as [number, number],
      };
    }

    const availableWidth = Math.max(180, width - timelineReservedWidth);
    const availableHeight = Math.max(180, height);
    const targetAspect = 4 / 3;
    let viewportWidth = availableWidth;
    let viewportHeight = viewportWidth / targetAspect;
    if (viewportHeight > availableHeight) {
      viewportHeight = availableHeight;
      viewportWidth = viewportHeight * targetAspect;
    }

    const viewportX = Math.max(0, (availableWidth - viewportWidth) / 2);
    const viewportY = Math.max(0, (availableHeight - viewportHeight) / 2);
    return {
      x: viewportX,
      y: viewportY,
      width: viewportWidth,
      height: viewportHeight,
      center: [viewportX + viewportWidth / 2, viewportY + viewportHeight / 2] as [number, number],
    };
  }, [gridOnlyMode, width, height, timelineReservedWidth]);
  const projectionReferenceRotations = React.useMemo<SkeletonRotations>(() => {
    return bitruviusData.POSES?.["T-Pose"] ?? bitruviusData.POSES?.["Neutral"] ?? bitruviusData.initialRotations;
  }, [bitruviusData.POSES]);

  const gridProjection = React.useMemo(() => {
    if (!gridOnlyMode) {
      return { scale: 1, yOffset: 0, center: sceneViewport.center };
    }
    const vitruvianModel = createVitruvianGridModel({ totalHeight: 1 });
    const vitruvianPlot = createVitruvianPlotPayload(vitruvianModel);
    const plotWidth = vitruvianPlot.bounds.maxX - vitruvianPlot.bounds.minX;
    const headUnit = vitruvianModel.modules.head.unit;
    const circleDiameter = vitruvianModel.circle.diameter;
    const circleVerticalBuffer = headUnit * 0.5;
    const gridScale = Math.min(
      sceneViewport.width / plotWidth,
      sceneViewport.height / (circleDiameter + circleVerticalBuffer * 2)
    );
    const headGridSquarePx = headUnit * gridScale;
    const modelScale = headGridSquarePx / Math.max(HEAD_PIECE_MODEL_BOUNDS.width, HEAD_PIECE_MODEL_BOUNDS.height);
    const center = sceneViewport.center;
    const leftHeel = computeJointWorldForPose(
      'l_heel',
      bitruviusData.JOINT_DEFS,
      projectionReferenceRotations,
      center
    );
    const rightHeel = computeJointWorldForPose(
      'r_heel',
      bitruviusData.JOINT_DEFS,
      projectionReferenceRotations,
      center
    );
    const referenceHeelY = Math.max(leftHeel.y, rightHeel.y);
    const referenceHeelProjectedY = center[1] + (referenceHeelY - center[1]) * modelScale;
    const gridGroundScreenY = sceneViewport.y + sceneViewport.height;
    const modelYOffset = gridGroundScreenY - referenceHeelProjectedY;
    return {
      scale: modelScale,
      yOffset: modelYOffset,
      center,
    };
  }, [gridOnlyMode, sceneViewport, bitruviusData.JOINT_DEFS, projectionReferenceRotations]);
  const toDisplayPoint = useCallback((x: number, y: number): { x: number; y: number } => {
    const { scale, yOffset, center } = gridProjection;
    return {
      x: center[0] + (x - center[0]) * scale,
      y: center[1] + (y - center[1]) * scale + yOffset,
    };
  }, [gridProjection]);
  const fromDisplayPoint = useCallback((x: number, y: number): { x: number; y: number } => {
    const { scale, yOffset, center } = gridProjection;
    return {
      x: center[0] + (x - center[0]) / scale,
      y: center[1] + (y - center[1] - yOffset) / scale,
    };
  }, [gridProjection]);

  const headGridHoverMetrics = React.useMemo(() => {
    const vitruvianModel = createVitruvianGridModel({ totalHeight: 1 });
    const vitruvianPlot = createVitruvianPlotPayload(vitruvianModel);
    const plotWidth = vitruvianPlot.bounds.maxX - vitruvianPlot.bounds.minX;
    const plotMinX = vitruvianPlot.bounds.minX;
    const plotMinY = vitruvianPlot.bounds.minY;
    const gridTileHeight = vitruvianModel.square.height;
    const headUnit = vitruvianModel.modules.head.unit;
    const circleDiameter = vitruvianModel.circle.diameter;
    const circleVerticalBuffer = headUnit * 0.5;
    const scale = Math.min(
      sceneViewport.width / plotWidth,
      sceneViewport.height / (circleDiameter + circleVerticalBuffer * 2)
    );
    const circleCenter = vitruvianModel.circle.center;
    const xOffset = sceneViewport.x + sceneViewport.width / 2 - (circleCenter.x - plotMinX) * scale;
    const yOffset = gridOnlyMode ? sceneViewport.y : (circleCenter.y - plotMinY) * scale - sceneViewport.height / 2 + sceneViewport.y;
    return {
      plotWidth,
      plotMinX,
      plotMinY,
      gridTileHeight,
      headUnit,
      scale,
      xOffset,
      yOffset,
      viewportY: sceneViewport.y,
      viewportHeight: sceneViewport.height,
    };
  }, [sceneViewport, gridOnlyMode]);

  const getHeadGridHoverInfo = useCallback((mx: number, my: number): Omit<HeadGridHoverInfo, "occludedByModel"> => {
    const {
      plotWidth,
      plotMinX,
      plotMinY,
      gridTileHeight,
      headUnit,
      scale,
      xOffset,
      yOffset,
      viewportY,
      viewportHeight,
    } = headGridHoverMetrics;
    const worldX = (mx - xOffset) / scale + plotMinX;
    const worldY = plotMinY + (viewportY + viewportHeight + yOffset - my) / scale;

    const tileX = Math.floor((worldX - plotMinX) / plotWidth);
    const tileY = Math.floor((worldY - plotMinY) / gridTileHeight);

    const localX = worldX - (plotMinX + tileX * plotWidth);
    const localY = worldY - (plotMinY + tileY * gridTileHeight);

    const clampedCellX = clamp(Math.floor(localX / headUnit), 0, 7);
    const rowFromGround = clamp(Math.floor(localY / headUnit), 0, 7);
    const clampedCellY = 7 - rowFromGround;

    const nearestLineX = Math.round(localX / headUnit) * headUnit;
    const nearestLineY = Math.round(localY / headUnit) * headUnit;
    const lineX = Math.abs(localX - nearestLineX) * scale <= 6;
    const lineY = Math.abs(localY - nearestLineY) * scale <= 6;
    const lineAxis: "x" | "y" | "xy" | "none" = lineX && lineY ? "xy" : lineX ? "x" : lineY ? "y" : "none";
    const lineSuffix = lineAxis === "none" ? "" : ` • ${lineAxis.toUpperCase()} line`;

    return {
      label: `Head Grid T(${tileX},${tileY}) C(${clampedCellX},${clampedCellY})${lineSuffix}`,
      x: mx,
      y: my,
      tileX,
      tileY,
      cellX: clampedCellX,
      cellY: clampedCellY,
      lineAxis,
    };
  }, [headGridHoverMetrics]);

  const headGridSquarePx = Math.max(28, Math.min(92, headGridHoverMetrics.headUnit * headGridHoverMetrics.scale));
  const timelineSlotsVisible = timelineMinimized
    ? 1
    : timelineControlsMinimized
      ? Math.max(5, Math.min(12, Math.floor((height - 170) / (headGridSquarePx + 62))))
      : timelinePanelMode === 'advanced'
        ? Math.max(2, Math.min(4, Math.floor((height - 340) / (headGridSquarePx + 96))))
        : Math.max(3, Math.min(5, Math.floor((height - 280) / (headGridSquarePx + 84))));
  const timelineStep = Math.max(1, timelineStepFrames);
  const maxKnownFrame = React.useMemo(() => {
    const keyframeMax = keyframeFrames.length
      ? Math.max(...keyframeFrames.map((frame) => Math.max(0, Math.round(frame))))
      : 0;
    return Math.max(0, Math.round(currentFrame), Math.max(frameCount - 1, 0), keyframeMax);
  }, [keyframeFrames, currentFrame, frameCount]);
  const timelineVirtualFrameCount = Math.max(
    1,
    maxKnownFrame + 1 + timelineSlotsVisible * timelineStep * 2
  );
  const maxTimelineSlotIndex = Math.max(0, Math.floor((timelineVirtualFrameCount - 1) / timelineStep));
  const maxTimelineScrollIndex = Math.max(0, maxTimelineSlotIndex - timelineSlotsVisible + 1);
  const clampedTimelineScrollIndex = clamp(timelineScrollIndex, 0, maxTimelineScrollIndex);
  const totalDisplayFrames = Math.max(frameCount, 1);
  const currentDisplayFrame = Math.round(currentFrame) + 1;
  const maxTimelineStepFrames = Math.max(8, Math.max(frameCount - 1, 1));
  const quickTimelineStepOptions = React.useMemo(
    () => Array.from(new Set([1, 2, 4, 8].map((step) => clamp(step, 1, maxTimelineStepFrames)))),
    [maxTimelineStepFrames]
  );
  const timelineFunctionPresets = React.useMemo(
    () => ([
      { id: 'rigid', label: 'Rigid', easing: 'linear', description: 'Default mechanical motion' },
      {
        id: 'fluid',
        label: 'Fluid',
        easing: 'easeOutBackSoft',
        description: 'Carry momentum, then settle over the full segment',
      },
      {
        id: 'elastic',
        label: 'Elastic',
        easing: 'easeOutElastic',
        description: 'Stretch out, then rebound into the anchor pose',
      },
      {
        id: 'snapback',
        label: 'Snapback',
        easing: 'easeInQuad',
        description: 'Back to 1 resolves in 3 frames',
        backToFirstFrames: 3,
      },
    ]),
    []
  );
  const activeTimelineFunctionId = React.useMemo(() => {
    return timelineFunctionPresets.find((preset) => preset.easing === easing)?.id ?? null;
  }, [timelineFunctionPresets, easing]);
  const timelineRailWidth = TIMELINE_RAIL_WIDTH;
  const sortedKeyframeFrames = React.useMemo(
    () => Array.from(new Set(keyframeFrames.map((frame) => Math.round(frame)))).sort((a, b) => a - b),
    [keyframeFrames]
  );
  const keyframeSet = React.useMemo(
    () => new Set(sortedKeyframeFrames),
    [sortedKeyframeFrames]
  );
  const nextKeyframeByFrame = React.useMemo(() => {
    const map = new Map<number, number | null>();
    for (let index = 0; index < sortedKeyframeFrames.length; index += 1) {
      map.set(sortedKeyframeFrames[index], sortedKeyframeFrames[index + 1] ?? null);
    }
    return map;
  }, [sortedKeyframeFrames]);
  const poseLibraryNames = React.useMemo(() => {
    const poseNames = Object.keys(bitruviusData.POSES ?? {});
    const uniqueNames = Array.from(new Set(poseNames));
    const priorityIndex = new Map<string, number>();
    POSE_LIBRARY_PRIORITY.forEach((name, index) => {
      priorityIndex.set(name, index);
    });
    uniqueNames.sort((a, b) => {
      const aPriority = priorityIndex.get(a);
      const bPriority = priorityIndex.get(b);
      if (aPriority !== undefined && bPriority !== undefined) return aPriority - bPriority;
      if (aPriority !== undefined) return -1;
      if (bPriority !== undefined) return 1;
      return a.localeCompare(b);
    });
    return uniqueNames;
  }, [bitruviusData.POSES]);
  const normalizedPoseSearch = poseLibrarySearch.trim().toLowerCase();
  const filteredPoseLibraryNames = React.useMemo(() => {
    if (!normalizedPoseSearch) return poseLibraryNames;
    return poseLibraryNames.filter((name) => name.toLowerCase().includes(normalizedPoseSearch));
  }, [poseLibraryNames, normalizedPoseSearch]);

  const handleOpenPoseLibrary = useCallback((frame: number) => {
    if (!onApplyPoseToFrame) {
      return;
    }
    const safeFrame = Math.max(0, Math.round(frame));
    setPoseLibraryFrame(safeFrame);
    setPoseLibrarySearch('');
    onSetCurrentFrame?.(safeFrame);
  }, [onApplyPoseToFrame, onSetCurrentFrame]);

  const handleApplyPoseFromLibrary = useCallback((poseName: string) => {
    if (poseLibraryFrame === null) {
      return;
    }
    onApplyPoseToFrame?.(poseLibraryFrame, poseName);
    setPoseLibraryFrame(null);
    setPoseLibrarySearch('');
  }, [poseLibraryFrame, onApplyPoseToFrame]);

  const handleTimelineWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (maxTimelineScrollIndex <= 0) {
      return;
    }
    event.preventDefault();
    const direction = event.deltaY > 0 ? 1 : -1;
    const step = event.shiftKey ? timelineSlotsVisible : 1;
    setTimelineScrollIndex((prev) => clamp(prev + direction * step, 0, maxTimelineScrollIndex));
  }, [maxTimelineScrollIndex, timelineSlotsVisible]);
  const handleTimelineBackToFirst = useCallback(() => {
    if (!onSetCurrentFrame) {
      return;
    }
    if (isPlaying && onTogglePlayback) {
      onTogglePlayback();
    }
    const activePreset = timelineFunctionPresets.find((preset) => preset.id === activeTimelineFunctionId);
    const snapbackFrames = activePreset?.backToFirstFrames;
    const startFrame = Math.max(0, Math.round(currentFrame));
    if (!snapbackFrames || snapbackFrames <= 1 || startFrame <= 0) {
      onSetCurrentFrame(0);
      return;
    }

    if (snapbackBackToFirstRafRef.current !== null) {
      cancelAnimationFrame(snapbackBackToFirstRafRef.current);
      snapbackBackToFirstRafRef.current = null;
    }

    const totalSteps = Math.max(1, Math.round(snapbackFrames));
    let step = 0;
    const animateToFirst = () => {
      step += 1;
      const progress = Math.min(step / totalSteps, 1);
      const nextFrame = Math.max(0, Math.round(startFrame * (1 - progress)));
      onSetCurrentFrame(nextFrame);

      if (progress < 1) {
        snapbackBackToFirstRafRef.current = requestAnimationFrame(animateToFirst);
      } else {
        snapbackBackToFirstRafRef.current = null;
        onSetCurrentFrame(0);
      }
    };
    animateToFirst();
  }, [
    onSetCurrentFrame,
    isPlaying,
    onTogglePlayback,
    timelineFunctionPresets,
    activeTimelineFunctionId,
    currentFrame,
  ]);

  useEffect(() => {
    return () => {
      if (snapbackBackToFirstRafRef.current !== null) {
        cancelAnimationFrame(snapbackBackToFirstRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (timelineScrollIndex !== clampedTimelineScrollIndex) {
      setTimelineScrollIndex(clampedTimelineScrollIndex);
    }
  }, [timelineScrollIndex, clampedTimelineScrollIndex]);

  useEffect(() => {
    if (refinePanelMode !== 'advanced' && showIkAdvancedControls) {
      setShowIkAdvancedControls(false);
    }
  }, [refinePanelMode, showIkAdvancedControls]);

  useEffect(() => {
    setTimelineStepFrames((prev) => clamp(Math.round(prev) || 1, 1, maxTimelineStepFrames));
  }, [maxTimelineStepFrames]);

  useEffect(() => {
    if ((!gridOnlyMode || !showAnimationTimeline || !onApplyPoseToFrame) && poseLibraryFrame !== null) {
      setPoseLibraryFrame(null);
      setPoseLibrarySearch('');
    }
  }, [gridOnlyMode, showAnimationTimeline, onApplyPoseToFrame, poseLibraryFrame]);

  const computeWorld = useCallback((jointId: string, rotations: SkeletonRotations, canvasCenter: [number, number]): WorldCoords => {
    return computeJointWorldForPose(jointId, bitruviusData.JOINT_DEFS, rotations, canvasCenter, {
      x: rootX,
      y: rootY,
      rotate: rootRotate,
    });
  }, [bitruviusData.JOINT_DEFS, rootX, rootY, rootRotate]);

  const computeThumbPosePath = useCallback((pose: SkeletonRotations): { path: string; joints: Array<{ x: number; y: number }> } => {
    const center: [number, number] = [0, 0];
    const worldPoints = new Map<string, { x: number; y: number }>();
    bitruviusData.HIERARCHY.forEach(([jointId]) => {
      const world = computeWorld(jointId, pose, center);
      worldPoints.set(jointId, { x: world.x, y: world.y });
    });

    const allPoints = Array.from(worldPoints.values());
    if (!allPoints.length) {
      return { path: '', joints: [] };
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    allPoints.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    });

    const widthSpan = Math.max(1e-6, maxX - minX);
    const heightSpan = Math.max(1e-6, maxY - minY);
    const padding = 8;
    const fitSize = 100 - padding * 2;
    const fitScale = Math.min(fitSize / widthSpan, fitSize / heightSpan);
    const drawWidth = widthSpan * fitScale;
    const drawHeight = heightSpan * fitScale;
    const xOffset = (100 - drawWidth) / 2;
    const yOffset = (100 - drawHeight) / 2;

    const toThumbPoint = (point: { x: number; y: number }): { x: number; y: number } => ({
      x: xOffset + (point.x - minX) * fitScale,
      y: yOffset + (point.y - minY) * fitScale,
    });

    const thumbPoints = new Map<string, { x: number; y: number }>();
    worldPoints.forEach((point, key) => {
      thumbPoints.set(key, toThumbPoint(point));
    });

    const segments: string[] = [];
    bitruviusData.HIERARCHY.forEach(([jointId]) => {
      const joint = bitruviusData.JOINT_DEFS[jointId];
      if (!joint?.parent) return;
      const a = thumbPoints.get(joint.parent);
      const b = thumbPoints.get(jointId);
      if (!a || !b) return;
      segments.push(`M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`);
    });
    return { path: segments.join(' '), joints: Array.from(thumbPoints.values()) };
  }, [bitruviusData.HIERARCHY, bitruviusData.JOINT_DEFS, computeWorld]);

  const applyGroundWeightFromRootY = useCallback((nextRootY: number) => {
    if (!rootGroundLockEnabled) {
      return;
    }
    const deltaY = nextRootY - rootY;
    if (Math.abs(deltaY) < 0.001) {
      return;
    }
    // Downward root shift reads as heavier planted feet; upward shift reads as lighter/tiptoe.
    const heelDelta = clamp(deltaY * 0.22, -6, 6);
    const nextLeftHeelRaw = (rotationsRef.current.l_heel ?? 0) + heelDelta;
    const nextRightHeelRaw = (rotationsRef.current.r_heel ?? 0) + heelDelta;
    const leftHeelLimits = bitruviusData.JOINT_LIMITS.l_heel;
    const rightHeelLimits = bitruviusData.JOINT_LIMITS.r_heel;
    const nextRots: SkeletonRotations = {
      ...rotationsRef.current,
      l_heel: leftHeelLimits ? clamp(nextLeftHeelRaw, leftHeelLimits.min, leftHeelLimits.max) : normA(nextLeftHeelRaw),
      r_heel: rightHeelLimits ? clamp(nextRightHeelRaw, rightHeelLimits.min, rightHeelLimits.max) : normA(nextRightHeelRaw),
    };
    rotationsRef.current = nextRots;
    lastValidRotationsRef.current = nextRots;
    onRotationsChange?.(nextRots);
  }, [rootGroundLockEnabled, rootY, onRotationsChange, bitruviusData.JOINT_LIMITS]);

  const setJointRotationFromSlider = useCallback((jointId: string, rawDegrees: number) => {
    const value = normA(rawDegrees);
    const nextRots = { ...rotationsRef.current, [jointId]: value };
    rotationsRef.current = nextRots;
    lastValidRotationsRef.current = nextRots;
    onRotationsChange?.(nextRots);
  }, [onRotationsChange]);

  const setJointRotationFromWrappedSlider = useCallback((jointId: string, rawDegrees: number) => {
    const prevRaw = fkSliderLastInputRef.current[jointId]
      ?? normA(bitruviusData.initialRotations[jointId] ?? 0);
    const hitPositiveEdge = rawDegrees >= 180 && prevRaw < 179.5;
    const hitNegativeEdge = rawDegrees <= -180 && prevRaw > -179.5;
    const wrapped = hitPositiveEdge ? -180 : hitNegativeEdge ? 180 : rawDegrees;
    fkSliderLastInputRef.current[jointId] = wrapped;
    setJointRotationFromSlider(jointId, wrapped);
  }, [bitruviusData.initialRotations, setJointRotationFromSlider]);




  useEffect(() => {
    rotationsRef.current = bitruviusData.initialRotations;
    lastValidRotationsRef.current = bitruviusData.initialRotations;
    if (!isPlaying) {
      ikSmoothedTargetRef.current = {};
      ikLastEventTsRef.current = {};
      ikGroundPinsRef.current = {};
      fkSliderLastInputRef.current = {};
    }
  }, [bitruviusData.initialRotations, isPlaying]);

  useEffect(() => {
    if (!ikInteractionActive) {
      ikGroundPinsRef.current = {};
    }
  }, [ikInteractionActive]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    setDragState(null);
    setHoveredJoint((prev) => (prev ? null : prev));
    setHoveredHeadGrid((prev) => (prev ? null : prev));
  }, [isPlaying]);

  useEffect(() => {
    if (!ikInteractionActive || legIntentMode !== 'jump') {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        jumpTriggerQueuedRef.current = true;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ikInteractionActive, legIntentMode]);

  // FK -> IK handshake: seed targets from current FK world effectors so switching modes does not snap.
  useEffect(() => {
    const wasIkInteraction = prevIkInteractionRef.current;
    if (!handshakeEnabled) {
      prevIkInteractionRef.current = ikInteractionActive;
      return;
    }
    if (!wasIkInteraction && ikInteractionActive) {
      const center = sceneViewport.center;
      const rots = rotationsRef.current;
      const targets: { [c: string]: { x: number; y: number } } = {};
      Object.keys(bitruviusData.IK_CHAINS).forEach((chainId) => {
        if (!isRuntimeIKChainEnabled(bitruviusData.IK_CHAINS[chainId], bitruviusData)) {
          return;
        }
        const effectorId = bitruviusData.IK_CHAINS[chainId].effector;
        const world = computeWorld(effectorId, rots, center);
        targets[chainId] = { x: world.x, y: world.y };
      });
      setIkTargets(targets);
    }
    prevIkInteractionRef.current = ikInteractionActive;
  }, [ikInteractionActive, handshakeEnabled, sceneViewport, bitruviusData, computeWorld]);

  const updateHoveredJoint = useCallback((mx: number, my: number, center: [number, number]) => {
    const HOVER_RADIUS = 18;
    let best: { id: string; label: string; x: number; y: number; dist: number } | null = null;
    const reversedHierarchy = [...bitruviusData.HIERARCHY].reverse();
    for (const [id] of reversedHierarchy) {
      if (id === 'nose') continue;
      const world = computeWorld(id, rotationsRef.current, center);
      const pos = toDisplayPoint(world.x, world.y);
      const dist = Math.hypot(pos.x - mx, pos.y - my);
      if (dist > HOVER_RADIUS) continue;
      if (!best || dist < best.dist) {
        best = {
          id,
          label: (bitruviusData.JOINT_DEFS[id]?.label ?? id).replaceAll('_', ' '),
          x: pos.x,
          y: pos.y,
          dist,
        };
      }
    }

    const nextHeadGrid = getHeadGridHoverInfo(mx, my);
    const occludedByModel = Boolean(best);
    setHoveredHeadGrid((prev) => {
      const next: HeadGridHoverInfo = { ...nextHeadGrid, occludedByModel };
      if (
        prev &&
        prev.label === next.label &&
        prev.occludedByModel === next.occludedByModel &&
        Math.abs(prev.x - next.x) < 0.5 &&
        Math.abs(prev.y - next.y) < 0.5
      ) {
        return prev;
      }
      return next;
    });

    setHoveredJoint((prev) => {
      if (!best) return prev ? null : prev;
      const next = { id: best.id, label: best.label, x: best.x, y: best.y };
      if (prev && prev.id === next.id && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5) {
        return prev;
      }
      return next;
    });
  }, [bitruviusData.HIERARCHY, bitruviusData.JOINT_DEFS, computeWorld, toDisplayPoint, getHeadGridHoverInfo]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const center = sceneViewport.center;
    setHoveredJoint((prev) => (prev ? null : prev));
    setHoveredHeadGrid((prev) => (prev ? null : prev));

    // Priority 1: Root joint - FK mode = root rotation (360°), IK mode = position
    const rootPos = computeWorld("root", rotationsRef.current, center);
    const rootDisplay = toDisplayPoint(rootPos.x, rootPos.y);
    const rootDist = Math.hypot(rootDisplay.x - mx, rootDisplay.y - my);
    if (rootDist < 15) {
      const canDragRootPosition = rootXControlEnabled || rootYControlEnabled;
      const canDragRootRotate = rootRotateControlEnabled;
      if (!ikInteractionActive && fk360Enabled && rootFkDragArmed && canDragRootRotate) {
        lastFkAngleRef.current = r2d(Math.atan2(my - rootDisplay.y, mx - rootDisplay.x));
        setDragState({ id: "root", type: "FK" });
      } else if (canDragRootPosition) {
        setDragState({ id: "root", type: "ROOT" });
      }
      return;
    }

    // Priority 2: IK effectors (if in IK mode and chain is active)
    if (ikInteractionActive) {
      // Priority 2A: Extended chain controls behind key effectors.
      if (ikExtendedHandlesEnabled) {
        for (const handle of IK_BACK_HANDLES) {
          if (!activeIKChains[handle.chainId]) continue;
          const chainDef = bitruviusData.IK_CHAINS[handle.chainId];
          if (!isRuntimeIKChainEnabled(chainDef, bitruviusData)) continue;
          if (!bitruviusData.JOINT_DEFS[handle.effectorId] || !bitruviusData.JOINT_DEFS[handle.guideJointId]) continue;

          const effectorWorld = computeWorld(handle.effectorId, rotationsRef.current, center);
          const guideWorld = computeWorld(handle.guideJointId, rotationsRef.current, center);
          const vx = effectorWorld.x - guideWorld.x;
          const vy = effectorWorld.y - guideWorld.y;
          const len = Math.hypot(vx, vy);
          if (len <= 1e-4) continue;

          const handleWorldX = effectorWorld.x + (vx / len) * handle.offsetPx;
          const handleWorldY = effectorWorld.y + (vy / len) * handle.offsetPx;
          const handleDisplay = toDisplayPoint(handleWorldX, handleWorldY);
          const handleDist = Math.hypot(handleDisplay.x - mx, handleDisplay.y - my);
          if (handleDist <= handle.hitRadiusPx) {
            const seedTarget = { x: handleWorldX, y: handleWorldY };
            beginIkDrag(handle.chainId, seedTarget, center);
            return;
          }
        }
      }

      // Priority 2B: Standard effector controls, preferring full chains for shared effectors.
      let bestEffectorPick: { chainId: string; dist: number; priority: number } | null = null;
      for (const chainId of Object.keys(bitruviusData.IK_CHAINS)) {
        if (!activeIKChains[chainId]) continue;
        if (!isRuntimeIKChainEnabled(bitruviusData.IK_CHAINS[chainId], bitruviusData)) continue;
        const effectorId = bitruviusData.IK_CHAINS[chainId].effector;
        if (ikPreferFullChainEnabled) {
          const preferredChainId = IK_FULL_CHAIN_BY_EFFECTOR[effectorId];
          if (
            preferredChainId &&
            preferredChainId !== chainId &&
            activeIKChains[preferredChainId] &&
            isRuntimeIKChainEnabled(bitruviusData.IK_CHAINS[preferredChainId], bitruviusData)
          ) {
            continue;
          }
        }
        const effectorPos = computeWorld(effectorId, rotationsRef.current, center);
        const effectorDisplay = toDisplayPoint(effectorPos.x, effectorPos.y);
        const effectorDist = Math.hypot(effectorDisplay.x - mx, effectorDisplay.y - my);
        if (effectorDist >= 15) continue;

        const priority = getIkDragPriority(chainId);
        if (
          !bestEffectorPick ||
          effectorDist < bestEffectorPick.dist - 0.75 ||
          (Math.abs(effectorDist - bestEffectorPick.dist) <= 0.75 && priority < bestEffectorPick.priority)
        ) {
          bestEffectorPick = { chainId, dist: effectorDist, priority };
        }
      }
      if (bestEffectorPick) {
        const effectorId = bitruviusData.IK_CHAINS[bestEffectorPick.chainId].effector;
        const effectorPos = computeWorld(effectorId, rotationsRef.current, center);
        beginIkDrag(bestEffectorPick.chainId, { x: effectorPos.x, y: effectorPos.y }, center);
        return;
      }
    }

    // Priority 3: FK hierarchy-aware pick
    const fkControllerFor = (id: string) => (id === 'xiphoid' ? 'torso_base' : id);
    const worldPosById: Record<string, { x: number; y: number }> = {};
    bitruviusData.HIERARCHY.forEach(([id]) => {
      const pos = computeWorld(id, rotationsRef.current, center);
      worldPosById[id] = toDisplayPoint(pos.x, pos.y);
    });
    const setFkDrag = (controllerId: string, fallbackPos?: { x: number; y: number }) => {
      const controllerPos = worldPosById[controllerId] ?? fallbackPos;
      if (controllerPos) {
        lastFkAngleRef.current = r2d(Math.atan2(my - controllerPos.y, mx - controllerPos.x));
      }
      setDragState({ id: controllerId, type: 'FK' });
    };
    const projectPointToSegment = (
      px: number,
      py: number,
      ax: number,
      ay: number,
      bx: number,
      by: number
    ): { dist: number; t: number } => {
      const abx = bx - ax;
      const aby = by - ay;
      const abLenSq = abx * abx + aby * aby;
      if (abLenSq < 1e-6) return { dist: Math.hypot(px - ax, py - ay), t: 0 };
      const apx = px - ax;
      const apy = py - ay;
      const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
      const cx = ax + abx * t;
      const cy = ay + aby * t;
      return { dist: Math.hypot(px - cx, py - cy), t };
    };

    // 3A) Joint hotspot: clicking a joint activates that joint.
    const JOINT_HIT_RADIUS = 14;
    const reversedHierarchy = [...bitruviusData.HIERARCHY].reverse();
    for (const [id] of reversedHierarchy) {
      if (id === 'root') continue;
      const pos = worldPosById[id];
      if (!pos) continue;
      const dist = Math.hypot(pos.x - mx, pos.y - my);
      if (dist <= JOINT_HIT_RADIUS) {
        const controllerId = fkControllerFor(id);
        setFkDrag(controllerId, pos);
        return;
      }
    }

    // 3B) Arm-specific FK hit zones (slightly larger than shapes for easier grabbing).
    const ARM_SEGMENT_HIT_RADIUS = 18;
    const ARM_HAND_HIT_RADIUS = 16;
    const armJointTriples: Array<[string, string, string]> = [
      ['l_shoulder', 'l_elbow', 'l_palm'],
      ['r_shoulder', 'r_elbow', 'r_palm'],
    ];
    let bestArmPick: { id: string; dist: number } | null = null;
    armJointTriples.forEach(([shoulderId, elbowId, palmId]) => {
      const shoulder = worldPosById[shoulderId];
      const elbow = worldPosById[elbowId];
      const palm = worldPosById[palmId];
      if (!shoulder || !elbow || !palm) return;

      // Bicep region -> shoulder controller.
      const bicepHit = projectPointToSegment(mx, my, shoulder.x, shoulder.y, elbow.x, elbow.y);
      // Keep the shoulder zone off the elbow-end overlap so elbow control wins there.
      if (
        bicepHit.dist <= ARM_SEGMENT_HIT_RADIUS &&
        bicepHit.t <= 0.85 &&
        (!bestArmPick || bicepHit.dist < bestArmPick.dist)
      ) {
        bestArmPick = { id: shoulderId, dist: bicepHit.dist };
      }

      // Forearm region -> elbow controller.
      const forearmHit = projectPointToSegment(mx, my, elbow.x, elbow.y, palm.x, palm.y);
      if (forearmHit.dist <= ARM_SEGMENT_HIT_RADIUS && (!bestArmPick || forearmHit.dist <= bestArmPick.dist)) {
        bestArmPick = { id: elbowId, dist: forearmHit.dist };
      }

      // Hand region (extended past palm) -> wrist/hand controller.
      const handVecX = palm.x - elbow.x;
      const handVecY = palm.y - elbow.y;
      const handLen = Math.hypot(handVecX, handVecY);
      if (handLen > 1e-6) {
        const ux = handVecX / handLen;
        const uy = handVecY / handLen;
        const handTipX = palm.x + ux * 22;
        const handTipY = palm.y + uy * 22;
        const handHit = projectPointToSegment(mx, my, palm.x, palm.y, handTipX, handTipY);
        if (handHit.dist <= ARM_HAND_HIT_RADIUS && (!bestArmPick || handHit.dist < bestArmPick.dist)) {
          bestArmPick = { id: palmId, dist: handHit.dist };
        }
      }
    });

    if (bestArmPick) {
      setFkDrag(bestArmPick.id);
      return;
    }

    // 3C) Bone segment hotspot: clicking joint->child segment activates the joint.
    const SEGMENT_HIT_RADIUS = 12;
    let bestSegment: { id: string; dist: number } | null = null;
    bitruviusData.HIERARCHY.forEach(([childId]) => {
      const parentId = bitruviusData.JOINT_DEFS[childId]?.parent;
      if (!parentId) return;
      const a = worldPosById[parentId];
      const b = worldPosById[childId];
      if (!a || !b) return;

      const { dist } = projectPointToSegment(mx, my, a.x, a.y, b.x, b.y);
      if (dist > SEGMENT_HIT_RADIUS) return;

      const controllerId = fkControllerFor(parentId);
      if (!bestSegment || dist < bestSegment.dist) {
        bestSegment = { id: controllerId, dist };
      }
    });

    if (bestSegment) {
      setFkDrag(bestSegment.id);
      return;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPlaying) {
      if (dragState) {
        setDragState(null);
      }
      setHoveredJoint((prev) => (prev ? null : prev));
      setHoveredHeadGrid((prev) => (prev ? null : prev));
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const center = sceneViewport.center;
    if (!dragState) {
      updateHoveredJoint(mx, my, center);
      return;
    }
    setHoveredJoint((prev) => (prev ? null : prev));
    setHoveredHeadGrid((prev) => (prev ? null : prev));

    if (dragState.type === "ROOT") {
      const nextRootX = mx - center[0];
      const nextRootY = my - center[1];
      onMasterPinChange?.([nextRootX, nextRootY]);
      const patch: MovementToggles = { ...(movementToggles || {}) };
      if (rootXControlEnabled) patch.rootX = nextRootX;
      if (rootYControlEnabled) {
        patch.rootY = nextRootY;
        applyGroundWeightFromRootY(nextRootY);
      }
      onMovementTogglesChange?.(patch);
    } else if (dragState.type === "FK") {
      const id = dragState.id;
      if (id === 'root' && !rootRotateControlEnabled) {
        return;
      }
      const world = computeWorld(id, rotationsRef.current, center);
      const worldDisplay = toDisplayPoint(world.x, world.y);
      const parentId = bitruviusData.JOINT_DEFS[id]?.parent;
      const pWorld = parentId ? computeWorld(parentId, rotationsRef.current, center) : { x: center[0], y: center[1], angle: 0, parentAngle: 0 };
      const lim = bitruviusData.JOINT_LIMITS[id];
      const allow360 = fk360Enabled;
      const applyFkConstraints = fkConstraintsEnabled;
      const previousLocal = id === 'root' ? rootRotate : (rotationsRef.current[id] ?? 0);
      const isLegControl = id === 'l_hip' || id === 'l_knee' || id === 'l_heel' || id === 'r_hip' || id === 'r_knee' || id === 'r_heel';
      const activeLegSide = id.startsWith('l_') ? 'l' : id.startsWith('r_') ? 'r' : null;
      const stanceEffectorId: 'l_heel' | 'r_heel' | null = activeLegSide === 'l'
        ? 'r_heel'
        : activeLegSide === 'r'
          ? 'l_heel'
          : null;
      const previousGroundY = rootGroundLockEnabled && isLegControl
        ? (stanceEffectorId
            ? computeWorld(stanceEffectorId, rotationsRef.current, center).y
            : Math.max(
                computeWorld('l_heel', rotationsRef.current, center).y,
                computeWorld('r_heel', rotationsRef.current, center).y
              ))
        : null;
      let local: number;
      if (allow360) {
        const pivot = id === "root" ? worldDisplay : worldDisplay;
        const newAngle = r2d(Math.atan2(my - pivot.y, mx - pivot.x));
        const delta = normA(newAngle - lastFkAngleRef.current);
        lastFkAngleRef.current = newAngle;
        local = previousLocal + delta;
      } else {
        local = normA(r2d(Math.atan2(my - worldDisplay.y, mx - worldDisplay.x)) - pWorld.angle);
        if (allow360) lastFkAngleRef.current = local;
        else if (applyFkConstraints && lim) local = clamp(local, lim.min, lim.max);
      }
      const fkRotationFluidity = clamp((fkRotationSensitivity + fkRotationResponse) / 2, 0.35, 1.6);
      if (fkRotationFluidity !== 1) {
        local = previousLocal + normA(local - previousLocal) * fkRotationFluidity;
      }
      if (!allow360 && applyFkConstraints && lim) local = clamp(local, lim.min, lim.max);
      const nextRots = id === 'root'
        ? { ...rotationsRef.current }
        : { ...rotationsRef.current, [id]: local };
      const localDelta = normA(local - previousLocal);
      if (Math.abs(localDelta) > 1e-6 && id !== 'root') {
        const directChildren = Object.entries(bitruviusData.JOINT_DEFS)
          .filter(([, def]) => def.parent === id)
          .map(([jointId]) => jointId);

        const bendOffset = clamp(fkBendOffsetByJoint[id] ?? 0, -12, 12);
        if (bendOffset !== 0) {
          const bendGain = bendOffset / 12;
          directChildren.forEach((childId) => {
            const prev = nextRots[childId] ?? 0;
            const childLim = bitruviusData.JOINT_LIMITS[childId];
            const candidate = prev + localDelta * bendGain;
            nextRots[childId] = childLim && fkConstraintsEnabled
              ? clamp(candidate, childLim.min, childLim.max)
              : normA(candidate);
          });
        }

        const stretchOffset = clamp(fkStretchOffsetByJoint[id] ?? 0, -12, 12);
        if (stretchOffset !== 0) {
          const stretchGain = stretchOffset / 12;
          const queue: Array<{ jointId: string; depth: number }> = directChildren.map((jointId) => ({ jointId, depth: 1 }));
          while (queue.length) {
            const { jointId, depth } = queue.shift()!;
            const descendants = Object.entries(bitruviusData.JOINT_DEFS)
              .filter(([, def]) => def.parent === jointId)
              .map(([descId]) => descId);
            descendants.forEach((descId) => queue.push({ jointId: descId, depth: depth + 1 }));
            const prev = nextRots[jointId] ?? 0;
            const jointLim = bitruviusData.JOINT_LIMITS[jointId];
            const stretchDelta = localDelta * stretchGain * Math.max(1, depth) * 0.2;
            const candidate = prev + stretchDelta;
            nextRots[jointId] = jointLim && fkConstraintsEnabled
              ? clamp(candidate, jointLim.min, jointLim.max)
              : normA(candidate);
          }
        }
      }
      if (id === 'root' && onMovementTogglesChange) {
        onMovementTogglesChange({
          ...(movementToggles || {}),
          rootRotate: local,
        });
      }
      if (rootGroundLockEnabled && isLegControl && previousGroundY !== null && onMovementTogglesChange) {
        const nextGroundY = stanceEffectorId
          ? computeJointWorldForPose(stanceEffectorId, bitruviusData.JOINT_DEFS, nextRots, center, {
              x: rootX,
              y: rootY,
              rotate: rootRotate,
            }).y
          : Math.max(
              computeJointWorldForPose('l_heel', bitruviusData.JOINT_DEFS, nextRots, center, {
                x: rootX,
                y: rootY,
                rotate: rootRotate,
              }).y,
              computeJointWorldForPose('r_heel', bitruviusData.JOINT_DEFS, nextRots, center, {
                x: rootX,
                y: rootY,
                rotate: rootRotate,
              }).y
            );
        const deltaRootY = previousGroundY - nextGroundY;
        if (Math.abs(deltaRootY) > 0.001) {
          onMovementTogglesChange({
            ...(movementToggles || {}),
            rootY: rootY + deltaRootY,
          });
        }
      }
      rotationsRef.current = nextRots;
      lastValidRotationsRef.current = nextRots;
      onRotationsChange?.(nextRots);
    } else if (dragState.type === "IK") {
      const chainId = dragState.id;
      if (
        !ikInteractionActive ||
        !activeIKChains[chainId] ||
        !isRuntimeIKChainEnabled(bitruviusData.IK_CHAINS[chainId], bitruviusData)
      ) {
        return;
      }
      const now = performance.now();
      const prevEventTs = ikLastEventTsRef.current[chainId] ?? now;
      const dtMs = Math.max(0, now - prevEventTs);
      ikLastEventTsRef.current[chainId] = now;

      const target = fromDisplayPoint(mx, my);
      const lowFrictionChain = LOW_FRICTION_IK_CHAINS.has(chainId);
      const previousTarget = ikSmoothedTargetRef.current[chainId] ?? target;
      const targetAlphaBase = lowFrictionChain ? IK_TARGET_SMOOTH_ALPHA_LOW_FRICTION : IK_TARGET_SMOOTH_ALPHA;
      const targetAlpha = resolveTemporalAlpha(targetAlphaBase, dtMs || IK_BASE_FRAME_MS);
      const targetDeadzone = lowFrictionChain ? IK_TARGET_DEADZONE_LOW_FRICTION : IK_TARGET_DEADZONE;
      const targetDistance = Math.hypot(target.x - previousTarget.x, target.y - previousTarget.y);
      const deadzoneRatio = clamp(targetDistance / Math.max(targetDeadzone, 1e-6), 0, 1);
      const distanceScaledAlpha = targetAlpha * (0.2 + deadzoneRatio * 0.8);
      const smoothedTarget = targetDistance <= IK_TARGET_HOLD_EPSILON
        ? previousTarget
        : {
          x: blendValue(previousTarget.x, target.x, distanceScaledAlpha),
          y: blendValue(previousTarget.y, target.y, distanceScaledAlpha),
        };
      ikSmoothedTargetRef.current[chainId] = smoothedTarget;
      const legIntent = resolveLegIntent({
        mode: legIntentMode,
        activeChainId: chainId,
        target: smoothedTarget,
        currentRotations: rotationsRef.current,
        dtMs: dtMs || IK_BASE_FRAME_MS,
        jumpState: jumpAssistStateRef.current,
        jumpTrigger: jumpTriggerQueuedRef.current,
        postureState,
        postureRoll,
        poseDirection,
        weightShiftLateral,
        weightShiftDepth,
      });
      jumpAssistStateRef.current = legIntent.jumpState;
      jumpTriggerQueuedRef.current = false;

      const chainTargets: Record<string, { x: number; y: number }> = {};
      chainTargets[chainId] = legIntent.target;
      Object.entries(legIntent.counterpartTargets).forEach(([assistChainId, assistTarget]) => {
        chainTargets[assistChainId] = assistTarget;
      });
      Object.entries(resolveGroundPinnedTargets(chainId)).forEach(([assistChainId, assistTarget]) => {
        chainTargets[assistChainId] = assistTarget;
      });

      let workingRotations = { ...rotationsRef.current };
      const resolvedTargets: Record<string, { x: number; y: number }> = {};
      const chainOrder = resolveSolveChainOrder(chainId);
      Object.keys(chainTargets).forEach((targetChainId) => {
        if (!chainOrder.includes(targetChainId)) {
          chainOrder.push(targetChainId);
        }
      });
      for (const solveChainId of chainOrder) {
        const solveTarget = chainTargets[solveChainId];
        if (!solveTarget) continue;
        const chainLowFriction = LOW_FRICTION_IK_CHAINS.has(solveChainId);
        const solved = solveIK_AdvancedWithResult(
          solveChainId,
          solveTarget.x,
          solveTarget.y,
          workingRotations,
          center,
          bitruviusData,
          computeWorld,
          {
            stretchEnabled,
            softReachEnabled,
            naturalBendEnabled,
            activeStage: IK_RUNTIME_STAGE,
            damping: chainLowFriction ? 0.16 : undefined,
            convergenceThreshold: chainLowFriction ? 0.04 : undefined,
            maxIterations: chainLowFriction ? 24 : undefined,
            epsilon: chainLowFriction ? 0.12 : undefined,
            enforceJointLimits: ikUnconstrainedEnabled ? false : (chainLowFriction ? false : true),
            solver: ikSolver,
          }
        );
        if (!solved.success || !isFiniteRotationMap(solved.rotations)) {
          rotationsRef.current = lastValidRotationsRef.current;
          return;
        }
        workingRotations = solved.rotations;
        resolvedTargets[solveChainId] = { x: solved.target.x, y: solved.target.y };
      }

      Object.entries(legIntent.rotationOffsets).forEach(([jointId, offset]) => {
        if (typeof offset !== 'number' || !Number.isFinite(offset)) return;
        const prev = workingRotations[jointId] ?? 0;
        workingRotations[jointId] = normA(prev + offset);
      });

      if (ikProfile === "human") {
        workingRotations = applyHumanAssist({
          activeChainId: chainId,
          currentRotations: rotationsRef.current,
          solvedRotations: workingRotations,
          previousRotations: lastValidRotationsRef.current,
          toggles: {
            humanCounterbalanceEnabled,
            humanMirrorEnabled,
            humanFollowThroughEnabled,
            humanCollarNeckFollowEnabled,
          },
          dtMs: dtMs || IK_BASE_FRAME_MS,
        });
      }

      const rotationAlphaBase = lowFrictionChain ? IK_ROTATION_BLEND_ALPHA_LOW_FRICTION : IK_ROTATION_BLEND_ALPHA;
      const rotationAlpha = resolveTemporalAlpha(rotationAlphaBase, dtMs || IK_BASE_FRAME_MS);
      const maxStepPerFrame = lowFrictionChain ? IK_ROTATION_STEP_MAX_LOW_FRICTION : IK_ROTATION_STEP_MAX;
      const maxStep = maxStepPerFrame * (clamp(dtMs || IK_BASE_FRAME_MS, IK_EVENT_DT_MIN_MS, IK_EVENT_DT_MAX_MS) / IK_BASE_FRAME_MS);
      const blendedRotations = blendRotations(rotationsRef.current, workingRotations, rotationAlpha, maxStep);
      const hasVisualRotationDelta = maxRotationDeltaDeg(rotationsRef.current, blendedRotations) > IK_ROTATION_APPLY_EPSILON_DEG;
      if (hasVisualRotationDelta) {
        rotationsRef.current = blendedRotations;
        lastValidRotationsRef.current = blendedRotations;
        onRotationsChange?.(blendedRotations);
      }
      setIkTargets((prev) => mergeTargetsWithEpsilon(prev, resolvedTargets));
    }
  };

  const handleMouseUp = () => {
    if (dragState?.type === "IK") {
      delete ikSmoothedTargetRef.current[dragState.id];
      delete ikLastEventTsRef.current[dragState.id];
      ikGroundPinsRef.current = {};
    }
    setDragState(null);
    setHoveredJoint((prev) => (prev ? null : prev));
    setHoveredHeadGrid((prev) => (prev ? null : prev));
  };

  const handleMouseLeave = () => {
    if (dragState?.type === "IK") {
      delete ikSmoothedTargetRef.current[dragState.id];
      delete ikLastEventTsRef.current[dragState.id];
      ikGroundPinsRef.current = {};
    }
    setDragState(null);
    setHoveredJoint((prev) => (prev ? null : prev));
    setHoveredHeadGrid((prev) => (prev ? null : prev));
  };

  const ikDebugOverlayEnabled = React.useMemo(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
      return false;
    }
    return (window as Window & { __IK_DEBUG_OVERLAY__?: boolean }).__IK_DEBUG_OVERLAY__ === true;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);



    render({
      ctx,
      width,
      height,
      viewWindow: sceneViewport,
      majorGridSize,
      minorGridSize,
      bitruviusData,
      rotations: rotationsRef.current,
      mocapMode,
      silhouetteMode,
      lotteMode,
      ikTargets,
      computeWorld,
      ghostFrames,
      visualModules,
      backgroundLayer: resolvedBackgroundLayer,
      foregroundLayer: resolvedForegroundLayer,
      gridOnlyMode,
      showIkDebugOverlay: ikDebugOverlayEnabled,
      headGridHover: hoveredHeadGrid,
    });
  }, [width, height, sceneViewport, majorGridSize, minorGridSize, bitruviusData, interactionMode, ikTargets, mocapMode, silhouetteMode, lotteMode, computeWorld, ghostFrames, visualModules, resolvedBackgroundLayer, resolvedForegroundLayer, gridOnlyMode, ikDebugOverlayEnabled, hoveredHeadGrid]);

  const gridRefineTop = UI_INSET + (onExitGridView ? 38 : 0);
  const bgOpacityPercent = Math.round(clamp(Number.isFinite(resolvedBackgroundLayer.opacity) ? resolvedBackgroundLayer.opacity : 1, 0, 1) * 100);
  const fgOpacityPercent = Math.round(clamp(Number.isFinite(resolvedForegroundLayer.opacity) ? resolvedForegroundLayer.opacity : 1, 0, 1) * 100);
  const bgXPercent = Math.round(clamp(Number.isFinite(resolvedBackgroundLayer.x) ? resolvedBackgroundLayer.x : 50, 0, 100));
  const bgYPercent = Math.round(clamp(Number.isFinite(resolvedBackgroundLayer.y) ? resolvedBackgroundLayer.y : 50, 0, 100));
  const fgXPercent = Math.round(clamp(Number.isFinite(resolvedForegroundLayer.x) ? resolvedForegroundLayer.x : 50, 0, 100));
  const fgYPercent = Math.round(clamp(Number.isFinite(resolvedForegroundLayer.y) ? resolvedForegroundLayer.y : 50, 0, 100));
  const bgScalePercent = Math.round(clamp(Number.isFinite(resolvedBackgroundLayer.scale) ? resolvedBackgroundLayer.scale : 100, 10, 400));
  const fgScalePercent = Math.round(clamp(Number.isFinite(resolvedForegroundLayer.scale) ? resolvedForegroundLayer.scale : 100, 10, 400));
  const bgFitMode = resolvedBackgroundLayer.fitMode ?? 'free';
  const fgFitMode = resolvedForegroundLayer.fitMode ?? 'free';
  const fgBlendMode = resolvedForegroundLayer.blendMode ?? 'source-over';
  const rightRailOffset = showAnimationTimeline ? timelineRailWidth + UI_INSET : UI_INSET;
  const poseLibraryDisplayFrame = poseLibraryFrame !== null ? poseLibraryFrame + 1 : null;

  return (
    <div className="relative overflow-hidden" style={{ width: `${width}px`, height: `${height}px` }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ width: `${width}px`, height: `${height}px` }}
        className={gridOnlyMode ? "bg-transparent" : "bg-transparent shadow-2xl transition-colors duration-500"}
      />
      <input
        ref={backgroundUploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleBackgroundUploadInput}
        className="hidden"
      />
      <input
        ref={foregroundUploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleForegroundUploadInput}
        className="hidden"
      />

      {hoveredJoint ? (
        <div
          className="absolute pointer-events-none bg-black/45 border border-zinc-700 text-zinc-100 px-2 py-1 rounded text-[10px] tracking-wide font-mono"
          style={{
            left: `${hoveredJoint.x}px`,
            top: `${hoveredJoint.y}px`,
            transform: 'translate(-50%, -130%)',
            zIndex: 75,
            whiteSpace: 'nowrap',
          }}
        >
          {hoveredJoint.label}
        </div>
      ) : null}

      {hoveredHeadGrid && !hoveredHeadGrid.occludedByModel ? (
        <div
          className="absolute pointer-events-none bg-black/45 border border-violet-600 text-violet-100 px-2 py-1 rounded text-[10px] tracking-wide font-mono"
          style={{
            left: `${hoveredHeadGrid.x}px`,
            top: `${hoveredHeadGrid.y}px`,
            transform: 'translate(-50%, 110%)',
            zIndex: 75,
            whiteSpace: 'nowrap',
          }}
        >
          {hoveredHeadGrid.label}
        </div>
      ) : null}

      {gridOnlyMode && showAnimationTimeline ? (
        <div
          className="absolute pointer-events-auto"
          onWheel={handleTimelineWheel}
          style={{
            top: '0px',
            bottom: '0px',
            right: '0px',
            zIndex: 73,
          }}
        >
          <div
            className="border rounded-none shadow-xl backdrop-blur-sm h-full flex flex-col"
            style={{
              width: `${timelineRailWidth}px`,
              height: '100%',
              background: 'rgba(18, 16, 24, 0.74)',
              borderColor: 'rgba(158, 150, 184, 0.5)',
            }}
          >
            <div className="px-3 py-2.5 border-b border-violet-200/20 flex items-center justify-between gap-1.5">
              <span className="text-[10px] tracking-[0.16em] uppercase text-violet-100/90 font-semibold">Animation Timeline</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTimelinePanelMode((prev) => (prev === 'basic' ? 'advanced' : 'basic'))}
                  className="min-h-7 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-100 hover:bg-white/10 transition-colors"
                  title="Toggle basic and advanced timeline controls"
                >
                  Mode: {timelinePanelMode === 'advanced' ? 'Advanced' : 'Basic'}
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineControlsMinimized((prev) => !prev)}
                  className="min-h-7 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-100 hover:bg-white/10 transition-colors"
                  title="Show or hide the controls section above frame slots"
                >
                  Controls: {timelineControlsMinimized ? 'Hidden' : 'Shown'}
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineMinimized((prev) => !prev)}
                  className="min-h-7 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors"
                  title="Collapse or expand timeline panel"
                >
                  {timelineMinimized ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>

            {!timelineMinimized ? (
              <div className="px-2.5 py-2.5 flex-1 min-h-0 flex flex-col gap-2.5">
                {!timelineControlsMinimized ? (
                  <>
                <div className="grid grid-cols-2 gap-1.5 border border-white/10 rounded p-2">
                  <button
                    type="button"
                    onClick={onTogglePlayback}
                    disabled={animationControlDisabled || !onTogglePlayback}
                    className="min-h-8 px-2 py-1.5 text-[11px] border border-white/15 rounded text-zinc-100 disabled:opacity-45 disabled:cursor-not-allowed"
                    style={{
                      background: isPlaying ? 'rgba(180, 52, 84, 0.42)' : 'rgba(26, 32, 46, 0.54)',
                    }}
                    title="Toggle playback"
                  >
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <div className="min-h-8 px-2 py-1.5 text-[11px] border border-white/10 rounded text-zinc-300 text-center tracking-[0.04em] uppercase">
                    Frame {currentDisplayFrame}/{totalDisplayFrames}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSetCurrentFrame?.(Math.max(0, Math.round(currentFrame) - 1))}
                    disabled={animationControlDisabled || !onSetCurrentFrame || Math.round(currentFrame) <= 0}
                    className="min-h-8 px-2 py-1.5 text-[11px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                    title="Previous frame"
                  >
                    Previous Frame
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetCurrentFrame?.(Math.round(currentFrame) + 1)}
                    disabled={animationControlDisabled || !onSetCurrentFrame}
                    className="min-h-8 px-2 py-1.5 text-[11px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                    title="Next frame"
                  >
                    Next Frame
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 border border-white/10 rounded p-2">
                  <button
                    type="button"
                    onClick={onSetKeyframe}
                    disabled={animationControlDisabled || !onSetKeyframe || isCurrentFrameKeyframe}
                    className="min-h-8 px-2 py-1.5 text-[11px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                    title="Add keyframe at current frame"
                  >
                    Capture Current
                  </button>
                  <button
                    type="button"
                    onClick={onRemoveKeyframe}
                    disabled={animationControlDisabled || !onRemoveKeyframe || !isCurrentFrameKeyframe || sortedKeyframeFrames.length <= 1}
                    className="min-h-8 px-2 py-1.5 text-[11px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                    title="Remove keyframe at current frame"
                  >
                    Clear Current
                  </button>
                  <div className="col-span-2 text-[10px] text-zinc-400 tracking-[0.05em] uppercase text-center">
                    Keyframes: {sortedKeyframeFrames.length}
                  </div>
                </div>

                {timelinePanelMode === 'advanced' ? (
                  <>
                    <div className="space-y-1.5 border border-white/10 rounded p-2">
                      <div className="grid grid-cols-[60px_1fr] items-center gap-1.5">
                        <label className="text-[10px] tracking-[0.05em] uppercase text-zinc-400">FPS</label>
                        <input
                          type="number"
                          value={fps}
                          disabled={animationControlDisabled || !onFpsChange}
                          onChange={(e) => onFpsChange?.(Number(e.target.value))}
                          className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div className="grid grid-cols-[60px_1fr] items-center gap-1.5">
                        <label className="text-[10px] tracking-[0.05em] uppercase text-zinc-400">Frames</label>
                        <input
                          type="number"
                          value={frameCount}
                          disabled={animationControlDisabled || !onFrameCountChange}
                          onChange={(e) => onFrameCountChange?.(Number(e.target.value))}
                          className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div className="grid grid-cols-[60px_1fr] items-center gap-1.5">
                        <label className="text-[10px] tracking-[0.05em] uppercase text-zinc-400">Easing</label>
                        <select
                          value={easing}
                          disabled={animationControlDisabled || !onEasingChange}
                          onChange={(e) => onEasingChange?.(e.target.value)}
                          className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
                        >
                          {easingOptions.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2 border border-white/10 rounded p-2">
                      <div className="text-[10px] tracking-[0.06em] uppercase text-zinc-300">Image Layers</div>

                      <div className="space-y-1.5 border border-white/10 rounded p-2">
                        <div className="flex items-center justify-between text-[10px] tracking-[0.05em] uppercase text-zinc-400">
                          <span>Background</span>
                          <span className="text-zinc-500">{resolvedBackgroundLayer.src ? 'Loaded' : 'Empty'}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={openBackgroundUpload}
                            disabled={!onUploadBackgroundImageLayer}
                            className="min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                          >
                            {resolvedBackgroundLayer.src ? 'Replace BG' : 'Upload BG'}
                          </button>
                          <button
                            type="button"
                            onClick={onClearBackgroundImageLayer}
                            disabled={!onClearBackgroundImageLayer || !resolvedBackgroundLayer.src}
                            className="min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                          >
                            Clear BG
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onPatchBackgroundImageLayer?.({
                                visible: true,
                                opacity: 1,
                                x: 50,
                                y: 50,
                                scale: 100,
                                fitMode: 'free',
                              })
                            }
                            disabled={!onPatchBackgroundImageLayer}
                            className="min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                          >
                            Reset BG
                          </button>
                        </div>
                        <label className="flex items-center justify-between text-[10px] tracking-[0.05em] uppercase text-zinc-300">
                          <span>Visible</span>
                          <input
                            type="checkbox"
                            checked={resolvedBackgroundLayer.visible}
                            disabled={!resolvedBackgroundLayer.src || !onPatchBackgroundImageLayer}
                            onChange={(event) => onPatchBackgroundImageLayer?.({ visible: event.target.checked })}
                            className="h-3.5 w-3.5 accent-violet-400 disabled:opacity-45"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Fit</span>
                          <select
                            value={bgFitMode}
                            disabled={!onPatchBackgroundImageLayer}
                            onChange={(event) =>
                              onPatchBackgroundImageLayer?.({
                                fitMode: event.target.value as NonNullable<ImageLayerState['fitMode']>,
                              })
                            }
                            className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 disabled:opacity-45 disabled:cursor-not-allowed"
                          >
                            {IMAGE_FIT_MODE_OPTIONS.map((option) => (
                              <option key={`bg-fit-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] tracking-[0.05em] uppercase text-zinc-400">
                            <span>Opacity</span>
                            <span>{bgOpacityPercent}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={bgOpacityPercent}
                            disabled={!onPatchBackgroundImageLayer}
                            onChange={(event) =>
                              onPatchBackgroundImageLayer?.({
                                opacity: clamp(Number(event.target.value), 0, 100) / 100,
                              })
                            }
                            className="w-full accent-violet-400 disabled:opacity-45 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <label className="space-y-1">
                            <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">X</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={bgXPercent}
                              disabled={!onPatchBackgroundImageLayer}
                              onChange={(event) =>
                                onPatchBackgroundImageLayer?.({
                                  x: clamp(Number(event.target.value), 0, 100),
                                })
                              }
                              className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Y</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={bgYPercent}
                              disabled={!onPatchBackgroundImageLayer}
                              onChange={(event) =>
                                onPatchBackgroundImageLayer?.({
                                  y: clamp(Number(event.target.value), 0, 100),
                                })
                              }
                              className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Scale</span>
                            <input
                              type="number"
                              min={10}
                              max={400}
                              value={bgScalePercent}
                              disabled={!onPatchBackgroundImageLayer}
                              onChange={(event) =>
                                onPatchBackgroundImageLayer?.({
                                  scale: clamp(Number(event.target.value), 10, 400),
                                })
                              }
                              className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="space-y-1.5 border border-white/10 rounded p-2">
                        <div className="flex items-center justify-between text-[10px] tracking-[0.05em] uppercase text-zinc-400">
                          <span>Foreground</span>
                          <span className="text-zinc-500">{resolvedForegroundLayer.src ? 'Loaded' : 'Empty'}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={openForegroundUpload}
                            disabled={!onUploadForegroundImageLayer}
                            className="min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                          >
                            {resolvedForegroundLayer.src ? 'Replace FG' : 'Upload FG'}
                          </button>
                          <button
                            type="button"
                            onClick={onClearForegroundImageLayer}
                            disabled={!onClearForegroundImageLayer || !resolvedForegroundLayer.src}
                            className="min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                          >
                            Clear FG
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onPatchForegroundImageLayer?.({
                                visible: true,
                                opacity: 1,
                                x: 50,
                                y: 50,
                                scale: 100,
                                fitMode: 'free',
                                blendMode: 'source-over',
                              })
                            }
                            disabled={!onPatchForegroundImageLayer}
                            className="min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                          >
                            Reset FG
                          </button>
                        </div>
                        <label className="flex items-center justify-between text-[10px] tracking-[0.05em] uppercase text-zinc-300">
                          <span>Visible</span>
                          <input
                            type="checkbox"
                            checked={resolvedForegroundLayer.visible}
                            disabled={!resolvedForegroundLayer.src || !onPatchForegroundImageLayer}
                            onChange={(event) => onPatchForegroundImageLayer?.({ visible: event.target.checked })}
                            className="h-3.5 w-3.5 accent-violet-400 disabled:opacity-45"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Fit</span>
                          <select
                            value={fgFitMode}
                            disabled={!onPatchForegroundImageLayer}
                            onChange={(event) =>
                              onPatchForegroundImageLayer?.({
                                fitMode: event.target.value as NonNullable<ImageLayerState['fitMode']>,
                              })
                            }
                            className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 disabled:opacity-45 disabled:cursor-not-allowed"
                          >
                            {IMAGE_FIT_MODE_OPTIONS.map((option) => (
                              <option key={`fg-fit-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] tracking-[0.05em] uppercase text-zinc-400">
                            <span>Opacity</span>
                            <span>{fgOpacityPercent}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={fgOpacityPercent}
                            disabled={!onPatchForegroundImageLayer}
                            onChange={(event) =>
                              onPatchForegroundImageLayer?.({
                                opacity: clamp(Number(event.target.value), 0, 100) / 100,
                              })
                            }
                            className="w-full accent-violet-400 disabled:opacity-45 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <label className="space-y-1">
                            <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">X</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={fgXPercent}
                              disabled={!onPatchForegroundImageLayer}
                              onChange={(event) =>
                                onPatchForegroundImageLayer?.({
                                  x: clamp(Number(event.target.value), 0, 100),
                                })
                              }
                              className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Y</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={fgYPercent}
                              disabled={!onPatchForegroundImageLayer}
                              onChange={(event) =>
                                onPatchForegroundImageLayer?.({
                                  y: clamp(Number(event.target.value), 0, 100),
                                })
                              }
                              className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Scale</span>
                            <input
                              type="number"
                              min={10}
                              max={400}
                              value={fgScalePercent}
                              disabled={!onPatchForegroundImageLayer}
                              onChange={(event) =>
                                onPatchForegroundImageLayer?.({
                                  scale: clamp(Number(event.target.value), 10, 400),
                                })
                              }
                              className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
                            />
                          </label>
                        </div>
                        <label className="block space-y-1">
                          <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Blend</span>
                          <select
                            value={fgBlendMode}
                            disabled={!onPatchForegroundImageLayer}
                            onChange={(event) =>
                              onPatchForegroundImageLayer?.({
                                blendMode: event.target.value as GlobalCompositeOperation,
                              })
                            }
                            className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 disabled:opacity-45 disabled:cursor-not-allowed"
                          >
                            {FOREGROUND_BLEND_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 border border-white/10 rounded p-2">
                      <button
                        type="button"
                        onClick={() => setTimelineScrollIndex((prev) => clamp(prev - 1, 0, maxTimelineScrollIndex))}
                        className="min-h-8 px-2 py-1.5 text-[11px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors"
                        title="Scroll timeline up by one slot"
                      >
                        Scroll Up
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimelineScrollIndex((prev) => clamp(prev + 1, 0, maxTimelineScrollIndex))}
                        className="min-h-8 px-2 py-1.5 text-[11px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors"
                        title="Scroll timeline down by one slot"
                      >
                        Scroll Down
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimelineScrollIndex((prev) => clamp(prev - timelineSlotsVisible, 0, maxTimelineScrollIndex))}
                        className="min-h-8 px-2 py-1.5 text-[11px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors"
                        title="Scroll timeline up by one page"
                      >
                        Page Up
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimelineScrollIndex((prev) => clamp(prev + timelineSlotsVisible, 0, maxTimelineScrollIndex))}
                        className="min-h-8 px-2 py-1.5 text-[11px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors"
                        title="Scroll timeline down by one page"
                      >
                        Page Down
                      </button>
                    </div>

                    <div className="space-y-1.5 border border-white/10 rounded px-2 py-2">
                      <div className="flex items-center justify-between text-[10px] tracking-[0.06em] uppercase text-zinc-400">
                        <span>Frame Step</span>
                        <button
                          type="button"
                          onClick={() => setTimelineManualStepMode((prev) => !prev)}
                          className="min-h-7 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors"
                          title="Toggle preset and manual frame step controls"
                        >
                          {timelineManualStepMode ? 'Manual Input' : 'Preset Steps'}
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] tracking-[0.05em] uppercase text-zinc-400">Custom</span>
                        <input
                          type="number"
                          min={1}
                          max={maxTimelineStepFrames}
                          value={timelineStepFrames}
                          onChange={(event) => {
                            const next = Number(event.target.value);
                            if (!Number.isFinite(next)) return;
                            setTimelineStepFrames(clamp(Math.round(next), 1, maxTimelineStepFrames));
                          }}
                          className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-300"
                        />
                        <span className="text-[10px] tracking-[0.05em] uppercase text-zinc-400">frames</span>
                      </div>
                      {!timelineManualStepMode ? (
                        <div className="grid grid-cols-4 gap-1.5">
                          {quickTimelineStepOptions.map((value) => {
                            const active = timelineStepFrames === value;
                            return (
                              <button
                                key={`gap-${value}`}
                                type="button"
                                onClick={() => setTimelineStepFrames(value)}
                                className="min-h-8 px-2 py-1 text-[10px] border rounded transition-colors"
                                style={{
                                  borderColor: active ? 'rgba(74, 222, 128, 0.66)' : 'rgba(255, 255, 255, 0.15)',
                                  background: active ? 'rgba(16, 88, 56, 0.34)' : 'transparent',
                                  color: active ? 'rgba(236, 253, 245, 0.95)' : 'rgba(212, 212, 216, 0.92)',
                                }}
                              >
                                {value}f
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 border border-white/10 rounded p-2">
                    <button
                      type="button"
                      onClick={() => setTimelineScrollIndex((prev) => clamp(prev - 1, 0, maxTimelineScrollIndex))}
                      className="min-h-8 px-2 py-1.5 text-[11px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors"
                      title="Scroll timeline up by one slot"
                    >
                      Scroll Up
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimelineScrollIndex((prev) => clamp(prev + 1, 0, maxTimelineScrollIndex))}
                      className="min-h-8 px-2 py-1.5 text-[11px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors"
                      title="Scroll timeline down by one slot"
                    >
                      Scroll Down
                    </button>
                  </div>
                )}
                  </>
                ) : null}

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                  {Array.from({ length: timelineSlotsVisible }).map((_, index) => {
                    const slotIndex = clampedTimelineScrollIndex + index;
                    const displayFrame = 1 + slotIndex * timelineStep;
                    const frame = Math.max(0, displayFrame - 1);
                    const pose = keyframePoseMap[frame];
                    const hasPose = keyframeSet.has(frame) && Boolean(pose);
                    const isCurrent = Math.round(currentFrame) === frame;
                    const thumb = pose ? computeThumbPosePath(pose) : { path: '', joints: [] };
                    const nextKeyframe = nextKeyframeByFrame.get(frame) ?? null;
                    const hasSegmentControl = hasPose && typeof nextKeyframe === 'number' && nextKeyframe > frame;
                    const segmentSpan = hasSegmentControl ? Math.max(1, nextKeyframe - frame) : 1;
                    const inBetweenCount = hasSegmentControl ? Math.max(0, segmentSpan - 1) : 0;
                    const segmentKey = hasSegmentControl ? `${frame}->${nextKeyframe}` : '';
                    const customSegmentDuration = hasSegmentControl ? segmentInterpolationFrames[segmentKey] : undefined;
                    const activeSegmentDuration = customSegmentDuration ?? segmentSpan;

                    return (
                      <div key={`slot-${frame}-${slotIndex}`} className="space-y-1.5 border border-white/10 rounded p-1.5">
                        <div className="flex items-center justify-between text-[10px] tracking-[0.05em] uppercase text-zinc-300">
                          <span>Frame {displayFrame}</span>
                          <span className="text-zinc-500">{hasPose ? 'Key Pose' : 'Empty'}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <div
                            draggable={hasPose}
                            onDragStart={() => setDragFrameSlot(frame)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (dragFrameSlot !== null && dragFrameSlot !== frame) {
                                onSwapTimelineFrames?.(dragFrameSlot, frame);
                              }
                              setDragFrameSlot(null);
                            }}
                            className="relative border rounded overflow-hidden cursor-pointer"
                            style={{
                              width: `${headGridSquarePx}px`,
                              height: `${headGridSquarePx}px`,
                              background: hasPose ? 'rgba(34, 40, 54, 0.62)' : 'rgba(20, 24, 33, 0.4)',
                              borderColor: isCurrent ? 'rgba(74, 222, 128, 0.72)' : 'rgba(148, 163, 184, 0.34)',
                            }}
                            onClick={() => onSetCurrentFrame?.(frame)}
                            onDoubleClick={() => handleOpenPoseLibrary(frame)}
                            title={hasPose ? `Frame ${displayFrame} key pose. Double-click for pose library.` : `Frame ${displayFrame} empty slot. Double-click for pose library.`}
                          >
                            {hasPose ? (
                              <svg viewBox="0 0 100 100" className="w-full h-full">
                                <path d={thumb.path} stroke="rgba(196, 181, 253, 0.95)" strokeWidth="3" fill="none" strokeLinecap="round" />
                                {thumb.joints.map((jointPoint, jointIndex) => (
                                  <circle
                                    key={`joint-${jointIndex}`}
                                    cx={jointPoint.x}
                                    cy={jointPoint.y}
                                    r="1.8"
                                    fill="rgba(216, 180, 254, 0.95)"
                                  />
                                ))}
                              </svg>
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-500 tracking-[0.08em] uppercase">
                                Empty
                              </div>
                            )}
                          </div>

                          <div className="flex-1 flex flex-col gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSavePoseToFrame?.(frame)}
                              disabled={animationControlDisabled || !onSavePoseToFrame}
                              className="min-h-8 px-2 py-1.5 text-[11px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                              title="Capture current pose into this square"
                            >
                              Capture Here
                            </button>
                            {timelinePanelMode === 'advanced' ? (
                              <button
                                type="button"
                                onClick={() => onRemovePoseAtFrame?.(frame)}
                                disabled={animationControlDisabled || !onRemovePoseAtFrame || !hasPose || sortedKeyframeFrames.length <= 1}
                                className="min-h-8 px-2 py-1.5 text-[11px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                                title="Remove pose from this frame"
                              >
                                Clear Pose
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {hasSegmentControl ? (
                          <div className="border border-white/10 rounded px-2 py-1.5 text-[10px] text-zinc-300">
                            <div className="flex items-center justify-between tracking-[0.05em] uppercase text-zinc-400">
                              <span>Tween F{displayFrame} to F{(nextKeyframe ?? frame) + 1}</span>
                              {timelinePanelMode === 'advanced' ? (
                                <span>{activeSegmentDuration}/{segmentSpan} frames</span>
                              ) : (
                                <span>{inBetweenCount} in-betweens</span>
                              )}
                            </div>
                            <div className="mt-1.5 grid grid-cols-[1fr_auto_auto] gap-1.5 items-center">
                              <div className="text-[10px] tracking-[0.05em] uppercase text-zinc-400">
                                In-Betweens: {inBetweenCount}
                              </div>
                              <button
                                type="button"
                                onClick={() => onAdjustSegmentInBetweens?.(frame, nextKeyframe as number, -1)}
                                disabled={animationControlDisabled || !onAdjustSegmentInBetweens || inBetweenCount <= 0}
                                className="min-h-8 min-w-8 px-2 py-1 text-[12px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                                title="Decrease in-betweens by 1"
                              >
                                -
                              </button>
                              <button
                                type="button"
                                onClick={() => onAdjustSegmentInBetweens?.(frame, nextKeyframe as number, 1)}
                                disabled={animationControlDisabled || !onAdjustSegmentInBetweens}
                                className="min-h-8 min-w-8 px-2 py-1 text-[12px] border border-white/15 rounded text-zinc-100 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                                title="Increase in-betweens by 1"
                              >
                                +
                              </button>
                            </div>
                            {timelinePanelMode === 'advanced' ? (
                              <>
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <input
                                    type="range"
                                    min={1}
                                    max={segmentSpan}
                                    value={activeSegmentDuration}
                                    disabled={animationControlDisabled || !onSetSegmentInterpolation}
                                    onChange={(event) => {
                                      const next = Number(event.target.value);
                                      if (!Number.isFinite(next)) return;
                                      onSetSegmentInterpolation?.(
                                        frame,
                                        nextKeyframe as number,
                                        clamp(Math.round(next), 1, segmentSpan)
                                      );
                                    }}
                                    className="flex-1 accent-violet-400 disabled:opacity-45 disabled:cursor-not-allowed"
                                    title="Interpolation duration for this keyframe break"
                                  />
                                  <input
                                    type="number"
                                    min={1}
                                    max={segmentSpan}
                                    value={activeSegmentDuration}
                                    disabled={animationControlDisabled || !onSetSegmentInterpolation}
                                    onChange={(event) => {
                                      const next = Number(event.target.value);
                                      if (!Number.isFinite(next)) return;
                                      onSetSegmentInterpolation?.(
                                        frame,
                                        nextKeyframe as number,
                                        clamp(Math.round(next), 1, segmentSpan)
                                      );
                                    }}
                                    className="w-16 min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-200 disabled:opacity-45 disabled:cursor-not-allowed"
                                    title="Exact interpolation duration for this break"
                                  />
                                </div>
                                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onSetSegmentInterpolation?.(frame, nextKeyframe as number, null)}
                                    disabled={animationControlDisabled || !onSetSegmentInterpolation || customSegmentDuration === undefined}
                                    className="min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                                    title="Use full-span interpolation for this break"
                                  >
                                    Use Auto
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onInsertTweenBetween?.(frame, nextKeyframe as number)}
                                    disabled={animationControlDisabled || !onInsertTweenBetween || segmentSpan <= 1}
                                    className="min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                                    title="Auto-save one tween keyframe between this pair"
                                  >
                                    + Auto Save Tween
                                  </button>
                                </div>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onInsertTweenBetween?.(frame, nextKeyframe as number)}
                                disabled={animationControlDisabled || !onInsertTweenBetween || segmentSpan <= 1}
                                className="mt-1.5 w-full min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                                title="Auto-save one tween keyframe between this pair"
                              >
                                + Auto Save Tween
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="border border-white/10 rounded p-2 space-y-1.5">
                  <button
                    type="button"
                    onClick={handleTimelineBackToFirst}
                    disabled={animationControlDisabled || !onSetCurrentFrame}
                    className="w-full min-h-8 px-2 py-1.5 text-[11px] border border-white/15 rounded text-zinc-100 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                    title="Return to frame 1"
                  >
                    Back to 1
                  </button>
                  <div className="text-[10px] text-zinc-400 tracking-[0.05em] uppercase">Motion Function</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {timelineFunctionPresets.map((preset) => {
                      const active = preset.id === activeTimelineFunctionId;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => onEasingChange?.(preset.easing)}
                          disabled={animationControlDisabled || !onEasingChange}
                          className="min-h-8 px-1 py-1 text-[10px] border rounded transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                          style={{
                            borderColor: active ? 'rgba(74, 222, 128, 0.66)' : 'rgba(255, 255, 255, 0.15)',
                            background: active ? 'rgba(16, 88, 56, 0.34)' : 'transparent',
                            color: active ? 'rgba(236, 253, 245, 0.95)' : 'rgba(212, 212, 216, 0.92)',
                          }}
                          title={`${preset.label}: ${preset.description}`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {gridOnlyMode && onExitGridView ? (
        <button
          type="button"
          onClick={onExitGridView}
          className="absolute bg-zinc-950/90 border border-zinc-700 text-zinc-200 px-3 py-1.5 text-[10px] tracking-[0.2em] font-bold uppercase rounded hover:bg-zinc-800 transition-colors"
          style={{
            top: `${UI_INSET}px`,
            left: `${UI_INSET}px`,
            zIndex: 70,
          }}
        >
          Back
        </button>
      ) : null}

      {gridOnlyMode && (onMovementTogglesChange || onInteractionModeChange || onToggleLotteMode) ? (
        <>
          <div
            className="absolute flex items-center gap-2"
            style={{
              top: `${gridRefineTop}px`,
              left: `${UI_INSET}px`,
              zIndex: 72,
            }}
          >
            {onInteractionModeChange ? (
              <button
                type="button"
                onClick={onInteractionModeChange}
                disabled={!ikEnabled}
                className="min-h-9 px-3 py-2 text-[11px] tracking-[0.1em] font-semibold uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'rgba(88, 82, 108, 0.34)',
                  border: '1px solid rgba(158, 150, 184, 0.72)',
                  color: ikInteractionActive ? 'rgba(255, 224, 236, 0.95)' : 'rgba(232, 228, 243, 0.95)',
                }}
                title={ikEnabled ? 'Switch FK/IK interaction mode' : 'IK engine disabled'}
              >
                Interaction: {ikEnabled ? interactionMode : 'FK'}
              </button>
            ) : null}

            {onMovementTogglesChange ? (
              <button
                type="button"
                onClick={() =>
                  onMovementTogglesChange({
                    ...(movementToggles || {}),
                    fkConstraintsEnabled: (movementToggles?.fkConstraintsEnabled ?? true) ? false : true,
                  })
                }
                className="min-h-9 px-3 py-2 text-[11px] tracking-[0.1em] font-semibold uppercase rounded transition-colors"
                style={{
                  background: (movementToggles?.fkConstraintsEnabled ?? true)
                    ? 'rgba(16, 88, 56, 0.34)'
                    : 'rgba(88, 82, 108, 0.28)',
                  border: (movementToggles?.fkConstraintsEnabled ?? true)
                    ? '1px solid rgba(74, 222, 128, 0.62)'
                    : '1px solid rgba(158, 150, 184, 0.62)',
                  color: 'rgba(232, 228, 243, 0.95)',
                }}
                title="Toggle FK joint angle constraints"
              >
                Joint Limits {(movementToggles?.fkConstraintsEnabled ?? true) ? 'On' : 'Off'}
              </button>
            ) : null}

            {onToggleLotteMode ? (
              <button
                type="button"
                onClick={onToggleLotteMode}
                className="min-h-9 px-3 py-2 text-[11px] tracking-[0.1em] font-semibold uppercase rounded transition-colors"
                style={{
                  background: lotteMode ? 'rgba(112, 75, 35, 0.34)' : 'rgba(88, 82, 108, 0.28)',
                  border: lotteMode ? '1px solid rgba(235, 198, 133, 0.66)' : '1px solid rgba(158, 150, 184, 0.62)',
                  color: lotteMode ? 'rgba(255, 239, 210, 0.95)' : 'rgba(232, 228, 243, 0.95)',
                }}
                title="Toggle Lotte Reiniger-inspired silhouette mode"
              >
                Lotte {lotteMode ? 'On' : 'Off'}
              </button>
            ) : null}

            {onMovementTogglesChange ? (
              <button
                type="button"
                onClick={() => setShowRefineMenu((prev) => !prev)}
                className="min-h-9 px-3 py-2 text-[11px] tracking-[0.1em] font-semibold uppercase rounded transition-colors"
                style={{
                  background: showRefineMenu ? 'rgba(16, 88, 56, 0.34)' : 'rgba(88, 82, 108, 0.28)',
                  border: showRefineMenu ? '1px solid rgba(74, 222, 128, 0.62)' : '1px solid rgba(158, 150, 184, 0.62)',
                  color: 'rgba(232, 228, 243, 0.95)',
                }}
                title="Open motion refinement controls"
              >
                Refine {showRefineMenu ? 'On' : 'Off'}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setShowAnimationTimeline((prev) => !prev)}
              className="min-h-9 px-3 py-2 text-[11px] tracking-[0.1em] font-semibold uppercase rounded transition-colors"
              style={{
                background: showAnimationTimeline ? 'rgba(16, 88, 56, 0.34)' : 'rgba(88, 82, 108, 0.28)',
                border: showAnimationTimeline ? '1px solid rgba(74, 222, 128, 0.62)' : '1px solid rgba(158, 150, 184, 0.62)',
                color: 'rgba(232, 228, 243, 0.95)',
              }}
              title="Toggle animation timeline"
            >
              Timeline Panel {showAnimationTimeline ? 'On' : 'Off'}
            </button>

          </div>

          {showRefineMenu && onMovementTogglesChange ? (
            <div
              className="absolute border rounded shadow-xl backdrop-blur-sm"
              style={{
                top: `${gridRefineTop + 34}px`,
                left: `${UI_INSET}px`,
                zIndex: 73,
                width: '320px',
                background: 'rgba(18, 16, 24, 0.74)',
                borderColor: 'rgba(158, 150, 184, 0.5)',
              }}
            >
              <div className="px-3 py-2 border-b border-violet-200/20 flex items-center justify-between gap-2">
                <span className="text-[10px] tracking-[0.16em] uppercase text-violet-100/90 font-semibold">
                  {ikInteractionActive ? 'IK Settings' : 'FK Settings'}
                </span>
                <button
                  type="button"
                  onClick={() => setRefinePanelMode((prev) => (prev === 'basic' ? 'advanced' : 'basic'))}
                  className="min-h-7 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-100 hover:bg-white/10 transition-colors"
                >
                  Mode: {refinePanelMode === 'advanced' ? 'Advanced' : 'Basic'}
                </button>
              </div>
              {!ikInteractionActive ? (
                <div className="px-2.5 py-2.5">
                  <div className="px-1 pb-2 mb-2 border-b border-white/10 space-y-2">
                    <label className="block">
                      <div className="text-[10px] tracking-[0.08em] uppercase text-zinc-200 mb-1 flex items-center justify-between">
                        <span>Rotation Fluidity</span>
                        <span className="text-zinc-400">{((fkRotationSensitivity + fkRotationResponse) / 2).toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min={0.35}
                        max={1.6}
                        step={0.05}
                        value={(fkRotationSensitivity + fkRotationResponse) / 2}
                        onChange={(e) =>
                          onMovementTogglesChange({
                            ...(movementToggles || {}),
                            fkRotationSensitivity: Number(e.target.value),
                            fkRotationResponse: Number(e.target.value),
                          })
                        }
                        className="w-full accent-violet-400"
                      />
                    </label>
                    <label className="block">
                      <div className="text-[10px] tracking-[0.08em] uppercase text-zinc-200 mb-1 flex items-center justify-between">
                        <span>Root X</span>
                        <span className="text-zinc-400">{Math.round(rootX)} px</span>
                      </div>
                      <input
                        type="range"
                        min={-400}
                        max={400}
                        step={1}
                        value={rootX}
                        disabled={!rootXControlEnabled}
                        onChange={(e) =>
                          onMovementTogglesChange({
                            ...(movementToggles || {}),
                            rootX: Number(e.target.value),
                          })
                        }
                        className="w-full accent-violet-400"
                      />
                    </label>
                    {(() => {
                      const rootYRange = Math.max(120, Math.round(sceneViewport.height / 2));
                      return (
                    <label className="block">
                      <div className="text-[10px] tracking-[0.08em] uppercase text-zinc-200 mb-1 flex items-center justify-between">
                        <span>Root Y</span>
                        <span className="text-zinc-400">{Math.round(rootY)} px</span>
                      </div>
                      <input
                        type="range"
                        min={-rootYRange}
                        max={rootYRange}
                        step={1}
                        value={rootY}
                        disabled={!rootYControlEnabled}
                        onChange={(e) => {
                          const nextRootY = Number(e.target.value);
                          onMovementTogglesChange({
                            ...(movementToggles || {}),
                            rootY: nextRootY,
                          });
                          applyGroundWeightFromRootY(nextRootY);
                        }}
                        className="w-full accent-violet-400"
                      />
                    </label>
                      );
                    })()}
                    <label className="block">
                      <div className="text-[10px] tracking-[0.08em] uppercase text-zinc-200 mb-1 flex items-center justify-between">
                        <span>Root Rotate</span>
                        <span className="text-zinc-400">{Math.round(rootRotate)} deg</span>
                      </div>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={1}
                        value={rootRotate}
                        disabled={!rootRotateControlEnabled}
                        onChange={(e) =>
                          onMovementTogglesChange({
                            ...(movementToggles || {}),
                            rootRotate: Number(e.target.value),
                          })
                        }
                        className="w-full accent-violet-400"
                      />
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { key: 'rootXControlEnabled' as const, label: 'Enable X', enabled: rootXControlEnabled },
                        { key: 'rootYControlEnabled' as const, label: 'Enable Y', enabled: rootYControlEnabled },
                        { key: 'rootRotateControlEnabled' as const, label: 'Enable Rot', enabled: rootRotateControlEnabled },
                      ].map(({ key, label, enabled }) => (
                        <label key={key} className="min-h-8 px-2 py-1.5 border border-white/10 rounded text-[10px] tracking-[0.04em] uppercase text-zinc-300 flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() =>
                              onMovementTogglesChange?.({
                                ...(movementToggles || {}),
                                [key]: !enabled,
                              })
                            }
                            className="accent-violet-400"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onMovementTogglesChange({
                          ...(movementToggles || {}),
                          rootGroundLockEnabled: !rootGroundLockEnabled,
                        })
                      }
                      className={`w-full min-h-8 text-left px-2.5 py-2 text-[10px] tracking-[0.06em] uppercase border rounded transition-colors ${
                        rootGroundLockEnabled
                          ? 'text-emerald-100 border-emerald-300/70 bg-emerald-500/20'
                          : 'text-zinc-400 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      Rot To Ground {rootGroundLockEnabled ? 'On' : 'Off'}
                    </button>
                  </div>
                  {refinePanelMode === 'advanced' ? (
                    <div className="max-h-72 overflow-y-auto custom-scrollbar pr-1 space-y-1">
                      {bitruviusData.HIERARCHY.map(([jointId]) => {
                        const label = bitruviusData.JOINT_DEFS[jointId]?.label ?? jointId;
                        const min = -180;
                        const max = 180;
                        const value = normA(rotationsRef.current[jointId] ?? bitruviusData.initialRotations[jointId] ?? 0);
                        const bendOffset = clamp(Math.round(fkBendOffsetByJoint[jointId] ?? 0), -12, 12);
                        const stretchOffset = clamp(Math.round(fkStretchOffsetByJoint[jointId] ?? 0), -12, 12);
                        return (
                          <label key={jointId} className="block px-1 py-1.5 border-b border-white/10 last:border-b-0">
                            <div className="text-[10px] tracking-[0.06em] uppercase text-zinc-300 mb-1 flex items-center justify-between">
                              <span>{label}</span>
                              <span className="flex items-center gap-1.5">
                                <label className="flex items-center gap-1">
                                  <span className="text-[8px] text-emerald-300">B</span>
                                  <input
                                    type="number"
                                    min={-12}
                                    max={12}
                                    step={1}
                                    value={bendOffset}
                                    onChange={(event) => {
                                      const next = clamp(Number(event.target.value), -12, 12);
                                      setFkBendOffsetByJoint((prev) => ({ ...prev, [jointId]: Math.round(next) }));
                                    }}
                                    className="w-10 h-5 px-1 text-[9px] bg-zinc-900 border border-white/10 rounded text-zinc-100"
                                    title="Bend offset (-12..12)"
                                  />
                                </label>
                                <label className="flex items-center gap-1">
                                  <span className="text-[8px] text-sky-300">S</span>
                                  <input
                                    type="number"
                                    min={-12}
                                    max={12}
                                    step={1}
                                    value={stretchOffset}
                                    onChange={(event) => {
                                      const next = clamp(Number(event.target.value), -12, 12);
                                      setFkStretchOffsetByJoint((prev) => ({ ...prev, [jointId]: Math.round(next) }));
                                    }}
                                    className="w-10 h-5 px-1 text-[9px] bg-zinc-900 border border-white/10 rounded text-zinc-100"
                                    title="Stretch offset (-12..12)"
                                  />
                                </label>
                                <span className="text-zinc-500">{Math.round(value)} deg</span>
                              </span>
                            </div>
                            <input
                              type="range"
                              min={min}
                              max={max}
                              step={1}
                              value={value}
                              onMouseDown={() => { fkSliderLastInputRef.current[jointId] = value; }}
                              onChange={(e) => setJointRotationFromWrappedSlider(jointId, Number(e.target.value))}
                              className="w-full accent-violet-400"
                              title={jointId}
                            />
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-1 py-1.5 text-[10px] text-zinc-400 tracking-[0.04em]">
                      Advanced mode unlocks per-joint rotation sliders.
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-2.5 py-2.5">
                  <div className="px-1 pb-2 mb-2 border-b border-white/10 space-y-2">
                    <div className="text-[10px] tracking-[0.08em] uppercase text-zinc-200">IK Presets</div>
                    <div className="space-y-1.5">
                      {IK_QUICK_PRESETS.map((preset) => {
                        const active = activeIkQuickPreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() =>
                              onMovementTogglesChange({
                                ...(movementToggles || {}),
                                ...preset.patch,
                              })
                            }
                            className={`w-full min-h-8 text-left px-2.5 py-2 rounded border transition-colors ${
                              active
                                ? 'border-violet-300/80 bg-violet-500/20 text-violet-50'
                                : 'border-white/10 text-zinc-300 hover:bg-white/10'
                            }`}
                          >
                            <span className="block text-[10px] tracking-[0.06em] uppercase">{preset.label}</span>
                            <span className="block text-[10px] text-zinc-400 normal-case">{preset.description}</span>
                          </button>
                        );
                      })}
                    </div>
                    {activeIkQuickPreset === "custom" ? (
                      <div className="text-[10px] text-zinc-500 tracking-[0.05em] uppercase">
                        Custom style
                      </div>
                    ) : null}
                  </div>
                  <div className="px-1 pb-2 mb-2 border-b border-white/10">
                    <div className="text-[10px] tracking-[0.08em] uppercase text-zinc-200 mb-1">Pose + Weight</div>
                    <div className="space-y-1.5">
                      {IK_POSE_DIRECTIONS.map((direction) => {
                        const program = ikPosePrograms[direction];
                        const active = isIkPoseProgramActive(program);
                        return (
                          <div key={direction} className="grid grid-cols-[1fr_auto] gap-1.5">
                            <button
                              type="button"
                              onClick={() => applyIkPoseProgram(direction)}
                              className={`min-h-8 px-2 py-1 text-[10px] tracking-[0.05em] uppercase rounded border transition-colors text-left ${
                                active
                                  ? 'border-violet-300/80 bg-violet-500/20 text-violet-50'
                                  : 'border-white/10 text-zinc-300 hover:bg-white/10'
                              }`}
                              title={`${program.label} pose program`}
                            >
                              {program.label}
                            </button>
                            <button
                              type="button"
                              onClick={() => programIkPoseSlotFromCurrent(direction)}
                              className="min-h-8 px-2 py-1 text-[10px] tracking-[0.05em] uppercase rounded border border-white/10 text-zinc-300 hover:bg-white/10 transition-colors"
                              title={`Program ${program.label} from current sliders`}
                            >
                              Set
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-1 text-[9px] text-zinc-500 tracking-[0.04em]">
                      Use `Set` to program a direction from your current pose/weight/posture.
                    </div>
                    <label className="block mt-2">
                      <div className="text-[10px] tracking-[0.05em] uppercase text-zinc-400 mb-1 flex items-center justify-between">
                        <span>Weight Shift (L/R)</span>
                        <span>{(weightShiftLateral ?? 0).toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={-1}
                        max={1}
                        step={0.02}
                        value={weightShiftLateral ?? 0}
                        onChange={(e) =>
                          onMovementTogglesChange({
                            ...(movementToggles || {}),
                            weightShiftLateral: Number(e.target.value),
                          })
                        }
                        className="w-full accent-violet-400"
                      />
                    </label>
                    <label className="block mt-2">
                      <div className="text-[10px] tracking-[0.05em] uppercase text-zinc-400 mb-1 flex items-center justify-between">
                        <span>Depth Shift (Back/Front)</span>
                        <span>{(weightShiftDepth ?? 0).toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={-1}
                        max={1}
                        step={0.02}
                        value={weightShiftDepth ?? 0}
                        onChange={(e) =>
                          onMovementTogglesChange({
                            ...(movementToggles || {}),
                            weightShiftDepth: Number(e.target.value),
                          })
                        }
                        className="w-full accent-violet-400"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
                      <button
                        type="button"
                        onClick={() =>
                          onMovementTogglesChange({
                            ...(movementToggles || {}),
                            poseDirection: 'front',
                            weightShiftLateral: 0,
                            weightShiftDepth: 0,
                          })
                        }
                        className="min-h-8 px-2 py-1.5 text-[10px] tracking-[0.05em] uppercase border border-white/10 rounded text-zinc-200 hover:bg-white/10 transition-colors"
                      >
                        Reset Pose
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onMovementTogglesChange({
                            ...(movementToggles || {}),
                            postureState: 'stand',
                            postureRoll: 0,
                            legIntentMode: 'none',
                          })
                        }
                        className="min-h-8 px-2 py-1.5 text-[10px] tracking-[0.05em] uppercase border border-white/10 rounded text-zinc-200 hover:bg-white/10 transition-colors"
                      >
                        Neutral Stance
                      </button>
                    </div>
                  </div>
                  <div className="px-1 pb-2 mb-2 border-b border-white/10">
                    <div className="text-[10px] tracking-[0.08em] uppercase text-zinc-200 mb-1">Leg Motion</div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {LEG_INTENT_OPTIONS.map(({ id, label }) => {
                        const active = legIntentMode === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() =>
                              onMovementTogglesChange({
                                ...(movementToggles || {}),
                                legIntentMode: id,
                              })
                            }
                            className={`min-h-8 px-1.5 py-1 text-[10px] tracking-[0.05em] uppercase rounded border transition-colors ${
                              active
                                ? 'border-violet-300/80 bg-violet-500/20 text-violet-50'
                                : 'border-white/10 text-zinc-400 hover:bg-white/10'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {legIntentMode === 'jump' ? (
                      <button
                        type="button"
                        onClick={() => { jumpTriggerQueuedRef.current = true; }}
                        className="w-full min-h-8 mt-2 text-left px-2.5 py-2 text-[10px] tracking-[0.06em] uppercase border border-white/10 rounded text-violet-100 hover:bg-white/10 transition-colors"
                      >
                        Trigger Jump
                      </button>
                    ) : null}
                  </div>
                  <div className="px-1 pb-2 mb-2 border-b border-white/10">
                    <div className="text-[10px] tracking-[0.08em] uppercase text-zinc-200 mb-1">Posture</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        { id: 'stand' as const, label: 'Stand' },
                        { id: 'kneel' as const, label: 'Kneel' },
                        { id: 'ground_sit' as const, label: 'Ground Sit' },
                      ]).map(({ id, label }) => {
                        const active = postureState === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() =>
                              onMovementTogglesChange({
                                ...(movementToggles || {}),
                                postureState: id,
                                postureRoll: id === 'stand' ? 0 : Math.max(0.6, movementToggles?.postureRoll ?? 0),
                              })
                            }
                            className={`min-h-8 px-1.5 py-1 text-[10px] tracking-[0.05em] uppercase rounded border transition-colors ${
                              active
                                ? 'border-violet-300/80 bg-violet-500/20 text-violet-50'
                                : 'border-white/10 text-zinc-400 hover:bg-white/10'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <label className="block mt-2">
                      <div className="text-[10px] tracking-[0.05em] uppercase text-zinc-400 mb-1 flex items-center justify-between">
                        <span>Roll In/Out</span>
                        <span>{((postureRoll ?? 0) * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.02}
                        value={postureRoll ?? 0}
                        onChange={(e) =>
                          onMovementTogglesChange({
                            ...(movementToggles || {}),
                            postureRoll: Number(e.target.value),
                            postureState: (movementToggles?.postureState ?? 'stand') === 'stand' && Number(e.target.value) > 0
                              ? 'kneel'
                              : (movementToggles?.postureState ?? 'stand'),
                          })
                        }
                        className="w-full accent-violet-400"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
                      <button
                        type="button"
                        onClick={() =>
                          onMovementTogglesChange({
                            ...(movementToggles || {}),
                            postureState: 'ground_sit',
                            postureRoll: 1,
                          })
                        }
                        className="min-h-8 px-2 py-1.5 text-[10px] tracking-[0.05em] uppercase border border-white/10 rounded text-zinc-200 hover:bg-white/10 transition-colors"
                      >
                        Sit Down
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onMovementTogglesChange({
                            ...(movementToggles || {}),
                            postureState: 'stand',
                            postureRoll: 0,
                          })
                        }
                        className="min-h-8 px-2 py-1.5 text-[10px] tracking-[0.05em] uppercase border border-white/10 rounded text-zinc-200 hover:bg-white/10 transition-colors"
                      >
                        Stand Up
                      </button>
                    </div>
                  </div>
                  {refinePanelMode === 'advanced' ? (
                    <>
                      {ikProfile === 'human' ? (
                        <div className="px-1 pb-2 mb-2 border-b border-white/10">
                          <div className="text-[10px] tracking-[0.08em] uppercase text-zinc-200 mb-1">Body Reactions</div>
                          {[
                            { key: 'humanCounterbalanceEnabled' as const, label: 'Counterbalance' },
                            { key: 'humanMirrorEnabled' as const, label: 'Mirror' },
                            { key: 'humanFollowThroughEnabled' as const, label: 'Follow Through' },
                            { key: 'humanCollarNeckFollowEnabled' as const, label: 'Collar/Neck Follow' },
                          ].map(({ key, label }) => {
                            const enabled = (movementToggles || {})[key] !== false;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() =>
                                  onMovementTogglesChange({
                                    ...(movementToggles || {}),
                                    [key]: !enabled,
                                  })
                                }
                                className={`w-full min-h-8 text-left px-2.5 py-2 text-[10px] tracking-[0.06em] uppercase border-b border-white/10 last:border-b-0 transition-colors ${
                                  enabled ? 'text-violet-100 hover:bg-white/10' : 'text-zinc-500 hover:bg-white/5'
                                }`}
                              >
                                <span className="flex items-center justify-between">
                                  <span>{label}</span>
                                  <span className="text-[10px]">{enabled ? 'ON' : 'OFF'}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setShowIkAdvancedControls((prev) => !prev)}
                        className="w-full min-h-8 text-left px-2.5 py-2 text-[10px] tracking-[0.06em] uppercase border border-white/10 rounded text-zinc-300 hover:bg-white/10 transition-colors"
                      >
                        Expert IK Controls {showIkAdvancedControls ? 'On' : 'Off'}
                      </button>
                      {showIkAdvancedControls ? (
                        <div className="mt-2 border border-white/10 rounded">
                          {[
                            { key: 'naturalBendEnabled' as const, label: 'Natural Bend Bias' },
                            { key: 'handshakeEnabled' as const, label: 'FK-IK Blend' },
                            { key: 'fk360Enabled' as const, label: 'Free Root Rotation' },
                            { key: 'ikExtendedHandlesEnabled' as const, label: 'Long-Reach Handles' },
                            { key: 'ikPreferFullChainEnabled' as const, label: 'Favor Full Chains' },
                            { key: 'ikUnconstrainedEnabled' as const, label: 'Ignore Joint Limits' },
                          ].map(({ key, label }) => {
                            const enabled = (movementToggles || {})[key] !== false;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() =>
                                  onMovementTogglesChange({
                                    ...(movementToggles || {}),
                                    [key]: !enabled,
                                  })
                                }
                                className={`w-full min-h-8 text-left px-2.5 py-2 text-[10px] tracking-[0.06em] uppercase border-b border-white/10 last:border-b-0 transition-colors ${
                                  enabled ? 'text-violet-100 hover:bg-white/10' : 'text-zinc-500 hover:bg-white/5'
                                }`}
                              >
                                <span className="flex items-center justify-between">
                                  <span>{label}</span>
                                  <span className="text-[10px]">{enabled ? 'ON' : 'OFF'}</span>
                                </span>
                              </button>
                            );
                          })}
                          <div className="px-2.5 py-2.5 border-t border-white/10 space-y-2">
                            <label className="block">
                              <div className="text-[10px] tracking-[0.05em] uppercase text-zinc-400 mb-1">IK Profile</div>
                              <select
                                value={ikProfile}
                                onChange={(e) =>
                                  onMovementTogglesChange({
                                    ...(movementToggles || {}),
                                    ikProfile: e.target.value as "base" | "human",
                                  })
                                }
                                className="w-full min-h-8 bg-zinc-900 border border-white/10 text-zinc-100 text-[11px] px-2 py-1.5 rounded"
                              >
                                <option value="base">Base</option>
                                <option value="human">Human Assist</option>
                              </select>
                            </label>
                            <label className="block">
                              <div className="text-[10px] tracking-[0.05em] uppercase text-zinc-400 mb-1">Solver</div>
                              <select
                                value={ikSolver}
                                onChange={(e) =>
                                  onMovementTogglesChange({
                                    ...(movementToggles || {}),
                                    ikSolver: e.target.value as "fabrik" | "ccd" | "hybrid",
                                  })
                                }
                                className="w-full min-h-8 bg-zinc-900 border border-white/10 text-zinc-100 text-[11px] px-2 py-1.5 rounded"
                              >
                                <option value="fabrik">FABRIK</option>
                                <option value="ccd">CCD</option>
                                <option value="hybrid">Hybrid</option>
                              </select>
                            </label>
                            <label className="block">
                              <div className="text-[10px] tracking-[0.05em] uppercase text-zinc-400 mb-1">Solve Scope</div>
                              <select
                                value={ikSolveMode}
                                onChange={(e) =>
                                  onMovementTogglesChange({
                                    ...(movementToggles || {}),
                                    ikSolveMode: e.target.value as "single_chain" | "limbs_only" | "whole_body_graph",
                                  })
                                }
                                className="w-full min-h-8 bg-zinc-900 border border-white/10 text-zinc-100 text-[11px] px-2 py-1.5 rounded"
                              >
                                <option value="single_chain">Single Chain</option>
                                <option value="limbs_only">Limbs Only</option>
                                <option value="whole_body_graph">Whole Body</option>
                              </select>
                            </label>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="px-1 py-1.5 text-[10px] text-zinc-400 tracking-[0.04em]">
                      Switch to Advanced for body-reaction toggles and solver internals.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {!gridOnlyMode && (
      <div
        className="absolute pointer-events-auto flex flex-col items-end"
        style={{
          top: `${UI_INSET}px`,
          right: `${UI_INSET}px`,
          zIndex: 60
        }}
      >
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="bg-zinc-950 border border-zinc-700 text-zinc-300 px-4 py-2 text-[10px] tracking-[0.2em] font-bold uppercase rounded shadow-lg hover:bg-zinc-800 transition-colors border-l-4 border-l-green-500"
        >
          ROOT {isMenuOpen ? '[-]' : '[+]'}
        </button>
        
        {isMenuOpen && (
          <div 
            className="mt-2 bg-zinc-900/95 border border-zinc-800 p-3 shadow-2xl backdrop-blur-md overflow-y-auto w-56 custom-scrollbar rounded-sm"
            style={{ 
              maxHeight: `${height - 100}px`,
            }}
          >
            {/* Movement Toggles */}
            {onMovementTogglesChange && (
              <div className="mb-4">
                <div className="text-[8px] text-zinc-500 mb-2 tracking-widest uppercase border-b border-zinc-800 pb-1">Movement</div>
                {onInteractionModeChange && (
                  <div
                    onClick={onInteractionModeChange}
                    className={`text-[9px] py-1.5 flex items-center justify-between cursor-pointer hover:bg-white/5 px-1 transition-colors ${ikInteractionActive ? 'text-red-300' : 'text-sky-300'}`}
                    title={ikEnabled ? 'Switch FK/IK interaction mode' : 'IK engine disabled'}
                  >
                    <span className="font-mono uppercase tracking-wider">Drag Mode</span>
                    <span className="text-[7px]">{ikEnabled ? interactionMode : 'FK (LOCKED)'}</span>
                  </div>
                )}
                <div className="text-[9px] py-1.5 flex items-center justify-between px-1 text-emerald-300">
                  <span className="font-mono uppercase tracking-wider" title="Rigid IK keeps bone lengths fixed">Rigid IK</span>
                  <span className="text-[7px]">● ON</span>
                </div>
                {[
                  { key: 'naturalBendEnabled' as const, label: 'Natural Bend', desc: 'Limb curve bias' },
                  { key: 'fk360Enabled' as const, label: 'FK 360°', desc: 'Root full rotation' },
                  { key: 'handshakeEnabled' as const, label: 'FK/IK Handshake', desc: 'No artifacts on switch' },
                ].map(({ key, label, desc }) => {
                  const toggles = movementToggles || {};
                  const val = toggles[key] !== false;
                  return (
                  <div
                    key={key}
                    onClick={() => onMovementTogglesChange({ ...toggles, [key]: !val })}
                    className={`text-[9px] py-1.5 flex items-center justify-between cursor-pointer hover:bg-white/5 px-1 transition-colors ${val ? 'text-amber-400' : 'text-zinc-600'}`}
                  >
                    <span className="font-mono uppercase tracking-wider" title={desc}>{label}</span>
                    <span className="text-[7px]">{val ? '● ON' : '○ OFF'}</span>
                  </div>
                );})}
              </div>
            )}
            {/* IK Chains Section */}
            <div className="mb-4">
              <div className="text-[8px] text-zinc-500 mb-2 tracking-widest uppercase border-b border-zinc-800 pb-1">IK Systems</div>
              {Object.keys(bitruviusData.IK_CHAINS).map((chainId) => {
                const chain = bitruviusData.IK_CHAINS[chainId];
                const runtimeEnabled = isRuntimeIKChainEnabled(chain, bitruviusData);
                const stage = chain.activationStage ?? "spine_head";
                return (
                  <div
                    key={chainId}
                    onClick={() => {
                      if (!runtimeEnabled) return;
                      setActiveIKChains((prev) => ({ ...prev, [chainId]: !prev[chainId] }));
                    }}
                    className={`text-[9px] py-1.5 flex items-center justify-between px-1 transition-colors ${
                      runtimeEnabled ? 'cursor-pointer hover:bg-white/5' : 'cursor-not-allowed opacity-45'
                    } ${activeIKChains[chainId] ? 'text-red-400' : 'text-zinc-600'}`}
                  >
                    <span className="font-mono uppercase tracking-wider">
                      {bitruviusData.CHAIN_LABELS[chainId] || chainId}
                    </span>
                    <span className="text-[7px]">
                      {runtimeEnabled ? (activeIKChains[chainId] ? '● ON' : '○ OFF') : `${stage.toUpperCase()} LOCK`}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Pose Presets */}
            {onPoseApply && bitruviusData.POSES && (
              <div className="mb-4">
                <div className="text-[8px] text-zinc-500 mb-2 tracking-widest uppercase border-b border-zinc-800 pb-1">Pose Presets</div>
                {Object.keys(bitruviusData.POSES).map(poseName => (
                  <div
                    key={poseName}
                    onClick={() => onPoseApply(poseName)}
                    className="text-[9px] py-1.5 px-1 cursor-pointer hover:bg-white/5 transition-colors text-cyan-400 font-mono uppercase tracking-wider"
                  >
                    {poseName}
                  </div>
                ))}
              </div>
            )}
            {/* Joint Hierarchy Section */}
            <div>
              <div className="text-[8px] text-zinc-500 mb-2 tracking-widest uppercase border-b border-zinc-800 pb-1">Joint Hierarchy</div>
              {bitruviusData.HIERARCHY.map(([id, depth]) => (
                <div 
                  key={id} 
                  onClick={id === 'root' ? () => setRootFkDragArmed((prev) => !prev) : undefined}
                  className={`text-[9px] py-2 border-b border-zinc-800/50 last:border-0 text-green-400 flex items-center gap-2 transition-all group ${
                    id === 'root' ? 'hover:bg-white/10 cursor-pointer' : 'hover:bg-white/10 cursor-default'
                  }`}
                  style={{ paddingLeft: `${depth * 10 + 4}px` }}
                >
                  <span className="opacity-40 group-hover:opacity-100 transition-opacity">
                    {id === 'root' ? '■' : '□'}
                  </span>
                  <span className="font-mono tracking-widest uppercase">{bitruviusData.JOINT_DEFS[id]?.label || id}</span>
                  {id === 'root' ? (
                    <span className={`ml-auto text-[7px] tracking-widest ${rootFkDragArmed ? 'text-amber-300' : 'text-zinc-500'}`}>
                      FK ROTATE {rootFkDragArmed ? 'ON' : 'OFF'}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #555; }
      `}</style>
    </div>
  );
};

export default CanvasGrid;
