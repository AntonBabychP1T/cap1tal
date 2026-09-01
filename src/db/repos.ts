import { accountsRepo } from './accounts-repo';
import { backupRepo } from './backup-repo';
import { categoriesRepo } from './categories-repo';
import { db } from './client';
import { entryDefaultsRepo } from './entry-defaults-repo';
import { goalsRepo } from './goals-repo';
import { importRepo } from './import-repo';
import { limitsRepo } from './limits-repo';
import { monobankRepo } from './monobank-repo';
import { notificationsRepo } from './notifications-repo';
import { ratesRepo } from './rates-repo';
import { remindersRepo } from './reminders-repo';
import { rulesRepo } from './rules-repo';
import { sourcesRepo } from './sources-repo';
import { transactionsRepo } from './transactions-repo';

/**
 * The repositories the screens use, over the one device database. Screens hold no state of their
 * own beyond the form they are showing: they re-query on focus and after their own writes, which
 * synchronous SQLite makes trivial. See design.md §6.
 */
export const accounts = accountsRepo(db);
export const transactions = transactionsRepo(db);
/** The monobank rate cache — read for the approximate UAH figure, written when it is refreshed. */
export const rates = ratesRepo(db);
/** The owner's editable lists and the правила автокатегоризації — seeded on open, see ./seed.ts. */
export const categories = categoriesRepo(db);
export const sources = sourcesRepo(db);
export const rules = rulesRepo(db);
/** The one-time Saldo import: the marker, and the atomic commit of a plan. */
export const imports = importRepo(db);
/** monobank's own side: the accounts a token showed, their links, cursors and imported ids. */
export const monobank = monobankRepo(db);
/** The ліміти categories carry, and the цілі — what the owner wants, beside what already is. */
export const limits = limitsRepo(db);
export const goals = goalsRepo(db);
/** What bank notifications have come to: the watched apps, the fingerprints, the чернетки. */
export const notifications = notificationsRepo(db);
/** The whole state as one snapshot, and the atomic replacement a відновлення is. */
export const backup = backupRepo(db);
/** The daily нагадування's setting, and the сповіщення про збій still outstanding. */
export const reminders = remindersRepo(db);
/** The рахунок the entry form opens on — written by Головний's hand-entry path and nothing else. */
export const entryDefaults = entryDefaultsRepo(db);
