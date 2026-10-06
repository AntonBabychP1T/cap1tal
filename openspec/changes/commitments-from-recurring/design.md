## Context

See proposal.md — Why. What exists today and shapes the approach:

- `src/observations/price-change.ts` already decides «regular payment»: per description key (the folded опис) and
  currency, the largest витрата in each of the three calendar months before the month read
  (`largestPerMonthByKey` in `src/analysis/trends.ts`), their median (`medianOf`), each within
  `PRICE_BAND_BP` (5 %) of it (`withinBand` in `src/observations/window.ts`). The key the
  screens pass today is `merchantOfDescription` (the folded опис). `largestPerMonthByKey` returns
  only the `Money`, not the транзакція, and breaks equal amounts by row order.
- `src/domain/commitments.ts` holds the зобов'язання domain (графік, states, matching,
  `recognisedAs`, `owedByCurrency`, `freeAfterCommitments`); `src/db/plans-settle.ts` settles both
  plans in one write; `src/ui/installment-upkeep.ts` `settleAndReassert` settles and re-asserts the
  розстрочка warnings; it is called from launch, the background monobank run, restore and the
  plan screens' focus (`src/hooks/installment-ports.ts`, `src/app/manage/*.tsx`,
  `src/app/commitment/[id].tsx`, `src/app/installment/[id].tsx`).
