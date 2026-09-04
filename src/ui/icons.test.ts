import { describe, expect, it } from 'vitest';

import { ICON_PATHS, ICON_STROKE_WIDTH, ICON_VIEWBOX, type IconName } from './icons';

/**
 * The glyph table was written by hand, one path at a time, and the gate cannot draw a single one
 * of them. What it *can* do is catch the mistakes writing paths by hand actually makes: a path
 * pasted into two names, a coordinate typed outside the box, a glyph left empty.
 *
 * That is the whole of this file. It proves the table is well-formed. It does **not** prove that
 * a glyph looks like the thing it is named after, and it cannot: the artboards these were drawn
 * for are not in this repository. Only the emulator says whether `basket` is a basket.
 */

const names = Object.keys(ICON_PATHS) as IconName[];

/** Absolute commands only, so every number below is a coordinate rather than a delta or a flag. */
const ABSOLUTE_ONLY = /^[MLCZ0-9.\s]+$/;
const NUMBER = /\d+(?:\.\d+)?/g;

describe('the glyph table', () => {
  it('gives every name at least one subpath, and no empty ones', () => {
    for (const name of names) {
      const subpaths = ICON_PATHS[name];
      expect(subpaths.length, name).toBeGreaterThan(0);
      for (const subpath of subpaths) {
        expect(subpath.trim(), name).not.toBe('');
      }
    }
  });

  it('starts every subpath with a move, so no stroke picks up where the last one ended', () => {
    for (const name of names) {
      for (const subpath of ICON_PATHS[name]) {
        expect(subpath.startsWith('M'), `${name}: ${subpath}`).toBe(true);
      }
    }
  });

  it('draws with absolute commands only', () => {
    // The file's own rule, and the reason the coordinate check below means anything: with `l`,
    // `h` or `a` the numbers would be deltas and arc flags, and a bounds check would be reading
    // noise. A `-` cannot appear either — every coordinate in a 0–24 box is non-negative.
    for (const name of names) {
      for (const subpath of ICON_PATHS[name]) {
        expect(ABSOLUTE_ONLY.test(subpath), `${name}: ${subpath}`).toBe(true);
      }
    }
  });

  it('keeps every coordinate inside the 24×24 box', () => {
    for (const name of names) {
      for (const subpath of ICON_PATHS[name]) {
        for (const found of subpath.match(NUMBER) ?? []) {
          const coordinate = Number(found);
          expect(coordinate, `${name}: ${found} in ${subpath}`).toBeGreaterThanOrEqual(0);
          expect(coordinate, `${name}: ${found} in ${subpath}`).toBeLessThanOrEqual(ICON_VIEWBOX);
        }
      }
    }
  });

  it('never draws two names the same way', () => {
    const drawn = new Map<string, IconName>();
    for (const name of names) {
      const glyph = ICON_PATHS[name].join(' ');
      const already = drawn.get(glyph);
      expect(already, `${name} is drawn exactly like ${already}`).toBeUndefined();
      drawn.set(glyph, name);
    }
  });

  it('never repeats a single subpath across two names either', () => {
    // Where a paste slip actually lands: one stroke of a glyph copied into its neighbour. If two
    // glyphs ever share a stroke on purpose, lift that stroke into a named constant both read —
    // do not loosen this.
    const strokes = new Map<string, IconName>();
    for (const name of names) {
      for (const subpath of ICON_PATHS[name]) {
        const already = strokes.get(subpath);
        expect(already, `${name} repeats a subpath of ${already}: ${subpath}`).toBeUndefined();
        strokes.set(subpath, name);
      }
    }
  });

  it('holds the nine glyphs the proposal names as most-drawn', () => {
    // The foundation ships only what the proposal says two or more of the ten chosen artboards
    // need, and these nine are the ones it says three or more draw. That count is carried from
    // the proposal, not checked here — the canvas is not in the repository. What this pins is the
    // list itself: a table missing any of these nine is not the foundation the change promised,
    // whatever the artboards turn out to draw.
    for (const name of [
      'chevronRight',
      'chevronLeft',
      'card',
      'check',
      'income',
      'transfer',
      'chartRising',
      'basket',
      'tag',
    ] as const) {
      expect(ICON_PATHS[name], name).toBeDefined();
    }
  });

  it('draws at 24×24, stroke 2 — the artboards’ one geometry', () => {
    expect(ICON_VIEWBOX).toBe(24);
    expect(ICON_STROKE_WIDTH).toBe(2);
  });
});
