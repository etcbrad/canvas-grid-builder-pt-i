import type { SkeletonRotations } from '../modelData';
import type { InterpolateFn } from 'pose-to-pose-engine/types';
import { EasingFn, linear } from '../easing';

const lerpAngleShortestPath = (a: number, b: number, t: number): number => {
  const diff = b - a;
  const delta = ((((diff + 180) % 360) + 360) % 360) - 180;
  return a + delta * t;
};

export const createInterpolator = (easing: EasingFn = linear): InterpolateFn<SkeletonRotations> => {
  return (a, b, t) => {
    const easedT = easing(Math.max(0, Math.min(1, t)));
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const result: SkeletonRotations = {};
    keys.forEach((k) => {
      const va = a[k] ?? 0;
      const vb = b[k] ?? 0;
      result[k] = lerpAngleShortestPath(va, vb, easedT);
    });
    return result;
  };
};

export const interpolateSkeletonRotations = createInterpolator(linear);
