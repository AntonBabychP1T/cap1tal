# fiscal-receipts — tasks

> This change adds a native module (`expo-camera`) and an Android permission. `npm run verify`
> covers none of the camera: the CI `android` job compiles it and §11 proves it on the emulator
> (rules/android.md). It is also gated on the owner's own edit to `docs/product-vision.md` §12 and
> §14.9, which grants the tax-service lookup its scope — the change may be implemented before that
> edit lands but must not be archived before it. Everything else — QR reading, the lookup adapter, both XML dialects, the
> decoder, the comparison, the repositories, the migration, the бекап and the screen states — is
> proven under `verify` against the fixtures in `research/fixtures/` and doubles, and the network
> is never touched.

## 1. Domain and the QR

- [x] 1.1 Create `src/domain/fiscal-receipt.ts`: `FiscalReceipt`, `ReceiptItem`, `ReceiptIdentity`
      and `compareReceiptToTransaction` (design D2, D13); verify with
      `src/domain/fiscal-receipt.test.ts` covering scenarios "Equal amounts attach without a
      warning", "A different amount warns and waits", "A foreign-currency транзакція warns", "A date
      difference is information only", "A повернення matches a return чек by absolute amount" and
      "A return чек on a витрата is information only".
- [x] 1.2 Create `src/fiscal/qr.ts`: `readReceiptQr(text)` → `ReceiptLookup` | `incomplete` |
      `not-a-receipt` (design D3), сума by string arithmetic; verify with `src/fiscal/qr.test.ts`
      covering "A ПРРО QR with seconds and a MAC is read", "A QR with the time to the minute and
      another parameter order is read", "A QR that is not a чек is refused", "A чек QR without the
      сума or the time is incomplete" and "A сума is read without floating point", plus the
      `sum=` alias and the `http` scheme.
- [x] 1.3 Add the source-hygiene test for `src/fiscal/**` (no react, expo, react-native or `src/db`
      imports), modelled on the ports' existing one; verify: `npm run verify` green.

## 2. Decoding and the two dialects

- [x] 2.0 Put the fixtures where the tests read them, and cover the shapes no observed receipt
      had. Copy `research/fixtures/*` to `src/fiscal/fixtures/` (research keeps the reviewer's
      copy). Re-encode `prro-real-1-item-test-payer.cp1251.bin` in windows-1251 **from the
      sanitised `.xml`**: the file as researched is a different, unsanitised document (real `TIN`,
      `IPN`, `POINTADDR`, `CASHIER`) and is not its sibling's source, so the assertion 2.1 used to
      make was false and the bytes should not be committed as they are. Add four hand-built
      `synthetic-*` fixtures, each with a comment naming the document it is derived from
      (`check01.xsd`, the ФСКО format document), because no real fixture carries the shape:
      `synthetic-prro-barcode.xml` (one row with `BARCODE`, one without), `synthetic-prro-shift.xml`
      (`DOCTYPE` 100), `synthetic-rro-return-discount.xml` (`C@T=1`, a `<D NI>` on a line and a
      `<D>` without `NI`), `synthetic-rro-no-barcode.xml` (a `<P>` row without `CD`); verify:
      `npm run verify` green.
- [x] 2.1 Add `fast-xml-parser` (exact version) to `package.json` (design D6) and create
      `src/fiscal/cp1251.ts`: the windows-1251 table and `decodeFiscalDocument(bytes)` honouring
      the declaration and rewriting it to UTF-8 (design D5); verify with
      `src/fiscal/cp1251.test.ts` decoding `src/fiscal/fixtures/prro-real-1-item-test-payer.cp1251.bin`
      to text equal to its `.xml` sibling with the declaration rewritten to UTF-8, every Cyrillic
      letter of the upper half round-tripping (ґ, є, і, ї included), a UTF-8-declared document
      unchanged, and `bytesFromBase64` refusing what is not base64.
- [x] 2.2 Create `src/fiscal/check01.ts` (ПРРО dialect → `ParsedReceipt`, design D2 rules) against
      the official `check01-official-*.xml` fixtures and the two `prro-real-*.xml`; verify with
      `src/fiscal/check01.test.ts` covering "A weighed product keeps its fractional quantity",
      "A line discount is kept beside its позиція and the total is the document's", "A return
      document is a return", "A barcode is kept when present and absent when not", a pretty-printed
      and a minified document parsing identically, and a service document (DOCTYPE 100) refused.
