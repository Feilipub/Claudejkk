/**
 * Localisation. English is the source language and also the key: every
 * player-facing string is written in English in code and data, and `L()`
 * looks it up in the active locale's table at display time. Missing entries
 * fall back to English, so a partial translation never breaks the game.
 *
 * Usage:
 *   L('Weapon drawn.')                       → plain sentence
 *   L('{0} lowers {1} head.', name, hisHer)  → numbered placeholders
 *   tr`${name} lowers ${hisHer} head.`       → tagged template; the key becomes
 *                                              "{0} lowers {1} head."
 *   translateDom(panel)                      → translate the text nodes of a
 *                                              UI template after rendering it
 */

export type Locale = 'en' | 'pt-BR';

export const LOCALES: { id: Locale; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'pt-BR', name: 'Português (Brasil)' },
];

let locale: Locale = 'en';
let table: Readonly<Record<string, string>> = {};
/** Keys asked for in a non-English locale that had no entry (dev aid for the extraction tool). */
export const missing = new Set<string>();

/** Activate a locale with its dictionary (English needs none). */
export function setLocale(l: Locale, dict: Readonly<Record<string, string>> = {}): void {
  locale = l;
  table = l === 'en' ? {} : dict;
}

export function getLocale(): Locale {
  return locale;
}

/** The browser's preferred locale among the ones we ship. */
export function detectLocale(): Locale {
  const langs = typeof navigator !== 'undefined' ? [navigator.language, ...(navigator.languages ?? [])] : [];
  for (const l of langs) if (l && l.toLowerCase().startsWith('pt')) return 'pt-BR';
  return 'en';
}

function fill(s: string, args: readonly unknown[]): string {
  return args.length ? s.replace(/\{(\d+)\}/g, (_m, i: string) => String(args[+i] ?? '')) : s;
}

/** Translate `key` (an English sentence with optional {0} {1} placeholders). */
export function L(key: string, ...args: unknown[]): string {
  if (locale === 'en') return fill(key, args);
  const hit = table[key];
  if (hit === undefined) {
    missing.add(key);
    return fill(key, args);
  }
  return fill(hit, args);
}

/** Tagged template form of L(): interpolations become {n} placeholders in the key. */
export function tr(strings: TemplateStringsArray, ...vals: unknown[]): string {
  let key = strings[0] ?? '';
  for (let i = 0; i < vals.length; i++) key += `{${i}}` + (strings[i + 1] ?? '');
  return L(key, ...vals);
}

/**
 * Translate the text nodes under `root` whose trimmed text is a known key, keeping
 * surrounding whitespace. Lets large HTML templates stay readable English in code.
 * Attributes `placeholder`, `title` and `aria-label` are translated too.
 */
export function translateDom(root: ParentNode & Node): void {
  if (locale === 'en') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  for (const t of nodes) {
    const raw = t.nodeValue ?? '';
    const core = raw.trim();
    if (!core) continue;
    const hit = table[core];
    if (hit === undefined) {
      if (/[A-Za-z]{3,}/.test(core)) missing.add(core);
      continue;
    }
    const lead = raw.slice(0, raw.length - raw.trimStart().length);
    const tail = raw.slice(raw.trimEnd().length);
    t.nodeValue = lead + hit + tail;
  }
  for (const attr of ['placeholder', 'title', 'aria-label']) {
    root.querySelectorAll?.(`[${attr}]`).forEach((el) => {
      const v = el.getAttribute(attr) ?? '';
      const hit = table[v.trim()];
      if (hit !== undefined) el.setAttribute(attr, hit);
    });
  }
}
