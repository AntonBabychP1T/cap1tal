import { folded } from './labels';

/**
 * How alike two назви are, and the one question the app is allowed to answer with them: may it say
 * that these two are the same рахунок?
 *
 * It is deliberately dumb, and that is the whole design. The app uses this to put a sentence in
 * front of the owner — «Схоже, це той самий рахунок» — and to offer merging two рахунки on the
 * strength of it. A merge the owner takes on faith is a wrong balance they cannot see, so the rule
 * has to be one they can reconstruct by looking at the two names: *the same name, or every word of
 * the shorter one is a word of the longer one*. Nothing is counted, nothing is learned, nothing is
 * stored.
 *
 * It knows nothing about Saldo, рахунки or the import — two strings in, a small number out — so it
 * lives here rather than in `saldo-import.ts`, and `verify` proves it without a screen.
 */

/**
 * A name cut into words: folded the way the app folds everywhere («Транзакції», the pickers), then
 * split on everything that is not a letter or a digit. That is what makes "Monobank UAH, Black"
 * three words rather than a string with a comma in it.
 */
export function tokens(name: string): string[] {
  return folded(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token !== '');
}

const isNumber = (token: string): boolean => /^\p{N}+$/u.test(token);

/**
 * Whether two words are the same word: equal, or one a prefix of the other by at least four
 * characters, neither being a number.
 *
 * Both limits were found by trying three and looking at the owner's own export. **Four, not three**:
 * "Binance USD" against "binance usdt" reaches a full match on `usd`→`usdt` at three, and those are
 * two different рахунки. Four keeps `mono`→`monobank`, which is the case the vision actually names.
 * **Never a number**: «Приват 5168» against «Приват 5169»… — among account numbers a shared prefix
 * means the opposite of a likeness, two different cards of one bank.
 */
export function wordMatch(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  if (isNumber(a) || isNumber(b)) {
    return false;
  }
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.startsWith(shorter);
}

/**
 * Whether every word of `shorter` matches a word of its own in `longer` — no word of the longer
 * name answering for two of the shorter's.
 *
 * Two passes, exact matches consumed first: otherwise the answer would depend on the order the
 * words happen to be in. `{mono, monopoly}` against `{monopoly, monobank}` matches in one order and
 * fails in the other if `mono` is allowed to eat `monopoly` on a prefix before `monopoly` has asked
 * for it.
 */
function eachWordMatched(shorter: readonly string[], longer: readonly string[]): boolean {
  const free = [...longer];
  const pending: string[] = [];

  for (const word of shorter) {
    const exact = free.indexOf(word);
    if (exact === -1) {
      pending.push(word);
    } else {
      free.splice(exact, 1);
    }
  }
  for (const word of pending) {
    const like = free.findIndex((candidate) => wordMatch(word, candidate));
    if (like === -1) {
      return false;
    }
    free.splice(like, 1);
  }
  return true;
}

/**
 * How alike two назви are, on a scale the owner could recompute: the same name (3), every word of
 * the shorter one found in the longer (2), one word in common (1), nothing (0).
 *
 * The app reads it two ways, and only one of them is a claim: it *orders* the merge targets, where
 * being wrong costs a scroll, and it *gates* `looksLikeSameAccount`, where being wrong costs a
 * balance. Hence the small scale — an order needs no more resolution than this, and a threshold
 * nobody can explain is a threshold nobody can check.
 */
export function similarity(a: string, b: string): 0 | 1 | 2 | 3 {
  if (folded(a.trim()) === folded(b.trim())) {
    return 3;
  }
  const left = tokens(a);
  const right = tokens(b);
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (eachWordMatched(shorter, longer)) {
    return 2;
  }
  return shorter.some((word) => longer.some((other) => wordMatch(word, other))) ? 1 : 0;
}

/**
 * Whether the app may say these two can only be one рахунок: the same name, or every word of the
 * shorter one is a word of the longer one **and the shorter one has at least two words**.
 *
 * That second condition is what keeps «Готівка» from being called the same рахунок as «Готівка
 * вдома». One word in common is a coincidence; two are a name.
 *
 * Silence is the failure mode this chooses. It says nothing about "mono black"/"mono white", about
 * "binance crypto"/"binance usdt", or about «mono біла»/"Monobank UAH, White" — the last being a
 * pair a human spots at once and no rule here understands. The merge targets are always there for
 * what it missed; there is nothing there for what it got wrong.
 */
export function looksLikeSameAccount(a: string, b: string): boolean {
  const score = similarity(a, b);
  if (score === 3) {
    return true;
  }
  const shorter = tokens(a).length <= tokens(b).length ? tokens(a) : tokens(b);
  return score === 2 && shorter.length >= 2;
}
