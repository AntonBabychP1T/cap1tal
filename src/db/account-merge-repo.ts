import { and, eq, or } from 'drizzle-orm';

import { mergeRefusal } from '../domain/account-merge';
import { toAccount } from './mappers';
import {
  accounts,
  entryDefaults,
  goalAccounts,
  investmentValues,
  monobankLinks,
  notificationDrafts,
  notificationWatches,
  rules,
  transactions,
} from './schema';
import type { Storage } from './storage';

/**
 * Folds the рахунок `fromId` into `intoId` in one database transaction — both or neither
 * (`src/ui/account-merge.ts` says why the move exists and what it may refuse).
 *
 * Everything that names `from` is moved onto `into`: every транзакція leg, the monobank link, the
 * watched bank app, a чернетка awaiting confirmation, a правило-переказ's destination, the рахунок
 * the entry form remembers and a ціль's membership. Перекази between the two are deleted — each
 * would be a переказ from a рахунок to itself, which moves nothing and which storage refuses to
 * create. The opening balances add up, so the merged balance is both histories told as one.
 *
 * Then `from` itself is deleted. This is the one place a рахунок is deleted rather than archived:
 * archiving keeps a рахунок because its history must stay somewhere, and here its history has
 * just moved. Every reference to a рахунок is `onDelete: 'restrict'`, so one this function forgot
 * to move would refuse the delete and roll the whole merge back rather than lose anything.
 *
 * With `dropCorrections`, `from`'s коригування are deleted rather than moved — the owner's answer
 * when «Звірити» on `from` only added money `into` already holds (`MergePreview.corrections`).
 *
 * A поточна вартість is the owner's word about one рахунок: `into` keeps its own; `from`'s moves
 * over only when `into` is інвестиційний and has none, and is dropped otherwise.
 */
export function mergeAccounts(
  db: Storage,
  input: { fromId: string; intoId: string; dropCorrections?: boolean },
): void {
  const { fromId, intoId } = input;
  db.transaction(
    (tx) => {
      const fromRow = tx.select().from(accounts).where(eq(accounts.id, fromId)).get();
      const intoRow = tx.select().from(accounts).where(eq(accounts.id, intoId)).get();
      if (!fromRow || !intoRow) {
        throw new Error('рахунку не існує');
      }
      const from = toAccount(fromRow);
      const into = toAccount(intoRow);
      const linkedTo = (accountId: string) =>
        tx.select().from(monobankLinks).where(eq(monobankLinks.accountId, accountId)).get() !==
        undefined;
      const refusal = mergeRefusal({
        from,
        into,
        fromLinked: linkedTo(fromId),
        intoLinked: linkedTo(intoId),
      });
      if (refusal) {
        throw new Error(refusal);
      }

      if (input.dropCorrections) {
        tx.delete(transactions)
          .where(and(eq(transactions.type, 'correction'), eq(transactions.accountId, fromId)))
          .run();
      }
      // Перекази between the two first: re-pointed, they would name one рахунок on both legs.
      tx.delete(transactions)
        .where(
          and(
            eq(transactions.type, 'transfer'),
            or(
              and(eq(transactions.fromAccountId, fromId), eq(transactions.toAccountId, intoId)),
              and(eq(transactions.fromAccountId, intoId), eq(transactions.toAccountId, fromId)),
            ),
          ),
        )
        .run();
      tx.update(transactions).set({ accountId: intoId }).where(eq(transactions.accountId, fromId)).run();
      tx.update(transactions)
        .set({ fromAccountId: intoId })
        .where(eq(transactions.fromAccountId, fromId))
        .run();
      tx.update(transactions)
        .set({ toAccountId: intoId })
        .where(eq(transactions.toAccountId, fromId))
        .run();

      tx.update(monobankLinks).set({ accountId: intoId }).where(eq(monobankLinks.accountId, fromId)).run();
      tx.update(notificationWatches)
        .set({ accountId: intoId })
        .where(eq(notificationWatches.accountId, fromId))
        .run();
      tx.update(notificationDrafts)
        .set({ accountId: intoId })
        .where(eq(notificationDrafts.accountId, fromId))
        .run();
      tx.update(rules).set({ toAccountId: intoId }).where(eq(rules.toAccountId, fromId)).run();
      tx.update(entryDefaults).set({ accountId: intoId }).where(eq(entryDefaults.accountId, fromId)).run();

      // A ціль that counted both keeps counting the one; one that counted `from` now counts `into`.
      // `select()` without a projection, like every other repository: `Storage` is a union.
      const goalIds = tx
        .select()
        .from(goalAccounts)
        .where(eq(goalAccounts.accountId, fromId))
        .all()
        .map((row) => row.goalId);
      if (goalIds.length > 0) {
        tx.delete(goalAccounts).where(eq(goalAccounts.accountId, fromId)).run();
        tx.insert(goalAccounts)
          .values(goalIds.map((goalId) => ({ goalId, accountId: intoId })))
          .onConflictDoNothing()
          .run();
      }

      const fromValue = tx
        .select()
        .from(investmentValues)
        .where(eq(investmentValues.accountId, fromId))
        .get();
      if (fromValue) {
        tx.delete(investmentValues).where(eq(investmentValues.accountId, fromId)).run();
        const intoHasValue =
          tx.select().from(investmentValues).where(eq(investmentValues.accountId, intoId)).get() !==
          undefined;
        if (into.kind === 'investment' && !intoHasValue) {
          tx.insert(investmentValues).values({ ...fromValue, accountId: intoId }).run();
        }
      }

      tx.update(accounts)
        .set({ openingAmount: into.openingBalance.amount + from.openingBalance.amount })
        .where(eq(accounts.id, intoId))
        .run();
      tx.delete(accounts).where(eq(accounts.id, fromId)).run();
    },
    { behavior: 'immediate' },
  );
}
