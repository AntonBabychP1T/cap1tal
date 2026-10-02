# On-device AI in cap1tal: a proposal

Status: **draft for the owner's decision**, not a spec. Nothing here changes behaviour until it
becomes an OpenSpec change. Written 2026-10-01.

## 1. The idea in one paragraph

A small language model on the phone does the work the deterministic rules cannot. It reads a
messy bank text and names the merchant. It suggests a категорія for what sits in «Без категорії».
It fills a чернетка from a notification the regex could not parse. It says a few words about the
month without the data leaving the phone. The model never decides anything: it **proposes**, the
owner taps, and wherever possible the accepted proposal becomes an ordinary **правило**. Over time
the model makes itself less necessary. The deep analysis stays where it works best, in «Поділитися
з AI» to a big model. The local model's job is to make what goes there **more complete**: fewer
uncategorised витрати, clean merchant names, fewer raw чернетки.

## 2. What the codebase already says (constraints, not opinions)

| Source | What it says | What it means here |
|---|---|---|
| `docs/glossary.md` § AI | AI-аналіз is by "an assistant the owner already has, or later a model on the phone. The model is never a source of truth and changes nothing" | A local model is already anticipated. Every output is a proposal and nothing is written without a tap. |
| `src/analysis/prompt.ts` | `PromptProfile = 'external-advanced'`; "Phase 2 adds `'local-basic'` … for a small local model" | Local AI-аналіз has a planned slot. |
| `product-vision.md` :204-206, §14.9 | Outbound connections: monobank, rates, Drive. No other cloud. | The model must run fully on the device. How the model file *gets* onto the phone matters (§4). |
| `product-vision.md` §14.10 | Forecasts are excluded except «Прогноз статку» | "Прогнози" need a vision decision first (§6). |
| `product-vision.md` §14.5, §14.8 | No splitting a purchase across categories. No hierarchy and no tags. | The model cannot invent tags or split a receipt. It chooses from the owner's flat list. |
| `voice-entry/proposal.md` :28, :53 | Phrase parsing by fixed rules, "no language model" as a non-goal | An LLM fallback for voice is a later, separate change, never a quiet extension. |
| `fiscal-receipts` spec | Parsing "without any network, device or model" | Receipt parsing stays deterministic. The model may only *read* parsed lines. |
| `challenges` spec :6 | "never by a language model" | Out of scope. |

What exists today that the model can plug into:

- **Categorisation** (`src/domain/rules.ts`, `src/domain/rule-template.ts`,
  `src/db/categorisation.ts`) has two tiers: the owner's правила, then the шаблон категоризації.
  Matching is a case-folded substring, so Cyrillic never matches Latin. Inputs:
  - monobank: опис + MCC;
  - notification: the whole text;
  - manual entry: the опис;
  - розбір: the опис only, because **MCC is not stored** after import.
- **`proposeMerchantPattern`** guesses a правило pattern from the first two words of the опис. Its
  own comment admits that «Оплата послуг АТБ» gives the wrong guess.
- **Notifications** (`src/notifications/parse.ts`) have no bank-specific parser (`PARSERS` is
  empty). One generic regex reads them. A failure becomes a `raw` чернетка, and the merchant is
  never extracted: the whole text becomes the опис.
- **Analysis package** (`src/analysis/`): aggregated, exact, per currency. Описи and individual
  транзакції are included only on explicit opt-in.

## 3. Use cases, ranked by value ÷ risk

### A. Do first (fits the vision as written)

**A1. Third tier of автокатегоризація: a suggestion, not a decision.**
For a витрата that neither the правила nor the шаблон matched, the model picks **one category from
the owner's list, or "не знаю"**. The output is constrained by a JSON schema with an enum of
category ids. The suggestion shows as a chip on the транзакція / чернетка: «Схоже на: Кафе ✓».
One tap accepts it. Accepting also offers «Завжди так для “Aroma Kava”?», which creates an ordinary
правило. The model is consulted again only for what is still uncategorised.

