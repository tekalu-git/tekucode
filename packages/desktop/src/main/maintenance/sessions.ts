import type { OpenCodeClient } from "@opencode/client"
import { Option, Schema } from "effect"
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { MaintenanceBackup } from "../../shared/ipc-rpc/maintenance"

/** The shape the server's import endpoint accepts; the export endpoint returns the same. */
type SessionBackupData = Parameters<OpenCodeClient["experimental"]["session"]["import"]>[0]

/** The only client operations a backup or restore needs; the desktop never uses the rest of the SDK. */
export type SessionBackupClient = {
  readonly session: {
    readonly list: (input: {
      readonly order: "asc"
      readonly limit: number
      readonly cursor?: string
    }) => Promise<{
      readonly data: ReadonlyArray<{ readonly id: string }>
      readonly cursor: { readonly next?: string | null }
    }>
  }
  readonly experimental: {
    readonly session: {
      readonly export: (input: { readonly sessionID: string }) => Promise<SessionBackupData>
      readonly import: (input: SessionBackupData) => Promise<object>
    }
  }
}

/** What an export keeps; an omitted kind stays on, so a caller that sends nothing gets the full transcript. */
export type BackupOptions = {
  readonly toolOutput?: boolean
  readonly reasoning?: boolean
  readonly attachments?: boolean
  readonly metadata?: boolean
}

export type ExportResult = {
  path?: string
  count: number
  failed: number
}

export type RestoreResult = {
  imported: number
  skipped: number
  failed: number
}

const Manifest = Schema.Struct({
  version: Schema.Literal(1),
  createdAt: Schema.Number,
  sessions: Schema.Number,
  failed: Schema.Array(Schema.Struct({ id: Schema.String, message: Schema.String })),
})

type Manifest = Schema.Schema.Type<typeof Manifest>

/** The envelope of one exported transcript; the server validates the messages on import. */
const BackupSession = Schema.Struct({
  info: Schema.Struct({ id: Schema.String, parentID: Schema.optionalKey(Schema.String) }),
  messages: Schema.Array(Schema.Unknown),
})

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))

const decodeManifest = Schema.decodeUnknownOption(Schema.fromJsonString(Manifest))

const isBackupSession = Schema.is(BackupSession)

const manifestName = "manifest.json"

/** Exports every conversation into a new timestamped folder and returns where it landed. */
export async function exportSessions(
  client: SessionBackupClient,
  root: string,
  options: BackupOptions = {},
): Promise<ExportResult> {
  const path = join(root, `backup-${Date.now()}`)
  await mkdir(path, { recursive: true })

  const ids = await sessionIDs(client)
  const failed: Array<{ id: string; message: string }> = []
  let count = 0

  for (const sessionID of ids) {
    try {
      const data = await client.experimental.session.export({ sessionID })
      await writeFile(join(path, `${safeName(sessionID)}.json`), JSON.stringify(trimSession(data, options), null, 2))
      count += 1
    } catch (error) {
      failed.push({ id: sessionID, message: error instanceof Error ? error.message : String(error) })
    }
  }

  // An empty run leaves nothing to restore, so it does not deserve a backup entry.
  if (count === 0) {
    await rm(path, { recursive: true, force: true })

    return { count, failed: failed.length }
  }

  const manifest: Manifest = { version: 1, createdAt: Date.now(), sessions: count, failed }
  await writeFile(join(path, manifestName), JSON.stringify(manifest, null, 2))

  return { path, count, failed: failed.length }
}

/** Imports the conversations in one backup folder, parents before children. */
export async function restoreSessions(client: SessionBackupClient, path: string): Promise<RestoreResult> {
  const backup = await readBackup(path)
  const existing = new Set(await sessionIDs(client))
  let imported = 0
  let skipped = 0
  let failed = backup.invalid

  for (const data of importOrder(backup.sessions)) {
    if (existing.has(data.info.id)) {
      skipped += 1
      continue
    }

    try {
      await client.experimental.session.import({
        info: data.info,
        messages: data.messages,
        location: data.info.location,
      })
      imported += 1
      existing.add(data.info.id)
    } catch {
      failed += 1
    }
  }

  return { imported, skipped, failed }
}

/** Every complete backup, newest first. A folder without a manifest is a run that never finished. */
export async function listBackups(root: string): Promise<MaintenanceBackup[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])

  const backups = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<MaintenanceBackup | undefined> => {
        const path = join(root, entry.name)
        const manifest = await readManifest(path)

        if (!manifest) return undefined

        return { id: entry.name, path, time: manifest.createdAt, count: manifest.sessions }
      }),
  )

  return backups.filter((backup): backup is MaintenanceBackup => backup !== undefined).sort((a, b) => b.time - a.time)
}

/** Keeps the newest runs, because a full transcript with inline media is large. */
export async function pruneBackups(root: string, keep: number) {
  const backups = await listBackups(root)

  await Promise.all(backups.slice(keep).map((backup) => rm(backup.path, { recursive: true, force: true })))
}

