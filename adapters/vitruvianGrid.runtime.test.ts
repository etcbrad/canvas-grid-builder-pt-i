import { describe, expect, it } from 'vitest';
import { createVitruvianRuntimeGeometry } from './vitruvianGrid';

describe('createVitruvianRuntimeGeometry', () => {
  const viewWindow = { x: 32, y: 24, width: 960, height: 720 };

  it('round-trips world and screen coordinates', () => {
    const geometry = createVitruvianRuntimeGeometry({
      viewWindow,
      gridOnlyMode: false,
      referenceHeelY: 360,
    });
    const sampleWorldPoints = [
      { x: -0.5, y: 0 },
      { x: 0, y: 0.5 },
      { x: 0.5, y: 1 },
      { x: 0.1, y: 0.23 },
    ];

    sampleWorldPoints.forEach(({ x, y }) => {
      const screen = geometry.worldToScreen(x, y);
      const nextWorld = geometry.screenToWorld(screen.x, screen.y);
      expect(nextWorld.x).toBeCloseTo(x, 6);
      expect(nextWorld.y).toBeCloseTo(y, 6);
    });
  });

  it('anchors reference heel projection to the grid baseline in grid-only mode', () => {
    const referenceHeelY = 410;
    const geometry = createVitruvianRuntimeGeometry({
      viewWindow,
      gridOnlyMode: true,
      referenceHeelY,
    });
    const projectedHeel = geometry.projectModelPoint(geometry.center.x, referenceHeelY);
    expect(projectedHeel.y).toBeCloseTo(geometry.gridGroundScreenY, 6);
  });

  it('keeps head-grid square and ring spacing consistent', () => {
    const geometry = createVitruvianRuntimeGeometry({
      viewWindow,
      gridOnlyMode: true,
      referenceHeelY: 380,
    });

    expect(geometry.headGridSquarePx).toBeCloseTo(geometry.headUnit * geometry.gridScale, 6);
    expect(geometry.ringVerticalOffsetWorld).toBeCloseTo(geometry.model.modules.finger.unit * 0.5, 6);

    const innerRadii = geometry.plot.circles
      .filter((circle) => circle.key.startsWith('navel-reach-ring-'))
      .map((circle) => circle.r)
      .sort((a, b) => a - b);
    expect(innerRadii.length).toBeGreaterThan(1);

    innerRadii.slice(1).forEach((radius, index) => {
      expect(radius - innerRadii[index]).toBeCloseTo(geometry.ringStepWorld, 6);
    });
  });
});
