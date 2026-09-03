import { moment, type JournalEntry } from '../reporting/journal';
import {
  renderReport,
  renderReportFile,
  reportFileName,
  type BugReport,
  type BuildInfo,
  type DeviceInfo,
  type ReportCounts,
  type ReportImage,
  type ReportOrigin,
} from '../reporting/report';
import type { AnalysisShareOutcome } from '../platform/analysis-share';
import type { BugReportFilesPort } from '../platform/bug-report-files';
import { reportFailure } from './journal';

/**
 * Everything the репорт про помилку's screens decide, as values: what the form refuses, what the
 * app attaches when a репорт is created, which screen the репорт names, what the list shows, what
 * a hand-over comes to, and every word any of it says.
 *
 * The screens (`src/app/manage/bug-reports/*.tsx` and `src/components/bug-report-form.tsx`) map
 * over this and decide nothing — which is what lets `npm run verify` prove «nothing leaves the
 * phone before the owner says so» and «a репорт carries the context even when the owner wrote one
 * line» without a device, a picker or a chooser.
 *
 * **The route is derived, never passed.** A call site that had to name its own path would
 * eventually name the wrong one — and the crash fallback, which has no router beneath it, could
 * not name any. So `routeOf` reads it out of the журнал, which already holds every screen change
 * (design D3) and, for a screen that threw on its first draw, the crashed route itself (D4 (a)).
 */

/** The three lines the form offers. Only the first is required. */
export interface FormFields {
  readonly did: string;
  readonly happened: string;
  readonly expected: string;
}

export const EMPTY_FORM: FormFields = { did: '', happened: '', expected: '' };

export const FORM_TITLE = 'Повідомити про помилку';
export const FIELD_LABELS = {
  did: 'Що я робив',
  happened: 'Що сталося',
  expected: 'Чого я очікував',
} as const;
export const FIELD_HINTS = {
  did: 'Обовʼязково. Наприклад: «натиснув Записати на витраті 250 грн»',
  happened: 'Що застосунок показав або зробив замість цього',
  expected: 'Що мало статися',
} as const;
export const SAVE_LABEL = 'Зберегти';
export const PROMPTING_HEADING = 'Що спричинило';

/** The refusal for an empty «Що я робив» — the one line without which a репорт is not one. */
export const REQUIRED_REFUSAL = 'Напишіть, що ви робили — без цього репорт нічого не пояснює.';

/** The refusal for a write that did not happen (design D9a). */
export function saveFailedRefusal(reason: string): string {
  return `Не вдалося зберегти репорт: ${reason}`;
}

/** The section's own words. */
export const LIST_TITLE = 'Репорти про помилки';
export const NEW_REPORT_LABEL = 'Повідомити про помилку';
export const EMPTY_LIST = 'Репортів поки немає. Якщо щось піде не так — заведіть звідси.';

/**
 * The two switches at the top of the section, and the sentence that must stand beside them.
 *
 * The warning is not decoration. Filing from a screen photographs that screen, and a скріншот of
 * this app is usually a picture of the owner's money — so the section says so plainly, once,
 * where the owner turns the thing on rather than only at the moment they hand a file over
 * (vision §12 as amended).
 */
export const CAPTURE_SECTION_LABEL = 'Як заводити репорт з екрана';
export const GESTURE_SWITCH_LABEL = 'Жест: два пальці';
export const GESTURE_SWITCH_HINT =
  'Потримайте два пальці нерухомо близько секунди на будь-якому екрані — відкриється коротка форма.';
export const HANDLE_SWITCH_LABEL = 'Маркер на екрані';
export const HANDLE_SWITCH_HINT =
  'Маленька позначка «⚑» поверх усіх екранів робить те саме, що й жест. Знадобиться, якщо увімкнено TalkBack.';
export const CAPTURE_SECTION_WARNING =
  'Репорт з екрана робить скріншот цього екрана. Скріншот показує те, що на ньому було — разом із сумами й назвами. Він лишається на телефоні, доки ви самі не передасте репорт.';

