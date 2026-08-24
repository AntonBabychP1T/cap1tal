import type { Account, AccountKind } from '../domain/account';
import { FEES_CATEGORY_ID, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';

/**
 * The Ukrainian the owner reads. Reserved category ids are domain constants; these are their
 * display labels, named by the specs verbatim ("Без категорії", "Комісія"). The editable category
 * list arrives with categories-rules; until then these two are all there is to show.
 */
const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  [UNCATEGORISED_CATEGORY_ID]: 'Без категорії',
  [FEES_CATEGORY_ID]: 'Комісія',
};

export function categoryLabel(categoryId: string): string {
  return CATEGORY_LABELS[categoryId] ?? categoryId;
}

/** The вид of an account, as the Рахунки headings show it. */
const KIND_LABELS: Readonly<Record<AccountKind, string>> = {
  spending: 'Витратні',
  savings: 'Накопичувальні',
  investment: 'Інвестиційні',
  cash: 'Готівка',
  debt: 'Борги',
};

export function kindLabel(kind: AccountKind | 'archived'): string {
  return kind === 'archived' ? 'Архів' : KIND_LABELS[kind];
}

/** An account in a picker: its назва plus the currency, since two accounts may share a name. */
export function accountChoiceLabel(a: Account): string {
  return `${a.name} · ${a.currency}`;
}

/** What to show the owner when a write was refused. */
export function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The currencies an account can be opened in — FR-A1's set for v1. */
export const OFFERED_CURRENCIES = ['UAH', 'EUR', 'USD'] as const;