- Personalisation without training: the prompt carries the 8-10 **most similar already-categorised
  транзакції of the owner's own history**. These are chosen deterministically (token overlap on the
  folded опис, the same MCC, a close amount). The 4,000-token input limit of Gemini Nano holds this
  easily.
- Inputs the model gets: опис, MCC (when known), amount and currency, рахунок kind, weekday/hour.
  Nothing else.
- Success metric: the share of витрати in «Без категорії» per month, and the acceptance rate of
  suggestions.

**A2. Merchant extraction → better правила, cleaner data.**
From «Оплата послуг АТБ-Маркет 1234 Київ» or a notification text, the model extracts `АТБ`. This
replaces the guess of `proposeMerchantPattern` when a правило is created. It also lets the пакет
group «Продавці» by the clean name instead of the raw опис. This is the main "fuller data for the
big model" win. A deterministic check applies: **the extracted name must occur in the source text**
(case-folded), otherwise it is discarded.

**A3. Notification fallback extraction.**
For a `raw` / `unparsed` чернетка, the model extracts сума, currency, direction, merchant and card
last-4 into the чернетка's fields. The owner still confirms, as today. A deterministic check
applies: the extracted сума must appear verbatim in the text, and the currency must be a known
code. A hallucinated number therefore cannot pass. Bank-specific regex parsers stop being needed
for the long tail.

**A4. Local AI-аналіз (`local-basic` profile).**
On the AI-аналіз screen, next to «Поділитися з AI», add «Коротко тут». The local model reads the
same пакет (a compact profile, under 3,000 tokens) and writes 3-5 observations in Ukrainian. A
deterministic check applies: **every number in the answer must exist in the пакет**, and a sentence
with an unknown number is dropped. Nothing leaves the phone. Expectations must be honest: a 2-4B
model rephrases what the app computed well and reasons about it poorly. The deep analysis stays
with the big model.

### B. Later (needs a separate change, and sometimes a vision decision)

**B1. Questions in plain words → existing search.** «Скільки на каву в серпні?» The model
translates the question into the filters `transaction-search` already has (period, категорія,
text, сума range). This works through function calling with a closed schema. The app runs the query
and computes the number itself. The model never answers with a number.

**B2. Voice-entry fallback.** When the fixed phrase rules of `voice-entry` cannot parse a phrase,
the model fills the entry form, and the owner sees and confirms it. This contradicts the
`voice-entry` non-goal, so it is a new change after voice-entry lands.

**B3. Правило by phrase.** «Все з Bolt — це транспорт» becomes a proposed правило on the familiar
rule screen.

**B4. Receipt hint.** From the parsed lines of a фіскальний чек, the model suggests the **one**
категорія of the whole транзакція (the dominant one). It never splits a purchase (§14.5).

### C. Not recommended for the local model

- **Forecasts by the LLM.** Small models are bad at arithmetic. If the owner wants forecasts, they
  must be deterministic (pace of spending vs ліміт, end-of-month projection per category), and they
  first need a change to vision §14.10. The model at most turns an already computed number into
  words, and templates do that just as well.
- **Financial advice.** On-device 2-4B models give generic advice. The big model with the full
  файл does this much better. The local equivalent is **observations**: deterministic detectors
  for a subscription that got more expensive, a possible duplicate charge, a category ahead of last
  month's pace, or a витрата far above that merchant's median. Each is shown as a fact with its
  numbers. Those detectors need no model at all and are worth a change of their own.
- **Auto-applying anything.** Nothing auto-applies, ever (glossary).

## 4. Technology for a 2-year-old flagship (Galaxy S24)

