package expo.modules.notificationcapture

import android.content.Context
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The four calls the app makes into the phone's own hearing (design D5): is the listener switched
 * on, what is watched now, what is waiting, and what may be forgotten.
 *
 * Deliberately thin. Every rule that could be a pure function is one — the monobank refusal in
 * `src/platform/notification-capture.ts`, the parsing in `src/notifications/` — and everything
 * that must touch a file is `CaptureStore`. What is left here is the crossing itself.
 *
 * Synchronous on purpose: the queue holds at most 500 short lines, and the app's own drain is one
 * call at startup. An async surface would buy nothing and would let a collection and its
 * acknowledgement interleave.
 */
class NotificationCaptureModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("NotificationCapture")

    /**
     * Whether the owner has switched this app on at Android's «Доступ до сповіщень». The OS's own
     * list is the only truth here: a build that carries the listener but was never granted, and a
     * grant later revoked, both answer honestly without the app remembering anything.
     */
    Function("isAccessGranted") {
      NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }

    /** The whole watched set, replacing whatever was stored. Monobank is dropped on write (D6). */
    Function("setWatchedPackages") { packages: List<String> ->
      CaptureStore.setWatched(context, packages)
    }

    /** Everything waiting, oldest first. Removes nothing — only `acknowledge` does. */
    Function("collect") {
      CaptureStore.collect(context)
    }

    /** Forgets the oldest `count` of what the last collection handed over, and nothing else. */
    Function("acknowledge") { count: Int ->
      CaptureStore.acknowledge(context, count)
    }
  }
}
