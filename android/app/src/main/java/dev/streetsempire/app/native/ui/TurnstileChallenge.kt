package dev.streetsempire.app.native.ui

import android.annotation.SuppressLint
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import dev.streetsempire.app.GameConfig
import org.json.JSONObject

private class TurnstileBridge(private val onToken: (String?) -> Unit) {
  @JavascriptInterface
  fun onToken(token: String) {
    onToken(token.ifBlank { null })
  }
}

/**
 * Cloudflare Turnstile ("are you a human") for the native app.
 * Same check as the browser: the server only enables it when both Turnstile
 * keys are set, and rejects sign-in without a fresh token while it is on.
 * The widget runs in a small WebView bound to the Live origin so the
 * site key sees the same hostname as the website.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun TurnstileChallenge(
  siteKey: String,
  captchaKey: Int,
  onToken: (String?) -> Unit,
) {
  val html = remember(siteKey, captchaKey) {
    val key = JSONObject.quote(siteKey)
    """
    <!doctype html>
    <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{margin:0;background:transparent}div{margin:0 auto}</style>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"></script>
    </head><body>
    <div id="w"></div>
    <script>
    function renderNow(){
      if(!window.turnstile){setTimeout(renderNow,250);return;}
      try{window.turnstile.remove('#w');}catch(e){}
      window.turnstile.render('#w',{
        sitekey:$key,
        callback:function(t){Android.onToken(t||'');},
        'expired-callback':function(){Android.onToken('');},
        'error-callback':function(){Android.onToken('');}
      });
    }
    renderNow();
    </script>
    </body></html>
    """.trimIndent()
  }

  // Keyed so typing in the login fields does NOT reload the widget and wipe
  // the token. Only a new captchaKey (after a submit) recreates the WebView.
  androidx.compose.runtime.key(siteKey, captchaKey) {
    AndroidView(
      modifier = Modifier.fillMaxWidth().height(80.dp),
      factory = { context ->
        WebView(context).apply {
          settings.javaScriptEnabled = true
          settings.domStorageEnabled = true
          settings.loadWithOverviewMode = true
          settings.useWideViewPort = true
          webViewClient = WebViewClient()
          addJavascriptInterface(TurnstileBridge(onToken), "Android")
          loadDataWithBaseURL(GameConfig.SERVER_ORIGIN, html, "text/html", "utf-8", null)
        }
      },
    )
  }
}

@Composable
fun TurnstileHint() {
  Text("Finish the \"are you a human\" check first.")
}
