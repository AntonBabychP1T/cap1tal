import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * What the screens themselves must be true of — read as text, which is the only way `verify` can
 * look at them.
 *
 * `npm run verify` never runs JSX and never presses a button, so every rule below is asserted the
 * way `.claude/rules/testing.md` prescribes for screens: by reading the `.tsx` by path from a test
 * that lives here in `src/ui/`, never under `src/app/` (a test file there would ship into the app
 * through expo-router's `require.context` and crash the bundle on its Node-only imports).
 *
 * These are structural claims, not behavioural ones. That every refusal offers «Повідомити про
 * помилку» with the right entry attached is proven properly in `failure-alert.test.ts`; what is
 * proven here is that no screen was left behind — which is precisely the thing a behavioural test
 * of the model cannot see.
 */

const APP = join(import.meta.dirname, '..', 'app');
const COMPONENTS = join(import.meta.dirname, '..', 'components');

function tsxUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return tsxUnder(path);
    }
    return name.endsWith('.tsx') ? [path] : [];
  });
}

/**
 * Every file that can put a dialog in front of the owner — `src/app/` *and* `src/components/`.
 *
 * Both trees, because the requirement is about what the owner sees and not about a directory:
 * «Категорії» and «Джерела» are drawn by `components/manage-list.tsx`, so a sweep of `src/app/`
 * alone declares them clean while every rename they refuse offers nothing. That is exactly how
 * this was missed once.
 */
function screenFiles(): string[] {
  return [...tsxUnder(APP), ...tsxUnder(COMPONENTS)];
}

const read = (relative: string) => readFileSync(join(APP, relative), 'utf8');

describe('every failure a screen shows', () => {
  it('Scenario: A refused save offers the репорт — no screen shows one without it', () => {
    // `failureMessage` is now reached only through `reportFailure`, so a screen that still called
    // it directly would be a dialog with no offer and a failure with no journal entry.
    const offenders = screenFiles().filter((path) =>
      readFileSync(path, 'utf8').includes('failureMessage('),
    );

    expect(offenders).toEqual([]);
  });

  it('routes the two dialogs that carry a text of their own through the same door', () => {
    // Neither of these built its message from an `Error`, so neither was caught by the sweep
    // above — and both are refusals the owner sees, so both belong in the журнал with an offer.
    expect(read('transaction/scan.tsx')).toContain('failureAlert(');
    expect(read('transaction/scan.tsx')).toContain("title: 'Не прикріплено'");
    expect(read('(tabs)/index.tsx')).toContain('failureAlert(');
    expect(read('(tabs)/index.tsx')).toContain("error: answer.message");
  });

  it('journals the two failures that are shown in place rather than in a dialog', () => {
    // A бекап that failed and a sync that failed are told on the screen, so there is no button to
    // hang an offer on. The журнал still has them, and the section is where they are reported.
    expect(read('manage/backup.tsx')).toContain('journal.failure(');
    expect(read('manage/monobank.tsx')).toContain('journal.failure(');
  });

  it('opens the form with the entry id and nothing else', () => {
    // The route a репорт names is derived from the журнал (design D9), so a call site that passed
    // its own path would be a second source of truth for the same fact.
    for (const path of screenFiles()) {
      const source = readFileSync(path, 'utf8');
      if (!source.includes('params: { prompt')) {
        continue;
      }
      expect(source, path).toContain('params: { prompt: entryId }');
    }
    // And the section's own «Повідомити про помилку» passes none, since nothing prompted it.
    const list = read('manage/bug-reports/index.tsx');
    expect(list).toContain("router.push('/manage/bug-reports/new')");
    expect(list).not.toContain('params:');
  });
});

describe('what the root layout remembers', () => {
  const layout = read('_layout.tsx');

  it('records every screen the owner opens', () => {
    expect(layout).toContain('usePathname');
    expect(layout).toContain("journal.record('screen', pathname)");
  });

  it('Scenario: An error in started work is remembered', () => {
    // Remembered, not caught: both handlers journal and then hand the error onward untouched.
    expect(layout).toContain('ErrorUtils.setGlobalHandler');
    expect(layout).toContain('previousGlobalHandler(error, isFatal)');
    expect(layout).toContain('enablePromiseRejectionTracker');
    // Under `__DEV__` only, and delegating — which is exactly when and how React Native installs
    // it. Anything else would change the platform behaviour the requirement freezes.
    expect(layout).toContain('promiseRejectionTrackingOptions');
    expect(layout).toContain('platformOptions.onUnhandled?.(id, rejection)');
    expect(layout).toContain('platformOptions.onHandled?.(id)');
  });

  it('gives the журнал its storage once the migrations have run', () => {
    expect(layout).toContain('bindJournal(reportingRepo)');
  });

  it('Scenario: Returning from the fallback shows no launch view', () => {
    // `retry` remounts the whole root layout, the launch overlay included. Its once-per-process
    // flag is what stops it replaying over the return.
    const overlay = readFileSync(
      join(import.meta.dirname, '..', 'components', 'animated-icon.tsx'),
      'utf8',
    );
    expect(overlay).toContain('let playedOnce = false');
    expect(overlay).toContain('useState(!playedOnce)');
    expect(overlay).toContain('playedOnce = true');
  });
});

