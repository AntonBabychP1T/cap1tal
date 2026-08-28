# monobank-sync-screen — proposal

## Why

The monobank engine can already read accounts and statements, map them into транзакції and
compute a коригування, but the app has no way to keep the owner's token, link those bank accounts
to рахунки, run the sync, or show its result. Until that path exists, monobank activity is still
entered by hand and both product questions — where the money went and how much is left — can be
wrong or stale.

## What Changes

- Add a «monobank» section under «Налаштування» where the owner can enter, replace or remove the
  personal API token. A token is accepted and kept only after client-info validates it; it is
  stored only on the device, never displayed again, logged, backed up or written to SQLite.
- Show every card and банка available to the validated token, including its currency, bank name,
  баланс банку and whether it is linked. Invalid-token, rate-limited and unavailable outcomes are
  distinct visible states with safe retry paths.
- Let the owner link each monobank account to one existing same-currency рахунок or create a new
  рахунок with the bank name, currency and suggested вид prefilled. The owner confirms the sync
  start date for each new link so an existing Saldo history is not silently imported again; an
  unlinked account stays visible and takes no part in sync.
- Add an explicit sync action and progress/result state. Sync imports every new statement item of
  every linked account at most once, advances a per-link cursor only after the corresponding data
  is stored, and leaves a failed window retryable. A first sync starts at the confirmed boundary;
  later syncs resume from the saved cursor.
- Persist links, cursors, imported monobank item ids, imported transaction descriptions and the
  latest fetched баланс банку in append-only SQLite migrations. Importing one statement answer is
  atomic: its транзакції, seen ids, bank balance and cursor either all advance or none do.
- Show an imported транзакція's опис in the latest feed and while editing it, so an owner can tell
  what an uncategorised merchant or «Без джерела» arrival actually was before retyping it.
- Seed the reserved джерело «Без джерела» so a positive imported item always resolves to a real,
  visible source that can be corrected by retyping.
- Extend «Рахунки» so a linked рахунок shows its latest баланс банку beside its розрахунковий
  баланс and offers «Звірити». Accepting it creates the already-specified коригування for the
  difference; it never overwrites the розрахунковий баланс.

Scope is the foreground, owner-visible monobank flow: token setup, account linking, manual sync,
status, stored results and reconcile. Non-goals are background execution or push notifications,
cross-source duplicate detection against Saldo rows, automatic pairing of two statement legs into
a переказ, webhooks, other banks' APIs, cloud/device sync, backup of the token, and initiating any
payment or transfer. This deliberately keeps vision §13.4 (a hold is not a separate state), §13.7
(no additional bank API or SMS), §13.9 (no cloud sync), §13.12 (the app never moves money), §13.14
(no push notifications) and §13.15 (no iOS build in this change, while storage and domain seams
remain portable).

## Capabilities

### New Capabilities

- `monobank-sync-screen`: the owner-visible setup and sync flow — token validation, complete
  account/link visibility, first-sync boundary, progress, typed failures and safe retry.

### Modified Capabilities

- `settings-screen`: add the «monobank» management section and its route.
- `accounts-screen`: show баланс банку and offer «Звірити» for a linked рахунок.
- `main-screen`: show an imported транзакція's informational опис in the feed and editor.
- `monobank-sync`: define end-to-end cursor advancement, atomic window commits and retry behaviour
  when the existing pure engine is run against stored links.
- `categories`: seed and protect the reserved джерело «Без джерела» used by imported доходи.
- `persistence`: store links, sync cursors, imported item ids, bank balances and transaction описи,
  while keeping the token in device secure storage rather than SQLite or backups.

## Impact

- New Expo route and UI/view-model code for the monobank setup, link and sync states; existing
  settings, accounts, feed and transaction-edit routes gain navigation, linked-account
  presentation/actions and imported descriptions.
- New repositories and append-only Drizzle migrations for monobank metadata and transaction
  описи; the existing account, transaction, category, source and rule repositories participate in
  atomic sync commits.
- The existing `src/monobank/` API, link, window-planning and mapping engine becomes the domain
  core of an effectful foreground coordinator; network tests remain stubbed and Node-only.
- Add a platform secure-storage adapter backed by an Expo native secure-storage module. No
  analytics, server, account/login system, cloud storage or new outbound endpoint is introduced;
  the only authenticated connection remains the monobank personal API.
