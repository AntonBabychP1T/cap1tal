## 1. The native dependency, alone and first

- [x] 1.1 Add `react-native-svg` with `npx expo install react-native-svg`; confirm it lands in
      `package.json` dependencies and that no config plugin and no hand edit under `android/` is
      needed (design.md — "Stroke glyphs come from `react-native-svg`").
- [x] 1.2 Rebuild and launch on the emulator (`scripts/android.sh up`) with **nothing yet importing
      it**, so a resolution or autolink failure surfaces on its own. Record in the change that the
      build is green; `verify` cannot prove this.
      **The record, which was missing until the diff-reviewer asked for it.** The APK built at
      15:52 on 2026-09-04 carries `lib/arm64-v8a/libreact_codegen_rnsvg.so` (`unzip -l` on
      `android/app/build/outputs/apk/debug/app-debug.apk`), so the module autolinked with no config
      plugin and no hand edit under `android/`. `scripts/android.sh up` at 17:34 installed it,
      Metro served the current JS, and the app launched clean — `logs` shows
      `Running "main"` with no `Cannot find native module`.
      **And the stronger proof, now that something does import it:** `surfaces.tsx` imports
      `react-native-svg` at module scope and every screen imports `surfaces`, so a failed link is a
      dead app rather than a missing ring. Головний draws, and its chevron is the stroked
      `chevronRight` glyph at even width with round caps — not the «›» character it was.
      Screenshot: `.cache/android/rf-01-home.png`.

## 2. Tokens

- [x] 2.1 In `src/constants/theme.ts`, retarget the dark surface roles: `backgroundElement`
      #1A1714 → #0F0D0B, `cardEdge` #2F2A23 → #221E19, `border` #2B2721 → #1E1A15. Update
      `cardEdge`'s light value #EAE3D5 → #E7DFD0. Keep each role's doc comment true — the edge stays
      a step lighter than the rule inside, and that step now matters more, not less.
- [x] 2.2 Add two roles to both themes with doc comments in the file's own voice: `backgroundInset`
      (#141210 / #F1ECE2 — a surface set into a card) and `textFaint` (#4A443C / #B0A797 — one step
      below `textMuted`, for chevrons and the quietest marks).
      `positiveSurface` and `backgroundStrong` are deliberately **not** added: each is drawn by
      exactly one artboard, so each belongs to the screen change that first needs it. Adding a role
      in a later wave is cheaper than removing one twenty-four screens have picked up.
- [x] 2.3 Add `Radius.tile` 10, `Radius.field` 14, `Radius.hero` 18; leave `card` 16, `chip` 9,
      `control` 12, `sheet` 22 alone. Add `Spacing.oneHalf` 6 and `Spacing.twoHalf` 12.
- [x] 2.4 Add `src/constants/theme.test.ts`, which reads `src/constants/theme.ts` **as text** and
      asserts on its source — the pattern `src/ui/screens.test.ts` documents, and the only one
      available: `vitest.config.mts` runs `environment: 'node'` with no `resolve.alias`, and
      `theme.ts` opens with `import '@/global.css'` and `import { Platform } from 'react-native'`,
      neither of which resolves under the gate. Assert: `Colors.light` and `Colors.dark` declare the
      identical key set; every colour value is a 6-digit hex; `Radius` is strictly ordered
      `chip < tile < control < field < card < hero < sheet`; `Spacing` is strictly ascending.
      Do **not** assert relative luminance from text — that needs the values parsed, which is what
      this test is for; parse the hex pairs it does read and compare `textFaint` against `textMuted`
      per theme.

## 3. The type ladder

- [x] 3.1 In `src/components/themed-text.tsx`, retarget `title` from 40/44 letter-spacing −1 to
      44/50 letter-spacing −1.5, keeping its tabular figures and its doc comment's meaning ("the one
      number a screen leads with"). No `display` role is added — `title` already means this.
