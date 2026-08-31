package expo.modules.notificationcapture

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * One notification another bank's app posted, as the engine's `CapturedNotification` — the same
 * four fields, in the same order, under the same names (`src/notifications/capture.ts`). This
 * class is the seam: what Kotlin stores is exactly what `processCapture` consumes, with no third
 * shape in between and no parsing on this side of it.
 *
 * `postedAt` is a Double because that is what a JavaScript number is; epoch milliseconds fit in
 * one exactly, and Android's own `postTime` is what fills it.
 */
data class CapturedRecord(
  @Field val packageName: String,
  @Field val postedAt: Double,
  @Field val title: String,
  @Field val text: String,
) : Record
