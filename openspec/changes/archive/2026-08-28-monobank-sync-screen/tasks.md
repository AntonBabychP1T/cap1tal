# monobank-sync-screen — tasks

Every network answer, token and timer in tests is synthetic. No task may add a real token, live
request, native build, emulator or real 60-second wait to `npm run verify`.

## 1. Reserved source groundwork

- [x] 1.1 Add the glossary entry and domain/list rules for reserved джерело «Без джерела»:
      reserve `UNSOURCED_SOURCE_ID`, keep it out of manual source choices, and keep «Відсотки»
      pickable. Tests in `src/domain/category.test.ts` and `src/ui/category-choices.test.ts`:
      "Scenario: The imported-arrival source may be neither edited nor picked", "Scenario:
      App-only rows exist but are never pickable", "Scenario: An accepted відсотки proposal lands
      in the seeded row", "Scenario: The reserved джерело may be neither renamed nor archived",
      "Scenario: «Коригування» exists but is never pickable", and "Scenario: An imported arrival
      lands in the seeded row".
- [x] 1.2 Add «Без джерела» to the starter set and generalise reserved-source adoption so an
      existing hand-created row is atomically adopted without losing доходи. Update
      `src/db/seed.test.ts`: "Scenario: A fresh install holds the starter set", "Scenario:
      Reopening does not duplicate the starter set", "Scenario: A hand-created reserved source is
      not duplicated", "Scenario: The owner's rename survives reopening", and "Scenario: The
      owner's archive survives reopening", while retaining "Scenario: A hand-created «Відсотки»
      is not duplicated"; update `src/db/sources-repo.test.ts`: "Scenario:
      Renaming a reserved row is rejected" and "Scenario: Archiving a reserved row is rejected".

## 2. Schema, migration and repositories

- [x] 2.1 Add nullable `transactions.description` plus `monobank_accounts`, `monobank_links` and
      `monobank_imported_items` to `src/db/schema.ts`; generate one append-only migration with
      `npm run db:generate` and regenerate `drizzle/migrations.js`. Extend
      `src/db/migrations.test.ts`: "Scenario: Existing financial data survives the migration",
      "Scenario: A fresh database supports monobank metadata but not the token", and "Scenario:
      An old transaction gains no invented description".
- [x] 2.2 Thread optional опис through transaction row mapping and every save/load path, preserving
      NULL for absence. Tests in `src/db/mappers.test.ts` and `src/db/transactions-repo.test.ts`:
      "Scenario: An imported description round-trips" and "Scenario: An old transaction gains no
      invented description" for all five transaction types.
- [x] 2.3 Implement `src/db/monobank-repo.ts` reads/upserts, same-currency link creation, atomic
      new-рахунок-plus-link creation, unlinking, durable cursors and the one-to-one constraints;
      export it from `src/db/repos.ts`. Tests in `src/db/monobank-repo.test.ts`: "Scenario: A link
      resumes after restart", "Scenario: A second active link is rejected", "Scenario: An
      existing same-currency рахунок is linked", "Scenario: Creating for a банка starts from a
      suggestion", and "Scenario: A different-currency рахунок is not a link choice".
- [x] 2.4 Implement durable imported-id reads and `commitStatementAnswer` as one SQLite transaction,
      preserving ids across transaction deletion and unlink. Tests in
      `src/db/monobank-repo.test.ts`: "Scenario: Deleting a transaction keeps its imported id",
      "Scenario: The same item id belongs separately to each bank account", "Scenario: A
      transaction failure rolls back sync metadata", "Scenario: A complete answer survives
      restart whole", and "Scenario: Relinking does not resurrect a deleted transaction".

## 3. Secure token boundary

- [x] 3.1 Install `expo-secure-store` with Expo's SDK resolver; add the explicit Android-backup
      plugin configuration to `app.json`; implement the token-store port, native
      `WHEN_UNLOCKED_THIS_DEVICE_ONLY` adapter, non-persisting web adapter and in-memory test
      adapter. Contract tests in `src/platform/monobank-token.test.ts`: "Scenario: Removing the
      token keeps imported history" (the secret is removed while supplied financial state is
      untouched) and secure-storage-unavailable returns no candidate value.
- [x] 3.2 Implement staged token validation/replacement/removal and cached-account refresh in
      `src/monobank/connection.ts`, ensuring outcomes and errors never contain the candidate or
      stored token. Tests in `src/monobank/connection.test.ts`: "Scenario: A valid token becomes
      configured without being revealed", "Scenario: An invalid replacement keeps the working
      token", "Scenario: An unavailable first validation keeps nothing", "Scenario: An invalid
      stored token asks for replacement", and "Scenario: Removing the token keeps imported
      history".

## 4. Linking and foreground sync coordinator

