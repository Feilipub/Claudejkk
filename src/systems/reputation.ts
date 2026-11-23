/**
 * Multi-axis reputation: personal honor, notoriety (criminal fame), and
 * standing with factions. Drives prices, dialogue conditions, NPC greetings
 * and lawman attitude. Values clamp to -100..100.
 */
import type { RepKey } from '../data/schema.ts';

export const REP_LABELS: Record<RepKey, string> = {
  honor: 'Honor',
  notoriety: 'Notoriety',
  ranchers: 'Calder Cattle Association',
  railroad: 'Meridian & Western Railroad',
  coyle: 'The Coyle Gang',
  sayen: 'Sayen Nation',
  townsfolk: 'Townsfolk',
  army: 'Fort Rourke Garrison',
};

export class Reputation {
  values: Record<string, number> = { honor: 0, notoriety: 0, ranchers: 10, railroad: 0, coyle: -10, sayen: 0, townsfolk: 0, army: 0 };
  onChange: ((key: RepKey, delta: number) => void) | null = null;

  get(k: RepKey): number {
    return this.values[k] ?? 0;
  }
  add(k: RepKey, d: number): void {
    this.values[k] = Math.max(-100, Math.min(100, this.get(k) + d));
    this.onChange?.(k, d);
  }
  /** Shop price multiplier: honest, well-liked customers get a discount. */
  priceMul(): number {
    const h = this.get('honor');
    const n = this.get('notoriety');
    const t = this.get('townsfolk');
    return Math.max(0.8, Math.min(1.35, 1 - h * 0.0015 - t * 0.001 + Math.max(0, n) * 0.002));
  }
  honorTitle(): string {
    const h = this.get('honor');
    if (h >= 60) return 'Paragon';
    if (h >= 25) return 'Upstanding';
    if (h > -25) return 'Unremarkable';
    if (h > -60) return 'Disreputable';
    return 'Notorious Scoundrel';
  }
}
