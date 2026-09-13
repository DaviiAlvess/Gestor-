plugins {
    id("com.android.application")
}

android {
    namespace = "com.davialvess.gestor"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.davialvess.gestor"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "3.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.activity:activity:1.9.3")
}
