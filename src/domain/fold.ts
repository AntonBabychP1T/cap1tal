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
