/**
 * Game clock. One game day = 1440 game minutes. Exposes time-of-day helpers
 * used by lighting, NPC schedules, animal activity and shops.
 */
import { BALANCE } from '../data/balance.ts';

export class GameClock {
  /** Total game minutes since the story began (Day 1, 07:00). */
  minutes = 7 * 60;
  /** Time multiplier (sleeping/waiting fast-forward). */
  scale = 1;

  /** Advance by real seconds; returns game minutes elapsed. */
  tick(realDt: number): number {
    const m = (realDt / BALANCE.secondsPerGameMinute) * this.scale;
    this.minutes += m;
    return m;
  }
  advance(gameMinutes: number): void {
    this.minutes += gameMinutes;
  }
  get day(): number {
    return Math.floor(this.minutes / 1440) + 1;
  }
  /** Hour as float 0..24. */
  get hour(): number {
    return (this.minutes % 1440) / 60;
  }
  get isNight(): boolean {
    const h = this.hour;
    return h < 5.5 || h >= 20.5;
  }
  /** 0 = darkest night, 1 = full day, with smooth dawn/dusk. */
  get daylight(): number {
    const h = this.hour;
    if (h >= 7 && h <= 18.5) return 1;
    if (h > 18.5 && h < 21) return 1 - (h - 18.5) / 2.5;
    if (h >= 21 || h < 4.5) return 0;
    return (h - 4.5) / 2.5;
  }
  /** Sun direction for shadows: angle (rad) and length multiplier. */
  get sun(): { dx: number; dy: number; len: number } {
    const h = this.hour;
    const t = Math.max(0, Math.min(1, (h - 6) / 13)); // 6:00 → 19:00
    const ang = Math.PI * (1 - t); // east → west
    const len = 0.4 + Math.abs(Math.cos(ang)) * 1.4;
    return { dx: -Math.cos(ang), dy: 0.35, len };
  }
  timeString(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.minutes % 60) / 10) * 10;
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  }
  dateString(): string {
    // Story begins April 3rd, 1888.
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dim = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let d = this.day + 2;
    let mo = 3;
    let y = 1888;
    while (d > dim[mo]!) {
      d -= dim[mo]!;
      mo = (mo + 1) % 12;
      if (mo === 0) y++;
    }
    return `${months[mo]} ${d}, ${y}`;
  }
  /** Named part of the day used by schedules. */
  get period(): 'night' | 'dawn' | 'morning' | 'afternoon' | 'evening' {
    const h = this.hour;
    if (h < 5) return 'night';
    if (h < 7) return 'dawn';
    if (h < 12) return 'morning';
    if (h < 18) return 'afternoon';
    if (h < 22) return 'evening';
    return 'night';
  }
}
