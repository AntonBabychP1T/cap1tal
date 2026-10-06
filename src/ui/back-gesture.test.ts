import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  backGesture,
  answerBackPress,
  discardConfirm,
  DISCARD_LABEL,
  DISCARD_TITLE,
  STAY_LABEL,
} from './back-gesture';
import { EMPTY_RULE_DRAFT } from './list-management';
import { sameFields } from './same-fields';

describe('backGesture', () => {
  it('Scenario: The back gesture closes an open ліміт editor', () => {
    // Typed "2500": the editor asks first, and «Відкинути» is what closes it.
    expect(backGesture(true, true)).toBe('ask-first');
    // Untouched, it closes at once.
    expect(backGesture(true)).toBe('close-editor');
    expect(backGesture(true, false)).toBe('close-editor');
  });

  it('Scenario: The back gesture leaves the section when no editor is open', () => {
    expect(backGesture(false)).toBe('leave-screen');
    expect(backGesture(false, false)).toBe('leave-screen');
  });

  it('a form left by the screen\'s own back asks first when it holds edits', () => {
    // The entry form and the other screen-wide forms (design D6) register with no editor "open"
    // over a list: the question still comes first, and «Відкинути» then leaves.
    expect(backGesture(false, true)).toBe('ask-first');
  });
});

/**
 * app-shell, "A form with unsaved edits asks before «назад» discards it" — on «Нове правило», the
 * form the requirement's scenarios name. The hook asks `backGesture` with
 * `!sameFields(draft, opened)`; this is that question asked in Node.
 */
describe('«Відкинути зміни?»', () => {
  it('Scenario: An edited form asks first', () => {
    const opened = { ...EMPTY_RULE_DRAFT };
    const typed = { ...opened, merchant: 'zzqa' };
    expect(backGesture(true, !sameFields(typed, opened))).toBe('ask-first');

    let closed = 0;
    const [title, message, buttons] = discardConfirm(() => closed++);
    expect(title).toBe('Відкинути зміни?');
    expect(title).toBe(DISCARD_TITLE);
    expect(message).toBeUndefined();
    expect(buttons.map((b) => b.text)).toEqual(['Лишитися', 'Відкинути']);

    // «Лишитися» does nothing at all: the form stays open with «zzqa» in it, nothing is stored.
    const stay = buttons.find((b) => b.text === STAY_LABEL)!;
    expect(stay.style).toBe('cancel');
    expect(stay.onPress).toBeUndefined();
    expect(closed).toBe(0);
    expect(typed.merchant).toBe('zzqa');

    // «Відкинути» closes the form exactly as the gesture would have, through the same closer.
    const discard = buttons.find((b) => b.text === DISCARD_LABEL)!;
    expect(discard.style).toBe('destructive');
    discard.onPress!();
    expect(closed).toBe(1);
  });

  it('Scenario: An untouched form closes at once', () => {
    const opened = { ...EMPTY_RULE_DRAFT };
    expect(backGesture(true, !sameFields({ ...opened }, opened))).toBe('close-editor');
  });
});

/**
 * A sheet is a `Modal`, and a `Modal` takes the phone's «назад» itself (`onRequestClose`) — the
 * hook's `BackHandler` never hears it. The naming form and the репорт sheet answer it through
 * `answerBackPress`, which asks `backGesture` exactly as the hook does.
 */
describe('answerBackPress', () => {
  it('Scenario: An edited form asks first — a sheet asks «Відкинути зміни?» and closes only on «Відкинути»', () => {
    let closed = 0;
    const asked: unknown[] = [];
    answerBackPress(true, () => closed++, (dialog) => asked.push(dialog));
    expect(closed).toBe(0);
    expect(asked).toHaveLength(1);
    const [title, , buttons] = asked[0] as ReturnType<typeof discardConfirm>;
    expect(title).toBe(DISCARD_TITLE);
    expect(buttons.find((b) => b.text === STAY_LABEL)!.onPress).toBeUndefined();
    buttons.find((b) => b.text === DISCARD_LABEL)!.onPress!();
    expect(closed).toBe(1);
  });

  it('Scenario: An untouched form closes at once — a sheet closes with no question', () => {
    let closed = 0;
    const asked: unknown[] = [];
    answerBackPress(false, () => closed++, (dialog) => asked.push(dialog));
    expect(closed).toBe(1);
    expect(asked).toEqual([]);
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
const hook = read('../hooks/use-close-on-back.ts');
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
function asksTheRule(
  source: string,
  open: string,
  close: string,
  cancel?: string,
  dirty?: string,
) {
  expect(source, 'the hook is not imported').toContain(
    "import { useCloseOnBack } from '@/hooks/use-close-on-back';",
  );
  // Called with "is something open", the closer and — for a form — "does it hold edits", in that
  // order.
  expect(source, 'the hook is not called').toContain(
    `useCloseOnBack(${open}, ${close}${dirty === undefined ? '' : `, ${dirty}`})`,
  );
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
  it('the hook asks first, and «Відкинути» closes through the screen\'s own closer', () => {
    expect(hook).toContain('isDirty = false');
    expect(hook).toContain('backGesture(editorOpen, isDirty)');
    expect(hook).toContain("case 'ask-first':");
    expect(hook).toContain('Alert.alert(...discardConfirm(close))');
  });

  it('Scenario: The back gesture closes an open ліміт editor', () => {
    asksTheRule(limits, 'editing !== undefined', 'closeEditor', 'Скасувати', 'dirty');
    expect(limits).toContain(
      'const dirty = editing !== undefined && !sameFields(editing.draft, editing.opened);',
    );
  });

  it('Scenario: The back gesture closes an open ціль form', () => {
    asksTheRule(goals, 'draft !== undefined', 'closeForm', 'Скасувати', 'dirty');
    expect(goals).toContain('!sameFields(draft.fields, draft.opened)');
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

  it('app-shell — Scenario: An edited form asks first — the entry form and the editing of a транзакція', () => {
    // Each form is the whole screen, so it registers with nothing "open" and leaves through
    // `router.back()` on «Відкинути». Registered after the picker's hook, and only while no picker
    // is open, so «назад» still closes an open list first and asks nothing.
    for (const screen of [entryScreen, editScreen]) {
      asksTheRule(screen, 'false', 'leave', undefined, 'open === undefined && dirty');
      expect(screen).toContain('const leave = useCallback(() => router.back(), [router]);');
      expect(screen.indexOf('useCloseOnBack(false, leave')).toBeGreaterThan(
        screen.indexOf('useCloseOnBack(open !== undefined, closePicker)'),
      );
    }
    expect(entryScreen).toContain('const dirty = entryHoldsEdits(fields, opened);');
    expect(editScreen).toContain('const dirty = entryHoldsEdits(form, opened);');
  });
});
