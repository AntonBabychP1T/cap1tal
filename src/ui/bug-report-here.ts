import type { ScreenCapturePort, CaptureOutcome } from '../platform/screen-capture';
import type { BugReportFilesPort } from '../platform/bug-report-files';
import { routeOf, type NewReport, type ReportContext } from './bug-report-screen';

/**
 * Everything filing a репорт from the screen the owner is on decides, as values: what the gesture
 * is, the order the capture and the sheet happen in, what the sheet asks and what it fills in by
 * itself, what it refuses, and what must be left behind when the owner changes their mind (which
 * is nothing).
 *
 * The component (`src/components/bug-report-here.tsx`) maps over this and decides nothing — which
 * is what lets `npm run verify` prove «the скріншот is the screen and not the sheet», «a cancelled
 * репорт leaves nothing» and every word any of it says without a device, a recognizer or a camera.
 *
 * **Storage, rendering and the hand-over are `bug-report-screen.ts`'s, unchanged.** This file is a
 * second front door onto the same репорт: `submitHere` builds the same `NewReport` the section's
 * form builds, and everything after it is the existing capability. There is one store, one журнал
 * and one report type — if this file had introduced a second, it would have failed.
 */

/**
 * The gesture, as numbers the recognizer is configured from and the tests assert against.
 *
 * Two pointers because every interaction the app already has is one finger, so no tap, scroll or
 * long-press can reach it. 1200 ms because RNGH's own default of 500 is a tap-and-hold rather than
 * a deliberate act. 24 dp because a two-finger *drag* — an accidental pinch, a two-thumb scroll —
 * must cancel the recognizer instead of firing it (design D1).
 */
export const GESTURE = {
  pointers: 2,
  minDurationMs: 1200,
  maxDistanceDp: 24,
} as const;

/** Every word the sheet says. The component invents none of them. */
export const SHEET_TITLE = 'Що не так на цьому екрані?';
export const HAPPENED_LABEL = 'Що не так?';
export const HAPPENED_HINT = 'Обовʼязково. Наприклад: «підсумок за місяць відʼємний»';
export const EXPECTED_LABEL = 'Чого я очікував?';
export const EXPECTED_HINT = 'Не обовʼязково. Що мало бути замість цього';
export const SAVE_LABEL = 'Зберегти';
export const SAVE_AND_HAND_OVER_LABEL = 'Зберегти й передати';
export const CANCEL_LABEL = 'Скасувати';

/**
 * The refusal for an empty «Що не так?».
 *
 * This is the one line the sheet requires, and it has moved: the section's form requires «Що я
 * робив», which here the app writes itself from the route (design D6). So the refusal moved with
 * it — there is no path on which the owner is asked to describe what they were doing.
 */
export const HAPPENED_REFUSAL = 'Напишіть, що не так — без цього репорт нічого не пояснює.';

/** The label of the handle, for a screen reader that cannot see a «⚑». */
export const HANDLE_LABEL = 'Повідомити про помилку на цьому екрані';

/** What the sheet says when the app could not photograph the screen, and why. */
export function captureFailedNotice(reason: string): string {
  return `Скріншот екрана зробити не вдалося: ${reason}. Репорт можна завести й без нього.`;
}

/** And when the platform has no way to photograph anything at all — iOS today. */
export const CAPTURE_UNAVAILABLE_NOTICE =
  'На цій платформі скріншот екрана зробити не вийде. Репорт можна завести й без нього.';

/** What a репорт with no picture stores as the reason — the sheet's sentence without its advice. */
export function captureFailureFor(outcome: CaptureOutcome): string | null {
  switch (outcome.kind) {
    case 'captured':
      return null;
    case 'unavailable':
      return 'Платформа не вміє робити знімок екрана';
    case 'failed':
      return outcome.reason;
  }
}

/** What the sheet says about a hand-over that could not happen — the репорт is stored regardless. */
export const HAND_OVER_UNAVAILABLE =
  'Репорт збережено. Передати файл на цій платформі не вийде — відкрийте репорт у Налаштуваннях і скопіюйте текст.';
