# fiscal-receipts — research evidence (2026-09-01)

What was actually observed, so the reviewer and the implementer can check the proposal's
«Research findings» against it. Every request below was made live on 2026-09-01.

## How `chkAllWeb` was found

`https://cabinet.tax.gov.ua/cashregs/check` (HTTP 200) is an Angular SPA (`<base href="/">`,
bundles `main-D6BTZ2RU.js` + 129 lazy chunks). The receipt component (`selectors: [["app-check"]]`,
in `chunk-Q4XJPSWZ.js`) reads the query parameters `id`, `fn`, `time` (parsed `HHmm`), `sm`,
`date` (parsed `YYYYMMDD`), executes an invisible reCAPTCHA (`cb-captcha size="invisible"`), and
calls:

```
D.rro_public + `/chkAllWeb?id=${id}&date=${moment(date).format("YYYY-MM-DD") + " " + moment(time).format("HH:mm:ss")}&type=${3}&captcha=${captcha||""}&fn=${fn||""}&sm=${sm||""}`
// D.rro_public = "../ws/api_public/rro"
```

then, on success, base64-decodes `chk.check` into the text it shows and offers `chk.checkXml`
(base64) as a download and `chk.checkP7s` for signature verification.

## Live probes (one real classic РРО receipt: id 45, fn 3000898168, 2022-09-04 11:30:24, 780.00)

| Request | Answer |
| --- | --- |
| full, `date=2022-09-04 11:30:00&type=3&captcha=` | 200, JSON with `check`, `checkXml` |
| `captcha` omitted / `captcha=0` | 200 |
| `type` 0 / 1 / 2 / 9 | 200 (same receipt); `type` omitted or `abc` → 400 «Помилка обробки запиту» |
| time 11:30:24 / 11:30:59 | 200; 11:29:00 / 11:35:00 / 00:00:00 → 400 «Інформація відсутня Не знайдено.» |
| date only, `YYYYMMDD`, `HH:mm` without seconds | 400 «Помилка обробки запиту» |
| `sm=780` / `780.0` / `0780.00` | 200; `780.01` → 400 «Інформація відсутня не вірна сума»; `780,00` → 400 «Помилка обробки запиту»; empty → 400 «Помилка обробки запиту» |
| `fn` empty | 400 «Інформація відсутняFor input string: ""»; wrong fn → «Не знайдено» |
| `id` empty | 400 «Інформація відсутня Сервіс тимчасово недоступний .»; `045` → 200; `46` → «Не знайдено» |
| `date` empty | 400 «Неможливо виконати пошук, заповніть реквізити пошуку дата» |
| extra `mac=…` | ignored, 200 |
| POST (form or JSON) | 400; `OPTIONS` → `Allow: GET,HEAD,OPTIONS` |
| 8 sequential requests | all 200, ~3.1 s each, no rate-limit headers |

Two more real receipts were fetched the same way: a classic РРО grocery receipt (fn 3000909908,
8 позиції with EAN barcodes in `CD`) and two ПРРО receipts (fn 4000146829 and 4000191957) whose
`checkXml` is the official `check01` `<CHECK>` document. All four `checkXml` payloads were
windows-1251 bytes with a matching declaration.

## Monobank

The OpenAPI document embedded in `https://api.monobank.ua/docs/index.html` (title «Monobank
open API», version marker `v250818`); `/docs/swagger.json` answers 403. `StatementItems.items`
properties and their descriptions are quoted in the proposal. `check.gov.ua` (title «Державний
сервіс перевірки квитанцій») lists banks and payment services; its monobank entry:
`{name:"monobank", title:"Монобанк", hint:"Код квитанції це 16 символьне значення", cleverConfig:{blocks:[4,4,4,4], delimiters:["-","-","-"]}}`.

## Fixtures (`fixtures/`)

- `check01-official-tovar.xml`, `check01-official-znyzhky.xml`, `check01-official-povernennia.xml`
  — verbatim official examples from the tax service's ЄВПЕЗ documentation (as mirrored in
  `VSydorenko/prro_docs`): goods incl. a weighed row, line discounts, a return.
- `rro-real-grocery-8-items.xml` — a real classic РРО receipt (UTF-8 re-encoded), seller
  identity, cashier and free-text card/loyalty lines replaced by placeholders; barcodes kept.
- `prro-real-1-item-test-payer.xml`, `prro-real-1-item-fop.xml` — two real ПРРО receipts, seller
  identity replaced; one pretty-printed, one minified.
- `prro-real-1-item-test-payer.cp1251.bin` — the raw windows-1251 `checkXml` bytes of the test
  payer's receipt, for the decoder test (it names a test payer, no personal data).
- `chkAllWeb-200-envelope.json` — the success JSON with payloads blanked;
  `chkAllWeb-400-*.json` — the three error shapes the adapter maps.

Also consulted: `check01.xsd` (CHECKBODY row fields incl. `BARCODE`, `UKTZED`, `DKPP`,
`DESCRIPTION`, `EXCISELABELS`), the ФСКО format document (`<P>` attributes `C`, `CD` «Штрихкод»,
`CZD`, `NM`, `SM`, `Q` «×1000», `PRC`; `<D>` `NI`; `<C>` `T` 0 sale / 1 return), and three
open-source clients that call `chkAllWeb` the same way (Go, C#, Python).