| | **Gemini Nano via ML Kit GenAI Prompt API** | **Gemma 4 E2B via LiteRT-LM** | **react-native-executorch** (Qwen 3 / Gemma 4) |
|---|---|---|---|
| On S24 | Listed as supported (S24, S24+, S24 Ultra, S24 FE). Runs an older Nano than Pixel 10 (nano-v3). | Gemma 3n E2B on S24 Ultra: ~16 tok/s decode, GPU prefill ~816 tok/s. The S24/S24+ in Ukraine are **Exynos 2400**, so GPU support there is unverified. | Runs on CPU/XNNPACK. Speed depends on model size. |
| Model file | Managed by the system (AICore / Play services). **The app downloads nothing.** | ~2.6 GB, delivered by the app | 0.5-3 GB, delivered by the app |
| Vision fit (:204) | Best: no new outbound connection of cap1tal's own | Needs a download URL (a new connection, so a vision change) or an owner-picked file (fits the «передати» / backup-import pattern) | Same as LiteRT |
| Limits | Input < 4,000 tokens; per-app inference quota; **expected foreground-only** (ML Kit GenAI blocks background use); beta (`genai-prompt:1.0.0-beta4`); unavailable with an unlocked bootloader | Context and function calling depend on the build; full control | Tool calling and embeddings out of the box |
| Structured output | Yes (Structured Output API) | Constrained decoding / function calling | Tool-schema parsing |
| iOS later | No | Yes | Yes |
| Integration | A small local Kotlin module like `modules/notification-capture` | A Kotlin module plus model-file management | An npm package plus model-file management |

**Recommendation:** start with **Gemini Nano through ML Kit Prompt API**, behind a port, so that
**Gemma 4 E2B on LiteRT-LM** can replace it without touching feature code. The reasons:

- zero download;
- zero APK size;
- no new outbound connection;
- NPU-backed;
- the only cost is a Kotlin module of a few hundred lines.

The foreground-only limit fits the product: everything the model does lands on «що чекає
відповіді» on Головний, which the owner sees by opening the app.

Embeddings (EmbeddingGemma, 308M parameters, < 200 MB RAM, 100+ languages) would improve the
"similar транзакції" retrieval for A1. They are **not needed for the first version**: the
deterministic similarity over the owner's own history is cheaper and fully testable.

## 5. Architecture in this repo's terms

```
src/platform/local-model.ts          port: status() → available | downloadable | unavailable,
                                     generate(prompt, schema) → json | refusal | error
src/platform/local-model-device.ts   adapter → modules/local-model (Kotlin, ML Kit Prompt API)
src/local-model/                     pure module, Node-testable with a fake port:
  categorise.ts      build prompt (owner's categories + similar history) → validate enum output
  merchant.ts        build prompt → validate "occurs in source text"
  draft-extract.ts   build prompt → validate сума verbatim, currency known
  local-analysis.ts  compact пакет → validate every number exists in пакет
  queue.ts           foreground batch runner, respects quota, never blocks a screen
src/hooks/local-model-ports.ts       binds the adapter at runtime (like monobank-ports.ts)
```

Rules every feature obeys:

1. **Absent model = today's app.** No model, an unsupported device or a switched-off toggle
   changes nothing visible except the missing chips. An on/off switch lives in Налаштування.
2. **Proposal, never write.** The model's output is stored, if at all, as a suggestion row. A
   категорія or правило is written only by the owner's tap.
3. **Closed outputs.** An enum of ids, a JSON schema, or text whose numbers are checked. Free text
   reaches the screen only in A4, after the number check.
4. **Deterministic guards are the tests.** Everything around the model (prompt building,
   similarity choice, validators) is pure and covered by `vitest` with a fake model. The model's
   quality is measured separately (§7).
5. **Distil into правила.** Every accepted A1/A2 suggestion offers a правило, so the next
   identical витрата never reaches the model.
6. **Store MCC.** A small schema change, a new migration: keep the MCC on the транзакція. Today the
   розбір sees only the опис. Both the правила and the model get better from it.

## 6. Decisions the owner has to make

