import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeBackup, readBackup, isRefusal } from '../backup/backup';
import { BACKUP_FORMAT_VERSION, type BackupState } from '../backup/format';
import { backupRepo } from '../db/backup-repo';
import { openTestDb, type TestDb, type TestStorage } from '../db/test-db';
import { accountsRepo } from '../db/accounts-repo';
import { categoriesRepo } from '../db/categories-repo';
import { transactionsRepo } from '../db/transactions-repo';
import { account } from '../domain/account';
import { money } from '../domain/money';
import type { Expense } from '../domain/transaction';
import { inMemoryBackupFiles } from '../platform/backup-file';
import {
  backOut,
  backupFileName,
  BACKUP_EXPLANATION,
  confirmRestore,
  pickForRestore,
  refusalMessage,
  RESTORE_WARNING,
  saveToFile,
  type BackupScreenState,
  type RestorePreview,
} from './backup-screen';

/**
 * The «Бекап» section's decisions, without its JSX: what it claims after a save, what it refuses a
 * file for, and what the preview puts beside what.
 *
 * The store is the real one over an in-memory database with the committed migrations applied, and
 * the file port is the double — so nothing here loads a native module and every number the screen
 * shows is one storage actually produced.
 */

const NOW = new Date(2026, 7, 30, 20, 15, 0);

const card = account({ id: 'card', name: 'Картка', kind: 'spending', currency: 'UAH' });

function expense(id: string, date: string): Expense {
  return {
    type: 'expense',
    id,
    date,
    accountId: 'card',
    amount: money(-12_000, 'UAH'),
    categoryId: 'food',
  };
}

/** A phone with three рахунки and forty транзакції — the «now» side of the preview. */
function seedPhone(db: TestDb): void {
  const accounts = accountsRepo(db);
  accounts.save(card);
  accounts.save(account({ id: 'cash', name: 'Готівка', kind: 'cash', currency: 'UAH' }));
  accounts.save(account({ id: 'jar', name: 'Банка', kind: 'savings', currency: 'UAH' }));
  categoriesRepo(db).create({ id: 'food', name: 'Продукти' });
  const transactions = transactionsRepo(db);
  for (let i = 0; i < 40; i += 1) {
    transactions.save(expense(`t${i}`, '2026-08-01'), new Date(NOW.getTime() + i));
  }
}

/** A бекап made elsewhere: twelve рахунки, 4300 транзакції, 2024-01 to 2026-08. */
function foreignBackup(): string {
  const accounts = Array.from({ length: 12 }, (_, i) =>
    account({ id: `f${i}`, name: `Рахунок ${i}`, kind: 'spending', currency: 'UAH' }),
  );
  const dates = ['2024-01-03', ...Array.from({ length: 4298 }, () => '2025-06-15'), '2026-08-30'];
  const state: BackupState = {
    accounts,
    categories: [{ id: 'food', name: 'Продукти', archived: false }],
    sources: [],
    rules: [],
    limits: [],
    goals: [],
    transactions: dates.map((date, i) => ({
      transaction: {
        type: 'expense',
        id: `f-t${i}`,
        date,
        accountId: 'f0',
        amount: money(-1_000, 'UAH'),
        categoryId: 'food',
      },
      storedAtMs: NOW.getTime() + i,
    })),
    monobankAccounts: [],
    monobankLinks: [],
    monobankImportedItems: [],
    watches: [],
    receipts: [],
    receiptItems: [],
  };
  return makeBackup(state, new Date(2026, 7, 30, 12, 0, 0)).bytes;
}

function previewing(state: BackupScreenState): RestorePreview {
  if (state.kind !== 'previewing') {
    throw new Error(`expected a preview, got ${state.kind}`);
  }
  return state.preview;
}

