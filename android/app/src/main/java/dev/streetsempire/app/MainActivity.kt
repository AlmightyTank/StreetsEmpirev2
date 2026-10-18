package dev.streetsempire.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
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
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var offlineView: View
    private lateinit var billing: PlayBillingManager

    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val prefs by lazy { getSharedPreferences(PREFS, MODE_PRIVATE) }

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
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_main)

        val appRoot = findViewById<View>(R.id.app_root)
        val statusBarSpacer = findViewById<View>(R.id.system_status_bar)
        val minimumStatusBarHeight = (32 * resources.displayMetrics.density).toInt()
        ViewCompat.setOnApplyWindowInsetsListener(appRoot) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            statusBarSpacer.layoutParams = statusBarSpacer.layoutParams.apply {
                height = maxOf(systemBars.top, minimumStatusBarHeight)
            }
            // The web tab bar already applies CSS safe-area padding. Adding the
            // Android bottom inset here creates a second empty bar below it.
            view.setPadding(systemBars.left, 0, systemBars.right, 0)
            insets
        }
        ViewCompat.requestApplyInsets(appRoot)
        val insetsController = WindowCompat.getInsetsController(window, window.decorView)
        insetsController.isAppearanceLightStatusBars = false
        insetsController.isAppearanceLightNavigationBars = false

        webView = findViewById(R.id.web_view)
        swipeRefresh = findViewById(R.id.swipe_refresh)
        offlineView = findViewById(R.id.offline_view)
        // User-agent detection can be changed or omitted by WebView providers.
        // Expose a tiny explicit marker so the website reliably selects Play
        // Billing instead of Stripe inside the Android shell.
        webView.addJavascriptInterface(AndroidShellBridge(), "StreetsEmpireAndroid")
        findViewById<View>(R.id.btn_retry).setOnClickListener {
            offlineView.visibility = View.GONE
            webView.loadUrl(currentUrl())
        }

        billing = PlayBillingManager(
            this,
            onPurchase = { token -> dispatchBillingEvent("streets:play-purchase", token) },
            onCrownPurchase = { productId, token -> dispatchBillingEvent("streets:play-crown-purchase", "$productId|$token") },
            onError = { message -> dispatchBillingEvent("streets:play-billing-error", message) },
        )

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
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
                if (GameConfig.isBillingUrl(request.url)) {
                    handleBillingUrl(request.url)
                    return true
                }
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
                GameConfig.sanitizeGameUrl(url)?.let { safe ->
                    prefs.edit().putString(KEY_LIVE_URL, safe).apply()
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
        val saved = prefs.getString(KEY_LIVE_URL, null)
        val safe = GameConfig.sanitizeGameUrl(saved) ?: GameConfig.LIVE_ENTRY
        return Uri.parse(safe).buildUpon()
            .appendQueryParameter("se_android", "1")
            .build()
            .toString()
    }

    private fun handleBillingUrl(uri: Uri) {
        when (uri.path?.trim('/')) {
            "supporter" -> billing.startPurchase(uri.getQueryParameter("account") ?: "")
            "crown-pack" -> billing.startCrownPurchase(uri.getQueryParameter("product") ?: "", uri.getQueryParameter("account") ?: "")
            "restore" -> billing.restorePurchases()
            "manage" -> openExternal(
                "https://play.google.com/store/account/subscriptions" +
                    "?sku=${GameConfig.SUPPORTER_PRODUCT_ID}&package=$packageName"
            )
        }
    }

    private fun dispatchBillingEvent(name: String, value: String) {
        val event = JSONObject.quote(name)
        val detail = JSONObject.quote(value)
        runOnUiThread {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent($event,{detail:$detail}));",
                null,
            )
        }
    }

    private fun openExternal(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: Exception) {
            // No browser available; stay on the current page.
        }
    }

    private class AndroidShellBridge {
        @JavascriptInterface
        fun isNative(): Boolean = true
    }

    override fun onDestroy() {
        billing.close()
        super.onDestroy()
    }

    companion object {
        private const val PREFS = "streetsempire"
        private const val KEY_LIVE_URL = "last_live_url"
    }
}
