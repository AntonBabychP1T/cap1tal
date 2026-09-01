import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import { figuresOf, isRefusal, makeBackup, readBackup, type BackupRefusal } from './backup';
import { canonicalJson, crc32 } from './canonical';
import { BACKUP_FORMAT_VERSION, BACKUP_SCHEMA_VERSION, type BackupState } from './format';

const MADE_AT = new Date('2026-08-30T18:20:00.000Z');

/** An empty state, so each test names only what it is about. */
function state(over: Partial<BackupState> = {}): BackupState {
  return {
    accounts: [],
    categories: [],
    sources: [],
    rules: [],
    limits: [],
    goals: [],
    transactions: [],
    monobankAccounts: [],
    monobankLinks: [],
    monobankImportedItems: [],
    watches: [],
    ...over,
  };
}

function uahAccount(id: string, name = id) {
  return {
    id,
    name,
    kind: 'spending' as const,
    currency: 'UAH',
    openingBalance: money(0, 'UAH'),
    archived: false,
  };
}

function expense(id: string, date: string, accountId = 'a1', categoryId = 'c1'): Transaction {
  return { type: 'expense', id, date, accountId, amount: money(-12_000, 'UAH'), categoryId };
}

function stored(t: Transaction, storedAtMs = 1_700_000_000_000) {
  return { transaction: t, storedAtMs };
}

/** A бекап of one рахунок, one категорія and one витрата — the smallest thing that stands up. */
function smallState(): BackupState {
  return state({
    accounts: [uahAccount('a1', 'Картка')],
    categories: [{ id: 'c1', name: 'Продукти', archived: false }],
    transactions: [stored(expense('t1', '2026-08-30'))],
  });
}

/**
 * A бекап built around a body this app's own `makeBackup` could never produce, with a checksum
 * that is nonetheless right for it — the only way to reach the body checks with a file that a
 * different tool, or a hand edit plus a recomputed checksum, could really hand us.
 */
function handMade(data: unknown): string {
  return JSON.stringify({
    app: 'cap1tal',
    kind: 'backup',
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: MADE_AT.toISOString(),
    checksum: crc32(canonicalJson(data)),
    data,
  });
}

function refusal(bytes: string): BackupRefusal {
  const read = readBackup(bytes);
  if (!isRefusal(read)) {
    throw new Error(`expected a refusal, got a бекап of ${read.figures.transactions} транзакцій`);
  }
  return read;
}