- [x] 2.3 Create `src/fiscal/rro-packet.ts` (classic РРО dialect → `ParsedReceipt`, kopiykas and
      thousandths as integers) against `rro-real-grocery-8-items.xml` and
      `synthetic-rro-return-discount.xml` / `synthetic-rro-no-barcode.xml` (the РРО fixture holds no
      `<D>`, no `C@T=1` and no row without `CD`); verify with
      `src/fiscal/rro-packet.test.ts` covering "A classic РРО grocery document parses into eight
      позиції", "A row without a unit price stays without one", "Free-text lines are not позиції",
      a `<D NI>` discount landing on its line and a `<D>` without `NI` not being kept, and
      `C@T=1` yielding a return.
- [x] 2.4 Create `src/fiscal/parse.ts` dispatching on the root element and yielding the typed
      «not a fiscal document» reason, plus `attachable(parsed, lookup)` that stamps the identity
      from the реквізити and refuses a disagreeing document (design D2a); verify with
      `src/fiscal/parse.test.ts` covering "An unknown document is refused whole" (foreign root, not
      XML, empty), both dialects dispatched, "A чек-level discount figure is not kept" (on the
      «Знижки» fixture and an `<D>` without `NI`), "A ПРРО document without a fiscal number takes its
      identity from the реквізити" and "A document that disagrees with the реквізити is refused".

## 3. The lookup port and the `chkAllWeb` adapter

- [x] 3.1 Create `src/fiscal/lookup.ts`: `FiscalReceiptProvider`, `LookupOutcome` and
      `inMemoryFiscalReceiptProvider` (seedable by identity, answerable with any outcome); verify
      with `src/fiscal/lookup.test.ts` (double semantics the ui tests rely on).
- [x] 3.2 Create `src/fiscal/chk-all-web.ts` (design D4): URL builder (`date` from QR date + time,
      seconds when present, `type=3`, `captcha=` empty, `sm` verbatim), answer reader over
      `FetchLike`, error mapping; verify with `src/fiscal/chk-all-web.test.ts` through a fake
      transport and the fixtures `chkAllWeb-200-envelope.json` (with a real base64 payload
      inserted), `chkAllWeb-400-not-found.json`, `chkAllWeb-400-wrong-sum.json`,
      `chkAllWeb-400-bad-request.json`, covering "A known чек is found", "An unknown чек is
      not-found", "A malformed answer from the tax service is unreadable", "A refused request is
      request-rejected", "Being offline is unavailable", and "One request per lookup, carrying only
      the реквізити" (the fake records exactly one URL whose query holds only id, fn, sm, date, type,
      captcha) and "A stored чек lives on the phone only" (the provider is the only outbound seam;
      nothing else in `src/fiscal/` or the repositories takes a transport).

## 4. Storage

- [x] 4.1 Add `fiscalReceipts` and `receiptItems` to `src/db/schema.ts` (design D8) and generate the migration with `npm run db:generate` — numbered after any
      in-flight migration at integration time (design D10); verify with `src/db/migrations.test.ts`
      covering "Existing data survives the migration" and "A fresh database starts empty of чеки".
- [x] 4.2 Create `src/db/receipts-repo.ts`: `attach(receipt, items)` as one unit, `forTransaction`,
      `byIdentity`, `remove`, and the cascade; verify with `src/db/receipts-repo.test.ts` covering
      "A чек round-trips whole", "A second чек on a транзакція is rejected", "The same identity is
      rejected twice", "An unknown транзакція id is rejected", "A failed позиція stores no чек",
      "Removing the транзакція removes the чек", "Replacing the транзакція keeps the чек", and the
      engine's "Deleting the транзакція deletes the чек", "Editing the сума keeps the чек",
      "Retyping keeps the чек", "Detaching deletes the чек and frees its identity" and "A failed
      store leaves no чек behind".
