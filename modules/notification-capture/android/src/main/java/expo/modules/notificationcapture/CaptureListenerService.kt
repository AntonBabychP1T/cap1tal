package expo.modules.notificationcapture

import android.app.Notification
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * The phone's own hearing, filtered to what the owner asked for (design D2, D3, D8).
 *
 * Android starts this service as soon as the owner switches the app on at «Доступ до сповіщень»,
 * and keeps it running whether or not the app is open — which is why the watched set lives in a
 * file (`CaptureStore`) rather than in JavaScript that may not have run since the phone booted.
 *
 * It filters before it stores. A notification from an app that is not watched returns from
 * `onNotificationPosted` before anything is written, read, counted or logged beyond its package
 * name: "leaves no trace" enforced at the first point the data exists, not at a later layer that
 * could be bypassed. Nothing here parses what a notification means — the four fields go to the
 * queue verbatim, and making sense of them is the engine's job in TypeScript.
 */
class CaptureListenerService : NotificationListenerService() {
  private var devReceiverRegistered = false

  /**
   * The smoke test's whole interface (design D8), and only on a debuggable build: registered
   * dynamically here rather than declared in the manifest, so a release build cannot carry it at
   * all. Four actions: set the watched set, collect, acknowledge, and the two together. `RECEIVER_EXPORTED` is what lets `adb shell am broadcast` reach it on API 33+; exported
   * means any app on a *debug* build could send these actions, and the worst that buys anyone is
   * tampering with a dev machine's queue of test notifications.
   */
  private val devReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.action) {
        devAction(context, DEV_SET_WATCHED) -> {
          val packages = intent.getStringArrayExtra(EXTRA_PACKAGES)?.toList()
            ?: intent.getStringExtra(EXTRA_PACKAGES)
              ?.split(",")
              ?.map { it.trim() }
              ?.filter { it.isNotEmpty() }
            ?: emptyList()
          CaptureStore.setWatched(context, packages)
          Log.d(TAG, "dev: watched set is now ${CaptureStore.watched(context)}")
        }

        // Collect and acknowledge separately, because together they cannot tell a queue that
        // waits for acknowledgement from one that empties itself on being read — the single
        // property D4 rejected a destructive drain for.
        devAction(context, DEV_COLLECT) -> {
          lastCollected = CaptureStore.collect(context).size
          Log.d(TAG, "dev: collected $lastCollected, waiting ${CaptureStore.waitingCount(context)}")
        }

        devAction(context, DEV_ACKNOWLEDGE) -> {
          CaptureStore.acknowledge(context, lastCollected)
          Log.d(TAG, "dev: acknowledged $lastCollected, waiting ${CaptureStore.waitingCount(context)}")
        }

        devAction(context, DEV_DRAIN) -> {
          val collected = CaptureStore.collect(context)
          CaptureStore.acknowledge(context, collected.size)
          Log.d(TAG, "dev: drained ${collected.size}, waiting ${CaptureStore.waitingCount(context)}")
        }
      }
    }
  }

  /** How many the last `DEV_COLLECT` handed over — what a following `DEV_ACKNOWLEDGE` may forget. */
  private var lastCollected = 0

  override fun onCreate() {
    super.onCreate()
    if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
      return
    }
    val filter = IntentFilter().apply {
      addAction(devAction(this@CaptureListenerService, DEV_SET_WATCHED))
      addAction(devAction(this@CaptureListenerService, DEV_COLLECT))
      addAction(devAction(this@CaptureListenerService, DEV_ACKNOWLEDGE))
      addAction(devAction(this@CaptureListenerService, DEV_DRAIN))
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(devReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      registerReceiver(devReceiver, filter)
    }
    devReceiverRegistered = true
  }

  override fun onDestroy() {
    if (devReceiverRegistered) {
      unregisterReceiver(devReceiver)
      devReceiverRegistered = false
    }
    super.onDestroy()
  }

  /**
   * Every notification the phone shows passes through here. Most of them leave immediately.
   *
   * The log line states the package name and the verdict and nothing else — never a title, never
   * a text — so even a device-local logcat on a debug build holds no notification content.
   */
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val packageName = sbn.packageName
    if (!CaptureStore.watched(this).contains(packageName)) {
      return
    }
    // A group summary repeats what its children already said; capturing it would offer the owner
    // the same транзакція twice under a vaguer text.
    if ((sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) {
      Log.d(TAG, "$packageName: group summary, dropped")
      return
    }
    val extras = sbn.notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    // The expanded text when there is one: a bank's сума and merchant often live there, with
    // `EXTRA_TEXT` holding only the collapsed first line.
    val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
      ?: extras.getCharSequence(Notification.EXTRA_TEXT))
      ?.toString()
      .orEmpty()
    if (title.isEmpty() && text.isEmpty()) {
      Log.d(TAG, "$packageName: nothing to read, dropped")
      return
    }
    val stored = CaptureStore.append(
      this,
      CapturedRecord(packageName = packageName, postedAt = sbn.postTime.toDouble(), title = title, text = text),
    )
    // The store has the last word: a monobank package it refuses to write must not be logged as
    // captured, because these lines are the smoke test's only evidence.
    Log.d(TAG, "$packageName: ${if (stored) "captured" else "refused by the store"}")
  }

  private fun devAction(context: Context, suffix: String): String = context.packageName + suffix

  private companion object {
    const val TAG = "NotificationCapture"
    const val DEV_SET_WATCHED = ".DEV_SET_WATCHED"
    const val DEV_COLLECT = ".DEV_COLLECT"
    const val DEV_ACKNOWLEDGE = ".DEV_ACKNOWLEDGE"
    const val DEV_DRAIN = ".DEV_DRAIN"
    const val EXTRA_PACKAGES = "packages"
  }
}
