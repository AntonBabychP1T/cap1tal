import { describe, expect, it } from 'vitest';

import {
  donutGeometry,
  donutMorph,
  donutSectorPath,
  historyGeometry,
  type HistorySeriesPoint,
  lineAt,
  lineMorph,
  linePath,
  MAX_PLOTTED_POINTS,
  sectorAt,
  barGeometry,
  forecastGeometry,
  lineRuns,
  monthTickLabels,
  valueScale,
} from './dashboard-charts';

describe('donutGeometry', () => {
  it('Scenario: A positive donut has one sector per category whose proportions sum to the center', () => {
    const rows = [
      { categoryId: 'a', amount: 700 },
      { categoryId: 'b', amount: 300 },
    ];
    const result = donutGeometry(rows);
    if (result.kind !== 'positive') throw new Error('expected positive');
    expect(result.sectors).toHaveLength(2);
    expect(result.sectors[0]!.startAngle).toBe(0);
    expect(result.sectors[0]!.endAngle).toBeCloseTo(252, 10);
    expect(result.sectors[0]!.fraction).toBeCloseTo(0.7, 10);
    expect(result.sectors[1]!.startAngle).toBeCloseTo(252, 10);
    expect(result.sectors[1]!.endAngle).toBeCloseTo(360, 10);
    expect(result.sectors[1]!.fraction).toBeCloseTo(0.3, 10);
    const totalFraction = result.sectors.reduce((s, sec) => s + sec.fraction, 0);
    expect(totalFraction).toBeCloseTo(1, 10);
    expect(result.sectors.at(-1)!.endAngle).toBeCloseTo(360, 10);
  });

  it('Scenario: No negative sector or division by zero — any negative amount is neutral', () => {
    const rows = [
      { categoryId: 'a', amount: 10000 },
      { categoryId: 'b', amount: -2000 },
    ];
    expect(donutGeometry(rows)).toEqual({ kind: 'neutral' });
  });

  it('Scenario: All-zero amounts are neutral, not a division by zero', () => {
    const rows = [
      { categoryId: 'a', amount: 0 },
      { categoryId: 'b', amount: 0 },
    ];
    expect(donutGeometry(rows)).toEqual({ kind: 'neutral' });
  });

  it('Scenario: A net-negative total (refund-only) is neutral', () => {
    expect(donutGeometry([{ categoryId: 'clothes', amount: -5000 }])).toEqual({ kind: 'neutral' });
  });

  it('Scenario: No categories at all is neutral', () => {
    expect(donutGeometry([])).toEqual({ kind: 'neutral' });
  });

  it('A zero-amount category alongside positive ones still gets a (degenerate) sector', () => {
    const result = donutGeometry([
      { categoryId: 'a', amount: 1000 },
      { categoryId: 'b', amount: 0 },
    ]);
    if (result.kind !== 'positive') throw new Error('expected positive');
    expect(result.sectors[1]).toEqual({ categoryId: 'b', startAngle: 360, endAngle: 360, fraction: 0 });
  });
});

