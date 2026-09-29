import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import { debtsNote } from './saldo-debts';

const debt = (name: string, amount: number) => ({
  accountId: name,
  name,
  balance: money(amount, 'UAH'),
});

describe('debtsNote', () => {
  it('says every борг is closed only when every one of them reads 0', () => {
    expect(debtsNote([debt('Олег', 0), debt('Ірина', 0)])).toBe('Усі борги з експорту закриті — 0.');
  });

  it('never says «закриті» over a борг that is not 0', () => {
    // QA: «Усі борги закриті — тут має бути 0» read straight above «Борги: 820,00 UAH». The
    // sentence claimed what the line under it disproved.
    const note = debtsNote([debt('Олег', 0), debt('Борги', 82000)]);
    expect(note).not.toContain('закриті');
    expect(note).toContain('1 з 2');
    expect(note).toContain('«Борг»');
  });

  it('a negative борг is just as open as a positive one', () => {
    expect(debtsNote([debt('Олег', -100)])).toContain('1 з 1');
  });
});

describe('the Saldo import screen', () => {
  it('builds the debt sentence through `debtsNote`, never a fixed «закриті» of its own', () => {
    const screen = readFileSync('src/app/manage/saldo-import.tsx', 'utf8');
    expect(screen).toContain('debtsNote(flow.report.debts)');
    expect(screen).not.toContain('тут має бути 0');
  });
});
