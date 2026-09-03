import { describe, expect, it } from 'vitest';

import { inMemoryBugReportFiles } from '../platform/bug-report-files';
import { inMemoryScreenCapture, type CaptureOutcome } from '../platform/screen-capture';
import type { JournalEntry } from '../reporting/journal';
import {
  activate,
  captureFailedNotice,
  CAPTURE_UNAVAILABLE_NOTICE,
  didLineFor,
  discardCapture,
  EMPTY_SHEET,
  GESTURE,
  handOverFailed,
  HAND_OVER_UNAVAILABLE,
  HAPPENED_REFUSAL,
  isActivating,
  keepCapture,
  sheetCaptureOf,
  submitHere,
  sweepCaptures,
  type SheetCapture,
} from './bug-report-here';
import type { NewReport, ReportContext } from './bug-report-screen';

/**
 * Everything filing a репорт from the screen decides, proven without a device.
 *
 * The recognizer, `PixelCopy` and the sheet's pixels are the emulator's business (tasks 8.2–8.12).
 * What is here is what `verify` can actually settle: the gesture's parameters as values, the
 * *ordering* of the capture and the UI, what the sheet refuses, the line the app writes for the
 * owner, and — through the two doubles' `captured()` and `kept()` — what is and is not left on the
 * phone afterwards.
 */

const NOW = new Date(2026, 8, 3, 9, 30, 0, 0);
const at = (second: number) => new Date(2026, 8, 3, 9, 0, second, 0);

const journal: readonly JournalEntry[] = [
  { id: 'j1', at: at(1), kind: 'screen', name: '/(tabs)/month' },
  { id: 'j2', at: at(2), kind: 'screen', name: '/(tabs)/accounts' },
  { id: 'j3', at: at(3), kind: 'screen', name: '/account/abc123' },
];

const CONTEXT: Omit<ReportContext, 'origin'> = {
  build: { version: '0.0.0', commit: '3df8103', dirty: true, builtAt: '2026-09-03T09:00:00.000Z' },
  device: { platform: 'android', systemVersion: '16', model: 'Pixel 7' },
  migrationsApplied: 15,
  counts: { accounts: 2, transactions: 7, categories: 5, rules: 0, drafts: 1 },
  journal,
  prompting: null,
  now: NOW,
};

const CAPTURED: SheetCapture = sheetCaptureOf({
  kind: 'captured',
  uri: 'file:///cache/bug-report-capture/1.png',
  mime: 'image/png',
  width: 576,
  height: 1280,
});

function saveInto(store: NewReport[]) {
  return (report: NewReport) => {
    store.push(report);
  };
}

describe('the gesture is two fingers held still, and its numbers are values', () => {
  it('is what the recognizer is configured from', () => {
    // Asserted as values so the component cannot quietly drift from the design: one finger is
    // every button in the app, and 500 ms is RNGH's tap-and-hold rather than a deliberate act.
    expect(GESTURE).toEqual({ pointers: 2, minDurationMs: 1200, maxDistanceDp: 24 });
    expect(GESTURE.pointers).toBeGreaterThan(1);
    expect(GESTURE.minDurationMs).toBeGreaterThan(500);
  });
});

describe('what the owner was doing is written by the app', () => {
  it('Scenario: What the owner was doing is written by the app', () => {
    const line = didLineFor('/account/abc123');

    // It names the route and says the репорт was filed from the screen itself…
    expect(line).toContain('/account/abc123');
    expect(line).toContain('там, де сталася проблема');
    // …and not which door was used, because the handle calls the same path the gesture does.
    expect(line).not.toContain('жестом');
    expect(line).not.toContain('маркер');
  });

  it('Scenario: A репорт filed from the screen writes its own «Що я робив»', () => {
    const stored: NewReport[] = [];

    const outcome = submitHere({
      id: 'r1',
      fields: { happened: 'підсумок за місяць відʼємний', expected: '' },
      capture: CAPTURED,
      context: CONTEXT,
      save: saveInto(stored),
    });

    expect(outcome.kind).toBe('saved');
    // The route of the screen they were on — the last one the журнал holds.
    expect(stored[0]?.route).toBe('/account/abc123');
    expect(stored[0]?.did).toBe(didLineFor('/account/abc123'));
    expect(stored[0]?.origin).toBe('here');
  });
});

