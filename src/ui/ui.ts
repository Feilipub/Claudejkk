/**
 * DOM user interface: HUD, prompts, notifications, speech bubbles, and every
 * menu screen. Screens read game state for display and call game/system
 * methods for actions (they do not mutate simulation state themselves except
 * through those calls).
 */
import { getBreed } from '../data/breeds.ts';
import { getCoat, MANE_STYLES, PATTERN_NAMES, TAIL_STYLES } from '../data/coats.ts';
import { getItem, ITEMS, type HorseSlot } from '../data/items.ts';
import { getTrait } from '../data/personalities.ts';
import { getShop, SERVICE_PRICES, type Service } from '../data/shops.ts';
import { POIS, REGIONS, SETTLEMENTS, WORLD_H, WORLD_W } from '../data/world.ts';
import type { HorseEntity } from '../entities/horse.ts';
import type { Game } from '../game.ts';
import { bondName, bondProgress, grantBond } from '../horse/bonding.ts';
import { conditionWords, INJURY_NAMES } from '../horse/care.ts';
import { appraise } from '../horse/economy.ts';
import { bondLevel, maxHealth, maxStamina, rawStat, rideStats, statWord } from '../horse/stats.ts';
import { horseSprites, HW, HH } from '../render/horseSprite.ts';
import { portrait, PORTRAIT_H, PORTRAIT_W } from '../render/portrait.ts';
import { GROUND } from '../world/tiles.ts';
import type { OpenDialogue } from '../systems/dialogue.ts';
import { REP_LABELS } from '../systems/reputation.ts';
import { listSaves } from '../systems/save.ts';
import { SKILL_INFO, type SkillId } from '../systems/skills.ts';
import { CSS } from './style.ts';

type NoteKind = 'info' | 'good' | 'bad' | 'horse' | 'quest' | 'law';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const money = (v: number) => `$${v.toFixed(2)}`;

export class UI {
  game!: Game;
  root: HTMLElement;
  hud: HTMLElement;
  layer: HTMLElement;
  modalEl: HTMLElement | null = null;
  modalName = '';
  pointerOverUi = false;
  private notes: HTMLElement;
  private bannerEl: HTMLElement;
  private bannerT = 0;
  private promptEl: HTMLElement;
  private bubbles: HTMLElement;
  private bubblePool: HTMLElement[] = [];
  private bubbleUsed = 0;
  private meterEl: HTMLElement;
  private fishEl: HTMLElement;
  private minimap: HTMLCanvasElement;
  private mapImage: HTMLCanvasElement | null = null;
  private hudT = 0;
  private dialogueEl: HTMLElement | null = null;
  private reticle: HTMLElement;
  /** Highlighted dialogue option (keyboard arrows / gamepad). */
  private dlgSel = 0;
  private dlgShownAt = 0;
  settings = { textScale: 1, showMinimap: true, music: 0.45, sfx: 0.9, ambience: 0.6, reducedMotion: false, colorblind: false, cameraZoom: 0 };

  constructor(root: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.id = 'ui';
    root.appendChild(this.root);
    this.hud = div(this.root, 'hud');
    this.hud.style.display = 'none';
    this.layer = div(this.root, '');
    // Phones with a notch: keep every HUD element and touch control inside the safe area.
    this.root.style.inset = 'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)';
    this.notes = div(this.hud, 'notes');
    this.bannerEl = div(this.hud, 'banner');
    this.promptEl = div(this.hud, 'prompt');
    // Long prompts (a horse has up to 7 actions) scroll with a finger instead of running under the touch bar.
    Object.assign(this.promptEl.style, { maxHeight: '46vh', overflowY: 'auto', touchAction: 'pan-y', overscrollBehavior: 'contain' });
    this.promptEl.style.display = 'none';
    this.bubbles = div(this.hud, '');
    this.meterEl = div(this.hud, 'meter');
    this.meterEl.style.display = 'none';
    this.fishEl = div(this.hud, 'meter');
    this.fishEl.style.display = 'none';
    this.reticle = div(this.hud, 'reticle');
    this.reticle.style.display = 'none';
    this.minimap = document.createElement('canvas');
    this.minimap.width = 168;
    this.minimap.height = 168;
    this.minimap.className = 'minimap';
    this.loadSettings();
  }

  get modalOpen(): boolean {
    return !!this.modalEl || !!this.dialogueEl;
  }

  attach(game: Game): void {
    this.game = game;
    this.hud.style.display = '';
    this.hud.insertAdjacentHTML(
      'afterbegin',
      `<div class="hud-cores"><div class="core-group" id="pcore"></div><div class="core-group" id="hcore"></div></div>
       <div class="compass" id="compass"></div>
       <div class="hud-tr"><div class="money" id="money"></div><div id="wanted"></div><div class="objective" id="obj"></div></div>
       <div class="hud-bl" id="clock"></div>
       <div class="hud-br"><div class="hud-weapon" id="weapon"></div></div>`,
    );
    this.hud.querySelector('.hud-tr')!.prepend(this.minimap);
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  // --- Notifications ------------------------------------------------------------
  notify(text: string, kind: NoteKind = 'info'): void {
    const n = div(this.notes, `note ${kind}`);
    n.textContent = text;
    while (this.notes.children.length > 6) this.notes.firstElementChild!.remove();
    setTimeout(() => n.classList.add('fade'), 5000);
    setTimeout(() => n.remove(), 5700);
  }
  banner(text: string, seconds: number): void {
    this.bannerEl.textContent = text;
    this.bannerEl.style.opacity = '1';
    this.bannerT = seconds;
  }
  worldBubble(x: number, y: number, text: string, name: string): void {
    const r = this.game.renderer;
    let el = this.bubblePool[this.bubbleUsed];
    if (!el) {
      el = div(this.bubbles, 'bubble');
      this.bubblePool.push(el);
    }
    this.bubbleUsed++;
    el.style.display = '';
    el.style.left = `${(x - r.camX) * r.scale}px`;
    el.style.top = `${(y - r.camY) * r.scale}px`;
    const html = `<small>${esc(name)}</small>${esc(text)}`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  setBreakingMeter(balance: number | null, progress: number): void {
    if (balance === null) {
      this.meterEl.style.display = 'none';
      return;
    }
    this.meterEl.style.display = '';
    this.meterEl.innerHTML = `Breaking the horse — counter the lean with A / D<div class="track"><div class="zone" style="left:30%;width:40%"></div><i style="left:${50 + balance * 42}%"></i></div><div class="bar st" style="margin-top:6px"><i style="width:${progress * 100}%"></i></div>`;
  }
  setFishing(s: { phase: string; tension: number; progress: number } | null): void {
    if (!s) {
      this.fishEl.style.display = 'none';
      return;
    }
    this.fishEl.style.display = '';
    this.fishEl.innerHTML = `${esc(s.phase)}<div class="bar hp"><i style="width:${s.tension * 100}%"></i></div><div class="bar ne"><i style="width:${s.progress * 100}%"></i></div>`;
  }

  // --- Per-frame HUD ------------------------------------------------------------------
  update(dt: number): void {
    const g = this.game;
    // Dialogue navigation without a mouse: W/S or arrows (gamepad d-pad/stick) + E/Enter (gamepad A).
    if (this.dialogueEl && g.dialogue.open && performance.now() - this.dlgShownAt > 200) {
      if (this.dlgPage < this.dlgPages.length - 1) {
        if (g.input.keyPressed('KeyE') || g.input.keyPressed('Enter') || g.input.keyPressed('Space')) this.nextDialoguePage();
      } else {
        const n = g.dialogue.open.options.length;
        const inp = g.input;
        if (inp.keyPressed('KeyS') || inp.keyPressed('ArrowDown')) this.dlgSel = (this.dlgSel + 1) % n;
        if (inp.keyPressed('KeyW') || inp.keyPressed('ArrowUp')) this.dlgSel = (this.dlgSel - 1 + n) % n;
        this.dialogueEl.querySelectorAll('.opt').forEach((b, i) => ((b as HTMLElement).style.background = i === this.dlgSel ? 'rgba(120,80,30,0.18)' : ''));
        if (inp.keyPressed('KeyE') || inp.keyPressed('Enter')) g.dialogue.choose(this.dlgSel);
      }
    }
    for (let i = this.bubbleUsed; i < this.bubblePool.length; i++) this.bubblePool[i]!.style.display = 'none';
    this.bubbleUsed = 0;
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.bannerEl.style.opacity = '0';
    }
    // Reticle.
    const p = g.player;
    // Show the reticle whenever a weapon is drawn, not only while aiming.
    if (p.weapon && !this.modalOpen) {
      this.reticle.style.display = '';
      this.reticle.style.left = `${g.input.mouseX}px`;
      this.reticle.style.top = `${g.input.mouseY}px`;
      const s = (p.aiming ? 18 : 26) + p.spread * 120;
      this.reticle.style.opacity = p.aiming ? "1" : "0.55";
      this.reticle.style.width = this.reticle.style.height = `${s}px`;
    } else this.reticle.style.display = 'none';
    this.updatePrompt();
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    this.updateCores();
    this.updateCompass();
    this.drawMinimap();
    const s = p.stats;
    const reg = REGIONS.find((r) => r.id === g.currentRegion)!;
    const w = g.weather.current;
    const wx = w.kind === 'clear' ? 'Clear' : w.kind[0]!.toUpperCase() + w.kind.slice(1);
    el('clock').innerHTML = `<div class="date">${g.clock.dateString()}</div>${g.clock.timeString()} · ${Math.round(g.temperatureHere)}°F · ${wx}<br>${reg.name}`;
    el('money').textContent = money(p.money);
    const wanted = g.law.get(g.currentRegion);
    el('wanted').innerHTML = wanted.level >= 2 ? `<div class="wanted">WANTED · ${money(wanted.bounty)}</div>` : '';
    const wid = p.weapon;
    if (wid) {
      const it = getItem(wid);
      const ws = it.weapon!;
      el('weapon').innerHTML = `<b>${esc(it.name)}</b>${ws.ammo ? ` &nbsp;${p.clip[wid] ?? 0}/${ws.clip} · ${p.inv.count(ws.ammo)}` : ''}${p.reloadT > 0 ? ' · reloading' : ''}`;
    } else el('weapon').innerHTML = `<span style="opacity:.7">Holstered — [G] draw · [Z/X] switch</span>`;
    // Tracked objective.
    const q = g.quests.tracked ? g.quests.defs.get(g.quests.tracked) : null;
    const objEl = el('obj');
    if (q && g.quests.state(q.id)?.status === 'active') {
      const st = g.quests.state(q.id)!;
      const objs = g.quests.visibleObjectives(q.id).filter((o) => !st.done.includes(o.id));
      const o = objs[0];
      let dist = '';
      if (o) {
        const t = g.quests.objectiveTarget(o);
        if (t) dist = `${(Math.hypot(t.x - p.x, t.y - p.y) / 16 * 2 / 1609 * 1000).toFixed(o ? 0 : 0)}`;
        if (t) dist = `${Math.round(Math.hypot(t.x - p.x, t.y - p.y) / 16 * 2)} yds`;
      }
      const prog = o && o.count && o.count > 1 ? ` (${st.progress[o.id] ?? 0}/${o.count})` : '';
      objEl.style.display = '';
      const wp = g.waypoint ? `<div class="dist">◆ Waypoint ${Math.round(Math.hypot(g.waypoint.x - p.x, g.waypoint.y - p.y) / 8)} yds</div>` : '';
      objEl.innerHTML = `<div class="qt">${esc(q.title)}</div>${o ? esc(o.text) + prog : 'Complete the stage'}${dist ? `<div class="dist">${dist}</div>` : ''}${wp}`;
    } else if (g.waypoint) {
      objEl.style.display = '';
      objEl.innerHTML = `<div class="qt">Waypoint</div><div class="dist">${Math.round(Math.hypot(g.waypoint.x - p.x, g.waypoint.y - p.y) / 8)} yds</div>`;
    } else objEl.style.display = 'none';
  }

  private updateCores(): void {
    const g = this.game;
    const p = g.player;
    const s = p.stats;
    const pc = el('pcore');
    const tags: string[] = [];
    if (s.hunger < 25) tags.push('Hungry');
    if (s.thirst < 25) tags.push('Thirsty');
    if (s.energy < 20) tags.push('Exhausted');
    if (g.temperatureHere < 30 && !g.nearFire) tags.push('Cold');
    if (g.temperatureHere > 95) tags.push('Hot');
    if (p.inv.weight > p.inv.capacity) tags.push('Overburdened');
    pc.innerHTML = `<h4>${esc(p.name)}<span>${p.crouching ? 'Crouched' : ''}</span></h4>
      ${bar('hp', s.health / s.maxHealth)}${bar('st', s.stamina / 100, s.maxStamina / 100)}
      <div class="bar ne"><i style="width:${Math.min(s.hunger, s.thirst)}%"></i></div>
      <div class="tags">${tags.join(' · ')}</div>`;
    const h = p.mount ?? g.mainHorse();
    const hc = el('hcore');
    if (!h) {
      hc.style.display = 'none';
      return;
    }
    hc.style.display = '';
    const d = h.data;
    const gait = p.mount === h ? ['', 'Walk', 'Trot', 'Canter', 'Gallop'][h.gaitLevel] : h.brain.label;
    const cw = conditionWords(d).filter((x) => x !== 'In fine condition').slice(0, 2);
    hc.innerHTML = `<h4>${esc(d.name)}<span>${esc(gait ?? '')}</span></h4>
      ${bar('hp', d.health / maxHealth(d))}${bar('st', d.stamina / Math.max(1, rideStats(d).staminaMax), maxStamina(d) / 100)}
      <div class="bar bd"><i style="width:${bondLevel(d) >= 5 ? 100 : bondProgress(d) * 100}%"></i></div>
      <div class="tags">Bond ${bondLevel(d)} · ${bondName(d)}${cw.length ? ' · ' + cw.join(', ') : ''}${d.stress > 60 ? ' · Spooked' : ''}</div>`;
  }

  private updateCompass(): void {
    const g = this.game;
    const p = g.player;
    const c = el('compass');
    const heading = p.mount ? p.mount.heading : p.angle;
    const items: string[] = [];
    const put = (ang: number, label: string, cls: string) => {
      let d = ang - heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > Math.PI / 2) return;
      items.push(`<span class="${cls}" style="left:${50 + (d / (Math.PI / 2)) * 48}%">${label}</span>`);
    };
    const cards: [number, string][] = [[-Math.PI / 2, 'N'], [0, 'E'], [Math.PI / 2, 'S'], [Math.PI, 'W'], [-Math.PI / 4, 'NE'], [Math.PI / 4, 'SE'], [(3 * Math.PI) / 4, 'SW'], [(-3 * Math.PI) / 4, 'NW']];
    for (const [a, l] of cards) put(a, l, l.length === 1 ? 'cd' : '');
    const t = this.trackedTarget();
    if (t) put(Math.atan2(t.y - p.y, t.x - p.x), '◆', 'obj');
    const h = g.mainHorse();
    if (h && !p.mount) put(Math.atan2(h.y - p.y, h.x - p.x), '♞', '');
    c.innerHTML = items.join('');
  }

