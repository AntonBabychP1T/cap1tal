## Why

The owner had the whole app redrawn in Claude Design («cap1tal Redesign.dc.html»): ten screens plus
the tab bar, in fourteen artboards. Ten of them are chosen and will be implemented, but every one of
them rests on the same handful of things — a darker card on a visible edge, one type ladder, a stroke
icon on every row, a ring, a meter, a bottom sheet. Landing those ten screens one at a time would mint
ten private copies of that vocabulary and leave the other twenty-four screens on the old one.

So this change is the foundation and nothing else: it moves the shared surfaces every screen already
imports, and no screen's own layout. It is the wave the other nine depend on, and it is the only wave
that touches all 34 screens at once — which is also why it must land alone, before any screen redesign,
rather than riding inside the first one.

It serves the vision's second question («скільки я ще можу витратити») only indirectly: no number this
change touches changes value. Its claim is legibility, not arithmetic.

## What Changes

- **Tokens retargeted.** `backgroundElement` #1A1714 → #0F0D0B, `cardEdge` #2F2A23 → #221E19,
  `border` #2B2721 → #1E1A15. The order the three already stand in is kept — the edge stays a step
  lighter than the rule inside — and all three simply darken with the card. The card stops being a
  lighter patch on the page and becomes a black shape held by its edge, which is the one move every
  artboard makes.
- **Two token roles added**, each with a light counterpart: `backgroundInset` (a surface set into a
  card) and `textFaint` (one step below `textMuted`: chevrons and the quietest marks). Two more that
  the artboards use — a positive tint and a louder neutral fill — are deliberately left out: each is
  drawn by exactly one artboard, so each belongs to the screen change that first needs it.
- **`Radius` gains `tile` 10, `field` 14, `hero` 18**; `card` 16 stays. **`Spacing` gains `oneHalf` 6
  and `twoHalf` 12** — the artboards use 5–14 for gaps and every one of them snaps to these.
- **A type ladder** on `ThemedText`: `title` is **retargeted** 40/44 → 44/50 and its tracking −1 →
  −1.5 — it already means "the one number a screen leads with", so no `display` role is minted — and
  seven roles are added beside it: `hero`, `screenTitle`, `rowTitle`, `rowAmount`, `caption`,
  `captionBold`, `note`. `overline` is untouched; it already matches every section heading in every
  artboard exactly. (An eighth, `tabLabel`, was written and then removed: the native bar takes a
  size as a number on `labelStyle`, never a `ThemedText`, so the role had no possible caller.)
- **The typeface does not change.** The artboards are set in Spline Sans, which ships `latin` and
  `latin-ext` only and has no Cyrillic — the whole interface is Ukrainian, so adopting it would render
  the Ukrainian in the system face and the numerals and Latin category names in Spline Sans. Only the
  metrics move: sizes, weights, tracking, tabular figures.
- **Stroke icons.** `react-native-svg` is added; the glyph table lives as data in `src/ui/icons.ts`
  where the gate can read it, and `src/components/icon.tsx` is a thin renderer over it. The ten
  chosen artboards draw **51** distinct glyphs, but 36 of those appear on exactly one artboard each —
  so the foundation ships only the **15** that two or more screens need, and each screen change
  appends its own. **BREAKING for the build, not for behaviour**: a new native dependency means a
  fresh development build; `verify` never compiles native code, so nothing in the gate can prove this
  one.
- **Shared components**, extending what exists rather than adding files: `IconRow`, `IconTile`,
  `StatTile`, `MeterRow`, `ProgressRing`, `HeroCard`, `RoundIconButton`, `NoteBlock`; `SectionLabel`
  gains a leading icon and an inline count; `Screen` gains a pinned-footer slot; **`Chevron` becomes
  the `chevronRight` glyph in `textFaint`** instead of the «›» character in `textMuted` — the one
  component change here that is visible on screens this change does not otherwise touch, since eight
  rows across Головний and Звіти already draw it. That is the point: one edit carries the redesign
  to all eight rather than minting a second chevron beside them. `form.tsx`'s private
  `Chip` is exported and extended and gains a `SearchBar` sibling; `src/components/sheet.tsx` adds the
  reusable bottom sheet the later screens open. (`Radius.sheet` is not new to use — the аркуш репорту
  already draws it by hand; that one is deliberately left alone here.)
- **The tab set becomes data.** `src/ui/tabs.ts` holds the five tabs, their order and their labels as
  pure TypeScript that `verify` tests; both `app-tabs.tsx` and `app-tabs.web.tsx` render from it. This
  fixes a live defect — the web bar renders four tabs and omits «Звіти», against `reports-screen`'s
  requirement that it sits between «Рахунки» and «Налаштування».
