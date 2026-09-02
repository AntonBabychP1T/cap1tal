# fiscal-receipts — proposal

## Why

«Куди пішли гроші» stops at the merchant: a витрата «АТБ −742,30 ₴ Продукти» says nothing about
what was bought. Every фіскальний чек in Ukraine carries a QR code whose реквізити let the tax
service's public receipt check serve the registered fiscal document — the actual позиції with
names, quantities and prices. This change lets the owner scan that QR from a транзакція and see
the composition of the purchase beneath it, on the phone, without touching a single number the
app computes. It is the level of detail below a транзакція that the vision's first question
lacks, and the foundation the next capability (`product-classification`, not this change) will
stand on. Main money tracking keeps working with none of this: a чек is an enhancement.

## Research findings (verified on 2026-09-01, live requests and current sources)

Everything below was checked against the live services and the current documents, not taken from
memory. Raw and sanitised evidence sits in `research/` beside this proposal.

### Monobank Personal API

- **Version**: the docs page titles itself «Monobank open API (v250818)». Its OpenAPI document is
  embedded in `https://api.monobank.ua/docs/index.html` (the standalone `swagger.json` answers
  403) and was read from there.
- **Actual `StatementItems` fields**: `id`, `time` (unix seconds), `description`, `mcc`,
  `originalMcc`, `hold`, `amount` (account currency, minor units), `operationAmount` (operation
  currency, minor units — the currency itself is named nowhere), `currencyCode` (the *account's*
  currency), `commissionRate`, `cashbackAmount`, `balance`, `comment` («Коментар до переказу,
  уведений користувачем. Якщо не вказаний, поле буде відсутнім»), `receiptId` («Номер квитанції
  для check.gov.ua. Поле може бути відсутнім», example `XXXX-XXXX-XXXX-XXXX`), `invoiceId` («Номер
  квитанції ФОПа, приходить у випадку якщо це операція із зарахуванням коштів»), `counterEdrpou`
  and `counterIban` («присутній лише для елементів виписки рахунків ФОП»), `counterName`.
- **What cap1tal reads today** (`src/monobank/api.ts`): `id`, `time`, `description`, `mcc`,
  `amount`, `hold`, `currencyCode`. It drops `originalMcc`, `operationAmount`, `commissionRate`,
  `cashbackAmount`, `balance`, `comment`, `receiptId`, `invoiceId` and the three `counter*` fields.
  The existing atomic-commit and at-most-once guarantees are untouched by this change.
- **What `receiptId` is**: the code of a payment квитанція at `check.gov.ua`, the «Державний сервіс
  перевірки квитанцій» — «На цій сторінці Ви можете перевірити факт оплати по коду квитанції».
  Its institution list is banks and payment services (А-Банк, Монобанк, Приватбанк, ПУМБ, ДІЯ,
  EasyPay, Portmone, …); the monobank entry says «Код квитанції це 16 символьне значення» in
  4-4-4-4 blocks. It proves a payment happened; it is **not** a фіскальний чек and carries none of
  the фіскальний номер чека / реєстратора the tax service needs.
- **Automatic Mono → фіскальний чек: not possible.** The tax service's lookup (below) requires
  the фіскальний номер чека (`id`) and the фіскальний номер реєстратора (`fn`) — probed: without
  `fn` the service answers 400, a wrong `id` answers «Не знайдено». No `StatementItems` field
  carries either; time and amount alone identify nothing. No documented or observed monobank
  flow hands out fiscal receipt requisites. Therefore Flow A is **metadata retention only**: the
  QR scan is the sole acquisition path in this version, and the domain's `monobank_auto`
  acquisition value is reserved with no code path producing it. No heuristic guessing.
- **Fields this change starts keeping** (new `monobank_item_details`, see design D9): the
  operation moment, `receiptId`, `invoiceId`, `comment`, `originalMcc`, `counterName`,
  `counterEdrpou`, `counterIban`, linked to the транзакція the item became. `operationAmount`
  stays unread on purpose: it is an amount in a currency the API never names, and database.md
  forbids storing an amount without its currency.

