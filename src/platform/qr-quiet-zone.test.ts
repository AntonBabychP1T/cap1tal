import { describe, expect, it } from 'vitest';

import {
  cutRect,
  decodeImage,
  findQrSquares,
  marginFor,
  padWithMargin,
  type QuietZoneSteps,
  type RawImage,
  type SetTimer,
  type WorkingCopy,
} from './qr-quiet-zone';

/**
 * The locator and the orchestration only — the device adapter (`qr-image-device.ts`) is never
 * loaded here, and must never be: `verify` runs no native module and no React Native. Every image
 * is a synthetic RGBA grid built by hand, and every decode is proven against a steps double.
 */

const DARK: readonly [number, number, number] = [32, 32, 32];
const LIGHT: readonly [number, number, number] = [220, 220, 220];
const WHITE = [255, 255, 255, 255];

function blankImage(width: number, height: number, [r, g, b]: readonly [number, number, number]): RawImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function setPixel(image: RawImage, x: number, y: number, [r, g, b]: readonly [number, number, number]): void {
  const o = (y * image.width + x) * 4;
  image.data[o] = r;
  image.data[o + 1] = g;
  image.data[o + 2] = b;
  image.data[o + 3] = 255;
}

function pixelAt(image: RawImage, x: number, y: number): readonly number[] {
  const o = (y * image.width + x) * 4;
  return [image.data[o] as number, image.data[o + 1] as number, image.data[o + 2] as number, image.data[o + 3] as number];
}

/** A QR-like checkerboard: same-colour cells touch only diagonally, exactly what 8-connectivity is for. */
function paintCheckerboard(image: RawImage, x0: number, y0: number, size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      setPixel(image, x0 + x, y0 + y, (x + y) % 2 === 0 ? LIGHT : DARK);
    }
  }
}

function paintSolid(image: RawImage, x0: number, y0: number, width: number, height: number): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      setPixel(image, x0 + x, y0 + y, LIGHT);
    }
  }
}

/** A sparse light diagonal line across a `size`×`size` box — a component whose box is big but whose fill is not. */
function paintDiagonal(image: RawImage, x0: number, y0: number, size: number): void {
  for (let i = 0; i < size; i++) {
    setPixel(image, x0 + i, y0 + i, LIGHT);
  }
}

describe('findQrSquares', () => {
  it('Scenario: A чек screenshot from a dark-themed app is decoded (the QR-like checkerboard is one candidate, text-like bars are not)', () => {
    const image = blankImage(120, 90, DARK);
    paintCheckerboard(image, 20, 15, 40);
    paintSolid(image, 80, 70, 15, 2); // a light "text" bar: shorter side 2 < 21, filtered by size

    expect(findQrSquares(image)).toEqual([{ x: 20, y: 15, width: 40, height: 40 }]);
  });

  it("Scenario: A photo with no QR code says so (a plain dark page has no light region at all)", () => {
    const image = blankImage(120, 90, [0, 0, 0]);

    expect(findQrSquares(image)).toEqual([]);
  });

  it('an all-light page yields no candidate — a light page is not a QR square', () => {
    const image = blankImage(120, 90, LIGHT);

    expect(findQrSquares(image)).toEqual([]);
  });

  it('a solid light square (fill above the upper bound) and a sparse light diagonal (fill below the lower bound) are both rejected', () => {
    const image = blankImage(120, 90, DARK);
    paintSolid(image, 10, 10, 25, 25); // fill 1.0 — a QR is not solidly light
    paintDiagonal(image, 60, 10, 25); // fill ~0.04 — too sparse to be a QR's own mix of modules

    expect(findQrSquares(image)).toEqual([]);
  });

  it('returns at most three candidates, largest by area first', () => {
    const image = blankImage(300, 300, DARK);
    paintCheckerboard(image, 10, 10, 24);
    paintCheckerboard(image, 100, 10, 30);
    paintCheckerboard(image, 10, 100, 36);
    paintCheckerboard(image, 100, 100, 42);

    expect(findQrSquares(image)).toEqual([
      { x: 100, y: 100, width: 42, height: 42 },
      { x: 10, y: 100, width: 36, height: 36 },
      { x: 100, y: 10, width: 30, height: 30 },
    ]);
  });
});

