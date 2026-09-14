## 1. Dependencies

- [x] 1.1 `npx expo install expo-image-manipulator` (expect ~57.0.17) and `npm install jpeg-js@^0.4.4`;
      confirm from `node_modules/expo-image-manipulator/build/*.d.ts` the exact `crop`, `resize`,
      `renderAsync` and `saveAsync` signatures design D2/D4 rely on, and whether `jpeg-js` ships type
      declarations — if not, add a minimal ambient declaration under `types/` for `decode`/`encode`.
      **Also confirm `crop`/`resize`/`renderAsync`/`saveAsync` against the Android native module's own
      Kotlin source** (`node_modules/expo-image-manipulator/android/.../ImageManipulatorModule.kt`),
      not the `.d.ts` alone — this is what caught `.extent()` not existing on Android (design D4,
      Risks) before any code was written against it; the `.d.ts` alone would not have shown that.
      Verified by `npm run typecheck` and `npm run lint` passing with both installed and neither
      imported yet, and by `npx expo-doctor` passing with the new native dependency — the same check
      `fiscal-receipts` task 7.2 ran for `expo-camera`, since `verify` cannot prove a native module
      loads; the CI `android` job (Gradle `assembleDebug`) is the build check beyond that, alongside
      the emulator smoke of task 4.

      **Done:** `expo-image-manipulator@~57.0.17` and `jpeg-js@^0.4.4` installed (package.json).
      `jpeg-js` ships its own `index.d.ts` (`decode`/`encode`), no ambient declaration needed.
      `expo-image-manipulator`'s `.d.ts` confirmed: `ImageManipulator.manipulate(uri)` →
      `ImageManipulatorContext` with `.resize({width,height})`, `.crop({originX,originY,width,height})`,
      `.renderAsync(): Promise<ImageRef>`; `ImageRef.saveAsync({format,compress,base64}):
      Promise<{uri,width,height,base64?}>`. **`.extent()` does not exist on Android** — confirmed by
      reading `ImageManipulatorModule.kt`'s `ModuleDefinition`, which registers only `resize`,
      `rotate`, `flip`, `crop`, `reset`, `renderAsync` on `ImageManipulatorContext`; no
      `ExtentTransformer.kt` exists (unlike `CropTransformer.kt`/`ResizeTransformer.kt`/etc.), and
      grepping `android/` and `ios/` native source for "extent" returns nothing — it is web-only
      (`.d.ts` marks it `@platform web`). Design D4 revised accordingly: the margin is built in pure
      TypeScript (`padWithMargin`, task 2.2) instead of a native `.extent()` call. `expo-file-system`'s
      `File.create()`/`File.write(Uint8Array)` confirmed present for writing the padded JPEG back out.
      `npx expo-doctor`: 19/21 checks passed; the 2 failures (a nested duplicate `expo-constants`
      pulled in by `expo-auth-session`/`expo-linking`, and ~27 already-installed packages sitting
      behind their SDK 57 patch releases) are confirmed pre-existing — `git stash` (removing this
      task's `package.json`/`package-lock.json` changes) reproduces the identical 19/21 with the same
      first failure, and `expo-image-manipulator` itself is not in the version-mismatch table, so it
      landed at the SDK-expected patch version. Not this change's to fix.

## 2. The locator (pure, under `verify`)

- [x] 2.1 Write failing tests in `src/platform/qr-quiet-zone.test.ts` for `findQrSquares` over
      synthetic RGBA grids built in the test: a dark page (luminance ~32) carrying a light square
      with a QR-like module pattern whose edge modules split its light area under 4-connectivity,
      plus light text-like bars near it → exactly one candidate with that square's box (scenario
      "A чек screenshot from a dark-themed app is decoded"); a page with no square → no candidates
      ("A photo with no QR code says so"); an all-light page → no candidate covering it; a solid light
      rectangle and a sparse light bar → rejected by the fill bounds; four valid squares → the three
      largest, largest first. Then implement Otsu, 8-connected labelling with an `Int32Array` stack and
      the filters (design D3) in `src/platform/qr-quiet-zone.ts` until they pass.
