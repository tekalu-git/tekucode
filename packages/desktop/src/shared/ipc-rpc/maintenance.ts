import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

// WireGuard configs discovered from the ProtonVPN config directory. Adding a new `.conf` file there
// makes it available without changing the app; known Proton free tunnel names get friendly labels.
export const MaintenanceConfig = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  file: Schema.String,
})

export const maintenanceSteps = ["vpn", "stop", "snapshot", "wipe", "restore", "start"] as const

export const MaintenanceStep = Schema.Literals(maintenanceSteps)

export const MaintenanceVpn = Schema.Struct({
  connected: Schema.Boolean,
  country: Schema.optionalKey(Schema.String),
  interface: Schema.optionalKey(Schema.String),
  ip: Schema.optionalKey(Schema.String),
})

export const MaintenanceStatus = Schema.Struct({
  supported: Schema.Boolean,
  vpn: MaintenanceVpn,
  configs: Schema.Array(MaintenanceConfig),
})

export const MaintenanceFailure = Schema.Literals([
  "busy",
  "unsupported",
  "invalid-password",
  "elevation-required",
  "missing-config",
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

export const MaintenanceStatusRpc = Rpc.make("MaintenanceStatus", { success: MaintenanceStatus })

export const MaintenanceWipeRpc = Rpc.make("MaintenanceWipe", {
  payload: {
    rotate: Schema.Boolean,
    country: Schema.optionalKey(Schema.String),
    password: Schema.optionalKey(Schema.String),
  },
  success: MaintenanceResult,
})

export const MaintenanceRpcs = RpcGroup.make(MaintenanceStatusRpc, MaintenanceWipeRpc)

export type MaintenanceConfig = Schema.Schema.Type<typeof MaintenanceConfig>

export type MaintenanceStatus = Schema.Schema.Type<typeof MaintenanceStatus>

export type MaintenanceResult = Schema.Schema.Type<typeof MaintenanceResult>

export type MaintenanceStep = Schema.Schema.Type<typeof MaintenanceStep>

export type MaintenanceFailure = Schema.Schema.Type<typeof MaintenanceFailure>