describe('the «Бекап» section', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedPhone(storage.db);
  });
  afterEach(() => storage.close());

  it('says what the file is and what restoring does', () => {
    // Unencrypted, and replacing — both said before either action is taken.
    expect(BACKUP_EXPLANATION).toContain('не зашифрований');
    expect(RESTORE_WARNING).toContain('замінює все');
  });

  it('names the file by the date it was made', () => {
    expect(backupFileName(NOW)).toBe('cap1tal-2026-08-30.json');
  });
});

describe('saving a бекап', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedPhone(storage.db);
  });
  afterEach(() => storage.close());

  it('Scenario: A saved бекап is reported by what it holds', async () => {
    const files = inMemoryBackupFiles();

    const state = await saveToFile({ store: backupRepo(storage.db), files }, NOW);

    expect(state).toEqual({
      kind: 'saved',
      message: 'Бекап від 2026-08-30 збережено: 3 рахунки, 40 транзакцій.',
    });
    // And the file's own name carries that date.
    expect(files.saved().map((f) => f.name)).toEqual(['cap1tal-2026-08-30.json']);
    // What was handed over is a бекап that reads back as one.
    const read = readBackup(files.saved()[0]!.text);
    expect(isRefusal(read)).toBe(false);
  });

  it('Scenario: Backing out claims nothing', async () => {
    const files = inMemoryBackupFiles({ saveOutcome: { kind: 'cancelled' } });

    const state = await saveToFile({ store: backupRepo(storage.db), files }, NOW);

    // Back where it started, with «Зберегти у файл» offered again and nothing claimed.
    expect(state).toEqual({ kind: 'idle' });
    expect(files.saved()).toEqual([]);
  });

  it('Scenario: A save that fails says so', async () => {
    const before = backupRepo(storage.db).snapshot();

    const failed = await saveToFile(
      {
        store: backupRepo(storage.db),
        files: inMemoryBackupFiles({ saveOutcome: { kind: 'failed', reason: 'немає місця' } }),
      },
      NOW,
    );
    expect(failed.kind).toBe('failed');
    expect(failed.kind === 'failed' && failed.message).toContain('не збережено');
    expect(failed.kind === 'failed' && failed.message).toContain('немає місця');

    const unavailable = await saveToFile(
      {
        store: backupRepo(storage.db),
        files: inMemoryBackupFiles({ saveOutcome: { kind: 'unavailable' } }),
      },
      NOW,
    );
    expect(unavailable.kind).toBe('failed');
    expect(unavailable.kind === 'failed' && unavailable.message).toContain('не збережено');

    // And nothing about the phone's data changed on either path.
    expect(backupRepo(storage.db).snapshot()).toEqual(before);
  });
});