- [x] 2.2 Write failing tests in the same file for `cutRect`, the margin size and `padWithMargin`: a
      candidate mapped from a 360-px working copy to a 1080-px original lands inside the true square
      by at most `ceil(scale)` px per side and never outside it; a box at the image edge is clamped;
      the margin is `floor(side / 8)`; a portrait working copy of a source whose metadata reports
      landscape maps using the render's own dimensions, not the metadata's. For `padWithMargin(image,
      margin)` (design D4 — the pure replacement for the native `.extent()` call that does not exist
      on Android): the result is `(width + 2·margin) × (height + 2·margin)`; every pixel in the
      `margin`-px border is opaque white (`255,255,255,255`); the original image's pixels reappear
      unchanged at `(margin, margin)`; `margin = 0` returns the image unpadded. Implement until they
      pass (design D3/D4).
- [x] 2.3 Write failing tests for `decodeImage(uri, steps)` (design D7) with an in-test steps double:
      first scan finds text → returned, no working copy made ("A photo that decodes at once is decoded
      as before"); first scan empty, second candidate's cut-out decodes → that text, the third
      candidate never cut ("A чек screenshot from a dark-themed app is decoded"); nothing found
      anywhere → `no-qr` ("A photo with no QR code says so"); `workingCopy`, `pixels` or a cut throwing
      → `no-qr`; the first scan throwing → rethrown; on every one of those paths every URI the steps
      produced was passed to `remove` exactly once, including when `remove` itself throws ("Nothing of
      the chosen image remains after the choice"); with fake time, a `workingCopy` or cut that never
      resolves → `no-qr` once the 8 s deadline passes, and a working copy that resolves only after the
      deadline still has its URI passed to `remove` ("Looking harder that never finishes still ends the
      choice", design D8). Implement until they pass.
- [x] 2.4 Add `scripts/qr-quiet-zone-dry-run.ts` (design D5), run
      `npx tsx scripts/qr-quiet-zone-dry-run.ts "$HOME/Downloads/2026-09-12 10.30.55.jpg" <scratch dir>`
      and `zbarimg --raw` on each cut-out it writes; record in this task the printed rect (expected
      within a few px of 420×420 at 36,1078) and only that `zbarimg` returned a
      `https://cabinet.tax.gov.ua/cashregs/check?` URL — never its query, which carries the owner's
      реквізити чека. Neither the image nor the decoded text is ever committed.

      **Done:** decoded 1080×2340; working copy 360×780 (matches the box-downscale-to-360 the
      prototype used); 2 candidates. Candidate 1: rect `{x:39,y:1080,width:414,height:414}`, margin
      51 — within a few px of the prototype's 420×420 at 36,1078 (Δx +3, Δy +2, Δside −6). Candidate
      2: rect `{x:474,y:2097,width:72,height:66}`, margin 8 — a smaller, unrelated light region;
      never reached in the real flow since candidates are tried largest-first and candidate 1
      decodes. `zbarimg --raw` on candidate 1 returned a `https://cabinet.tax.gov.ua/cashregs/check?`
      URL (exit 0); candidate 2 did not decode (exit 4, expected — it isn't the QR). Both cut-out
      files and the source photo are outside the repo (`/tmp/qr-dry-run`, `$HOME/Downloads`) and were
      deleted after the check; nothing from this task was committed.

## 3. The device adapter

- [x] 3.1 Rework `src/platform/qr-image-device.ts` to call `decodeImage` with real steps
      (`scanFromURLAsync`; `ImageManipulator` resize/crop/renderAsync/saveAsync as JPEG — no
      `extent`, design D4; `File.arrayBuffer()`/`File.create()`/`File.write()`/`File.delete()`;
      `jpeg-js` `decode`/`encode`), keeping the picker, `cancelled`, the `failed` fold and the
      picker-copy cleanup as they are; update its header comment and `qr-image.ts`'s to describe the
      second look. No change to `QrImagePort`, `inMemoryQrImage` or `src/ui/receipt-screen.ts` —
      verified by `git diff --stat` showing neither `qr-image.ts`'s types nor `receipt-screen.ts`
      changed, and `npm run verify` green.

## 4. Emulator smoke (not part of `verify`)

- [x] 4.1 `scripts/android.sh up` to rebuild with the new native module; `adb push` the real
      `2026-09-12 10.30.55.jpg` to the emulator's `Download`; open a витрата in «Продукти» →
      «Сканувати QR чека» → «Обрати фото» → pick it → «Шукаємо чек…» and a preview or a typed lookup
      refusal — anything but «На цьому фото немає QR-коду.» and not stuck in scanning ("A чек screenshot
      from a dark-themed app is decoded"). Note the time from pick to «Шукаємо чек…». Screenshot to
      `.cache/android/`.

      **Done (smoke-runner):** PASS. The first build — before the `Buffer.from` shim (task 5.4's
      CRITICAL fix) — reproducibly ended this exact scenario as «На цьому фото немає QR-коду.»
      (screenshots in `.cache/android/smoke/qr-image-quiet-zone/`, reproduced twice), with logcat
      showing no thrown exception (consistent with D1 folding the encode failure into `no-qr`
      silently). After the shim landed and the app was relaunched (Metro-served JS, no native
      change needed), the identical tap on the identical file reached «Шукаємо чек…» within ~2s and
      a full чек preview (five items, a сума mismatch note and «Прикріпити все одно») within ~7s
      total, clean logcat both re-runs. This is the on-device proof design.md's Risks section asked
      for before trusting the fix.
- [x] 4.2 Same session: pick a close-up photo of a QR that decoded before this change (it still
      decodes — "A photo that decodes at once is decoded as before"); pick a photo with no QR (still
      «На цьому фото немає QR-коду.»); back out of the picker (unchanged). Afterwards list the app's
      cache directory (`adb shell run-as <package> ls -R cache`) and confirm no working copy or cut-out
      remains ("Nothing of the chosen image remains after the choice"). If the cut-out fails on the
      device while the dry run decoded it, stop and revisit design D4 — do not tune blind.

      **Done (smoke-runner):** All three PASS — regression (decodes on first try, unchanged),
      no-QR photo (still «На цьому фото немає QR-коду.»), and backing out of the picker (no-op).
      `cache/ImageManipulator` empty and no working-copy/cut-out uri from this session's picks
      appears anywhere in `ls -R cache`; the 11 files under `cache/DocumentPicker` are confirmed
      pre-existing (dated 2026-09-11, three days before this run — an unrelated earlier smoke
      session's leftovers, outside this change's scope, not produced by anything picked today).

## 5. Close

- [x] 5.1 Add a `qr-image-quiet-zone` row to `docs/tech-task.md`'s change table beside
      `fiscal-receipts`, stating it depends on and archives after `fiscal-receipts`; verified by
      reading the table.
- [ ] 5.2 Before archiving (after `fiscal-receipts` is archived): diff this delta's copy of «A photo
      or file already on the phone can be decoded instead of the camera» against the same requirement
      in `openspec/specs/qr-scan/spec.md`, apart from this change's own additions; if `fiscal-receipts`
      changed it in the meantime, rebase the delta onto that text so archiving does not overwrite it.
      Verified by the diff showing only this change's additions.
- [x] 5.3 Run `npm run verify` and paste the final lines

      **Done:**
      ```
      Totals: 52 passed, 0 failed (52 items)
      Test Files  166 passed (166)
           Tests  3330 passed (3330)
      ✔ verify passed (227bb429d6b497a6b2114fb04b7ed4bd755f8c9e)
      ```
      (Re-run after later doc/task edits in this same session; source and tests unchanged since the
      diff-reviewer's PASS at `f3ad033db8c372c24a4f52e056cfa94217c6d84f`.)
- [x] 5.4 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

      **Done:** First pass FAIL — 1 CRITICAL: `jpeg-js`'s `encode()` unconditionally calls
      `Buffer.from(...)` when bundled, and Hermes has no global `Buffer` anywhere in this app, so
      every second-look attempt would throw on a real device and silently fold into `no-qr` (design
      D1), defeating the whole point of this change. Fixed with a minimal `Buffer.from` shim in
      `qr-image-device.ts` (design D4, new paragraph + Risks bullet); confirmed empirically under
      Node with `Buffer` deleted. Also fixed 2 WARNINGs from the same pass: `qr-image-device.ts`
      duplicated `SetTimer`/`deviceTimer` from `src/monobank/yielding.ts` instead of importing it;
      and `docs/tech-task.md`'s task-count was stale. Second pass: **PASS, 0 critical, 0 warning** —
      independently re-verified all three fixes (read `jpeg-js`'s encoder/decoder source itself,
      confirmed the shim's placement and guard, confirmed the `deviceTimer` type match via
      `typecheck`, confirmed the task count against `tasks.md`'s own checkbox count) and re-checked
      every requirement/scenario against the diff fresh.
