import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

import { JOURNAL_LIMIT, type JournalEntry, type JournalKind } from '../reporting/journal';
import type {
  BugReport,
  BuildInfo,
  DeviceInfo,
  ReportCounts,
  ReportScreenshot,
} from '../reporting/report';
import {
  accounts,
  bugReportScreenshots,
  bugReports,
  categories,
  journal,
  notificationDrafts,
  rules,
  transactions,
  type BugReportRow,
  type JournalRow,
} from './schema';
import type { Storage } from './storage';

/**
 * The журнал and the репорти про помилки in storage.
 *
 * Nothing here computes anything: the bound is a `DELETE`, the репорт is written whole and read
 * back whole, and every rule about *what* may be recorded lives one level up, in
 * `src/reporting/journal.ts`, where a type with no field for a сума enforces it.
 *
 * **Insertion order is the order.** The bound and the reading both sort by `at` and then by
 * SQLite's own `rowid`, because `at` is a millisecond and two entries can land in one — the crash
 * fallback writes its `screen` entry and its `crash` entry in a single tick. Without the tie-break
 * «the oldest is gone» would be a coin toss over exactly the pair that matters. `rowid` is a total
 * order here for free: the table is append-only, and the prune only ever deletes the *lowest*
 * rowids, so the maximum keeps climbing and nothing is ever reused (design D5).
 *
 * A репорт is self-contained by construction. Its журнал, its prompting entry, its build, device
 * and counts are stored as JSON at creation, not as references — the live журнал keeps rolling,
 * and a репорт that pointed into it would in time forget the very crash it was filed about. So
 * there is deliberately no foreign key from a репорт to `journal`, and reading one back never
 * touches that table.
 *
 * None of these three tables is in a бекап, and a відновлення leaves all three alone — see
 * `backup-repo.ts`, which names them among the untouched.
 */

const KINDS: readonly JournalKind[] = ['screen', 'failure', 'alert', 'crash'];

function checkKind(kind: string): JournalKind {
  // The enumeration is `src/reporting/journal.ts`'s, where the label and the rendering already
  // are. Refused here rather than by a CHECK, which is the trade `alerts` makes for the same
  // reason: committed migrations are immutable, and a fifth kind should not cost one.
  if (!KINDS.includes(kind as JournalKind)) {
    throw new Error(`«${kind}» is not a journal kind`);
  }
  return kind as JournalKind;
}

function toEntry(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    at: row.at,
    kind: checkKind(row.kind),
    name: row.name,
    // Absent, never `null`: an entry that never had a detail and one whose detail was cleared are
    // the same entry, and what is read back has to equal what was written.
    ...(row.detail === null ? {} : { detail: row.detail }),
  };
}

/**
 * Parsed back with a cast rather than validated field by field.
 *
 * The only writer of these columns is `create` below, three lines up from here, and the only
 * reader is the rendering. A schema-validator between two functions in one file would be
 * ceremony; a репорт whose JSON is corrupt is a repro that has already failed, and it fails
 * loudly at the parse rather than quietly with a plausible wrong answer.
 */
function parse<T>(text: string): T {
  return JSON.parse(text) as T;
}

function toReport(row: BugReportRow, screenshots: readonly ReportScreenshot[]): BugReport {
  return {
    id: row.id,
    createdAt: row.createdAt,
    did: row.did,
    happened: row.happened,
    expected: row.expected,
    route: row.route,
    build: parse<BuildInfo>(row.buildJson),
    device: parse<DeviceInfo>(row.deviceJson),
    migrationsApplied: row.migrationsApplied,
    counts: parse<ReportCounts>(row.countsJson),
    // The instants inside the JSON are epoch milliseconds; `Date` is what the rendering takes.
    journal: parse<readonly (Omit<JournalEntry, 'at'> & { at: number })[]>(row.journalJson).map(
      (entry) => ({ ...entry, at: new Date(entry.at) }),
    ),
    prompting:
      row.promptingJson === null
        ? null
        : (() => {
            const entry = parse<Omit<JournalEntry, 'at'> & { at: number }>(row.promptingJson);
            return { ...entry, at: new Date(entry.at) };
          })(),
    screenshots,
    handedOverAt: row.handedOverAt,
  };
}

/** An entry as it travels inside a репорт: the same shape, with the instant as a number. */
function serialisable(entry: JournalEntry) {
  return { ...entry, at: entry.at.getTime() };
}

/** What the репорт's screen and the list ask for. `create` takes the rest as values. */
export type NewBugReport = Omit<BugReport, 'screenshots' | 'handedOverAt'>;

