import { Context, Effect, Exit, Layer, Ref } from "effect"
import { Cause } from "effect"
import type { OpenCodeClient } from "@opencode/client"
import { session } from "electron"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import type {
  MaintenanceBackupResult,
  MaintenanceImport,
  MaintenanceRestoreResult,
  MaintenanceResult,
  MaintenanceStatus,
} from "../../shared/ipc-rpc/maintenance"
import { BackgroundService } from "../service/background-service"
import { SidecarCredentials } from "../service/sidecar-credentials"
import { DesktopStorage } from "../storage"
import { getMainWindows } from "../windows"
import {
  clearLegacy,
  clearUserData,
  copyTree,
  exists,
  pkillServers,
  remove,
  restoreDatabase,
  secretFiles,
  snapshotDatabase,
} from "./files"
import { initialState, transition, type Event, type Progress } from "./machine"
import { maintenancePaths } from "./paths"
import { exportSessions, listBackups, pruneBackups, restoreSessions } from "./sessions"
import {
  activeTunnel,
  discoverConfigs,
  ensureConfigDir,
  importWireguardConfig,
  maintenancePlatform,
  maintenanceSupported,
  publicIP,
  rotate,
  wireguardInstallation,
} from "./vpn"

export * as Maintenance from "./index"

export type WipeOptions = {
  readonly rotate: boolean
  readonly country?: string
  readonly password?: string
  readonly backup: boolean
}

/** How many conversation backups stay on disk; a full transcript with inline media is large. */
const backupKeep = 10

type MutableStatus = {
  supported: boolean
  vpn: {
    connected: boolean
    country?: string
    interface?: string
    ip?: string
  }
}

export interface Interface {
  readonly status: Effect.Effect<MaintenanceStatus>
  readonly importConfig: (input: {
    readonly path?: string
    readonly name?: string
    readonly content?: string
  }) => Effect.Effect<MaintenanceImport>
  /** Exports every conversation now, without wiping anything. */
  readonly backup: Effect.Effect<MaintenanceBackupResult>
  /** Imports the conversations of one backup, or the newest one when no id is given. */
  readonly restore: (input: { readonly id?: string }) => Effect.Effect<MaintenanceRestoreResult>
  readonly wipe: (
    options: WipeOptions,
    notify: (progress: Progress) => void,
  ) => Effect.Effect<MaintenanceResult>
}

export class Service extends Context.Service<Service, Interface>()("opencode/desktop/Maintenance") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const running = yield* Ref.make(false)
    const background = yield* BackgroundService.Service
    const storage = yield* DesktopStorage.Service

    // Backup, restore and wipe all touch the same database and the same backup folder, so one run at a
    // time: a second click reports busy instead of racing the first.
    const exclusive = <A>(effect: Effect.Effect<A>, busy: A) =>
      Effect.gen(function* () {
        const taken = yield* Ref.modify(running, (value) => [value, true] as const)

        if (taken) return busy

        return yield* effect.pipe(Effect.ensuring(Ref.set(running, false)))
      })

    return Service.of({
      status: status(),
      importConfig: (input) => Effect.promise(() => importWireguardConfig(maintenancePaths(), input)),
      backup: exclusive<MaintenanceBackupResult>(
        Effect.gen(function* () {
          if (!maintenanceSupported())
            return {
              ok: false,
              reason: "unsupported" as const,
              message: "Conversation backups are wired for Linux and Windows only",
            } satisfies MaintenanceBackupResult

          const paths = maintenancePaths()
          const api = yield* sessionClient(background)
          const result = yield* Effect.promise(() => exportSessions(api, paths.sessionBackups)).pipe(Effect.exit)

          if (Exit.isFailure(result))
            return {
              ok: false,
              reason: "failed" as const,
              message: message(Cause.squash(result.cause)),
            } satisfies MaintenanceBackupResult

          yield* Effect.promise(() => pruneBackups(paths.sessionBackups, backupKeep))

          return {
            ok: true,
            path: result.value.path,
            count: result.value.count,
            failed: result.value.failed,
          } satisfies MaintenanceBackupResult
        }),
        { ok: false, reason: "busy" as const, message: "A reset is already running" } satisfies MaintenanceBackupResult,
      ),
      restore: (input) =>
        exclusive<MaintenanceRestoreResult>(
          Effect.gen(function* () {
            if (!maintenanceSupported())
              return {
                ok: false,
                reason: "unsupported" as const,
                message: "Conversation backups are wired for Linux and Windows only",
              } satisfies MaintenanceRestoreResult

            const paths = maintenancePaths()
            const backups = yield* Effect.promise(() => listBackups(paths.sessionBackups))
            const target = input.id ? backups.find((backup) => backup.id === input.id) : backups[0]

            if (!target)
              return {
                ok: false,
                reason: "missing" as const,
                message: "No conversation backup was found",
              } satisfies MaintenanceRestoreResult

            const api = yield* sessionClient(background)
            const result = yield* Effect.promise(() => restoreSessions(api, target.path)).pipe(Effect.exit)

            if (Exit.isFailure(result))
              return {
                ok: false,
                path: target.path,
                reason: "failed" as const,
                message: message(Cause.squash(result.cause)),
              } satisfies MaintenanceRestoreResult

            // New sessions arrive as events, but a reload guarantees every open surface drops the empty
            // transcript it built after the wipe and shows the restored list.
            if (result.value.imported > 0) reloadWindows()

            return {
              ok: true,
              path: target.path,
              imported: result.value.imported,
              skipped: result.value.skipped,
              failed: result.value.failed,
            } satisfies MaintenanceRestoreResult
          }),
          { ok: false, reason: "busy" as const, message: "A reset is already running" } satisfies MaintenanceRestoreResult,
        ),
      wipe: (options, notify) =>
        exclusive(
          Effect.gen(function* () {
            if (!maintenanceSupported())
              return {
                ok: false,
                wiped: false,
                reason: "unsupported" as const,
                message: "Clean slate is wired for Linux and Windows only",
              } satisfies MaintenanceResult

            return yield* perform(options, notify, background, storage)
          }),
          {
            ok: false,
            wiped: false,
            reason: "busy" as const,
            message: "A wipe is already running",
          } satisfies MaintenanceResult,
        ),
    })
  }),
)

