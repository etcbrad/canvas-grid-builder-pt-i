import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { r2d, normA, clamp } from '../utils';
import { BitruviusData, IKActivationStage, IKChain, SkeletonRotations, WorldCoords } from '../modelData';
import { computeJointWorldForPose } from '../fkEngine';
import { solveIK_AdvancedWithResult } from '../ikSolver';
import {
  render,
  type BodyPartMaskLayer,
  type DefaultPieceConfig,
  type GhostFrameRender,
  type ImageLayerState,
  type VisualModuleState,
} from '../renderer';
import { createVitruvianRuntimeGeometry } from '../adapters/vitruvianGrid';
import { applyHumanAssist } from '../ikHumanAssist';
import { type JumpAssistState, type LegIntentMode, type PoseDirection, type PostureState, resolveLegIntent } from '../ikLegIntent';
import {
  DEFAULT_SEGMENT_IK_TWEEN_SETTINGS,
  normalizeSegmentIkTweenSettings,
  segmentKey as segmentIkTweenKey,
  type SegmentIkTweenMap,
  type SegmentIkTweenSettings,
} from '../animationIkTween';
import { exportCanvasAsImage, exportCanvasAsVideo } from '../exportUtils';
import { applyIkGravityHold, type IkGravityHoldToggles } from '../ikGravityHold';
import { type ViewModeId } from '../viewModes';




