package expo.modules.notificationcapture

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Where a captured notification waits, and where the watched set is remembered (design D4).
 *
 * Two files under `noBackupFilesDir/notification-capture/`: `queue.jsonl`, one JSON object per
 * line, oldest first, and `watched.json`, one JSON array of package names. `noBackupFilesDir` is
 * excluded from Android Auto Backup by the operating system itself, which is how the spec's
 * "no backup ever includes it" becomes structural rather than a rule someone must remember on the
 * day a backup ships (vision §12).
 *
 * The listener service and the module's own calls run in one process, so one lock serialises
 * every read and every write — a notification arriving while the app is collecting cannot leave a
 * half-written file behind. Every write goes to a temporary file and is renamed over the target,
 * so a process killed mid-write leaves either the old file or the new one, never half of either.
 *
 * Nothing here parses a notification, decides what it means, or knows what a рахунок is. It holds
 * lines.
 */
internal object CaptureStore {
  /**
   * How many captured notifications may wait at once. Far above any real day of bank
   * notifications; when it is reached the oldest is forgotten to make room, because refusing the
   * newest would lose the транзакція the owner is looking at right now — and a forgotten one
   * degrades to typing it by hand, which is what the whole feature degrades to anyway.
   */
  const val MAX_WAITING = 500

  /**
   * The monobank app family, dropped on write. `src/platform/notification-capture.ts` refuses a
   * watched set naming it before the call ever reaches here; this is the second line, for a set
   * that arrived another way (the debug broadcast) and for a notification posted while such a set
   * was somehow stored. monobank is read through its API with real ids and balances; a second,
   * weaker path over the same рахунки could only manufacture duplicates.
   */
  const val MONOBANK_PACKAGE_PREFIX = "com.ftband.mono"

  private const val DIRECTORY = "notification-capture"
  private const val QUEUE_FILE = "queue.jsonl"
  private const val WATCHED_FILE = "watched.json"

  private val lock = Any()

  /**
   * The lines the last collection handed over. An acknowledgement may forget these and nothing
   * else — never a blind count from the head of the file, which a bound eviction between the two
   * calls would turn into eating records that were never delivered. Held in memory on purpose: a
   * process that died between collecting and acknowledging remembers nothing, so it forgets
   * nothing, and every record is handed over again.
   */
  private var lastCollected: List<String> = emptyList()

  /** Replaces the whole watched set. The set is what it was last told, minus monobank. */
  fun setWatched(context: Context, packages: List<String>) {
    synchronized(lock) {
      val kept = packages.filterNot { it.startsWith(MONOBANK_PACKAGE_PREFIX) }.distinct()
      write(file(context, WATCHED_FILE), listOf(JSONArray(kept).toString()))
    }
  }

  /**
   * The set as it stands. Read from the file on every notification rather than cached, so a
   * listener the system started before any of the app's JavaScript ran still filters correctly —
   * that is what "the watched set holds without the app running" means. No file, or a torn one,
   * is the empty set: watch nothing, capture nothing.
   */
  fun watched(context: Context): Set<String> {
    synchronized(lock) {
      val raw = readLines(file(context, WATCHED_FILE)).firstOrNull() ?: return emptySet()
      return try {
        val array = JSONArray(raw)
        (0 until array.length()).mapNotNull { index -> array.optString(index).takeIf { it.isNotEmpty() } }.toSet()
      } catch (_: Exception) {
        emptySet()
      }
    }
  }

  /**
   * One more captured notification at the tail, the oldest dropped if the queue is full. Answers
   * whether it was stored, because the caller logs the verdict and the one path where that log
   * must not lie is the monobank drop below.
   *
   * The whole file is rewritten rather than appended to: at 500 short lines that costs nothing,
   * and it makes the bound and the atomic rename one operation instead of an append that can tear
   * its last line and a separate trim that can crash between the two.
   */
  fun append(context: Context, record: CapturedRecord): Boolean {
    if (record.packageName.startsWith(MONOBANK_PACKAGE_PREFIX)) {
      return false
    }
    synchronized(lock) {
      val queue = file(context, QUEUE_FILE)
      val lines = readLines(queue) + encode(record)
      write(queue, if (lines.size > MAX_WAITING) lines.takeLast(MAX_WAITING) else lines)
    }
    return true
  }

