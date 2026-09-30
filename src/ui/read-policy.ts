/**
 * When a screen reads storage — the one decision `useReloadOnFocus` applies (app-shell, "A tab
 * reads storage only once it is first opened", "A screen out of sight re-reads when it comes back,
 * not before"; app-speed-pass design D4). Pure, so the rules are under `verify` while the hook that
 * applies them stays a thin wiring of React Navigation's focus events.
 *
 * - `read-now`: read storage and show what it holds.
 * - `mark-stale`: storage may have changed; read once when the screen next comes into sight.
 * - `skip`: nothing to do.
 */
export type ReadDecision = 'read-now' | 'mark-stale' | 'skip';

/**
 * What happened to the screen.
 *
 * - `mount`: the screen is being created. Only a tab can be created out of sight — Android's
 *   native tabs build every tab at launch.
 * - `focus`: the screen came into sight.
 * - `blur`: the screen went out of sight — pushed under another, or another tab chosen.
 * - `changed`: something outside the screen changed storage — a прогін finished, captured
 *   notifications were stored, the прогрес was judged.
 * - `own-write`: the screen itself just wrote.
 * - `read-changed`: what the screen reads changed while it was mounted — Місяць stepping a month,
 *   a «Транзакції» filter.
 */
export type ReadEvent = 'mount' | 'focus' | 'blur' | 'changed' | 'own-write' | 'read-changed';

export interface ReadState {
  /** Whether the screen is in sight right now. */
  readonly focused: boolean;
  /** Whether the screen has been in sight at any moment before this event, mount included. */
  readonly everFocused: boolean;
  /** Whether storage may have changed since the screen last read it. */
  readonly stale: boolean;
  readonly event: ReadEvent;
}

export function decideRead(state: ReadState): ReadDecision {
  switch (state.event) {
    case 'mount':
      // A tab built in the background reads nothing until it is first opened.
      return state.focused ? 'read-now' : 'skip';
    case 'focus':
      // The first focus of a screen that read when it mounted in sight is that same moment: the
      // value is fresh. Every other focus reads — a screen out of sight is stale by `blur`.
      return !state.everFocused || state.stale ? 'read-now' : 'skip';
    case 'blur':
      return 'mark-stale';
    case 'changed':
    case 'own-write':
    case 'read-changed':
      if (state.focused) return 'read-now';
      // A tab never opened reads on its first focus anyway; there is nothing to remember.
      return state.everFocused ? 'mark-stale' : 'skip';
  }
}

/**
 * The event a прогін's state change is for the screens that show its транзакції: `changed` once
 * it has finished — it may have stored something — and nothing at all when it starts, since at that
 * moment nothing has been written (app-shell, "A sync starting reads nothing").
 */
export function syncEvent(inFlight: boolean): ReadEvent | undefined {
  return inFlight ? undefined : 'changed';
}
