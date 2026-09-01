import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AlertKind } from '../reminders/notices';
import { remindersRepo } from './reminders-repo';
import { openFileDb, openTestDb, type TestStorage } from './test-db';

const raisedAt = new Date('2026-08-28T08:00:00.000Z');
const later = new Date('2026-08-28T09:30:00.000Z');

describe('the нагадування and the сповіщення, across a restart', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-reminders-'));
    path = join(dir, 'cap1tal.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** A new connection to the same file — the closest a test gets to launching the app again. */
  function reopened<T>(inspect: (storage: TestStorage) => T): T {
    const storage = openFileDb(path);
    try {
      return inspect(storage);
    } finally {
      storage.close();
    }
  }

  it('Scenario: The setting round-trips', () => {
    reopened((storage) => {
      remindersRepo(storage.db).setPreference({ enabled: true, time: { hour: 9, minute: 30 } });
    });

    expect(reopened((storage) => remindersRepo(storage.db).preference())).toEqual({
      enabled: true,
      time: { hour: 9, minute: 30 },
    });
  });

  it('Scenario: A device never asked loads as off', () => {
    // Off, and with no time claimed to be the owner's: 21:00 is a suggestion the section makes,
    // not something the device has ever been told.
    expect(reopened((storage) => remindersRepo(storage.db).preference())).toEqual({
      enabled: false,
    });
    expect(reopened((storage) => remindersRepo(storage.db).preference().time)).toBeUndefined();
  });

  it('Scenario: Changing the setting leaves one setting', () => {
    reopened((storage) => {
      const repo = remindersRepo(storage.db);
      repo.setPreference({ enabled: true, time: { hour: 21, minute: 0 } });
      repo.setPreference({ enabled: true, time: { hour: 9, minute: 30 } });
    });

    expect(reopened((storage) => remindersRepo(storage.db).preference())).toEqual({
      enabled: true,
      time: { hour: 9, minute: 30 },
    });
    // One row, not two settings that disagree — the single-row CHECK and the primary key.
    expect(reopened((storage) => storage.db.all('SELECT * FROM daily_reminder'))).toHaveLength(1);
  });

  it('keeps the time when the нагадування is turned off, so turning it on offers it again', () => {
    reopened((storage) => {
      const repo = remindersRepo(storage.db);
      repo.setPreference({ enabled: true, time: { hour: 9, minute: 30 } });
      repo.setPreference({ enabled: false, time: { hour: 9, minute: 30 } });
    });

    expect(reopened((storage) => remindersRepo(storage.db).preference())).toEqual({
      enabled: false,
      time: { hour: 9, minute: 30 },
    });
  });

  it('Scenario: An outstanding failure round-trips', () => {
    reopened((storage) => {
      remindersRepo(storage.db).raise('monobank-sync', raisedAt);
    });

    expect(reopened((storage) => remindersRepo(storage.db).outstanding())).toEqual([
      { kind: 'monobank-sync', raisedAt },
    ]);
  });

  it('Scenario: Raising the same action twice stores one', () => {
    reopened((storage) => {
      const repo = remindersRepo(storage.db);
      repo.raise('collection', raisedAt);
      repo.raise('collection', later);
    });

    // One row, carrying the moment the owner first stopped being told the truth — not the last
    // time the app noticed the same silence.
    expect(reopened((storage) => remindersRepo(storage.db).outstanding())).toEqual([
      { kind: 'collection', raisedAt },
    ]);
  });

  it('Scenario: Clearing one leaves the others', () => {
    reopened((storage) => {
      const repo = remindersRepo(storage.db);
      repo.raise('collection', raisedAt);
      repo.raise('monobank-sync', raisedAt);
      repo.clear('collection');
    });

    expect(reopened((storage) => remindersRepo(storage.db).outstandingKinds())).toEqual([
      'monobank-sync',
    ]);
  });
});

describe('the reminders repository', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
  });

  afterEach(() => {
    storage.close();
  });

  it('clears a kind that was never outstanding without complaint', () => {
    // Both callers are unconditional — the work succeeding, and the owner opening the screen —
    // so «нічого не було» has to be an ordinary outcome (design D6).
    expect(() => remindersRepo(storage.db).clear('backup')).not.toThrow();
    expect(remindersRepo(storage.db).outstanding()).toEqual([]);
  });

  it('refuses a kind `notices.ts` does not name', () => {
    const repo = remindersRepo(storage.db);
    // SQL takes any string here on purpose (design D7); this is the guard that replaces the CHECK
    // a growing enumeration could not afford. A kind with no notice could be raised and then
    // never posted, cleared or explained.
    for (const kind of ['drive-backup', 'reminder', '', 'COLLECTION']) {
      expect(() => repo.raise(kind as AlertKind, raisedAt), kind).toThrow(/alert kind/);
      expect(() => repo.clear(kind as AlertKind), kind).toThrow(/alert kind/);
    }
    expect(repo.outstanding()).toEqual([]);
  });

  it('refuses to read a row whose kind is no longer one', () => {
    // A row written by a newer build and read by an older one: refused loudly rather than routed
    // to a screen that does not exist.
    storage.db.run("INSERT INTO alerts (kind, raised_at) VALUES ('drive-backup', 0)");
    expect(() => remindersRepo(storage.db).outstanding()).toThrow(/alert kind/);
  });

  it('lists every kind that stands, in a stable order', () => {
    const repo = remindersRepo(storage.db);
    repo.raise('monobank-sync', raisedAt);
    repo.raise('collection', later);
    repo.raise('backup', later);

    expect(repo.outstandingKinds()).toEqual(['backup', 'collection', 'monobank-sync']);
  });
});