1. **Gemini Nano first (recommended), or Gemma from the start?** Gemma means 2.6 GB on the phone
   and either a new download connection or an owner-picked file.
2. **Forecasts:** keep vision §14.10 as is (recommended), or open a change for *deterministic*
   spending pace and end-of-month projections, with the model only phrasing them?
3. **Local AI-аналіз (A4):** worth a button, or is «Поділитися з AI» enough?
4. **May the local model see описи by default?** They never leave the phone, so the per-run opt-in
   of the пакет is about sharing, not local reading. A1-A3 are useless without описи.
5. **ML Kit telemetry:** inference is on-device, but ML Kit may send usage metadata to Google. If
   that matters, it must be checked in the spike before committing.

## 7. Plan

**Phase 0: spike on the owner's S24 (1-2 days, no spec, a throwaway branch).**
- A minimal Kotlin module: `checkStatus()`, `download()`, `generate()`. A hidden debug button.
- Measure: is the status `AVAILABLE` on this exact phone and firmware, latency per categorisation
  prompt, and quality on Ukrainian bank texts.
- An eval set built from the owner's own data: export ~200 already-categorised витрати plus ~50
  that the шаблон missed (DB pulled via `run-as`, see the emulator harness notes). Hide the
  category and ask the model.
- **Go/no-go:**
  - top-1 accuracy ≥ 70% on the "шаблон missed" set;
  - "не знаю" counted as correct-abstain rather than wrong;
  - ≤ 2 s per suggestion;
  - merchant extraction correct on ≥ 90%.

  If Nano fails, repeat the same eval with Gemma 4 E2B on LiteRT-LM before giving up.

**Phase 1 (one change): `local-categorisation-suggestions`** covers A1 + A2 + the stored MCC, plus
the Налаштування toggle and the port/adapter. A smoke test on the emulator is impossible (no
AICore), so the device run happens on the owner's phone, recorded as such.

**Phase 2: `local-draft-extraction`** covers A3.

**Phase 3: `local-ai-analysis`** covers A4 (`local-basic` profile) plus the clean «Продавці» names
in the exported пакет.

**Phase 4, after vision decisions:** B1-B4, and separately the deterministic observation detectors
from §3C.

## 8. Risks

- **Ukrainian quality of an older Nano** is the main unknown, and Phase 0 exists to answer it.
- **Beta API churn** in ML Kit GenAI, kept contained by the port.
- **Quota:** a first-run backlog of hundreds of «Без категорії» витрат needs batching across app
  opens, newest first.
- **Firmware:** AICore availability can change with a Samsung update. The status is checked on
  every launch, and the app degrades to today's behaviour.
- **Testing gap:** model quality cannot run in `npm run verify`. The eval set plus the debug screen
  are the substitute, and the guards around the model stay fully tested.

## Sources

- [ML Kit GenAI Prompt API — get started](https://developers.google.com/ml-kit/genai/prompt/android/get-started)
- [ML Kit's Prompt API announcement](https://android-developers.googleblog.com/2025/10/ml-kit-genai-prompt-api-alpha-release.html)
- [Supported devices (S24 family) — Capawesome plugin docs](https://capawesome.io/docs/sdks/capacitor/mlkit/genai-prompt/)
- [LiteRT-LM overview and S24 Ultra benchmarks](https://ai.google.dev/edge/litert-lm/overview)
- [Gemma 4 on LiteRT-LM](https://developers.google.com/edge/litert-lm/models/gemma-4.md.txt)
- [Gemma 4 for the edge](https://developers.googleblog.com/bring-state-of-the-art-agentic-skills-to-the-edge-with-gemma-4/)
- [EmbeddingGemma](https://developers.googleblog.com/introducing-embeddinggemma/)
- [React Native ExecuTorch useLLM](https://docs.swmansion.com/react-native-executorch/docs/0.6.x/hooks/natural-language-processing/useLLM)