describe('the sheet asks one question and fills the rest in itself', () => {
  it('Scenario: One line is enough', () => {
    const stored: NewReport[] = [];

    submitHere({
      id: 'r1',
      fields: { happened: 'підсумок за місяць відʼємний', expected: '' },
      capture: CAPTURED,
      context: CONTEXT,
      save: saveInto(stored),
    });

    const report = stored[0];
    expect(report?.happened).toBe('підсумок за місяць відʼємний');
    // Everything else, without anything else being asked.
    expect(report?.createdAt).toEqual(NOW);
    expect(report?.build.commit).toBe('3df8103');
    expect(report?.device.model).toBe('Pixel 7');
    expect(report?.migrationsApplied).toBe(15);
    expect(report?.counts.transactions).toBe(7);
    expect(report?.journal).toHaveLength(3);
    // «Чого я очікував» was left empty and is stored as nothing, not as an empty string.
    expect(report?.expected).toBeNull();
  });

  it('Scenario: The empty question is refused', () => {
    const stored: NewReport[] = [];

    const outcome = submitHere({
      id: 'r1',
      fields: { ...EMPTY_SHEET, expected: 'мав бути додатний' },
      capture: CAPTURED,
      context: CONTEXT,
      save: saveInto(stored),
    });

    expect(outcome).toEqual({ kind: 'refused', message: HAPPENED_REFUSAL });
    // Nothing stored, and the refusal is Ukrainian.
    expect(stored).toEqual([]);
    expect(HAPPENED_REFUSAL).toContain('Напишіть, що не так');
  });

  it('refuses a «Що не так?» that is only whitespace', () => {
    const stored: NewReport[] = [];

    expect(
      submitHere({
        id: 'r1',
        fields: { happened: '   \n  ', expected: '' },
        capture: CAPTURED,
        context: CONTEXT,
        save: saveInto(stored),
      }).kind,
    ).toBe('refused');
    expect(stored).toEqual([]);
  });

  it('a write that throws is a refusal, not an exception over the screen', () => {
    const outcome = submitHere({
      id: 'r1',
      fields: { happened: 'щось не так', expected: '' },
      capture: CAPTURED,
      context: CONTEXT,
      save: () => {
        throw new Error('database is locked');
      },
    });

    expect(outcome.kind).toBe('refused');
    expect(outcome.kind === 'refused' && outcome.message).toContain('database is locked');
  });
});

describe('the screen is captured before the app draws anything of its own', () => {
  /** Every effect in the order it actually happened — the requirement, as an observation. */
  function recorder() {
    const order: string[] = [];
    const capture = inMemoryScreenCapture();
    return {
      order,
      capture,
      effects: {
        capture: {
          capture: async () => {
            order.push('capture');
            return capture.capture();
          },
          discard: capture.discard,
          discardAll: capture.discardAll,
        },
        hideHandle: () => order.push('hide'),
        showHandle: () => order.push('show'),
        settle: async () => {
          order.push('settle');
        },
        openSheet: () => order.push('sheet'),
      },
    };
  }

  it('Scenario: The скріншот is the screen, not the sheet', async () => {
    const { order, effects } = recorder();

    await activate(effects);

    // The handle is gone, the removal has reached the glass, and only then is the picture taken —
    // so nothing of the репорт's own is in its own скріншот.
    expect(order.indexOf('hide')).toBeLessThan(order.indexOf('settle'));
    expect(order.indexOf('settle')).toBeLessThan(order.indexOf('capture'));
  });

  it('Scenario: The sheet waits for the capture', async () => {
    const { order, effects } = recorder();

    await activate(effects);

    expect(order.indexOf('capture')).toBeLessThan(order.indexOf('sheet'));
    // The handle comes back once the picture is taken — it is hidden for the duration of the
    // capture and no longer (design D3); the sheet is an overlay above it either way.
    expect(order).toEqual(['hide', 'settle', 'capture', 'sheet', 'show']);
  });

  it('Scenario: A second activation while the first is still working starts nothing', async () => {
    const { effects, capture } = recorder();
    let opened = 0;
    const counting = { ...effects, openSheet: () => (opened += 1) };

    // Started and deliberately not awaited: the second call lands while the first is in flight.
    const first = activate(counting);
    const second = activate(counting);
    await Promise.all([first, second]);

    expect(capture.attempts()).toBe(1);
    expect(opened).toBe(1);
    // And the door is not wedged shut afterwards.
    expect(isActivating()).toBe(false);
  });

  it('the guard is released even when the capture throws', async () => {
    const { effects } = recorder();

    await expect(
      activate({
        ...effects,
        capture: {
          ...effects.capture,
          capture: () => Promise.reject(new Error('boom')),
        },
      }),
    ).rejects.toThrow('boom');

    expect(isActivating()).toBe(false);
  });
});

