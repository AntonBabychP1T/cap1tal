## Context

See proposal.md, "Why", for the measurement. The shape of the search today (app-speed-pass D6,
transaction-search D12): SQL narrows by рахунок, місяць, сума and the named категорії/джерела, and
lets every row with an опис through (`description IS NOT NULL`) because SQLite folds ASCII case only.
TypeScript then judges each candidate in `satisfies`, which folds the опис **and** the typed text
with `toLocaleLowerCase('uk')` per row. On 10 000 synthetic транзакції that is 8 888 candidates,
~17 800 locale-argument case mappings, and 16–18 s of a 18–20 s stall.

On Hermes for Android, a case mapping with a locale argument goes through the platform's Intl
bridge on every call (~0.4 ms here, independent of string length); without a locale argument it is
native string code (~1–2 µs). V8 in Node has ICU in-process, which is why `verify` never saw it:
the same search is ~15 ms in Node.

The app folds case with `'uk'` in five places, each with its own one-line helper: the search match
(`src/db/transactions-repo.ts`), `folded`/`nameMatches` (`src/ui/labels.ts` — picker search and the
names a search matches), `fold` in `src/domain/rules.ts` (per transaction × per rule on every
import, sync and draft), `fold` in `src/notifications/parse.ts`, and `opysSaysSeller` in
`src/domain/fiscal-receipt.ts`. `src/analysis/details.ts` already chose `toLowerCase()` for its
own reason (identical output in Node and Hermes) and says so.

## Goals / Non-Goals

