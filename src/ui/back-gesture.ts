/**
 * What the phone's own «назад» does on a section that can have an editor open over its list.
 *
 * The rule is one line and it is the whole of a defect the emulator found on «Ліміти»: with the
 * ліміт editor open, the back gesture left the section entirely — the editor, the half-typed сума
 * and the list all went at once, while «Скасувати» sat under the keyboard. The editor is the last
 * thing the owner opened, so it is the first thing «назад» undoes; a section with nothing open is
 * left, exactly as its own «←» leaves it.
 *
 * It lives here, and not in the screens, because `verify` never runs JSX and never presses a
 * hardware button: this is the only place the rule can be proven. `src/hooks/use-close-on-back.ts`
 * is the subscription that asks it.
 */
export type BackGesture = 'close-editor' | 'leave-screen';

export function backGesture(editorOpen: boolean): BackGesture {
  return editorOpen ? 'close-editor' : 'leave-screen';
}
