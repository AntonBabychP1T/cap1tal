import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { JOURNAL_LIMIT, type JournalEntry } from '../reporting/journal';
import type { BugReport } from '../reporting/report';
import { reportingRepo, type NewBugReport, type ReportingRepo } from './reporting-repo';
import { toAccountRow } from './mappers';
import { accounts, bugReportScreenshots } from './schema';
import { openTestDb, seedReferences, type TestStorage } from './test-db';

const BASE = new Date('2026-09-02T14:00:00.000Z').getTime();

function entry(over: Partial<JournalEntry> & { id: string }): JournalEntry {
  return { at: new Date(BASE), kind: 'screen', name: '/(tabs)', ...over };
}

const CONTEXT: Omit<NewBugReport, 'id' | 'createdAt' | 'journal' | 'prompting'> = {
  did: 'натиснув Записати',
  happened: null,
  expected: null,
  route: '/(tabs)/accounts',
  build: { version: '0.0.0', commit: '3df8103', dirty: true, builtAt: '2026-09-02T14:33:32.747Z' },
  device: { platform: 'android', systemVersion: '16', model: 'Pixel 7' },
  migrationsApplied: 13,
  counts: { accounts: 2, transactions: 7, categories: 5, rules: 0, drafts: 1 },
};

function report(over: Partial<NewBugReport> & { id: string }): NewBugReport {
  return { createdAt: new Date(BASE), journal: [], prompting: null, ...CONTEXT, ...over };
}

describe('the журнал in storage', () => {
  let storage: TestStorage;
  let repo: ReportingRepo;

  beforeEach(() => {
    storage = openTestDb();
    repo = reportingRepo(storage.db);
  });

  afterEach(() => storage.close());

  it('Scenario: A screen opening is an entry', () => {
    repo.append(entry({ id: 'j1', name: '/(tabs)/month', at: new Date(BASE) }));
    repo.append(entry({ id: 'j2', name: '/(tabs)/accounts', at: new Date(BASE + 1000) }));

    expect(repo.tail().map((e) => [e.kind, e.name])).toEqual([
      ['screen', '/(tabs)/month'],
      ['screen', '/(tabs)/accounts'],
    ]);
    expect(repo.tail()[0]?.at.getTime()).toBe(BASE);
  });

  it('Scenario: A refused save is an entry with the refusal text', () => {
    repo.append(
      entry({ id: 'j1', kind: 'failure', name: 'local-save', detail: 'Оберіть рахунок' }),
    );

    expect(repo.tail()[0]).toEqual({
      id: 'j1',
      at: new Date(BASE),
      kind: 'failure',
      name: 'local-save',
      detail: 'Оберіть рахунок',
    });
  });

  it('Scenario: The журнал is bounded', () => {
    for (let i = 0; i < JOURNAL_LIMIT; i += 1) {
      repo.append(entry({ id: `j${i}`, at: new Date(BASE + i) }));
    }
    expect(repo.tail()).toHaveLength(JOURNAL_LIMIT);

    repo.append(entry({ id: 'newest', at: new Date(BASE + JOURNAL_LIMIT) }));

    const tail = repo.tail();
    expect(tail).toHaveLength(JOURNAL_LIMIT);
    expect(tail.map((e) => e.id).slice(0, 1)).toEqual(['j1']);
    expect(tail.some((e) => e.id === 'j0')).toBe(false);
    expect(tail.map((e) => e.id).slice(-1)).toEqual(['newest']);
  });

  it('Scenario: The журнал is bounded — two entries in one millisecond drop the earlier one', () => {
    // The fallback writes its `screen` entry and its `crash` entry in one tick, so this is the
    // pair the bound has to get right (design D5): `at` alone cannot order them.
    for (let i = 0; i < JOURNAL_LIMIT - 1; i += 1) {
      repo.append(entry({ id: `j${i}`, at: new Date(BASE) }));
    }
    repo.append(entry({ id: 'route', at: new Date(BASE + 1) }));
    repo.append(entry({ id: 'crash', kind: 'crash', name: 'render', at: new Date(BASE + 1) }));

    const tail = repo.tail();
    expect(tail).toHaveLength(JOURNAL_LIMIT);
    // The oldest went, and the two that shared a millisecond kept their insertion order.
    expect(tail.some((e) => e.id === 'j0')).toBe(false);
    expect(tail.map((e) => e.id).slice(-2)).toEqual(['route', 'crash']);
  });

  it('refuses a kind the app does not name', () => {
    expect(() => repo.append({ ...entry({ id: 'j1' }), kind: 'debug' as never })).toThrow(
      /journal kind/,
    );
  });

  it('finds one entry by id, and says so when the pruning has taken it', () => {
    repo.append(entry({ id: 'j1', kind: 'crash', name: 'render', detail: 'Boom\n  at Screen' }));

    expect(repo.byId('j1')?.detail).toBe('Boom\n  at Screen');
    expect(repo.byId('gone')).toBeNull();
  });
});

