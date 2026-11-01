package no.flatr.tv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.WindowManager

/**
 * Starter Flatr når TV-en eller TV-boksen slås på, så skjermen viser innholdet
 * igjen etter strømbrudd uten at noen må trykke på fjernkontrollen.
 *
 * Fra Android 10 får en app bare starte seg selv fra bakgrunnen med «Vis over
 * andre apper», og nyere versjoner krever i tillegg et synlig vindu. Derfor
 * legger vi et lite, gjennomsiktig overlegg på skjermen et øyeblikk, starter
 * visningen og fjerner overlegget igjen.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val app = context.applicationContext
        val start = Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT < 29) {
            runCatching { app.startActivity(start) }
            return
        }
        if (!Settings.canDrawOverlays(app)) return

        val done = goAsync()
        val main = Handler(Looper.getMainLooper())
        val windows = app.getSystemService(WindowManager::class.java)
        val dot = View(app)
        val shown = runCatching {
            windows.addView(
                dot,
                WindowManager.LayoutParams(
                    1,
                    1,
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                    PixelFormat.TRANSLUCENT
                )
            )
        }.isSuccess
        main.postDelayed({
            runCatching { app.startActivity(start) }
            main.postDelayed({
                if (shown) runCatching { windows.removeView(dot) }
                done.finish()
            }, 2_000)
        }, 600)
    }
}
