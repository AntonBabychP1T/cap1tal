import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The "everywhere" and "never" rules of the motion capability, proven by reading the screens and
 * components as text (app-motion-pass design D11): components are not rendered under `verify`, so
 * what can be proven without a device is where each wrapper is used and what nothing may do. What
 * the movement looks like is the emulator's to show.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** Every `.tsx` the app draws with, keyed by its path under `src/`. */
const TSX = new Map(
  [...files(join(SRC, 'app')), ...files(join(SRC, 'components'))]
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => [relative(SRC, file), readFileSync(file, 'utf8')] as const),
);

const read = (path: string) => {
  const source = TSX.get(path) ?? readFileSync(join(SRC, path), 'utf8');
  return source;
};

/**
 * The files that may draw a `Pressable` of their own (design D3): `Tap` itself, the sheet's scrim
 * (its feedback is the sheet closing), the bug-report sheet no change owns yet, and the web tab bar.
 */
const PRESSABLE_ALLOWED = new Set([
  'components/motion.tsx',
  'components/sheet.tsx',
  'components/bug-report-here.tsx',
  'components/app-tabs.web.tsx',
]);

describe('press feedback', () => {
  it('Scenario: No tappable element is silent', () => {
    const offenders = [...TSX]
      .filter(([path, source]) => !PRESSABLE_ALLOWED.has(path) && /\bPressable\b/.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
    // Nor an older touchable that would bypass `Tap` the same way.
    const touchables = [...TSX]
      .filter(([, source]) => /\bTouchable(Opacity|Highlight|WithoutFeedback)\b/.test(source))
      .map(([path]) => path);
    expect(touchables).toEqual([]);
  });

  it('Scenario: A row answers the touch', () => {
    // The feed row, the manage lists and the shared row are all `Tap`s, which draw the ripple from
    // the touch point on Android and the pressed tone elsewhere — both before the finger lifts.
    for (const path of [
      'components/transaction-row.tsx',
      'components/manage-list.tsx',
      'components/surfaces.tsx',
    ]) {
      expect(read(path), path).toMatch(/<Tap\b/);
    }
    const motion = read('components/motion.tsx');
    expect(motion).toMatch(/android_ripple=\{inert \? undefined : \{ color: theme\.ripple, foreground: true \}\}/);
    expect(motion).toMatch(/pressed && !inert && Platform\.OS !== 'android' \? styles\.pressedTone/);
  });

  it('Scenario: A disabled button does not answer', () => {
    const motion = read('components/motion.tsx');
    // Disabled — or nothing to do on a press — is inert, and inert drops all three answers.
    expect(motion).toMatch(/Boolean\(props\.disabled\) \|\| \(!props\.onPress && !props\.onLongPress\)/);
    expect(motion.match(/android_ripple=\{inert \? undefined/g)).toHaveLength(2);
    expect(motion.match(/if \(!inert && !reduced\) scale\.set/g)).toHaveLength(2);
    // `disabled` reaches the Pressable, which then sends no press at all.
    expect(motion).toMatch(/<Pressable\s+\{\.\.\.rest\}/);
    expect(motion).toMatch(/<AnimatedPressable\s+\{\.\.\.rest\}/);
  });

  it('presses in only the primary buttons and the add button', () => {
    expect(read('components/form.tsx')).toMatch(/emphasis=\{variant === 'primary'\}/);
    const surfaces = read('components/surfaces.tsx');
    const fab = surfaces.slice(surfaces.indexOf('export function Fab'));
    expect(fab.slice(0, fab.indexOf('</Tap>'))).toMatch(/<Tap\s+emphasis/);
  });
});

describe('screen transitions', () => {
  const layout = read('app/_layout.tsx');

  it('takes every route’s transition from routeTransition', () => {
    expect(layout).toContain('const animation = useRouteAnimation();');
    expect(layout).toMatch(/<Stack screenOptions=\{\{ headerShown: false, animation: animation\(''\) \}\}>/);
    const screens = [...layout.matchAll(/<Stack\.Screen\s+name="([^"]+)"(?:\s+options=\{\{([^}]*)\}\})?/g)];
    expect(screens.length).toBeGreaterThan(20);
    for (const [, name, options] of screens) {
      if (name === '(tabs)') continue;
      expect(options, name).toContain(`animation: animation('${name}')`);
    }
    const motion = read('components/motion.tsx');
    expect(motion).toMatch(/\(route\) => routeTransition\(route, reduced, Platform\.OS\)/);
  });

  it('declares every section route, so none falls back to the navigator’s default', () => {
    const routes = files(join(SRC, 'app', 'manage'))
      .filter((file) => file.endsWith('.tsx') && !file.includes('_layout'))
      .map((file) => relative(join(SRC, 'app'), file).replace(/\.tsx$/, ''));
    for (const route of routes) {
      expect(layout, route).toContain(`name="${route}"`);
    }
  });
});

describe('tabs', () => {
  it('Scenario: Tabs cross-fade', () => {
    for (const tab of ['index', 'month', 'accounts', 'reports', 'settings']) {
      const source = read(`app/(tabs)/${tab}.tsx`);
      const root = source.slice(source.indexOf('export default function'));
      expect(root, tab).toMatch(new RegExp(`<TabFade tab="${tab}">\\s*<\\w+Screen />\\s*</TabFade>`));
    }
    const motion = read('components/motion.tsx');
    const fade = motion.slice(motion.indexOf('export function TabFade'));
    // Within 150 ms, and only as an opacity: nothing slides.
    expect(fade).toContain('withTiming(1, { duration: Motion.fast, easing: enterEasing })');
    expect(fade.slice(0, fade.indexOf('\n}\n'))).not.toMatch(/translate/);
    // Not on the launch tab's first focus, nor on a tab regaining focus from a popped screen.
    expect(fade).toMatch(/if \(lastTab === null \|\| lastTab === tab\) \{\s*opacity\.set\(1\);/);
  });
});

describe('opening, closing, leaving', () => {
  const home = read('app/(tabs)/index.tsx');
  const motion = read('components/motion.tsx');

  it('Scenario: The rail row comes and goes smoothly', () => {
    // The row «Що потребує відповіді» fades in and out of the rail…
    expect(home).toMatch(/\{model\.alerts\.queueRow \? \(\s*<Appear>/);
    expect(home).toMatch(/\{model\.alerts\.failureRow \? \(\s*<Appear>/);
    // …and every widget under it moves to its new place instead of jumping.
    expect(home).toMatch(/return widget \? <Reflow key=\{id\}>\{widget\}<\/Reflow> : null;/);
    // The inline категорія picker comes and goes the same way.
    expect(home).toMatch(/categorising === line\.id \? \(\s*<Appear>\s*<Picker/);
    // Nothing opens in place any more: the чернетки are answered in the queue.
    expect(home).not.toContain('draftsExpanded');
    // Fading in at the standard duration, the neighbours moving over the same 220 ms.
    expect(motion).toContain(
      'enterFade: FadeIn.duration(Motion.standard).easing(enterEasing).reduceMotion(ReduceMotion.System)',
    );
    expect(motion).toMatch(/reflow: LinearTransition\.duration\(Motion\.standard\)/);
    const appear = motion.slice(motion.indexOf('export function Appear'));
    expect(appear.slice(0, appear.indexOf('\n}\n'))).toMatch(
      /entering=\{motion\.enterFade\}\s+exiting=\{motion\.exitFade\}\s+layout=\{motion\.reflow\}/,
    );
  });

  it('Scenario: An answered entry leaves the queue smoothly', () => {
    const queue = read('app/answers.tsx');
    // An answered entry — a «Без категорії» or «Без джерела» record, or a чернетка — fades out
    // while the ones after it close the gap, and every group moves to its new place.
    expect(queue).toMatch(/<ListItem key=\{t\.id\} reflow>\s*<ListRow/);
    expect(queue).toMatch(/<ListItem key=\{line\.id\} reflow>\s*<DraftRow/);
    expect(queue).toMatch(/<Reflow key=\{group\.kind\}>/);
    expect(queue).toMatch(/\{queue\.bank \? \(\s*<Appear>/);
  });

  it('draws what a screen first holds at once', () => {
    const surfaces = read('components/surfaces.tsx');
    expect(surfaces).toContain('<SettleFirst>{children}</SettleFirst>');
    expect(motion).toContain('<LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig>');
  });
});

describe('list rows', () => {
  const surfaces = read('components/surfaces.tsx');
  const listScreen = surfaces.slice(surfaces.indexOf('export function ListScreen'));
  const motion = read('components/motion.tsx');
  const LIST_SCREENS = ['app/transactions.tsx', 'app/account/[id].tsx', 'app/category/[month]/[categoryId].tsx'];

  it('Scenario: A long list appears at once', () => {
    // No row of any list animates in: not on the first draw, not on «Показати ще».
    const item = motion.slice(motion.indexOf('export function ListItem'));
    expect(item.slice(0, item.indexOf('\n}\n'))).not.toContain('entering');
    const list = motion.slice(motion.indexOf('export function MotionList'));
    expect(list.slice(0, list.indexOf('\n}\n'))).not.toContain('entering');
    expect(list).toMatch(/<SettleFirst>\s*<Animated\.FlatList/);
    for (const path of [...LIST_SCREENS, 'components/manage-list.tsx', 'app/manage/rules.tsx']) {
      expect(read(path), path).not.toMatch(/\bentering=/);
    }
  });

  it("Scenario: A removed транзакція's row closes the gap", () => {
    // The рахунок's list — and the other two long lists — are `ListScreen`s…
    for (const path of LIST_SCREENS) expect(read(path), path).toContain('<ListScreen');
    // …whose list moves its rows on a change (`itemLayoutAnimation`) and whose rows fade out.
    expect(listScreen).toContain('<MotionList');
    expect(listScreen).toMatch(/renderItem=\{\(\{ item, index \}\) => \(\s*(\/\/[^\n]*\n\s*)*<ListItem>/);
    expect(motion).toContain('itemLayoutAnimation={motion.reflow}');
    expect(motion).toMatch(/<Animated\.View exiting=\{motion\.exitFade\} layout=\{reflow \? motion\.reflow : undefined\}>/);
    // The two short lists outside a FlatList move their own rows.
    expect(read('components/manage-list.tsx')).toContain('<ListItem key={row.id} reflow>');
    expect(read('app/manage/rules.tsx')).toContain('<ListItem key={line.id} reflow>');
  });
});

describe('progress and figures', () => {
  const motion = read('components/motion.tsx');

  it('draws the ліміт meters and the rings through the fill wrappers', () => {
    const surfaces = read('components/surfaces.tsx');
    const meter = surfaces.slice(surfaces.indexOf('export function Meter'));
    expect(meter.slice(0, meter.indexOf('\n}\n'))).toContain('<FillBar');
    const ring = surfaces.slice(surfaces.indexOf('export function ProgressRing'));
    expect(ring.slice(0, ring.indexOf('\n}\n'))).toContain('<FillRing');
    // One transform or prop, over the emphasis duration, from `fillStart`.
    expect(motion).toMatch(/const FILL_TIMING = \{ duration: Motion\.emphasis/);
    expect(motion).toMatch(/shown\.set\(start === null \? value : withTiming\(value, FILL_TIMING\)\)/);
    expect(motion).toContain('translateX: `${(shown.get() - 1) * 100}%`');
    expect(motion).toContain('strokeDashoffset: circumference * (1 - shown.get())');
  });

  it('Scenario: Only the currency that changed moves', () => {
    // Each figure is keyed by its own text, one per currency: an unchanged сума keeps its key and
    // does not move.
    expect(motion).toMatch(/<Animated\.View key=\{children\} entering=\{motion\.riseIn\} exiting=\{motion\.riseOut\}/);
    expect(read('components/net-worth-widget.tsx')).toMatch(/<ChangingFigure\s+key=\{readout\.currency\}/);
    expect(read('app/(tabs)/index.tsx')).toMatch(
      /model\.status\.spentFigures\.map\(\(figure, i\) => \(\s*<Fragment key=\{figure\.currency\}>/,
    );
  });

  it('The статок changes without counting — every listed сума is a ChangingFigure', () => {
    expect(read('app/(tabs)/accounts.tsx')).toMatch(/<ChangingFigure tabular style=\{styles\.amount\}>\s*\{row\?\.computed \?\? ''\}/);
    expect(read('app/account/[id].tsx')).toMatch(/<ChangingFigure type="subtitle" tabular>\s*\{movements\.balance\}/);
    const month = read('app/(tabs)/month.tsx');
    expect(month).toMatch(/<ChangingFigure key=\{leading\.key\}[^>]*>\s*\{leading\.amount\}/);
    expect(month).toMatch(/row\.key === 'spent' \|\| row\.key === 'left' \? \(\s*<ChangingFigure/);
    expect(read('components/category-widget.tsx')).toMatch(/<ChangingFigure[^>]*>\s*\{centerParts\?\.number \?\? ''\}/);
    // No figure is interpolated anywhere: no animated text, no counting.
    for (const [path, source] of TSX) {
      expect(source, path).not.toMatch(/AnimatedText|useAnimatedProps\(\(\) => \(\{ text/);
    }
  });
});

describe('switching what is shown', () => {
  it('slides a stepped month in from the side of the step, its meters at their values', () => {
    const month = read('app/(tabs)/month.tsx');
    expect(month).toContain('setStep({ direction: stepDirection(shown, month), stepped: true });');
    expect(month).toMatch(
      /<SteppedBody\s+stepKey=\{stored\.month \?\? shown\}\s+direction=\{step\.direction\}\s+stepped=\{step\.stepped\}/,
    );
    const motion = read('components/motion.tsx');
    const body = motion.slice(motion.indexOf('export function SteppedBody'));
    expect(body.slice(0, body.indexOf('\n}\n'))).toMatch(
      /<DrawAtValue value=\{stepped\}>\s*<Animated\.View\s+key=\{stepKey\}\s+entering=\{stepped \? motion\.stepIn\(direction\) : undefined\}/,
    );
    // The meters read the context as their `switched` for the mount only.
    expect(motion).toContain('switched: firstDraw && mountedBySwitch,');
  });
});

describe('the bottom sheet', () => {
  const sheet = read('components/sheet.tsx');

  it('rises over a fading scrim, driven by the phase machine', () => {
    expect(sheet).toContain('const motion = useSheetMotion({ open, onDismiss: onClose, onExited });');
    expect(sheet).toMatch(/visible=\{motion\.visible\}\s+transparent\s+animationType="none"\s+onRequestClose=\{requestClose\}/);
    // The back gesture dismisses through the same `motion.dismiss` — after «Відкинути» when the
    // form inside holds edits (app-shell).
    expect(sheet).toContain('answerBackPress(isDirty, motion.dismiss,');
    expect(sheet).toContain('<MotionView style={[styles.backdrop, motion.scrimStyle]}>');
    expect(sheet).toContain("pointerEvents={motion.interactive ? 'auto' : 'none'}");
    // It keeps showing what it showed while open, all the way out.
    expect(sheet).toContain('const shown = open ? { title, children, footer } : kept;');
    // `sheet.tsx` draws; it times nothing itself.
    expect(sheet).not.toMatch(/from 'react-native-reanimated'/);
  });

  it('Scenario: A choice is stored at once and the screen changes after the sheet leaves', () => {
    const editor = read('app/transaction/[id].tsx');
    const offer = editor.slice(editor.indexOf('<RuleOfferSheet'));
    const props = offer.slice(0, offer.indexOf('/>'));
    expect(props).toContain('onAccept={(merchant) => ruleOffer.accept(merchant)}');
    expect(props).toContain('onDecline={ruleOffer.decline}');
    expect(props).toContain('onExited={() => router.back()}');
    expect(props.match(/router\.back\(\)/g)).toHaveLength(1);
  });
});

describe('busy states', () => {
  it('Scenario: A прогін shows a spinner until it ends', () => {
    // Exactly the three busy lines of design D10, each drawn only under its busy condition.
    const sites = [...TSX]
      .filter(([, source]) => /<ActivityIndicator\b/.test(source))
      .map(([path]) => path)
      .sort();
    expect(sites).toEqual(['app/(tabs)/index.tsx', 'app/manage/drive-backup.tsx', 'app/manage/monobank.tsx']);
    const home = read('app/(tabs)/index.tsx');
    expect(home).toMatch(/\{refreshing \? <ActivityIndicator size="small"[^>]*\/> : null\}/);
    // Only the run «Оновити» started; the gesture keeps RefreshControl's own spinner.
    expect(home).toContain("const setBusy = source === 'gesture' ? setPulling : setRefreshing;");
    expect(home).toMatch(/<RefreshControl\s+refreshing=\{pulling\}/);
    expect(read('app/manage/monobank.tsx')).toMatch(/\{busy \? <ActivityIndicator size="small"[^>]*\/> : null\}/);
    const drive = read('app/manage/drive-backup.tsx');
    const busyCard = drive.slice(drive.indexOf("{step.kind === 'busy' ? ("));
    expect(busyCard.slice(0, busyCard.indexOf(') : null}'))).toContain('<ActivityIndicator size="small"');
    expect(drive.match(/<ActivityIndicator/g)).toHaveLength(1);
  });
});

describe('charts that morph', () => {
  const motion = read('components/motion.tsx');
  const netWorth = read('components/net-worth-widget.tsx');
  const donut = read('components/category-widget.tsx');
  const reports = read('app/(tabs)/reports.tsx');

  it('draws all three charts through the morphing wrappers', () => {
    expect(netWorth).toMatch(/<MorphLine\s+geometry=\{geometry\}/);
    expect(netWorth).not.toMatch(/<Path\b|<Svg\b/);
    expect(donut).toMatch(/<MorphDonut\s+geometry=\{geometry\}/);
    expect(donut).not.toMatch(/<Path\b|<Svg\b/);
    const bar = reports.slice(reports.indexOf('function Bar('));
    expect(bar.slice(0, bar.indexOf('\n}\n'))).toMatch(/<FillColumn\s+size=\{bar\.size\}\s+from=\{from\}/);
    expect(reports).not.toMatch(/height: bar\.size \* CHART_HEIGHT/);
  });

  it('re-keys a chart only when its shapes cannot be matched', () => {
    // The line and the donut: a new `fades` generation only on `kind: 'fade'` (or reduced motion).
    expect(motion.match(/fades: was\.fades \+ 1/g)).toHaveLength(2);
    expect(motion).toMatch(/next\.kind === 'morph'\s+\? \{ target: geometry, shape: next, moves: was\.moves \+ 1, fades: was\.fades \}/);
    expect(motion).toMatch(/next\.kind === 'morph'\s+\? \{ target: geometry, sectors: \[\.\.\.next\.sectors\], moves: was\.moves \+ 1, fades: was\.fades \}/);
    // The bars: a cross-fade generation only on `fade`.
    expect(reports).toContain("historyFades: was.historyFades + (history.kind === 'fade' ? 1 : 0),");
    expect(reports).toContain("categoryFades: was.categoryFades + (category.kind === 'fade' ? 1 : 0),");
    expect(reports).toMatch(/<Swap key=\{charts\.historyFades\} still=\{charts\.historyFades === 0\}/);
  });

  it('moves only the drawn shape: no chart text is animated', () => {
    // Only `d` and a bar's transform are animated props; captions, spans, legends and scales are
    // plain text from the new model.
    const animatedProps = [...motion.matchAll(/useAnimatedProps\(\(\) => (\{[\s\S]*?\}\)|\([\s\S]*?\}\)\))/g)];
    expect(animatedProps.length).toBe(3);
    expect(motion).toContain('d: linePath(lineAt(shape, progress.get()), width, height),');
    expect(motion).toContain("return { d: donutSectorPath(start, end, ring) };");
    for (const source of [netWorth, donut, reports]) {
      expect(source).not.toMatch(/react-native-reanimated/);
    }
  });
});

describe('haptics', () => {
  /** Every `.ts`/`.tsx` of the app outside the tests, keyed by its path under `src/`. */
  const SOURCES = new Map(
    files(SRC)
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .map((file) => [relative(SRC, file), readFileSync(file, 'utf8')] as const),
  );

  /** What each site plays: a literal event, or the rule a computed one comes from. */
  const plays = (source: string): string[] =>
    [...source.matchAll(/haptics\.play\(([^)]*)\)/g)].map(([, argument]) => argument!);

  it('plays only at the design D13 sites, each with the event it names', () => {
    const sites = [...SOURCES]
      .filter(([, source]) => /haptics\.play\(/.test(source))
      .map(([path, source]) => [path, plays(source)] as const);
    expect(Object.fromEntries(sites)).toEqual({
      'app/transaction/new.tsx': ["'stored'", "'refused'"],
      'app/transaction/[id].tsx': ["'stored'", "'refused'", "'removed'"],
      'app/transaction/scan.tsx': ["'scanned'", "'scanned'"],
      'app/account/[id].tsx': ["'merged'"],
      'hooks/use-rule-offer.ts': ["'rule-accepted'"],
      // A категорія and a джерело picked behind the feed's marks; чернетки are answered in the queue.
      'app/(tabs)/index.tsx': ['event', "'stored'", "'stored'"],
      // The queue: a категорія, a джерело, and a confirmed чернетка — each a store.
      'app/answers.tsx': ["'stored'", "'stored'", "'stored'"],
      'app/transactions.tsx': ["'stored'", "'stored'"],
      'app/manage/monobank.tsx': ["'failed'", "'failed'", 'event'],
      'app/manage/drive-backup.tsx': ["'failed'"],
      'app/(tabs)/month.tsx': ['event'],
      'components/form.tsx': ['event', 'event'],
    });
    // Every computed event comes from the pure rule for its kind, never chosen by hand.
    const home = SOURCES.get('app/(tabs)/index.tsx')!;
    expect(home).toContain('const event = syncOutcomeEvent(started.run);');
    expect(SOURCES.get('app/manage/monobank.tsx')).toContain('const event = syncOutcomeEvent(result);');
    expect(SOURCES.get('app/(tabs)/month.tsx')).toContain("const event = choiceEvent(shown, month, 'stepped');");
    const form = SOURCES.get('components/form.tsx')!;
    expect(form).toContain("const event = choiceEvent(picked, true, 'chosen');");
    expect(form).toContain("const event = choiceEvent(props.value, value, 'toggled');");
    // A чернетка plays only once it is confirmed; a refused or dismissed one plays nothing here.
    expect(SOURCES.get('app/answers.tsx')).toContain("if (answer.kind === 'confirmed') haptics.play('stored');");
    // The switch plays after the change it reports, so «Вібрація» off stores before the read.
    expect(form.indexOf('props.onValueChange?.(value);')).toBeLessThan(
      form.indexOf("const event = choiceEvent(props.value, value, 'toggled');"),
    );
  });

  it('plays nothing for a question — the future дата, the переказ, the delete confirmation', () => {
    for (const path of ['app/transaction/new.tsx', 'app/transaction/[id].tsx']) {
      const source = SOURCES.get(path)!;
      // The дата question: its Alert block holds no play.
      const question = source.slice(source.indexOf("if (verdict.kind === 'confirm' && !dateConfirmed) {"));
      expect(question.slice(0, question.indexOf('return;')), path).not.toContain('haptics.play');
      // The refusal plays once, in the catch, which `buildEntry`'s refusal also lands in — on the
      // entry form through `refuse`, which every catch there calls (quick-entry: the переказ
      // question's store can throw outside the attempt).
      const site = source.includes('const refuse = ') ? 'const refuse = ' : '} catch (error) {';
      const refusal = source.slice(source.indexOf(site));
      expect(refusal.slice(0, refusal.indexOf('failureAlert'))).toContain("haptics.play('refused');");
      expect(source.match(/haptics\.play\('refused'\)/g)).toHaveLength(1);
      // The переказ question hands the store over; the store itself is what plays.
      const transfer = source.slice(source.indexOf('askAboutTransfer('));
      expect(transfer.slice(0, transfer.indexOf('return;'))).not.toContain('haptics.play');
    }
    // The delete confirmation plays only in its answer's own handler, after the removal.
    const editor = SOURCES.get('app/transaction/[id].tsx')!;
    const remove = editor.slice(editor.indexOf("Alert.alert('Видалити транзакцію?'"));
    const answer = remove.slice(remove.indexOf("text: 'Видалити'"));
    expect(remove.slice(0, remove.indexOf("text: 'Видалити'"))).not.toContain('haptics.play');
    expect(answer.indexOf('transactionsRepo.remove(original.id);')).toBeLessThan(
      answer.indexOf("haptics.play('removed');"),
    );
  });

  it('Scenario: Background work never vibrates', () => {
    // Walks every import reachable from the bundle's own entry and the background tasks: none
    // reaches the haptics port, its adapter or `expo-haptics`.
    const resolve = (from: string, specifier: string): string | undefined => {
      const base = specifier.startsWith('@/')
        ? join(SRC, specifier.slice(2))
        : specifier.startsWith('.')
          ? join(dirname(from), specifier)
          : undefined;
      if (!base) return undefined;
      return [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find((candidate) =>
        existsSync(candidate) && !statSync(candidate).isDirectory(),
      );
    };
    const reached = new Set<string>();
    const reachedPackages = new Set<string>();
    const visit = (file: string) => {
      if (reached.has(file)) return;
      reached.add(file);
      const source = readFileSync(file, 'utf8');
      for (const [, specifier] of source.matchAll(/(?:from|import)\s+'([^']+)'/g)) {
        const target = resolve(file, specifier!);
        if (target) visit(target);
        else reachedPackages.add(specifier!);
      }
    };
    const ROOT = join(SRC, '..');
    visit(join(ROOT, 'index.ts'));
    for (const task of files(join(SRC, 'platform')).filter((file) => file.endsWith('-task.ts'))) {
      visit(task);
    }
    for (const dir of ['notifications', 'monobank', 'reminders']) {
      for (const file of files(join(SRC, dir)).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))) {
        visit(file);
      }
    }
    const offenders = [...reached]
      .map((file) => relative(SRC, file))
      .filter((path) => /haptics-(ports|device)|platform\/haptics/.test(path));
    expect(offenders).toEqual([]);
    expect([...reachedPackages]).not.toContain('expo-haptics');
    expect(reached.size).toBeGreaterThan(10);
  });

  it('loads expo-haptics only in the adapter, and the adapter only in haptics-ports', () => {
    const importers = (pattern: RegExp) =>
      [...SOURCES].filter(([, source]) => pattern.test(source)).map(([path]) => path);
    expect(importers(/from 'expo-haptics'/)).toEqual(['platform/haptics-device.ts']);
    expect(importers(/haptics-device'/)).toEqual(['hooks/haptics-ports.ts']);
  });
});

describe('nothing moves on its own', () => {
  const motion = read('components/motion.tsx');

  /** Reanimated's animation factories and hooks that start movement — only `motion.tsx` imports them. */
  const FACTORIES =
    /\b(withTiming|withSpring|withDecay|withDelay|withRepeat|withSequence|FadeIn\w*|FadeOut\w*|Slide\w+|Zoom\w+|LinearTransition|Layout|Keyframe|useAnimatedStyle|useAnimatedProps)\b/;

  it('Scenario: No animation loops', () => {
    for (const [path, source] of TSX) {
      expect(source, path).not.toMatch(/withRepeat|repeat\(-1|\bInfinity\b/);
      // React Native's own animation systems would run outside the vocabulary and the UI thread.
      expect(source, path).not.toMatch(/import \{[^}]*\b(LayoutAnimation|Animated)\b[^}]*\} from 'react-native'/);
      expect(source, path).not.toMatch(/\bLayoutAnimation\.(configureNext|create)/);
    }
    // No Reanimated factory outside `motion.tsx`, the launch view (`app-shell`) alone allowlisted.
    const importers = [...TSX]
      .filter(([, source]) => {
        const reanimated = source.match(/import [^;]*? from 'react-native-reanimated';/s)?.[0] ?? '';
        return FACTORIES.test(reanimated);
      })
      .map(([path]) => path)
      .sort();
    expect(importers).toEqual(['components/animated-icon.tsx', 'components/motion.tsx']);
    // The busy spinner is the one thing that turns, and only while its work runs.
    expect(
      [...TSX].filter(([, source]) => /<ActivityIndicator\b/.test(source)).length,
    ).toBe(3);
  });

  it('Scenario: A still screen draws nothing — every movement is one-shot and bounded', () => {
    // Every duration is a vocabulary token, and nothing waits before it starts.
    const durations = [...motion.matchAll(/duration(?:: |\()([^,)}\n]+)/g)].map(([, value]) => value!.trim());
    expect(durations.length).toBeGreaterThan(10);
    for (const value of durations) expect(value).toMatch(/^Motion\.(fast|standard|emphasis)$/);
    expect(motion).not.toMatch(/\bdelay\b|withDelay/);
    // No frame callback or sensor: nothing ticks on a settled screen.
    expect(motion).not.toMatch(/useFrameCallback|useAnimatedSensor|setInterval|requestAnimationFrame/);
    // A timing is started only by a change: every `withTiming`/`withSpring` sits in an effect, a
    // handler or a layout animation — never in a render path that would run again on its own.
    expect(motion).not.toMatch(/useSharedValue\(with/);
  });
});
