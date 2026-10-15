plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val localServerOrigin = providers.gradleProperty("streetsServerOrigin")
    .orElse("http://10.0.2.2:5173")
    .get()

android {
    namespace = "dev.streetsempire.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.streetsempire.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 6
        versionName = "1.0.5"
        manifestPlaceholders["appLabel"] = "StreetsEmpire"
        manifestPlaceholders["usesCleartextTraffic"] = "false"
    }

    flavorDimensions += "environment"
    productFlavors {
        create("local") {
            dimension = "environment"
            applicationIdSuffix = ".local"
            versionNameSuffix = "-local"
            buildConfigField("String", "SERVER_ORIGIN", "\"$localServerOrigin\"")
            manifestPlaceholders["appLabel"] = "StreetsEmpire Local"
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        create("beta") {
            dimension = "environment"
            applicationIdSuffix = ".beta"
            versionNameSuffix = "-beta"
            buildConfigField("String", "SERVER_ORIGIN", "\"https://beta.streetsempire.dev\"")
            manifestPlaceholders["appLabel"] = "StreetsEmpire Beta"
        }
        create("production") {
            dimension = "environment"
            buildConfigField("String", "SERVER_ORIGIN", "\"https://play.streetsempire.dev\"")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.webkit:webkit:1.10.0")
    implementation("com.android.billingclient:billing:9.1.0")

    // Native interface: server is the backend, app renders its own UI.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("androidx.security:security-crypto:1.1.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
    implementation(platform("androidx.compose:compose-bom:2024.10.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.navigation:navigation-compose:2.7.7")
}
