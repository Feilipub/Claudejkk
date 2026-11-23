/**
 * Procedural wildlife sprites: a parametric quadruped (deer, wolf, bear,
 * bison…), birds (flying and walking) and snakes, all with walk/run cycles.
 */
import { getSpecies, type SpeciesDef } from '../data/wildlife.ts';
import { autoShade, ctx2d, ellipse, line, makeCanvas, pixelise, poly, px, shade, type Ctx } from './pixel.ts';

export const AW = 40;
export const AH = 32;
const GY = 29;

export type AnimalAnim = 'idle' | 'walk' | 'run' | 'eat' | 'dead' | 'attack' | 'fly';
export type AnimalSet = Record<AnimalAnim, (HTMLCanvasElement | OffscreenCanvas)[]>;

/**
 * Per-species anatomy accents that the shared look data does not carry:
 * muzzle and snout shape, ear shape, throat/cheek patches, tail tips, horns.
 * Purely visual; gameplay data stays in data/wildlife.ts.
 */
interface Accent {
  /** Snout length as a fraction of head length (0.5 blunt … 1.4 long canid). */
  snout: number;
  muzzle?: string;
  ear: 'point' | 'round' | 'long' | 'none';
  throat?: string;
  tailTip?: string;
  hump?: boolean;
  tusk?: boolean;
  longhorn?: boolean;
  /** Extra downward neck angle (radians): bears, bison and hogs carry their heads low. */
  low?: number;
}
const ACCENT: Record<string, Accent> = {
  deer: { snout: 0.9, muzzle: '#3b2c22', ear: 'long', throat: '#e8dfcf', tailTip: '#231a14' },
  elk: { snout: 1.0, muzzle: '#2e2119', ear: 'point', throat: '#3d2a1c' },
  pronghorn: { snout: 0.85, muzzle: '#1f1813', ear: 'point', throat: '#f2ead8' },
  rabbit: { snout: 0.6, ear: 'long', tailTip: '#f2ece0' },
  coyote: { snout: 1.35, muzzle: '#e4d6bd', ear: 'point', throat: '#e8dcc6', tailTip: '#2a2018' },
  wolf: { snout: 1.3, muzzle: '#d9d2c6', ear: 'point', throat: '#d9d2c6', tailTip: '#2c2824' },
  cougar: { snout: 0.6, muzzle: '#eee2cc', ear: 'round', throat: '#eee2cc', tailTip: '#231a12' },
  bear: { snout: 1.05, muzzle: '#b48e62', ear: 'round', hump: true, low: 0.75 },
  bison: { snout: 0.6, muzzle: '#1d140e', ear: 'none', hump: true, low: 0.6 },
  cattle: { snout: 0.85, muzzle: '#d8b8a0', ear: 'point', longhorn: true },
  boar: { snout: 1.1, muzzle: '#7a5a4a', ear: 'point', tusk: true, hump: true, low: 0.6 },
  bighorn: { snout: 0.8, muzzle: '#e9e1d3', ear: 'none' },
};
const NO_ACCENT: Accent = { snout: 0.8, ear: 'point' };
const HOOVED = new Set(['bison', 'boar', 'deer', 'elk', 'pronghorn', 'bighorn', 'cattle']);