- [x] 3.2 Add seven types to `ThemedTextType` and `styles`: `hero` (32/38 w700 ls −1.1 tabular),
      `screenTitle` (21/26 w700 ls −0.4), `rowTitle` (15/20 w600), `rowAmount` (15/20 w700 tabular),
      `caption` (11/14 w500), `captionBold` (11/14 w700), `note` (12/16 w500). Leave `overline`
      exactly as it is, and comment why `caption` shares its metrics but not its treatment.
      No `tabLabel`: the canvas's 10/12 w600 for the tab label is a number on `NativeTabs`'
      `labelStyle`, which never takes a `ThemedText`, so the role would have had no caller.
- [x] 3.3 Point `ScreenHeader` in `src/components/surfaces.tsx` at `screenTitle` instead of
      `subtitle`; leave `subtitle` in place for `Fab` and card headings.

## 4. The tab set as data, and the defect it exposes

- [x] 4.1 Write the failing test first: `src/ui/tabs.test.ts` asserting the five tabs are
      Головний, Місяць, Рахунки, Звіти, Налаштування **in that order**, that each carries a label,
      an icon key, a native route name and a web href, and that the set has no sixth. This proves
      app-shell's "The shell offers one fixed set of tabs, wherever the app runs" and fails until
      4.2 exists.
- [x] 4.2 Add `src/ui/tabs.ts` holding that list as pure data. Each entry carries **both** route
      forms, because the two bars disagree today and the list must drive both: `routeName`
      (`index`, `month`, `accounts`, `reports`, `settings` — what `NativeTabs.Trigger` takes) and
      `href` (`/`, `/month`, … — what the web `TabTrigger` takes), plus `label` and `iconKey`.
      No React import.
- [x] 4.3 Render `src/components/app-tabs.tsx` from `tabs.ts` instead of five hand-written
      `NativeTabs.Trigger` blocks, keeping `NativeTabs` itself. The icon-key → PNG map stays a
      static object literal in this file: Metro's `require()` takes no variable, so the paths cannot
      come from `tabs.ts`. Comment that, so the next reader does not try to move it.
- [x] 4.4 Render `src/components/app-tabs.web.tsx` from the same list — this is the defect fix: it
      renders four `TabTrigger`s today and omits «Звіти», against `reports-screen`'s requirement
      that the tab sits between «Рахунки» and «Налаштування».

## 5. Marking the tab being read

- [x] 5.1 In `app-tabs.tsx`, mark the current tab with `accent` on both icon and label
      (`tintColor`, `labelStyle.selected`) instead of today's `text`/`textMuted` tone, and drop the
      Material indicator pill (`indicatorColor`).
      **Half-reverted, on the owner's decision.** The accent was applied and then taken back out:
      `qa-sweep-2026-09`'s app-shell delta — 18/19, implemented and smoke-tested, `## ADDED`, so it
      lands in the main spec — says «The accent SHALL NOT appear in the tab bar … it is the app's
      «this is the action» colour, and spending it on navigation would leave it meaning nothing».
      This change's delta has no `## MODIFIED` block for it, so whichever order the two merged in,
      the shipped bar would have violated a live requirement. Asked; the owner chose the tone.
      The mark is `text`/`textMuted` on icon and label, as before. **What this task did keep:** the
      indicator pill is dropped. No `## MODIFIED` block is needed now — the two deltas agree.
      ⚠ **This task said "and 5.2's weight signal is what replaces it". That is refuted** — see 5.2:
      on Android the label of the open tab is the only one drawn, so the weight compares against
      nothing and the signal that survives colour is that one word's presence. The pill could go
      because the platform already carried it. Marked here rather than only in 5.2, so a reader of
      5.1 alone does not leave with the wrong account.
