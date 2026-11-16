import { DatabaseSync } from "node:sqlite"
import { spawn } from "node:child_process"
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { runPowerShell } from "./elevate"

/** Tables that record schema progress rather than anything a person created. */
const bookkeepingTables = new Set(["migration", "data_migration"])

/**
 * Files that carry auth or identity even though they live in the config directory. They are excluded
 * from the snapshot and from the restore, so a wipe never keeps a previous login alive.
 */
export const secretFiles: ReadonlySet<string> = new Set([
  "auth.json",
  "credentials.json",
  "account.json",
  "accounts.json",
  "oauth.json",
  "service.json",
  "service-local.json",
])

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
 * Deletes every user row from a restored database, keeping only the schema journal so the next
 * service start does not replay migrations. This covers sessions, projects, accounts, credentials,
 * cached model data and artifacts alike, so no previous identity survives the wipe. VACUUM then
 * rewrites the file, leaving none of the deleted rows in free pages.
 */
export function clearUserData(databasePath: string) {
  const database = new DatabaseSync(databasePath)

  try {
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => String(row.name))
      .filter((name) => !bookkeepingTables.has(name))

    database.exec("PRAGMA secure_delete = ON")
    database.exec("PRAGMA foreign_keys = OFF")
    database.exec("BEGIN")

    for (const table of tables) database.exec(`DELETE FROM "${table.replaceAll('"', '""')}"`)

    database.exec("COMMIT")
    database.exec("VACUUM")
  } finally {
    database.close()
  }
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

export async function copyTree(source: string, target: string, skip?: ReadonlySet<string>) {
  if (!(await exists(source))) return
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target, {
    recursive: true,
    force: true,
    filter: skip ? (entry) => !skip.has(basename(entry)) : undefined,
  })
}

/** Stops any server this app did not register, matching what the wiper's `pkill` line covers. */
export function pkillServers() {
  if (process.platform === "win32")
    return runPowerShell(
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*opencode*' -and $_.CommandLine -match 'serve' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    ).then(() => undefined)

  return new Promise<void>((resolve) => {
    const child = spawn("pkill", ["-f", "opencode.*serve"], { stdio: "ignore" })

    child.on("error", () => resolve())
    child.on("close", () => resolve())
  })
}