export interface MovementToggles {
  stretchEnabled?: boolean;
  softReachEnabled?: boolean;
  naturalBendEnabled?: boolean;
  fk360Enabled?: boolean;
  fkConstraintsEnabled?: boolean;
  fkBendEnabled?: boolean;
  fkStretchEnabled?: boolean;
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
  ikGravityArmHoldEnabled?: boolean;
  ikGravityLegHoldEnabled?: boolean;
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

export interface CanvasGridRef {
  exportAsImage: (options?: { format?: 'png' | 'jpeg' | 'webp', quality?: number, filename?: string }) => Promise<void>;
  exportAsVideo: (options?: { duration?: number, fps?: number, format?: 'webm' | 'mp4', quality?: number, filename?: string }) => Promise<void>;
  getCanvas: () => HTMLCanvasElement | null;
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
  currentRotations?: SkeletonRotations;
  mocapMode?: boolean;
  safeSwitch?: boolean;
  silhouetteMode?: boolean;
  lotteMode?: boolean;
  ikEnabled?: boolean;
  interactionMode?: "FK" | "IK";
  movementToggles?: MovementToggles;
  viewMode?: ViewModeId;
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
  bodyPartMaskLayers?: Record<string, BodyPartMaskLayer | undefined>;
  onUploadBackgroundImageLayer?: (file: File) => void;
  onUploadForegroundImageLayer?: (file: File) => void;
  onUploadBodyPartMaskLayer?: (jointId: string, file: File) => void;
  onClearBackgroundImageLayer?: () => void;
  onClearForegroundImageLayer?: () => void;
  onClearBodyPartMaskLayer?: (jointId: string) => void;
  onPatchBackgroundImageLayer?: (patch: Partial<ImageLayerState>) => void;
  onPatchForegroundImageLayer?: (patch: Partial<ImageLayerState>) => void;
  onPatchBodyPartMaskLayer?: (jointId: string, patch: Partial<BodyPartMaskLayer>) => void;
  defaultPieceConfigs?: Record<string, DefaultPieceConfig>;
  onPatchDefaultPieceConfig?: (jointId: string, patch: Partial<DefaultPieceConfig>) => void;
  onClearDefaultPieceConfig?: (jointId: string) => void;
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
  segmentIkTweenMap?: SegmentIkTweenMap;
  onPatchSegmentIkTween?: (
    fromFrame: number,
    toFrame: number,
    patch: Partial<SegmentIkTweenSettings> | null
  ) => void;
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

const DEFAULT_BODY_PART_MASK_LAYER: BodyPartMaskLayer = {
  src: null,
  visible: true,
  opacity: 1,
  scale: 100,
  mode: 'projection',
  rotationDeg: 0,
  skewXDeg: 0,
  skewYDeg: 0,
  offsetX: 0,
  offsetY: 0,
  blendMode: 'source-over',
  filter: 'none',
};

const BODY_PART_MASK_SCALE_MIN = 1;
const DEFAULT_PIECE_SCALE_MIN = 0.2;
const DEFAULT_PIECE_SCALE_MAX = 3;
const DEFAULT_PIECE_OFFSET_LIMIT = 120;
const CONSOLE_PANEL_BACKGROUND = 'rgba(18, 16, 24, 0.5)';

const IMAGE_FIT_MODE_OPTIONS: Array<{ value: NonNullable<ImageLayerState['fitMode']>; label: string }> = [
  { value: 'free', label: 'Free' },
  { value: 'contain', label: 'Contain' },
  { value: 'cover', label: 'Cover' },
];

const BODY_PART_MASK_MODE_OPTIONS: Array<{ value: NonNullable<BodyPartMaskLayer['mode']>; label: string }> = [
  { value: 'projection', label: 'Projection' },
  { value: 'costume', label: 'Costume' },
];

const BODY_PART_MASK_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'grayscale(100%)', label: 'Grayscale' },
  { value: 'sepia(100%)', label: 'Sepia' },
  { value: 'contrast(135%)', label: 'Contrast+' },
  { value: 'saturate(145%)', label: 'Saturate+' },
  { value: 'brightness(120%)', label: 'Bright+' },
  { value: 'hue-rotate(90deg)', label: 'Hue Shift' },
  { value: 'blur(1.2px)', label: 'Soft Blur' },
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
const IMAGE_SCALE_SLIDER_MIN = 1;
const IMAGE_SCALE_SLIDER_MAX = 100;
const IMAGE_SCALE_MIN = 1;
const IMAGE_SCALE_MAX = 1000;

const scaleSliderToActual = (sliderValue: number) => {
  const sliderRange = IMAGE_SCALE_SLIDER_MAX - IMAGE_SCALE_SLIDER_MIN;
  const scaleRange = IMAGE_SCALE_MAX - IMAGE_SCALE_MIN;
  const normalized = sliderRange > 0 ? (sliderValue - IMAGE_SCALE_SLIDER_MIN) / sliderRange : 0;
  return Math.round(normalized * scaleRange + IMAGE_SCALE_MIN);
};

const actualScaleToSlider = (scale: number) => {
  const sliderRange = IMAGE_SCALE_SLIDER_MAX - IMAGE_SCALE_SLIDER_MIN;
  const scaleRange = IMAGE_SCALE_MAX - IMAGE_SCALE_MIN;
  const normalized = scaleRange > 0 ? (scale - IMAGE_SCALE_MIN) / scaleRange : 0;
  return Math.round(normalized * sliderRange + IMAGE_SCALE_SLIDER_MIN);
};
const IK_ROTATION_APPLY_EPSILON_DEG = 0.03;
const FK_ROTATION_NOISE_EPSILON_DEG = 0.04;
const FK_ROTATION_APPLY_EPSILON_DEG = 0.03;
const FK_ROTATION_STEP_MAX = 8.4;
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



const CanvasGrid = forwardRef<CanvasGridRef, CanvasGridProps>(({
  width, height,
  majorGridSize,
  minorGridSize,
  bitruviusData,
  currentRotations = bitruviusData.initialRotations,
  mocapMode = false,
  silhouetteMode = true,
  lotteMode = false,
  ikEnabled = true,
  interactionMode = "FK",
  movementToggles = {},
  viewMode = 'default',
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
  bodyPartMaskLayers,
  onUploadBackgroundImageLayer,
  onUploadForegroundImageLayer,
  onUploadBodyPartMaskLayer,
  onClearBackgroundImageLayer,
  onClearForegroundImageLayer,
  onClearBodyPartMaskLayer,
  onPatchBackgroundImageLayer,
  onPatchForegroundImageLayer,
  onPatchBodyPartMaskLayer,
  defaultPieceConfigs,
  onPatchDefaultPieceConfig,
  onClearDefaultPieceConfig,
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
  segmentIkTweenMap = {},
  onPatchSegmentIkTween,
}, ref) => {
  const {
    stretchEnabled = true,
    softReachEnabled = true,
    naturalBendEnabled = true,
    fk360Enabled = true,
    fkConstraintsEnabled = false,
    fkBendEnabled = false,
    fkStretchEnabled = false,
    handshakeEnabled = true,
    fkRotationSensitivity = 1,
    fkRotationResponse = 1,
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
    ikGravityArmHoldEnabled = false,
    ikGravityLegHoldEnabled = false,
  } = movementToggles;
  const resolvedBackgroundLayer = backgroundImageLayer ?? DEFAULT_IMAGE_LAYER;
  const resolvedForegroundLayer = foregroundImageLayer ?? DEFAULT_IMAGE_LAYER;
  const resolvedBodyPartMaskLayers = bodyPartMaskLayers ?? {};
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundUploadInputRef = useRef<HTMLInputElement>(null);
  const foregroundUploadInputRef = useRef<HTMLInputElement>(null);
  const bodyPartMaskUploadInputRef = useRef<HTMLInputElement>(null);
  const rotationsRef = useRef<SkeletonRotations>(currentRotations);
  const lastValidRotationsRef = useRef<SkeletonRotations>(currentRotations);
  const ikSmoothedTargetRef = useRef<{ [chainId: string]: { x: number; y: number } }>({});
  const ikLastEventTsRef = useRef<{ [chainId: string]: number }>({});
  const ikGroundPinsRef = useRef<Partial<Record<LegChainId, { x: number; y: number }>>>({});
  const fkSliderLastInputRef = useRef<Record<string, number>>({});
  const fkTargetRotationRef = useRef<Record<string, number>>({});
  const fkLastEventTsRef = useRef<Record<string, number>>({});
  const rootRotateRef = useRef(rootRotate);
  const jumpTriggerQueuedRef = useRef<boolean>(false);
  const jumpAssistStateRef = useRef<JumpAssistState>({ active: false, phase: 'idle', timerMs: 0 });
  const lastFkAngleRef = useRef<number>(0);
  const snapbackBackToFirstRafRef = useRef<number | null>(null);
  const timelineConsoleScrollRef = useRef<HTMLDivElement>(null);
  const timelineConsoleScrollRafRef = useRef<number | null>(null);
  const timelineConsoleScrollTargetRef = useRef<number | null>(null);
  const prevIkInteractionRef = useRef<boolean>(ikEnabled && interactionMode === "IK");
  const canvasResolutionRef = useRef<{ width: number; height: number; dpr: number } | null>(null);
  const [dragState, setDragState] = useState<{ id: string, type: "FK" | "IK" | "ROOT" } | null>(null);
  const [rootFkDragArmed, setRootFkDragArmed] = useState(false);
  const [hoveredJoint, setHoveredJoint] = useState<{ id: string; label: string; x: number; y: number } | null>(null);
  const [hoveredHeadGrid, setHoveredHeadGrid] = useState<HeadGridHoverInfo | null>(null);
  const [ikTargets, setIkTargets] = useState<{ [chainId: string]: { x: number, y: number } }>({});
  const ikInteractionActive = ikEnabled && interactionMode === "IK";
  const [showRefineMenu, setShowRefineMenu] = useState(false);
  const [showAnimationTimeline, setShowAnimationTimeline] = useState(true);
  const [bodyMasksEnabled, setBodyMasksEnabled] = useState(true);
  const [hideBoneShapesWithMasks, setHideBoneShapesWithMasks] = useState(false);
  const [timelinePanelMode, setTimelinePanelMode] = useState<'basic' | 'advanced'>('basic');
  const [timelineMinimized, setTimelineMinimized] = useState(false);
  const [timelineControlsMinimized, setTimelineControlsMinimized] = useState(false);
  const [posingConsoleMinimized, setPosingConsoleMinimized] = useState(false);
  const [timelineScrollIndex, setTimelineScrollIndex] = useState(0);
  const [timelineStepFrames, setTimelineStepFrames] = useState(1);
  const [timelineManualStepMode, setTimelineManualStepMode] = useState(false);
  const [dragFrameSlot, setDragFrameSlot] = useState<number | null>(null);
  const [poseLibraryFrame, setPoseLibraryFrame] = useState<number | null>(null);
  const [poseLibrarySearch, setPoseLibrarySearch] = useState('');
  const [activeMaskUploadJointId, setActiveMaskUploadJointId] = useState<string | null>(null);
  const [activeMaskEditorJointId, setActiveMaskEditorJointId] = useState<string | null>(null);
  const [refinePanelMode, setRefinePanelMode] = useState<'basic' | 'advanced'>('basic');
  const [activeDefaultPieceId, setActiveDefaultPieceId] = useState<string | null>(null);
  const [showIkAdvancedControls, setShowIkAdvancedControls] = useState(false);
  const [fkBendOffsetByJoint, setFkBendOffsetByJoint] = useState<Record<string, number>>({});
  const [fkStretchOffsetByJoint, setFkStretchOffsetByJoint] = useState<Record<string, number>>({});
  const [jointTinkerLengths, setJointTinkerLengths] = useState<Record<string, number>>({});
  const [ikPosePrograms, setIkPosePrograms] = useState<IkPoseProgramMap>(DEFAULT_IK_POSE_PROGRAMS);

  // Move computeWorld to top to resolve initialization order and prevent ReferenceError
  const computeWorld = useCallback((jointId: string, rotations: SkeletonRotations, canvasCenter: [number, number]): WorldCoords => {
    // If joint tinker mode is active, use modified bone lengths
    if (showIkAdvancedControls && Object.keys(jointTinkerLengths).length > 0) {
      const path: string[] = [];
      let currentJointId: string | null = jointId;
      while (currentJointId) {
        path.unshift(currentJointId);
        currentJointId = bitruviusData.JOINT_DEFS[currentJointId]?.parent ?? null;
      }

      const rootX_local = rootX;
      const rootY_local = rootY;
      const rootRotate_local = rootRotate;
      let worldX = canvasCenter[0] + rootX_local;
      let worldY = canvasCenter[1] + rootY_local;
      let worldAngle = (rotations.root || 0) + rootRotate_local;
      let parentAngle = 0;

      for (const pathJointId of path) {
        if (pathJointId === 'root') {
          parentAngle = worldAngle;
          continue;
        }

        const jointDef = bitruviusData.JOINT_DEFS[pathJointId];
        if (!jointDef) {
          continue;
        }

        // Use dynamic bone length if available in joint tinker mode, otherwise use original
        const [pivotX, pivotY] = jointDef.pivot;
        const originalLength = Math.hypot(pivotX, pivotY);
        const tinkerLength = jointTinkerLengths[pathJointId];
        const effectiveLength = (tinkerLength !== undefined && tinkerLength > 0) ? tinkerLength : originalLength;
        
        // Scale the pivot vector to match the effective length
        const scale = effectiveLength / originalLength;
        const scaledPivotX = pivotX * scale;
        const scaledPivotY = pivotY * scale;
        
        const cosA = Math.cos(worldAngle * Math.PI / 180);
        const sinA = Math.sin(worldAngle * Math.PI / 180);
        worldX += scaledPivotX * cosA - scaledPivotY * sinA;
        worldY += scaledPivotX * sinA + scaledPivotY * cosA;
        parentAngle = worldAngle;
        worldAngle += (rotations[pathJointId] || 0);
      }

      return {
        x: isNaN(worldX) ? 0 : worldX,
        y: isNaN(worldY) ? 0 : worldY,
        angle: isNaN(worldAngle) ? 0 : (worldAngle % 360),
        parentAngle: isNaN(parentAngle) ? 0 : (parentAngle % 360),
      };
    }
    
    // Standard computeWorld for non-joint-tinker mode
    return computeJointWorldForPose(jointId, bitruviusData.JOINT_DEFS, rotations, canvasCenter, {
      x: rootX,
      y: rootY,
      rotate: rootRotate,
    });
  }, [bitruviusData.JOINT_DEFS, rootX, rootY, rootRotate, showIkAdvancedControls, jointTinkerLengths]);

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

  // Clear joint tinker lengths when mode is disabled
  useEffect(() => {
    if (!showIkAdvancedControls && Object.keys(jointTinkerLengths).length > 0) {
      setJointTinkerLengths({});
    }
  }, [showIkAdvancedControls, jointTinkerLengths]);

  // Initialize all joint tinker lengths when mode is enabled
  useEffect(() => {
    if (showIkAdvancedControls && Object.keys(jointTinkerLengths).length === 0) {
      const initialLengths: Record<string, number> = {};
      Object.keys(bitruviusData.JOINT_DEFS).forEach((jointId) => {
        if (jointId !== 'root') {
          const jointDef = bitruviusData.JOINT_DEFS[jointId];
          if (jointDef) {
            const originalLength = Math.hypot(jointDef.pivot[0], jointDef.pivot[1]);
            initialLengths[jointId] = originalLength;
          }
        }
      });
      setJointTinkerLengths(initialLengths);
    }
  }, [showIkAdvancedControls, jointTinkerLengths, bitruviusData.JOINT_DEFS]);

  // Recovery function to reset joint tinker state
  const resetJointTinkerState = useCallback(() => {
    setJointTinkerLengths({});
    setShowIkAdvancedControls(false);
    // Reset to default pose
    if (onReturnDefaultPose) {
      onReturnDefaultPose();
    }
  }, [setJointTinkerLengths, setShowIkAdvancedControls, onReturnDefaultPose]);

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

  const openBodyPartMaskUpload = useCallback((jointId: string, focusEditor: boolean = false) => {
    if (focusEditor) {
      setActiveMaskEditorJointId(jointId);
    }
    setActiveMaskUploadJointId(jointId);
    bodyPartMaskUploadInputRef.current?.click();
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

  const handleBodyPartMaskUploadInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && activeMaskUploadJointId) {
      onUploadBodyPartMaskLayer?.(activeMaskUploadJointId, file);
    }
    event.target.value = '';
    setActiveMaskUploadJointId(null);
  }, [activeMaskUploadJointId, onUploadBodyPartMaskLayer]);

  const prevBitruviusDataRef = useRef(bitruviusData);
  useEffect(() => {
    if (prevBitruviusDataRef.current === bitruviusData) return;
    prevBitruviusDataRef.current = bitruviusData;
    setActiveIKChains(() => {
      const next: { [chainId: string]: boolean } = {};
      Object.keys(bitruviusData.IK_CHAINS).forEach((chainId) => {
        next[chainId] = isRuntimeIKChainEnabled(bitruviusData.IK_CHAINS[chainId], bitruviusData);
      });
      return next;
    });
  }, [bitruviusData]);
  const maskableBodyPartIds = React.useMemo(() => {
    return bitruviusData.RENDER_ORDER.filter((jointId) => {
      const shape = bitruviusData.SHAPES[jointId];
      return Boolean(shape && shape.type !== 'none');
    });
  }, [bitruviusData.RENDER_ORDER, bitruviusData.SHAPES]);
  const defaultPieceIds = React.useMemo(() => maskableBodyPartIds, [maskableBodyPartIds]);
  
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
    gridOnlyMode && (showAnimationTimeline || activeMaskEditorJointId !== null)
      ? TIMELINE_RAIL_WIDTH + TIMELINE_RAIL_GAP
      : 0;
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
    return bitruviusData.POSES?.["T-Pose"] ?? bitruviusData.POSES?.["Neutral"] ?? currentRotations;
  }, [bitruviusData.POSES, currentRotations]);
  const projectionReferenceHeelY = React.useMemo(() => {
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
    return Math.max(leftHeel.y, rightHeel.y);
  }, [sceneViewport.center, bitruviusData.JOINT_DEFS, projectionReferenceRotations]);

  const runtimeGeometry = React.useMemo(() => {
    return createVitruvianRuntimeGeometry({
      viewWindow: sceneViewport,
      gridOnlyMode,
      referenceHeelY: projectionReferenceHeelY,
    });
  }, [sceneViewport, gridOnlyMode, projectionReferenceHeelY]);

  const toDisplayPoint = useCallback((x: number, y: number): { x: number; y: number } => {
    return runtimeGeometry.projectModelPoint(x, y);
  }, [runtimeGeometry]);

  const fromDisplayPoint = useCallback((x: number, y: number): { x: number; y: number } => {
    return runtimeGeometry.unprojectModelPoint(x, y);
  }, [runtimeGeometry]);

  const getHeadGridHoverInfo = useCallback((mx: number, my: number): Omit<HeadGridHoverInfo, "occludedByModel"> => {
    const hoverCell = runtimeGeometry.resolveHeadGridCell(mx, my);
    return {
      label: hoverCell.label,
      x: mx,
      y: my,
      tileX: hoverCell.tileX,
      tileY: hoverCell.tileY,
      cellX: hoverCell.cellX,
      cellY: hoverCell.cellY,
      lineAxis: hoverCell.lineAxis,
    };
  }, [runtimeGeometry]);

  const headGridSquarePx = Math.max(28, Math.min(92, runtimeGeometry.headGridSquarePx));
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
    const container = timelineConsoleScrollRef.current;
    if (!container) {
      return;
    }
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    if (maxScroll <= 0) {
      return;
    }
    event.preventDefault();
    const currentTarget = timelineConsoleScrollTargetRef.current ?? container.scrollTop;
    const nextTarget = clamp(currentTarget + event.deltaY, 0, maxScroll);
    timelineConsoleScrollTargetRef.current = nextTarget;
    if (timelineConsoleScrollRafRef.current !== null) {
      return;
    }

    const animate = () => {
      const element = timelineConsoleScrollRef.current;
      if (!element) {
        timelineConsoleScrollRafRef.current = null;
        return;
      }
      const target = timelineConsoleScrollTargetRef.current ?? element.scrollTop;
      const delta = target - element.scrollTop;
      if (Math.abs(delta) <= 0.5) {
        element.scrollTop = target;
        timelineConsoleScrollRafRef.current = null;
        return;
      }
      element.scrollTop += delta * 0.24;
      timelineConsoleScrollRafRef.current = requestAnimationFrame(animate);
    };

    timelineConsoleScrollRafRef.current = requestAnimationFrame(animate);
  }, []);
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
      if (timelineConsoleScrollRafRef.current !== null) {
        cancelAnimationFrame(timelineConsoleScrollRafRef.current);
        timelineConsoleScrollRafRef.current = null;
      }
      // Cleanup delayed clearing timeouts
      if (ikClearTimeoutRef.current) {
        clearTimeout(ikClearTimeoutRef.current);
      }
      if (fkClearTimeoutRef.current) {
        clearTimeout(fkClearTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (timelineScrollIndex !== clampedTimelineScrollIndex) {
      setTimelineScrollIndex(clampedTimelineScrollIndex);
    }
  }, [timelineScrollIndex, clampedTimelineScrollIndex]);

  
  useEffect(() => {
    setTimelineStepFrames((prev) => clamp(Math.round(prev) || 1, 1, maxTimelineStepFrames));
  }, [maxTimelineStepFrames]);

  useEffect(() => {
    if ((!gridOnlyMode || !showAnimationTimeline || !onApplyPoseToFrame) && poseLibraryFrame !== null) {
      setPoseLibraryFrame(null);
      setPoseLibrarySearch('');
    }
  }, [gridOnlyMode, showAnimationTimeline, onApplyPoseToFrame, poseLibraryFrame]);

  useEffect(() => {
    if (!bodyMasksEnabled && activeMaskEditorJointId !== null) {
      setActiveMaskEditorJointId(null);
    }
  }, [bodyMasksEnabled, activeMaskEditorJointId]);


  // Safeguard: Check if skeleton is too distorted and auto-recover
  const checkSkeletonIntegrity = useCallback(() => {
    if (!showIkAdvancedControls) return;
    
    // Check a few key joints to ensure they're in reasonable positions
    const keyJoints = ['head', 'l_palm', 'r_palm', 'l_heel', 'r_heel'];
    const center = [0, 0] as [number, number];
    
    let totalDistance = 0;
    let jointCount = 0;
    
    for (const jointId of keyJoints) {
      const world = computeWorld(jointId, rotationsRef.current, center);
      const distance = Math.hypot(world.x - center[0], world.y - center[1]);
      totalDistance += distance;
      jointCount++;
    }
    
    const averageDistance = totalDistance / jointCount;
    
    // If joints are too far from center (indicating radial breakup), auto-recover
    if (averageDistance > 500) {
      console.warn('Skeleton integrity compromised - auto-recovering joint tinker');
      resetJointTinkerState();
    }
  }, [showIkAdvancedControls, rotationsRef, computeWorld, resetJointTinkerState]);

  // Check skeleton integrity periodically when joint tinker is active
  useEffect(() => {
    if (!showIkAdvancedControls) return;
    
    const interval = setInterval(() => {
      checkSkeletonIntegrity();
      
      // Log status for debugging
      const activeJoints = Object.keys(jointTinkerLengths).length;
      console.log(`Joint Tinker Active: ${activeJoints} joints modified`);
      
      // Emergency reset if too many joints are modified (potential corruption)
      if (activeJoints > 15) {
        console.warn('Too many joints modified - emergency reset');
        resetJointTinkerState();
      }
    }, 2000); // Check every 2 seconds
    return () => clearInterval(interval);
  }, [showIkAdvancedControls, checkSkeletonIntegrity, jointTinkerLengths, resetJointTinkerState]);

  const computeThumbPosePath = useCallback((pose: SkeletonRotations): { path: string; joints: Array<{ x: number; y: number }> } => {
    const center: [number, number] = [0, 0];
    const worldPoints = new Map<string, { x: number; y: number }>();
    bitruviusData.HIERARCHY.forEach(([jointId]) => {
      const world = computeWorld(jointId, pose, center);
      // NaN guards to prevent coordinate corruption in thumbnails
      worldPoints.set(jointId, { 
        x: isNaN(world.x) ? 0 : world.x, 
        y: isNaN(world.y) ? 0 : world.y 
      });
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
      const thumbPoint = toThumbPoint(point);
      // Additional NaN guard for thumbnail coordinates
      thumbPoints.set(key, { 
        x: isNaN(thumbPoint.x) ? 50 : thumbPoint.x, 
        y: isNaN(thumbPoint.y) ? 50 : thumbPoint.y 
      });
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
      ?? normA(currentRotations[jointId] ?? 0);
    const hitPositiveEdge = rawDegrees >= 180 && prevRaw < 179.5;
    const hitNegativeEdge = rawDegrees <= -180 && prevRaw > -179.5;
    const wrapped = hitPositiveEdge ? -180 : hitNegativeEdge ? 180 : rawDegrees;
    fkSliderLastInputRef.current[jointId] = wrapped;
    setJointRotationFromSlider(jointId, wrapped);
  }, [currentRotations, setJointRotationFromSlider]);




  useEffect(() => {
    rootRotateRef.current = rootRotate;
  }, [rootRotate]);

  useEffect(() => {
    rotationsRef.current = currentRotations;
    lastValidRotationsRef.current = currentRotations;
  }, [currentRotations]);

  // Add refs for delayed clearing to prevent snapback
  const ikClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fkClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isPlaying && (!dragState || dragState.type !== "IK")) {
      // Delay clearing IK targets to prevent snapback
      if (ikClearTimeoutRef.current) {
        clearTimeout(ikClearTimeoutRef.current);
      }
      ikClearTimeoutRef.current = setTimeout(() => {
        ikSmoothedTargetRef.current = {};
        ikLastEventTsRef.current = {};
        ikGroundPinsRef.current = {};
        ikClearTimeoutRef.current = null;
      }, 200); // 200ms delay to prevent snapback
    } else {
      // Clear timeout immediately if IK interaction starts again
      if (ikClearTimeoutRef.current) {
        clearTimeout(ikClearTimeoutRef.current);
        ikClearTimeoutRef.current = null;
      }
    }
    
    if (!isPlaying && (!dragState || dragState.type !== "FK")) {
      // Delay clearing FK targets to prevent snapback
      if (fkClearTimeoutRef.current) {
        clearTimeout(fkClearTimeoutRef.current);
      }
      fkClearTimeoutRef.current = setTimeout(() => {
        fkSliderLastInputRef.current = {};
        fkTargetRotationRef.current = {};
        fkLastEventTsRef.current = {};
        fkClearTimeoutRef.current = null;
      }, 200); // 200ms delay to prevent snapback
    } else {
      // Clear timeout immediately if FK interaction starts again
      if (fkClearTimeoutRef.current) {
        clearTimeout(fkClearTimeoutRef.current);
        fkClearTimeoutRef.current = null;
      }
    }
  }, [dragState, isPlaying]);

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
        fkTargetRotationRef.current.root = rootRotateRef.current;
        fkLastEventTsRef.current.root = performance.now();
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
      const initialLocal = controllerId === 'root'
        ? rootRotateRef.current
        : (rotationsRef.current[controllerId] ?? 0);
      fkTargetRotationRef.current[controllerId] = initialLocal;
      fkLastEventTsRef.current[controllerId] = performance.now();
      
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
    const fkLivePoseDuringPlayback = isPlaying && (dragState?.type === 'FK' || dragState?.type === 'ROOT');
    if (isPlaying && !fkLivePoseDuringPlayback) {
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
      
      // Joint Tinker Mode: Drag joint positions directly, extending/compacting bones
      if (showIkAdvancedControls && id !== 'root') {
        // Convert screen coordinates to world coordinates
        const targetWorld = fromDisplayPoint(mx, my);
        
        // Get parent joint world position
        const parentId = bitruviusData.JOINT_DEFS[id]?.parent;
        if (!parentId) return;
        
        const parentWorld = computeWorld(parentId, rotationsRef.current, center);
        
        // Calculate the desired position relative to parent (simpler approach)
        const relativePosition = {
          x: targetWorld.x - parentWorld.x,
          y: targetWorld.y - parentWorld.y
        };
        
        // Get original bone vector from joint definition
        const jointDef = bitruviusData.JOINT_DEFS[id];
        const originalPivot = { x: jointDef.pivot[0], y: jointDef.pivot[1] };
        const originalLength = Math.hypot(originalPivot.x, originalPivot.y);
        
        // Calculate the new bone length
        const newLength = Math.hypot(relativePosition.x, relativePosition.y);
        
        if (originalLength > 0 && newLength > 0 && isFinite(newLength)) {
          // Apply constraints to prevent extreme changes
          const minLength = originalLength * 0.5; // Minimum 50% of original length
          const maxLength = originalLength * 2.0; // Maximum 200% of original length
          const constrainedLength = Math.max(minLength, Math.min(newLength, maxLength));
          
          // Calculate the angle needed to point from parent to target position
          const desiredAngle = r2d(Math.atan2(relativePosition.y, relativePosition.x));
          const parentAngle = parentWorld.angle;
          
          // Calculate the local rotation that would achieve this position
          let targetLocal = normA(desiredAngle - parentAngle);
          
          // Apply constraints if enabled
          const lim = bitruviusData.JOINT_LIMITS[id];
          if (fkConstraintsEnabled && lim) {
            targetLocal = clamp(targetLocal, lim.min, lim.max);
          }
          
          // Smooth the rotation
          const previousLocal = rotationsRef.current[id] ?? 0;
          const now = performance.now();
          const previousEventTs = fkLastEventTsRef.current[id] ?? now;
          const dtMs = Math.max(0, now - previousEventTs);
          fkLastEventTsRef.current[id] = now;
          
          const fkRotationFluidity = clamp((fkRotationSensitivity + fkRotationResponse) / 2, 0.35, 1.6);
          const fluidityAlpha = fkRotationFluidity >= 1
            ? 1
            : resolveTemporalAlpha(fkRotationFluidity, dtMs || IK_BASE_FRAME_MS);
          const dtScale = clamp(dtMs || IK_BASE_FRAME_MS, IK_EVENT_DT_MIN_MS, IK_EVENT_DT_MAX_MS) / IK_BASE_FRAME_MS;
          const maxStep = FK_ROTATION_STEP_MAX * Math.max(0.55, fkRotationFluidity) * dtScale;
          
          let local = previousLocal + clamp(
            normA(targetLocal - previousLocal) * fluidityAlpha,
            -maxStep,
            maxStep
          );
          
          if (fkConstraintsEnabled && lim) local = clamp(local, lim.min, lim.max);
          
          const localDelta = normA(local - previousLocal);
          if (Math.abs(localDelta) <= FK_ROTATION_APPLY_EPSILON_DEG) {
            return;
          }
          
          // Update the dynamic bone length for this joint (simpler approach)
          setJointTinkerLengths(prev => ({
            ...prev,
            [id]: constrainedLength
          }));
          
          // Apply rotation to current joint only (maintain hierarchy)
          const nextRots = { ...rotationsRef.current, [id]: local };
          rotationsRef.current = nextRots;
          lastValidRotationsRef.current = nextRots;
          onRotationsChange?.(nextRots);
        }
        return;
      }
      
      // Standard FK mode (existing logic)
      const world = computeWorld(id, rotationsRef.current, center);
      const worldDisplay = toDisplayPoint(world.x, world.y);
      const parentId = bitruviusData.JOINT_DEFS[id]?.parent;
      const pWorld = parentId ? computeWorld(parentId, rotationsRef.current, center) : { x: center[0], y: center[1], angle: 0, parentAngle: 0 };
      const lim = bitruviusData.JOINT_LIMITS[id];
      const allow360 = fk360Enabled;
      const applyFkConstraints = fkConstraintsEnabled;
      const previousLocal = id === 'root' ? rootRotateRef.current : (rotationsRef.current[id] ?? 0);
      const now = performance.now();
      const previousEventTs = fkLastEventTsRef.current[id] ?? now;
      const dtMs = Math.max(0, now - previousEventTs);
      fkLastEventTsRef.current[id] = now;
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
      const previousTargetLocal = fkTargetRotationRef.current[id] ?? previousLocal;
      let targetLocal: number;
      if (allow360) {
        const newAngle = r2d(Math.atan2(my - worldDisplay.y, mx - worldDisplay.x));
        const rawDelta = normA(newAngle - lastFkAngleRef.current);
        lastFkAngleRef.current = newAngle;
        const delta = Math.abs(rawDelta) <= FK_ROTATION_NOISE_EPSILON_DEG ? 0 : rawDelta;
        targetLocal = previousTargetLocal + delta;
      } else {
        targetLocal = normA(r2d(Math.atan2(my - worldDisplay.y, mx - worldDisplay.x)) - pWorld.angle);
        if (applyFkConstraints && lim) targetLocal = clamp(targetLocal, lim.min, lim.max);
      }
      fkTargetRotationRef.current[id] = targetLocal;
      const fkRotationFluidity = clamp((fkRotationSensitivity + fkRotationResponse) / 2, 0.35, 1.6);
      const fluidityAlpha = fkRotationFluidity >= 1
        ? 1
        : resolveTemporalAlpha(fkRotationFluidity, dtMs || IK_BASE_FRAME_MS);
      const dtScale = clamp(dtMs || IK_BASE_FRAME_MS, IK_EVENT_DT_MIN_MS, IK_EVENT_DT_MAX_MS) / IK_BASE_FRAME_MS;
      const maxStep = FK_ROTATION_STEP_MAX * Math.max(0.55, fkRotationFluidity) * dtScale;
      let local = previousLocal + clamp(
        normA(targetLocal - previousLocal) * fluidityAlpha,
        -maxStep,
        maxStep
      );
      if (!allow360 && applyFkConstraints && lim) local = clamp(local, lim.min, lim.max);
      const nextRots = id === 'root'
        ? { ...rotationsRef.current }
        : { ...rotationsRef.current, [id]: local };
      const localDelta = normA(local - previousLocal);
      if (Math.abs(localDelta) <= FK_ROTATION_APPLY_EPSILON_DEG) {
        return;
      }
      if (Math.abs(localDelta) > 1e-6 && id !== 'root') {
        const directChildren = Object.entries(bitruviusData.JOINT_DEFS)
          .filter(([, def]) => def.parent === id)
          .map(([jointId]) => jointId);

        const bendOffset = clamp(fkBendOffsetByJoint[id] ?? 0, -12, 12);
        if (fkBendEnabled && bendOffset !== 0) {
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
        if (fkStretchEnabled && stretchOffset !== 0) {
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
        rootRotateRef.current = local;
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

      // Apply gravity hold if enabled
      if (ikGravityArmHoldEnabled || ikGravityLegHoldEnabled) {
        const gravityHoldToggles: IkGravityHoldToggles = {
          ikGravityArmHoldEnabled,
          ikGravityLegHoldEnabled,
        };
        workingRotations = applyIkGravityHold({
          currentRotations: rotationsRef.current,
          solvedRotations: workingRotations,
          toggles: gravityHoldToggles,
        });
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
    } else if (dragState?.type === "FK") {
      delete fkTargetRotationRef.current[dragState.id];
      delete fkLastEventTsRef.current[dragState.id];
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
    } else if (dragState?.type === "FK") {
      delete fkTargetRotationRef.current[dragState.id];
      delete fkLastEventTsRef.current[dragState.id];
    }
    setDragState(null);
    setHoveredJoint((prev) => (prev ? null : prev));
    setHoveredHeadGrid((prev) => (prev ? null : prev));
  };

  const ikDebugOverlayEnabled = React.useMemo(() => {
    if (!(import.meta as any).env.DEV || typeof window === 'undefined') {
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
    const nextCanvasWidth = Math.max(1, Math.round(width * dpr));
    const nextCanvasHeight = Math.max(1, Math.round(height * dpr));
    const previousResolution = canvasResolutionRef.current;
    if (
      !previousResolution ||
      previousResolution.width !== nextCanvasWidth ||
      previousResolution.height !== nextCanvasHeight ||
      previousResolution.dpr !== dpr
    ) {
      canvas.width = nextCanvasWidth;
      canvas.height = nextCanvasHeight;
      canvasResolutionRef.current = {
        width: nextCanvasWidth,
        height: nextCanvasHeight,
        dpr,
      };
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);



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
      bodyPartMasks: bodyMasksEnabled ? resolvedBodyPartMaskLayers : {},
      gridOnlyMode,
      runtimeGeometry,
      showIkDebugOverlay: ikDebugOverlayEnabled,
      headGridHover: hoveredHeadGrid,
      defaultPieceConfigs,
      hideBoneShapesWithMasks: hideBoneShapesWithMasks && bodyMasksEnabled,
    });
  }, [
    width,
    height,
    sceneViewport,
    majorGridSize,
    minorGridSize,
    bitruviusData,
    currentRotations,
    ikTargets,
    mocapMode,
    silhouetteMode,
    lotteMode,
    computeWorld,
    ghostFrames,
    visualModules,
    resolvedBackgroundLayer,
    resolvedForegroundLayer,
    resolvedBodyPartMaskLayers,
    bodyMasksEnabled,
    gridOnlyMode,
    runtimeGeometry,
    ikDebugOverlayEnabled,
    hoveredHeadGrid,
    defaultPieceConfigs,
    hideBoneShapesWithMasks,
  ]);

  const gridRefineTop = UI_INSET + (onExitGridView ? 38 : 0);
  const bgOpacityPercent = Math.round(clamp(Number.isFinite(resolvedBackgroundLayer.opacity) ? resolvedBackgroundLayer.opacity : 1, 0, 1) * 100);
  const fgOpacityPercent = Math.round(clamp(Number.isFinite(resolvedForegroundLayer.opacity) ? resolvedForegroundLayer.opacity : 1, 0, 1) * 100);
  const bgXPercent = Math.round(clamp(Number.isFinite(resolvedBackgroundLayer.x) ? resolvedBackgroundLayer.x : 50, 0, 100));
  const bgYPercent = Math.round(clamp(Number.isFinite(resolvedBackgroundLayer.y) ? resolvedBackgroundLayer.y : 50, 0, 100));
  const fgXPercent = Math.round(clamp(Number.isFinite(resolvedForegroundLayer.x) ? resolvedForegroundLayer.x : 50, 0, 100));
  const fgYPercent = Math.round(clamp(Number.isFinite(resolvedForegroundLayer.y) ? resolvedForegroundLayer.y : 50, 0, 100));
  const resolvedBgScale = clamp(Number.isFinite(resolvedBackgroundLayer.scale) ? resolvedBackgroundLayer.scale : 100, IMAGE_SCALE_MIN, IMAGE_SCALE_MAX);
  const bgScaleSlider = actualScaleToSlider(resolvedBgScale);
  const bgScaleDisplay = Math.round(resolvedBgScale);
  const resolvedFgScale = clamp(Number.isFinite(resolvedForegroundLayer.scale) ? resolvedForegroundLayer.scale : 100, IMAGE_SCALE_MIN, IMAGE_SCALE_MAX);
  const fgScaleSlider = actualScaleToSlider(resolvedFgScale);
  const fgScaleDisplay = Math.round(resolvedFgScale);
  const bgFitMode = resolvedBackgroundLayer.fitMode ?? 'free';
  const fgFitMode = resolvedForegroundLayer.fitMode ?? 'free';
  const fgBlendMode = resolvedForegroundLayer.blendMode ?? 'source-over';
  const loadedBodyMaskCount = maskableBodyPartIds.reduce((count, jointId) => {
    const layer = resolvedBodyPartMaskLayers[jointId];
    return layer?.src ? count + 1 : count;
  }, 0);
  const activeMaskEditorJointLabel = activeMaskEditorJointId
    ? bitruviusData.MASK_MENU_LABELS[activeMaskEditorJointId] ?? bitruviusData.JOINT_DEFS[activeMaskEditorJointId]?.label ?? activeMaskEditorJointId
    : '';
  const activeMaskEditorLayer: BodyPartMaskLayer = activeMaskEditorJointId
    ? {
      ...DEFAULT_BODY_PART_MASK_LAYER,
      ...(resolvedBodyPartMaskLayers[activeMaskEditorJointId] ?? {}),
    }
    : DEFAULT_BODY_PART_MASK_LAYER;
  const activeMaskOpacityPercent = Math.round(
    clamp(Number.isFinite(activeMaskEditorLayer.opacity) ? activeMaskEditorLayer.opacity : 1, 0, 1) * 100
  );
  const activeMaskScalePercent = Math.round(
    clamp(
      Number.isFinite(activeMaskEditorLayer.scale) ? activeMaskEditorLayer.scale : 100,
      BODY_PART_MASK_SCALE_MIN,
      400
    )
  );
  const activeMaskRotation = Math.round(
    clamp(Number.isFinite(activeMaskEditorLayer.rotationDeg) ? activeMaskEditorLayer.rotationDeg : 0, -360, 360)
  );
  const activeMaskSkewX = Math.round(
    clamp(Number.isFinite(activeMaskEditorLayer.skewXDeg) ? activeMaskEditorLayer.skewXDeg : 0, -80, 80)
  );
  const activeMaskSkewY = Math.round(
    clamp(Number.isFinite(activeMaskEditorLayer.skewYDeg) ? activeMaskEditorLayer.skewYDeg : 0, -80, 80)
  );
  const activeMaskOffsetX = Math.round(
    clamp(Number.isFinite(activeMaskEditorLayer.offsetX) ? activeMaskEditorLayer.offsetX : 0, -300, 300)
  );
  const activeMaskOffsetY = Math.round(
    clamp(Number.isFinite(activeMaskEditorLayer.offsetY) ? activeMaskEditorLayer.offsetY : 0, -300, 300)
  );
  const activeMaskBlendMode = activeMaskEditorLayer.blendMode ?? 'source-over';
  const activeMaskMode = activeMaskEditorLayer.mode ?? 'projection';
  const activeMaskFilter = (activeMaskEditorLayer.filter ?? 'none').trim() || 'none';
  const patchActiveMaskEditor = useCallback((patch: Partial<BodyPartMaskLayer>) => {
    if (!activeMaskEditorJointId) {
      return;
    }
    onPatchBodyPartMaskLayer?.(activeMaskEditorJointId, patch);
  }, [activeMaskEditorJointId, onPatchBodyPartMaskLayer]);
  const activeDefaultPieceLabel = activeDefaultPieceId
    ? bitruviusData.MASK_MENU_LABELS[activeDefaultPieceId] ?? bitruviusData.JOINT_DEFS[activeDefaultPieceId]?.label ?? activeDefaultPieceId
    : '';
  const activeDefaultPieceConfig = activeDefaultPieceId ? defaultPieceConfigs?.[activeDefaultPieceId] : undefined;
  const activeDefaultPieceVisible = activeDefaultPieceConfig?.visible ?? true;
  const activeDefaultPieceScale = clamp(
    Number.isFinite(activeDefaultPieceConfig?.scale) ? activeDefaultPieceConfig.scale : 1,
    DEFAULT_PIECE_SCALE_MIN,
    DEFAULT_PIECE_SCALE_MAX
  );
  const activeDefaultPieceRotation = clamp(
    Number.isFinite(activeDefaultPieceConfig?.rotationDeg) ? activeDefaultPieceConfig.rotationDeg : 0,
    -180,
    180
  );
  const activeDefaultPieceOffsetX = clamp(
    Number.isFinite(activeDefaultPieceConfig?.offsetX) ? activeDefaultPieceConfig.offsetX : 0,
    -DEFAULT_PIECE_OFFSET_LIMIT,
    DEFAULT_PIECE_OFFSET_LIMIT
  );
  const activeDefaultPieceOffsetY = clamp(
    Number.isFinite(activeDefaultPieceConfig?.offsetY) ? activeDefaultPieceConfig.offsetY : 0,
    -DEFAULT_PIECE_OFFSET_LIMIT,
    DEFAULT_PIECE_OFFSET_LIMIT
  );
  const patchActiveDefaultPiece = useCallback((patch: Partial<DefaultPieceConfig>) => {
    if (!activeDefaultPieceId) {
      return;
    }
    onPatchDefaultPieceConfig?.(activeDefaultPieceId, patch);
  }, [activeDefaultPieceId, onPatchDefaultPieceConfig]);
  const closeOverlay = useCallback(() => {
    setActiveMaskEditorJointId(null);
    setActiveDefaultPieceId(null);
  }, []);
  const bodyMaskUploadHandles = React.useMemo(() => {
    if (!gridOnlyMode || !bodyMasksEnabled || !maskableBodyPartIds.length) {
      return [] as Array<{
        jointId: string;
        label: string;
        shortLabel: string;
        x: number;
        y: number;
        labelX: number;
        labelY: number;
        jointX: number;
        jointY: number;
        nx: number;
        ny: number;
        hasMask: boolean;
      }>;
    }

    const ringCenter = runtimeGeometry.worldToScreen(
      runtimeGeometry.model.circle.center.x,
      runtimeGeometry.model.circle.center.y + runtimeGeometry.ringVerticalOffsetWorld
    );
    const ringRadiusPx = runtimeGeometry.model.circle.radius * runtimeGeometry.gridScale;
    const baseOrbitRadiusPx = ringRadiusPx + Math.max(20, runtimeGeometry.headGridSquarePx * 0.82);
    const minX = sceneViewport.x + 18;
    const maxX = sceneViewport.x + sceneViewport.width - 18;
    const minY = sceneViewport.y + 56;
    const maxY = sceneViewport.y + sceneViewport.height - 18;
    const center = sceneViewport.center;
    const twoPi = Math.PI * 2;
    const wrapAngle = (angle: number): number => {
      let next = angle % twoPi;
      if (next < 0) {
        next += twoPi;
      }
      return next;
    };
    const shortestAngleDelta = (delta: number): number => {
      let next = (delta + Math.PI) % twoPi;
      if (next < 0) {
        next += twoPi;
      }
      return next - Math.PI;
    };

    const rawHandles = maskableBodyPartIds.map((jointId, index) => {
      const world = computeWorld(jointId, currentRotations, center);
      const jointScreen = toDisplayPoint(world.x, world.y);
      let vx = jointScreen.x - ringCenter.x;
      let vy = jointScreen.y - ringCenter.y;
      const fallbackAngle = -Math.PI / 2 + (Math.PI * 2 * index) / maskableBodyPartIds.length;
      const magnitude = Math.hypot(vx, vy);
      let preferredAngle = fallbackAngle;
      if (!Number.isFinite(magnitude) || magnitude < 0.001) {
        vx = Math.cos(fallbackAngle);
        vy = Math.sin(fallbackAngle);
      } else {
        vx /= magnitude;
        vy /= magnitude;
        preferredAngle = Math.atan2(vy, vx);
      }
      preferredAngle = wrapAngle(preferredAngle);
      const handleLabel = bitruviusData.MASK_MENU_LABELS[jointId] ?? bitruviusData.JOINT_DEFS[jointId]?.label ?? jointId;
      const shortLabel = handleLabel.replace(/_/g, ' ').toUpperCase();
      return {
        jointId,
        label: handleLabel,
        shortLabel,
        jointX: jointScreen.x,
        jointY: jointScreen.y,
        hasMask: Boolean(resolvedBodyPartMaskLayers[jointId]?.src),
        preferredAngle,
      };
    });

    const angleByJoint: Record<string, number> = {};
    rawHandles.forEach((handle) => {
      angleByJoint[handle.jointId] = handle.preferredAngle;
    });
    const sortedByAngle = rawHandles
      .slice()
      .sort((a, b) => a.preferredAngle - b.preferredAngle);
    const minAngleSeparation = Math.min(Math.PI / 4.2, (twoPi / Math.max(1, rawHandles.length)) * 0.9);
    for (let iteration = 0; iteration < 28; iteration += 1) {
      for (let i = 0; i < sortedByAngle.length; i += 1) {
        for (let j = i + 1; j < sortedByAngle.length; j += 1) {
          const a = sortedByAngle[i];
          const b = sortedByAngle[j];
          const diff = shortestAngleDelta(angleByJoint[b.jointId] - angleByJoint[a.jointId]);
          const absDiff = Math.abs(diff);
          if (absDiff >= minAngleSeparation) {
            continue;
          }
          const push = (minAngleSeparation - absDiff) * 0.6;
          const sign = diff >= 0 ? 1 : -1;
          angleByJoint[a.jointId] -= sign * push;
          angleByJoint[b.jointId] += sign * push;
        }
      }
      sortedByAngle.forEach((handle) => {
        const currentAngle = angleByJoint[handle.jointId];
        const towardPreferred = shortestAngleDelta(handle.preferredAngle - currentAngle) * 0.06;
        angleByJoint[handle.jointId] = currentAngle + towardPreferred;
      });
    }

    const maxOrbitRadiusX = Math.max(34, Math.min(ringCenter.x - minX, maxX - ringCenter.x) - 14);
    const maxOrbitRadiusY = Math.max(34, Math.min(ringCenter.y - minY, maxY - ringCenter.y) - 14);
    const resolvedOrbitRadiusPx = clamp(
      baseOrbitRadiusPx,
      34,
      Math.max(34, Math.min(maxOrbitRadiusX, maxOrbitRadiusY))
    );

    return rawHandles.map((handle) => {
      const angle = wrapAngle(angleByJoint[handle.jointId]);
      const vx = Math.cos(angle);
      const vy = Math.sin(angle);
      const rawX = ringCenter.x + vx * resolvedOrbitRadiusPx;
      const rawY = ringCenter.y + vy * resolvedOrbitRadiusPx;
      const clampedX = clamp(rawX, minX, maxX);
      const clampedY = clamp(rawY, minY, maxY);
      const labelX = clampedX + vx * 14;
      const labelY = clampedY + vy * 14;
      return {
        jointId: handle.jointId,
        label: handle.label,
        shortLabel: handle.shortLabel,
        x: clampedX,
        y: clampedY,
        labelX,
        labelY,
        jointX: handle.jointX,
        jointY: handle.jointY,
        nx: vx,
        ny: vy,
        hasMask: handle.hasMask,
      };
    });
  }, [
    gridOnlyMode,
    bodyMasksEnabled,
    maskableBodyPartIds,
    runtimeGeometry,
    sceneViewport.x,
    sceneViewport.y,
    sceneViewport.width,
    sceneViewport.height,
    sceneViewport.center,
    currentRotations,
    computeWorld,
    toDisplayPoint,
    bitruviusData.JOINT_DEFS,
    resolvedBodyPartMaskLayers,
  ]);
  const rightRailOffset =
    showAnimationTimeline || activeMaskEditorJointId !== null
      ? timelineRailWidth + UI_INSET
      : UI_INSET;
  const poseLibraryDisplayFrame = poseLibraryFrame !== null ? poseLibraryFrame + 1 : null;
  const defaultPoseThumb = React.useMemo(() => {
    const sourcePose = bitruviusData.POSES?.["T-Pose"] ?? bitruviusData.POSES?.["Neutral"] ?? currentRotations;
    return computeThumbPosePath(sourcePose);
  }, [bitruviusData.POSES, currentRotations, computeThumbPosePath]);

  useImperativeHandle(ref, () => ({
    exportAsImage: async (options = {}) => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas not available');
      await exportCanvasAsImage(canvas, { format: 'png', ...options });
    },
    exportAsVideo: async (options = {}) => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas not available');
      await exportCanvasAsVideo(canvas, () => {
        // Force a render frame
        const renderFrame = () => {
          // This will trigger the existing render loop
        };
        renderFrame();
      }, { format: 'webm', ...options });
    },
    getCanvas: () => canvasRef.current,
  }), [canvasRef]);

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
      <input
        ref={bodyPartMaskUploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleBodyPartMaskUploadInput}
        className="hidden"
      />

      {gridOnlyMode && bodyMasksEnabled && bodyMaskUploadHandles.length > 0 ? (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 74 }}>
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {bodyMaskUploadHandles.map((handle) => (
              <line
                key={`mask-link-${handle.jointId}`}
                x1={handle.jointX}
                y1={handle.jointY}
                x2={handle.x}
                y2={handle.y}
                stroke={handle.hasMask ? 'rgba(74, 222, 128, 0.5)' : 'rgba(158, 150, 184, 0.44)'}
                strokeWidth={1.2}
                strokeDasharray="3 3"
              />
            ))}
          </svg>
          {bodyMaskUploadHandles.map((handle) => (
            <React.Fragment key={`mask-handle-${handle.jointId}`}>
              <button
                type="button"
                onClick={() => openBodyPartMaskUpload(handle.jointId, true)}
                className="absolute h-6 w-6 rounded-full border text-[13px] font-bold leading-none flex items-center justify-center transition-colors pointer-events-auto"
                style={{
                  left: `${handle.x}px`,
                  top: `${handle.y}px`,
                  transform: 'translate(-50%, -50%)',
                  background: handle.hasMask ? 'rgba(16, 88, 56, 0.82)' : 'rgba(18, 16, 24, 0.84)',
                  borderColor: handle.hasMask ? 'rgba(74, 222, 128, 0.78)' : 'rgba(158, 150, 184, 0.72)',
                  color: 'rgba(244, 244, 245, 0.95)',
                }}
                title={`Upload or replace mask for ${handle.label}`}
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setActiveMaskEditorJointId(handle.jointId)}
                className="absolute px-1.5 py-[2px] rounded border text-[9px] font-semibold tracking-[0.05em] uppercase pointer-events-auto transition-colors hover:bg-white/15"
                style={{
                  left: `${handle.labelX}px`,
                  top: `${handle.labelY}px`,
                  transform: 'translate(-50%, -50%)',
                  background: 'rgba(18, 16, 24, 0.78)',
                  borderColor: handle.hasMask ? 'rgba(74, 222, 128, 0.62)' : 'rgba(158, 150, 184, 0.52)',
                  color: handle.hasMask ? 'rgba(220, 252, 231, 0.95)' : 'rgba(232, 228, 243, 0.95)',
                }}
                title={`Edit mask settings for ${handle.label}`}
              >
                {handle.shortLabel}
              </button>
            </React.Fragment>
          ))}
        </div>
      ) : null}

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

      {gridOnlyMode && showAnimationTimeline && activeMaskEditorJointId === null ? (
        <div
          className="absolute pointer-events-auto"
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
              background: CONSOLE_PANEL_BACKGROUND,
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
                  onClick={() => setShowIkAdvancedControls((prev) => !prev)}
                  className="min-h-7 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-100 hover:bg-white/10 transition-colors"
                  title="Toggle joint tinkering controls"
                >
                  Joint Tinker: {showIkAdvancedControls ? 'On' : 'Off'}
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
              <div
                ref={timelineConsoleScrollRef}
                onWheel={handleTimelineWheel}
                onScroll={(event) => {
                  timelineConsoleScrollTargetRef.current = event.currentTarget.scrollTop;
                }}
                className="px-2.5 py-2.5 flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-2.5"
                style={{ scrollBehavior: 'smooth' }}
              >
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
                    <div className="flex items-center justify-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-zinc-950 text-[12px] font-semibold text-zinc-100">
                        {currentDisplayFrame}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.05em] text-zinc-400">
                        of {totalDisplayFrames}
                      </span>
                    </div>
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
                            <div className="flex items-center justify-between text-[9px] tracking-[0.05em] uppercase text-zinc-400">
                              <span>Scale</span>
                              <span>{bgScaleDisplay}</span>
                            </div>
                            <input
                              type="range"
                              min={IMAGE_SCALE_SLIDER_MIN}
                              max={IMAGE_SCALE_SLIDER_MAX}
                              value={bgScaleSlider}
                              disabled={!onPatchBackgroundImageLayer}
                              onChange={(event) => {
                                const next = Number(event.target.value);
                                if (!Number.isFinite(next)) return;
                                onPatchBackgroundImageLayer?.({
                                  scale: clamp(scaleSliderToActual(next), IMAGE_SCALE_MIN, IMAGE_SCALE_MAX),
                                });
                              }}
                              className="w-full accent-emerald-400 disabled:opacity-45 disabled:cursor-not-allowed"
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
                            <div className="flex items-center justify-between text-[9px] tracking-[0.05em] uppercase text-zinc-400">
                              <span>Scale</span>
                              <span>{fgScaleDisplay}</span>
                            </div>
                            <input
                              type="range"
                              min={IMAGE_SCALE_SLIDER_MIN}
                              max={IMAGE_SCALE_SLIDER_MAX}
                              value={fgScaleSlider}
                              disabled={!onPatchForegroundImageLayer}
                              onChange={(event) => {
                                const next = Number(event.target.value);
                                if (!Number.isFinite(next)) return;
                                onPatchForegroundImageLayer?.({
                                  scale: clamp(scaleSliderToActual(next), IMAGE_SCALE_MIN, IMAGE_SCALE_MAX),
                                });
                              }}
                              className="w-full accent-emerald-400 disabled:opacity-45 disabled:cursor-not-allowed"
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

                      <div className="space-y-1.5 border border-white/10 rounded p-2">
                        <div className="flex items-center justify-between text-[10px] tracking-[0.05em] uppercase text-zinc-400">
                          <span>Body Masks</span>
                          <span className="text-zinc-500">{loadedBodyMaskCount}/{maskableBodyPartIds.length}</span>
                        </div>
                        <div className="text-[10px] text-zinc-400 leading-snug">
                          Use on-canvas <span className="text-zinc-200 font-semibold">+</span> handles around the ring to select a body part and open the mask editor.
                        </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (!maskableBodyPartIds.length) return;
                            const fallbackJointId = maskableBodyPartIds[0];
                            setActiveMaskEditorJointId(fallbackJointId);
                          }}
                          className="min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors"
                        >
                          Open Editor
                        </button>
                        <button
                          type="button"
                          onClick={() => setBodyMasksEnabled((prev) => !prev)}
                          className="min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors"
                        >
                          Masks {bodyMasksEnabled ? 'On' : 'Off'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setHideBoneShapesWithMasks((prev) => !prev)}
                          disabled={!bodyMasksEnabled}
                          className="min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Hide Shapes {hideBoneShapesWithMasks ? 'On' : 'Off'}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5 border border-white/10 rounded p-2">
                      <div className="flex items-center justify-between text-[10px] tracking-[0.08em] uppercase text-zinc-300">
                        <span>Default Pieces</span>
                        <span className="text-zinc-500">{defaultPieceIds.length}</span>
                      </div>
                      <div className="max-h-44 overflow-y-auto custom-scrollbar space-y-1">
                        {defaultPieceIds.map((jointId) => {
                          const label = bitruviusData.MASK_MENU_LABELS[jointId] ?? bitruviusData.JOINT_DEFS[jointId]?.label ?? jointId;
                          const config = defaultPieceConfigs?.[jointId];
                          const visible = config?.visible ?? true;
                          return (
                            <div key={`piece-${jointId}`} className="flex items-center justify-between gap-2 text-[10px]">
                              <span className="truncate text-zinc-100" title={label}>{label}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => onPatchDefaultPieceConfig?.(jointId, { visible: !visible })}
                                  className="min-h-7 px-2 py-1 text-[9px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                                  disabled={!onPatchDefaultPieceConfig}
                                >
                                  {visible ? 'Hide' : 'Show'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveDefaultPieceId(jointId);
                                    setActiveMaskEditorJointId(null);
                                  }}
                                  className="min-h-7 px-2 py-1 text-[9px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors"
                                  title={`Edit ${label}`}
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
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

                <div className="space-y-2 pr-1">
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
                    const segmentPairKey = hasSegmentControl ? segmentIkTweenKey(frame, nextKeyframe as number) : '';
                    const customSegmentDuration = hasSegmentControl ? segmentInterpolationFrames[segmentPairKey] : undefined;
                    const activeSegmentDuration = customSegmentDuration ?? segmentSpan;
                    const segmentIkTweenSettings = hasSegmentControl
                      ? normalizeSegmentIkTweenSettings(segmentIkTweenMap[segmentPairKey])
                      : DEFAULT_SEGMENT_IK_TWEEN_SETTINGS;
                    const segmentIkInfluencePct = Math.round(segmentIkTweenSettings.influence * 100);

                    return (
                      <div key={`slot-${frame}-${slotIndex}`} className="space-y-1.5 border border-white/10 rounded p-1.5">
                        <div className="flex items-center justify-between">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-zinc-950 text-[10px] font-semibold text-zinc-100">
                            {displayFrame}
                          </span>
                          <span className="text-[10px] tracking-[0.05em] uppercase text-zinc-500">{hasPose ? 'Key Pose' : 'Empty'}</span>
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
                                    cx={isNaN(jointPoint.x) ? 50 : jointPoint.x}
                                    cy={isNaN(jointPoint.y) ? 50 : jointPoint.y}
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
                            <div className="mt-1.5 text-[10px] tracking-[0.05em] uppercase text-zinc-400">
                              IK Tween: {segmentIkTweenSettings.enabled ? `On (${segmentIkInfluencePct}%)` : 'Off'}
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
                                <div className="mt-1.5 border border-white/10 rounded p-2 space-y-1.5">
                                  <div className="flex items-center justify-between text-[10px] tracking-[0.05em] uppercase text-zinc-400">
                                    <span>IK Tween</span>
                                    <button
                                      type="button"
                                      onClick={() => onPatchSegmentIkTween?.(
                                        frame,
                                        nextKeyframe as number,
                                        { enabled: !segmentIkTweenSettings.enabled }
                                      )}
                                      disabled={animationControlDisabled || !onPatchSegmentIkTween}
                                      className="min-h-7 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                                      title="Enable or disable IK-influenced tween preview for this segment"
                                    >
                                      {segmentIkTweenSettings.enabled ? 'On' : 'Off'}
                                    </button>
                                  </div>
                                  {segmentIkTweenSettings.enabled ? (
                                    <>
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between text-[10px] text-zinc-400 tracking-[0.05em] uppercase">
                                          <span>Influence</span>
                                          <span>{segmentIkInfluencePct}%</span>
                                        </div>
                                        <input
                                          type="range"
                                          min={0}
                                          max={1}
                                          step={0.05}
                                          value={segmentIkTweenSettings.influence}
                                          disabled={animationControlDisabled || !onPatchSegmentIkTween}
                                          onChange={(event) => {
                                            const next = Number(event.target.value);
                                            if (!Number.isFinite(next)) return;
                                            onPatchSegmentIkTween?.(
                                              frame,
                                              nextKeyframe as number,
                                              { influence: clamp(next, 0, 1) }
                                            );
                                          }}
                                          className="w-full accent-emerald-400 disabled:opacity-45 disabled:cursor-not-allowed"
                                        />
                                      </div>
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <label className="text-[10px] text-zinc-400 tracking-[0.05em] uppercase flex flex-col gap-1">
                                          Solver
                                          <select
                                            value={segmentIkTweenSettings.solver}
                                            disabled={animationControlDisabled || !onPatchSegmentIkTween}
                                            onChange={(event) => onPatchSegmentIkTween?.(
                                              frame,
                                              nextKeyframe as number,
                                              { solver: event.target.value as SegmentIkTweenSettings['solver'] }
                                            )}
                                            className="min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 disabled:opacity-45 disabled:cursor-not-allowed"
                                          >
                                            <option value="fabrik">FABRIK</option>
                                            <option value="ccd">CCD</option>
                                            <option value="hybrid">Hybrid</option>
                                          </select>
                                        </label>
                                        <label className="text-[10px] text-zinc-400 tracking-[0.05em] uppercase flex flex-col gap-1">
                                          Scope
                                          <select
                                            value={segmentIkTweenSettings.solveMode}
                                            disabled={animationControlDisabled || !onPatchSegmentIkTween}
                                            onChange={(event) => onPatchSegmentIkTween?.(
                                              frame,
                                              nextKeyframe as number,
                                              { solveMode: event.target.value as SegmentIkTweenSettings['solveMode'] }
                                            )}
                                            className="min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 disabled:opacity-45 disabled:cursor-not-allowed"
                                          >
                                            <option value="single_chain">Single Chain</option>
                                            <option value="limbs_only">Limbs Only</option>
                                            <option value="whole_body_graph">Whole Body</option>
                                          </select>
                                        </label>
                                      </div>
                                      <div className="grid grid-cols-3 gap-1.5">
                                        {[
                                          { key: 'includeHands' as const, label: 'Hands' },
                                          { key: 'includeFeet' as const, label: 'Feet' },
                                          { key: 'includeHead' as const, label: 'Head' },
                                        ].map((option) => (
                                          <button
                                            key={option.key}
                                            type="button"
                                            onClick={() => onPatchSegmentIkTween?.(
                                              frame,
                                              nextKeyframe as number,
                                              { [option.key]: !segmentIkTweenSettings[option.key] }
                                            )}
                                            disabled={animationControlDisabled || !onPatchSegmentIkTween}
                                            className="min-h-8 px-2 py-1 text-[10px] border rounded transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                                            style={{
                                              borderColor: segmentIkTweenSettings[option.key] ? 'rgba(74, 222, 128, 0.62)' : 'rgba(255, 255, 255, 0.15)',
                                              background: segmentIkTweenSettings[option.key] ? 'rgba(16, 88, 56, 0.34)' : 'transparent',
                                              color: segmentIkTweenSettings[option.key] ? 'rgba(236, 253, 245, 0.95)' : 'rgba(212, 212, 216, 0.92)',
                                            }}
                                          >
                                            {option.label}
                                          </button>
                                        ))}
                                      </div>
                                      <div className="grid grid-cols-3 gap-1.5">
                                        {[
                                          { key: 'naturalBendEnabled' as const, label: 'Natural Bend' },
                                          { key: 'softReachEnabled' as const, label: 'Soft Reach' },
                                          { key: 'enforceJointLimits' as const, label: 'Joint Limits' },
                                        ].map((option) => (
                                          <button
                                            key={option.key}
                                            type="button"
                                            onClick={() => onPatchSegmentIkTween?.(
                                              frame,
                                              nextKeyframe as number,
                                              { [option.key]: !segmentIkTweenSettings[option.key] }
                                            )}
                                            disabled={animationControlDisabled || !onPatchSegmentIkTween}
                                            className="min-h-8 px-2 py-1 text-[10px] border rounded transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                                            style={{
                                              borderColor: segmentIkTweenSettings[option.key] ? 'rgba(74, 222, 128, 0.62)' : 'rgba(255, 255, 255, 0.15)',
                                              background: segmentIkTweenSettings[option.key] ? 'rgba(16, 88, 56, 0.34)' : 'transparent',
                                              color: segmentIkTweenSettings[option.key] ? 'rgba(236, 253, 245, 0.95)' : 'rgba(212, 212, 216, 0.92)',
                                            }}
                                          >
                                            {option.label}
                                          </button>
                                        ))}
                                      </div>
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between text-[10px] text-zinc-400 tracking-[0.05em] uppercase">
                                          <span>Damping</span>
                                          <span>{segmentIkTweenSettings.damping.toFixed(2)}</span>
                                        </div>
                                        <input
                                          type="range"
                                          min={0}
                                          max={0.35}
                                          step={0.01}
                                          value={segmentIkTweenSettings.damping}
                                          disabled={animationControlDisabled || !onPatchSegmentIkTween}
                                          onChange={(event) => {
                                            const next = Number(event.target.value);
                                            if (!Number.isFinite(next)) return;
                                            onPatchSegmentIkTween?.(
                                              frame,
                                              nextKeyframe as number,
                                              { damping: clamp(next, 0, 0.35) }
                                            );
                                          }}
                                          className="w-full accent-emerald-400 disabled:opacity-45 disabled:cursor-not-allowed"
                                        />
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => onPatchSegmentIkTween?.(frame, nextKeyframe as number, null)}
                                        disabled={animationControlDisabled || !onPatchSegmentIkTween}
                                        className="w-full min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                                        title="Remove this segment override and revert to default IK tween off"
                                      >
                                        Reset IK Tween
                                      </button>
                                    </>
                                  ) : null}
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
                  <div className="flex overflow-hidden rounded border border-white/10 bg-zinc-950">
                    {timelineFunctionPresets.map((preset, index) => {
                      const active = preset.id === activeTimelineFunctionId;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => onEasingChange?.(preset.easing)}
                          disabled={animationControlDisabled || !onEasingChange}
                          className={`flex-1 min-h-8 px-2 py-1 text-[10px] transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                            index < timelineFunctionPresets.length - 1 ? 'border-r border-white/10' : ''
                          }`}
                          style={{
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

      {gridOnlyMode && activeMaskEditorJointId !== null ? (
        <div
          className="absolute pointer-events-auto"
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
              background: CONSOLE_PANEL_BACKGROUND,
              borderColor: 'rgba(158, 150, 184, 0.5)',
            }}
          >
            <div className="px-3 py-2.5 border-b border-violet-200/20 flex items-center justify-between gap-1.5">
              <span className="text-[10px] tracking-[0.16em] uppercase text-violet-100/90 font-semibold">Mask Editor</span>
              <button
                type="button"
                onClick={() => setActiveMaskEditorJointId(null)}
                className="min-h-7 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-100 hover:bg-white/10 transition-colors"
                title="Return to animation console"
              >
                Back To Timeline
              </button>
            </div>

            <div className="px-2.5 py-2.5 flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-2.5">
              <div className="space-y-1.5 border border-white/10 rounded p-2">
                <div className="flex items-center justify-between text-[10px] tracking-[0.05em] uppercase text-zinc-300">
                  <span>{activeMaskEditorJointLabel}</span>
                  <span className="text-zinc-500">{activeMaskEditorLayer.src ? 'Loaded' : 'Empty'}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => openBodyPartMaskUpload(activeMaskEditorJointId, true)}
                    disabled={!onUploadBodyPartMaskLayer}
                    className="min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    {activeMaskEditorLayer.src ? 'Replace Mask' : 'Upload Mask'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClearBodyPartMaskLayer?.(activeMaskEditorJointId);
                    }}
                    disabled={!onClearBodyPartMaskLayer || !activeMaskEditorLayer.src}
                    className="min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    Clear Mask
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => patchActiveMaskEditor({
                    ...DEFAULT_BODY_PART_MASK_LAYER,
                    src: activeMaskEditorLayer.src,
                    visible: activeMaskEditorLayer.src ? true : activeMaskEditorLayer.visible,
                  })}
                  disabled={!onPatchBodyPartMaskLayer}
                  className="w-full min-h-8 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  Reset Transform
                </button>
              </div>

              <label className="flex items-center justify-between text-[10px] tracking-[0.05em] uppercase text-zinc-300 border border-white/10 rounded p-2">
                <span>Visible</span>
                <input
                  type="checkbox"
                  checked={activeMaskEditorLayer.visible}
                  disabled={!activeMaskEditorLayer.src || !onPatchBodyPartMaskLayer}
                  onChange={(event) => patchActiveMaskEditor({ visible: event.target.checked })}
                  className="h-3.5 w-3.5 accent-violet-400 disabled:opacity-45"
                />
              </label>

              <div className="space-y-1.5 border border-white/10 rounded p-2">
                <label className="block space-y-1">
                  <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Mode</span>
                  <select
                    value={activeMaskMode}
                    disabled={!onPatchBodyPartMaskLayer}
                    onChange={(event) =>
                      patchActiveMaskEditor({
                        mode: event.target.value as NonNullable<BodyPartMaskLayer['mode']>,
                      })
                    }
                    className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    {BODY_PART_MASK_MODE_OPTIONS.map((option) => (
                      <option key={`editor-mask-mode-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Blend</span>
                  <select
                    value={activeMaskBlendMode}
                    disabled={!onPatchBodyPartMaskLayer}
                    onChange={(event) => patchActiveMaskEditor({ blendMode: event.target.value as GlobalCompositeOperation })}
                    className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    {FOREGROUND_BLEND_OPTIONS.map((option) => (
                      <option key={`editor-mask-blend-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Filter Preset</span>
                  <select
                    value={BODY_PART_MASK_FILTER_OPTIONS.some((option) => option.value === activeMaskFilter) ? activeMaskFilter : 'none'}
                    disabled={!onPatchBodyPartMaskLayer}
                    onChange={(event) => patchActiveMaskEditor({ filter: event.target.value })}
                    className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    {BODY_PART_MASK_FILTER_OPTIONS.map((option) => (
                      <option key={`editor-mask-filter-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Filter (Custom)</span>
                  <input
                    type="text"
                    value={activeMaskFilter}
                    disabled={!onPatchBodyPartMaskLayer}
                    onChange={(event) => patchActiveMaskEditor({ filter: event.target.value || 'none' })}
                    className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
                    placeholder="none"
                  />
                </label>
              </div>

	              <div className="grid grid-cols-2 gap-1.5 border border-white/10 rounded p-2">
	                <label className="space-y-1">
	                  <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Opacity</span>
	                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={activeMaskOpacityPercent}
                    disabled={!onPatchBodyPartMaskLayer}
                    onChange={(event) => patchActiveMaskEditor({ opacity: clamp(Number(event.target.value), 0, 100) / 100 })}
                    className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
                  />
                </label>
	                <label className="space-y-1">
	                  <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Scale</span>
	                  <input
	                    type="number"
	                    min={BODY_PART_MASK_SCALE_MIN}
	                    max={400}
	                    value={activeMaskScalePercent}
	                    disabled={!onPatchBodyPartMaskLayer}
	                    onChange={(event) => patchActiveMaskEditor({
	                      scale: clamp(Number(event.target.value), BODY_PART_MASK_SCALE_MIN, 400),
	                    })}
	                    className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
	                  />
	                </label>
                <label className="space-y-1">
                  <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Rotate</span>
                  <input
                    type="number"
                    min={-360}
                    max={360}
                    value={activeMaskRotation}
                    disabled={!onPatchBodyPartMaskLayer}
	                    onChange={(event) => patchActiveMaskEditor({ rotationDeg: clamp(Number(event.target.value), -360, 360) })}
	                    className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
	                  />
	                </label>
	                <div className="col-span-2 grid grid-cols-2 gap-1.5">
	                  <div className="space-y-1.5">
	                    <label className="space-y-1">
	                      <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Skew X</span>
	                      <input
	                        type="number"
	                        min={-80}
	                        max={80}
	                        value={activeMaskSkewX}
	                        disabled={!onPatchBodyPartMaskLayer}
	                        onChange={(event) => patchActiveMaskEditor({ skewXDeg: clamp(Number(event.target.value), -80, 80) })}
	                        className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
	                      />
	                    </label>
	                    <label className="space-y-1">
	                      <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Offset X</span>
	                      <input
	                        type="number"
	                        min={-300}
	                        max={300}
	                        value={activeMaskOffsetX}
	                        disabled={!onPatchBodyPartMaskLayer}
	                        onChange={(event) => patchActiveMaskEditor({ offsetX: clamp(Number(event.target.value), -300, 300) })}
	                        className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
	                      />
	                    </label>
	                  </div>
	                  <div className="space-y-1.5">
	                    <label className="space-y-1">
	                      <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Skew Y</span>
	                      <input
	                        type="number"
	                        min={-80}
	                        max={80}
	                        value={activeMaskSkewY}
	                        disabled={!onPatchBodyPartMaskLayer}
	                        onChange={(event) => patchActiveMaskEditor({ skewYDeg: clamp(Number(event.target.value), -80, 80) })}
	                        className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
	                      />
	                    </label>
	                    <label className="space-y-1">
	                      <span className="text-[9px] tracking-[0.05em] uppercase text-zinc-400">Offset Y</span>
	                      <input
	                        type="number"
	                        min={-300}
	                        max={300}
	                        value={activeMaskOffsetY}
	                        disabled={!onPatchBodyPartMaskLayer}
	                        onChange={(event) => patchActiveMaskEditor({ offsetY: clamp(Number(event.target.value), -300, 300) })}
	                        className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed"
	                      />
	                    </label>
	                  </div>
	                </div>
	              </div>
            </div>
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

      {gridOnlyMode && (onMovementTogglesChange || onInteractionModeChange || onToggleLotteMode || onUndo || onRedo || onReturnDefaultPose) ? (
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

            {interactionMode === "FK" && onMovementTogglesChange ? (
              <button
                type="button"
                onClick={() => setShowIkAdvancedControls((prev) => !prev)}
                className="min-h-9 px-3 py-2 text-[11px] tracking-[0.1em] font-semibold uppercase rounded transition-colors"
                style={{
                  background: showIkAdvancedControls
                    ? 'rgba(16, 88, 56, 0.34)'
                    : 'rgba(88, 82, 108, 0.28)',
                  border: showIkAdvancedControls
                    ? '1px solid rgba(74, 222, 128, 0.62)'
                    : '1px solid rgba(158, 150, 184, 0.62)',
                  color: 'rgba(232, 228, 243, 0.95)',
                }}
                title="Toggle joint tinker mode for click and drag joint manipulation"
              >
                Joint Tinker {showIkAdvancedControls ? 'On' : 'Off'}
              </button>
            ) : null}

            {showIkAdvancedControls && onReturnDefaultPose ? (
              <button
                type="button"
                onClick={resetJointTinkerState}
                className="min-h-9 px-3 py-2 text-[11px] tracking-[0.1em] font-semibold uppercase rounded transition-colors"
                style={{
                  background: 'rgba(220, 38, 38, 0.34)',
                  border: '1px solid rgba(248, 113, 113, 0.62)',
                  color: 'rgba(254, 226, 226, 0.95)',
                }}
                title="Reset joint tinker and restore default pose"
              >
                Reset Tinker
              </button>
            ) : null}

            {onUndo ? (
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className="min-h-9 px-3 py-2 text-[11px] tracking-[0.1em] font-semibold uppercase rounded transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                style={{
                  background: canUndo ? 'rgba(16, 88, 56, 0.34)' : 'rgba(88, 82, 108, 0.2)',
                  border: canUndo ? '1px solid rgba(74, 222, 128, 0.62)' : '1px solid rgba(158, 150, 184, 0.4)',
                  color: canUndo ? 'rgba(232, 245, 236, 0.95)' : 'rgba(170, 168, 181, 0.85)',
                }}
                title="Undo pose and timeline edits"
              >
                Undo
              </button>
            ) : null}

            {onRedo ? (
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                className="min-h-9 px-3 py-2 text-[11px] tracking-[0.1em] font-semibold uppercase rounded transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                style={{
                  background: canRedo ? 'rgba(16, 88, 56, 0.34)' : 'rgba(88, 82, 108, 0.2)',
                  border: canRedo ? '1px solid rgba(74, 222, 128, 0.62)' : '1px solid rgba(158, 150, 184, 0.4)',
                  color: canRedo ? 'rgba(232, 245, 236, 0.95)' : 'rgba(170, 168, 181, 0.85)',
                }}
                title="Redo pose and timeline edits"
              >
                Redo
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

            <button
              type="button"
              onClick={() =>
                setBodyMasksEnabled((prev) => {
                  const next = !prev;
                  if (!next) {
                    setActiveMaskEditorJointId(null);
                  }
                  return next;
                })
              }
              className="min-h-9 px-3 py-2 text-[11px] tracking-[0.1em] font-semibold uppercase rounded transition-colors"
              style={{
                background: bodyMasksEnabled ? 'rgba(16, 88, 56, 0.34)' : 'rgba(88, 82, 108, 0.28)',
                border: bodyMasksEnabled ? '1px solid rgba(74, 222, 128, 0.62)' : '1px solid rgba(158, 150, 184, 0.62)',
                color: 'rgba(232, 228, 243, 0.95)',
              }}
              title={`Toggle body-part masks (${loadedBodyMaskCount} loaded)`}
            >
              Masks {bodyMasksEnabled ? 'On' : 'Off'}
            </button>

          </div>

          {onReturnDefaultPose ? (
            <button
              type="button"
              onClick={onReturnDefaultPose}
              className="absolute h-9 pl-1.5 pr-2.5 border rounded flex items-center gap-2 transition-colors hover:bg-white/10"
              style={{
                top: `${gridRefineTop}px`,
                right: `${rightRailOffset}px`,
                zIndex: 73,
                background: CONSOLE_PANEL_BACKGROUND,
                borderColor: 'rgba(158, 150, 184, 0.62)',
                color: 'rgba(232, 228, 243, 0.96)',
              }}
              title="Return to default pose"
            >
              <svg viewBox="0 0 100 100" className="w-7 h-7 rounded bg-zinc-950/45 p-[1px]">
                <path d={defaultPoseThumb.path} stroke="rgba(226, 232, 240, 0.92)" strokeWidth="3.2" fill="none" strokeLinecap="round" />
                {defaultPoseThumb.joints.map((jointPoint, jointIndex) => (
                  <circle
                    key={`default-joint-${jointIndex}`}
                    cx={isNaN(jointPoint.x) ? 50 : jointPoint.x}
                    cy={isNaN(jointPoint.y) ? 50 : jointPoint.y}
                    r="1.7"
                    fill="rgba(196, 181, 253, 0.95)"
                  />
                ))}
              </svg>
              <span className="text-[10px] tracking-[0.08em] uppercase font-semibold">Default</span>
            </button>
          ) : null}

          {poseLibraryFrame !== null && onApplyPoseToFrame ? (
            <div
              className="absolute border rounded shadow-xl backdrop-blur-sm flex flex-col"
              style={{
                top: `${gridRefineTop + 44}px`,
                right: `${rightRailOffset}px`,
                zIndex: 74,
                width: '268px',
                maxHeight: `${Math.max(220, height - (gridRefineTop + 96))}px`,
                background: CONSOLE_PANEL_BACKGROUND,
                borderColor: 'rgba(158, 150, 184, 0.5)',
              }}
            >
              <div className="px-3 py-2 border-b border-violet-200/20 flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-[10px] tracking-[0.16em] uppercase text-violet-100/90 font-semibold">Pose Library</span>
                  <span className="text-[10px] text-zinc-400">Frame {poseLibraryDisplayFrame}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPoseLibraryFrame(null);
                    setPoseLibrarySearch('');
                  }}
                  className="min-h-7 px-2 py-1 text-[10px] border border-white/15 rounded text-zinc-200 hover:bg-white/10 transition-colors"
                  title="Close pose library"
                >
                  Close
                </button>
              </div>

              <div className="px-2.5 pt-2.5 pb-2 border-b border-white/10">
                <input
                  type="text"
                  value={poseLibrarySearch}
                  onChange={(event) => setPoseLibrarySearch(event.target.value)}
                  placeholder="Search poses..."
                  className="w-full min-h-8 bg-zinc-950/75 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-500"
                />
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2.5 py-2.5 space-y-1.5">
                {filteredPoseLibraryNames.length ? (
                  filteredPoseLibraryNames.map((poseName) => (
                    <button
                      key={`pose-library-${poseName}`}
                      type="button"
                      onClick={() => handleApplyPoseFromLibrary(poseName)}
                      className="w-full min-h-8 px-2.5 py-1.5 text-left border rounded transition-colors flex items-center justify-between gap-2 hover:bg-white/10"
                      style={{
                        borderColor: 'rgba(255, 255, 255, 0.12)',
                        color: 'rgba(228, 228, 235, 0.94)',
                        background: 'rgba(33, 37, 52, 0.38)',
                      }}
                      title={`Apply ${poseName} to frame ${poseLibraryDisplayFrame}`}
                    >
                      <span className="text-[11px] tracking-[0.04em]">{poseName}</span>
                      <span className="text-[10px] tracking-[0.06em] uppercase text-zinc-400">Apply</span>
                    </button>
                  ))
                ) : (
                  <div className="px-1 py-2 text-[10px] tracking-[0.04em] text-zinc-400">
                    No poses match “{poseLibrarySearch.trim()}”.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {showRefineMenu && onMovementTogglesChange ? (
            <div
              className="absolute border rounded shadow-xl backdrop-blur-sm"
              style={{
                top: `${gridRefineTop + 34}px`,
                left: `${UI_INSET}px`,
                zIndex: 73,
                width: '320px',
                background: CONSOLE_PANEL_BACKGROUND,
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
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onMovementTogglesChange({
                            ...(movementToggles || {}),
                            fkBendEnabled: !fkBendEnabled,
                          })
                        }
                        className={`min-h-8 px-2.5 py-1.5 text-[10px] tracking-[0.06em] uppercase border rounded transition-colors ${
                          fkBendEnabled
                            ? 'text-emerald-100 border-emerald-300/70 bg-emerald-500/20'
                            : 'text-zinc-400 border-white/10 hover:bg-white/10'
                        }`}
                        title="Enable FK bend propagation logic"
                      >
                        Bend {fkBendEnabled ? 'On' : 'Off'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onMovementTogglesChange({
                            ...(movementToggles || {}),
                            fkStretchEnabled: !fkStretchEnabled,
                          })
                        }
                        className={`min-h-8 px-2.5 py-1.5 text-[10px] tracking-[0.06em] uppercase border rounded transition-colors ${
                          fkStretchEnabled
                            ? 'text-emerald-100 border-emerald-300/70 bg-emerald-500/20'
                            : 'text-zinc-400 border-white/10 hover:bg-white/10'
                        }`}
                        title="Enable FK stretch propagation logic"
                      >
                        Stretch {fkStretchEnabled ? 'On' : 'Off'}
                      </button>
                    </div>
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
                  {(refinePanelMode === 'advanced' || true) ? (
                    <div className="max-h-72 overflow-y-auto custom-scrollbar pr-1 space-y-1">
                      {bitruviusData.HIERARCHY.map(([jointId]) => {
                        const label = bitruviusData.JOINT_DEFS[jointId]?.label ?? jointId;
                        const min = -180;
                        const max = 180;
                        const value = normA(rotationsRef.current[jointId] ?? currentRotations[jointId] ?? 0);
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
                      Per-joint rotation sliders available for fine control.
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
                  {(refinePanelMode === 'advanced' || true) ? (
                    <>
                      {ikProfile === 'human' ? (
                        <>
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
                        <div className="px-1 pb-2 mb-2 border-b border-white/10">
                          <div className="text-[10px] tracking-[0.08em] uppercase text-zinc-200 mb-1">Gravity Hold</div>
                          {[
                            { key: 'ikGravityArmHoldEnabled' as const, label: 'Arm Hold' },
                            { key: 'ikGravityLegHoldEnabled' as const, label: 'Leg Hold' },
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
                        </>
                      ) : null}
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
              {posingConsoleMinimized && (
                <div className="px-2.5 py-2.5 flex-1 flex items-center justify-center text-[10px] text-zinc-400 tracking-[0.05em] uppercase">
                  Posing controls hidden. Toggle Controls to show.
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
});

CanvasGrid.displayName = 'CanvasGrid';

export default CanvasGrid;
