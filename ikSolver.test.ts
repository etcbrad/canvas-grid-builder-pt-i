import { describe, expect, it } from 'vitest';
import { bitruviusData, SkeletonRotations, WorldCoords } from './modelData';
import { solveIK_AdvancedWithResult } from './ikSolver';
import { d2r, r2d, normA } from './utils';

const computeWorld = (
  jointId: string,
  rotations: SkeletonRotations,
  canvasCenter: [number, number]
): WorldCoords => {
  const path: string[] = [];
  let current: string | null = jointId;
  while (current) {
    path.unshift(current);
    current = bitruviusData.JOINT_DEFS[current]?.parent ?? null;
  }

  let wx = canvasCenter[0];
  let wy = canvasCenter[1];
  let wa = d2r(rotations.root ?? 0);
  let parentAngle = wa;

  for (const joint of path) {
    if (joint === 'root') {
      parentAngle = wa;
      continue;
    }
    const def = bitruviusData.JOINT_DEFS[joint];
    const c = Math.cos(wa);
    const s = Math.sin(wa);
    wx += def.pivot[0] * c - def.pivot[1] * s;
    wy += def.pivot[0] * s + def.pivot[1] * c;
    parentAngle = wa;
    wa += d2r(rotations[joint] ?? 0);
  }

  return { x: wx, y: wy, angle: normA(r2d(wa)), parentAngle: normA(r2d(parentAngle)) };
};

const segmentDistance = (a: string, b: string, rotations: SkeletonRotations): number => {
  const aw = computeWorld(a, rotations, [0, 0]);
  const bw = computeWorld(b, rotations, [0, 0]);
  return Math.hypot(bw.x - aw.x, bw.y - aw.y);
};

describe('ikSolver regression', () => {
  (['fabrik', 'ccd', 'hybrid'] as const).forEach((solverId) => {
    it(`supports ${solverId} arm solve with finite rotations`, () => {
      const base = { ...bitruviusData.POSES['T-Pose'] };
      const shoulder = computeWorld('l_shoulder', base, [0, 0]);
      const target = { x: shoulder.x + 22, y: shoulder.y + 12 };
      const result = solveIK_AdvancedWithResult(
        'l_arm',
        target.x,
        target.y,
        base,
        [0, 0],
        bitruviusData,
        computeWorld,
        {
          solver: solverId,
          enforceJointLimits: false,
          damping: 0,
        }
      );
      expect(result.success).toBe(true);
      expect(Object.values(result.rotations).every((v) => Number.isFinite(v))).toBe(true);
      expect(Math.abs((result.rotations.l_shoulder ?? 0) - (base.l_shoulder ?? 0))).toBeGreaterThan(0.5);
    });
  });

  it('drives shoulder, elbow, and wrist when hand target is dragged', () => {
    const base = { ...bitruviusData.POSES['T-Pose'] };
    const shoulder = computeWorld('l_shoulder', base, [0, 0]);
    const target = { x: shoulder.x + 12, y: shoulder.y + 8 };

    const result = solveIK_AdvancedWithResult(
      'l_arm',
      target.x,
      target.y,
      base,
      [0, 0],
      bitruviusData,
      computeWorld,
      {
        enforceJointLimits: false,
        damping: 0,
      }
    );

    expect(result.success).toBe(true);
    expect(Math.abs((result.rotations.l_shoulder ?? 0) - (base.l_shoulder ?? 0))).toBeGreaterThan(1);
    expect(Math.abs((result.rotations.l_elbow ?? 0) - (base.l_elbow ?? 0))).toBeGreaterThan(1);
    expect(Math.abs((result.rotations.l_palm ?? 0) - (base.l_palm ?? 0))).toBeGreaterThan(0.25);
  });

  it('preserves limb segment lengths when solving arm chain', () => {
    const base = { ...bitruviusData.POSES['T-Pose'] };
    const baseEffector = computeWorld('l_palm', base, [0, 0]);
    const target = { x: baseEffector.x - 35, y: baseEffector.y + 30 };

    const beforeUpper = segmentDistance('l_shoulder', 'l_elbow', base);
    const beforeLower = segmentDistance('l_elbow', 'l_palm', base);

    (['fabrik', 'ccd', 'hybrid'] as const).forEach((solver) => {
      const result = solveIK_AdvancedWithResult(
        'l_arm',
        target.x,
        target.y,
        base,
        [0, 0],
        bitruviusData,
        computeWorld,
        { solver }
      );

      expect(result.success).toBe(true);
      const afterUpper = segmentDistance('l_shoulder', 'l_elbow', result.rotations);
      const afterLower = segmentDistance('l_elbow', 'l_palm', result.rotations);

      expect(Math.abs(afterUpper - beforeUpper)).toBeLessThan(0.7);
      expect(Math.abs(afterLower - beforeLower)).toBeLessThan(0.7);
    });
  });

  it('applies symmetric max-reach behavior for left/right arm chains', () => {
    const base = { ...bitruviusData.POSES['T-Pose'] };
    const leftShoulder = computeWorld('l_shoulder', base, [0, 0]);
    const rightShoulder = computeWorld('r_shoulder', base, [0, 0]);
    const leftEff = computeWorld('l_palm', base, [0, 0]);
    const rightEff = computeWorld('r_palm', base, [0, 0]);

    const leftTarget = { x: leftEff.x - 1000, y: leftEff.y };
    const rightTarget = { x: rightEff.x + 1000, y: rightEff.y };

    const leftSolve = solveIK_AdvancedWithResult(
      'l_arm',
      leftTarget.x,
      leftTarget.y,
      base,
      [0, 0],
      bitruviusData,
      computeWorld
    );
    const rightSolve = solveIK_AdvancedWithResult(
      'r_arm',
      rightTarget.x,
      rightTarget.y,
      base,
      [0, 0],
      bitruviusData,
      computeWorld
    );

    expect(leftSolve.success).toBe(true);
    expect(rightSolve.success).toBe(true);

    const leftSolvedEff = computeWorld('l_palm', leftSolve.rotations, [0, 0]);
    const rightSolvedEff = computeWorld('r_palm', rightSolve.rotations, [0, 0]);
    const leftReach = Math.hypot(leftSolvedEff.x - leftShoulder.x, leftSolvedEff.y - leftShoulder.y);
    const rightReach = Math.hypot(rightSolvedEff.x - rightShoulder.x, rightSolvedEff.y - rightShoulder.y);
    const expectedReach =
      segmentDistance('l_shoulder', 'l_elbow', base) +
      segmentDistance('l_elbow', 'l_palm', base);

    expect(Math.abs(leftReach - rightReach)).toBeLessThan(1);
    expect(Math.abs(leftReach - expectedReach)).toBeLessThan(1);
    expect(Math.abs(rightReach - expectedReach)).toBeLessThan(1);
  });
});
