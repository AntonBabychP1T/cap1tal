# fiscal-receipts — design

## Context

See proposal.md — Why, and its Research findings: the contracts below are the ones actually
observed on 2026-09-01, not documented ones. What shapes every decision:

- **The lookup endpoint is undocumented and unauthenticated.** `chkAllWeb` is what the tax
  service's own page calls; it needs `id`, `fn`, `date` to the minute, `sm` exact and a numeric
  `type`, answers JSON with base64 payloads, and may start enforcing its captcha or change shape
  without notice. Everything about it must sit behind one adapter and fail as a value.
- **Two XML dialects, both windows-1251.** ПРРО documents follow `check01.xsd` with decimal
  strings; classic РРО documents are ФСКО packets with integers in kopiykas and thousandths.
  Hermes has `atob` and a UTF-8-only `TextDecoder`, so decoding windows-1251 is our own table.
- **The repo's seams are settled**: a device interaction is a port in `src/platform/` with an
  in-memory double and a `-device.ts` adapter that `verify` never loads (`monobank-token`,
  `backup-file`); a network client takes a `FetchLike`; failures are values; money is integer
  minor units next to a currency code; migrations are append-only; the domain is pure.
- **A чек is not money.** Nothing in `src/domain/monthly-picture`, `account` or `reports` reads
  it. The comparison rule is the only domain logic; the rest is parsing and storage.
- **The next change** (`product-classification`) will hang `Product` and a classification off
  `ReceiptItem` by its id, raw name and barcode — so the позиція row must keep exactly those and
  must have a stable id of its own.

## Goals / Non-Goals

**Goals:**

- One place knows the `chkAllWeb` URL, query format, answer shape and error texts; one place
  knows each XML dialect; both are proven by fixture tests under `verify`.
- The whole scan → lookup → parse → compare → attach flow is a pure state machine in `src/ui/`
  over the ports' doubles, so every named failure has a test before a screen exists.
- Storing is all-or-nothing and only after the owner's decision; nothing is retried on its own.
- The snapshot makes the app independent of the tax service after the first fetch.

**Non-Goals:**

- No abstraction over «receipt providers» beyond one port with one adapter; no plugin registry.
- No generic XML data model: the parsers produce the domain's `ParsedReceipt` and nothing else.
- No queueing, no background work, no partial or streaming parsing.
- No captcha solving. If the server starts requiring one, the outcome is `request-rejected` and
  the screen says the service changed; a later change decides what to do.

## Decisions

**D1. Layout: a pure `src/fiscal/` module, a thin domain rule, one platform port.**

| Where | What | Proven by |
| --- | --- | --- |
| `src/domain/fiscal-receipt.ts` | `FiscalReceipt`, `ReceiptItem`, `ReceiptIdentity`, `compareReceiptToTransaction` | pure tests |
| `src/fiscal/qr.ts` | QR text → `ReceiptLookup` or typed reason | fixture tests |
| `src/fiscal/lookup.ts` | the port `FiscalReceiptProvider` and its in-memory double | used by ui tests |
| `src/fiscal/chk-all-web.ts` | the adapter: URL builder, answer reader, error mapping, over `FetchLike` | fixture tests through a fake transport |
| `src/fiscal/cp1251.ts` | windows-1251 → string, and the declaration-aware decode | tests incl. the raw byte fixture |
| `src/fiscal/check01.ts` | ПРРО dialect → `ParsedReceipt` | official + real fixtures |
| `src/fiscal/rro-packet.ts` | classic РРО dialect → `ParsedReceipt` | real fixture |
| `src/fiscal/document.ts` | `ParsedReceipt`/`ParsedItem`, the shared `fast-xml-parser` reader and the typed failures | through the parsers |
| `src/fiscal/numbers.ts` | decimal-and-integer text → integers, by string arithmetic | tests |
| `src/fiscal/parse.ts` | dispatch by root element, `attachable`, the «not a fiscal document» reason | tests |
| `src/db/receipts-repo.ts` | store/load/remove чек + позиції as one unit; identity lookups | in-memory SQLite over real migrations |
| `src/platform/qr-scan.ts` / `-device.ts` | permission port + double / `expo-camera` adapter | double under verify; device on the emulator |
| `src/ui/receipt-screen.ts` | the flow's states, labels, warning texts, позиція rows | pure tests |
| `src/app/transaction/scan.tsx`, `receipt.tsx`, `[id].tsx` | the screens | emulator smoke |

