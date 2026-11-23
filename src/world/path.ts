/**
 * Tile A* pathfinding with a node budget, for NPCs moving through towns
 * (doors, streets, around buildings). Paths are returned as pixel waypoints.
 */
import type { World } from './world.ts';

export function findPath(W: World, sx: number, sy: number, gx: number, gy: number, maxNodes = 3000): { x: number; y: number }[] | null {
  const stx = Math.floor(sx / 16);
  const sty = Math.floor(sy / 16);
  const gtx = Math.floor(gx / 16);
  const gty = Math.floor(gy / 16);
  if (stx === gtx && sty === gty) return [{ x: gx, y: gy }];
  const walk = (tx: number, ty: number) => W.inBounds(tx, ty) && !W.blockedPx(tx * 16 + 8, ty * 16 + 8) && !W.terrainAt(tx * 16 + 8, ty * 16 + 8).deep;
  if (!walk(gtx, gty)) return null;
  const key = (x: number, y: number) => y * W.w + x;
  const open: { x: number; y: number; f: number; g: number }[] = [{ x: stx, y: sty, f: 0, g: 0 }];
  const came = new Map<number, number>();
  const gScore = new Map<number, number>([[key(stx, sty), 0]]);
  let nodes = 0;
  const h = (x: number, y: number) => Math.abs(x - gtx) + Math.abs(y - gty);
  while (open.length && nodes < maxNodes) {
    // Small open lists: linear min is fine.
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i]!.f < open[bi]!.f) bi = i;
    const cur = open.splice(bi, 1)[0]!;
    nodes++;
    if (cur.x === gtx && cur.y === gty) {
      const out: { x: number; y: number }[] = [];
      let k = key(cur.x, cur.y);
      while (came.has(k)) {
        out.push({ x: (k % W.w) * 16 + 8, y: Math.floor(k / W.w) * 16 + 10 });
        k = came.get(k)!;
      }
      out.reverse();
      if (out.length) out[out.length - 1] = { x: gx, y: gy };
      return smooth(W, sx, sy, out);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!walk(nx, ny)) continue;
      if (dx && dy && (!walk(cur.x + dx, cur.y) || !walk(cur.x, cur.y + dy))) continue;
      const ng = cur.g + (dx && dy ? 1.414 : 1);
      const nk = key(nx, ny);
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        came.set(nk, key(cur.x, cur.y));
        open.push({ x: nx, y: ny, g: ng, f: ng + h(nx, ny) * 1.2 });
      }
    }
  }
  return null;
}

/** Remove intermediate waypoints that have direct line-of-walk. */
function smooth(W: World, sx: number, sy: number, pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 3) return pts;
  const clear = (ax: number, ay: number, bx: number, by: number) => {
    const d = Math.hypot(bx - ax, by - ay);
    for (let t = 4; t < d; t += 4) {
      const x = ax + ((bx - ax) * t) / d;
      const y = ay + ((by - ay) * t) / d;
      if (W.blockedPx(x, y) || W.blockedPx(x + 3, y) || W.blockedPx(x - 3, y)) return false;
    }
    return true;
  };
  const out: { x: number; y: number }[] = [];
  let ax = sx;
  let ay = sy;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !clear(ax, ay, pts[j]!.x, pts[j]!.y)) j--;
    out.push(pts[j]!);
    ax = pts[j]!.x;
    ay = pts[j]!.y;
    i = j + 1;
  }
  return out;
}
