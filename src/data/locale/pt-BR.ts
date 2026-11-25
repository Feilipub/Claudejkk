/**
 * Brazilian Portuguese dictionary: English key → translation. Assembled from the
 * per-slice files in ./pt-BR/ written by the localisation pass; keys with {n}
 * placeholders keep them. Missing entries fall back to English at runtime.
 */
import { DIALOGUE1 } from './pt-BR/dialogue1.ts';
import { DIALOGUE2 } from './pt-BR/dialogue2.ts';
import { DIALOGUE3 } from './pt-BR/dialogue3.ts';
import { OPTIONS1 } from './pt-BR/options1.ts';
import { OPTIONS2 } from './pt-BR/options2.ts';
import { BARKS } from './pt-BR/barks.ts';
import { QUESTS } from './pt-BR/quests.ts';
import { LORE } from './pt-BR/lore.ts';
import { PEOPLE } from './pt-BR/people.ts';
import { ITEMS } from './pt-BR/items.ts';
import { MISC } from './pt-BR/misc.ts';
import { UI_PT } from './pt-BR/ui.ts';
import { SYSTEMS } from './pt-BR/systems.ts';
import { SOCIAL } from './pt-BR/social.ts';

export const PT_BR: Record<string, string> = {
  ...DIALOGUE1,
  ...DIALOGUE2,
  ...DIALOGUE3,
  ...OPTIONS1,
  ...OPTIONS2,
  ...BARKS,
  ...QUESTS,
  ...LORE,
  ...PEOPLE,
  ...ITEMS,
  ...MISC,
  ...SYSTEMS,
  ...SOCIAL,
  ...UI_PT,
};
