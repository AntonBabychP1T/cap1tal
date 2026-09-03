import { describe, expect, it } from 'vitest';

import { inMemoryScreenCapture, type ScreenCapturePort } from './screen-capture';

/**
 * The port only — the device adapter and the Kotlin module are never loaded here, and must never
 * be: `verify` runs no native module and no React Native. What `PixelCopy` actually returns, and
 * that the picture is the screen from before the sheet, is proven on the emulator (tasks 8.2,
 * 8.12).
 *
 * What is proven here is the contract the sheet is written against: a capture is a file the double
 * can be asked about, discarding is exact, the launch sweep is total, and a failure is a value and
 * never a throw. `captured()` is the whole reason this double exists — «leaves nothing behind» is
 * a claim about what is *not* on the phone, and only something that can be asked what is can
 * settle it.
 */

describe('a capture is a file the port can be asked about', () => {
  it('reports a captured file, with its size for the thumbnail', async () => {
    const port = inMemoryScreenCapture();

    const outcome = await port.capture();

    expect(outcome.kind).toBe('captured');
    if (outcome.kind !== 'captured') {
      throw new Error('unreachable');
    }
    expect(outcome.mime).toBe('image/png');
    expect(outcome.width).toBeGreaterThan(0);
    expect(outcome.height).toBeGreaterThan(0);
    expect(port.captured()).toEqual([outcome.uri]);
  });

  it('gives every capture a file of its own', async () => {
    const port = inMemoryScreenCapture();

    const first = await port.capture();
    const second = await port.capture();

    // Ten cancelled репорти must leave ten nothings, not one — so two captures are two files.
    expect(first).not.toEqual(second);
    expect(port.captured()).toHaveLength(2);
    expect(port.attempts()).toBe(2);
  });
});

describe('what is thrown away, and when', () => {
  it('discard removes exactly one', async () => {
    const port = inMemoryScreenCapture();
    const first = await port.capture();
    const second = await port.capture();
    if (first.kind !== 'captured' || second.kind !== 'captured') {
      throw new Error('unreachable');
    }

    await port.discard(first.uri);

    expect(port.captured()).toEqual([second.uri]);
  });

  it('discarding a file that is already gone is not a failure', async () => {
    const port = inMemoryScreenCapture();
    const only = await port.capture();
    if (only.kind !== 'captured') {
      throw new Error('unreachable');
    }

    await port.discard(only.uri);
    // A save racing the launch sweep asks twice. Neither call may throw.
    await expect(port.discard(only.uri)).resolves.toBeUndefined();
    await expect(port.discard('memory://capture/never-existed.png')).resolves.toBeUndefined();

    expect(port.captured()).toEqual([]);
  });

  it('discardAll empties it — the sweep a launch after a crash makes', async () => {
    const port = inMemoryScreenCapture();
    await port.capture();
    await port.capture();
    await port.capture();

    await port.discardAll();

    expect(port.captured()).toEqual([]);
  });
});

describe('a capture that does not happen is a value', () => {
  it('a platform that cannot capture answers unavailable, and never throws', async () => {
    const port: ScreenCapturePort = inMemoryScreenCapture({ outcome: { kind: 'unavailable' } });

    const outcome = await port.capture();

    expect(outcome).toEqual({ kind: 'unavailable' });
  });

  it('a capture that failed says why, and never throws', async () => {
    const port = inMemoryScreenCapture({
      outcome: { kind: 'failed', reason: 'Вікно захищене від знімків' },
    });

    const outcome = await port.capture();

    // The reason travels: the sheet says it, and the репорт stores it, because a saved репорт is
    // read again after a restart.
    expect(outcome).toEqual({ kind: 'failed', reason: 'Вікно захищене від знімків' });
    // Nothing was written, so there is nothing to clean up.
    expect(port.captured()).toEqual([]);
    expect(port.attempts()).toBe(1);
  });
});
