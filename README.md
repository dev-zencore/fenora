# LiveSync Companion for Android

An open-source Android host for self-hosted Obsidian vault synchronization.

> This project is independent from Obsidian and the Self-hosted LiveSync maintainers. It does not bundle the proprietary Obsidian application. The upstream Self-hosted LiveSync project is MIT-licensed; its license and attribution will be preserved when its reusable core is integrated.

## Current phase: Android host foundation

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

The actual LiveSync core adapter is intentionally not marked complete yet. The next implementation step is to port the upstream platform-independent services and replace the Web File System Access adapter with an Android SAF adapter. The current status text explicitly says `core adapter pending`; it does not pretend that synchronization is already implemented.

## Why the system notification exists

A reliable Android foreground service must show a system notification. The channel is silent, low priority, and contains no sound or vibration, but it cannot be removed while the service is running without losing foreground-service protection. This is an Android platform requirement, not an application preference.

The `specialUse` declaration is intended for the long-running self-hosted synchronization use case. Android/OEM policy can still stop the service, and a Google Play release may require additional review for this category. The first distribution path is an open-source GitHub/sideload build.

## Vault access

The app never guesses a filesystem path. The user chooses the vault folder with the Android system picker. The app stores the returned persistent `content://` URI and requests read/write access. This avoids hard-coded paths and works with Android's scoped storage, including `Android/data` restrictions where the system permits access.

The selected URI is the source of truth for the Android SAF adapter. A future sync-core integration will use this adapter for create/read/write/rename/delete/list operations and for local change observation.

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

The Gradle Wrapper is included. The current sandbox contains Gradle/JDK but no Android SDK, so APK compilation is pending an Android build runner. GitHub Actions is included for reproducible Android builds once this project is pushed to a repository.

## Upstream webapp artifact

A production build of the upstream LiveSync webapp is checked into `app/src/main/assets/livesync-webapp` as an integration reference. It currently expects the browser File System Access API. The Android WebView bridge must replace that API with SAF before this asset can be used as the native sync UI; the native host does not silently claim that browser-only picker works on Android.
