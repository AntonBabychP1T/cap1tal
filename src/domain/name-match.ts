/**
 * What makes two account names the same account.
 *
 * One flow asks it: monobank proposing which рахунок a card is. The Saldo import used to be the
 * second, and `saldo-import-merge` withdrew its merge *proposals* — every one they made on the
 * owner's real export was wrong — so the import now offers the targets and proposes nothing. The
 * definition stays here rather than beside `validateLink` because "same name" is a question about
 * names, not about monobank, and the next flow that asks it should find one answer already written
 * rather than write a second.
 *
 * Pure and total: names in, evidence or nothing out. Balances are deliberately not part of this
 * and never should be — two accounts holding the same amount is a coincidence, and a proposal
 * built on it would be right until the day it was expensively wrong.
 */

/** Why two names look like one account, strongest first. */
export type NameEvidence = 'digits' | 'same-name' | 'contains' | 'word';

/** The strength order the callers compare on; the best wins, and a tie wins nothing. */
export const EVIDENCE_STRENGTH: Readonly<Record<NameEvidence, number>> = {
  digits: 4,
  'same-name': 3,
  contains: 2,
  word: 1,
};

/**
 * A name reduced to what two names can honestly be compared on: lowercase, every run of
 * non-letters and non-digits turned into one space. `black ··1234` becomes `black 1234`, and
 * «Monobank Black» becomes `monobank black`.
 */
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function wordsOf(name: string): string[] {
  const normalised = normalise(name);
  return normalised === '' ? [] : normalised.split(' ');
}

/**
 * The last four digits of every digit run of four or more. `black ··1234` gives `1234`; a
 * рахунок the owner named «Чорна 1234» gives the same, which is the whole point.
 */
function digitTails(name: string): Set<string> {
  const tails = new Set<string>();
  for (const word of wordsOf(name)) {
    if (/^\d{4,}$/.test(word)) {
      tails.add(word.slice(-4));
    }
  }
  return tails;
}

/** Whether `inner`'s words appear inside `outer`'s as one unbroken run. */
function containsRun(outer: readonly string[], inner: readonly string[]): boolean {
  if (inner.length === 0 || inner.length > outer.length) {
    return false;
  }
  return outer.some((_, at) => inner.every((word, i) => outer[at + i] === word));
}

/**
 * What, if anything, says these two names are the same account. Four signals, in the order the
 * evidence deserves: the digits a bank masks a card down to, the same name written twice, one
 * name inside the other, and — weakest, and still worth proposing — a single word of four
 * characters or more in both.
 *
 * The four-character floor is what keeps «fop» and «usd» from matching everything they appear in.
 */
export function nameEvidence(left: string, right: string): NameEvidence | undefined {
  const leftTails = digitTails(left);
  const rightTails = digitTails(right);
  for (const tail of leftTails) {
    if (rightTails.has(tail)) {
      return 'digits';
    }
  }

  const a = wordsOf(left);
  const b = wordsOf(right);
  if (a.length === 0 || b.length === 0) {
    return undefined;
  }
  if (a.join(' ') === b.join(' ')) {
    return 'same-name';
  }
  const long = (words: readonly string[]) => words.join('').length >= 4;
  if ((containsRun(b, a) && long(a)) || (containsRun(a, b) && long(b))) {
    return 'contains';
  }
  return a.some((word) => word.length >= 4 && b.includes(word)) ? 'word' : undefined;
}
