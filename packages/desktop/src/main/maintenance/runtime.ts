import { app } from "electron"
import { existsSync } from "node:fs"
import { join } from "node:path"

/**
 * The bundled userspace WireGuard runtime. It needs no driver, service or administrator rights, so a
 * tunnel can belong to one process instead of the whole machine.
 */
export function tunnelRuntime() {
  const override = process.env.TEKUCODE_WIREPROXY

  if (override && existsSync(override)) return override

  const name = process.platform === "win32" ? "wireproxy.exe" : "wireproxy"
  const root = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), "resources")
  const path = join(root, name)

  return existsSync(path) ? path : undefined
}