describe('a file chosen for restore is checked before it is offered', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedPhone(storage.db);
  });
  afterEach(() => storage.close());

  async function pick(picked: string): Promise<BackupScreenState> {
    return pickForRestore({
      store: backupRepo(storage.db),
      files: inMemoryBackupFiles({ picked }),
    });
  }

  it('Scenario: A file that is not a бекап is named as such', async () => {
    const before = backupRepo(storage.db).snapshot();

    const state = await pick('Date,Account,Category,Amount\n2026-08-30,Картка,Продукти,-120.00\n');

    expect(state).toEqual({
      kind: 'refused',
      message: 'Це не файл бекапу cap1tal. Оберіть інший файл.',
    });
    // Still offering to pick another, and no рахунок or транзакція changed.
    expect(backupRepo(storage.db).snapshot()).toEqual(before);
  });

  it('Scenario: A damaged бекап is named as damaged', async () => {
    const before = backupRepo(storage.db).snapshot();

    const state = await pick(foreignBackup().replace('"f-t0"', '"f-t9999"'));

    expect(state.kind).toBe('refused');
    expect(state.kind === 'refused' && state.message).toContain('пошкоджений');
    expect(backupRepo(storage.db).snapshot()).toEqual(before);
  });

  it('Scenario: A бекап from a newer app is named as such', async () => {
    // One past whatever this build writes: the format version moves when a shape inside the file
    // changes, so the number is read from the constant rather than written here again.
    const newer = `"formatVersion":${BACKUP_FORMAT_VERSION + 1}`;
    const state = await pick(
      foreignBackup().replace(`"formatVersion":${BACKUP_FORMAT_VERSION}`, newer),
    );

    expect(state.kind).toBe('refused');
    expect(state.kind === 'refused' && state.message).toContain('новішою версією');
    expect(state.kind === 'refused' && state.message).toContain('оновіть застосунок');
    // The storage-shape version reads the same way, because from here the two are one fact.
    expect(refusalMessage({ kind: 'newer-schema', schemaVersion: 9, supported: 8 })).toBe(
      refusalMessage({
        kind: 'newer-format',
        formatVersion: BACKUP_FORMAT_VERSION + 1,
        supported: BACKUP_FORMAT_VERSION,
      }),
    );
  });

  it('names a file the device would not hand over', async () => {
    const state = await pickForRestore({
      store: backupRepo(storage.db),
      files: inMemoryBackupFiles({
        pickOutcome: { kind: 'unreadable', reason: 'файл не відкривається' },
      }),
    });

    expect(state.kind).toBe('refused');
    expect(state.kind === 'refused' && state.message).toContain('файл не відкривається');
  });

  it('says nothing at all when the owner dismisses the picker', async () => {
    const state = await pickForRestore({
      store: backupRepo(storage.db),
      files: inMemoryBackupFiles(),
    });

    expect(state).toEqual({ kind: 'idle' });
  });

  it('names a бекап whose contents contradict each other', async () => {
    const orphan = makeBackup(
      {
        accounts: [],
        categories: [],
        sources: [],
        rules: [],
        limits: [],
        goals: [],
        transactions: [{ transaction: expense('t1', '2026-08-30'), storedAtMs: 0 }],
        monobankAccounts: [],
        monobankLinks: [],
        monobankImportedItems: [],
        watches: [],
        receipts: [],
        receiptItems: [],
      },
      NOW,
    ).bytes;

    const state = await pick(orphan);

    expect(state.kind).toBe('refused');
    expect(state.kind === 'refused' && state.message).toContain('суперечить');
  });
});

describe('the restore preview, and the word that follows it', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seedPhone(storage.db);
  });
  afterEach(() => storage.close());

  async function preview(): Promise<RestorePreview> {
    return previewing(
      await pickForRestore({
        store: backupRepo(storage.db),
        files: inMemoryBackupFiles({ picked: foreignBackup() }),
      }),
    );
  }

  it('Scenario: The preview puts the бекап beside the phone', async () => {
    const shown = await preview();

    expect(shown.made).toBe('2026-08-30');
    expect(shown.rows).toEqual([
      { label: 'Рахунки', backup: '12', phone: '3' },
      { label: 'Транзакції', backup: '4300', phone: '40' },
      { label: 'Місяці', backup: 'Січень 2024 — Серпень 2026', phone: 'Серпень 2026' },
    ]);
    // And what would be replaced, in numbers rather than adjectives.
    expect(shown.warning).toContain('3 рахунки, 40 транзакцій');
  });

  it('Scenario: Backing out of the preview restores nothing', async () => {
    const before = backupRepo(storage.db).snapshot();
    await preview();

    expect(backOut()).toEqual({ kind: 'idle' });
    // The phone still holds its own three рахунки and forty транзакції.
    const after = backupRepo(storage.db).snapshot();
    expect(after).toEqual(before);
    expect(after.accounts).toHaveLength(3);
    expect(after.transactions).toHaveLength(40);
  });

  it('reports a confirmed restore by what came back', async () => {
    const shown = await preview();

    const state = await confirmRestore({ store: backupRepo(storage.db) }, shown);

    expect(state).toEqual({
      kind: 'restored',
      message: 'Відновлено: 12 рахунків, 4300 транзакцій.',
    });
    // And «Рахунки» would now show the бекап's twelve.
    expect(backupRepo(storage.db).snapshot().accounts).toHaveLength(12);
  });

  it('Scenario: A failed restore changes nothing', async () => {
    const shown = await preview();
    const before = backupRepo(storage.db).snapshot();
    // Writing it is rejected partway: its last транзакція names a категорія nothing holds.
    const broken: RestorePreview = {
      ...shown,
      header: {
        ...shown.header,
        state: {
          ...shown.header.state,
          transactions: [
            ...shown.header.state.transactions,
            {
              transaction: { ...expense('t-last', '2026-08-30'), categoryId: 'зникла' },
              storedAtMs: 0,
            },
          ],
        },
      },
    };

    const state = await confirmRestore({ store: backupRepo(storage.db) }, broken);

    expect(state.kind).toBe('failed');
    expect(state.kind === 'failed' && state.message).toContain('на телефоні все як було');
    // «Рахунки» still shows the рахунки the phone held before the attempt.
    expect(backupRepo(storage.db).snapshot()).toEqual(before);
  });

  it('restores exactly the бекап the preview described, never the file re-read', async () => {
    // The state travels inside the preview, so nothing between the numbers on the screen and the
    // replacement can substitute another file.
    const shown = await preview();
    expect(shown.header.figures.transactions).toBe(4300);

    await confirmRestore({ store: backupRepo(storage.db) }, shown);
    expect(backupRepo(storage.db).snapshot().transactions).toHaveLength(4300);
  });
});

