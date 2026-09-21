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
  /** Supermarket cart. */ cart: ['M3 5 L6 5 L8 17 L19 17', 'M9 8 L21 8 L19 14 L8 14', 'M10 20 C10.6 20 11 20.4 11 21 C11 21.6 10.6 22 10 22 C9.4 22 9 21.6 9 21 C9 20.4 9.4 20 10 20 Z', 'M18 20 C18.6 20 19 20.4 19 21 C19 21.6 18.6 22 18 22 C17.4 22 17 21.6 17 21 C17 20.4 17.4 20 18 20 Z'],
  /** Fork and spoon. */ utensils: ['M7 3 L7 11', 'M4 3 L4 7 C4 9 10 9 10 7 L10 3', 'M7 11 L7 21', 'M16 3 C19 5 19 11 16 13 L16 21', 'M16 3 L16 13'],
  /** Coffee cup. */ coffee: ['M5 8 L17 8 L16 19 L6 19 Z', 'M17 10 C21 10 21 16 17 16', 'M8 4 C7 5 7 6 8 7', 'M12 4 C11 5 11 6 12 7'],
  /** Burger. */ burger: ['M4 10 C5 5 19 5 20 10', 'M3 12 L21 12', 'M4 16 L20 16', 'M6 19 L18 19'],
  /** Bread loaf. */ bread: ['M4 19 L4 11 C4 5 16 4 19 9 C22 14 19 19 16 19 Z', 'M8 9 C9 8 10 8 11 9', 'M13 8 C14 7 15 7 16 8'],
  /** Delivery box. */ delivery: ['M4 8 L12 4 L20 8 L20 18 L12 22 L4 18 Z', 'M4 8 L12 12 L20 8', 'M12 12 L12 22'],
  /** Car. */ car: ['M4 15 L6 9 L18 9 L20 15 L20 19 L4 19 Z', 'M7 9 L9 5 L15 5 L17 9', 'M7 17 C7.6 17 8 17.4 8 18 C8 18.6 7.6 19 7 19 C6.4 19 6 18.6 6 18 C6 17.4 6.4 17 7 17 Z', 'M17 17 C17.6 17 18 17.4 18 18 C18 18.6 17.6 19 17 19 C16.4 19 16 18.6 16 18 C16 17.4 16.4 17 17 17 Z'],
  /** Fuel pump. */ fuel: ['M5 4 L15 4 L15 21 L5 21 Z', 'M8 7 L12 7 L12 12 L8 12 Z', 'M15 8 L18 8 L20 11 L20 17 C20 19 17 19 17 17 L17 13'],
  /** Bus. */ bus: ['M5 4 L19 4 L20 19 L4 19 Z', 'M7 7 L17 7 L17 12 L7 12 Z', 'M8 21 C8.6 21 9 21.4 9 22 C9 22.6 8.6 23 8 23 C7.4 23 7 22.6 7 22 C7 21.4 7.4 21 8 21 Z', 'M16 21 C16.6 21 17 21.4 17 22 C17 22.6 16.6 23 16 23 C15.4 23 15 22.6 15 22 C15 21.4 15.4 21 16 21 Z'],
  /** Taxi sign and car. */ taxi: ['M4 16 L6 10 L18 10 L20 16 L20 19 L4 19 Z', 'M9 10 L10 7 L14 7 L15 10', 'M10 4 L14 4'],
  /** Parking sign. */ parking: ['M4 3 L20 3 L20 21 L4 21 Z', 'M9 18 L9 6 L13 6 C17 6 17 12 13 12 L9 12'],
  /** Home. */ home: ['M3 11 L12 3 L21 11', 'M5 10 L5 21 L19 21 L19 10', 'M10 21 L10 15 L14 15 L14 21'],
  /** Utility bulb. */ bulb: ['M8 11 C8 6 16 5 17 11 C17 14 14 15 14 18 L10 18 C10 15 8 14 8 11 Z', 'M10 21 L14 21', 'M10 19 L14 19'],
  /** Repair wrench. */ wrench: ['M20 5 C17 3 14 5 15 8 L5 18 L8 21 L18 11 C21 12 23 9 20 5 Z'],
  /** Sofa. */ sofa: ['M4 12 L4 9 C4 6 8 6 9 9 L15 9 C16 6 20 6 20 9 L20 18 L4 18 Z', 'M2 18 L22 18', 'M6 18 L6 21', 'M18 18 L18 21'],
  /** Document. */ document: ['M6 3 L15 3 L19 7 L19 21 L6 21 Z', 'M15 3 L15 7 L19 7', 'M9 11 L16 11', 'M9 15 L16 15'],
  /** Shirt. */ shirt: ['M8 4 L12 7 L16 4 L21 8 L18 12 L18 21 L6 21 L6 12 L3 8 Z'],
  /** Shoe. */ shoe: ['M4 16 C8 16 10 11 11 7 L14 7 C15 12 18 15 21 16 L21 20 L4 20 Z'],
  /** Shopping bag. */ bag: ['M5 8 L19 8 L18 21 L6 21 Z', 'M9 8 C9 3 15 3 15 8'],
  /** Laptop. */ laptop: ['M5 5 L19 5 L19 17 L5 17 Z', 'M2 20 L22 20'],
  /** Phone. */ phone: ['M7 3 L17 3 L17 21 L7 21 Z', 'M11 18 L13 18'],
  /** Wi-Fi. */ wifi: ['M3 9 C8 4 16 4 21 9', 'M6 13 C10 9 14 9 18 13', 'M9 17 C11 15 13 15 15 17', 'M12 21 C12.6 21 13 21.4 13 22 C13 22.6 12.6 23 12 23 C11.4 23 11 22.6 11 22 C11 21.4 11.4 21 12 21 Z'],
  /** Subscription cloud. */ cloud: ['M5 18 C1 17 3 11 7 12 C8 6 16 6 17 12 C22 11 23 18 19 19 L6 19'],
  /** Health pulse. */ heartPulse: ['M4 12 C4 6 11 6 12 10 C14 6 20 7 20 12 C20 16 15 19 12 21 C9 19 4 16 4 12 Z', 'M5 13 L9 13 L11 10 L13 16 L15 13 L19 13'],
  /** Pill. */ pill: ['M7 5 C9 3 12 3 14 5 L19 10 C21 12 21 15 19 17 C17 19 14 19 12 17 L7 12 C5 10 5 7 7 5 Z', 'M9 15 L16 8'],
  /** Dumbbell. */ dumbbell: ['M3 9 L3 15', 'M6 7 L6 17', 'M6 12 L18 12', 'M18 7 L18 17', 'M21 9 L21 15'],
  /** Sparkles. */ sparkles: ['M7 2 L7 11', 'M2 7 L11 7', 'M17 11 L17 21', 'M13 16 L21 16', 'M15 3 L16 6 L19 7 L16 8 L15 11 L14 8 L11 7 L14 6 Z'],
  /** Scissors. */ scissors: ['M7 5 C4 5 4 10 7 10 C10 10 10 5 7 5 Z', 'M7 14 C4 14 4 19 7 19 C10 19 10 14 7 14 Z', 'M9 9 L20 3', 'M9 15 L20 21'],
  /** Graduation cap. */ graduationCap: ['M2 9 L12 4 L22 9 L12 14 Z', 'M6 12 L6 17 C10 20 14 20 18 17 L18 12', 'M22 9 L22 16'],
  /** Book. */ book: ['M4 4 L11 4 L11 20 L4 18 Z', 'M20 4 L13 4 L13 20 L20 18 Z', 'M11 6 C12 5 13 5 13 6'],
  /** Suitcase. */ suitcase: ['M4 7 L20 7 L20 20 L4 20 Z', 'M9 7 L9 4 L15 4 L15 7', 'M4 12 L20 12'],
  /** Plane. */ plane: ['M3 13 L21 4 L14 20 L10 14 Z', 'M10 14 L3 13', 'M10 14 L10 20'],
  /** Hotel bed. */ bed: ['M3 7 L3 21', 'M21 11 L21 21', 'M3 13 L21 13', 'M6 13 L6 9 L11 9 L11 13', 'M3 18 L21 18'],
  /** Ticket. */ ticket: ['M4 6 L20 6 L20 10 C17 10 17 14 20 14 L20 18 L4 18 L4 14 C7 14 7 10 4 10 Z', 'M12 8 L12 16'],
  /** Film. */ film: ['M4 4 L20 4 L20 20 L4 20 Z', 'M4 9 L20 9', 'M4 15 L20 15', 'M8 4 L8 9', 'M16 4 L16 9'],
  /** Gamepad. */ gamepad: ['M4 15 C4 10 7 9 10 11 L14 11 C17 9 20 10 20 15 L19 19 C18 21 16 21 14 18 L10 18 C8 21 6 21 5 19 Z', 'M7 15 L11 15', 'M9 13 L9 17', 'M16 14 C16.5 14 17 14.4 17 15 C17 15.6 16.5 16 16 16 C15.5 16 15 15.6 15 15 C15 14.4 15.5 14 16 14 Z'],
  /** Music note. */ music: ['M16 4 L16 17', 'M16 5 L21 4 L21 8 L16 9', 'M9 17 C6 17 5 21 9 21 C12 21 12 17 9 17 Z', 'M16 15 C13 15 12 19 16 19 C19 19 19 15 16 15 Z'],
  /** Gift. */ gift: ['M4 9 L20 9 L20 20 L4 20 Z', 'M12 9 L12 20', 'M4 13 L20 13', 'M12 9 C6 9 6 3 10 4 C12 5 12 9 12 9 Z', 'M12 9 C18 9 18 3 14 4 C12 5 12 9 12 9 Z'],
  /** Family. */ family: ['M7 10 C9 10 10 8 10 6 C10 3 4 3 4 6 C4 8 5 10 7 10 Z', 'M17 10 C19 10 20 8 20 6 C20 3 14 3 14 6 C14 8 15 10 17 10 Z', 'M3 21 C3 14 11 14 11 21', 'M13 21 C13 14 21 14 21 21'],
  /** Baby bottle. */ baby: ['M9 3 L15 3 L15 7 L17 9 L17 20 L7 20 L7 9 L9 7 Z', 'M9 12 L15 12'],
  /** Paw. */ paw: ['M12 12 C8 12 6 16 7 19 C8 22 16 22 17 19 C18 16 16 12 12 12 Z', 'M6 10 C4 10 4 6 6 6 C8 6 8 10 6 10 Z', 'M11 8 C9 8 9 4 11 4 C13 4 13 8 11 8 Z', 'M16 10 C14 10 14 6 16 6 C18 6 18 10 16 10 Z'],
  /** Charity hand and heart. */ handHeart: ['M4 15 L9 15 L11 18 L18 18 C22 18 22 13 18 13 L13 13', 'M7 15 L7 11 C7 9 10 9 10 11 L10 14', 'M14 7 C14 4 18 4 18 7 C18 9 16 10 15 11 C14 10 12 9 12 7 C12 4 14 4 14 7 Z'],
  /** Bank. */ bank: ['M3 8 L12 3 L21 8', 'M5 10 L19 10', 'M6 10 L6 19', 'M10 10 L10 19', 'M14 10 L14 19', 'M18 10 L18 19', 'M3 21 L21 21'],
  /** Coins. */ coins: ['M5 8 C5 4 19 4 19 8 C19 12 5 12 5 8 Z', 'M5 8 L5 16 C5 20 19 20 19 16 L19 8', 'M5 12 C5 16 19 16 19 12'],
  /** Percent. */ percent: ['M6 6 C6 3 10 3 10 6 C10 9 6 9 6 6 Z', 'M14 18 C14 15 18 15 18 18 C18 21 14 21 14 18 Z', 'M6 20 L18 4'],
  /** Briefcase. */ briefcase: ['M4 8 L20 8 L20 20 L4 20 Z', 'M9 8 L9 5 L15 5 L15 8', 'M4 14 L20 14', 'M10 14 L10 16 L14 16 L14 14'],
  /** The uncategorised question. */ question: ['M8 9 C8 5 16 5 16 9 C16 12 13 12 12 15', 'M12 20 C12.6 20 13 20.4 13 21 C13 21.6 12.6 22 12 22 C11.4 22 11 21.6 11 21 C11 20.4 11.4 20 12 20 Z'],
  /** Adjustment plus/minus. */ plusMinus: ['M5 8 L13 8', 'M9 4 L9 12', 'M15 17 L21 17'],
} as const;

/** Every glyph the table holds. Derived from the table so the two can never disagree. */
export type IconName = keyof typeof ICON_PATHS;

/** The box every path is drawn in. `icon.tsx` scales from it; nothing else needs it. */
export const ICON_VIEWBOX = 24;

/** The stroke every glyph is drawn at, in the 24×24 box. Scaled with the glyph, never fixed. */
export const ICON_STROKE_WIDTH = 2;
