import java.util.Properties
import java.io.FileInputStream
import java.util.Base64

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Dedicated package, label and network-free manifest for the explicit demo
// entry. Ordinary builds keep the existing application ID and permissions.
val offlineDemo = (project.findProperty("dart-defines") as String?).orEmpty()
    .split(",").any {
        runCatching { String(Base64.getDecoder().decode(it)) }.getOrNull() == "JX_OFFLINE_DEMO=true"
    }

// 正式包只使用正式证书；无证书时输出未签名包，绝不回退调试签名。
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val hasReleaseKeystore = keystorePropertiesFile.exists()
if (hasReleaseKeystore) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.jingjingshangri.jingjingshangri_app"
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.jingjingshangri.jingjingshangri_app"
        if (offlineDemo) applicationIdSuffix = ".offline"
        manifestPlaceholders["appLabel"] = if (offlineDemo) "晶晶日上·离线演示" else "晶晶日上"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    if (offlineDemo) {
        listOf("debug", "profile", "release").forEach {
            sourceSets.getByName(it).manifest.srcFile("src/offline/AndroidManifest.xml")
        }
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            // 本地模拟器使用 debug；release 无正式证书时保持未签名。
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else {
                null
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
        allWarningsAsErrors = false
    }
}

flutter {
    source = "../.."
}
