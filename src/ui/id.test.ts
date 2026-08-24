import { describe, expect, it } from 'vitest';

import { newId } from './id';

describe('newId', () => {
  it('gives a non-empty opaque text id', () => {
    const id = newId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(8);
  });

  it('does not repeat itself within a burst', () => {
    const ids = new Set(Array.from({ length: 1000 }, newId));
    expect(ids.size).toBe(1000);
  });
});