export function handOverFailed(reason: string): string {
  return `Репорт збережено, але файл підготувати не вдалося: ${reason}`;
}

/**
 * The «Що я робив» line the app writes for the owner.
 *
 * It names the route and says the репорт was filed from the screen itself — and deliberately not
 * which of the two doors was used, because the handle calls the same path the gesture does, so
 * «жестом» would be false half the time. Which door it was is `origin`, recorded once and never
 * guessed (design D6).
 */
export function didLineFor(route: string): string {
  return `Заведено з екрана ${route} — там, де сталася проблема.`;
}

/** What the sheet holds while it is open. */
export interface SheetFields {
  readonly happened: string;
  readonly expected: string;
}

export const EMPTY_SHEET: SheetFields = { happened: '', expected: '' };

/**
 * The capture the sheet is showing, as the sheet knows it: a picture, or a sentence saying why
 * there is none.
 */
export interface SheetCapture {
  /** Something an `<Image>` can load, or `null` when there is no picture. */
  readonly uri: string | null;
  readonly mime: string | null;
  /** What the sheet tells the owner, or `null` when the capture worked. */
  readonly notice: string | null;
  /** What the репорт stores as the reason, or `null` when the capture worked. */
  readonly failure: string | null;
}

/** The capture outcome as the sheet and the репорт each need it. */
export function sheetCaptureOf(outcome: CaptureOutcome): SheetCapture {
  if (outcome.kind === 'captured') {
    return { uri: outcome.uri, mime: outcome.mime, notice: null, failure: null };
  }
  const failure = captureFailureFor(outcome);
  return {
    uri: null,
    mime: null,
    notice:
      outcome.kind === 'unavailable'
        ? CAPTURE_UNAVAILABLE_NOTICE
        : captureFailedNotice(outcome.reason),
    failure,
  };
}

/**
 * Whether a capture is in flight — the guard that makes a second activation a no-op.
 *
 * Module state rather than a parameter, because the two things that activate (the recognizer and
 * the handle) are two call sites of one app-wide act, and a flag threaded through both would be a
 * flag either could forget. It is cleared in a `finally`, so a capture that throws cannot wedge the
 * door shut.
 */
let capturing = false;

/** For tests only: the guard, so a leaked activation is visible rather than mysterious. */
export function isActivating(): boolean {
  return capturing;
}

/**
 * Starting a репорт from the screen the owner is on — the order, as a sequence over injected
 * effects.
 *
 * The order *is* the requirement (design D3), so it is the code's shape: hide the handle, let the
 * hiding actually reach the screen, photograph the screen, and only then draw the sheet. Nothing of
 * the app's own is drawn before the capture — no spinner, no dimming, no pressed state — because
 * every one of those would be in the picture, and the whole point is that the скріншот is the
 * screen the owner was complaining about.
 *
 * `settle` is what makes «the handle is not in its own screenshot» true rather than hoped: on a
 * device it awaits two frames, so the removal is composited before `PixelCopy` reads the surface.
 * In a test it is a resolved promise, and the ordering is still asserted.
 */
export async function activate(effects: {
  readonly capture: ScreenCapturePort;
  /** Removes the handle from the screen. A no-op when the handle is off, and called regardless. */
  readonly hideHandle: () => void;
  /** Puts the handle back, whatever happened. */
  readonly showHandle: () => void;
  /** Waits until what was just hidden is actually on the glass. */
  readonly settle: () => Promise<void>;
  readonly openSheet: (capture: SheetCapture) => void;
}): Promise<void> {
  // Claimed before the first await, or two activations in one tick would both get past it.
  if (capturing) {
    return;
  }
  capturing = true;
  try {
    effects.hideHandle();
    await effects.settle();
    const outcome = await effects.capture.capture();
    // The sheet is opened after the capture settles in *both* branches — a failure is still a
    // репорт, and it must not be drawn over the screen it failed to photograph either.
    effects.openSheet(sheetCaptureOf(outcome));
  } finally {
    effects.showHandle();
    capturing = false;
  }
}

