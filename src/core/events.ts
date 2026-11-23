/**
 * Typed event bus. Systems talk through events instead of importing each other,
 * which keeps horse AI, law, audio and quests decoupled.
 */

export interface GameEvents {
  /** A sound loud enough for animals/NPCs to perceive. radius in px. */
  noise: { x: number; y: number; radius: number; kind: 'gunshot' | 'shout' | 'whistle' | 'thunder' | 'predator' | 'crash' };
  gunshot: { x: number; y: number; shooterId: string };
  crime: { kind: CrimeKind; x: number; y: number; victimId?: string; regionId: string };
  notify: { text: string; kind?: 'info' | 'good' | 'bad' | 'horse' | 'quest' | 'law' };
  itemGained: { itemId: string; qty: number };
  itemUsed: { itemId: string };
  npcTalk: { npcId: string };
  npcKilled: { npcId: string; byPlayer: boolean; hostile: boolean };
  animalKilled: { speciesId: string; byPlayer: boolean; x: number; y: number };
  horseBond: { horseId: string; level: number };
  horseAction: { horseId: string; action: string };
  locationDiscovered: { poiId: string };
  regionEntered: { regionId: string };
  flag: { key: string; value: number | boolean | string };
  purchase: { itemId: string; price: number; shopId: string };
  horseBought: { horseId: string };
  questUpdate: { questId: string };
  playerDied: Record<string, never>;
  sleep: { hours: number };
}

export type CrimeKind = 'murder' | 'assault' | 'theft' | 'horseTheft' | 'robbery' | 'trespass' | 'discharge' | 'jailbreak' | 'animalCruelty';

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }
}
