/**
 * Regional weather state machine. Each region rolls its own weather from
 * its weights; transitions blend over a few game minutes. Exposes rain/snow
 * intensity, wind, fog, temperature and lightning for rendering, audio,
 * horses (stress, shelter-seeking), survival (cold) and gameplay.
 */
import { Rng } from '../core/rng.ts';
import { REGIONS } from '../data/world.ts';

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow' | 'blizzard' | 'dust';

export interface WeatherState {
  kind: WeatherKind;
  /** 0..1 blended intensities. */
  rain: number;
  snow: number;
  fog: number;
  dust: number;
  clouds: number;
  wind: number;
  /** Seconds until the next lightning flash (storms). */
  lightning: number;
}

export class WeatherSystem {
  private rng = new Rng(4242);
  /** Per region target weather and minutes remaining. */
  regions: Record<string, { kind: WeatherKind; left: number }> = {};
  /** Blended state at the player's location. */
  current: WeatherState = { kind: 'clear', rain: 0, snow: 0, fog: 0, dust: 0, clouds: 0, wind: 0.2, lightning: 0 };
  flash = 0;

  constructor() {
    for (const r of REGIONS) this.regions[r.id] = { kind: 'clear', left: this.rng.range(60, 300) };
  }

  private roll(regionId: string): WeatherKind {
    const r = REGIONS.find((x) => x.id === regionId)!;
    const kinds = Object.keys(r.weather) as WeatherKind[];
    return this.rng.weighted(kinds, (k) => r.weather[k] ?? 0);
  }

  /** Advance by game minutes; `regionId` is where the player is. */
  update(gameMinutes: number, realDt: number, regionId: string, onThunder: () => void): void {
    for (const id of Object.keys(this.regions)) {
      const w = this.regions[id]!;
      w.left -= gameMinutes;
      if (w.left <= 0) {
        w.kind = this.roll(id);
        w.left = this.rng.range(90, 420);
      }
    }
    const target = this.regions[regionId]?.kind ?? 'clear';
    const goal = {
      rain: target === 'rain' ? 0.6 : target === 'storm' ? 1 : 0,
      snow: target === 'snow' ? 0.6 : target === 'blizzard' ? 1 : 0,
      fog: target === 'fog' ? 0.8 : target === 'blizzard' ? 0.5 : target === 'storm' ? 0.2 : 0,
      dust: target === 'dust' ? 0.9 : 0,
      clouds: target === 'clear' ? 0 : target === 'cloudy' ? 0.5 : target === 'fog' || target === 'dust' ? 0.3 : 0.85,
      wind: target === 'storm' || target === 'blizzard' || target === 'dust' ? 1 : target === 'clear' ? 0.2 : 0.45,
    };
    const k = Math.min(1, realDt * 0.15);
    const c = this.current;
    c.rain += (goal.rain - c.rain) * k;
    c.snow += (goal.snow - c.snow) * k;
    c.fog += (goal.fog - c.fog) * k;
    c.dust += (goal.dust - c.dust) * k;
    c.clouds += (goal.clouds - c.clouds) * k;
    c.wind += (goal.wind - c.wind) * k;
    c.kind = target;
    this.flash = Math.max(0, this.flash - realDt * 3);
    if (target === 'storm' && c.rain > 0.6) {
      c.lightning -= realDt;
      if (c.lightning <= 0) {
        c.lightning = this.rng.range(6, 20);
        this.flash = 1;
        onThunder();
      }
    }
  }

  /** Air temperature °F at a region and hour. */
  temperature(regionId: string, hour: number, altitude: number): number {
    const r = REGIONS.find((x) => x.id === regionId)!;
    const dayCurve = Math.cos(((hour - 15) / 24) * Math.PI * 2); // warmest ~3pm
    const swing = r.climate === 'arid' ? 22 : r.climate === 'alpine' ? 18 : 12;
    const w = this.current;
    return r.temperature + dayCurve * swing - w.rain * 6 - w.snow * 10 - Math.max(0, altitude - 180) * 0.25;
  }

  /** For saving. */
  serialize(): unknown {
    return { regions: this.regions };
  }
  load(d: { regions?: Record<string, { kind: WeatherKind; left: number }> }): void {
    if (d.regions) this.regions = { ...this.regions, ...d.regions };
  }
}
