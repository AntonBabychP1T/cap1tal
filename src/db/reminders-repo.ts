import { asc, eq } from 'drizzle-orm';

import { isAlertKind, type AlertKind } from '../reminders/notices';
import { NO_REMINDER, type ReminderPreference } from '../reminders/schedule';
import { alerts, dailyReminder } from './schema';
import type { Storage } from './storage';

/**
 * The two things about the app's own notifications that must survive a restart: whether the daily
 * нагадування is on and the time the owner set it for, and which сповіщення про збій are still
 * outstanding.
 *
 * Both are deliberately small. The preference is one row, so «changing it leaves one setting» is
 * the primary key rather than a delete-and-insert; the outstanding сповіщення are one row per
 * action, so «одна невдача — одне сповіщення» is the primary key too, and raising one that already
 * stands is a write that does nothing rather than a query the caller has to remember to make.
 *
 * Nothing about the failure itself is stored — see `schema.ts` on the `alerts` table. The kind and
 * the moment is the whole row, and a kind `src/reminders/notices.ts` does not name is refused here
 * rather than by SQL, which is the trade design D7 makes for keeping migrations immutable.
 */

/** One сповіщення still standing: which action, and when it was first raised. */
export interface OutstandingAlert {
  readonly kind: AlertKind;
  readonly raisedAt: Date;
}

function checkKind(kind: string): AlertKind {
  if (!isAlertKind(kind)) {
    // The enumeration is `notices.ts`'s, where the words and the route already are. A kind with no
    // notice could be raised and never posted, cleared or explained — a row about nothing.
    throw new Error(`«${kind}» is not an alert kind`);
  }
  return kind;
}

export function remindersRepo(db: Storage) {
  /** Every сповіщення still standing, oldest kind first for a stable read. */
  const outstanding = (): OutstandingAlert[] =>
    db
      .select()
      .from(alerts)
      .orderBy(asc(alerts.kind))
      .all()
      .map((row) => ({ kind: checkKind(row.kind), raisedAt: row.raisedAt }));

  return {
    /**
     * The нагадування as the owner left it. No row means never asked: off, and with no time of
     * theirs — the section's 21:00 is a suggestion, and storage does not pretend it was an answer.
     */
    preference(): ReminderPreference {
      const row = db.select().from(dailyReminder).all()[0];
      if (!row) {
        return NO_REMINDER;
      }
      return { enabled: row.enabled, time: { hour: row.hour, minute: row.minute } };
    },

    /**
     * Stores the нагадування, replacing whatever was there. The time travels with the switch even
     * when it is being turned off, so turning it back on later offers the hour the owner chose
     * rather than the default all over again.
     */
    setPreference(preference: {
      readonly enabled: boolean;
      readonly time: { readonly hour: number; readonly minute: number };
    }): void {
      const row = {
        id: 'reminder',
        enabled: preference.enabled,
        hour: preference.time.hour,
        minute: preference.time.minute,
      };
      db.insert(dailyReminder)
        .values(row)
        .onConflictDoUpdate({
          target: dailyReminder.id,
          set: { enabled: row.enabled, hour: row.hour, minute: row.minute },
        })
        .run();
    },

    /** Every сповіщення про збій still standing, oldest kind first for a stable read. */
    outstanding,

    /**
     * Just the kinds — what `decideAlert` is asked about, without the moments it never reads.
     * Over the local function rather than over `this`, so a caller who holds the method alone
     * still gets an answer.
     */
    outstandingKinds(): AlertKind[] {
      return outstanding().map((alert) => alert.kind);
    },

    /**
     * Remembers that this action failed. Raising one that already stands writes nothing and keeps
     * the moment of the first raise: the second failure is the same silence as the first, and the
     * row says when the owner stopped being told the truth, not when we last checked.
     */
    raise(kind: AlertKind, raisedAt: Date): void {
      db.insert(alerts)
        .values({ kind: checkKind(kind), raisedAt })
        .onConflictDoNothing({ target: alerts.kind })
        .run();
    },

    /** Forgets one action's сповіщення and no other's. Idempotent, by kind only (design D6). */
    clear(kind: AlertKind): void {
      db.delete(alerts).where(eq(alerts.kind, checkKind(kind))).run();
    },
  };
}

export type RemindersRepo = ReturnType<typeof remindersRepo>;
