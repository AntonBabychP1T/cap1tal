/**
 * Pure chart geometry for the dashboard: the category donut and the Статок history line. No
 * React, no `react-native-svg` — a renderer (task 4.5/4.6) turns this into `Path`s. Angles are
 * degrees, 0 at 12 o'clock, clockwise; normalized coordinates are 0..1, the caller's own job to
 * place in a viewBox.
 *
 * The path builders carry the `'worklet'` directive (app-motion-pass design D12): a morphing chart
 * builds its `d` on the UI thread every frame of its 300 ms. The directive is a plain string to
 * Node, so they stay pure and tested here like everything else.
 */

/** One category's share of a positive donut. */
export interface DonutSector {
  readonly categoryId: string;
  readonly startAngle: number;
  readonly endAngle: number;
  /** This sector's own share of the positive total, 0..1. */
  readonly fraction: number;
}

/**
 * `neutral`: no usual share-of-total pie can be drawn honestly — any negative category, or a
 * total that is not strictly positive (main-screen, "Signed or empty breakdowns never claim false
 * shares"). The exact signed center and legend remain the caller's own data
 * (`categoryPresentation`'s `center`/`rows`); this only decides whether sectors exist at all.
 */
export type DonutGeometry =
  | { readonly kind: 'positive'; readonly sectors: readonly DonutSector[] }
  | { readonly kind: 'neutral' };

/**
 * Sectors reconcile to the full circle exactly when every row's fraction is included, in the
 * rows' own order — no absolute-value pie, no clipped negative, no division by zero (the total is
 * checked positive before anything divides by it).
 */
export function donutGeometry(rows: readonly { categoryId: string; amount: number }[]): DonutGeometry {
  if (rows.length === 0 || rows.some((r) => r.amount < 0)) {
    return { kind: 'neutral' };
  }
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  if (total <= 0) {
    return { kind: 'neutral' };
  }
  let angle = 0;
  const sectors = rows.map((r) => {
    const fraction = r.amount / total;
    const startAngle = angle;
    angle += fraction * 360;
    return { categoryId: r.categoryId, startAngle, endAngle: angle, fraction };
  });
  return { kind: 'positive', sectors };
}

/** Where a donut sits in its viewBox: its centre (both axes) and its two radii. */
export interface DonutRing {
  readonly center: number;
  readonly outerRadius: number;
  readonly innerRadius: number;
}

/**
 * How close to 360° a sweep must come to be drawn as the whole ring. Floating sums of fractions
 * land a hair off 360 (0.1 + 0.2 + 0.7 of it), and the neutral ring asks for 359.999 — both are the
 * full circle, and a 0.01° sliver missing from 12 o'clock is not something anyone could see.
 */
const FULL_SWEEP_EPSILON = 0.01;

function polarPoint(ring: DonutRing, radius: number, angleDeg: number): { x: number; y: number } {
  'worklet';
  // -90 so 0° is 12 o'clock, matching `donutGeometry`'s own convention, sweeping clockwise.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: ring.center + radius * Math.cos(rad), y: ring.center + radius * Math.sin(rad) };
}

/**
 * One donut sector as an SVG path `d`: an annular wedge from `startAngle` to `endAngle`, both
 * degrees clockwise from 12 o'clock, between the ring's two radii.
 *
 * A sweep of (nearly) the full circle is drawn as the whole ring instead — one category at 100%
 * is `(0, 360)`, whose start and end are the *same point*, and an SVG arc between two equal points
 * draws nothing at all: the widget showed its number alone in an empty block. The ring is two
 * closed circles, each as two half-circle arcs (12 → 6 → 12 o'clock, so no single arc ever ends
 * where it began): the outer clockwise, the inner counter-clockwise, so the default non-zero fill
 * rule leaves the hole unpainted without needing `fillRule="evenodd"` at the call site.
 */
