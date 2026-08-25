import type { Account, AccountKind } from '../domain/account';
import type { TransactionType } from '../domain/transaction';

/**
 * The Ukrainian the owner reads. A category's or a source's name is no longer knowledge this
 * module holds — it is a row of the owner's own editable list, loaded by the screen and passed
 * in as an id→name map (`namesById` in src/domain/category.ts). The three reserved rows are in
 * that map like any other, seeded under the ids the domain fixes.
 *
 * A stored id the map misses shows itself rather than disappearing. That can only be transient —
 * every stored id has a row — but the fallback is what keeps a half-loaded screen honest instead
 * of blank.
 *
 * There is no `sourceLabel` twin: nothing displays a джерело by id. The feed line names the type
 * and the рахунок, the pickers show the rows themselves, and no requirement asks for more. When
 * the importers of steps 6–8 need one, it is this function with the sources map — the two lists
 * are separate namespaces (`gifts` names a category *and* a source), so it will want its own name
 * then, and not before.
 */
export function categoryLabel(categoryId: string, names: ReadonlyMap<string, string>): string {
  return names.get(categoryId) ?? categoryId;
}

/**
 * How the owner's own lists are ordered wherever they are shown: by name, the way Ukrainian
 * orders names, then by id so the order is total. The id matters because two rows may legally
 * share a name — the uniqueness rule is "another *unarchived* row", so an archived «Pets» can sit
 * beside a live one — and without it SQLite's sorter decides which comes first.
 */
export function byName(a: { name: string; id: string }, b: { name: string; id: string }): number {
  return a.name.localeCompare(b.name, 'uk') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * The five transaction types in the owner's words — the glossary's own, verbatim. One list,
 * because a feed row, the recording form and the retype menu all name the same five things and
 * three lists would drift.
 */
const TYPE_LABELS: Readonly<Record<TransactionType, string>> = {
  expense: 'витрата',
  income: 'дохід',
  transfer: 'переказ',
  refund: 'повернення',
  correction: 'коригування',
};

export function transactionTypeLabel(type: TransactionType): string {
  return TYPE_LABELS[type];
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

/**
 * Every вид as a pickable choice, in the order the glossary lists them. One list, because two
 * screens ask the same question — creating a рахунок, and saying what a Saldo account becomes —
 * and a вид that existed on one and not the other would be a вид the owner could not choose.
 */
export const KIND_CHOICES: readonly { readonly value: AccountKind; readonly label: string }[] = (
  ['spending', 'savings', 'investment', 'cash', 'debt'] as const
).map((kind) => ({ value: kind, label: kindLabel(kind) }));

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
