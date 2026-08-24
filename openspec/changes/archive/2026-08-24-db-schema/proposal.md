# db-schema

## Why

domain-core gave the product pure types and rules, but nothing survives an app restart: there is
nowhere to keep accounts and transactions. Both product questions — where the money went and how
much is left — need months of history on the device, so persistence is the next step
(tech-task step 2, FR-A2 "збереження"). This change also delivers the computed balance
(розрахунковий баланс), the first behaviour that needs stored history: opening balance plus every
transaction since (FR-A2).

## What Changes

- Drizzle schema in `src/db/schema.ts`: an `accounts` table and a single `transactions` table
  covering all five transaction types, faithful to the domain shapes (integer minor units + currency
  code, two legs for transfers, informational original-currency amount).
- First generated migration in `drizzle/` plus a test that applies all migrations to an empty
  in-memory SQLite and asserts the resulting shape.
- `Account` gains an opening balance, and the domain gains a computed-balance function:
  opening balance plus the effect of every transaction touching the account (FR-A2). Balances that
  transactions cannot explain do not exist.
- Repositories in `src/db/`: save/load accounts, save/load/delete transactions, list a calendar
  month's transactions (feeding the monthly picture), list an account's transactions (feeding the
  computed balance). Rows map to the existing domain types.
- Test wiring on in-memory SQLite (`better-sqlite3` dev dependency) with the real migrations
  applied; runtime wiring for `expo-sqlite` that applies migrations at app startup.

Non-goals: no screens or UI (change 3), no categories/sources tables or seeded rows — reserved ids
`fees` / `correction` / `uncategorised` stay plain identifiers until categories-rules (change 5),
no account archiving behaviour (change 3), no monobank sync, no backup export/import, nothing from
vision §13.

## Capabilities

### New Capabilities

- `persistence`: accounts and transactions are stored on the device and survive a restart;
  every transaction type round-trips through storage unchanged; migrations are append-only and
  bring an empty database to the current shape; stored history can be read back for one calendar
  month and for one account.

### Modified Capabilities

- `accounts`: adds the computed balance requirement — an account has an opening balance, and its
  balance is always computed as opening balance plus the effect of every transaction touching it
  (FR-A2); no stored balance exists.

## Impact

- New: `src/db/**` (schema, client, repositories, tests), `drizzle/` (first migration),
  `babel.config.js` and `metro.config.js` (Expo config for bundling the migrations SQL).
  `drizzle.config.ts` is already committed.
- Modified: `src/domain/account.ts` (+ tests) — opening balance and computed balance;
  the root layout in `src/app/` — applies migrations at startup and, if they fail, renders a
  minimal message instead of the tabs (the splash overlay must still mount, or the native splash
  never lifts); this is wiring, not a screen — screens remain change 3;
  `.claude/rules/database.md` — the [PROPOSED] instants rule gains the calendar-date convention
  (transaction dates are TEXT `YYYY-MM-DD`, matching the domain's IsoDate).
- Dependencies: `better-sqlite3` (+ types) as dev dependency for tests; runtime uses the already
  installed `expo-sqlite` and `drizzle-orm`.
- `npm run verify` stays Node-only: tests run against in-memory better-sqlite3, never the emulator.
