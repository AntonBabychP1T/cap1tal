import type { Account } from '../domain/account';
import type { Category } from '../domain/category';
import {
  PERIODICITIES,
  commitmentProblems,
  normaliseMarker,
  type Commitment,
  type CommitmentField,
  type CommitmentInput,
  type Periodicity,
} from '../domain/commitments';
import { Refusal, isRefusal } from '../domain/refusal';
import type { IsoDate } from '../domain/transaction';
import { formatMinorUnits, parseAmount } from './amount-input';
import { parseTypedDate } from './dates';

/**
 * The create/edit form of a зобов'язання, with none of its JSX (commitments-screen, "The
 * зобов'язання form starts monthly and refuses in Ukrainian"). It starts monthly on today, offers
 * only unarchived рахунки of any currency, types the сума in the chosen рахунок's currency, and says
 * every refusal beside the field it concerns. The сума is typed in major units, the way a сума is
 * typed when recording.
 */

/** What the form holds while the owner types — every field as typed. */
export interface CommitmentDraft {
  readonly name: string;
  readonly amount: string;
  readonly periodicity: Periodicity;
  readonly firstDue: string;
  readonly debitAccountId: string;
  /** Empty for none. */
  readonly categoryId: string;
  /** The ознака as typed; empty for none. */
  readonly marker: string;
}

/** The form's labels, in the order it asks. */
export const COMMITMENT_FIELD_LABELS: Readonly<Record<CommitmentField, string>> = {
  name: 'Назва',
  amount: 'Сума',
  periodicity: 'Як часто',
  firstDue: 'Дата першого платежу',
  debitAccount: 'Рахунок списання',
  category: 'Категорія',
  marker: 'Текст в описі списання',
};

/** «Як часто», as four chips. */
export const PERIODICITY_CHOICES: readonly { readonly value: Periodicity; readonly label: string }[] = [
  { value: 'monthly', label: 'Щомісяця' },
  { value: 'quarterly', label: 'Щокварталу' },
  { value: 'halfYearly', label: 'Щопівроку' },
  { value: 'yearly', label: 'Щороку' },
];

/** Under «Дата першого платежу»: an old дата links old витрати, and the rest read «не знайдено». */
export const FIRST_DUE_HINT = 'Платежі до сьогодні шукатимуться серед уже записаних витрат.';

/** Under «Текст в описі списання»: what filling it changes. */
export const MARKER_HINT =
  'Якщо заповнено, списання впізнається за цим текстом в описі банку, хоч би яка була сума. ' +
  'Без нього — лише за точною сумою.';

/** A new form: «Щомісяця», the дата першого платежу today, nothing else filled. */
export function newCommitmentDraft(today: IsoDate, debitAccounts: readonly Account[]): CommitmentDraft {
  return {
    name: '',
    amount: '',
    periodicity: PERIODICITIES[0]!,
    firstDue: today,
    // The one рахунок there is to choose, chosen; with several, the owner picks.
    debitAccountId: debitAccounts.length === 1 ? debitAccounts[0]!.id : '',
    categoryId: '',
    marker: '',
  };
}

/** The form opened on a stored зобов'язання: every value is the owner's already. */
export function commitmentDraftOf(commitment: Commitment): CommitmentDraft {
  return {
    name: commitment.name,
    amount: formatMinorUnits(commitment.amount),
    periodicity: commitment.periodicity,
    firstDue: commitment.firstDue,
    debitAccountId: commitment.debitAccountId,
    categoryId: commitment.categoryId ?? '',
    marker: commitment.marker ?? '',
  };
}

/** The рахунки a зобов'язання can be debited from: every unarchived one, of any currency. */
export function commitmentAccountChoices(accounts: readonly Account[]): Account[] {
  return accounts.filter((a) => !a.archived);
}

/** The категорії offered: unarchived ones. */
export function commitmentCategoryChoices(categories: readonly Category[]): Category[] {
  return categories.filter((c) => !c.archived);
}

