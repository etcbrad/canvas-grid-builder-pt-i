// Easing functions with performance optimizations
export type EasingFn = (t: number) => number;

const clampUnit = (t: number): number => Math.max(0, Math.min(1, t));

// Cache for easing function results
const easingCache = new Map<string, number>();
const CACHE_SIZE = 1000;

const getCachedEasing = (fn: string, t: number, compute: () => number): number => {
  const key = `${fn}_${Math.round(t * 1000)}`;
  if (easingCache.has(key)) {
    return easingCache.get(key)!;
  }
  
  const result = compute();
  
  // Limit cache size
  if (easingCache.size >= CACHE_SIZE) {
    const firstKey = easingCache.keys().next().value;
    easingCache.delete(firstKey);
  }
  
  easingCache.set(key, result);
  return result;
};

export const linear: EasingFn = (t) => t;
export const easeInQuad: EasingFn = (t) => t * t;
export const easeOutQuad: EasingFn = (t) => t * (2 - t);
export const easeInOutQuad: EasingFn = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

// Optimized easeOutBackSoft with memoization
export const easeOutBackSoft: EasingFn = (t) => {
  return getCachedEasing('easeOutBackSoft', t, () => {
    const x = clampUnit(t);
    const c1 = 1.06;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  });
};

// Optimized easeOutElastic with reduced computation
export const easeOutElastic: EasingFn = (t) => {
  return getCachedEasing('easeOutElastic', t, () => {
    const x = clampUnit(t);
    if (x === 0 || x === 1) return x;
    
    // Pre-computed constants for performance
    const c4 = 2.24399475; // (2 * Math.PI) / 2.8
    const stretchFactor = Math.pow(2, -5.5 * x);
    const oscillation = Math.sin((x * 4.5 - 0.75) * c4);
    
    return stretchFactor * oscillation + 1;
  });
};

// Performance monitoring for easing functions
export const getEasingPerformanceStats = (renderCount?: number) => ({
  cacheSize: easingCache.size,
  cacheHitRate: easingCache.size > 0 && renderCount ? easingCache.size / renderCount : 0
});

// Clear cache when needed (e.g., when memory is constrained)
export const clearEasingCache = () => easingCache.clear();