The fixtures every parser test reads live in `src/fiscal/fixtures/`, beside the code they prove,
from the first task that names one — `research/fixtures/` keeps the reviewer's copy and is
archived with the change. Fixtures marked `synthetic-` are hand-built from `check01.xsd` and the
ФСКО format document for shapes no observed receipt contained; every other one is a real document.

`src/fiscal/` follows the precedent of `src/saldo/` and `src/notifications/`: pure TypeScript,
no React, no Expo, no db imports; a source-hygiene test asserts it, as the ports already have.

**D2. Domain model — minimal, integer, nothing invented.**

```
FiscalReceipt {
  id: string                          // app-generated, like every other id
  transactionId: string
  registrarNumber: string             // fn — from the lookup реквізити (D2a)
  fiscalNumber: string                // id — from the lookup реквізити (D2a)
  issuedDate: IsoDate                 // the document's; must equal the lookup's date (D2a)
  issuedTime: string                  // 'HH:mm:ss'
  dialect: 'prro' | 'rro'
  kind: 'sale' | 'return'
  total: Money                        // UAH minor units — CHECKTOTAL/SUM or E@SM
  sellerName?: string; pointName?: string
  acquisition: 'qr_scan'              // the only way a чек arrives in this version
  fetchedAt: number                   // epoch ms
  snapshot: string                    // the decoded document text, immutable
}
ReceiptItem {
  id: string; receiptId: string
  line: number                        // ROWNUM / P@N — document order
  rawName: string
  quantityThousandths: number         // AMOUNT × 1000 / Q; 1000 when the document omits it
  unit?: string                       // UNITNM / AT_TM
  unitPrice?: Money                   // PRICE / PRC — absent when absent
  lineTotal: Money                    // COST / SM — the document's, never recomputed
  discount?: Money                    // DISCOUNTSUM / D@SM with NI = this line
  barcode?: string                    // BARCODE / CD
  uktzed?: string                     // UKTZED / CZD
  code?: string                       // CODE / C — the seller's internal code
}
```

Rules the parsers follow, so that «what is a позиція» is decided once:

- *Позиції* are `CHECKBODY/ROW` rows and `<P>` rows. `<L>` free text, `CHECKPAY`, `CHECKTAX`,
  `<M>`, `<E>`, `<TX>` never become позиції.
- *Weighed goods and quantity ≠ 1* are just quantities: thousandths and the unit name as printed.
  `lineTotal` is always the document's figure; `quantity × unitPrice` is never recomputed, because
  the registrar already rounded it.
- *Line discounts* attach to their позиція (`DISCOUNTSUM` inside the row; `<D NI=n>`). A discount
  without a line (`<D>` without `NI`, `CHECKTOTAL/DISCOUNTSUM`) is not kept: the чек's `total` is
  the document's total, which already reflects it — items need not sum to it, and a figure that
  merely repeats the line discounts (the official «Знижки» example: 90 = 50 + 40) would be a
  second number that can drift.
- *Identity comes from the lookup, agreement is checked* (D2a): the parsers return a
  `ParsedReceipt` without identity; `attachable(parsed, lookup)` stamps `registrarNumber` and
  `fiscalNumber` from the `ReceiptLookup` and refuses with `{ kind: 'not-this-receipt' }` when the
  document names a реєстратор (`CASHREGISTERNUM`, `DAT@FN`), a date (`ORDERDATE`, `E@TS`) or a
  total that differs from the реквізити. A ПРРО document's `ORDERTAXNUM` is not required and, when
  present, must equal the lookup's fiscal number.
- *Returns* are `kind: 'return'` (`DOCSUBTYPE` 1, `C@T` 1); позиції parse as for a sale, and the
  comparison uses absolute amounts, so a return чек matches a повернення.
- *Package, deposit and other non-product rows* that a seller prints as product rows are
  позиції like any other. No heuristic decides what is a product — that is exactly what the next
  change is for.
- *Service documents* (`DOCTYPE` ≠ 0; `C@T` 2+) parse to «not a sale or return» — a typed reason,
  since attaching a shift-open document to a витрата is never right.
- *Absent is absent*: a missing `PRICE`, `BARCODE`, `UNITNM`, `ORGNM` stays `undefined`; the
  parser never fills a placeholder.

Alternative considered — splitting items into `product` / `discount` / `service` kinds: rejected,
because every «kind» would be a heuristic the spec forbids; a line discount is a field on the
позиція and the rest is not a позиція at all.

