import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ADD_APP_ACTION } from './notification-settings';

/**
 * Three facts about this feature live in JSX that `verify` never runs: *when* the queue is
 * drained, *when* the access state is re-read, and that Головний shows no чернетки surface when
 * none is pending. Each is a SHALL in the delta spec and none of them can be reached by executing
 * a pure module, so they are held structurally instead — the same technique, and the same reason,
 * as `onboarding-screen.test.ts`.
 *
 * Reading the source is weaker than running it. What it does catch is the change that would
 * actually break these: someone dropping the foreground listener because the focus effect "looks
 * like enough", or growing an empty state under the чернетки block. It catches it in `verify`
 * rather than on a device.
 *
 * It lives here and not next to the screens because expo-router bundles every file under
 * `src/app/` through `require.context`: a test file there ships into the app and its `node:fs`
 * import brings the bundle down.
 */

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const layout = source('../app/_layout.tsx');
const foreground = source('../hooks/use-on-foreground.ts');
const section = source('../app/manage/notifications.tsx');
const main = source('../app/(tabs)/index.tsx');

describe('the drain runs when the app runs', () => {
  it('Scenario: A notification captured while the app was closed becomes a чернетка', () => {
    // Two triggers, each present, so dropping either one fails here instead of silently halving
    // the requirement's WHEN. On launch — an app that was not running collects what waited for it,
    // among the launch chores once the first screen is drawn (app-speed-pass design D5)…
    expect(layout).toMatch(/startLaunchChores\(\{[\s\S]*?run: collect \}/);
    expect([...layout.matchAll(/void collect\(\);/g)]).toHaveLength(1);
    // …and on every return to the foreground, which is the other half of it. The listener itself
    // is `src/hooks/use-on-foreground.ts`, written once for both of this feature's call sites.
    expect(layout).toContain('useOnForeground(');
    expect(foreground).toMatch(/AppState\.addEventListener\('change'/);
    expect(foreground).toMatch(/state === 'active'/);
    // Gated on the permission: no access, no collection. The answer is named now — the same
    // value also decides whether the silence is announced (reminders-and-alerts design D5a) —
    // but the gate itself is unchanged: anything other than granted returns before the drain.
    expect(layout).toMatch(/const access = await notificationAccess\.state\(\);/);
    expect(layout).toMatch(/if \(access !== 'granted'\) \{[\s\S]*?return;\s*\}\s*const report = await drainCaptures/);
  });

  it('The effect holds no logic of its own — it calls the tested driver', () => {
    // Everything the loop decides is `drainCaptures`, proven in notification-drain.test.ts. The
    // shell must not grow a second copy of any of it.
    expect(layout).toContain('drainCaptures({');
    for (const engineCall of ['processCapture', 'fingerprintOf', 'confirmDraft']) {
      expect(layout).not.toContain(engineCall);
    }
  });
});

/**
 * The affordance that opens the add form. On the emulator it read «Додати застосунок» before the
 * form had ever been opened and «Додати» after it had been opened and cancelled — and stayed
 * «Додати» on every later visit to the screen. The cause is `Action`'s label losing its last word
 * to Android's re-measure once the keyboard had resized the window, the very defect `RowAction`
 * already guards against; the label is now one exported constant and `Action` is held to one line.
 */
describe('the affordance that opens the add form says one thing', () => {
  it('Scenario: The label of the add affordance does not change', () => {
    // One wording, in one place, drawn where the form is opened and nowhere else.
    expect(ADD_APP_ACTION).toBe('Додати застосунок');
    expect(section).toContain('title={ADD_APP_ACTION}');
    expect([...section.matchAll(/setAdding\(true\)/g)]).toHaveLength(1);
    expect(section).not.toMatch(/title="Додати/);

    // And it cannot come back a word short: `Action` says its label is one line, so Android's
    // re-measure after a window resize has nothing to drop.
    const form = source('../components/form.tsx');
    const action = form.slice(
      form.indexOf('export function Action('),
      form.indexOf('export function RowAction('),
    );
    expect(action).toContain('numberOfLines={1}');
    // And non-lossy: a title too long for one line at a large system font shrinks rather than
    // losing its last word, which is the defect this whole guard is about.
    expect(action).toContain('adjustsFontSizeToFit');
  });
});

describe('the «Сповіщення банків» section reads the device, never a memory', () => {
  it('Scenario: Granting flips the section to granted', () => {
    // Granting happens on Android's own screen, which is another app: this screen never loses
    // navigation focus while the owner is there, so the focus effect alone would still be showing
    // «не надано» on their return. The foreground transition is what actually happens.
    expect(section).toContain('useFocusEffect(readAccess)');
    expect(section).toContain('useOnForeground(readAccess)');
  });

  it('Scenario: Revoked access is reported as denied again', () => {
    // Asked of the port every time, and nothing else ever writes `access` — twice in the file: its
    // declaration, and the one `.then(setAccess)`. A remembered answer is exactly what would
    // disagree with a permission switched off outside the app.
    expect(section).toContain('notificationAccess.state().then(setAccess)');
    expect([...section.matchAll(/setAccess/g)]).toHaveLength(2);
  });

  it('Scenario: An archived рахунок is not offered', () => {
    // The one picker rule, from `account-choices.ts` — not a fourth copy of "the unarchived ones".
    expect(section).toContain('accountChoicesFor(stored.accounts, undefined)');
  });

  it('Every watch mutation goes through the capture port, never straight to storage', () => {
    // The screen calls the tested module; the module is what talks to the port first and stores
    // only on `ok`. A direct `notificationsRepo.addWatch` here would be the drift design D4 exists
    // to prevent.
    expect(section).toContain('addWatchedApp(');
    expect(section).toContain('removeWatchedApp(');
    expect(section).not.toMatch(/notificationsRepo\.(addWatch|removeWatch)\(/);
  });
});

describe('Головний names the чернетки; the queue shows and answers them', () => {
  const queue = readFileSync(new URL('../app/answers.tsx', import.meta.url), 'utf8');

  it('A drained чернетка reaches the screen in the session that captured it', () => {
    // The drain runs in the shell, on opening and on foreground — neither is a navigation focus,
    // so `useReloadOnFocus` alone would leave the чернетка uncounted until the owner left the tab
    // and came back. `reloadWhenSeen` since app-speed-pass: at once in sight, on the next focus otherwise.
    expect(main).toContain('onCapturesStored(reloadWhenSeen)');
  });

  it('Scenario: No pending чернетки, no surface', () => {
    // Головний renders no draft body at all; the rail row names чернетки only while some wait
    // (`queueRow`, proven in home-screen.test.ts), and the queue draws its «Чернетки» group only
    // when it holds an entry — `answerQueue` drops an empty group (answer-queue.test.ts).
    expect(main).not.toContain('DraftRow');
    expect(main).not.toContain('draftLines(');
    expect(queue).toMatch(/group\.kind === 'drafts' \? \(/);
    expect(queue).toContain('queue.groups.map((group) =>');
  });

  it('Scenario: Dismissing a чернетка is confirmed first', () => {
    // The gesture deletion uses everywhere else: the call sits inside the Alert's own button.
    const dismiss = queue.slice(queue.indexOf('const dismissDraftLine'));
    const handler = dismiss.slice(0, dismiss.indexOf('const monthChoices'));
    expect(handler).toContain('Alert.alert(');
    expect(handler).toContain('dismissConfirmation(line)');
    expect(handler.indexOf('Alert.alert(')).toBeLessThan(handler.indexOf('dismissPendingDraft('));
  });

  it('Confirming and dismissing decide nothing here', () => {
    // Both answers are the tested module's; the screen may not reach past it into the engine or
    // write a транзакція of its own from a чернетка.
    expect(queue).toContain('confirmPendingDraft(');
    expect(queue).toContain('dismissPendingDraft(');
    for (const screen of [main, queue]) {
      for (const engineCall of ['confirmDraft(', 'dismissDraft(', 'processCapture(']) {
        expect(screen).not.toContain(engineCall);
      }
    }
  });
});
