## Why

The second question of the vision — *"I don't know how much I can still spend"* — is answered
today by залишилось: дохід minus what has already left. It knows nothing of what is certain to
leave later this month. Розстрочки already got the right exception (2026-10-01): «Вільно після
розстрочок» subtracts the month's платежі that have not been debited yet. The same principle holds
for оренда, інтернет, мобільний, підписки and страхування. Each is a payment the owner already knows
the day and the сума of. None of them reaches the reading, so on the 2nd of the month залишилось
looks as if the rent were free money.

The owner decided (2026-10-02) not to solve this with "future транзакції". A recurring транзакція
the app records by itself would break the bookkeeping truth: витрачено would count money that has
not left, and every balance would need undoing when the bank's real debit arrives. Instead the
owner asked for a separate entity on the pattern of the розстрочка: a **зобов'язання**. It is a
plan that records nothing. When the real debit arrives by the usual paths, it is linked to the
plan. Then the month can say **«Вільно після зобов'язань»**.

## What Changes

- **Owner's decision 2026-10-02: зобов'язання.** A new **зобов'язання** is a plan the owner enters
  by hand. It holds:
  - назва;
  - сума of one платіж;
  - періодичність;
  - дата першого платежу;
  - рахунок списання;
  - optionally a категорія and an ознака.

  It runs until the owner stops it. It is not a транзакція and not a рахунок. It never records,
  moves or counts money by itself. From it the app derives a графік of платежі.
- **[PROPOSED] Періодичність** is one of «щомісяця», «щокварталу», «щопівроку», «щороку».
  Платіж k falls (k − 1) × 1, 3, 6 or 12 months after the first, on its day. In a shorter month it
  falls on the month's last day, exactly as a розстрочка's графік does.
- **[PROPOSED] Any currency.** The сума is in the currency of the рахунок списання, so a підписка
  paid from the USD card is a USD зобов'язання. Nothing is converted.
- **The app links each платіж to its списання**, as it does for a розстрочка. A candidate must be:
  - a витрата on the рахунок списання, in its currency;
  - dated within three days of the платіж;
  - not linked to any платіж of any розстрочка or зобов'язання;
  - not refused for this платіж by the owner.

  **[PROPOSED]** The rest depends on the ознака:
  - without an ознака, the витрата's сума must equal the зобов'язання's сума exactly;
  - with an ознака, the bank's опис must contain it, whatever the сума. This is what lets a bill
    that varies, or a підписка charged in hryvnia at a moving rate, be recognised.

  At the moment of linking, a «Без категорії» витрата takes the зобов'язання's категорія. The owner
  can:
  - unlink (remembered);
  - pick the списання by hand within ten days, of any сума;
  - mark a платіж сплачено without one;
  - **[PROPOSED]** mark it **пропущено**, a платіж that did not and will not happen: a paused
    підписка, a waived оренда.
- **Owner's decision 2026-10-02: «Вільно після зобов'язань»** replaces «Вільно після розстрочок».
  For the current month it is залишилось minus every платіж of the month still owed. It counts
  платежі of зобов'язання and of розстрочки alike, «очікується» and «списання не знайдено». It is
  computed per currency, never converted, and is a secondary reading beneath залишилось. It changes
  no number of the monthly picture.
- **[PROPOSED] Місяць**: the «Розстрочки» block becomes «Платежі місяця». It lists every платіж of
  the month from both kinds of plan, totals per currency, and says what is still not сплачено.
  Tapping a row opens its розстрочка or зобов'язання.
- **[PROPOSED] A «Зобов'язання» screen**, opened from Налаштування, is built on the «Розстрочки»
  pattern; each платіж in the Місяць block opens its own зобов'язання or розстрочка:
  - the active ones, nearest платіж first;
  - a create/edit form;
  - one зобов'язання with its платежі and a verb per платіж;
  - «Припинити», «Відновити» and «Видалити»;
  - «Оновити суму» when the last списання differs from the сума.
- Зобов'язання and the states of their платежі are stored. They survive a restart, follow a
  рахунок through a merge, and travel in the бекап.

### Vision §14 items this change deliberately touches (owner's decision, 2026-10-02)

- **§14.6 "Recurring or scheduled transactions"**: narrowed again, not lifted. A зобов'язання's
  графік is a plan the debits are linked to, like a розстрочка's. The app never records a транзакція
  by itself.
- **§14.10 "Forecasts"**: «Вільно після зобов'язань» subtracts платежі the owner declared, with
  their own сума and дата. It is not a pace extrapolated from history, so it is no forecast.
- §6 "Not in v1: recurring or scheduled transactions" gets the same note as §14.6.

The vision (§4, §6, §8, §14) and the glossary are updated with this proposal.

## Non-goals

- Any транзакція the app records, schedules or predicts by itself. A зобов'язання counts in no
  number of its own. The one change it makes is the категорія of a linked «Без категорії» витрата,
  which then counts in that категорія like any categorised витрата.
- **Нагадування** before a зобов'язання's платіж. The day-before warning stays with розстрочки. A
  dozen підписки would make it noise, and a per-зобов'язання switch is a follow-up.
- Detecting зобов'язання from history, or offering «Записати як зобов'язання» from a recurring
  витрата or an спостереження (`observations-and-month-summary` is in flight; a follow-up can
  connect them).
