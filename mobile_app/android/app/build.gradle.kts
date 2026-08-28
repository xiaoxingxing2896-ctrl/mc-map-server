plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "dev.mcmap.mc_server_map"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "dev.mcmap.mc_server_map"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            // xiaoxingstar 签名（keystore: H:\dsh\mmap\keystore\xiaoxingstar.jks）
            keyAlias = "xiaoxingstar"
            keyPassword = "xiaoxingstar2026"
            storeFile = file("H:/dsh/mmap/keystore/xiaoxingstar.jks")
            storePassword = "xiaoxingstar2026"
        }
    }

    buildTypes {
        release {
            // 生产签名：xiaoxingstar
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}