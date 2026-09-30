package expo.modules.notificationcapture

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * The phone's side of a **дочитування** and of a **поштовх** (monobank-sync-freshness design D5,
 * D6): asking WorkManager for one one-off run of the registered background tasks, and noting that
 * the monobank app posted something. Nothing here decides whether to sync — the JS task does, on
 * every run, from the same rules as a periodic chance.
 *
 * Two small facts live in SharedPreferences rather than in the app's database, because the
 * listener writes them while no JavaScript is running: whether поштовхи are wanted (a рахунок is
 * linked), and the moment of the last one.
 */
internal object SyncContinuation {
  private const val TAG = "SyncContinuation"
  /** The tag every дочитування carries, which is what «one pending at a time» is checked by. */
  const val WORK_TAG = "cap1tal.monobank-continuation"
  private const val PREFS = "cap1tal.background-sync"
  private const val KEY_WANTED = "nudges_wanted"
  private const val KEY_NUDGED_AT = "nudged_at_ms"
  /**
   * A little over the bank's minute after a поштовх: the balances the next client-info answer
   * reports by then include what the notification was about, and the statement minute a periodic
   * chance may just have spent has passed.
   */
  private const val NUDGE_DELAY_MS = 65_000L

  private val lock = Any()

  /** One thread for поштовхи, so a burst is handled in order and never on the listener's thread. */
  private val nudges = Executors.newSingleThreadExecutor()

  /** Asks for one дочитування `delayMs` from now, unless one is already pending. */
  fun schedule(context: Context, delayMs: Long): Boolean {
    synchronized(lock) {
      val workManager = WorkManager.getInstance(context)
      val states = try {
        workManager.getWorkInfosByTag(WORK_TAG).get().map { it.state.name }
      } catch (e: Exception) {
        Log.w(TAG, "could not read pending work: ${e.message}")
        emptyList()
      }
      if (!NudgeRule.shouldEnqueue(states)) {
        return false
      }
      val request = OneTimeWorkRequestBuilder<SyncContinuationWork>()
        .setInitialDelay(delayMs.coerceAtLeast(0L), TimeUnit.MILLISECONDS)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .addTag(WORK_TAG)
        .build()
      workManager.enqueue(request)
      Log.d(TAG, "дочитування in ${delayMs} ms")
      return true
    }
  }

  fun setNudgesWanted(context: Context, wanted: Boolean) {
    prefs(context).edit().putBoolean(KEY_WANTED, wanted).apply()
  }

  fun nudgesWanted(context: Context): Boolean = prefs(context).getBoolean(KEY_WANTED, false)

  fun nudgedAtMs(context: Context): Long? {
    val at = prefs(context).getLong(KEY_NUDGED_AT, -1L)
    return if (at >= 0L) at else null
  }

  /**
   * A поштовх: the moment is noted and a дочитування asked for — off the listener's main thread,
   * because asking WorkManager what is pending blocks. Only the moment: this function is never
   * handed anything else about the notification.
   */
  fun nudge(context: Context, postedAtMs: Long) {
    val app = context.applicationContext
    prefs(app).edit().putLong(KEY_NUDGED_AT, postedAtMs).apply()
    nudges.execute {
      try {
        schedule(app, NUDGE_DELAY_MS)
      } catch (e: Exception) {
        Log.w(TAG, "поштовх not scheduled: ${e.message}")
      }
    }
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
