export const torsoHeart = (c: CanvasRenderingContext2D) => {
  c.moveTo(0, 58); c.bezierCurveTo(-41, 30, -44, -12, -11, -28); c.bezierCurveTo(-5, -31, 0, -32, 0, -32); c.bezierCurveTo(0, -32, 5, -31, 11, -28); c.bezierCurveTo(44, -12, 41, 30, 0, 58); c.closePath();
};

export const waistCircle = (c: CanvasRenderingContext2D, radius = 20) => { c.arc(0, 0, radius, 0, Math.PI * 2); };

export const collarShape = (c: CanvasRenderingContext2D) => {
  c.moveTo(-32, -13); c.bezierCurveTo(-46, -13, -46, 13, -32, 13); c.lineTo(-10, 9); c.bezierCurveTo(-4, 9, 4, 9, 10, 9); c.lineTo(32, 13); c.bezierCurveTo(46, 13, 46, -13, 32, -13); c.lineTo(10, -9); c.bezierCurveTo(4, -9, -4, -9, -10, -9); c.closePath();
};

export const neckShape = (c: CanvasRenderingContext2D) => { c.rect(-7, -24, 14, 24); c.closePath(); };

export const armBlade = (c: CanvasRenderingContext2D, len: number, rP: number, rT: number, dir: number) => {
  const ex = dir * len, c1 = dir * len * 0.25, c2 = dir * len * 0.7;
  c.moveTo(0, -rP); c.bezierCurveTo(c1, -rP, c2, -rT, ex, 0); c.bezierCurveTo(c2, rT, c1, rP, 0, rP); c.closePath();
};

export const handShape = (c: CanvasRenderingContext2D, r: number, rt: number, dir: number) => {
  const l = 22; c.moveTo(0, -r); c.bezierCurveTo(dir * l * 0.35, -r, dir * l, -rt, dir * l, 0); c.bezierCurveTo(dir * l, rt, dir * l * 0.35, r, 0, r); c.closePath();
};

export const legCapsule = (c: CanvasRenderingContext2D, len: number, rT: number, rB: number) => {
  c.moveTo(-rT, 0); c.bezierCurveTo(-rT, len * 0.28, -rB, len * 0.72, 0, len); c.bezierCurveTo(rB, len * 0.72, rT, len * 0.28, rT, 0); c.closePath();
};

export const footSpike = (c: CanvasRenderingContext2D, len: number, r: number) => {
  const heelInset = len * 0.03;

  c.moveTo(-r, 0);
  c.bezierCurveTo(-r, len * 0.24, -r * 0.56, len * 0.74, 0, len);
  c.bezierCurveTo(r * 0.56, len * 0.74, r, len * 0.24, r, 0);
  c.bezierCurveTo(r * 0.52, heelInset, -r * 0.52, heelInset, -r, 0);
  c.closePath();
};
