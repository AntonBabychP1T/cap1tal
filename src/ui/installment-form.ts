import { capitalised } from '../domain/fold';
import type { Account } from '../domain/account';
import type { Category } from '../domain/category';
import {
  INSTALLMENT_CURRENCY,
  installmentProblems,
  partsDueBefore,
  splitInstallment,
  type Installment,
  type InstallmentField,
  type InstallmentInput,
} from '../domain/installments';
import { Refusal, isRefusal } from '../domain/refusal';
import type { IsoDate } from '../domain/transaction';
import { formatMinorUnits, parseAmount } from './amount-input';
import { parseTypedDate } from './dates';
import { byName } from './labels';
import { sameFields } from './same-fields';

/**
 * The create/edit form of a розстрочка, with none of its JSX (installments-screen, "The form fills
 * in what it can and refuses in Ukrainian"). It fills the щомісячний платіж with the even split
 * until the owner types one, counts the платежі already behind the дата першого платежу until the
 * owner sets that number, offers only unarchived UAH рахунки, and says every refusal beside the
 * field it concerns. The sums are typed in major units, the way a сума is typed when recording.
 */

/** What the form holds while the owner types — every field as typed. */
export interface InstallmentDraft {
  readonly name: string;
  readonly total: string;
  readonly partsCount: string;
  readonly part: string;
  /** The owner typed the щомісячний платіж: it is theirs, and nothing fills it any more. */
  readonly partTyped: boolean;
  readonly firstDue: string;
  readonly debitAccountId: string;
  readonly paidBefore: string;
  /** The owner set «Вже сплачено платежів»: it no longer follows the дата and the кількість. */
  readonly paidBeforeTyped: boolean;
  /** Empty for none. */
  readonly categoryId: string;
}

/** The form's labels, in the order it asks. */
export const INSTALLMENT_FIELD_LABELS: Readonly<Record<InstallmentField, string>> = {
  name: 'Що куплено',
  total: 'Повна сума',
  partsCount: 'Кількість платежів',
  part: 'Щомісячний платіж',
  firstDue: 'Дата першого платежу',
  debitAccount: 'Рахунок списання',
  paidBefore: 'Вже сплачено платежів',
  category: 'Категорія',
};

/** A new form: the дата першого платежу is today, nothing else is filled. */
export function newInstallmentDraft(today: IsoDate, debitAccounts: readonly Account[]): InstallmentDraft {
  return {
    name: '',
    total: '',
    partsCount: '',
    part: '',
    partTyped: false,
    firstDue: today,
    // The one рахунок there is to choose, chosen; with several, the owner picks.
    debitAccountId: debitAccounts.length === 1 ? debitAccounts[0]!.id : '',
    paidBefore: '0',
    paidBeforeTyped: false,
    categoryId: '',
  };
}

/**
 * Whether the form still holds what it opened on, for «Відкинути зміни?» (app-shell). The two
 * "typed by hand" flags are the form's bookkeeping, not something the owner sees: a платіж typed
 * and erased again leaves the flag set and every field as it was, which is no change.
 */
export function sameInstallmentFields(current: InstallmentDraft, opened: InstallmentDraft): boolean {
  const flagsAside = { partTyped: false, paidBeforeTyped: false };
  return sameFields({ ...current, ...flagsAside }, { ...opened, ...flagsAside });
}

/** The form opened on a stored розстрочка: every value is the owner's already. */
export function installmentDraftOf(installment: Installment): InstallmentDraft {
  return {
    name: installment.name,
    total: formatMinorUnits(installment.total),
    partsCount: String(installment.partsCount),
    part: formatMinorUnits(installment.part),
    partTyped: true,
    firstDue: installment.firstDue,
    debitAccountId: installment.debitAccountId,
    paidBefore: String(installment.paidBefore),
    paidBeforeTyped: true,
    categoryId: installment.categoryId ?? '',
  };
}

/** The рахунки a розстрочка can be debited from: unarchived and in гривнях, by name. */
export function debitAccountChoices(accounts: readonly Account[]): Account[] {
  return accounts.filter((a) => !a.archived && a.currency === INSTALLMENT_CURRENCY).sort(byName);
}

/** The категорії offered: unarchived ones, by name. */
export function installmentCategoryChoices(categories: readonly Category[]): Category[] {
  return categories.filter((c) => !c.archived).sort(byName);
}

function amountOf(typed: string): number | undefined {
  try {
    return parseAmount(typed, INSTALLMENT_CURRENCY).amount;
  } catch {
    return undefined;
  }
}

function countOf(typed: string): number | undefined {
  const trimmed = typed.trim();
  return /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : undefined;
}

function dateOf(typed: string): IsoDate | undefined {
  try {
    return parseTypedDate(typed);
  } catch {
    return undefined;
  }
}

/**
 * One field changed. The щомісячний платіж follows the повна сума and the кількість until the owner
 * types it; «Вже сплачено платежів» follows the дата and the кількість until the owner sets it. A
 * typed платіж is shown in the form a сума reads back in («1050» → «1050,00») once the owner moves
 * on to another field.
 */
