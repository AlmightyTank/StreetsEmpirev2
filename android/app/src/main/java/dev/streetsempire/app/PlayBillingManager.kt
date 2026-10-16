package dev.streetsempire.app

import android.app.Activity
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams

/** Google Play subscription UI. The server remains authoritative for entitlements. */
class PlayBillingManager(
    private val activity: Activity,
    private val onPurchase: (String) -> Unit,
    private val onError: (String) -> Unit,
) : PurchasesUpdatedListener {
    private val billingClient = BillingClient.newBuilder(activity)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
        )
        .enableAutoServiceReconnection()
        .build()

    private var accountToken: String? = null
    private var startAfterConnect = false
    private var restoreAfterConnect = false
    private val deliveredPurchaseTokens = mutableSetOf<String>()

    fun startPurchase(obfuscatedAccountId: String) {
        accountToken = obfuscatedAccountId.takeIf { it.matches(Regex("^[a-f0-9]{64}$")) }
        if (accountToken == null) {
            onError("Sign in again before starting support.")
            return
        }
        if (!billingClient.isReady) {
            startAfterConnect = true
            connect()
            return
        }
        queryProductAndLaunch()
    }

    fun restorePurchases() {
        if (!billingClient.isReady) {
            restoreAfterConnect = true
            connect()
            return
        }
        queryOwnedSubscriptions()
    }

    private fun connect() {
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    onError("Google Play billing is unavailable (${result.debugMessage}).")
                    return
                }
                if (startAfterConnect) {
                    startAfterConnect = false
                    queryProductAndLaunch()
                }
                if (restoreAfterConnect) {
                    restoreAfterConnect = false
                    queryOwnedSubscriptions()
                }
            }

            override fun onBillingServiceDisconnected() = Unit
        })
    }

    private fun queryProductAndLaunch() {
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(GameConfig.SUPPORTER_PRODUCT_ID)
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()
        billingClient.queryProductDetailsAsync(params) { result, detailsResult ->
            val details = detailsResult.productDetailsList.firstOrNull()
            val offer = details?.subscriptionOfferDetails?.firstOrNull()
            if (result.responseCode != BillingClient.BillingResponseCode.OK || details == null || offer == null) {
                onError("The supporter subscription is not available in Google Play yet.")
                return@queryProductDetailsAsync
            }
            launch(details, offer.offerToken)
        }
    }

    private fun launch(details: ProductDetails, offerToken: String) {
        val item = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)
            .setOfferToken(offerToken)
            .build()
        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(item))
            .setObfuscatedAccountId(accountToken!!)
            .build()
        val result = billingClient.launchBillingFlow(activity, params)
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            onError("Could not open Google Play billing (${result.debugMessage}).")
        }
    }

    private fun queryOwnedSubscriptions() {
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        billingClient.queryPurchasesAsync(params) { result, purchases ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                onError("Could not restore Google Play purchases (${result.debugMessage}).")
                return@queryPurchasesAsync
            }
            purchases.filter { it.products.contains(GameConfig.SUPPORTER_PRODUCT_ID) }
                .forEach(::deliver)
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) {
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> purchases.orEmpty().forEach(::deliver)
            BillingClient.BillingResponseCode.USER_CANCELED -> Unit
            else -> onError("Google Play could not complete the purchase (${result.debugMessage}).")
        }
    }

    private fun deliver(purchase: Purchase) {
        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
            if (!deliveredPurchaseTokens.add(purchase.purchaseToken)) return
            onPurchase(purchase.purchaseToken)
        } else if (purchase.purchaseState == Purchase.PurchaseState.PENDING) {
            onError("Your purchase is pending. Rewards unlock after Google confirms payment.")
        }
    }

    fun close() = billingClient.endConnection()
}
