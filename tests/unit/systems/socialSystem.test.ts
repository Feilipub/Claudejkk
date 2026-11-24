import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORK_TALK } from '../../../src/data/social.ts';
import type { Npc } from '../../../src/entities/npc.ts';
import type { Game } from '../../../src/game.ts';
import { SocialSystem } from '../../../src/systems/social.ts';

/** Deterministic Math.random for the duration of fn (restored afterwards). */
function seeded<T>(seed: number, fn: () => T): T {
  const real = Math.random;
  let s = seed >>> 0;
  Math.random = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

type Handler = (p: unknown) => void;

/** The slice of Game the social system reads, as plain data. */
function fakeGame(day = 2, hour = 10) {
  const handlers = new Map<string, Handler[]>();
  const g = {
    bus: {
      on: (k: string, fn: Handler) => void (handlers.get(k) ?? handlers.set(k, []).get(k)!).push(fn),
      emit: (k: string, p: unknown) => handlers.get(k)?.forEach((fn) => fn(p)),
    },
    npcMemory: {} as Record<string, { opinion: number; events: string[] }>,
    clock: { minutes: (day - 1) * 1440 + hour * 60, hour, day },
    weather: { current: { rain: 0, snow: 0, dust: 0 } },
    temperatureHere: 20,
    time: 1000,
    flags: {} as Record<string, unknown>,
    player: { name: 'Wren Calloway', x: 99999, y: 99999, mount: null, vx: 0, vy: 0 },
    rep: { get: () => 0 },
    law: { isWanted: () => false },
    currentRegion: 'dustfall',
    mainHorse: () => null,
    entities: [] as unknown[],
    content: { NPCS: [] as { id: string; name: string; settlement: string; shop?: string }[] },
    entityById: () => null,
    changeOpinion(id: string, d: number) {
      const m = (this.npcMemory[id] ??= { opinion: 0, events: [] });
      m.opinion += d;
    },
  };
  return g;
}

function fakeNpc(id: string, name: string, occupation: string, personality = ['friendly']): Npc {
  return {
    id, name, occupation, personality, settlementId: 'larkspur', x: 0, y: 0, act: 'loiter', place: 'street', arrived: true, outdoors: true,
    alive: true, state: 'schedule', chatWith: null, socialCd: 0, steer: null, bubble: null, def: {},
    faceTo() {}, say(text: string) { (this as { bubble: unknown }).bubble = { text, t: 3 }; },
  } as unknown as Npc;
}

test('work talk keeps its roles: the tradesman answers, even after a greeting opener', () => {
  // Arrange
  const g = fakeGame();
  const social = new SocialSystem(g as unknown as Game);
  const customer = fakeNpc('c1', 'Booker Rourke', 'farmer');
  const smith = fakeNpc('s1', 'Hank Gatlin', 'blacksmith');
  const reply = WORK_TALK.blacksmith![0]![1]!;
  let workTalks = 0;
  let openers = 0;
  // Act: many seeded conversations between the same two people.
  seeded(42, () => {
    for (let i = 0; i < 400; i++) {
      const { lines, topic } = social.compose([customer, smith]);
      if (topic !== 'work') continue;
      workTalks++;
      if (lines.length > WORK_TALK.blacksmith![0]!.length) openers++;
      // Assert: the line that answers the job is always the smith's.
      const answer = lines.find((l) => l.text === reply);
      assert.ok(answer, 'the exchange is voiced');
      assert.equal(answer.who, smith, `"${reply}" is spoken by the blacksmith`);
    }
  });
  assert.ok(workTalks > 10 && openers > 0, `covered work talk (${workTalks}) including openers (${openers})`);
});

test('regulars: three separate days of visits or purchases make a regular; one day counts once', () => {
  // Arrange
  const g = fakeGame(1);
  const social = new SocialSystem(g as unknown as Game);
  // Act
  social.rememberVisit('keeper');
  social.rememberVisit('keeper');
  g.clock.day = 2;
  social.rememberVisit('keeper');
  // Assert
  assert.equal(social.visitDays('keeper'), 2);
  assert.ok(!social.isRegular('keeper'));
  g.clock.day = 3;
  g.content.NPCS.push({ id: 'keeper', name: 'Augustus Pettibone', settlement: 'larkspur', shop: 'store_x' });
  g.bus.emit('purchase', { shopId: 'store_x', itemId: 'beans', price: 1 });
  g.bus.emit('purchase', { shopId: 'store_x', itemId: 'coffee', price: 1 });
  assert.ok(social.isRegular('keeper'));
  assert.equal(social.lastPurchase('keeper'), 'coffee');
  assert.equal(g.npcMemory.keeper!.opinion, 1, 'custom earns goodwill once a day');
});

test('gossip about a killing only blames the player when the player did it', () => {
  // Arrange
  const g = fakeGame();
  const social = new SocialSystem(g as unknown as Game);
  g.content.NPCS.push({ id: 'v1', name: 'Silas Ashby', settlement: 'larkspur' });
  g.bus.emit('npcKilled', { npcId: 'v1', byPlayer: false, hostile: false });
  const a = fakeNpc('a1', 'Booker Rourke', 'farmer');
  const b = fakeNpc('b1', 'Delphine Dunmore', 'elder');
  // Act
  const said: string[] = [];
  seeded(7, () => {
    for (let i = 0; i < 300; i++) {
      const { lines, topic } = social.compose([a, b]);
      if (topic === 'killing') said.push(...lines.map((l) => l.text));
    }
  });
  // Assert
  assert.ok(said.length > 0, 'the killing is talked about');
  assert.ok(said.some((t) => t.includes('Silas')), 'the victim is named');
  assert.ok(!said.some((t) => t.includes('Wren')), 'nobody blames the player for it');
});

test('children only talk like children with each other', () => {
  const g = fakeGame();
  const social = new SocialSystem(g as unknown as Game);
  const k1 = fakeNpc('k1', 'Tilly Hargrove', 'child');
  const k2 = fakeNpc('k2', 'Lavinia Oakes', 'child');
  seeded(3, () => {
    for (let i = 0; i < 50; i++) assert.equal(social.compose([k1, k2]).topic, 'kids');
  });
});