- monobank «Регулярні платежі». These are the bank's standing orders that move money. The personal
  API does not expose them, and this app never moves money.
- Weekly or fortnightly періодичність, irregular графіки, a known end date entered in advance (the
  owner stops a зобов'язання when it ends), and a stop dated other than today.
- A "monthly cost of all зобов'язання" total.
- A Головний widget.
- «Вільно після зобов'язань» anywhere but Місяць.
- Зобов'язання in the AI-аналіз пакет.
- Debts to people with a графік, interest, or anything that changes how розстрочки are entered or
  linked beyond sharing the rule "one транзакція, one платіж".

## Capabilities

### New Capabilities

- `commitments`: the зобов'язання, covering:
  - its values and refusals;
  - періодичність and графік;
  - the states of a платіж (сплачено, пропущено, очікується, списання не знайдено);
  - linking by сума or ознака, and the owner's corrections;
  - editing, stopping, resuming and deleting;
  - «Вільно після зобов'язань», over зобов'язання and розстрочки, per currency.
- `commitments-screen`: the «Зобов'язання» screen, covering:
  - the list and its order;
  - the create/edit form with its refusals in Ukrainian;
  - one зобов'язання's платежі and their verbs;
  - «Оновити суму».

### Modified Capabilities

- `installments`:
  - the app's linking and the owner's hand pick skip a транзакція already linked to a
    зобов'язання's платіж;
  - the linking runs before «Вільно після зобов'язань» is counted;
  - «Вільно після розстрочок» is removed (superseded by `commitments`).
- `month-screen`:
  - the «Розстрочки» block becomes «Платежі місяця» over both kinds of plan;
  - the current month's reading becomes «Вільно після зобов'язань», in every currency group that
    owes something.
- `settings-screen`: the section «Зобов'язання» among the management sections.
- `persistence`:
  - зобов'язання and their платежі states survive a restart;
  - they refer only to what storage holds;
  - one транзакція links to one платіж across both kinds of plan;
  - they follow a merged рахунок;
  - they arrive by a new append-only migration and ride in the snapshot.
- `backup-file`: a бекап carries the зобов'язання, and is refused when they contradict it.

## Impact

- **Docs.**
  - `docs/product-vision.md`: §4 gets a new «Зобов'язання»; §6, §8 («Вільно після зобов'язань»)
    and §14.6 / §14.10 change.
  - `docs/glossary.md`: new section «Зобов'язання». In «Розстрочки», платіж, рахунок списання and
    списання widen to cover both plans. «Вільно після розстрочок» becomes «Вільно після
    зобов'язань». New distinctions are added.
  - `docs/app-overview.md`: §2, §3.3, §3.9, §4.11, a new §4.11a, §5.2 and §7 change.
- **Pure code:**
  - new `src/domain/commitments.ts` (+ test): графік, states, linking, the owed сума;
  - `src/domain/installments.ts`: the reading moves out to one function over both plans;
  - `src/domain/fold.ts` `foldCase` is reused for the ознака.
- **Storage:**
  - `src/db/schema.ts`;
  - one new migration in `drizzle/` under the next free number; `category-icons-and-transaction-
    visuals` and `observations-and-month-summary` also add one, so it is generated at apply time;
  - new `src/db/commitments-repo.ts` (+ test);
  - `src/db/installments-repo.ts` (candidates skip транзакції linked to a зобов'язання);
  - `src/db/account-merge-repo.ts`, `src/db/backup-repo.ts` (snapshot) and `src/db/repos.ts`.
- **Backup:** `src/backup/format.ts` gets a new optional section; `BACKUP_SCHEMA_VERSION` +1 and
  `BACKUP_FORMAT_VERSION` unchanged.
- **UI:**
  - `src/ui/month-screen.ts` (+ test);
  - new `src/ui/commitments-screen.ts`, `src/ui/commitment-form.ts` and
    `src/ui/commitment-detail.ts` (+ tests);
  - `src/ui/settings-sections.ts`;
  - `src/ui/installment-upkeep.ts`, which settles both plans;
  - routes `src/app/manage/commitments.tsx` and `src/app/commitment/[id].tsx`;
  - `src/app/(tabs)/month.tsx`, `src/app/_layout.tsx`.
- **Dependencies, native code, permissions, network:** none.
- **Overlaps.** None of these modifies a requirement this change modifies; they add requirements
  to the same capabilities, and each adds a migration and backup tables, so whichever archives
  later rebases its migration number and `BACKUP_SCHEMA_VERSION`:
  - `category-icons-and-transaction-visuals` (ADDED in `month-screen`, `settings-screen`,
    `persistence`, `backup-file`);
  - `observations-and-month-summary` (ADDED in `month-screen`, `persistence`, `backup-file`; its
    "regular payment whose price changed" detector reads history and is distinct from a
    зобов'язання the owner declares);
  - `merchant-normalization` (ADDED in `settings-screen`, `persistence`, `backup-file`). It makes
    продавець an entity with написання; a follow-up may let an ознака name a продавець instead of
    a piece of the опис;
  - `local-model-guesses` (ADDED in `settings-screen`, `persistence`, `backup-file`);
  - `voice-entry` (no shared capability).