describe('the репорт screens', () => {
  const form = readFileSync(
    join(import.meta.dirname, '..', 'components', 'bug-report-form.tsx'),
    'utf8',
  );
  const fallback = readFileSync(
    join(import.meta.dirname, '..', 'components', 'crash-fallback.tsx'),
    'utf8',
  );

  it('Scenario: Saving opens the saved репорт', () => {
    // `replace`, so «назад» from the saved репорт lands on the section and not on a form the
    // owner has already submitted.
    expect(read('manage/bug-reports/new.tsx')).toContain('router.replace(');
    expect(read('manage/bug-reports/new.tsx')).toContain('/manage/bug-reports/${id}');
  });

  it('Scenario: The required line is enforced in Ukrainian', () => {
    // The refusal is the model's, not the screen's: one wording, tested in one place.
    expect(form).toContain('model.refusal');
    expect(read('manage/bug-reports/new.tsx')).toContain("outcome.kind === 'refused'");
  });

  it('Scenario: A save that fails says so and keeps the form', () => {
    // The same branch covers both refusals — an empty line and a write that did not happen — so
    // neither can navigate away and neither can be forgotten.
    const screen = read('manage/bug-reports/new.tsx');
    expect(screen).toContain('setRefusal(outcome.message)');
    expect(screen.indexOf('setRefusal(outcome.message)')).toBeLessThan(
      screen.indexOf('router.replace('),
    );
    expect(fallback).toContain('setRefusal(outcome.message)');
  });

  it('Scenario: The back gesture discards the form', () => {
    const screen = read('manage/bug-reports/new.tsx');

    // Nothing is stored on the way out because nothing writes outside «Зберегти»: exactly one
    // `create` in the file, inside `submitForm`'s own `save`. That — not a back-press handler —
    // is what makes leaving safe, so it is what this asserts.
    expect(screen.split('reportingRepo.create(').length - 1).toBe(1);
    expect(screen).toContain('save: (report) => reportingRepo.create(report)');
    // No effect writes on unmount, and the typed lines live in component state only.
    expect(screen).not.toContain('useEffect');
    expect(form).toContain('useState<FormFields>(EMPTY_FORM)');
    // And the shared form owns no navigation hook at all, because the crash fallback renders it
    // with no router beneath it (design D4).
    expect(form).not.toContain('useCloseOnBack(');
    expect(form).not.toContain('useRouter(');
    expect(form).not.toContain('useFocusEffect(');
  });

  it('Scenario: The whole text is on the screen', () => {
    // What is drawn is the rendering itself, so the owner's reading is a reading of what leaves.
    expect(read('manage/bug-reports/[id].tsx')).toContain('savedReportText(report)');
    expect(read('manage/bug-reports/[id].tsx')).toContain('copyText(report)');
  });

  it('Scenario: The empty list says so', () => {
    expect(read('manage/bug-reports/index.tsx')).toContain('EMPTY_LIST');
    expect(read('manage/bug-reports/index.tsx')).toContain('listRows(');
  });
});

describe('the crash fallback', () => {
  const fallback = readFileSync(
    join(import.meta.dirname, '..', 'components', 'crash-fallback.tsx'),
    'utf8',
  );
  const layout = read('_layout.tsx');

  it('Scenario: A crashed screen is replaced by the fallback', () => {
    expect(layout).toContain('export function ErrorBoundary');
    expect(layout).toContain('<CrashFallback');
    // The route it crashed on, then the crash — in that order, once. A screen that throws on its
    // first draw never lets the root layout's own pathname effect commit, so the fallback has to
    // write it (design D4 (a)).
    const route = fallback.indexOf("journal.record('screen', pathname)");
    const crash = fallback.indexOf("journal.record('crash', 'render'");
    expect(route).toBeGreaterThan(-1);
    expect(crash).toBeGreaterThan(route);
    expect(fallback).toContain('recorded.current');
  });

  it('Scenario: The fallback follows the system appearance', () => {
    // Its own scheme and its own palette: the theme provider went with the tree it replaced.
    expect(fallback).toContain('useColorScheme()');
    expect(fallback).toContain("Colors[scheme === 'dark' ? 'dark' : 'light']");
    expect(fallback).toContain('theme.background');
  });

  it('Scenario: Reporting from the fallback saves and returns', () => {
    expect(fallback).toContain('<BugReportForm');
    expect(fallback).toContain('reportingRepo.create(report)');
    // Saving ends the same way «Повернутися» does.
    expect(fallback.split('goBack();').length - 1).toBeGreaterThanOrEqual(2);
  });

  it('Scenario: Returning without reporting', () => {
    // `retry` alone only clears the boundary's error state — the navigation still points at the
    // route that threw, so the fallback navigates first and retries after (design D4 (a)).
    expect(fallback).toContain("router.replace('/')");
    const navigate = fallback.indexOf("router.replace('/')");
    const retry = fallback.indexOf('void retry();');
    expect(navigate).toBeGreaterThan(-1);
    expect(retry).toBeGreaterThan(navigate);
    expect(fallback).toContain('setTimeout(');
    // And the device's own «назад» is the same way out, not a second dead end.
    expect(fallback).toContain('BackHandler.addEventListener');
    expect(fallback).not.toContain('useCloseOnBack(');
  });

  it('ships the crash lever guarded, and links to it from nowhere', () => {
    const lever = read('crash.tsx');
    expect(lever).toContain('if (__DEV__)');
    expect(lever).toContain('throw new Error(');
    expect(lever).toContain('<Redirect href="/" />');
    // Reached by deep link only: no screen in the app points at it.
    const linking = screenFiles().filter(
      (path) => !path.endsWith('crash.tsx') && readFileSync(path, 'utf8').includes("'/crash'"),
    );
    expect(linking).toEqual([]);
  });
});