- [x] 4.1 Implement device-local first-date conversion and pure monobank account/link view models:
      all fetched accounts, cached/offline state, same-currency unlinked account choices, new-account
      defaults and explicit inclusive boundary confirmation. Tests in
      `src/ui/monobank-screen.test.ts`: "Scenario: Linked and unlinked accounts are both present",
      "Scenario: Each balance keeps its own currency", "Scenario: An existing same-currency
      рахунок is linked", "Scenario: Creating for a банка starts from a suggestion", and
      "Scenario: A different-currency рахунок is not a link choice"; test local-boundary conversion
      in `src/ui/dates.test.ts` under "Scenario: An existing same-currency рахунок is linked".
- [x] 4.2 Implement the successful coordinator path in `src/monobank/coordinator.ts`: capture one
      run end, load links/rules/seen ids, plan oldest-first windows, map synthetic statements,
      commit pages and resume from the persisted cursor. Tests in
      `src/monobank/coordinator.test.ts`: "Scenario: A later sync resumes after committed work",
      "Scenario: A complete run reports imported transactions", and "Scenario: Refreshing the
      bank balance changes no transaction".
- [x] 4.3 Implement 500-item continuation without advancing the high-water cursor until the whole
      window is short; make an interrupted/repeated full page harmless through durable ids. Tests
      in `src/monobank/coordinator.test.ts`: "Scenario: A later sync resumes after committed work"
      with full-page interruption, plus the existing "Scenario: A full answer continues the
      window" contract from `src/monobank/sync.test.ts` as an integration case.
- [x] 4.4 Implement injected request pacing, cancellable waiting, per-account progress and typed
      invalid-token/rate-limited/unavailable completion without a real timer. Tests in
      `src/monobank/coordinator.test.ts`: "Scenario: An API failure leaves the cursor retryable",
      "Scenario: A failed commit advances nothing", "Scenario: A partial run keeps its truth",
      and "Scenario: An invalid stored token asks for replacement".
- [x] 4.5 Hold the existing default transaction distinctions across the effectful run and never
      pair rows automatically. Integration tests in `src/monobank/coordinator.test.ts`:
      "Scenario: Two own-account legs are not paired automatically", "Scenario: Cashback is not
      silently finalised as income", and "Scenario: Lending and interest are not inferred".

## 5. Monobank management UI

- [x] 5.1 Add `/manage/monobank`, register it in the root stack, and add the «monobank» settings
      section. Update `src/ui/settings-sections.test.ts`: "Scenario: The tab opens on its
      sections", "Scenario: The import section opens the import flow", and "Scenario: The
      monobank section opens connection management".
- [x] 5.2 Build the token and account/link portions of `src/app/manage/monobank.tsx` over the tested
      connection/view-model ports: secret entry and replacement, cached refresh states, complete
      linked/unlinked inventory, existing-account choice, new-account draft and boundary
      confirmation. Keep all state/copy assertions in `src/ui/monobank-screen.test.ts` under
      "Scenario: A valid token becomes configured without being revealed", "Scenario: Linked and
      unlinked accounts are both present", and the three linking scenarios.
- [x] 5.3 Add sync start/cancel/progress/result/retry and unlink/remove-token confirmations to the
      route, with no secret in renderable state after save. Extend
      `src/ui/monobank-screen.test.ts`: "Scenario: A complete run reports imported transactions",
      "Scenario: A partial run keeps its truth", "Scenario: An invalid stored token asks for
      replacement", "Scenario: Removing the token keeps imported history", and "Scenario:
      Relinking does not resurrect a deleted transaction".

## 6. Feed and accounts integration

- [x] 6.1 Show a non-empty imported опис as secondary feed text and read-only edit context while
      preserving category/source/account labels and keeping manual rows compact. Tests in
      `src/ui/transaction-line.test.ts`: "Scenario: An uncategorised merchant can be identified in
      the feed", "Scenario: An arriving item keeps its source distinct from its description", and
      "Scenario: A manual transaction stays compact"; wire the tested view model into
      `src/app/(tabs)/index.tsx` and `src/app/transaction/[id].tsx`.
- [x] 6.2 Join linked bank metadata into the pure account-row view model and show latest known
      баланс банку beside the computed balance. Tests in `src/ui/account-groups.test.ts`:
      "Scenario: The two balances remain distinct" and currency isolation; wire rows into
      `src/app/(tabs)/accounts.tsx`.
- [x] 6.3 Add confirmed «Звірити» to linked account rows, save the existing pure `reconcile` result,
      and reload balances without ever assigning the bank value directly. Tests in
      `src/ui/account-groups.test.ts` and `src/domain/account.test.ts`: "Scenario: Reconcile
      explains a surplus" and "Scenario: Equal balances create no correction".

## 7. Gate

- [x] 7.1 Run `npm run verify` and paste the final lines
- [x] 7.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
