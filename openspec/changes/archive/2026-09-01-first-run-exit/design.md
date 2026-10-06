# first-run-exit — design

> Ported on 2026-10-06 from `claude/distracted-banach-8b67f6` (9375826). The behaviour had
> already reached main under other names: the rule is `leaveOnboarding({ canGoBack })` →
> `'back' | 'to-app'` (the branch's `setupExit` → `'pop' | 'to-app'`), and main also answers the
> phone's back press on the launch-opened checklist with `useCloseOnBack(!router.canGoBack(),
> toApp)`, which the branch had left as a non-goal. The names below follow main.

## D1. The rule is «is there something underneath», not «how did I get here»

The obvious fix is to remember how the checklist was reached — a route param saying «I was
pushed» versus «I was the landing» — and branch on it. It is the wrong question, and it goes
stale: the checklist opened by the launch is also the checklist the Saldo import returns to, and
a flag set at launch survives a stack that has changed shape underneath it several times since.

The question that cannot go stale is asked of the navigator at the moment the arrow is tapped:
is there a view underneath this one? `router.canGoBack()` answers it, and it answers it correctly
in every state the screen can be in — pushed from Налаштування (yes, pop), opened by the launch
(no, go to Головний), and returned to from `/manage/saldo-import` after the launch opened it (no,
go to Головний, which is the state the emulator got stuck in).

No new storage, no new route param, no new module-level flag.

## D2. The decision is a pure function, the navigation is not

`verify` never runs JSX and never taps an arrow, so the branch cannot be proven where it is
written. It is therefore split the way `src/ui/back-gesture.ts` splits the hardware back button —
which exists for exactly this reason, and for a defect the emulator found the same way:

- `leaveOnboarding(input: { canGoBack: boolean }): 'back' | 'to-app'` in `src/ui/onboarding.ts` — pure, two answers,
  `'back'` and `'to-app'`. This is what the spec's requirement is tested against.
- The screen asks it with `router.canGoBack()` and performs the answer: `router.back()` or
  `router.replace('/')`.

`src/ui/onboarding-screen.test.ts` then holds the wiring structurally — the heading's `back` must
be the handler that asks the rule, and the screen may not go back unconditionally — the same
weaker-but-real guard `back-gesture.test.ts` puts on «Ліміти» and «Цілі». It catches the change
that would actually bring this defect back: someone writing `back={() => router.back()}` again.

## D3. «До застосунку» is left alone, and stays a different thing

The button at the end of the list already does `router.replace('/')` unconditionally, and it must
keep doing that: from Налаштування it means «go to the app», while «←» there means «back to
Налаштування». Two controls that mean different things in the one state where they can differ.
They coincide only on the first run, which is exactly the state where the owner needs either of
them to work.

The destination is the same `'/'` the button already uses, so the two cannot drift to different
screens.

## D4. Leaving does not re-open the checklist

`(tabs)/index.tsx` guards its redirect with a module-level `landedOnSetup`, set before the
`replace` that opened the checklist. So arriving at Головний from the arrow finds that flag
already true and does not bounce back, even though the device may still hold no рахунок and no
транзакція. This change relies on that and adds nothing to it; the spec's «the setup view is not
opened again for the rest of that launch» is the promise it already keeps.