describe('a capture that fails still lets the репорт be filed', () => {
  it('Scenario: The owner is told before they save', () => {
    const failed = sheetCaptureOf({ kind: 'failed', reason: 'Вікно захищене від знімків' });
    const unavailable = sheetCaptureOf({ kind: 'unavailable' });

    // Ukrainian, and it says the репорт can still be filed — a failed capture is not a refusal.
    expect(failed.notice).toBe(captureFailedNotice('Вікно захищене від знімків'));
    expect(failed.notice).toContain('можна завести й без нього');
    expect(unavailable.notice).toBe(CAPTURE_UNAVAILABLE_NOTICE);
    expect(unavailable.notice).toContain('можна завести й без нього');
    expect(failed.uri).toBeNull();
  });

  it('Scenario: No capture, still a репорт', async () => {
    const stored: NewReport[] = [];
    const capture = sheetCaptureOf({ kind: 'failed', reason: 'Вікно захищене від знімків' });

    const outcome = submitHere({
      id: 'r1',
      fields: { happened: 'екран порожній', expected: '' },
      capture,
      context: CONTEXT,
      save: saveInto(stored),
    });

    expect(outcome.kind).toBe('saved');
    const report = stored[0];
    // Everything else is still attached…
    expect(report?.route).toBe('/account/abc123');
    expect(report?.build.commit).toBe('3df8103');
    expect(report?.journal).toHaveLength(3);
    // …and the репорт itself says, in Ukrainian, why there is no picture. Stored, not merely shown:
    // this is what the saved репорт renders after a restart.
    expect(report?.captureFailure).toBe('Вікно захищене від знімків');
  });

  it('a platform that cannot capture stores its own honest reason', () => {
    const stored: NewReport[] = [];

    submitHere({
      id: 'r1',
      fields: { happened: 'щось не так', expected: '' },
      capture: sheetCaptureOf({ kind: 'unavailable' }),
      context: CONTEXT,
      save: saveInto(stored),
    });

    expect(stored[0]?.captureFailure).toBe('Платформа не вміє робити знімок екрана');
  });

  it('a репорт whose capture worked stores no reason at all', () => {
    const stored: NewReport[] = [];

    submitHere({
      id: 'r1',
      fields: { happened: 'щось не так', expected: '' },
      capture: CAPTURED,
      context: CONTEXT,
      save: saveInto(stored),
    });

    expect(stored[0]?.captureFailure).toBeNull();
  });
});

