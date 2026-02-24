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
  // Keep momentum present but restrained for a cleaner "fluid" settle.
  const c1 = 1.06;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

// Stretch/release motion with visible elastic recoil.
export const easeOutElastic: EasingFn = (t) => {
  const x = clampUnit(t);
  if (x === 0 || x === 1) return x;
  // One dominant stretch with a cleaner return and reduced ringing.
  const c4 = (2 * Math.PI) / 2.8;
  return Math.pow(2, -5.5 * x) * Math.sin((x * 4.5 - 0.75) * c4) + 1;
};