export type HereOutcome =
  | { readonly kind: 'saved'; readonly report: NewReport }
  | { readonly kind: 'refused'; readonly message: string };

/**
 * Saves what the owner wrote in the sheet, or says why it was not saved.
 *
 * The three lines the репорт stores are unchanged; what moved is who writes them. `did` is the
 * app's, from the route; `happened` is the owner's and is required; `expected` is theirs and is
 * not. So storage, rendering and the section all stay exactly as they were — one `attachContext`,
 * two front doors (design D6).
 *
 * `save` is a thunk rather than a repository for `submitForm`'s reason: a write that throws is a
 * value here and not an exception over the screen the owner was already complaining about.
 */
export function submitHere(options: {
  readonly id: string;
  readonly fields: SheetFields;
  readonly capture: SheetCapture;
  readonly context: Omit<ReportContext, 'origin'>;
  readonly save: (report: NewReport) => void;
}): HereOutcome {
  if (options.fields.happened.trim().length === 0) {
    return { kind: 'refused', message: HAPPENED_REFUSAL };
  }

  const route = routeOf(options.context.journal, options.context.prompting);
  const expected = options.fields.expected.trim();
  const report: NewReport = {
    id: options.id,
    createdAt: options.context.now,
    did: didLineFor(route),
    happened: options.fields.happened.trim(),
    expected: expected.length > 0 ? expected : null,
    route,
    build: options.context.build,
    device: options.context.device,
    migrationsApplied: options.context.migrationsApplied,
    counts: options.context.counts,
    journal: options.context.journal,
    prompting: options.context.prompting,
    origin: 'here',
    captureFailure: options.capture.failure,
  };

  try {
    options.save(report);
  } catch (error) {
    return {
      kind: 'refused',
      message: `Не вдалося зберегти репорт: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return { kind: 'saved', report };
}

/**
 * The captured file's one journey onto the phone: out of the cache and in beside the репорт.
 *
 * The same `keep` a picked screenshot takes, so a captured скріншот is indistinguishable from a
 * picked one afterwards — which is what the spec asks for and what stops the saved репорт's screen
 * from needing two kinds of thumbnail. The cache copy goes either way: kept or not, nothing this
 * change captures outlives the sheet it was captured for (design D5).
 */
export async function keepCapture(options: {
  readonly reportId: string;
  readonly capture: SheetCapture;
  readonly files: BugReportFilesPort;
  readonly screen: ScreenCapturePort;
  readonly storage: { addScreenshot(reportId: string, name: string, addedAt: Date): void };
  readonly now: () => Date;
}): Promise<void> {
  const { uri, mime } = options.capture;
  if (uri === null || mime === null) {
    return;
  }
  const kept = await options.files.keep(options.reportId, { uri, mime });
  if (kept.kind === 'kept') {
    options.storage.addScreenshot(options.reportId, kept.name, options.now());
  }
  // The cache copy goes whether or not the keep worked: a репорт without its picture is still a
  // репорт, and a file nothing points at is exactly the litter this change promised not to leave.
  await options.screen.discard(uri);
}

/**
 * The captured file when no репорт was stored — «Скасувати», the back gesture, or a save that
 * threw.
 *
 * Deliberately **not** called on a refused save: a refusal leaves the sheet open with what the
 * owner typed and the picture still beside it, so discarding here would take the скріншот out from
 * under their next, successful attempt. The file is discarded exactly once, when the sheet closes
 * without a stored репорт.
 */
export async function discardCapture(
  capture: SheetCapture,
  screen: ScreenCapturePort,
): Promise<void> {
  if (capture.uri !== null) {
    await screen.discard(capture.uri);
  }
}

/**
 * The sweep at launch: everything a capture ever wrote, gone.
 *
 * This is the one that makes «leaves nothing behind» true rather than merely intended. Every exit
 * path in the app already discards its own file, but a process that died between the capture and
 * the save took its exit path with it — and that is precisely when litter would otherwise
 * accumulate (design D5).
 */
export async function sweepCaptures(screen: ScreenCapturePort): Promise<void> {
  await screen.discardAll();
}
