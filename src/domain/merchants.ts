import { foldCase, occursAtWordStart } from './fold';
import { Refusal } from './refusal';

/**
 * A **продавець**: the owner's one name — «АТБ» — behind every way a bank spells a shop, with the
 * **написання** it is recognised by in an опис (glossary, "Продавець", "Написання"; merchants
 * capability).
 *
 * Nothing about a продавець is stored on a транзакція. What a транзакція's опис is recognised as is
 * read from the опис whenever it is read (design M1), so adding one написання re-reads the whole
 * history at once, and there is nothing on a транзакція to keep in step.
 */
export interface MerchantSpelling {
  readonly id: string;
  /** Trimmed and folded with `foldCase`, the same fold the правила match with (design M2). */
  readonly spelling: string;
  /** When it was added: the newest написання decides a tie between two of equal length. */
  readonly addedAt: Date;
}

export interface Merchant {
  readonly id: string;
  /** The назва, as the owner wrote it, trimmed. */
  readonly name: string;
  /** One or more; a продавець with nothing to recognise it by does not exist. */
  readonly spellings: readonly MerchantSpelling[];
  readonly createdAt: Date;
}

/**
 * What makes two назви the same назва: letter case and surrounding whitespace do not count. Storage
 * keeps it as `name_key`, because SQLite's `lower()` folds ASCII only (design M5).
 */
export function merchantNameKey(name: string): string {
  return foldCase(name.trim());
}

/** A написання as it is stored and compared: trimmed and folded. */
export function foldSpelling(text: string): string {
  return foldCase(text).trim();
}

/** The trimmed назва, or a refusal the owner reads when nothing is left of it. */
export function checkMerchantName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') throw new Refusal('Назва продавця не може бути порожньою');
  return trimmed;
}

/** The folded написання, or a refusal the owner reads when nothing is left of it. */
export function checkSpelling(text: string): string {
  const folded = foldSpelling(text);
  if (folded === '') throw new Refusal('Написання не може бути порожнім');
  return folded;
}

/**
 * The one place a `Merchant` is built: the назва trimmed and not blank, at least one написання, each
 * folded and not blank, and no написання twice. Uniqueness across продавці is storage's question
 * (`merchantsRepo`), since only storage holds the others.
 */
export function merchant(input: {
  id: string;
  name: string;
  spellings: readonly { id: string; spelling: string; addedAt: Date }[];
  createdAt: Date;
}): Merchant {
  const name = checkMerchantName(input.name);
  if (input.spellings.length === 0) {
    throw new Refusal('Продавцю потрібне хоча б одне написання');
  }
  const seen = new Set<string>();
  const spellings = input.spellings.map((s) => {
    const spelling = checkSpelling(s.spelling);
    if (seen.has(spelling)) throw new Refusal(`Написання «${spelling}» вказано двічі`);
    seen.add(spelling);
    return { id: s.id, spelling, addedAt: s.addedAt };
  });
  return { id: input.id, name, spellings, createdAt: input.createdAt };
}

/** What an опис is recognised as: the продавець, its назва, and the написання that decided it. */
export interface Recognition {
  readonly merchantId: string;
  readonly name: string;
  readonly spelling: string;
}

/**
 * Every написання of the продавці one read loaded, ready to recognise описи (design M1). Every
 * reader — lines, search, правила, the пакет, «Без продавця» — takes one as a value, the way it
 * takes the правила, so one опис gets one answer everywhere.
 */
export interface MerchantIndex {
  /** The продавці it was built from, in the order they were given. */
  readonly merchants: readonly Merchant[];
  /**
   * The продавець holding the longest написання that occurs in the folded опис; of two of equal
   * length the one added more recently; nothing when none occurs or there is no опис.
   */
  recognise(description: string | undefined): Recognition | undefined;
}

interface IndexedSpelling {
  readonly spelling: string;
  readonly addedAt: number;
  readonly id: string;
  readonly recognition: Recognition;
}

/**
 * Sorted once, longest first, then newest, then the greater id — so the first написання the folded
 * опис contains is the answer, and that answer never depends on the order the rows were read in.
 *
 * The answer is memoised per опис string: a history of 10 000 транзакції carries a few hundred
 * distinct описи, so a read costs about (distinct описи × написання) substring checks once plus a
 * map lookup per row. Build an index per read; it never sees a later написання.
 *
 * Case is all that is folded and nothing is transliterated (design M2): the matcher is the one the
 * правила use, so a продавець-правило and a pattern-правило with the same text can never disagree.
 */
