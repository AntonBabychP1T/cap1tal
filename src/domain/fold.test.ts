import { describe, expect, it } from 'vitest';

import { foldCase } from './fold';

describe('foldCase', () => {
  it('Scenario: The fold agrees with Ukrainian casing on every character', () => {
    // Every code point outside the surrogate range, in Node's full ICU. A future Unicode that
    // tailors `uk` fails here and names the characters, instead of diverging silently.
    const differing: string[] = [];
    for (let code = 0; code <= 0x10ffff; code += 1) {
      if (code >= 0xd800 && code <= 0xdfff) continue;
      const c = String.fromCodePoint(code);
      if (foldCase(c) !== c.toLocaleLowerCase('uk')) {
        differing.push(`U+${code.toString(16).toUpperCase().padStart(4, '0')}`);
      }
    }
    expect(differing).toEqual([]);
  });

  it('Scenario: Ukrainian letters fold as before', () => {
    expect(foldCase('ҐАНОК ЇЖАК Єнот І')).toBe('ґанок їжак єнот і');
    // Final sigma is a context rule of the default mapping, the same as under `uk`.
    expect(foldCase('ΟΔΥΣΣΕΥΣ')).toBe('ΟΔΥΣΣΕΥΣ'.toLocaleLowerCase('uk'));
    expect(foldCase('Аптека Bolt №5 Сільпо')).toBe('аптека bolt №5 сільпо');
  });

  it('Scenario: A phone set to Turkish still finds a Latin опис', () => {
    // What a locale fold would break: the Turkish capital I lower-cases to a dotless ı.
    expect('BILLA'.toLocaleLowerCase('tr')).not.toBe('billa');
    // `foldCase` takes no locale, so this holds on every phone.
    expect(foldCase('BILLA')).toBe('billa');
    expect(foldCase('BILLA').includes(foldCase('billa'))).toBe(true);
  });
});
