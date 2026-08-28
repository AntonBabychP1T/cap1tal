# bank-notifications — tasks

## 1. Terms and the capture model

- [x] 1.1 Add **Draft (чернетка)** and **Watched app (відстежуваний застосунок)** to
      `docs/glossary.md` with the meanings the spec gives them (a чернетка is a proposed
      транзакція awaiting the owner's word, moving no money; a watched app is an opt-in app
      package mapped to one рахунок); verify every domain term the new spec uses now exists
      in the glossary.
- [x] 1.2 Create `src/notifications/capture.ts`: the `CapturedNotification` record
      (packageName, postedAt epoch ms, title, text — design D1) and `fingerprintOf` as the
      plain joined string (D3); verify with `src/notifications/capture.test.ts` that equal
      records yield equal fingerprints and a change to any one field changes the fingerprint
      (requirement "A captured notification yields at most one чернетка, forever").

## 2. Parsing

- [x] 2.1 In `src/notifications/parse.ts`, implement the generic parser's amount and currency
      reading: first amount in the text, digits with optional space thousands separators and
      an optional 1–2 digit decimal part after "." or ",", converted digit-wise to integer
      minor units (never parseFloat — D4), currency from the closed token map UAH/грн/₴,
      USD/$, EUR/€ (D5), with the parse input built as title + text joined, title first,
      whitespace collapsed (D10); verify with `src/notifications/parse.test.ts` covering the
      spec scenarios "A purchase notification parses to money out in minor units", "A
      comma-decimal amount with thousands spaces parses exactly", "An amount with no decimal
      part parses as whole units", "The first amount wins, not the balance" and "The amount
      may live in the title".
- [x] 2.2 Add direction and totality to the generic parser: money-in marks «зарахування»,
      «поповнення», «повернення», «надходження» case-insensitive, money out otherwise (D6);
      unparsed for no amount, no recognisable currency, zero сума (D11) or hostile input,
      never a throw; verify with `parse.test.ts` scenarios "A top-up notification is money
      in" and "Hostile text is unparsed, not a crash" plus a fuzz-style case of arbitrary
      strings never throwing.
- [x] 2.3 Add the parser registry keyed by app package with the generic parser as fallback;
      verify with `parse.test.ts` scenario "A registered parser takes precedence over the
      generic one" using a test-registered parser.

## 3. Watches and чернетки

- [x] 3.1 In `src/notifications/draft.ts`, implement the watch model: a watch joins one
      package to one **existing** рахунок and takes that рахунок's currency from it rather than
      being told one, adding a watch for an already-watched package or for a рахунок that does
      not exist is a typed rejection, two packages may share a рахунок; verify with
      `src/notifications/draft.test.ts` scenarios "A watched app maps to its рахунок", "A
      second watch on the same package is rejected", "A watch on a рахунок that does not exist
      is rejected" and "A watch takes its рахунок's currency".
- [x] 3.2 Implement `processCapture`'s ignored and duplicate outcomes (D7): unwatched package
      → ignored with no fingerprint remembered; fingerprint already seen → duplicate; verify
      with `draft.test.ts` scenarios "An unwatched app's notification yields nothing" and
      "The same notification does not draft twice", plus "A dismissed чернетка stays
      dismissed" and "A deleted транзакція stays deleted" expressed as: a fingerprint in the
      seen set yields nothing regardless of what became of the earlier чернетка.
- [x] 3.3 Implement drafting: a parsed movement in the рахунок's currency proposes a витрата
      (money out) or a дохід «Без джерела» (money in); unparsed proposes a raw чернетка with
      no сума, and a movement in another currency proposes a raw чернетка that keeps the
      parsed сума as its original-currency reference; the date comes from the injected
      `dateOf(epochMs)` port in ctx, mirroring mono's `ParseStatementContext` (D7, D9 — the
      engine never touches `Date`); verify with `draft.test.ts` scenarios "Money out proposes
      a витрата", "Money in proposes a дохід «Без джерела»", "An unparsed watched
      notification is kept raw", "A foreign-currency parse becomes a raw чернетка keeping the
      reference" and "A чернетка moves no money".
- [x] 3.4 Implement auto-confirmation at drafting (D8): a parsed money-out movement matched
      by `matchRule` (description = the joined text, no MCC) yields the auto-confirmed
      витрата of the правило's category via `expenseByDefault`; verify with `draft.test.ts`
      scenarios "A recognised merchant confirms itself", "An MCC-only правило does not
      auto-confirm", "Money in never auto-confirms" and "A raw чернетка never auto-confirms".

## 4. Confirmation and dismissal

- [x] 4.1 Implement `confirmDraft` (D7, D8): re-runs `matchRule` at the confirmation moment,
      builds the витрата through `expenseByDefault` (omitting categoryId when no правило
      matches, so «Без категорії» stays the domain's default) or the дохід with
      `UNSOURCED_SOURCE_ID` exactly as `mapStatement` builds one, carries the чернетка's text
      as опис and the чернетка's date; a raw чернетка without a supplied сума is a typed
      rejection, with one it confirms as a витрата in the рахунок's currency, carrying any
      original-currency reference as the витрата's informational original-currency amount;
      verify with `draft.test.ts` scenarios "Confirming an unmatched витрата lands in
      «Без категорії»", "A правило added after drafting is honoured at confirmation",
      "Confirming a дохід-чернетка keeps «Без джерела»", "A raw чернетка needs the owner's
      сума", "A raw чернетка confirms with the owner's сума" and "A foreign reference rides
      the confirmed витрата as information".
- [x] 4.2 Implement `dismissDraft` and the defaults-only invariant: dismissal settles the
      чернетка and creates nothing, and no path in the engine yields any транзакція type but
      витрата or дохід «Без джерела»; verify with `draft.test.ts` scenarios "Dismissal
      creates nothing", "An ATM withdrawal is a витрата until retyped" and "A «повернення»
      notification is money in, never a повернення verdict".
- [x] 4.3 Prove determinism and offline processing end to end: running `processCapture` twice
      over the same capture, watches, fingerprints, правила, `newId` and `dateOf` decides
      deep-equal outcomes; verify with `draft.test.ts` scenario "Processing is offline and
      deterministic", and verify the offline discipline by listing every import in
      `src/notifications/*.ts` in the completion note — each must resolve inside
      `src/notifications/` or `src/domain/`, with no fetch, no Drizzle, no React (the
      diff-reviewer re-checks this against design D2).

## 5. Verification

- [x] 5.1 Run `npm run verify` and paste the final lines
- [x] 5.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
