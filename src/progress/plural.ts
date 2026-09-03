/**
 * The Ukrainian three-form plural, in **one** place: 1 and anything ending in 1 take the singular,
 * 2–4 the few form, everything else the many form — and 11–14 take the many form whatever they end
 * in. Two hand-rolled guesses in one app is how «2 рахунків» happens.
 *
 * It sits here, in a leaf module of `src/progress/`, for a layering reason rather than a topical
 * one: `src/ui/labels.ts` and `src/progress/catalogue.ts` both need it, `src/progress/` is the
 * lower of the two (design D14 — `src/ui/` may import it and not the other way round), and this
 * file imports nothing at all, so no cycle can form. Naming it after the folder it happens to sit
 * in would be the mistake; it is a fact about Ukrainian, not about прогрес.
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