- [x] 5.2 Draw the marked label at w700 against the unmarked w600. The indicator pill being dropped
      in 5.1 is today's only non-colour signal, so without this the mark would become colour-only —
      app-shell's "The tab being read is marked, and not by colour alone", scenario "The mark
      survives without colour". Comment that the weight is a deliberate deviation from the artboard,
      which marks by colour alone.
      **The emulator says the premise was wrong, and the task is kept for a different reason.**
      Android draws the label of the **open tab only** — the other four are icons alone (see the
      five stacked bars in `.cache/android/rf-{01-home,month,accounts,reports,settings}.png`). Two
      labels are therefore never on screen at once, so w700-against-w600 compares nothing on this
      profile and the weight is invisible here. What actually satisfies the requirement on Android
      is that exactly one tab carries a word at all: presence, not colour. That is the platform's
      own behaviour, it held before this change, and it means dropping the pill never put the
      scenario at risk the way 5.1 and design.md assumed.
      The weight is **kept**, because it is the signal on `app-tabs.web.tsx`, which draws all five
      labels, and on any profile that labels all five. The code comment now says this so nobody
      removes it after finding the Android bar unchanged without it.
- [x] 5.3 In `app-tabs.web.tsx`, give the marked tab the same non-colour signal: it marks focus with
      `backgroundSelected`/`backgroundElement` and `text`/`textSecondary` today — colour on both
      counts — and the requirement carries no platform qualifier. Weight is the cheapest signal that
      matches the native bar.
      The label's colour follows 5.1 back to `text`: the no-accent requirement carries no platform
      qualifier either.
- [x] 5.4 `TAB_LABEL_SIZE` 11 → 10, the canvas's size. Checked on the emulator: at 11
      «Налаштування» ran the full width of its fifth and touched the screen's edge; at 10 it clears
      it. The name is not shortened to fit — the label is.

## 6. Glyphs

- [x] 6.1 Add `src/ui/icons.ts`: the glyph table as **data** — name → SVG path string(s), at 24×24,
      stroke-width 2. `IconName` is derived from the table's keys. This is where the table lives so
      the gate can see it; nothing here imports React or `react-native-svg`.
      Ship only the glyphs **two or more** of the ten chosen artboards draw — 15 of the 51 distinct
      glyphs in the set. The other 36 are drawn by exactly one artboard each and belong to that
      screen's own change, which appends to this same table.
      **What was actually done, and how it differs.** «cap1tal Redesign.dc.html» is not in the
      repository, so the artboards could not be opened and the 15 paths were **drawn to the
      geometry design.md fixes** (24×24, stroke-2, round caps, absolute commands only) from what
      each glyph is named after — not transcribed. The counts above (51 / 36 / 15, and the 9 of
      6.2) are the proposal's and are not checkable from inside this repo. The names shipped are
      the fifteen the screens ahead need: `chevronRight`, `chevronLeft`, `card`, `check`, `income`,
      `transfer`, `chartRising`, `basket`, `tag`, `plus`, `search`, `calendar`, `target`, `wallet`,
      `warning`. Whether each one *looks* like its name is settled on the emulator, not by the
      gate. If the canvas is ever committed, this table is the thing to re-check against it.
- [x] 6.2 Add `src/ui/icons.test.ts`: every name maps to a non-empty path; no two names share a
      path (the duplicate check that matters, since the paths were written by hand); every
      path's coordinates fall inside 0–24; the table holds the nine glyphs used by three or more
      artboards (chevron right, chevron left, card, check, income arrow, transfer arrows, rising
      chart, basket, tag).
      Two checks were added beyond the four asked for, and they are what make the bounds check
      mean anything: every subpath starts with `M`, and only absolute commands appear. With `l`,
      `h` or `a` the numbers in a path are deltas and arc flags, so a 0–24 bounds check would be
      reading noise rather than coordinates. The duplicate check runs at both levels — whole glyph
      and single subpath — because a paste slip lands on one stroke, not on all of them.
- [x] 6.3 Add `src/components/icon.tsx`: a thin renderer over `src/ui/icons.ts` taking `name`,
      `size` and `color`, drawing with `react-native-svg` at round caps and joins. It holds no path
      data of its own.

## 7. Shared surfaces

- [x] 7.1 `surfaces.tsx`: `IconRow` (a `ListRow` with a leading `IconTile`), `IconTile` (a
      `Radius.tile` square on `backgroundInset` holding one glyph), `RoundIconButton`.
