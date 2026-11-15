import { Context, Effect, Exit, Layer, Ref } from "effect"
import { Cause } from "effect"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { MaintenanceResult, MaintenanceStatus } from "../../shared/ipc-rpc/maintenance"
import { BackgroundService } from "../service/background-service"
import { DesktopStorage } from "../storage"
import { getMainWindows } from "../windows"
import {
  clearIdentity,
  clearLegacy,
  clearLockouts,
  copyTree,
  exists,
  pkillServers,
  remove,
  restoreDatabase,
  snapshotDatabase,
} from "./files"
import { initialState, transition, type Event, type Progress } from "./machine"
import { maintenancePaths } from "./paths"
import { activeTunnel, discoverConfigs, publicIP, rotate } from "./vpn"

export * as Maintenance from "./index"

export type WipeOptions = {
  readonly rotate: boolean
  readonly country?: string
  readonly password?: string
}

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

    return Service.of({
      status: status(),
      wipe: (options, notify) =>
        Effect.gen(function* () {
          if (process.platform !== "linux")
            return {
              ok: false,
              wiped: false,
              reason: "unsupported" as const,
              message: "Reclaiming data and rotating the tunnel is only wired for Linux",
            } satisfies MaintenanceResult

          const busy = yield* Ref.modify(running, (value) => [value, true] as const)

          if (busy)
            return {
              ok: false,
              wiped: false,
              reason: "busy" as const,
              message: "A wipe is already running",
            } satisfies MaintenanceResult

          return yield* perform(options, notify, background, storage).pipe(Effect.ensuring(Ref.set(running, false)))
        }),
    })
  }),
)

const status = Effect.fn("Maintenance.status")(function* () {
  if (process.platform !== "linux")
    return { supported: false, vpn: { connected: false }, configs: [] } satisfies MaintenanceStatus

  const paths = maintenancePaths()
  const configs = discoverConfigs(paths).map((config) => ({ id: config.id, label: config.label, file: config.file }))
  const tunnel = activeTunnel(paths)
  const ip = yield* Effect.promise(() => publicIP())
  const vpn: MutableStatus["vpn"] = { connected: tunnel !== undefined }

  if (tunnel) {
    vpn.country = tunnel.country
    vpn.interface = tunnel.interface
  }

  if (ip) vpn.ip = ip

  const result: MutableStatus = { supported: true, vpn }

  return { ...result, configs } satisfies MaintenanceStatus
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

  dispatch({ type: "run.started", id: crypto.randomUUID(), first: "vpn" })

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
      await copyTree(paths.config, join(backup, "config"))

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
    })
    dispatch({ type: "step.finished" })

    dispatch({ type: "step.entered", step: "restore" })
    yield* Effect.promise(async () => {
      if (!backup) return
      const main = join(backup, "main-snapshot.db")
      const local = join(backup, "local-snapshot.db")

      if (await exists(main)) {
        await restoreDatabase(main, paths.mainDatabase)
        clearIdentity(paths.mainDatabase, "main")
      }

      if (await exists(local)) {
        await restoreDatabase(local, paths.localDatabase)
        clearIdentity(paths.localDatabase, "local")
      }

      await copyTree(join(backup, "config"), paths.config)
      clearLockouts(storage.db.$client)
    })
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

  if (backup) yield* Effect.promise(() => remove(backup!))

  // The committed document still holds the sessions the wipe removed. The reply goes out first, so
  // the dialog can report the outcome, then every window reloads against the service that just started.
  setTimeout(() => {
    for (const win of getMainWindows()) {
      if (!win.isDestroyed()) win.webContents.reload()
    }
  }, 1_200)

  if (ip) return { ok: true, wiped: true, ip } satisfies MaintenanceResult

  return { ok: true, wiped: true } satisfies MaintenanceResult
})

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}
