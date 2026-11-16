import { Context, Effect, Layer } from "effect"
import { spawn } from "node:child_process"
import path from "node:path"
import fs from "node:fs/promises"

export interface LauncherServiceInterface {
  readonly relaunch: (params: { dbPath: string; fingerprintPath: string }) => Effect.Effect<void>
}

export class LauncherService extends Context.Service<LauncherService, LauncherServiceInterface>()("@opencode/LauncherService") {}

export const LauncherServiceLive = Layer.effect(
  LauncherService,
  Effect.gen(function* () {
    const killProcesses = Effect.fn("LauncherService.killProcesses")(function* () {
      // Skip killing processes to avoid accidentally killing self
      // User can restart manually after reset
      yield* Effect.logInfo("Skipping process kill - please restart OpenCode manually after reset")
    })

    const relaunch = Effect.fn("LauncherService.relaunch")(function* ({
      dbPath,
      fingerprintPath,
    }: { dbPath: string; fingerprintPath: string }) {
      yield* Effect.logInfo("Starting fresh launcher", { dbPath, fingerprintPath })

      // First, kill existing processes
      yield* killProcesses()

      // Deep wipe DB again (belt and suspenders)
      const dbDir = path.dirname(dbPath)
      const dbFiles = yield* Effect.promise(() => fs.readdir(dbDir).catch(() => [])).pipe(Effect.catchCause(() => Effect.succeed([])))
      for (const file of dbFiles) {
        if (file.startsWith("opencode") && file.endsWith(".db")) {
          yield* Effect.promise(() => fs.unlink(path.join(dbDir, file))).pipe(Effect.catchCause(() => Effect.void))
          yield* Effect.logInfo(`Removed DB file: ${file}`)
        }
      }

      // Rotate Tor/WARP again
      // (Tor rotation is handled by the caller before this)

      // Relaunch with clean Electron profile
      const opencodePath = process.argv[0] // bun path
      const scriptPath = process.argv[1] // opencode script

      if (scriptPath && scriptPath.endsWith(".js")) {
        // Detached so the reset command can exit without taking the fresh app down with it.
        const child = spawn(opencodePath, [scriptPath], {
          detached: true,
          stdio: "ignore",
          env: {
            ...process.env,
            OPENCODE_FRESH_START: "1",
            OPENCODE_FINGERPRINT_PATH: fingerprintPath,
          },
        })

        child.unref()

        yield* Effect.logInfo("Launched fresh OpenCode process")
      } else {
        yield* Effect.logWarning("Could not determine launch path, skipping relaunch")
      }
    })

    return { relaunch }
  }),
)