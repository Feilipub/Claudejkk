/**
 * Boot: loading screen → world generation → title menu (live world behind
 * it) → character creation or load → game loop.
 */
import { TouchControls } from './ui/touch.ts';
import { L, missing as i18nMissing, translateDom } from './core/i18n.ts';
import { horseSprites } from './render/horseSprite.ts';
import { Game } from './game.ts';
import { Animal } from './entities/animal.ts';
import { HAIR_COLORS, SKIN_TONES, humanSprites, PW, PH, type HumanLook } from './render/humanSprite.ts';
import { listSaves } from './systems/save.ts';
import { UI } from './ui/ui.ts';
import { generateWorld } from './world/worldgen.ts';

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;image-rendering:pixelated;cursor:crosshair';
app.appendChild(canvas);
const ui = new UI(app);

const DEFAULT_LOOK: HumanLook = {
  skin: SKIN_TONES[2]!, hair: HAIR_COLORS[2]!, hairStyle: 'short', facial: 'stubble', hat: 'cowboy', hatColor: '#5a4632',
  shirt: '#c9a07a', vest: '#3a2a20', coat: null, pants: '#4a4038', boots: '#2a1d14', skirt: false, bandana: '#9a2a2a', apron: null, badge: false, build: 'average', gunbelt: true,
};

declare global {
  interface Window {
    game?: Game;
    wf?: { ready: boolean; started: boolean; frames: number; errors: string[] };
  }
}
window.wf = { ready: false, started: false, frames: 0, errors: [] };

// --- Phones: play sideways, full screen, no accidental page scroll --------------------------
const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
if (coarse) {
  const rotate = document.createElement('div');
  rotate.id = 'rotate';
  rotate.style.cssText = 'position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:#120d0a;color:#f0e2c4;font:18px Georgia,serif;text-align:center;padding:24px';
  rotate.innerHTML = `<div style="font-size:64px;line-height:1">📱↻</div><div><b>${L('Turn your phone sideways')}</b><br><span style="opacity:.75">${L('Wild Frontier is played in landscape.')}</span></div>`;
  app.appendChild(rotate);
  const check = () => {
    rotate.style.display = window.innerHeight > window.innerWidth ? 'flex' : 'none';
  };
  check();
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', () => setTimeout(check, 200));
  // First touch: go full screen and ask for landscape (works where the browser allows it; harmless elsewhere).
  const goFull = () => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    Promise.resolve(req?.({ navigationUI: 'hide' } as FullscreenOptions))
      .catch(() => undefined)
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => undefined);
  };
  window.addEventListener('touchend', goFull, { once: true, passive: true });
}

window.addEventListener('error', (e) => window.wf!.errors.push(String(e.message)));

function loading(text: string, p: number): void {
  ui.layer.innerHTML = `<div class="menu-bg" style="background:#120d0a"><h1 class="title" style="font-size:64px">Wild Frontier</h1><div class="tagline">${text}…</div><div style="width:320px" class="bar st"><i style="width:${Math.round(p * 100)}%"></i></div></div>`;
}

