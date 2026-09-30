package expo.modules.notificationcapture

import android.app.Notification

/**
 * What the listener does with one posted notification, decided from the posting package, its
 * flags and two facts the app has told the phone — nothing else about the notification is an input
 * here, which is the privacy rule in the shape of a signature (monobank-sync-freshness design D6).
 *
 * Pure and Android-free apart from the flag constants, so a JVM unit test proves it without a
 * device: that a monobank notification can only ever be a поштовх or nothing, never a capture,
 * whatever a stored watched set says.
 */
internal object NudgeRule {
  enum class Route {
    /** A monobank notification while a рахунок is linked: note its moment, ask for a дочитування. */
    NUDGE,
    /** A watched bank app's notification: the capture path, unchanged. */
    CAPTURE,
    /** Anything else: leaves no trace. */
    DROP,
  }

  /**
   * Flags that say a notification is not news: an ongoing one (a download, a call), one belonging
   * to a foreground service, and a group summary, which repeats what its children already said.
   */
  private const val NOT_NEWS =
    Notification.FLAG_ONGOING_EVENT or Notification.FLAG_FOREGROUND_SERVICE or Notification.FLAG_GROUP_SUMMARY

  fun route(packageName: String, flags: Int, nudgesWanted: Boolean, watched: Set<String>): Route {
    if (packageName.startsWith(CaptureStore.MONOBANK_PACKAGE_PREFIX)) {
      // Decided before the watched set is looked at: monobank is never captured, and a watched set
      // that somehow names it changes nothing here.
      return if (nudgesWanted && (flags and NOT_NEWS) == 0) Route.NUDGE else Route.DROP
    }
    return if (watched.contains(packageName)) Route.CAPTURE else Route.DROP
  }

  /** The states of the дочитування work already known to WorkManager, as names. */
  fun shouldEnqueue(states: Collection<String>): Boolean =
    // One pending at a time: a request while one waits (ENQUEUED) or waits on another (BLOCKED)
    // changes nothing, which is what bounds a chatty monobank app to about one прогін a minute.
    states.none { it == "ENQUEUED" || it == "BLOCKED" }
}
