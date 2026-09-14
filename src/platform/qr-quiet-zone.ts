/**
 * The second look at a chosen photo or file: locating the QR's own light square when the whole
 * image did not decode, cutting it free of a background as dark as its own modules, giving it a
 * proper light margin, and decoding again (proposal.md → Why, design D1–D8,
 * `openspec/changes/qr-image-quiet-zone/`).
 *
 * Pure TypeScript, tested under `verify` with synthetic pixel grids and a steps double — the
 * device adapter (`qr-image-device.ts`) is what actually calls `ImageManipulator`, `File` and
 * `jpeg-js`, and is not imported from here. This file imports nothing, for the same reason as
 * every port in `src/platform/`: nothing under `npm run verify` may load a native module.
 */

/** One decoded image, as RGBA bytes — what `jpeg-js`'s `decode` and `encode` both move. */
export interface RawImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** A candidate light square, in the pixel coordinates of whatever image it was found in. */
export interface SquareCandidate {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A rectangle in an image's own pixels — `cutRect`'s answer, mapped onto the original. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Finds where a QR code's own light square sits in a decoded image (design D3).
 *
 * Luminance separates light from dark by Otsu's threshold — a fixed brightness cannot, because a
 * чек screenshot's background is as dark as the code's own modules (proposal.md → Why). Light
 * pixels are grouped 8-connected, so a QR's checkered modules — which touch same-colour neighbours
 * only diagonally, at their corners — join into one region instead of the many slivers
 * 4-connectivity would leave. A region only qualifies when it is big enough to be a QR at one pixel
 * per module, roughly square, roughly half light (a QR's own mix of modules, not a solid light
 * patch or a sparse line), and not almost the whole image (a light page is not a QR's square). At
 * most the three largest qualify, largest first.
 */
export function findQrSquares(image: RawImage): readonly SquareCandidate[] {
  const { width, height, data } = image;
  const totalPixels = width * height;

  const luminance = new Uint8Array(totalPixels);
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < totalPixels; i++) {
    const o = i * 4;
    // Integer Rec. 601 weights (design D3).
    const l = Math.floor((299 * (data[o] as number) + 587 * (data[o + 1] as number) + 114 * (data[o + 2] as number)) / 1000);
    luminance[i] = l;
    histogram[l] = (histogram[l] as number) + 1;
  }

  const threshold = otsuThreshold(histogram, totalPixels);
  const light = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    light[i] = (luminance[i] as number) > threshold ? 1 : 0;
  }

  const components = lightComponents(light, width, height);
  const imageArea = width * height;

  const candidates: SquareCandidate[] = [];
  for (const box of components) {
    const boxWidth = box.maxX - box.minX + 1;
    const boxHeight = box.maxY - box.minY + 1;
    const shorterSide = Math.min(boxWidth, boxHeight);
    if (shorterSide < 21) {
      continue;
    }
    const ratio = boxWidth / boxHeight;
    if (ratio < 0.8 || ratio > 1.25) {
      continue;
    }
    const boxArea = boxWidth * boxHeight;
    const fill = box.count / boxArea;
    if (fill < 0.35 || fill > 0.85) {
      continue;
    }
    if (boxArea > 0.9 * imageArea) {
      continue;
    }
    candidates.push({ x: box.minX, y: box.minY, width: boxWidth, height: boxHeight });
  }

  candidates.sort((a, b) => b.width * b.height - a.width * a.height);
  return candidates.slice(0, 3);
}

/** Otsu's threshold over a 256-bin luminance histogram: the split that best separates two groups. */
function otsuThreshold(histogram: readonly number[], totalPixels: number): number {
  let sumAll = 0;
  for (let level = 0; level < 256; level++) {
    sumAll += level * (histogram[level] as number);
  }

  let weightBackground = 0;
  let sumBackground = 0;
  let best = 0;
  let bestVariance = -1;

  for (let level = 0; level < 256; level++) {
    weightBackground += histogram[level] as number;
    if (weightBackground === 0) {
      continue;
    }
    const weightForeground = totalPixels - weightBackground;
    if (weightForeground === 0) {
      break;
    }
    sumBackground += level * (histogram[level] as number);
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;
    const diff = meanBackground - meanForeground;
    const variance = weightBackground * weightForeground * diff * diff;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = level;
    }
  }

  return best;
}

