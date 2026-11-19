import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

// WireGuard configs discovered from the ProtonVPN config directory. Adding a new `.conf` file there
// makes it available without changing the app; known Proton free tunnel names get friendly labels.
export const MaintenanceConfig = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  file: Schema.String,
})

export const MaintenancePlatform = Schema.Literals(["linux", "win32", "darwin", "other"])

export const MaintenanceWireguard = Schema.Struct({
  installed: Schema.Boolean,
  executable: Schema.optionalKey(Schema.String),
  configDir: Schema.String,
})

export const maintenanceSteps = ["backup", "vpn", "stop", "snapshot", "wipe", "restore", "start"] as const

export const MaintenanceStep = Schema.Literals(maintenanceSteps)

export const MaintenanceVpn = Schema.Struct({
  connected: Schema.Boolean,
  country: Schema.optionalKey(Schema.String),
  ip: Schema.optionalKey(Schema.String),
})

/**
 * What a conversation backup keeps. Every kind defaults to on, so a caller that sends nothing gets the
 * full transcript. Session and message IDs are not optional: the import endpoint keys rows by them.
 */
export const MaintenanceBackupOptions = Schema.Struct({
  /** Tool results and shell output. Off replaces them with a short placeholder. */
  toolOutput: Schema.optionalKey(Schema.Boolean),
  /** Model reasoning parts. Off drops them. */
  reasoning: Schema.optionalKey(Schema.Boolean),
  /** Inline attachment bytes. Off keeps the reference but not the data. */
  attachments: Schema.optionalKey(Schema.Boolean),
  /** Session titles, custom metadata and provider replay data. Off drops them. */
  metadata: Schema.optionalKey(Schema.Boolean),
})

// One conversation backup written by the reset system, outside every directory a wipe removes.
export const MaintenanceBackup = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  /** Epoch millis from the backup manifest. */
  time: Schema.Number,
  count: Schema.Number,
})

export const MaintenanceStatus = Schema.Struct({
  supported: Schema.Boolean,
  platform: MaintenancePlatform,
  vpn: MaintenanceVpn,
  wireguard: MaintenanceWireguard,
  configs: Schema.Array(MaintenanceConfig),
  backups: Schema.Array(MaintenanceBackup),
})

export const MaintenanceFailure = Schema.Literals([
  "busy",
  "unsupported",
  "missing-config",
  "missing-wireguard",
  "failed",
])

export const MaintenanceResult = Schema.Struct({
  ok: Schema.Boolean,
  /** The data was already reclaimed when a later step, such as the tunnel, failed. */
  wiped: Schema.Boolean,
  reason: Schema.optionalKey(MaintenanceFailure),
  message: Schema.optionalKey(Schema.String),
  ip: Schema.optionalKey(Schema.String),
  backup: Schema.optionalKey(Schema.String),
})

export const MaintenanceImport = Schema.Struct({
  ok: Schema.Boolean,
  config: Schema.optionalKey(MaintenanceConfig),
  /** A config with the same interface name already existed and was replaced. */
  replaced: Schema.optionalKey(Schema.Boolean),
  reason: Schema.optionalKey(Schema.Literals(["unsupported", "invalid", "failed"])),
  message: Schema.optionalKey(Schema.String),
})

export const MaintenanceBackupResult = Schema.Struct({
  ok: Schema.Boolean,
  /** Where the backup was written; absent when there was nothing to save. */
  path: Schema.optionalKey(Schema.String),
  /** Conversations written. */
  count: Schema.optionalKey(Schema.Number),
  /** Conversations that could not be exported. */
  failed: Schema.optionalKey(Schema.Number),
  reason: Schema.optionalKey(Schema.Literals(["busy", "unsupported", "failed"])),
  message: Schema.optionalKey(Schema.String),
})

export const MaintenanceRestoreResult = Schema.Struct({
  ok: Schema.Boolean,
  path: Schema.optionalKey(Schema.String),
  imported: Schema.optionalKey(Schema.Number),
  /** Conversations that were already present. */
  skipped: Schema.optionalKey(Schema.Number),
  failed: Schema.optionalKey(Schema.Number),
  reason: Schema.optionalKey(Schema.Literals(["busy", "unsupported", "missing", "failed"])),
  message: Schema.optionalKey(Schema.String),
})

export const MaintenanceStatusRpc = Rpc.make("MaintenanceStatus", { success: MaintenanceStatus })

export const MaintenanceImportRpc = Rpc.make("MaintenanceImport", {
  payload: {
    /** A path from the native picker or a dropped file. */
    path: Schema.optionalKey(Schema.String),
    /** The dropped file's name; used when it has no native path. */
    name: Schema.optionalKey(Schema.String),
    content: Schema.optionalKey(Schema.String),
  },
  success: MaintenanceImport,
})

export const MaintenanceBackupRpc = Rpc.make("MaintenanceBackup", {
  payload: { options: Schema.optionalKey(MaintenanceBackupOptions) },
  success: MaintenanceBackupResult,
})

export const MaintenanceRestoreRpc = Rpc.make("MaintenanceRestore", {
  payload: {
    /** A backup id from the status list; the newest backup when omitted. */
    id: Schema.optionalKey(Schema.String),
  },
  success: MaintenanceRestoreResult,
})

export const MaintenanceWipeRpc = Rpc.make("MaintenanceWipe", {
  payload: {
    rotate: Schema.Boolean,
    country: Schema.optionalKey(Schema.String),
    /** Export every conversation before the wipe removes them. */
    backup: Schema.Boolean,
    /** What that export keeps; omitted means the full transcript. */
    backupOptions: Schema.optionalKey(MaintenanceBackupOptions),
  },
  success: MaintenanceResult,
})

export const MaintenanceRpcs = RpcGroup.make(
  MaintenanceStatusRpc,
  MaintenanceImportRpc,
  MaintenanceBackupRpc,
  MaintenanceRestoreRpc,
  MaintenanceWipeRpc,
)

export type MaintenanceConfig = Schema.Schema.Type<typeof MaintenanceConfig>

export type MaintenancePlatform = Schema.Schema.Type<typeof MaintenancePlatform>

export type MaintenanceWireguard = Schema.Schema.Type<typeof MaintenanceWireguard>

export type MaintenanceStatus = Schema.Schema.Type<typeof MaintenanceStatus>

export type MaintenanceResult = Schema.Schema.Type<typeof MaintenanceResult>

export type MaintenanceImport = Schema.Schema.Type<typeof MaintenanceImport>

export type MaintenanceBackup = Schema.Schema.Type<typeof MaintenanceBackup>

export type MaintenanceBackupResult = Schema.Schema.Type<typeof MaintenanceBackupResult>

export type MaintenanceRestoreResult = Schema.Schema.Type<typeof MaintenanceRestoreResult>

export type MaintenanceStep = Schema.Schema.Type<typeof MaintenanceStep>

export type MaintenanceFailure = Schema.Schema.Type<typeof MaintenanceFailure>

export type MaintenanceBackupOptions = Schema.Schema.Type<typeof MaintenanceBackupOptions>
