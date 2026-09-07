import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TABS } from './tabs';

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

describe('where the прогрес is evaluated, and where it is not', () => {
  const readScreen = (relative: string) => readFileSync(join(APP, relative), 'utf8');

  it('Scenario: Opening Головний earns nothing', () => {
    const home = readScreen(join('(tabs)', 'index.tsx'));

    // Головний calls the evaluation on the two paths where the owner *stored* something — a
    // транзакція recategorised from the стрічка, and a чернетка settled — and on the pull that
    // runs a sync. It calls it on no render, no focus and no scroll: `useReloadOnFocus` and the
    // effects around it never reach it.
    expect(home).toContain("from '@/hooks/progress-ports';");
    expect(home).toContain('evaluateProgress');
    // On no effect and on no focus reader: the two calls are inside the two store paths.
    expect(home).not.toMatch(/useEffect\(\(\) => \{\s*evaluateProgress/);
    expect(home).not.toMatch(/useReloadOnFocus\([\s\S]{0,900}?evaluateProgress/);
  });

  it('every named moment calls the evaluation, and each is a store rather than a draw', () => {
    // The ten moments of the achievements capability, each at the place that already performs it.
    const moments: [string, RegExp][] = [
      ['_layout.tsx', /seedStarterSet\(db\);[\s\S]*?evaluateProgress\(\)/],
      [join('transaction', 'new.tsx'), /transactionsRepo\.save\(t, now\);[\s\S]{0,500}?evaluateProgress\(\)/],
      [join('transaction', '[id].tsx'), /transactionsRepo\.remove\(original\.id\);[\s\S]{0,500}?evaluateProgress\(\)/],
      [join('(tabs)', 'accounts.tsx'), /accountsRepo\.save\([\s\S]{0,500}?evaluateProgress\(\)/],
      [join('account', '[id].tsx'), /accountsRepo\.save\([\s\S]{0,500}?evaluateProgress\(\)/],
      [join('manage', 'goals.tsx'), /goalsRepo\.save\([\s\S]{0,500}?evaluateProgress\(\)/],
      [join('manage', 'saldo-import.tsx'), /importsRepo\.commit\([\s\S]{0,500}?evaluateProgress\(\)/],
      [join('manage', 'backup.tsx'), /'restored'[\s\S]{0,500}?evaluateProgress\(\)/],
      [join('manage', 'monobank.tsx'), /startSync\(\{[\s\S]{0,900}?evaluateProgress\(\)/],
    ];

    for (const [file, pattern] of moments) {
      expect(readScreen(file), file).toMatch(pattern);
    }
  });

  it('«Прогрес» reads and never evaluates', () => {
    // Opening «Прогрес», leaving it and returning cannot earn anything: the screen calls the
    // reader and never the runner. The one write it makes is marking the unseen досягнення seen.
    const screen = readScreen('progress.tsx');

    expect(screen).toContain('progressScreenData');
    expect(screen).not.toContain('evaluateProgress');
    expect(screen).toContain('markAllSeen');
  });

  it('the прогрес screens are registered beside the other pushed ones, and the tabs are unchanged', () => {
    const layout = readScreen('_layout.tsx');

    for (const name of ['progress', 'achievement/[key]', 'challenge/[key]']) {
      expect(layout).toContain(`<Stack.Screen name="${name}"`);
    }
    // Scenario: The tabs are unchanged — the same five, and «Прогрес» is not among them.
    //
    // This used to scrape `<NativeTabs.Trigger name="…">` out of `app-tabs.tsx`. Both bars now
    // render from one list, so the claim is read from that list instead — the same assertion
    // against a source that cannot disagree with the other platform. `tabs.test.ts` owns the
    // order and the labels; what is proven here is only that «Прогрес» never became a вкладка.
    expect(TABS.map((tab) => tab.routeName)).toEqual([
      'index',
      'month',
      'accounts',
      'reports',
      'settings',
    ]);
    expect(TABS.some((tab) => tab.routeName === 'progress')).toBe(false);
  });

  it('Scenario: Прогрес is reachable from Звіти, and from Головний when something waits', () => {
    const reports = readScreen(join('(tabs)', 'reports.tsx'));
    expect(reports).toContain("router.push('/progress')");
    // Scenario: The entry is there with nothing earned — the Pressable is unconditional, not
    // wrapped in a `{… ? (` the way the sections above it are.
    const entry = reports.slice(reports.indexOf("router.push('/progress')") - 200);
    expect(entry.slice(0, 200)).not.toMatch(/\?\s*\($/m);
    expect(reports).toMatch(/<Pressable onPress=\{\(\) => router\.push\('\/progress'\)\}/);

    // Головний renders the section only when `homeProgressSection` returned one.
    const home = readScreen(join('(tabs)', 'index.tsx'));
    expect(home).toContain('homeProgressSection');
    expect(home).toMatch(/progressSection \? \(/);
  });

  it('setting a ліміт is not one of the moments', () => {
    // A ліміт is a ціль витрат and no досягнення is defined about one, so there is nothing to
    // earn — and a call there would be a moment the capability does not name.
    const limits = readScreen(join('manage', 'limits.tsx'));

    expect(limits).not.toContain('evaluateProgress');
  });
});

/**
 * Both tab bars render from `TABS`, and neither writes a вкладка of its own.
 *
 * This is the assertion the change is *for*. The web bar came to render four вкладки and omit
 * «Звіти» because the set was written twice in two `.tsx` files `verify` never loads; moving the
 * set into `tabs.ts` removed the second copy, but on its own it removes nothing permanently — a
 * sixth hand-written `Trigger` beside the map, or a bar that quietly stops mapping the list, would
 * put the copy straight back and `tabs.test.ts` would stay green, because it only ever sees the
 * list.
 *
 * So this reads the two bars as text, the way `.claude/rules/testing.md` prescribes, and asks the
 * one thing that cannot be asked of the list: that each file renders *from* it and names no route
 * itself. It cannot see either bar drawn — only the emulator does that — but the drift it is
 * closing was never visible on screen either. It was visible in the source.
 */
describe('Scenario: A second way of drawing the bar offers the same set', () => {
  const readBar = (name: string) => readFileSync(join(COMPONENTS, name), 'utf8');

  const bars = [
    // The native bar takes a `routeName`; the web one takes that and an `href`. The lookahead
    // keeps `<NativeTabs.Trigger.Label>` and `.Icon` — the children of the one trigger — from
    // counting as triggers of their own.
    { file: 'app-tabs.tsx', trigger: /<NativeTabs\.Trigger(?![.\w])/g },
    { file: 'app-tabs.web.tsx', trigger: /<TabTrigger(?![.\w])/g },
  ] as const;

  for (const { file, trigger } of bars) {
    it(`${file} renders from the one list`, () => {
      const bar = readBar(file);

      expect(bar, `${file} must import the set`).toMatch(/import \{[^}]*\bTABS\b[^}]*\} from/);
      expect(bar, `${file} must map it`).toMatch(/TABS\.map\(/);
    });

    it(`${file} writes no вкладка of its own`, () => {
      const bar = readBar(file);

      // Exactly one trigger element in the file: the one inside the map. A second is a вкладка
      // written by hand, which is how the two bars disagreed in the first place.
      expect(bar.match(trigger) ?? [], `${file} triggers`).toHaveLength(1);

      // And no route, label or path spelled out beside the map.
      for (const tab of TABS) {
        expect(bar, `${file} must not name ${tab.label}`).not.toContain(`"${tab.label}"`);
        expect(bar, `${file} must not name ${tab.routeName}`).not.toContain(`name="${tab.routeName}"`);
      }
    });
  }
});

/**
 * How each bar marks the вкладка being read.
 *
 * The gate cannot see either bar drawn, so these read the source — and here that is worth more than
 * usual, because of where the signal actually lives. On Android the non-colour signal is the
 * platform's: it names the open tab and leaves the other four to their icons, which the emulator
 * confirmed and which no assertion here could have. The w700 label does nothing there.
 *
 * On the web bar it is the whole of it. That bar draws all five names, so `smallBold` against
 * `small` is the only thing separating the marked вкладка from the rest once colour is taken away —
 * and it lives in a file `verify` never loads, which is exactly how this bar came to render four
 * tabs and omit «Звіти» without anything noticing. A comment asking the next reader not to
 * "simplify" it away is not a guard. This is.
 */
describe('the mark on the вкладка being read', () => {
  const readBar = (name: string) => readFileSync(join(COMPONENTS, name), 'utf8');
  /** What the file draws, with the prose that explains it removed. */
  const withoutComments = (source: string) =>
    source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('Scenario: Opening a tab marks it — the native bar marks by tone, and no accent', () => {
    const bar = readBar('app-tabs.tsx');

    // `text` for the one being read, `textMuted` for the other four, on both icon and label.
    expect(bar).toMatch(/tintColor=\{colors\.text\}/);
    expect(bar).toMatch(/iconColor=\{colors\.textMuted\}/);
    expect(bar).toMatch(/selected:\s*\{[^}]*color:\s*colors\.text\b/);
    expect(bar).toMatch(/default:\s*\{[^}]*color:\s*colors\.textMuted\b/);

    // `qa-sweep-2026-09`: the accent shall not appear in the tab bar at all. Comments may explain
    // why, so only what is drawn is checked — and the role name is matched bare rather than in one
    // access form. `colors.accent`, `colors['accent']` and `themeColor="accent"` all put it back,
    // and pinning the spelling would have caught only the first. Neither bar has any other use of
    // the word once comments are gone, so the bare match costs nothing.
    expect(withoutComments(bar), 'no accent is drawn in the bar').not.toMatch(/accent/i);
  });

  it('Scenario: Opening a tab marks it — the web bar marks the focused trigger', () => {
    const bar = readBar('app-tabs.web.tsx');

    expect(bar).toMatch(/isFocused \? 'backgroundSelected' : 'backgroundElement'/);
    expect(bar).toMatch(/isFocused \? 'text' : 'textSecondary'/);

    expect(withoutComments(bar), 'no accent is drawn in the bar').not.toMatch(/accent/i);
  });

  it('Scenario: The mark survives without colour — the native bar carries a weight', () => {
    const bar = readBar('app-tabs.tsx');

    // Kept even though Android never draws two labels at once to compare: the two bars agree on
    // one mark, and a profile that labels all five gets the signal here too.
    expect(bar).toMatch(/selected:\s*\{[^}]*fontWeight:\s*'700'/);
    expect(bar).toMatch(/default:\s*\{[^}]*fontWeight:\s*'600'/);

    // The indicator pill is what the weight replaced; it must not come back as the only signal.
    expect(bar).toMatch(/indicatorColor="transparent"/);
  });

  it('Scenario: The mark survives without colour — the web bar carries a weight', () => {
    const bar = readBar('app-tabs.web.tsx');

    // This bar draws all five names, so the weight is the entire non-colour signal on it.
    // `smallBold` is w700 and `small` is w500 — asserted in `themed-text.tsx` below, so that
    // renaming either role cannot quietly flatten the two to one weight.
    expect(bar).toMatch(/type=\{isFocused \? 'smallBold' : 'small'\}/);

    const text = readFileSync(join(COMPONENTS, 'themed-text.tsx'), 'utf8');
    expect(text).toMatch(/smallBold:\s*\{[^}]*fontWeight:\s*'?700'?/);
    expect(text).toMatch(/\bsmall:\s*\{[^}]*fontWeight:\s*'?500'?/);
  });
});

/**
 * The поточні вартості reach the screens that read a внесок. The models take the map as an
 * optional argument and default it to empty, so a screen that stopped passing one would go on
 * computing a прогрес from розрахункові баланси and every test of those models would stay green —
 * which is exactly the regression this reads the `.tsx` to catch.
 */
describe('what an інвестиційний рахунок is worth reaches the screens that read it', () => {
  const readScreen = (relative: string) => readFileSync(join(APP, relative), 'utf8');

  it('Scenario: A вартість moves the прогрес of a ціль that holds the рахунок', () => {
    // The ціль's own screen wants the дата too — it says «поточна вартість на …» — so it takes
    // `all()`; the two that need only the сума take `amounts()`.
    expect(readScreen(join('goal', '[id].tsx'))).toMatch(
      /currentValues:\s*investmentsRepo\.all\(\)/,
    );
    expect(readScreen(join('goal', '[id].tsx'))).toMatch(
      /currentValues:\s*stored\.currentValues/,
    );

    for (const screen of [join('(tabs)', 'reports.tsx'), 'ai-analysis.tsx']) {
      expect(readScreen(screen), screen).toMatch(/currentValues:\s*investmentsRepo\.amounts\(\)/);
    }
    expect(readScreen(join('(tabs)', 'reports.tsx'))).toMatch(
      /currentValues:\s*stored\.currentValues/,
    );
    // `ai-analysis.tsx` spreads its whole `stored` into the пакет, so the read above is the whole
    // of the wiring there — asserted so a later refactor to named fields cannot drop this one.
    expect(readScreen('ai-analysis.tsx')).toMatch(/\.\.\.input\.stored|stored,/);
  });

  it('Scenario: No коригування is ever offered for a вартість', () => {
    const accounts = readScreen(join('(tabs)', 'accounts.tsx'));

    // «Звірити» on Рахунки is drawn from `reconcilable`, which `account-groups.ts` sets from the
    // баланс банку alone — never from the investment block (proven behaviourally in
    // `account-groups.test.ts`). What is read here is that the button's condition stays that one,
    // and that the block's own actions are the вартість's, with no звірка among them.
    expect(accounts).toMatch(/row\?\.reconcilable \? \(/);
    expect(accounts).toMatch(/title=\{row\.investment\.recordLabel\}/);
    expect(accounts).not.toMatch(/Звірити[^\n]*investment/);
    expect(accounts).not.toMatch(/investment[^\n]*Звірити/);
  });

  it('Scenario: A rejected вартість changes nothing', () => {
    const accounts = readScreen(join('(tabs)', 'accounts.tsx'));

    // The refusal `investments-repo` raises reaches the owner as «Не збережено», through the same
    // `failureAlert` every other refusal on this screen uses — and the write is the only thing in
    // the `try`, so a rejected one leaves the numbers exactly as they were: nothing else ran.
    expect(accounts).toMatch(/title: 'Не збережено',\s*where: 'account-current-value'/);
    expect(accounts).toMatch(/investmentsRepo\.set\(/);
  });

  it('Scenario: A recorded вартість appears at once / Replacing shows the newer figure and дата', () => {
    const accounts = readScreen(join('(tabs)', 'accounts.tsx'));

    // The дата is today's, taken at entry and never asked for (design D5); recording and replacing
    // are the one call, because storage upserts. `reload()` is what makes the row show it at once.
    expect(accounts).toMatch(/investmentsRepo\.set\([\s\S]{0,300}?asOf: todayIso\(new Date\(\)\)/);
    expect(accounts).toMatch(/investmentsRepo\.set\([\s\S]{0,500}?reload\(\)/);
    // No date field is offered anywhere in the form the owner types the сума into.
    expect(accounts).not.toMatch(/label="Дата"/);
  });

  it('Scenario: Clearing returns the рахунок to вкладено alone', () => {
    const accounts = readScreen(join('(tabs)', 'accounts.tsx'));

    // Behind a confirmation, like «Звірити» — and it removes the row rather than storing a zero.
    expect(accounts).toMatch(/clearValueConfirmation\(row\)/);
    expect(accounts).toMatch(/investmentsRepo\.clear\(a\.id\)/);
    expect(accounts).toMatch(/investmentsRepo\.clear\([\s\S]{0,300}?reload\(\)/);
  });

  it("Scenario: The рахунок's own звірка is untouched", () => {
    const movements = readScreen(join('account', '[id].tsx'));

    // Every unarchived рахунок keeps «Звірити» against a typed фактичний залишок — інвестиційний
    // included. This change scopes away the звірка *of a вартість*, and takes none away.
    expect(movements).toMatch(/reconcileTyped/);
    expect(movements).toMatch(/Звірити/);
    // The фактичний залишок is parsed by `parseActualBalance`, through `reconcileTyped` — the
    // parser this change did not touch, beside the new `parseCurrentValue` it added.
    expect(readFileSync(join(import.meta.dirname, 'account-movements.ts'), 'utf8')).toMatch(
      /parseActualBalance/,
    );
    // And nothing on that screen has learned about a вартість: the звірка compares the фактичний
    // залишок with the розрахунковий баланс and with nothing else.
    expect(movements).not.toMatch(/investmentsRepo|currentValue|поточна вартість/i);
  });
});