  /**
   * Everything waiting, oldest first, removed from nothing. What was handed over comes back on
   * the next collection until it is acknowledged, so a crash between this call and the app's own
   * commit loses nothing and the redelivery dies at the engine's fingerprint dedup.
   *
   * The one thing collection does drop is a line that is not a record at all — a write torn by a
   * process killed at exactly the wrong moment. It is skipped rather than thrown (the engine's
   * totality idiom, applied to our own storage) and removed rather than left, because a line no
   * collection can hand over is a line no acknowledgement can ever forget, and it would sit at the
   * head of the queue blocking every acknowledgement after it.
   */
  fun collect(context: Context): List<CapturedRecord> {
    synchronized(lock) {
      val queue = file(context, QUEUE_FILE)
      val lines = readLines(queue)
      val readable = lines.mapNotNull { line -> decode(line)?.let { line to it } }
      if (readable.size != lines.size) {
        write(queue, readable.map { it.first })
      }
      lastCollected = readable.map { it.first }
      return readable.map { it.second }
    }
  }

  /**
   * Forgets the oldest `count` of what the last collection handed over — and only while those
   * exact lines are still at the head of the file. Anything captured since the collection stays
   * waiting, and a queue that forgot its oldest to make room in the meantime cannot make this
   * eat a record that was never delivered.
   */
  fun acknowledge(context: Context, count: Int) {
    synchronized(lock) {
      val snapshot = lastCollected.take(count.coerceAtLeast(0))
      if (snapshot.isEmpty()) {
        return
      }
      val queue = file(context, QUEUE_FILE)
      val lines = readLines(queue)
      var forgotten = 0
      while (forgotten < snapshot.size && forgotten < lines.size && lines[forgotten] == snapshot[forgotten]) {
        forgotten += 1
      }
      if (forgotten == 0) {
        return
      }
      write(queue, lines.drop(forgotten))
      lastCollected = lastCollected.drop(forgotten)
    }
  }

  /** How many are waiting. For the debug drain's log line only — it counts, it never reads. */
  fun waitingCount(context: Context): Int {
    synchronized(lock) {
      return readLines(file(context, QUEUE_FILE)).size
    }
  }

  private fun file(context: Context, name: String): File =
    File(File(context.applicationContext.noBackupFilesDir, DIRECTORY), name)

  private fun readLines(file: File): List<String> = try {
    if (file.exists()) file.readLines().filter { it.isNotBlank() } else emptyList()
  } catch (_: Exception) {
    emptyList()
  }

  /** Temporary file, then rename: the target is only ever the whole old content or the whole new. */
  private fun write(file: File, lines: List<String>) {
    val directory = file.parentFile ?: return
    directory.mkdirs()
    val temporary = File(directory, "${file.name}.tmp")
    temporary.writeText(lines.joinToString(separator = "\n", postfix = if (lines.isEmpty()) "" else "\n"))
    if (!temporary.renameTo(file)) {
      file.delete()
      temporary.renameTo(file)
    }
  }

  private fun encode(record: CapturedRecord): String = JSONObject()
    .put("packageName", record.packageName)
    .put("postedAt", record.postedAt)
    .put("title", record.title)
    .put("text", record.text)
    .toString()

  private fun decode(line: String): CapturedRecord? = try {
    val json = JSONObject(line)
    CapturedRecord(
      packageName = json.getString("packageName"),
      postedAt = json.getDouble("postedAt"),
      title = json.optString("title"),
      text = json.optString("text"),
    )
  } catch (_: Exception) {
    null
  }
}