### The tax service lookup: `chkAllWeb`

- **Where it comes from**: the Electronic cabinet's receipt-check page
  `https://cabinet.tax.gov.ua/cashregs/check` is an Angular SPA; its component `app-check`
  (bundle `chunk-Q4XJPSWZ.js`) builds the request as
  `../ws/api_public/rro/chkAllWeb?id=${id}&date=${YYYY-MM-DD HH:mm:ss}&type=${3}&captcha=${captcha||""}&fn=${fn||""}&sm=${sm||""}`
  and reads `check` (base64) and `checkXml` (base64) from the JSON. The endpoint is not on the
  documented API pages (`/help/api.html` documents only the `cashregs/check` link itself).
- **Method**: GET only (`OPTIONS` → `Allow: GET,HEAD,OPTIONS`; POST → 400).
- **Authentication**: none. No token, no cookie, no header. The page runs an *invisible reCAPTCHA*
  and passes its response as `captcha`, but the server answered 200 to `captcha=` (empty),
  `captcha=0` and to a request with no `captcha` parameter at all. **Risk**: server-side captcha
  enforcement could be switched on any day; the app must fail typed, not crash.
- **Required parameters** (probed on a real receipt):
  - `id` — фіскальний номер чека; leading zeros tolerated (`045` found `45`); empty → 400
    «Сервіс тимчасово недоступний» (misleading text).
  - `fn` — фіскальний номер реєстратора (РРО 3000…, ПРРО 4000…); empty → 400 «For input
    string: ""»; wrong → «Не знайдено».
  - `date` — exactly `YYYY-MM-DD HH:mm:ss`; the server matches **to the minute**: 11:30:00 …
    11:30:59 all found a receipt registered at 11:30:24, 11:29:00 and 11:35:00 did not; date-only,
    `YYYYMMDD` or `HH:mm` without seconds → 400 «Помилка обробки запиту»; empty → 400 «заповніть
    реквізити пошуку дата».
  - `sm` — exact сума with a dot: `780.00`, `780`, `780.0`, `0780.00` accepted; `780.01` → «не
    вірна сума»; `780,00` → «Помилка обробки запиту»; empty → 400.
  - `type` — numeric, required (missing → 400; `abc` → 400); values 0, 1, 2, 3 and 9 all returned
    the same receipt. The page uses `3`; semantics unknown.
  - Extra parameters (`mac`) are ignored.
- **Success**: HTTP 200, `application/json`:
  `{ "check": <base64>, "fn": "3000898168", "name": null, "addressGo": null, "typeGo": null, "tins": null, "xml": true, "sign": false|true, "qr": false, "resultCode": null, "resultText": "", "checkXml": <base64>, "checkP7s": <base64>|null }`.
  `check` is the plain-text rendering (UTF-8); `checkXml` is the registered XML document, bytes
  in **windows-1251** (the declaration says so) in all four real receipts fetched; `checkP7s` is
  the CAdES signature (ПРРО only), not needed.
- **Errors**: HTTP 400 with `{"error":"Помилка","error_description":"…"}` and these descriptions:
  «Помилка обробки запиту» (malformed request — the contract we rely on), «Інформація відсутня Не
  знайдено.» (no such receipt), «Інформація відсутня не вірна сума», «Інформація відсутняFor input
  string: ""», «Неможливо виконати пошук, заповніть реквізити пошуку дата», «Інформація відсутня
  Сервіс тимчасово недоступний .». Mapping (design D4): a 400 whose description starts with
  «Інформація відсутня» is *not-found*; any other 400 is *request-rejected*; network/5xx/timeout
  is *unavailable*; a 200 without a decodable `checkXml` is *unreadable*.
- **Behaviour across registrars**: both a classic РРО receipt («Класичний РРО» in the text) and
  ПРРО receipts («ФСКО ЄВПЕЗ») were served; the dialect shows in the XML root (below).
