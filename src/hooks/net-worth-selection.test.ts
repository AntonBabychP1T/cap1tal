import { describe, expect, it, vi } from 'vitest';

import { createNetWorthSelectionStore } from './net-worth-selection';

describe('the shared Статок selection', () => {
  it('opens on the defaults: «1 рік», «Стовпці», and no reading chosen yet', () => {
    expect(createNetWorthSelectionStore().get()).toEqual({ period: 12, view: 'bars' });
  });

  it('Scenario: Choices survive the round trip', () => {
    // The screen and Головний read the same store: what one sets, the other reads back.
    const store = createNetWorthSelectionStore();
    const heard = vi.fn();
    store.subscribe(heard);
    store.set({ history: 'USD' });
    store.set({ period: 24 });
    store.set({ view: 'line' });
    // Leaving the screen and opening it again reads the same store.
    expect(store.get()).toEqual({ history: 'USD', period: 24, view: 'line' });
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it('Scenario: The forecast does not persist — the store holds no «Прогноз»', () => {
    const store = createNetWorthSelectionStore();
    store.set({ view: 'line' });
    expect('forecast' in store.get()).toBe(false);
  });

  it('stops telling a listener that unsubscribed', () => {
    const store = createNetWorthSelectionStore();
    const heard = vi.fn();
    const stop = store.subscribe(heard);
    stop();
    store.set({ period: 6 });
    expect(heard).not.toHaveBeenCalled();
  });
});
