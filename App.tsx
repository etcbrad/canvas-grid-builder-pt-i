import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { bitruviusData as modelData } from './modelData';
import { SkeletonRotations } from './modelData';
import CanvasGrid, { MovementToggles } from './components/CanvasGrid';
import CoreModuleGrid, {
  CoreModuleDefinition,
  CoreModuleId,
  CoreModuleState,
  ModuleFriction,
} from './components/CoreModuleGrid';
import TimelineStrip from './components/TimelineStrip';
import OnionSkinControls from './components/OnionSkinControls';
import { AnimationClip } from 'pose-to-pose-engine';
import type { PoseKeyframe } from 'pose-to-pose-engine/types';
import { createInterpolator } from './adapters/poseInterpolator';
import * as easings from './easing';
import type { EasingFn } from './easing';
import type { BodyPartMaskLayer, ImageLayerState, VisualModuleState } from './renderer';
import { computeWorldPoseForSkeleton } from './fkEngine';
import {
  DEFAULT_SEGMENT_IK_TWEEN_SETTINGS,
  normalizeSegmentIkTweenSettings,
  pruneSegmentIkTweenMap,
  sampleIkTweenPreviewPose,
  segmentKey as ikSegmentKey,
  type SegmentIkTweenMap,
  type SegmentIkTweenSettings,
} from './animationIkTween';

const DEFAULT_ONION = { past: 2, future: 2, enabled: false };
const VISUAL_MODULES_DEFAULT: VisualModuleState = {
  background: true,
  headGrid: true,
  fingerGrid: true,
  rings: true,
};
const DEFAULT_BACKGROUND_IMAGE_LAYER: ImageLayerState = {
  src: null,
  visible: true,
  opacity: 1,
  x: 50,
  y: 50,
  scale: 100,
  fitMode: 'free',
  blendMode: 'source-over',
};
const DEFAULT_FOREGROUND_IMAGE_LAYER: ImageLayerState = {
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
const CORE_MODULE_DEFINITIONS: CoreModuleDefinition[] = [
  {
    id: 'core_math',
    title: 'Core Math',
    group: 'core',
    description: 'Deterministic angle/vector math and normalization.',
    dependsOn: [],
    frictionNote: 'Keep always on to avoid drift and unstable interpolation.',
  },
  {
    id: 'state_engine',
    title: 'State Engine',
    group: 'core',
    description: 'Canonical pose state and update pipeline.',
    dependsOn: ['core_math'],
    frictionNote: 'Disabling this disables all runtime editing and playback sync.',
  },
  {
    id: 'fk_engine',
    title: 'FK Engine',
    group: 'motion',
    description: 'FK360 default and constrained FK profile support.',
    dependsOn: ['state_engine'],
    frictionNote: 'If off, FK edits and FK mirror quality drop out.',
  },
  {
    id: 'ik_engine',
    title: 'IK Engine',
    group: 'motion',
    description: 'Rigid IK solver pipeline and target solving.',
    dependsOn: ['state_engine'],
    frictionNote: 'If off, app forces FK mode to prevent dead IK targets.',
  },
  {
    id: 'constraint_bridge',
    title: 'Constraint Bridge',
    group: 'motion',
    description: 'FK/IK handshake, pins, and grounded reach clamping.',
    dependsOn: ['fk_engine', 'ik_engine'],
    frictionNote: 'Keep on for no-snap FK↔IK transitions and stable pins.',
  },
  {
    id: 'interaction_engine',
    title: 'Interaction Engine',
    group: 'interaction',
    description: 'Joint drag/select and viewport gesture handling.',
    dependsOn: ['constraint_bridge'],
    frictionNote: 'If off, editing is locked to protect animation state.',
  },
  {
    id: 'animation_engine',
    title: 'Animation Engine',
    group: 'animation',
    description: 'Timeline, keyframes, playback, and easing runtime.',
    dependsOn: ['state_engine'],
    frictionNote: 'Disabling auto-pauses playback and blocks timeline writes.',
  },
  {
    id: 'onion_skin',
    title: 'Onion Skin',
    group: 'animation',
    description: 'Past/future frame ghost rendering controls.',
    dependsOn: ['animation_engine'],
    frictionNote: 'If disabled, onion view auto-turns off to keep frame clarity.',
  },
  {
    id: 'overlay_engine',
    title: 'Overlay Engine',
    group: 'io',
    description: 'Visual overlay composition layer integration.',
    dependsOn: ['state_engine'],
    frictionNote: 'Disable when debugging pure motion to reduce visual noise.',
  },
  {
    id: 'transfer_engine',
    title: 'Transfer Engine',
    group: 'io',
    description: 'Backcompat import/export and autosave compatibility.',
    dependsOn: ['state_engine'],
    frictionNote: 'If off, warn users that session changes are transient.',
  },
];

const MODULE_BY_ID: Record<CoreModuleId, CoreModuleDefinition> = CORE_MODULE_DEFINITIONS.reduce(
  (acc, definition) => {
    acc[definition.id] = definition;
    return acc;
  },
  {} as Record<CoreModuleId, CoreModuleDefinition>
);

const MODULE_DEPENDENTS: Record<CoreModuleId, CoreModuleId[]> = (() => {
  const map = {} as Record<CoreModuleId, CoreModuleId[]>;
  for (const definition of CORE_MODULE_DEFINITIONS) {
    map[definition.id] = [];
  }
  for (const definition of CORE_MODULE_DEFINITIONS) {
    for (const dependencyId of definition.dependsOn) {
      map[dependencyId].push(definition.id);
    }
  }
  return map;
})();

const DEFAULT_CORE_MODULE_STATE: CoreModuleState = {
  core_math: true,
  state_engine: true,
  fk_engine: true,
  ik_engine: true,
  constraint_bridge: true,
  interaction_engine: true,
  animation_engine: true,
  onion_skin: true,
  overlay_engine: true,
  transfer_engine: true,
};

const DEFAULT_POSE_KEYFRAME_ID = 'frame-0';
const HISTORY_STACK_LIMIT = 120;

interface TimelineHistorySnapshot {
  keyframes: PoseKeyframe<SkeletonRotations>[];
  frameCount: number;
  currentFrame: number;
  rotations: SkeletonRotations;
  interpolationFramesBySegment: Record<string, number>;
  segmentIkTweenMap: SegmentIkTweenMap;
  easing: keyof typeof easings;
  fps: number;
  masterPin: [number, number];
  bodyRot: number;
}

const clampFrameCount = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.round(value));
};

const keyframeIdFromFrame = (frame: number): string => `frame-${frame}`;

const clonePoseKeyframes = (
  keyframes: PoseKeyframe<SkeletonRotations>[]
): PoseKeyframe<SkeletonRotations>[] => keyframes
  .map((keyframe) => ({
    ...keyframe,
    pose: { ...keyframe.pose },
    frame: typeof keyframe.frame === 'number' ? Math.round(keyframe.frame) : keyframe.frame,
  }))
  .sort((a, b) => Math.round((a.frame ?? 0) as number) - Math.round((b.frame ?? 0) as number));

const remapSegmentInterpolationForShift = (
  interpolation: Record<string, number>,
  pivotFrame: number,
  deltaFrames: number
): Record<string, number> => {
  if (!deltaFrames) {
    return interpolation;
  }

  const next: Record<string, number> = {};
  Object.entries(interpolation).forEach(([segmentKey, duration]) => {
    const [fromRaw, toRaw] = segmentKey.split('->').map((value) => Number(value));
    if (!Number.isFinite(fromRaw) || !Number.isFinite(toRaw)) {
      return;
    }
    const shiftedFrom = fromRaw >= pivotFrame ? fromRaw + deltaFrames : fromRaw;
    const shiftedTo = toRaw >= pivotFrame ? toRaw + deltaFrames : toRaw;
    if (shiftedTo <= shiftedFrom) {
      return;
    }
    const span = Math.max(1, shiftedTo - shiftedFrom);
    next[`${shiftedFrom}->${shiftedTo}`] = Math.min(span, Math.max(1, Math.round(duration)));
  });
  return next;
};

const cloneSegmentIkTweenMap = (map: SegmentIkTweenMap): SegmentIkTweenMap => {
  const clone: SegmentIkTweenMap = {};
  Object.entries(map).forEach(([segment, settings]) => {
    clone[segment] = normalizeSegmentIkTweenSettings(settings);
  });
  return clone;
};

const normalizePoseKeyframes = (
  keyframes: PoseKeyframe<SkeletonRotations>[],
  frameCount: number
): PoseKeyframe<SkeletonRotations>[] => {
  const normalizedByFrame = new Map<number, PoseKeyframe<SkeletonRotations>>();
  for (const keyframe of keyframes) {
    if (typeof keyframe.frame !== 'number') {
      continue;
    }
    const frame = Math.round(keyframe.frame);
    if (frame < 0 || frame >= frameCount) {
      continue;
    }
    normalizedByFrame.set(frame, {
      id: keyframeIdFromFrame(frame),
      frame,
      pose: keyframe.pose,
    });
  }

  if (!normalizedByFrame.has(0)) {
    normalizedByFrame.set(0, {
      id: DEFAULT_POSE_KEYFRAME_ID,
      frame: 0,
      pose: modelData.POSES["T-Pose"],
    });
  }

  return Array.from(normalizedByFrame.values()).sort((a, b) => (a.frame ?? 0) - (b.frame ?? 0));
};

