/**
 * Keyboard + mouse input with remappable actions. Systems query actions
 * (`down`, `pressed`) rather than raw keys so controls are rebindable.
 */

export type Action =
  | 'up' | 'down' | 'left' | 'right' | 'sprint' | 'slow' | 'interact' | 'jump' | 'mount' | 'whistle'
  | 'fire' | 'aim' | 'reload' | 'weaponNext' | 'weaponPrev' | 'crouch' | 'inventory' | 'map' | 'journal'
  | 'horse' | 'pause' | 'camp' | 'lantern' | 'reinBack' | 'holster' | 'opt1' | 'opt2' | 'opt3' | 'opt4' | 'opt5' | 'opt6' | 'character' | 'quicksave';

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  slow: ['ControlLeft', 'KeyC'],
  interact: ['KeyE'],
  jump: ['Space'],
  mount: ['KeyF'],
  whistle: ['KeyH'],
  fire: ['Mouse0'],
  aim: ['Mouse2'],
  reload: ['KeyR'],
  weaponNext: ['WheelDown', 'KeyX'],
  weaponPrev: ['WheelUp', 'KeyZ'],
  crouch: ['KeyV'],
  inventory: ['KeyI', 'Tab'],
  map: ['KeyM'],
  journal: ['KeyJ'],
  horse: ['KeyB'],
  pause: ['Escape', 'KeyP'],
  camp: ['KeyK'],
  lantern: ['KeyL'],
  reinBack: ['KeyQ'],
  holster: ['KeyG'],
  opt1: ['Digit1'],
  opt2: ['Digit2'],
  opt3: ['Digit3'],
  opt4: ['Digit4'],
  opt5: ['Digit5'],
  opt6: ['Digit6'],
  character: ['KeyO'],
  quicksave: ['F5'],
};

export class Input {
  private keys = new Set<string>();
  private justDown = new Set<string>();
  private justUp = new Set<string>();
  bindings: Record<Action, string[]> = structuredClone(DEFAULT_BINDINGS);
  /** Mouse position in CSS pixels relative to the game canvas. */
  mouseX = 0;
  mouseY = 0;
  /** True while a DOM menu owns input; gameplay actions read as false. */
  blocked = false;
  private wheel = 0;

  attach(target: HTMLElement): void {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (!this.keys.has(e.code)) this.justDown.add(e.code);
      this.keys.add(e.code);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'F5'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.justUp.add(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
    target.addEventListener('mousemove', (e) => {
      const r = target.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    target.addEventListener('mousedown', (e) => {
      const code = `Mouse${e.button}`;
      if (!this.keys.has(code)) this.justDown.add(code);
      this.keys.add(code);
    });
    window.addEventListener('mouseup', (e) => {
      this.keys.delete(`Mouse${e.button}`);
      this.justUp.add(`Mouse${e.button}`);
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        this.justDown.add(e.deltaY > 0 ? 'WheelDown' : 'WheelUp');
      },
      { passive: true },
    );
  }

  /** Is an action held this frame? */
  down(a: Action): boolean {
    if (this.blocked) return false;
    // A press that started and ended inside one frame (a quick click or tap) still counts as held for that frame.
    return this.bindings[a].some((k) => this.keys.has(k) || this.justDown.has(k));
  }
  /** Was an action pressed this frame? */
  pressed(a: Action): boolean {
    if (this.blocked && a !== 'pause' && a !== 'inventory' && a !== 'map' && a !== 'journal' && a !== 'horse' && a !== 'character') return false;
    return this.bindings[a].some((k) => this.justDown.has(k));
  }
  released(a: Action): boolean {
    return this.bindings[a].some((k) => this.justUp.has(k));
  }
  /** Raw key press (for menus). */
  keyPressed(code: string): boolean {
    return this.justDown.has(code);
  }
  /** Simulate input (used by automated smoke tests). */
  simulate(code: string, isDown: boolean): void {
    if (isDown) {
      if (!this.keys.has(code)) this.justDown.add(code);
      this.keys.add(code);
    } else {
      this.keys.delete(code);
      this.justUp.add(code);
    }
  }
  /** Standard-mapping gamepad → virtual keys (polled once per frame). */
  private padPrev = new Set<string>();
  pollGamepad(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected);
    const now = new Set<string>();
    if (pad) {
      const b = (i: number) => !!pad.buttons[i]?.pressed;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (ax < -0.35 || b(14)) now.add('KeyA');
      if (ax > 0.35 || b(15)) now.add('KeyD');
      if (ay < -0.35 || b(12)) now.add('KeyW');
      if (ay > 0.35 || b(13)) now.add('KeyS');
      if (b(0)) now.add('KeyE'); // A: interact
      if (b(1)) now.add('KeyF'); // B: mount / dismount
      if (b(2)) now.add('KeyR'); // X: reload
      if (b(3)) now.add('KeyH'); // Y: whistle
      if (b(4)) now.add('KeyZ'); // LB: prev weapon
      if (b(5)) now.add('KeyX'); // RB: next weapon
      if (b(6)) now.add('Mouse2'); // LT: aim
      if (b(7)) now.add('Mouse0'); // RT: fire
      if (b(10)) now.add('ShiftLeft'); // L3: sprint / spur
      if (b(11)) now.add('KeyV'); // R3: crouch
      if (b(8)) now.add('KeyM'); // View: map
      if (b(9)) now.add('Escape'); // Menu: pause
      // Right stick moves the virtual cursor for aiming.
      const rx = pad.axes[2] ?? 0;
      const ry = pad.axes[3] ?? 0;
      if (Math.abs(rx) > 0.2 || Math.abs(ry) > 0.2) {
        this.mouseX = window.innerWidth / 2 + rx * window.innerWidth * 0.3;
        this.mouseY = window.innerHeight / 2 + ry * window.innerHeight * 0.3;
      }
    }
    for (const k of now) if (!this.padPrev.has(k)) this.simulate(k, true);
    for (const k of this.padPrev) if (!now.has(k)) this.simulate(k, false);
    if (now.has('Escape') && !this.padPrev.has('Escape')) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
    this.padPrev = now;
  }

  endFrame(): void {
    this.justDown.clear();
    this.justUp.clear();
    this.wheel = 0;
  }
  /** Movement vector from WASD (unnormalised). */
  /** Analog stick from the on-screen touch joystick (-1..1); zero when unused. */
  touchAxis = { x: 0, y: 0 };

  /** Press/release a key from an on-screen button, exactly like a physical key. */
  virtualDown(code: string): void {
    if (!this.keys.has(code)) this.justDown.add(code);
    this.keys.add(code);
  }
  virtualUp(code: string): void {
    this.keys.delete(code);
    this.justUp.add(code);
  }

  axis(): { x: number; y: number } {
    const t = this.touchAxis;
    if (!this.blocked && Math.hypot(t.x, t.y) > 0.2) return { x: t.x, y: t.y };
    return { x: (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0), y: (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0) };
  }
  keyName(a: Action): string {
    const k = this.bindings[a][0] ?? '';
    return k.replace('Key', '').replace('Digit', '').replace('Mouse0', 'LMB').replace('Mouse2', 'RMB').replace('ShiftLeft', 'Shift').replace('ControlLeft', 'Ctrl').replace('Space', 'Space');
  }
}
