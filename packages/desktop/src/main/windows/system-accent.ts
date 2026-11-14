import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { BrowserWindow, systemPreferences } from "electron"
import { WindowSystemAccentChanged } from "../../shared/ipc-rpc/events"
import { emitIpcEvent } from "../ipc-events"

const execFileAsync = promisify(execFile)

let current: string | null | undefined
let reading: Promise<string | null> | undefined
let revision = 0

function hexChannel(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
    .toString(16)
    .padStart(2, "0")
}

function fromPortal(stdout: string): string | null {
  const values = stdout.match(/(?:\d+\.\d+|\d+)/g)?.map(Number)
  if (!values || values.length < 3) return null
  const [r, g, b] = values
  if (![r, g, b].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) return null

  return `#${hexChannel(r!)}${hexChannel(g!)}${hexChannel(b!)}`
}

function fromElectron(value: string): string | null | undefined {
  const hex = value.trim().replace(/^#/, "")
  if (/^[\da-f]{6}(?:[\da-f]{2})?$/i.test(hex)) return `#${hex.slice(0, 6).toLowerCase()}`
  if (!value.trim()) return null

  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!rgb) return undefined
  const channels = rgb.slice(1, 4).map(Number)
  if (!channels.every((channel) => channel >= 0 && channel <= 255)) return undefined

  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

/** Reads the standardized XDG portal setting once; absent portal support is a normal fallback. */
export function getSystemAccentColor(): Promise<string | null> {
  if (process.platform !== "linux") return Promise.resolve(null)
  if (current !== undefined) return Promise.resolve(current)
  if (reading) return reading

  const startedAtRevision = revision
  reading = execFileAsync(
    "gdbus",
    [
      "call",
      "--session",
      "--dest",
      "org.freedesktop.portal.Desktop",
      "--object-path",
      "/org/freedesktop/portal/desktop",
      "--method",
      "org.freedesktop.portal.Settings.Read",
      "org.freedesktop.appearance",
      "accent-color",
    ],
    { timeout: 1500 },
  )
    .then(({ stdout }) => fromPortal(stdout))
    .catch(() => null)
    .then((color) => {
      if (revision === startedAtRevision) current = color
      reading = undefined

      return current ?? color
    })

  return reading
}

/** Electron forwards the XDG portal's accent-color changes on Linux. */
export function watchSystemAccentColor() {
  if (process.platform !== "linux") return () => undefined

  const changed = (_event: Electron.Event, value: string) => {
    const color = fromElectron(value)
    if (color === undefined || color === current) return
    current = color

    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || win.webContents.isDestroyed()) continue
      emitIpcEvent(win.webContents, new WindowSystemAccentChanged({ color }))
    }
  }

  systemPreferences.on("accent-color-changed", changed)

  return () => systemPreferences.off("accent-color-changed", changed)
}
