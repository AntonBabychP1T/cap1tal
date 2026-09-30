import { hapticsPreference } from './schema';
import { stampedMemo } from './stamp';
import type { Storage } from './storage';

/**
 * The «Вібрація» switch (motion, "The owner can turn vibration off"; app-motion-pass design D14).
 * No row reads as on — a fresh install and a restored бекап that carried none both vibrate.
 *
 * `read()` is asked on every haptic the app plays, so it answers from memory between writes
 * (`stampedMemo`): any write to storage — the switch, a restore, anything else — makes the next read
 * fresh, so a restored preference governs the very next action with no restart.
 */
export function hapticsPreferenceRepo(db: Storage) {
  const read = stampedMemo(db, (): boolean => {
    const row = db.select().from(hapticsPreference).all()[0];
    return row ? row.enabled : true;
  });

  return {
    /** Whether haptics play. */
    enabled(): boolean {
      return read();
    },

    /** Stores the owner's choice, replacing the one before it. */
    set(enabled: boolean): void {
      db.insert(hapticsPreference)
        .values({ id: 'haptics', enabled })
        .onConflictDoUpdate({ target: hapticsPreference.id, set: { enabled } })
        .run();
    },
  };
}

export type HapticsPreferenceRepo = ReturnType<typeof hapticsPreferenceRepo>;