- **Latency and limits**: ~3.1 s per call; eight rapid sequential calls all answered 200 with no
  rate-limit headers. Real limits are **unknown**; the design treats 429/403 as unavailable.
- **Delay**: the SPA carries the text «Інформація надходить на протягом 3-6 днів» — an offline
  ПРРО receipt may not be findable at once; the screen says so and offers a retry.
- **Sanitised responses**: `research/fixtures/chkAllWeb-*.json`.

### The QR code on a чек

- Official description (tax.gov.ua): a link
  `https://cabinet.tax.gov.ua/cashregs/check?mac=…&date=yyyyMMdd&time=HHmm&id=…&sm=…&fn=…` — `mac`
  only for receipts issued offline; `id` the фіскальний номер чека, `fn` the реєстратор, `sm` the
  сума. The SPA reads `id`, `fn`, `date` (YYYYMMDD), `time` (HHmm) and `sm`, ignores `mac`, and
  calls `chkAllWeb` with `type=3`.
- Observed in the wild (open-source printers and real receipts): `time` as **HHmmss**
  (`time=222006`, `time=145454`), parameters in any order, `mac` absent for online receipts, and
  older or deviant codes lacking `time`/`sm` or spelling `sum=`. The parser therefore reads by
  parameter name, accepts HHmm and HHmmss, ignores `mac`, and reports a missing реквізит as a
  typed reason instead of guessing.

### The fiscal document XML

Two dialects, both windows-1251, sometimes pretty-printed with whitespace, sometimes minified:

- **ПРРО** — the official `check01.xsd` (`<CHECK>`), confirmed by two real ПРРО receipts fetched
  through `chkAllWeb`. `CHECKHEAD`: `DOCTYPE` (0 = чек реалізації), `DOCSUBTYPE` (0 sale, 1
  видатковий/return, …), `UID`, `TIN`, `IPN?`, `ORGNM`, `POINTNM`, `POINTADDR?`, `ORDERDATE`
  (ddmmyyyy), `ORDERTIME` (hhmmss), `ORDERNUM`, `CASHDESKNUM`, `CASHREGISTERNUM` (= `fn`),
  `CASHIER?`, `VER`, `ORDERTAXNUM?` — **absent in both real samples**, so the чек's identity must
  come from the lookup реквізити, not the document. `CHECKTOTAL`: `SUM` (15.2 decimal),
  `DISCOUNTSUM?`, `RNDSUM?`. `CHECKBODY/ROW[@ROWNUM]`: `CODE?`, `BARCODE?` (Str64 — present in
  the XSD; none of the three ПРРО samples carried one), `UKTZED?`/`DKPP?`, `NAME`, `DESCRIPTION?`,
  `UNITCD?`, `UNITNM?`, `AMOUNT` (15.3, e.g. `5.701` kg; also plain `1`), `PRICE` (15.2),
  `LETTERS`, `COST` (15.2, before discount), `DISCOUNTTYPE?/DISCOUNTPERCENT?/DISCOUNTSUM?`
  (line-level). The official example «Знижки» proves `SUM = ΣCOST − ΣDISCOUNTSUM`
  (100 + 200 − 50 − 40 = 210). Other row fields (fuel, currency exchange, payment recipients,
  excise labels) belong to other document kinds and are not read.
- **Classic РРО** — the ФСКО data packet («Технологія зберігання і збору даних РРО для ДПС»,
  `<RQ>`), confirmed by two real РРО receipts: `<RQ V NDv PrV><DAT DI DT FN TN V ZN><C T>` with
  `T` 0 = sale, 1 = return; children `<L N>` free-text lines (cashier, card, loyalty — never
  items), `<P N C CD CZD NM PRC Q SM TX …>` sale rows, `<D N TR TY NI PR SM>` discounts (with
  `NI` naming the row it applies to; without `NI` receipt-level), `<M>` payments, `<E NO SM TS>`
  the close (fiscal number `NO`, timestamp `YYYYMMDDhhmmss`). **Money attributes are integers in
  kopiykas** (`PRC="7800"` = 78.00, `SM="43740"` = 437.40), `Q` is thousandths (`2000` = 2, absent
  when 1), `CD` is the **barcode** (present on seven of eight rows of a real grocery receipt:
  `CD="4820000431026"`), `CZD` the УКТЗЕД code, vendor extensions `AT_TM` (unit name) appear.