/**
 * Three facts about this section live in JSX that `verify` never runs: that both actions and the
 * warning are on the screen at all, that nothing restores without passing the preview, and that
 * the app shows the restored state afterwards because its screens re-query on focus.
 *
 * Reading the source is weaker than running it. What it catches is the change that would actually
 * break them — a «Відновити» wired straight to the file, or a screen that stops asking storage —
 * and it catches it in `verify` rather than on a device. The technique, and the reason it lives
 * here and not under `src/app/`, are `notifications-screen.test.ts`'s.
 */
const screenSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const section = screenSource('../app/manage/backup.tsx');
const accountsTab = screenSource('../app/(tabs)/accounts.tsx');

describe('the «Бекап» screen', () => {
  it('Scenario: The section opens on its two actions and its warning', () => {
    expect(section).toContain('title="Зберегти у файл"');
    expect(section).toContain('title="Відновити з файлу"');
    // The words themselves are constants proven above, shown here rather than retyped — two
    // copies would be two promises with only one of them under test.
    expect(section).toContain('{BACKUP_EXPLANATION}');
    expect(section).toContain('{RESTORE_WARNING}');
  });

  it('holds no decision of its own — it calls the tested logic', () => {
    for (const call of ['saveToFile(', 'pickForRestore(', 'confirmRestore(']) {
      expect(section).toContain(call);
    }
    // Nothing here reads or judges a file: the format is `src/backup/`'s and no one else's.
    for (const smuggled of ['readBackup', 'makeBackup', 'JSON.parse']) {
      expect(section).not.toContain(smuggled);
    }
  });

  it('restores only what the preview described', () => {
    // `confirmRestore` takes the preview — the бекап already read and already shown — so there is
    // no path from a picked file to a replacement that skips the numbers on the screen.
    expect(section).toContain('confirmRestore(PORTS, preview)');
    expect(section).toContain("if (state.kind !== 'previewing') return;");
  });

  it('Scenario: A successful restore is reported and visible', () => {
    // The screen says what came back…
    expect(section).toContain('{message}');
    // …and «Рахунки» shows the бекап's рахунки because it re-queries storage on focus, which is
    // what makes a restore visible everywhere without any screen being told about it.
    expect(accountsTab).toContain('useReloadOnFocus(');
  });

  it('lets the phone`s own «назад» close the preview before it leaves', () => {
    expect(section).toContain("import { useCloseOnBack } from '@/hooks/use-close-on-back';");
    expect(section).toContain("useCloseOnBack(state.kind === 'previewing', closePreview)");
    expect(section).toContain('title="Скасувати" variant="secondary" onPress={closePreview}');
    expect(section).not.toContain('BackHandler');
  });
});
