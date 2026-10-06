import {
  expenseByDefault,
  refund,
  UNCATEGORISED_CATEGORY_ID,
  type Correction,
  type Expense,
  type Income,
  type Refund,
  type Transaction,
  type TransactionType,
} from '../domain/transaction';
import { Refusal } from '../domain/refusal';
import { formatMinorUnits, formatMoney } from './amount-input';
import { calendarLabel } from './dates';
import { normaliseDescription, type EntryType } from './entry-form';
import { accountLabel } from './labels';

/**
 * The three decisions a retype needs, all pure so the MODIFIED "A transaction's type can be
 * changed from editing" requirement is provable at all: which types a stored transaction may
 * become, which label survives the move, and — for the feed's one tap — the same transaction
 * under a new category.
 *
 * витрата ↔ переказ needs a second leg and its own account picker, so the screen's form owns it
 * and `buildEntry` builds it; `shapesFor` is what offers it, and it is tested here like the rest.
 *
 * Building the retyped transaction is deliberately NOT here. The editing screen already has a
 * filled form, and `buildEntry` turns a filled form into a transaction; giving it the stored id
 * is the whole of what makes it an edit. A second constructor beside it would be two copies of
 * the same amount rules and the same "оберіть джерело" refusals, agreeing until they didn't.
 */

/** The types a transaction can be retyped between. A коригування is not among them. */
export type RetypeShape = Exclude<TransactionType, 'correction'>;

/**
 * What this transaction may become. витрата is the hub: it goes to переказ, дохід or повернення
 * and back from each.
 *
 * дохід ↔ повернення goes straight across too. It was withheld once — a повернення is a negative
 * витрата in the category it came out of and never income (`.claude/rules/domain.md`), and the tap
 * across moves two numbers at once. But the money that most often arrives looking like a дохід is
 * exactly a повернення: a friend paying back their share of a підписка lands on the card as
 * «Від: …». The owner reported (2026-09-23) having no way to say so short of deleting it. Moving
 * two numbers is the point here — дохід down, the категорія's spent down — and the move cannot
 * be made carelessly: a повернення is not stored until its категорія is picked.
 *
 * A коригування gets an empty list: it is what «Звірити» wrote, so the editing screen reads its
 * сума, рахунок and дата out and edits its опис alone (`initialForm`), never asking what it could
 * become.
 */
export function shapesFor(t: Transaction): RetypeShape[] {
  switch (t.type) {
    case 'transfer':
      return ['expense', 'transfer'];
    case 'expense':
      return ['expense', 'transfer', 'income', 'refund'];
    case 'income':
      return ['expense', 'income', 'refund'];
    case 'refund':
      return ['expense', 'income', 'refund'];
    case 'correction':
      return [];
  }
}

/**
 * What a retype carries over before the owner has answered any picker: a label survives only as
 * long as the shape that carries it. A дохід has no category to carry into a витрата, a витрата
 * no джерело to carry into a дохід — so retyping into a дохід drops the category and asks for the
 * джерело, and retyping a дохід into a витрату drops the джерело and lands in «Без категорії»
 * unless the owner picks otherwise.
 *
 * The editing screen seeds its pickers with this when the owner flips the type, so what it shows
 * and what it then stores obey one rule rather than two.
 */
export function labelsAfterRetype(
  t: Transaction,
  to: RetypeShape,
): { readonly categoryId?: string; readonly sourceId?: string } {
  if (t.type === 'transfer' || t.type === 'correction' || to === 'transfer') {
    // A переказ carries neither label, and nothing carries one into it.
    return {};
  }
  const carried = to === 'income' || t.type === 'income' ? undefined : t.categoryId;
  return {
    // «Без категорії» is not carried into a повернення: it is what a витрата arrives wearing, not
    // something the owner picked, and a повернення must have no default (main-screen, "A
    // повернення is recorded in the category it returns to"). So the picker opens empty and asks.
    ...(carried === undefined || (to === 'refund' && carried === UNCATEGORISED_CATEGORY_ID)
      ? {}
      : { categoryId: carried }),
    ...(to === 'income' && t.type === 'income' ? { sourceId: t.sourceId } : {}),
  };
}

