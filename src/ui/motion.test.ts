import { describe, expect, it } from 'vitest';

import {
  changedFigures,
  fillStart,
  movementUnderReducedMotion,
  routeTransition,
  SHEET_CLOSED,
  sheetInteractive,
  sheetStep,
  sheetVisible,
  stepDirection,
  type MovementKind,
  type SheetEffect,
  type SheetEvent,
  type SheetState,
} from './motion';

/** Runs events through the sheet machine, collecting every effect in order. */
function run(events: SheetEvent[], from: SheetState = SHEET_CLOSED) {
  let state = from;
  const effects: SheetEffect[] = [];
  for (const event of events) {
    const step = sheetStep(state, event);
    state = step.state;
    effects.push(...step.effects);
  }
  return { state, effects };
}

describe('routeTransition', () => {
  it('Scenario: A pushed screen appears without sliding', () => {
    for (const route of ['transaction/[id]', 'account/[id]', 'transaction/new', 'manage/rules']) {
      for (const os of ['android', 'ios']) {
        expect(routeTransition(route, true, os), `${route} on ${os}`).toBe('fade');
      }
    }
  });

  it('Scenario: The entry form rises', () => {
    for (const route of ['transaction/new', 'transaction/scan']) {
      expect(routeTransition(route, false, 'android')).toBe('slide_from_bottom');
      expect(routeTransition(route, false, 'ios')).toBe('slide_from_bottom');
    }
  });

  it('Scenario: Opening and leaving a рахунок', () => {
    // Enters from the side, and the native stack plays the same transition in reverse on back.
    expect(routeTransition('account/[id]', false, 'android')).toBe('ios_from_right');
    expect(routeTransition('account/[id]', false, 'ios')).toBe('default');
    expect(routeTransition('transaction/[id]', false, 'android')).toBe('ios_from_right');
  });
});

describe('stepDirection', () => {
  it('Scenario: Stepping a month slides from the side of the step', () => {
    expect(stepDirection('2026-10', '2026-09')).toBe('from-left');
    expect(stepDirection('2026-09', '2026-10')).toBe('from-right');
    // Across a year, and a jump home of several months.
    expect(stepDirection('2026-01', '2025-12')).toBe('from-left');
    expect(stepDirection('2025-06', '2026-09')).toBe('from-right');
  });
});

describe('changedFigures', () => {
  const line = (entries: [string, string][]) => new Map(entries);

  it('Scenario: The статок changes without counting', () => {
    // A changed figure swaps whole: the result is which figure is replaced, never a number between.
    expect(changedFigures(line([['UAH', '12 000 грн']]), line([['UAH', '11 500 грн']]))).toEqual([
      'UAH',
    ]);
    // Nothing animates on first mount.
    expect(changedFigures(null, line([['UAH', '11 500 грн']]))).toEqual([]);
  });

  it('Scenario: Only the currency that changed moves', () => {
    const before = line([
      ['UAH', '12 000 грн'],
      ['USD', '$300'],
      ['EUR', '€150'],
    ]);
    const after = line([
      ['UAH', '11 500 грн'],
      ['USD', '$300'],
      ['EUR', '€150'],
    ]);
    expect(changedFigures(before, after)).toEqual(['UAH']);
  });

  it('does not move a currency that arrives or leaves', () => {
    expect(changedFigures(line([['UAH', '1 грн']]), line([['USD', '$1']]))).toEqual([]);
  });
});

describe('fillStart', () => {
  const base = { prev: 40, next: 60, firstDraw: false, switched: false, reduced: false };

  it('Scenario: A meter shows its value at once', () => {
    expect(fillStart({ ...base, reduced: true })).toBeNull();
    expect(fillStart({ ...base, reduced: true, firstDraw: true })).toBeNull();
  });

  it('Scenario: A ліміт meter grows when a витрата is saved', () => {
    expect(fillStart(base)).toBe(40);
  });

  it('Scenario: Returning without a change does not replay', () => {
    expect(fillStart({ ...base, prev: 60 })).toBeNull();
  });

  it('fills once from empty on the first draw', () => {
    expect(fillStart({ ...base, firstDraw: true })).toBe(0);
    expect(fillStart({ ...base, firstDraw: true, next: 0 })).toBeNull();
  });

  it('draws a switched meter at its value', () => {
    expect(fillStart({ ...base, switched: true })).toBeNull();
    expect(fillStart({ ...base, switched: true, firstDraw: true })).toBeNull();
  });
});

