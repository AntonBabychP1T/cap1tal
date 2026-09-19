import { describe, expect, it, vi } from 'vitest';

import { manualRefresh } from './home-refresh';

describe('manualRefresh', () => {
  it('Scenario: No bank remains quiet — not configured', async () => {
    const startSync = vi.fn(async () => {});
    await manualRefresh({ configured: false, linkedCount: 0, startSync });
    expect(startSync).not.toHaveBeenCalled();
  });

  it('Scenario: No bank remains quiet — configured but nothing linked', async () => {
    const startSync = vi.fn(async () => {});
    await manualRefresh({ configured: true, linkedCount: 0, startSync });
    expect(startSync).not.toHaveBeenCalled();
  });

  it('Scenario: A configured, linked bank is asked — no widget-specific fallback path', async () => {
    const startSync = vi.fn(async () => {});
    await manualRefresh({ configured: true, linkedCount: 3, startSync });
    expect(startSync).toHaveBeenCalledTimes(1);
  });

  it('Scenario: In-flight joining is delegated to startSync, not pre-checked here', async () => {
    // No `syncing` input exists to gate on — every call that passes the configured/linked check
    // reaches `startSync`, which is what already joins a run in flight rather than starting a
    // second one. Two overlapping calls both reach it.
    const startSync = vi.fn(async () => {});
    await Promise.all([
      manualRefresh({ configured: true, linkedCount: 1, startSync }),
      manualRefresh({ configured: true, linkedCount: 1, startSync }),
    ]);
    expect(startSync).toHaveBeenCalledTimes(2);
  });

  it('Scenario: A rejected run propagates so the caller can clear its own spinner', async () => {
    const failure = new Error('unavailable');
    const startSync = vi.fn(async () => {
      throw failure;
    });
    let cleared = false;
    await expect(
      manualRefresh({ configured: true, linkedCount: 1, startSync }).finally(() => {
        cleared = true;
      }),
    ).rejects.toBe(failure);
    expect(cleared).toBe(true);
  });
});