async function boot(): Promise<void> {
  loading('Surveying Calder Territory', 0.05);
  await new Promise((r) => setTimeout(r, 30));
  await document.fonts?.ready;
  const t0 = performance.now();
  const gen = generateWorld();
  console.log(`World generated in ${Math.round(performance.now() - t0)} ms`);
  loading('Raising the towns', 0.9);
  await new Promise((r) => setTimeout(r, 10));
  const game = new Game(canvas, gen.world, gen.spots, gen.corrals, DEFAULT_LOOK);
  game.ui = ui;
  window.game = game;
  // QA hooks: scene scripts compose sprites directly to check rider/horse alignment and the like.
  (window as unknown as { wfClasses: unknown }).wfClasses = { Animal, humanSprites, horseSprites };
  // Localisation QA: strings asked for in a non-English locale that had no translation yet.
  (window as unknown as { wfI18nMissing: Set<string> }).wfI18nMissing = i18nMissing;
  // Park the camera over Larkspur at golden hour for the title screen.
  game.clock.minutes = 17.6 * 60;
  // Title backdrop: a wild herd grazing on the Calder bottoms at golden hour.
  game.titleMode = true;
  game.player.x = 352 * 16;
  game.player.y = 318 * 16;
  game.spawner.spawnHerd(game.player.x - 30, game.player.y + 20, 'dustfall');
  game.spawner.spawnHerd(game.player.x + 110, game.player.y - 50, 'dustfall');
  game.renderer.snapCamera = true;

  let mode: 'menu' | 'play' = 'menu';
  let touch: TouchControls | null = null;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      if (mode === 'play') {
        game.update(dt);
        ui.update(dt);
        touch?.update();
        game.input.endFrame();
      } else {
        game.time += dt;
        game.player.x += dt * 5;
        game.spatial.rebuild(game.entities);
        for (const e of game.entities) if (e.kind === 'horse') e.update(dt, game);
      }
      game.renderer.render(game, dt);
    } catch (err) {
      console.error(err);
      window.wf!.errors.push(String(err));
    }
    window.wf!.frames++;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.wf!.ready = true;

  const start = () => {
    mode = 'play';
    game.titleMode = false;
    for (const e of game.entities) if (e.kind === 'horse' && (e as unknown as { data: { owner: string } }).data.owner === 'wild') e.dead = true;
    ui.layer.innerHTML = '';
    ui.attach(game);
    touch = new TouchControls(game, ui.layer);
    ui.applySettings();
    game.audio.init();
    game.audio.applyVolumes();
    window.wf!.started = true;
  };

  let pending: string | null = null;
  try {
    pending = sessionStorage.getItem('wf_load');
    if (pending) sessionStorage.removeItem('wf_load');
  } catch {
    pending = null;
  }
  if (pending) {
    if (game.load(pending)) {
      start();
      return;
    }
  }
  titleMenu(game, start);
}

function titleMenu(game: Game, start: () => void): void {
  const saves = listSaves();
  ui.layer.innerHTML = `<div class="menu-bg"><h1 class="title">Wild Frontier</h1><div class="tagline">Calder Territory · 1888</div>
    <button class="menu-btn" id="mnew">New Game</button>
    <button class="menu-btn" id="mcont" ${saves.length ? '' : 'disabled'}>Continue</button>
    <button class="menu-btn" id="mload" ${saves.length ? '' : 'disabled'}>Load</button>
    <button class="menu-btn" id="mabout">About</button>
    <div class="foot">An original western. All art and sound are generated by the game itself.</div></div>`;
  translateDom(ui.layer);
  document.getElementById('mnew')!.onclick = () => creator(game, start);
  document.getElementById('mcont')!.onclick = () => {
    if (game.load(saves[0]!.slot)) start();
  };
  document.getElementById('mload')!.onclick = () => {
    ui.layer.innerHTML = `<div class="menu-bg"><h1 class="title" style="font-size:56px">Load</h1>${saves.map((s) => `<button class="menu-btn" style="width:520px;font:18px Fell,serif" data-slot="${s.slot}">${s.label}<br><small>${new Date(s.savedAt).toLocaleString()}</small></button>`).join('')}<button class="menu-btn" id="mback">Back</button></div>`;
    ui.layer.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => {
      if (game.load((b as HTMLElement).dataset.slot!)) start();
    }));
    translateDom(ui.layer);
    document.getElementById('mback')!.onclick = () => titleMenu(game, start);
  };
  document.getElementById('mabout')!.onclick = () => {
    ui.layer.innerHTML = `<div class="menu-bg"><div class="panel" style="width:min(640px,92vw)"><h2>About</h2><p style="font-size:17px">Wild Frontier is an original open-world western set in the fictional Calder Territory. Ride, care for and bond with your horse, explore six regions, and untangle the mystery behind the rustling on your uncle's ranch.</p><p style="font-size:15px" class="muted">Pixel art, terrain, horses, people, music and sound effects are all generated procedurally at runtime. Fonts: Rye, IM Fell English, Pixelify Sans (SIL Open Font License).</p><div style="text-align:center"><button class="btn" id="mback">Back</button></div></div></div>`;
    translateDom(ui.layer);
    document.getElementById('mback')!.onclick = () => titleMenu(game, start);
  };
}

