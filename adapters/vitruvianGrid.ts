export type NormalizedPoint = {
  x: number;
  y: number;
};

export type SquareDefinition = {
  width: number;
  height: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  center: NormalizedPoint;
};

export type ModularGridDefinition = {
  unit: number;
  divisions: number;
  lines: number[];
};

export type BenchmarkLines = {
  crown: number;
  chin: number;
  genitals: number;
  navel: number;
  knees: number;
  ground: number;
  hairline: number;
  brows: number;
  noseBase: number;
  faceThirds: {
    chinToNose: number;
    noseToBrows: number;
    browsToHairline: number;
  };
};

export type ReachCircle = {
  center: NormalizedPoint;
  radius: number;
  diameter: number;
  equation: {
    cx: number;
    cy: number;
    r: number;
  };
};

export type VitruvianGridModel = {
  totalHeight: number;
  axes: {
    groundY: number;
    crownY: number;
    centerlineX: number;
  };
  modules: {
    head: ModularGridDefinition;
    cubit: ModularGridDefinition;
    foot: ModularGridDefinition;
    palm: ModularGridDefinition;
    finger: ModularGridDefinition;
  };
  square: SquareDefinition;
  benchmarks: BenchmarkLines;
  circle: ReachCircle;
};

export type VitruvianLineFamily =
  | "square"
  | "centerline"
  | "head-x"
  | "head-y"
  | "cubit"
  | "foot"
  | "palm"
  | "finger"
  | "benchmark";