function quad(c: Ctx, S: SpeciesDef, gait: 'idle' | 'walk' | 'run' | 'eat' | 'attack', t: number, dead: boolean): void {
  const L = S.look;
  const A = ACCENT[S.id] ?? NO_ACCENT;
  const [dark, mid, light] = L.body;
  const tau = Math.PI * 2;
  const stride = dead ? 0 : gait === 'run' ? L.leg * 0.55 : gait === 'walk' ? L.leg * 0.3 : 0;
  const lift = gait === 'run' ? L.leg * 0.35 : gait === 'walk' ? L.leg * 0.18 : 0;
  // Gallop bounds; walking animals sway a half pixel; idle ones breathe.
  const bob = gait === 'run' ? -Math.abs(Math.sin(t * tau)) * 1.5 : gait === 'walk' ? -Math.abs(Math.sin(t * tau)) * 0.5 : gait === 'idle' ? Math.sin(t * tau) * 0.3 : 0;
  const cx = AW / 2;
  const legLen = dead ? 0 : L.leg;
  const cy = dead ? GY - L.h * 0.85 : GY - legLen - L.h * 0.4 + bob;
  const shoulder = cx + L.len * 0.6;
  const hip = cx - L.len * 0.6;
  const phases = gait === 'run' ? [0.55, 0.4, 0.1, 0] : [0.25, 0.75, 0, 0.5];
  const legs = [0, 1, 2, 3].map((i) => {
    const front = i < 2;
    const near = i % 2 === 0;
    const bx = (front ? shoulder : hip) + (near ? 0.6 : -0.6);
    const ph = (t + phases[i]!) * tau;
    const hx = bx + Math.sin(ph) * stride;
    const hy = GY - (Math.cos(ph) > 0 ? Math.cos(ph) * lift : 0);
    return { bx, hx, hy, near, front };
  });
  const thick = Math.max(1.2, L.h * 0.38);
  const drawLeg = (l: (typeof legs)[0]) => {
    // Far legs sit in the body's own shadow (cooler, darker); near legs carry the mid tone.
    const col = l.near ? mid : shade(dark, -0.15);
    if (dead) {
      // Stiff legs stick out from the belly of the carcass.
      const by = cy + L.h * 0.4;
      const ex = l.bx + (l.front ? 3 : -1) + (l.near ? 1 : 0);
      const ey = Math.min(AH - 1.5, by + L.leg * 0.45);
      line(c, l.bx, by, ex, ey, col, Math.max(1, thick * 0.7));
      if (HOOVED.has(S.id)) px(c, ex, ey, '#2a201a');
      return;
    }
    const ty = cy + L.h * 0.3;
    // Knees bend the right way: forward for forelegs (carpus), back for hind (hock).
    const kx = (l.bx + l.hx) / 2 + (l.front ? 0.8 : -1.1);
    const ky = (ty + l.hy) / 2 + (l.front ? 0.5 : -0.5);
    line(c, l.bx, ty, kx, ky, col, thick);
    line(c, kx, ky, l.hx, l.hy - 0.5, col, Math.max(1, L.h * 0.2));
    if (HOOVED.has(S.id)) px(c, l.hx, l.hy - 1, '#2a201a');
    else px(c, l.hx + (l.front ? 0.5 : 0), l.hy - 1, shade(col, -0.3)); // paws
  };
  for (const l of legs) if (!l.near) drawLeg(l);

  // Tail (drawn behind the body). Idle frame 2 flicks it.
  const flick = gait === 'idle' && t > 0.25 ? 1 : 0;
  const tx = hip - L.h * 0.5;
  const ty = cy - L.h * 0.3;
  if (L.tail === 'bushy') {
    const lift2 = gait === 'run' ? -3 : gait === 'attack' ? -2 : flick;
    const ex = tx - 4.5;
    const ey = ty + 4.5 + lift2;
    line(c, tx, ty, ex, ey, mid, 2.8);
    line(c, tx - 1, ty + 0.5, ex + 1, ey - 1, light, 1.2);
    if (A.tailTip) px(c, ex, ey, A.tailTip);
  }
  if (L.tail === 'long') {
    c.strokeStyle = mid;
    c.lineWidth = 1.6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(tx, ty);
    const tipY = ty + 1 + Math.sin(t * tau) * 2 - flick * 2;
    c.quadraticCurveTo(tx - 6, ty + 6, tx - 9, tipY);
    c.stroke();
    if (A.tailTip) {
      px(c, tx - 9, tipY, A.tailTip);
      px(c, tx - 8, tipY + 0.5, A.tailTip);
    }
  }
  if (L.tail === 'short') {
    const ty2 = ty - (flick || gait === 'run' ? 1 : 0); // deer flag their tails when alarmed
    ellipse(c, tx + 0.3, ty2, 1.4, 1.3, L.rump ?? A.tailTip ?? mid);
    if (A.tailTip && S.id === 'deer') px(c, tx - 0.6, ty2 + 1, A.tailTip);
  }
  if (L.tail === 'tuft') {
    line(c, tx, ty, tx - 1.5, ty + 4 - flick, mid, 1);
    ellipse(c, tx - 1.6, ty + 4.2 - flick, 0.9, 1.2, A.tailTip ?? dark);
  }

  // Body: base, sunlit back, belly, rump patch, mane/hump.
  ellipse(c, cx, cy, L.len, L.h, mid);
  if (A.hump) ellipse(c, shoulder - 1, cy - L.h * 0.45, L.h * 0.85, L.h * 0.75, mid);
  ellipse(c, cx + 0.5, cy - L.h * 0.5, L.len * 0.78, L.h * 0.38, light);
  if (L.belly) ellipse(c, cx, cy + L.h * 0.58, L.len * 0.72, L.h * 0.32, L.belly);
  // Belly shadow: a cool band under the ribcage gives the barrel volume.
  line(c, cx - L.len * 0.55, cy + L.h * 0.85, cx + L.len * 0.55, cy + L.h * 0.85, shade(L.belly ?? mid, -0.25), 1);
  if (L.rump) ellipse(c, hip - 0.5, cy - L.h * 0.1, L.h * 0.45, L.h * 0.55, L.rump);
  if (L.mane) ellipse(c, shoulder, cy - L.h * 0.2, L.h * 0.75, L.h * 1.1, L.mane);
  if (S.id === 'bison') ellipse(c, shoulder - 1, cy - L.h * 0.6, L.h * 0.8, L.h * 0.9, L.mane ?? dark);
  if (S.id === 'cattle') {
    // Longhorns are often brindled or patched.
    ellipse(c, cx - 1, cy - 0.5, 2.2, 1.6, shade(mid, 0.35));
    ellipse(c, hip + 1, cy + 1, 1.6, 1.4, shade(mid, 0.35));
  }

  // Neck & head.
  const eat = gait === 'eat' ? 1 : 0;
  const idleNod = gait === 'idle' && flick ? 0.12 : 0;
  const neckAng = dead ? 0.15 : eat ? 0.9 : -0.9 + (gait === 'run' ? 0.5 : 0) + (gait === 'attack' ? 0.55 : 0) + idleNod + (eat ? 0 : A.low ?? 0);
  const nx = shoulder + Math.cos(neckAng) * L.neck;
  const ny = (dead ? cy + L.h * 0.2 : cy - L.h * 0.3) + Math.sin(neckAng) * L.neck;
  line(c, shoulder, cy - L.h * 0.2, nx, ny, mid, Math.max(1.5, L.h * 0.6));
  if (A.throat) line(c, shoulder + 0.8, cy - L.h * 0.05, nx + 0.6, ny + L.head * 0.25, A.throat, Math.max(1, L.h * 0.22));
  const hang = dead ? 0.2 : eat ? 1.4 : gait === 'attack' ? 0.15 : 0.35;
  const snoutLen = L.head * A.snout;
  const hx = nx + Math.cos(hang) * snoutLen;
  const hy = ny + Math.sin(hang) * snoutLen;
  // Skull, then a tapering muzzle.
  ellipse(c, nx, ny, L.head * 0.45, L.head * 0.4, mid);
  line(c, nx, ny + 0.2, hx, hy, mid, Math.max(1.3, L.head * 0.5));
  line(c, nx + 0.3, ny - L.head * 0.15, hx - 0.3, hy - L.head * 0.12, light, 1);
  if (A.muzzle) line(c, hx - Math.cos(hang) * snoutLen * 0.35, hy - Math.sin(hang) * snoutLen * 0.35 + 0.4, hx, hy + 0.3, A.muzzle, Math.max(1, L.head * 0.35));
  px(c, hx + 0.3, hy - 0.2, '#16100c'); // nose
  // Eye: dark, with a one-pixel glint so the face reads at a distance. Closed on a carcass.
  const ex = nx + L.head * 0.28;
  const ey = ny - L.head * 0.12;
  if (dead) line(c, ex - 0.5, ey, ex + 0.5, ey, '#16100c', 1);
  else {
    px(c, ex, ey, '#0d0a08');
    if (L.head >= 4) px(c, ex, ey - 1, shade(light, 0.4));
  }
  if (gait === 'attack') {
    // Bared teeth and an open jaw.
    line(c, nx + 1, ny + L.head * 0.35, hx, hy + 1.4, shade(dark, -0.2), 1);
    px(c, hx - 0.5, hy + 0.8, '#f4efe6');
    px(c, hx - 1.8, hy + 0.9, '#f4efe6');
  }
  if (A.tusk) line(c, hx - 1, hy + 0.6, hx - 0.2, hy - 0.8, '#f0e8d6', 1);
  // Ears, set behind the eye; flicked on idle frame 2.
  const ears = L.ears ?? 0;
  if (ears > 0 && A.ear !== 'none') {
    const bx2 = nx - 0.8;
    const by2 = ny - L.head * 0.3;
    const tilt = flick ? -0.6 : 0;
    if (A.ear === 'round') {
      ellipse(c, bx2, by2 - 0.3, 1.1, 1, dark);
      px(c, bx2, by2 - 0.3, shade(mid, 0.2));
    } else if (A.ear === 'long' && S.id === 'rabbit') {
      // Jackrabbit: two tall, thin ears, the far one a shade darker.
      line(c, bx2 + 0.6, by2, bx2 + 0.2 + tilt, by2 - ears, shade(mid, -0.2), 1);
      line(c, bx2 - 0.2, by2, bx2 - 1 + tilt, by2 - ears - 0.5, mid, 1.2);
      px(c, bx2 - 1 + tilt, by2 - ears - 0.5, '#2a2018');
    } else if (A.ear === 'long') {
      // Mule deer and jackrabbits: tall, wide ears with a pale inner face.
      poly(c, [[bx2 - 0.2, by2 + 0.4], [bx2 - 2.4 + tilt, by2 - ears], [bx2 - 0.6 + tilt, by2 - ears - 0.4], [bx2 + 1.2, by2]], mid);
      line(c, bx2 - 0.4, by2 - 0.5, bx2 - 1.2 + tilt, by2 - ears + 1, shade(light, 0.35), 1);
    } else {
      poly(c, [[bx2 - 0.6, by2 + 0.3], [bx2 - 1.2 + tilt, by2 - ears], [bx2 + 1, by2]], dark);
    }
  }
  const bone = '#d8c8a6';
  const boneTip = '#f2e8d2';
  switch (L.horns) {
    case 'antlers':
      // Mule-deer fork: main beam sweeps back, then branches twice.
      line(c, nx, ny - 1.5, nx - 2, ny - 6, bone, 1);
      line(c, nx - 1, ny - 4, nx + 1.5, ny - 6.5, bone, 1);
      line(c, nx - 2, ny - 6, nx - 3.5, ny - 7, bone, 1);
      px(c, nx + 1.5, ny - 6.5, boneTip);
      px(c, nx - 3.5, ny - 7, boneTip);
      break;
    case 'bigAntlers':
      line(c, nx, ny - 1.5, nx - 4, ny - 9, bone, 1);
      line(c, nx - 0.6, ny - 3, nx + 1.6, ny - 4.5, bone, 1); // brow tine
      line(c, nx - 2, ny - 5, nx + 1, ny - 8, bone, 1);
      line(c, nx - 3, ny - 7.5, nx - 6, ny - 8, bone, 1);
      px(c, nx + 1, ny - 8, boneTip);
      px(c, nx - 6, ny - 8, boneTip);
      px(c, nx - 4, ny - 9, boneTip);
      break;
    case 'pronghorn':
      line(c, nx, ny - 1.5, nx - 0.5, ny - 4.5, '#1d1712', 1);
      px(c, nx + 0.5, ny - 3, '#1d1712');
      break;
    case 'curl':
      ellipse(c, nx - 1.4, ny - 0.4, 2, 2, '#b9a982');
      ellipse(c, nx - 1.4, ny - 0.4, 0.9, 0.9, '#8d7f5f');
      px(c, nx - 0.2, ny + 1.2, '#cfc09a');
      break;
    case 'bison':
      if (A.longhorn) {
        // The steer's signature sweep, wider than the head.
        line(c, nx - 0.5, ny - 1.2, nx - 4.5, ny - 2.5, '#e8e0d0', 1);
        line(c, nx + 0.5, ny - 1.2, nx + 4, ny - 2.8, '#e8e0d0', 1);
        px(c, nx - 4.5, ny - 3.2, '#3a2e22');
        px(c, nx + 4, ny - 3.5, '#3a2e22');
      } else line(c, nx, ny - 1.2, nx - 0.6, ny - 3, '#e8e0d0', 1);
      break;
  }
  for (const l of legs) if (l.near) drawLeg(l);
  if (dead) line(c, cx - L.len * 0.4, cy - L.h * 0.2, cx + L.len * 0.2, cy, '#5a1a12', 1); // wound
}

