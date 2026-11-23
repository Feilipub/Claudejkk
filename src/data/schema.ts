/**
 * Shared schemas for authored content: conditions, effects, dialogue trees,
 * quests, named NPCs and encounters. Story content in src/data/story/*.ts is
 * pure data conforming to these types; the systems interpret it.
 */
import type { HumanLook } from '../render/humanSprite.ts';

// --- Conditions --------------------------------------------------------------
export type Cond =
  | { flag: string; eq?: number | boolean | string; gte?: number; lte?: number }
  | { notFlag: string }
  | { quest: string; state: 'notStarted' | 'active' | 'completed' | 'failed' | 'started'; stage?: string }
  | { rep: RepKey; gte?: number; lte?: number }
  | { opinion: number } // current NPC's opinion of the player >= value (-100..100)
  | { opinionBelow: number }
  | { item: string; qty?: number }
  | { money: number }
  | { time: 'day' | 'night' | 'morning' | 'afternoon' | 'evening' }
  | { horseBond: number } // main horse bond level >= n (1..5)
  | { hasHorse: boolean }
  | { wanted: boolean } // wanted in the current region
  | { region: string }
  | { weather: 'rain' | 'snow' | 'clear' }
  | { metNpc: string }
  | { chance: number }
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond };

/** Reputation axes. 'honor' is personal decency; 'lawful'/'notoriety' track law; factions by id. */
export type RepKey = 'honor' | 'notoriety' | 'ranchers' | 'railroad' | 'coyle' | 'sayen' | 'townsfolk' | 'army';

// --- Effects -----------------------------------------------------------------
export type Effect =
  | { setFlag: string; value?: number | boolean | string }
  | { addFlag: string; amount: number }
  | { give: string; qty?: number }
  | { take: string; qty?: number }
  | { money: number }
  | { startQuest: string }
  | { completeObjective: string } // "questId:objectiveId"
  | { setStage: string; stage: string } // quest id + stage id
  | { failQuest: string }
  | { rep: RepKey; amount: number }
  | { opinion: number } // change current NPC's opinion of player
  | { openShop: string }
  | { notify: string }
  | { giveHorse: { breedId: string; name?: string; seed?: number; training?: 'green' | 'broke' | 'trained'; gear?: Record<string, string>; sex?: 'mare' | 'gelding' | 'stallion' } }
  | { spawnEncounter: string }
  | { lore: string } // unlock a lore document
  | { revealPoi: string }
  | { heal: number }
  | { advanceTime: number } // game minutes
  | { npcHostile: string } // make an NPC hostile
  | { npcLeave: string } // NPC removed from world (left town / arrested)
  | { startActivity: 'blackjack' | 'poker' | 'race' | 'shooting' | 'fishing' | 'training' }
  | { pay: number } // take money if possible
  | { bountyClear: boolean };

// --- Dialogue -----------------------------------------------------------------
export interface DialogueLine {
  /** One string, or several variants chosen at random. */
  text: string | string[];
  cond?: Cond;
}

export interface DialogueOption {
  text: string;
  cond?: Cond;
  /** Shown greyed out with this hint when cond fails (instead of hidden). */
  lockedHint?: string;
  effects?: Effect[];
  /** Next node id, or 'end'. Default 'end'. */
  next?: string;
  /** Optional skill-free persuasion check: honor/opinion based. */
  tone?: 'kind' | 'firm' | 'threat' | 'lie' | 'joke';
}

export interface DialogueNode {
  id: string;
  /** First line whose cond passes is shown. */
  lines: DialogueLine[];
  options?: DialogueOption[];
  /** Effects applied when this node is shown. */
  effects?: Effect[];
}

export interface DialogueTree {
  id: string;
  /** NPC id this tree belongs to. */
  npc: string;
  /** First entry whose cond passes picks the starting node. */
  entry: { cond?: Cond; node: string }[];
  nodes: DialogueNode[];
}

/** Ambient one-liners for generic NPCs. */
export interface Bark {
  occupation?: string;
  personality?: string;
  region?: string;
  cond?: Cond;
  lines: string[];
}

