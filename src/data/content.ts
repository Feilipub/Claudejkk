/**
 * Authored content bundle (story data written by the narrative team).
 * Systems receive this object instead of importing story files directly,
 * so tests can inject smaller fixtures.
 */
import type { Bark, DialogueTree, EncounterDef, LoreDoc, NpcDef, QuestDef } from './schema.ts';
import type { ItemDef } from './items.ts';
import * as story from './story/index.ts';

export interface Content {
  NPCS: NpcDef[];
  DIALOGUE: DialogueTree[];
  BARKS: Bark[];
  QUESTS: QuestDef[];
  LORE: LoreDoc[];
  ENCOUNTERS: EncounterDef[];
  QUEST_ITEMS: ItemDef[];
}

export const CONTENT: Content = {
  NPCS: story.NPCS,
  DIALOGUE: story.DIALOGUE,
  BARKS: story.BARKS,
  QUESTS: story.QUESTS,
  LORE: story.LORE,
  ENCOUNTERS: story.ENCOUNTERS,
  QUEST_ITEMS: story.QUEST_ITEMS,
};
