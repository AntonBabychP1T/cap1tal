import type { AlertButtonSpec } from './failure-alert';

/**
 * What the phone's own «назад» does on a section that can have an editor open over its list.
 *
 * The rule is one line and it is the whole of a defect the emulator found on «Ліміти»: with the
 * ліміт editor open, the back gesture left the section entirely — the editor, the half-typed сума
 * and the list all went at once, while «Скасувати» sat under the keyboard. The editor is the last
 * thing the owner opened, so it is the first thing «назад» undoes; a section with nothing open is
 * left, exactly as its own «←» leaves it.
 *
 * A form that holds edits asks first (app-shell, "A form with unsaved edits asks before «назад»
 * discards it", design D6): one stray swipe used to throw away everything typed. «Відкинути» then
 * does what the gesture would have done; «Лишитися» does nothing. A form opened and left untouched
 * closes at once, without asking. `isDirty` is asked even with no editor open, because a form that
 * *is* the screen (the entry form, a продавець's screen) leaves by the screen's own back.
 *
 * It lives here, and not in the screens, because `verify` never runs JSX and never presses a
 * hardware button: this is the only place the rule can be proven. `src/hooks/use-close-on-back.ts`
 * is the subscription that asks it.
 */
export type BackGesture = 'ask-first' | 'close-editor' | 'leave-screen';

export function backGesture(editorOpen: boolean, isDirty = false): BackGesture {
  if (isDirty) return 'ask-first';
  return editorOpen ? 'close-editor' : 'leave-screen';
}

export const DISCARD_TITLE = 'Відкинути зміни?';
export const DISCARD_LABEL = 'Відкинути';
export const STAY_LABEL = 'Лишитися';

/** Exactly `Alert.alert`'s first three arguments, in order, ready to be spread. */
export type DiscardDialog = [title: string, message: undefined, buttons: AlertButtonSpec[]];

/**
 * The app's confirm dialog for `'ask-first'`. `discard` is the very closer the gesture would have
 * called, so «Відкинути» and an untouched form's «назад» cannot come apart; «Лишитися» has no
 * handler at all — the form stays open with everything still typed.
 */
export function discardConfirm(discard: () => void): DiscardDialog {
  return [
    DISCARD_TITLE,
    undefined,
    [
      { text: STAY_LABEL, style: 'cancel' },
      { text: DISCARD_LABEL, style: 'destructive', onPress: discard },
    ],
  ];
}

/**
 * The same rule for a back press `useCloseOnBack` cannot hear: a `Sheet` (whose `Modal` takes the
 * press itself, through `onRequestClose`), the репорт sheet, and the crash fallback that has no
 * navigator beneath it. The form inside is open by definition, so the answer is `'ask-first'` or
 * `'close-editor'` — asked of `backGesture`, never decided again here. `ask` is `Alert.alert` in
 * the app; it is passed in so this stays a Node module.
 */
export function answerBackPress(
  isDirty: boolean,
  close: () => void,
  ask: (dialog: DiscardDialog) => void,
): void {
  if (backGesture(true, isDirty) === 'ask-first') {
    ask(discardConfirm(close));
    return;
  }
  close();
}
