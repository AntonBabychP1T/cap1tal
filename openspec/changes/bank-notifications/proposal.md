# bank-notifications — proposal

## Why

monobank now syncs itself, but every other bank the owner holds an account at has no API the
app may use (vision §13.7) — those transactions are still typed by hand or lost. Step 8 of
tech-task §5 (FR-S3) closes what the milestone list calls "закрита головна болячка": push
notifications the other banks' apps already show on the phone are read on the device, parsed
into чернетки транзакцій, and become витрати of the right рахунок after one confirming tap —
or automatically when a правило recognises the merchant. Both product questions gain from it:
"where the money went" stops missing whole banks, and "how much is left" stops flattering the
owner. Nothing read ever leaves the device (vision §12).

Like steps 6 and 7, this step is too big for one change, and the same split worked twice: this
change is the **engine** — everything about notification capture that is pure TypeScript, from
a captured notification record and the owner's stored правила to чернетки and транзакції ready
to store; no I/O, no React, no Drizzle, no Android. A follow-up change
(`bank-notifications-screen`) adds the Android notification-listener platform adapter behind
`src/platform/`, the migrations and repos, the Налаштування section where the owner grants
notification access and maps watched apps to рахунки, and the Головний screen surface where
чернетки are confirmed or dismissed.

## What Changes

- **New capability `bank-notifications`** — the pure engine in `src/notifications/` (sibling
  of `src/monobank/`, same style: total parsing, typed outcomes, floats nowhere):
  - **Captured notification model**: what the platform listener will deliver — the posting
    app's package name, the moment it was posted, its title and text. That record is the
    engine's only input from the phone; everything else it needs (watched apps, правила) is
    the owner's stored data.
  - **Watched-app model**: the owner watches a chosen set of apps, each mapped to exactly one
    рахунок; one app maps to one рахунок and the mapping carries the рахунок's currency. A
    notification from an app that is not watched SHALL be ignored entirely — not parsed, not
    stored, not counted. Watching is opt-in per app, which is how privacy stays enforceable:
    the app reads only what the owner pointed it at.
  - **Parsing**: a parser takes a captured notification and yields either a parsed movement —
    direction (money out / money in), сума in integer minor units with its currency, and the
    merchant/description text — or "unparsed". Parsers are registered per app package with a
    generic Ukrainian-bank-notification parser as the fallback; this change ships the generic
    parser and the registry seam, and per-bank parsers are added later from real notification
    samples as pure additions (new parser + tests, no spec change). Parsing is total: hostile
    or alien text yields "unparsed", never a throw and never a half-read movement.
  - **Чернетка lifecycle**: a parsed movement on a watched app becomes a чернетка on the
    mapped рахунок — a draft транзакція awaiting the owner's word. Money out proposes a
    витрата; money in proposes a дохід «Без джерела» (the reserved джерело seeded by
    monobank-sync-screen — a starting state, never a verdict). A watched notification the
    parsers cannot read still becomes a raw чернетка carrying the notification text and no
    сума, so a format change at a bank degrades to manual entry, never to silent loss.
    Confirming a чернетка creates the транзакція (категорія via правила, else
    «Без категорії»; the опис is the merchant text); dismissing it creates nothing and it
    never returns.
  - **Auto-confirmation за правилом**: a parsed money-out чернетка whose merchant text is
    matched by one of the owner's правила SHALL confirm itself into a витрата of the rule's
    category without waiting — FR-S3's "або автоматично за правилом". Money in never
    auto-confirms (правила target expense categories only), and an unparsed чернетка never
    auto-confirms (there is no сума to trust).
  - **Deduplication**: notifications carry no bank item id, so the engine fingerprints each
    captured notification (app, posted moment, title, text) and a fingerprint once seen never
    yields a second чернетка — even after the чернетка was confirmed, dismissed, or the
    транзакція it created was deleted. Android re-posting an updated notification is the
    common case this kills.
  - **Currency discipline**: a сума is attached to a чернетка only in the mapped рахунок's
    currency. A parse that names any other currency (a foreign purchase notification showing
    the original amount) yields a raw чернетка carrying the text and that parsed сума as an
    original-currency reference — FR-T7's answer (the витрата is what the bank charged) needs
    the charged сума the owner supplies on confirmation, and the named foreign сума rides the
    confirmed витрата as its informational original-currency amount, exactly as the
    transactions spec already requires of a source that names the currency.

Non-goals of this change (deliberate, most land in `bank-notifications-screen`):

- No screens, no storage, no migrations: nothing here writes to the database or renders.
- No Android code, no notification-listener service, no permission flow — the capture
  adapter is the screen change's decision; here a captured notification is a function
  argument, exactly as the monobank token was.
- No per-bank parsers yet: real notification texts are the owner's personal data on the
  owner's phone; formats guessed without samples are untested code. The generic parser plus
  the raw-чернетка fallback make every bank capturable from day one; per-bank parsers arrive
  as samples do.
- No SMS parsing and no other banks' APIs (vision §13.7); no push notifications sent by the
  app itself (vision §13.14); the app only ever reads.
- No watching of the monobank app: mono is captured by its API with real ids and balances;
  a second, weaker capture path for the same рахунок would only manufacture duplicates. This
  is a named obligation on `bank-notifications-screen`, not a hope: its spec MUST require the
  watched-app picker to refuse the monobank package, or the exclusion silently dies there.
- No inference of переказ, інвестиція, повернення or відсотки from a notification — a
  чернетка confirms into the default types (витрата / дохід «Без джерела») and the owner
  retypes, exactly as monobank-sync already prescribes.

## Capabilities

### New Capabilities

- `bank-notifications`: the engine that turns another bank app's push notification into the
  app's truth — the captured-notification and watched-app models, total per-app parsing with
  a generic fallback, the чернетка lifecycle (propose, confirm, auto-confirm за правилом,
  dismiss), fingerprint deduplication, and the currency discipline that keeps every сума in
  the рахунок's own currency.

### Modified Capabilities

<!-- none: чернетки are a new entity with a new capability; the транзакції their confirmation
     creates are ordinary витрати and доходи «Без джерела» with an опис, all already
     specified; categorisation-rules already names bank notifications as an import source
     and its matching contract is input-agnostic. -->

## Impact

- New code: `src/notifications/capture.ts` (captured-notification model, fingerprinting),
  `src/notifications/parse.ts` (generic parser, parser registry), `src/notifications/draft.ts`
  (watched-app model, чернетка lifecycle, auto-confirmation); names indicative, final layout
  in design.md.
- Touched code: none expected — правила matching is reused as the pure function
  categorisation already exports, «Без джерела» is the existing reserved джерело, and the
  transaction shapes confirmed чернетки produce already exist.
- No new dependencies, no schema change, no migration; `npm run verify` stays Node-only and
  under a minute. No network is touched anywhere in this change — the engine's input is a
  record, and tests feed it records.