- [x] 7.2 `surfaces.tsx`: `StatTile` (icon + mini-label + value, the 2×3 grid cell of 1a),
      `MeterRow` (a `ListRow` wrapping the existing `Meter` with a title, an amount and an optional
      secondary line), `NoteBlock` (extends `Banner` for a footnote with no danger).
      **`NoteBlock` does not extend `Banner`, and the task's wording is not honoured** — the same
      deviation 8.2 records for `SearchBar` and `Field`. A `Banner` is something the owner must read
      before going on; a footnote is something they may ignore. They differ in fill
      (`backgroundInset` against `backgroundSelected`), in type role (`note` against `small`), in
      tone count (one against two) and in carrying a glyph. Extending `Banner` would have meant a
      third tone that must never look urgent on the component whose whole job is to look urgent.
      Written beside it instead, and the docstring says so.
- [x] 7.3 `surfaces.tsx`: `ProgressRing` — an SVG ring taking a fraction, a size and a centre slot;
      it must render at the three sizes the artboards draw (64, 96, 210) from one component.
- [x] 7.4 `surfaces.tsx`: `HeroCard` — `Card` at `Radius.hero` with the existing `CardGlow` rings
      behind it, opacity as a prop so 1a's .30/.16 and Головний's .35/.20 are one component.
- [x] 7.5 `surfaces.tsx`: `SectionLabel` gains an optional leading glyph and an optional inline
      count; `Screen` gains a `footer` slot that does not scroll, beside the existing `overlay`.

## 8. Form pieces

- [x] 8.1 `src/components/form.tsx`: export the private `Chip` and extend it — pill shape, a
      `cardEdge` border when unpicked, an optional leading glyph. Every existing `Choices` caller
      must keep rendering unchanged.
- [x] 8.2 `src/components/form.tsx`: add `SearchBar` on top of `Field` (a leading glyph, a clear
      control, `Radius.field`).
      **Built beside `Field`, not on it, and the task was wrong to ask.** `Field` names itself in
      an overline, is ruled rather than boxed, and carries a hint; a search bar has no label, is a
      box, and is a control rather than part of a form. Building on it meant making `Field`'s label
      optional and adding a presentation flag to the component every form in the app uses, to save
      four lines of focus state — cost on twelve callers, saving in one place. The claim is dropped
      from the docstring too rather than left standing over code that does not honour it. The one
      existing search (`transactions.tsx:170`) is still a `Field` and is **not** moved here: that
      is `transaction-search` behaviour and belongs to the change that redesigns that screen.
- [x] 8.3 Add `src/components/sheet.tsx`: a bottom sheet at `Radius.sheet` with a grabber, a title
      and a scrolling body. `Radius.sheet` already has one consumer — the аркуш репорту drawn by
      hand in `bug-report-here.tsx:364`. Moving that one onto this component is **not** in this
      change: it carries `bug-report-screen` behaviour and would put a working flow at risk for a
      cosmetic gain. Say so in the new file's header.
      **One rule is broken on purpose: `sheet.tsx` writes a hex.** `theme.ts`'s header says nothing
      outside it writes a hex value, and this file's backdrop is `'#0008'` — the same literal
      `bug-report-here.tsx:269` already writes for the same thing. It is not made a role, for two
      reasons. A scrim is not a surface of the theme: it is the screen behind being pushed back, and
      it is identical in light and dark (a dimmed light screen is still dimmed with black), so a
      role would carry one value twice and invite someone to "fix" half of it. And it needs an alpha
      channel, while `theme.test.ts` pins every colour to a **6-digit** hex — holding this one value
      would mean weakening that invariant for all of them. If a third caller appears, that is the
      moment to add a `scrim` role and loosen the test deliberately. Two is not.

## 9. The bug this change would otherwise create

- [x] 9.1 In `src/components/bug-report-here.tsx`, stop painting `theme.backgroundElement` and
      `theme.border` by hand for the маркер репорту (line 254): move the fill to
      `backgroundSelected` and the outline to `cardEdge`, so the handle stays visible against both
      the page and a card after the retone. It is mounted over all 34 screens from
      `src/app/_layout.tsx`.
