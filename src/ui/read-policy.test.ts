import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { decideRead, syncEvent, type ReadEvent } from './read-policy';

/**
 * One screen as `useReloadOnFocus` drives it: the state the policy is asked about, updated the way
 * the hook updates it, and the number of storage reads the decisions led to.
 */
function screen(mountedInSight: boolean) {
  let focused = mountedInSight;
  let everFocused = false;
  let stale = false;
  let reads = 0;
  const apply = (event: ReadEvent) => {
    const decision = decideRead({ focused, everFocused, stale, event });
    if (decision === 'read-now') {
      reads += 1;
      stale = false;
    } else if (decision === 'mark-stale') {
      stale = true;
    }
  };
  apply('mount');
  everFocused = mountedInSight;
  return {
    get reads() {
      return reads;
    },
    focus() {
      focused = true;
      apply('focus');
      everFocused = true;
    },
    blur() {
      focused = false;
      apply('blur');
    },
    event(event: ReadEvent) {
      apply(event);
    },
  };
}

describe('the read policy', () => {
  it('no screen judges прогрес inside the tap — every one defers it', () => {
    // `judgeProgressLater()` judges once the screen has settled; `evaluateProgress()` would judge
    // inside the save's own frame (app-speed-pass design D5).
    const offenders = screenFiles(APP).filter((file) => /\bevaluateProgress\(/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('Scenario: Launch reads only the shown tab', () => {
    const home = screen(true);
    home.focus();
    const others = ['month', 'accounts', 'reports', 'settings'].map(() => screen(false));

    expect(home.reads).toBe(1);
    expect(others.map((tab) => tab.reads)).toEqual([0, 0, 0, 0]);
    // An event while they have never been opened reads nothing either.
    for (const tab of others) tab.event('changed');
    expect(others.map((tab) => tab.reads)).toEqual([0, 0, 0, 0]);
  });

  it('Scenario: A tab opened for the first time shows current data', () => {
    const accounts = screen(false);
    // A транзакція is saved on Головний while Рахунки has never been opened…
    accounts.event('changed');
    // …and the first focus reads storage as it is now.
    accounts.focus();
    expect(accounts.reads).toBe(1);
    expect(decideRead({ focused: true, everFocused: false, stale: false, event: 'focus' })).toBe(
      'read-now',
    );
  });

  it('Scenario: A sync finishing behind a pushed screen does not re-read Головний until return', () => {
    const home = screen(true);
    home.focus();
    // The owner opens a транзакція from Головний: Головний goes out of sight.
    home.blur();
    home.event('changed');
    home.event('changed');
    expect(home.reads).toBe(1);

    // Back to Головний: one read, showing the new транзакції.
    home.focus();
    expect(home.reads).toBe(2);
  });

  it('Scenario: A sync starting reads nothing', () => {
    const home = screen(true);
    home.focus();
    const started = syncEvent(true);
    expect(started).toBeUndefined();
    if (started) home.event(started);
    expect(home.reads).toBe(1);

    // Finishing, in sight, reads once.
    const finished = syncEvent(false);
    expect(finished).toBe('changed');
    if (finished) home.event(finished);
    expect(home.reads).toBe(2);
  });

  it('a changed read while focused reads at once, and out of sight waits', () => {
    const month = screen(true);
    month.focus();
    month.event('read-changed');
    expect(month.reads).toBe(2);
    month.blur();
    month.event('read-changed');
    expect(month.reads).toBe(2);
    month.focus();
    expect(month.reads).toBe(3);
  });

  it("the screen's own write reads at once in sight", () => {
    expect(decideRead({ focused: true, everFocused: true, stale: false, event: 'own-write' })).toBe(
      'read-now',
    );
    expect(decideRead({ focused: false, everFocused: true, stale: false, event: 'own-write' })).toBe(
      'mark-stale',
    );
  });

  it('the first focus of a screen that read on mount does not read twice', () => {
    const pushed = screen(true);
    pushed.focus();
    expect(pushed.reads).toBe(1);
  });
});

/** The whole text of the call whose opening paren is at `open` in `source`, parens included. */
function balanced(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error('unbalanced call');
}

/** Every call of `name(` in `source`, each as its full argument text. */
function callsOf(source: string, name: string): string[] {
  const calls: string[] = [];
  let at = source.indexOf(`${name}(`);
  while (at !== -1) {
    calls.push(balanced(source, at + name.length));
    at = source.indexOf(`${name}(`, at + 1);
  }
  return calls;
}

function screenFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return screenFiles(path);
    return entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') ? [path] : [];
  });
}

const APP = fileURLToPath(new URL('../app', import.meta.url));

describe('the screens apply the read policy', () => {
  it('no onSyncState handler reloads directly — a run starting reads nothing', () => {
    const offenders = screenFiles(APP).filter((file) =>
      callsOf(readFileSync(file, 'utf8'), 'onSyncState').some((handler) => /\breload\(/.test(handler)),
    );
    expect(offenders).toEqual([]);
  });

  it('Scenario: Launch reads only the shown tab', () => {
    // The four tabs Android builds at launch beside Головний each hold a placeholder until they are
    // first opened, and read storage nowhere but in the read `useReloadOnFocus` defers.
    for (const tab of ['month', 'accounts', 'reports', 'settings']) {
      const source = readFileSync(join(APP, '(tabs)', `${tab}.tsx`), 'utf8');
      const deferred = callsOf(source, 'useReloadOnFocus');
      expect(deferred, tab).toHaveLength(1);
      expect(deferred[0], tab).toMatch(/whileUnseen:/);

      // What is left once the deferred read and every callback (run on a tap, never while
      // drawing) are taken out must not read storage.
      let rendering = source.slice(source.indexOf('export default function'));
      for (const call of [...deferred, ...callsOf(rendering, 'useCallback')]) {
        rendering = rendering.replace(call, '()');
      }
      expect(rendering.match(/\b\w*(Repo|State)\.\w+\(|\bunseenAchievementsData\(/g), tab).toBeNull();
    }
    // Головний is the tab the app opens on, so it reads as it is built.
    const home = readFileSync(join(APP, '(tabs)', 'index.tsx'), 'utf8');
    expect(callsOf(home, 'useReloadOnFocus')[0]).not.toMatch(/whileUnseen:/);
  });
});
