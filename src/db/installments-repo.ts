import { and, asc, eq, gt, gte, inArray, lte, sql } from 'drizzle-orm';

import {
  HAND_LINK_WINDOW_DAYS,
  INSTALLMENT_CURRENCY,
  autoLinkWindow,
  daysApart,
  handLinkWindow,
  installmentPartStates,
  installmentRefusal,
  installmentSchedule,
  isActiveInstallment,
  isDebitOn,
  linkStands,
  matchInstallmentDebits,
  type DebitCandidate,
  type Installment,
  type InstallmentFacts,
  type InstallmentMatch,
} from '../domain/installments';
import { money } from '../domain/money';
import { Refusal } from '../domain/refusal';
import {
  UNCATEGORISED_CATEGORY_ID,
  isoDate,
  type IsoDate,
  type TransactionType,
} from '../domain/transaction';
import {
  accounts,
  categories,
  commitmentDueLinks,
  installmentPartLinks,
  installmentPartMarks,
  installmentRefusals,
  installmentReminder,
  installments,
  transactions,
  type InstallmentRow,
  type TransactionRow,
} from './schema';
import type { Storage } from './storage';

/**
 * Розстрочки in storage (installments design D1–D4): the owner's facts about each, and per платіж
 * only what cannot be derived — its link, its mark, the транзакції the owner unlinked from it.
 * Speaks domain values only; rows never leave this module.
 *
 * Nothing here creates, removes or moves a транзакція. The one thing a розстрочка ever writes into
 * one is the категорія of a «Без категорії» витрата at the moment it is linked (installments, "A
 * платіж is linked to its списання by the app").
 */

/** The switch of the нагадування про платіж and whether the app already asked on its behalf. */
export interface InstallmentReminderState {
  readonly enabled: boolean;
  readonly asked: boolean;
}

/** An absent row: on, and not yet asked (persistence, "The switch defaults to on"). */
export const DEFAULT_INSTALLMENT_REMINDER: InstallmentReminderState = { enabled: true, asked: false };

export function toInstallment(row: InstallmentRow): Installment {
  return {
    id: row.id,
    name: row.name,
    total: row.totalMinor,
    partsCount: row.partsCount,
    part: row.partMinor,
    firstDue: row.firstDue,
    debitAccountId: row.debitAccountId,
    paidBefore: row.paidBefore,
    ...(row.categoryId === null ? {} : { categoryId: row.categoryId }),
    recordedAt: row.recordedAt.getTime(),
    ...(row.closedOn === null ? {} : { closedOn: row.closedOn }),
  };
}

export function toInstallmentRow(installment: Installment) {
  return {
    id: installment.id,
    name: installment.name.trim(),
    totalMinor: installment.total,
    currency: INSTALLMENT_CURRENCY,
    partsCount: installment.partsCount,
    partMinor: installment.part,
    firstDue: installment.firstDue,
    debitAccountId: installment.debitAccountId,
    paidBefore: installment.paidBefore,
    categoryId: installment.categoryId ?? null,
    recordedAt: new Date(installment.recordedAt),
    closedOn: installment.closedOn ?? null,
  };
}

/**
 * What the linking needs of a транзакція — never the whole domain value. The опис rides along for
 * a зобов'язання's ознака (commitments design D3); the розстрочка matcher ignores it.
 */
export function toCandidate(row: TransactionRow): DebitCandidate {
  return {
    id: row.id,
    type: row.type as TransactionType,
    date: row.date,
    ...(row.accountId === null ? {} : { accountId: row.accountId }),
    ...(row.amount === null || row.currency === null ? {} : { amount: money(row.amount, row.currency) }),
    ...(row.categoryId === null ? {} : { categoryId: row.categoryId }),
    ...(row.description === null ? {} : { description: row.description }),
    createdAt: row.createdAt.getTime(),
  };
}

type Tx = Parameters<Parameters<Storage['transaction']>[0]>[0];
/** Storage, or a write transaction already open on it. */
export type StorageReader = Storage | Tx;
/** A write transaction already open on storage. */
export type StorageTx = Tx;

/**
 * Every транзакція linked to a платіж of a зобов'язання — what the розстрочки may not take: one
 * транзакція is the списання of one платіж at most, whichever plan (commitments design D4).
 */