/**
 * Jackrabbit, drawn on its own rather than as a shrunken quadruped: a rabbit's read is
 * a pear-shaped crouch (big hind haunch, small chest), a round head set high and
 * forward, ears as long as the head-and-neck, a long hind foot flat on the ground and
 * a white scut. Running is a bounding hop: the body stretches into a long arc, ears
 * lie back, hind feet kick out behind.
 */
function rabbit(c: Ctx, S: SpeciesDef, gait: 'idle' | 'walk' | 'run' | 'eat' | 'attack', t: number, dead: boolean): void {
  const [dark, mid, light] = S.look.body;
  const belly = S.look.belly ?? '#e4dccf';
  const tau = Math.PI * 2;
  const cx = AW / 2;
  const fur = shade(mid, 0.06);
  const furDark = shade(dark, -0.1);
  if (dead) {
    ellipse(c, cx, GY - 2.2, 6.5, 2.4, fur);
    ellipse(c, cx + 0.5, GY - 1, 5, 1.1, belly);
    ellipse(c, cx + 6.5, GY - 2.6, 2.2, 1.8, fur);
    line(c, cx + 5.5, GY - 3.6, cx + 1.5, GY - 5.2, furDark, 1.2);
    line(c, cx - 5, GY - 1.2, cx - 8.5, GY - 0.6, mid, 1.2);
    px(c, cx - 7, GY - 3.5, '#f2ece0');
    line(c, cx + 7, GY - 3, cx + 7.8, GY - 3, '#16100c', 1);
    return;
  }
  // Hop phase: 0 crouched … 1 fully stretched in the air.
  const hop = gait === 'run' ? Math.max(0, Math.sin(t * tau)) : gait === 'walk' ? Math.max(0, Math.sin(t * tau)) * 0.45 : 0;
  const air = gait === 'run' ? hop * 3.2 : hop * 1.2;
  const stretch = hop * (gait === 'run' ? 3.5 : 1.2);
  const eat = gait === 'eat' ? 1 : 0;
  const alert = gait === 'idle' && t > 0.25 ? 1 : 0;
  const base = GY - air;
  // Hind foot: long, pale-soled, flat on the ground in a crouch; kicked back mid-hop.
  const hx0 = cx - 3 - stretch * 0.6;
  if (hop > 0.3) line(c, hx0, base - 2, hx0 - 3.5 - stretch * 0.4, base - 0.5, light, 1.6);
  else ellipse(c, cx - 1.5, GY - 0.8, 3.4, 0.95, shade(light, 0.1));
  // Far (shadowed) forepaw.
  line(c, cx + 2.4 + stretch * 0.4, base - 3, cx + 3.2 + stretch * 0.9, base - (hop > 0.3 ? 1.5 : 0.4), furDark, 1);
  // Haunch (big) + body + chest: the pear crouch, flattened into an arc mid-bound.
  ellipse(c, cx - 2.4 - stretch * 0.5, base - 3.6, 3.9, 3.4 - hop * 0.7, fur);
  ellipse(c, cx + 0.3, base - 4.1 - hop * 0.3, 4.2 + stretch * 0.5, 3 - hop * 0.6, fur, -0.15 + hop * 0.1);
  // Scut: the white cottontail flashes high on the rump (the thing you see as it bolts).
  ellipse(c, cx - 6 - stretch * 0.6, base - 4.8 + hop * 0.6, 1.5 + hop * 0.3, 1.4 + hop * 0.3, '#f4efe4');
  // Sunlit back, pale belly and chest.
  ellipse(c, cx - 1.6 - stretch * 0.4, base - 5.8 + hop * 0.5, 3.4, 1.2, light, -0.15);
  ellipse(c, cx + 0.6, base - 1.9 + hop * 0.3, 3.2, 1.1, belly);
  // Haunch contour: a darker crescent so the thigh reads as a separate mass.
  line(c, cx - 1.2, base - 5.2, cx - 0.2, base - 2.2, shade(mid, -0.18), 1);
  // Head, set high and forward (low and forward when grazing).
  const hx = cx + 3.8 + stretch * 0.9 + eat * 1;
  const hy = base - 7.6 + eat * 4.2 + hop * 1.4 - alert * 0.5;
  ellipse(c, (cx + 1.5 + hx) / 2, (base - 5 + hy) / 2, 1.9, 2.1, fur); // neck
  ellipse(c, hx, hy, 2.5, 2.1, fur);
  ellipse(c, hx + 1.6, hy + 0.7, 1.4, 1.2, fur); // muzzle
  ellipse(c, hx + 1.4, hy + 1.3, 1.1, 0.6, belly); // pale chin
  px(c, hx + 2.8, hy + 0.3, '#5a3a34'); // nose
  // Ears: long, the far one a shade darker; upright when alert, laid back mid-bound.
  const earLen = 6.2;
  const ea = -1.74 + hop * 0.9 + eat * 0.35 - alert * 0.15;
  const ebx = hx - 0.9;
  const eby = hy - 1.4;
  const ex1 = ebx + Math.cos(ea - 0.18) * earLen;
  const ey1 = eby + Math.sin(ea - 0.18) * earLen;
  const ex2 = ebx + 0.9 + Math.cos(ea) * earLen;
  const ey2 = eby + Math.sin(ea) * earLen;
  line(c, ebx, eby, ex1, ey1, shade(mid, -0.22), 1.5);
  line(c, ebx + 0.9, eby, ex2, ey2, fur, 1.8);
  line(c, ebx + 1, eby - 0.6, (ebx + ex2) / 2 + 0.6, (eby + ey2) / 2, '#c99a8a', 1); // pink inner ear
  px(c, ex2, ey2, '#2a2018'); // black jackrabbit ear tip
  px(c, ex1, ey1, '#2a2018');
  // Big dark eye with a glint, high on the side of the head.
  px(c, hx + 0.6, hy - 0.4, '#0d0a08');
  px(c, hx + 0.6, hy - 1.2, shade(light, 0.45));
  // Near forepaw.
  line(c, cx + 2 + stretch * 0.6, base - 2.6, cx + 2.4 + stretch * 1.1, base - (hop > 0.3 ? 1 : 0), fur, 1.3);
}

