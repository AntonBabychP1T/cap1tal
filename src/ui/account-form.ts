import { account, type Account, type AccountKind } from '../domain/account';
import type { IsoDate } from '../domain/transaction';
import { formatMinorUnits, parseOpeningBalance } from './amount-input';
import { parseTypedDate } from './dates';
import { isRefusal, Refusal } from '../domain/refusal';

/**
 * The рахунок form's own rules, pure so both screens that render it obey one set. Creating happens
 * on Рахунки and editing on a рахунок's рухи; two inlined copies of «рахунок потребує назви» and
 * of the opening-balance parse would be two chances for them to disagree about what a рахунок is.
 */

/** A рахунок being created, or an existing one being edited. */
export interface AccountDraft {
  /** The рахунок this draft edits; absent while creating one. */
  readonly editing?: Account;
  name: string;
  kind: AccountKind;
  currency: string;
  /** The opening balance in major units, as typed. Empty means zero. */
  opening: string;
  /**
   * «Станом на»: the дата початкового залишку as typed — today on a new рахунок, the stored one (or
   * nothing) on an edit (accounts-screen, "«Станом на» is set beside the початковий залишок").
   */
  openingDate: string;
}

/** A new рахунок: the вид the owner reaches for most, in the owner's own currency, dated today. */
export function blankDraft(today: IsoDate): AccountDraft {
  return { name: '', kind: 'spending', currency: 'UAH', opening: '', openingDate: today };
}

/**
 * An existing рахунок as a draft. The opening balance is shown in major units so the owner edits
 * what they see, and a zero one stays an empty field rather than reading as a typed «0,00».
 */
export function draftFrom(a: Account): AccountDraft {
  return {
    editing: a,
    name: a.name,
    kind: a.kind,
    currency: a.currency,
    opening: a.openingBalance.amount === 0 ? '' : formatMinorUnits(a.openingBalance.amount),
    openingDate: a.openingDate ?? '',
  };
}

/**
 * Whether «станом на» is shown: beside a nonzero початковий залишок only — a рахунок opened at zero
 * has no balance to date, and still records the day it was created. A сума still being typed that
 * does not parse yet counts as nonzero, so the field does not flicker away under the owner's thumb.
 */
export function showsOpeningDate(draft: Pick<AccountDraft, 'opening' | 'currency'>): boolean {
  if (draft.opening.trim() === '') return false;
  try {
    return parseOpeningBalance(draft.opening, draft.currency).amount !== 0;
  } catch {
    return true;
  }
}

const FUTURE_OPENING_DATE = 'дата початкового залишку не може бути в майбутньому';

/**
 * The «станом на» typed, as a дата — `undefined` when the field is empty — or the refusal that
 * explains why it is not one: not a дата, or a day after today.
 */
function typedOpeningDate(draft: AccountDraft, today: IsoDate): IsoDate | undefined {
  if (draft.openingDate.trim() === '') return undefined;
  const date = parseTypedDate(draft.openingDate);
  if (date > today) throw new Refusal(FUTURE_OPENING_DATE);
  return date;
}

/** The sentence under «станом на» while what is typed there cannot be saved; none while it can. */
export function openingDateProblem(draft: AccountDraft, today: IsoDate): string | undefined {
  if (!showsOpeningDate(draft)) return undefined;
  try {
    typedOpeningDate(draft, today);
    return undefined;
  } catch (error) {
    return isRefusal(error) ? error.message : undefined;
  }
}

/**
 * What the draft would save, or the refusal that stops it. A рахунок with no назва cannot be told
 * apart from any other on any picker in the app, so an empty one is refused in the owner's words
 * before anything reaches storage; the назва is stored trimmed. The вид, the currency and whether
 * it is archived come from the рахунок being edited — the form disables the first two and archiving
 * is its own action, so editing may never quietly change either.
 */
export function accountFromDraft(draft: AccountDraft, id: string, today: IsoDate): Account {
  if (draft.name.trim() === '') {
    throw new Refusal('рахунок потребує назви');
  }
  const openingBalance = parseOpeningBalance(draft.opening, draft.currency);
  // Beside a nonzero opening the typed «станом на» is the дата; a zero opening shows no field and
  // keeps whatever the рахунок had — a new one is dated its creation day by the repository.
  const openingDate =
    openingBalance.amount !== 0 ? typedOpeningDate(draft, today) : draft.editing?.openingDate;
  return account({
    id: draft.editing?.id ?? id,
    name: draft.name.trim(),
    kind: draft.kind,
    currency: draft.currency,
    openingBalance,
    ...(openingDate !== undefined ? { openingDate } : {}),
    archived: draft.editing?.archived ?? false,
  });
}