describe('changing one`s mind leaves nothing behind', () => {
  /** One capture actually taken, so «what is left on the phone» is an observation. */
  async function captured(screen: ReturnType<typeof inMemoryScreenCapture>): Promise<SheetCapture> {
    return sheetCaptureOf(await screen.capture());
  }

  it('Scenario: Cancelling stores nothing and keeps nothing', async () => {
    const screen = inMemoryScreenCapture();
    const files = inMemoryBugReportFiles();
    const capture = await captured(screen);
    expect(screen.captured()).toHaveLength(1);

    await discardCapture(capture, screen);

    // No репорт, no kept скріншот, and no file left in the cache.
    expect(screen.captured()).toEqual([]);
    expect(files.kept('r1')).toEqual([]);
  });

  it('Scenario: The back gesture is the same as cancelling', async () => {
    const screen = inMemoryScreenCapture();
    const capture = await captured(screen);

    // The component answers the back gesture with the same call «Скасувати» makes — there is one
    // way out and not two.
    await discardCapture(capture, screen);

    expect(screen.captured()).toEqual([]);
  });

  it('Scenario: Ten cancelled reports leave ten nothings', async () => {
    const screen = inMemoryScreenCapture();

    for (let i = 0; i < 10; i += 1) {
      const capture = await captured(screen);
      await discardCapture(capture, screen);
    }

    expect(screen.attempts()).toBe(10);
    expect(screen.captured()).toEqual([]);
  });

  it('Scenario: A refused save keeps the скріншот for the next attempt', async () => {
    const screen = inMemoryScreenCapture();
    const files = inMemoryBugReportFiles();
    const stored: NewReport[] = [];
    const capture = await captured(screen);

    // Refused: the sheet stays open, and nothing is discarded — a refusal is not an exit.
    const refused = submitHere({
      id: 'r1',
      fields: EMPTY_SHEET,
      capture,
      context: CONTEXT,
      save: saveInto(stored),
    });
    expect(refused.kind).toBe('refused');
    expect(screen.captured()).toHaveLength(1);

    // The owner writes the line and saves. The picture the first attempt was refused with is the
    // picture the репорт carries.
    const saved = submitHere({
      id: 'r1',
      fields: { happened: 'підсумок відʼємний', expected: '' },
      capture,
      context: CONTEXT,
      save: saveInto(stored),
    });
    expect(saved.kind).toBe('saved');
    await keepCapture({
      reportId: 'r1',
      capture,
      files,
      screen,
      storage: { addScreenshot: () => undefined },
      now: () => NOW,
    });

    expect(files.kept('r1')).toHaveLength(1);
    expect(screen.captured()).toEqual([]);
  });

  it('Scenario: A capture that outlived the app is gone at the next launch', async () => {
    const screen = inMemoryScreenCapture();
    // Three captures whose sheets never closed — the process died between capture and save.
    await screen.capture();
    await screen.capture();
    await screen.capture();
    expect(screen.captured()).toHaveLength(3);

    await sweepCaptures(screen);

    expect(screen.captured()).toEqual([]);
  });
});

describe('a captured скріншот is kept exactly like a picked one', () => {
  it('Scenario: A captured скріншот is kept like a picked one', async () => {
    const screen = inMemoryScreenCapture();
    const files = inMemoryBugReportFiles();
    const added: string[] = [];
    const capture = sheetCaptureOf(await screen.capture());

    await keepCapture({
      reportId: 'r1',
      capture,
      files,
      screen,
      storage: { addScreenshot: (_id, name) => added.push(name) },
      now: () => NOW,
    });

    // It goes through the same `keep` a picked image takes, so it is indistinguishable afterwards.
    expect(files.kept('r1')).toHaveLength(1);
    expect(added).toEqual(files.kept('r1'));
    // And the cache copy is gone: kept beside the репорт is where it lives now.
    expect(screen.captured()).toEqual([]);
  });

  it('Scenario: A скріншот captured for a репорт that was never stored is removed', async () => {
    const screen = inMemoryScreenCapture();
    const files = inMemoryBugReportFiles();
    const capture = sheetCaptureOf(await screen.capture());

    await discardCapture(capture, screen);

    expect(screen.captured()).toEqual([]);
    expect(files.kept('r1')).toEqual([]);
  });

  it('a keep that fails still leaves no file in the cache', async () => {
    const screen = inMemoryScreenCapture();
    const files = inMemoryBugReportFiles({ keepFails: 'немає місця' });
    const added: string[] = [];
    const capture = sheetCaptureOf(await screen.capture());

    await keepCapture({
      reportId: 'r1',
      capture,
      files,
      screen,
      storage: { addScreenshot: (_id, name) => added.push(name) },
      now: () => NOW,
    });

    // The репорт keeps no picture — and the phone keeps no orphan either.
    expect(added).toEqual([]);
    expect(files.kept('r1')).toEqual([]);
    expect(screen.captured()).toEqual([]);
  });

  it('a репорт with no picture keeps nothing and discards nothing', async () => {
    const screen = inMemoryScreenCapture();
    const files = inMemoryBugReportFiles();

    await keepCapture({
      reportId: 'r1',
      capture: sheetCaptureOf({ kind: 'unavailable' }),
      files,
      screen,
      storage: { addScreenshot: () => undefined },
      now: () => NOW,
    });

    expect(files.kept('r1')).toEqual([]);
    expect(screen.captured()).toEqual([]);
  });
});