describe('cutRect', () => {
  it('maps a candidate from a 360-px working copy to a 1080-px original, landing inside the true square by at most ceil(scale) px per side, never outside it', () => {
    const candidate = { x: 10, y: 10, width: 100, height: 100 };

    const rect = cutRect(candidate, 360, 1080, 810);

    const scale = 1080 / 360;
    const shrink = Math.ceil(scale);
    const trueLeft = candidate.x * scale;
    const trueTop = candidate.y * scale;
    const trueRight = (candidate.x + candidate.width) * scale;
    const trueBottom = (candidate.y + candidate.height) * scale;

    expect(rect.x).toBeGreaterThanOrEqual(trueLeft);
    expect(rect.x - trueLeft).toBeLessThanOrEqual(shrink);
    expect(rect.y).toBeGreaterThanOrEqual(trueTop);
    expect(rect.y - trueTop).toBeLessThanOrEqual(shrink);
    expect(rect.x + rect.width).toBeLessThanOrEqual(trueRight);
    expect(trueRight - (rect.x + rect.width)).toBeLessThanOrEqual(shrink);
    expect(rect.y + rect.height).toBeLessThanOrEqual(trueBottom);
    expect(trueBottom - (rect.y + rect.height)).toBeLessThanOrEqual(shrink);
  });

  it('clamps a box at the image edge to the image bounds', () => {
    const candidate = { x: 0, y: 0, width: 360, height: 270 };

    const rect = cutRect(candidate, 360, 1080, 810);

    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1080);
    expect(rect.y + rect.height).toBeLessThanOrEqual(810);
  });

  it('maps using the original dimensions it is given, never dimensions of its own choosing — the caller is what must pass the render\'s own portrait size, not the picker\'s landscape metadata', () => {
    const candidate = { x: 10, y: 10, width: 100, height: 100 };

    const portrait = cutRect(candidate, 360, 1080, 2340);
    const landscape = cutRect(candidate, 360, 2340, 1080);

    expect(portrait.y + portrait.height).toBeLessThanOrEqual(2340);
    expect(landscape.x + landscape.width).toBeLessThanOrEqual(2340);
    expect(portrait).not.toEqual(landscape);
  });
});

describe('marginFor', () => {
  it('is floor(shorter side / 8)', () => {
    expect(marginFor({ x: 0, y: 0, width: 96, height: 96 })).toBe(12);
    expect(marginFor({ x: 0, y: 0, width: 100, height: 80 })).toBe(10);
  });
});

describe('padWithMargin', () => {
  it('pads with an opaque white border and keeps the original centered, unchanged', () => {
    const image = blankImage(4, 4, DARK);

    const padded = padWithMargin(image, 2);

    expect(padded.width).toBe(8);
    expect(padded.height).toBe(8);
    expect(pixelAt(padded, 0, 0)).toEqual(WHITE);
    expect(pixelAt(padded, 7, 7)).toEqual(WHITE);
    expect(pixelAt(padded, 1, 4)).toEqual(WHITE); // still border, just short of the original
    expect(pixelAt(padded, 2, 2)).toEqual([...DARK, 255]);
    expect(pixelAt(padded, 5, 5)).toEqual([...DARK, 255]);
  });

  it('margin 0 returns the image unpadded', () => {
    const image = blankImage(4, 4, DARK);

    expect(padWithMargin(image, 0)).toEqual(image);
  });
});

/** A hand-driven timer queue: nothing fires until the test says so (mirrors `src/monobank/yielding.test.ts`). */
function fakeTimer() {
  let entry: { readonly fn: () => void } | undefined;
  const setTimer: SetTimer = (fn) => {
    entry = { fn };
    return () => {
      entry = undefined;
    };
  };
  return {
    setTimer,
    fire: () => {
      const current = entry;
      entry = undefined;
      current?.fn();
    },
    pending: () => entry !== undefined,
  };
}