/** The saved репорт's actions. */
export const ADD_SCREENSHOT_LABEL = 'Додати скріншот';
export const COPY_LABEL = 'Скопіювати';
export const HAND_OVER_LABEL = 'Передати';
export const REMOVE_LABEL = 'Видалити';

/**
 * The routes of this section itself. The form's own route is skipped when the репорт's screen is
 * derived — a репорт about the репорт form is not what the owner meant — but the section's is not:
 * filing on one's own genuinely happens there, and the spec names it as the screen.
 */
export const LIST_ROUTE = '/manage/bug-reports';
export const NEW_ROUTE = '/manage/bug-reports/new';
export function savedRoute(id: string): string {
  return `/manage/bug-reports/${id}`;
}

/** Where a репорт lands when the журнал holds no screen entry at all — a phone that just started. */
const UNKNOWN_ROUTE = '/';

/**
 * Which screen the репорт is about.
 *
 * With a prompting failure: the last screen entry *before* it — the screen the dialog was shown
 * on, or the screen that threw. The form's own screen entry is written after the failure, so it
 * cannot be mistaken for it. Without one: the last screen entry that is not the form itself,
 * which when filing from the section is the section.
 */
export function routeOf(
  journal: readonly JournalEntry[],
  prompting?: JournalEntry | null,
): string {
  const screens = (upTo: number) =>
    journal.slice(0, upTo).filter((entry) => entry.kind === 'screen');

  if (prompting) {
    const at = journal.findIndex((entry) => entry.id === prompting.id);
    const before = screens(at < 0 ? journal.length : at);
    return before[before.length - 1]?.name ?? UNKNOWN_ROUTE;
  }

  const usable = journal.filter((entry) => entry.kind === 'screen' && entry.name !== NEW_ROUTE);
  return usable[usable.length - 1]?.name ?? UNKNOWN_ROUTE;
}

/** What the form shows above the fields when something prompted it. */
export function promptingLine(prompting: JournalEntry | null): string | null {
  if (prompting === null) {
    return null;
  }
  const what = prompting.kind === 'crash' ? 'Падіння' : 'Збій';
  const detail = prompting.detail?.split(/\r\n|\r|\n/)[0] ?? '';
  const head = `${what} · ${prompting.name} · ${moment(prompting.at)}`;
  return detail.length > 0 ? `${head}\n${detail}` : head;
}

/** The form as the screen draws it. */
export interface FormModel {
  readonly title: string;
  readonly fields: FormFields;
  readonly prompting: JournalEntry | null;
  /** The line above the fields, or `null` when the owner filed this on their own. */
  readonly promptingLine: string | null;
  /** What the last refused save said, or `null` before anything was tried. */
  readonly refusal: string | null;
  readonly saveLabel: string;
}

export function formState(options: {
  readonly fields: FormFields;
  readonly prompting?: JournalEntry | null;
  readonly refusal?: string | null;
}): FormModel {
  const prompting = options.prompting ?? null;
  const refusal = options.refusal ?? null;
  return {
    title: FORM_TITLE,
    fields: options.fields,
    prompting,
    promptingLine: promptingLine(prompting),
    // A refusal is shown while it is still true and no longer. The host holds it so it survives
    // the form component, which means it also survives the keystroke that answers it — and a red
    // line under a filled «Що я робив» says the form is still refusing when it is not. Only the
    // required-line refusal is answerable this way: a save the storage would not take is not about
    // the fields, and typing does not make the storage work.
    refusal: refusal === REQUIRED_REFUSAL && options.fields.did.trim().length > 0 ? null : refusal,
    saveLabel: SAVE_LABEL,
  };
}

/** A репорт as it is created — everything but the screenshots, which are added afterwards. */
export type NewReport = Omit<BugReport, 'screenshots' | 'handedOverAt'>;