const createAnimationClip = (
  keyframes: PoseKeyframe<SkeletonRotations>[],
  frameCount: number,
  easingFn: EasingFn,
  interpolationFramesBySegment: Record<string, number> = {}
): AnimationClip<SkeletonRotations> => {
  const safeFrameCount = clampFrameCount(frameCount);
  const normalizedKeyframes = normalizePoseKeyframes(keyframes, safeFrameCount);
  const transitions: Record<string, { durationFrames: number }> = {};
  normalizedKeyframes.forEach((from, index) => {
    const to = normalizedKeyframes[index + 1];
    if (!to || typeof from.frame !== 'number' || typeof to.frame !== 'number') return;
    const fromFrame = Math.round(from.frame);
    const toFrame = Math.round(to.frame);
    const key = `${fromFrame}->${toFrame}`;
    const spanFrames = Math.max(1, toFrame - fromFrame);
    const customDuration = interpolationFramesBySegment[key];
    if (!Number.isFinite(customDuration) || customDuration <= 0) return;
    transitions[`${from.id}->${to.id}`] = {
      durationFrames: Math.min(spanFrames, Math.max(1, Math.round(customDuration))),
    };
  });
  return new AnimationClip<SkeletonRotations>({
    keyframes: normalizedKeyframes,
    frameCount: safeFrameCount,
    loop: true,
    interpolatePose: createInterpolator(easingFn),
    transitions,
  });
};

const enableModuleWithDependencies = (
  draft: CoreModuleState,
  moduleId: CoreModuleId,
  enabled: Set<CoreModuleId>
): void => {
  if (draft[moduleId]) {
    return;
  }
  for (const dependencyId of MODULE_BY_ID[moduleId].dependsOn) {
    enableModuleWithDependencies(draft, dependencyId, enabled);
  }
  draft[moduleId] = true;
  enabled.add(moduleId);
};

const disableModuleWithDependents = (
  draft: CoreModuleState,
  moduleId: CoreModuleId,
  disabled: Set<CoreModuleId>
): void => {
  if (!draft[moduleId]) {
    return;
  }
  draft[moduleId] = false;
  disabled.add(moduleId);
  for (const dependentId of MODULE_DEPENDENTS[moduleId]) {
    disableModuleWithDependents(draft, dependentId, disabled);
  }
};

const revokeLayerObjectUrl = (url: string | null | undefined): void => {
  if (!url || !url.startsWith('blob:')) {
    return;
  }
  URL.revokeObjectURL(url);
};