export type VitruvianLine = {
  kind: "line";
  family: VitruvianLineFamily;
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type VitruvianCircle = {
  kind: "circle";
  family: "reach";
  key: string;
  cx: number;
  cy: number;
  r: number;
};

export type VitruvianPlotPayload = {
  lines: VitruvianLine[];
  circles: VitruvianCircle[];
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
};

export type VitruvianGridOptions = {
  totalHeight?: number;
  navelRatio?: number;
};

export type VitruvianViewportInput = {
  viewWindow: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  gridOnlyMode?: boolean;
  referenceHeelY?: number | null;
  modelBounds?: {
    width: number;
    height: number;
  };
};

export type VitruvianHeadGridCellSample = {
  label: string;
  tileX: number;
  tileY: number;
  cellX: number;
  cellY: number;
  lineAxis: "x" | "y" | "xy" | "none";
  worldX: number;
  worldY: number;
  localX: number;
  localY: number;
};

export type VitruvianRuntimeGeometry = {
  model: VitruvianGridModel;
  plot: VitruvianPlotPayload;
  viewWindow: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  center: NormalizedPoint;
  plotWidth: number;
  plotHeight: number;
  plotMinX: number;
  plotMinY: number;
  plotMaxX: number;
  plotMaxY: number;
  gridTileHeight: number;
  headUnit: number;
  ringStepWorld: number;
  ringVerticalOffsetWorld: number;
  circleDiameter: number;
  circleVerticalBuffer: number;
  gridScale: number;
  headGridSquarePx: number;
  modelBounds: {
    width: number;
    height: number;
  };
  modelScale: number;
  modelYOffset: number;
  xOffset: number;
  yOffset: number;
  gridGroundScreenY: number;
  worldToScreen: (worldX: number, worldY: number) => NormalizedPoint;
  screenToWorld: (screenX: number, screenY: number) => NormalizedPoint;
  projectModelPoint: (worldX: number, worldY: number) => NormalizedPoint;
  unprojectModelPoint: (screenX: number, screenY: number) => NormalizedPoint;
  resolveHeadGridCell: (screenX: number, screenY: number) => VitruvianHeadGridCellSample;
};

export const HEAD_PIECE_MODEL_BOUNDS = {
  width: 52.8,
  height: 54,
};

const round = (value: number): number => Number(value.toFixed(7));
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const createLineSeries = (totalHeight: number, divisions: number): number[] => {
  const unit = totalHeight / divisions;
  return Array.from({ length: divisions + 1 }, (_, i) => round(unit * i));
};

const createModularGrid = (totalHeight: number, divisions: number): ModularGridDefinition => ({
  unit: round(totalHeight / divisions),
  divisions,
  lines: createLineSeries(totalHeight, divisions),
});

export const createVitruvianGridModel = (
  options: VitruvianGridOptions = {}
): VitruvianGridModel => {
  const totalHeight = options.totalHeight ?? 1;
  const navelRatio = options.navelRatio ?? 0.618;

  const halfWidth = totalHeight / 2;
  const headHeight = totalHeight / 8;
  const faceHeight = totalHeight / 10;
  const faceThird = faceHeight / 3;
  const crownY = totalHeight;
  const chinY = crownY - headHeight;
  const hairlineY = chinY + faceHeight;
  const browsY = chinY + faceThird * 2;
  const noseBaseY = chinY + faceThird;
  const navelY = totalHeight * navelRatio;

  return {
    totalHeight,
    axes: {
      groundY: 0,
      crownY,
      centerlineX: 0,
    },
    modules: {
      head: createModularGrid(totalHeight, 8),
      cubit: createModularGrid(totalHeight, 4),
      foot: createModularGrid(totalHeight, 6),
      palm: createModularGrid(totalHeight, 24),
      finger: createModularGrid(totalHeight, 96),
    },
    square: {
      width: totalHeight,
      height: totalHeight,
      bounds: {
        minX: -halfWidth,
        maxX: halfWidth,
        minY: 0,
        maxY: totalHeight,
      },
      center: { x: 0, y: totalHeight / 2 },
    },
    benchmarks: {
      crown: crownY,
      chin: chinY,
      genitals: totalHeight / 2,
      navel: navelY,
      knees: totalHeight / 4,
      ground: 0,
      hairline: hairlineY,
      brows: browsY,
      noseBase: noseBaseY,
      faceThirds: {
        chinToNose: faceThird,
        noseToBrows: faceThird,
        browsToHairline: faceThird,
      },
    },
    circle: {
      center: { x: 0, y: navelY },
      radius: navelY,
      diameter: navelY * 2,
      equation: {
        cx: 0,
        cy: navelY,
        r: navelY,
      },
    },
  };
};

const createHorizontalLines = (
  family: Exclude<VitruvianLineFamily, "centerline">,
  keyPrefix: string,
  ys: number[],
  minX: number,
  maxX: number
): VitruvianLine[] =>
  ys.map((y, i) => ({
    kind: "line",
    family,
    key: `${keyPrefix}-${i}`,
    x1: minX,
    y1: y,
    x2: maxX,
    y2: y,
  }));

const createVerticalLines = (
  family: Exclude<VitruvianLineFamily, "centerline">,
  keyPrefix: string,
  xs: number[],
  minY: number,
  maxY: number
): VitruvianLine[] =>
  xs.map((x, i) => ({
    kind: "line",
    family,
    key: `${keyPrefix}-${i}`,
    x1: x,
    y1: minY,
    x2: x,
    y2: maxY,
  }));

export const createVitruvianPlotPayload = (
  model: VitruvianGridModel
): VitruvianPlotPayload => {
  const { square, modules, circle } = model;
  const { minX, maxX, minY, maxY } = square.bounds;
  const headVerticalXs = Array.from(
    { length: modules.head.divisions + 1 },
    (_, index) => round(minX + modules.head.unit * index)
  );

  const fingerVerticalXs = Array.from(
    { length: modules.finger.divisions + 1 },
    (_, index) => round(minX + modules.finger.unit * index)
  );

  const lines: VitruvianLine[] = [
    ...createHorizontalLines("head-x", "head-x", modules.head.lines, minX, maxX),
    ...createVerticalLines("head-y", "head-y", headVerticalXs, minY, maxY),
    ...createHorizontalLines("finger", "finger", modules.finger.lines, minX, maxX),
    ...createVerticalLines("finger", "finger-v", fingerVerticalXs, minY, maxY),
    {
      kind: "line",
      family: "square",
      key: "square-left",
      x1: minX,
      y1: minY,
      x2: minX,
      y2: maxY,
    },
    {
      kind: "line",
      family: "square",
      key: "square-right",
      x1: maxX,
      y1: minY,
      x2: maxX,
      y2: maxY,
    },
    {
      kind: "line",
      family: "square",
      key: "square-bottom",
      x1: minX,
      y1: minY,
      x2: maxX,
      y2: minY,
    },
    {
      kind: "line",
      family: "square",
      key: "square-top",
      x1: minX,
      y1: maxY,
      x2: maxX,
      y2: maxY,
    },
    {
      kind: "line",
      family: "centerline",
      key: "body-centerline",
      x1: model.axes.centerlineX,
      y1: minY,
      x2: model.axes.centerlineX,
      y2: Math.max(maxY, circle.center.y + circle.radius),
    },
  ];

  const ringStep = modules.head.unit;
  const innerRingRadii = Array.from(
    { length: Math.floor((circle.radius - Number.EPSILON) / ringStep) },
    (_, index) => round((index + 1) * ringStep)
  ).filter((radius) => radius < circle.radius);

  const circles: VitruvianCircle[] = [
    {
      kind: "circle",
      family: "reach",
      key: "navel-reach-max",
      cx: circle.center.x,
      cy: circle.center.y,
      r: circle.radius,
    },
    ...innerRingRadii.map((radius, index) => ({
      kind: "circle" as const,
      family: "reach" as const,
      key: `navel-reach-ring-${index + 1}`,
      cx: circle.center.x,
      cy: circle.center.y,
      r: radius,
    })),
  ];

  return {
    lines,
    circles,
    bounds: {
      minX,
      maxX,
      minY,
      maxY: Math.max(maxY, circle.center.y + circle.radius),
    },
  };
};

const DEFAULT_VITRUVIAN_MODEL = createVitruvianGridModel({ totalHeight: 1 });
const DEFAULT_VITRUVIAN_PLOT = createVitruvianPlotPayload(DEFAULT_VITRUVIAN_MODEL);

export const createVitruvianRuntimeGeometry = (
  input: VitruvianViewportInput
): VitruvianRuntimeGeometry => {
  const { viewWindow, gridOnlyMode = false, referenceHeelY = null } = input;
  const modelBounds = input.modelBounds ?? HEAD_PIECE_MODEL_BOUNDS;
  const model = DEFAULT_VITRUVIAN_MODEL;
  const plot = DEFAULT_VITRUVIAN_PLOT;

  const plotWidth = plot.bounds.maxX - plot.bounds.minX;
  const plotHeight = plot.bounds.maxY - plot.bounds.minY;
  const plotMinX = plot.bounds.minX;
  const plotMinY = plot.bounds.minY;
  const plotMaxX = plot.bounds.maxX;
  const plotMaxY = plot.bounds.maxY;
  const gridTileHeight = model.square.height;
  const headUnit = model.modules.head.unit;
  const ringStepWorld = model.modules.head.unit;
  const ringVerticalOffsetWorld = model.modules.finger.unit * 0.5;
  const circleDiameter = model.circle.diameter;
  const circleVerticalBuffer = headUnit * 0.5;
  const gridScale = Math.min(
    viewWindow.width / plotWidth,
    viewWindow.height / (circleDiameter + circleVerticalBuffer * 2)
  );
  const headGridSquarePx = headUnit * gridScale;
  const modelScale = gridOnlyMode
    ? headGridSquarePx / Math.max(modelBounds.width, modelBounds.height)
    : 1;
  const center = {
    x: viewWindow.x + viewWindow.width / 2,
    y: viewWindow.y + viewWindow.height / 2,
  };
  const xOffset = center.x - (model.circle.center.x - plotMinX) * gridScale;
  const yOffset = gridOnlyMode
    ? 0
    : (model.circle.center.y - plotMinY) * gridScale - viewWindow.height / 2 + viewWindow.y;
  const gridGroundScreenY = viewWindow.y + viewWindow.height + yOffset;
  const hasReferenceHeel = Number.isFinite(referenceHeelY as number);
  const referenceHeelProjectedY = hasReferenceHeel
    ? center.y + ((referenceHeelY as number) - center.y) * modelScale
    : 0;
  const modelYOffset = gridOnlyMode && hasReferenceHeel
    ? gridGroundScreenY - referenceHeelProjectedY
    : 0;

  const worldToScreen = (worldX: number, worldY: number): NormalizedPoint => ({
    x: (worldX - plotMinX) * gridScale + xOffset,
    y: viewWindow.y + viewWindow.height - (worldY - plotMinY) * gridScale + yOffset,
  });

  const screenToWorld = (screenX: number, screenY: number): NormalizedPoint => ({
    x: (screenX - xOffset) / gridScale + plotMinX,
    y: plotMinY + (viewWindow.y + viewWindow.height + yOffset - screenY) / gridScale,
  });

  const projectModelPoint = (worldX: number, worldY: number): NormalizedPoint => ({
    x: center.x + (worldX - center.x) * modelScale,
    y: center.y + (worldY - center.y) * modelScale + modelYOffset,
  });

  const unprojectModelPoint = (screenX: number, screenY: number): NormalizedPoint => ({
    x: center.x + (screenX - center.x) / modelScale,
    y: center.y + (screenY - center.y - modelYOffset) / modelScale,
  });

  const resolveHeadGridCell = (screenX: number, screenY: number): VitruvianHeadGridCellSample => {
    const { x: worldX, y: worldY } = screenToWorld(screenX, screenY);
    const tileX = Math.floor((worldX - plotMinX) / plotWidth);
    const tileY = Math.floor((worldY - plotMinY) / gridTileHeight);
    const localX = worldX - (plotMinX + tileX * plotWidth);
    const localY = worldY - (plotMinY + tileY * gridTileHeight);
    const cellX = clamp(Math.floor(localX / headUnit), 0, 7);
    const rowFromGround = clamp(Math.floor(localY / headUnit), 0, 7);
    const cellY = 7 - rowFromGround;
    const nearestLineX = Math.round(localX / headUnit) * headUnit;
    const nearestLineY = Math.round(localY / headUnit) * headUnit;
    const lineX = Math.abs(localX - nearestLineX) * gridScale <= 6;
    const lineY = Math.abs(localY - nearestLineY) * gridScale <= 6;
    const lineAxis: "x" | "y" | "xy" | "none" =
      lineX && lineY ? "xy" : lineX ? "x" : lineY ? "y" : "none";
    const lineSuffix = lineAxis === "none" ? "" : ` • ${lineAxis.toUpperCase()} line`;
    return {
      label: `Head Grid T(${tileX},${tileY}) C(${cellX},${cellY})${lineSuffix}`,
      tileX,
      tileY,
      cellX,
      cellY,
      lineAxis,
      worldX,
      worldY,
      localX,
      localY,
    };
  };

  return {
    model,
    plot,
    viewWindow,
    center,
    plotWidth,
    plotHeight,
    plotMinX,
    plotMinY,
    plotMaxX,
    plotMaxY,
    gridTileHeight,
    headUnit,
    ringStepWorld,
    ringVerticalOffsetWorld,
    circleDiameter,
    circleVerticalBuffer,
    gridScale,
    headGridSquarePx,
    modelBounds,
    modelScale,
    modelYOffset,
    xOffset,
    yOffset,
    gridGroundScreenY,
    worldToScreen,
    screenToWorld,
    projectModelPoint,
    unprojectModelPoint,
    resolveHeadGridCell,
  };
};
