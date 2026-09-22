import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { defaultDashboardLayout, setWidgetVisibility } from '../dashboard/layout';
import { dashboardLayoutRepo } from './dashboard-layout-repo';
import { dashboardLayout } from './schema';
import { openFileDb, openTestDb, type TestStorage } from './test-db';

describe('the owner`s dashboard layout', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: Fresh install uses the four-widget default (no row)', () => {
    const result = dashboardLayoutRepo(storage.db).read();
    expect(result.diagnostic).toBeUndefined();
    expect(result.items).toEqual(defaultDashboardLayout());
  });

  it('normalizes on save: exactly one row, one entry per known widget', () => {
    const repo = dashboardLayoutRepo(storage.db);
    const customised = setWidgetVisibility(defaultDashboardLayout(), 'progress', true);

    repo.save(customised);
    repo.save(customised);

    const rows = storage.db.select().from(dashboardLayout).all();
    expect(rows).toHaveLength(1);
    const read = repo.read();
    expect(read.items).toHaveLength(5);
    expect(new Set(read.items.map((i) => i.id)).size).toBe(5);
    expect(read.items.find((i) => i.id === 'progress')!.visible).toBe(true);
  });

  it('Scenario: A future or damaged preference falls back safely (malformed JSON on disk)', () => {
    storage.db
      .insert(dashboardLayout)
      .values({ id: 'home', schemaVersion: 1, itemsJson: 'not json at all {' })
      .run();

    const result = dashboardLayoutRepo(storage.db).read();
    expect(result.diagnostic).toBe('malformed');
    expect(result.items).toEqual(defaultDashboardLayout());
  });

  it('Scenario: A future or damaged preference falls back safely (future schema version on disk)', () => {
    storage.db
      .insert(dashboardLayout)
      .values({ id: 'home', schemaVersion: 999, itemsJson: JSON.stringify([]) })
      .run();

    const result = dashboardLayoutRepo(storage.db).read();
    expect(result.diagnostic).toBe('future-version');
    expect(result.items).toEqual(defaultDashboardLayout());
  });

  it('Scenario: Reset restores the current default', () => {
    const repo = dashboardLayoutRepo(storage.db);
    repo.save(setWidgetVisibility(defaultDashboardLayout(), 'top-categories', false));
    expect(repo.read().items.find((i) => i.id === 'top-categories')!.visible).toBe(false);

    repo.reset();

    expect(storage.db.select().from(dashboardLayout).all()).toHaveLength(0);
    expect(repo.read()).toEqual({ items: defaultDashboardLayout() });
  });

  it('a constraint violation on a direct write leaves the previous preference unchanged', () => {
    const repo = dashboardLayoutRepo(storage.db);
    const customised = setWidgetVisibility(defaultDashboardLayout(), 'net-worth', false);
    repo.save(customised);

    // No application path can produce this row — `save` always writes the current, positive
    // version — but the CHECK exists precisely so a bad write cannot slip past it and corrupt the
    // one row this table ever holds.
    expect(() =>
      storage.db
        .insert(dashboardLayout)
        .values({ id: 'home', schemaVersion: 0, itemsJson: '[]' })
        .onConflictDoUpdate({
          target: dashboardLayout.id,
          set: { schemaVersion: 0, itemsJson: '[]' },
        })
        .run(),
    ).toThrow();

    expect(repo.read().items).toEqual(customised);
  });

  it('a reset that is never called leaves the customised preference exactly as it was', () => {
    // The persistence half of "Cancelled reset changes nothing": the UI simply does not call
    // `reset()` when the owner cancels the confirmation, so storage never hears about it.
    const repo = dashboardLayoutRepo(storage.db);
    const customised = setWidgetVisibility(defaultDashboardLayout(), 'progress', true);
    repo.save(customised);

    expect(repo.read().items).toEqual(customised);
  });
});

describe('the dashboard layout, across a restart', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-dashboard-layout-'));
    path = join(dir, 'cap1tal.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('Scenario: A widget is hidden and the choice survives restart', () => {
    const first = openFileDb(path);
    const hidden = setWidgetVisibility(defaultDashboardLayout(), 'top-categories', false);
    dashboardLayoutRepo(first.db).save(hidden);
    first.close();

    const reopened = openFileDb(path);
    try {
      const read = dashboardLayoutRepo(reopened.db).read();
      expect(read.items).toEqual(hidden);
      expect(read.items.find((i) => i.id === 'top-categories')!.visible).toBe(false);
    } finally {
      reopened.close();
    }
  });
});