- **Fixtures** captured for the parser: `research/fixtures/` — three official `check01` examples
  (goods, discounts, return), one real classic РРО grocery receipt with eight позиції and
  barcodes, two real ПРРО receipts, one raw windows-1251 byte sample, and the JSON envelopes.
  Seller identity, cashier, addresses and free-text card lines are replaced by placeholders.

### What remains unknown

- Real rate limits and the day captcha enforcement might start — handled as typed failures.
- Whether a grocery ПРРО receipt (АТБ, Сільпо) carries `BARCODE` rows — the XSD allows it; the
  first real grocery ПРРО receipt the owner scans becomes a fixture (task 9.3).
- The semantics of `type`; `3` is what the page sends and what this change sends.

## What Changes

- **New capability `fiscal-receipts`** — the pure engine: reading реквізити чека from a QR text;
  a lookup port with five typed outcomes and no address in the domain; deterministic parsing of
  both fiscal-document dialects into a фіскальний чек with позиції чека (integer minor units,
  thousandths quantities, barcodes and УКТЗЕД kept when present, nothing invented); identity and
  duplicate protection; the total-versus-сума comparison with an explicit warning instead of a
  silent attach; attaching as one unit; lifecycle with the транзакція (cascade on delete, kept on
  edit and retype, explicit detach); the immutable source snapshot; and the privacy line.
- **New capability `qr-scan`** — the device port: camera permission answered truthfully and asked
  for only on the owner's action, one decoded QR text or one typed reason, nothing stored.
- **New capability `fiscal-receipts-screen`** — «Сканувати QR чека» on a витрата or повернення,
  prominent for «Продукти»; the scan → lookup → preview → attach flow with every failure named in
  Ukrainian and retryable without rescanning; the позиції list, raw names, offline; the detach.
- **Modified `persistence`** — чеки and позиції survive a restart, commit as units, cascade with
  the транзакція, arrive by append-only migrations, and join the snapshot.
- **Modified `backup-file`** — the бекап holds чеки with позиції and snapshot; older бекапи restore
  without them; a чек pointing outside the бекап is a contradiction.
- **Vision §12 and §14.9 are touched**: outbound connections gain one — the lookup of a чек by its
  реквізити at the tax service, on the owner's explicit tap. Nothing else leaves the phone; no
  cap1tal backend, no analytics. The owner granted this scope in the session of 2026-09-02 and
  **edits `docs/product-vision.md` themselves**: §12's list of outbound connections and §14.9's
  «Cloud services other than the owner's opt-in Google Drive backup». This change must not be
  archived before that edit lands. The in-flight `google-drive-backup` sentence «what leaves the
  phone» must name it too (task 10.2).
- **Glossary gains**: фіскальний чек, позиція чека, реквізити чека, реєстратор (РРО/ПРРО),
  фіскальний номер чека, фіскальний номер реєстратора, прикріпити/відкріпити чек, квитанція
  (monobank `receiptId`) as a distinction from фіскальний чек.

Non-goals (deliberate):

- No AI, LLM, OCR, product classification, clean names, nutrition, «корисний/некорисний»,
  reports over позиції, or recommendations — `product-classification` is the next change and works
  on top of `ReceiptItem`; this schema must not stand in its way (design D8) but implements no
  `Product`.
- No automatic Mono → чек retrieval (research: impossible without фіскальні номери); no
  background or scheduled fetching; no server, no cloud, no telemetry.
- No DPS token, no SecureStore for it, no settings section, no private-cabinet authorization,
  no documented `chkAll`. `chkAllWeb` is the only retrieval path; if its behaviour changes this is
  a named risk (design D4), not a silent replacement.
