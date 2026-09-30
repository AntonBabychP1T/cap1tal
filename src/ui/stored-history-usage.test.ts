import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Which screens read the whole history, and how (app-speed-pass design D1, D2): through the
 * stored-history memo, read at most once per change stamp, never through `listAll()` on focus.
 */
const APP = fileURLToPath(new URL('../app', import.meta.url));
const screen = (relative: string) => readFileSync(join(APP, relative), 'utf8');

describe('the screens read the stored history', () => {
  it('Головний reads the stored-history memo, not the whole table', () => {
    const home = screen(join('(tabs)', 'index.tsx'));
    expect(home).toContain('storedHistory.read()');
    expect(home).not.toMatch(/\blistAll\(/);
    // The стрічка is the head of the same answer, and the ліміти are judged from its months.
    expect(home).toContain('feed: latest.slice(0, FEED_SIZE)');
    expect(home).not.toMatch(/listLatest\(/);
    expect(home).toMatch(/monthTransactions: \(month\) => stored\.byMonth\(\)\.get\(month\)/);
    expect(home).toContain('balances: stored.balances');
  });

  it('no screen reads the whole table on focus', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
      );
    const offenders = files(APP).filter((file) => /\blistAll\(/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('Рахунки and a рахунок read their monobank links in one query', () => {
    for (const file of [join('(tabs)', 'accounts.tsx'), join('account', '[id].tsx')]) {
      expect(screen(file), file).toContain('monobankRepo.bankBalances()');
      expect(screen(file), file).not.toContain('monobankRepo.getAccount(');
    }
  });

  it('Scenario: A рахунок with a thousand транзакції opens without drawing them all', () => {
    // The long lists render through `ListScreen` — a FlatList drawing only the rows near the
    // screen, more as the owner scrolls — and never map every row into a ScrollView.
    for (const file of ['transactions.tsx', join('account', '[id].tsx'), join('category', '[month]', '[categoryId].tsx')]) {
      const source = screen(file);
      expect(source, file).toContain('<ListScreen');
      expect(source, file).not.toContain('<ListCard>');
      expect(source, file).not.toMatch(/\.(transactions|shown|listed)\.map\(\(t, index\)/);
    }
    const surfaces = readFileSync(fileURLToPath(new URL('../components/surfaces.tsx', import.meta.url)), 'utf8');
    const list = surfaces.slice(surfaces.indexOf('export function ListScreen'));
    expect(list).toContain('<FlatList');
    expect(list).toMatch(/initialNumToRender=\{15\}/);
    expect(list).toMatch(/windowSize=\{7\}/);
  });
});