  trackedTarget(): { x: number; y: number } | null {
    const g = this.game;
    if (g.raceMarkers[0]) return g.raceMarkers[0];
    if (g.waypoint) {
      if (Math.hypot(g.waypoint.x - g.player.x, g.waypoint.y - g.player.y) < 48) {
        g.waypoint = null;
        g.setFlag('waypoint', false);
        this.notify('Waypoint reached.', 'info');
      } else return g.waypoint;
    }
    const q = g.quests.tracked;
    if (!q || g.quests.state(q)?.status !== 'active') return g.waypoint;
    const st = g.quests.state(q)!;
    for (const o of g.quests.visibleObjectives(q)) {
      if (st.done.includes(o.id)) continue;
      const t = g.quests.objectiveTarget(o);
      if (t) return t;
    }
    return g.waypoint;
  }

  private updatePrompt(): void {
    const g = this.game;
    const t = g.interactions.current;
    const p = g.player;
    const lines: string[] = [];
    if (t && t.actions.length && !this.modalOpen) {
      t.actions.slice(0, 7).forEach((a, i) => {
        const key = i === g.interactions.selected ? 'E' : String(i + 1);
        lines.push(`<div class="pa ${i === g.interactions.selected ? 'sel' : ''} ${a.enabled === false ? 'dis' : ''}" data-i="${i}"><span class="key">${key}</span>${esc(a.label)}</div>`);
      });
    }
    const mountable = !p.mount && g.nearestRideableHorse(p.x, p.y, 28);
    if (mountable && !this.modalOpen) lines.push(`<div class="pa"><span class="key">F</span>Mount ${esc(mountable.data.name)}</div>`);
    if (p.mount && !this.modalOpen) lines.push(`<div class="pa kbd-only"><span class="key">F</span>Dismount &nbsp;<span class="key">Shift</span>Faster <span class="key">Ctrl</span>Slower <span class="key">Space</span>Jump</div>`);
    if (!lines.length) {
      this.promptEl.style.display = 'none';
      return;
    }
    this.promptEl.style.display = '';
    const html = `${t ? `<div class="pt">${esc(t.title)}</div>${t.subtitle ? `<div class="ps">${esc(t.subtitle)}</div>` : ''}` : ''}${lines.join('')}`;
    if (this.promptEl.innerHTML !== html) {
      this.promptEl.innerHTML = html;
      // Keep the selected row in view when ◀ ▶ cycle through a long list.
      const sel = this.promptEl.querySelector('.pa.sel') as HTMLElement | null;
      sel?.scrollIntoView?.({ block: 'nearest' });
    }
  }

