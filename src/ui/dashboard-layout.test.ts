import { describe, expect, it } from 'vitest';

import { OVERLAY_GAP, overlayLayout } from './dashboard-layout';

/** `TouchTarget(48) + Spacing.two(8)` in `constants/theme.ts` — the «+»'s real diameter. */
const FAB_SIZE = 56;
/** `TouchTarget(48)` in `constants/theme.ts` — the report handle's real diameter. */
const HANDLE_SIZE = 48;

describe('the shared overlay clearance', () => {
  it('Scenario: the «+» and the report handle are disjoint by at least 48 dp, ≥8 dp apart', () => {
    const layout = overlayLayout({ safeAreaBottom: 0, fabSize: FAB_SIZE, handleSize: HANDLE_SIZE });

    expect(FAB_SIZE).toBeGreaterThanOrEqual(48);
    expect(HANDLE_SIZE).toBeGreaterThanOrEqual(48);

    const fabTop = layout.fabBottom + FAB_SIZE;
    // Disjoint: the handle's own span begins only once the «+»'s own span has ended, with room.
    expect(layout.handleBottom).toBeGreaterThanOrEqual(fabTop + OVERLAY_GAP);
  });

  it('Scenario: neither target sits under the safe area, across compact and large insets', () => {
    // Compact: three-button navigation, nothing reserved. Large: gesture navigation or a home
    // indicator, up to ~48 dp. Both must clear the device's own unsafe strip, whatever it costs.
    for (const safeAreaBottom of [0, 16, 34, 48]) {
      const layout = overlayLayout({ safeAreaBottom, fabSize: FAB_SIZE, handleSize: HANDLE_SIZE });
      expect(layout.fabBottom).toBeGreaterThan(safeAreaBottom);
      expect(layout.handleBottom).toBeGreaterThan(layout.fabBottom);
    }
  });

  it('Scenario: the scroll column clears the taller of the two overlays', () => {
    const layout = overlayLayout({ safeAreaBottom: 34, fabSize: FAB_SIZE, handleSize: HANDLE_SIZE });
    const handleTop = layout.handleBottom + HANDLE_SIZE;
    const fabTop = layout.fabBottom + FAB_SIZE;
    expect(layout.scrollBottomPadding).toBeGreaterThan(Math.max(handleTop, fabTop));
  });

  it('a larger safe-area inset pushes every overlay and the clearance up by exactly that much', () => {
    const compact = overlayLayout({ safeAreaBottom: 0, fabSize: FAB_SIZE, handleSize: HANDLE_SIZE });
    const large = overlayLayout({ safeAreaBottom: 48, fabSize: FAB_SIZE, handleSize: HANDLE_SIZE });
    expect(large.fabBottom - compact.fabBottom).toBe(48);
    expect(large.handleBottom - compact.handleBottom).toBe(48);
    expect(large.scrollBottomPadding - compact.scrollBottomPadding).toBe(48);
  });

  it("does not reserve a native tab bar's own height — that is already excluded from the caller's layout", () => {
    // Regression guard for the emulator defect task 7.2 found: adding a tab-bar-height term here
    // double-counted space `NativeTabs` (app-tabs.tsx) already reserves for itself, floating the
    // «+» over card content instead of just above the tab bar. `OverlayInput` deliberately has no
    // such field any more — this test pins the absence rather than a value that could drift back.
    const layout = overlayLayout({ safeAreaBottom: 0, fabSize: FAB_SIZE, handleSize: HANDLE_SIZE });
    expect(layout.fabBottom).toBeLessThan(48);
  });
});
