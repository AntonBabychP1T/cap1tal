import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Category } from '../domain/category';
import type { Transaction } from '../domain/transaction';
import { observationsOf } from './observations';
import { ledgerBuilder, monthsFrom } from './test-fixtures';

/**
 * What an спостереження never does (observations, "Спостереження never leave the phone and never
 * call for attention"; "Showing changes nothing"): proven over the source itself, so a later
 * import that would carry one into a пакет, a бекап, a репорт or a notification fails `verify`.
 */

const SRC = join(__dirname, '..');

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every module specifier a file imports or re-exports, resolved against `src/`. */
function importsOf(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const specifiers = [...text.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)].map((m) => m[1]!);
  return specifiers.map((specifier) =>
    specifier.startsWith('.')
      ? relative(SRC, join(path, '..', specifier)).replace(/\\/g, '/')
      : specifier.replace(/^@\//, ''),
  );
}

const reaches = (paths: readonly string[], target: RegExp) =>
  paths.flatMap((path) =>
    importsOf(path)
      .filter((spec) => target.test(spec))
      .map((spec) => `${relative(SRC, path)} → ${spec}`),
  );

const OBSERVATIONS = /^observations(\/|$)/;

describe('спостереження never leave the phone', () => {
  it('Scenario: The пакет does not carry them', () => {
    // Nothing the пакет для аналізу, the бекап or a репорт про помилку is built from can reach one.
    for (const dir of ['analysis', 'backup', 'reporting']) {
      expect(reaches(filesUnder(join(SRC, dir)), OBSERVATIONS)).toEqual([]);
    }
  });

  it('Scenario: Nothing is posted', () => {
    // The detectors and their sentences can reach no notification, no platform port and no storage:
    // whatever a background прогін imports, it is stated only when a screen next shows it.
    const sources = [...filesUnder(join(SRC, 'observations')), join(SRC, 'ui', 'observations.ts')];
    expect(sources.length).toBeGreaterThan(10);
    // The scanner sees what is there — window.ts does import the пакет's median — so the empty
    // answers below are findings, not a regex that never matched.
    expect(reaches([join(SRC, 'observations', 'window.ts')], /^analysis\//)).toEqual([
      'observations/window.ts → analysis/trends',
    ]);
    expect(reaches(sources, /^(platform|notifications|db|reminders|hooks|app)(\/|$)|^expo|^react/)).toEqual([]);
  });
});

describe('showing an спостереження', () => {
  it('Scenario: Showing changes nothing', () => {
    const b = ledgerBuilder();
    const transactions: Transaction[] = monthsFrom('2026-03', '2026-09').flatMap((month) => [
      b.expense(`${month}-05`, 'food', month === '2026-09' ? 1380000 : 1000000),
      b.expense(`${month}-06`, 'other', 5000000, { description: 'АТБ' }),
      b.expense(`${month}-07`, 'other', 5000000, { description: 'Сільпо' }),
    ]);
    const categories: Category[] = [{ id: 'food', name: 'Продукти', archived: false }];
    const answers = [{ first: 'x', second: 'y' }];
    const before = structuredClone({ transactions, categories, answers });

    const stated = [
      ...observationsOf({ month: '2026-09', today: '2026-10-02', transactions, categories, answers }),
      ...observationsOf({ month: '2026-10', today: '2026-10-02', transactions, categories, answers }),
    ];

    expect(stated.length).toBeGreaterThan(0);
    // Every input is exactly what it was: no транзакція, категорія or answer was touched.
    expect({ transactions, categories, answers }).toEqual(before);
  });
});
