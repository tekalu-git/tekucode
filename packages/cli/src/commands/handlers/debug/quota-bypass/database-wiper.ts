import { Context, Effect, Layer } from "effect"
import { Database } from "bun:sqlite"

const TABLES_TO_WIPE = [
  "session_v2",
  "project",
  "credential",
  "event",
  "kv",
  "session_message",
  "session_pending",
  "session_inbox",
  "session_part",
  "workspace",
  "project_directory",
  "instruction_blob",
  "instruction_entry",
  "instruction_state",
  "data_migration",
  "session_context_epoch",
  "session_input",
  "blob",
  "schedule",
  "job",
  "session_allowance",
  "execution_claim_attempts",
  "workspace_domain",
  "session_viewed_state",
  "session_time_busy",
  "project_time_active",
  "project_time_archived",
]

export interface DatabaseWiperInterface {
  readonly wipe: (params: { dbPath: string }) => Effect.Effect<void>
}

export class DatabaseWiper extends Context.Service<DatabaseWiper, DatabaseWiperInterface>()("@opencode/DatabaseWiper") {}

export const DatabaseWiperLive = Layer.effect(
  DatabaseWiper,
  Effect.gen(function* () {
    const wipe = Effect.fn("DatabaseWiper.wipe")(function* ({ dbPath }: { dbPath: string }) {
      yield* Effect.logInfo("Wiping database", { dbPath })

      if (dbPath === ":memory:") {
        yield* Effect.logInfo("In-memory database, skipping wipe")
        return
      }

      const db = new Database(dbPath)

      try {
        // Disable foreign keys to allow dropping tables in any order
        db.exec("PRAGMA foreign_keys = OFF;")

        for (const table of TABLES_TO_WIPE) {
          try {
            db.exec(`DELETE FROM \`${table}\`;`)
            yield* Effect.logInfo(`Wiped table: ${table}`)
          } catch (e) {
            // Table might not exist, that's fine
            yield* Effect.logInfo(`Table ${table} not found or already empty`, { error: String(e) })
          }
        }

        // Vacuum to reclaim space
        db.exec("VACUUM;")
        yield* Effect.logInfo("Database vacuum completed")
      } finally {
        db.close()
      }
    })

    return { wipe }
  }),
)