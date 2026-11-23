/**
 * On-screen touch controls for phones and tablets: a floating joystick on the
 * left half of the screen and a cluster of action buttons on the right. Every
 * button presses the same key code as the keyboard, so all game logic stays
 * input-agnostic. Shown automatically on coarse-pointer (touch) devices or on
 * the first touch.
 */
import type { Game } from '../game.ts';

interface Btn {
  label: string;
  code: string;
  cls?: string;
  /** Hold (sprint, aim) vs tap. Taps are held briefly so a frame always sees them. */
  hold?: boolean;
  /** Pixel icon drawn by style.ts (`.ti-<icon>`); the label then becomes the accessible name. */
  icon?: string;
  /** Show the label as a small caption under the icon (for less obvious icons). */
  cap?: boolean;
}

const ACTIONS: Btn[] = [
  { label: 'E', code: 'KeyE', cls: 'big', icon: 'hand' },
  { label: 'Montar', code: 'KeyF', icon: 'horse' },
  { label: 'Correr', code: 'ShiftLeft', hold: true, icon: 'boot' },
  { label: 'Frear', code: 'ControlLeft', icon: 'brake', cap: true },
  { label: 'Pular', code: 'Space', icon: 'jump' },
  { label: 'Assobio', code: 'KeyH', icon: 'whistle' },
  { label: 'Arma', code: 'KeyG', icon: 'gun' },
  { label: 'Atirar', code: 'Mouse0', cls: 'fire', hold: true, icon: 'sight' },
  { label: '◀', code: 'KeyZ', cls: 'sw' },
  { label: '▶', code: 'KeyX', cls: 'sw' },
];

const MENUS: Btn[] = [
  { label: 'Menu', code: 'Escape', icon: 'menu' },
  { label: 'Mapa', code: 'KeyM', icon: 'map', cap: true },
  { label: 'Itens', code: 'KeyI', icon: 'bag', cap: true },
  { label: 'Cavalo', code: 'KeyB', icon: 'shoe', cap: true },
  { label: 'Diário', code: 'KeyJ', icon: 'book', cap: true },
  { label: 'Acampar', code: 'KeyK', icon: 'tent', cap: true },
];

export class TouchControls {
  private root: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private ox = 0;
  private oy = 0;
  shown = false;
  private game: Game;

  constructor(game: Game, layer: HTMLElement) {
    this.game = game;
    this.root = document.createElement('div');
    this.root.className = 'touch';
    this.root.innerHTML = `<div class="tzone"></div><div class="tstick"><div class="tknob"></div></div><div class="tbtns"></div><div class="tmenus"></div><div class="touch-tip">Vire o celular na horizontal para jogar melhor.<br>Esquerda: arraste para andar · Direita: ações</div>`;
    layer.appendChild(this.root);
    this.stick = this.root.querySelector('.tstick')!;
    this.knob = this.root.querySelector('.tknob')!;
    const zone = this.root.querySelector('.tzone') as HTMLElement;
    zone.addEventListener('touchstart', (e) => this.stickStart(e), { passive: false });
    zone.addEventListener('touchmove', (e) => this.stickMove(e), { passive: false });
    zone.addEventListener('touchend', (e) => this.stickEnd(e));
    zone.addEventListener('touchcancel', (e) => this.stickEnd(e));
    const make = (host: HTMLElement, b: Btn) => {
      const el = document.createElement('button');
      el.className = 'tbtn ' + (b.cls ?? '') + (b.icon ? ` ti ti-${b.icon}` : '');
      el.setAttribute('aria-label', b.label);
      if (b.icon) {
        el.innerHTML = `<span class="ic"></span>${b.cap ? `<small>${b.label}</small>` : ''}`;
        if (b.code === 'KeyE') el.insertAdjacentHTML('beforeend', '<b class="key-e">E</b>');
      } else el.textContent = b.label;
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (b.code === 'Mouse0') this.aimAhead();
        this.press(b.code, true);
        el.classList.add('on');
      }, { passive: false });
      const up = (e: Event) => {
        e.preventDefault();
        el.classList.remove('on');
        // Let at least one frame see the press before releasing.
        setTimeout(() => this.press(b.code, false), b.hold ? 0 : 60);
      };
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
      host.appendChild(el);
    };
    for (const b of ACTIONS) make(this.root.querySelector('.tbtns')!, b);
    for (const b of MENUS) make(this.root.querySelector('.tmenus')!, b);
    // Tapping a line of the interaction prompt runs that option.
    document.addEventListener('pointerdown', (e) => {
      const row = (e.target as HTMLElement).closest?.('.pa[data-i]') as HTMLElement | null;
      if (row && this.shown) this.game.interactions.execIndex(Number(row.dataset.i));
    });
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    if (coarse) this.show();
    window.addEventListener('touchstart', () => this.show(), { once: true, passive: true });
  }

  /** Keys go through real keyboard events so menu shortcuts handled by DOM listeners work too. */
  private press(code: string, down: boolean): void {
    if (code.startsWith('Mouse')) {
      if (down) this.game.input.virtualDown(code);
      else this.game.input.virtualUp(code);
      return;
    }
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  }

  show(): void {
    if (this.shown) return;
    this.shown = true;
    document.body.classList.add('has-touch');
  }

  /** Hide gameplay controls while a menu, dialogue or the title screen owns the screen. */
  update(): void {
    const g = this.game;
    const hidden = !this.shown || g.titleMode || g.ui.modalOpen;
    this.root.style.display = hidden ? 'none' : '';
    if (hidden && this.stickId !== null) this.release();
  }

  /** Point the aim one step ahead of the player so the Fire button shoots where you face. */
  private aimAhead(): void {
    const g = this.game;
    const c = document.querySelector('canvas');
    if (!c) return;
    const r = (c as HTMLCanvasElement).getBoundingClientRect();
    const a = g.player.mount ? g.player.mount.heading : g.player.angle;
    g.input.mouseX = r.width / 2 + Math.cos(a) * 140;
    g.input.mouseY = r.height / 2 + Math.sin(a) * 140;
  }

  private stickStart(e: TouchEvent): void {
    e.preventDefault();
    if (this.stickId !== null) return;
    const t = e.changedTouches[0]!;
    this.stickId = t.identifier;
    this.ox = t.clientX;
    this.oy = t.clientY;
    this.stick.style.left = `${t.clientX}px`;
    this.stick.style.top = `${t.clientY}px`;
    this.stick.classList.add('on');
    this.knob.style.transform = 'translate(-50%,-50%)';
  }

  private stickMove(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== this.stickId) continue;
      const R = 56;
      let dx = t.clientX - this.ox;
      let dy = t.clientY - this.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.game.input.touchAxis = { x: dx / R, y: dy / R };
    }
  }

  private stickEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) if (t.identifier === this.stickId) this.release();
  }

  private release(): void {
    this.stickId = null;
    this.game.input.touchAxis = { x: 0, y: 0 };
    this.stick.classList.remove('on');
  }
}