export function reportingRepo(db: Storage) {
  const screenshotsOf = (reportId: string): ReportScreenshot[] =>
    db
      .select()
      .from(bugReportScreenshots)
      .where(eq(bugReportScreenshots.reportId, reportId))
      .orderBy(asc(bugReportScreenshots.addedAt), asc(bugReportScreenshots.name))
      .all()
      .map((row) => ({ name: row.name, addedAt: row.addedAt }));

  return {
    /**
     * Appends one entry and prunes back to 500 in the same pair of statements.
     *
     * The prune is here and not at the call site so the singleton in `src/ui/journal.ts` has one
     * call to make and cannot forget the second half. `rowid NOT IN (the newest 500)` rather than
     * `OFFSET 500`: the same total order the reading uses, expressed once.
     */
    append(entry: JournalEntry): void {
      db.insert(journal)
        .values({
          id: entry.id,
          at: entry.at,
          kind: checkKind(entry.kind),
          name: entry.name,
          detail: entry.detail ?? null,
        })
        .run();
      db.run(
        sql`DELETE FROM ${journal} WHERE rowid NOT IN (
              SELECT rowid FROM ${journal} ORDER BY ${journal.at} DESC, rowid DESC LIMIT ${JOURNAL_LIMIT}
            )`,
      );
    },

    /** The whole журнал, oldest first — 500 rows at most, so there is nothing to page. */
    tail(): JournalEntry[] {
      return db
        .select()
        .from(journal)
        .orderBy(asc(journal.at), asc(sql`rowid`))
        .all()
        .map(toEntry);
    },

    /**
     * One entry by id, or `null` when the pruning has already taken it.
     *
     * Read exactly once, when a репорт is created from a failure dialog: after that the entry is
     * copied into the репорт and the live журнал is free to roll past it.
     */
    byId(id: string): JournalEntry | null {
      const row = db.select().from(journal).where(eq(journal.id, id)).all()[0];
      return row === undefined ? null : toEntry(row);
    },

    /** Stores a репорт whole. Everything it attaches is frozen here and never re-read. */
    create(report: NewBugReport): void {
      db.insert(bugReports)
        .values({
          id: report.id,
          createdAt: report.createdAt,
          route: report.route,
          did: report.did,
          happened: report.happened,
          expected: report.expected,
          promptingJson:
            report.prompting === null ? null : JSON.stringify(serialisable(report.prompting)),
          buildJson: JSON.stringify(report.build),
          deviceJson: JSON.stringify(report.device),
          countsJson: JSON.stringify(report.counts),
          journalJson: JSON.stringify(report.journal.map(serialisable)),
          migrationsApplied: report.migrationsApplied,
          handedOverAt: null,
        })
        .run();
    },

    get(id: string): BugReport | null {
      const row = db.select().from(bugReports).where(eq(bugReports.id, id)).all()[0];
      return row === undefined ? null : toReport(row, screenshotsOf(id));
    },

    /** Every репорт, newest first — the order the section lists them in. */
    list(): BugReport[] {
      return db
        .select()
        .from(bugReports)
        .orderBy(desc(bugReports.createdAt), desc(bugReports.id))
        .all()
        .map((row) => toReport(row, screenshotsOf(row.id)));
    },

    /** Removes a репорт; its screenshot rows go with it by the cascade. */
    remove(id: string): void {
      db.delete(bugReports).where(eq(bugReports.id, id)).run();
    },

    addScreenshot(reportId: string, name: string, addedAt: Date): void {
      db.insert(bugReportScreenshots).values({ reportId, name, addedAt }).run();
    },

    removeScreenshot(reportId: string, name: string): void {
      db.delete(bugReportScreenshots)
        .where(
          and(eq(bugReportScreenshots.reportId, reportId), eq(bugReportScreenshots.name, name)),
        )
        .run();
    },

    /**
     * How much of each thing the phone holds — numbers only, never the things themselves.
     *
     * Counted in SQL rather than by loading and measuring: a phone with two thousand транзакції is
     * exactly the phone whose bug is worth reporting, and reading them all to learn their number
     * would be the one slow thing on a screen that is otherwise instant.
     */
    counts(): ReportCounts {
      // `db.get` with a raw count, the way `transactions-repo.ts` counts uncategorised витрати —
      // a projection through the query builder is not callable across the two drivers `Storage`
      // unions.
      const count = (table: SQLiteTable): number =>
        db.get<{ n: number }>(sql`select count(*) as n from ${table}`)?.n ?? 0;
      return {
        accounts: count(accounts),
        transactions: count(transactions),
        categories: count(categories),
        rules: count(rules),
        drafts: count(notificationDrafts),
      };
    },

    /**
     * How many migrations this database has actually had applied — asked of the migrator's own
     * table, not of the committed list.
     *
     * The two are the same number on a healthy phone, since the app applies every committed
     * migration before it draws anything. A репорт where they differ is a репорт about exactly the
     * kind of bug this whole capability exists to catch, so it is worth asking honestly. A table
     * that is not there at all answers `0` rather than throwing: the fallback is drawn when things
     * are already wrong.
     */
    migrationsApplied(): number {
      try {
        return db.get<{ n: number }>(sql`select count(*) as n from __drizzle_migrations`)?.n ?? 0;
      } catch {
        return 0;
      }
    },

    /**
     * Marks the moment the file was handed to the phone's chooser.
     *
     * The first hand-over is the one that counts: what the owner did in the chooser is unknowable
     * either way, so a second one says nothing new, and the репорт records when it first left
     * rather than when it was last touched.
     */
    markHandedOver(id: string, at: Date): void {
      db.update(bugReports)
        .set({ handedOverAt: at })
        .where(and(eq(bugReports.id, id), sql`${bugReports.handedOverAt} IS NULL`))
        .run();
    },
  };
}

export type ReportingRepo = ReturnType<typeof reportingRepo>;