- No manual entry of реквізити for a QR that lacks them (older codes) — a typed refusal now, a
  later change if it matters.
- No splitting a транзакція into several (vision §14.5 stays), no category per позиція, no
  changing any balance or monthly number.
- No storing or sending a photo; the camera only decodes.
- No iOS scanner work beyond keeping the build possible (`unsupported` where no camera).

## Capabilities

### New Capabilities

- `fiscal-receipts`: reading реквізити from a чек QR, typed lookup outcomes, deterministic
  two-dialect parsing into a чек with позиції, identity and duplicate protection, the
  total-versus-сума comparison, atomic attach, lifecycle with the транзакція, the source snapshot,
  and what leaves the phone.
- `qr-scan`: the camera permission states and request, and one decoded QR text or typed reason
  per scan, with nothing stored or sent.
- `fiscal-receipts-screen`: the scan offer on a транзакція, the scan → lookup → preview → attach
  flow with named, retryable failures, the позиції list offline, and detaching.

### Modified Capabilities

- `persistence`: чек and позиція storage; cascade with the транзакція; snapshot and replacement
  include them; append-only migrations.
- `backup-file`: the бекап carries чеки, позиції and snapshots; older бекапи still restore; new
  self-contradictions are refused.

`monobank-sync` is deliberately **not** modified. An earlier draft of this change also read the
bank's details of a statement item (payment-receipt code, invoice code, comment, original MCC,
counterparty) into a `monobank_item_details` table. The research above proves those details cannot
yield a фіскальний чек, so nothing in this change would have read them back: it would have been a
table, a migration, a row in `BACKUP_TABLES` and counterparty names and IBANs in an unencrypted
бекап, all with no reader. The owner's decision of 2026-09-02 is to lift it out into a change of
its own, proposed when a screen actually wants those fields.

## Impact

- **New native module** (android.md requires naming it): `expo-camera` `~57.0.4` (the SDK 57
  bundled version) with its config plugin in `app.json`; it adds `android.permission.CAMERA`,
  declared explicitly in `app.json` with the user-facing reason in `fiscal-receipts-screen`. No
  local Kotlin module, no hand edit under `android/`. Native verification: the CI `android` job
  compiles; the emulator smoke (tasks §11) proves permission and scanning.
- **New npm dependency**: `fast-xml-parser` (pure JavaScript, no native code) for the two XML
  dialects (design D6). No other dependency: base64 via the runtime's `atob`, windows-1251 via a
  128-entry upper-half table in pure TypeScript.
- **New code**: `src/fiscal/` (QR reading, lookup port + `chkAllWeb` adapter over `FetchLike`,
  windows-1251 decoding, both dialect parsers, the comparison), `src/domain/fiscal-receipt.ts`
  (types and the comparison rule), `src/db/receipts-repo.ts`, one migration (two tables),
  `src/platform/qr-scan.ts` (+ `-device.ts`),
  `src/ui/receipt-screen.ts`, `src/app/transaction/scan.tsx`, `src/app/transaction/receipt.tsx`,
  additions to `src/app/transaction/[id].tsx`, `src/backup/format.ts` (schema version 12, new
  arrays), `docs/glossary.md`, `docs/app-overview.md`. `docs/product-vision.md` is the owner's own
  edit and is not touched by this change.
- **Storage growth**: one чек ≈ 1.5–3 KB of snapshot plus ~10 позиції rows; two receipts a day is
  under 3 MB a year — the бекап stays «about a megabyte» scale (design D7).
- **`npm run verify`** stays Node-only and under a minute: every parser, decoder, comparison,
  repository and backup rule is a fixture test; the network client is tested through a fake
  transport; the camera adapter and the screens are never loaded.
- **Coordination**: `settings-screen` is untouched (no token section — a deliberate benefit).
  `persistence` and `backup-file` deltas add and modify requirements that `reminders-and-alerts`
  and `investments-value` also touch (ADDED only on their side); whichever archives last carries
  the union. The migration number is assigned at integration (design D10), and the бекап schema
  tripwire fires once per migration by design.
