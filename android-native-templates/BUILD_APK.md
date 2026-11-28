# Building the Dualshoot Native Android APK (Capacitor + CameraX)

Follow these steps after exporting this project to compile a commercial white-label Android APK ready for OEM distribution or Google Play release.

---

## Prerequisites
- **Node.js 20+** and **npm**
- **JDK 17** (Required by Android Gradle Plugin 8+)
- **Android Studio / Android SDK** (API Level 34+ recommended)

---

## 1. Configure OEM White-Label Branding (Optional)
Before building, customize your OEM partner settings in a single file:
- Edit `src/config/oemConfig.ts`:
  - `appName`
  - `companyName`
  - `packageId` (match this in `capacitor.config.ts` and your Android package directory)
  - `primaryAccentColor`
  - `showBrandWatermark` / `watermarkText`

---

## 2. Build Web Assets & Initialize Capacitor Android
Run these commands from the project root:

```bash
npm install
npm run build
npx cap add android
```

---

## 3. Add AndroidX CameraX Dependencies
Open `android/app/build.gradle` and add the CameraX libraries inside `dependencies { ... }`:

```groovy
def camerax_version = "1.4.1"
implementation "androidx.camera:camera-core:${camerax_version}"
implementation "androidx.camera:camera-camera2:${camerax_version}"
implementation "androidx.camera:camera-lifecycle:${camerax_version}"
implementation "androidx.camera:camera-video:${camerax_version}"
```

Also verify `minSdkVersion` in `android/variables.gradle` is at least **24** (Android 7.0+) and `compileSdkVersion` is **34** or higher (`ConcurrentCamera` runs on Android 11+ / API 30+ devices and automatically falls back to single-camera dual crop on older devices).

---

## 4. Copy Native Kotlin Plugin & Register in MainActivity
1. Copy `android-native-templates/DualCameraNativePlugin.kt` into your Android app package folder:
   ```bash
   cp android-native-templates/DualCameraNativePlugin.kt android/app/src/main/java/com/oem/dualshoot/DualCameraNativePlugin.kt
   ```
   *(If you changed `packageId` in `oemConfig.ts`, update the `package ...` line at the top of `DualCameraNativePlugin.kt` and place it in the matching folder.)*

2. Register `DualCameraNativePlugin` inside `android/app/src/main/java/com/oem/dualshoot/MainActivity.java` (or `.kt`):
   ```java
   import android.os.Bundle;
   import com.getcapacitor.BridgeActivity;

   public class MainActivity extends BridgeActivity {
       @Override
       public void onCreate(Bundle savedInstanceState) {
           registerPlugin(DualCameraNativePlugin.class);
           super.onCreate(savedInstanceState);
       }
   }
   ```

---

## 5. Merge Android Permissions
Open `android/app/src/main/AndroidManifest.xml` and copy the `<uses-permission>` and `<uses-feature>` entries from:
- `android-native-templates/AndroidManifest.permissions.xml`

---

## 6. Sync Web Build & Native Plugins
Every time you update web code or `oemConfig.ts`, run:

```bash
npm run build
npx cap sync android
```

---

## 7. Build a Signed Release APK
### Option A: Generate a Release Keystore (one-time setup)
```bash
keytool -genkey -v -keystore dualshoot-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias dualshoot
```

Configure `signingConfigs.release` in `android/app/build.gradle`:
```groovy
android {
    signingConfigs {
        release {
            storeFile file("../../dualshoot-release.jks")
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias "dualshoot"
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### Option B: Compile Release APK via Gradle CLI
```bash
cd android
./gradlew assembleRelease
```

The signed release APK will be generated at:
`android/app/build/outputs/apk/release/app-release.apk`