  /** Pre-render the whole territory map once. */
  private buildMapImage(): HTMLCanvasElement {
    if (this.mapImage) return this.mapImage;
    const W = this.game.world;
    const cv = document.createElement('canvas');
    cv.width = W.w;
    cv.height = W.h;
    const c = cv.getContext('2d')!;
    const img = c.createImageData(W.w, W.h);
    const cols = Object.fromEntries(Object.entries(GROUND).map(([k, v]) => [k, hex(v.colors[1])]));
    for (let i = 0; i < W.w * W.h; i++) {
      let col = cols[W.ground[i]!]!;
      const hgt = W.height[i]!;
      const sh = 0.75 + (hgt / 255) * 0.45 - (i % W.w > 0 ? (W.height[i]! - W.height[i - 1]!) * -0.01 : 0);
      if (W.flags[i]! & 1) col = [150, 120, 85];
      if (W.flags[i]! & 2) col = [70, 62, 58];
      if (W.buildingAt[i]) col = [110, 60, 40];
      const o = W.obj[i]!;
      if (o === 1 || o === 18 || o === 2 || o === 3 || o === 5 || o === 20) col = [col[0] * 0.62, col[1] * 0.72, col[2] * 0.6];
      img.data[i * 4] = Math.min(255, col[0] * sh);
      img.data[i * 4 + 1] = Math.min(255, col[1] * sh);
      img.data[i * 4 + 2] = Math.min(255, col[2] * sh * 0.95);
      img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    // Sepia wash for the parchment look.
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = 'rgba(230,205,160,0.55)';
    c.fillRect(0, 0, W.w, W.h);
    c.globalCompositeOperation = 'source-over';
    this.mapImage = cv;
    return cv;
  }

  private drawMinimap(): void {
    const g = this.game;
    this.minimap.style.display = this.settings.showMinimap ? '' : 'none';
    if (!this.settings.showMinimap) return;
    const c = this.minimap.getContext('2d')!;
    const img = this.buildMapImage();
    const p = g.player;
    const tx = p.x / 16;
    const ty = p.y / 16;
    const zoom = 2.2;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#2a2016';
    c.fillRect(0, 0, 168, 168);
    c.drawImage(img, tx - 84 / zoom, ty - 84 / zoom, 168 / zoom, 168 / zoom, 0, 0, 168, 168);
    const toMini = (x: number, y: number) => [84 + (x / 16 - tx) * zoom, 84 + (y / 16 - ty) * zoom] as const;
    for (const e of g.spatial.query(p.x, p.y, 700)) {
      if (e.kind === 'npc' && (e as unknown as { hostile: boolean }).hostile) dot(c, ...toMini(e.x, e.y), '#d83a2a', 2);
      else if (e.kind === 'npc' && (e as unknown as { alive: boolean }).alive) {
        const m = g.npcMarker(e.id);
        if (m) dot(c, ...toMini(e.x, e.y), m === '!' ? '#f0cf7a' : '#9fd0ff', 2.5);
      }
    }
    for (const h of g.ownedHorses()) if (!h.rider) dot(c, ...toMini(h.x, h.y), '#b996e0', 2.5);
    const t = this.trackedTarget();
    if (t) {
      let [mx, my] = toMini(t.x, t.y);
      const d = Math.hypot(mx - 84, my - 84);
      if (d > 74) {
        mx = 84 + ((mx - 84) / d) * 74;
        my = 84 + ((my - 84) / d) * 74;
      }
      dot(c, mx, my, '#f0cf7a', 4);
    }
    // Player arrow.
    const a = p.mount ? p.mount.heading : p.angle;
    c.save();
    c.translate(84, 84);
    c.rotate(a);
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(6, 0);
    c.lineTo(-4, -4);
    c.lineTo(-2, 0);
    c.lineTo(-4, 4);
    c.closePath();
    c.fill();
    c.restore();
  }

  // --- Modal management -------------------------------------------------------------------
  private onKey(e: KeyboardEvent): void {
    const g = this.game;
    if (!g) return;
    if (this.dialogueEl && g.dialogue.open && performance.now() - this.dlgShownAt > 200) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && this.dlgPage >= this.dlgPages.length - 1) g.dialogue.choose(n - 1);
      if (e.code === 'Escape') g.dialogue.close();
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.modalEl) this.closeModal();
      else this.openPause();
      return;
    }
    if (this.modalEl && this.modalName !== 'pause') {
      const map: Record<string, string> = { KeyI: 'inventory', Tab: 'inventory', KeyM: 'map', KeyJ: 'journal', KeyB: 'horse', KeyO: 'character' };
      if (map[e.code] === this.modalName) this.closeModal();
      return;
    }
    if (this.modalEl || !g.player.alive) return;
    if (e.code === 'KeyI' || e.code === 'Tab') this.openInventory(null);
    if (e.code === 'KeyM') this.openMap();
    if (e.code === 'KeyJ') this.openJournal();
    if (e.code === 'KeyO') this.openCharacter();
    if (e.code === 'KeyB') {
      const h = g.player.mount ?? g.mainHorse();
      if (h) this.openHorse(h);
      else this.notify('You have no horse yet.', 'info');
    }
  }

  modal(name: string, html: string, width = 760): HTMLElement {
    // Re-rendering the same screen (after a purchase, a tab click…) keeps the scroll position.
    const same = this.modalName === name;
    const keepScroll = same ? (this.modalEl?.querySelector('.panel') as HTMLElement | null)?.scrollTop ?? 0 : 0;
    if (same) this.modalCancel = null;
    this.closeModal();
    const m = div(this.layer, 'modal');
    m.innerHTML = `<div class="panel" style="width:min(${width}px,94vw)"><button class="close" data-close>✕</button>${html}</div>`;
    m.querySelector('[data-close]')!.addEventListener('click', () => this.closeModal());
    m.addEventListener('mousedown', (e) => {
      if (e.target === m) this.closeModal();
    });
    this.modalEl = m;
    this.modalName = name;
    this.game?.input && (this.game.input.blocked = true);
    if (!same) this.game?.audio.play('ui');
    const panel = m.querySelector('.panel') as HTMLElement;
    if (keepScroll) requestAnimationFrame(() => (panel.scrollTop = keepScroll));
    return panel;
  }
  /** Called when the open modal is dismissed without picking an option (Esc). */
  private modalCancel: (() => void) | null = null;

  closeModal(): void {
    if (!this.modalEl) return;
    const cancel = this.modalCancel;
    this.modalCancel = null;
    this.modalEl.remove();
    this.modalEl = null;
    this.modalName = '';
    if (this.game) this.game.input.blocked = !!this.dialogueEl;
    this.game?.audio.play('uiBack');
    cancel?.();
  }

  choice(text: string, options: { label: string; enabled: boolean; run: () => void }[], onCancel?: () => void): void {
    const p = this.modal('choice', `<p style="font-size:19px">${esc(text)}</p><div id="ch"></div>`, 560);
    this.modalCancel = onCancel ?? null;
    const ch = p.querySelector('#ch')!;
    for (const o of options) {
      const b = button(ch as HTMLElement, o.label, 'btn');
      b.disabled = !o.enabled;
      b.onclick = () => {
        this.modalCancel = null;
        this.closeModal();
        o.run();
      };
    }
  }

  // --- Dialogue ------------------------------------------------------------------------------
  /** Split long lines into ~120-character pages at sentence boundaries. */
  private pageText(text: string): string[] {
    if (text.length <= 140) return [text];
    const sentences = text.match(/[^.!?]+[.!?]+["'”’)]*\s*|[^.!?]+$/g) ?? [text];
    const pages: string[] = [];
    let cur = '';
    for (const sn of sentences) {
      if (cur && (cur + sn).length > 130) {
        pages.push(cur.trim());
        cur = '';
      }
      cur += sn;
    }
    if (cur.trim()) pages.push(cur.trim());
    return pages;
  }
  private dlgPages: string[] = [];
  private dlgPage = 0;
  private dlgOpen: OpenDialogue | null = null;

  showDialogue(d: OpenDialogue): void {
    this.closeModal();
    this.dlgOpen = d;
    this.dlgPages = this.pageText(d.text);
    this.dlgPage = 0;
    this.dlgShownAt = performance.now();
    this.renderDialogue();
  }

  /** Advance to the next page of a long line; returns false if already on the last page. */
  private nextDialoguePage(): boolean {
    if (this.dlgPage >= this.dlgPages.length - 1) return false;
    this.dlgPage++;
    this.dlgShownAt = performance.now();
    this.renderDialogue();
    return true;
  }

  private renderDialogue(): void {
    const d = this.dlgOpen!;
    if (!this.dialogueEl) this.dialogueEl = div(this.layer, 'dialogue');
    this.game.input.blocked = true;
    const n = d.npc;
    const occ = n.occupation === 'saloongirl' ? 'hostess' : n.occupation;
    const last = this.dlgPage >= this.dlgPages.length - 1;
    this.dialogueEl.innerHTML = `<div class="panel dlg-grid"><canvas class="portrait" width="${PORTRAIT_W}" height="${PORTRAIT_H}"></canvas><div><div class="speaker">${esc(n.name)}<small>${esc(occ)}</small></div><div class="text">${esc(this.dlgPages[this.dlgPage] ?? '')}</div><div id="opts"></div></div></div>`;
    const pc = (this.dialogueEl.querySelector('.portrait') as HTMLCanvasElement).getContext('2d')!;
    pc.drawImage(portrait(n.look, n.id, n.occupation === 'child') as CanvasImageSource, 0, 0);
    const box = this.dialogueEl.querySelector('#opts') as HTMLElement;
    if (!last) {
      const b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = `<span class="key">E</span>Continue ▸ <span class="tone">${this.dlgPage + 1}/${this.dlgPages.length}</span>`;
      b.onclick = () => this.nextDialoguePage();
      box.appendChild(b);
      this.dlgSel = 0;
      return;
    }
    this.dlgSel = Math.max(0, d.options.findIndex((o) => o.enabled));
    d.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.disabled = !o.enabled;
      b.innerHTML = `<span class="key">${i + 1}</span>${esc(o.enabled ? o.opt.text : `${o.opt.text} — ${o.opt.lockedHint ?? ''}`)}${o.opt.tone ? `<span class="tone">${o.opt.tone}</span>` : ''}`;
      b.onclick = () => this.game.dialogue.choose(i);
      box.appendChild(b);
    });
  }
  hideDialogue(): void {
    this.dialogueEl?.remove();
    this.dialogueEl = null;
    if (this.game) this.game.input.blocked = !!this.modalEl;
  }

  // --- Pause / settings / saves ----------------------------------------------------------
  openPause(): void {
    const p = this.modal(
      'pause',
      `<h2>Paused</h2><div class="sub">${esc(this.game.clock.dateString())} · ${Math.floor(this.game.playtime / 60)} min played</div>
      <div style="text-align:center" id="pb"></div>
      <h3>Controls</h3>${document.body.classList.contains('has-touch') ? `<div class="help">Left thumb — drag to move / steer<br>E — talk, interact (or tap a prompt line)<br>Montar — mount / dismount<br>Correr — run / spur up a gait<br>Frear — slow / calm a bolting horse<br>Pular — jump (trot or faster)<br>Assobio — whistle for your horse<br>Arma — draw / holster<br>Atirar — fire where you face (or tap a spot)<br>Recarregar — reload<br>◀ ▶ — cycle prompt options<br>Bottom bar — menu, map, items, horse, journal, camp</div><h3>Keyboard</h3>` : ''}<div class="help">
      WASD — move / steer horse<br>Shift — run / spur up a gait<br>Ctrl / C — slow down<br>Q — rein back (mounted)<br>Space — jump (canter+)<br>F — mount / dismount<br>H — whistle for your horse<br>E / 1–6 — interact<br>
      G — draw / holster<br>Z / X / wheel — switch weapon<br>RMB — aim · LMB — fire<br>R — reload<br>V — crouch (stalk)<br>L — lantern<br>K — make camp<br>I / Tab — inventory<br>B — horse · M — map<br>J — journal · O — character<br>F5 — quick save</div>`,
      620,
    );
    const pb = p.querySelector('#pb') as HTMLElement;
    button(pb, 'Resume', 'btn gold').onclick = () => this.closeModal();
    button(pb, 'Save', 'btn').onclick = () => this.openSaves(true);
    button(pb, 'Load', 'btn').onclick = () => this.openSaves(false);
    button(pb, 'Settings', 'btn').onclick = () => this.openSettings();
    const quit = button(pb, 'Quit to title', 'btn red');
    quit.onclick = () => {
      // Ask once: unsaved progress since the last save is lost.
      if (quit.dataset.armed) location.reload();
      else {
        quit.dataset.armed = '1';
        quit.textContent = 'Unsaved progress will be lost. Click again to quit';
      }
    };
  }

  openSaves(saving: boolean): void {
    const saves = listSaves();
    const p = this.modal('saves', `<h2>${saving ? 'Save Game' : 'Load Game'}</h2><div id="sl"></div>`, 620);
    const sl = p.querySelector('#sl') as HTMLElement;
    const slots = saving ? ['slot1', 'slot2', 'slot3'] : [...new Set([...saves.map((s) => s.slot)])];
    if (!slots.length) sl.innerHTML = '<p class="muted">No saved games.</p>';
    for (const slot of slots) {
      const meta = saves.find((s) => s.slot === slot);
      const r = div(sl, 'row');
      r.innerHTML = `<div><div class="nm">${slot === 'autosave' ? 'Autosave' : slot.replace('slot', 'Slot ')}</div><div class="ds">${meta ? esc(meta.label) + ' · ' + new Date(meta.savedAt).toLocaleString() : 'Empty'}</div></div>`;
      const b = button(r, saving ? 'Save here' : 'Load', 'btn small');
      b.onclick = () => {
        if (saving) {
          this.game.slot = slot;
          this.game.save(slot, true);
          this.closeModal();
        } else {
          try {
            sessionStorage.setItem('wf_load', slot);
            location.reload();
          } catch {
            if (this.game.load(slot)) this.closeModal();
          }
        }
      };
    }
  }

  openSettings(): void {
    const s = this.settings;
    const p = this.modal(
      'settings',
      `<h2>Settings</h2>
      <div class="opt-row"><label>Text size</label><input type="range" min="0.8" max="1.5" step="0.05" value="${s.textScale}" id="ts"></div>
      <div class="opt-row"><label>Camera</label><select id="cz"><option value="-1" ${s.cameraZoom === -1 ? 'selected' : ''}>Far (see more)</option><option value="0" ${s.cameraZoom === 0 ? 'selected' : ''}>Normal</option><option value="1" ${s.cameraZoom === 1 ? 'selected' : ''}>Close (bigger)</option></select></div>
      <div class="opt-row"><label>Music volume</label><input type="range" min="0" max="1" step="0.05" value="${s.music}" id="mv"></div>
      <div class="opt-row"><label>Effects volume</label><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" id="sv"></div>
      <div class="opt-row"><label>Ambience volume</label><input type="range" min="0" max="1" step="0.05" value="${s.ambience}" id="av"></div>
      <div class="opt-row"><label><input type="checkbox" id="mm" ${s.showMinimap ? 'checked' : ''}> Show minimap</label></div>
      <div class="opt-row"><label><input type="checkbox" id="rm" ${s.reducedMotion ? 'checked' : ''}> Reduced motion (no screen shake)</label></div>
      <div class="opt-row"><label><input type="checkbox" id="cb" ${s.colorblind ? 'checked' : ''}> Colour-blind friendly palette</label></div>`,
      520,
    );
    const bind = (id: string, f: (v: string, el: HTMLInputElement) => void) => {
      const i = p.querySelector('#' + id) as HTMLInputElement;
      i.oninput = i.onchange = () => {
        f(i.value, i);
        this.applySettings();
      };
    };
    bind('ts', (v) => (s.textScale = +v));
    bind('cz', (v) => (s.cameraZoom = +v));
    bind('mv', (v) => (s.music = +v));
    bind('sv', (v) => (s.sfx = +v));
    bind('av', (v) => (s.ambience = +v));
    bind('mm', (_v, e) => (s.showMinimap = e.checked));
    bind('rm', (_v, e) => (s.reducedMotion = e.checked));
    bind('cb', (_v, e) => (s.colorblind = e.checked));
  }
  private loadSettings(): void {
    try {
      const raw = localStorage.getItem('wf_settings');
      if (raw) Object.assign(this.settings, JSON.parse(raw));
    } catch {
      /* storage unavailable */
    }
  }
  applySettings(): void {
    const s = this.settings;
    this.root.style.fontSize = `${s.textScale * 100}%`;
    this.root.classList.toggle('cb', s.colorblind);
    (this.root.style as unknown as { zoom: string }).zoom = String(s.textScale);
    if (this.game) {
      this.game.audio.volume.music = s.music;
      this.game.audio.volume.sfx = s.sfx;
      this.game.audio.volume.amb = s.ambience;
      this.game.audio.applyVolumes();
      this.game.renderer.reducedMotion = s.reducedMotion;
      if (this.game.renderer.zoomStep !== s.cameraZoom) {
        this.game.renderer.zoomStep = s.cameraZoom;
        this.game.renderer.resize();
      }
    }
    try {
      localStorage.setItem('wf_settings', JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }

  showDeath(cause: string): void {
    const m = div(this.layer, 'modal');
    m.innerHTML = `<div style="text-align:center"><div class="death">You Died</div><p style="font:italic 22px Fell,serif;color:#e6d2a8">Killed by ${esc(cause)}.</p></div>`;
    const b = button(m.firstElementChild as HTMLElement, 'Wake up', 'btn gold');
    this.modalEl = m;
    this.modalName = 'death';
    b.onclick = () => {
      m.remove();
      this.modalEl = null;
      this.game.input.blocked = false;
      this.game.respawn();
    };
  }

  // --- Inventory ---------------------------------------------------------------------------
  openInventory(horse: HorseEntity | null): void {
    const g = this.game;
    const p = g.player;
    const h = horse ?? (g.mainHorse() && Math.hypot(g.mainHorse()!.x - p.x, g.mainHorse()!.y - p.y) < 120 ? g.mainHorse() : null);
    const render = () => {
      const panel = this.modal('inventory', '', 980);
      panel.insertAdjacentHTML('beforeend', `<h2>Satchel</h2><div class="sub">Carrying ${p.inv.weight.toFixed(1)} / ${p.inv.capacity} kg · ${money(p.money)}</div><div class="grid2"><div id="pinv"></div><div id="hinv"></div></div>`);
      const pinv = panel.querySelector('#pinv') as HTMLElement;
      const cats: [string, string[]][] = [
        ['Weapons', ['weapon']],
        ['Provisions', ['food', 'drink', 'meat', 'fish']],
        ['Medicine', ['medicine']],
        ['Horse care', ['horseFood', 'horseMedicine', 'horseCare']],
        ['Ammunition', ['ammo']],
        ['Goods & valuables', ['pelt', 'valuable', 'material', 'tool']],
        ['Documents & quest items', ['document', 'quest']],
      ];
      pinv.insertAdjacentHTML('beforeend', '<h3>Weapons</h3>');
      for (const w of p.weapons) {
        const r = div(pinv, 'row');
        const it = getItem(w);
        r.innerHTML = `<div><div class="nm">${esc(it.name)}${p.weapon === w ? ' <span class="chip">equipped</span>' : ''}</div><div class="ds">${esc(it.description)}</div></div>`;
        button(r, 'Equip', 'btn small').onclick = () => {
          p.weaponIdx = p.weapons.indexOf(w);
          // Selected, not drawn: walking out of a shop with an iron in hand gets the law's attention.
          p.holstered = true;
          render();
        };
      }
      for (const [title, cs] of cats.slice(1)) {
        const items = p.inv.entries().filter(([id]) => cs.includes(getItem(id).category));
        if (!items.length) continue;
        pinv.insertAdjacentHTML('beforeend', `<h3>${title}</h3>`);
        for (const [id, q] of items) {
          const it = getItem(id);
          const r = div(pinv, 'row');
          r.innerHTML = `<div><div class="nm">${esc(it.name)} ×${q}</div><div class="ds">${esc(it.description)}</div></div>`;
          if (['food', 'drink', 'medicine'].includes(it.category)) button(r, 'Use', 'btn small').onclick = () => { this.useItem(id); render(); };
          if (it.category === 'document' || it.category === 'quest') {
            const doc = g.content.LORE.find((l) => l.id === `doc_${id.replace(/_([a-z])/g, (_m, c) => c.toUpperCase())}` || l.id === id);
            if (doc) button(r, 'Read', 'btn small').onclick = () => this.openLore(doc.id);
          }
          if (h && it.category !== 'quest') button(r, '→ Bags', 'btn small').onclick = () => {
            p.inv.remove(id);
            h.data.bagItems[id] = (h.data.bagItems[id] ?? 0) + 1;
            render();
          };
          if (it.category !== 'quest' && it.category !== 'document') {
            // Two taps to drop: Drop sits right beside Use, and a thumb slips.
            const db = button(r, 'Drop', 'btn small red');
            db.onclick = () => {
              if (db.dataset.armed) { p.inv.remove(id); render(); }
              else { db.dataset.armed = '1'; db.textContent = 'Drop?'; setTimeout(() => { if (db.isConnected) { delete db.dataset.armed; db.textContent = 'Drop'; } }, 2500); }
            };
          }
        }
      }
      const hinv = panel.querySelector('#hinv') as HTMLElement;
      if (!h) {
        hinv.innerHTML = '<h3>Saddlebags</h3><p class="muted">Your horse is not close enough to reach the saddlebags.</p>';
        return;
      }
      const cap = rideStats(h.data).carry + 10;
      const used = Object.entries(h.data.bagItems).reduce((s, [id, q]) => s + getItem(id).weight * q, 0);
      hinv.innerHTML = `<h3>${esc(h.data.name)}'s saddlebags</h3><div class="small-note">${used.toFixed(1)} / ${cap.toFixed(0)} kg</div>`;
      for (const [id, q] of Object.entries(h.data.bagItems)) {
        if (q <= 0) continue;
        const it = getItem(id);
        const r = div(hinv, 'row');
        r.innerHTML = `<div class="nm">${esc(it.name)} ×${q}</div>`;
        button(r, 'Take', 'btn small').onclick = () => {
          if (!p.inv.canAdd(id)) return this.notify('No room in your satchel.', 'bad');
          p.inv.add(id);
          h.data.bagItems[id]!--;
          if (h.data.bagItems[id]! <= 0) delete h.data.bagItems[id];
          render();
        };
      }
      const gear = Object.entries(g.ownedGear).filter(([, n]) => n > 0);
      if (gear.length) {
        hinv.insertAdjacentHTML('beforeend', '<h3>Spare tack</h3>');
        for (const [id, n] of gear) div(hinv, 'row').innerHTML = `<div class="nm">${esc(getItem(id).name)} ×${n}</div><div class="ds">Equip from the horse screen [B]</div>`;
      }
    };
    render();
  }

  useItem(id: string): void {
    const g = this.game;
    const p = g.player;
    const it = getItem(id);
    const e = it.effects ?? {};
    if (!p.inv.remove(id)) return;
    const s = p.stats;
    s.hunger = Math.min(100, s.hunger + (e.hunger ?? 0));
    s.thirst = Math.min(100, s.thirst + (e.thirst ?? 0));
    s.health = Math.min(s.maxHealth, s.health + (e.health ?? 0));
    s.stamina = Math.min(s.maxStamina, s.stamina + (e.stamina ?? 0));
    s.energy = Math.min(100, s.energy + (e.energy ?? 0));
    if (e.warmth) s.warmthBuff = Math.max(s.warmthBuff, e.warmth);
    p.act(0.8);
    g.audio.play(it.category === 'drink' ? 'drink' : 'eat');
    this.notify(`You use the ${it.name.toLowerCase()}.`, 'info');
  }

  // --- Horse screen ------------------------------------------------------------------------
  openHorse(h: HorseEntity, sale?: { shop: string; price: number }): void {
    const g = this.game;
    const d = h.data;
    const breed = getBreed(d.breedId);
    const own = d.owner === 'player';
    let tab = sale ? 'stats' : 'overview';
    const render = () => {
      const panel = this.modal('horse', '', 980);
      const rs = rideStats(d);
      const tabs = own ? ['overview', 'stats', 'gear', 'care', 'history'] : ['overview', 'stats'];
      panel.innerHTML += `<h2>${esc(d.name)}</h2><div class="sub">${esc(breed.name)} · ${getCoat(d.appearance.coat).name}${d.appearance.pattern !== 'solid' ? ' ' + PATTERN_NAMES[d.appearance.pattern] : ''} · ${d.sex} · ${d.age.toFixed(1)} years${sale ? ` · <b>Asking ${money(sale.price)}</b>` : ''}</div>
        <div class="tabs">${tabs.map((t) => `<button class="btn small ${t === tab ? 'active' : ''}" data-tab="${t}">${t[0]!.toUpperCase() + t.slice(1)}</button>`).join('')}</div>
        <div class="grid2"><div><canvas id="hprev" width="${HW * 5}" height="${HH * 5}" style="width:100%;image-rendering:pixelated;background:radial-gradient(circle at 50% 70%,#c9b080,#7a5e3a);border:2px solid #4a3526"></canvas><div id="hleft"></div></div><div id="hright"></div></div>`;
      panel.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = (b as HTMLElement).dataset.tab!; render(); }));
      panel.querySelector('[data-close]')!.addEventListener('click', () => this.closeModal());
      const cv = panel.querySelector('#hprev') as HTMLCanvasElement;
      const c = cv.getContext('2d')!;
      c.imageSmoothingEnabled = false;
      const set = horseSprites(d);
      let f = 0;
      const anim = () => {
        if (!cv.isConnected) return;
        c.clearRect(0, 0, cv.width, cv.height);
        const frames = set.side.idle;
        c.drawImage(frames[Math.floor(f / 20) % frames.length]!.img as CanvasImageSource, 0, 0, cv.width, cv.height);
        f++;
        requestAnimationFrame(anim);
      };
      anim();
      const left = panel.querySelector('#hleft') as HTMLElement;
      const right = panel.querySelector('#hright') as HTMLElement;
      left.innerHTML = `<div style="margin-top:8px">${d.traits.map((t) => `<span class="chip" title="${esc(getTrait(t).description)}">${getTrait(t).name}</span>`).join('')} ${conditionWords(d).map((w) => `<span class="chip ${w === 'In fine condition' ? '' : 'warn'}">${esc(w)}</span>`).join('')}</div>
        <p class="muted" style="font-size:14px">${esc(breed.description)}</p>`;
      if (sale) {
        const b = button(left, `Buy for ${money(sale.price)}`, 'btn gold');
        b.disabled = g.player.money < sale.price;
        b.onclick = () => {
          const err = g.economy.buyHorse(sale.shop, d.id);
          if (err) this.notify(err, 'bad');
          else {
            this.closeModal();
            g.audio.play('coin');
          }
        };
      }
      if (tab === 'overview') {
        const val = appraise(d).value;
        right.innerHTML = `<h3>Bond</h3><div class="statline"><span>${bondName(d)} (${bondLevel(d)}/5)</span><div class="statbar good"><i style="width:${bondLevel(d) >= 5 ? 100 : bondProgress(d) * 100}%"></i></div><span>${Math.round(d.trust)} trust</span></div>
          <h3>Condition</h3>
          ${statline('Health', d.health / maxHealth(d), `${Math.round(d.health)}/${maxHealth(d)}`)}
          ${statline('Stamina', d.stamina / rs.staminaMax, `${Math.round(d.stamina)}/${rs.staminaMax}`)}
          ${statline('Energy', d.energy / 100, Math.round(d.energy) + '%')}
          ${statline('Fed', d.hunger / 100, Math.round(d.hunger) + '%')}
          ${statline('Watered', d.thirst / 100, Math.round(d.thirst) + '%')}
          ${statline('Cleanliness', d.cleanliness / 100, Math.round(d.cleanliness) + '%')}
          ${statline('Hooves', d.hoof / 100, Math.round(d.hoof) + '%')}
          ${statline('Calm', 1 - d.stress / 100, Math.round(100 - d.stress) + '%')}
          <h3>Details</h3><div class="kv"><b>Personality</b><span>${d.traits.map((t) => getTrait(t).description).join(' ')}</span>
          <b>Favourite treat</b><span>${own || bondLevel(d) >= 2 ? esc(getItem(d.favoriteFood).name) : 'Unknown — spend time together'}</span>
          <b>Dislikes</b><span>${own && bondLevel(d) >= 3 ? esc(d.dislike) : own ? 'Not yet known (bond 3)' : 'Unknown'}</span>
          <b>Distance ridden</b><span>${d.kmRidden.toFixed(1)} km</span><b>Fair value</b><span>${money(val)}</span><b>Mood</b><span>${esc(h.brain.label)}</span></div>`;
        if (own) {
          const wrap = div(right, 'opt-row');
          wrap.innerHTML = `<label for="rename">Name</label><input class="txt" id="rename" maxlength="24" value="${esc(d.name)}" style="width:60%">`;
          const rn = button(wrap, 'Rename', 'btn small');
          rn.onclick = () => {
            const v = (wrap.querySelector('#rename') as HTMLInputElement).value.trim();
            if (v) {
              d.name = v.slice(0, 24);
              render();
            }
          };
        }
      } else if (tab === 'stats') {
        const keys: [string, keyof typeof breed.stats][] = [['Top speed', 'speed'], ['Acceleration', 'acceleration'], ['Stamina', 'stamina'], ['Recovery', 'recovery'], ['Agility', 'agility'], ['Handling', 'handling'], ['Jumping', 'jumping'], ['Endurance', 'endurance'], ['Strength', 'strength'], ['Courage', 'courage'], ['Responsiveness', 'responsiveness'], ['Toughness', 'health'], ['Carrying', 'carry'], ['Sure-footedness', 'trail'], ['Temperament', 'temperament'], ['Gait comfort', 'comfort']];
        right.innerHTML = `<h3>Abilities</h3>${keys.map(([n, k]) => { const v = rawStat(d, k); return statline(n, v / 11, statWord(v)); }).join('')}
          <h3>Training</h3>${statline('Groundwork', d.training.groundwork / 100, Math.round(d.training.groundwork) + '')}${statline('Under saddle', d.training.saddle / 100, Math.round(d.training.saddle) + '')}${statline('Conditioning', d.training.speed / 100, Math.round(d.training.speed) + '')}${statline('Jumping', d.training.jumping / 100, Math.round(d.training.jumping) + '')}${statline('Steady (gunfire)', d.training.desensitised / 100, Math.round(d.training.desensitised) + '')}
          <h3>In the saddle</h3><div class="kv"><b>Gallop</b><span>${(rs.gaitSpeed.gallop / 16 * 2 * 2.237 * 0.62).toFixed(0)} mph</span><b>Max gait now</b><span>${rs.maxGait}</span><b>Fear response</b><span>${rs.fear < 0.6 ? 'Steady' : rs.fear < 1 ? 'Alert' : 'Jumpy'}</span><b>Obedience</b><span>${Math.round(rs.obedience * 100)}%</span><b>Saddlebag capacity</b><span>${rs.carry.toFixed(0)} kg</span></div>`;
      } else if (tab === 'gear') {
        const slots: HorseSlot[] = ['saddle', 'bridle', 'blanket', 'bags', 'shoes', 'bedroll', 'decoration'];
        right.innerHTML = '<h3>Tack</h3>';
        for (const s of slots) {
          const cur = d.gear[s];
          const r = div(right, 'row');
          r.innerHTML = `<div><div class="nm">${s[0]!.toUpperCase() + s.slice(1)}: ${cur ? esc(getItem(cur).name) : '<i>none</i>'}</div>${cur ? `<div class="ds">Condition ${Math.round(d.gearCondition[s] ?? 100)}%</div>` : ''}</div>`;
          if (cur) button(r, 'Remove', 'btn small').onclick = () => {
            g.ownedGear[cur] = (g.ownedGear[cur] ?? 0) + 1;
            delete d.gear[s];
            h.refreshStats();
            render();
          };
          const options = Object.entries(g.ownedGear).filter(([id, n]) => n > 0 && getItem(id).gear?.slot === s);
          for (const [id] of options) {
            button(r, `Fit ${getItem(id).name}`, 'btn small gold').onclick = () => {
              if (cur) g.ownedGear[cur] = (g.ownedGear[cur] ?? 0) + 1;
              g.ownedGear[id]!--;
              d.gear[s] = id;
              d.gearCondition[s] = 100;
              h.refreshStats();
              render();
            };
          }
        }
        right.insertAdjacentHTML('beforeend', '<p class="small-note">Saddles change stamina use and comfort, bags add carrying capacity, shoes protect hooves on rock, blankets keep a horse warm in the high country. Gear wears with use — a smithy or stable can mend it.</p>');
      } else if (tab === 'care') {
        right.innerHTML = `<h3>Injuries</h3>${d.injuries.length ? d.injuries.map((i) => `<div class="row"><span>${INJURY_NAMES[i.kind]}</span><span class="pr">${Math.round(i.severity)}% ${i.treated ? '(treated)' : '(untreated)'}</span></div>`).join('') : '<p class="muted">No injuries.</p>'}
          <p class="small-note">Injuries heal with rest and time; treated wounds heal three times faster. Stabling a horse heals it fastest. A lame horse cannot gallop.</p>
          <h3>Care guide</h3><p style="font-size:15px">Brush to keep the coat clean, feed hay or oats when hungry, water at troughs and streams, pick hooves on rocky country. Feed its favourite treat for extra trust. Avoid riding it to exhaustion, gallops over rocks, and gunfire near its head.</p>`;
      } else if (tab === 'history') {
        right.innerHTML = `<h3>Life story</h3>${d.history.slice().reverse().map((e) => `<div class="row"><span class="ds">Day ${e.day}</span><span>${esc(e.text)}</span></div>`).join('') || '<p class="muted">Nothing yet.</p>'}`;
      }
    };
    render();
  }

  // --- Shops, stables and services --------------------------------------------------------------
  openShop(shopId: string): void {
    const g = this.game;
    const def = getShop(shopId);
    if (!def) return;
    if (g.dialogue.open) g.dialogue.close();
    let tab = def.horses || def.services.includes('stable') ? 'stable' : 'buy';
    if (Object.keys(def.stock).length) tab = 'buy';
    const render = () => {
      const panel = this.modal('shop', '', 900);
      const tabs: string[] = [];
      if (Object.keys(def.stock).length) tabs.push('buy');
      if (def.buys.length) tabs.push('sell');
      if (def.services.length) tabs.push('services');
      if (def.horses || def.services.includes('sellHorse') || def.services.includes('stable')) tabs.push('stable');
      if (!tabs.includes(tab)) tab = tabs[0] ?? 'buy';
      panel.innerHTML += `<h2>${esc(def.name)}</h2><div class="sub">${money(g.player.money)} · ${REGIONS.find((r) => r.id === def.region)?.name}</div>
        <div class="tabs">${tabs.map((t) => `<button class="btn small ${t === tab ? 'active' : ''}" data-tab="${t}">${({ buy: 'Buy', sell: 'Sell', services: 'Services', stable: 'Horses & stable' } as Record<string, string>)[t]}</button>`).join('')}</div><div id="sbody"></div>`;
      panel.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = (b as HTMLElement).dataset.tab!; render(); }));
      panel.querySelector('[data-close]')!.addEventListener('click', () => this.closeModal());
      const body = panel.querySelector('#sbody') as HTMLElement;
      if (tab === 'buy') {
        const stock = g.economy.shopStock(shopId);
        for (const [id, q] of Object.entries(stock)) {
          const it = getItem(id);
          const price = g.economy.buyPrice(shopId, id);
          const owned = it.category === 'horseGear' ? g.ownedGear[id] ?? 0 : it.weapon ? (g.player.weapons.includes(id) ? 1 : 0) + g.player.inv.count(id) : g.player.inv.count(id);
          const r = div(body, 'row');
          r.innerHTML = `<div><div class="nm">${esc(it.name)} <span class="small-note">(${q} in stock · you have ${owned})</span></div><div class="ds">${esc(it.description)}${it.gear ? ' ' + gearDesc(it.gear) : ''}</div></div><div class="pr">${money(price)}</div>`;
          const b = button(r, 'Buy', 'btn small');
          b.disabled = q <= 0 || g.player.money < price;
          b.onclick = () => {
            const err = g.economy.buy(shopId, id);
            if (err) this.notify(err, 'bad');
            else g.audio.play('coin');
            render();
          };
        }
      } else if (tab === 'sell') {
        const items = g.player.inv.entries().filter(([id]) => def.buys.includes(getItem(id).category));
        if (!items.length) body.innerHTML = '<p class="muted">You have nothing they want.</p>';
        for (const [id, q] of items) {
          const price = g.economy.sellPrice(shopId, id);
          const r = div(body, 'row');
          r.innerHTML = `<div class="nm">${esc(getItem(id).name)} ×${q}</div><div class="pr">${money(price)}</div>`;
          button(r, 'Sell', 'btn small').onclick = () => { g.economy.sell(shopId, id); g.audio.play('coin'); render(); };
          if (q > 1) button(r, 'Sell all', 'btn small').onclick = () => { for (let i = 0; i < q; i++) g.economy.sell(shopId, id); g.audio.play('coin'); render(); };
        }
      } else if (tab === 'services') this.renderServices(body, shopId, render);
      else this.renderStable(body, shopId, render);
    };
    render();
  }

  private renderServices(body: HTMLElement, shopId: string, rerender: () => void): void {
    const g = this.game;
    const def = getShop(shopId)!;
    const h = g.mainHorse();
    const near = h && Math.hypot(h.x - g.player.x, h.y - g.player.y) < 260 ? h : null;
    const svc = (s: Service, label: string, desc: string, run: () => string | null, needHorse = true) => {
      if (!def.services.includes(s)) return;
      const price = g.economy.servicePrice(s);
      const r = div(body, 'row');
      r.innerHTML = `<div><div class="nm">${label}</div><div class="ds">${desc}</div></div><div class="pr">${price ? money(price) : ''}</div>`;
      const b = button(r, 'Pay', 'btn small');
      b.disabled = g.player.money < price || (needHorse && !near);
      b.onclick = () => {
        const err = run();
        if (err) return this.notify(err, 'bad');
        g.player.money -= price;
        g.audio.play('coin');
        rerender();
      };
    };
    if (!near && def.services.some((s) => ['vet', 'shoe', 'groom', 'train', 'customize', 'repair'].includes(s))) body.insertAdjacentHTML('beforeend', '<p class="muted">Bring your horse close by to use horse services.</p>');
    svc('vet', 'Veterinary care', 'Treat all injuries and restore health.', () => {
      near!.data.injuries.forEach((i) => { i.treated = true; i.severity *= 0.3; });
      near!.data.health = maxHealth(near!.data);
      grantBond(near!.data, 'treatInjury', g.clock.day);
      return null;
    });
    svc('shoe', 'Shoeing', 'Fit steel shoes and trim hooves.', () => { near!.data.gear.shoes = near!.data.gear.shoes ?? 'shoesSteel'; near!.data.gearCondition.shoes = 100; near!.data.hoof = 100; near!.refreshStats(); return null; });
    svc('groom', 'Full grooming', 'Wash, brush and braid. Your horse will feel good.', () => { near!.data.cleanliness = 100; near!.data.stress = 0; grantBond(near!.data, 'brush', g.clock.day); return null; });
    svc('repair', 'Mend tack', 'Restore all equipment to full condition.', () => { for (const s of Object.keys(near!.data.gear)) near!.data.gearCondition[s as HorseSlot] = 100; return null; });
    if (def.services.includes('train')) {
      body.insertAdjacentHTML('beforeend', '<h3>Training (1 hour each)</h3>');
      const tr = (key: 'groundwork' | 'desensitised' | 'jumping' | 'speed' | 'saddle', label: string, desc: string) =>
        svc('train', label, desc, () => {
          const d = near!.data;
          const cur = d.training[key];
          if (cur >= 100) return 'Nothing more to teach.';
          const stub = d.traits.includes('stubborn') ? 0.6 : d.traits.includes('curious') ? 1.3 : 1;
          d.training[key] = Math.min(100, cur + (14 - cur / 10) * stub * (1 + g.player.skills.level('horsemanship') * 0.1));
          d.energy = Math.max(0, d.energy - 12);
          grantBond(d, 'train', g.clock.day);
          g.player.skills.gain('horsemanship', 8);
          g.advanceTime(60);
          near!.refreshStats();
          this.notify(`${d.name}: ${label.toLowerCase()} improved.`, 'horse');
          return null;
        });
      tr('groundwork', 'Groundwork', 'Leading, standing, yielding. Improves obedience and mounting.');
      tr('desensitised', 'Desensitising', 'Tarps, rattles, blank shots. Steadies it under gunfire and near predators.');
      tr('jumping', 'Jumping', 'Cavaletti and logs. Better at clearing fences.');
      tr('speed', 'Conditioning', 'Hill gallops. More stamina and speed.');
      tr('saddle', 'Saddle work', 'Calm, balanced work under a rider. Ends bucking.');
    }
    if (def.services.includes('customize') && near) {
      const d = near.data;
      body.insertAdjacentHTML('beforeend', '<h3>Mane & tail</h3>');
      const r = div(body, 'row');
      r.innerHTML = `<div class="nm">Mane: ${d.appearance.maneStyle} · Tail: ${d.appearance.tailStyle} · Length ${Math.round(d.appearance.maneLength * 100)}%</div>`;
      button(r, 'Mane style', 'btn small').onclick = () => { const i = MANE_STYLES.indexOf(d.appearance.maneStyle as (typeof MANE_STYLES)[number]); d.appearance.maneStyle = MANE_STYLES[(i + 1) % MANE_STYLES.length]!; g.player.money -= 0.5; rerender(); };
      button(r, 'Tail style', 'btn small').onclick = () => { const i = TAIL_STYLES.indexOf(d.appearance.tailStyle as (typeof TAIL_STYLES)[number]); d.appearance.tailStyle = TAIL_STYLES[(i + 1) % TAIL_STYLES.length]!; g.player.money -= 0.5; rerender(); };
      button(r, 'Trim', 'btn small').onclick = () => { d.appearance.maneLength = Math.max(0.6, d.appearance.maneLength - 0.15); g.player.money -= 0.5; rerender(); };
    }
    svc('room', 'Rent a room', 'A bed for the night (sleep in the hotel).', () => {
      const b = g.world.buildings.find((x) => x.shopId === shopId);
      if (b) g.setFlag(`room_${b.id}`, g.clock.day);
      this.closeModal();
      this.openSleep('bed');
      return null;
    }, false);
    svc('bath', 'Hot bath', 'Wash the trail off. Folks will notice.', () => { g.changeOpinion('townsfolk', 2); g.player.stats.energy = Math.min(100, g.player.stats.energy + 15); g.advanceTime(30); return null; }, false);
    svc('drink', 'A drink at the bar', 'Whiskey, neat.', () => { g.player.stats.thirst = Math.min(100, g.player.stats.thirst + 10); g.player.stats.warmthBuff = 90; return null; }, false);
    svc('meal', 'Hot meal', 'Beans, bacon, biscuits and coffee.', () => { g.player.stats.hunger = 100; g.player.stats.health = Math.min(100, g.player.stats.health + 20); return null; }, false);
    if (def.services.includes('stage')) {
      body.insertAdjacentHTML('beforeend', '<h3>Stagecoach</h3><p class="small-note">Your horse is tied behind the coach and travels with you. Time passes on the road.</p>');
      const here = SETTLEMENTS.find((x) => g.buildingsOf(x.id).some((b) => b.shopId === shopId));
      const stops = ['larkspur', 'portashby', 'sulfurflats', 'meridian', 'whitepeak', 'fortrourke'].filter((id) => id !== here?.id);
      for (const id of stops) {
        const dest = SETTLEMENTS.find((x) => x.id === id)!;
        const dist = here ? Math.hypot(dest.x - here.x, dest.y - here.y) : 200;
        const fare = Math.round(dist / 40) + 1;
        const hours = Math.max(1, Math.round(dist / 45));
        const r = div(body, 'row');
        r.innerHTML = `<div><div class="nm">${esc(dest.name)}</div><div class="ds">${hours} hours on the road</div></div><div class="pr">${money(fare)}</div>`;
        const b = button(r, 'Travel', 'btn small');
        b.disabled = g.player.money < fare || g.law.isWanted(g.currentRegion);
        b.onclick = () => {
          g.player.money -= fare;
          this.closeModal();
          g.fastTravel(dest.x * 16 + 8, (dest.y + 3) * 16, hours * 60);
          this.banner(dest.name, 3);
        };
      }
    }
    if (def.services.includes('blackjack')) button(body, 'Sit down at the blackjack table', 'btn gold').onclick = () => this.openBlackjack();
    if (def.services.includes('rent')) {
      body.insertAdjacentHTML('beforeend', `<h3>Rent a horse</h3>`);
      svc('rent', 'Rent a steady livery horse for 3 days', 'An honest Morgan. Must be returned.', () => {
        g.giveHorse({ breedId: 'morgan', name: 'Livery Hack', training: 'trained', gear: { saddle: 'saddleStock', bridle: 'bridleSnaffle' } });
        const h2 = g.mainHorse()!;
        h2.data.rentalUntilDay = g.clock.day + 3;
        h2.data.hunger = 90;
        h2.data.thirst = 90;
        h2.data.cleanliness = 90;
        const st = g.world.buildings.find((b) => b.shopId === shopId)!;
        h2.x = st.doorX * 16;
        h2.y = (st.y + st.h + 1) * 16;
        return null;
      }, false);
    }
  }

  private renderStable(body: HTMLElement, shopId: string, rerender: () => void): void {
    const g = this.game;
    const def = getShop(shopId)!;
    if (def.horses) {
      body.insertAdjacentHTML('beforeend', '<h3>Horses for sale</h3><p class="small-note">You can also walk into the corral and look each one over before buying.</p>');
      for (const hd of g.economy.horsesFor(shopId)) {
        const price = g.economy.horseAsk(shopId, hd);
        const r = div(body, 'row');
        r.innerHTML = `<div><div class="nm">${esc(hd.name)} — ${esc(getBreed(hd.breedId).name)}</div><div class="ds">${getCoat(hd.appearance.coat).name} ${hd.appearance.pattern !== 'solid' ? PATTERN_NAMES[hd.appearance.pattern] : ''} · ${hd.sex} · ${Math.floor(hd.age)} yrs · ${hd.traits.map((t) => getTrait(t).name).join(', ')}</div></div><div class="pr">${money(price)}</div>`;
        const he = g.horses.get(hd.id);
        if (he) button(r, 'Inspect', 'btn small').onclick = () => this.openHorse(he, { shop: shopId, price });
        const b = button(r, 'Buy', 'btn small gold');
        b.disabled = g.player.money < price;
        b.onclick = () => {
          const err = g.economy.buyHorse(shopId, hd.id);
          if (err) this.notify(err, 'bad');
          else g.audio.play('coin');
          rerender();
        };
      }
    }
    const owned = g.ownedHorses();
    if (def.services.includes('sellHorse')) {
      body.insertAdjacentHTML('beforeend', '<h3>Sell a horse</h3>');
      for (const h of owned) {
        if (h.data.tag === 'rental') continue;
        const near = Math.hypot(h.x - g.player.x, h.y - g.player.y) < 300;
        const offer = g.economy.horseOffer(shopId, h.data);
        const r = div(body, 'row');
        r.innerHTML = `<div class="nm">${esc(h.data.name)} <span class="small-note">${esc(getBreed(h.data.breedId).name)}${h.data.owner === 'stolen' ? ' · stolen' : ''}</span></div><div class="pr">${money(offer)}</div>`;
        const b = button(r, 'Sell', 'btn small red');
        b.disabled = !near || g.player.mount === h;
        b.onclick = () => g.ui.choice(`Sell ${h.data.name} for ${money(offer)}? This can't be undone.`, [
          { label: 'Sell', enabled: true, run: () => { const e = g.economy.sellHorse(shopId, h.id); if (e) this.notify(e, 'bad'); else this.notify(`You said goodbye to ${h.data.name}.`, 'horse'); } },
          { label: 'Keep', enabled: true, run: () => {} },
        ]);
      }
    }
    if (shopId === 'ranch_brannigan') {
      const mares = owned.filter((h) => h.data.sex === 'mare' && h.data.age >= 4);
      const sires = owned.filter((h) => h.data.sex === 'stallion' && h.data.age >= 4);
      body.insertAdjacentHTML('beforeend', `<h3>Breeding</h3><p class="small-note">Bring a mare and a stallion you own to the ranch. Foals take after both parents and arrive in a few days. Pregnant mares: ${g.pregnancies.length ? g.pregnancies.map((p) => esc(g.horses.get(p.damId)?.data.name ?? '?') + ' (day ' + p.dueDay + ')').join(', ') : 'none'}.</p>`);
      if (!mares.length || !sires.length) body.insertAdjacentHTML('beforeend', '<p class="muted">You need both a mare and a stallion, four years or older.</p>');
      else {
        const r = div(body, 'row');
        r.innerHTML = `<label for="dam">Mare</label><select id="dam">${mares.map((h) => `<option value="${h.id}">${esc(h.data.name)} (${esc(getBreed(h.data.breedId).name)})</option>`).join('')}</select><label for="sire">Stallion</label><select id="sire">${sires.map((h) => `<option value="${h.id}">${esc(h.data.name)} (${esc(getBreed(h.data.breedId).name)})</option>`).join('')}</select>`;
        button(r, 'Breed', 'btn small gold').onclick = () => {
          const err = g.breed((r.querySelector('#dam') as HTMLSelectElement).value, (r.querySelector('#sire') as HTMLSelectElement).value);
          if (err) this.notify(err, 'bad');
          rerender();
        };
      }
    }
    if (def.services.includes('stable')) {
      body.insertAdjacentHTML('beforeend', `<h3>Your horses</h3><p class="small-note">Choose which horse is your main horse (the one that answers your whistle). Stabling costs ${money(SERVICE_PRICES.stable)}/day: the horse is fed, watered and heals fast.</p>`);
      for (const h of owned) {
        const r = div(body, 'row');
        r.innerHTML = `<div class="nm">${esc(h.data.name)}${g.player.mainHorseId === h.id ? ' <span class="chip">main</span>' : ''}</div><div class="ds">${conditionWords(h.data).join(', ')}</div>`;
        if (g.player.mainHorseId !== h.id) button(r, 'Make main', 'btn small').onclick = () => { g.player.mainHorseId = h.id; rerender(); };
        const near = Math.hypot(h.x - g.player.x, h.y - g.player.y) < 300;
        if (near && g.player.mount !== h) button(r, 'Stable overnight', 'btn small').onclick = () => {
          g.player.money -= SERVICE_PRICES.stable;
          h.data.hunger = 100; h.data.thirst = 100; h.data.cleanliness = 100; h.data.energy = 100; h.data.stress = 0;
          h.data.health = maxHealth(h.data);
          for (const i of h.data.injuries) { i.severity *= 0.4; i.treated = true; }
          grantBond(h.data, 'shelter', g.clock.day);
          this.notify(`${h.data.name} is fed, watered and rested.`, 'horse');
          rerender();
        };
      }
    }
  }

  // --- Map ---------------------------------------------------------------------------------------
  openMap(): void {
    const g = this.game;
    const panel = this.modal('map', `<h2>Calder Territory</h2><div class="sub">Click or tap a location to set a waypoint · Your horse ♞ · Objective ◆</div><div class="mapwrap" style="display:flex;justify-content:center"><canvas id="mapc"></canvas></div><div class="mapzoom" style="display:flex;gap:8px;justify-content:center;margin:6px 0"><button class="btn small" data-z="-1">−</button><button class="btn small" data-z="1">+</button></div><div id="legend" class="small-note"></div>`, 1000);
    const cv = panel.querySelector('#mapc') as HTMLCanvasElement;
    // Fits a phone held sideways as well as a desktop window.
    const size = Math.max(220, Math.min(900, window.innerHeight - 170, window.innerWidth - 80));
    cv.width = size;
    cv.height = size;
    cv.style.width = cv.style.height = `${size}px`;
    // The map is painted at zoom × size into an offscreen sheet; the visible canvas shows a window of it.
    const vc = cv.getContext('2d')!;
    const big = document.createElement('canvas');
    let c = big.getContext('2d')!;
    let zoom = 1;
    let ox = 0;
    let oy = 0;
    let B = size;
    let s = size / WORLD_W;
    const draw = () => {
      B = Math.round(size * zoom);
      big.width = big.height = B;
      c = big.getContext('2d')!;
      s = B / WORLD_W;
      c.imageSmoothingEnabled = false;
      c.drawImage(this.buildMapImage(), 0, 0, B, B);
      // Unexplored fog.
      const fog = document.createElement('canvas');
      fog.width = fog.height = 96;
      const fc = fog.getContext('2d')!;
      const fi = fc.createImageData(96, 96);
      for (let i = 0; i < 96 * 96; i++) {
        fi.data[i * 4] = 222; fi.data[i * 4 + 1] = 204; fi.data[i * 4 + 2] = 164;
        fi.data[i * 4 + 3] = g.explored[i] ? 0 : 190;
      }
      fc.putImageData(fi, 0, 0);
      c.imageSmoothingEnabled = true;
      c.drawImage(fog, 0, 0, B, B);
      c.imageSmoothingEnabled = false;
      // Labels are placed without overlapping: towns first, then landmarks, then (faint) region names.
      const placed: [number, number, number, number][] = [];
      const hits = (x: number, y: number, w: number, h: number) => placed.some(([a, b, cw, ch]) => x < a + cw && x + w > a && y < b + ch && y + h > b);
      const label = (text: string, ax: number, ay: number, font: string, fill: string, offsets: [number, number][], halo = true): boolean => {
        c.font = font;
        const w = c.measureText(text).width + 4;
        const h = parseInt(font, 10) + 2;
        for (const [ox, oy] of offsets) {
          const x = ax + ox - w / 2;
          const y = ay + oy - h + 2;
          if (x < 0 || y < 0 || x + w > B || y + h > B || hits(x, y, w, h)) continue;
          placed.push([x, y, w, h]);
          if (halo) {
            c.strokeStyle = 'rgba(240,226,196,0.85)';
            c.lineWidth = 3;
            c.strokeText(text, ax + ox, ay + oy);
          }
          c.fillStyle = fill;
          c.fillText(text, ax + ox, ay + oy);
          return true;
        }
        return false;
      };
      c.textAlign = 'center';
      const fs = Math.max(11, Math.round(size / 62));
      const around: [number, number][] = [[0, -7], [0, fs + 8], [fs * 4, 4], [-fs * 4, 4], [0, -7 - fs], [0, fs * 2 + 8]];
      for (const st of SETTLEMENTS) {
        const known = g.flags[`visited_${st.id}`] || st.kind === 'town' || st.kind === 'city' || st.id === 'brannigan';
        if (!known) continue;
        c.fillStyle = '#3a1e10';
        c.fillRect(st.x * s - 3, st.y * s - 3, 6, 6);
        placed.push([st.x * s - 4, st.y * s - 4, 8, 8]);
      }
      for (const st of SETTLEMENTS) {
        const known = g.flags[`visited_${st.id}`] || st.kind === 'town' || st.kind === 'city' || st.id === 'brannigan';
        if (known) label(st.name, st.x * s, st.y * s, `${fs}px Fell, serif`, '#3a1e10', around);
      }
      for (const p of POIS) {
        if (!g.discovered.has(p.id)) continue;
        c.fillStyle = '#7a2418';
        c.beginPath();
        c.arc(p.x * s, p.y * s, 3, 0, Math.PI * 2);
        c.fill();
        label(p.name, p.x * s, p.y * s, `${fs - 1}px Fell, serif`, '#4a2a18', around.map(([x, y]) => [x, y + 6] as [number, number]));
      }
      for (const r of REGIONS) {
        const [x, y] = r.seeds[0]!;
        label(r.name.toUpperCase(), x * s, y * s - 20, `${Math.round(size / 40)}px Rye, serif`, 'rgba(60,35,20,0.5)', [[0, 0], [0, -size / 30], [0, size / 30], [size / 20, 0], [-size / 20, 0]], false);
      }
      const t = this.trackedTarget();
      if (t) {
        c.fillStyle = '#c99a40';
        c.font = `${Math.round(size / 45)}px serif`;
        c.fillText('◆', (t.x / 16) * s, (t.y / 16) * s + 5);
      }
      for (const h of g.ownedHorses()) {
        c.fillStyle = '#5a3a8a';
        c.font = `bold ${Math.round(size / 36)}px serif`;
        c.strokeStyle = '#f0e2c4';
        c.lineWidth = 3;
        c.strokeText('♞', (h.x / 16) * s, (h.y / 16) * s + 4);
        c.fillText('♞', (h.x / 16) * s, (h.y / 16) * s + 4);
      }
      const p = g.player;
      c.fillStyle = '#b02010';
      c.beginPath();
      c.arc((p.x / 16) * s, (p.y / 16) * s, 5, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#fff';
      c.stroke();
      if (g.flags.waypoint) {
        const [wx, wy] = String(g.flags.waypoint).split(',').map(Number);
        c.strokeStyle = '#2a1d14';
        c.beginPath();
        c.arc(wx! * s, wy! * s, 7, 0, Math.PI * 2);
        c.stroke();
      }
      // Show the window around the player (clamped to the sheet).
      ox = Math.max(0, Math.min(B - size, (g.player.x / 16) * s - size / 2));
      oy = Math.max(0, Math.min(B - size, (g.player.y / 16) * s - size / 2));
      vc.clearRect(0, 0, size, size);
      vc.drawImage(big, ox, oy, size, size, 0, 0, size, size);
    };
    draw();
    panel.querySelectorAll('[data-z]').forEach((bt) =>
      bt.addEventListener('click', () => {
        zoom = Math.max(1, Math.min(4, zoom * (Number((bt as HTMLElement).dataset.z) > 0 ? 2 : 0.5)));
        draw();
      }),
    );
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const tx = Math.round(((ox + ((e.clientX - r.left) / r.width) * size) / B) * WORLD_W);
      const ty = Math.round(((oy + ((e.clientY - r.top) / r.height) * size) / B) * WORLD_H);
      g.setFlag('waypoint', `${tx},${ty}`);
      g.raceMarkers = [];
      g.raceMarkers.length = 0;
      // The waypoint leads the compass, but the tracked mission stays tracked underneath it.
      g.waypoint = { x: tx * 16, y: ty * 16 };
      draw();
      this.notify('Waypoint set. Your mission is still tracked; the compass leads to the waypoint until you reach it.', 'info');
    });
    // Towns and ranches you have ridden into count as discoveries too.
    const visited = SETTLEMENTS.filter((st) => g.flags[`visited_${st.id}`]).length;
    (panel.querySelector('#legend') as HTMLElement).textContent = `Discovered ${g.discovered.size + visited}/${POIS.length + SETTLEMENTS.length} places · ${visited} settlements, ${g.discovered.size} landmarks.`;
  }

  // --- Journal -------------------------------------------------------------------------------------
  openJournal(): void {
    const g = this.game;
    let tab = 'quests';
    const render = () => {
      const panel = this.modal('journal', '', 900);
      panel.innerHTML += `<h2>Journal</h2><div class="tabs">${['quests', 'completed', 'documents', 'horses'].map((t) => `<button class="btn small ${t === tab ? 'active' : ''}" data-tab="${t}">${t[0]!.toUpperCase() + t.slice(1)}</button>`).join('')}</div><div id="jb"></div>`;
      panel.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = (b as HTMLElement).dataset.tab!; render(); }));
      panel.querySelector('[data-close]')!.addEventListener('click', () => this.closeModal());
      const jb = panel.querySelector('#jb') as HTMLElement;
      if (tab === 'quests' || tab === 'completed') {
        const list = [...g.quests.defs.values()].filter((q) => (tab === 'quests' ? g.quests.state(q.id)?.status === 'active' : ['completed', 'failed'].includes(g.quests.state(q.id)?.status ?? '')));
        list.sort((a, b) => (a.kind === 'main' ? -1 : 1) - (b.kind === 'main' ? -1 : 1));
        if (!list.length) jb.innerHTML = '<p class="muted">Nothing here yet. Talk to people — folks around here need help.</p>';
        for (const q of list) {
          const st = g.quests.state(q.id)!;
          const objs = tab === 'quests' ? g.quests.visibleObjectives(q.id) : [];
          const box = div(jb, '');
          box.innerHTML = `<h3>${esc(q.title)} <span class="small-note">${q.kind === 'main' ? 'Story' : q.kind}${st.status === 'failed' ? ' · failed' : ''}</span></h3>
            <p class="lore" style="font-size:16px;font-style:italic">${esc(st.log[st.log.length - 1] ?? q.summary)}</p>
            ${objs.map((o) => `<div class="row"><span>${st.done.includes(o.id) ? '☑' : '☐'} ${esc(o.text)}${o.optional ? ' <i>(optional)</i>' : ''}</span><span class="pr">${o.count && o.count > 1 ? `${st.progress[o.id] ?? 0}/${o.count}` : ''}</span></div>`).join('')}`;
          if (tab === 'quests') {
            const b = button(box, g.quests.tracked === q.id ? 'Tracked' : 'Track', 'btn small');
            b.disabled = g.quests.tracked === q.id;
            b.onclick = () => { g.quests.tracked = q.id; g.waypoint = null; render(); };
          }
        }
      } else if (tab === 'documents') {
        const docs = g.content.LORE.filter((l) => g.loreUnlocked.has(l.id));
        if (!docs.length) jb.innerHTML = '<p class="muted">Letters, papers and notes you find will be kept here.</p>';
        for (const d of docs) {
          const r = div(jb, 'row');
          r.innerHTML = `<div class="nm">${esc(d.title)} <span class="small-note">${d.kind}</span></div>`;
          button(r, 'Read', 'btn small').onclick = () => this.openLore(d.id);
        }
      } else {
        for (const h of g.ownedHorses()) {
          const r = div(jb, 'row');
          r.innerHTML = `<div><div class="nm">${esc(h.data.name)}</div><div class="ds">${esc(g.horseSummary(h))} · bond ${bondName(h.data)} · ${h.data.kmRidden.toFixed(1)} km together</div></div>`;
          button(r, 'Open', 'btn small').onclick = () => this.openHorse(h);
        }
      }
    };
    render();
  }

  openLore(id: string): void {
    const d = this.game.content.LORE.find((l) => l.id === id);
    if (!d) return;
    this.game.unlockLore(id);
    this.modal('lore', `<h2>${esc(d.title)}</h2><div class="sub">${d.kind}</div><div class="lore ${d.kind === 'newspaper' ? 'newspaper' : ''}">${esc(d.text)}</div>`, 760);
  }

  // --- Character -------------------------------------------------------------------------------------
  openCharacter(): void {
    const g = this.game;
    const p = g.player;
    const reps = Object.entries(REP_LABELS)
      .map(([k, label]) => {
        const v = g.rep.get(k as never);
        return `<div class="statline"><span>${label}</span><div class="statbar ${v >= 0 ? 'good' : 'bad'}"><i style="width:${Math.abs(v)}%"></i></div><span>${v > 0 ? '+' : ''}${Math.round(v)}</span></div>`;
      })
      .join('');
    const skills = (Object.keys(SKILL_INFO) as SkillId[])
      .map((s) => `<div class="statline" title="${esc(SKILL_INFO[s].perLevel)}"><span>${SKILL_INFO[s].name} ${p.skills.level(s)}</span><div class="statbar"><i style="width:${p.skills.progress(s) * 100}%"></i></div><span class="small-note">${Math.round(p.skills.xp[s])} xp</span></div>`)
      .join('');
    const wanted = Object.entries(g.law.wanted).filter(([, w]) => w.level >= 1).map(([r, w]) => `<div class="row"><span>${REGIONS.find((x) => x.id === r)?.name}</span><span class="pr">${money(w.bounty)} · ${w.crimes.slice(-3).join(', ')}</span></div>`).join('');
    this.modal(
      'character',
      `<h2>${esc(p.name)}</h2><div class="sub">${g.rep.honorTitle()} · ${Math.round(g.playtime / 60)} minutes on the frontier</div>
      <div class="grid2"><div><h3>Reputation</h3>${reps}<h3>Law</h3>${wanted || '<p class="muted">No outstanding bounties.</p>'}</div>
      <div><h3>Skills</h3>${skills}<p class="small-note">Skills improve with practice: riding, shooting, caring for horses, hunting and camping.</p>
      <h3>Condition</h3><div class="kv"><b>Health</b><span>${Math.round(p.stats.health)}</span><b>Fed</b><span>${Math.round(p.stats.hunger)}%</span><b>Watered</b><span>${Math.round(p.stats.thirst)}%</span><b>Rest</b><span>${Math.round(p.stats.energy)}%</span><b>Discoveries</b><span>${g.discovered.size}</span><b>Horses owned</b><span>${g.ownedHorses().length}</span></div></div></div>`,
      900,
    );
  }

  // --- Camp & sleep ------------------------------------------------------------------------------------
  openCamp(): void {
    const g = this.game;
    const p = this.modal('camp', `<h2>Camp</h2><div class="sub">${g.clock.timeString()} · ${Math.round(g.temperatureHere)}°F</div><div style="text-align:center" id="cb"></div>`, 520);
    const cb = p.querySelector('#cb') as HTMLElement;
    button(cb, 'Sleep…', 'btn gold').onclick = () => this.openSleep('camp');
    button(cb, 'Cook raw food', 'btn').onclick = () => this.notify(g.camp.cookAll(), 'info');
    button(cb, 'Drink coffee', 'btn').onclick = () => (g.player.inv.has('coffee') ? (this.useItem('coffee'), undefined) : this.notify('No coffee.', 'info'));
    button(cb, 'Save game', 'btn').onclick = () => g.save(g.slot, true);
    button(cb, 'Break camp', 'btn red').onclick = () => { g.camp.break(); this.closeModal(); };
  }
  openSleep(where: 'camp' | 'bed'): void {
    const g = this.game;
    const p = this.modal('sleep', `<h2>Rest</h2><div class="sub">${where === 'bed' ? 'A real bed.' : g.clock.isNight ? 'Under the stars.' : 'A bedroll in the shade.'} It's ${g.clock.timeString()}.</div><div style="text-align:center" id="sb"></div>`, 480);
    const sb = p.querySelector('#sb') as HTMLElement;
    for (const h of [2, 4, 8]) button(sb, `${h} hours`, 'btn').onclick = () => { this.closeModal(); g.sleep(h); };
    button(sb, 'Until dawn', 'btn gold').onclick = () => {
      this.closeModal();
      const hr = g.clock.hour;
      g.sleep(Math.max(1, Math.round(hr < 6 ? 6 - hr : 30 - hr)));
    };
  }

  // --- Blackjack -----------------------------------------------------------------------------------------
  openBlackjack(): void {
    const g = this.game;
    const deck: number[] = [];
    const draw = () => {
      if (!deck.length) for (let i = 0; i < 52; i++) deck.push(i);
      return deck.splice(Math.floor(Math.random() * deck.length), 1)[0]!;
    };
    const val = (hand: number[]) => {
      let t = 0;
      let aces = 0;
      for (const c of hand) {
        const r = c % 13;
        t += r === 0 ? 11 : Math.min(10, r + 1);
        if (r === 0) aces++;
      }
      while (t > 21 && aces--) t -= 10;
      return t;
    };
    const cardHtml = (c: number, hidden = false) => {
      if (hidden) return '<div class="card back"></div>';
      const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      const suits = ['♠', '♥', '♦', '♣'];
      const s = Math.floor(c / 13);
      return `<div class="card ${s === 1 || s === 2 ? 'red' : ''}">${ranks[c % 13]}${suits[s]}</div>`;
    };
    let bet = 1;
    let player: number[] = [];
    let dealer: number[] = [];
    let phase: 'bet' | 'play' | 'done' = 'bet';
    let msg = 'Place your bet.';
    const render = () => {
      const p = this.modal('blackjack', `<h2>Blackjack</h2><div class="sub">${money(g.player.money)} · Dealer stands on 17</div>
        <div style="text-align:center"><div class="small-note">Dealer ${phase === 'play' ? '' : val(dealer)}</div><div class="cards">${dealer.map((c, i) => cardHtml(c, phase === 'play' && i === 1)).join('')}</div>
        <div class="small-note">You ${val(player) || ''}</div><div class="cards">${player.map((c) => cardHtml(c)).join('')}</div><p style="font-size:18px">${esc(msg)}</p><div id="bj"></div></div>`, 600);
      const bj = p.querySelector('#bj') as HTMLElement;
      if (phase !== 'play') {
        for (const b of [1, 5, 10]) {
          const btn = button(bj, `Bet ${money(b)}`, bet === b ? 'btn gold' : 'btn');
          btn.disabled = g.player.money < b;
          btn.onclick = () => {
            bet = b;
            g.player.money -= bet;
            player = [draw(), draw()];
            dealer = [draw(), draw()];
            phase = 'play';
            msg = 'Hit or stand?';
            g.audio.play('cards');
            g.setFlag('blackjack_played', true);
            if (val(player) === 21) finish();
            else render();
          };
        }
      } else {
        button(bj, 'Hit', 'btn').onclick = () => {
          player.push(draw());
          g.audio.play('cards');
          if (val(player) > 21) {
            phase = 'done';
            msg = `Bust! You lose ${money(bet)}.`;
          }
          render();
        };
        button(bj, 'Stand', 'btn gold').onclick = () => finish();
      }
    };
    const finish = () => {
      while (val(dealer) < 17) dealer.push(draw());
      const pv = val(player);
      const dv = val(dealer);
      phase = 'done';
      if (pv === 21 && player.length === 2) {
        g.player.money += bet * 2.5;
        msg = `Blackjack! You win ${money(bet * 1.5)}.`;
      } else if (dv > 21 || pv > dv) {
        g.player.money += bet * 2;
        msg = `You win ${money(bet)}.`;
      } else if (pv === dv) {
        g.player.money += bet;
        msg = 'Push.';
      } else msg = `Dealer wins with ${dv}.`;
      g.audio.play('coin');
      render();
    };
    render();
  }

  openTraining(): void {
    const stable = this.game.world.buildings.find((b) => b.type === 'stable' && Math.hypot(b.x * 16 - this.game.player.x, b.y * 16 - this.game.player.y) < 600);
    if (stable?.shopId) this.openShop(stable.shopId);
    else this.notify('Training needs a stable or corral.', 'info');
  }
}