describe('historyGeometry', () => {
  it('Scenario: Negative and flat history keep a nonzero visual range', () => {
    const flat: HistorySeriesPoint[] = [
      { x: 0, value: -5000 },
      { x: 0.5, value: -5000 },
      { x: 1, value: -5000 },
    ];
    const result = historyGeometry(flat);
    expect(result.maxValue).toBeGreaterThan(result.minValue);
    expect(result.minValue).toBeLessThan(-5000);
    expect(result.maxValue).toBeGreaterThan(-5000);
    // Every point still lands inside [0, 1] — no division by zero produced Infinity/NaN.
    for (const segment of result.segments) {
      for (const p of segment) {
        expect(Number.isFinite(p.y)).toBe(true);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it('Scenario: An all-zero flat history also gets a nonzero range', () => {
    const result = historyGeometry([{ x: 0, value: 0 }, { x: 1, value: 0 }]);
    expect(result.maxValue).toBeGreaterThan(result.minValue);
  });

  it('Scenario: No line bridges an unknown gap — segments split at gaps', () => {
    const series: HistorySeriesPoint[] = [
      { x: 0, value: 100 },
      { x: 0.25, value: 200 },
      { x: 0.5, value: undefined },
      { x: 0.75, value: undefined },
      { x: 1, value: 300 },
    ];
    const result = historyGeometry(series);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]!.map((p) => p.seriesIndex)).toEqual([0, 1]);
    expect(result.segments[1]!.map((p) => p.seriesIndex)).toEqual([4]);
  });

  it('Scenario: Chart work is bounded independently of history length (task 5.4)', () => {
    // Realistically Статок's history is at most 120 monthly points (net-worth history is monthly,
    // never daily), but the bound this module promises is on the *algorithm*, not on that one
    // known caller — so this proves it holds far past any real caller, at 50000 points, the same
    // order of magnitude task 5.4's own fixture uses for the repository beneath it.
    const series: HistorySeriesPoint[] = Array.from({ length: 50000 }, (_, i) => ({
      x: i / 49999,
      value: Math.sin(i / 97) * 100000 + i,
    }));
    const start = performance.now();
    const result = historyGeometry(series);
    const elapsedMs = performance.now() - start;

    expect(result.segments).toHaveLength(1);
    const plotted = result.segments[0]!;
    // Bounded output regardless of how long the input series is — the whole point of the budget.
    expect(plotted.length).toBeLessThanOrEqual(MAX_PLOTTED_POINTS);
    expect(plotted[0]!.seriesIndex).toBe(0);
    expect(plotted.at(-1)!.seriesIndex).toBe(49999);
    // Generous on purpose — this guards against an accidental quadratic pass over the input
    // reappearing, not against normal variance on a shared CI machine.
    expect(elapsedMs).toBeLessThan(1000);
  });

  it('Scenario: A bounded path preserves first, last, extrema and gaps under 120 points', () => {
    // A single run of 400 points: a rise to a peak, a fall to a trough, a rise to the end — the
    // two turning points are the extrema a downsampled path must not lose.
    const series: HistorySeriesPoint[] = [];
    for (let i = 0; i < 400; i++) {
      let value: number;
      if (i <= 150) value = i; // rising to a peak at i=150
      else if (i <= 300) value = 150 - (i - 150); // falling to a trough at i=300
      else value = i - 300; // rising again to the end
      series.push({ x: i / 399, value });
    }
    const result = historyGeometry(series);
    expect(result.segments).toHaveLength(1);
    const plotted = result.segments[0]!;
    expect(plotted.length).toBeLessThanOrEqual(MAX_PLOTTED_POINTS);
    expect(plotted[0]!.seriesIndex).toBe(0);
    expect(plotted.at(-1)!.seriesIndex).toBe(399);
    // The peak (150) and trough (300) turning points survive downsampling.
    expect(plotted.some((p) => p.seriesIndex === 150)).toBe(true);
    expect(plotted.some((p) => p.seriesIndex === 300)).toBe(true);
  });

  it('Scenario: Unsampled exact point values remain available by series index', () => {
    const series: HistorySeriesPoint[] = Array.from({ length: 300 }, (_, i) => ({
      x: i / 299,
      value: i * 137, // an exact, easily-checked value per point
    }));
    const result = historyGeometry(series);
    const plotted = result.segments[0]!;
    expect(plotted.length).toBeLessThan(series.length);
    // Every plotted point's seriesIndex still resolves to its exact original value — the
    // downsampled path never invents or rounds a value, it only thins which ones are drawn.
    for (const p of plotted) {
      expect(series[p.seriesIndex]!.value).toBe(p.seriesIndex * 137);
    }
  });

  it('Scenario: A single known date is one labelled point without a line', () => {
    const result = historyGeometry([{ x: 1, value: 500 }]);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toHaveLength(1);
  });

  it('No history at all produces no segments', () => {
    expect(historyGeometry([{ x: 0, value: undefined }])).toEqual({
      minValue: 0,
      maxValue: 0,
      segments: [],
    });
  });
});

describe('donutSectorPath', () => {
  const ring = { center: 80, outerRadius: 72, innerRadius: 44 };
  /** Every arc command's end point, as `[x, y]` — what decides whether an arc draws anything. */
  const arcEnds = (d: string): [number, number][] =>
    [...d.matchAll(/A [\d.]+ [\d.]+ 0 [01] [01] (-?[\d.e-]+) (-?[\d.e-]+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
  const moveTo = (d: string): [number, number][] =>
    [...d.matchAll(/M (-?[\d.e-]+) (-?[\d.e-]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

  it('A category at 100% draws a full ring, not an arc whose start is its end', () => {
    // QA: one category at 100% gave `sectorPath(0, 360)` — start == end, and an SVG arc between
    // two equal points draws nothing, leaving the number alone in an empty block.
    const d = donutSectorPath(0, 360, ring);
    for (const [x, y] of arcEnds(d)) {
      // Each half-circle ends at 12 or 6 o'clock — never back at its own start in one command.
      expect(Math.abs(x - 80)).toBeLessThan(1e-9);
      expect([8, 152, 36, 124].some((end) => Math.abs(y - end) < 1e-9)).toBe(true);
    }
    // Two closed circles: the outer one clockwise, the inner one counter-clockwise, so the
    // default non-zero fill leaves the hole empty.
    expect(arcEnds(d)).toHaveLength(4);
    expect(moveTo(d)).toHaveLength(2);
    expect(d).toContain('A 72 72 0 1 1');
    expect(d).toContain('A 44 44 0 1 0');
  });

  it('A sweep within an epsilon of the full circle is the full ring too', () => {
    expect(donutSectorPath(0, 359.9999, ring)).toBe(donutSectorPath(0, 360, ring));
    expect(donutSectorPath(12, 372, ring)).toBe(donutSectorPath(0, 360, ring));
  });

  it('A partial sector is one annular wedge between its two angles', () => {
    const d = donutSectorPath(0, 90, ring);
    expect(moveTo(d)).toEqual([[80, 8]]);
    const ends = arcEnds(d);
    expect(ends).toHaveLength(2);
    // Outer arc ends at 3 o'clock, inner arc back at 12 o'clock.
    expect(ends[0]![0]).toBeCloseTo(152);
    expect(ends[0]![1]).toBeCloseTo(80);
    expect(ends[1]![0]).toBeCloseTo(80);
    expect(ends[1]![1]).toBeCloseTo(36);
    expect(d).toContain('A 72 72 0 0 1');
  });

  it('A sector over half the circle takes the large arc', () => {
    expect(donutSectorPath(0, 270, ring)).toContain('A 72 72 0 1 1');
  });
});

describe('linePath', () => {
  it('draws one polyline per run, flipped for the y-down axis', () => {
    expect(
      linePath(
        [
          [
            { x: 0, y: 0 },
            { x: 0.5, y: 1 },
          ],
          [{ x: 1, y: 0.5 }],
        ],
        200,
        100,
      ),
    ).toBe('M 0 100 L 100 0 M 200 50');
  });
});

describe('lineMorph', () => {
  // Two histories over the same five days, one of them with other values.
  const days = (values: (number | undefined)[]): HistorySeriesPoint[] =>
    values.map((value, i) => ({ x: i / (values.length - 1), value }));

  it('Scenario: Switching the історія статку morphs the line', () => {
    const uah = historyGeometry(days([100, 300, 200, 400, 500]));
    const usd = historyGeometry(days([5, 4, 6, 8, 7]));
    const morph = lineMorph(uah, usd);
    if (morph.kind !== 'morph') throw new Error('expected a morph');
    // Every point keeps its place on the time axis and travels from its old height to its new one.
    expect(morph.xs).toEqual([[0, 0.25, 0.5, 0.75, 1]]);
    expect(morph.from).toEqual([uah.segments[0]!.map((p) => p.y)]);
    expect(morph.to).toEqual([usd.segments[0]!.map((p) => p.y)]);
    // At either end the drawn line is exactly one of the two real shapes.
    expect(lineAt(morph, 0)).toEqual(uah.segments.map((run) => run.map(({ x, y }) => ({ x, y }))));
    expect(lineAt(morph, 1)).toEqual(usd.segments.map((run) => run.map(({ x, y }) => ({ x, y }))));
    expect(lineAt(morph, 0.5)[0]![1]!.y).toBeCloseTo((morph.from[0]![1]! + morph.to[0]![1]!) / 2);
  });

  it('Scenario: A shape that cannot be matched cross-fades', () => {
    const whole = historyGeometry(days([1, 2, 3, 4, 5]));
    // A gap where the shown history has none: another split into runs.
    expect(lineMorph(whole, historyGeometry(days([1, 2, undefined, 4, 5])))).toEqual({ kind: 'fade' });
    // Another point count.
    expect(lineMorph(whole, historyGeometry(days([1, 2, 3, 4])))).toEqual({ kind: 'fade' });
    // Equal counts on other days, as downsampling can leave them: another seriesIndex.
    const thinned = {
      segments: [whole.segments[0]!.map((p, i) => (i === 2 ? { ...p, seriesIndex: 7 } : p))],
    };
    expect(lineMorph(whole, thinned)).toEqual({ kind: 'fade' });
    // Nothing drawn before is nothing to travel from.
    expect(lineMorph(historyGeometry([]), whole)).toEqual({ kind: 'fade' });
  });
});

describe('donutMorph', () => {
  const ring = (rows: [string, number][]) =>
    donutGeometry(rows.map(([categoryId, amount]) => ({ categoryId, amount })));

  it('Scenario: A new категорія grows into the donut', () => {
    const before = ring([
      ['food', 300],
      ['cafe', 100],
    ]);
    const after = ring([
      ['food', 300],
      ['taxi', 100],
      ['cafe', 200],
    ]);
    const morph = donutMorph(before, after);
    if (morph.kind !== 'morph') throw new Error('expected a morph');
    expect(morph.sectors.map((s) => s.key)).toEqual(['food', 'taxi', 'cafe']);
    const [food, taxi, cafe] = morph.sectors;
    // The arriving sector starts at zero sweep where it will sit — between food and cafe.
    expect(taxi!.from).toEqual([270, 270]);
    expect(taxi!.to).toEqual([180, 240]);
    // The others move to their new shares.
    expect(food!.from).toEqual([0, 270]);
    expect(food!.to).toEqual([0, 180]);
    expect(cafe!.from).toEqual([270, 360]);
    expect(cafe!.to).toEqual([240, 360]);
    // Settled, every sector is exactly the new geometry's.
    if (after.kind !== 'positive') throw new Error('expected positive');
    for (const sector of morph.sectors) {
      const target = after.sectors.find((s) => s.categoryId === sector.key)!;
      expect(sectorAt(sector, 1)).toEqual([target.startAngle, target.endAngle]);
    }
  });

  it('shrinks a leaving категорія to zero sweep where it was', () => {
    const morph = donutMorph(
      ring([
        ['food', 200],
        ['taxi', 100],
        ['cafe', 100],
      ]),
      ring([
        ['food', 300],
        ['cafe', 100],
      ]),
    );
    if (morph.kind !== 'morph') throw new Error('expected a morph');
    const taxi = morph.sectors.find((s) => s.key === 'taxi')!;
    expect(taxi.from).toEqual([180, 270]);
    expect(taxi.to).toEqual([270, 270]);
  });

  it('cross-fades a neutral ring or shared категорії in another order', () => {
    const shown = ring([
      ['food', 300],
      ['cafe', 100],
    ]);
    expect(donutMorph(shown, ring([]))).toEqual({ kind: 'fade' });
    expect(donutMorph(ring([['food', -10]]), shown)).toEqual({ kind: 'fade' });
    expect(
      donutMorph(
        shown,
        ring([
          ['cafe', 400],
          ['food', 100],
        ]),
      ),
    ).toEqual({ kind: 'fade' });
  });
});

describe('the «Статок» screen charts', () => {
  it('Scenario: Two years still name the months', () => {
    // 24 bars, листопад 2024 to жовтень 2026: labels at a regular interval, first and current.
    const ticks = monthTickLabels(24, 12);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(23);
    expect(ticks.length).toBeLessThanOrEqual(12);
    const gaps = ticks.slice(1, -1).map((t, i) => t - ticks[i]!);
    expect(new Set(gaps).size).toBe(1);
    // Every bar can still be selected: one per month, labelled or not.
    expect(barGeometry(Array.from({ length: 24 }, (_, i) => 1000 * (i + 1))).bars).toHaveLength(24);
    // Twelve or fewer: every month is named.
    expect(monthTickLabels(12, 12)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('Scenario: Negative and flat history', () => {
    const negative = barGeometry([-3000, 2000, undefined, -1000]);
    expect(negative.scale).toEqual({ min: -3000, max: 2000 });
    expect(negative.zero).toBeCloseTo(0.6);
    // A negative bar hangs below the zero line, a positive one stands on it; unknown is no bar.
    expect(negative.bars[0]).toEqual({ index: 0, bottom: 0, top: negative.zero });
    expect(negative.bars[1]).toEqual({ index: 1, bottom: negative.zero, top: 1 });
    expect(negative.bars[2]).toBeUndefined();

    const flat = barGeometry([5000, 5000, 5000]);
    expect(flat.scale.max).toBeGreaterThan(flat.scale.min);
    expect(Number.isFinite(flat.zero)).toBe(true);
    const zeros = barGeometry([0, 0]);
    expect(zeros.scale).toEqual({ min: -1, max: 1 });
    expect(valueScale([], false)).toEqual({ min: -1, max: 1 });
  });

  it('puts the forecast and its band on the recorded months\' scale', () => {
    const geometry = forecastGeometry([100, 200], [{ value: 300, low: 250, high: 400 }], false);
    expect(geometry.scale).toEqual({ min: 100, max: 400 });
    expect(geometry.recorded).toEqual([0, 1 / 3]);
    expect(geometry.projected[0]).toEqual({ value: 2 / 3, low: 0.5, high: 1 });
  });

  it('draws a line through column centres and breaks it at an unknown month', () => {
    expect(lineRuns([0, 0.5, undefined, 1], 4)).toEqual([
      [
        { x: 0.125, y: 0 },
        { x: 0.375, y: 0.5 },
      ],
      [{ x: 0.875, y: 1 }],
    ]);
  });
});
