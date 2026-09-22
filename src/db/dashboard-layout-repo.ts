import { eq } from 'drizzle-orm';

import {
  defaultDashboardLayout,
  normalizeDashboardLayout,
  toStoredDashboardLayout,
  type DashboardLayoutDiagnostic,
  type DashboardLayoutItem,
} from '../dashboard/layout';
import { dashboardLayout } from './schema';
import type { Storage } from './storage';

/**
 * The owner's dashboard layout: which of Головний's known widgets show, and in what order.
 *
 * Storage holds the untyped `items_json` and its own `schema_version`; every read runs through
 * `normalizeDashboardLayout` (design D2/D3), so a caller here never sees a malformed, duplicated,
 * unknown or future row — only a normalized layout, and which of those repairs it needed, if any.
 */

export interface DashboardLayoutRead {
  readonly items: readonly DashboardLayoutItem[];
  /** Present only when the stored row could not be used as saved. */
  readonly diagnostic?: DashboardLayoutDiagnostic;
}

export function dashboardLayoutRepo(db: Storage) {
  return {
    /**
     * No row reads as the current default with no diagnostic — the ordinary state of a fresh
     * install and of a device that has been reset. A row this app cannot use falls back the same
     * way, but says so, for the editor to report as a recoverable storage diagnostic.
     */
    read(): DashboardLayoutRead {
      const row = db.select().from(dashboardLayout).all()[0];
      if (!row) {
        return { items: defaultDashboardLayout() };
      }
      let items: unknown;
      try {
        items = JSON.parse(row.itemsJson);
      } catch {
        return { items: defaultDashboardLayout(), diagnostic: 'malformed' };
      }
      return normalizeDashboardLayout({ version: row.schemaVersion, items });
    },

    /**
     * Replaces the whole preference in one upsert, normalized first — so a caller can never write
     * a duplicate, an id this app does not know, or a payload under a version other than the
     * current one, no matter what it hands in.
     */
    save(items: readonly DashboardLayoutItem[]): void {
      const normalized = normalizeDashboardLayout(toStoredDashboardLayout(items)).items;
      const stored = toStoredDashboardLayout(normalized);
      db.insert(dashboardLayout)
        .values({ id: 'home', schemaVersion: stored.version, itemsJson: JSON.stringify(stored.items) })
        .onConflictDoUpdate({
          target: dashboardLayout.id,
          set: { schemaVersion: stored.version, itemsJson: JSON.stringify(stored.items) },
        })
        .run();
    },

    /**
     * Deletes the `'home'` row and only it. Absence is the durable meaning of "follow this
     * installed version's current default" (design D2), so reset needs no write of its own — the
     * very next `read()` already answers with today's default.
     */
    reset(): void {
      db.delete(dashboardLayout).where(eq(dashboardLayout.id, 'home')).run();
    },
  };
}

export type DashboardLayoutRepo = ReturnType<typeof dashboardLayoutRepo>;
