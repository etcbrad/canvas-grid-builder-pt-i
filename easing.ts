// Easing functions
export type EasingFn = (t: number) => number;

const clampUnit = (t: number): number => Math.max(0, Math.min(1, t));

export const linear: EasingFn = (t) => t;
export const easeInQuad: EasingFn = (t) => t * t;
export const easeOutQuad: EasingFn = (t) => t * (2 - t);
export const easeInOutQuad: EasingFn = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

// Slight overshoot to carry momentum, then settle by segment end.
export const easeOutBackSoft: EasingFn = (t) => {
  const x = clampUnit(t);
  // Lower constant keeps the overshoot subtle.
  const c1 = 1.14;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

// Stretch/release motion with visible elastic recoil.
export const easeOutElastic: EasingFn = (t) => {
  const x = clampUnit(t);
  if (x === 0 || x === 1) return x;
  // Slower decay + lower frequency reads as stretch-out then return.
  const c4 = (2 * Math.PI) / 2.4;
  return Math.pow(2, -6 * x) * Math.sin((x * 6 - 0.75) * c4) + 1;
};
