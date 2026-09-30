import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hapticsPreferenceRepo } from './haptics-preference-repo';
import { hapticsPreference } from './schema';
import { openFileDb, openTestDb, type TestStorage } from './test-db';

describe('the «Вібрація» preference', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: Vibration is on from the start', () => {
    expect(storage.db.select().from(hapticsPreference).all()).toEqual([]);
    expect(hapticsPreferenceRepo(storage.db).enabled()).toBe(true);
  });

  it('Scenario: The switch is on by default', () => {
    // What the switch shows is what the repository answers for a phone that never touched it.
    expect(hapticsPreferenceRepo(storage.db).enabled()).toBe(true);
  });

  it('keeps one row whatever is written', () => {
    const repo = hapticsPreferenceRepo(storage.db);
    repo.set(false);
    repo.set(true);
    repo.set(false);
    expect(storage.db.select().from(hapticsPreference).all()).toEqual([{ id: 'haptics', enabled: false }]);
  });

  it('answers a write at once, though it reads from memory between writes', () => {
    const repo = hapticsPreferenceRepo(storage.db);
    expect(repo.enabled()).toBe(true);
    repo.set(false);
    expect(repo.enabled()).toBe(false);
    // A write that did not go through this repository — a restore — is seen as well.
    storage.db.delete(hapticsPreference).run();
    expect(repo.enabled()).toBe(true);
  });
});

describe('the «Вібрація» preference across a restart', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'haptics-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('Scenario: Turning vibration off is kept', () => {
    const file = join(dir, 'cap1tal.db');
    const first = openFileDb(file);
    hapticsPreferenceRepo(first.db).set(false);
    first.close();

    // A fresh repository over the same file — the app started again.
    const second = openFileDb(file);
    expect(hapticsPreferenceRepo(second.db).enabled()).toBe(false);
    hapticsPreferenceRepo(second.db).set(true);
    second.close();

    const third = openFileDb(file);
    expect(hapticsPreferenceRepo(third.db).enabled()).toBe(true);
    third.close();
  });
});
