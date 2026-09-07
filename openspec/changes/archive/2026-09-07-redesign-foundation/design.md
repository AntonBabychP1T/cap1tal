## Context

See `proposal.md` — Why. What shapes the approach:

- **The gate cannot see any of this.** `npm run verify` is Node-only and never renders JSX, so a
  token value, a font size and a card's corner are all invisible to it. The only things this change
  can put under test are the ones that are data: the tab set, and the token table's own shape.
  Everything else is proven on the emulator by `smoke-runner` or not at all. That asymmetry decides
  where each piece of this change lives.
- **`src/constants/theme.ts` is a closed vocabulary.** Its own header says nothing outside the file
  writes a hex value, and 33 of the 34 screens honour that — they read roles. That is the entire
  reason a global retone is a small change rather than a 34-screen edit, and the one file that
  breaks the rule (`bug-report-here.tsx`) is the one place the retone would visibly break.
- **The artboards are dark-only.** All fourteen draw the dark theme; the light theme has no design
  input at all. Every light value in this change is derived, not designed.
- **The artboards are not self-consistent.** They use nine gap values (5–14), two card radii (16 and
  18) for the same role, and three phrasings for one over-limit sentence. They are a statement of
  intent, so the design's job is to pick one of each.

## Goals / Non-Goals

**Goals:**

- One vocabulary — colour roles, radii, spacing steps, type roles, glyphs, surfaces — that all ten
  screen redesigns and the twenty-four undesigned screens draw from.
- Make the tab set testable, so a platform bar can no longer silently drop a tab.
- Leave every screen's layout and every displayed number exactly as they are.

**Non-Goals:**

- No screen is relaid out. A component gaining a capability nobody passes yet is expected here; the
  screens that use it arrive in later waves.
- No motion. The artboards specify staggered entry animations, but a wrapper with no consumer is a
  guess at an API; the first screen change that animates something builds it and the second one
  generalises it.
- No accessibility audit beyond the one thing this change would otherwise regress (the tab mark).

## Decisions

### Retarget the three surface roles rather than add new ones

`backgroundElement`, `cardEdge` and `border` change value; no `cardDark`/`cardElevated` is minted.

*Why:* the roles already mean exactly what the artboards need — "the fill of a card", "the edge
around a card", "the rule between two rows". Only their values are wrong. Adding parallel roles
would leave every screen choosing between two card fills with no rule saying which, and the
twenty-four undesigned screens would keep the old one forever.

