import { and, asc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';

import {
  commitmentDueDate,
  commitmentDues,
  commitmentLinkStands,
  commitmentRefusal,
  dueExists,
  factsDroppedByEdit,
  factsDroppedByStop,
  isCommitmentDebitOn,
  isOpenDue,
  linkHorizon,
  matchCommitmentDebits,
  normaliseMarker,
  type Commitment,
  type CommitmentFacts,
  type CommitmentMarkKind,
  type CommitmentMatch,
  type Periodicity,
} from '../domain/commitments';
import {
  HAND_LINK_WINDOW_DAYS,
  autoLinkWindow,
  daysApart,
  handLinkWindow,
  type DebitCandidate,
} from '../domain/installments';
import { Refusal } from '../domain/refusal';
import { UNCATEGORISED_CATEGORY_ID, isoDate, type IsoDate } from '../domain/transaction';
import { toCandidate, type DebitChoice, type StorageReader, type StorageTx } from './installments-repo';
import {
  accounts,
  categories,
  commitmentDueLinks,
  commitmentDueMarks,
  commitmentRefusals,
  commitments,
  installmentPartLinks,
  transactions,
  type CommitmentRow,
} from './schema';
import type { Storage } from './storage';

/**
 * Зобов'язання in storage (commitments design D1, D4, D5): the owner's facts about each, and per
 * платіж only what cannot be derived — its link, its mark (сплачено or пропущено), the транзакції the
 * owner unlinked from it. Speaks domain values only; rows never leave this module.
 *
 * Nothing here creates, removes or moves a транзакція. The one thing a зобов'язання ever writes
 * into one is the категорія of a «Без категорії» витрата at the moment it is linked.
 *
 * One транзакція is the списання of one платіж at most, whichever plan: every link checks the
 * розстрочки' link table in the same write, and `installments-repo` checks this one.
 */

export function toCommitment(row: CommitmentRow): Commitment {
  return {
    id: row.id,
    name: row.name,
    amount: row.amountMinor,
    currency: row.currency,
    periodicity: row.periodicity as Periodicity,
    firstDue: row.firstDue,
    debitAccountId: row.debitAccountId,
    ...(row.categoryId === null ? {} : { categoryId: row.categoryId }),
    ...(row.marker === null ? {} : { marker: row.marker }),
    recordedAt: row.recordedAt.getTime(),
    ...(row.stoppedOn === null ? {} : { stoppedOn: row.stoppedOn }),
  };
}

export function toCommitmentRow(commitment: Commitment) {
  return {
    id: commitment.id,
    name: commitment.name.trim(),
    amountMinor: commitment.amount,
    currency: commitment.currency,
    periodicity: commitment.periodicity,
    firstDue: commitment.firstDue,
    debitAccountId: commitment.debitAccountId,
    categoryId: commitment.categoryId ?? null,
    marker: normaliseMarker(commitment.marker) ?? null,
    recordedAt: new Date(commitment.recordedAt),
    stoppedOn: commitment.stoppedOn ?? null,
  };
}

/**
 * Every транзакція linked to a платіж of a розстрочка — what the зобов'язання may not take, read as
 * it stands after the розстрочки' own settle in the same write (commitments design D4).
 */
export function installmentLinkedIds(reader: StorageReader): Set<string> {
  return new Set(
    reader
      .select()
      .from(installmentPartLinks)
      .all()
      .map((row) => row.transactionId),
  );
}

/** How many date windows one candidate query ORs together — well inside SQLite's depth of 1000. */
const WINDOWS_PER_QUERY = 200;

/** Overlapping date windows folded into as few as cover the same days. */
function mergedWindows(
  windows: readonly { readonly from: IsoDate; readonly to: IsoDate }[],
): { from: IsoDate; to: IsoDate }[] {
  const sorted = [...windows].sort((a, b) => a.from.localeCompare(b.from));
  const merged: { from: IsoDate; to: IsoDate }[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && window.from <= last.to) {
      last.to = window.to > last.to ? window.to : last.to;
    } else {
      merged.push({ ...window });
    }
  }
  return merged;
}