/** What the app knows about itself, gathered by the screen and handed in as values. */
export interface ReportContext {
  readonly build: BuildInfo;
  readonly device: DeviceInfo;
  readonly migrationsApplied: number;
  readonly counts: ReportCounts;
  readonly journal: readonly JournalEntry[];
  readonly prompting: JournalEntry | null;
  readonly now: Date;
  /**
   * Which door this репорт came through.
   *
   * On the context rather than at a second call site, because `attachContext` has exactly one
   * caller — `submitForm` — and everything the app attaches by itself already travels this way. The
   * three screens that reach `submitForm` each know their own answer: `new.tsx` says `'dialog'`
   * when a failure prompted it and `'section'` when the owner went looking, and
   * `crash-fallback.tsx` says `'crash'`. The fourth, `'here'`, is `submitHere`'s and never passes
   * through here.
   */
  readonly origin: ReportOrigin;
}

/**
 * Everything the app attaches by itself, assembled from what the screen read.
 *
 * The журнал is copied here and not referenced: the live one keeps rolling, and a репорт that
 * pointed into it would eventually lose the very failure it was filed about (design D5).
 */
export function attachContext(
  id: string,
  fields: FormFields,
  context: ReportContext,
): NewReport {
  const trimmed = (value: string) => {
    const text = value.trim();
    return text.length > 0 ? text : null;
  };
  return {
    id,
    createdAt: context.now,
    did: fields.did.trim(),
    happened: trimmed(fields.happened),
    expected: trimmed(fields.expected),
    route: routeOf(context.journal, context.prompting),
    build: context.build,
    device: context.device,
    migrationsApplied: context.migrationsApplied,
    counts: context.counts,
    journal: context.journal,
    prompting: context.prompting,
    origin: context.origin,
    // These three doors never capture a скріншот, so there is never a reason there is none. Only
    // `submitHere` can carry one (design D3).
    captureFailure: null,
  };
}

export type SubmitOutcome =
  | { readonly kind: 'saved'; readonly report: NewReport }
  | { readonly kind: 'refused'; readonly message: string };

/**
 * Saves what the owner wrote, or says why it was not saved.
 *
 * `save` is a thunk rather than a repository, so a write that throws is a value here and not an
 * exception on the screen (design D9a). That matters most where it is least likely to be noticed:
 * the crash fallback is shown when things are already wrong, and a crash during the migrations
 * leaves «Зберегти» writing to a database that is not there. A failed save is journaled like any
 * other failure, so the next репорт — filed later, on a launch that worked — carries the evidence
 * of the one that could not be.
 */
export function submitForm(options: {
  readonly id: string;
  readonly fields: FormFields;
  readonly context: ReportContext;
  readonly save: (report: NewReport) => void;
}): SubmitOutcome {
  if (options.fields.did.trim().length === 0) {
    return { kind: 'refused', message: REQUIRED_REFUSAL };
  }
  const report = attachContext(options.id, options.fields, options.context);
  try {
    options.save(report);
  } catch (error) {
    return { kind: 'refused', message: saveFailedRefusal(reportFailure('bug-report-save', error)) };
  }
  return { kind: 'saved', report };
}

/** One line of the section's list. */
export interface ReportRow {
  readonly id: string;
  readonly moment: string;
  /** The first line of «Що я робив» — what the owner will recognise the репорт by. */
  readonly summary: string;
  readonly route: string;
  readonly handedOver: boolean;
  /** «Передано» or «Ще не передано», so the screen writes no words of its own. */
  readonly handedOverLabel: string;
}

export function listRows(reports: readonly BugReport[]): ReportRow[] {
  return [...reports]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((report) => ({
      id: report.id,
      moment: moment(report.createdAt),
      summary: report.did.split(/\r\n|\r|\n/)[0]?.trim() ?? '',
      route: report.route,
      handedOver: report.handedOverAt !== null,
      handedOverLabel: report.handedOverAt === null ? 'Ще не передано' : 'Передано',
    }));
}

