## Why

The deterministic tiers cover a lot: the owner's правила, the шаблон, and, after
`merchant-normalization`, продавці. What they miss still lands on the owner by hand:
- every new merchant waits in «Без категорії» until someone writes a правило;
- every new spelling waits in «Без продавця» until someone names it;
- every bank сповіщення the generic parser cannot read becomes a raw чернетка whose сума the owner
  retypes from the text sitting right above the field.

The owner decided (2026-10-02) to take a local model seriously, **as an input automator and not as
a financial adviser**. The model proposes a категорія for what the правила did not take, a clean
продавець for a messy опис, and the сума of a raw чернетка. The owner taps, and the accepted answer
becomes an ordinary правило or написання. `docs/on-device-ai-proposal.md` (A1–A3, §5) worked out
the shape. This change specifies it on top of the продавець and the stored MCC that
`merchant-normalization` introduces. Every accepted guess teaches the deterministic tiers, so the
model is asked less over time.

It serves the vision's first question, *where did my money go* (§1). Less of the month sits in
«Без категорії», fewer spellings sit without a продавець, and fewer чернетки wait for typing. The
пакет handed to a big model gets fuller as a side effect.

## What Changes

- **Owner's decision 2026-10-02: the local model only guesses, and only about input.** An
  **припущення** is what the local model proposes for one thing. There are exactly three kinds:
  - a **категорія** for a витрата in «Без категорії» that carries an опис or an MCC;
  - a **продавець** (назва and написання, or an existing продавець) for a «Без продавця» group;
  - the **сума** of a raw чернетка.

  Nothing else is ever asked of the model: no AI-аналіз, no advice, no forecast, no text of its
  own on a screen.
- **Nothing is applied without the owner's tap.** A припущення is shown as «Схоже на: Кафе», and
  only accepting it acts. Accepting is exactly the owner's own act:
  - a категорія set, which brings the existing правило offer;
  - a продавець named through the ordinary form;
  - a чернетка confirmed with that сума.

  «Ні» forgets that припущення while the thing itself is unchanged: its опис, MCC and сума, its
  group, or its text. A new model or a changed history never brings it back. An accepted
  припущення is counted once and never asked about again. A припущення is never a tier of
  автокатегоризація: it is never used by a розбір, never auto-confirms a чернетка and counts toward
  nothing.
- **Closed answers, checked before they are shown.**
  - A категорія must be one of the owner's own unarchived expense категорії offered to the model,
    or «не знаю». It can never be «Без категорії», «Коригування» or «Комісія».
  - A продавець's назва must occur in the опис or be an existing продавець's назва, at most forty
    characters. Its написання must occur in the опис, hold at least three letters and not be a
    service word.
  - A чернетка's сума must be one of the text's candidate amounts, read by the app. A card number
    after «*», a date or time, and what follows «залишок», «баланс», «доступно» or «ліміт» are not
    candidates. The text may name no currency, by ISO code or sign, other than the рахунок's. A raw
    чернетка whose text says money arrived gets no guess at all, because it confirms only as a
    витрата.

  An answer that fails its check is dropped silently. The model quotes and the app reads: the
  model is never trusted with arithmetic.
- **[PROPOSED] Personalisation without training.** A категорія guess is shown up to eight of the
  owner's own already-categorised витрати. They are chosen by a fixed order: same продавець, then
  same MCC, then most shared words of the опис, then most recent.
- **[PROPOSED] Off until the owner turns it on.** «Локальна модель» in Налаштування holds the
  switch. Turning it on is the consent for the model to read описи on the phone (proposal §6.4).
  The section names the model's state in words: недоступна на цьому телефоні, телефон ще не має
  моделі, завантажується, готова. With the switch off, or no model on the phone, the app is
  exactly today's app. Turning it off forgets every stored припущення and every «Ні».
- **[PROPOSED] Foreground only, in small batches.** Guesses are asked only while the app is open,
  after the first screen is drawn, one at a time, at most 30 per opening. Raw чернетки go first,
  then «Без категорії» newest first, then «Без продавця» by rank. Nothing is asked in a background
  task, and nothing blocks a screen.
- **[PROPOSED, vision §12] The model is the phone's own.** No network traffic leaves the app's
  own process on its behalf, neither the app's nor any made by the model's library inside it, and
  any permission the library would merge in is blocked. The spike must prove both, or the change
  stops. When the phone's system offers to fetch its model, the app asks the system to do so only
  on the owner's tap in the section, and says so. The section states what the phone's system
  component may report to its vendor, as the spike establishes (proposal §6.5).
- **Honest numbers.** The section shows how many guesses of each kind were accepted and refused
  since the switch was turned on. The журнал records counts only. No припущення is ever in a
  бекап, a пакет or a репорт.

**Non-goals**:
- local AI-аналіз («Коротко тут», the `local-basic` profile). The owner ranked it below this work;
  it stays a later change;
- questions in plain words, a voice-entry fallback, правила written from a phrase, a фіскальний чек
  hint (proposal B1–B4);
- a guess about type: the model never proposes a переказ, an інвестиція, a повернення or a
  коригування, and never a джерело for a дохід. A повернення is never guessed a категорія, because
  it returns to the категорія of what was bought (the transactions spec);
- a guess on a parsed чернетка, on a чернетка holding an original-currency reference, or on a
  money-in movement. A raw чернетка still confirms as a витрата, as today;
