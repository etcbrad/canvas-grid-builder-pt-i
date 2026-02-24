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

const round = (value: number): number => Number(value.toFixed(7));

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