- **The Material indicator pill is dropped** from the tab bar. `NativeTabs` is kept; the bar is not
  rewritten. The artboards also mark the current tab with the accent, and that half was implemented
  and then **taken back out on the owner's decision**: `qa-sweep-2026-09` — implemented and
  smoke-tested, its delta `## ADDED` — says the accent shall not appear in the tab bar, because it
  is the app's «this is the action» colour and spending it on navigation leaves it meaning nothing.
  The mark stays `text` against `textMuted`, on both bars. That is the fourth deviation from the
  artboards in this change, and the only one where an artboard was overruled by a live requirement
  rather than by a constraint the artboards could not have known about.
- **A constraint the artboard does not ask for, added deliberately.** The artboards mark the current
  tab by colour alone. The app-shell delta refuses that: some signal which is not a colour must also
  separate the marked tab, so an owner who cannot tell the two greys apart still knows where they
  are. The marked label is therefore drawn at w700 against w600, and the delta makes that binding
  for every later wave. It is the third deviation from the artboards, after the typeface and the
  deferred rename, and unlike those two it was not asked for — so it is stated here.
  **What the emulator then corrected.** The weight was added believing the dropped indicator pill
  was the bar's only non-colour signal. It was not: Android draws the label of the open tab only,
  so exactly one tab carries a word — presence, not colour, and it was there before this change.
  Dropping the pill was never the risk it was written up as, and the w700 is invisible on Android
  because two labels are never on screen to compare. It is kept because it *is* the signal on the
  web bar, which labels all five, and on any profile that does the same. Recorded because a claim
  that survived into the shipped artifacts unchecked is worth more as a correction than as a tidy
  rationale.
- **`bug-report-here.tsx` stops painting tokens directly.** It reads `theme.backgroundElement` and
  `theme.border` by hand, and the маркер репорту is mounted above all 34 screens — after the retarget it
  would be #0F0D0B on #0F0D0B cards and vanish.

**Non-goals.** No screen under `src/app/` is **relaid out**. Five files there are touched, and every
edit is a token role swapped for the one that survives the retone — never a layout: `_layout.tsx`
(React Navigation's `border`), `ai-analysis.tsx`, `manage/reminders.tsx` and
`manage/bug-reports/index.tsx` (four `Switch` off-tracks), and `(tabs)/accounts.tsx` (the «+» gains
the `cardEdge` hairline every surface on the page now needs, and the screen gains a `useTheme` to
read it). `(tabs)/_layout.tsx` turned out not to need touching at all — the tab bar lives in
`components/app-tabs*.tsx`. No number the app displays changes value, wording or rounding. The
«Налаштування» → «Ще» rename is **not** here: its reason is artboard 1l, which turns that tab into a
status dashboard, so the word ships with the screen that earns it. No motion: the artboards specify
staggered entry animations, and the first screen change that needs one builds it.

## Capabilities

### New Capabilities

*(none)*

### Modified Capabilities

- `app-shell`: adds a requirement that the shell offers one fixed set of five tabs, in one order,
  wherever the app runs — and that the current one is distinguishable. Nothing says this today, which
  is exactly how the web bar came to render four.

## Impact

- **Code**: `src/constants/theme.ts`;
  `src/components/{themed-text,surfaces,form,app-tabs,app-tabs.web,bug-report-here,crash-fallback}.tsx`;
  new `src/components/{icon,sheet}.tsx`; new `src/ui/{tabs,icons}.ts` + their tests;
  new `src/constants/theme.test.ts`; `src/ui/screens.test.ts` (both bars re-bound to the list);
  and the five files under `src/app/` the Non-goals name — all token swaps.
- **Dependencies**: `react-native-svg` added — a native module, so `scripts/android.sh up` must
  rebuild before any emulator smoke. `expo-font` is untouched: no font is bundled.
- **Every screen**: all 34 change tone at once. The twenty-four with no artboard follow correctly
  because they read roles, not hex — with the exceptions fixed here. `bug-report-here.tsx` was the
  one the change predicted; the sweep found twelve more sites in four kinds, and tasks.md 9.3
  records each one and the three that were left alone as correct.
- **In flight**: `qa-sweep-2026-09` also touches `app-shell`; this change should merge after it, or
  the tab-set requirement must be re-checked against whatever it lands.
- **Not touched**: `docs/glossary.md` — no term is renamed. No migration; the database is untouched.
- **`docs/screens/` is left stale, deliberately.** All 36 screenshots there, and therefore
  `docs/app-overview.md` and the `.docx` built from it, show the pre-retone card (#1A1714), the «›»
  character and the 26px header. Every **layout** in them is still accurate — this change relays out
  nothing — but every **tone** is wrong from this commit on, so nobody should read a colour off
  them. They are not refreshed here for two reasons: each of the 36 needs its own app state
  (onboarding, empty states, pickers, the saldo import), so a refresh means wiping the device's data
  and scripting a long walk; and the nine screen waves that follow each change layout, so a refresh
  now would be thrown away and redone up to nine more times. The refresh belongs to the last of
  those waves, in one pass, when the screens have stopped moving.