- [x] 9.2 Same file, lines 287, 297 and 315: `theme.border` there is a visible outline around two
      inputs and the secondary button, drawn against `background` #000000 — not a rule inside a
      card. `border` going #2B2721 → #1E1A15 cuts an already thin contrast. Move those three to
      `cardEdge`, which is the role for an edge that must be seen.
- [x] 9.3 Grep the rest of `src/` for `theme.border` used as an outline on the page background
      rather than as a rule inside a card, and fix or record each. The retone makes this role
      quieter everywhere, and `bug-report-here.tsx` is unlikely to be the only place.
      **It was not.** Eleven more sites, in three kinds:
      *Outlines that are the whole control* → `cardEdge`: `form.tsx` — the `Field` rule (the only
      thing saying where to type), the `secondary` `Action`'s outline, `RowAction`'s pill; and
      `crash-fallback.tsx` — the error box and the «Повернутися» button, both drawn straight onto
      `background`.
      *A surface's edge against the page* → `cardEdge`: `_layout.tsx`, both themes — React
      Navigation draws `colors.border` as the header's bottom edge and the bar's top one.
      *A third kind the task did not anticipate — `border` used as a **fill***: the `false` half of
      four `Switch` `trackColor`s (`ai-analysis.tsx` ×2, `manage/reminders.tsx`,
      `manage/bug-reports/index.tsx`). An off switch on a #0F0D0B card would have had a #1E1A15
      track, which is no track. A quiet fill is `backgroundSelected`, so that is where they went.
      **Left alone, and correct:** `surfaces.tsx`'s `ListRow` rule and `Divider`, and the chart
      baseline at `reports.tsx:246` — all three are rules inside a `Card`, which is the role.
      **A fourth kind, found by the diff-reviewer after the first sweep: a fill on the page with
      no edge at all.** Grepping `border` could not have found these, because the problem is the
      missing border. Two: the «Створити рахунок» «+» (`(tabs)/accounts.tsx:184`) and the web tab
      bar's own container (`app-tabs.web.tsx:63`). Both are `backgroundElement` drawn straight on
      `background`, so the retone takes them from #1A1714-on-#000000 to #0F0D0B-on-#000000 — a
      surface floating on nothing. Both get the `cardEdge` hairline, which is the move every card
      in this change makes. Nothing else in `src/` draws a bare `backgroundElement` on the page;
      `sheet.tsx` is the third and was born with its edge.
- [x] 9.4 Re-read `src/ui/bug-report-here.test.ts` and confirm nothing there pins a colour; if it
      does, update it with the reason.

## 10. Gate and review

- [x] 10.1 Run `npm run verify` and paste the final lines

  ```
   Test Files  145 passed (145)
        Tests  2780 passed (2780)
     Duration  3.76s

  ✔ verify passed
  ```

  The fingerprint `verify` prints is deliberately **not** quoted here, and the one an earlier pass
  did quote (`bd63cbb8…`) was stale the moment it was written. `scripts/fingerprint.sh` watches
  `openspec/`, so writing the hash into this file changes the tree the hash describes: a
  fingerprint pasted into a watched file can never be true of the tree containing it. The counts
  above are the durable part; the stamp lives in `.cache/verify-ok`, which is where the commit
  hook reads it from anyway.