export function donutSectorPath(startAngle: number, endAngle: number, ring: DonutRing): string {
  'worklet';
  const { center: c, outerRadius: R, innerRadius: r } = ring;
  if (endAngle - startAngle >= 360 - FULL_SWEEP_EPSILON) {
    return [
      `M ${c} ${c - R}`,
      `A ${R} ${R} 0 1 1 ${c} ${c + R}`,
      `A ${R} ${R} 0 1 1 ${c} ${c - R}`,
      'Z',
      `M ${c} ${c - r}`,
      `A ${r} ${r} 0 1 0 ${c} ${c + r}`,
      `A ${r} ${r} 0 1 0 ${c} ${c - r}`,
      'Z',
    ].join(' ');
  }
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const outerStart = polarPoint(ring, R, startAngle);
  const outerEnd = polarPoint(ring, R, endAngle);
  const innerEnd = polarPoint(ring, r, endAngle);
  const innerStart = polarPoint(ring, r, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${R} ${R} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${r} ${r} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

/** One dated reading on the history axis — `value` absent is a gap (net-worth, "coverage gaps"). */
export interface HistorySeriesPoint {
  /** Position along the time axis, 0 (earliest) to 1 (latest) — the caller's own date mapping. */
  readonly x: number;
  readonly value: number | undefined;
}

/** One plotted point: its position in the input series and its normalized (x, y). */
export interface PlottedPoint {
  readonly seriesIndex: number;
  readonly x: number;
  /** 0 at `minValue`, 1 at `maxValue` — the caller flips for SVG's y-down axis. */
  readonly y: number;
}

export interface HistoryGeometry {
  readonly minValue: number;
  readonly maxValue: number;
  /**
   * One entry per unbroken run of known values, in order — a run never crosses a gap, so no
   * segment's polyline ever bridges one (net-worth, "no line bridges an unknown gap"). Each
   * segment is bounded to at most `MAX_PLOTTED_POINTS_PER_SERIES` points total across the whole
   * series, preserving every run's first and last point and its local extrema first.
   */
  readonly segments: readonly (readonly PlottedPoint[])[];
}

/**
 * The bound design D5 asks for: "at most 120 plotted points, preserve ends/extrema/gaps". Exact
 * comparison and point inspection read the caller's own original `series` by `seriesIndex` —
 * downsampling only thins what is drawn, never what can be asked about.
 */
export const MAX_PLOTTED_POINTS = 120;

function budgetFor(runLength: number, totalKnown: number): number {
  if (totalKnown <= MAX_PLOTTED_POINTS) {
    return runLength;
  }
  const share = Math.round((runLength / totalKnown) * MAX_PLOTTED_POINTS);
  return Math.max(share, Math.min(runLength, 2));
}

/** First, last, then local extrema, then an even stride over what remains — index order. */
function downsampleRun<T extends { readonly value: number }>(run: readonly T[], budget: number): T[] {
  if (run.length <= budget || run.length <= 2) {
    return [...run];
  }
  const keep = new Set<number>([0, run.length - 1]);
  for (let i = 1; i < run.length - 1 && keep.size < budget; i++) {
    const prev = run[i - 1]!.value;
    const cur = run[i]!.value;
    const next = run[i + 1]!.value;
    if ((cur - prev) * (next - cur) < 0) {
      keep.add(i);
    }
  }
  if (keep.size < budget) {
    const remaining = budget - keep.size;
    const stride = Math.max(1, Math.floor(run.length / (remaining + 1)));
    for (let i = 0; i < run.length && keep.size < budget; i += stride) {
      keep.add(i);
    }
  }
  return [...keep].sort((a, b) => a - b).map((i) => run[i]!);
}

/**
 * The history's scale and bounded plotted segments. Flat or entirely negative history still gets
 * a nonzero visual range (net-worth, "Negative and flat history… nonzero visual range, no
 * division by zero"): when every known value is identical, the range is padded symmetrically
 * around it rather than collapsing to a single pixel row.
 */
export function historyGeometry(series: readonly HistorySeriesPoint[]): HistoryGeometry {
  const known = series
    .map((p, seriesIndex) => ({ x: p.x, value: p.value, seriesIndex }))
    .filter((p): p is { x: number; value: number; seriesIndex: number } => p.value !== undefined);

  if (known.length === 0) {
    return { minValue: 0, maxValue: 0, segments: [] };
  }

  let minValue = known[0]!.value;
  let maxValue = known[0]!.value;
  for (const p of known) {
    if (p.value < minValue) minValue = p.value;
    if (p.value > maxValue) maxValue = p.value;
  }
  if (minValue === maxValue) {
    const pad = Math.max(Math.abs(minValue), 1);
    minValue -= pad;
    maxValue += pad;
  }
  const range = maxValue - minValue;

  const runs: { x: number; value: number; seriesIndex: number }[][] = [];
  let current: { x: number; value: number; seriesIndex: number }[] = [];
  series.forEach((p, seriesIndex) => {
    if (p.value === undefined) {
      if (current.length > 0) {
        runs.push(current);
        current = [];
      }
      return;
    }
    current.push({ x: p.x, value: p.value, seriesIndex });
  });
  if (current.length > 0) {
    runs.push(current);
  }

  const totalKnown = runs.reduce((sum, r) => sum + r.length, 0);
  const segments = runs.map((run) =>
    downsampleRun(run, budgetFor(run.length, totalKnown)).map((p) => ({
      seriesIndex: p.seriesIndex,
      x: p.x,
      y: (p.value - minValue) / range,
    })),
  );

  return { minValue, maxValue, segments };
}

/**
 * The history line as an SVG path `d`, in a `width` × `height` box: one `M … L …` polyline per run,
 * so no line bridges a gap. `y` is flipped for SVG's y-down axis.
 */
export function linePath(
  segments: readonly (readonly { readonly x: number; readonly y: number }[])[],
  width: number,
  height: number,
): string {
  'worklet';
  return segments
    .map((segment) =>
      segment
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * width} ${height - p.y * height}`)
        .join(' '),
    )
    .join(' ');
}

// ─── Morphing (app-motion-pass design D12) ──────────────────────────────────────────────────────

/**
 * How a chart goes from one drawn shape to the next (motion, "A chart moves from its old shape to
 * its new one"): `morph` when the two can be matched point for point or sector for sector, and
 * `fade` — a fast cross-fade — when they cannot.
 */
export type LineMorph =
  | {
      readonly kind: 'morph';
      /** Each run's points' shared x, in order. */
      readonly xs: readonly (readonly number[])[];
      /** Each run's points' heights before and after, on the same positions. */
      readonly from: readonly (readonly number[])[];
      readonly to: readonly (readonly number[])[];
    }
  | { readonly kind: 'fade' };

/**
 * Whether the history line can travel from `prev` to `next`: only when both hold the same runs of
 * the same points — the same `seriesIndex` at the same x, so the same day — at every position. Each
 * point then moves from its old height to its new one at its place on the time axis. Another point
 * count, another split into runs, or equal counts that downsampling left on other days are a
 * `fade`: nothing is resampled, so a morph never draws a point that does not exist.
 */
export function lineMorph(
  prev: Pick<HistoryGeometry, 'segments'>,
  next: Pick<HistoryGeometry, 'segments'>,
): LineMorph {
  if (prev.segments.length === 0 || prev.segments.length !== next.segments.length) {
    return { kind: 'fade' };
  }
  const xs: number[][] = [];
  const from: number[][] = [];
  const to: number[][] = [];
  for (let r = 0; r < next.segments.length; r++) {
    const before = prev.segments[r]!;
    const after = next.segments[r]!;
    if (before.length !== after.length) return { kind: 'fade' };
    for (let i = 0; i < after.length; i++) {
      if (before[i]!.seriesIndex !== after[i]!.seriesIndex || before[i]!.x !== after[i]!.x) {
        return { kind: 'fade' };
      }
    }
    xs.push(after.map((p) => p.x));
    from.push(before.map((p) => p.y));
    to.push(after.map((p) => p.y));
  }
  return { kind: 'morph', xs, from, to };
}

/** The line part-way through a morph, `t` from 0 (the old shape) to 1 (the new one). */
export function lineAt(
  morph: Extract<LineMorph, { kind: 'morph' }>,
  t: number,
): { x: number; y: number }[][] {
  'worklet';
  return morph.xs.map((run, r) =>
    run.map((x, i) => {
      const a = morph.from[r]![i]!;
      const b = morph.to[r]![i]!;
      return { x, y: a + (b - a) * t };
    }),
  );
}

/** One donut sector on its way: the key it is drawn for, its angles before and after. */
export interface SectorMorph {
  readonly key: string;
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
}

export type DonutMorph =
  | { readonly kind: 'morph'; readonly sectors: readonly SectorMorph[] }
  | { readonly kind: 'fade' };

/**
 * How the категорії donut goes from `prev` to `next`, sector by sector, keyed by категорія: a shared
 * one grows or shrinks to its new share, an arriving one grows from nothing at the place it will
 * sit, and a leaving one shrinks to nothing where it was. A neutral ring on either side (empty,
 * or no honest shares), or shared категорії in another order — which would draw sectors over each
 * other mid-way — is a `fade`.
 */
export function donutMorph(prev: DonutGeometry, next: DonutGeometry): DonutMorph {
  if (prev.kind !== 'positive' || next.kind !== 'positive') return { kind: 'fade' };
  const inNext = new Set(next.sectors.map((s) => s.categoryId));
  const inPrev = new Set(prev.sectors.map((s) => s.categoryId));
  const sharedBefore = prev.sectors.filter((s) => inNext.has(s.categoryId)).map((s) => s.categoryId);
  const sharedAfter = next.sectors.filter((s) => inPrev.has(s.categoryId)).map((s) => s.categoryId);
  if (sharedBefore.some((key, n) => key !== sharedAfter[n])) return { kind: 'fade' };

  const sectors: SectorMorph[] = [];
  // Where each side has got to: an arriving sector starts at the old ring's cursor, a leaving one
  // ends at the new ring's.
  let before = 0;
  let after = 0;
  let i = 0;
  let j = 0;
  while (i < prev.sectors.length || j < next.sectors.length) {
    const old = prev.sectors[i];
    const now = next.sectors[j];
    if (old && !inNext.has(old.categoryId)) {
      sectors.push({ key: old.categoryId, from: [old.startAngle, old.endAngle], to: [after, after] });
      before = old.endAngle;
      i++;
    } else if (now && !inPrev.has(now.categoryId)) {
      sectors.push({ key: now.categoryId, from: [before, before], to: [now.startAngle, now.endAngle] });
      after = now.endAngle;
      j++;
    } else {
      // Both cursors stand on the same shared категорія: the order check above guarantees it.
      sectors.push({
        key: now!.categoryId,
        from: [old!.startAngle, old!.endAngle],
        to: [now!.startAngle, now!.endAngle],
      });
      before = old!.endAngle;
      after = now!.endAngle;
      i++;
      j++;
    }
  }
  return { kind: 'morph', sectors };
}

/** A sector's angles part-way through a morph, `t` from 0 to 1. */
export function sectorAt(sector: SectorMorph, t: number): [number, number] {
  'worklet';
  return [
    sector.from[0] + (sector.to[0] - sector.from[0]) * t,
    sector.from[1] + (sector.to[1] - sector.from[1]) * t,
  ];
}
