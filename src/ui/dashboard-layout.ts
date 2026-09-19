/**
 * Where the floating «+», the report handle and a scrolling column's own bottom padding sit — one
 * shared shape computed from the device's own safe area and the native tab bar's height, in place
 * of the two fixed pixel guesses each carried before (main-screen, "The dashboard remains
 * accessible on compact Android": disjoint targets, none of them under the tab bar).
 *
 * No React, no `react-native-safe-area-context`: the caller reads `useSafeAreaInsets().bottom`
 * and the platform's own tab bar height (`BottomTabInset` in `constants/theme.ts`) and hands them
 * in as plain numbers, exactly as `dashboard-charts.ts` takes its geometry as plain numbers.
 */

/** The least daylight two stacked overlay targets must keep between their own edges. */
export const OVERLAY_GAP = 8;

/** The margin kept between the tab bar/safe-area edge and the first overlay above it. */
const BASE_MARGIN = 16;

export interface OverlayInput {
  /** `useSafeAreaInsets().bottom` — 0 on three-button navigation, larger on gesture nav or a home indicator. */
  readonly safeAreaBottom: number;
  /** The native tab bar's own height, which draws over the bottom of every tab screen. */
  readonly tabBarHeight: number;
  /** The «+»'s own diameter. */
  readonly fabSize: number;
  /** The report handle's own diameter. */
  readonly handleSize: number;
}

export interface OverlayLayout {
  /** The «+»'s `bottom` style. */
  readonly fabBottom: number;
  /** The report handle's `bottom` style — stacked clear above the «+», never beside it. */
  readonly handleBottom: number;
  /** A scrolling column's `paddingBottom` so its last row clears both overlays and the tab bar. */
  readonly scrollBottomPadding: number;
}

/**
 * The «+» sits `BASE_MARGIN` above the safe area and the tab bar; the handle sits `OVERLAY_GAP`
 * above the «+»'s own top edge. Stacking them by construction is what keeps the two disjoint on
 * every device and on the one screen where both appear (Головний) — the report handle floats over
 * every screen (design D4) and the «+» only over Головний, so neither can know at render time
 * whether the other is present; a fixed, shared stack makes that unnecessary.
 */
export function overlayLayout(input: OverlayInput): OverlayLayout {
  const fabBottom = input.safeAreaBottom + input.tabBarHeight + BASE_MARGIN;
  const handleBottom = fabBottom + input.fabSize + OVERLAY_GAP;
  return {
    fabBottom,
    handleBottom,
    scrollBottomPadding: handleBottom + input.handleSize + BASE_MARGIN,
  };
}
