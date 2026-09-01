import { account, type Account, type AccountKind } from '../domain/account';
import { formatMinorUnits, parseOpeningBalance } from './amount-input';

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
}

/** A new рахунок: the вид the owner reaches for most, in the owner's own currency. */
export function blankDraft(): AccountDraft {
  return { name: '', kind: 'spending', currency: 'UAH', opening: '' };
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
  };
}

/**
 * What the draft would save, or the refusal that stops it. A рахунок with no назва cannot be told
 * apart from any other on any picker in the app, so an empty one is refused in the owner's words
 * before anything reaches storage; the назва is stored trimmed. The вид, the currency and whether
 * it is archived come from the рахунок being edited — the form disables the first two and archiving
 * is its own action, so editing may never quietly change either.
 */
export function accountFromDraft(draft: AccountDraft, id: string): Account {
  if (draft.name.trim() === '') {
    throw new Error('рахунок потребує назви');
  }
  return account({
    id: draft.editing?.id ?? id,
    name: draft.name.trim(),
    kind: draft.kind,
    currency: draft.currency,
    openingBalance: parseOpeningBalance(draft.opening, draft.currency),
    archived: draft.editing?.archived ?? false,
  });
}