// --- Quests ---------------------------------------------------------------------
export type ObjectiveType =
  | 'talk' // talk to npc `target`
  | 'goto' // reach tile (x,y) within radius tiles, or POI `target`
  | 'collect' // have item `target` x count in inventory
  | 'deliver' // talk to npc `target` while holding `item` x count (removed)
  | 'kill' // kill NPCs tagged `target` x count
  | 'hunt' // kill animals of species `target` x count
  | 'skin' // obtain pelts (use collect instead where possible)
  | 'ride' // ride `count` km
  | 'bond' // main horse reaches bond level `count`
  | 'flag' // flag `target` is truthy (set by dialogue/effects/scripts)
  | 'lead' // bring horses tagged `target` to (x,y) radius
  | 'buy' // buy item `target`
  | 'discover' // discover POI `target`
  | 'race' // win race `target`
  | 'interact'; // interact with world object kind `target` near (x,y)

export interface Objective {
  id: string;
  type: ObjectiveType;
  text: string;
  target?: string;
  item?: string;
  count?: number;
  /** Tile coordinates for goto/lead/interact markers. */
  x?: number;
  y?: number;
  radius?: number;
  optional?: boolean;
  /** Not shown until earlier objectives complete. */
  hidden?: boolean;
}

export interface QuestStage {
  id: string;
  /** Journal entry written in first person as the protagonist's diary. */
  journal: string;
  objectives: Objective[];
  onEnter?: Effect[];
  onComplete?: Effect[];
  /** Next stage id, conditional branches (first match), or undefined = quest complete. */
  next?: string | { cond?: Cond; stage: string }[];
  /** If this becomes true the quest fails. */
  failIf?: Cond;
}

export interface QuestDef {
  id: string;
  title: string;
  kind: 'main' | 'side' | 'bounty' | 'horse' | 'hunting' | 'stranger' | 'ranch' | 'treasure' | 'delivery' | 'investigation';
  giver?: string;
  region: string;
  summary: string;
  stages: QuestStage[];
  rewards: { money?: number; items?: Record<string, number>; rep?: Partial<Record<RepKey, number>>; honor?: number };
  /** Auto-start when this becomes true (e.g. main quest chain). */
  autoStart?: Cond;
  repeatable?: boolean;
}

// --- NPCs ---------------------------------------------------------------------------
export type Occupation =
  | 'rancher' | 'cowhand' | 'blacksmith' | 'merchant' | 'doctor' | 'bartender' | 'sheriff' | 'deputy' | 'farmer'
  | 'hunter' | 'railroad' | 'horsetrader' | 'banker' | 'outlaw' | 'saloongirl' | 'traveler' | 'miner' | 'preacher'
  | 'bountyhunter' | 'soldier' | 'stablehand' | 'editor' | 'telegrapher' | 'logger' | 'cook' | 'elder' | 'breeder'
  | 'trapper' | 'gambler' | 'pianist' | 'hotelier' | 'gunsmith' | 'tailor' | 'surveyor' | 'drifter' | 'child';

export interface NpcDef {
  id: string;
  name: string;
  occupation: Occupation;
  settlement: string;
  /** Building type in that settlement where they work (saloon, store, stable…). */
  workAt?: string;
  look: Partial<HumanLook>;
  personality: string[];
  faction?: RepKey;
  dialogue?: string;
  shop?: string;
  /** Essential NPCs cannot die outside quests (they're knocked down instead). */
  essential?: boolean;
  bio: string;
  /** Only present when cond is true (e.g. after a quest stage). */
  presentIf?: Cond;
  /** Combat profile for outlaws/lawmen. */
  combat?: { health: number; weapon: string; accuracy: number; courage: number };
  /** Optional fixed tile position overriding schedules (hermits, hideout bosses). */
  fixed?: { x: number; y: number };
}

export interface EncounterDef {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Enemy NPC templates to spawn around (x,y). */
  enemies: { name: string; weapon: string; health: number; accuracy: number; courage: number; tag: string; look?: Partial<HumanLook>; count?: number }[];
  /** Stolen/captive horses tagged for 'lead' objectives. */
  /** Story horses; optional look/temperament overrides make them match how the script describes them. */
  horses?: { tag: string; breedId: string; name: string; count?: number; sex?: 'mare' | 'gelding' | 'stallion'; coat?: string; pattern?: string; traits?: string[]; age?: number }[];
  /** Respawns after N game days if not a one-off. */
  once?: boolean;
}

export interface LoreDoc {
  id: string;
  title: string;
  kind: 'letter' | 'newspaper' | 'note' | 'journal' | 'poster' | 'ledger' | 'plaque' | 'telegram';
  text: string;
}