const status = Effect.fn("Maintenance.status")(function* () {
  const paths = maintenancePaths()
  const platform = maintenancePlatform()

  if (!maintenanceSupported())
    return {
      supported: false,
      platform,
      vpn: { connected: false },
      wireguard: { installed: false, configDir: paths.wireguard },
      configs: [],
      backups: [],
    } satisfies MaintenanceStatus

  // The dialog offers to open this folder, so it has to exist even before the first config lands.
  yield* Effect.promise(() => ensureConfigDir(paths))

  const configs = discoverConfigs(paths).map((config) => ({ id: config.id, label: config.label, file: config.file }))
  const tunnel = yield* Effect.promise(() => activeTunnel(paths))
  const wireguard = yield* Effect.promise(() => wireguardInstallation(paths))
  const ip = yield* Effect.promise(() => publicIP())
  const backups = yield* Effect.promise(() => listBackups(paths.sessionBackups))
  const vpn: MutableStatus["vpn"] = { connected: tunnel !== undefined }

  if (tunnel) {
    vpn.country = tunnel.country
    vpn.interface = tunnel.interface
  }

  if (ip) vpn.ip = ip

  const result: MutableStatus = { supported: true, vpn }

  return { ...result, platform, wireguard, configs, backups } satisfies MaintenanceStatus
})

/** A client for the app's own server, with the credential only main holds. */
const sessionClient = Effect.fnUntraced(function* (background: BackgroundService.Interface) {
  const credentials = yield* background.connection

  return yield* Effect.promise(async (): Promise<OpenCodeClient> => {
    const { OpenCode } = await import("@opencode/client")
    const authorization = SidecarCredentials.authorization(credentials, credentials.url)

    return OpenCode.make({ baseUrl: credentials.url, headers: authorization ? { authorization } : {} })
  })
})

