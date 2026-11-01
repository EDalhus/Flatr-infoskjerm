package no.flatr.tv

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import android.window.OnBackInvokedDispatcher
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.concurrent.thread

/**
 * Flatr på Android TV og Google TV: skjermvisningen fra nettet i fullskjerm.
 *
 * Første gang viser flatr.no/tv en kode som kobles til en skjerm i Flatr. Siden går
 * så til skjermvisningen hos kunden, som appen husker – etter strømbrudd starter
 * den rett der (og nettleserens lager viser innholdet selv uten nett).
 * Appen holder skjermen våken, starter når TV-en slås på (BootReceiver), tar
 * skjermbilder til admin og prøver igjen av seg selv når nettet er borte.
 */
class MainActivity : Activity() {

    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private lateinit var message: TextView
    private val handler = Handler(Looper.getMainLooper())
    private val prefs by lazy { getSharedPreferences("flatr", MODE_PRIVATE) }

    /** Enheten siden er koblet til som (fra window.FlatrAndroid.paired). */
    private var device: JSONObject? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        message = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 26f
            gravity = Gravity.CENTER
            visibility = View.GONE
        }
        setContentView(root)
        createWebView()
        root.addView(message, FrameLayout.LayoutParams(-1, -1))
        device = prefs.getString(KEY_DEVICE, null)?.let { runCatching { JSONObject(it) }.getOrNull() }

        // Tilbake-knappen på fjernkontrollen skal ikke lukke skjermvisningen ved et uhell.
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { back() }
        }

        web.loadUrl(startUrl())
        askToStartOnBoot()
        handler.postDelayed(screenshotLoop, SCREENSHOT_EVERY_MS)
    }

    private fun createWebView() {
        web = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                userAgentString = "$userAgentString FlatrAndroidTV/${BuildConfig.VERSION_NAME}"
            }
            addJavascriptInterface(Bridge(), "FlatrAndroid")
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) = remember(url)

                override fun onPageFinished(view: WebView, url: String) {
                    if (!failed) message.visibility = View.GONE
                    failed = false
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) offline()
                }

                // Visningen krasjet (f.eks. tom for minne): start på nytt i stedet for å lukke appen.
                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    root.removeView(web)
                    web.destroy()
                    createWebView()
                    web.loadUrl(startUrl())
                    return true
                }
            }
        }
        root.addView(web, 0, FrameLayout.LayoutParams(-1, -1))
        web.requestFocus()
    }

    private var failed = false

    /** Uten nett og uten lagret innhold: si fra, og prøv igjen om litt. */
    private fun offline() {
        failed = true
        message.text = getString(R.string.offline)
        message.visibility = View.VISIBLE
        handler.removeCallbacks(retry)
        handler.postDelayed(retry, RETRY_MS)
    }

    private val retry = Runnable { web.loadUrl(startUrl()) }

    // MARK: - Adresser

    /** Flatr på nettet. Testbygget kan peke på en lokal server: am start … -e base http://… */
    private fun base(): String =
        (if (BuildConfig.DEBUG) intent?.getStringExtra("base") else null)?.trimEnd('/') ?: BuildConfig.START_URL

    /** Skjermen den sist viste, ellers koblingssiden. */
    private fun startUrl(): String = prefs.getString(KEY_DISPLAY, null) ?: "${base()}/tv?${query()}"

    /** Opplysninger koblingssiden sender til admin (app, versjon, modell). */
    private fun query(): String {
        val enc = { s: String -> URLEncoder.encode(s, "UTF-8") }
        val model = listOf(Build.MANUFACTURER.replaceFirstChar { it.uppercase() }, Build.MODEL)
            .distinct().joinToString(" ")
        return "app=android&v=${enc(BuildConfig.VERSION_NAME)}&model=${enc(model)}&os=${enc("Android ${Build.VERSION.RELEASE}")}"
    }

    /** Husk skjermvisningen, så appen starter der neste gang. */
    private fun remember(url: String) {
        val uri = Uri.parse(url)
        when {
            uri.path?.startsWith("/display/") == true ->
                prefs.edit().putString(KEY_DISPLAY, url.substringBefore('#')).apply()
            uri.path == "/tv" -> prefs.edit().remove(KEY_DISPLAY).apply()
        }
    }

    // MARK: - Siden snakker med appen (window.FlatrAndroid)

    inner class Bridge {
        @JavascriptInterface
        fun query(): String = this@MainActivity.query()

        /** Koblet til: { device_id, token, origin } – brukes til skjermbilder. */
        @JavascriptInterface
        fun paired(json: String) {
            val info = runCatching { JSONObject(json) }.getOrNull() ?: return
            handler.post {
                val first = device?.optString("device_id") != info.optString("device_id")
                device = info
                prefs.edit().putString(KEY_DEVICE, info.toString()).apply()
                if (first) handler.postDelayed({ screenshot() }, 15_000)
            }
        }

        @JavascriptInterface
        fun unpaired() {
            handler.post {
                device = null
                prefs.edit().remove(KEY_DEVICE).remove(KEY_DISPLAY).apply()
            }
        }

        @JavascriptInterface
        fun screenshot() {
            handler.post { this@MainActivity.screenshot() }
        }
    }

    // MARK: - Skjermbilder til admin

    private val screenshotLoop: Runnable = object : Runnable {
        override fun run() {
            screenshot()
            handler.postDelayed(this, SCREENSHOT_EVERY_MS)
        }
    }

    /** Tegner visningen til et bilde og sender det til Flatr (samme som Apple TV-appen). */
    private fun screenshot() {
        val d = device ?: return
        if (web.width == 0 || web.height == 0) return
        val scale = minOf(1f, 1280f / web.width)
        val bitmap = runCatching {
            Bitmap.createBitmap((web.width * scale).toInt(), (web.height * scale).toInt(), Bitmap.Config.ARGB_8888).also {
                val canvas = Canvas(it)
                canvas.scale(scale, scale)
                web.draw(canvas)
            }
        }.getOrNull() ?: return
        thread {
            runCatching {
                val jpeg = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 72, it) }.toByteArray()
                bitmap.recycle()
                val url = URL("${d.getString("origin")}/api/pairing/screenshot/${d.getString("device_id")}")
                (url.openConnection() as HttpURLConnection).run {
                    requestMethod = "POST"
                    doOutput = true
                    connectTimeout = 15_000
                    readTimeout = 30_000
                    setRequestProperty("Authorization", "Bearer ${d.getString("token")}")
                    setRequestProperty("Content-Type", "image/jpeg")
                    outputStream.use { it.write(jpeg) }
                    responseCode
                    disconnect()
                }
            }
        }
    }

    // MARK: - Oppstart når TV-en slås på

    /**
     * Fra Android 10 kan en app bare starte seg selv ved oppstart hvis den får
     * «Vis over andre apper». Forklar hvorfor og åpne innstillingen – én gang.
     * Google TV viser lista over alle apper, så vi sier hvilken som skal velges.
     */
    private fun askToStartOnBoot() {
        if (Build.VERSION.SDK_INT < 29 || Settings.canDrawOverlays(this) || prefs.getBoolean(KEY_ASKED, false)) return
        prefs.edit().putBoolean(KEY_ASKED, true).apply()
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(R.string.autostart_title)
            .setMessage(R.string.autostart_text)
            .setPositiveButton(R.string.autostart_open) { _, _ ->
                try {
                    startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
                } catch (_: ActivityNotFoundException) {
                    // Noen TV-er har ikke denne innstillingen. Da startes Flatr fra menyen.
                }
            }
            .setNegativeButton(R.string.autostart_skip, null)
            .show()
    }

    // MARK: - Fjernkontroll og livsløp

    /** Tilbake: på koblingssiden lukkes appen, i skjermvisningen skjer ingenting. */
    private fun back() {
        if (prefs.getString(KEY_DISPLAY, null) == null) finish()
    }

    @Deprecated("Brukes før Android 13")
    override fun onBackPressed() = back()

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        // Meny-knappen laster skjermen inn på nytt (nyttig hvis noe henger).
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            web.reload()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (!hasFocus) return
        if (Build.VERSION.SDK_INT >= 30) {
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        }
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        web.destroy()
        super.onDestroy()
    }

    private companion object {
        const val KEY_DISPLAY = "display"
        const val KEY_DEVICE = "device"
        const val KEY_ASKED = "asked_overlay"
        const val RETRY_MS = 15_000L
        const val SCREENSHOT_EVERY_MS = 10 * 60_000L
    }
}
