import { asc } from 'drizzle-orm';

import type { BackupStore } from '../backup/backup';
import type { BackupState } from '../backup/format';
import { money } from '../domain/money';
import { isoDate } from '../domain/transaction';
import { toAccount, toAccountRow, toTransaction, toTransactionRow } from './mappers';
import {
  accounts,
  categories,
  categoryLimits,
  dailyReminder,
  entryDefaults,
  fiscalReceipts,
  goals,
  monobankAccounts,
  monobankImportedItems,
  monobankLinks,
  notificationDrafts,
  notificationWatches,
  receiptItems,
  rules,
  saldoImport,
  sources,
  transactions as transactionsTable,
} from './schema';
import type { Storage } from './storage';

/**
 * The two things storage cannot do anywhere else: read everything the owner has as one snapshot,
 * and replace everything the owner has with one, as a single unit.
 *
 * It is the only repository that speaks about the whole database rather than one capability, which
 * is exactly why it exists here and not spread across the others — «what a бекап holds» is one
 * list, in one place, and `src/backup/format.ts` names the tables it covers so that adding a table
 * is a decision and not an omission.
 *
 * Five tables are deliberately outside both directions. The monobank rate cache is a cache. The
 * fingerprints of already-decided notifications reference nothing and must survive a restore, or a
 * notification the owner already answered would be drafted a second time. The outstanding
 * сповіщення про збій describe what *this* phone last failed at, not the owner's money, and stay
 * where they are through a restore for the same reason. The pending чернетки and the рахунок the
 * entry form remembers go the other way: they are deleted with the state they named, because each
 * references a рахунок of the world being replaced (design D7). And the monobank token is neither
 * read nor written by any line of this file — it lives in the device's secure storage and in
 * nothing this module can reach.
 */

