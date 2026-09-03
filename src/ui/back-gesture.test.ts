import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { backGesture } from './back-gesture';

describe('backGesture', () => {
  it('Scenario: The back gesture closes an open ліміт editor', () => {
    expect(backGesture(true)).toBe('close-editor');
  });

  it('Scenario: The back gesture leaves the section when no editor is open', () => {
    expect(backGesture(false)).toBe('leave-screen');
  });
});

/**
 * The subscription itself is React Native and `verify` never presses a hardware button, so the
 * wiring is held structurally: both sections must ask the hook, and neither may answer the back
 * press on its own. Reading the source is weaker than executing it, but it catches the change that
 * would actually bring the defect back — a section that stops asking — and it catches it in
 * `verify` rather than on a device. The pattern and the reason it lives in `src/ui/` are
 * `onboarding-screen.test.ts`'s.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const limits = read('../app/manage/limits.tsx');
const goals = read('../app/manage/goals.tsx');
const entryScreen = read('../app/transaction/new.tsx');
const editScreen = read('../app/transaction/[id].tsx');
const home = read('../app/(tabs)/index.tsx');

/**
 * What a screen must show to be asking the rule rather than answering the press itself.
 *
 * `open` is the whole condition, written as the screen writes it: a section with an editor asks
 * `editing !== undefined`, a screen with a picker asks a boolean. Passing the condition rather
 * than building it here is what let the pickers join this census instead of starting a second,
 * weaker one somewhere else.
 */
function asksTheRule(source: string, open: string, close: string, cancel?: string) {
  expect(source, 'the hook is not imported').toContain(
    "import { useCloseOnBack } from '@/hooks/use-close-on-back';",
  );
  // Called with "is something open" and the closer, in that order.
  expect(source, 'the hook is not called').toContain(`useCloseOnBack(${open}, ${close})`);
  if (cancel !== undefined) {
    // «Скасувати» closes through the very same function, so the button and the gesture can never
    // come apart.
    expect(source, '«Скасувати» closes some other way').toContain(
      `title="${cancel}" onPress={${close}}`,
    );
  }
  expect(source, 'the screen answers the back press itself').not.toContain('BackHandler');
}

describe('the screens ask the rule rather than deciding themselves', () => {
  it('Scenario: The back gesture closes an open ліміт editor', () => {
    asksTheRule(limits, 'editing !== undefined', 'closeEditor', 'Скасувати');
  });

  it('Scenario: The back gesture closes an open ціль form', () => {
    asksTheRule(goals, 'draft !== undefined', 'closeForm', 'Скасувати');
  });

  it('Scenario: «Назад» closes the full list before the screen', () => {
    // The three screens a picker's full list can open on. «Згорнути» is the picker's own, inside
    // `Picker`, so there is no per-screen cancel button to tie to the gesture here — what ties
    // them is that both go through the same `onExpandedChange(false)`, pinned in
    // `shortlist.test.ts`.
    asksTheRule(entryScreen, 'open !== undefined', 'closePicker');
    asksTheRule(editScreen, 'open !== undefined', 'closePicker');
    // Головний is the tab where an unanswered back press exits the app, so its condition is both
    // halves: a line is categorising *and* its full list is open.
    asksTheRule(home, 'categorising !== undefined && categoryListOpen', 'closeCategoryList');
  });
});