/**
 * Whether the «Без категорії» mark's «Це переказ» action is offered at all — a витрата only
 * (main-screen, "«Без категорії» is highlighted and categorised in one tap"). A повернення is
 * already money that left and came back; it is never a переказ, so its mark offers no such thing.
 */
export function offersTransferMark(t: Pick<Transaction, 'type'>): boolean {
  return t.type === 'expense';
}

/**
 * What editing opens on when reached through «Це переказ» from the feed mark: the same витрата,
 * already switched to переказ, keeping the рахунок it left and choosing no destination yet
 * (design D7). Anything else — no `as=transfer`, or a transaction that is not a витрата — opens on
 * its own stored shape unchanged. Pure and read-only: nothing here writes, which is what makes
 * "leaving without saving changes nothing" true by construction rather than by care taken later.
 */
export function initialShape(t: Pick<Transaction, 'type'>, as?: 'transfer'): RetypeShape {
  if (as === 'transfer' && t.type === 'expense') return 'transfer';
  // A `correction` never reaches this: `initialForm` gives it the опис-only form instead.
  return t.type === 'correction' ? 'expense' : t.type;
}

/** The editing form of every type but a коригування — the strings as typed. */
export interface TransactionForm {
  readonly shape: EntryType;
  readonly fromId: string;
  readonly toId: string;
  readonly amount: string;
  readonly arrived: string;
  readonly date: string;
  readonly categoryId?: string;
  readonly sourceId?: string;
  /** The опис as typed. Empty means none — `normaliseDescription` turns it back into `undefined`. */
  readonly description: string;
}

/**
 * A коригування's form: its опис and nothing else. Its сума, рахунок, дата and type are what
 * «Звірити» wrote and are read out, never offered for change (transactions, "A коригування opened
 * from a list shows what it did").
 */
export interface CorrectionForm {
  readonly shape: 'correction';
  readonly description: string;
}

export type EditingForm = TransactionForm | CorrectionForm;

/**
 * What editing opens on. A переказ opens on the сума that left and the account it left; retyping
 * it into a витрата therefore keeps exactly those, and drops the arrived leg. A коригування opens
 * on its опис alone. `as` is «Це переказ»'s own param: reached from the feed mark on a витрата, it
 * opens already switched to переказ with the source рахунок kept and no destination chosen —
 * `initialShape` decides whether this витрата honours it at all (design D7). `undefined` only when
 * there is no транзакція to open.
 */
export function initialForm(t: Transaction | undefined, as?: 'transfer'): EditingForm | undefined {
  if (!t) return undefined;
  const description = t.description ?? '';
  if (t.type === 'correction') {
    return { shape: 'correction', description };
  }
  const common = { toId: '', arrived: '', date: t.date, description };
  if (t.type === 'transfer') {
    return {
      ...common,
      shape: 'transfer',
      fromId: t.fromAccountId,
      toId: t.toAccountId,
      amount: formatMinorUnits(t.left.amount),
      arrived:
        t.left.currency === t.arrived.currency && t.left.amount === t.arrived.amount
          ? ''
          : formatMinorUnits(t.arrived.amount),
    };
  }
  if (initialShape(t, as) === 'transfer') {
    // «Це переказ»: opens as переказ, source рахунок kept, no destination — nothing written yet.
    return { ...common, shape: 'transfer', fromId: t.accountId, amount: formatMinorUnits(t.amount.amount) };
  }
  return {
    ...common,
    shape: t.type,
    fromId: t.accountId,
    amount: formatMinorUnits(t.amount.amount),
    ...(t.type === 'income' ? { sourceId: t.sourceId } : { categoryId: t.categoryId }),
  };
}

/**
 * What a коригування did, read out: its signed сума («−776,86 UAH»), its рахунок by name and its
 * дата in words («16 вересня»).
 */
export function correctionReadOut(
  t: Correction,
  accountNames: ReadonlyMap<string, string>,
  now: Date,
): { readonly amount: string; readonly account: string; readonly date: string } {
  return {
    amount: formatMoney(t.amount),
    account: accountLabel(t.accountId, accountNames),
    date: calendarLabel(t.date, now),
  };
}