describe('the репорти про помилки in storage', () => {
  let storage: TestStorage;
  let repo: ReportingRepo;

  beforeEach(() => {
    storage = openTestDb();
    repo = reportingRepo(storage.db);
  });

  afterEach(() => storage.close());

  it('reads a репорт back exactly as it was written', () => {
    const crash = entry({
      id: 'j9',
      kind: 'crash',
      name: 'render',
      detail: 'Boom\n  at AccountsScreen',
      at: new Date(BASE + 9),
    });
    const journal = [entry({ id: 'j8', at: new Date(BASE + 8) }), crash];
    repo.create(report({ id: 'r1', journal, prompting: crash, happened: 'впав' }));

    const stored = repo.get('r1');
    expect(stored).toEqual<BugReport>({
      ...report({ id: 'r1', journal, prompting: crash, happened: 'впав' }),
      screenshots: [],
      handedOverAt: null,
    });
  });

  it('Scenario: The list is newest first', () => {
    const day = 24 * 60 * 60 * 1000;
    repo.create(report({ id: 'older', createdAt: new Date(BASE), did: 'перший' }));
    repo.create(report({ id: 'newer', createdAt: new Date(BASE + day), did: 'другий' }));

    expect(repo.list().map((r) => r.id)).toEqual(['newer', 'older']);
    expect(repo.list().map((r) => r.did)).toEqual(['другий', 'перший']);
  });

  it('Scenario: Removing the репорт removes its screenshots', () => {
    repo.create(report({ id: 'r1' }));
    repo.addScreenshot('r1', 'shot-1.png', new Date(BASE + 1));
    repo.addScreenshot('r1', 'shot-2.png', new Date(BASE + 2));
    expect(repo.get('r1')?.screenshots.map((s) => s.name)).toEqual(['shot-1.png', 'shot-2.png']);

    repo.remove('r1');

    expect(repo.get('r1')).toBeNull();
    expect(repo.list()).toEqual([]);
    // The child rows went with it, by the cascade rather than by a second delete — asked of the
    // table itself, since no repository read can see rows whose parent is gone.
    expect(storage.db.select().from(bugReportScreenshots).all()).toEqual([]);
  });

  it('drops one screenshot without touching the others', () => {
    repo.create(report({ id: 'r1' }));
    repo.addScreenshot('r1', 'shot-1.png', new Date(BASE + 1));
    repo.addScreenshot('r1', 'shot-2.png', new Date(BASE + 2));

    repo.removeScreenshot('r1', 'shot-1.png');

    expect(repo.get('r1')?.screenshots.map((s) => s.name)).toEqual(['shot-2.png']);
  });

  it('Scenario: A репорт from a crash carries the crash', () => {
    const crash = entry({
      id: 'crash',
      kind: 'crash',
      name: 'render',
      detail: 'Boom\n  at AccountsScreen',
      at: new Date(BASE + 1),
    });
    repo.append(entry({ id: 'route', at: new Date(BASE) }));
    repo.append(crash);

    repo.create(report({ id: 'r1', journal: repo.tail(), prompting: repo.byId('crash') }));

    // The live журнал rolls right past the crash...
    for (let i = 0; i < 600; i += 1) {
      repo.append(entry({ id: `later${i}`, at: new Date(BASE + 1000 + i) }));
    }
    expect(repo.byId('crash')).toBeNull();

    // ...and the репорт still carries it, both as its prompting failure and as the last entry of
    // the журнал it froze at creation.
    const stored = repo.get('r1');
    expect(stored?.prompting?.detail).toBe('Boom\n  at AccountsScreen');
    expect(stored?.prompting?.at).toEqual(new Date(BASE + 1));
    expect(stored?.journal.map((e) => e.id)).toEqual(['route', 'crash']);
    expect(stored?.journal[1]?.detail).toBe('Boom\n  at AccountsScreen');
  });

  it('marks the moment it was handed over, and keeps the first one', () => {
    repo.create(report({ id: 'r1' }));
    expect(repo.get('r1')?.handedOverAt).toBeNull();

    repo.markHandedOver('r1', new Date(BASE + 10));
    repo.markHandedOver('r1', new Date(BASE + 99));

    expect(repo.get('r1')?.handedOverAt).toEqual(new Date(BASE + 10));
  });
});

describe('what the репорт says about the phone', () => {
  let storage: TestStorage;
  let repo: ReportingRepo;

  beforeEach(() => {
    storage = openTestDb();
    repo = reportingRepo(storage.db);
  });

  afterEach(() => storage.close());

  it('counts what the phone holds, and nothing about what it is worth', () => {
    seedReferences(storage.db, { categories: ['food', 'clothes'], sources: ['salary'] });
    storage.db
      .insert(accounts)
      .values(
        toAccountRow(
          account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' }),
        ),
      )
      .run();

    const counts = repo.counts();

    expect(counts.accounts).toBe(1);
    expect(counts.transactions).toBe(0);
    // The three reserved rows migration 0003 inserts, plus the two seeded here.
    expect(counts.categories).toBeGreaterThanOrEqual(2);
    expect(counts.rules).toBe(0);
    expect(counts.drafts).toBe(0);
    // Numbers only: there is no field here a сума or a назва could sit in.
    expect(Object.keys(counts).sort()).toEqual([
      'accounts',
      'categories',
      'drafts',
      'rules',
      'transactions',
    ]);
    expect(Object.values(counts).every((value) => typeof value === 'number')).toBe(true);
  });

  it('says how many migrations this database has had applied', () => {
    // Every committed one, since `openTestDb` runs the real migrator over the real folder.
    expect(repo.migrationsApplied()).toBeGreaterThanOrEqual(13);
  });
});