/**
 * Parents before children: the import refuses a transcript whose parent is missing, so a run that only
 * exports children cannot be replayed in listing order.
 */
export function importOrder<T extends { info: { id: string; parentID?: string } }>(sessions: readonly T[]): T[] {
  const present = new Set(sessions.map((session) => session.info.id))
  const imported = new Set<string>()
  const pending = [...sessions]
  const ordered: T[] = []

  while (pending.length > 0) {
    const ready = pending.filter((session) => {
      const parent = session.info.parentID

      return !parent || !present.has(parent) || imported.has(parent)
    })

    // A parent cycle cannot be satisfied; import the rest so one broken pair does not lose the backup.
    if (ready.length === 0) {
      ordered.push(...pending)
      break
    }

    for (const session of ready) {
      ordered.push(session)
      imported.add(session.info.id)
      pending.splice(pending.indexOf(session), 1)
    }
  }

  return ordered
}

type Json = Record<string, unknown>

const isJson = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const kept = (value: boolean | undefined) => value !== false

/**
 * Drops the parts of a transcript a backup does not need in order to restore it. Session and message
 * IDs stay in every case: the import endpoint keys its rows by them, so a backup without them cannot be
 * replayed. Tool output and reasoning are lossy for the model's next turn, so both stay unless the
 * caller turns them off; metadata and attachment bytes are safe to drop.
 */
export function trimSession(data: SessionBackupData, options: BackupOptions): SessionBackupData {
  const keep = {
    toolOutput: kept(options.toolOutput),
    reasoning: kept(options.reasoning),
    attachments: kept(options.attachments),
    metadata: kept(options.metadata),
  }
  const copy = structuredClone(data) as unknown as Json

  const info = isJson(copy.info) ? copy.info : undefined

  if (info && !keep.metadata) {
    delete info.title
    delete info.metadata
  }

  for (const message of Array.isArray(copy.messages) ? copy.messages : []) {
    if (!isJson(message)) continue

    if (!keep.metadata) {
      delete message.metadata
      delete message.native
    }

    if (!keep.attachments) trimAttachments(message)

    if (!keep.toolOutput) trimShell(message)
    trimContent(message, keep)
  }

  return copy as unknown as SessionBackupData
}

/** Inline media is most of a transcript's size; the reference and its name stay, the bytes do not. */
function trimAttachments(message: Json) {
  if (!Array.isArray(message.files)) return

  for (const file of message.files) {
    if (!isJson(file)) continue

    file.data = ""
    file.source = { type: "inline" }
  }
}

function trimShell(message: Json) {
  if (message.type !== "shell") return

  const output = isJson(message.output) ? message.output : undefined

  if (output && typeof output.output === "string") output.output = "[shell output omitted]"
}

function trimContent(
  message: Json,
  keep: { toolOutput: boolean; reasoning: boolean; metadata: boolean },
) {
  if (!Array.isArray(message.content)) return

  const content: unknown[] = []

  for (const part of message.content) {
    if (!isJson(part)) {
      content.push(part)
      continue
    }

    if (!keep.metadata) delete part.native

    if (part.type === "reasoning" && !keep.reasoning) continue

    if (part.type === "tool" && !keep.toolOutput) {
      const state = isJson(part.state) ? part.state : undefined

      if (state) {
        state.content = [{ type: "text", text: "[tool output omitted]" }]
        delete state.metadata
      }
    }

    content.push(part)
  }

  message.content = content
}

async function sessionIDs(client: SessionBackupClient) {
  const ids: string[] = []
  let cursor: string | undefined

  for (;;) {
    const page = await client.session.list({ order: "asc", limit: 200, cursor })
    ids.push(...page.data.map((session) => session.id))
    cursor = page.cursor.next ?? undefined

    if (!cursor) return ids
  }
}

async function readBackup(path: string) {
  const entries = await readdir(path).catch(() => [])
  const sessions: SessionBackupData[] = []
  let invalid = 0

  for (const entry of entries) {
    if (entry === manifestName || !entry.endsWith(".json")) continue

    try {
      const json = decodeJson(await readFile(join(path, entry), "utf8"))

      if (Option.isNone(json) || !isBackupSession(json.value)) {
        invalid += 1
        continue
      }

      // SAFETY: the guard only proves this file is an export envelope; the server validates the
      // transcript on import, so every field of the file passes through unchanged.
      sessions.push(json.value as SessionBackupData)
    } catch {
      invalid += 1
    }
  }

  return { sessions, invalid }
}

function readManifest(path: string): Promise<Manifest | undefined> {
  return readFile(join(path, manifestName), "utf8").then(
    (text) => Option.getOrUndefined(decodeManifest(text)),
    () => undefined,
  )
}

function safeName(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_")
}