**D3. QR reading is by parameter name, tolerant of the observed variations, strict about what it needs.**
`readReceiptQr(text)` accepts a URL whose host is `cabinet.tax.gov.ua` and path `/cashregs/check`
(scheme `https` or `http`; parameters in any order; `mac` and unknown parameters ignored). It
needs `id`, `fn`, `date` (`YYYYMMDD`), `time` (`HHmm` or `HHmmss`) and `sm` (`sum` accepted as
an alias, dot decimal, at most two fraction digits); anything missing or malformed is
`{ kind: 'incomplete', missing: [...] }`; anything else is `{ kind: 'not-a-receipt' }`. The сума
becomes minor units by string arithmetic, the same way the Saldo importer turns «12,50» into
1250 — no `parseFloat` anywhere. The result is `ReceiptLookup { fiscalNumber, registrarNumber,
date, time, seconds?, total }`.

**D4. The lookup port hides the tax service; the adapter is the one file that knows `chkAllWeb`.**
```
FiscalReceiptProvider { lookup(ref: ReceiptLookup): Promise<LookupOutcome> }
LookupOutcome = { kind:'found', document: string /* decoded XML text */ }
              | { kind:'not-found' } | { kind:'request-rejected' } | { kind:'unavailable' }
              | { kind:'unreadable' }
```
`chkAllWebProvider(fetchImpl: FetchLike)` builds
`https://cabinet.tax.gov.ua/ws/api_public/rro/chkAllWeb?id=…&fn=…&sm=…&date=YYYY-MM-DD HH:mm:ss&type=3&captcha=`
— `date` from the QR's date and time, seconds from the QR when it has them, `:00` otherwise (the
server matches to the minute; both proven); `sm` as the QR wrote it (`780.00` / `99.99`), never
re-formatted through a float; `captcha` empty. Mapping: thrown fetch / timeout / 5xx / 429 / 403
→ `unavailable`; 400 whose `error_description` starts with «Інформація відсутня» → `not-found`
(covers «Не знайдено», «не вірна сума», and the misleading «Сервіс тимчасово недоступний» of an
empty id, which our builder never sends); any other 400 → `request-rejected`; a 200 that is not
JSON, or has no string `checkXml`, or whose base64 does not decode → `unreadable`. `check`,
`checkP7s`, `sign` are read by nothing. The URL is never logged; the outcome carries no URL.
Alternative — the documented `chkAll` with an owner token: rejected by the proposal (no token,
no settings, no private cabinet). Alternative — scraping the HTML page: rejected (captcha-gated
and far more brittle than the JSON its own page consumes).

**D5. Decoding: base64 through `atob`, windows-1251 through our own table, declaration-aware.**
`atob` exists on Hermes and in Node; bytes → string goes through a 128-entry upper-half table
(bytes 0x80–0xFF of windows-1251 to code points), the lower half being ASCII. The decoder reads
the XML declaration: `windows-1251` → the table, `utf-8` → `TextDecoder('utf-8')`, no
declaration → the table (every observed document declares 1251). The stored snapshot is the
decoded text with the declaration rewritten to `UTF-8`, so the snapshot is re-parseable as is.
Alternative — `TextDecoder('windows-1251')`: rejected, Hermes supports UTF-8 only.

`ParsedReceipt` lives in `document.ts` rather than `parse.ts`, which is the one place this layout
diverges from the table's first draft: both dialect parsers produce it and `parse.ts` imports both
of them, so putting the type in `parse.ts` would have made every dialect module import its
dispatcher back. `parse.ts` re-exports it, so callers still name one module.

**D6. XML through `fast-xml-parser`, one new pure-JavaScript dependency.**
Both dialects are shallow and attribute-heavy; `fast-xml-parser` (pinned exact version) parses
them in Hermes and Node identically, handles entities and whitespace, and has no native code.
Alternatives — a hand-written tokenizer (entity and edge-case risk for no benefit) and
`@xmldom/xmldom` (already a transitive dev dependency of the Expo config plugins, but a DOM API
for a job that is two element shapes): rejected. The parsers dispatch on the root element name
(`CHECK` → `check01.ts`, `RQ` → `rro-packet.ts`) and treat everything else as «not a fiscal
document». Decimal strings (`52.30`, `5.701`) become integers by string arithmetic with the
declared scale (2 for money, 3 for quantity); a decimal with more fraction digits than its scale
is a parse failure, never rounded.

