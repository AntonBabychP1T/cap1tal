/**
 * Pure chart geometry for the dashboard: the category donut and the Статок history line. No
 * React, no `react-native-svg` — a renderer (task 4.5/4.6) turns this into `Path`s. Angles are
 * degrees, 0 at 12 o'clock, clockwise; normalized coordinates are 0..1, the caller's own job to
 * place in a viewBox.
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
