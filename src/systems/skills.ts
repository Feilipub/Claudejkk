/**
 * Character progression: practice-based skills. Doing a thing makes you
 * better at it — riding miles, landing shots, caring for horses, living off
 * the land. Each level gives a concrete mechanical benefit.
 */
export type SkillId = 'riding' | 'shooting' | 'horsemanship' | 'survival';

export const SKILL_INFO: Record<SkillId, { name: string; perLevel: string }> = {
  riding: { name: 'Riding', perLevel: 'Less rein lag, fewer falls, more stamina from your horse.' },
  shooting: { name: 'Gunslinging', perLevel: 'Tighter spread and faster recovery from recoil.' },
  horsemanship: { name: 'Horsemanship', perLevel: 'Faster bonding and taming; horses trust you sooner.' },
  survival: { name: 'Survival', perLevel: 'Better yields from hunting and cooking, slower hunger.' },
};

const THRESHOLDS = [0, 60, 160, 320, 560, 900];

export class Skills {
  xp: Record<SkillId, number> = { riding: 0, shooting: 0, horsemanship: 0, survival: 0 };
  onLevel: ((s: SkillId, lvl: number) => void) | null = null;

  level(s: SkillId): number {
    let l = 1;
    for (let i = 0; i < THRESHOLDS.length; i++) if (this.xp[s] >= THRESHOLDS[i]!) l = i + 1;
    return l;
  }
  progress(s: SkillId): number {
    const l = this.level(s);
    if (l >= THRESHOLDS.length) return 1;
    const a = THRESHOLDS[l - 1]!;
    const b = THRESHOLDS[l]!;
    return (this.xp[s] - a) / (b - a);
  }
  gain(s: SkillId, amount: number): void {
    const before = this.level(s);
    this.xp[s] += amount;
    const after = this.level(s);
    if (after > before) this.onLevel?.(s, after);
  }
}
