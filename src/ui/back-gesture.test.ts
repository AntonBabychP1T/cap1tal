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
const limits = readFileSync(new URL('../app/manage/limits.tsx', import.meta.url), 'utf8');
const goals = readFileSync(new URL('../app/manage/goals.tsx', import.meta.url), 'utf8');

/** What a section must show to be asking the rule rather than answering the press itself. */
function asksTheRule(source: string, open: string, close: string) {
  expect(source, 'the hook is not imported').toContain(
    "import { useCloseOnBack } from '@/hooks/use-close-on-back';",
  );
  // Called with "is something open" and the closer, in that order.
  expect(source, 'the hook is not called').toContain(`useCloseOnBack(${open} !== undefined, ${close})`);
  // «Скасувати» closes through the very same function, so the button and the gesture can never
  // come apart.
  expect(source, '«Скасувати» closes some other way').toContain(
    `title="Скасувати" onPress={${close}}`,
  );
  expect(source, 'the section answers the back press itself').not.toContain('BackHandler');
}

describe('the sections ask the rule rather than deciding themselves', () => {
  it('Scenario: The back gesture closes an open ліміт editor', () => {
    asksTheRule(limits, 'editing', 'closeEditor');
  });

  it('Scenario: The back gesture closes an open ціль form', () => {
    asksTheRule(goals, 'draft', 'closeForm');
  });
});
