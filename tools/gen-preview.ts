// Dev tool: generate the world in Node and dump a PPM preview + timing.
import { generateWorld } from '../src/world/worldgen.ts';
import { GROUND, OBJ, F } from '../src/world/tiles.ts';
import { writeFileSync } from 'node:fs';
const t0 = performance.now();
const { world, spots, corrals } = generateWorld();
console.log('gen ms', Math.round(performance.now() - t0), 'buildings', world.buildings.length, 'spots', spots.length, 'corrals', corrals.length);
const W = world.w, H = world.h;
const buf = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) {
  let c = GROUND[world.ground[i]!]!.colors[1];
  if (world.flags[i]! & F.Rail) c = '#333333';
  if (world.buildingAt[i]) c = '#702020';
  const o = world.obj[i]!;
  if (o && OBJ[o]!.tall && OBJ[o]!.solid) c = '#203a18';
  const n = parseInt(c.slice(1), 16);
  const shade = 0.7 + world.height[i]! / 255 * 0.5;
  buf[i * 3] = Math.min(255, ((n >> 16) & 255) * shade);
  buf[i * 3 + 1] = Math.min(255, ((n >> 8) & 255) * shade);
  buf[i * 3 + 2] = Math.min(255, (n & 255) * shade);
}
writeFileSync(process.argv[2] ?? 'preview.ppm', Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), buf]));
