import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import {
  accountRows,
  clearValueConfirmation,
  groupAccountsByKind,
  reconcileConfirmation,
} from './account-groups';

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
const oldCard = account({
  id: 'old-card',
  name: 'стара картка',
  kind: 'spending',
  currency: 'UAH',
  archived: true,
});

describe('groupAccountsByKind', () => {
  it('Scenario: Accounts group by kind, archived apart', () => {
    expect(groupAccountsByKind([card, jar, oldCard])).toEqual([
      { kind: 'spending', accounts: [card] },
      { kind: 'savings', accounts: [jar] },
      { kind: 'archived', accounts: [oldCard] },
    ]);
  });

  it('Scenario: Archiving moves the account to the archived group', () => {
    const before = groupAccountsByKind([card, jar]);
    expect(before.map((g) => g.kind)).toEqual(['spending', 'savings']);

    const after = groupAccountsByKind([account({ ...card, archived: true }), jar]);

    expect(after.map((g) => g.kind)).toEqual(['savings', 'archived']);
    expect(after.find((g) => g.kind === 'archived')?.accounts.map((a) => a.id)).toEqual(['card']);
    // It left its вид group entirely: no empty "spending" heading stays behind.
    expect(after.find((g) => g.kind === 'spending')).toBeUndefined();
  });

  it('Scenario: The screen invites the first рахунок', () => {
    expect(groupAccountsByKind([])).toEqual([]);
  });

  it('Every вид gets its own group, in the screen order', () => {
    const all = [
      account({ id: 'd', name: 'борг', kind: 'debt', currency: 'UAH' }),
      account({ id: 'c', name: 'гаманець', kind: 'cash', currency: 'UAH' }),
      account({ id: 'i', name: 'ОВДП', kind: 'investment', currency: 'UAH' }),
      jar,
      card,
    ];
    expect(groupAccountsByKind(all).map((g) => g.kind)).toEqual([
      'spending',
      'savings',
      'investment',
      'cash',
      'debt',
    ]);
  });

  it('Accounts keep the order they were given', () => {
    const a = account({ id: 'a', name: 'а', kind: 'spending', currency: 'UAH' });
    const b = account({ id: 'b', name: 'б', kind: 'spending', currency: 'UAH' });
    expect(groupAccountsByKind([a, b])[0]?.accounts.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

/**
 * The linked half of a рахунок's row: the bank's own figure beside the computed one, and the
 * коригування «Звірити» would create for the difference.
 */
describe('accountRows', () => {
  const linked = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
  const dollars = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });

  it('Scenario: The two balances remain distinct', () => {
    const rows = accountRows(
      [linked],
      new Map([['card', money(47000, 'UAH')]]),
      new Map([['card', money(50000, 'UAH')]]),
    );

    // Both amounts, both as UAH, neither replacing the other…
    expect(rows[0]?.computed).toBe('470,00 UAH');
    expect(rows[0]?.bankBalance).toBe('500,00 UAH');
    // …and «Звірити» is worth offering, for exactly the difference between them.
    expect(rows[0]?.reconcilable).toBe(true);
    expect(rows[0]?.difference).toBe('30,00 UAH');
  });

  it('Scenario: Equal balances create no correction', () => {
    const rows = accountRows(
      [linked],
      new Map([['card', money(50000, 'UAH')]]),
      new Map([['card', money(50000, 'UAH')]]),
    );

    expect(rows[0]?.bankBalance).toBe('500,00 UAH');
    // Nothing to reconcile: a коригування of zero would be a транзакція saying nothing happened.
    expect(rows[0]?.reconcilable).toBe(false);
    expect(rows[0]).not.toHaveProperty('difference');
  });

  it('A рахунок no monobank account feeds shows only its own balance', () => {
    const rows = accountRows([linked], new Map([['card', money(47000, 'UAH')]]));

    expect(rows[0]?.computed).toBe('470,00 UAH');
    expect(rows[0]).not.toHaveProperty('bankBalance');
    expect(rows[0]?.reconcilable).toBe(false);
  });

  it('Each currency stays its own, and a foreign bank figure is not shown at all', () => {
    const rows = accountRows(
      [linked, dollars],
      new Map([
        ['card', money(47000, 'UAH')],
        ['usd', money(12345, 'USD')],
      ]),
      new Map([
        ['card', money(50000, 'UAH')],
        // A figure that could only come from a link that should not exist: ignored, never
        // converted and never shown beside a USD рахунок as though it belonged to it.
        ['usd', money(50000, 'UAH')],
      ]),
    );

    expect(rows[0]?.bankBalance).toBe('500,00 UAH');
    expect(rows[1]?.computed).toBe('123,45 USD');
    expect(rows[1]).not.toHaveProperty('bankBalance');
    expect(rows[1]?.reconcilable).toBe(false);
  });

  it('A shortfall keeps its sign, so the owner sees which way the коригування goes', () => {
    const rows = accountRows(
      [linked],
      new Map([['card', money(50000, 'UAH')]]),
      new Map([['card', money(47000, 'UAH')]]),
    );

    expect(rows[0]?.difference).toBe('−30,00 UAH');
    expect(reconcileConfirmation(rows[0]!)).toContain('−30,00 UAH');
    expect(reconcileConfirmation(rows[0]!)).toContain('mono black');
  });
});

describe('accountRows — an інвестиційний рахунок', () => {
  const bonds = account({ id: 'bonds', name: 'ОВДП', kind: 'investment', currency: 'UAH' });

  const rowFor = (value?: { amount: ReturnType<typeof money>; asOf: string }) =>
    accountRows(
      [bonds],
      new Map([['bonds', money(500000, 'UAH')]]),
      new Map(),
      value ? new Map([['bonds', value]]) : new Map(),
    )[0]!;

  it('Scenario: All three numbers stand beside each other', () => {
    const row = rowFor({ amount: money(560000, 'UAH'), asOf: '2026-08-28' });

    // Вкладено is the row's own amount, named — never a second copy of the same number.
    expect(row.computed).toBe('5\u00A0000,00 UAH');
    expect(row.investment?.contributedLabel).toBe('вкладено');
    expect(row.investment?.value?.amount).toBe('5\u00A0600,00 UAH');
    expect(row.investment?.value?.asOf).toBe('2026-08-28');
    expect(row.investment?.value?.gainLoss).toBe('+600,00 UAH');
    expect(row.investment?.value?.gainLossLabel).toBe('прибуток');
  });

  it('Scenario: A збиток is shown as the negative it is', () => {
    const row = rowFor({ amount: money(450000, 'UAH'), asOf: '2026-08-28' });

    expect(row.investment?.value?.gainLoss).toBe('−500,00 UAH');
    expect(row.investment?.value?.gainLossLabel).toBe('збиток');
  });

  it('Equal amounts are a прибуток of zero, not a збиток and not an absence', () => {
    const row = rowFor({ amount: money(500000, 'UAH'), asOf: '2026-08-28' });

    expect(row.investment?.value?.gainLoss).toBe('0,00 UAH');
    expect(row.investment?.value?.gainLossLabel).toBe('прибуток');
  });

  it('Scenario: Without a вартість only вкладено is shown', () => {
    const row = rowFor();

    expect(row.computed).toBe('5\u00A0000,00 UAH');
    expect(row.investment?.contributedLabel).toBe('вкладено');
    expect(row.investment).not.toHaveProperty('value');
    // ...and the row says a вартість can be recorded.
    expect(row.investment?.recordLabel).toBe('Записати вартість');
  });

  it('A рахунок that has one offers replacing it rather than recording a first', () => {
    expect(rowFor({ amount: money(560000, 'UAH'), asOf: '2026-08-28' }).investment?.recordLabel).toBe(
      'Змінити вартість',
    );
  });

  it('Scenario: Other вид рахунки are untouched', () => {
    const rows = accountRows(
      [card, jar],
      new Map([
        ['card', money(50000, 'UAH')],
        ['jar', money(700000, 'UAH')],
      ]),
      new Map(),
      // A вартість naming a рахунок of another вид could only come from a row storage refuses.
      new Map([['jar', { amount: money(800000, 'UAH'), asOf: '2026-08-28' }]]),
    );

    expect(rows[0]?.computed).toBe('500,00 UAH');
    expect(rows[1]?.computed).toBe('7\u00A0000,00 UAH');
    expect(rows[0]).not.toHaveProperty('investment');
    expect(rows[1]).not.toHaveProperty('investment');
  });

  it('Scenario: The numbers survive archiving', () => {
    const archived = { ...bonds, archived: true };
    const row = accountRows(
      [archived],
      new Map([['bonds', money(500000, 'UAH')]]),
      new Map(),
      new Map([['bonds', { amount: money(560000, 'UAH'), asOf: '2026-08-28' }]]),
    )[0]!;

    expect(row.computed).toBe('5\u00A0000,00 UAH');
    expect(row.investment?.value?.amount).toBe('5\u00A0600,00 UAH');
    expect(row.investment?.value?.gainLoss).toBe('+600,00 UAH');
  });

  it('A вартість in another currency than the рахунок is dropped, never converted', () => {
    const row = rowFor({ amount: money(10000, 'USD'), asOf: '2026-08-28' });

    expect(row.investment).not.toHaveProperty('value');
    expect(row.investment?.recordLabel).toBe('Записати вартість');
  });

  it('Scenario: A вартість is never reconciled / No коригування is ever offered for a вартість', () => {
    // A вартість far above вкладено, and no bank figure anywhere: the difference between the two
    // is a прибуток, and «Звірити» is not offered for it. Reconciling it would write a
    // коригування, which the month counts as дохід — the very thing this capability exists to
    // keep apart.
    const row = rowFor({ amount: money(560000, 'UAH'), asOf: '2026-08-28' });

    expect(row.reconcilable).toBe(false);
    expect(row).not.toHaveProperty('difference');
    expect(row).not.toHaveProperty('bankBalance');
  });

  it('A bank figure still reconciles on an інвестиційний рахунок — the вартість is not what changed that', () => {
    // «Звірити» is about the баланс банку against the розрахунковий баланс, and this change takes
    // it away from nothing: a linked інвестиційний рахунок keeps it, вартість or no вартість.
    const row = accountRows(
      [bonds],
      new Map([['bonds', money(500000, 'UAH')]]),
      new Map([['bonds', money(470000, 'UAH')]]),
      new Map([['bonds', { amount: money(560000, 'UAH'), asOf: '2026-08-28' }]]),
    )[0]!;

    expect(row.reconcilable).toBe(true);
    // The difference «Звірити» would write is against the баланс банку and never the вартість.
    expect(row.difference).toBe('−300,00 UAH');
  });

  it('Clearing is confirmed by naming what goes and what stays', () => {
    const row = rowFor({ amount: money(560000, 'UAH'), asOf: '2026-08-28' });
    const sentence = clearValueConfirmation(row);

    expect(sentence).toContain('ОВДП');
    expect(sentence).toContain('5\u00A0600,00 UAH');
    expect(sentence).toContain('5\u00A0000,00 UAH');
    expect(sentence).toContain('жодна транзакція не створюється');
  });
});