**Goals:**
- The search's JS after the read drops from ~16 s to tens of ms on the emulator, so the stall after
  a pause is the SQL read plus the render (~1 s in a dev build). Measured, never checked by
  `verify`, on this reference setup: the `Pixel_10_Pro` emulator, debug build with Metro, the
  synthetic бекап of `scripts/make-big-backup.ts` (10 000 транзакцій, 8 888 of them with an опис —
  all SQL candidates for a text search). The clock starts at the **last keystroke** and stops when
  the JS thread is free again (the probe's late-timer count returns to 0):
  - «bolt» at 0.15 s between keys (one search): **≤ 3 s**.
  - «bolt» at 0.7 s between keys (every pause searches — «b», «bo», «bol», «bolt»): **≤ 5 s**, since
    up to four ~1 s searches can queue behind each other.
  A miss is recorded in `measurements.md` with its numbers; it does not make the change wrong,
  but it is said plainly and the next step (the shadow column) is named.
- One fold, defined once, used by every case-insensitive comparison in `src/`.
- Proof that no match changes: the ICU full-range test under `verify` plus the device check of D5.

**Non-Goals:**
- `localeCompare(…, 'uk')` (same per-call cost; short lists only) — a separate change if measured
  to matter.
- Fewer candidate rows (shadow column, SQL pre-filter), render cost, release-build measurements.

## Decisions

### D1. The fold is `toLowerCase()`, in `src/domain/fold.ts`

`foldCase(text: string): string` returns `text.toLowerCase()` — Unicode's default full lower-case
mapping, context rules (final sigma) included. It lives in `src/domain/` because `rules.ts` and
`fiscal-receipt.ts` are domain code and may not import from `src/ui/`; `labels.ts`, the repository
and `notifications/parse.ts` import it from there.

Why this is the same answer: Unicode's SpecialCasing tailors case only for `lt`, `tr` and `az`;
`uk` has no tailoring, so for every string `toLowerCase()` and `toLocaleLowerCase('uk')` agree.
Checked in Node 26 over every code point (0 differences) and on the device for Cyrillic with
Ґ/Ї/Є/І, Turkish İ, Greek final sigma and ß (8/8 equal on Hermes, measurements.md). A test keeps the Node half (D4).

Alternatives:
- `toLocaleLowerCase()` with no argument: also fast on Hermes (2.6 µs), but it follows the phone's
  language — a phone set to Turkish would fold `I` to `ı` and stop matching «BILLA» against «billa».
  That is the opposite of what the spec asks.
- Keep `'uk'` and cache folded описи (a `Map` from опис to fold): the synthetic history has ten
  distinct описи, the owner's real one thousands; it hides the cost instead of removing it, and a
  cache is one more thing to invalidate.
- A lowercase shadow column filled by a migration: removes the JS match entirely but is a schema
  change for a problem that a 1 µs fold already solves. Stays the documented next step in
  `transactionsRepo.search`'s doc.

### D2. The typed text is folded once per search

`searchMatches` folds `criteria.match.text` once, before the filter, and hands the folded needle to
`satisfies`; `satisfies` folds only the опис. `searchCriteria` already folds its needle once for
the name matches — unchanged, apart from using `foldCase` through `folded`.

### D3. The five helpers collapse onto `foldCase`

- `labels.ts` keeps `folded` as a re-export-style one-liner over `foldCase` (its callers and the
  "one rule" comment stay), or its callers import `foldCase` directly — whichever leaves fewer
  edits; the doc comment names D1 either way.
- `rules.ts` and `notifications/parse.ts` drop their local `fold` and import `foldCase`. The
  comments that say "Ukrainian casing rules" are rewritten to say why the default mapping *is*
  Ukrainian casing.
- `fiscal-receipt.ts` `opysSaysSeller` uses `foldCase`.
- `analysis/details.ts`: only the comment naming the search's fold is corrected; `foldMerchant`
  keeps `toLowerCase()` directly (it also normalises whitespace, and its reason is stated there).

### D4. Two tests hold it

- `src/domain/fold.test.ts`: "The fold agrees with Ukrainian casing on every character" — every
  code point outside the surrogate range, `foldCase(c) === c.toLocaleLowerCase('uk')` in Node's
  full ICU; "Ukrainian letters fold as before" (Ґ/Ї/Є/І, final sigma, a mixed Latin/Cyrillic
  опис); and "A phone set to Turkish still finds a Latin опис" as `foldCase('BILLA') === 'billa'`
  beside `'BILLA'.toLocaleLowerCase('tr') !== 'billa'` (so the test shows what a locale fold would
  break) — which holds on every phone because `foldCase` takes no locale, and the usage test below keeps
  every other comparison on it. Runs in well under a second.
- `src/ui/locale-case-usage.test.ts`, modelled on `stored-history-usage.test.ts`: reads every
  `.ts`/`.tsx` file under `src/` except `*.test.ts`, strips `//` and `/* */` comments (by pattern — a `//` inside a string can only hide a call later on
  that line, never report a false one; the test says so), and fails
  naming the file and line for any `toLocaleLowerCase(` or `toLocaleUpperCase(` left in code. A
  test file may still call it (D4's first test must); a comment may still name it (the corrected
  one in `details.ts` does). Today it finds seven calls in five files.

The existing search, rules, labels and notification tests stay unedited and green, but in Node
they cannot tell the two folds apart (V8 sends both through the same ICU). On the phone the proof
is D5's device check: Hermes's `toLowerCase()` against its own `uk` mapping, and «bolt» finding the
same транзакції before and after.

### D5. The device check repeats the probe, then is thrown away

The same measurement as proposal.md, on the change, with one restore of the бекап for the whole
check. The probe also filters the very candidate rows of each search a second time with the old
fold (`toLocaleLowerCase('uk')` on опис and typed text) and logs both match counts and a hash of
both id lists in order; they must agree. That compares the two folds on the same rows in the same
process, with no worktree of the parent commit and no second restore (транзакція ids are created at
restore time, so two restores would not compare). The probe also counts, on Hermes, the code points where `toLowerCase()`
and `toLocaleLowerCase('uk')` differ, and compares the context strings of D1 (final sigma, İ, ß,
«ҐАНОК ЇЖАК Єнот І»); any difference stops the change at D1. Each run: the synthetic бекап restored, a throwaway probe of
`performance.now()` marks around the SQL read, `withAwaiting`, the filter, `sealed` and the render,
one batched log line per second, Metro restarted with `--clear` after each edit, «bolt» typed at
0.15 s and at 0.7 s between keys. The owner's database is saved with `run-as … tar cf` and restored
by pushing the tar to `/data/local/tmp` and extracting it with the device's own tar (not
`adb exec-in`, which truncated the WAL on 2026-09-30), then compared byte for byte. The numbers go
into this change's `measurements.md`; the probe is never committed.

## Risks / Trade-offs

- [A future Unicode version tailors `uk`] → the D4 test fails in Node on that ICU and says which
  characters; the decision is then revisited rather than silently diverging.
- [Hermes's `toLowerCase()` differs from its `uk` mapping on some code point] → task 4.2 counts it
  over the full range and the context strings on the device; a non-zero count stops the change and
  D1 is revisited before anything is ticked.
- [The remaining ~1 s (SQL + render) is still felt] → recorded in `measurements.md` with numbers;
  the shadow column is the named next step, not part of this change.
- [app-speed-pass is not archived and also adds requirements to `transaction-search`] → this delta
  only ADDs a differently named requirement; either can archive first.
