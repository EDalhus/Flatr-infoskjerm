import java.util.Properties

plugins {
    id("com.android.application")
}

// Opplastingsnøkkelen til Google Play ligger utenfor git (keystore.properties).
val keystore = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

android {
    namespace = "no.flatr.tv"
    compileSdk = 36

    defaultConfig {
        applicationId = "no.flatr.tv"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "START_URL", "\"https://flatr.no\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (keystore.getProperty("storeFile") != null) {
            create("upload") {
                storeFile = file(keystore.getProperty("storeFile"))
                storePassword = keystore.getProperty("storePassword")
                keyAlias = keystore.getProperty("keyAlias")
                keyPassword = keystore.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("upload")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
