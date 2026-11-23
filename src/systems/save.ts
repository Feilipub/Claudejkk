/**
 * Versioned save system (localStorage). Each slot keeps the current save
 * and the previous one as a backup; a checksum detects corruption and the
 * loader falls back to the backup. `migrate` upgrades older versions.
 */

export const SAVE_VERSION = 2;
const PREFIX = 'wildfrontier_save_';

export interface SaveMeta {
  slot: string;
  version: number;
  savedAt: number;
  label: string;
  playtime: number;
}

export interface SaveFile {
  meta: SaveMeta;
  data: Record<string, unknown>;
  checksum: number;
}

function checksum(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Upgrade older save formats in place. */
export function migrate(file: SaveFile): SaveFile {
  const d = file.data;
  if (file.meta.version < 2) {
    // v1 had no skills or owned gear.
    const p = (d.player ?? {}) as Record<string, unknown>;
    p.skills ??= { riding: 0, shooting: 0, horsemanship: 0, survival: 0 };
    d.player = p;
    d.ownedGear ??= {};
  }
  file.meta.version = SAVE_VERSION;
  return file;
}

export function writeSave(slot: string, label: string, playtime: number, data: Record<string, unknown>): boolean {
  const st = storage();
  if (!st) return false;
  const body = JSON.stringify(data);
  const file: SaveFile = { meta: { slot, version: SAVE_VERSION, savedAt: Date.now(), label, playtime }, data, checksum: checksum(body) };
  try {
    const prev = st.getItem(PREFIX + slot);
    if (prev) st.setItem(PREFIX + slot + '_bak', prev);
    st.setItem(PREFIX + slot, JSON.stringify(file));
    return true;
  } catch (e) {
    console.error('Save failed', e);
    return false;
  }
}

function parse(raw: string | null): SaveFile | null {
  if (!raw) return null;
  try {
    const f = JSON.parse(raw) as SaveFile;
    if (!f.meta || !f.data) return null;
    if (checksum(JSON.stringify(f.data)) !== f.checksum) return null;
    if (f.meta.version > SAVE_VERSION) return null;
    return migrate(f);
  } catch {
    return null;
  }
}

/** Load a slot, falling back to its backup if the main save is corrupt. */
export function readSave(slot: string): { file: SaveFile; usedBackup: boolean } | null {
  const st = storage();
  if (!st) return null;
  const main = parse(st.getItem(PREFIX + slot));
  if (main) return { file: main, usedBackup: false };
  const bak = parse(st.getItem(PREFIX + slot + '_bak'));
  if (bak) return { file: bak, usedBackup: true };
  return null;
}

export function listSaves(): SaveMeta[] {
  const st = storage();
  if (!st) return [];
  const out: SaveMeta[] = [];
  for (let i = 0; i < st.length; i++) {
    const k = st.key(i)!;
    if (!k.startsWith(PREFIX) || k.endsWith('_bak')) continue;
    const f = readSave(k.slice(PREFIX.length));
    if (f) out.push(f.file.meta);
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export function deleteSave(slot: string): void {
  const st = storage();
  st?.removeItem(PREFIX + slot);
  st?.removeItem(PREFIX + slot + '_bak');
}
