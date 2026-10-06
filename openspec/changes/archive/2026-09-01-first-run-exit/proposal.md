# first-run-exit — proposal

> Ported on 2026-10-06 from `claude/distracted-banach-8b67f6` (9375826). The behaviour had
> already reached main under other names: the rule is `leaveOnboarding({ canGoBack })` →
> `'back' | 'to-app'` (the branch's `setupExit` → `'pop' | 'to-app'`), and main also answers the
> phone's back press on the launch-opened checklist with `useCloseOnBack(!router.canGoBack(),
> toApp)`, which the branch had left as a non-goal. The names below follow main.

## Why

«Перші кроки» carries a «←» in its heading, the same one every pushed screen in the app carries,
and on the first run of a fresh device it does nothing at all. Tapping it logs *The action
'GO_BACK' was not handled by any navigator* and leaves the owner exactly where they were.

The reason is the way the checklist is reached. Opened from Налаштування it is pushed over the
tab, so there is a screen underneath and «←» pops back to it. But a device holding no рахунок and
no транзакція opens *on* the checklist — the launch replaces Головний with it, by design
(`first-run-setup`: «A device with nothing on it opens on the setup view») — and then there is
nothing underneath. The heading still shows the arrow, and the arrow is dead.

The emulator found it in the state that matters most: a fresh device, the Saldo import done from
the checklist, «Готово 2/4» on screen, and no way to reach Головний except by killing the app and
launching it again. The checklist is supposed to be the app's first minute; it is instead the
first minute the owner cannot get out of by the gesture the whole app has taught them.

The existing requirement already promises that «leaving it SHALL always be possible without
completing anything». This change makes that promise cover the control the owner actually reaches
for, rather than only the button at the end of the list.

## What Changes

- **The way back off the setup view always leads somewhere.** Where the owner came from another
  view, «←» returns them to it, exactly as today. Where the setup view is what the launch opened,
  «←» takes them to Головний instead of doing nothing.
- **No dead control on the setup view.** The arrow keeps one meaning — leave this screen — and it
  is never inert.

## Non-goals

- **No change to when the setup view opens.** A device with nothing on it still opens on it; a
  device in use still opens on Головний. `firstRun` is untouched.
- **No change to the steps, their state, their actions or the «Готово n/m» count.**
- **No new button and no moved button.** «До застосунку» stays where it is and keeps doing what
  it does; this change is about the arrow beside the title, not about the layout of the list.
- ~~No change to the hardware «назад» button.~~ Superseded on main: with nothing under the
  launch-opened checklist the back press goes to Головний (`useCloseOnBack`) instead of
  closing the app; a pushed checklist still pops the ordinary way.
- **No change to any other screen's «←».** Every other screen carrying one is pushed and has
  something to pop; `ScreenHeader` is not touched.