export function commitmentLinkedIds(reader: StorageReader): Set<string> {
  return new Set(
    reader
      .select()
      .from(commitmentDueLinks)
      .all()
      .map((row) => row.transactionId),
  );
}

/** A UAH витрата the owner may pick by hand for a платіж — what «Обрати списання» lists. */
export interface DebitChoice {
  readonly id: string;
  readonly date: IsoDate;
  /** UAH minor units. */
  readonly amount: number;
  readonly description?: string;
  readonly categoryId: string;
}

export function installmentsRepo(db: Storage) {
  type Reader = StorageReader;

  function listIn(reader: Reader): Installment[] {
    return reader
      .select()
      .from(installments)
      .orderBy(asc(installments.recordedAt), asc(installments.id))
      .all()
      .map(toInstallment);
  }

  function factsIn(reader: Reader): InstallmentFacts {
    return {
      links: reader
        .select()
        .from(installmentPartLinks)
        .orderBy(asc(installmentPartLinks.installmentId), asc(installmentPartLinks.number))
        .all(),
      marks: reader
        .select()
        .from(installmentPartMarks)
        .orderBy(asc(installmentPartMarks.installmentId), asc(installmentPartMarks.number))
        .all(),
      refusals: reader
        .select()
        .from(installmentRefusals)
        .orderBy(
          asc(installmentRefusals.installmentId),
          asc(installmentRefusals.number),
          asc(installmentRefusals.transactionId),
        )
        .all(),
    };
  }

  function transactionsById(reader: Reader, ids: readonly string[]): DebitCandidate[] {
    if (ids.length === 0) {
      return [];
    }
    return reader
      .select()
      .from(transactions)
      .where(inArray(transactions.id, [...ids]))
      .all()
      .map(toCandidate);
  }

  /**
   * What `settle` would do right now (design D4). Two passes over the same domain function: the
   * first, over the linked транзакції alone, says which links drop; the second adds the candidates
   * for the платежі then open — UAH витрати on their рахунки списання, of one of their sums, inside
   * their ±3-day windows — so the scan is narrow even when an old платіж is «не знайдено».
   */
  function matchIn(reader: Reader, today: IsoDate): InstallmentMatch {
    const all = listIn(reader);
    const facts = factsIn(reader);
    if (all.length === 0) {
      return { link: [], drop: [], categorise: [] };
    }
    const takenByCommitments = commitmentLinkedIds(reader);
    const linked = transactionsById(
      reader,
      facts.links.map((link) => link.transactionId),
    );
    const first = matchInstallmentDebits({ installments: all, facts, transactions: linked, takenByCommitments, today });
    const dropped = new Set(first.drop.map((d) => `${d.installmentId}|${d.number}`));
    const factsAfterDrops: InstallmentFacts = {
      ...facts,
      links: facts.links.filter((link) => !dropped.has(`${link.installmentId}|${link.number}`)),
    };

    const accountIds = new Set<string>();
    const amounts = new Set<number>();
    let from: IsoDate | undefined;
    let to: IsoDate | undefined;
    for (const installment of all) {
      const status = installmentPartStates(installment, factsAfterDrops, today);
      if (!isActiveInstallment(status)) {
        continue;
      }
      for (const part of status.parts) {
        if (part.state !== 'expected' && part.state !== 'notFound') {
          continue;
        }
        const window = autoLinkWindow(part.due);
        accountIds.add(installment.debitAccountId);
        amounts.add(part.amount);
        from = from === undefined || window.from < from ? window.from : from;
        to = to === undefined || window.to > to ? window.to : to;
      }
    }
    if (from === undefined || to === undefined) {
      return first;
    }
    const candidates = reader
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'expense'),
          eq(transactions.currency, INSTALLMENT_CURRENCY),
          inArray(transactions.accountId, [...accountIds]),
          inArray(transactions.amount, [...amounts]),
          gte(transactions.date, from),
          lte(transactions.date, to),
        ),
      )
      .all()
      .map(toCandidate);
    const linkedIds = new Set(linked.map((t) => t.id));
    return matchInstallmentDebits({
      installments: all,
      facts,
      transactions: [...linked, ...candidates.filter((c) => !linkedIds.has(c.id))],
      takenByCommitments,
      today,
    });
  }

  function isEmpty(match: InstallmentMatch): boolean {
    return match.link.length === 0 && match.drop.length === 0 && match.categorise.length === 0;
  }

  function apply(tx: Tx, match: InstallmentMatch): void {
    for (const dropped of match.drop) {
      tx.delete(installmentPartLinks)
        .where(
          and(
            eq(installmentPartLinks.installmentId, dropped.installmentId),
            eq(installmentPartLinks.number, dropped.number),
          ),
        )
        .run();
    }
    if (match.link.length > 0) {
      tx.insert(installmentPartLinks).values([...match.link]).run();
    }
    for (const move of match.categorise) {
      categoriseIfUncategorised(tx, move.transactionId, move.categoryId);
    }
  }

  /** The one write a розстрочка makes into a транзакція — only while it is still «Без категорії». */
  function categoriseIfUncategorised(tx: Tx, transactionId: string, categoryId: string): void {
    tx.update(transactions)
      .set({ categoryId })
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.type, 'expense'),
          eq(transactions.categoryId, UNCATEGORISED_CATEGORY_ID),
        ),
      )
      .run();
  }

  function getIn(reader: Reader, id: string): Installment | undefined {
    const row = reader.select().from(installments).where(eq(installments.id, id)).get();
    return row ? toInstallment(row) : undefined;
  }

  function requireInstallment(reader: Reader, id: string): Installment {
    const installment = getIn(reader, id);
    if (!installment) {
      throw new Error(`розстрочки «${id}» не існує`);
    }
    return installment;
  }

  function requirePart(installment: Installment, number: number) {
    const part = installmentSchedule(installment)[number - 1];
    if (!Number.isInteger(number) || part === undefined) {
      throw new Error(`розстрочка «${installment.name}» не має платежу ${number}`);
    }
    return part;
  }

  function partKey(installmentId: string, number: number) {
    return and(
      eq(installmentPartLinks.installmentId, installmentId),
      eq(installmentPartLinks.number, number),
    );
  }

  function markKey(installmentId: string, number: number) {
    return and(
      eq(installmentPartMarks.installmentId, installmentId),
      eq(installmentPartMarks.number, number),
    );
  }

  /**
   * The body of `settle`, inside a write the caller holds (commitments design D4): read again
   * under the lock — a background прогін may have committed in between — and applied.
   */
  function settleIn(tx: StorageTx, today: IsoDate): boolean {
    const match = matchIn(tx, today);
    apply(tx, match);
    return !isEmpty(match);
  }

  function reminderIn(reader: Reader): InstallmentReminderState {
    const row = reader.select().from(installmentReminder).all()[0];
    return row ? { enabled: row.enabled, asked: row.asked } : DEFAULT_INSTALLMENT_REMINDER;
  }

  return {
    /** Every розстрочка, in the order they were recorded. */
    list(): Installment[] {
      return listIn(db);
    },

    get(id: string): Installment | undefined {
      return getIn(db, id);
    },

    /** Every link, mark and refusal of every розстрочка. */
    facts(): InstallmentFacts {
      return factsIn(db);
    },

    /**
     * Insert or replace under the same id — creating and editing are one write path, so an edit is
     * checked exactly as a new one is. Refuses what the domain refuses, a рахунок списання or
     * категорія storage does not hold, and a non-UAH рахунок списання (persistence, "A stored
     * розстрочка refers only to what storage holds").
     *
     * An edit keeps the states of the платежі by number and drops those beyond the new кількість
     * with their links, marks and refusals; a link the edit put out of reach — another рахунок
     * списання, a дата more than ten days away — is dropped here too, rather than waiting for the
     * next `settle`.
     */
    save(installment: Installment): void {
      isoDate(installment.firstDue);
      if (installment.closedOn !== undefined) {
        isoDate(installment.closedOn);
      }
      db.transaction(
        (tx) => {
          const existing = getIn(tx, installment.id);
          const account = tx
            .select()
            .from(accounts)
            .where(eq(accounts.id, installment.debitAccountId))
            .get();
          const category =
            installment.categoryId === undefined
              ? undefined
              : tx.select().from(categories).where(eq(categories.id, installment.categoryId)).get();
          const refusal = installmentRefusal(installment, {
            ...(account ? { account } : {}),
            ...(category ? { category } : {}),
            ...(existing
              ? {
                  existing: {
                    debitAccountId: existing.debitAccountId,
                    ...(existing.categoryId === undefined ? {} : { categoryId: existing.categoryId }),
                  },
                }
              : {}),
          });
          if (refusal) {
            throw new Refusal(refusal.message);
          }
          const row = toInstallmentRow(installment);
          const { id: _id, ...replaceable } = row;
          tx.insert(installments)
            .values(row)
            .onConflictDoUpdate({ target: installments.id, set: replaceable })
            .run();
          if (!existing) {
            return;
          }
          const count = installment.partsCount;
          tx.delete(installmentPartLinks)
            .where(and(eq(installmentPartLinks.installmentId, installment.id), gt(installmentPartLinks.number, count)))
            .run();
          tx.delete(installmentPartMarks)
            .where(and(eq(installmentPartMarks.installmentId, installment.id), gt(installmentPartMarks.number, count)))
            .run();
          tx.delete(installmentRefusals)
            .where(and(eq(installmentRefusals.installmentId, installment.id), gt(installmentRefusals.number, count)))
            .run();
          const links = tx
            .select()
            .from(installmentPartLinks)
            .where(eq(installmentPartLinks.installmentId, installment.id))
            .all();
          const linked = new Map(
            transactionsById(tx, links.map((link) => link.transactionId)).map((t) => [t.id, t]),
          );
          for (const link of links) {
            if (!linkStands(installment, link.number, linked.get(link.transactionId))) {
              tx.delete(installmentPartLinks).where(partKey(installment.id, link.number)).run();
            }
          }
        },
        { behavior: 'immediate' },
      );
    },

    /**
     * Removes the розстрочка with every link, mark and refusal — by the cascade — and nothing
     * else: no транзакція is touched (installments, "Deleting a розстрочка leaves its транзакції").
     */
    remove(id: string): void {
      db.delete(installments).where(eq(installments.id, id)).run();
    },

    /** «Закрити достроково»: every платіж not сплачено becomes закрито. */
    close(id: string, on: IsoDate): void {
      isoDate(on);
      db.update(installments).set({ closedOn: on }).where(eq(installments.id, id)).run();
    },

    /** «Відновити»: the закрито платежі return to what their дати give them. */
    reopen(id: string): void {
      db.update(installments).set({ closedOn: null }).where(eq(installments.id, id)).run();
    },

    /**
     * «Обрати списання»: the owner links a платіж that is not сплачено to a UAH витрата on the
     * рахунок списання within ten days of its дата and linked to no платіж, whatever its сума. A
     * «Без категорії» витрата takes the розстрочка's категорія, as at the app's own linking; a
     * refusal the owner once made for this pair is forgotten — picking it is the newer word.
     */
    link(installmentId: string, number: number, transactionId: string): void {
      db.transaction(
        (tx) => {
          const installment = requireInstallment(tx, installmentId);
          const part = requirePart(installment, number);
          const status = installmentPartStates(installment, factsIn(tx), part.due);
          if (status.parts[number - 1]?.state === 'paid') {
            throw new Refusal(`Платіж ${number} розстрочки «${installment.name}» уже сплачено.`);
          }
          const transaction = transactionsById(tx, [transactionId])[0];
          if (!transaction) {
            throw new Error(`транзакції «${transactionId}» не існує`);
          }
          if (!isDebitOn(transaction, installment.debitAccountId)) {
            throw new Refusal('Списанням може бути лише витрата в гривнях з рахунку списання.');
          }
          const window = handLinkWindow(part.due);
          if (transaction.date < window.from || transaction.date > window.to) {
            throw new Refusal(
              `Списання має бути не далі ніж за ${HAND_LINK_WINDOW_DAYS} днів від дати платежу.`,
            );
          }
          const taken = tx
            .select()
            .from(installmentPartLinks)
            .where(eq(installmentPartLinks.transactionId, transactionId))
            .get();
          if (taken || commitmentLinkedIds(tx).has(transactionId)) {
            throw new Refusal('Ця витрата вже є списанням іншого платежу.');
          }
          tx.delete(installmentRefusals)
            .where(
              and(
                eq(installmentRefusals.installmentId, installmentId),
                eq(installmentRefusals.number, number),
                eq(installmentRefusals.transactionId, transactionId),
              ),
            )
            .run();
          tx.delete(installmentPartMarks).where(markKey(installmentId, number)).run();
          tx.insert(installmentPartLinks).values({ installmentId, number, transactionId }).run();
          if (installment.categoryId !== undefined) {
            categoriseIfUncategorised(tx, transactionId, installment.categoryId);
          }
        },
        { behavior: 'immediate' },
      );
    },

    /**
     * «Відв'язати»: the link goes, the pair is remembered so the app never links it again by
     * itself, and the категорія the витрата took stays.
     */
    unlink(installmentId: string, number: number): void {
      db.transaction(
        (tx) => {
          const link = tx.select().from(installmentPartLinks).where(partKey(installmentId, number)).get();
          if (!link) {
            return;
          }
          tx.delete(installmentPartLinks).where(partKey(installmentId, number)).run();
          tx.insert(installmentRefusals)
            .values({ installmentId, number, transactionId: link.transactionId })
            .onConflictDoNothing()
            .run();
        },
        { behavior: 'immediate' },
      );
    },

    /** «Позначити сплаченим»: сплачено without a списання. */
    mark(installmentId: string, number: number): void {
      requirePart(requireInstallment(db, installmentId), number);
      db.insert(installmentPartMarks).values({ installmentId, number }).onConflictDoNothing().run();
    },

    /** «Зняти позначку». */
    unmark(installmentId: string, number: number): void {
      db.delete(installmentPartMarks).where(markKey(installmentId, number)).run();
    },

    /**
     * The UAH витрати on the рахунок списання within ten days of the платіж's дата, linked to no
     * платіж of either plan, whatever their сума — nearest first (installments-screen, "Picking the
     * списання by hand").
     */
    choices(installmentId: string, number: number): DebitChoice[] {
      const installment = requireInstallment(db, installmentId);
      const part = requirePart(installment, number);
      const window = handLinkWindow(part.due);
      const rows = db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.type, 'expense'),
            eq(transactions.currency, INSTALLMENT_CURRENCY),
            eq(transactions.accountId, installment.debitAccountId),
            gte(transactions.date, window.from),
            lte(transactions.date, window.to),
            sql`${transactions.id} NOT IN (SELECT ${installmentPartLinks.transactionId} FROM ${installmentPartLinks})`,
            sql`${transactions.id} NOT IN (SELECT ${commitmentDueLinks.transactionId} FROM ${commitmentDueLinks})`,
          ),
        )
        .orderBy(asc(transactions.date), asc(transactions.createdAt), asc(transactions.id))
        .all();
      const distance = (date: IsoDate) => daysApart(date, part.due);
      return rows
        .map((row) => ({
          id: row.id,
          date: row.date,
          amount: row.amount ?? 0,
          ...(row.description === null ? {} : { description: row.description }),
          categoryId: row.categoryId ?? UNCATEGORISED_CATEGORY_ID,
        }))
        .sort((a, b) => distance(a.date) - distance(b.date));
    },

    /**
     * Links what can be linked and drops what no longer stands, over every розстрочка, in one
     * write transaction (design D4). **Writes nothing when nothing changed** — so storage's change
     * stamp stays put and the remembered screens are not invalidated on every focus — and says
     * whether it changed anything. The app settles both plans together through `settlePlans`
     * (`plans-settle.ts`); this stays for what proves the розстрочки' own rules.
     */
    settle(today: IsoDate): boolean {
      if (isEmpty(matchIn(db, today))) {
        return false;
      }
      return db.transaction((tx) => settleIn(tx, today), { behavior: 'immediate' });
    },

    /** Whether `settle` would change anything right now — read outside any write. */
    pending(today: IsoDate): boolean {
      return !isEmpty(matchIn(db, today));
    },

    settleIn,

    /** The switch and whether the app has already asked; on and not asked when never set. */
    reminder(): InstallmentReminderState {
      return reminderIn(db);
    },

    /** Turns the нагадування про платіж on or off, keeping `asked`. */
    setReminderEnabled(enabled: boolean): void {
      db.insert(installmentReminder)
        .values({ id: 1, enabled, asked: DEFAULT_INSTALLMENT_REMINDER.asked })
        .onConflictDoUpdate({ target: installmentReminder.id, set: { enabled } })
        .run();
    },

    /** Records that the app asked for notification permission on their behalf. Never reset. */
    markAsked(): void {
      db.insert(installmentReminder)
        .values({ id: 1, enabled: DEFAULT_INSTALLMENT_REMINDER.enabled, asked: true })
        .onConflictDoUpdate({ target: installmentReminder.id, set: { asked: true } })
        .run();
    },
  };
}

export type InstallmentsRepo = ReturnType<typeof installmentsRepo>;