describe('movementUnderReducedMotion', () => {
  it('turns every movement into an instant change or a fast cross-fade', () => {
    const kinds: MovementKind[] = [
      'screen',
      'tab',
      'open',
      'leave',
      'reflow',
      'fill',
      'rise',
      'step',
      'morph',
      'press',
      'sheet',
    ];
    for (const kind of kinds) {
      expect(['instant', 'fade-fast']).toContain(movementUnderReducedMotion(kind));
    }
    // What travels or grows lands; what appears still says it changed.
    expect(movementUnderReducedMotion('fill')).toBe('instant');
    expect(movementUnderReducedMotion('press')).toBe('instant');
    expect(movementUnderReducedMotion('morph')).toBe('instant');
    expect(movementUnderReducedMotion('step')).toBe('fade-fast');
  });
});

describe('sheetStep', () => {
  it('opens through opening to open', () => {
    const opened = run(['show', 'shown']);
    expect(opened.state.phase).toBe('open');
    expect(opened.effects).toEqual([]);
    expect(sheetVisible(opened.state)).toBe(true);
    expect(sheetInteractive(opened.state)).toBe(true);
  });

  it('Scenario: Closing a sheet by the scrim', () => {
    const open = run(['show', 'shown']).state;
    // The scrim begins the close: the dismissal is reported at once, while the panel still sinks.
    const closing = sheetStep(open, 'dismiss');
    expect(closing.effects).toEqual(['dismissed']);
    expect(closing.state).toEqual({ phase: 'closing', closedBy: 'sheet' });
    expect(sheetVisible(closing.state)).toBe(true);
    expect(sheetInteractive(closing.state)).toBe(false);
    // The parent clears its state after `onDismiss`: no second close, no second dismissal.
    const cleared = sheetStep(closing.state, 'hide');
    expect(cleared.state).toEqual(closing.state);
    expect(cleared.effects).toEqual([]);
    // A second scrim tap while leaving does nothing either.
    expect(sheetStep(cleared.state, 'dismiss').effects).toEqual([]);
    // `onExited` runs once, when the panel has left.
    const closed = sheetStep(cleared.state, 'hidden');
    expect(closed.state).toEqual(SHEET_CLOSED);
    expect(closed.effects).toEqual(['exited']);
    expect(sheetVisible(closed.state)).toBe(false);
    expect(sheetStep(closed.state, 'hidden').effects).toEqual([]);
  });

  it('Scenario: A choice is stored at once and the screen changes after the sheet leaves', () => {
    // The choice is stored by the parent's own handler; then its `open` goes false.
    const result = run(['show', 'shown', 'hide', 'hidden']);
    expect(result.effects).toEqual(['exited']);
    expect(result.state).toEqual(SHEET_CLOSED);
  });

  it('closes from the middle of opening', () => {
    expect(run(['show', 'dismiss', 'hidden']).effects).toEqual(['dismissed', 'exited']);
    expect(run(['show', 'hide', 'hidden']).effects).toEqual(['exited']);
  });

  it('ignores a close of a closed sheet and a stray opening end', () => {
    expect(run(['hide', 'dismiss', 'shown', 'hidden'])).toEqual({
      state: SHEET_CLOSED,
      effects: [],
    });
  });

  it('goes back up when reopened while closing, abandoning the close', () => {
    const result = run(['show', 'shown', 'hide', 'show']);
    expect(result.state).toEqual({ phase: 'opening', closedBy: null });
    expect(result.effects).toEqual([]);
  });
});
