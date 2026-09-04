/**
 * The stroke glyphs, as data.
 *
 * The artboards define every glyph the same way: a 24×24 box, stroke-width 2, round caps and
 * joins, no fill, tinted per instance — the same glyph is drawn in five different colours across
 * the set. That is why they are paths here and not PNGs: one table renders at any size and any
 * `ThemeColor`, and a screen never picks a file.
 *
 * This table lives in `src/ui/` rather than beside the renderer because it is the half `verify`
 * can hold — nothing here imports React or `react-native-svg`, so `icons.test.ts` reads it
 * directly. `src/components/icon.tsx` is the other half and carries no path data of its own.
 *
 * **Where these paths came from.** Not from the artboards: «cap1tal Redesign.dc.html» is not in
 * this repository, so nobody working here can open it. They were drawn to the geometry design.md
 * fixes — 24×24, stroke-width 2, round caps and joins — from what each glyph is named after. What
 * each one *should* look like is therefore settled on the emulator and nowhere else. The counts
 * the change quotes (51 distinct glyphs, 36 of them on one artboard, these 15 shared) come from
 * the proposal and are not checkable here either.
 *
 * **Absolute commands only** — `M`, `L`, `C`, `Z`. Every number in a path string is therefore an
 * absolute coordinate in the 24×24 box, which is what lets the test check that a glyph did not
 * land outside its viewBox. Relative commands (`l`, `h`, `a`) would make the numbers deltas and
 * flags, and the check would be reading nothing. Arcs are spelled as cubics for the same reason.
 *
 * Only the glyphs the proposal says **two or more** of the ten chosen artboards draw are here.
 * Each of the rest belongs to the screen change that first draws it — appended to this same
 * table, not to a private copy.
 */

/**
 * Name → the subpaths that draw it, in paint order.
 *
 * A glyph is a list because most of them are more than one stroke: a card is an outline and a
 * stripe, a target is three rings. They are separate `Path`s rather than one string with several
 * `M`s so each keeps its own round cap.
 */
export const ICON_PATHS = {
  /** The row affordance: this row opens something. The most-drawn glyph in the set. */
  chevronRight: ['M9 5 L16 12 L9 19'],
  /** Back, and the left step of a month pager. */
  chevronLeft: ['M15 5 L8 12 L15 19'],
  /** A рахунок of kind «картка» — an outline with the stripe across it. */
  card: [
    'M5 6 L19 6 C20.1 6 21 6.9 21 8 L21 16 C21 17.1 20.1 18 19 18 L5 18 C3.9 18 3 17.1 3 16 L3 8 C3 6.9 3.9 6 5 6 Z',
    'M3 10 L21 10',
  ],
  /** Done, reached, kept: a ціль met, a крок of «Перші кроки» behind you. */
  check: ['M5 13 L10 18 L19 7'],
  /** Дохід: an arrow coming down onto a line. Its opposite is drawn by one artboard, so it is not here. */
  income: ['M12 3 L12 15', 'M7 10 L12 15 L17 10', 'M4 20 L20 20'],
  /** Переказ between two рахунки: two arrows, opposite ways. */
  transfer: ['M4 8 L20 8', 'M16 4 L20 8 L16 12', 'M20 16 L4 16', 'M8 12 L4 16 L8 20'],
  /** Звіти and any trend: the axis with a rising line and its head. */
  chartRising: ['M4 4 L4 20 L20 20', 'M8 15 L12 11 L15 14 L20 8', 'M16 8 L20 8 L20 12'],
  /** The everyday категорія — продукти. */
  basket: [
    'M3 9 L21 9 L19 20 L5 20 Z',
    'M8 9 C8 5.5 9.8 4 12 4 C14.2 4 16 5.5 16 9',
    'M10 13 L10 17',
    'M14 13 L14 17',
  ],
  /** Категорія in general, and the ліміт attached to one. */
  tag: [
    'M3 3 L11 3 L21 13 L13 21 L3 11 Z',
    'M7.5 6.5 C8.05 6.5 8.5 6.95 8.5 7.5 C8.5 8.05 8.05 8.5 7.5 8.5 C6.95 8.5 6.5 8.05 6.5 7.5 C6.5 6.95 6.95 6.5 7.5 6.5 Z',
  ],
  /** Add one of whatever the screen lists. */
  plus: ['M12 5 L12 19', 'M5 12 L19 12'],
  /** Пошук — the лупа on the transactions list and in a picker. */
  search: [
    'M11 4 C14.87 4 18 7.13 18 11 C18 14.87 14.87 18 11 18 C7.13 18 4 14.87 4 11 C4 7.13 7.13 4 11 4 Z',
    'M16 16 L21 21',
  ],
  /** A місяць, a дата, a period picked. */
  calendar: ['M4 6 L20 6 L20 20 L4 20 Z', 'M4 10 L20 10', 'M8 3 L8 7', 'M16 3 L16 7'],
  /** Ціль: rings around a centre. */
  target: [
    'M12 4 C16.42 4 20 7.58 20 12 C20 16.42 16.42 20 12 20 C7.58 20 4 16.42 4 12 C4 7.58 7.58 4 12 4 Z',
    'M12 8 C14.21 8 16 9.79 16 12 C16 14.21 14.21 16 12 16 C9.79 16 8 14.21 8 12 C8 9.79 9.79 8 12 8 Z',
    'M12 11 C12.55 11 13 11.45 13 12 C13 12.55 12.55 13 12 13 C11.45 13 11 12.55 11 12 C11 11.45 11.45 11 12 11 Z',
  ],
  /** Рахунки as a whole — the pocket on the right is what tells it from `card`. */
  wallet: [
    'M3 8 C3 6.9 3.9 6 5 6 L19 6 C20.1 6 21 6.9 21 8 L21 18 C21 19.1 20.1 20 19 20 L5 20 C3.9 20 3 19.1 3 18 L3 8 Z',
    'M21 11 L16 11 C14.9 11 14 11.9 14 13 C14 14.1 14.9 15 16 15 L21 15',
  ],
  /** A категорія over its ліміт, a sync that failed. Never decorative. */
  warning: [
    'M12 4 L22 20 L2 20 Z',
    'M12 10 L12 14',
    'M12 17 C12.28 17 12.5 17.22 12.5 17.5 C12.5 17.78 12.28 18 12 18 C11.72 18 11.5 17.78 11.5 17.5 C11.5 17.22 11.72 17 12 17 Z',
  ],
} as const;

/** Every glyph the table holds. Derived from the table so the two can never disagree. */
export type IconName = keyof typeof ICON_PATHS;

/** The box every path is drawn in. `icon.tsx` scales from it; nothing else needs it. */
export const ICON_VIEWBOX = 24;

/** The stroke every glyph is drawn at, in the 24×24 box. Scaled with the glyph, never fixed. */
export const ICON_STROKE_WIDTH = 2;