const perform = Effect.fn("Maintenance.wipe")(function* (
  options: WipeOptions,
  notify: (progress: Progress) => void,
  background: BackgroundService.Interface,
  storage: DesktopStorage.Interface,
) {
  const paths = maintenancePaths()
  let state = initialState()
  let backup: string | undefined
  let wiped = false
  let stopped = false
  let ip: string | undefined

  const dispatch = (event: Event) => {
    const next = transition(state, event)
    state = next.state

    for (const effect of next.effects) notify(effect.progress)
  }

  const fail = (reason: MaintenanceResult["reason"], message: string) => {
    dispatch({ type: "run.failed", message })

    if (backup) return { ok: false, wiped, reason, message, backup } satisfies MaintenanceResult

    return { ok: false, wiped, reason, message } satisfies MaintenanceResult
  }

  dispatch({ type: "run.started", id: crypto.randomUUID(), first: "backup" })

  if (!options.backup) {
    dispatch({ type: "step.skipped", message: "Conversation backup was not requested" })
  } else {
    const saved = yield* Effect.gen(function* () {
      const api = yield* sessionClient(background)
      const result = yield* Effect.promise(() => exportSessions(api, paths.sessionBackups))
      yield* Effect.promise(() => pruneBackups(paths.sessionBackups, backupKeep))

      return result
    }).pipe(Effect.exit)

    // Losing the conversations is the one outcome a wipe must not spring on someone, so a failed
    // backup stops the run while every earlier location is still intact.
    if (Exit.isFailure(saved)) return fail("failed", message(Cause.squash(saved.cause)))

    dispatch({
      type: "step.finished",
      message:
        saved.value.failed > 0
          ? `${saved.value.count} saved, ${saved.value.failed} not saved`
          : `${saved.value.count} saved`,
    })
  }

  dispatch({ type: "step.entered", step: "vpn" })

  if (!options.rotate) {
    dispatch({ type: "step.skipped", message: "VPN rotation was not requested" })
  } else {
    const country = options.country

    if (!country) return fail("missing-config", "Choose a country to rotate the tunnel")
    const rotation = yield* Effect.promise(() => rotate(paths, country, options.password))

    if (!rotation.ok) return fail(rotation.reason, rotation.message)

    ip = rotation.ip
    dispatch({ type: "step.finished", message: ip ? `Exit IP ${ip}` : undefined })
  }

  dispatch({ type: "step.entered", step: "stop" })
  const resume = yield* background.pause
  let released = false

  const release = Effect.suspend(() => {
    if (released) return Effect.void
    released = true

    return resume
  })

  const outcome = yield* Effect.gen(function* () {
    // The registration file goes with the state directory, so stop before anything is removed.
    yield* Effect.promise(async () => {
      const { stop } = await import("@opencode/client/service")
      await stop({ file: paths.serviceFile, pty: "clear" }).catch(() => undefined)
    })
    yield* Effect.promise(() => pkillServers())
    stopped = true
    dispatch({ type: "step.finished" })

    dispatch({ type: "step.entered", step: "snapshot" })
    backup = join(paths.backups, `opencode-wiper-${Date.now()}-${process.pid}`)
    yield* Effect.promise(async () => {
      if (!backup) return
      await mkdir(backup, { recursive: true })
      await copyTree(paths.config, join(backup, "config"), secretFiles)

      if (await exists(paths.mainDatabase)) snapshotDatabase(paths.mainDatabase, join(backup, "main-snapshot.db"))

      if (await exists(paths.localDatabase)) snapshotDatabase(paths.localDatabase, join(backup, "local-snapshot.db"))
    })
    dispatch({ type: "step.finished", message: backup })

    dispatch({ type: "step.entered", step: "wipe" })
    yield* Effect.promise(async () => {
      await remove(paths.config)
      await remove(paths.data)
      await remove(paths.cache)
      await remove(paths.state)
      await clearLegacy(paths.legacy)
      await clearBrowserData()
    })
    dispatch({ type: "step.finished" })

    dispatch({ type: "step.entered", step: "restore" })
    yield* Effect.promise(async () => {
      if (!backup) return
      const main = join(backup, "main-snapshot.db")
      const local = join(backup, "local-snapshot.db")

      if (await exists(main)) {
        await restoreDatabase(main, paths.mainDatabase)
        clearUserData(paths.mainDatabase)
      }

      if (await exists(local)) {
        await restoreDatabase(local, paths.localDatabase)
        clearUserData(paths.localDatabase)
      }

      await copyTree(join(backup, "config"), paths.config, secretFiles)
    })
    // Tabs, drafts, attachments, persisted state and lockouts all live in the desktop's own store.
    storage.clearUserData()
    wiped = true
    dispatch({ type: "step.finished" })
  }).pipe(Effect.ensuring(release), Effect.exit)

  if (Exit.isFailure(outcome)) {
    if (Cause.hasInterruptsOnly(outcome.cause)) return yield* Effect.interrupt

    // A stopped service must not leave the app without one, even when a later step failed.
    if (stopped) yield* background.reconnect.pipe(Effect.ignore)

    return fail("failed", message(Cause.squash(outcome.cause)))
  }

  dispatch({ type: "step.entered", step: "start" })
  const started = yield* background.reconnect.pipe(Effect.exit)

  if (Exit.isFailure(started)) {
    // The data is gone either way; only the service that reads it failed to come back.
    return fail("failed", "The data was reclaimed, but the local server did not restart")
  }

  dispatch({ type: "step.finished" })
  dispatch({ type: "run.succeeded" })

  // Every earlier snapshot belongs to a run that already finished, so a successful wipe clears the
  // whole directory rather than only this run's copy.
  yield* Effect.promise(() => remove(paths.backups))

  // The committed document still holds the sessions the wipe removed. The reply goes out first, so
  // the dialog can report the outcome, then every window reloads against the service that just started.
  reloadWindows()

  if (ip) return { ok: true, wiped: true, ip } satisfies MaintenanceResult

  return { ok: true, wiped: true } satisfies MaintenanceResult
})

/** Lets a reply reach the dialog before the document that holds the old state goes away. */
function reloadWindows() {
  setTimeout(() => {
    for (const win of getMainWindows()) {
      if (!win.isDestroyed()) win.webContents.reload()
    }
  }, 1_200)
}

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Clears the desktop shell's Chromium store, not only the opencode database: cookies, local and
 * session storage, IndexedDB, service workers, caches and cached auth. The window reloads after the
 * wipe, so it comes back with nothing that could re-identify the previous session.
 */
async function clearBrowserData() {
  const current = session.defaultSession

  await Promise.allSettled([
    current.clearData(),
    current.clearAuthCache(),
    current.clearHostResolverCache(),
  ])
}