/**
 * Where a hand-over is.
 *
 * `handing-over` is the chooser being open. It has no timeout by design, for
 * `ai-analysis-screen.ts`'s reason: a promise that never resolves is a defect in the adapter to be
 * fixed, not something to paper over with a timer that would then claim an outcome nobody saw.
 */
export type SavedReportState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'handing-over' }
  | { readonly kind: 'handed-over'; readonly at: Date }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'copied' };

export const IDLE: SavedReportState = { kind: 'idle' };

/**
 * What the screen says about each outcome, in the owner's own words.
 *
 * «Файл передано системі» and not «надіслано» or «отримано»: the phone does not tell the app
 * whether the owner picked an app or dismissed the chooser, so this is the whole of what the app
 * knows, and the same sentence the AI-аналіз screen says about the same event.
 */
export function savedReportWords(state: SavedReportState): string | null {
  switch (state.kind) {
    case 'idle':
      return null;
    case 'handing-over':
      return 'Передаємо…';
    case 'handed-over':
      return `Файл передано системі ${moment(state.at)}. Що з ним сталося далі, знає лише обраний застосунок.`;
    case 'unavailable':
      return 'На цій платформі передати файл не вийде. Скопіюйте текст — він той самий.';
    case 'failed':
      return `Не вдалося підготувати файл: ${state.reason}`;
    case 'copied':
      return 'Скопійовано.';
  }
}

/** What «Скопіювати» puts on the clipboard: the rendered text, without a byte of image data. */
export function copyText(report: BugReport): string {
  return renderReport(report);
}

/** What the saved репорт's screen shows: the same text, character for character. */
export function savedReportText(report: BugReport): string {
  return renderReport(report);
}

/**
 * Hands the репорт over as one file, and remembers the moment it left.
 *
 * `state` is the guard rather than a flag of its own: a tap while the chooser is open is a
 * `SharingInProgressException` waiting to happen, and the screen simply does not start a second
 * one. `progress` is called before the first await, so the screen's state is already
 * `handing-over` when a second tap is checked against it.
 */
export async function handOver(
  state: SavedReportState,
  options: {
    readonly report: BugReport;
    readonly files: BugReportFilesPort;
    readonly storage: { markHandedOver(id: string, at: Date): void };
    readonly now: () => Date;
/**
     * Shows the скріншот and the warning, and answers whether the owner confirmed.
     *
     * Asked by `handOver` rather than by the screen, so «the скріншот is seen before it can leave»
     * is a property of the one function every hand-over goes through — the saved репорт's
     * «Передати» and the sheet's «Зберегти й передати» alike. A репорт with no скріншот never
     * reaches it (design D11).
     *
     * Optional in the type but **not** optional in effect: a репорт holding a скріншот and no
     * confirmer hands over nothing at all. Fail-closed rather than fail-open, because the failure
     * mode this guards is the owner's суми reaching a chooser they were never warned about — and a
     * caller that forgets to pass one must lose a hand-over, never the warning.
     */
    readonly confirmScreenshots?: () => Promise<boolean>;
  },
  progress: (state: SavedReportState) => void,
): Promise<SavedReportState> {
  if (state.kind === 'handing-over') {
    return state;
  }

  // Before anything is prepared and before the state moves: backing out must leave the репорт
  // exactly as it was, and a `handing-over` the owner then cancelled would be a screen stuck
  // saying «Передаємо…» about a hand-over that never started.
  //
  // A missing confirmer is treated as a refusal, not as permission. The requirement is
  // unconditional — WHERE the репорт holds a скріншот the hand-over SHALL pass through the
  // confirmation — so the one function every hand-over goes through refuses rather than letting a
  // forgetful caller put the owner's суми in front of a chooser unwarned.
  if (needsScreenshotWarning(options.report)) {
    const confirmed = (await options.confirmScreenshots?.()) ?? false;
    if (!confirmed) {
      return state;
    }
  }

  progress({ kind: 'handing-over' });

  const images: ReportImage[] = [];
  for (const shot of options.report.screenshots) {
    const read = await options.files.read(options.report.id, shot.name);
    if (read.kind === 'read') {
      images.push({ name: shot.name, mime: read.mime, base64: read.base64 });
    }
    // A screenshot whose file has gone is named as missing inside the text (`renderReportFile`),
    // not a reason to refuse the hand-over: the rest of the репорт is still what the bug needs.
  }

  const outcome: AnalysisShareOutcome = await options.files.share({
    name: reportFileName(options.report),
    text: renderReportFile(options.report, images),
  });

  if (outcome.kind === 'failed') {
    return { kind: 'failed', reason: outcome.reason };
  }
  if (outcome.kind === 'unavailable') {
    return { kind: 'unavailable' };
  }
  const at = options.now();
  options.storage.markHandedOver(options.report.id, at);
  return { kind: 'handed-over', at };
}

