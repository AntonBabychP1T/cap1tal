import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  INTEREST_SOURCE_ID,
  UNCATEGORISED_CATEGORY_ID,
} from './transaction';

/**
 * The owner's own flat vocabulary. A категорія labels where money went, a джерело where it came
 * from; both are plain editable rows with no hierarchy and no tags (vision §13), which is why the
 * two shapes are identical and still named apart — the glossary keeps them apart.
 */
export interface Category {
  readonly id: string;
  readonly name: string;
  /** An archived row keeps its history and is offered in no picker. */
  readonly archived: boolean;
}

/** The label on a дохід: salary, freelance, батьки, … See the glossary, "Source (джерело доходу)". */
export interface Source {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
}

/**
 * The three categories the domain itself refers to. Reservedness lives here, in code, and not as
 * a column: it is exactly "the id is one of these", and a column could drift from the constants.
 * Recording defaults to «Без категорії», an accepted комісія lands in «Комісія», and a
 * коригування's category is fixed to «Коригування» — so none of the three may be renamed or
 * archived without breaking something that depends on it existing under its name.
 */
export const RESERVED_CATEGORY_IDS: readonly string[] = [
  UNCATEGORISED_CATEGORY_ID,
  FEES_CATEGORY_ID,
  CORRECTION_CATEGORY_ID,
];

export function isReservedCategory(categoryId: string): boolean {
  return RESERVED_CATEGORY_IDS.includes(categoryId);
}

/**
 * The джерело half of the same idea, and for the same reason: the відсотки proposal picks
 * «Відсотки» by id, so it may be neither renamed nor archived. Unlike «Коригування» it is an
 * ordinary pickable row — the owner records interest by hand too.
 */
export const RESERVED_SOURCE_IDS: readonly string[] = [INTEREST_SOURCE_ID];

export function isReservedSource(sourceId: string): boolean {
  return RESERVED_SOURCE_IDS.includes(sourceId);
}

/** The categories a picker may offer at all — archived ones are not among them. */
export function activeCategories(all: readonly Category[]): Category[] {
  return all.filter((c) => !c.archived);
}

/** The sources a picker may offer at all — the джерело half of `activeCategories`. */
export function activeSources(all: readonly Source[]): Source[] {
  return all.filter((s) => !s.archived);
}

/** id → name, the map every display helper resolves a stored id against. */
export function namesById(rows: readonly { id: string; name: string }[]): ReadonlyMap<string, string> {
  return new Map(rows.map((row) => [row.id, row.name]));
}