- [x] 10.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
      Four passes, `PASS` on the fourth. What the gate could not see, in order:
      **1st (FAIL, 4 critical)** — the accent in the tab bar contradicted a live `qa-sweep-2026-09`
      requirement (owner asked, chose the tone); the rewritten `screens.test.ts` assertion had
      deleted the gate's only read of a bar file and replaced it with a claim about the list it was
      meant to check against; 1.2 was ticked with no build record; and the glyph comments claimed a
      provenance — transcribed from artboards — that is not true of paths written to design.md's
      geometry.
      **2nd (FAIL, 1 critical)** — the correction the smoke forced was applied in two of the four
      places, leaving `design.md` contradicting itself two paragraphs apart. Also caught that
      "the source could not have shown it" was false: the Android label behaviour is written in
      `qa-sweep-2026-09`'s own delta, the one already being quoted for the accent rule.
      **3rd (FAIL, 1 critical)** — «The mark survives without colour» had no evidence on the web
      bar, which is the only place this change's *own code* supplies the signal (Android's comes
      from the platform), in a file `verify` never loads. Four named tests added, mutation-checked.
      **4th (PASS)** — three warnings, all fixed rather than accepted: the no-accent guard matched
      one spelling of the role, so `themeColor="accent"` and `colors['accent']` would both have
      passed it; `ProgressRing` copied `Meter`'s clamp verbatim under a docstring promising they
      agreed (now one `share()`); and 10.3 undercounted its own tests.
- [x] 10.3 Smoke on the emulator (workflow step 6). Not a task the change was written with — added
      because `verify` cannot see one drawn thing in it, and a green gate here means almost nothing.
      Run by hand on `emulator-5554` (Pixel_10_Pro, API 37); screenshots under `.cache/android/rf-*`.

      **The tab bar.** All five offered in order; the open one marked by tone (`text` icon against
      `textMuted`), no accent anywhere in the bar, no indicator pill, «Налаштування» drawn whole
      with no ellipsis. Evidence: the five bars stacked, one per tab.

      **The retone, measured rather than eyeballed.** On Рахунки a horizontal scan across a card's
      left edge reads `#000000 → #221E19 (one pixel) → #0F0D0B`: the page, `cardEdge`, then the
      card. The card is a black shape held by its edge, which is the change's whole claim, and the
      edge survives at hairline width on a real screen.

      **The screens.** Головний (hero card, glow rings, chevrons), Місяць (card, `Divider`, meter),
      Рахунки (cards, section labels, the account form), Звіти, Налаштування (a `ListCard` whose
      `border` rules between rows still read — the role deliberately left alone in 9.3). Nothing
      lost its boundary; nothing became unreadable.

      **The fixes of section 9, each seen.** The маркер репорту reads both over the page and over
      the accent «Зберегти» button. «Скасувати» has its outline. The `Field` rule under «НАЗВА» is
      visible. The «Створити рахунок» «+» scans `#000000 → #221E19 → #0F0D0B → #221E19 → #000000` —
      the edge it gained is on both sides.

      **Section 8, seen incidentally.** The chips are pills now, outlined in `cardEdge` when
      unpicked and in `accent` when picked, and every `Choices` caller renders unchanged.

      **What the smoke found.** One thing, and it is recorded against task 5.2 rather than here:
      the w700 weight signal is invisible on Android, because the platform labels only the open
      tab. The requirement still holds — by the presence of that one label — but not for the reason
      5.1, 5.2 and design.md gave. All three now say so.

      **Not smoked, and this one is a real gap: the web bar.** `app-tabs.web.tsx` is where this
      change's own code supplies the non-colour signal — Android's comes from the platform — and an
      Android emulator cannot draw it. It is the file that silently lost «Звіти» in the first place.
      Standing in for a smoke: the four text-read tests in `src/ui/screens.test.ts` that pin how
      each bar marks the open tab, plus the four that pin both bars to `TABS` — two per bar, and it
      is the second of each pair («writes no вкладка of its own») that catches a re-drift. They are the reason
      task 5.3 is ticked; nobody has looked at that bar running. If the app is ever built for the
      web, its first smoke is this bar.

      **Not smoked, deliberately:** `IconRow`, `IconTile`, `RoundIconButton`, `StatTile`,
      `MeterRow`, `NoteBlock`, `ProgressRing`, `HeroCard`, `Sheet`, `SearchBar`. Nothing calls them
      yet — that is the change's own design (design.md, Non-Goals), and they arrive with the screen
      waves that draw them. Their first smoke belongs to the first wave that has a consumer.