- `src/reminders/installment-schedule.ts` + `src/reminders/notices.ts` plan the розстрочка warning:
  one constant notice, an id per дата under a prefix, cancel-all-then-arrange, through the
  `LocalNotificationsPort` (`scheduleAt`, `cancelDaily`, `scheduledIds`, `permission`).
  `installment_reminder` holds `enabled` (travels) and `asked` (this phone's own; does not travel).
- `src/ui/month-screen.ts` derives «Вільно після зобов'язань» from `freeAfterCommitments`; Головний's
  month card is built in `src/ui/home-dashboard.ts` / `home-data.ts` and today reads no plan.
- Storage: 13 committed migrations, `BACKUP_SCHEMA_VERSION = 13` with the journal tripwire in
  `src/backup/format.test.ts`; the «Не дубль» answers (`duplicate_answers`) are the precedent for a
  stored owner's answer next to computed facts, carried as an optional бекап section.

## Goals / Non-Goals

**Goals:** one regularity test shared by the спостереження and the пропозиція; a пропозиція that is
pure and computed when shown; the declined answer and the switch stored with one append-only
migration; the зобов'язання warning planned exactly like the розстрочка's; Головний reading the
same function Місяць reads.

**Non-Goals:** no new native module, no new permission (POST_NOTIFICATIONS is already requested by
the existing reminders), no package.json, app.json or config-plugin change; no change to the
розстрочка warning's ids, text or switch; no change to the dashboard widget registry or layout
schema.

## Decisions

### D1. The regularity test is extracted, not copied

A new pure module `src/domain/regular-charges.ts` — `regularCharges(transactions, month, currency,
keyOf)` — returns, per description key, the three monthly largest **транзакції** (equal amounts broken by the
earlier дата, then the id, as the spec states) and their median, only when all three lie within
the band. The band constant, `PRICE_PRIOR_MONTHS`, the median and the within-band test move into
that domain module (`src/observations/thresholds.ts` and `window.ts` re-export them, so their
callers keep compiling), and `src/observations/price-change.ts` imports from `src/domain/` — the
direction every other feature module already depends in. No `src/domain/` file imports
`src/observations/` or `src/analysis/`, so no cycle. `priceChanges` is rewritten on top of it (its tests must stay green unchanged), and
the пропозиція detector uses it too. A retuned band (sibling `observations-by-weight`) therefore
moves both at once — intended: one meaning of «regular».
*Alternative:* re-implement the loop beside the commitments domain — rejected, two definitions
would drift. *Alternative:* reuse `largestPerMonthByKey` as is — rejected, it loses the транзакція
the prefill needs and its tie-break depends on row order.

### D2. The пропозиція detector lives in `src/domain/commitment-suggestions.ts`

Pure, takes `today`, the ledger (stored history), зобов'язання with facts, розстрочка facts
(links only), рахунки (archived flag), the declined set and a `merchantKeyOf`. Output:
`CommitmentSuggestion { merchantKey, currency, name, latest: TxRef, amount: Money, proposed:
CommitmentInput }`, ordered as the spec says. «Covered» uses the existing `recognisedAs` for an
unstopped зобов'язання and the link tables of both plans. The name is produced by the same
function the transaction line uses for its title, injected so the domain stays React-free. It imports only
`src/domain/` (D1), so the domain rule (no React/Expo/db, no feature module) holds.
The proposed ознака rule (only when the three сум differ; the latest опис trimmed, ≥ 3 chars) is
chosen because without an ознака a moving сума never links, while with one an exact-сума payment
would gain nothing but the risk of linking an unrelated purchase with the same опис.

### D3. The «Ні» is stored, keyed by description key and currency

**Decision:** stored. Not storing it would re-ask every time the screen opens, which turns a
one-off question into nagging; the «Не дубль» precedent already says an owner's answer to a
computed fact is stored, survives a restart and travels in the бекап.

New table `commitment_suggestion_declines(merchant_key text NOT NULL, currency text NOT NULL,
declined_at integer timestamp_ms NOT NULL, PRIMARY KEY(merchant_key, currency),
CHECK(length(merchant_key) > 0), CHECK(currency GLOB '[A-Z][A-Z][A-Z]'))`. No foreign key: a
description key is not a row, and it is deliberately not called продавець — the glossary's
продавець is the named entity, which groups several описи. `merchant_key` is the key the detector grouped by at decline time
(today the folded опис — text already held in the транзакції, so the table adds no new class of
data to the device or the бекап). Repository `src/db/commitment-suggestions-repo.ts` with
`list()`, `decline(key, currency, at)` (idempotent upsert), `forget(key, currency)`, and
snapshot/restore hooks in `backup-repo.ts`.
*Alternatives:* key by транзакція id (lost when the owner deletes that month's витрата, so the
пропозиція would come back); key by продавець entity id (the detector does not group by it today, see
risks); expire the answer after N months (no owner input asked for it — open question).

### D4. The нагадування switch is a column on `commitments`

`ALTER TABLE commitments ADD remind integer NOT NULL DEFAULT 0` (boolean mode) in the same new
migration as D3. Per-зобов'язання, default off (the owner's decision of 2026-10-06 asks for the warning; off by
default, 10:00 and one switch per зобов'язання are the proposal's defaults pending confirmation —
Open Questions 1–3 — and keep vision §4's noise concern). The permission's «already asked» reuses `installment_reminder.asked`: the
system prompt is one per app, so one flag answers «has the app asked on behalf of the нагадування
про платіж» for both plans. `CommitmentInput` gains no field — the form does not carry the switch;
the opened зобов'язання toggles it through `commitmentsRepo.setRemind(id, on)`, which also counts as
a change that re-asserts (D5). Припинити and Відновити leave `remind` untouched: a stopped зобов'язання simply has no
expected платіж to warn about, and a resumed one warns again by the switch it kept.
*Alternative:* one global switch like the розстрочка's — rejected: on, a dozen підписки are noise;
off, оренда gets no warning; the owner's decision names no switch, so per plan is a default (Open
Question 3), and it is the archived `commitments` change's own follow-up.

### D5. Warnings: a second notice kind, the same upkeep

`src/reminders/notices.ts` gains `COMMITMENT_DUE_NOTICE` (id `commitment-due`, title «Завтра платіж
за зобов'язанням», body «Перевірте, чи вистачить грошей на рахунку списання.», route
`/manage/commitments`), `commitmentDueId(date)`, `isCommitmentDueId`. New
`src/reminders/commitment-schedule.ts` mirrors `installment-schedule.ts`:
`planCommitmentReminders` (cancel every held `commitment-due-*`, arrange one per wanted дата at
10:00 the day before, only `remind` + not stopped + `expected` + still ahead, permission granted).
`settleAndReassert` re-asserts both kinds; its `only: 'if-changed'` gate becomes «either plan
changed». The commitments screen and the opened зобов'язання call it after every edit, stop,
resume, delete, mark, link and switch. Two notifications on a дата with a розстрочка платіж and a
reminded зобов'язання платіж are accepted (open question). `routeOf` already restricts taps to
known routes; `/manage/commitments` is added to the known set.

### D6. Головний reads `freeAfterCommitments` through the same inputs as Місяць