- 4.3 **Withdrawn** (owner's decision, 2026-09-02) — `monobank_item_details`. Nothing in this
      change would have read the bank's statement details back; see design D9. `monobank-repo` and
      `monobank-repo.test.ts` are untouched by this change.
- [x] 4.4 Extend `src/db/backup-repo.ts` snapshot and `replaceAll` with the two tables; verify
      with `src/db/backup-repo.test.ts` covering "Everything stored is in the snapshot exactly once"
      (with a чек), "A replaced state is the snapshot's and nothing else" and "A replacement that
      fails partway stores nothing" (a чек among the rows that must survive).

## 5. Monobank details — withdrawn

- 5.1 **Withdrawn** (owner's decision, 2026-09-02). `parseItem` keeps reading exactly what it
      reads today; the statement details become their own proposal when a screen wants them. The
      spec delta `specs/monobank-sync/` is removed from this change. See design D9.

## 6. Бекап

- [x] 6.1 Extend `src/backup/format.ts` (schema version to the new journal length, the two
      tables in `BACKUP_TABLES`, `receipts` / `receiptItems` optional on read, the new
      `checkConsistent` contradictions) and `src/backup/backup.ts` where the shape
      reaches it; verify with `src/backup/format.test.ts` and `src/backup/backup.test.ts` covering
      "A чек comes back under its транзакція without the tax service", "A бекап written before чеки
      existed restores without them", "A чек pointing outside the бекап stops the restore" (plus two
      чеки on one транзакція and two of one identity), and the journal-length tripwire.

## 7. The camera port

- [x] 7.1 Create `src/platform/qr-scan.ts`: `QrScanPort` (`state`, `request`, `openSettings`), the
      pure `cameraPermissionFrom({ granted, canAskAgain, status })` mapping, and
      `inMemoryQrScan(answer)` recording requests and settings openings; verify with
      `src/platform/qr-scan.test.ts` covering "A first scan asks", "A blocked permission offers the
      settings" and "A build without a camera says so".
- [x] 7.2 Add `expo-camera ~57.0.4` with its config plugin and `android.permission.CAMERA` to
      `app.json` (design D11), create `src/platform/qr-scan-device.ts` over
      `Camera.getCameraPermissionsAsync` / `requestCameraPermissionsAsync` / `Linking.openSettings`,
      answering `unsupported` when the module is absent or `Platform.OS === 'web'`; verify:
      `npx expo-doctor`, `scripts/android.sh up` builds and launches, `npm run verify` green (no
      test loads the adapter), the CI `android` job compiles.
      *Done 2026-09-02 on the emulator: `BUILD SUCCESSFUL in 59s`, installed and launched with no
      «Cannot find native module»; `<uses-permission android:name="android.permission.CAMERA"/>` is
      in the generated manifest and expo-camera's CameraX/ML-Kit libraries are in the APK.
      `npx expo-doctor` fails only its pre-existing patch-version check, which lists 14 packages
      this change did not touch and does not list `expo-camera`.*

## 8. Screen logic and screens

- [x] 8.1 Create `src/ui/receipt-screen.ts` (design D12): the flow's states and transitions over the
      ports' doubles, the Ukrainian reason texts for every failure in the `fiscal-receipts-screen`
      list, the preview and mismatch texts, and `receiptItemRows` for the list; verify with
      `src/ui/receipt-screen.test.ts` covering "A successful scan ends in a preview to confirm",
      "A mismatch is a warning with a choice", "A чек not found can be retried without scanning
      again", "Offline is a reason, not a crash", "A changed service is named as such", "A non-чек QR
      asks for another", "A document that is not the чек asks for another scan", "Cancelling
      leaves nothing behind", "A транзакція gone during the flow ends
      it", "Backing out stores nothing", "Scanning the same QR twice is one чек", "A чек attached
      elsewhere is refused, not moved", "A second чек on the same транзакція is refused", "A чек is
      not limited to «Продукти»", "Позиції are listed as printed", "A weighed позиція shows its
      quantity", "A позиція without a unit price shows no invented one", "An edited транзакція marks
      the difference", "Screens read the parsed чек" (the rows are built from the parsed чек and a
      changed snapshot changes nothing), "A grocery витрата offers the scan prominently" (by the
      seeded `groceries` id, renamed), "Another category offers it too", "A транзакція with a чек
      shows it", "A переказ offers no scan", "A retyped переказ still shows its чек", "Detaching
      after confirmation" and "Backing out of the confirmation keeps the чек".
- [x] 8.2 Add the чек line and «Сканувати QR чека» to `src/app/transaction/[id].tsx` (prominent for
      «Продукти», absent for переказ/дохід/коригування), create `src/app/transaction/scan.tsx`
      (`CameraView`, qr only, first-decode latch) and `src/app/transaction/receipt.tsx` (позиції
      list, «Відкріпити чек» with confirmation), wiring `chkAllWebProvider(fetch)` and the device
      port; verify: a test in `src/ui/` reads the `.tsx` by path and asserts the scan offer, the чек
      line and the detach confirmation are wired (never a test under `src/app/`), and `npm run
      verify` green; behaviour is §11.
- [x] 8.3 Prove "Attaching a чек changes no number" end to end in
      `src/ui/receipt-screen.test.ts` or `src/db/receipts-repo.test.ts`: the monthly picture and the
      рахунок balance computed before and after an attach are identical, and "Позиції never become
      транзакції" (the транзакція count is unchanged).

## 9. Fixtures and docs

- [x] 9.1 Check that every fixture under `src/fiscal/fixtures/` (moved in 2.0) is referenced from
      at least one test, and that no test reads `research/fixtures/`; verify: `npm run verify` green.
