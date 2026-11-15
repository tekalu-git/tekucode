import { DatabaseSync } from "node:sqlite"
import { spawn } from "node:child_process"
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises"
import { dirname, join } from "node:path"

/** The tables that tie a database to sessions, projects, or the account behind them. */
const identityTables = [
  "session_v2",
  "session_message",
  "session_part",
  "session_inbox",
  "instruction_entry",
  "instruction_state",
  "instruction_blob",
  "permission",
  "event",
  "event_sequence",
  "project_directory",
  "project",
  "worktree",
  "control_account",
  "account",
  "account_state",
  "blob",
  "blob_ref",
  "job",
  "schedule",
]

export async function exists(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  )
}

/** A complete, atomic copy of a live database: schema, indexes, triggers, and data. */
export function snapshotDatabase(source: string, target: string) {
  const database = new DatabaseSync(source)

  try {
    database.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`)
  } finally {
    database.close()
  }
}

export async function restoreDatabase(snapshot: string, target: string) {
  await mkdir(dirname(target), { recursive: true })
  await cp(snapshot, target)
}

/**
 * Drops the rows that identify the install while keeping the model catalog and provider credentials.
 * `local` also drops its whole `kv` table; the main database keeps everything but repository caches.
 * The table lists match the `opencode-wiper` script, so both paths leave the same shape behind.
 */
export function clearIdentity(databasePath: string, scope: "main" | "local") {
  const database = new DatabaseSync(databasePath)

  try {
    const tables = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String(row.name)),
    )

    database.exec("PRAGMA foreign_keys = OFF")
    database.exec("BEGIN")

    for (const table of identityTables) {
      if (tables.has(table)) database.exec(`DELETE FROM "${table}"`)
    }

    if (tables.has("kv"))
      database.exec(
        scope === "local" ? "DELETE FROM kv" : "DELETE FROM kv WHERE key LIKE 'repository-cache:%'",
      )

    database.exec("COMMIT")
  } finally {
    database.close()
  }
}

/** Clears the desktop's own go-upsell and free-limit lockouts through the storage connection, so the
 * in-memory state store cannot write a cached key back over the deletion. */
export function clearLockouts(database: DatabaseSync) {
  const ready = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'state'").get()

  if (!ready) return
  database.exec("DELETE FROM state WHERE key LIKE '%go-upsell%' OR key LIKE '%free-limit%'")
}

export async function remove(path: string) {
  await rm(path, { recursive: true, force: true })
}

/** Keeps `~/.opencode/bin`, which holds the CLI's installed executables, and drops the rest. */
export async function clearLegacy(path: string) {
  if (!(await exists(path))) return

  const entries = await readdir(path)

  await Promise.all(entries.filter((entry) => entry !== "bin").map((entry) => remove(join(path, entry))))
}

export async function copyTree(source: string, target: string) {
  if (!(await exists(source))) return
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target, { recursive: true, force: true })
}

/** Stops any server this app did not register, matching what the wiper's `pkill` line covers. */
export function pkillServers() {
  return new Promise<void>((resolve) => {
    const child = spawn("pkill", ["-f", "opencode.*serve"], { stdio: "ignore" })

    child.on("error", () => resolve())
    child.on("close", () => resolve())
  })
}