describe('a бекап is one versioned file holding the whole state', () => {
  it('Scenario: Identifiers are preserved', () => {
    const before = state({
      accounts: [uahAccount('a1', 'Картка'), uahAccount('a2', 'Готівка')],
      categories: [{ id: 'c1', name: 'Продукти', archived: false }],
      sources: [{ id: 's1', name: 'Зарплата', archived: false }],
      rules: [{ id: 'r1', merchant: 'сільпо', categoryId: 'c1', createdAtMs: 1_700_000_000_000 }],
      goals: [
        { id: 'g1', name: 'Авто', target: money(500_000, 'UAH'), deadline: '2027-01-01', accountId: 'a1' },
      ],
      transactions: [stored(expense('t1', '2026-08-30'))],
    });

    const read = readBackup(makeBackup(before, MADE_AT).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);

    // Verbatim, not merely "the same number of things": the schema's ids are app-generated TEXT
    // precisely so a restored бекап refers to the same рахунки the бекап was made from.
    expect(read.state).toEqual(before);
    expect(read.state.accounts.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(read.state.rules.map((r) => r.id)).toEqual(['r1']);
    expect(read.state.goals.map((g) => g.id)).toEqual(['g1']);
    expect(read.state.transactions.map((t) => t.transaction.id)).toEqual(['t1']);
  });

  it('names the moment it was made and the versions it was written under', () => {
    const snapshot = makeBackup(smallState(), MADE_AT);

    expect(snapshot.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(snapshot.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(snapshot.createdAt).toEqual(MADE_AT);

    const read = readBackup(snapshot.bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.createdAt).toEqual(MADE_AT);
    expect(read.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
  });

  it('says what it is in its first bytes, so a half-written file still says it', () => {
    // What lets a truncated бекап be told apart from a file that was never one.
    expect(makeBackup(smallState(), MADE_AT).bytes.slice(0, 40)).toContain('"app":"cap1tal"');
  });

  it('carries the two pieces of storage metadata that decide order', () => {
    // `storedAt` breaks ties between транзакції of one дата, `createdAt` between two equally
    // specific правила — so a restored phone lists exactly what the old one listed (design D3).
    const before = state({
      accounts: [uahAccount('a1')],
      categories: [{ id: 'c1', name: 'Продукти', archived: false }],
      rules: [{ id: 'r1', mcc: 5411, categoryId: 'c1', createdAtMs: 1_699_000_000_123 }],
      transactions: [stored(expense('t1', '2026-08-30'), 1_700_000_000_456)],
    });

    const read = readBackup(makeBackup(before, MADE_AT).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.state.transactions[0]?.storedAtMs).toBe(1_700_000_000_456);
    expect(read.state.rules[0]?.createdAtMs).toBe(1_699_000_000_123);
  });
});

describe('a бекап proves it is undamaged before it is trusted', () => {
  it('Scenario: An edited бекап is refused', () => {
    const bytes = makeBackup(smallState(), MADE_AT).bytes;
    // Someone opened the file and moved a сума. Nothing else about it changed.
    const edited = bytes.replace('-12000', '-99000');
    expect(edited).not.toBe(bytes);

    expect(refusal(edited).kind).toBe('damaged');
  });

  it('Scenario: A truncated бекап is refused', () => {
    const bytes = makeBackup(smallState(), MADE_AT).bytes;

    expect(refusal(bytes.slice(0, Math.floor(bytes.length / 2))).kind).toBe('damaged');
    // Even a file cut so short that only its head survives is a damaged бекап, not a stranger.
    expect(refusal(bytes.slice(0, 30)).kind).toBe('damaged');
  });

  it('Scenario: A file that is not a бекап is refused', () => {
    const saldoCsv = 'Date,Account,Category,Amount\n2026-08-30,Картка,Продукти,-120.00\n';

    expect(refusal(saldoCsv).kind).toBe('not-a-backup');
    expect(refusal('').kind).toBe('not-a-backup');
    // Valid JSON that is simply something else — a bare array, another app's export.
    expect(refusal('[1,2,3]').kind).toBe('not-a-backup');
    expect(refusal('{"app":"something-else","data":{}}').kind).toBe('not-a-backup');
  });

  it('Scenario: A бекап whose moment is not one is refused', () => {
    // The markers are right and the checksum is right for the body — the checksum covers the body
    // and not the envelope (design D4), so nothing downstream would catch this. Only the envelope
    // check can: a file that cannot say when it was made is not one of ours.
    const bytes = handMade(smallState()).replace(
      `"createdAt":"${MADE_AT.toISOString()}"`,
      '"createdAt":"коли завгодно"',
    );
    expect(bytes).toContain('коли завгодно');

    expect(refusal(bytes).kind).toBe('not-a-backup');
    // An empty one and a number-shaped one are the same answer, not a preview of Invalid Date.
    expect(refusal(handMade(smallState()).replace(`"${MADE_AT.toISOString()}"`, '""')).kind).toBe(
      'not-a-backup',
    );
  });
});

describe('a бекап names the versions it was written under', () => {
  it('Scenario: A бекап from a newer app is refused, not half-read', () => {
    const bytes = makeBackup(smallState(), MADE_AT).bytes.replace(
      `"formatVersion":${BACKUP_FORMAT_VERSION}`,
      `"formatVersion":${BACKUP_FORMAT_VERSION + 1}`,
    );

    const read = refusal(bytes);
    // Refused for the version and not as damage: the checksum covers the body, which is untouched.
    expect(read).toEqual({
      kind: 'newer-format',
      formatVersion: BACKUP_FORMAT_VERSION + 1,
      supported: BACKUP_FORMAT_VERSION,
    });
  });

  it('Scenario: A бекап from a newer storage shape is refused', () => {
    const bytes = makeBackup(smallState(), MADE_AT).bytes.replace(
      `"schemaVersion":${BACKUP_SCHEMA_VERSION}`,
      `"schemaVersion":${BACKUP_SCHEMA_VERSION + 1}`,
    );

    expect(refusal(bytes)).toEqual({
      kind: 'newer-schema',
      schemaVersion: BACKUP_SCHEMA_VERSION + 1,
      supported: BACKUP_SCHEMA_VERSION,
    });
  });

  it('reads a бекап written under an older storage shape', () => {
    const bytes = makeBackup(smallState(), MADE_AT).bytes.replace(
      `"schemaVersion":${BACKUP_SCHEMA_VERSION}`,
      '"schemaVersion":1',
    );

    const read = readBackup(bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.schemaVersion).toBe(1);
    expect(read.figures.transactions).toBe(1);
  });
});

describe('a бекап that contradicts itself is refused whole', () => {
  it('Scenario: A transaction pointing outside the бекап stops the restore', () => {
    const orphan = state({
      accounts: [uahAccount('a1')],
      categories: [{ id: 'c1', name: 'Продукти', archived: false }],
      transactions: [stored(expense('t1', '2026-08-30', 'a-gone'))],
    });

    const read = refusal(makeBackup(orphan, MADE_AT).bytes);
    expect(read.kind).toBe('inconsistent');
    expect(read.kind === 'inconsistent' && read.problem).toContain('t1');
    expect(read.kind === 'inconsistent' && read.problem).toContain('рахунок');
  });

  it('refuses a транзакція naming a категорія or джерело the бекап does not hold', () => {
    const noCategory = state({
      accounts: [uahAccount('a1')],
      transactions: [stored(expense('t1', '2026-08-30', 'a1', 'c-gone'))],
    });
    expect(refusal(makeBackup(noCategory, MADE_AT).bytes).kind).toBe('inconsistent');

    const noSource = state({
      accounts: [uahAccount('a1')],
      transactions: [
        stored({
          type: 'income',
          id: 't2',
          date: '2026-08-30',
          accountId: 'a1',
          amount: money(50_000, 'UAH'),
          sourceId: 's-gone',
        }),
      ],
    });
    expect(refusal(makeBackup(noSource, MADE_AT).bytes).kind).toBe('inconsistent');
  });

  it('Scenario: A ціль in another currency than its рахунок stops the restore', () => {
    const mismatched = state({
      accounts: [uahAccount('a1', 'Картка')],
      goals: [
        {
          id: 'g1',
          name: 'Авто',
          target: money(500_000, 'USD'),
          deadline: '2027-01-01',
          accountId: 'a1',
        },
      ],
    });

    const read = refusal(makeBackup(mismatched, MADE_AT).bytes);
    expect(read.kind).toBe('inconsistent');
    expect(read.kind === 'inconsistent' && read.problem).toContain('USD');
    expect(read.kind === 'inconsistent' && read.problem).toContain('UAH');
  });

  it('refuses a ліміт, ціль or застосунок on something the бекап does not hold', () => {
    for (const contradiction of [
      state({ limits: [{ categoryId: 'c-gone', amount: money(250_000, 'UAH') }] }),
      state({
        goals: [
          {
            id: 'g1',
            name: 'Авто',
            target: money(1, 'UAH'),
            deadline: '2027-01-01',
            accountId: 'a-gone',
          },
        ],
      }),
      state({ watches: [{ packageName: 'ua.privatbank.ap24', accountId: 'a-gone' }] }),
      state({ rules: [{ id: 'r1', mcc: 5411, categoryId: 'c-gone', createdAtMs: 0 }] }),
      state({ monobankImportedItems: [{ monobankAccountId: 'm-gone', itemId: 'i1' }] }),
    ]) {
      expect(refusal(makeBackup(contradiction, MADE_AT).bytes).kind).toBe('inconsistent');
    }
  });

  it('refuses a сума that is not an integer in minor units or has no currency code', () => {
    const account = {
      id: 'a1',
      name: 'Картка',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: { amount: 0, currency: 'UAH' },
      archived: false,
    };
    const withAmount = (amount: unknown) => ({
      accounts: [account],
      categories: [{ id: 'c1', name: 'Продукти', archived: false }],
      transactions: [
        {
          transaction: {
            type: 'expense',
            id: 't1',
            date: '2026-08-30',
            accountId: 'a1',
            amount,
            categoryId: 'c1',
          },
          storedAtMs: 0,
        },
      ],
    });

    // A сума in major units, which is the mistake this rule exists for: 120.5 hryvnias is not an
    // amount this app can hold, and a бекап holding one may not be half-restored to find out.
    expect(refusal(handMade(withAmount({ amount: 120.5, currency: 'UAH' }))).kind).toBe(
      'inconsistent',
    );
    // A bare number with no currency code beside it.
    expect(refusal(handMade(withAmount(12_000))).kind).toBe('inconsistent');
    // A code that is not ISO-4217.
    expect(refusal(handMade(withAmount({ amount: 12_000, currency: 'грн' }))).kind).toBe(
      'inconsistent',
    );
    // And an opening balance in a currency the рахунок does not hold money in.
    expect(
      refusal(
        handMade({ accounts: [{ ...account, openingBalance: { amount: 1, currency: 'USD' } }] }),
      ).kind,
    ).toBe('inconsistent');
  });

  it('refuses a body that is not the shape of a state at all', () => {
    expect(refusal(handMade({ accounts: 'усі' })).kind).toBe('inconsistent');
    expect(refusal(handMade({ accounts: [{ id: 'a1' }] })).kind).toBe('inconsistent');
    expect(refusal(handMade({ transactions: [{ transaction: { type: 'дар' } }] })).kind).toBe(
      'inconsistent',
    );
  });
});

describe('what a restore would do is knowable before it does it', () => {
  it('Scenario: The бекап describes itself before it is restored', () => {
    const accounts = Array.from({ length: 12 }, (_, i) => uahAccount(`a${i}`));
    // 4300 транзакції spread over the months 2024-01 to 2026-08, first and last dated exactly.
    const dates = ['2024-01-03', ...Array.from({ length: 4298 }, () => '2025-06-15'), '2026-08-30'];
    const before = state({
      accounts,
      categories: [{ id: 'c1', name: 'Продукти', archived: false }],
      transactions: dates.map((date, i) => stored(expense(`t${i}`, date, 'a0'))),
    });

    const read = readBackup(makeBackup(before, MADE_AT).bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);

    expect(read.createdAt).toEqual(MADE_AT);
    expect(read.figures).toEqual({
      accounts: 12,
      transactions: 4300,
      firstMonth: '2024-01',
      lastMonth: '2026-08',
    });
  });

  it('counts the phone the same way it counts the бекап', () => {
    // One function for both sides of the preview, so the two columns cannot be counted apart.
    const phone = state({
      accounts: [uahAccount('a1'), uahAccount('a2'), uahAccount('a3')],
      categories: [{ id: 'c1', name: 'Продукти', archived: false }],
      transactions: Array.from({ length: 40 }, (_, i) => stored(expense(`t${i}`, '2026-08-01'))),
    });

    expect(figuresOf(phone)).toEqual({
      accounts: 3,
      transactions: 40,
      firstMonth: '2026-08',
      lastMonth: '2026-08',
    });
  });

  it('names no months at all when it holds no транзакція', () => {
    expect(figuresOf(state({ accounts: [uahAccount('a1')] }))).toEqual({
      accounts: 1,
      transactions: 0,
    });
  });

  it('Scenario: An older бекап still restores', () => {
    // Written before відстежувані застосунки existed: the body names no `watches` at all, and its
    // checksum is the one such a file would really carry.
    const older = { ...smallState() } as Record<string, unknown>;
    delete older.watches;
    const bytes = makeBackup(older as unknown as BackupState, MADE_AT).bytes;
    expect(bytes).not.toContain('"watches"');

    const read = readBackup(bytes);
    if (isRefusal(read)) throw new Error(`unexpectedly refused: ${read.kind}`);
    expect(read.state.accounts).toHaveLength(1);
    expect(read.state.transactions).toHaveLength(1);
    // Filled in as nothing, never invented.
    expect(read.state.watches).toEqual([]);
  });
});
