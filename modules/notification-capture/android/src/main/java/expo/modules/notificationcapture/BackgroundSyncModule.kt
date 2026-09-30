package expo.modules.notificationcapture

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The monobank sync's background calls into the phone (monobank-sync-freshness design D5–D7):
 * asking for a дочитування, reading the last поштовх, saying whether поштовхи are wanted, and
 * reading and fixing how Android treats the app's background work.
 *
 * In this Gradle module rather than one of its own because the поштовх starts in
 * `CaptureListenerService`, which is here: one module, one place the monobank package is routed.
 */
class BackgroundSyncModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("BackgroundSync")

    /** One дочитування `delayMs` from now, unless one is pending. Off the JS thread: it blocks. */
    AsyncFunction("continueLater") { delayMs: Double ->
      SyncContinuation.schedule(context, delayMs.toLong())
    }

    /** The moment of the last поштовх, or null. */
    Function("nudgedAtMs") {
      SyncContinuation.nudgedAtMs(context)?.toDouble()
    }

    Function("setNudgesWanted") { wanted: Boolean ->
      SyncContinuation.setNudgesWanted(context, wanted)
    }

    /**
     * `restricted` when the owner restricted the app's background activity (API 28+), `optimised`
     * while it is not exempt from battery optimisation, `allowed` otherwise.
     */
    Function("restriction") {
      val activity = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && activity.isBackgroundRestricted -> "restricted"
        !power.isIgnoringBatteryOptimizations(context.packageName) -> "optimised"
        else -> "allowed"
      }
    }

    /**
     * The phone's own way out: its battery-optimisation request (the app's own dialog, answered by
     * the owner) for `optimised`, the app's settings page for `restricted`.
     */
    AsyncFunction("openRestrictionFix") { restriction: String ->
      val activity = appContext.currentActivity
      val packageUri = Uri.parse("package:${context.packageName}")
      val intents = when (restriction) {
        "optimised" -> listOf(
          Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, packageUri),
          Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
        )
        "restricted" -> listOf(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri))
        else -> emptyList()
      }
      val intent = intents.firstOrNull { it.resolveActivity(context.packageManager) != null } ?: return@AsyncFunction
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }
  }
}
