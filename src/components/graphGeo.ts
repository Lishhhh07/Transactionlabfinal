export const W = 300;
export const H = 200;
const CX = 150;
const CY = 100;
const RING = 70;
export const NODE = 20;

export function point(i: number, n: number) {
  const angle = (2 * Math.PI * i) / n - Math.PI / 2;
  return { x: CX + RING * Math.cos(angle), y: CY + RING * Math.sin(angle) };
}

/** A curved arrow from a to b. The curve bends so A→B and B→A don't overlap. */
export function edgePath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const kx = (a.x + b.x) / 2 + (-dy / len) * 28;
  const ky = (a.y + b.y) / 2 + (dx / len) * 28;

  const toward = (p: { x: number; y: number }, q: { x: number; y: number }) => {
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: (q.x - p.x) / l, y: (q.y - p.y) / l };
  };
  const u1 = toward(a, { x: kx, y: ky });
  const u2 = toward(b, { x: kx, y: ky });

  const s = { x: a.x + u1.x * NODE, y: a.y + u1.y * NODE };
  const e = { x: b.x + u2.x * (NODE + 4), y: b.y + u2.y * (NODE + 4) };
  return `M ${s.x} ${s.y} Q ${kx} ${ky} ${e.x} ${e.y}`;
}