`home-data.ts` gains the plan inputs (installments + facts, commitments + facts) only when the
month widget is visible (`needsMonthTransactions` gate); the screen's focus runs the settle first
(the linking requirement says a платіж is linked before «Вільно після зобов'язань» is counted), via
`settleAndReassert(…, { only: 'if-changed' })` as the plan screens do. `home-dashboard.ts` maps the
per-currency reading under each currency's витрачено with `FREE_AFTER_COMMITMENTS_LABEL`; a reading
for a currency the card does not show is dropped. One function, so Головний and Місяць cannot
disagree.

### D7. Місяць's line and the screen's undo

`src/ui/month-screen.ts` gains `suggestionsLine` (count only, current month only). The «Зобов'язання»
screen model (`src/ui/commitments-screen.ts`) gains the suggestion rows and a transient
«declined» row held in screen state (not stored), whose «Скасувати» calls `forget`. «Записати»
pushes the form with `proposed` as its initial values (`src/ui/commitment-form.ts` gets an
`initialFrom(proposed)` beside the empty start); storing goes through the existing create path, so
every refusal and the back-gesture discard apply unchanged.

### D8. Бекап

`BackupCommitments.plans[*]` gains optional `remind?: boolean` (absent → false on restore).
New optional top-level section `commitmentSuggestionDeclines: { merchantKey, currency, declinedAt
}[]`; validation refuses an empty key, an unknown currency code, or a repeated (key, currency).
`BACKUP_FORMAT_VERSION` stays 2 (optional additions only); `BACKUP_SCHEMA_VERSION` becomes its current value + 1,
equal to the journal length after `db:generate` (13 + 1 if no sibling lands first); `commitment_suggestion_declines` joins the carried table list, and the
`installment_reminder.asked` exclusion stays as it is.

## Risks / Trade-offs

- [The main observations spec (price-change requirement) says it groups by the glossary's
  продавець, while the code (`observations.ts`, `merchantOfDescription`) groups by the folded
  опис] → the two disagree today; reconciling them is out of scope. This change defines its own
  description key (the folded опис) and does not depend on which one observations ends up with;
  D1 shares only the band and the per-month largest charge, with the key passed in.
- [The grouping changes — the detectors move from the folded опис to the glossary's продавець
  entity] → a stored decline keeps its old key, which then matches nothing, so the regular payment
  is asked anew once (the spec states this). Accepted; the change that switches the grouping may
  map old keys to продавці where one написання recognises them, and must say so in its own spec.
- [A розстрочка the owner never recorded looks like a підписка] → it is offered; «Ні» or recording
  the розстрочка (whose links then cover it) ends it.
- [Головний now settles plans on focus] → the settle is the same single write the plan screens
  already run and is a no-op when nothing changed; measured in the smoke run against the
  `app-speed-pass` budget.
- [Two notifications at 10:00 on a shared дата] → rare; accepted until the owner says otherwise.
- [Sibling migrations] → whichever change lands second regenerates its migration and re-bumps
  `BACKUP_SCHEMA_VERSION`; the journal tripwire forces it.

## Migration Plan

One drizzle migration generated from `schema.ts` (`npm run db:generate`): the column and the table.
Test: applied to a database holding зобов'язання with links, marks, refusals and a stop — every row
kept, every `remind` false, no decline. Rollback is the app's usual: an older build ignores the
unknown table and column, and a бекап from it lacks the section and field, which restores as «off»
and «none declined».

## Open Questions for the owner

Authority: the owner's decision of 2026-10-06 (proposal). These are the details the owner did not
state — defaults this change builds, pending confirmation:

1. The warning of a зобов'язання is **off by default** (розстрочки: on).
2. It comes **at 10:00 the day before**, like the розстрочка's.
3. **One switch per зобов'язання** (D4), not one global switch.
4. «Ні» is **remembered for good**, until a restore; no list of declined пропозиції.
5. A дата with a розстрочка платіж and a reminded зобов'язання платіж: **two** notifications, or one
   combined «Завтра платіж»?
6. Пропозиції only on «Зобов'язання» and as a count on Місяць — not on Головний or in «Що потребує
   відповіді» (`answer-queue`).
7. Quarterly and yearly regular payments (страхування) are not detected; worth a detector later?
