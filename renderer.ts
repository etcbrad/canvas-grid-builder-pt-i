import { BitruviusData, SkeletonRotations, WorldCoords } from './modelData';
import { torsoHeart, waistCircle, collarShape, neckShape, armBlade, handShape, legCapsule, footSpike } from './drawingUtils';
import { d2r } from './utils';
import { createVitruvianGridModel, createVitruvianPlotPayload, VitruvianLine } from './adapters/vitruvianGrid';

export interface GhostFrameRender {
  rotations: SkeletonRotations;
  opacity: number;
  tint?: 'past' | 'future';
}

export interface VisualModuleState {
  headGrid: boolean;
  fingerGrid: boolean;
  rings: boolean;
  background: boolean;
}

export interface ImageLayerState {
  src: string | null;
  visible: boolean;
  opacity: number; // 0..1
  x: number; // 0..100
  y: number; // 0..100
  scale: number; // 10..400 (%)
  fitMode?: 'free' | 'contain' | 'cover';
  blendMode?: GlobalCompositeOperation;
}

const DEFAULT_VISUAL_MODULE_STATE: VisualModuleState = {
  headGrid: true,
  fingerGrid: true,
  rings: true,
  background: true,
};

const HEAD_PIECE_MODEL_BOUNDS = {
  width: 52.8,
  height: 54,
};

interface RenderOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  viewWindow?: { x: number; y: number; width: number; height: number };
  majorGridSize: number;
  minorGridSize: number;
  bitruviusData: BitruviusData;
  rotations: SkeletonRotations;
  mocapMode: boolean;
  silhouetteMode: boolean;
  // IK targets remain world-space interaction data; renderer only consumes them for optional debug overlays.
  ikTargets: { [chainId: string]: { x: number, y: number } };
  computeWorld: (jointId: string, rotations: SkeletonRotations, canvasCenter: [number, number]) => WorldCoords;
  ghostFrames?: GhostFrameRender[];
  visualModules?: Partial<VisualModuleState>;
  backgroundLayer?: ImageLayerState;
  foregroundLayer?: ImageLayerState;
  lotteMode?: boolean;
  gridOnlyMode?: boolean;
  showIkDebugOverlay?: boolean;
  headGridHover?: { label: string; x: number; y: number; occludedByModel: boolean } | null;
}

const layerImageCache: Record<string, HTMLImageElement> = {};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, value));
};

const clampScalePercent = (value: number): number => {
  if (!Number.isFinite(value)) return 100;
  return Math.max(10, Math.min(400, value));
};

const resolveLayerImage = (src: string): HTMLImageElement | null => {
  const cached = layerImageCache[src];
  if (cached) {
    return cached.complete ? cached : null;
  }

  const image = new Image();
  image.src = src;
  layerImageCache[src] = image;
  return null;
};

