/**
 * On-screen touch controls for phones and tablets: a floating joystick on the
 * left half of the screen and a cluster of action buttons on the right. Every
 * button presses the same key code as the keyboard, so all game logic stays
 * input-agnostic. Shown automatically on coarse-pointer (touch) devices or on
 * the first touch.
 */
import type { Game } from '../game.ts';
import { L } from '../core/i18n.ts';

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
  { label: 'Mount', code: 'KeyF', icon: 'horse' },
  { label: 'Run', code: 'ShiftLeft', hold: true, icon: 'boot' },
  { label: 'Slow', code: 'ControlLeft', icon: 'brake', cap: true },
  { label: 'Jump', code: 'Space', icon: 'jump' },
  { label: 'Whistle', code: 'KeyH', icon: 'whistle' },
  { label: 'Gun', code: 'KeyG', icon: 'gun' },
  { label: 'Fire', code: 'Mouse0', cls: 'fire', hold: true, icon: 'sight' },
  { label: 'Reload', code: 'KeyR', cls: 'sw rl', icon: 'reload' },
  { label: '◀', code: 'KeyZ', cls: 'sw' },
  { label: '▶', code: 'KeyX', cls: 'sw' },
];

const MENUS: Btn[] = [
  { label: 'Menu', code: 'Escape', icon: 'menu' },
  { label: 'Map', code: 'KeyM', icon: 'map', cap: true },
  { label: 'Items', code: 'KeyI', icon: 'bag', cap: true },
  { label: 'Horse', code: 'KeyB', icon: 'shoe', cap: true },
  { label: 'Journal', code: 'KeyJ', icon: 'book', cap: true },
  { label: 'Camp', code: 'KeyK', icon: 'tent', cap: true },
  { label: 'Lantern', code: 'KeyL', icon: 'lamp', cap: true },
  { label: 'Crouch', code: 'KeyV', icon: 'crouch', cap: true },
];

/** Elements that keep their own touches even inside the stick zone. */
const STICK_EXEMPT = '.tbtn, button, input, select, textarea, a, .modal, .dialogue, .menu-bg, #rotate';

export class TouchControls {
  private root: HTMLElement;
  private zone: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private ox = 0;
  private oy = 0;
  shown = false;
  /** True while a menu, dialogue or the title screen owns the screen (controls hidden). */
  private hidden = true;
  private game: Game;

  constructor(game: Game, layer: HTMLElement) {
    this.game = game;
    this.root = document.createElement('div');
    this.root.className = 'touch';
    this.root.innerHTML = `<div class="tzone"></div><div class="tstick"><div class="tknob"></div></div><div class="tbtns"></div><div class="tmenus"></div>`;
    layer.appendChild(this.root);
    this.stick = this.root.querySelector('.tstick')!;
    this.knob = this.root.querySelector('.tknob')!;
    this.zone = this.root.querySelector('.tzone') as HTMLElement;
    // The stick is driven from the document by *where* the thumb lands, not by which element
    // it happens to hit: a thumb resting on a notification, the prompt or the canvas still
    // steers. Buttons, menus and dialogue are the only things that take the touch instead.
    document.addEventListener('touchstart', (e) => this.stickStart(e), { passive: false });
    document.addEventListener('touchmove', (e) => this.stickMove(e), { passive: false });
    document.addEventListener('touchend', (e) => this.stickEnd(e));
    document.addEventListener('touchcancel', (e) => this.stickEnd(e));
    const make = (host: HTMLElement, b: Btn) => {
      const el = document.createElement('button');
      el.className = 'tbtn ' + (b.cls ?? '') + (b.icon ? ` ti ti-${b.icon}` : '');
      el.setAttribute('aria-label', L(b.label));
      if (b.icon) {
        el.innerHTML = `<span class="ic"></span>${b.cap ? `<small>${L(b.label)}</small>` : ''}`;
        if (b.code === 'KeyE') el.insertAdjacentHTML('beforeend', '<b class="key-e">E</b>');
      } else el.textContent = L(b.label);
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
    // Tapping a line of the interaction prompt runs that option — a tap, not a swipe that happens to start there.
    let downAt: { x: number; y: number; i: number } | null = null;
    document.addEventListener('pointerdown', (e) => {
      const row = (e.target as HTMLElement).closest?.('.pa[data-i]') as HTMLElement | null;
      downAt = row && this.shown ? { x: e.clientX, y: e.clientY, i: Number(row.dataset.i) } : null;
    });
    document.addEventListener('pointerup', (e) => {
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 12) this.game.interactions.execIndex(downAt.i);
      downAt = null;
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
    this.hidden = hidden;
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

  /** Does this touch belong to the joystick? Inside the stick zone and not on a control that takes touches itself. */
  private claims(t: Touch): boolean {
    const z = this.zone.getBoundingClientRect();
    if (t.clientX < z.left || t.clientX > z.right || t.clientY < z.top || t.clientY > z.bottom) return false;
    const el = t.target as HTMLElement | null;
    return !el?.closest?.(STICK_EXEMPT);
  }

  private stickStart(e: TouchEvent): void {
    if (this.stickId !== null || this.hidden) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      if (!this.claims(t)) continue;
      e.preventDefault();
      this.stickId = t.identifier;
      this.ox = t.clientX;
      this.oy = t.clientY;
      // The ring appears under the thumb: position it relative to the control layer, not the page.
      const rr = this.root.getBoundingClientRect();
      this.stick.style.left = `${t.clientX - rr.left}px`;
      this.stick.style.top = `${t.clientY - rr.top}px`;
      this.stick.classList.add('on');
      this.knob.style.transform = 'translate(-50%,-50%)';
      return;
    }
  }

  private stickMove(e: TouchEvent): void {
    if (this.stickId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      if (t.identifier !== this.stickId) continue;
      e.preventDefault();
      const R = 56;
      let dx = t.clientX - this.ox;
      let dy = t.clientY - this.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const axis = this.game.input.touchAxis;
      axis.x = dx / R;
      axis.y = dy / R;
    }
  }

  private stickEnd(e: TouchEvent): void {
    if (this.stickId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i]!.identifier === this.stickId) this.release();
  }

  private release(): void {
    this.stickId = null;
    const axis = this.game.input.touchAxis;
    axis.x = 0;
    axis.y = 0;
    this.stick.classList.remove('on');
  }
}
