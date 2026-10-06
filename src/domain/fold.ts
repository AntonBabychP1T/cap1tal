/**
 * The one case fold of the app (search-fold-speed design D1): Unicode's default full lower-case
 * mapping, with no locale, for every comparison that ignores letter case — the search on
 * «Транзакції», the pickers, правила, bank notifications and the фіскальний чек seller check.
 *
 * It is Ukrainian casing: Unicode tailors case only for Lithuanian, Turkish and Azeri, so for
 * every string this and the `uk` mapping give the same text (`fold.test.ts` shows it over every
 * code point). It is not spelt with a locale argument because on Hermes a locale-argument case
 * mapping goes through the platform's Intl bridge, ~0.4 ms a call against ~2 µs, and a search
 * makes one per candidate row. It is not the phone-language mapping either: a phone set to
 * Turkish would fold `I` to `ı` and stop finding «BILLA» by «billa».
 */
export function foldCase(text: string): string {
  return text.toLowerCase();
}

/** A character that is neither a letter nor a digit: where a word begins after it. */
const NOT_A_WORD_CHARACTER = /[^\p{L}\p{N}]/u;

/**
 * Whether `needle` occurs in `folded` beginning where a word begins — at index 0 or right after a
 * character that is neither a letter nor a digit, at any such place (qa-sweep-2026-10 design D7). A
 * `needle` whose own first character is neither («*megogo», «-маркет») is its own boundary and
 * occurs wherever it occurs. Both arguments are already folded; an empty `needle` occurs nowhere.
 * What a правило's pattern and a продавець's написання are matched by; the шаблон keeps substrings.
 */
export function occursAtWordStart(folded: string, needle: string): boolean {
  if (needle === '') return false;
  if (NOT_A_WORD_CHARACTER.test(needle.charAt(0))) return folded.includes(needle);
  for (let at = folded.indexOf(needle); at !== -1; at = folded.indexOf(needle, at + 1)) {
    if (at === 0 || NOT_A_WORD_CHARACTER.test(folded.charAt(at - 1))) return true;
  }
  return false;
}

/**
 * `text` with its first character in upper case and the rest as written — a label that opens a
 * sentence («вересні» → «Вересні»). The one such helper of the app: `src/progress/` and `src/ui/`
 * both write sentences, and `src/progress/` may not import `src/ui/`. No locale, like `foldCase`.
 */
export function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