export function editInstallmentDraft(
  draft: InstallmentDraft,
  change: Partial<
    Pick<
      InstallmentDraft,
      'name' | 'total' | 'partsCount' | 'part' | 'firstDue' | 'debitAccountId' | 'paidBefore' | 'categoryId'
    >
  >,
  today: IsoDate,
): InstallmentDraft {
  let next: InstallmentDraft = {
    ...draft,
    ...change,
    ...(change.part !== undefined ? { partTyped: true } : {}),
    ...(change.paidBefore !== undefined ? { paidBeforeTyped: true } : {}),
  };
  if (change.part === undefined && next.partTyped) {
    const typed = amountOf(next.part);
    if (typed !== undefined) {
      next = { ...next, part: formatMinorUnits(typed) };
    }
  }
  if (!next.partTyped && (change.total !== undefined || change.partsCount !== undefined)) {
    const total = amountOf(next.total);
    const count = countOf(next.partsCount);
    next = {
      ...next,
      part: total !== undefined && count !== undefined && count > 0
        ? formatMinorUnits(splitInstallment(total, count).part)
        : '',
    };
  }
  if (!next.paidBeforeTyped && (change.firstDue !== undefined || change.partsCount !== undefined)) {
    const firstDue = dateOf(next.firstDue);
    const count = countOf(next.partsCount);
    if (firstDue !== undefined) {
      next = {
        ...next,
        paidBefore: String(partsDueBefore(firstDue, count ?? Number.MAX_SAFE_INTEGER, today)),
      };
    }
  }
  return next;
}

/** «Останній платіж» with its сума, shown only when the last differs from the щомісячний. */
export function lastPartOf(draft: InstallmentDraft): string | undefined {
  const total = amountOf(draft.total);
  const count = countOf(draft.partsCount);
  const part = amountOf(draft.part);
  if (total === undefined || count === undefined || count < 2 || part === undefined) {
    return undefined;
  }
  const { last } = splitInstallment(total, count, part);
  return last > 0 && last !== part ? formatMinorUnits(last) : undefined;
}

/** What the refusals need of the world around the form. */
export interface InstallmentFormContext {
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  /** The stored розстрочка being edited, where it is one. */
  readonly existing?: Installment;
}

function parsedAmount(
  typed: string,
  field: InstallmentField,
  problems: Partial<Record<InstallmentField, string>>,
): number {
  try {
    return parseAmount(typed, INSTALLMENT_CURRENCY).amount;
  } catch (error) {
    problems[field] = typed.trim() === ''
      ? `Вкажіть: ${INSTALLMENT_FIELD_LABELS[field].toLowerCase()}.`
      : isRefusal(error)
        ? capitalised(error.message)
        : 'Сума завелика.';
    return 0;
  }
}

/**
 * The values the draft stands for and every refusal it meets, one per field — the parse of each
 * field first, then the domain's rules over what parsed (installments, "A розстрочка holds what the
 * owner bought and how it is paid").
 */
export function installmentDraftProblems(
  draft: InstallmentDraft,
  context: InstallmentFormContext,
): { readonly input: InstallmentInput; readonly problems: Partial<Record<InstallmentField, string>> } {
  const problems: Partial<Record<InstallmentField, string>> = {};
  const total = parsedAmount(draft.total, 'total', problems);
  const part = parsedAmount(draft.part, 'part', problems);
  const count = countOf(draft.partsCount);
  const paidBefore = countOf(draft.paidBefore);
  let firstDue = '';
  try {
    firstDue = parseTypedDate(draft.firstDue);
  } catch (error) {
    problems.firstDue = isRefusal(error) ? capitalised(error.message) : 'Вкажіть дату першого платежу.';
  }
  const input: InstallmentInput = {
    name: draft.name,
    total,
    partsCount: count ?? 0,
    part,
    firstDue,
    debitAccountId: draft.debitAccountId,
    paidBefore: paidBefore ?? -1,
    ...(draft.categoryId === '' ? {} : { categoryId: draft.categoryId }),
  };
  const account = context.accounts.find((a) => a.id === draft.debitAccountId);
  const category = context.categories.find((c) => c.id === draft.categoryId);
  for (const problem of installmentProblems(input, {
    ...(account ? { account } : {}),
    ...(category ? { category } : {}),
    ...(context.existing
      ? {
          existing: {
            debitAccountId: context.existing.debitAccountId,
            ...(context.existing.categoryId === undefined ? {} : { categoryId: context.existing.categoryId }),
          },
        }
      : {}),
  })) {
    problems[problem.field] ??= problem.message;
  }
  return { input, problems };
}

/**
 * The form's one decision: a розстрочка to store, or the first refusal — nothing is stored while
 * any stands. A new one is recorded `now`; an edit keeps its id, its moment and its closing.
 */
export function installmentFromDraft(
  draft: InstallmentDraft,
  context: InstallmentFormContext & { readonly id: string; readonly now: Date },
): Installment {
  const { input, problems } = installmentDraftProblems(draft, context);
  const first = (Object.keys(INSTALLMENT_FIELD_LABELS) as InstallmentField[]).find(
    (field) => problems[field] !== undefined,
  );
  if (first !== undefined) {
    throw new Refusal(problems[first]!);
  }
  return {
    id: context.id,
    name: input.name.trim(),
    total: input.total,
    partsCount: input.partsCount,
    part: input.part,
    firstDue: input.firstDue,
    debitAccountId: input.debitAccountId,
    paidBefore: input.paidBefore,
    ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
    recordedAt: context.existing?.recordedAt ?? context.now.getTime(),
    ...(context.existing?.closedOn === undefined ? {} : { closedOn: context.existing.closedOn }),
  };
}