describe('a capture outcome the sheet can draw', () => {
  it('turns each outcome into what the sheet shows and what the репорт stores', () => {
    const outcomes: readonly CaptureOutcome[] = [
      { kind: 'captured', uri: 'file:///a.png', mime: 'image/png', width: 1, height: 2 },
      { kind: 'unavailable' },
      { kind: 'failed', reason: 'щось пішло не так' },
    ];

    const [ok, unavailable, failed] = outcomes.map(sheetCaptureOf);

    expect(ok).toEqual({ uri: 'file:///a.png', mime: 'image/png', notice: null, failure: null });
    // A picture, or a sentence — never both and never neither.
    expect(unavailable?.uri).toBeNull();
    expect(unavailable?.failure).not.toBeNull();
    expect(failed?.uri).toBeNull();
    expect(failed?.failure).toBe('щось пішло не так');
  });
});

/**
 * «Зберегти й передати» stores the репорт *first*, so a chooser that cannot open is not a lost
 * репорт — it is a stored репорт and a sentence saying what happened.
 */
describe('a hand-over that cannot happen still leaves the репорт stored', () => {
  it('Scenario: A hand-over that cannot happen still leaves the репорт stored — no chooser', async () => {
    const screen = inMemoryScreenCapture();
    const files = inMemoryBugReportFiles({ outcome: { kind: 'unavailable' } });
    const stored: NewReport[] = [];
    const capture = sheetCaptureOf(await screen.capture());

    const outcome = submitHere({
      id: 'r1',
      fields: { happened: 'підсумок відʼємний', expected: '' },
      capture,
      context: CONTEXT,
      save: saveInto(stored),
    });
    await keepCapture({
      reportId: 'r1',
      capture,
      files,
      screen,
      storage: { addScreenshot: () => undefined },
      now: () => NOW,
    });

    // Stored, with its скріншот, before the chooser was ever asked.
    expect(outcome.kind).toBe('saved');
    expect(stored).toHaveLength(1);
    expect(files.kept('r1')).toHaveLength(1);
    // Nothing left the phone…
    expect(files.handed()).toEqual([]);
    // …and the words the owner reads say so, in Ukrainian, and point them at where the репорт is.
    expect(HAND_OVER_UNAVAILABLE).toContain('Репорт збережено');
    expect(HAND_OVER_UNAVAILABLE).toContain('Налаштуваннях');
  });

  it('Scenario: A hand-over that cannot happen still leaves the репорт stored — a failed file', () => {
    const words = handOverFailed('немає місця на пристрої');

    // It says the репорт survived first, and only then what went wrong.
    expect(words).toContain('Репорт збережено');
    expect(words).toContain('немає місця на пристрої');
  });

  it('the two sentences are different, so the owner can tell the two cases apart', () => {
    expect(HAND_OVER_UNAVAILABLE).not.toBe(handOverFailed('щось'));
  });
});
