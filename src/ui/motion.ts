/**
 * Every motion decision that is not drawing (motion capability; app-motion-pass design D1). Pure,
 * so the rules are under `verify`, while `src/components/motion.tsx` only turns the answers into
 * Reanimated calls and `src/app/_layout.tsx` into stack options.
 */
import type { Month } from '../domain/transaction';

// ─── Screen transitions (design D2) ─────────────────────────────────────────────────────────────

/** The subset of the native stack's `animation` values the app uses. */
export type RouteAnimation = 'default' | 'ios_from_right' | 'slide_from_bottom' | 'fade';

/**
 * The routes that rise from the bottom instead of entering from the side: the entry form and the
 * receipt scanner (motion, "Screens enter from where they come from"). Pushed screens both, not
 * modals — only the transition differs.
 */
export const RISING_ROUTES: readonly string[] = ['transaction/new', 'transaction/scan'];

/**
 * The transition a route gets. Under reduced motion every route fades, so nothing slides but the
 * screen still changes. Otherwise a rising route slides from the bottom, and every other route
 * enters from the side: `ios_from_right` on Android (200 ms, the screen beneath parallaxing), the
 * platform's own push on iOS and web.
 */
export function routeTransition(
  route: string,
  reduced: boolean,
  os: 'android' | 'ios' | 'web' | string,
): RouteAnimation {
  if (reduced) return 'fade';
  if (RISING_ROUTES.includes(route)) return 'slide_from_bottom';
  return os === 'android' ? 'ios_from_right' : 'default';
}

// ─── Switching what is shown (design D7) ────────────────────────────────────────────────────────

/**
 * The side a stepped month enters from: the previous month from the left, the next from the right
 * (motion, "Switching what is shown says how it changed"). `Month` is `YYYY-MM`, so the string
 * order is the calendar's.
 */
export function stepDirection(from: Month, to: Month): 'from-left' | 'from-right' {
  return to < from ? 'from-left' : 'from-right';
}

// ─── Changing figures (design D6) ───────────────────────────────────────────────────────────────

/**
 * The currencies whose shown figure changed, and so swap with a fade-and-rise (motion, "A changing
 * сума never shows an amount that is not real"). Compared as formatted text: a сума whose text did
 * not change does not move, even when one beside it on the same line did. On first mount (`prev`
 * null) nothing is changed — the figures are simply there. A currency that arrives or leaves is
 * not a change of a figure in sight: it mounts or unmounts with its line.
 */
export function changedFigures(
  prev: ReadonlyMap<string, string> | null,
  next: ReadonlyMap<string, string>,
): string[] {
  if (prev === null) return [];
  const changed: string[] = [];
  for (const [currency, text] of next) {
    const before = prev.get(currency);
    if (before !== undefined && before !== text) changed.push(currency);
  }
  return changed;
}

// ─── Filling progress (design D5) ───────────────────────────────────────────────────────────────

export interface FillInput {
  /** The value the bar showed before this render; ignored on the first draw. */
  readonly prev: number;
  readonly next: number;
  /** The first time this meter, ring or bar is drawn on its screen. */
  readonly firstDraw: boolean;
  /**
   * The meter or ring now stands for something else — another категорія or місяць. New content,
   * so it appears at its value under the switch's own cross-fade or slide.
   */
  readonly switched: boolean;
  readonly reduced: boolean;
}

/**
 * The value a fill animates from, or `null` for "draw at the value" (motion, "Progress fills from
 * where it was"). The first draw fills once from empty; a change of the same meter fills from where
 * it was; a switch, reduced motion or an unchanged value draws at once.
 */
export function fillStart(input: FillInput): number | null {
  if (input.reduced || input.switched) return null;
  if (input.firstDraw) return input.next === 0 ? null : 0;
  if (input.prev === input.next) return null;
  return input.prev;
}

// ─── Reduced motion (design D1) ─────────────────────────────────────────────────────────────────

