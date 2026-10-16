package dev.streetsempire.app.native.core.network

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

interface CredentialStore : SessionTokenProvider {
  fun save(token: String)
  fun clear()
}

class TokenStore(context: Context) : CredentialStore {
  private val prefs = EncryptedSharedPreferences.create(
    context.applicationContext,
    "se_native_auth",
    MasterKey.Builder(context.applicationContext).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
  )

  override fun sessionToken(): String? = prefs.getString(KEY, null)?.takeIf { it.isNotBlank() }

  override fun save(token: String) {
    prefs.edit().putString(KEY, token).apply()
  }

  override fun clear() {
    prefs.edit().remove(KEY).apply()
  }

  companion object {
    private const val KEY = "session_token"
  }
}
