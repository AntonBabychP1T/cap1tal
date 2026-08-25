import { accountsRepo } from './accounts-repo';
import { categoriesRepo } from './categories-repo';
import { db } from './client';
import { importRepo } from './import-repo';
import { ratesRepo } from './rates-repo';
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
