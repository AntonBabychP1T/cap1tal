package expo.modules.notificationcapture

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import expo.modules.backgroundtask.BackgroundTaskConsumer
import expo.modules.interfaces.taskManager.TaskServiceProviderHelper
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.withTimeoutOrNull

/**
 * One **дочитування**: the registered background tasks, run once, exactly as a periodic chance runs
 * them (monobank-sync-freshness design D5). Each JS task decides for itself whether it has anything
 * to do — the monobank sync from its rules, the бекап from its own day — so this worker holds no
 * rule at all.
 *
 * It never schedules another: whether the chain goes on is the JS run's decision, taken after it has
 * seen what it read. And it never touches `expo-background-task`'s own periodic chain, which a run
 * of that library's worker would re-append to on every дочитування.
 */
class SyncContinuationWork(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    try {
      val service = TaskServiceProviderHelper.getTaskServiceImpl(applicationContext) ?: return Result.success()
      // The same scope key `expo-background-task` registers its tasks under.
      val consumers = service.getTaskConsumers(applicationContext.packageName)
        .filterIsInstance<BackgroundTaskConsumer>()
      val finished = consumers.map { consumer ->
        val done = CompletableDeferred<Unit>()
        try {
          consumer.executeTask { done.complete(Unit) }
        } catch (e: Exception) {
          Log.w(TAG, "task did not start: ${e.message}")
          done.complete(Unit)
        }
        done
      }
      // Inside WorkManager's ten minutes. A run that never waits ends in seconds; this bound is for
      // a JS runtime that never answers at all.
      withTimeoutOrNull(RUN_BOUND_MS) { finished.awaitAll() }
    } catch (e: Exception) {
      // A phone that cannot run the tasks now is continued by the next periodic chance.
      Log.w(TAG, "дочитування not run: ${e.message}")
    }
    return Result.success()
  }

  private companion object {
    const val TAG = "SyncContinuationWork"
    const val RUN_BOUND_MS = 9 * 60_000L
  }
}