interface ComponentBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly count: number;
}

/**
 * 8-connected components of `light` pixels, with an explicit `Int32Array` stack rather than
 * recursion — Hermes' own call stack is small, and a component can cover most of a photo's pixels.
 */
function lightComponents(light: Uint8Array, width: number, height: number): readonly ComponentBox[] {
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const stack = new Int32Array(totalPixels);
  const components: ComponentBox[] = [];

  for (let start = 0; start < totalPixels; start++) {
    if (light[start] === 0 || visited[start] === 1) {
      continue;
    }

    let top = 0;
    stack[top] = start;
    top += 1;
    visited[start] = 1;

    const startX = start % width;
    const startY = (start - startX) / width;
    let minX = startX;
    let maxX = startX;
    let minY = startY;
    let maxY = startY;
    let count = 0;

    while (top > 0) {
      top -= 1;
      const index = stack[top] as number;
      const x = index % width;
      const y = (index - x) / width;
      count += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) {
          continue;
        }
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nx = x + dx;
          if (nx < 0 || nx >= width) {
            continue;
          }
          const neighbour = ny * width + nx;
          if (light[neighbour] === 1 && visited[neighbour] === 0) {
            visited[neighbour] = 1;
            stack[top] = neighbour;
            top += 1;
          }
        }
      }
    }

    components.push({ minX, minY, maxX, maxY, count });
  }

  return components;
}

/**
 * Maps a candidate found in a downscaled working copy onto the original image's own pixels, and
 * shrinks the result inward by `ceil(scale)` on every side — so rounding can only cut into the
 * QR's own light margin, never pull the dark surround back in (design D3). The light margin that
 * matters is added fresh afterwards (`padWithMargin`), so losing a sliver of the real one here
 * costs nothing. `originalWidth`/`originalHeight` are whatever the caller passed in — this function
 * consults no metadata of its own, which is what keeps an EXIF-rotated source correct: the caller
 * is the one that must pass the manipulator's own render dimensions, never the picker's.
 */