**D7. Raw XML: kept as an immutable snapshot on the чек, and in the бекап.**
Decision B, for four reasons. (1) *The source is not guaranteed to be there tomorrow*: the
endpoint is undocumented, and a receipt might be findable today and gone or gated later; the
snapshot makes a stored чек independent of it. (2) *Forward compatibility*: the parsers will
learn fields (a barcode variation, a seller-specific extension) after receipts have been stored;
re-parsing the snapshot offline is how a fix reaches old чеки without a refetch. (3) *Size is
small*: 1.5–3 KB per чек; two a day is under 3 MB a year, one order below the бекап's own
«about a megabyte» history. (4) *It is the audit trail* when a parsed позиція looks wrong. The
costs, stated: the snapshot carries what the registrar printed — seller, cashier name, masked card
number and loyalty lines in `<L>` rows. That is the same class of data as an опис and the
counterparty name, it stays on the phone, and it goes into the бекап for the same reason the опис
does: a restore must reproduce the чек without the tax service. The unencrypted бекап already
warns that whoever holds it reads the money; step 12's envelope covers this too. The screens never
read the snapshot (spec requirement); `check` (the plain text) and `checkP7s` are not kept.

**D8. Storage: two tables, cascade from the транзакція, a stable позиція id.**
`fiscal_receipts` (id PK; transaction_id FK `onDelete: cascade`, UNIQUE; registrar_number,
fiscal_number, issued_date `YYYY-MM-DD` with the GLOB check, issued_time; UNIQUE(registrar_number,
fiscal_number, issued_date) — the identity; dialect, kind with CHECKs; total_amount + total_currency;
seller_name, point_name nullable; acquisition CHECK IN
('qr_scan'); fetched_at timestamp_ms; snapshot TEXT). `receipt_items` (id PK;
receipt_id FK `onDelete: cascade`; line; raw_name; quantity_thousandths; unit; unit_price_amount /
unit_price_currency paired by CHECK; line_total_amount / line_total_currency NOT NULL;
discount_amount / discount_currency paired; barcode; uktzed; code; UNIQUE(receipt_id, line);
index on barcode for the next change). `cascade` is the one place database.md allows it: a
позиція without its чек, and a чек without its транзакція, mean nothing. The позиція's own id is
what `product-classification` will reference; nothing else here anticipates it.

**D9. Withdrawn — monobank statement details are not part of this change.**
An earlier draft added `monobank_item_details` (the bank's payment-receipt code, invoice id,
comment, original MCC and counterparty name/EDRPOU/IBAN) beside `monobank_imported_items`. It is
out, by the owner's decision of 2026-09-02, for the reason the research itself established: the
tax service's lookup needs the фіскальний номер чека and реєстратора, no statement field carries
either, and so *nothing in this change would ever have read the details back*. What was left was a
table, a migration, a row in `BACKUP_TABLES` and counterparty names and IBANs travelling in an
unencrypted бекап, in exchange for a repository getter. It becomes its own proposal the day a
screen wants those fields; `parseItem` keeps reading exactly what it reads today.

The number is kept rather than closed up so that D10–D13 and every task and spec that cites them
still mean what they say.

**D10. Migration and the бекап version.**
One generated migration adds the two tables (number assigned when the change is integrated,
after the in-flight changes' migrations, per database.md). `BACKUP_SCHEMA_VERSION` goes to the
new journal length; `BACKUP_TABLES` gains the two names; `format.ts` gains `receipts` and
`receiptItems` arrays, optional on read (an older бекап simply has none, as `watches` already
work); `checkConsistent` gains the contradictions the spec names. The
migration test proves a database holding every existing shape survives and that a fresh one
starts with no чек.

**D11. The camera: `expo-camera`, one port for permission, the scanner as a screen.**
`expo-camera ~57.0.4` (bundled with SDK 57) with its config plugin in `app.json` and
`android.permission.CAMERA` listed explicitly in `android.permissions` (the reason lives in the
`fiscal-receipts-screen` requirement, as android.md asks). The port `src/platform/qr-scan.ts` is
permission only — `state(): 'granted'|'deniable'|'blocked'|'unsupported'`, `request()`,
`openSettings()` — mapped in a pure function from `PermissionResponse { granted, canAskAgain,
status }` the same way `notificationAccessFrom` is, so the mapping is under `verify`. The scanner
itself is `src/app/transaction/scan.tsx` rendering `CameraView` with
`barcodeScannerSettings={{ barcodeTypes: ['qr'] }}` and `onBarcodeScanned`, guarded by a
`useRef` latch so the first decode wins (spec: two codes yield one); it hands the text back
through the router's params and closes. No frame is stored; the camera is never mounted outside
this screen. The scan offer's prominence keys on the seeded groceries category by its id (`groceries` in
`src/db/starter-set.ts`), not on the name «Продукти» the owner may change; a транзакція that
carries a чек shows the чек line whatever its type, and only a витрата or повернення without one
gets the scan offer. Alternatives — `expo-barcode-scanner` (folded into `expo-camera` and gone), a
third-party ML-kit scanner (a second native dependency for the same result): rejected.

