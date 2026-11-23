/**
 * Static world object sprites (trees, cacti, rocks, fences, furniture…).
 * Every sprite is hand-drawn pixel art authored as text grids in
 * propsPixel.ts (see design/art/pixel-art-bible.md); this module only
 * registers them, caches one canvas per (object, variant) and anchors it at
 * the bottom-centre of its tile.
 */
import { Rng } from '../core/rng.ts';
import { O } from '../world/tiles.ts';
import { ctx2d, makeCanvas, type Ctx } from './pixel.ts';
import { DECALS, PROP_ART, TREES, defineArt, defineProps } from './propsPixel.ts';

export interface PropSprite {
  img: HTMLCanvasElement | OffscreenCanvas;
  /** Offset from tile's top-left to draw the image. */
  ox: number;
  oy: number;
  /** Shadow ellipse radius (0 = none). Above 6 the renderer treats the prop as big (sun-stretched shadow, see-through, wind sway when taller than 30 px). */
  shadow: number;
}

// Trees. Canvas size is shared by all variants of a type; the renderer picks variant 0–2.
defineArt(O.Oak, 40, 44, 13, (v) => TREES.OAK(v % 3));
defineArt(O.Cottonwood, 42, 50, 13, (v) => TREES.COTTONWOOD(v % 3));
defineArt(O.Aspen, 32, 46, 7, (v) => TREES.ASPEN(v % 3));
defineArt(O.Pine, 24, 50, 8, (v) => TREES.PINE(v % 3));
defineArt(O.SnowPine, 24, 50, 8, (v) => TREES.SNOWPINE(v % 3));
defineArt(O.Juniper, 26, 30, 9, (v) => TREES.JUNIPER(v % 3));
defineArt(O.DeadTree, 20, 24, 5, (v) => TREES.DEADTREE(v % 3));
// Everything else: shrubs, cacti, rocks, fences, town props, furniture. Boulder variants 3–5 are warm sandstone.
defineProps(O);

const cache = new Map<string, PropSprite>();

/** Get a sprite for an object id with a variant seed (0..2; Boulder 0..5). */
export function propSprite(o: number, variant: number): PropSprite | null {
  const art = PROP_ART[o];
  if (!art) return null;
  const key = `${o}:${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = makeCanvas(art.w, art.h);
  const img = art.make(o === O.Boulder ? variant : variant % 3);
  // Blit the hand-drawn art unchanged (no filtering), bottom-centred on the tile.
  ctx2d(cv).drawImage(img as CanvasImageSource, Math.round((art.w - img.width) / 2), art.h - img.height);
  const sp: PropSprite = { img: cv, ox: 8 - art.w / 2, oy: 16 - art.h, shadow: art.shadow };
  cache.set(key, sp);
  return sp;
}

/** Objects drawn flat into the terrain chunk instead of as sprites. */
export const FLAT_OBJECTS = new Set<number>([O.Flowers, O.RockSmall, O.Rail, O.Bones, O.Lilypad]);

/**
 * Paint a flat decal into a chunk context at (x,y) tile origin. `tone` 1 picks
 * the warm sandstone palette for desert and canyon country.
 */
export function paintFlat(c: Ctx, o: number, x: number, y: number, r: Rng, tone = 0): void {
  const put = (img: HTMLCanvasElement | OffscreenCanvas, fx: number, fy: number) => c.drawImage(img as CanvasImageSource, fx, fy);
  switch (o) {
    case O.Flowers: {
      // Fallback (the chunk painter draws meadow flowers itself): a small clustered patch.
      const cols = [['#4a3f8e', '#a8a2ea'], ['#8e2a2a', '#ee7a52'], ['#b8501c', '#ffb45a'], ['#b8b4a0', '#ffffff']][r.int(0, 3)]!;
      for (let i = 0; i < 7; i++) {
        const fx = x + 8 + Math.round(r.range(-5, 5));
        const fy = y + 9 + Math.round(r.range(-4, 4));
        c.fillStyle = '#3f5a2c';
        c.fillRect(fx, fy, 1, 1);
        c.fillStyle = cols[0]!;
        c.fillRect(fx, fy - 1, 1, 1);
        c.fillStyle = cols[1]!;
        c.fillRect(fx, fy - 2, 1, 1);
      }
      break;
    }
    case O.RockSmall: {
      // A scatter of 2–3 hand-drawn pebbles.
      const warm = tone === 1;
      put(DECALS.pebbleL(warm), x + r.int(1, 6), y + r.int(4, 10));
      put(DECALS.pebbleS(warm), x + r.int(8, 12), y + r.int(2, 6));
      if (r.chance(0.5)) put(DECALS.pebbleS(warm), x + r.int(7, 12), y + r.int(10, 13));
      break;
    }
    case O.Bones:
      put(DECALS.skull(), x + 1, y + 4);
      put(DECALS.ribs(), x + 10, y + 10);
      break;
    case O.Lilypad: {
      const n = r.int(2, 3);
      for (let i = 0; i < n; i++) {
        const fx = x + r.int(0, 10);
        const fy = y + r.int(1, 13);
        put(DECALS.lily(), fx, fy);
        if (r.chance(0.3)) put(DECALS.lilyFlower(), fx + 1, fy - 1);
      }
      break;
    }
  }
}