/** Every kind of movement the app drives or asks the platform for. */
export type MovementKind =
  | 'screen'
  | 'tab'
  | 'open'
  | 'leave'
  | 'reflow'
  | 'fill'
  | 'rise'
  | 'step'
  | 'morph'
  | 'press'
  | 'sheet';

/**
 * What a movement becomes while the phone asks for reduced motion (motion, "Reduced motion turns
 * movement into instant change"): a plain cross-fade of at most `Motion.fast`, or an instant change.
 * Whatever appears or is replaced cross-fades, so the owner still sees that something changed;
 * whatever travels, grows or presses in simply lands.
 */
export function movementUnderReducedMotion(kind: MovementKind): 'instant' | 'fade-fast' {
  switch (kind) {
    case 'screen':
    case 'tab':
    case 'open':
    case 'leave':
    case 'rise':
    case 'step':
    case 'sheet':
      return 'fade-fast';
    case 'reflow':
    case 'fill':
    case 'morph':
    case 'press':
      return 'instant';
  }
}

// ─── The bottom sheet (design D9) ───────────────────────────────────────────────────────────────

export type SheetPhase = 'closed' | 'opening' | 'open' | 'closing';

export interface SheetState {
  readonly phase: SheetPhase;
  /** Who began the close in flight; `null` when nothing is closing. */
  readonly closedBy: 'sheet' | 'parent' | null;
}

/**
 * - `show`: the parent's `open` turned true.
 * - `hide`: the parent's `open` turned false — after a choice, or clearing its state.
 * - `dismiss`: the sheet itself was closed — the scrim or the back gesture.
 * - `shown`: the opening movement finished.
 * - `hidden`: the closing movement finished.
 */
export type SheetEvent = 'show' | 'hide' | 'dismiss' | 'shown' | 'hidden';

/**
 * - `dismissed`: call the parent's `onDismiss` — once, as the sheet-started close begins, so the
 *   parent records the decline at once.
 * - `exited`: call `onExited` — once, when any close has finished.
 */
export type SheetEffect = 'dismissed' | 'exited';

export const SHEET_CLOSED: SheetState = { phase: 'closed', closedBy: null };

/**
 * The sheet's phase machine: `closed → opening → open → closing → closed`. Who closes decides what
 * fires (motion, "A bottom sheet rises over a fading scrim"): a close the sheet starts reports a
 * dismissal, a close the parent starts reports none, and either runs `exited` once it has left. A
 * second close while one is in flight changes nothing.
 */
export function sheetStep(
  state: SheetState,
  event: SheetEvent,
): { state: SheetState; effects: SheetEffect[] } {
  const stay = { state, effects: [] as SheetEffect[] };
  switch (event) {
    case 'show':
      // Opening again while closing takes the sheet back up; its pending close is abandoned.
      return state.phase === 'closed' || state.phase === 'closing'
        ? { state: { phase: 'opening', closedBy: null }, effects: [] }
        : stay;
    case 'shown':
      return state.phase === 'opening' ? { state: { phase: 'open', closedBy: null }, effects: [] } : stay;
    case 'dismiss':
      return state.phase === 'opening' || state.phase === 'open'
        ? { state: { phase: 'closing', closedBy: 'sheet' }, effects: ['dismissed'] }
        : stay;
    case 'hide':
      return state.phase === 'opening' || state.phase === 'open'
        ? { state: { phase: 'closing', closedBy: 'parent' }, effects: [] }
        : stay;
    case 'hidden':
      return state.phase === 'closing' ? { state: SHEET_CLOSED, effects: ['exited'] } : stay;
  }
}

/** Whether the sheet's `Modal` is mounted: from the first frame of opening to the last of closing. */
export function sheetVisible(state: SheetState): boolean {
  return state.phase !== 'closed';
}

/** Whether the panel takes touches: not while it is leaving, so a second tap cannot land. */
export function sheetInteractive(state: SheetState): boolean {
  return state.phase === 'opening' || state.phase === 'open';
}