/** Character creation with live preview. */
function creator(game: Game, start: () => void): void {
  const look: HumanLook = { ...DEFAULT_LOOK };
  let name = 'Wren Calloway';
  let presentation: 'masc' | 'fem' | 'neutral' = 'neutral';
  const opts = {
    hairStyle: ['short', 'long', 'bun', 'braid', 'curly', 'bald'] as HumanLook['hairStyle'][],
    facial: ['none', 'stubble', 'mustache', 'beard', 'goatee'] as HumanLook['facial'][],
    hat: ['cowboy', 'flat', 'bowler', 'derby', 'sombrero', 'cap', 'none'] as HumanLook['hat'][],
    build: ['slim', 'average', 'stocky'] as HumanLook['build'][],
  };
  const fabrics = ['#c9a07a', '#d8d0bc', '#a8b4c0', '#8a9a7a', '#b84a3a', '#6a7aa0', '#e0dcd0', '#5a6a4a', '#7a4a6a', '#3a3440'];
  const darks = ['#3a2a20', '#2e3440', '#4a3a2a', '#5a4a3a', '#2a2a2a', '#6a5040', '#3a4a3a', '#5a2a24'];
  const hats = ['#5a4632', '#3a2a1e', '#2a2522', '#7a6248', '#8a7a5e', '#c8b48a', '#4a4a4a'];
  const render = () => {
    const sw = (key: keyof HumanLook, list: string[], allowNone = false) =>
      `${allowNone ? `<div class="sw ${look[key] === null ? 'on' : ''}" data-k="${key}" data-v="" style="background:repeating-linear-gradient(45deg,#ddd 0 3px,#999 3px 6px)"></div>` : ''}${list.map((c) => `<div class="sw ${look[key] === c ? 'on' : ''}" data-k="${key}" data-v="${c}" style="background:${c}"></div>`).join('')}`;
    const sel = (key: keyof typeof opts) => `<div class="tabs" style="justify-content:flex-start">${opts[key].map((v) => `<button class="btn small ${look[key] === v ? 'active' : ''}" data-o="${key}" data-v="${v}">${v}</button>`).join('')}</div>`;
    ui.layer.innerHTML = `<div class="menu-bg"><div class="panel creator"><div><h2>Who are you?</h2><div class="preview"><canvas id="pv" width="${PW * 3 * 4}" height="${PH * 4}" style="width:${PW * 3 * 4}px;height:${PH * 4}px;image-rendering:pixelated"></canvas></div>
      <p class="muted" style="font-size:15px">A horse-breaker and former army remount wrangler, summoned to Larkspur by a letter from your uncle, Silas Brannigan.</p></div>
      <div><div class="opt-row"><label>Name</label><input class="txt" id="nm" maxlength="28" onfocus="this.select()" value="${name.replace(/"/g, '')}"></div>
      <div class="opt-row"><label>Presentation</label><div class="tabs" style="justify-content:flex-start">${(['masc', 'fem', 'neutral'] as const).map((v) => `<button class="btn small ${presentation === v ? 'active' : ''}" data-pres="${v}">${{ masc: 'Masculine', fem: 'Feminine', neutral: 'Neutral' }[v]}</button>`).join('')}</div></div>
      <div class="opt-row"><label>Skin</label><div class="swatches">${sw('skin', SKIN_TONES)}</div></div>
      <div class="opt-row"><label>Hair colour</label><div class="swatches">${sw('hair', HAIR_COLORS)}</div></div>
      <div class="opt-row"><label>Hair</label>${sel('hairStyle')}</div>
      <div class="opt-row"><label>Facial hair</label>${sel('facial')}</div>
      <div class="opt-row"><label>Build</label>${sel('build')}</div>
      <div class="opt-row"><label>Hat</label>${sel('hat')}<div class="swatches">${sw('hatColor', hats)}</div></div>
      <div class="opt-row"><label>Shirt</label><div class="swatches">${sw('shirt', fabrics)}</div></div>
      <div class="opt-row"><label>Vest</label><div class="swatches">${sw('vest', darks, true)}</div></div>
      <div class="opt-row"><label>Coat</label><div class="swatches">${sw('coat', darks, true)}</div></div>
      <div class="opt-row"><label>Trousers / skirt</label><div class="swatches">${sw('pants', darks)}</div><label style="margin-top:4px"><input type="checkbox" id="skirt" ${look.skirt ? 'checked' : ''}> Riding skirt</label></div>
      <div class="opt-row"><label>Bandana</label><div class="swatches">${sw('bandana', ['#9a2a2a', '#2a4a8a', '#c9a24a', '#3a5a3a', '#e0dcd0'], true)}</div></div>
      <div style="text-align:right;margin-top:10px"><button class="btn" id="back">Back</button><button class="btn gold" id="go">Ride to Larkspur</button></div></div></div></div>`;
    translateDom(ui.layer);
    const pv = document.getElementById('pv') as HTMLCanvasElement;
    const c = pv.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    const set = humanSprites(look);
    c.drawImage(set.frames.down.idle[0] as CanvasImageSource, 0, 0, PW * 4, PH * 4);
    c.drawImage(set.frames.side.walk[1] as CanvasImageSource, PW * 4, 0, PW * 4, PH * 4);
    c.drawImage(set.frames.up.idle[0] as CanvasImageSource, PW * 8, 0, PW * 4, PH * 4);
    ui.layer.querySelectorAll('[data-k]').forEach((e) => e.addEventListener('click', () => {
      const k = (e as HTMLElement).dataset.k as keyof HumanLook;
      const v = (e as HTMLElement).dataset.v!;
      (look as unknown as Record<string, unknown>)[k] = v === '' ? null : v;
      render();
    }));
    ui.layer.querySelectorAll('[data-o]').forEach((e) => e.addEventListener('click', () => {
      (look as unknown as Record<string, unknown>)[(e as HTMLElement).dataset.o!] = (e as HTMLElement).dataset.v;
      render();
    }));
    ui.layer.querySelectorAll('[data-pres]').forEach((e) => e.addEventListener('click', () => {
      presentation = (e as HTMLElement).dataset.pres as typeof presentation;
      if (presentation === 'fem') Object.assign(look, { facial: 'none', hairStyle: 'braid', skirt: true, build: 'slim' });
      if (presentation === 'masc') Object.assign(look, { facial: 'stubble', hairStyle: 'short', skirt: false, build: 'average' });
      if (presentation === 'neutral') Object.assign(look, { facial: 'none', hairStyle: 'short', skirt: false, build: 'average' });
      render();
    }));
    const nm = document.getElementById('nm') as HTMLInputElement;
    nm.oninput = () => (name = nm.value);
    (document.getElementById('skirt') as HTMLInputElement).onchange = (e) => {
      look.skirt = (e.target as HTMLInputElement).checked;
      render();
    };
    document.getElementById('back')!.onclick = () => titleMenu(game, start);
    document.getElementById('go')!.onclick = () => {
      game.player.look = { ...look };
      game.clock.minutes = 8.5 * 60;
      game.newGame(name.trim() || 'Wren Calloway');
      start();
      game.ui.banner('Wild Frontier', 4);
    };
  };
  render();
}

boot().catch((e) => {
  console.error(e);
  window.wf!.errors.push(String(e));
  app.innerHTML = `<pre style="color:#f88;padding:20px">${String(e)}</pre>`;
});