/** Everything queued in the microtask and macrotask lanes, let through. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const WORKING: WorkingCopy = {
  uri: 'memory://working',
  width: 120,
  height: 90,
  originalWidth: 120,
  originalHeight: 90,
};

function stepsWith(overrides: Partial<QuietZoneSteps> = {}): QuietZoneSteps & { readonly removed: () => readonly string[] } {
  const removed: string[] = [];
  const base: QuietZoneSteps = {
    scan: async () => null,
    workingCopy: async () => {
      throw new Error('unexpected workingCopy call');
    },
    pixels: async () => {
      throw new Error('unexpected pixels call');
    },
    cutWithMargin: async () => {
      throw new Error('unexpected cutWithMargin call');
    },
    remove: async (uri) => {
      removed.push(uri);
    },
    setTimer: (fn, ms) => {
      const handle = setTimeout(fn, ms);
      return () => clearTimeout(handle);
    },
  };
  return { ...base, ...overrides, removed: () => [...removed] };
}

describe('decodeImage', () => {
  it('Scenario: A photo that decodes at once is decoded as before', async () => {
    const steps = stepsWith({ scan: async () => 'https://cabinet.tax.gov.ua/cashregs/check?id=1' });

    const outcome = await decodeImage('memory://picked', steps);

    expect(outcome).toEqual({ kind: 'decoded', text: 'https://cabinet.tax.gov.ua/cashregs/check?id=1' });
    expect(steps.removed()).toEqual([]);
  });

  it('Scenario: A чек screenshot from a dark-themed app is decoded (candidates are tried in order, largest first, and the third is never cut once the second decodes)', async () => {
    const image = blankImage(300, 300, DARK);
    paintCheckerboard(image, 10, 10, 40); // largest — tried first, does not decode
    paintCheckerboard(image, 100, 10, 36); // tried second — decodes
    paintCheckerboard(image, 200, 10, 32); // never reached

    let cutCalls = 0;
    const steps = stepsWith({
      scan: async (uri) => (uri === 'memory://cut/2' ? 'https://cabinet.tax.gov.ua/cashregs/check?id=2' : null),
      workingCopy: async () => ({ uri: 'memory://working', width: 300, height: 300, originalWidth: 300, originalHeight: 300 }),
      pixels: async () => image,
      cutWithMargin: async () => {
        cutCalls += 1;
        return `memory://cut/${cutCalls}`;
      },
    });

    const outcome = await decodeImage('memory://picked', steps);

    expect(outcome).toEqual({ kind: 'decoded', text: 'https://cabinet.tax.gov.ua/cashregs/check?id=2' });
    expect(cutCalls).toBe(2);
    expect(steps.removed()).toEqual(['memory://working', 'memory://cut/1', 'memory://cut/2']);
  });

  it("Scenario: A photo with no QR code says so (every candidate exhausted, or no candidate at all)", async () => {
    const image = blankImage(120, 90, DARK); // no square anywhere

    const steps = stepsWith({
      workingCopy: async () => WORKING,
      pixels: async () => image,
    });

    const outcome = await decodeImage('memory://picked', steps);

    expect(outcome).toEqual({ kind: 'no-qr' });
    expect(steps.removed()).toEqual(['memory://working']);
  });

  it('a workingCopy failure during the second look folds into no-qr, not a throw', async () => {
    const steps = stepsWith({
      workingCopy: async () => {
        throw new Error('manipulator unavailable');
      },
    });

    await expect(decodeImage('memory://picked', steps)).resolves.toEqual({ kind: 'no-qr' });
    expect(steps.removed()).toEqual([]);
  });

  it('a pixels failure during the second look folds into no-qr, not a throw', async () => {
    const steps = stepsWith({
      workingCopy: async () => WORKING,
      pixels: async () => {
        throw new Error('not a jpeg after all');
      },
    });

    await expect(decodeImage('memory://picked', steps)).resolves.toEqual({ kind: 'no-qr' });
    expect(steps.removed()).toEqual(['memory://working']);
  });

  it('a cutWithMargin failure during the second look folds into no-qr, not a throw — and every URI made before the failure is still removed', async () => {
    const image = blankImage(120, 90, DARK);
    paintCheckerboard(image, 20, 15, 40);
    const steps = stepsWith({
      workingCopy: async () => WORKING,
      pixels: async () => image,
      cutWithMargin: async () => {
        throw new Error('crop failed');
      },
    });

    await expect(decodeImage('memory://picked', steps)).resolves.toEqual({ kind: 'no-qr' });
    expect(steps.removed()).toEqual(['memory://working']);
  });

  it('Scenario: A file that cannot be read is a typed failure (the first scan throwing is rethrown, not folded into no-qr)', async () => {
    const steps = stepsWith({
      scan: async () => {
        throw new Error('файл не знайдено');
      },
    });

    await expect(decodeImage('memory://picked', steps)).rejects.toThrow('файл не знайдено');
    expect(steps.removed()).toEqual([]);
  });

  it('Scenario: Nothing of the chosen image remains after the choice (every URI the steps produced was passed to remove exactly once, even when remove itself throws)', async () => {
    const image = blankImage(120, 90, DARK);
    paintCheckerboard(image, 20, 15, 40);
    const removeCalls: string[] = [];
    const steps: QuietZoneSteps = {
      scan: async () => null,
      workingCopy: async () => WORKING,
      pixels: async () => image,
      cutWithMargin: async () => 'memory://cut/1',
      remove: async (uri) => {
        removeCalls.push(uri);
        throw new Error('cache file busy');
      },
      setTimer: (fn, ms) => {
        const handle = setTimeout(fn, ms);
        return () => clearTimeout(handle);
      },
    };

    const outcome = await decodeImage('memory://picked', steps);

    expect(outcome).toEqual({ kind: 'no-qr' });
    expect(removeCalls).toEqual(['memory://working', 'memory://cut/1']);
  });

  describe('the deadline (design D8)', () => {
    it("Scenario: Looking harder that never finishes still ends the choice (a workingCopy that never settles within the deadline still ends the choice as no-qr, and its URI is removed once it eventually arrives)", async () => {
      const timer = fakeTimer();
      let resolveWorkingCopy: ((value: WorkingCopy) => void) | undefined;
      const steps = stepsWith({
        workingCopy: () =>
          new Promise<WorkingCopy>((resolve) => {
            resolveWorkingCopy = resolve;
          }),
        setTimer: timer.setTimer,
      });

      const promise = decodeImage('memory://picked', steps);
      await flush();
      expect(timer.pending()).toBe(true);
      timer.fire();

      await expect(promise).resolves.toEqual({ kind: 'no-qr' });
      expect(steps.removed()).toEqual([]);

      resolveWorkingCopy?.({ ...WORKING, uri: 'memory://working-late' });
      await flush();

      expect(steps.removed()).toEqual(['memory://working-late']);
    });

    it('a cutWithMargin that never settles within the deadline still ends the choice as no-qr, and its URI is removed once it eventually arrives', async () => {
      const image = blankImage(120, 90, DARK);
      paintCheckerboard(image, 20, 15, 40);
      const timer = fakeTimer();
      let resolveCut: ((uri: string) => void) | undefined;
      const steps = stepsWith({
        workingCopy: async () => WORKING,
        pixels: async () => image,
        cutWithMargin: () =>
          new Promise<string>((resolve) => {
            resolveCut = resolve;
          }),
        setTimer: timer.setTimer,
      });

      const promise = decodeImage('memory://picked', steps);
      await flush();
      timer.fire();

      // The deadline only stops `decodeImage` from waiting; the stuck second look is still
      // suspended mid-flight, so nothing has reached its `finally` yet — not even the working
      // copy made before the stuck step.
      await expect(promise).resolves.toEqual({ kind: 'no-qr' });
      expect(steps.removed()).toEqual([]);

      resolveCut?.('memory://cut-late');
      await flush();

      expect(steps.removed()).toEqual(['memory://working', 'memory://cut-late']);
    });

    it('a second look that settles well within the deadline is unaffected by it', async () => {
      const timer = fakeTimer();
      const steps = stepsWith({
        workingCopy: async () => WORKING,
        pixels: async () => blankImage(120, 90, DARK),
        setTimer: timer.setTimer,
      });

      const outcome = await decodeImage('memory://picked', steps);

      expect(outcome).toEqual({ kind: 'no-qr' });
      expect(timer.pending()).toBe(false); // the deadline timer was cancelled, not fired
    });
  });
});