function bird(c: Ctx, S: SpeciesDef, t: number, flying: boolean, dead: boolean): void {
  const L = S.look;
  const [dark, mid, light] = L.body;
  const cx = AW / 2;
  const raptor = S.id === 'hawk' || S.id === 'vulture';
  if (flying) {
    const cy = 14;
    const flap = Math.sin(t * Math.PI * 2);
    const span = L.len * 2.2;
    // Seen from above: wings spread, primaries splayed at the tips, a pale leading edge catching the sky.
    poly(c, [[cx, cy - 1], [cx - span, cy - 2 + flap * 3], [cx - span * 0.6, cy + 2], [cx, cy + 2]], mid);
    poly(c, [[cx, cy - 1], [cx + span, cy - 2 + flap * 3], [cx + span * 0.6, cy + 2], [cx, cy + 2]], mid);
    line(c, cx - 1, cy - 0.6, cx - span * 0.85, cy - 1.6 + flap * 3, light, 1);
    line(c, cx + 1, cy - 0.6, cx + span * 0.85, cy - 1.6 + flap * 3, light, 1);
    line(c, cx - span * 0.9, cy - 1 + flap * 3, cx - span * 0.5, cy + 1, dark, 1);
    line(c, cx + span * 0.9, cy - 1 + flap * 3, cx + span * 0.5, cy + 1, dark, 1);
    if (raptor) {
      px(c, cx - span, cy - 1 + flap * 3, dark);
      px(c, cx + span, cy - 1 + flap * 3, dark);
    }
    ellipse(c, cx, cy, 1.6, L.len * 0.6, dark);
    poly(c, [[cx - 2, cy + L.len * 0.5], [cx + 2, cy + L.len * 0.5], [cx, cy + L.len * 0.5 + 3]], S.id === 'hawk' ? '#b4582e' : dark);
    ellipse(c, cx, cy - L.len * 0.6, 1, 1, S.id === 'vulture' ? '#a8402c' : S.id === 'duck' ? '#2e6b3a' : dark);
    return;
  }
  if (raptor && !dead) {
    // Perched upright on the ground: hunched shoulders, tail to the ground, hooked beak.
    const by = GY - 5;
    const bob = Math.sin(t * Math.PI * 2) * 0.4;
    line(c, cx - 1, by + 1, cx - 3, GY, dark, 2); // tail
    if (S.id === 'hawk') px(c, cx - 3, GY - 1, '#b4582e');
    ellipse(c, cx, by - 1 + bob, 3, 4.2, mid);
    ellipse(c, cx + 1, by - 0.5 + bob, 1.8, 2.8, S.id === 'hawk' ? '#e6d2b0' : light); // breast
    ellipse(c, cx - 1.2, by - 1.5 + bob, 2.2, 3.2, dark); // folded wing
    const hx = cx + 1;
    const hy = by - 5.5 + bob;
    ellipse(c, hx, hy, 1.6, 1.5, S.id === 'vulture' ? '#a8402c' : mid);
    px(c, hx + 1.5, hy + 0.3, S.id === 'vulture' ? '#efe4cc' : '#e0b04a');
    px(c, hx + 1.5, hy + 1.2, S.id === 'vulture' ? '#efe4cc' : '#e0b04a');
    px(c, hx + 0.6, hy - 0.4, '#0d0a08');
    line(c, cx - 0.5, by + 2.5, cx - 0.5, GY, '#a88a3a', 1);
    line(c, cx + 1, by + 2.5, cx + 1, GY, '#a88a3a', 1);
    return;
  }
  const cy = GY - L.leg - L.h;
  c.save();
  if (dead) {
    c.translate(cx, GY - 1);
    c.rotate(Math.PI / 2);
    c.translate(-cx, -(GY - 1));
  }
  const step = Math.sin(t * Math.PI * 2) * 1.2;
  if (L.leg > 0) {
    line(c, cx - 0.5 + step, cy + L.h, cx - 0.5 + step, GY, '#b88a4a', 1);
    line(c, cx + 0.5 - step, cy + L.h, cx + 0.5 - step, GY, '#9a743d', 1);
  }
  if (L.tail === 'fan') {
    for (let k = -2; k <= 2; k++) line(c, cx - L.len * 0.6, cy, cx - L.len * 0.6 - 2.5, cy - 2 + k * 1.2, k % 2 ? dark : light, 1);
  }
  ellipse(c, cx, cy, L.len, L.h, mid);
  ellipse(c, cx, cy - L.h * 0.4, L.len * 0.7, L.h * 0.4, light);
  // Folded wing edge.
  line(c, cx - L.len * 0.6, cy + L.h * 0.2, cx + L.len * 0.4, cy + L.h * 0.1, dark, 1);
  line(c, cx + L.len * 0.6, cy - 0.5, cx + L.len * 0.6 + L.neck * 0.4, cy - L.neck, L.mane ?? mid, 1.4);
  ellipse(c, cx + L.len * 0.6 + L.neck * 0.4, cy - L.neck, L.head, L.head * 0.9, L.mane ?? (S.id === 'turkey' ? '#b54a3a' : dark));
  px(c, cx + L.len * 0.6 + L.neck * 0.4 + L.head, cy - L.neck, S.id === 'duck' ? '#d8b03a' : '#c9a85a');
  if (S.id === 'duck') line(c, cx + L.len * 0.6, cy - 0.2, cx + L.len * 0.6 + 1, cy - 0.6, '#f2ece0', 1); // white collar
  if (S.id === 'heron') line(c, cx + L.len * 0.6 + L.neck * 0.4, cy - L.neck - 0.5, cx + L.len * 0.6 + L.neck * 0.4 - 2.5, cy - L.neck - 0.5, '#2a2e36', 1); // crest plume
  c.restore();
}

