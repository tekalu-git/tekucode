import { DatabaseSync } from "node:sqlite"
import { spawn } from "node:child_process"
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { Option, Schema } from "effect"
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

const ServiceConfig = Schema.Struct({ port: Schema.optional(Schema.Int) })
const decodeServiceConfig = Schema.decodeUnknownOption(Schema.fromJsonString(ServiceConfig))

/**
 * The port the CLI listens on, which lives in the config directory the wipe removes. It is
 * configuration rather than identity, so the wipe reads it first and puts it back afterwards: a
 * custom port must keep the service reachable when the default port belongs to something else.
 */
export async function servicePort(file: string) {
  const text = await readFile(file, "utf8").catch(() => undefined)
  if (text === undefined) return undefined

  return Option.getOrUndefined(decodeServiceConfig(text))?.port
}

export async function writeServicePort(file: string, port: number) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ port }))
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

/**
 * The `pkill -f` expression matching only the servers staged under `cliRoot`. The sidecar always runs
 * from `<userData>/cli/<stage>/opencode-cli serve --service`, so anchoring the match there leaves
 * Electron's own helper processes and every other TekuCode install on the machine alone.
 */
export function serverPattern(cliRoot: string) {
  return `^${cliRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^ ]*/opencode-cli serve( |$)`
}

/** Stops the servers this app staged, so a wipe never signals another running instance. */
export function pkillServers(cliRoot: string) {
  if (process.platform === "win32")
    return runPowerShell(
      `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '${cliRoot.replaceAll("'", "''")}*' -and $_.CommandLine -match ' serve( |$)' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ).then(() => undefined)

  return new Promise<void>((resolve) => {
    const child = spawn("pkill", ["-f", serverPattern(cliRoot)], { stdio: "ignore" })

    child.on("error", () => resolve())
    child.on("close", () => resolve())
  })
}