export const render = (options: RenderOptions) => {
  const {
    ctx,
    width,
    height,
    viewWindow,
    majorGridSize: _majorGridSize,
    minorGridSize: _minorGridSize,
    bitruviusData,
    rotations,
    mocapMode,
    silhouetteMode,
    ikTargets,
    computeWorld,
    ghostFrames,
    visualModules,
    backgroundLayer,
    foregroundLayer,
    lotteMode = false,
    gridOnlyMode = false,
    showIkDebugOverlay = false,
    headGridHover = null,
  } = options;
  const activeVisualModules: VisualModuleState = {
    ...DEFAULT_VISUAL_MODULE_STATE,
    ...visualModules,
  };

  const SHADOW_OFFSET = { x: 8, y: 12 };
  const SHADOW_COLOR = "rgba(0, 0, 0, 0.18)";
  const PAST_TINT = "rgba(52, 211, 153, 0.6)";
  const FUTURE_TINT = "rgba(168, 85, 247, 0.6)";
  const silhouetteActive = silhouetteMode || lotteMode;
  const lotteFill = '#070505';
  const lotteEdge = 'rgba(232, 220, 196, 0.55)';
  const lotteConnector = 'rgba(236, 224, 198, 0.38)';
  const lotteJointFill = 'rgba(236, 224, 198, 0.9)';
  const lotteJointStroke = 'rgba(20, 12, 8, 0.7)';
  const viewX = viewWindow?.x ?? 0;
  const viewY = viewWindow?.y ?? 0;
  const viewWidth = viewWindow?.width ?? width;
  const viewHeight = viewWindow?.height ?? height;

  ctx.clearRect(0, 0, width, height);

  const vitruvianModel = createVitruvianGridModel({ totalHeight: 1 });
  const vitruvianPlot = createVitruvianPlotPayload(vitruvianModel);
  const plotWidth = vitruvianPlot.bounds.maxX - vitruvianPlot.bounds.minX;
  const plotHeight = vitruvianPlot.bounds.maxY - vitruvianPlot.bounds.minY;
  const gridTileHeight = vitruvianModel.square.height;
  const plotMinX = vitruvianPlot.bounds.minX;
  const plotMinY = vitruvianPlot.bounds.minY;
  const circleDiameter = vitruvianModel.circle.diameter;
  const headUnit = vitruvianModel.modules.head.unit;
  const circleVerticalBuffer = headUnit * 0.5;
  const scale = Math.min(viewWidth / plotWidth, viewHeight / (circleDiameter + circleVerticalBuffer * 2));
  const headGridSquarePx = headUnit * scale;
  const modelScale = gridOnlyMode
    ? headGridSquarePx / Math.max(HEAD_PIECE_MODEL_BOUNDS.width, HEAD_PIECE_MODEL_BOUNDS.height)
    : 1;
  const circleCenter = vitruvianModel.circle.center;
  const xOffset = viewX + viewWidth / 2 - (circleCenter.x - plotMinX) * scale;
  const yOffset = gridOnlyMode ? 0 : (circleCenter.y - plotMinY) * scale - viewHeight / 2 + viewY;
  const projectionCenter: [number, number] = [viewX + viewWidth / 2, viewY + viewHeight / 2];
  const projectionReferenceRotations =
    bitruviusData.POSES?.['T-Pose'] ??
    bitruviusData.POSES?.['Neutral'] ??
    bitruviusData.initialRotations;
  const leftHeelReference = computeWorld('l_heel', projectionReferenceRotations, projectionCenter);
  const rightHeelReference = computeWorld('r_heel', projectionReferenceRotations, projectionCenter);
  const referenceHeelY = Math.max(leftHeelReference.y, rightHeelReference.y);
  const referenceHeelProjectedY = projectionCenter[1] + (referenceHeelY - projectionCenter[1]) * modelScale;
  const gridGroundScreenY = viewY + viewHeight + yOffset;
  const modelYOffset = gridOnlyMode ? gridGroundScreenY - referenceHeelProjectedY : 0;
  const projectModelPoint = (x: number, y: number): { x: number; y: number } => ({
    x: projectionCenter[0] + (x - projectionCenter[0]) * modelScale,
    y: projectionCenter[1] + (y - projectionCenter[1]) * modelScale + modelYOffset,
  });
  const toScreen = (x: number, y: number): { x: number; y: number } => ({
    x: (x - plotMinX) * scale + xOffset,
    y: viewY + viewHeight - (y - plotMinY) * scale + yOffset,
  });

  const drawImageLayer = (layer: ImageLayerState | undefined) => {
    if (!layer || !layer.visible || !layer.src) {
      return;
    }
    const image = resolveLayerImage(layer.src);
    if (!image) {
      return;
    }

    const layerScale = clampScalePercent(layer.scale) / 100;
    const fitMode = layer.fitMode ?? 'free';
    const fitWidthScale = viewWidth / image.width;
    const fitHeightScale = viewHeight / image.height;
    const fitScaleBase = fitMode === 'cover'
      ? Math.max(fitWidthScale, fitHeightScale)
      : Math.min(fitWidthScale, fitHeightScale);
    const resolvedScale = fitMode === 'free' ? layerScale : fitScaleBase * layerScale;
    const drawWidth = image.width * resolvedScale;
    const drawHeight = image.height * resolvedScale;
    const centerX = viewX + (clampPercent(layer.x) / 100) * viewWidth;
    const centerY = viewY + (clampPercent(layer.y) / 100) * viewHeight;
    const drawX = centerX - drawWidth / 2;
    const drawY = centerY - drawHeight / 2;

    ctx.save();
    ctx.globalAlpha = clamp01(layer.opacity);
    ctx.globalCompositeOperation = layer.blendMode ?? 'source-over';
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
  };

  const drawFamily = (
    family: string,
    strokeStyle: string,
    lineWidth: number,
    dash: number[] = [],
    offsetX = 0,
    offsetY = 0
  ) => {
    const lines = vitruvianPlot.lines.filter((line) => line.family === family);
    if (!lines.length) {
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    lines.forEach((line) => {
      const a = toScreen(line.x1 + offsetX, line.y1 + offsetY);
      const b = toScreen(line.x2 + offsetX, line.y2 + offsetY);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    });
    ctx.stroke();
    ctx.restore();
  };

  if (activeVisualModules.background) {
    ctx.save();
    if (lotteMode) {
      const cx = viewX + viewWidth / 2;
      const cy = viewY + viewHeight / 2;
      const radius = Math.max(viewWidth, viewHeight);
      const gradient = ctx.createRadialGradient(cx, cy, radius * 0.15, cx, cy, radius * 0.95);
      gradient.addColorStop(0, 'rgba(248, 240, 219, 0.98)');
      gradient.addColorStop(0.62, 'rgba(233, 220, 188, 0.96)');
      gradient.addColorStop(1, 'rgba(182, 156, 115, 0.94)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = "rgba(248, 248, 252, 0.94)";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  drawImageLayer(backgroundLayer);

  const fingerLines = vitruvianPlot.lines.filter((line) => line.family === 'finger');
  const VERTICAL_FINGER_COLOR = lotteMode ? 'rgba(74, 56, 34, 0.26)' : 'rgba(44, 128, 135, 0.35)';
  const HORIZONTAL_FINGER_COLOR = lotteMode ? 'rgba(94, 72, 46, 0.24)' : 'rgba(116, 121, 42, 0.35)';
  const isVerticalLine = (line: VitruvianLine) => Math.abs(line.x1 - line.x2) < Number.EPSILON;
  const isHorizontalLine = (line: VitruvianLine) => Math.abs(line.y1 - line.y2) < Number.EPSILON;

  const drawFingerGridTile = (offsetX: number, offsetY: number) => {
    if (!fingerLines.length) return;
    fingerLines.forEach((line) => {
      const color = isVerticalLine(line) ? VERTICAL_FINGER_COLOR : HORIZONTAL_FINGER_COLOR;
      const a = toScreen(line.x1 + offsetX, line.y1 + offsetY);
      const b = toScreen(line.x2 + offsetX, line.y2 + offsetY);
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    });
  };

  const pixelToWorldX = (px: number) => (px - xOffset) / scale + plotMinX;
  const pixelToWorldY = (py: number) => plotMinY + (viewY + viewHeight + yOffset - py) / scale;
  const horizontalPadding = headUnit * 2;
  const minWorldX = pixelToWorldX(viewX) - horizontalPadding;
  const maxWorldX = pixelToWorldX(viewX + viewWidth) + horizontalPadding;
  const verticalPadding = headUnit * 2;
  const minWorldY = pixelToWorldY(viewY + viewHeight) - verticalPadding;
  const maxWorldY = pixelToWorldY(viewY) + verticalPadding;

  const minTileX = Math.floor((minWorldX - vitruvianPlot.bounds.minX) / plotWidth) - 1;
  const maxTileX = Math.ceil((maxWorldX - vitruvianPlot.bounds.minX) / plotWidth) + 1;
  const minTileY = Math.floor((minWorldY - vitruvianPlot.bounds.minY) / gridTileHeight) - 1;
  const maxTileY = Math.ceil((maxWorldY - vitruvianPlot.bounds.minY) / gridTileHeight) + 1;

  if (activeVisualModules.rings) {
    const ringColors = lotteMode
      ? ['rgba(128, 97, 62, 0.6)', 'rgba(160, 124, 81, 0.56)']
      : ['rgba(44, 128, 135, 0.7)', 'rgba(168, 85, 247, 0.75)'];
    const reachCircles = vitruvianPlot.circles
      .filter((circle) => circle.family === 'reach')
      .sort((a, b) => b.r - a.r);
    const ringVerticalOffset = vitruvianModel.modules.finger.unit * 0.5;

    reachCircles.forEach((circle, index) => {
      const center = toScreen(circle.cx, circle.cy + ringVerticalOffset);
      const snappedRadius = Math.round(circle.r / headUnit) * headUnit;
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = ringColors[index % ringColors.length];
      ctx.lineWidth = index === 0 ? 1.6 : 1;
      ctx.arc(center.x, center.y, snappedRadius * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  const renderFingerGridTile = (offsetX: number, offsetY: number) => {
    if (!activeVisualModules.fingerGrid) return;
    drawFingerGridTile(offsetX, offsetY);
  };

  const renderHeadGridTile = (offsetX: number, offsetY: number) => {
    if (!activeVisualModules.headGrid) return;
    drawFamily("head-x", lotteMode ? "rgba(122, 89, 57, 0.56)" : "rgba(186, 64, 141, 0.68)", 1, [], offsetX, offsetY);
    drawFamily("head-y", lotteMode ? "rgba(98, 73, 48, 0.56)" : "rgba(92, 103, 255, 0.64)", 1, [], offsetX, offsetY);
    drawFamily("square", lotteMode ? "rgba(143, 120, 84, 0.54)" : "rgba(148, 163, 184, 0.72)", 1.6, [], offsetX, offsetY);
    drawFamily("centerline", lotteMode ? "rgba(114, 62, 40, 0.64)" : "rgba(239, 68, 68, 0.75)", 1.4, [6, 4], offsetX, offsetY);
  };

  for (let tx = minTileX; tx <= maxTileX; tx += 1) {
    for (let ty = minTileY; ty <= maxTileY; ty += 1) {
      const offsetX = tx * plotWidth;
      const offsetY = ty * gridTileHeight;
      renderFingerGridTile(offsetX, offsetY);
    }
  }

  for (let tx = minTileX; tx <= maxTileX; tx += 1) {
    for (let ty = minTileY; ty <= maxTileY; ty += 1) {
      const offsetX = tx * plotWidth;
      const offsetY = ty * gridTileHeight;
      renderHeadGridTile(offsetX, offsetY);
    }
  }

  const center: [number, number] = projectionCenter;

  const drawSkeletonLayer = (
    rots: SkeletonRotations,
    opts: { opacity?: number; tint?: 'past' | 'future'; drawLabels?: boolean; drawShadows?: boolean }
  ) => {
    const { opacity = 1, tint, drawLabels = true, drawShadows = true } = opts;
    const posMap: { [id: string]: { x: number; y: number } } = {};
    bitruviusData.HIERARCHY.forEach(([id]) => {
      const t = computeWorld(id, rots, center);
      posMap[id] = projectModelPoint(t.x, t.y);
    });

    ctx.save();
    if (opacity < 1) ctx.globalAlpha = opacity;

    const fillColor = tint === 'past'
      ? PAST_TINT
      : tint === 'future'
        ? FUTURE_TINT
        : (silhouetteActive ? (lotteMode ? lotteFill : "#000000") : undefined);
    const strokeColor = tint === 'past'
      ? PAST_TINT
      : tint === 'future'
        ? FUTURE_TINT
        : (silhouetteActive ? (lotteMode ? lotteEdge : "#000000") : "rgba(0,0,0,0.5)");

    const drawShapesForRots = (isShadow: boolean) => {
      bitruviusData.RENDER_ORDER.forEach(id => {
        const shape = bitruviusData.SHAPES[id];
        if (!shape || shape.type === "none") return;
        const pos = posMap[id];
        const t = computeWorld(id, rots, center);
        ctx.save();
        if (isShadow && drawShadows) {
          ctx.translate(pos.x + SHADOW_OFFSET.x, pos.y + SHADOW_OFFSET.y);
          ctx.fillStyle = SHADOW_COLOR;
          ctx.strokeStyle = "transparent";
        } else {
          ctx.translate(pos.x, pos.y);
          ctx.fillStyle = fillColor ?? (silhouetteActive ? (lotteMode ? lotteFill : "#000000") : bitruviusData.JOINT_DEFS[id].color);
          ctx.strokeStyle = strokeColor ?? (silhouetteActive ? (lotteMode ? lotteEdge : "#000000") : "rgba(0,0,0,0.5)");
        }
        ctx.rotate(d2r(t.angle));
        ctx.scale(modelScale, modelScale);
        ctx.beginPath();
        if (shape.type === "torso") torsoHeart(ctx);
        else if (shape.type === "torsoWaistPivot") { ctx.translate(0, -58); torsoHeart(ctx); }
        else if (shape.type === "waist") waistCircle(ctx, shape.r ?? 20);
        else if (shape.type === "collar") collarShape(ctx);
        else if (shape.type === "neck") neckShape(ctx);
        else if (shape.type === "customTorsoHead") { ctx.translate(0, -24.8); ctx.scale(0.6, 0.6); torsoHeart(ctx); }
        else if (shape.type === "arm") armBlade(ctx, shape.len!, shape.rPivot!, shape.rTip!, shape.dir!);
        else if (shape.type === "hand") handShape(ctx, shape.r!, shape.rt!, shape.dir!);
        else if (shape.type === "leg") legCapsule(ctx, shape.len!, shape.rTop!, shape.rBot!);
        else if (shape.type === "foot") footSpike(ctx, shape.len!, shape.r!);
        ctx.fill();
        if (!isShadow || !drawShadows) ctx.stroke();
        ctx.restore();
      });
    };

    drawShapesForRots(false);

    bitruviusData.HIERARCHY.forEach(([id]) => {
      const jDef = bitruviusData.JOINT_DEFS[id];
      if (!jDef || !jDef.parent) return;
      const pPos = posMap[jDef.parent], cPos = posMap[id];
      if (!pPos || !cPos) return;
      ctx.beginPath();
      ctx.moveTo(pPos.x, pPos.y); ctx.lineTo(cPos.x, cPos.y);
      ctx.strokeStyle = fillColor ?? (silhouetteActive ? (lotteMode ? lotteConnector : "rgba(255, 255, 255, 0.4)") : "rgba(255, 255, 255, 0.6)");
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    bitruviusData.HIERARCHY.forEach(([id]) => {
      const pos = posMap[id];
      if (id === "root") {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = fillColor ?? (lotteMode ? lotteJointStroke : "#000000");
        ctx.fill();
      } else if (id !== "nose") {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, opts.drawShadows && mocapMode ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = fillColor ?? (lotteMode ? lotteJointFill : "#222222");
        ctx.strokeStyle = fillColor ?? (lotteMode ? lotteJointStroke : "#ffffff");
        ctx.lineWidth = 1;
        ctx.fill();
        if (!tint) ctx.stroke();
      }
    });

    ctx.restore();
  };

  if (ghostFrames && ghostFrames.length > 0) {
    const past = ghostFrames.filter(g => g.tint === 'past');
    const future = ghostFrames.filter(g => g.tint === 'future');
    [...past, ...future].forEach(g => {
      drawSkeletonLayer(g.rotations, {
        opacity: g.opacity,
        tint: g.tint,
        drawLabels: false,
        drawShadows: false
      });
    });
  }

  const positions: { [id: string]: { x: number; y: number } } = {};
  bitruviusData.HIERARCHY.forEach(([id]) => {
    const t = computeWorld(id, rotations, center);
    positions[id] = projectModelPoint(t.x, t.y);
  });

  if (!gridOnlyMode) {
    bitruviusData.HIERARCHY.forEach(([id]) => {
      const jDef = bitruviusData.JOINT_DEFS[id];
      if (!jDef || !jDef.parent || jDef.parent === "root") return;
      const pPos = positions[jDef.parent], cPos = positions[id];
      if (!pPos || !cPos) return;
      const mx = (pPos.x + cPos.x) / 2, my = (pPos.y + cPos.y) / 2;
      const ang = Math.atan2(cPos.y - pPos.y, cPos.x - pPos.x);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(ang);
      ctx.fillStyle = lotteMode ? "rgba(91, 62, 36, 0.72)" : "#a855f7";
      ctx.font = "bold 7px monospace";
      ctx.textAlign = "center";
      ctx.fillText(jDef.label.split('_')[0], 0, -3);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(pPos.x, pPos.y); ctx.lineTo(cPos.x, cPos.y);
      ctx.strokeStyle = lotteMode ? "rgba(102, 78, 47, 0.16)" : "rgba(168, 85, 247, 0.12)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });
  }

  if (headGridHover?.occludedByModel) {
    const label = headGridHover.label;
    const anchor = positions.head ?? positions.neck ?? { x: viewX + viewWidth - 180, y: viewY + 24 };
    ctx.save();
    ctx.font = "bold 9px monospace";
    const textWidth = ctx.measureText(label).width;
    const labelX = Math.max(viewX + 8, Math.min(viewX + viewWidth - textWidth - 8, anchor.x + 14));
    const labelY = Math.max(viewY + 14, anchor.y - 20);
    ctx.fillStyle = lotteMode ? "rgba(63, 43, 24, 0.5)" : "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(labelX - 4, labelY - 9, textWidth + 8, 14);
    ctx.fillStyle = lotteMode ? "rgba(247, 232, 205, 0.94)" : "#a855f7";
    ctx.textAlign = "left";
    ctx.fillText(label, labelX, labelY + 1);
    ctx.restore();
  }

  const drawShapes = (isShadow: boolean) => {
    bitruviusData.RENDER_ORDER.forEach(id => {
      const shape = bitruviusData.SHAPES[id];
      if (!shape || shape.type === "none") return;
      const pos = positions[id];
      const t = computeWorld(id, rotations, center);
      ctx.save();
      if (isShadow) {
        ctx.translate(pos.x + SHADOW_OFFSET.x, pos.y + SHADOW_OFFSET.y);
        ctx.fillStyle = SHADOW_COLOR;
        ctx.strokeStyle = "transparent";
      } else {
        ctx.translate(pos.x, pos.y);
        ctx.fillStyle = silhouetteActive ? (lotteMode ? lotteFill : "#000000") : bitruviusData.JOINT_DEFS[id].color;
        ctx.strokeStyle = silhouetteActive ? (lotteMode ? lotteEdge : "#000000") : "rgba(0,0,0,0.5)";
      }
      ctx.rotate(d2r(t.angle));
      ctx.scale(modelScale, modelScale);
      ctx.beginPath();
      if (shape.type === "torso") torsoHeart(ctx);
      else if (shape.type === "torsoWaistPivot") { ctx.translate(0, -58); torsoHeart(ctx); }
      else if (shape.type === "waist") waistCircle(ctx);
      else if (shape.type === "collar") collarShape(ctx);
      else if (shape.type === "neck") neckShape(ctx);
      else if (shape.type === "customTorsoHead") { ctx.translate(0, -24.8); ctx.scale(0.6, 0.6); torsoHeart(ctx); }
      else if (shape.type === "arm") armBlade(ctx, shape.len!, shape.rPivot!, shape.rTip!, shape.dir!);
      else if (shape.type === "hand") handShape(ctx, shape.r!, shape.rt!, shape.dir!);
      else if (shape.type === "leg") legCapsule(ctx, shape.len!, shape.rTop!, shape.rBot!);
      else if (shape.type === "foot") footSpike(ctx, shape.len!, shape.r!);
      ctx.fill();
      if (!isShadow) ctx.stroke();
      ctx.restore();
    });
  };

  drawShapes(false);

  bitruviusData.HIERARCHY.forEach(([id]) => {
    const jDef = bitruviusData.JOINT_DEFS[id];
    if (!jDef || !jDef.parent) return;
    const pPos = positions[jDef.parent], cPos = positions[id];
    if (!pPos || !cPos) return;
    ctx.beginPath();
    ctx.moveTo(pPos.x, pPos.y); ctx.lineTo(cPos.x, cPos.y);
    ctx.strokeStyle = silhouetteActive
      ? (lotteMode ? lotteConnector : "rgba(255, 255, 255, 0.4)")
      : "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  bitruviusData.HIERARCHY.forEach(([id]) => {
    const pos = positions[id];
    if (id === "root") {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = lotteMode ? lotteJointStroke : "#000000";
      ctx.fill();
    } else if (id !== "nose") {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, mocapMode ? 5 : 3, 0, Math.PI * 2);
      
      if (mocapMode) {
        ctx.fillStyle = lotteMode ? lotteJointFill : "#ffffff";
        ctx.shadowBlur = 10;
        ctx.shadowColor = lotteMode ? "rgba(235, 220, 190, 0.72)" : "rgba(255, 255, 255, 0.8)";
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = lotteMode ? lotteJointStroke : "#000000";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = lotteMode ? lotteJointFill : "#222222";
        ctx.strokeStyle = lotteMode ? lotteJointStroke : "#ffffff";
        ctx.lineWidth = 1;
        ctx.fill(); ctx.stroke();
      }
    }
  });

  if (!gridOnlyMode && showIkDebugOverlay) {
    Object.entries(ikTargets).forEach(([, tgt]) => {
      const projected = projectModelPoint(tgt.x, tgt.y);
      ctx.beginPath();
      ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 1;
      ctx.moveTo(projected.x - 10, projected.y); ctx.lineTo(projected.x + 10, projected.y);
      ctx.moveTo(projected.x, projected.y - 10); ctx.lineTo(projected.x, projected.y + 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, 4, 0, Math.PI * 2); ctx.stroke();
    });
  }

  drawImageLayer(foregroundLayer);

  if (lotteMode) {
    ctx.save();

    const vignette = ctx.createRadialGradient(
      viewX + viewWidth / 2,
      viewY + viewHeight / 2,
      Math.min(viewWidth, viewHeight) * 0.16,
      viewX + viewWidth / 2,
      viewY + viewHeight / 2,
      Math.max(viewWidth, viewHeight) * 0.92
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(0.72, 'rgba(58, 38, 21, 0.18)');
    vignette.addColorStop(1, 'rgba(22, 14, 8, 0.52)');
    ctx.fillStyle = vignette;
    ctx.fillRect(viewX, viewY, viewWidth, viewHeight);

    ctx.globalAlpha = 0.14;
    ctx.fillStyle = 'rgba(88, 62, 36, 0.55)';
    for (let index = 0; index < 68; index += 1) {
      const x = viewX + (((index * 73) % 997) / 997) * viewWidth;
      const y = viewY + (((index * 53) % 991) / 991) * viewHeight;
      const r = ((index * 31) % 7 === 0) ? 1.2 : 0.6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 0.11;
    ctx.fillStyle = 'rgba(61, 41, 22, 0.6)';
    for (let line = 0; line < 7; line += 1) {
      const y = viewY + (((line * 149) % 887) / 887) * viewHeight;
      ctx.fillRect(viewX + 10, y, Math.max(0, viewWidth - 20), 0.8);
    }

    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(38, 24, 12, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(viewX + 1, viewY + 1, Math.max(0, viewWidth - 2), Math.max(0, viewHeight - 2));

    ctx.restore();
  }
};
