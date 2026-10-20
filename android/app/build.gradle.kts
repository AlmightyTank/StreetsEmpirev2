plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Keep Play signing material outside the repository. The same variables work in
// Android Studio, Gradle, and CI without putting passwords in build files.
val playStoreFile = System.getenv("ANDROID_RELEASE_STORE_FILE")
    ?: providers.gradleProperty("ANDROID_RELEASE_STORE_FILE").orNull
val playStorePassword = System.getenv("ANDROID_RELEASE_STORE_PASSWORD")
    ?: providers.gradleProperty("ANDROID_RELEASE_STORE_PASSWORD").orNull
val playKeyAlias = System.getenv("ANDROID_RELEASE_KEY_ALIAS")
    ?: providers.gradleProperty("ANDROID_RELEASE_KEY_ALIAS").orNull
val playKeyPassword = System.getenv("ANDROID_RELEASE_KEY_PASSWORD")
    ?: providers.gradleProperty("ANDROID_RELEASE_KEY_PASSWORD").orNull
val playSigningValues = listOf(playStoreFile, playStorePassword, playKeyAlias, playKeyPassword)
val playSigningConfigured = playSigningValues.all { !it.isNullOrBlank() }
val playGamesProjectId = System.getenv("PLAY_GAMES_PROJECT_ID")
    ?: providers.gradleProperty("PLAY_GAMES_PROJECT_ID").orNull
    ?: ""
val playGamesWebClientId = System.getenv("PLAY_GAMES_WEB_CLIENT_ID")
    ?: providers.gradleProperty("PLAY_GAMES_WEB_CLIENT_ID").orNull
    ?: ""

android {
    namespace = "dev.streetsempire.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.streetsempire.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 9
        versionName = "1.0.9"
    }

    flavorDimensions += "environment"
    productFlavors {
        create("production") {
            dimension = "environment"
            resValue("string", "app_name", "StreetsEmpire")
            resValue("string", "game_services_project_id", playGamesProjectId)
            buildConfigField("String", "LIVE_ORIGIN", "\"https://play.streetsempire.dev\"")
            buildConfigField("String", "PLAY_GAMES_WEB_CLIENT_ID", "\"$playGamesWebClientId\"")
        }
        create("beta") {
            dimension = "environment"
            applicationIdSuffix = ".beta"
            versionNameSuffix = "-beta"
            resValue("string", "app_name", "StreetsEmpire Beta")
            resValue("string", "game_services_project_id", playGamesProjectId)
            buildConfigField("String", "LIVE_ORIGIN", "\"https://beta.streetsempire.dev\"")
            buildConfigField("String", "PLAY_GAMES_WEB_CLIENT_ID", "\"$playGamesWebClientId\"")
        }
    }

    signingConfigs {
        create("playRelease") {
            if (playSigningConfigured) {
                storeFile = file(playStoreFile!!)
                storePassword = playStorePassword
                keyAlias = playKeyAlias
                keyPassword = playKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            ndk {
                debugSymbolLevel = "FULL"
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (playSigningConfigured) {
                signingConfig = signingConfigs.getByName("playRelease")
            }
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
    // Google Play Games Services SDK (Games v2).
    implementation("com.google.android.gms:play-services-games-v2:+")

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

// Play Console asks for a native symbols ZIP when the bundle carries none. The
// .so files come from prebuilt dependencies (androidx.graphics.path), so this
// packages the merged libraries in the ABI-folder layout Play expects:
// app/build/outputs/native-debug-symbols-upload/<variant>/native-debug-symbols.zip
listOf("productionRelease", "betaRelease").forEach { variant ->
    val capitalized = variant.replaceFirstChar { it.uppercase() }
    tasks.register<Zip>("zip${capitalized}NativeSymbols") {
        group = "publishing"
        description = "Packages $variant native libraries as a Play Console symbols ZIP."
        dependsOn("merge${capitalized}NativeLibs")
        from(layout.buildDirectory.dir("intermediates/merged_native_libs/$variant")) {
            include("**/lib/*/*.so")
            eachFile { path = "${file.parentFile.name}/${file.name}" }
            includeEmptyDirs = false
        }
        destinationDirectory.set(layout.buildDirectory.dir("outputs/native-debug-symbols-upload/$variant"))
        archiveFileName.set("native-debug-symbols.zip")
    }
}
