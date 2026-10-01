# monobank-connect-flow — tasks

## 1. The token page and the clipboard

- [x] 1.1 Add `expo-clipboard` to the app's dependencies at the SDK 57 version and confirm in the
      completion note that it needs no config plugin, no Android permission and no `app.json`
      entry (design D2); `npm run verify` stays green with the dependency added and unused.
- [x] 1.2 In `src/ui/monobank-screen.ts`, add `MONOBANK_TOKEN_PAGE_URL` (D1) and the pure
      `tokenCandidate(text)` filter — trim the ends, accept 30–64 characters of `A–Z a–z 0–9 _ -`,
      reject everything else (D3) — plus the one line the screen says when the clipboard held no
      token; verify with `src/ui/monobank-screen.test.ts` covering requirement "Getting a token
      starts inside the app" scenarios "A copied token is offered and validated on return" and
      "An unrelated clipboard is not sent to the bank" (a sentence, a URL, an empty string and a
      value with an inner space are all rejected), and assert the URL is monobank's own page.
- [x] 1.3 Wire the token card in `src/app/manage/monobank.tsx`: «Отримати токен у monobank» opens
      `MONOBANK_TOKEN_PAGE_URL` in the in-app browser, and its dismissal reads the clipboard
      exactly once, filling and submitting a candidate through the existing `connection.submit`
      or saying the clipboard held no token; add «Вставити з буфера» to the entry state. No other
      code path reads the clipboard — requirement "The clipboard is read only when the owner
      asks", scenarios "Opening the screen reads nothing" and "Pasting is available while typing"
      (the screen has no test file; the completion note lists every clipboard call site).

## 2. Link proposals

- [x] 2.1 In `src/monobank/link.ts`, add name normalisation and the four-signal score of D5
      (last-four digits, equal names, whole-word containment of four characters or more, a shared
      word of four characters or more); verify with `src/monobank/link.test.ts` covering
      requirement "Unlinked monobank accounts are given link proposals" scenario "A matching
      рахунок is proposed by name" and one case per signal, including that a рахунок of another
      currency and an archived or already-linked рахунок are never candidates.
- [x] 2.2 Add `suggestLinks` returning one proposal per unlinked monobank account — existing
      рахунок, new рахунок from `newAccountDraft`, or `ambiguous` naming the tied candidates —
      with a рахунок proposed at most once across the whole set (D5); verify with `link.test.ts`
      scenarios "Two equally matching рахунки propose nothing", "An unrecognised account proposes
      a new рахунок" and "One рахунок is never proposed twice", plus that the result is
      deterministic for the same input and that balances change nothing.

## 3. Accepting the set

- [x] 3.1 Add `monobankRepo.linkMany` — accepted proposals plus one `syncStartDate`/`cursorMs`,
      every link and every created рахунок inside one `db.transaction`, each validated by
      `validateLink` (D6); verify with `src/db/monobank-repo.test.ts` covering requirement "The
      proposed links are accepted as one reviewed set" scenarios "Accepting the set links every
      proposal at once" and "A refused member leaves nothing behind" (a set whose second member
      is invalid leaves zero links and zero new рахунки).
- [x] 3.2 In `src/ui/monobank-screen.ts`, add the pure rows the review list shows — one line per
      proposal naming the monobank account, what it would become and why — and the sentence the
      whole set is confirmed with, reusing `boundaryConfirmation`'s promise about pre-boundary
      items and Saldo overlap; verify with `monobank-screen.test.ts` that an ambiguous proposal
      names its candidates and offers no target, and that the confirmation names the boundary and
      the number of links.
- [x] 3.3 Wire the proposals into `src/app/manage/monobank.tsx`: a review card above the account
      list with one boundary field, per-proposal accept/refuse/override through the existing
      picker, and one «Приєднати все» that confirms and calls `linkMany`; the existing per-row
      path stays exactly as it is — requirement "Linking is an explicit same-currency decision
      with a sync boundary" scenario "A proposal can be overridden before it is accepted", and
      "The proposed links are accepted as one reviewed set" scenario "A proposal is not a link".

## 3b. The invariant nothing was holding

- [x] 3b.1 «The clipboard is read only when the owner asks» is a pure negative — never on opening a
      screen, never on a timer, never in the background — and both its scenarios had no test at
      all. Task 1.3 excused that with "the screen has no test file"; that excuse expired when
      `src/ui/onboarding-screen.test.ts` started reading a `.tsx` by path to hold exactly this kind
      of property. `src/ui/monobank-screen.test.ts` now reads `src/app/manage/monobank.tsx` and
      asserts that `Clipboard.*` appears exactly twice, that neither occurrence is inside
      `useFocusEffect`/`useEffect`/`setInterval`/`setTimeout` — matched paren by paren, so an
      import of the same name cannot stand in for the block that runs — and that every read is fed
      straight to `tokenCandidate`, so the raw clipboard is never what the bank is asked about.
      Requirement: «The clipboard is read only when the owner asks», scenarios "Opening the screen
      reads nothing" and "An unrelated clipboard is not sent to the bank".
      Mutation-checked: a `Clipboard.getStringAsync()` moved into the focus effect turns both red.

## 4. Verification

- [x] 4.1 Run `npm run verify` and paste the final lines —
      `Test Files 89 passed (89) / Tests 1407 passed (1407)`,
      `✔ verify passed (66ad4fc4b0eef3dae9726ae5606b48ef1ab3e394)`
      (was `58 / 927` at `9b5012bc…`, a tree older than task 3b.1's own tests.)
- [x] 4.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS — first pass FAIL on
      one CRITICAL («The clipboard is read only when the owner asks» held by nothing), closed by
      task 3b.1; re-review **PASS (0 critical, 7 warning)** on
      `✔ verify passed (66ad4fc4b0eef3dae9726ae5606b48ef1ab3e394)`.

## 5. Emulator smoke — outstanding, and why

- [ ] 5.1 **This change may not be archived yet.** Four of its scenarios name the emulator as their
      closing evidence — «A copied token is offered and validated on return», «Pasting is available
      while typing», «A proposal is not a link» and «A proposal can be overridden before it is
      accepted» — and the reviewer added a fifth reason: on Android 10+ the clipboard read fires
      the moment `WebBrowser.openBrowserAsync` resolves, while focus is still returning from the
      Custom Tab, so it can answer `''` and send the owner down `CLIPBOARD_NO_TOKEN` even though
      they did copy a token. That is the change's headline path and only a device shows it.
      The agent cannot run this smoke: it needs a real monobank token pasted into the app, and
      entering a credential is not something the agent does. It is the owner's to run.
