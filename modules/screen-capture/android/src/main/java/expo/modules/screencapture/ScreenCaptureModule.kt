package expo.modules.screencapture

import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlin.math.roundToInt

/**
 * One picture of the app's own window, and the two ways it is thrown away again (design D2).
 *
 * **`PixelCopy`, not a re-`draw()` of the view tree.** It reads the composited surface — what the
 * compositor actually put on the glass — so «the скріншот is the screen» is true rather than
 * approximately true: a `SurfaceView`, a video, a dialog's dim and the keyboard's own window all
 * appear as the owner saw them. Re-drawing the tree, which is what `react-native-view-shot` does,
 * gets the view hierarchy and misses those.
 *
 * **No permission, no consent dialog, no foreground service.** The window belongs to this app, and
 * reading one's own window is not a protected operation. `MediaProjection` — which captures the
 * *device* — would need all three, and would be wildly disproportionate for a screenshot of our
 * own screen.
 *
 * Deliberately thin, like `NotificationCaptureModule` beside it. Everything that decides anything
 * — what the sheet says, when the capture happens relative to the UI, what is kept and what is
 * discarded — is a pure function in `src/ui/bug-report-here.ts` proven under `npm run verify`.
 * What is left here is the crossing itself: read the surface, shrink it, write one file.
 *
 * Failures cross as `CodedException`s and the adapter turns each into a value; nothing here throws
 * anything the port cannot name.
 */

/** Where a capture lives until the репорт is stored or abandoned. Emptied whole at every launch. */
private const val DIRECTORY = "bug-report-capture"

/**
 * The longest edge a stored capture may have.
 *
 * Not cosmetic: the репорт is one Markdown file with the picture base64'd inside it, and base64
 * grows what it wraps by a third. A 1080×2400 PNG of this app's flat UI is 200–500 KB; at 1280 on
 * the long edge it is well under 200 KB, and the text on it stays perfectly readable — which is
 * the only thing the second reader needs from it (design D2, D8).
 */
private const val LONGEST_EDGE = 1280

/** PNG, and losslessly: a screenshot of flat UI is exactly what PNG is good at, and JPEG's ringing
 *  around text is exactly what would make a репорт's picture harder to read than the screen was. */
private const val MIME = "image/png"

class ScreenCaptureModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ScreenCapture")

    /**
     * The current window, as one PNG in the cache.
     *
     * Written against a `Promise` rather than as a suspending function: `PixelCopy` hands the work
     * to the compositor and calls back on a handler, and an `AsyncFunction` body is not a coroutine
     * scope, so the callback *is* the continuation. What matters to the caller is unchanged — the
     * promise settles only once the pixels are read, which is what lets `activate()` await the
     * capture before it draws the sheet.
     */
    AsyncFunction("capture") { promise: Promise ->
      try {
        val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
        val window = activity.window ?: throw CaptureFailed("Вікно застосунку недоступне")
        val view = window.decorView
        val width = view.width
        val height = view.height
        if (width <= 0 || height <= 0) {
          // The activity exists but has not been laid out — the app is starting, or is being
          // destroyed. A picture of nothing is worse than an honest refusal.
          throw CaptureFailed("Екран ще не намальовано")
        }

        val source = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        PixelCopy.request(
          window,
          source,
          { result ->
            if (result != PixelCopy.SUCCESS) {
              source.recycle()
              // A window marked FLAG_SECURE, a surface the compositor would not read, an emulator
              // on software rendering. The owner reads this sentence in the sheet and in the
              // репорт, so it names the code rather than pretending to a diagnosis.
              promise.reject(
                CaptureFailed(
                  "Система не віддала зображення екрана (код $result, Android ${Build.VERSION.SDK_INT})",
                ),
              )
            } else {
              try {
                promise.resolve(writeOut(source))
              } catch (failure: CodedException) {
                promise.reject(failure)
              } catch (failure: Exception) {
                promise.reject(CaptureFailed(failure.message ?: "Не вдалося записати файл"))
              }
            }
          },
          Handler(Looper.getMainLooper()),
        )
      } catch (failure: CodedException) {
        promise.reject(failure)
      } catch (failure: Exception) {
        promise.reject(CaptureFailed(failure.message ?: "Не вдалося прочитати зображення екрана"))
      }
    }

    /** Removes exactly one captured file — the репорт it was taken for was stored, or abandoned. */
    AsyncFunction("discard") { uri: String ->
      fileOf(uri)?.delete()
      // Total on purpose: a file already gone is the ordinary outcome of a save racing the launch
      // sweep, and there is nothing for a caller to do about it.
      Unit
    }

    /**
     * Empties the whole capture directory. The launch sweep, and nothing else calls it.
     *
     * This is the call that makes «a cancelled репорт leaves nothing behind» true rather than
     * merely intended: a process that died between the capture and the save is exactly when litter
     * would otherwise accumulate, and no exit path in the app can be responsible for that one.
     */
    AsyncFunction("discardAll") {
      captureDirectory().listFiles()?.forEach { it.delete() }
      Unit
    }
  }

  private fun captureDirectory(): File = File(appContext.cacheDirectory, DIRECTORY)

  /** The bitmap, downscaled and written as one PNG, described the way the port expects. */
  private fun writeOut(source: Bitmap): Map<String, Any> {
    val scaled = downscaled(source)
    if (scaled !== source) {
      source.recycle()
    }
    val directory = captureDirectory().apply { mkdirs() }
    val file = File(directory, "${System.currentTimeMillis()}.png")
    try {
      file.outputStream().use { stream ->
        // 100 is «no further work» for PNG, which is lossless whatever the number says.
        if (!scaled.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
          throw CaptureFailed("Не вдалося закодувати зображення")
        }
      }
    } catch (failure: Exception) {
      // No room on the device, a cache directory the system removed under us. A value for the
      // port, never a crash on the owner's screen — the репорт is filed without a picture.
      file.delete()
      scaled.recycle()
      throw if (failure is CodedException) failure
      else CaptureFailed(failure.message ?: "Не вдалося записати файл")
    }
    val described = mapOf(
      "uri" to Uri.fromFile(file).toString(),
      "mime" to MIME,
      "width" to scaled.width,
      "height" to scaled.height,
    )
    scaled.recycle()
    return described
  }

  /** A `file://` uri this module wrote, or `null` for anything else — never a path from outside. */
  private fun fileOf(uri: String): File? {
    val parsed = runCatching { Uri.parse(uri) }.getOrNull() ?: return null
    if (parsed.scheme != "file") {
      return null
    }
    val file = File(parsed.path ?: return null)
    // Only inside our own capture directory. `discard` takes a uri that came back from `capture`,
    // and a caller that passed anything else must not be able to delete by it.
    return if (file.parentFile?.canonicalPath == captureDirectory().canonicalPath) file else null
  }

  /** The same picture with its longest edge at most `LONGEST_EDGE`, or the original when it fits. */
  private fun downscaled(source: Bitmap): Bitmap {
    val longest = maxOf(source.width, source.height)
    if (longest <= LONGEST_EDGE) {
      return source
    }
    val factor = LONGEST_EDGE.toDouble() / longest
    // At least one pixel each way, so an absurdly thin window cannot produce a zero dimension.
    val width = (source.width * factor).roundToInt().coerceAtLeast(1)
    val height = (source.height * factor).roundToInt().coerceAtLeast(1)
    return Bitmap.createScaledBitmap(source, width, height, true)
  }
}

/**
 * Every way a capture can fail, as one code the adapter turns into `{ kind: 'failed', reason }`.
 *
 * One class rather than several: the port draws exactly one distinction — a platform that *cannot*
 * capture versus a capture that *did not* — and the first of those is decided in TypeScript by the
 * module being absent, not here. Everything reaching this class is the second, and the sentence it
 * carries is what the owner reads.
 */
internal class CaptureFailed(message: String) : CodedException("ERR_SCREEN_CAPTURE", message, null)
