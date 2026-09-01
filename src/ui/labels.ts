import type { Account, AccountKind } from '../domain/account';
import type { NameEvidence } from '../domain/name-match';
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
 * `sourceLabel` is the same function against the other list, and it exists for the reason this
 * module said it eventually would: monobank imports a дохід onto «Без джерела», and the feed has
 * to name that джерело or the owner cannot see which arrivals still need saying. The two lists are
 * separate namespaces — `gifts` names a category *and* a source — so it takes its own map rather
 * than sharing one.
 */
function labelOf(id: string, names: ReadonlyMap<string, string>): string {
  return names.get(id) ?? id;
}

export function categoryLabel(categoryId: string, names: ReadonlyMap<string, string>): string {
  return labelOf(categoryId, names);
}

export function sourceLabel(sourceId: string, names: ReadonlyMap<string, string>): string {
  return labelOf(sourceId, names);
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

/**
 * An account in a picker: its назва plus the currency, since two accounts may share a name.
 *
 * It takes the two fields rather than an `Account` so the Saldo import's merge list can label a
 * рахунок that does not exist yet — an entry's `becomes` — in the same breath as one that does.
 * One format for both halves of that list, so it cannot drift down the middle of one picker.
 */
export function accountChoiceLabel(a: Pick<Account, 'name' | 'currency'>): string {
  return `${a.name} · ${a.currency}`;
}

/**
 * Why the app proposed that two accounts are one, in the owner's words — the monobank link
 * proposals, and nothing else since `saldo-import-merge` withdrew the import's merge proposals.
 * A proposal the owner cannot see the reason for is one they can only accept on faith.
 */
const EVIDENCE_LABELS: Readonly<Record<NameEvidence, string>> = {
  digits: 'збігаються останні цифри',
  'same-name': 'та сама назва',
  contains: 'назва збігається',
  word: 'спільне слово в назві',
};

export function evidenceLabel(evidence: NameEvidence): string {
  return EVIDENCE_LABELS[evidence];
}

/** What to show the owner when a write was refused. */
export function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The currencies an account can be opened in — FR-A1's set for v1. */
export const OFFERED_CURRENCIES = ['UAH', 'EUR', 'USD'] as const;

/**
 * The Ukrainian three-form plural, in one place: 1 and anything ending in 1 take the singular,
 * 2–4 the few form, everything else the many form — and 11–14 take the many form whatever they
 * end in. Written once because two hand-rolled two-form guesses in one app is how «2 рахунків»
 * happens. It lives here, and not on the first screen that needed it, because the second one
 * («Бекап») counts the same two things.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const lastTwo = Math.abs(n) % 100;
  const last = lastTwo % 10;
  if (lastTwo >= 11 && lastTwo <= 14) {
    return many;
  }
  if (last === 1) {
    return one;
  }
  return last >= 2 && last <= 4 ? few : many;
}

/** 1 транзакція, 2–4 транзакції, 5 and the rest транзакцій, with the teens exempt. */
export function transactionCount(n: number): string {
  return `${n} ${plural(n, 'транзакція', 'транзакції', 'транзакцій')}`;
}

/** The same three forms for «рахунок». */
export function accountCount(n: number): string {
  return `${n} ${plural(n, 'рахунок', 'рахунки', 'рахунків')}`;
}