export type AddScreenshotOutcome =
  | { readonly kind: 'added'; readonly name: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Adds one screenshot the owner picks from the phone's own files.
 *
 * A picker the owner backs out of attaches nothing and is not a failure — the spec says so in as
 * many words, and `cancelled` is how the port says it.
 */
export async function addScreenshot(options: {
  readonly reportId: string;
  readonly files: BugReportFilesPort;
  readonly storage: { addScreenshot(reportId: string, name: string, addedAt: Date): void };
  readonly now: () => Date;
}): Promise<AddScreenshotOutcome> {
  const picked = await options.files.pickScreenshot();
  if (picked.kind === 'cancelled') {
    return { kind: 'cancelled' };
  }
  if (picked.kind === 'failed') {
    return { kind: 'failed', message: `Не вдалося відкрити файли: ${picked.reason}` };
  }

  const kept = await options.files.keep(options.reportId, { uri: picked.uri, mime: picked.mime });
  if (kept.kind === 'failed') {
    return { kind: 'failed', message: `Не вдалося зберегти скріншот: ${kept.reason}` };
  }
  options.storage.addScreenshot(options.reportId, kept.name, options.now());
  return { kind: 'added', name: kept.name };
}

/**
 * The confirmation that stands between a репорт holding a скріншот and the phone's chooser.
 *
 * A скріншот is the one thing a репорт carries that can show the owner's money: the app never
 * reads, interprets or redacts it — it cannot know which pixels are a сума, and a promise it could
 * not keep would be worse than the plain warning it can. So the owner is shown the picture and
 * told exactly what it may carry, and nothing leaves until they say so (vision §12 as amended,
 * design D11).
 *
 * A репорт holding no скріншот is not warned about at all: a warning about nothing is how owners
 * learn to dismiss warnings without reading them.
 */
export const SCREENSHOT_CONFIRMATION = {
  title: 'Передати репорт зі скріншотом?',
  message:
    'Скріншот показує те, що було на екрані — разом із сумами й назвами. Подивіться на нього, перш ніж передавати.',
  confirm: 'Передати',
  cancel: 'Скасувати',
} as const;

/** Whether the hand-over must pass through that confirmation first. */
export function needsScreenshotWarning(report: BugReport): boolean {
  return report.screenshots.length > 0;
}

/** Removing asks first, and the question is a value so the screen invents none of its words. */
export const REMOVE_CONFIRMATION = {
  title: 'Видалити репорт?',
  message: 'Разом із ним підуть його скріншоти. Скасувати це не вийде.',
  confirm: 'Видалити',
  cancel: 'Скасувати',
} as const;

/**
 * Removes a репорт, its rows and its files.
 *
 * The rows go by the cascade the schema declares; the images are files and go through the port —
 * both halves, because a репорт whose screenshots outlived it would leave the phone holding
 * pictures nothing points at.
 */
export async function removeReport(options: {
  readonly reportId: string;
  readonly files: BugReportFilesPort;
  readonly storage: { remove(id: string): void };
}): Promise<void> {
  options.storage.remove(options.reportId);
  await options.files.removeAll(options.reportId);
}
