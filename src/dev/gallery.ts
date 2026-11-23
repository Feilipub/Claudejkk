// Dev page: renders every breed with its animations for visual QA screenshots.
import { humanSprites, type HumanLook } from '../render/humanSprite.ts';
import { BREEDS } from '../data/breeds.ts';
import { generateHorse } from '../horse/generator.ts';
import { horseSprites, HW, HH } from '../render/horseSprite.ts';

const scale = 3;
const cv = document.createElement('canvas');
const anims = ['idle', 'walk', 'trot', 'canter', 'gallop', 'graze', 'rear', 'jump'] as const;
cv.width = (anims.length + 2) * HW * scale;
cv.height = BREEDS.length * HH * scale;
cv.id = 'gallery';
document.body.innerHTML = '';
document.body.style.background = '#6a7a4a';
document.body.appendChild(cv);
const c = cv.getContext('2d')!;
c.imageSmoothingEnabled = false;
const gearSets = [{}, { saddle: 'saddleStock', bridle: 'bridleSnaffle', blanket: 'blanketWool' }, { saddle: 'saddleMcClure', bridle: 'bridleSilver', bags: 'bagsSmall', bedroll: 'bedroll' }];
BREEDS.forEach((b, row) => {
  const h = generateHorse(1000 + row * 17, { breedId: b.id });
  h.gear = gearSets[row % 3] as typeof h.gear;
  const s = horseSprites(h);
  anims.forEach((a, col) => {
    const fr = s.side[a][Math.min(1, s.side[a].length - 1)]!;
    c.drawImage(fr.img as CanvasImageSource, col * HW * scale, row * HH * scale, HW * scale, HH * scale);
  });
  c.drawImage(s.front.walk[1]!.img as CanvasImageSource, anims.length * HW * scale, row * HH * scale, HW * scale, HH * scale);
  c.drawImage(s.back.walk[1]!.img as CanvasImageSource, (anims.length + 1) * HW * scale, row * HH * scale, HW * scale, HH * scale);
  c.fillStyle = '#fff';
  c.font = '12px monospace';
  c.fillText(`${b.name} ${h.appearance.coat}/${h.appearance.pattern}`, 4, row * HH * scale + 12);
});
(window as unknown as { galleryReady: boolean }).galleryReady = true;

// Gait strips for the first breed: every frame of each locomotion cycle.
{
  const h = generateHorse(4242, { breedId: 'quarter' });
  h.appearance.coat = 'bay';
  const s = horseSprites(h);
  const gaits = ['walk', 'trot', 'canter', 'gallop'] as const;
  const cv2 = document.createElement('canvas');
  cv2.id = 'gaits';
  cv2.width = 8 * HW * scale;
  cv2.height = gaits.length * HH * scale;
  document.body.appendChild(cv2);
  const c2 = cv2.getContext('2d')!;
  c2.imageSmoothingEnabled = false;
  c2.fillStyle = '#8a7a50';
  c2.fillRect(0, 0, cv2.width, cv2.height);
  gaits.forEach((g, row) => s.side[g].forEach((f, i) => c2.drawImage(f.img as CanvasImageSource, i * HW * scale, row * HH * scale, HW * scale, HH * scale)));
}

// People: a few looks, all directions and a walk cycle.
{
  const looks = [
    { skin: '#e3b48f', hair: '#3a2618', hairStyle: 'short', facial: 'mustache', hat: 'cowboy', hatColor: '#5a4632', shirt: '#c9a07a', vest: '#3a2a20', coat: null, pants: '#4a4038', boots: '#2a1d14', skirt: false, bandana: '#9a2a2a', apron: null, badge: false, build: 'average', gunbelt: true },
    { skin: '#8a5638', hair: '#1b1410', hairStyle: 'braid', facial: 'none', hat: 'flat', hatColor: '#2a2522', shirt: '#e0dcd0', vest: null, coat: '#3a4a3a', pants: '#5a2a24', boots: '#2a1d14', skirt: true, bandana: null, apron: null, badge: false, build: 'slim', gunbelt: false },
    { skin: '#f1d0b4', hair: '#9c9a95', hairStyle: 'bald', facial: 'beard', hat: 'bowler', hatColor: '#2a2522', shirt: '#a8b4c0', vest: '#2e3440', coat: null, pants: '#34302c', boots: '#1e1612', skirt: false, bandana: null, apron: '#7a6a58', badge: false, build: 'stocky', gunbelt: false },
    { skin: '#c98f66', hair: '#5e3c22', hairStyle: 'long', facial: 'stubble', hat: 'cowboy', hatColor: '#8a7a5e', shirt: '#6a7aa0', vest: null, coat: '#2a2520', pants: '#4a4038', boots: '#3a2618', skirt: false, bandana: null, apron: null, badge: true, build: 'average', gunbelt: true },
  ] as const;
  const cv3 = document.createElement('canvas');
  cv3.id = 'people';
  const sc = 5;
  cv3.width = 12 * 20 * sc;
  cv3.height = looks.length * 28 * sc;
  document.body.appendChild(cv3);
  const c3 = cv3.getContext('2d')!;
  c3.imageSmoothingEnabled = false;
  c3.fillStyle = '#8a7a50';
  c3.fillRect(0, 0, cv3.width, cv3.height);
  looks.forEach((lk, row) => {
    const set = humanSprites(lk as unknown as HumanLook);
    const frames = [set.frames.down.idle[0], set.frames.side.idle[0], set.frames.up.idle[0], ...set.frames.down.walk, ...set.frames.side.walk, set.frames.side.shoot[0]];
    frames.forEach((f, i) => c3.drawImage(f as CanvasImageSource, i * 20 * sc, row * 28 * sc, 20 * sc, 28 * sc));
  });
}