*What does not change:* the order of the three. Today the edge (#2F2A23) is a step lighter than the
rule inside a card (#2B2721); after the change it still is (#221E19 against #1E1A15), by about the
same step. All three darken together with the card they belong to. The doc comment on `cardEdge` —
that a card on a black page needs an outline to read as an object — is the reason the edge keeps
that step, and it stays true and stays worth more now that the card itself is nearly black.

*Alternative rejected:* a `theme.variant` flag selecting old/new palettes, so screens could migrate
one at a time. It doubles the table, has no end state, and the artboards are unanimous — every one
of the ten chosen draws #0F0D0B on #221E19.

### `title` is retargeted; seven type roles are added

`title` moves 40/44 → 44/50, letter-spacing −1 → −1.5, and keeps its tabular figures and its meaning
("the one number a screen leads with"). Added: `hero`, `screenTitle`, `rowTitle`, `rowAmount`,
`caption`, `captionBold`, `note`.

*A `tabLabel` role was written and removed.* The canvas specifies the tab label at 10/12 w600, and
that is now `TAB_LABEL_SIZE` in `app-tabs.tsx` — a number, because `NativeTabs` takes a size on
`labelStyle` and never a `ThemedText`. As a `ThemedText` type it had no caller on either bar, which
is the same reason `motion.tsx` was dropped: this change ships no piece nothing can use.

*Why retarget rather than add a `display`:* `title`'s doc comment already names the exact role the
artboards give their 44px figure. A tenth type meaning the same thing would leave `title` unused and
every future screen guessing which of the two to reach for.

*`ScreenHeader` moves from `subtitle` to `screenTitle`* (21/26 w700). `subtitle` (26/32 w600) stays —
`Fab` uses it and it is the right step for a card's own heading — but it stops being the header role.

*`caption` and `overline` deliberately share metrics* (11/14) and differ in treatment: `overline` is
w700, tracked and uppercased (a heading); `caption` is w500 and plain (a secondary line under a
value). Two roles at one size is correct here because the artboards use both, side by side, meaning
different things.

### Stroke glyphs come from `react-native-svg`, not from images

*Why:* the artboards define every glyph as a 24×24 path at stroke-width 2, tinted per instance —
five different colours for the same glyph across the set. The ten chosen artboards draw 51 distinct
glyphs; as images even the 15 shared ones would be 45 files with no stroke control and a `tintColor`
per usage, and the set grows with every wave. As data it is one table of path strings that
`icon.tsx` renders at any size and colour.

*Cost, named explicitly:* `react-native-svg` is a native module. It is autolinked, needs no config
plugin and no hand edit under `android/`, but it does require a fresh development build —
`scripts/android.sh up` — before any emulator smoke. `verify` never compiles native code, so a green
gate says nothing about whether this dependency resolved. Task 1 therefore builds before anything
depends on it.

*Alternative rejected:* keeping the existing template-PNG approach that `app-tabs.tsx` uses for its
five tab icons. It works there because `NativeTabs` accepts only images; it does not generalise to
51 glyphs at four tints.

### The tab set becomes data in `src/ui/tabs.ts`

The five tabs — route name, Ukrainian label, icon key, order — move into pure TypeScript with a test
beside it. `app-tabs.tsx` and `app-tabs.web.tsx` both render from that list.

*Why:* this is the only part of the shell the gate can hold. The live defect (the web bar renders
four tabs, omitting «Звіти») exists precisely because the set was written twice, in two JSX files
neither of which `verify` loads. Moving the set to data does not make the JSX testable, but it makes
*the thing that was wrong* testable, and it removes the second copy.

*What the test asserts:* the five tabs, in order, each with a label, an icon key and **both** route
forms — the native `routeName` (`index`, `month`, …) and the web `href` (`/`, `/month`, …), which
differ today and are why one list has to carry both. It is a small test; it is also the test that
would have caught the bug.

### `NativeTabs` is kept

*Why not the hand-drawn bar the artboard draws:* the artboard's bar and the native one differ in two
things that matter — accent instead of tone for the marked tab, and no Material indicator pill —
and `NativeTabs` can express both (`tintColor`, `labelStyle.selected`, `indicatorColor`). Replacing
it with a JS bar to gain pixel-exact 23px icons would trade the platform's own press, ripple, safe
area and predictive-back behaviour for a rounding difference.

### The marked tab is not marked by colour alone

The artboard marks the current tab with the accent on both icon and label, at the same weight as the
unmarked four, and removes the indicator pill. That leaves colour as the only signal.

*What today does, precisely:* `app-tabs.tsx` marks with `text` against `textMuted` — a colour — **and**
`indicatorColor={colors.backgroundSelected}`, which draws a filled pill behind the marked tab. The
pill is a shape, and a shape is exactly the signal an owner who cannot separate the two colours has
left. So today's bar does satisfy "not by colour alone", and it is task 5.1's removal of the pill
that would take that away. This requirement guards a real regression rather than raising the bar —
but only on the native side (see below).

*Corrected on the emulator, after the change was written.* The paragraph above is half wrong:
Android draws the label of the **open tab only**, so a second non-colour signal was there all
along — exactly one tab carries a word. And it did not take an emulator to know that. It is written
down in this repository, in the very delta quoted two paragraphs above for the accent rule
(`qa-sweep-2026-09/specs/app-shell/spec.md`): «on Android a five-tab bar names the open tab and
leaves the rest to their icons». The premise was refuted by a spec that had already been read for a
different sentence. Removing the pill did not
put the scenario at risk on this platform, and the w700 label, which was added to replace the pill,
compares against nothing here because two labels are never drawn at once. None of this changes what
ships. It changes what the change may claim: the weight is kept for the web bar and for any profile
that labels all five, not for the Android one.

*Decision, first taken and then revised:* the accent was adopted with the marked label drawn at
w700 against w600, and the accent half was then withdrawn. `qa-sweep-2026-09` — implemented,
smoke-tested, and `## ADDED`, so it lands in `openspec/specs/app-shell/spec.md` — requires the open
tab to be marked by tone and the accent not to appear in the bar at all, with a reason of its own:
the accent is the app's «this is the action» colour, and navigation is not an action. This change's
delta added nothing that overrides it, so the two would have merged into a spec the shipped bar
violated. The owner was asked and chose the tone.

*What stands:* the mark is `text` against `textMuted` and the indicator pill is dropped. The
non-colour signal the requirement asks for is carried by **label-presence on Android** — the
platform names the open tab and leaves the other four to their icons — and by the **w700 label on
the web bar**, which draws all five names, and on any profile that labels all five. The pill and
the weight were never the pairing this was written as: the pill could go because the platform's own
behaviour already carried the signal, and the weight is what carries it where that behaviour does
not apply. Neither depends on which colour marks the tab.

*Alternative rejected:* a `## MODIFIED Requirements` block overriding the no-accent rule for the
sake of the artboards. The artboards are a statement of intent; that requirement is a decision with
a stated reason, already smoke-tested on the device. An artboard does not overrule it.

*The web bar is a different case and is fixed too.* `app-tabs.web.tsx` marks focus with
`backgroundSelected` against `backgroundElement` and `text` against `textSecondary` — two colours and
no shape. It fails the new requirement today, before this change touches it. Since the requirement
carries no platform qualifier and task 4.4 rewrites that file anyway, task 5.3 gives it the same
weight signal rather than shipping a requirement the change's own second bar violates.

### The token table is tested by reading its source, not by importing it

`src/constants/theme.test.ts` reads `src/constants/theme.ts` as text and asserts on the source.

*Why not import it:* `vitest.config.mts` runs `environment: 'node'` with no `resolve.alias`, and
`theme.ts` opens with `import '@/global.css'` and `import { Platform } from 'react-native'`. Neither
resolves under the gate, so `import { Colors } from '@/constants/theme'` cannot run. This is not an
oversight to route around — it is why `src/ui/screens.test.ts` already reads `.tsx` files as text,
and `.claude/rules/testing.md` prescribes that pattern for exactly this.

*Alternative rejected:* splitting the pure data out of `theme.ts` into a Node-importable module that
`theme.ts` re-exports. It would give a real import and stronger assertions, but it splits the one
file whose whole point is that every value lives in it, for a test of four structural invariants.
If a later wave needs to compute over the palette in Node, that is when the split earns itself.

### `bug-report-here.tsx` reads roles

It paints `theme.backgroundElement` and `theme.border` directly for the маркер репорту (line 254),
which is mounted over all 34 screens. After the retone that is a #0F0D0B handle on #0F0D0B cards. It
moves to `backgroundSelected` for the fill and `cardEdge` for the outline — the roles that keep it
visible against both the page and a card.

The same file has three more uses of `border` (lines 287, 297, 315) that are **outlines on the page
background**, not rules inside a card: two inputs and the secondary button of the аркуш репорту.
`border` going #2B2721 → #1E1A15 makes an already thin edge on #000000 thinner still, so those move
to `cardEdge` too. Task 9.3 greps the rest of `src/` for the same misuse, because there is no reason
to think this file is the only one — the retone quietens that role everywhere, and only an edge
drawn *inside* a card was ever meant to be that quiet.

*This is a bug this change creates and fixes in the same commit,* not a pre-existing one.

## Risks / Trade-offs

- **A green `verify` proves almost nothing here.** → Every task that changes a drawn thing is
  finished on the emulator, not by the gate. The change is not archived without a `smoke-runner`
  pass over the four tabs, a card-heavy screen, a form and the маркер репорту.
- **Twenty-four screens change tone with no artboard and no reviewer.** → They read roles, so they
  follow correctly by construction; the one exception is fixed here. Smoke covers a sample across
  the four kinds of screen rather than all twenty-four.
- **The light theme is derived, not designed.** → Values are chosen to preserve the existing light
  theme's contrast ratios rather than to mirror the dark ones. If the owner uses light mode, this is
  the thing most likely to need a second pass.
- **`react-native-svg` fails to resolve or drifts from the JS bundle.** → Task 1 adds it and rebuilds
  before any component imports it, so the failure surfaces alone rather than mixed into a component
  bug. `BACKLOG.md` already carries an open item on JS/native build drift after adding a module.
- **`qa-sweep-2026-09` also touches `app-shell`.** → It has one open task. This change merges after
  it, and the tab-set requirement is re-read against whatever it lands before `/opsx:archive`.
- **Components ship with no consumer.** → `ProgressRing`, `Sheet`, `StatTile` and the rest are
  written against the artboards that will use them, not against a guess. If a later wave finds a
  prop missing, that is a normal extension, not a redesign.

## Migration Plan

No data migration: the database, the schema and every stored value are untouched. The only
irreversible step is the dependency; rolling back is `npm uninstall react-native-svg` plus a
rebuild. The token retarget is a one-line-per-role revert.

## Open Questions

- Whether `backgroundStrong` earns its place. It exists for one thing in one artboard (1g's tallest
  bar). If wave 5 finds no second use, it should be folded into `backgroundSelected` and removed —
  answering this does not change the specs, the approach or any task here.