**D12. The flow is a state machine in `src/ui/receipt-screen.ts`.**
`idle → permission(state) → scanning → decoded(ReceiptLookup | reason) → looking-up →
preview(compare, items) | reason(kind) → attaching → attached | reason`. Every transition takes
the ports' outcomes as values, and `retry` re-enters `looking-up` with the same `ReceiptLookup`
while the screen lives — nothing is retried unprompted. The comparison text names both amounts
with `formatMoney`, the date difference and the seller versus the опис as information. The
attach step re-reads the транзакція by id before writing, so a транзакція deleted meanwhile ends
the flow with the typed reason rather than a foreign-key error. Позиція rows for the list are
built here too (`5,701 кг × 52,30 ₴`, no «×» line without a unit price).

**D13. Nothing here touches money computations.** `compareReceiptToTransaction` takes the чек's
`total` and `kind`, the транзакція's сума, currency, type, date and опис, the issued date, and
returns `{ amounts: 'match' | 'mismatch', dateDiffersBy?: days, sellerHint?: string,
kindDiffers?: true }` — a value the screen renders; it decides nothing and stores nothing. No function in `src/domain/` beyond
this file knows a чек exists.

**D14. A photo or file can be decoded too — through `expo-camera`'s own decoder, no new permission,
but (found only on the emulator, not by `verify`) one new native module.**
`expo-camera` already exports `scanFromURLAsync(uri, barcodeTypes)` — a plain async function, not a
component, that runs the platform's own barcode detector (ML Kit on Android, confirmed in
`CameraViewModule.kt`: it loads a bitmap and hands it to `MLKitBarCodeScanner`, nothing else — no
`CAMERA` permission check, no camera hardware touched; QR only on iOS) over an image already on
disk. Because decoding here is a function and not a `<CameraView>`, unlike D11's live scan it *can*
live behind a device-testable port: `src/platform/qr-image.ts` (`QrImagePort.pickAndDecode()`)
pairs `expo-document-picker`'s `getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true })`
— already a dependency, already the exact call `bug-report-files-device.ts` and
`backup-file-device.ts` make for the same "pick an image" job — with `scanFromURLAsync(uri, ['qr'])`,
folding the outcome into `decoded` | `cancelled` | `no-qr` | `failed`. The device adapter deletes
its own cached copy of the picked image once `scanFromURLAsync` has settled, on every branch: the
picker's `copyToCacheDirectory: true` necessarily leaves a file behind to hand a `uri` to, and
qr-scan's "nothing about the chosen file is stored" is a promise about the app's own storage past
the scan, not an excuse to skip cleaning up that transient copy.

A `decoded` outcome re-enters `src/ui/receipt-screen.ts`'s `decoded()` — but through the canonical
`{ kind: 'scanning' }` state, not the caller's own, because `decodedFromImage` (design, this
decision) is reachable from states `decoded()` itself refuses: a picked photo may succeed while the
flow sits in `refused` with `camera-blocked` (the exact case this feature exists for). Routing a
successful decode through `decoded({ kind: 'scanning' }, text)` regardless of the state
`decodedFromImage` was called from means the QR text is read, compared and attached identically
whichever source or starting state it came from; only the two new refusals a camera scan cannot
produce (`image-no-qr`, `image-pick-failed`) are new to `Refusal`.

