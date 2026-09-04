import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * What the token table must be true of — read as text, which is the only way `verify` can look at
 * it.
 *
 * `theme.ts` opens with `import '@/global.css'` and `import { Platform } from 'react-native'`, and
 * `vitest.config.mts` runs `environment: 'node'` with no `resolve.alias`. Neither import resolves
 * under the gate, so the table cannot be imported here — it is read the way `src/ui/screens.test.ts`
 * reads the screens, and for the same reason.
 *
 * These are structural claims. That a colour is the *right* colour is a question only the emulator
 * can answer; that the two themes declare the same roles, that every value is a colour at all, and
 * that the radii are a ladder rather than a bag of numbers are questions this can answer — and they
 * are the ones a hand edit actually gets wrong.
 */

const SOURCE = readFileSync(join(import.meta.dirname, 'theme.ts'), 'utf8');

/**
 * The body of one block, by the name it is declared under — either a theme inside `Colors`
 * (`light: {`) or a table of its own (`export const Radius = {`).
 */
function block(name: string): string {
  const start = [`${name}: {`, `const ${name} = {`]
    .map((form) => SOURCE.indexOf(form))
    .find((at) => at > -1);
  expect(start, `${name} is declared`).toBeTypeOf('number');
  let depth = 0;
  for (let i = SOURCE.indexOf('{', start); i < SOURCE.length; i += 1) {
    if (SOURCE[i] === '{') depth += 1;
    if (SOURCE[i] === '}') {
      depth -= 1;
      if (depth === 0) return SOURCE.slice(start, i);
    }
  }
  throw new Error(`${name} is not closed`);
}

/** `role: '#RRGGBB'` pairs, comments and doc blocks ignored. */
function colours(name: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, role, value] of block(name).matchAll(/^\s{4}(\w+): '(#[0-9A-Fa-f]{6})',/gm)) {
    found.set(role!, value!);
  }
  return found;
}

/** `name: 12,` pairs from a numeric table. */
function numbers(name: string): Map<string, number> {
  const found = new Map<string, number>();
  for (const [, key, value] of block(name).matchAll(/^\s{2}(\w+): (\d+),/gm)) {
    found.set(key!, Number(value));
  }
  return found;
}

/** Perceived lightness, enough to order two greys of the same family. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('the token table', () => {
  const light = colours('light');
  const dark = colours('dark');

  it('declares the same roles in both themes', () => {
    expect([...dark.keys()].sort()).toEqual([...light.keys()].sort());
  });

  it('declares more than a handful of roles, so a parse failure cannot pass as agreement', () => {
    expect(light.size).toBeGreaterThan(10);
  });

  it('gives every role a six-digit hex in both themes', () => {
    for (const [role, value] of [...light, ...dark]) {
      expect(value, role).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('keeps the page darker than a card on dark, and lighter than a card on light', () => {
    expect(luminance(dark.get('background')!)).toBeLessThan(
      luminance(dark.get('backgroundElement')!),
    );
    expect(luminance(light.get('background')!)).toBeLessThan(
      luminance(light.get('backgroundElement')!),
    );
  });

  it("keeps a card's edge readable against the rule inside it", () => {
    // The edge stands against the page; the rule only separates two rows of one card. Whichever
    // way round a theme puts them, they must not collapse into the same value.
    expect(dark.get('cardEdge')).not.toEqual(dark.get('border'));
    expect(light.get('cardEdge')).not.toEqual(light.get('border'));
  });

  it('sets the inset surface a visible step off the card, either way', () => {
    // Which way it goes is the theme's business: on dark the card is already almost the page, so
    // the recess can only go lighter; on light there is room below. What must hold in both is that
    // it is neither the card nor the page — an inset that matches either has stopped being one.
    for (const [name, theme] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      const [page, inset, card] = ['background', 'backgroundInset', 'backgroundElement'].map(
        (role) => luminance(theme.get(role)!),
      );
      expect(Math.abs(inset! - card!), `${name}: inset stands off the card`).toBeGreaterThan(0.005);
      expect(Math.abs(inset! - page!), `${name}: inset stands off the page`).toBeGreaterThan(0.005);
    }
  });

  it('puts textFaint one step past textMuted, away from the reading colour', () => {
    // Dark theme reads light-on-dark, so «quieter» is darker; the light theme is the mirror.
    expect(luminance(dark.get('textFaint')!)).toBeLessThan(luminance(dark.get('textMuted')!));
    expect(luminance(light.get('textFaint')!)).toBeGreaterThan(luminance(light.get('textMuted')!));
  });
});

describe('the radius ladder', () => {
  const radius = numbers('Radius');

  it('is strictly ascending from the chip to the sheet', () => {
    const ladder = ['chip', 'tile', 'control', 'field', 'card', 'hero', 'sheet'];
    const values = ladder.map((step) => {
      const value = radius.get(step);
      expect(value, step).toBeTypeOf('number');
      return value!;
    });
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size, 'no two steps share a value').toBe(values.length);
  });

  it('keeps the pill fully round and off the ladder', () => {
    expect(radius.get('pill')).toBe(999);
  });
});

describe('the spacing scale', () => {
  const spacing = numbers('Spacing');

  it('is strictly ascending in declaration order', () => {
    const values = [...spacing.values()];
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });

  it('carries the two half-steps the canvas needs', () => {
    expect(spacing.get('oneHalf')).toBe(6);
    expect(spacing.get('twoHalf')).toBe(12);
  });
});