/**
 * The currency the сума is typed in — the chosen рахунок's — shown beside the field; `undefined`
 * while no рахунок is chosen.
 */
export function draftCurrency(draft: CommitmentDraft, accounts: readonly Account[]): string | undefined {
  return accounts.find((a) => a.id === draft.debitAccountId)?.currency;
}

/** One field changed. A typed сума is shown the way a сума reads back once the owner moves on. */
export function editCommitmentDraft(
  draft: CommitmentDraft,
  change: Partial<CommitmentDraft>,
  accounts: readonly Account[],
): CommitmentDraft {
  const next: CommitmentDraft = { ...draft, ...change };
  if (change.amount === undefined) {
    const currency = draftCurrency(next, accounts) ?? 'UAH';
    try {
      return { ...next, amount: formatMinorUnits(parseAmount(next.amount, currency).amount) };
    } catch {
      return next;
    }
  }
  return next;
}

/** What the refusals need of the world around the form. */
export interface CommitmentFormContext {
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  /** The stored зобов'язання being edited, where it is one. */
  readonly existing?: Commitment;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The values the draft stands for and every refusal it meets, one per field — the parse of each
 * field first, then the domain's rules over what parsed (commitments, "A зобов'язання holds what is
 * paid, how often and from where").
 */
export function commitmentDraftProblems(
  draft: CommitmentDraft,
  context: CommitmentFormContext,
): { readonly input: CommitmentInput; readonly problems: Partial<Record<CommitmentField, string>> } {
  const problems: Partial<Record<CommitmentField, string>> = {};
  const account = context.accounts.find((a) => a.id === draft.debitAccountId);
  const currency = account?.currency ?? 'UAH';
  let amount = 0;
  try {
    amount = parseAmount(draft.amount, currency).amount;
  } catch (error) {
    problems.amount =
      draft.amount.trim() === ''
        ? 'Вкажіть суму одного платежу.'
        : isRefusal(error)
          ? capitalised(error.message)
          : 'Сума завелика.';
  }
  let firstDue = '';
  try {
    firstDue = parseTypedDate(draft.firstDue);
  } catch (error) {
    problems.firstDue = isRefusal(error) ? capitalised(error.message) : 'Вкажіть дату першого платежу.';
  }
  const marker = normaliseMarker(draft.marker);
  const input: CommitmentInput = {
    name: draft.name,
    amount,
    periodicity: draft.periodicity,
    firstDue,
    debitAccountId: draft.debitAccountId,
    ...(draft.categoryId === '' ? {} : { categoryId: draft.categoryId }),
    ...(marker === undefined ? {} : { marker }),
  };
  const category = context.categories.find((c) => c.id === draft.categoryId);
  for (const problem of commitmentProblems(input, {
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
 * The form's one decision: a зобов'язання to store, or the first refusal — nothing is stored while
 * any stands. A new one is recorded `now`; an edit keeps its id, its moment and its дата
 * припинення. The currency is the рахунок's own.
 */
export function commitmentFromDraft(
  draft: CommitmentDraft,
  context: CommitmentFormContext & { readonly id: string; readonly now: Date },
): Commitment {
  const { input, problems } = commitmentDraftProblems(draft, context);
  const first = (Object.keys(COMMITMENT_FIELD_LABELS) as CommitmentField[]).find(
    (field) => problems[field] !== undefined,
  );
  if (first !== undefined) {
    throw new Refusal(problems[first]!);
  }
  const account = context.accounts.find((a) => a.id === input.debitAccountId)!;
  return {
    id: context.id,
    name: input.name.trim(),
    amount: input.amount,
    currency: account.currency,
    periodicity: draft.periodicity,
    firstDue: input.firstDue,
    debitAccountId: input.debitAccountId,
    ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
    ...(input.marker === undefined ? {} : { marker: input.marker }),
    recordedAt: context.existing?.recordedAt ?? context.now.getTime(),
    ...(context.existing?.stoppedOn === undefined ? {} : { stoppedOn: context.existing.stoppedOn }),
  };
}