export function backupRepo(db: Storage): BackupStore {
  return {
    /**
     * Everything stored, each row exactly once, in a total order — by id everywhere, so two reads
     * of one unchanged device produce the same бекап byte for byte and a checksum means something.
     */
    snapshot(): BackupState {
      const committed = db.select().from(saldoImport).all()[0];
      const reminder = db.select().from(dailyReminder).all()[0];
      return {
        accounts: db.select().from(accounts).orderBy(asc(accounts.id)).all().map(toAccount),
        categories: db
          .select()
          .from(categories)
          .orderBy(asc(categories.id))
          .all()
          .map((row) => ({ id: row.id, name: row.name, archived: row.archived })),
        sources: db
          .select()
          .from(sources)
          .orderBy(asc(sources.id))
          .all()
          .map((row) => ({ id: row.id, name: row.name, archived: row.archived })),
        rules: db
          .select()
          .from(rules)
          .orderBy(asc(rules.id))
          .all()
          .map((row) => ({
            id: row.id,
            // Absent, never `null`: a правило with no pattern and one whose pattern was cleared
            // are the same правило, and the бекап has to say so too.
            ...(row.merchant === null ? {} : { merchant: row.merchant }),
            ...(row.mcc === null ? {} : { mcc: row.mcc }),
            categoryId: row.categoryId,
            createdAtMs: row.createdAt.getTime(),
          })),
        limits: db
          .select()
          .from(categoryLimits)
          .orderBy(asc(categoryLimits.categoryId))
          .all()
          .map((row) => ({ categoryId: row.categoryId, amount: money(row.amount, row.currency) })),
        goals: db
          .select()
          .from(goals)
          .orderBy(asc(goals.id))
          .all()
          .map((row) => ({
            id: row.id,
            name: row.name,
            target: money(row.amount, row.currency),
            deadline: row.deadline,
            accountId: row.accountId,
          })),
        transactions: db
          .select()
          .from(transactionsTable)
          .orderBy(asc(transactionsTable.id))
          .all()
          .map((row) => ({
            transaction: toTransaction(row),
            storedAtMs: row.createdAt.getTime(),
          })),
        ...(committed ? { saldoImportCommittedAtMs: committed.committedAt.getTime() } : {}),
        monobankAccounts: db
          .select()
          .from(monobankAccounts)
          .orderBy(asc(monobankAccounts.id))
          .all()
          .map((row) => ({
            id: row.id,
            kind: row.kind === 'jar' ? ('jar' as const) : ('card' as const),
            name: row.name,
            currency: row.currency,
            bankBalance: money(row.bankBalanceAmount, row.currency),
            obtainedAtMs: row.obtainedAt.getTime(),
          })),
        monobankLinks: db
          .select()
          .from(monobankLinks)
          .orderBy(asc(monobankLinks.monobankAccountId))
          .all()
          .map((row) => ({
            monobankAccountId: row.monobankAccountId,
            accountId: row.accountId,
            syncStartDate: row.syncStartDate,
            cursorMs: row.cursorMs.getTime(),
            // Left out rather than written as null when a link has never synced, so a бекап of a
            // never-synced link is byte for byte the one an older app wrote.
            ...(row.lastSyncedAt === null ? {} : { lastSyncedAtMs: row.lastSyncedAt.getTime() }),
          })),
        monobankImportedItems: db
          .select()
          .from(monobankImportedItems)
          .orderBy(asc(monobankImportedItems.monobankAccountId), asc(monobankImportedItems.itemId))
          .all()
          .map((row) => ({ monobankAccountId: row.monobankAccountId, itemId: row.itemId })),
        watches: db
          .select()
          .from(notificationWatches)
          .orderBy(asc(notificationWatches.packageName))
          .all()
          .map((row) => ({ packageName: row.packageName, accountId: row.accountId })),
        // Every чек with its снапшот, and every позиція — by id, like everything else here, so
        // two reads of one unchanged device produce the same бекап byte for byte.
        receipts: db
          .select()
          .from(fiscalReceipts)
          .orderBy(asc(fiscalReceipts.id))
          .all()
          .map((row) => ({
            id: row.id,
            transactionId: row.transactionId,
            registrarNumber: row.registrarNumber,
            fiscalNumber: row.fiscalNumber,
            issuedDate: row.issuedDate,
            issuedTime: row.issuedTime,
            dialect: row.dialect === 'rro' ? ('rro' as const) : ('prro' as const),
            kind: row.kind === 'return' ? ('return' as const) : ('sale' as const),
            total: money(row.totalAmount, row.totalCurrency),
            // Absent, never `null`: what is read back has to equal what was written.
            ...(row.sellerName === null ? {} : { sellerName: row.sellerName }),
            ...(row.pointName === null ? {} : { pointName: row.pointName }),
            acquisition: 'qr_scan' as const,
            fetchedAtMs: row.fetchedAt.getTime(),
            snapshot: row.snapshot,
          })),
        receiptItems: db
          .select()
          .from(receiptItems)
          .orderBy(asc(receiptItems.id))
          .all()
          .map((row) => ({
            id: row.id,
            receiptId: row.receiptId,
            line: row.line,
            rawName: row.rawName,
            quantityThousandths: row.quantityThousandths,
            ...(row.unit === null ? {} : { unit: row.unit }),
            ...(row.unitPriceAmount === null || row.unitPriceCurrency === null
              ? {}
              : { unitPrice: money(row.unitPriceAmount, row.unitPriceCurrency) }),
            lineTotal: money(row.lineTotalAmount, row.lineTotalCurrency),
            ...(row.discountAmount === null || row.discountCurrency === null
              ? {}
              : { discount: money(row.discountAmount, row.discountCurrency) }),
            ...(row.barcode === null ? {} : { barcode: row.barcode }),
            ...(row.uktzed === null ? {} : { uktzed: row.uktzed }),
            ...(row.code === null ? {} : { code: row.code }),
          })),
        // The one setting a бекап carries about the app's own voice, and only when the owner has
        // ever set it: an absent one restores as off rather than as somebody else's 21:00.
        ...(reminder
          ? {
              reminder: {
                enabled: reminder.enabled,
                time: { hour: reminder.hour, minute: reminder.minute },
              },
            }
          : {}),
      };
    },

    /**
     * The whole state replaced by the snapshot's, in one SQLite transaction: everything the бекап
     * covers goes, everything the бекап holds lands, and if any part is refused none of it is
     * written and the phone is exactly as it was.
     *
     * The transaction is the safety net, not the validation — `readBackup` has already said in the
     * owner's words why a бекап could not stand up. What is left for a constraint to catch is a
     * state no reader produced: this is the last line, and it is a rollback rather than a
     * half-replaced device. `import-repo.commit` does the same thing for the Saldo plan.
     */
    replaceAll(state: BackupState): void {
      // Nothing may be stored that a date column would take and the reader could not bring back —
      // the guard every other repository applies, here before the transaction opens, so a bad
      // дата costs nothing rather than being rolled back.
      for (const entry of state.transactions) isoDate(entry.transaction.date);
      for (const goal of state.goals) isoDate(goal.deadline);
      for (const link of state.monobankLinks) isoDate(link.syncStartDate);
      for (const receipt of state.receipts) isoDate(receipt.issuedDate);

      db.transaction((tx) => {
        // Deleted in reference order: nothing is removed while something still points at it.
        // The чернетки go first and do not come back — they propose money on рахунки of the world
        // being replaced, and their reference is `onDelete: 'restrict'` (design D7). The рахунок
        // the entry form remembers goes with them and for the same reason: its reference is
        // `restrict` too, so leaving it would not merely keep a stale habit — it would refuse the
        // whole restore the moment the owner had ever recorded by hand. `src/backup/format.ts`
        // names it among the exclusions and promises the phone learns it again.
        tx.delete(notificationDrafts).run();
        tx.delete(entryDefaults).run();
        tx.delete(notificationWatches).run();
        // The чек rows go before the транзакції they hang under. The cascade would take them
        // anyway, but this file deletes in reference order and says so — a restore that leaned on
        // a cascade would be one `PRAGMA foreign_keys = OFF` away from leaving orphans behind.
        tx.delete(receiptItems).run();
        tx.delete(fiscalReceipts).run();
        tx.delete(goals).run();
        tx.delete(categoryLimits).run();
        tx.delete(rules).run();
        tx.delete(transactionsTable).run();
        tx.delete(monobankImportedItems).run();
        tx.delete(monobankLinks).run();
        tx.delete(monobankAccounts).run();
        tx.delete(saldoImport).run();
        tx.delete(dailyReminder).run();
        tx.delete(accounts).run();
        tx.delete(categories).run();
        tx.delete(sources).run();
        // `monobank_rates`, `notification_fingerprints` and `alerts` are untouched, deliberately:
        // a cache, the memory that stops an already-decided notification drafting twice, and what
        // this phone is currently failing at — none of which is the owner's money. `journal`,
        // `bug_reports` and `bug_report_screenshots` join them for the same reason and one more:
        // they are this phone's memory of its own bugs, and a відновлення that wiped them would
        // take the evidence of the bug the owner is in the middle of reporting — restoring a бекап
        // is exactly the kind of thing they might be doing when it goes wrong.

        // Inserted in dependency order: what is pointed at exists before what points at it.
        for (const a of state.accounts) {
          tx.insert(accounts).values(toAccountRow(a)).run();
        }
        for (const c of state.categories) {
          tx.insert(categories).values({ id: c.id, name: c.name, archived: c.archived }).run();
        }
        for (const s of state.sources) {
          tx.insert(sources).values({ id: s.id, name: s.name, archived: s.archived }).run();
        }
        for (const rule of state.rules) {
          tx.insert(rules)
            .values({
              id: rule.id,
              merchant: rule.merchant ?? null,
              mcc: rule.mcc ?? null,
              categoryId: rule.categoryId,
              createdAt: new Date(rule.createdAtMs),
            })
            .run();
        }
        for (const limit of state.limits) {
          tx.insert(categoryLimits)
            .values({
              categoryId: limit.categoryId,
              amount: limit.amount.amount,
              currency: limit.amount.currency,
            })
            .run();
        }
        for (const goal of state.goals) {
          tx.insert(goals)
            .values({
              id: goal.id,
              name: goal.name,
              amount: goal.target.amount,
              currency: goal.target.currency,
              deadline: goal.deadline,
              accountId: goal.accountId,
            })
            .run();
        }
        for (const entry of state.transactions) {
          tx.insert(transactionsTable)
            .values({
              ...toTransactionRow(entry.transaction),
              // Verbatim, never «now»: it is the tie-break between транзакції of one дата, so a
              // restored phone lists exactly what the old one listed (design D3).
              createdAt: new Date(entry.storedAtMs),
            })
            .run();
        }
        for (const a of state.monobankAccounts) {
          tx.insert(monobankAccounts)
            .values({
              id: a.id,
              kind: a.kind,
              name: a.name,
              currency: a.currency,
              bankBalanceAmount: a.bankBalance.amount,
              obtainedAt: new Date(a.obtainedAtMs),
            })
            .run();
        }
        for (const link of state.monobankLinks) {
          tx.insert(monobankLinks)
            .values({
              monobankAccountId: link.monobankAccountId,
              accountId: link.accountId,
              syncStartDate: link.syncStartDate,
              cursorMs: new Date(link.cursorMs),
              lastSyncedAt:
                link.lastSyncedAtMs === undefined ? null : new Date(link.lastSyncedAtMs),
            })
            .run();
        }
        for (const item of state.monobankImportedItems) {
          tx.insert(monobankImportedItems)
            .values({ monobankAccountId: item.monobankAccountId, itemId: item.itemId })
            .run();
        }
        for (const watch of state.watches) {
          tx.insert(notificationWatches)
            .values({ packageName: watch.packageName, accountId: watch.accountId })
            .run();
        }
        // After the транзакції they point at, and the позиції after their чек.
        for (const receipt of state.receipts) {
          tx.insert(fiscalReceipts)
            .values({
              id: receipt.id,
              transactionId: receipt.transactionId,
              registrarNumber: receipt.registrarNumber,
              fiscalNumber: receipt.fiscalNumber,
              issuedDate: receipt.issuedDate,
              issuedTime: receipt.issuedTime,
              dialect: receipt.dialect,
              kind: receipt.kind,
              totalAmount: receipt.total.amount,
              totalCurrency: receipt.total.currency,
              sellerName: receipt.sellerName ?? null,
              pointName: receipt.pointName ?? null,
              acquisition: receipt.acquisition,
              fetchedAt: new Date(receipt.fetchedAtMs),
              snapshot: receipt.snapshot,
            })
            .run();
        }
        for (const item of state.receiptItems) {
          tx.insert(receiptItems)
            .values({
              id: item.id,
              receiptId: item.receiptId,
              line: item.line,
              rawName: item.rawName,
              quantityThousandths: item.quantityThousandths,
              unit: item.unit ?? null,
              unitPriceAmount: item.unitPrice?.amount ?? null,
              unitPriceCurrency: item.unitPrice?.currency ?? null,
              lineTotalAmount: item.lineTotal.amount,
              lineTotalCurrency: item.lineTotal.currency,
              discountAmount: item.discount?.amount ?? null,
              discountCurrency: item.discount?.currency ?? null,
              barcode: item.barcode ?? null,
              uktzed: item.uktzed ?? null,
              code: item.code ?? null,
            })
            .run();
        }
        if (state.saldoImportCommittedAtMs !== undefined) {
          tx.insert(saldoImport)
            .values({ id: 'saldo', committedAt: new Date(state.saldoImportCommittedAtMs) })
            .run();
        }
        if (state.reminder) {
          // A бекап written before this change names none, and the row simply does not come back:
          // the phone loads as off, with no time claimed to be the owner's.
          tx.insert(dailyReminder)
            .values({
              id: 'reminder',
              enabled: state.reminder.enabled,
              hour: state.reminder.time.hour,
              minute: state.reminder.time.minute,
            })
            .run();
        }
      });
    },
  };
}

export type BackupRepo = ReturnType<typeof backupRepo>;