/**
 * The same коригування carrying the опис as typed — trimmed, and an emptied field clearing it
 * rather than storing «». Its id, сума, рахунок and дата are the stored ones by construction.
 */
export function withCorrectedDescription(t: Correction, typed: string): Correction {
  const { description: _stored, ...rest } = t;
  const description = normaliseDescription(typed);
  return description === undefined ? rest : { ...rest, description };
}

/**
 * What deleting a коригування asks, naming the сума and the рахунок it goes from — the розрахунковий
 * баланс of that рахунок moves by exactly that сума once it is gone.
 */
export function correctionDeleteQuestion(
  t: Correction,
  accountNames: ReadonlyMap<string, string>,
): string {
  return `Коригування ${formatMoney(t.amount)} на «${accountLabel(t.accountId, accountNames)}» зникне зі стрічки й з історії рахунку.`;
}

/**
 * Which write a стore of a переказ needs: the shared pairing step (`counterpart-income-repo.ts`)
 * when the transaction being replaced was a витрата — a правило-переказ or a retype turning one
 * into a переказ for the first time — or was itself a переказ still awaiting its зустрічний дохід,
 * so saving an edit of it looks again (transactions, "Saving an edit of a переказ that still
 * awaits SHALL look again"). Every other write — a new переказ recorded by hand (no original at
 * all), or retyping *out of* a переказ into a витрата — goes through the plain write instead: a
 * переказ recorded by hand awaits nothing, and the awaiting flag lives only on a переказ row, so
 * writing anything else already leaves nothing awaiting (design D4, D5).
 */
export function transferWriteNeedsPairing(
  original: Transaction | undefined,
  written: Transaction,
): boolean {
  if (written.type !== 'transfer') return false;
  if (original === undefined) return false;
  if (original.type === 'expense') return true;
  return original.type === 'transfer' && original.awaitingCounterpartIncome === true;
}

/**
 * The same transaction under a category the owner just picked — what the feed's one tap stores.
 * Not a retype at all: the type, the id, the сума, the рахунок and the date are untouched, which
 * is exactly why "without the editing screen having opened" is true of it.
 *
 * The pick is required. An unanswered picker hands back `''`, and storing that would reference a
 * category no row has — the foreign key would refuse it with SQLite's own words.
 */
export function recategorise(t: Transaction, categoryId: string): Expense | Refund {
  if (t.type !== 'expense' && t.type !== 'refund') {
    throw new Refusal('категорію має лише витрата або повернення');
  }
  if (!categoryId) {
    throw new Refusal('оберіть категорію');
  }
  return t.type === 'refund'
    ? refund({
        id: t.id,
        date: t.date,
        accountId: t.accountId,
        amount: t.amount,
        categoryId,
        ...(t.description ? { description: t.description } : {}),
        ...(t.mcc !== undefined ? { mcc: t.mcc } : {}),
      })
    : expenseByDefault({
        id: t.id,
        date: t.date,
        accountId: t.accountId,
        amount: t.amount,
        categoryId,
        // The original-currency сума describes the витрата the bank charged; recategorising says
        // nothing about it, so it stays.
        ...(t.originalAmount ? { originalAmount: t.originalAmount } : {}),
        // The bank's text describes the money, not the category the owner just chose for it.
        ...(t.description ? { description: t.description } : {}),
        ...(t.mcc !== undefined ? { mcc: t.mcc } : {}),
      });
}

/**
 * The same дохід under a джерело the owner just picked — what the «Без джерела» mark's one tap
 * stores, on the feed and in «Транзакції» (main-screen, "A дохід «Без джерела» is given its
 * джерело in one tap"). `recategorise`'s twin: every field but the джерело stays as stored, and the
 * write is the editing screen's own plain save of a дохід.
 *
 * Only a дохід has a джерело: a повернення or a переказ that arrived looking like one is retyped
 * from its editing, never answered here. An unanswered picker hands back `''`, which is no pick.
 */
export function assignSource(t: Transaction, sourceId: string): Income {
  if (t.type !== 'income') {
    throw new Refusal('джерело має лише дохід');
  }
  if (!sourceId) {
    throw new Refusal('оберіть джерело');
  }
  return { ...t, sourceId };
}