const App: React.FC = () => {
  const [frameCount, setFrameCount] = useState(1);
  const [easing, setEasing] = useState<keyof typeof easings>('linear');
  const [interpolationFramesBySegment, setInterpolationFramesBySegment] = useState<Record<string, number>>({});
  const [segmentIkTweenMap, setSegmentIkTweenMap] = useState<SegmentIkTweenMap>({});
  const clipRef = useRef<AnimationClip<SkeletonRotations>>(
    createAnimationClip(
      [{ id: DEFAULT_POSE_KEYFRAME_ID, frame: 0, pose: modelData.POSES["T-Pose"] }],
      frameCount,
      easings[easing],
      interpolationFramesBySegment
    )
  );

  const [rotations, setRotations] = useState<SkeletonRotations>(modelData.POSES["T-Pose"]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [onionSkinConfig, setOnionSkinConfig] = useState(DEFAULT_ONION);
  const [keyframesVersion, setKeyframesVersion] = useState(0);
  const [mocapMode, setMocapMode] = useState(false);
  const [safeSwitch, setSafeSwitch] = useState(false);
  const [silhouetteMode, setSilhouetteMode] = useState(true);
  const [lotteMode, setLotteMode] = useState(false);
  const [masterPin, setMasterPin] = useState<[number, number]>([0, 0]);
  const [bodyRot, setBodyRot] = useState(0);
  const [interactionMode, setInteractionMode] = useState<"FK" | "IK">("FK");
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [movementToggles, setMovementToggles] = useState<MovementToggles>({
    stretchEnabled: false,
    softReachEnabled: false,
    naturalBendEnabled: true,
    fk360Enabled: true,
    fkConstraintsEnabled: false,
    fkBendEnabled: false,
    fkStretchEnabled: false,
    handshakeEnabled: true,
    fkRotationSensitivity: 1,
    fkRotationResponse: 1,
    rootX: 0,
    rootY: 0,
    rootRotate: 0,
    rootGroundLockEnabled: false,
    rootXControlEnabled: false,
    rootYControlEnabled: false,
    rootRotateControlEnabled: false,
    ikProfile: "base",
    ikSolver: "fabrik",
    ikSolveMode: "single_chain",
    legIntentMode: "none",
    humanCounterbalanceEnabled: true,
    humanMirrorEnabled: true,
    humanFollowThroughEnabled: true,
    humanCollarNeckFollowEnabled: true,
    postureState: "stand",
    postureRoll: 0,
    poseDirection: "front",
    weightShiftLateral: 0,
    weightShiftDepth: 0,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(24);
  const gridViewMode = true;
  const animationFrameRef = useRef<number>();
  const playbackClockRef = useRef<{
    startTimeMs: number;
    startFrame: number;
    rangeStart: number;
    rangeEnd: number;
  } | null>(null);
  const isPlayingRef = useRef(false);
  const currentFrameRef = useRef(0);
  const lastRealtimeKeyframeVersionBumpRef = useRef(0);
  const [coreModules, setCoreModules] = useState<CoreModuleState>(DEFAULT_CORE_MODULE_STATE);
  const [moduleStatusLine, setModuleStatusLine] = useState('All core modules active');
  const [visualModules] = useState<VisualModuleState>(VISUAL_MODULES_DEFAULT);
  const [backgroundImageLayer, setBackgroundImageLayer] = useState<ImageLayerState>(DEFAULT_BACKGROUND_IMAGE_LAYER);
  const [foregroundImageLayer, setForegroundImageLayer] = useState<ImageLayerState>(DEFAULT_FOREGROUND_IMAGE_LAYER);
  const [bodyPartMaskLayers, setBodyPartMaskLayers] = useState<Record<string, BodyPartMaskLayer>>({});
  const backgroundObjectUrlRef = useRef<string | null>(null);
  const foregroundObjectUrlRef = useRef<string | null>(null);
  const bodyPartMaskObjectUrlRef = useRef<Record<string, string>>({});
  const undoHistoryRef = useRef<TimelineHistorySnapshot[]>([]);
  const redoHistoryRef = useRef<TimelineHistorySnapshot[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const rotationGestureHasCheckpointRef = useRef(false);
  const rotationGestureResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      revokeLayerObjectUrl(backgroundObjectUrlRef.current);
      revokeLayerObjectUrl(foregroundObjectUrlRef.current);
      Object.values(bodyPartMaskObjectUrlRef.current).forEach((url) => {
        revokeLayerObjectUrl(url);
      });
      backgroundObjectUrlRef.current = null;
      foregroundObjectUrlRef.current = null;
      bodyPartMaskObjectUrlRef.current = {};
      if (rotationGestureResetTimerRef.current !== null) {
        window.clearTimeout(rotationGestureResetTimerRef.current);
        rotationGestureResetTimerRef.current = null;
      }
    };
  }, []);

  const createHistorySnapshot = useCallback((): TimelineHistorySnapshot => ({
    keyframes: clonePoseKeyframes(clipRef.current.getKeyframes()),
    frameCount: clampFrameCount(frameCount),
    currentFrame: Math.max(0, Math.round(currentFrame)),
    rotations: { ...rotations },
    interpolationFramesBySegment: { ...interpolationFramesBySegment },
    segmentIkTweenMap: cloneSegmentIkTweenMap(segmentIkTweenMap),
    easing,
    fps: Math.max(1, Math.round(fps)),
    masterPin: [masterPin[0], masterPin[1]],
    bodyRot,
  }), [bodyRot, currentFrame, easing, fps, frameCount, interpolationFramesBySegment, masterPin, rotations, segmentIkTweenMap]);

  const clearRotationGestureCheckpoint = useCallback(() => {
    rotationGestureHasCheckpointRef.current = false;
    if (rotationGestureResetTimerRef.current !== null) {
      window.clearTimeout(rotationGestureResetTimerRef.current);
      rotationGestureResetTimerRef.current = null;
    }
  }, []);

  const pushUndoSnapshot = useCallback(() => {
    undoHistoryRef.current.push(createHistorySnapshot());
    if (undoHistoryRef.current.length > HISTORY_STACK_LIMIT) {
      undoHistoryRef.current.splice(0, undoHistoryRef.current.length - HISTORY_STACK_LIMIT);
    }
    redoHistoryRef.current = [];
    setHistoryVersion((v) => v + 1);
  }, [createHistorySnapshot]);

  const checkpointRotationGesture = useCallback(() => {
    if (!rotationGestureHasCheckpointRef.current) {
      pushUndoSnapshot();
      rotationGestureHasCheckpointRef.current = true;
    }
    if (rotationGestureResetTimerRef.current !== null) {
      window.clearTimeout(rotationGestureResetTimerRef.current);
    }
    rotationGestureResetTimerRef.current = window.setTimeout(() => {
      rotationGestureHasCheckpointRef.current = false;
      rotationGestureResetTimerRef.current = null;
    }, 180);
  }, [pushUndoSnapshot]);

  const restoreHistorySnapshot = useCallback((snapshot: TimelineHistorySnapshot) => {
    const safeFrameCount = clampFrameCount(snapshot.frameCount);
    const safeEasing = Object.prototype.hasOwnProperty.call(easings, snapshot.easing)
      ? snapshot.easing
      : 'linear';
    const safeInterpolation = { ...snapshot.interpolationFramesBySegment };
    const safeSegmentIkTweenMap = cloneSegmentIkTweenMap(snapshot.segmentIkTweenMap ?? {});
    const safeKeyframes = clonePoseKeyframes(snapshot.keyframes);

    clipRef.current = createAnimationClip(
      safeKeyframes,
      safeFrameCount,
      easings[safeEasing],
      safeInterpolation
    );

    setFrameCount(safeFrameCount);
    setEasing(safeEasing);
    setInterpolationFramesBySegment(safeInterpolation);
    setSegmentIkTweenMap(safeSegmentIkTweenMap);
    setCurrentFrame(Math.min(Math.max(Math.round(snapshot.currentFrame), 0), safeFrameCount - 1));
    setRotations({ ...snapshot.rotations });
    setFps(Math.max(1, Math.round(snapshot.fps)));
    setMasterPin([snapshot.masterPin[0], snapshot.masterPin[1]]);
    setBodyRot(snapshot.bodyRot);
    setKeyframesVersion((v) => v + 1);
    lastRealtimeKeyframeVersionBumpRef.current = 0;
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoHistoryRef.current.length) {
      return;
    }
    clearRotationGestureCheckpoint();
    if (isPlayingRef.current) {
      setIsPlaying(false);
    }
    const previous = undoHistoryRef.current.pop() as TimelineHistorySnapshot;
    redoHistoryRef.current.push(createHistorySnapshot());
    if (redoHistoryRef.current.length > HISTORY_STACK_LIMIT) {
      redoHistoryRef.current.splice(0, redoHistoryRef.current.length - HISTORY_STACK_LIMIT);
    }
    restoreHistorySnapshot(previous);
    setHistoryVersion((v) => v + 1);
  }, [clearRotationGestureCheckpoint, createHistorySnapshot, restoreHistorySnapshot]);

  const handleRedo = useCallback(() => {
    if (!redoHistoryRef.current.length) {
      return;
    }
    clearRotationGestureCheckpoint();
    if (isPlayingRef.current) {
      setIsPlaying(false);
    }
    const next = redoHistoryRef.current.pop() as TimelineHistorySnapshot;
    undoHistoryRef.current.push(createHistorySnapshot());
    if (undoHistoryRef.current.length > HISTORY_STACK_LIMIT) {
      undoHistoryRef.current.splice(0, undoHistoryRef.current.length - HISTORY_STACK_LIMIT);
    }
    restoreHistorySnapshot(next);
    setHistoryVersion((v) => v + 1);
  }, [clearRotationGestureCheckpoint, createHistorySnapshot, restoreHistorySnapshot]);

  const canUndo = useMemo(() => undoHistoryRef.current.length > 0, [historyVersion]);
  const canRedo = useMemo(() => redoHistoryRef.current.length > 0, [historyVersion]);

  const handleBackgroundImageUpload = useCallback((file: File) => {
    const nextUrl = URL.createObjectURL(file);
    revokeLayerObjectUrl(backgroundObjectUrlRef.current);
    backgroundObjectUrlRef.current = nextUrl;
    setBackgroundImageLayer({
      ...DEFAULT_BACKGROUND_IMAGE_LAYER,
      src: nextUrl,
      visible: true,
    });
  }, []);

  const handleForegroundImageUpload = useCallback((file: File) => {
    const nextUrl = URL.createObjectURL(file);
    revokeLayerObjectUrl(foregroundObjectUrlRef.current);
    foregroundObjectUrlRef.current = nextUrl;
    setForegroundImageLayer({
      ...DEFAULT_FOREGROUND_IMAGE_LAYER,
      src: nextUrl,
      visible: true,
    });
  }, []);

  const handleClearBackgroundImageLayer = useCallback(() => {
    revokeLayerObjectUrl(backgroundObjectUrlRef.current);
    backgroundObjectUrlRef.current = null;
    setBackgroundImageLayer((prev) => ({
      ...prev,
      src: null,
      visible: false,
    }));
  }, []);

  const handleClearForegroundImageLayer = useCallback(() => {
    revokeLayerObjectUrl(foregroundObjectUrlRef.current);
    foregroundObjectUrlRef.current = null;
    setForegroundImageLayer((prev) => ({
      ...prev,
      src: null,
      visible: false,
    }));
  }, []);

  const handlePatchBackgroundImageLayer = useCallback((patch: Partial<ImageLayerState>) => {
    setBackgroundImageLayer((prev) => ({
      ...prev,
      ...patch,
    }));
  }, []);

  const handlePatchForegroundImageLayer = useCallback((patch: Partial<ImageLayerState>) => {
    setForegroundImageLayer((prev) => ({
      ...prev,
      ...patch,
    }));
  }, []);

  const clearBodyPartMaskObjectUrl = useCallback((jointId: string) => {
    const existingUrl = bodyPartMaskObjectUrlRef.current[jointId];
    revokeLayerObjectUrl(existingUrl);
    delete bodyPartMaskObjectUrlRef.current[jointId];
  }, []);

  const handleUploadBodyPartMaskLayer = useCallback((jointId: string, file: File) => {
    const nextUrl = URL.createObjectURL(file);
    clearBodyPartMaskObjectUrl(jointId);
    bodyPartMaskObjectUrlRef.current[jointId] = nextUrl;
    setBodyPartMaskLayers((prev) => ({
      ...prev,
      [jointId]: {
        ...DEFAULT_BODY_PART_MASK_LAYER,
        ...(prev[jointId] ?? {}),
        src: nextUrl,
        visible: true,
      },
    }));
  }, [clearBodyPartMaskObjectUrl]);

  const handleClearBodyPartMaskLayer = useCallback((jointId: string) => {
    clearBodyPartMaskObjectUrl(jointId);
    setBodyPartMaskLayers((prev) => ({
      ...prev,
      [jointId]: {
        ...DEFAULT_BODY_PART_MASK_LAYER,
        ...(prev[jointId] ?? {}),
        src: null,
        visible: false,
      },
    }));
  }, [clearBodyPartMaskObjectUrl]);

  const handlePatchBodyPartMaskLayer = useCallback((jointId: string, patch: Partial<BodyPartMaskLayer>) => {
    setBodyPartMaskLayers((prev) => ({
      ...prev,
      [jointId]: {
        ...DEFAULT_BODY_PART_MASK_LAYER,
        ...(prev[jointId] ?? {}),
        ...patch,
      },
    }));
  }, []);

  const ensureFrameCapacity = useCallback((frame: number): number => {
    const safeFrame = Math.max(0, Math.round(frame));
    if (safeFrame < frameCount) {
      return safeFrame;
    }

    const nextFrameCount = safeFrame + 1;
    const currentKeyframes = clipRef.current.getKeyframes();
    clipRef.current = createAnimationClip(
      currentKeyframes,
      nextFrameCount,
      easings[easing],
      interpolationFramesBySegment
    );
    setFrameCount(nextFrameCount);
    return safeFrame;
  }, [frameCount, easing, interpolationFramesBySegment]);

  const upsertPoseKeyframe = useCallback((frame: number, pose: SkeletonRotations) => {
    const safeFrame = ensureFrameCapacity(frame);
    clipRef.current.upsertKeyframe({
      id: keyframeIdFromFrame(safeFrame),
      frame: safeFrame,
      pose,
    });
  }, [ensureFrameCapacity]);

  const handleSetCurrentFrame = useCallback((frame: number) => {
    const safeFrame = ensureFrameCapacity(frame);
    setCurrentFrame(safeFrame);
  }, [ensureFrameCapacity]);

  useEffect(() => {
    const currentKeyframes = clipRef.current.getKeyframes();
    clipRef.current = createAnimationClip(currentKeyframes, frameCount, easings[easing], interpolationFramesBySegment);
    setKeyframesVersion(v => v + 1); // Force re-render of components using the clip
  }, [frameCount, easing, interpolationFramesBySegment]);

  const getPlaybackRange = useCallback(() => {
    const maxFrame = Math.max(frameCount - 1, 0);
    const frames = clipRef.current
      .getKeyframes()
      .map((keyframe) => (typeof keyframe.frame === 'number' ? Math.round(keyframe.frame) : null))
      .filter((frame): frame is number => frame !== null)
      .sort((a, b) => a - b);

    if (!frames.length) {
      return { startFrame: 0, endFrame: maxFrame };
    }

    const startFrame = Math.min(Math.max(frames[0], 0), maxFrame);
    const endFrame = Math.min(Math.max(frames[frames.length - 1], startFrame), maxFrame);
    return { startFrame, endFrame };
  }, [frameCount]);

  const animate = useCallback((time: number) => {
    if (!isPlayingRef.current) {
      return;
    }
    const clock = playbackClockRef.current;
    if (!clock) {
      return;
    }

    const elapsedFrames = Math.max(0, ((time - clock.startTimeMs) / 1000) * fps);
    const nextFrame = clock.startFrame + elapsedFrames;
    if (nextFrame >= clock.rangeEnd) {
      currentFrameRef.current = clock.rangeStart;
      setCurrentFrame(clock.rangeStart);
      playbackClockRef.current = null;
      setIsPlaying(false);
      return;
    }

    currentFrameRef.current = nextFrame;
    setCurrentFrame(nextFrame);
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [fps]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentFrameRef.current = currentFrame;
  }, [currentFrame]);

  useEffect(() => {
    if (isPlaying) {
      const { startFrame, endFrame } = getPlaybackRange();
      const clampedStart = Math.min(Math.max(currentFrameRef.current, startFrame), endFrame);
      currentFrameRef.current = clampedStart;
      setCurrentFrame(clampedStart);

      if (endFrame <= startFrame + 1e-6 || fps <= 0) {
        playbackClockRef.current = null;
        setIsPlaying(false);
        return;
      }

      playbackClockRef.current = {
        startTimeMs: performance.now(),
        startFrame: clampedStart,
        rangeStart: startFrame,
        rangeEnd: endFrame,
      };
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      playbackClockRef.current = null;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, animate, fps, getPlaybackRange]);

  const handleToggleCoreModule = useCallback((moduleId: CoreModuleId) => {
    let nextStatusLine = '';
    setCoreModules((current) => {
      const next = { ...current };
      const enabled = new Set<CoreModuleId>();
      const disabled = new Set<CoreModuleId>();

      if (current[moduleId]) {
        disableModuleWithDependents(next, moduleId, disabled);
      } else {
        enableModuleWithDependencies(next, moduleId, enabled);
      }

      const enabledList = Array.from(enabled);
      const disabledList = Array.from(disabled);
      if (enabledList.length) {
        nextStatusLine = `Enabled: ${enabledList.join(', ')}`;
      } else if (disabledList.length) {
        nextStatusLine = `Disabled: ${disabledList.join(', ')}`;
      } else {
        nextStatusLine = `${moduleId} unchanged`;
      }

      return next;
    });
    if (nextStatusLine) {
      setModuleStatusLine(nextStatusLine);
    }
  }, []);

  const effectiveMovementToggles = useMemo<MovementToggles>(() => ({
    // Rigid IK profile: never stretch/skew chain lengths in runtime.
    stretchEnabled: false,
    softReachEnabled: false,
    naturalBendEnabled: coreModules.ik_engine ? movementToggles.naturalBendEnabled !== false : false,
    fk360Enabled: coreModules.fk_engine ? movementToggles.fk360Enabled !== false : false,
    fkConstraintsEnabled: coreModules.fk_engine ? movementToggles.fkConstraintsEnabled === true : false,
    fkBendEnabled: coreModules.fk_engine ? movementToggles.fkBendEnabled === true : false,
    fkStretchEnabled: coreModules.fk_engine ? movementToggles.fkStretchEnabled === true : false,
    handshakeEnabled: coreModules.constraint_bridge ? movementToggles.handshakeEnabled !== false : false,
    fkRotationSensitivity: movementToggles.fkRotationSensitivity,
    fkRotationResponse: movementToggles.fkRotationResponse,
    rootX: movementToggles.rootX ?? 0,
    rootY: movementToggles.rootY ?? 0,
    rootRotate: movementToggles.rootRotate ?? 0,
    rootGroundLockEnabled: movementToggles.rootGroundLockEnabled ?? false,
    rootXControlEnabled: movementToggles.rootXControlEnabled ?? false,
    rootYControlEnabled: movementToggles.rootYControlEnabled ?? false,
    rootRotateControlEnabled: movementToggles.rootRotateControlEnabled ?? false,
    ikExtendedHandlesEnabled: movementToggles.ikExtendedHandlesEnabled,
    ikPreferFullChainEnabled: movementToggles.ikPreferFullChainEnabled,
    ikUnconstrainedEnabled: movementToggles.ikUnconstrainedEnabled,
    ikProfile: movementToggles.ikProfile ?? "base",
    ikSolver: movementToggles.ikSolver ?? "fabrik",
    ikSolveMode: movementToggles.ikSolveMode ?? "single_chain",
    legIntentMode: movementToggles.legIntentMode ?? "none",
    humanCounterbalanceEnabled: movementToggles.humanCounterbalanceEnabled,
    humanMirrorEnabled: movementToggles.humanMirrorEnabled,
    humanFollowThroughEnabled: movementToggles.humanFollowThroughEnabled,
    humanCollarNeckFollowEnabled: movementToggles.humanCollarNeckFollowEnabled,
    postureState: movementToggles.postureState ?? "stand",
    postureRoll: movementToggles.postureRoll ?? 0,
    poseDirection: movementToggles.poseDirection ?? "front",
    weightShiftLateral: movementToggles.weightShiftLateral ?? 0,
    weightShiftDepth: movementToggles.weightShiftDepth ?? 0,
  }), [coreModules, movementToggles]);

  const handleMovementTogglesChange = useCallback((next: MovementToggles) => {
    if (next.stretchEnabled || next.softReachEnabled) {
      setModuleStatusLine('Rigid IK profile active: stretch and soft reach stay off.');
    }
    setMovementToggles({
      ...next,
      stretchEnabled: false,
      softReachEnabled: false,
    });
  }, []);

  const moduleFriction = useMemo<ModuleFriction[]>(() => {
    const friction: ModuleFriction[] = [];
    if (!coreModules.transfer_engine) {
      friction.push({
        level: 'warning',
        message: 'Transfer Engine is off: autosave/import/export safety is unavailable.',
      });
    }
    if (!coreModules.interaction_engine) {
      friction.push({
        level: 'info',
        message: 'Interaction Engine is off: pose editing is locked, playback remains safe.',
      });
    }
    if (coreModules.ik_engine && !coreModules.constraint_bridge) {
      friction.push({
        level: 'warning',
        message: 'IK without Constraint Bridge can introduce target snapping and pin drift.',
      });
    }
    if (!coreModules.animation_engine && isPlaying) {
      friction.push({
        level: 'warning',
        message: 'Animation Engine was disabled during playback; playback will auto-pause.',
      });
    }
    if (!coreModules.onion_skin && onionSkinConfig.enabled) {
      friction.push({
        level: 'info',
        message: 'Onion Skin module is disabled: ghost frames are suppressed for clarity.',
      });
    }
    if (!coreModules.ik_engine && interactionMode === 'IK') {
      friction.push({
        level: 'warning',
        message: 'IK Engine is disabled while IK mode was selected. Mode will fallback to FK.',
      });
    }
    return friction;
  }, [coreModules, interactionMode, isPlaying, onionSkinConfig.enabled]);

  useEffect(() => {
    if (!coreModules.ik_engine && interactionMode === 'IK') {
      setInteractionMode('FK');
      setModuleStatusLine('IK Engine disabled, forcing FK mode to preserve clean motion.');
    }
  }, [coreModules.ik_engine, interactionMode]);

  useEffect(() => {
    if (!coreModules.animation_engine && isPlaying) {
      setIsPlaying(false);
      setModuleStatusLine('Animation Engine disabled, playback paused safely.');
    }
  }, [coreModules.animation_engine, isPlaying]);

  useEffect(() => {
    if (!coreModules.onion_skin && onionSkinConfig.enabled) {
      setOnionSkinConfig((prev) => ({ ...prev, enabled: false }));
      setModuleStatusLine('Onion Skin disabled, ghost frames hidden for clean timeline output.');
    }
  }, [coreModules.onion_skin, onionSkinConfig.enabled]);

  const mirrorPose = useCallback(() => {
    if (!coreModules.interaction_engine) {
      setModuleStatusLine('Interaction Engine is off. Mirror is disabled.');
      return;
    }
    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    const newRots = { ...rotations };
    const pairs: [string, string][] = [
      ['l_shoulder', 'r_shoulder'], ['l_elbow', 'r_elbow'], ['l_palm', 'r_palm'], ['l_fingertip', 'r_fingertip'],
      ['l_hip', 'r_hip'], ['l_knee', 'r_knee'], ['l_heel', 'r_heel']
    ];
    pairs.forEach(([l, r]) => {
      const temp = newRots[l] || 0;
      newRots[l] = -(newRots[r] || 0);
      newRots[r] = -temp;
    });
    setRotations(newRots);
    if (coreModules.animation_engine) {
      upsertPoseKeyframe(currentFrame, newRots);
      setKeyframesVersion((v) => v + 1);
    }
  }, [
    clearRotationGestureCheckpoint,
    coreModules.animation_engine,
    coreModules.interaction_engine,
    currentFrame,
    pushUndoSnapshot,
    rotations,
    upsertPoseKeyframe,
  ]);

  const resetPose = useCallback(() => {
    if (!coreModules.interaction_engine) {
      setModuleStatusLine('Interaction Engine is off. Reset is disabled.');
      return;
    }
    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    setRotations(modelData.POSES["T-Pose"]);
    setMasterPin([0, 0]);
    setBodyRot(0);
    if (coreModules.animation_engine) {
      upsertPoseKeyframe(currentFrame, modelData.POSES["T-Pose"]);
      setKeyframesVersion((v) => v + 1);
    }
  }, [
    clearRotationGestureCheckpoint,
    coreModules.animation_engine,
    coreModules.interaction_engine,
    currentFrame,
    pushUndoSnapshot,
    upsertPoseKeyframe,
  ]);

  const syncRotationsFromClip = useCallback(() => {
    const clip = clipRef.current;
    try {
      setRotations(clip.sampleFrame(currentFrame));
    } catch {
      // No keyframes - keep current
    }
  }, [currentFrame]);

  useEffect(() => {
    if (isPlayingRef.current) {
      return;
    }
    syncRotationsFromClip();
  }, [currentFrame, syncRotationsFromClip]);

  const playbackPreviewRotations = useMemo(() => {
    const clip = clipRef.current;
    try {
      return sampleIkTweenPreviewPose({
        clip,
        currentFrame,
        easingFn: easings[easing],
        segmentInterpolationFrames: interpolationFramesBySegment,
        segmentIkTweenMap,
        bitruviusData: modelData,
        canvasCenter: [0, 0],
        rootTransform: {
          x: effectiveMovementToggles.rootX ?? 0,
          y: effectiveMovementToggles.rootY ?? 0,
          rotate: effectiveMovementToggles.rootRotate ?? 0,
        },
        ikEngineEnabled: coreModules.ik_engine,
      });
    } catch {
      return rotations;
    }
  }, [
    coreModules.ik_engine,
    currentFrame,
    easing,
    effectiveMovementToggles.rootRotate,
    effectiveMovementToggles.rootX,
    effectiveMovementToggles.rootY,
    interpolationFramesBySegment,
    keyframesVersion,
    rotations,
    segmentIkTweenMap,
  ]);

  const displayedRotations = coreModules.animation_engine ? playbackPreviewRotations : rotations;

  const renderGameTextState = useMemo(() => {
    const worldByJoint = computeWorldPoseForSkeleton(
      modelData.JOINT_DEFS,
      displayedRotations,
      [0, 0],
      {
        x: effectiveMovementToggles.rootX ?? 0,
        y: effectiveMovementToggles.rootY ?? 0,
        rotate: effectiveMovementToggles.rootRotate ?? 0,
      }
    );

    const joints = Object.entries(worldByJoint)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([jointId, world]) => ({
        id: jointId,
        x: Number(world.x.toFixed(3)),
        y: Number(world.y.toFixed(3)),
        angle: Number(world.angle.toFixed(3)),
      }));

    return {
      coordinateSystem: {
        origin: 'canvas_center',
        axes: '+x right, +y down',
        angles: 'degrees',
      },
      mode: coreModules.ik_engine ? interactionMode : 'FK',
      playing: isPlaying,
      frame: Number(currentFrame.toFixed(3)),
      frameCount,
      fps,
      fkAssist: {
        bendEnabled: effectiveMovementToggles.fkBendEnabled === true,
        stretchEnabled: effectiveMovementToggles.fkStretchEnabled === true,
      },
      root: {
        x: Number((effectiveMovementToggles.rootX ?? 0).toFixed(3)),
        y: Number((effectiveMovementToggles.rootY ?? 0).toFixed(3)),
        rotate: Number((effectiveMovementToggles.rootRotate ?? 0).toFixed(3)),
      },
      keyframes: clipRef.current
        .getKeyframes()
        .map((keyframe) => (typeof keyframe.frame === 'number' ? Math.round(keyframe.frame) : null))
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b),
      joints,
    };
  }, [
    coreModules.ik_engine,
    currentFrame,
    displayedRotations,
    effectiveMovementToggles.fkBendEnabled,
    effectiveMovementToggles.fkStretchEnabled,
    effectiveMovementToggles.rootRotate,
    effectiveMovementToggles.rootX,
    effectiveMovementToggles.rootY,
    fps,
    frameCount,
    interactionMode,
    isPlaying,
    keyframesVersion,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const runtimeWindow = window as Window & {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
    };

    runtimeWindow.render_game_to_text = () => JSON.stringify(renderGameTextState);
    runtimeWindow.advanceTime = (ms: number) => {
      const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
      if (safeMs <= 0) {
        return;
      }

      const framesToAdvance = (safeMs / 1000) * Math.max(1, fps);
      const { startFrame, endFrame } = getPlaybackRange();
      const span = endFrame - startFrame;
      if (span <= 1e-6) {
        currentFrameRef.current = startFrame;
        setCurrentFrame(startFrame);
        return;
      }

      setCurrentFrame((previousFrame) => {
        const clampedPrev = Math.min(Math.max(previousFrame, startFrame), endFrame);
        const wrappedOffset = ((clampedPrev - startFrame + framesToAdvance) % span + span) % span;
        const nextFrame = startFrame + wrappedOffset;
        currentFrameRef.current = nextFrame;
        return nextFrame;
      });
    };

    return () => {
      delete runtimeWindow.render_game_to_text;
      delete runtimeWindow.advanceTime;
    };
  }, [fps, getPlaybackRange, renderGameTextState]);

  const handleRotationsChange = useCallback((newRots: SkeletonRotations) => {
    if (!coreModules.interaction_engine) {
      return;
    }
    checkpointRotationGesture();
    setRotations(newRots);
    if (!coreModules.animation_engine) {
      return;
    }
    upsertPoseKeyframe(currentFrame, newRots);
    const now = performance.now();
    // Keep animation/preview responsive during continuous FK drag.
    if (now - lastRealtimeKeyframeVersionBumpRef.current >= 16) {
      lastRealtimeKeyframeVersionBumpRef.current = now;
      setKeyframesVersion((v) => v + 1);
    }
  }, [
    checkpointRotationGesture,
    coreModules.animation_engine,
    coreModules.interaction_engine,
    currentFrame,
    upsertPoseKeyframe,
  ]);

  const keyframeFrames = useMemo(() => (
    clipRef.current
      .getKeyframes()
      .map((keyframe) => (typeof keyframe.frame === 'number' ? Math.round(keyframe.frame) : null))
      .filter((frame): frame is number => frame !== null)
      .sort((a, b) => a - b)
  ), [keyframesVersion]);

  const keyframePoseMap = useMemo(() => {
    const map: Record<number, SkeletonRotations> = {};
    clipRef.current.getKeyframes().forEach((keyframe) => {
      if (typeof keyframe.frame !== 'number') return;
      map[Math.round(keyframe.frame)] = keyframe.pose;
    });
    return map;
  }, [keyframesVersion]);

  const isCurrentFrameKeyframe = keyframeFrames.includes(Math.round(currentFrame));

  useEffect(() => {
    setInterpolationFramesBySegment((prev) => {
      if (!Object.keys(prev).length) {
        return prev;
      }
      const validPairs = new Set<string>();
      for (let index = 0; index < keyframeFrames.length - 1; index += 1) {
        const fromFrame = Math.round(keyframeFrames[index]);
        const toFrame = Math.round(keyframeFrames[index + 1]);
        if (toFrame > fromFrame) {
          validPairs.add(`${fromFrame}->${toFrame}`);
        }
      }

      let changed = false;
      const next: Record<string, number> = {};
      Object.entries(prev).forEach(([segmentKey, duration]) => {
        if (!validPairs.has(segmentKey)) {
          changed = true;
          return;
        }
        const [fromRaw, toRaw] = segmentKey.split('->').map((value) => Number(value));
        if (!Number.isFinite(fromRaw) || !Number.isFinite(toRaw) || toRaw <= fromRaw) {
          changed = true;
          return;
        }
        const span = Math.max(1, Math.round(toRaw - fromRaw));
        const clampedDuration = Math.min(span, Math.max(1, Math.round(duration)));
        next[segmentKey] = clampedDuration;
        if (clampedDuration !== duration) {
          changed = true;
        }
      });

      if (!changed && Object.keys(next).length === Object.keys(prev).length) {
        return prev;
      }
      return next;
    });
  }, [keyframeFrames]);

  useEffect(() => {
    setSegmentIkTweenMap((prev) => {
      if (!Object.keys(prev).length) {
        return prev;
      }
      const validPairs = new Set<string>();
      for (let index = 0; index < keyframeFrames.length - 1; index += 1) {
        const fromFrame = Math.round(keyframeFrames[index]);
        const toFrame = Math.round(keyframeFrames[index + 1]);
        if (toFrame > fromFrame) {
          validPairs.add(ikSegmentKey(fromFrame, toFrame));
        }
      }
      return pruneSegmentIkTweenMap(prev, validPairs);
    });
  }, [keyframeFrames]);

  const handleSetKeyframe = useCallback(() => {
    if (!coreModules.animation_engine) {
      setModuleStatusLine('Enable Animation Engine to write keyframes.');
      return;
    }
    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    upsertPoseKeyframe(currentFrame, rotations);
    setKeyframesVersion((v) => v + 1);
  }, [
    clearRotationGestureCheckpoint,
    coreModules.animation_engine,
    currentFrame,
    pushUndoSnapshot,
    rotations,
    upsertPoseKeyframe,
  ]);

  const handleRemoveKeyframe = useCallback(() => {
    if (!coreModules.animation_engine) {
      setModuleStatusLine('Enable Animation Engine to remove keyframes.');
      return;
    }
    if (!isCurrentFrameKeyframe) return;
    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    clipRef.current.removeKeyframe(keyframeIdFromFrame(Math.round(currentFrame)));
    setKeyframesVersion((v) => v + 1);
    syncRotationsFromClip();
  }, [
    clearRotationGestureCheckpoint,
    coreModules.animation_engine,
    currentFrame,
    isCurrentFrameKeyframe,
    pushUndoSnapshot,
    syncRotationsFromClip,
  ]);

  const handleSavePoseToFrame = useCallback((frame: number) => {
    if (!coreModules.animation_engine) return;
    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    const safeFrame = Math.max(0, Math.round(frame));
    upsertPoseKeyframe(safeFrame, rotations);
    setCurrentFrame(safeFrame);
    setKeyframesVersion((v) => v + 1);
  }, [clearRotationGestureCheckpoint, coreModules.animation_engine, pushUndoSnapshot, rotations, upsertPoseKeyframe]);

  const handleApplyPoseLibraryToFrame = useCallback((frame: number, poseName: string) => {
    if (!coreModules.animation_engine) {
      setModuleStatusLine('Enable Animation Engine to place library poses.');
      return;
    }

    const pose = modelData.POSES[poseName];
    if (!pose) {
      return;
    }

    const safeFrame = Math.max(0, Math.round(frame));
    const basePose = modelData.POSES["Neutral"] ?? modelData.POSES["T-Pose"];
    const nextPose: SkeletonRotations = {
      ...basePose,
      ...pose,
    };

    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    upsertPoseKeyframe(safeFrame, nextPose);
    setRotations(nextPose);
    setCurrentFrame(safeFrame);
    setKeyframesVersion((v) => v + 1);
  }, [clearRotationGestureCheckpoint, coreModules.animation_engine, pushUndoSnapshot, upsertPoseKeyframe]);

  const handleSwapKeyframeFrames = useCallback((fromFrame: number, toFrame: number) => {
    if (!coreModules.animation_engine) return;
    const roundedFrom = Math.round(fromFrame);
    const roundedTo = Math.round(toFrame);
    if (roundedFrom === roundedTo) return;

    const fromPose = keyframePoseMap[roundedFrom];
    const toPose = keyframePoseMap[roundedTo];
    if (!fromPose && !toPose) return;

    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    if (fromPose) {
      upsertPoseKeyframe(roundedTo, fromPose);
    } else {
      clipRef.current.removeKeyframe(keyframeIdFromFrame(roundedTo));
    }

    if (toPose) {
      upsertPoseKeyframe(roundedFrom, toPose);
    } else {
      clipRef.current.removeKeyframe(keyframeIdFromFrame(roundedFrom));
    }

    setKeyframesVersion((v) => v + 1);
  }, [clearRotationGestureCheckpoint, coreModules.animation_engine, keyframePoseMap, pushUndoSnapshot, upsertPoseKeyframe]);

  const handleInsertTweenBetween = useCallback((fromFrame: number, toFrame: number) => {
    if (!coreModules.animation_engine) {
      return;
    }

    const start = Math.min(Math.round(fromFrame), Math.round(toFrame));
    const end = Math.max(Math.round(fromFrame), Math.round(toFrame));
    if (end - start <= 1) {
      return;
    }

    const occupied = new Set<number>(
      clipRef.current
        .getKeyframes()
        .map((keyframe) => (typeof keyframe.frame === 'number' ? Math.round(keyframe.frame) : -1))
        .filter((frame) => frame >= 0)
    );

    const midpoint = Math.round((start + end) / 2);
    const candidates: number[] = [];
    for (let offset = 0; offset <= end - start; offset += 1) {
      const lower = midpoint - offset;
      const upper = midpoint + offset;
      if (lower > start && lower < end) candidates.push(lower);
      if (upper > start && upper < end && upper !== lower) candidates.push(upper);
    }

    const targetFrame = candidates.find((frame) => !occupied.has(frame));
    if (targetFrame === undefined) {
      return;
    }

    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    const tweenPose = clipRef.current.sampleFrame(targetFrame);
    upsertPoseKeyframe(targetFrame, tweenPose);
    setKeyframesVersion((v) => v + 1);
  }, [clearRotationGestureCheckpoint, coreModules.animation_engine, pushUndoSnapshot, upsertPoseKeyframe]);

  const handleAdjustSegmentInBetweens = useCallback((fromFrame: number, toFrame: number, delta: number) => {
    if (!coreModules.animation_engine) {
      return;
    }
    const direction = Math.sign(Math.round(delta));
    if (!direction) {
      return;
    }

    const start = Math.min(Math.round(fromFrame), Math.round(toFrame));
    const end = Math.max(Math.round(fromFrame), Math.round(toFrame));
    if (end <= start) {
      return;
    }

    const keyframes = clipRef.current
      .getKeyframes()
      .map((keyframe) => ({
        ...keyframe,
        frame: typeof keyframe.frame === 'number' ? Math.round(keyframe.frame) : -1,
      }))
      .filter((keyframe) => keyframe.frame >= 0)
      .sort((a, b) => a.frame - b.frame);

    if (!keyframes.some((keyframe) => keyframe.frame === start) || !keyframes.some((keyframe) => keyframe.frame === end)) {
      return;
    }

    const inBetweens = Math.max(0, end - start - 1);
    if (direction < 0 && inBetweens <= 0) {
      return;
    }

    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    const pivotFrame = end;
    const shiftBy = direction > 0 ? 1 : -1;
    const shiftedKeyframes = keyframes.map((keyframe) => {
      const nextFrame = keyframe.frame >= pivotFrame ? keyframe.frame + shiftBy : keyframe.frame;
      return {
        id: keyframeIdFromFrame(nextFrame),
        frame: nextFrame,
        pose: keyframe.pose,
      };
    });

    const nextInterpolation = remapSegmentInterpolationForShift(interpolationFramesBySegment, pivotFrame, shiftBy);
    const maxFrame = shiftedKeyframes.reduce((acc, keyframe) => Math.max(acc, keyframe.frame), 0);
    const nextFrameCount = Math.max(1, maxFrame + 1);

    clipRef.current = createAnimationClip(
      shiftedKeyframes,
      nextFrameCount,
      easings[easing],
      nextInterpolation
    );

    setInterpolationFramesBySegment(nextInterpolation);
    setFrameCount(nextFrameCount);
    setCurrentFrame((prev) => {
      const rounded = Math.round(prev);
      const shifted = rounded >= pivotFrame ? rounded + shiftBy : rounded;
      return Math.max(0, Math.min(nextFrameCount - 1, shifted));
    });
    setKeyframesVersion((v) => v + 1);
  }, [clearRotationGestureCheckpoint, coreModules.animation_engine, interpolationFramesBySegment, easing, pushUndoSnapshot]);

  const handleSetSegmentInterpolation = useCallback((fromFrame: number, toFrame: number, frames: number | null) => {
    if (!coreModules.animation_engine) {
      return;
    }
    const roundedFrom = Math.round(fromFrame);
    const roundedTo = Math.round(toFrame);
    const start = Math.min(roundedFrom, roundedTo);
    const end = Math.max(roundedFrom, roundedTo);
    if (end <= start) {
      return;
    }
    const span = Math.max(1, end - start);
    const key = `${start}->${end}`;
    const currentValue = interpolationFramesBySegment[key];
    const nextValue = (frames === null || !Number.isFinite(frames) || frames <= 0)
      ? null
      : Math.min(span, Math.max(1, Math.round(frames)));
    if ((currentValue ?? null) === nextValue) {
      return;
    }
    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    setInterpolationFramesBySegment((prev) => {
      const next = { ...prev };
      if (nextValue === null) {
        delete next[key];
      } else {
        next[key] = nextValue;
      }
      return next;
    });
  }, [clearRotationGestureCheckpoint, coreModules.animation_engine, interpolationFramesBySegment, pushUndoSnapshot]);

  const handlePatchSegmentIkTween = useCallback((
    fromFrame: number,
    toFrame: number,
    patchOrNull: Partial<SegmentIkTweenSettings> | null
  ) => {
    if (!coreModules.animation_engine) {
      return;
    }
    const roundedFrom = Math.round(fromFrame);
    const roundedTo = Math.round(toFrame);
    const start = Math.min(roundedFrom, roundedTo);
    const end = Math.max(roundedFrom, roundedTo);
    if (end <= start) {
      return;
    }
    const key = ikSegmentKey(start, end);
    const currentSettings = segmentIkTweenMap[key];
    if (patchOrNull === null) {
      if (!currentSettings) {
        return;
      }
      clearRotationGestureCheckpoint();
      pushUndoSnapshot();
      setSegmentIkTweenMap((prev) => {
        if (!prev[key]) {
          return prev;
        }
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    const base = currentSettings
      ? normalizeSegmentIkTweenSettings(currentSettings)
      : DEFAULT_SEGMENT_IK_TWEEN_SETTINGS;
    const nextSettings = normalizeSegmentIkTweenSettings({
      ...base,
      ...patchOrNull,
    });

    const unchanged = currentSettings && (
      currentSettings.enabled === nextSettings.enabled &&
      currentSettings.influence === nextSettings.influence &&
      currentSettings.solver === nextSettings.solver &&
      currentSettings.solveMode === nextSettings.solveMode &&
      currentSettings.includeHands === nextSettings.includeHands &&
      currentSettings.includeFeet === nextSettings.includeFeet &&
      currentSettings.includeHead === nextSettings.includeHead &&
      currentSettings.naturalBendEnabled === nextSettings.naturalBendEnabled &&
      currentSettings.softReachEnabled === nextSettings.softReachEnabled &&
      currentSettings.enforceJointLimits === nextSettings.enforceJointLimits &&
      currentSettings.damping === nextSettings.damping
    );
    if (unchanged) {
      return;
    }

    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    setSegmentIkTweenMap((prev) => ({
      ...prev,
      [key]: nextSettings,
    }));
  }, [
    clearRotationGestureCheckpoint,
    coreModules.animation_engine,
    pushUndoSnapshot,
    segmentIkTweenMap,
  ]);

  const handleRemovePoseAtFrame = useCallback((frame: number) => {
    if (!coreModules.animation_engine) {
      return;
    }
    const roundedFrame = Math.min(Math.max(Math.round(frame), 0), Math.max(frameCount - 1, 0));
    const keyframes = clipRef.current.getKeyframes();
    if (keyframes.length <= 1) {
      return;
    }
    const hasKeyframe = keyframes.some((keyframe) => Math.round(keyframe.frame ?? -1) === roundedFrame);
    if (!hasKeyframe) {
      return;
    }
    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    clipRef.current.removeKeyframe(keyframeIdFromFrame(roundedFrame));
    setKeyframesVersion((v) => v + 1);
    if (Math.round(currentFrame) === roundedFrame) {
      syncRotationsFromClip();
    }
  }, [clearRotationGestureCheckpoint, coreModules.animation_engine, frameCount, currentFrame, pushUndoSnapshot, syncRotationsFromClip]);

  const ghostFrames = useMemo(() => {
    if (!coreModules.onion_skin || !onionSkinConfig.enabled) return undefined;
    const ghosts = clipRef.current.getGhostFrames({ frame: currentFrame }, onionSkinConfig);
    return ghosts.map(g => ({
      rotations: g.pose,
      opacity: g.opacity,
      tint: g.direction as 'past' | 'future',
    }));
  }, [coreModules.onion_skin, currentFrame, onionSkinConfig, keyframesVersion]);

  const applyPose = useCallback((poseName: string) => {
    if (!coreModules.interaction_engine) {
      setModuleStatusLine('Interaction Engine is off. Pose presets are locked.');
      return;
    }
    const pose = modelData.POSES[poseName];
    if (pose) {
      clearRotationGestureCheckpoint();
      pushUndoSnapshot();
      const newRots = { ...rotations, ...pose };
      setRotations(newRots);
      if (coreModules.animation_engine) {
        upsertPoseKeyframe(currentFrame, newRots);
        setKeyframesVersion((v) => v + 1);
      }
    }
  }, [
    clearRotationGestureCheckpoint,
    coreModules.animation_engine,
    coreModules.interaction_engine,
    currentFrame,
    pushUndoSnapshot,
    rotations,
    upsertPoseKeyframe,
  ]);

  const calibrateMocap = () => {
    if (!coreModules.interaction_engine) {
      setModuleStatusLine('Interaction Engine is off. Calibrate is unavailable.');
      return;
    }
    setIsCalibrating(true);
    setMocapMode(true);
    setRotations(modelData.POSES["T-Pose"]);
    setTimeout(() => {
      setIsCalibrating(false);
    }, 1000);
  };

  const standardizedString = useMemo(() => {
    let s = `r:${masterPin[0]},${masterPin[1]};br:${bodyRot};`;
    Object.entries(rotations).forEach(([id, deg]) => {
      s += `${id}:${deg};`;
    });
    const visualBits = `bg${visualModules.background ? 1 : 0}-hg${visualModules.headGrid ? 1 : 0}-fg${visualModules.fingerGrid ? 1 : 0}-rg${visualModules.rings ? 1 : 0}`;
    s += `v:1;ss:${safeSwitch ? 1 : 0};tm:${mocapMode ? 1 : 0};sm:${silhouetteMode ? 1 : 0};lm:${lotteMode ? 1 : 0};b:0.15;hp:0;vm:${visualBits}`;
    return s;
  }, [rotations, masterPin, bodyRot, safeSwitch, mocapMode, silhouetteMode, lotteMode, visualModules.background, visualModules.fingerGrid, visualModules.headGrid, visualModules.rings]);

  const handleStringInput = (input: string) => {
    try {
      const parts = input.split(';');
      const newRots: SkeletonRotations = {};
      parts.forEach(p => {
        const [k, v] = p.split(':');
        if (!k || !v) return;
        if (k === 'r') {
          const [x, y] = v.split(',').map(Number);
          setMasterPin([x, y]);
        } else if (k === 'br') {
          setBodyRot(Number(v));
        } else if (k === 'ss') {
          setSafeSwitch(v === '1');
        } else if (k === 'tm') {
          setMocapMode(v === '1');
        } else if (k === 'sm') {
          setSilhouetteMode(v === '1');
        } else if (k === 'lm') {
          setLotteMode(v === '1');
        } else if (modelData.JOINT_DEFS[k]) {
          newRots[k] = Number(v);
        }
      });
      setRotations(newRots);
    } catch (e) {
      console.error("String parse error", e);
    }
  };

  const majorGridSize = 64;
  const [canvasWidth, setCanvasWidth] = useState(() => window.innerWidth);
  const [canvasHeight, setCanvasHeight] = useState(() => window.innerHeight);

  useEffect(() => {
    const handleResize = () => {
      setCanvasWidth(window.innerWidth);
      setCanvasHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleToggleInteractionMode = useCallback(() => {
    if (!coreModules.interaction_engine) {
      setModuleStatusLine('Interaction Engine is disabled. Re-enable it to edit.');
      return;
    }
    if (interactionMode === 'FK') {
      if (!coreModules.ik_engine) {
        setModuleStatusLine('Enable IK Engine before switching to IK mode.');
        return;
      }
      setInteractionMode('IK');
      return;
    }
    setInteractionMode('FK');
  }, [coreModules.ik_engine, coreModules.interaction_engine, interactionMode]);

  const handleToggleOnionEnabled = useCallback(() => {
    if (!coreModules.onion_skin) {
      setModuleStatusLine('Enable Onion Skin module first.');
      return;
    }
    setOnionSkinConfig((prev) => ({ ...prev, enabled: !prev.enabled }));
  }, [coreModules.onion_skin]);

  const handleOnionSkinConfigChange = useCallback((nextConfig: typeof DEFAULT_ONION) => {
    if (!coreModules.onion_skin) {
      setModuleStatusLine('Onion Skin module is disabled.');
      return;
    }
    setOnionSkinConfig(nextConfig);
  }, [coreModules.onion_skin]);

  const handleFpsChange = useCallback((nextFps: number) => {
    const safeFps = Number.isFinite(nextFps) ? Math.max(1, Math.round(nextFps)) : fps;
    if (safeFps === fps) {
      return;
    }
    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    setFps(safeFps);
  }, [clearRotationGestureCheckpoint, fps, pushUndoSnapshot]);

  const handleFrameCountChange = useCallback((nextFrameCount: number) => {
    const safeFrameCount = clampFrameCount(nextFrameCount);
    if (safeFrameCount === frameCount) {
      return;
    }
    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    setFrameCount(safeFrameCount);
    setCurrentFrame((prev) => Math.min(Math.max(0, Math.round(prev)), safeFrameCount - 1));
  }, [clearRotationGestureCheckpoint, frameCount, pushUndoSnapshot]);

  const handleEasingChange = useCallback((nextEasing: string) => {
    const safeEasing = Object.prototype.hasOwnProperty.call(easings, nextEasing)
      ? (nextEasing as keyof typeof easings)
      : easing;
    if (safeEasing === easing) {
      return;
    }
    clearRotationGestureCheckpoint();
    pushUndoSnapshot();
    setEasing(safeEasing);
  }, [clearRotationGestureCheckpoint, easing, pushUndoSnapshot]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (key === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRedo, handleUndo]);

  const animationControlsDisabled = !coreModules.animation_engine;
  const easingOptionNames = useMemo(() => Object.keys(easings), []);

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col items-center justify-center bg-[#f8f8fc] font-mono text-zinc-500">
      {!gridViewMode && (
      <div className="w-full max-w-5xl bg-zinc-900 border-b border-zinc-800 p-2 flex items-center gap-4 z-50">
        <div className="text-[10px] tracking-[0.2em] font-bold text-zinc-600 uppercase">Bitruvius Core Engine</div>
        <div className="flex-1">
          <input
            type="text"
            value={standardizedString}
            onChange={(e) => handleStringInput(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[9px] text-zinc-400 focus:outline-none focus:border-zinc-700"
            spellCheck={false}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleToggleInteractionMode}
            disabled={!coreModules.interaction_engine}
            className={`px-3 py-1 text-[9px] border rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              interactionMode === 'IK' ? 'bg-zinc-800 border-red-500 text-red-100' : 'bg-zinc-950 border-zinc-800 text-zinc-600'
            }`}
          >
            DRAG: {interactionMode}
          </button>
          <button
            onClick={() => setMocapMode(!mocapMode)}
            className={`px-3 py-1 text-[9px] border rounded transition-colors ${mocapMode ? 'bg-zinc-800 border-zinc-500 text-zinc-100' : 'bg-zinc-950 border-zinc-800 text-zinc-600'}`}
          >
            TM: {mocapMode ? 'ACTIVE' : 'OFF'}
          </button>
          <button
            onClick={() => setSafeSwitch(!safeSwitch)}
            className={`px-3 py-1 text-[9px] border rounded transition-colors ${safeSwitch ? 'bg-zinc-700 border-zinc-400 text-zinc-100' : 'bg-zinc-950 border-zinc-800 text-zinc-600'}`}
          >
            SS: {safeSwitch ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={calibrateMocap}
            disabled={isCalibrating}
            className={`px-3 py-1 text-[9px] border border-zinc-800 bg-zinc-950 text-zinc-400 rounded hover:bg-zinc-900 transition-colors ${isCalibrating ? 'animate-pulse border-white text-white' : ''}`}
          >
            {isCalibrating ? 'CALIBRATING...' : 'CALIBRATE'}
          </button>
          <button
            onClick={() => setSilhouetteMode(!silhouetteMode)}
            className={`px-3 py-1 text-[9px] border rounded transition-colors ${silhouetteMode ? 'bg-zinc-800 border-zinc-500 text-zinc-100' : 'bg-zinc-950 border-zinc-800 text-zinc-600'}`}
          >
            SIL: {silhouetteMode ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => setLotteMode((prev) => !prev)}
            className={`px-3 py-1 text-[9px] border rounded transition-colors ${lotteMode ? 'bg-amber-900/70 border-amber-500 text-amber-100' : 'bg-zinc-950 border-zinc-800 text-zinc-600'}`}
          >
            LOTTE: {lotteMode ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={mirrorPose}
            className="px-3 py-1 text-[9px] border border-zinc-800 bg-zinc-950 text-zinc-400 rounded hover:bg-zinc-900 transition-colors"
          >
            MIRROR
          </button>
          <div className="relative group">
            <button
              onClick={handleToggleOnionEnabled}
              disabled={!coreModules.onion_skin}
              className={`px-3 py-1 text-[9px] border rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                onionSkinConfig.enabled ? 'bg-zinc-800 border-emerald-500 text-emerald-100' : 'bg-zinc-950 border-zinc-800 text-zinc-600'
              }`}
            >
              ONION
            </button>
            <div className="absolute right-0 top-full mt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <OnionSkinControls config={onionSkinConfig} onConfigChange={handleOnionSkinConfigChange} />
            </div>
          </div>
          <button
            onClick={resetPose}
            className="px-3 py-1 text-[9px] border border-zinc-800 bg-zinc-950 text-zinc-400 rounded hover:bg-zinc-900 transition-colors"
          >
            RESET
          </button>
        </div>
      </div>
      )}

      {!gridViewMode && (
      <CoreModuleGrid
        definitions={CORE_MODULE_DEFINITIONS}
        state={coreModules}
        onToggle={handleToggleCoreModule}
        friction={moduleFriction}
        moduleStatusLine={moduleStatusLine}
      />
      )}

      {!gridViewMode && (
      <div className="w-full max-w-5xl bg-zinc-900/80 border-b border-zinc-800 px-2 py-2 flex items-center gap-4 z-40 text-[9px]">
        <button
          onClick={handleSetKeyframe}
          disabled={animationControlsDisabled || isCurrentFrameKeyframe}
          title="Set Keyframe"
          className="px-2 py-1 border border-zinc-700 rounded bg-zinc-950 text-zinc-400 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Key
        </button>
        <button
          onClick={handleRemoveKeyframe}
          disabled={animationControlsDisabled || !isCurrentFrameKeyframe || keyframeFrames.length <= 1}
          title="Remove Keyframe"
          className="px-2 py-1 border border-zinc-700 rounded bg-zinc-950 text-zinc-400 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          − Key
        </button>
        <div className="flex-1">
          <TimelineStrip
            frameCount={frameCount}
            keyframeFrames={keyframeFrames}
            currentFrame={currentFrame}
            onSetCurrentFrame={animationControlsDisabled ? () => undefined : handleSetCurrentFrame}
          />
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={animationControlsDisabled}
            className={`w-16 px-2 py-1 border rounded disabled:opacity-45 disabled:cursor-not-allowed ${isPlaying ? 'border-red-500 bg-red-900 text-red-100' : 'border-zinc-700 bg-zinc-950 text-zinc-400'}`}
          >
            {isPlaying ? 'PAUSE' : 'PLAY'}
          </button>
          <div className="flex items-center gap-1">
            <label htmlFor="fps" className="text-zinc-500">FPS</label>
            <input id="fps" type="number" value={fps} disabled={animationControlsDisabled} onChange={e => handleFpsChange(Number(e.target.value))} className="w-12 bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed" />
          </div>
          <div className="flex items-center gap-1">
            <label htmlFor="frames" className="text-zinc-500">Frames</label>
            <input id="frames" type="number" value={frameCount} disabled={animationControlsDisabled} onChange={e => handleFrameCountChange(Number(e.target.value))} className="w-16 bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed" />
          </div>
          <div className="flex items-center gap-1">
            <label htmlFor="easing" className="text-zinc-500">Easing</label>
            <select id="easing" value={easing} disabled={animationControlsDisabled} onChange={e => handleEasingChange(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-zinc-300 disabled:opacity-45 disabled:cursor-not-allowed">
              {easingOptionNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        </div>
      </div>
      )}

      <div className="flex-1 w-full relative overflow-hidden flex items-center justify-center p-0">
        <CanvasGrid
          width={canvasWidth} height={canvasHeight}
          majorGridSize={64} majorGridColor="rgba(128, 0, 128, 0.4)" majorGridWidth={1}
          minorGridSize={8} minorGridColor="rgba(0, 255, 0, 0.2)" minorGridWidth={0.5}
          ruleOfThirdsColor="rgba(0, 0, 0, 0.6)" ruleOfThirdsWidth={1.5}
          bitruviusData={modelData}
          currentRotations={displayedRotations}
          mocapMode={mocapMode}
          safeSwitch={safeSwitch}
          silhouetteMode={silhouetteMode}
          lotteMode={lotteMode}
          ikEnabled={coreModules.ik_engine}
          interactionMode={coreModules.ik_engine ? interactionMode : "FK"}
          onInteractionModeChange={handleToggleInteractionMode}
          onToggleLotteMode={() => setLotteMode((prev) => !prev)}
          onReturnDefaultPose={coreModules.interaction_engine ? resetPose : undefined}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          movementToggles={effectiveMovementToggles}
          onMovementTogglesChange={handleMovementTogglesChange}
          onPoseApply={coreModules.interaction_engine ? applyPose : undefined}
          onRotationsChange={coreModules.interaction_engine ? handleRotationsChange : undefined}
          ghostFrames={ghostFrames}
          onMasterPinChange={setMasterPin}
          visualModules={visualModules}
          backgroundImageLayer={backgroundImageLayer}
          foregroundImageLayer={foregroundImageLayer}
          bodyPartMaskLayers={bodyPartMaskLayers}
          onUploadBackgroundImageLayer={handleBackgroundImageUpload}
          onUploadForegroundImageLayer={handleForegroundImageUpload}
          onUploadBodyPartMaskLayer={handleUploadBodyPartMaskLayer}
          onClearBackgroundImageLayer={handleClearBackgroundImageLayer}
          onClearForegroundImageLayer={handleClearForegroundImageLayer}
          onClearBodyPartMaskLayer={handleClearBodyPartMaskLayer}
          onPatchBackgroundImageLayer={handlePatchBackgroundImageLayer}
          onPatchForegroundImageLayer={handlePatchForegroundImageLayer}
          onPatchBodyPartMaskLayer={handlePatchBodyPartMaskLayer}
          gridOnlyMode={gridViewMode}
          isPlaying={isPlaying}
          onTogglePlayback={animationControlsDisabled ? undefined : () => setIsPlaying((prev) => !prev)}
          animationControlDisabled={animationControlsDisabled}
          currentFrame={currentFrame}
          frameCount={frameCount}
          fps={fps}
          easing={easing}
          easingOptions={easingOptionNames}
          keyframeFrames={keyframeFrames}
          isCurrentFrameKeyframe={isCurrentFrameKeyframe}
          onSetCurrentFrame={animationControlsDisabled ? undefined : handleSetCurrentFrame}
          onSetKeyframe={animationControlsDisabled ? undefined : handleSetKeyframe}
          onRemoveKeyframe={animationControlsDisabled ? undefined : handleRemoveKeyframe}
          onFpsChange={animationControlsDisabled ? undefined : handleFpsChange}
          onFrameCountChange={animationControlsDisabled ? undefined : handleFrameCountChange}
          onEasingChange={animationControlsDisabled ? undefined : handleEasingChange}
          keyframePoseMap={keyframePoseMap}
          onSavePoseToFrame={animationControlsDisabled ? undefined : handleSavePoseToFrame}
          onApplyPoseToFrame={animationControlsDisabled ? undefined : handleApplyPoseLibraryToFrame}
          onSwapTimelineFrames={animationControlsDisabled ? undefined : handleSwapKeyframeFrames}
          onInsertTweenBetween={animationControlsDisabled ? undefined : handleInsertTweenBetween}
          onAdjustSegmentInBetweens={animationControlsDisabled ? undefined : handleAdjustSegmentInBetweens}
          onRemovePoseAtFrame={animationControlsDisabled ? undefined : handleRemovePoseAtFrame}
          segmentInterpolationFrames={interpolationFramesBySegment}
          onSetSegmentInterpolation={animationControlsDisabled ? undefined : handleSetSegmentInterpolation}
          segmentIkTweenMap={segmentIkTweenMap}
          onPatchSegmentIkTween={animationControlsDisabled ? undefined : handlePatchSegmentIkTween}
        />
      </div>

      {!gridViewMode && (
      <div className="w-full bg-zinc-900/50 p-1 flex justify-between px-4 text-[8px] uppercase tracking-widest text-zinc-700">
        <span>Axiom: Tabletop Constraint Active</span>
        <span>Build: Production Core 2.5.0 (IK Integrated)</span>
      </div>
      )}
    </div>
  );
};

export default App;