export function cutRect(
  candidate: SquareCandidate,
  workingWidth: number,
  originalWidth: number,
  originalHeight: number,
): Rect {
  const scale = originalWidth / workingWidth;
  const shrink = Math.ceil(scale);

  const left = clamp(Math.round(candidate.x * scale + shrink), 0, originalWidth);
  const top = clamp(Math.round(candidate.y * scale + shrink), 0, originalHeight);
  const right = clamp(Math.round((candidate.x + candidate.width) * scale - shrink), 0, originalWidth);
  const bottom = clamp(Math.round((candidate.y + candidate.height) * scale - shrink), 0, originalHeight);

  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** The light margin `cutRect`'s rectangle gets before it is decoded again (design D4). */
export function marginFor(rect: Rect): number {
  return Math.floor(Math.min(rect.width, rect.height) / 8);
}

/**
 * Pads an image with an opaque white border, `margin` px on every side — the light margin the
 * standard asks for, built in pure TypeScript because `expo-image-manipulator`'s `.extent()` turns
 * out not to exist on Android: the installed package's native module registers only `resize`,
 * `rotate`, `flip` and `crop`, and the `.d.ts` marks `extent` `@platform web` (design D4). `margin
 * <= 0` returns the image unchanged: nothing to add.
 */
export function padWithMargin(image: RawImage, margin: number): RawImage {
  if (margin <= 0) {
    return image;
  }

  const width = image.width + margin * 2;
  const height = image.height + margin * 2;
  const data = new Uint8Array(width * height * 4).fill(255);

  for (let y = 0; y < image.height; y++) {
    const sourceStart = y * image.width * 4;
    const destStart = ((y + margin) * width + margin) * 4;
    data.set(image.data.subarray(sourceStart, sourceStart + image.width * 4), destStart);
  }

  return { width, height, data };
}

/** What the manipulator's own render of a picked image came back as — never the picker's metadata. */
export interface WorkingCopy {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly originalWidth: number;
  readonly originalHeight: number;
}

/** A timer as a port: schedule `fn` after `ms`, and answer with how to cancel it (design D8). */
export type SetTimer = (fn: () => void, ms: number) => () => void;

/**
 * Everything `decodeImage` asks of the world — thin wrappers the device adapter provides over
 * `scanFromURLAsync`, `ImageManipulator`, `File` and `jpeg-js`; an in-test double is everything
 * `qr-quiet-zone.test.ts` needs to prove the order below without a native module (design D7).
 */
export interface QuietZoneSteps {
  /** The whole-image decode — the first look, and what each candidate's cut-out is scanned with. */
  readonly scan: (uri: string) => Promise<string | null>;
  /** A downscaled render of the picked image, at `width` px wide (or narrower, never upscaled). */
  readonly workingCopy: (uri: string, width: number) => Promise<WorkingCopy>;
  /** Decodes an image file to RGBA pixels. */
  readonly pixels: (uri: string) => Promise<RawImage>;
  /**
   * Cuts `rect` out of the *original* (`uri`, not the working copy) and gives it a `margin`-px
   * light border, per D4. What that takes inside — crop, decode, `padWithMargin`, encode, write —
   * is the adapter's business; `decodeImage` only ever sees the resulting URI.
   */
  readonly cutWithMargin: (uri: string, rect: Rect, margin: number) => Promise<string>;
  /** Removes one file the steps above produced. Best-effort at the call site — see design D6. */
  readonly remove: (uri: string) => Promise<void>;
  readonly setTimer: SetTimer;
}

/** What choosing a photo or file's *decode* came to — folded into `QrImagePickOutcome` by the adapter. */
export type DecodeOutcome = { readonly kind: 'decoded'; readonly text: string } | { readonly kind: 'no-qr' };

const WORKING_WIDTH = 360;
const DEADLINE_MS = 8_000;

/**
 * Decodes a picked image: the whole image first (unchanged, no deadline — D14's own call), and
 * only on a miss, a second look for a QR whose light margin sits against a background as dark as
 * its own modules (design D1). The second look races an 8-second deadline (design D8): if it has
 * not settled by then the choice ends as `no-qr`, but the look itself keeps running in the
 * background so that whatever files it eventually makes are still passed to `remove` when they
 * arrive (design D6) — nothing here can cancel an in-flight step, only stop waiting on it.
 *
 * A thrown first look is rethrown, for the adapter to fold into `failed` — a file that could not be
 * read will not read better cut up. Every other failure here becomes `no-qr`.
 */
export async function decodeImage(uri: string, steps: QuietZoneSteps): Promise<DecodeOutcome> {
  const first = await steps.scan(uri);
  if (first !== null) {
    return { kind: 'decoded', text: first };
  }

  return withDeadline(secondLook(uri, steps), steps.setTimer, DEADLINE_MS);
}

async function secondLook(uri: string, steps: QuietZoneSteps): Promise<DecodeOutcome> {
  const made: string[] = [];
  try {
    const working = await steps.workingCopy(uri, WORKING_WIDTH);
    made.push(working.uri);

    const image = await steps.pixels(working.uri);
    const candidates = findQrSquares(image);

    for (const candidate of candidates) {
      const rect = cutRect(candidate, working.width, working.originalWidth, working.originalHeight);
      const margin = marginFor(rect);
      const cutUri = await steps.cutWithMargin(uri, rect, margin);
      made.push(cutUri);

      const text = await steps.scan(cutUri);
      if (text !== null) {
        return { kind: 'decoded', text };
      }
    }

    return { kind: 'no-qr' };
  } catch {
    // A manipulator failure, a decoder exception on an odd format: the second look could not run,
    // never that a QR is confirmed absent — but the outcome the owner sees is the same (design D1).
    return { kind: 'no-qr' };
  } finally {
    for (const madeUri of made) {
      try {
        await steps.remove(madeUri);
      } catch {
        // A cache file that would not go is a few kilobytes the OS reclaims on its own (design
        // D6) — not something that should turn a decode that already has its answer into a failure.
      }
    }
  }
}

/** Races `run` against `deadlineMs`; `run` itself keeps executing (and cleaning up) past a timeout. */
function withDeadline(run: Promise<DecodeOutcome>, setTimer: SetTimer, deadlineMs: number): Promise<DecodeOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const cancelTimer = setTimer(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ kind: 'no-qr' });
    }, deadlineMs);

    run.then((value) => {
      if (settled) {
        return;
      }
      settled = true;
      cancelTimer();
      resolve(value);
    });
  });
}
