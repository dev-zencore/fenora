# LiveSync Companion for Android

An open-source Android host for self-hosted Obsidian vault synchronization.

> This project is independent from Obsidian and the Self-hosted LiveSync maintainers. It does not bundle the proprietary Obsidian application. The upstream Self-hosted LiveSync project is MIT-licensed; its license and attribution will be preserved when its reusable core is integrated.

## Current phase: WebView + Android SAF integration

Implemented in `0.1.0`:

- native Android application shell;
- dark, low-distraction LiveSync-style status UI;
- vault selection through Android Storage Access Framework;
- persisted read/write URI permission for the selected vault;
- direct launch of the installed Obsidian Android application;
- foreground service with `START_STICKY` and silent low-priority status channel;
- boot receiver with a safe fallback when Android rejects background service startup;
- battery-optimization exemption entry point;
- Android 14/15 foreground-service manifest declarations;
- `specialUse` foreground-service declaration for long-running vault synchronization, instead of the ordinary `dataSync` category that is time-limited on Android 15.
- upstream LiveSync webapp built and bundled in the APK;
- JavaScript-to-Android SAF bridge for picker, list, read, write, mkdir, delete, rename and stat;
- automatic reuse of the persisted Android vault URI after app restart;
- native-safe fallback when browser IndexedDB cannot clone an Android-backed directory handle.

The upstream LiveSync core now runs inside the bundled webapp when the Android activity is open and the vault is selected. CouchDB/object-storage settings are read from the vault's `.livesync/settings.json`, as in the upstream webapp. The Android SAF adapter is the boundary that gives this runtime access to the real vault.

The foreground service is a lifecycle/keep-alive layer. It does not recreate a headless Chromium/WebView after Android has killed the UI process; a truly headless 24/7 daemon requires a separate native/JS-runtime port of the LiveSync core. This distinction is documented rather than hidden.

## Why the system notification exists

A reliable Android foreground service must show a system notification. The channel is silent, low priority, and contains no sound or vibration, but it cannot be removed while the service is running without losing foreground-service protection. This is an Android platform requirement, not an application preference.

The `specialUse` declaration is intended for the long-running self-hosted synchronization use case. Android/OEM policy can still stop the service, and a Google Play release may require additional review for this category. The first distribution path is an open-source GitHub/sideload build.

## Vault access

The app never guesses a filesystem path. The user chooses the vault folder with the Android system picker. The app stores the returned persistent `content://` URI and requests read/write access. This avoids hard-coded paths and works with Android's scoped storage, including `Android/data` restrictions where the system permits access.

The selected URI is the source of truth for the Android SAF adapter. The current bridge implements create/read/write/rename/delete/list/stat operations. Android SAF does not provide a universal recursive change event stream, so the upstream scanner and foreground lifecycle are used instead of claiming perfect filesystem events.

## Target architecture

```text
Android UI
   ├── SAF vault permission
   ├── CouchDB / object-storage settings
   ├── Setup URI import
   └── LiveSync-style status and logs

Foreground sync service
   ├── Android SAF file adapter
   ├── upstream LiveSync service modules
   ├── retry queue and conflict state
   └── silent persistent status notification
```

## Build

The project is a plain open-source Gradle Android project. Build with JDK 17 and Android SDK 35:

```bash
./gradlew :app:assembleDebug
```

The Gradle Wrapper is included. A local debug APK has been compiled successfully with Android SDK 35. GitHub Actions is included for reproducible builds.

## Upstream webapp artifact

A production build of the upstream LiveSync webapp is checked into `app/src/main/assets/livesync-webapp` and loaded by the Android WebView. Its browser File System Access calls are replaced at runtime by the native SAF bridge.
