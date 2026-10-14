package dev.streetsempire.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.button.MaterialButtonToggleGroup

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var offlineView: View
    private lateinit var envToggle: MaterialButtonToggleGroup

    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val prefs by lazy { getSharedPreferences(PREFS, MODE_PRIVATE) }
    private var environment: String = "live"

    private val filePicker = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        val uris = if (it.resultCode == RESULT_OK) {
            it.data?.let { intent ->
                intent.clipData?.let { clip ->
                    Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
                } ?: intent.data?.let { uri -> arrayOf(uri) }
            }
        } else {
            null
        }
        filePathCallback?.onReceiveValue(uris)
        filePathCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        environment = GameConfig.normalizeEnvironment(
            prefs.getString(KEY_ENV, null)
        )

        webView = findViewById(R.id.web_view)
        swipeRefresh = findViewById(R.id.swipe_refresh)
        offlineView = findViewById(R.id.offline_view)
        envToggle = findViewById(R.id.env_toggle)
        findViewById<View>(R.id.btn_reload).setOnClickListener { webView.reload() }
        findViewById<View>(R.id.btn_retry).setOnClickListener {
            offlineView.visibility = View.GONE
            webView.loadUrl(currentUrl())
        }

        envToggle.check(if (environment == "beta") R.id.btn_beta else R.id.btn_live)
        envToggle.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (!isChecked) return@addOnButtonCheckedListener
            val next = if (checkedId == R.id.btn_beta) "beta" else "live"
            if (next != environment) requestEnvironmentSwitch(next)
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            // Lets the website detect the native shell (hides the PWA
            // "Get the app / Install" banner inside the app itself).
            if (!userAgentString.contains(GameConfig.NATIVE_UA_TOKEN)) {
                userAgentString = "$userAgentString ${GameConfig.NATIVE_UA_TOKEN}"
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                return if (GameConfig.isInAppUrl(url)) {
                    false // stay in the app
                } else {
                    openExternal(url)
                    true
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                swipeRefresh.isRefreshing = false
                offlineView.visibility = View.GONE
                GameConfig.sanitizeGameUrl(url, environment)?.let { safe ->
                    prefs.edit().putString(keyFor(environment), safe).apply()
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                if (request.isForMainFrame) {
                    swipeRefresh.isRefreshing = false
                    offlineView.visibility = View.VISIBLE
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return try {
                    filePicker.launch(params.createIntent())
                    true
                } catch (_: Exception) {
                    filePathCallback = null
                    false
                }
            }
        }

        swipeRefresh.setOnRefreshListener { webView.reload() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState == null) {
            webView.loadUrl(currentUrl())
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    private fun currentUrl(): String {
        val saved = prefs.getString(keyFor(environment), null)
        return GameConfig.sanitizeGameUrl(saved, environment)
            ?: GameConfig.entryFor(environment)
    }

    private fun keyFor(env: String) = if (env == "beta") KEY_BETA_URL else KEY_LIVE_URL

    private fun requestEnvironmentSwitch(next: String) {
        if (next == "beta") {
            AlertDialog.Builder(this)
                .setTitle(getString(R.string.beta_dialog_title))
                .setMessage(getString(R.string.beta_dialog_message))
                .setPositiveButton(getString(R.string.beta_dialog_open)) { _, _ ->
                    switchEnvironment(next)
                }
                .setNegativeButton(android.R.string.cancel) { _, _ ->
                    envToggle.check(
                        if (environment == "beta") R.id.btn_beta else R.id.btn_live
                    )
                }
                .setCancelable(true)
                .setOnCancelListener {
                    envToggle.check(
                        if (environment == "beta") R.id.btn_beta else R.id.btn_live
                    )
                }
                .show()
        } else {
            switchEnvironment(next)
        }
    }

    private fun switchEnvironment(next: String) {
        environment = GameConfig.normalizeEnvironment(next)
        prefs.edit().putString(KEY_ENV, environment).apply()
        offlineView.visibility = View.GONE
        webView.loadUrl(currentUrl())
    }

    private fun openExternal(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: Exception) {
            // No browser available; stay on the current page.
        }
    }

    companion object {
        private const val PREFS = "streetsempire"
        private const val KEY_ENV = "environment"
        private const val KEY_LIVE_URL = "last_live_url"
        private const val KEY_BETA_URL = "last_beta_url"
    }
}