// Front/back views with tack, scaled up for review.
{
  const h = generateHorse(777, { breedId: 'paint' });
  h.gear = { saddle: 'saddleRanch', bridle: 'bridleSnaffle', blanket: 'blanketWool', bags: 'bagsSmall' };
  const s = horseSprites(h);
  const cv4 = document.createElement('canvas');
  cv4.id = 'fb';
  const sc = 5;
  cv4.width = 10 * HW * sc / 2;
  cv4.height = HH * sc;
  document.body.appendChild(cv4);
  const c4 = cv4.getContext('2d')!;
  c4.imageSmoothingEnabled = false;
  c4.fillStyle = '#8a7a50';
  c4.fillRect(0, 0, cv4.width, cv4.height);
  const fr = [...s.front.walk, ...s.back.walk, s.side.idle[0]!];
  fr.forEach((f, i) => c4.drawImage(f.img as CanvasImageSource, i * HW * sc / 2 - HW * sc / 4, 0, HW * sc, HH * sc));
}

// Horse lab: specific coats, patterns and tack in all three views, at 1x (game zoom) and 4x.
{
  const combos: [string, string, string, Record<string, string>][] = [
    ['andalusian', 'black', 'solid', { saddle: 'saddleStock', bridle: 'bridleSnaffle', blanket: 'blanketWool' }],
    ['shire', 'black', 'solid', {}],
    ['quarter', 'buckskin', 'solid', { saddle: 'saddleMcClure', bridle: 'bridleSilver', bags: 'bagsSmall', bedroll: 'bedroll' }],
    ['paint', 'bay', 'tobiano', { saddle: 'saddleRanch', bridle: 'bridleSnaffle', blanket: 'blanketWool', bags: 'bagsSmall' }],
    ['paint', 'chestnut', 'overo', {}],
    ['appaloosa', 'bay', 'blanket', {}],
    ['appaloosa', 'chestnut', 'leopard', {}],
    ['mustang', 'blueRoan', 'solid', {}],
    ['thoroughbred', 'grey', 'solid', {}],
    ['criollo', 'chestnut', 'sabino', {}],
    ['arabian', 'grey', 'solid', {}],
  ];
  const sc = 4;
  const cols = 6;
  const cv5 = document.createElement('canvas');
  cv5.id = 'horselab';
  cv5.width = cols * HW * sc + 4 * HW;
  cv5.height = combos.length * HH * sc;
  document.body.appendChild(cv5);
  const c5 = cv5.getContext('2d')!;
  c5.imageSmoothingEnabled = false;
  c5.fillStyle = '#9c8a5c';
  c5.fillRect(0, 0, cv5.width, cv5.height);
  combos.forEach(([breedId, coat, pattern, gear], row) => {
    const h = generateHorse(5150 + row * 31, { breedId });
    h.appearance.coat = coat;
    h.appearance.pattern = pattern as typeof h.appearance.pattern;
    h.gear = gear as typeof h.gear;
    const s = horseSprites(h);
    const fr = [s.side.idle[0]!, s.side.walk[2]!, s.side.trot[1]!, s.side.gallop[3]!, s.front.walk[1]!, s.back.walk[1]!];
    fr.forEach((f, i) => c5.drawImage(f.img as CanvasImageSource, i * HW * sc, row * HH * sc, HW * sc, HH * sc));
    // Game zoom (1x and 2x) thumbnails at the right.
    [s.side.idle[0]!, s.front.idle[0]!, s.back.idle[0]!].forEach((f, i) => c5.drawImage(f.img as CanvasImageSource, cols * HW * sc + (i % 2) * HW * 2, row * HH * sc + (i >> 1) * HH * 2, HW * 2, HH * 2));
    c5.fillStyle = '#fff';
    c5.font = '12px monospace';
    c5.fillText(`${breedId} ${coat}/${pattern}`, 4, row * HH * sc + 12);
  });
}
