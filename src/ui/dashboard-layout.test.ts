import { describe, expect, it } from 'vitest';

import { OVERLAY_GAP, overlayLayout } from './dashboard-layout';

/** `TouchTarget(48) + Spacing.two(8)` in `constants/theme.ts` — the «+»'s real diameter. */
const FAB_SIZE = 56;
/** `TouchTarget(48)` in `constants/theme.ts` — the report handle's real diameter. */
const HANDLE_SIZE = 48;
/** `BottomTabInset` on Android in `constants/theme.ts`. */
const ANDROID_TAB_BAR = 80;
/** `BottomTabInset` on iOS in `constants/theme.ts`. */
const IOS_TAB_BAR = 50;

describe('the shared overlay clearance', () => {
  it('Scenario: the «+» and the report handle are disjoint by at least 48 dp, ≥8 dp apart', () => {
    const layout = overlayLayout({
      safeAreaBottom: 0,
      tabBarHeight: ANDROID_TAB_BAR,
      fabSize: FAB_SIZE,
      handleSize: HANDLE_SIZE,
    });

    expect(FAB_SIZE).toBeGreaterThanOrEqual(48);
    expect(HANDLE_SIZE).toBeGreaterThanOrEqual(48);

    const fabTop = layout.fabBottom + FAB_SIZE;
    // Disjoint: the handle's own span begins only once the «+»'s own span has ended, with room.
    expect(layout.handleBottom).toBeGreaterThanOrEqual(fabTop + OVERLAY_GAP);
  });

  it('Scenario: neither target sits under the tab bar, across compact and large insets', () => {
    // Compact: three-button navigation, nothing reserved. Large: gesture navigation or a home
    // indicator, up to ~48 dp. Both must clear the tab bar itself, whatever it costs.
    for (const safeAreaBottom of [0, 16, 34, 48]) {
      for (const tabBarHeight of [IOS_TAB_BAR, ANDROID_TAB_BAR]) {
        const layout = overlayLayout({
          safeAreaBottom,
          tabBarHeight,
          fabSize: FAB_SIZE,
          handleSize: HANDLE_SIZE,
        });
        expect(layout.fabBottom).toBeGreaterThan(safeAreaBottom + tabBarHeight);
        expect(layout.handleBottom).toBeGreaterThan(layout.fabBottom);
      }
    }
  });

  it('Scenario: the scroll column clears the taller of the two overlays', () => {
    const layout = overlayLayout({
      safeAreaBottom: 34,
      tabBarHeight: IOS_TAB_BAR,
      fabSize: FAB_SIZE,
      handleSize: HANDLE_SIZE,
    });
    const handleTop = layout.handleBottom + HANDLE_SIZE;
    const fabTop = layout.fabBottom + FAB_SIZE;
    expect(layout.scrollBottomPadding).toBeGreaterThan(Math.max(handleTop, fabTop));
  });

  it('a larger safe-area inset pushes every overlay and the clearance up by exactly that much', () => {
    const compact = overlayLayout({
      safeAreaBottom: 0,
      tabBarHeight: ANDROID_TAB_BAR,
      fabSize: FAB_SIZE,
      handleSize: HANDLE_SIZE,
    });
    const large = overlayLayout({
      safeAreaBottom: 48,
      tabBarHeight: ANDROID_TAB_BAR,
      fabSize: FAB_SIZE,
      handleSize: HANDLE_SIZE,
    });
    expect(large.fabBottom - compact.fabBottom).toBe(48);
    expect(large.handleBottom - compact.handleBottom).toBe(48);
    expect(large.scrollBottomPadding - compact.scrollBottomPadding).toBe(48);
  });

  it('a taller tab bar pushes both overlays and the clearance up by exactly that much', () => {
    const ios = overlayLayout({
      safeAreaBottom: 0,
      tabBarHeight: IOS_TAB_BAR,
      fabSize: FAB_SIZE,
      handleSize: HANDLE_SIZE,
    });
    const android = overlayLayout({
      safeAreaBottom: 0,
      tabBarHeight: ANDROID_TAB_BAR,
      fabSize: FAB_SIZE,
      handleSize: HANDLE_SIZE,
    });
    const grew = ANDROID_TAB_BAR - IOS_TAB_BAR;
    expect(android.fabBottom - ios.fabBottom).toBe(grew);
    expect(android.handleBottom - ios.handleBottom).toBe(grew);
  });
});
