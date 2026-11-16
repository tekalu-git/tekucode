import { app } from "electron"
import { join } from "node:path"

export type Paths = ReturnType<typeof maintenancePaths>

/**
 * Every location the wiper touches. The XDG variables are honoured the same way the CLI resolves
 * them, so the app and the background service always agree on the directory being reclaimed.
 */
export function maintenancePaths() {
  const home = app.getPath("home")
  const configHome = process.env.XDG_CONFIG_HOME ?? join(home, ".config")
  const dataHome = process.env.XDG_DATA_HOME ?? join(home, ".local", "share")
  const cacheHome = process.env.XDG_CACHE_HOME ?? join(home, ".cache")
  const stateHome = process.env.XDG_STATE_HOME ?? join(home, ".local", "state")

  // WireGuard configs live beside the app's own settings on Windows, where `~/.config` is not a
  // directory anyone browses; Linux keeps the path the wiper script already documents.
  const wireguard =
    process.platform === "win32"
      ? join(app.getPath("appData"), "opencode", "protonvpn-wg")
      : join(configHome, "protonvpn-wg")

  return {
    home,
    config: join(configHome, "opencode"),
    data: join(dataHome, "opencode"),
    cache: join(cacheHome, "opencode"),
    state: join(stateHome, "opencode"),
    legacy: join(home, ".opencode"),
    backups: join(dataHome, "opencode-backups"),
    // Conversation exports survive every wipe: they sit beside the data directory, not inside it, so the
    // reclaimed state can never take them with it.
    sessionBackups: join(dataHome, "opencode-session-backups"),
    wireguard,
    mainDatabase: join(dataHome, "opencode", "opencode.db"),
    localDatabase: join(dataHome, "opencode", "opencode-local.db"),
    draftsDatabase: join(app.getPath("userData"), "drafts.sqlite"),
    electronLocalStorage: join(app.getPath("userData"), "Local Storage"),
    // `Service.stop` falls back to the same file when it is not given one.
    serviceFile:
      process.env.OPENCODE_DESKTOP_SERVER_CHANNEL === "local"
        ? join(stateHome, "opencode", "service-local.json")
        : undefined,
  }
}
