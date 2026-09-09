import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { JournalEntry } from '../reporting/journal';
import {
  journalAppState,
  journalPermission,
  resetDeviceJournalForTests,
  NOTIFICATION_ACCESS,
  NOTIFICATION_LISTENER,
} from './device-journal';
import { bindTestJournal, resetJournalForTests } from './journal';

/**
 * What the device does to the app, decided here rather than in an adapter.
 *
 * `src/platform/*-device.ts` is never loaded under `verify`, so these rules are proven against
 * synthetic facts and the adapters are held to calling them by reading their source — the same
 * shape `screens.test.ts` uses to hold a `.tsx` to the logic it must not reimplement.
 */

const accessDevice = readFileSync(
  new URL('../platform/notification-access-device.ts', import.meta.url),
  'utf8',
);
const captureDevice = readFileSync(
  new URL('../platform/notification-capture-device.ts', import.meta.url),
  'utf8',
);
const layout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');

describe('the device half of the журнал', () => {
  let journalOf: () => readonly JournalEntry[];

  beforeEach(() => {
    resetDeviceJournalForTests();
    journalOf = bindTestJournal();
  });

  afterEach(() => {
    resetDeviceJournalForTests();
    resetJournalForTests();
  });

  describe('a permission the app depends on', () => {
    it('Scenario: A withdrawn permission is an entry', () => {
      journalPermission(NOTIFICATION_ACCESS, 'granted');
      journalPermission(NOTIFICATION_ACCESS, 'denied');

      expect(journalOf().map((e) => [e.kind, e.name, e.detail])).toEqual([
        ['native', NOTIFICATION_ACCESS, 'granted'],
        ['native', NOTIFICATION_ACCESS, 'denied'],
      ]);
    });

    it("Scenario: The listener's connection is an entry", () => {
      journalPermission(NOTIFICATION_LISTENER, 'disconnected');

      expect(journalOf().map((e) => [e.kind, e.name, e.detail])).toEqual([
        ['native', NOTIFICATION_LISTENER, 'disconnected'],
      ]);
    });

    it('Scenario: A permission that has not changed adds nothing', () => {
      // What every foreground and every visit to «Сповіщення банків» does.
      const wrote = [1, 2, 3, 4].map(() => journalPermission(NOTIFICATION_ACCESS, 'granted'));

      expect(wrote).toEqual([true, false, false, false]);
      expect(journalOf()).toHaveLength(1);
    });

    it('keeps the two permissions apart, so one changing does not silence the other', () => {
      journalPermission(NOTIFICATION_ACCESS, 'granted');
      journalPermission(NOTIFICATION_LISTENER, 'connected');
      journalPermission(NOTIFICATION_ACCESS, 'granted');
      journalPermission(NOTIFICATION_LISTENER, 'disconnected');

      expect(journalOf().map((e) => [e.name, e.detail])).toEqual([
        [NOTIFICATION_ACCESS, 'granted'],
        [NOTIFICATION_LISTENER, 'connected'],
        [NOTIFICATION_LISTENER, 'disconnected'],
      ]);
    });

    it('is the only place the two adapters decide anything about it', () => {
      expect(accessDevice).toContain('journalPermission(NOTIFICATION_ACCESS');
      expect(captureDevice).toContain("journalPermission(NOTIFICATION_LISTENER, 'connected')");
      expect(captureDevice).toContain("journalPermission(NOTIFICATION_LISTENER, 'disconnected')");
      // Neither reaches for the журнал itself: a decision written there would be one `verify`
      // never runs.
      for (const adapter of [accessDevice, captureDevice]) {
        expect(adapter).not.toContain("journal.record(");
      }
    });
  });

  describe('the app leaving and coming back', () => {
    it('Scenario: Leaving and returning are entries', () => {
      // The app mounts in the foreground, so `active` first is not a move.
      const wrote = ['active', 'background', 'background', 'active'].map(journalAppState);

      expect(wrote).toEqual([false, true, false, true]);
      expect(journalOf().map((e) => [e.kind, e.name, e.detail])).toEqual([
        ['native', 'app-state', 'background'],
        ['native', 'app-state', 'active'],
      ]);
    });

    it("writes the device's own word for a state that is neither, and only once", () => {
      journalAppState('inactive');
      // Android passes through `inactive` on its way to `background`: one move, one entry.
      journalAppState('background');

      expect(journalOf().map((e) => e.detail)).toEqual(['inactive']);
    });

    it('is what the root layout calls, and the layout decides nothing itself', () => {
      expect(layout).toContain("import { journalAppState } from '@/ui/device-journal';");
      expect(layout).toContain('journalAppState(state);');
    });
  });
});
