import { folded, nameMatches } from './labels';

/**
 * How many of a long list a picker draws, and how the rest are reached.
 *
 * The problem this answers is one screenful: the owner has twenty-eight рахунки and twenty-seven
 * категорії, and the recording form drew every one of them as a chip — over sixty chips before the
 * «Записати» button. They record on three or four рахунки. The list was not information, it was
 * furniture.
 *
 * Everything here is generic over `{ id, name }` so that рахунки, категорії and джерела share one
 * implementation and cannot drift into three slightly different behaviours. It takes a list that
 * has *already* been decided — `accountChoicesFor`, `expenseCategoryChoices`, `sourceChoices` —
 * and never second-guesses it: what may be picked stays their question, how many are drawn is
 * this one. An archived рахунок cannot appear here, because it never reaches here.
 */

/** What every list this module shortens is made of. */
export interface Named {
  readonly id: string;
  readonly name: string;
}

/**
 * How many offered choices a picker draws before the rest go behind the offer. Five: the owner
 * records on three or four рахунки, so five leaves a margin, and it is the number «Нещодавні» has
 * already been showing since `daily-usability` rather than a fresh guess.
 */
export const PICKER_SIZE = 5;

/**
 * The rows a picker draws: what the owner reached for last, topped up from the head of the list,
 * and then whatever is chosen if that is not already among them.
 *
 * The order of those three steps is the whole design.
 *
 * *Recents first* is the shortcut itself — resolved against `offered` and not against the whole
 * list, so an archived категорія is not resurrected by having been used and «Без джерела» is not
 * offered by having been imported onto.
 *
 * *Topped up from the head* is what keeps the picker five wide on a fresh device, and on a phone
 * whose latest fifty транзакції all landed on one synced рахунок. The head is the order the list
 * already has — «Без категорії» first among категорії, name order elsewhere — which is arbitrary
 * but stable, and stability is the point: a chip in the same place tomorrow is learnable.
 *
 * *The chosen rows last* is the `withCurrent` idiom of `account-choices.ts`, for the reason its
 * comment gives — such a row "is not an offer; it is what is already there". So they are appended
 * rather than sorted into place. That is what keeps an archived рахунок of a stored транзакція
 * visible without offering it for anything new.
 *
 * `chosenIds` is plural because the picker never takes a chip away. It holds the row the screen
 * opened on *and* every row picked since, in that order, so the chips only ever grow: a рахунок
 * found through «Всі рахунки» stays on the row afterwards, and swapping back to the one the form
 * opened on does not mean opening the full list a second time. Nothing here re-runs in a way that
 * moves a chip already drawn — the five are decided before any of this, and the appended rows are
 * appended in the order they were chosen.
 */
export function shortlist<Row extends Named>(
  offered: readonly Row[],
  {
    recentIds,
    chosenIds = [],
    size = PICKER_SIZE,
  }: { recentIds: readonly string[]; chosenIds?: readonly string[]; size?: number },
): Row[] {
  const byId = new Map(offered.map((row) => [row.id, row]));
  const shown: Row[] = [];
  const take = (row: Row | undefined) => {
    if (row && shown.length < size && !shown.some((already) => already.id === row.id)) {
      shown.push(row);
    }
  };

  for (const id of recentIds) take(byId.get(id));
  for (const row of offered) take(row);

  for (const id of chosenIds) {
    if (shown.some((row) => row.id === id)) continue;
    const chosen = byId.get(id);
    if (chosen) shown.push(chosen);
  }
  return shown;
}

/**
 * The offer standing beside the short list, or `undefined` when every offered row is already
 * drawn and there is nothing behind it.
 *
 * It names the total rather than the remainder, because the owner is deciding whether to go
 * looking: «Всі категорії (27)» says how big the place they are about to open is. A count of what
 * is hidden would change every time the recents changed, and would answer a question nobody asks.
 */
export type PickerNoun = 'accounts' | 'categories' | 'sources';

const ALL_LABELS: Readonly<Record<PickerNoun, string>> = {
  accounts: 'Всі рахунки',
  categories: 'Всі категорії',
  sources: 'Всі джерела',
};

export function allOffer(
  offered: readonly Named[],
  noun: PickerNoun,
  size: number = PICKER_SIZE,
): string | undefined {
  return offered.length <= size ? undefined : `${ALL_LABELS[noun]} (${offered.length})`;
}

/** What the same control reads once the full list is open. */
export const COLLAPSE_LABEL = 'Згорнути';

/** What an open full list says when the typed search leaves nothing standing. */
export const NOTHING_FOUND = 'Нічого не знайдено';

/**
 * The full list narrowed by what the owner typed: matched anywhere in the name, folded the way
 * «Транзакції» folds (`folded` in `labels.ts`), so «прод» finds «Продукти».
 *
 * An empty search narrows nothing — the owner has opened the list, not asked a question of it —
 * and the list keeps the order it already has rather than being re-sorted by how well each row
 * matched. A picker is a place to find one known thing, not a search engine.
 */
export function narrow<Row extends Named>(offered: readonly Row[], query: string): Row[] {
  const needle = folded(query.trim());
  return needle === '' ? [...offered] : offered.filter((row) => nameMatches(row.name, needle));
}