- [x] 9.2 Update `docs/glossary.md` (фіскальний чек, позиція чека, реквізити чека, реєстратор,
      фіскальний номер чека / реєстратора, прикріпити / відкріпити чек, квитанція vs фіскальний
      чек in the distinctions table, and the бекап entry saying it now also carries every чек with
      its source snapshot), `docs/app-overview.md` (§3.8 and §5 layout, the table count read off
      `schema.ts` rather than assumed) and `docs/tech-task.md` (a row for this change); verify:
      `npm run verify` green. `docs/product-vision.md` §12 and §14.9 are **the owner's own edit**
      and are not touched here — see the note at the top of this file.
- [ ] 9.3 After the first real grocery ПРРО receipt is scanned on the owner's phone, add its
      sanitised document as `src/fiscal/fixtures/prro-real-grocery.xml` with a parser test naming
      its позиції and whether `BARCODE` was present; verify: `npm run verify` green. (Owner's
      action; recorded as not done if no such receipt is available before archive.)

## 10. Coordination with in-flight changes

- [x] 10.1 At integration, regenerate the migration after any in-flight migration has landed and
      set the бекап schema-version constant to the journal length; verify:
      `src/db/migrations.test.ts` and the tripwire test green.
      *Done 2026-09-02: no in-flight change had landed a migration, so this one generated as
      `0011_glorious_ultragirl.sql`, the journal is 12 entries and `BACKUP_SCHEMA_VERSION` is 12.
      If `investments-value` or `google-drive-backup` lands a migration before this change is
      committed, both the migration and the constant must be regenerated.*
- [x] 10.2 If `google-drive-backup` has landed its «The tab tells the truth about what leaves the
      phone» requirement, add the чек lookup to that sentence in its spec and screen, or leave a
      note in that change's tasks if it has not; verify: `openspec validate --all` green.
      *Done 2026-09-02: `google-drive-backup` is still in flight (0/36), so the note went into its
      `tasks.md` as §12.1 rather than the amendment going into its spec — whichever of the two
      changes archives second carries the sentence.*

## 11. Emulator smoke (manual, scripted — rules/android.md)

- [ ] 11.1 Permission: fresh install → open a витрата in «Продукти» → «Сканувати QR чека» → the
      system camera dialog; deny → the reason is shown; deny with «don't ask again» → the settings
      offer; grant in settings → the scanner opens. Screenshots for each state ("A first scan asks",
      "A blocked permission offers the settings").
      *Partly done 2026-09-02: the offer renders on a витрата in the seeded groceries category,
      tapping it opens «Чек» and the system dialog appears ("A first scan asks"), and granting it
      shows the live viewfinder. The deny and deny-forever paths are still to run.
      Two defects were found and fixed on the device: the scan offer was the same filled accent as
      «Зберегти» (two competing primaries — now an outline, and a link for other categories), and
      the `CameraView` collapsed to zero height inside `Screen`'s ScrollView and rendered black
      (now a definite height).*
- [ ] 11.2 A real scan: show a чек QR to the emulator camera (a printed receipt or a generated QR
      of a real link from `research/`), see the scanner close on the first decode ("A QR in view
      ends the scan with its text", "Two codes in quick succession yield one" — hold the QR still
      and show one lookup started), «Шукаємо чек…», the preview with позиції, «Прикріпити», then
      the чек line «Фіскальний чек · N позицій · сума» on the транзакція and the позиції list ("A
      successful scan ends in a preview to confirm", "Позиції are listed as printed"); back out of
      the scanner once before scanning ("Leaving the scanner is cancelled"); quote the позиції seen.
- [ ] 11.3 Failures: a non-чек QR ("A non-чек QR asks for another"); a чек QR with a wrong сума
      ("A чек not found can be retried without scanning again", `Повторити` shown); airplane mode
      on and «Повторити» ("Offline is a reason, not a crash"), airplane mode off and «Повторити»
      succeeding without rescanning.
- [ ] 11.4 Lifecycle: scan the same QR again on the same транзакція (already attached); on another
      транзакція (refused naming the first); «Відкріпити чек» → cancel → confirm; delete the
      транзакція and show no чек remains; an attached чек readable with airplane mode on
      ("Offline reading").

## 12. Verification

- [x] 12.1 Run `npm run verify` and paste the final lines
      *2026-09-02: `Test Files 102 passed (102) / Tests 1744 passed (1744)` →
      `✔ verify passed (49150fb8f4c14189555186b2309c34e17565cd32)`*
- [x] 12.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
      *2026-09-02: first pass FAIL (3 critical — a camera-permission state no screen rendered, a
      vacuous «Scanning the same QR twice» test, and five ticked scenarios with no test carrying
      their title). All three fixed; re-review PASS, 0 critical. Four of its six warnings closed
      too; the two left standing are the vision gate below and «A QR in view ends the scan with
      its text», which belongs to §11.2.*