// --- helpers ----------------------------------------------------------------------------------------------
function div(parent: HTMLElement, cls: string): HTMLElement {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  parent.appendChild(d);
  return d;
}
function button(parent: HTMLElement, label: string, cls: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = label;
  parent.appendChild(b);
  return b;
}
function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}
function bar(kind: string, frac: number, cap = 1): string {
  return `<div class="bar ${kind}" style="width:${Math.max(30, Math.min(100, cap * 100))}%"><i style="width:${Math.max(0, Math.min(1, frac)) * 100}%"></i></div>`;
}
function statline(label: string, frac: number, value: string): string {
  const cls = frac > 0.6 ? 'good' : frac < 0.3 ? 'bad' : '';
  return `<div class="statline"><span>${esc(label)}</span><div class="statbar ${cls}"><i style="width:${Math.max(0, Math.min(1, frac)) * 100}%"></i></div><span class="small-note">${esc(value)}</span></div>`;
}
function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function dot(c: CanvasRenderingContext2D, x: number, y: number, col: string, r: number): void {
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}
function gearDesc(g: NonNullable<ReturnType<typeof getItem>['gear']>): string {
  const parts: string[] = [];
  if (g.staminaDrain && g.staminaDrain !== 1) parts.push(`stamina use ${g.staminaDrain < 1 ? '−' : '+'}${Math.round(Math.abs(1 - g.staminaDrain) * 100)}%`);
  if (g.staminaRegen && g.staminaRegen !== 1) parts.push(`recovery ${g.staminaRegen > 1 ? '+' : '−'}${Math.round(Math.abs(g.staminaRegen - 1) * 100)}%`);
  if (g.speed && g.speed !== 1) parts.push(`speed +${Math.round((g.speed - 1) * 100)}%`);
  if (g.carry) parts.push(`carry ${g.carry > 0 ? '+' : ''}${g.carry} kg`);
  if (g.handling && g.handling !== 1) parts.push(`handling ${g.handling > 1 ? '+' : '−'}${Math.round(Math.abs(g.handling - 1) * 100)}%`);
  if (g.terrain) parts.push(`rough ground +${Math.round((g.terrain - 1) * 100)}%`);
  if (g.warmth) parts.push(`warmth +${g.warmth}`);
  return parts.length ? `(${parts.join(', ')})` : '';
}
void ITEMS;
