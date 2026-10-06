# Architecture and integration plan

## Upstream basis

The upstream Self-hosted LiveSync repository already separates reusable service modules from the Obsidian UI. It contains `src/apps/webapp`, `src/apps/cli`, service modules, replication, conflict handling, encryption and storage abstractions.

## Android adapter boundary

The Android port should implement the existing vault/storage interfaces with a `DocumentFile`/SAF adapter:

- `list(path)`;
- `read(path)`;
- `write(path, bytes)`;
- `mkdir(path)`;
- `rename(path, newPath)`;
- `delete(path)`;
- stat/mtime/size;
- local change observation where Android grants a usable document-tree URI.

No fake Obsidian API is required for the core path.

## Startup sequence

1. Boot receiver requests service startup when Android allows it.
2. Foreground service creates the mandatory silent notification immediately.
3. The service loads the persisted vault URI and setup configuration.
4. It verifies the SAF permission and server reachability.
5. It initializes the upstream LiveSync service modules.
6. It starts local change observation and remote replication.
7. It updates the local status store and notification text.

## Battery protection

The app can request exemption from Doze, but the user must approve it. Chinese OEMs may additionally require per-device autostart and background-lock settings. No Android API can guarantee survival after a user force-stops an app.

## Non-goals

- bundling the proprietary Obsidian APK/runtime;
- pretending the original plugin can run without its host;
- promising invisible unlimited process lifetime;
- reading vault content for analytics or telemetry.