- any model in `verify`. Quality is measured by the spike's eval set and the acceptance counts;
- a model file the app downloads or ships, Gemma on LiteRT-LM, or an iOS model. The port admits
  them; each is a later decision;
- forecasts. Vision §14.10 is not touched;
- notifications about a припущення, or a «Потребує уваги» entry for one.

Vision §14.9 (no cloud) and §14.12 (the app never moves money) are kept by construction.

## Capabilities

### New Capabilities

- `model-guesses`: what a припущення is, covering:
  - the three kinds, and what the model is given for each, the similar-history choice included;
  - the checks every answer passes before it can be shown;
  - acceptance, «Ні» and forgetting;
  - what a припущення never is: a tier, an auto-confirmation, a total, a type, a number of the
    model's own.
- `local-model`: the device side, covering:
  - the switch and the model's states, said in words;
  - the system download on the owner's tap;
  - foreground-only batching with its budget, retries and order;
  - what never leaves the phone, and the журнал's counts;
  - absence equals today's app, on every platform without a model.
- `model-guesses-screen`: how a припущення is always marked as one, the продавець припущення in
  «Без продавця» and the naming form, and the «Локальна модель» section in Налаштування.

### Modified Capabilities

- `main-screen`: the «Без категорії» mark's picker and transaction editing offer a shown категорія
  припущення, beside the five категорії like «Це переказ».
- `transaction-search`: a line under «Без категорії» offers its shown припущення.
- `bank-notifications-screen`: a raw чернетка on Головний offers its shown сума припущення.
- `settings-screen`: Налаштування offers «Локальна модель» right after «Продавці».
- `persistence`: припущення and «Ні» survive a restart, go away with what they are about, arrive
  by a new migration, and are not part of the snapshot.
- `backup-file`: a бекап never carries a припущення, a «Ні» or the switch's acceptance counts.
- `ai-analysis-package`: a пакет never carries a припущення.

## Impact

- **Depends on** `merchant-normalization`: the продавець, its proposal, «Без продавця», the naming
  form and the stored MCC. This change is applied after that one is archived.
- **Docs.**
  - `docs/product-vision.md`:
    - a new section «Локальна модель» with the owner's decision and the [PROPOSED] defaults;
    - §12: the system model, the system download on the owner's tap, and what the vendor's
      component reports, as the spike found;
    - §1 («data is not shared») and §14.9 (no cloud): one dated sentence each, saying the phone's
      own model is neither a share nor a cloud service of the app;
    - §17: a local model also guesses input, and that is not an AI-аналіз.
  - `docs/glossary.md`:
    - new: **Локальна модель**, **Припущення** and «Ні»;
    - the distinctions припущення ≠ правило, припущення ≠ AI-аналіз and припущення ≠ чернетка;
    - **AI-аналіз**: «a model on the phone» explains numbers there, and guessing input is the
      separate thing a припущення is.
  - `docs/on-device-ai-proposal.md`: marked as decided where this change decides it.
  - `docs/app-overview.md`.
- **Native, permissions and config:**
  - a new local Expo module `modules/local-model/` (Kotlin, Android only) over Google's on-device
    GenAI Prompt API, with a new Gradle dependency inside that module;
  - minSdk raised to 26 through a local config plugin `plugins/with-min-sdk`, because the API
    requires it and Expo defaults to 24;
  - no new Android permission: any permission the ML Kit manifest merges in goes into
    `android.blockedPermissions` with a requirement-backed reason, or the change stops;
  - no `package.json` dependency.
- **Pure code:**
  - new `src/model-guesses/`: inputs, similar-history choice, checks, the planner of what to ask
    next, and the answer schemas;
  - new `src/platform/local-model.ts` port and `local-model-device.ts` adapter;
  - new `src/hooks/local-model-ports.ts`;
  - the foreground runner starts at every opening, cold launch or return to the foreground.
- **UI:**
  - new `src/ui/model-guesses.ts`, `src/app/manage/local-model.tsx` and a guess chip component;
  - changed: the «Без категорії» picker, `src/app/transactions.tsx`, `src/app/transaction/[id].tsx`,
    the продавці section and naming form, the чернетки list on Головний, and
    `src/ui/settings-sections.ts`.
- **Storage:** a new table `model_guesses` and a one-row switch-and-counts table, a new migration
  and its test, kept out of `BACKUP_TABLES`.
- **Verification:**
  - the emulator has no system model, so `smoke-runner` covers the unavailable path (the section
    in words, no chip anywhere, the app unchanged);
  - the available path is run on the owner's phone, and the run is recorded as such
    (`.claude/rules/android.md`);
  - `spike.md` and `device-run.md` hold aggregates only. The owner's описи pulled for the eval stay
    under the gitignored `.cache/` and are never committed.
- **Phase 0** (proposal §7) is the first task group: a throwaway spike on the owner's S24 with an
  eval set from their own data, measured once on a held-out part (at least 100 витрати the шаблон
  missed) that the prompt was never tuned on. **[PROPOSED] go/no-go:**
  - категорія: at least 80 % of shown guesses correct, covering at least 40 % of the held-out part;
  - продавець: at least 90 % of shown guesses acceptable, meaning the написання recognises the опис
    and no other merchant's, and the назва is the owner's own label;
  - сума: at most 5 % of shown sums stated in the text but not the movement's;
  - median time per guess at most 2 s;
  - no app-process traffic over 24 hours, foreground and background, no unblockable merged
    permission, and no usage-reporting component that cannot be removed.

  A no-go stops the change before any production code.