**Corrected after the emulator smoke, task 13.6**: this decision originally claimed no new native
module. `npm run verify` cannot catch this because it never loads a `-device.ts` adapter — the
first draft's claim went unchallenged by the type checker, by every test, and by `diff-reviewer`'s
first PASS, and only broke on the device. On the emulator, `scanFromURLAsync` hung forever on every
picked photo — no exception, no rejected promise, the flow silently stuck in `scanning` — because
Android's implementation calls `appContext.service<ImageLoaderInterface>()?.loadImageForManipulationFromURL(...)`
(`CameraViewModule.kt`): the `?.` means a missing service is not an error, it is *nothing at all*,
and no package in this project's tree (confirmed by grep across `node_modules`) implements
`ImageLoaderInterface` — it used to ship as its own module, `expo-image-loader`, which this project
had never needed until now. Isolated from a real bug in this feature's own code by reproducing the
identical `DocumentPicker.getDocumentAsync` call through the already-shipped, already-smoke-tested
`Відновити з файлу` (backup restore) screen on the same emulator, in the same session: that pick
returned correctly (a typed "not a бекап" refusal), proving the picker's own activity-result
plumbing was never the problem. Adding `expo-image-loader ^57.0.1` (matching this project's other
`57.0.x` pins) as a direct dependency and rebuilding fixed it outright: a photo with a чек QR reached
`looking-up` (and, for a QR missing реквізити, the "incomplete" refusal — proving the decode itself
succeeded), a photo with none produced "На цьому фото немає QR-коду.", and choosing a photo with the
camera permission permanently blocked opened the picker with no camera dialog at all — all three
confirmed on-device after the fix, none before it. **New native module** (android.md's naming duty):
`expo-image-loader ^57.0.1`, registered by autolinking; no config, no permission, no manifest entry
of its own — it exists purely to answer `appContext.service<ImageLoaderInterface>()`.

Because decoding needs no camera, the offer to pick a photo or file is not gated on the camera
permission at all: it sits beside the live viewfinder in `scanning`, and also on the three refusals
that stop the camera outright (`camera-deniable`, `camera-blocked`, `no-camera`) — a device or
permission state that stops the camera must not stop a path that never touched it. The other
refusals already return to `scanning` through «Сканувати ще раз» (`not-a-receipt`, `incomplete`,
`not-a-fiscal-document`, `not-a-sale-or-return`, `not-this-receipt`), where the photo option is
already offered, so nothing further is added there. Alternative: `expo-image-picker` — a second
native module and a second permission surface for the "pick an image" job `expo-document-picker`
already does in this codebase; rejected as a needless native footprint for an already-solved
problem.

## Risks / Trade-offs

- **`chkAllWeb` starts enforcing its captcha, changes parameters or disappears** → isolated in
  one adapter with fixture-driven contract tests; the outcome is `request-rejected` or
  `unreadable`, the screen says the service changed, transactions and sync are untouched. A
  replacement path (a captcha web view, the documented `chkAll` with a token) is a new change.
- **Rate limits unknown** → one request per explicit tap, no retries without a tap, 429/403 read
  as `unavailable` with the retry offered to the owner.
- **A ПРРО grocery document carries fields the fixtures do not show** (barcode placement, a
  vendor extension) → the snapshot keeps the truth; the first real grocery ПРРО receipt the owner
  scans becomes a sanitised fixture (task 9.3), and any parser fix re-parses old snapshots offline.
- **Windows-1251 decoding by table** → proven against the raw byte fixture and the real
  Ukrainian text in it (ґ, є, і, ї included in the upper half).
- **A wrong `sm` in the QR** (a seller prints the pre-rounding sum) → the server answers «не вірна
  сума», which maps to `not-found`; the screen's retry cannot fix it. Accepted for v1 and named
  in the not-found text.
- **The snapshot in the unencrypted бекап** → stated in D7; the same warning the бекап screen
  already shows covers it; step 12 encrypts.
- **The бекап schema tripwire fires** → by design; one constant bump with a reviewed exclusion
  list.
- **Two in-flight changes also add migrations** → the migration is generated at integration and
  the schema-version constant is set then; the tasks say so.

## Migration Plan

One append-only migration; no data moves. Rollout: `verify`, `diff-reviewer`, commit, then the
emulator smoke of tasks §11 — camera permission (ask, deny, block, grant), a real QR scan, one
successful attach with the позиції shown, a not-found retry, a non-чек QR, airplane-mode retry,
detach, and (task 11.5) picking a photo with a чек QR, a photo with none, and the photo option
still working with the camera permission blocked. Rollback is reverting the code; stored чеки stay
in their tables unread and die with the app's data, and no транзакція depends on them.

## Open Questions

- Whether grocery ПРРО receipts in the owner's shops carry `BARCODE` — answered by the first
  scan; changes a fixture, not a spec.
- The best wording for «may appear with a delay» on not-found — the smoke run decides between
  the SPA's «3–6 днів» and a shorter phrase; no requirement changes.
