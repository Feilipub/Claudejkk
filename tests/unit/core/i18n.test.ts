import { test } from 'node:test';
import assert from 'node:assert/strict';
import { L, tr, setLocale, getLocale, missing } from '../../../src/core/i18n.ts';

const DICT = {
  'Weapon drawn.': 'Arma sacada.',
  '{0} lowers {1} head.': '{0} abaixa a cabeça {1}.',
  'Bond {0} · {1}': 'Vínculo {0} · {1}',
};

test('English is the identity: keys come back unchanged with placeholders filled', () => {
  setLocale('en');
  assert.equal(getLocale(), 'en');
  assert.equal(L('Weapon drawn.'), 'Weapon drawn.');
  assert.equal(L('{0} lowers {1} head.', 'Biscuit', 'his'), 'Biscuit lowers his head.');
});

test('a non-English locale looks keys up and fills placeholders in the translation', () => {
  setLocale('pt-BR', DICT);
  assert.equal(L('Weapon drawn.'), 'Arma sacada.');
  assert.equal(L('{0} lowers {1} head.', 'Biscuit', 'dele'), 'Biscuit abaixa a cabeça dele.');
  setLocale('en');
});

test('missing entries fall back to English and are recorded for the extraction tool', () => {
  setLocale('pt-BR', DICT);
  missing.clear();
  assert.equal(L('Nobody translated this.'), 'Nobody translated this.');
  assert.ok(missing.has('Nobody translated this.'));
  setLocale('en');
});

test('tr`` builds a {n} key from a template literal and fills it from the dictionary', () => {
  setLocale('pt-BR', DICT);
  const level = 3;
  const name = 'Familiar';
  assert.equal(tr`Bond ${level} · ${name}`, 'Vínculo 3 · Familiar');
  setLocale('en');
  assert.equal(tr`Bond ${level} · ${name}`, 'Bond 3 · Familiar');
});

test('placeholders that are not provided render as empty strings, never "undefined"', () => {
  setLocale('en');
  assert.equal(L('{0} and {1}', 'a'), 'a and ');
});