/**
 * What the two new bug-report surfaces must actually contain.
 *
 * Read as text, because `verify` runs no JSX. These are structural claims the behavioural tests
 * cannot make: `bug-report-screen.test.ts` proves what the switch *words* say and what `handOver`
 * *does*, and both stay green if the screen never draws a switch or never passes a confirmer. That
 * gap is exactly how a warning stops being shown without a single test going red.
 */
describe('the screens that file a репорт from the screen the owner is on', () => {
  const section = () => read('manage/bug-reports/index.tsx');
  const sheet = () =>
    readFileSync(join(COMPONENTS, 'bug-report-here.tsx'), 'utf8');
  const savedReport = () => read('manage/bug-reports/[id].tsx');

  it('the section actually draws both switches and writes them', () => {
    const source = section();

    // Drawn…
    expect(source).toContain('GESTURE_SWITCH_LABEL');
    expect(source).toContain('HANDLE_SWITCH_LABEL');
    expect(source).toContain('<Switch');
    // …bound to the two fields…
    expect(source).toContain('gestureEnabled');
    expect(source).toContain('handleEnabled');
    // …written to storage, or the switch would forget itself the moment the screen closed…
    expect(source).toContain('setCaptureSettings');
    // …and the sentence about the скріншот is on the screen, not merely exported.
    expect(source).toContain('CAPTURE_SECTION_WARNING');
  });

  it('both hand-over doors pass the скріншот confirmation', () => {
    // `handOver` fails closed without it, so a screen that forgot would hand over nothing at all —
    // which is safe, but is a broken «Передати» rather than a working one.
    expect(sheet()).toContain('confirmScreenshots');
    expect(savedReport()).toContain('confirmScreenshots');
    // One copy of the dialog, imported — not two that can drift apart.
    expect(savedReport()).toContain("from '@/components/bug-report-here'");
    expect(savedReport()).not.toContain('SCREENSHOT_CONFIRMATION.title');
  });

  it('the sheet takes its gesture, its words and its ordering from src/ui', () => {
    const source = sheet();

    // The recognizer reads the values `verify` asserts, rather than repeating numbers.
    expect(source).toContain('GESTURE.pointers');
    expect(source).toContain('GESTURE.minDurationMs');
    expect(source).toContain('GESTURE.maxDistanceDp');
    // The ordering is `activate`'s, not the component's.
    expect(source).toContain('activate({');
    // The back gesture is «Скасувати» — one way out, not two.
    expect(source).toContain('BackHandler.addEventListener');
    expect(source).toContain('dismiss()');
    // No number and no sentence invented here.
    expect(source).not.toContain('1200');
    expect(source).not.toContain('minDuration(2');
  });

  it('the sheet says which way a hand-over failed', () => {
    const source = sheet();

    // The one link in «A hand-over that cannot happen still leaves the репорт stored» that has no
    // seam a Node test can reach: `handOver`'s two outcomes are proven in bug-report-screen.test.ts
    // and both sentences in bug-report-here.test.ts, but the mapping between them lives here.
    expect(source).toContain('HAND_OVER_UNAVAILABLE');
    expect(source).toContain('handOverFailed(');
    expect(source).toContain("state.kind === 'unavailable'");
    expect(source).toContain("state.kind === 'failed'");
    // And the репорт stays stored either way — the sheet must not discard it on a failed chooser.
    expect(source).not.toContain('remove(id)');
  });

  it('nothing derives anything from a скріншот except the bytes the file needs', () => {
    // «The app never looks inside a скріншот»: the one place image data is read at all is the
    // files port, and only to base64 it into the file the owner hands over. Nothing decodes,
    // measures, samples or OCRs one.
    const readers = [...tsxUnder(APP), ...tsxUnder(COMPONENTS)]
      .concat(
        readdirSync(join(import.meta.dirname))
          .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
          .map((name) => join(import.meta.dirname, name)),
      )
      .filter((path) => /getPixel|decodeBitmap|ImageData|createCanvas|OCR|recognizeText/i.test(readFileSync(path, 'utf8')));

    expect(readers).toEqual([]);
  });
});