function snake(c: Ctx, S: SpeciesDef, t: number, dead: boolean): void {
  const [dark, mid] = S.look.body;
  const cy = GY - 2;
  let prevX = 8;
  let prevY = cy;
  for (let i = 1; i <= 12; i++) {
    const x = 8 + i * 1.8;
    const y = cy + (dead ? 0 : Math.sin(i * 0.9 + t * Math.PI * 2) * 2);
    line(c, prevX, prevY, x, y, i % 3 === 0 ? dark : mid, 2);
    prevX = x;
    prevY = y;
  }
  ellipse(c, prevX + 1, prevY, 1.6, 1.3, mid);
  px(c, 7, cy, '#e8dcc0');
}

const cache = new Map<string, AnimalSet>();

export function animalSprites(speciesId: string): AnimalSet {
  const hit = cache.get(speciesId);
  if (hit) return hit;
  const S = getSpecies(speciesId);
  const pal: string[] | null = null;
  const mk = (fn: (c: Ctx) => void, outline = true) => {
    const cv = makeCanvas(AW, AH);
    const c = ctx2d(cv);
    fn(c);
    autoShade(c, AW, AH, 0.8);
    pixelise(c, AW, AH, pal, outline ? '#1a120c' : null, 220);
    return cv;
  };
  let set: AnimalSet;
  if (S.archetype === 'bird') {
    set = {
      idle: [0, 0.5].map((t) => mk((c) => bird(c, S, t, false, false))),
      walk: [0, 0.25, 0.5, 0.75].map((t) => mk((c) => bird(c, S, t, false, false))),
      run: [0, 0.25, 0.5, 0.75].map((t) => mk((c) => bird(c, S, t, false, false))),
      eat: [0, 0.5].map((t) => mk((c) => bird(c, S, t, false, false))),
      attack: [mk((c) => bird(c, S, 0, false, false))],
      fly: [0, 0.25, 0.5, 0.75].map((t) => mk((c) => bird(c, S, t, true, false), false)),
      dead: [mk((c) => bird(c, S, 0, false, true))],
    };
  } else if (S.archetype === 'snake') {
    const f = [0, 0.25, 0.5, 0.75].map((t) => mk((c) => snake(c, S, t, false)));
    set = { idle: f, walk: f, run: f, eat: f, attack: f, fly: f, dead: [mk((c) => snake(c, S, 0, true))] };
  } else if (S.id === 'rabbit') {
    set = {
      idle: [0, 0.5].map((t) => mk((c) => rabbit(c, S, 'idle', t, false))),
      walk: [0, 0.25, 0.5, 0.75].map((t) => mk((c) => rabbit(c, S, 'walk', t, false))),
      run: [0, 0.2, 0.4, 0.6, 0.8].map((t) => mk((c) => rabbit(c, S, 'run', t, false))),
      eat: [0, 0.5].map((t) => mk((c) => rabbit(c, S, t > 0 ? 'eat' : 'idle', t, false))),
      attack: [0, 0.5].map((t) => mk((c) => rabbit(c, S, 'idle', t, false))),
      fly: [],
      dead: [mk((c) => rabbit(c, S, 'idle', 0, true))],
    };
  } else {
    set = {
      idle: [0, 0.5].map((t) => mk((c) => quad(c, S, 'idle', t, false))),
      walk: [0, 0.25, 0.5, 0.75].map((t) => mk((c) => quad(c, S, 'walk', t, false))),
      run: [0, 0.2, 0.4, 0.6, 0.8].map((t) => mk((c) => quad(c, S, 'run', t, false))),
      eat: [0, 0.5].map((t) => mk((c) => quad(c, S, 'eat', t, false))),
      attack: [0, 0.5].map((t) => mk((c) => quad(c, S, 'attack', t, false))),
      fly: [],
      dead: [mk((c) => quad(c, S, 'idle', 0, true))],
    };
  }
  cache.set(speciesId, set);
  return set;
}
