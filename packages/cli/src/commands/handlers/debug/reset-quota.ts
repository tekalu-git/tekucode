import { Effect } from "effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Global } from "@opencode/util/global"
import { databasePath } from "../../../database-path"
import { FingerprintService } from "./quota-bypass/fingerprint"
import { TorService } from "./quota-bypass/tor"
import { DatabaseWiper } from "./quota-bypass/database-wiper"
import { LauncherService } from "./quota-bypass/launcher"

export default Runtime.handler(
  Commands.commands.debug.commands["reset-quota"],
  Effect.fn("cli.debug.reset-quota")(function* (input) {
    const global = yield* Global.Service
    const dbPath = databasePath(global.data)
    const fingerprintPath = path.join(global.data, "olliecode-fingerprint.json")

    if (!input.force) {
      yield* Effect.logWarning("This will:")
      yield* Effect.logWarning("  1. Generate a new client fingerprint (nonce, label, user-agent)")
      yield* Effect.logWarning("  2. Request a new Tor exit IP (NEWNYM)")
      yield* Effect.logWarning("  3. WIPE the local database (all sessions, projects, credentials, events)")
      yield* Effect.logWarning("  4. Relaunch OpenCode with a clean profile")
      yield* Effect.logWarning("")
      yield* Effect.logWarning("Run with --force to skip this confirmation.")
      return
    }

    yield* Effect.logInfo("Starting fresh quota reset", { dbPath, fingerprintPath })

    const fingerprint = yield* FingerprintService
    yield* fingerprint.rotate({ fingerprintPath })

    const tor = yield* TorService
    yield* tor.rotateIdentity()

    const wiper = yield* DatabaseWiper
    yield* wiper.wipe({ dbPath })

    const launcher = yield* LauncherService
    yield* launcher.relaunch({ dbPath, fingerprintPath })
  }),
)

const path = {
  join: (...args: string[]) => args.join("/"),
}