export function commitmentsRepo(db: Storage) {
  type Reader = StorageReader;

  function listIn(reader: Reader): Commitment[] {
    return reader
      .select()
      .from(commitments)
      .orderBy(asc(commitments.recordedAt), asc(commitments.id))
      .all()
      .map(toCommitment);
  }

  function factsIn(reader: Reader): CommitmentFacts {
    return {
      links: reader
        .select()
        .from(commitmentDueLinks)
        .orderBy(asc(commitmentDueLinks.commitmentId), asc(commitmentDueLinks.number))
        .all(),
      marks: reader
        .select()
        .from(commitmentDueMarks)
        .orderBy(asc(commitmentDueMarks.commitmentId), asc(commitmentDueMarks.number))
        .all()
        .map((row) => ({ ...row, kind: row.kind as CommitmentMarkKind })),
      refusals: reader
        .select()
        .from(commitmentRefusals)
        .orderBy(
          asc(commitmentRefusals.commitmentId),
          asc(commitmentRefusals.number),
          asc(commitmentRefusals.transactionId),
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
   * What a settle would do right now (design D4). Two passes over the same domain function: the
   * first, over the linked транзакції alone, says which links drop; the second adds the candidates
   * for the платежі then open — витрати on their рахунки списання inside their ±3-day windows — so
   * the scan stays narrow even when old платежі are «не знайдено».
   */
  function matchIn(reader: Reader, today: IsoDate): CommitmentMatch {
    const all = listIn(reader);
    if (all.length === 0) {
      return { link: [], drop: [], categorise: [] };
    }
    const facts = factsIn(reader);
    const takenByInstallments = installmentLinkedIds(reader);
    const linked = transactionsById(
      reader,
      facts.links.map((link) => link.transactionId),
    );
    const first = matchCommitmentDebits({ commitments: all, facts, transactions: linked, takenByInstallments, today });
    const dropped = new Set(first.drop.map((d) => `${d.commitmentId}|${d.number}`));
    const factsAfterDrops: CommitmentFacts = {
      ...facts,
      links: facts.links.filter((link) => !dropped.has(`${link.commitmentId}|${link.number}`)),
    };

    const accountIds = new Set<string>();
    const windows: { from: IsoDate; to: IsoDate }[] = [];
    const until = linkHorizon(today);
    for (const commitment of all) {
      for (const due of commitmentDues(commitment, factsAfterDrops, { until, today })) {
        if (isOpenDue(due)) {
          accountIds.add(commitment.debitAccountId);
          windows.push(autoLinkWindow(due.due));
        }
      }
    }
    if (windows.length === 0) {
      return first;
    }
    // The windows go to SQLite in groups: one OR'd range per open платіж would pass its expression
    // depth (1000) for a first дата some seventeen years back — and a settle that throws stops the
    // розстрочки' linking too. Merged windows do not overlap, so no row is read twice.
    const merged = mergedWindows(windows);
    const candidates: DebitCandidate[] = [];
    for (let at = 0; at < merged.length; at += WINDOWS_PER_QUERY) {
      const group = merged.slice(at, at + WINDOWS_PER_QUERY);
      candidates.push(
        ...reader
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.type, 'expense'),
              inArray(transactions.accountId, [...accountIds]),
              or(...group.map((w) => and(gte(transactions.date, w.from), lte(transactions.date, w.to)))),
            ),
          )
          .all()
          .map(toCandidate),
      );
    }
    const linkedIds = new Set(linked.map((t) => t.id));
    return matchCommitmentDebits({
      commitments: all,
      facts,
      transactions: [...linked, ...candidates.filter((c) => !linkedIds.has(c.id))],
      takenByInstallments,
      today,
    });
  }

  function isEmpty(match: CommitmentMatch): boolean {
    return match.link.length === 0 && match.drop.length === 0 && match.categorise.length === 0;
  }

  function apply(tx: StorageTx, match: CommitmentMatch): void {
    for (const dropped of match.drop) {
      tx.delete(commitmentDueLinks).where(linkKey(dropped.commitmentId, dropped.number)).run();
    }
    if (match.link.length > 0) {
      tx.insert(commitmentDueLinks).values([...match.link]).run();
    }
    for (const move of match.categorise) {
      categoriseIfUncategorised(tx, move.transactionId, move.categoryId);
    }
  }

  /** The one write a зобов'язання makes into a транзакція — only while it is still «Без категорії». */
  function categoriseIfUncategorised(tx: StorageTx, transactionId: string, categoryId: string): void {
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

  function getIn(reader: Reader, id: string): Commitment | undefined {
    const row = reader.select().from(commitments).where(eq(commitments.id, id)).get();
    return row ? toCommitment(row) : undefined;
  }

  function requireCommitment(reader: Reader, id: string): Commitment {
    const commitment = getIn(reader, id);
    if (!commitment) {
      throw new Error(`зобовʼязання «${id}» не існує`);
    }
    return commitment;
  }

  /** The дата of a платіж that exists — refused for one before the first or after the stop. */
  function requireDue(commitment: Commitment, number: number): IsoDate {
    if (!dueExists(commitment, number)) {
      if (Number.isInteger(number) && number >= 1) {
        throw new Refusal(
          `Зобовʼязання «${commitment.name}» припинено — платежу ${commitmentDueDate(commitment, number)} вже немає.`,
        );
      }
      throw new Error(`зобовʼязання «${commitment.name}» не має платежу ${number}`);
    }
    return commitmentDueDate(commitment, number);
  }

  function linkKey(commitmentId: string, number: number) {
    return and(eq(commitmentDueLinks.commitmentId, commitmentId), eq(commitmentDueLinks.number, number));
  }

  function markKey(commitmentId: string, number: number) {
    return and(eq(commitmentDueMarks.commitmentId, commitmentId), eq(commitmentDueMarks.number, number));
  }

  /** Deletes exactly the given facts — what an edit or a stop takes with it (design D3). */
  function deleteFacts(tx: StorageTx, facts: CommitmentFacts): void {
    for (const link of facts.links) {
      tx.delete(commitmentDueLinks).where(linkKey(link.commitmentId, link.number)).run();
    }
    for (const mark of facts.marks) {
      tx.delete(commitmentDueMarks).where(markKey(mark.commitmentId, mark.number)).run();
    }
    for (const refusal of facts.refusals) {
      tx.delete(commitmentRefusals)
        .where(
          and(
            eq(commitmentRefusals.commitmentId, refusal.commitmentId),
            eq(commitmentRefusals.number, refusal.number),
            eq(commitmentRefusals.transactionId, refusal.transactionId),
          ),
        )
        .run();
    }
  }

  function factsOfIn(reader: Reader, commitmentId: string): CommitmentFacts {
    const facts = factsIn(reader);
    return {
      links: facts.links.filter((f) => f.commitmentId === commitmentId),
      marks: facts.marks.filter((f) => f.commitmentId === commitmentId),
      refusals: facts.refusals.filter((f) => f.commitmentId === commitmentId),
    };
  }

  return {
    /** Every зобов'язання, in the order they were recorded. */
    list(): Commitment[] {
      return listIn(db);
    },

    get(id: string): Commitment | undefined {
      return getIn(db, id);
    },

    /** Every link, mark and refusal of every зобов'язання. */
    facts(): CommitmentFacts {
      return factsIn(db);
    },

    /**
     * Insert or replace under the same id — creating and editing are one write path, so an edit is
     * checked exactly as a new one is. Refuses what the domain refuses, a рахунок списання or
     * категорія storage does not hold, and a currency other than the рахунок's (persistence, "A
     * stored зобов'язання refers only to what storage holds").
     *
     * An edit keeps the states of the платежі by number, except (commitments, "A зобов'язання can
     * be edited, stopped, resumed and deleted"): a link the edit put out of reach — another рахунок
     * списання, a дата more than ten days away — a mark or refusal of a платіж the edit moved by
     * more than ten days, and everything about a платіж the edited графік places after the дата
     * припинення. All of it in the same write.
     */
    save(commitment: Commitment): void {
      isoDate(commitment.firstDue);
      if (commitment.stoppedOn !== undefined) {
        isoDate(commitment.stoppedOn);
      }
      db.transaction(
        (tx) => {
          const existing = getIn(tx, commitment.id);
          const account = tx.select().from(accounts).where(eq(accounts.id, commitment.debitAccountId)).get();
          const category =
            commitment.categoryId === undefined
              ? undefined
              : tx.select().from(categories).where(eq(categories.id, commitment.categoryId)).get();
          const refusal = commitmentRefusal(commitment, {
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
          const row = toCommitmentRow(commitment);
          const { id: _id, ...replaceable } = row;
          tx.insert(commitments)
            .values(row)
            .onConflictDoUpdate({ target: commitments.id, set: replaceable })
            .run();
          if (!existing) {
            return;
          }
          const edited = toCommitment(tx.select().from(commitments).where(eq(commitments.id, commitment.id)).get()!);
          const facts = factsOfIn(tx, edited.id);
          deleteFacts(tx, factsDroppedByEdit(existing, edited, facts));
          if (edited.stoppedOn !== undefined) {
            deleteFacts(tx, factsDroppedByStop(edited, edited.stoppedOn, facts));
          }
          const linked = new Map(
            transactionsById(tx, facts.links.map((link) => link.transactionId)).map((t) => [t.id, t]),
          );
          for (const link of factsOfIn(tx, edited.id).links) {
            if (!commitmentLinkStands(edited, link.number, linked.get(link.transactionId))) {
              tx.delete(commitmentDueLinks).where(linkKey(edited.id, link.number)).run();
            }
          }
        },
        { behavior: 'immediate' },
      );
    },

    /**
     * Removes the зобов'язання with every link, mark and refusal — by the cascade — and nothing
     * else: no транзакція is touched (commitments, "Deleting a зобов'язання leaves its транзакції").
     */
    remove(id: string): void {
      db.delete(commitments).where(eq(commitments.id, id)).run();
    },

    /**
     * «Припинити»: the дата припинення is `on` (today), and everything said about a платіж dated
     * after it goes in the same write — so a resume brings those платежі back as their дати give
     * them.
     */
    stop(id: string, on: IsoDate): void {
      isoDate(on);
      db.transaction(
        (tx) => {
          const commitment = requireCommitment(tx, id);
          tx.update(commitments).set({ stoppedOn: on }).where(eq(commitments.id, id)).run();
          deleteFacts(tx, factsDroppedByStop(commitment, on, factsOfIn(tx, id)));
        },
        { behavior: 'immediate' },
      );
    },

    /** «Відновити»: the дата припинення goes, and the платежі after it exist again. */
    resume(id: string): void {
      db.update(commitments).set({ stoppedOn: null }).where(eq(commitments.id, id)).run();
    },

    /**
     * «Обрати списання»: the owner links a платіж that is neither сплачено nor пропущено to a
     * витрата on the рахунок списання in its currency within ten days of its дата, linked to no
     * платіж of either plan, whatever its сума or опис. A «Без категорії» витрата takes the
     * зобов'язання's категорія, as at the app's own linking; a refusal the owner once made for this
     * pair is forgotten — picking it is the newer word.
     */
    link(commitmentId: string, number: number, transactionId: string): void {
      db.transaction(
        (tx) => {
          const commitment = requireCommitment(tx, commitmentId);
          const due = requireDue(commitment, number);
          if (tx.select().from(commitmentDueLinks).where(linkKey(commitmentId, number)).get()) {
            throw new Refusal(`Платіж ${due} зобовʼязання «${commitment.name}» уже сплачено.`);
          }
          const mark = tx.select().from(commitmentDueMarks).where(markKey(commitmentId, number)).get();
          if (mark) {
            throw new Refusal(
              mark.kind === 'paid'
                ? `Платіж ${due} зобовʼязання «${commitment.name}» уже позначено сплаченим.`
                : `Платіж ${due} зобовʼязання «${commitment.name}» позначено пропущеним — спершу зніміть позначку.`,
            );
          }
          const transaction = transactionsById(tx, [transactionId])[0];
          if (!transaction) {
            throw new Error(`транзакції «${transactionId}» не існує`);
          }
          if (!isCommitmentDebitOn(transaction, commitment)) {
            throw new Refusal(`Списанням може бути лише витрата в ${commitment.currency} з рахунку списання.`);
          }
          const window = handLinkWindow(due);
          if (transaction.date < window.from || transaction.date > window.to) {
            throw new Refusal(`Списання має бути не далі ніж за ${HAND_LINK_WINDOW_DAYS} днів від дати платежу.`);
          }
          const taken =
            tx.select().from(commitmentDueLinks).where(eq(commitmentDueLinks.transactionId, transactionId)).get() ??
            tx.select().from(installmentPartLinks).where(eq(installmentPartLinks.transactionId, transactionId)).get();
          if (taken) {
            throw new Refusal('Ця витрата вже є списанням іншого платежу.');
          }
          tx.delete(commitmentRefusals)
            .where(
              and(
                eq(commitmentRefusals.commitmentId, commitmentId),
                eq(commitmentRefusals.number, number),
                eq(commitmentRefusals.transactionId, transactionId),
              ),
            )
            .run();
          tx.insert(commitmentDueLinks).values({ commitmentId, number, transactionId }).run();
          if (commitment.categoryId !== undefined) {
            categoriseIfUncategorised(tx, transactionId, commitment.categoryId);
          }
        },
        { behavior: 'immediate' },
      );
    },

    /**
     * «Відв'язати»: the link goes, the pair is remembered so the app never links it again by
     * itself, and the категорія the витрата took stays.
     */
    unlink(commitmentId: string, number: number): void {
      db.transaction(
        (tx) => {
          const link = tx.select().from(commitmentDueLinks).where(linkKey(commitmentId, number)).get();
          if (!link) {
            return;
          }
          tx.delete(commitmentDueLinks).where(linkKey(commitmentId, number)).run();
          tx.insert(commitmentRefusals)
            .values({ commitmentId, number, transactionId: link.transactionId })
            .onConflictDoNothing()
            .run();
        },
        { behavior: 'immediate' },
      );
    },

    /**
     * «Позначити сплаченим» (`paid`) or «Пропустити» (`skipped`): the owner's word about a платіж
     * that is neither linked nor marked — one state fact per платіж, and none after the stop.
     */
    mark(commitmentId: string, number: number, kind: CommitmentMarkKind): void {
      db.transaction(
        (tx) => {
          const commitment = requireCommitment(tx, commitmentId);
          const due = requireDue(commitment, number);
          if (tx.select().from(commitmentDueLinks).where(linkKey(commitmentId, number)).get()) {
            throw new Refusal(`Платіж ${due} зобовʼязання «${commitment.name}» уже має списання.`);
          }
          const held = tx.select().from(commitmentDueMarks).where(markKey(commitmentId, number)).get();
          if (held && held.kind !== kind) {
            throw new Refusal(`Платіж ${due} зобовʼязання «${commitment.name}» уже позначено — спершу зніміть позначку.`);
          }
          tx.insert(commitmentDueMarks).values({ commitmentId, number, kind }).onConflictDoNothing().run();
        },
        { behavior: 'immediate' },
      );
    },

    /** «Зняти позначку»: the платіж is what its дата says again. */
    unmark(commitmentId: string, number: number): void {
      db.delete(commitmentDueMarks).where(markKey(commitmentId, number)).run();
    },

    /**
     * The витрати on the рахунок списання in its currency within ten days of the платіж's дата,
     * linked to no платіж of either plan, whatever their сума or опис — nearest first
     * (commitments-screen, "Picking the списання by hand").
     */
    choices(commitmentId: string, number: number): DebitChoice[] {
      const commitment = requireCommitment(db, commitmentId);
      const due = requireDue(commitment, number);
      const window = handLinkWindow(due);
      const rows = db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.type, 'expense'),
            eq(transactions.currency, commitment.currency),
            eq(transactions.accountId, commitment.debitAccountId),
            gte(transactions.date, window.from),
            lte(transactions.date, window.to),
            sql`${transactions.id} NOT IN (SELECT ${commitmentDueLinks.transactionId} FROM ${commitmentDueLinks})`,
            sql`${transactions.id} NOT IN (SELECT ${installmentPartLinks.transactionId} FROM ${installmentPartLinks})`,
          ),
        )
        .orderBy(asc(transactions.date), asc(transactions.createdAt), asc(transactions.id))
        .all();
      const distance = (date: IsoDate) => daysApart(date, due);
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

    /** Whether a settle would change anything right now — read outside any write. */
    pending(today: IsoDate): boolean {
      return !isEmpty(matchIn(db, today));
    },

    /**
     * Links what can be linked and drops what no longer stands, over every зобов'язання, inside a
     * write the caller holds — `settlePlans` (`plans-settle.ts`), after the розстрочки have been
     * served in the same write (design D4). Says whether it changed anything.
     */
    settleIn(tx: StorageTx, today: IsoDate): boolean {
      const match = matchIn(tx, today);
      apply(tx, match);
      return !isEmpty(match);
    },
  };
}

export type CommitmentsRepo = ReturnType<typeof commitmentsRepo>;
