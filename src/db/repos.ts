import { accountsRepo } from './accounts-repo';
import { db } from './client';
import { transactionsRepo } from './transactions-repo';

/**
 * The repositories the screens use, over the one device database. Screens hold no state of their
 * own beyond the form they are showing: they re-query on focus and after their own writes, which
 * synchronous SQLite makes trivial. See design.md §6.
 */
export const accounts = accountsRepo(db);
export const transactions = transactionsRepo(db);