export function merchantIndex(merchants: readonly Merchant[]): MerchantIndex {
  const ordered: IndexedSpelling[] = [];
  for (const m of merchants) {
    for (const s of m.spellings) {
      // A blank написання would be a wildcard — '' occurs in every опис. Storage and the restore
      // validator refuse one; should it reach here anyway it recognises nothing.
      if (s.spelling === '') continue;
      ordered.push({
        spelling: s.spelling,
        addedAt: s.addedAt.getTime(),
        id: s.id,
        recognition: { merchantId: m.id, name: m.name, spelling: s.spelling },
      });
    }
  }
  ordered.sort(
    (a, b) =>
      b.spelling.length - a.spelling.length ||
      b.addedAt - a.addedAt ||
      (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
  const memo = new Map<string, Recognition | null>();
  return {
    merchants,
    recognise(description) {
      if (description === undefined || description === '') return undefined;
      const known = memo.get(description);
      if (known !== undefined) return known ?? undefined;
      const folded = foldCase(description);
      const found = ordered.find((s) => occursAtWordStart(folded, s.spelling))?.recognition;
      memo.set(description, found ?? null);
      return found;
    },
  };
}

/** The index of no продавці: recognises nothing. What a fresh device starts with. */
export const NO_MERCHANTS: MerchantIndex = merchantIndex([]);

/**
 * The bank's leading service words (design M4): what an опис often starts with before the name of
 * whoever was paid. Longest first, compared folded.
 */
export const SERVICE_WORDS: readonly string[] = [
  'оплата послуг',
  'оплата товарів',
  'оплата',
  'покупка',
  'списання',
  'oplata poslug',
  'oplata tovariv',
  'oplata',
  'pokupka',
  'spysannia',
  'spysannya',
  'payment',
  'purchase',
  'pos',
].sort((a, b) => b.length - a.length);

/**
 * Payment processors whose name the bank writes before a «*» and the name of whoever was paid
 * («LIQPAY*…», «GOOGLE *…»). Compared folded (merchants spec, step 3).
 */
export const PROCESSOR_PREFIXES: readonly string[] = [
  'liqpay',
  'wfp',
  'google',
  'paypal',
  'fondy',
  'portmone',
  'ipay',
  'sumup',
];

/** Optional spaces, the «*», any spaces after it, and something else after those. */
const PROCESSOR_STAR = /^\s*\*\s*(?=\S)/u;

/** Whitespace or punctuation, then something that is neither. */
const AFTER_SERVICE_WORD = /^[\s\p{P}]+(?=[^\s\p{P}])/u;
const LEADING_LETTERS = /^\p{L}[\p{L}\s]*/u;
const TWO_WORDS = /^\S+(?:\s+\S+)?/u;

/**
 * The опис with one leading service word skipped, when there is something after it. Only the
 * longest service word the опис begins with is considered: «Оплата послуг» alone keeps itself rather
 * than losing «Оплата» to the shorter word.
 */
function skipServiceWord(trimmed: string): string {
  const folded = foldCase(trimmed);
  const word = SERVICE_WORDS.find((w) => folded.startsWith(w));
  if (word === undefined) return trimmed;
  // Sliced from the опис as written; a character whose fold changes length cannot spell a service
  // word, so the slice is the same text, and a mismatch means there is nothing to skip.
  if (foldCase(trimmed.slice(0, word.length)) !== word) return trimmed;
  const rest = trimmed.slice(word.length);
  const separator = AFTER_SERVICE_WORD.exec(rest)?.[0];
  return separator === undefined ? trimmed : rest.slice(separator.length);
}

/**
 * What remains with a payment processor's name, the spaces around its «*» and the «*» skipped, when
 * anything else follows. «Uklon *trip» keeps itself: «uklon» is not a processor.
 */
function skipProcessorPrefix(remainder: string): string {
  const folded = foldCase(remainder);
  const name = PROCESSOR_PREFIXES.find((p) => folded.startsWith(p));
  if (name === undefined) return remainder;
  if (foldCase(remainder.slice(0, name.length)) !== name) return remainder;
  const rest = remainder.slice(name.length);
  const star = PROCESSOR_STAR.exec(rest)?.[0];
  return star === undefined ? remainder : rest.slice(star.length);
}

/** «СІЛЬПО» → «Сільпо»; «АТБ», three letters, stays as it is. */
function titleCaseShouting(name: string): string {
  return name.replace(/\p{L}+/gu, (word) => {
    const letters = [...word];
    if (letters.length <= 3) return word;
    if (word !== word.toUpperCase() || word === word.toLowerCase()) return word;
    return letters[0] + letters.slice(1).join('').toLowerCase();
  });
}

/**
 * The назва and написання offered when a продавець is named from an опис (merchants, "A назва and a
 * написання are proposed from an опис"; design M4):
 *
 * 1. the опис trimmed;
 * 2. one leading service word of the bank's skipped, with what separates it, when anything follows;
 *    then a payment processor's name and its «*» with the spaces around it, when anything else follows;
 * 3. a remainder starting with a letter cut to its leading run of letters and spaces, then to two
 *    words — «Нова Пошта відділення 5» → «Нова Пошта» — and any other remainder kept whole;
 * 4. the написання is that name folded; the назва is that name with every all-capitals word longer
 *    than three letters written as a capital and lower case.
 *
 * The name is the опис's own text, its spacing kept, so the написання always occurs in the опис it
 * came from. Nothing is proposed without an опис. It is an offer: what is stored is what the owner
 * accepts.
 */
export function proposeMerchant(
  description: string | undefined,
): { readonly name: string; readonly spelling: string } | undefined {
  const trimmed = (description ?? '').trim();
  if (trimmed === '') return undefined;
  const remainder = skipProcessorPrefix(skipServiceWord(trimmed));
  const letters = LEADING_LETTERS.exec(remainder)?.[0].trim();
  const name =
    letters === undefined || letters === '' ? remainder : (TWO_WORDS.exec(letters)?.[0] ?? letters);
  return { name: titleCaseShouting(name), spelling: foldCase(name) };
}
