/**
 * The one manual sync action the header's button and pull-to-refresh both call (main-screen,
 * "Sync occupies a compact header" — "Button and gesture share a run"). Coverage, freshness and
 * in-flight joining are `home-screen.ts`'s `HomeMonobank`/`freshnessOf` and `startSync`'s own
 * concerns respectively; this decides only the one thing specific to a widget with no rahunok of
 * its own — whether to ask at all.
 */

/**
 * `startSync` already joins a run already going on rather than starting a second one, so this
 * never checks whether one is in flight — it exists only to keep a device with no token or no
 * linked рахунок quiet (main-screen, "No bank remains quiet"): no fallback request, no
 * widget-specific path, nothing asked that the shared sync policy would not have asked anyway.
 *
 * Never swallows a rejection: a run that fails propagates it to the caller, whose own `finally`
 * is what clears the spinner either way (main-screen, "Button and gesture share a run" —
 * "refreshing ends on success or failure").
 */
export async function manualRefresh(input: {
  readonly configured: boolean;
  readonly linkedCount: number;
  readonly startSync: () => Promise<void>;
}): Promise<void> {
  if (!input.configured || input.linkedCount === 0) {
    return;
  }
  await input.startSync();
}
