import { existsSync, readdirSync } from "node:fs"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { runElevated, runElevatedPowerShell, runPowerShell } from "./elevate"
import { exists } from "./files"
import type { Paths } from "./paths"

/** Everything here reads and writes only the WireGuard config directory. */
export type WireguardPaths = Pick<Paths, "wireguard">

export type WireguardConfig = {
  readonly id: string
  readonly label: string
  readonly file: string
  readonly path: string
}

/** Where the tunnel tools come from, and whether this install can find them. */
export type WireguardInstallation = {
  readonly installed: boolean
  readonly executable?: string
  readonly configDir: string
}

export type MaintenancePlatform = "linux" | "win32" | "darwin" | "other"

const knownLabels = {
  nl: "Netherlands · NL-FREE#239",
  ca: "Canada · CA-FREE#36",
  us: "United States · US-FREE#86",
  sg: "Singapore · SG-FREE#21",
  nl2: "Netherlands · NL-FREE#80",
  nl3: "Netherlands · NL-FREE#113",
  ro: "Romania · RO-FREE#30",
  ch: "Switzerland · CH-FREE#6",
  sg2: "Singapore · SG-FREE#27",
  us1: "United States · US-FREE#139",
} satisfies Record<string, string>

// Legacy wiper ids map to these config filenames; kept so existing selections still resolve.
const legacyFiles = {
  nl: "nl-free-239.conf",
  ca: "ca-free-36.conf",
  us: "us-free-86.conf",
  sg: "sg-free-21.conf",
  nl2: "nl-free-80.conf",
  nl3: "nl-free-113.conf",
  ro: "ro-free-30.conf",
  ch: "ch-free-6.conf",
  sg2: "sg-free-27.conf",
  us1: "us-free-139.conf",
} satisfies Record<string, string>

const WG_QUICK = ["/usr/bin/wg-quick", "/usr/local/bin/wg-quick", "/bin/wg-quick"] as const

const WINDOWS_SERVICE_PREFIX = "WireGuardTunnel$"

// WireGuard configs are a few hundred bytes; anything this large is not a tunnel definition.
const MAX_CONFIG_SIZE = 64 * 1024

// Linux caps interface names at IFNAMSIZ - 1. Windows accepts these names too, so one limit keeps a
// config usable on either platform.
const MAX_INTERFACE_LENGTH = 15

const IP_ENDPOINT = "https://api.ipify.org"

const IP_TTL_MS = 15_000

const TUNNEL_SETTLE_MS = 5_000

type IPCache = {
  readonly value: string | undefined
  readonly at: number
}

let cached: IPCache = { value: undefined, at: 0 }

export function maintenancePlatform(): MaintenancePlatform {
  if (process.platform === "win32") return "win32"

  if (process.platform === "darwin") return "darwin"

  if (process.platform === "linux") return "linux"

  return "other"
}

/** Linux and Windows both have a path to a working rotation; macOS does not yet. */
export function maintenanceSupported() {
  const platform = maintenancePlatform()

  return platform === "linux" || platform === "win32"
}

function pretty(file: string) {
  const name = file.replace(/\.conf$/i, "")

  const match = /^([a-z]{2})-free-(\d+)$/i.exec(name)

  if (match) return `${match[1]!.toUpperCase()}-FREE#${match[2]}`

  return name
}

function lookup(table: Record<string, string>, value: string) {
  return Object.hasOwn(table, value) ? table[value] : undefined
}

export function discoverConfigs(paths: WireguardPaths): WireguardConfig[] {
  if (!existsSync(paths.wireguard)) return []

  const files = readdirSync(paths.wireguard)
    .filter((name) => name.endsWith(".conf"))
    .sort((a, b) => a.localeCompare(b))

  const configs = files.map((file) => {
    const name = file.replace(/\.conf$/i, "")
    const legacy = Object.entries(legacyFiles).find(([, value]) => value === file)?.[0]
    const id = legacy ?? name

    return {
      id,
      label: lookup(knownLabels, id) ?? pretty(file),
      file,
      path: join(paths.wireguard, file),
    } satisfies WireguardConfig
  })

  return configs
}

function resolveConfig(paths: Paths, id: string) {
  const configs = discoverConfigs(paths)
  const direct = configs.find((config) => config.id === id || config.file === id || config.file === `${id}.conf`)

  if (direct) return direct

  const legacy = lookup(legacyFiles, id)

  if (!legacy) return undefined

  const path = join(paths.wireguard, legacy)

  if (!existsSync(path)) return undefined

  return {
    id,
    label: lookup(knownLabels, id) ?? pretty(legacy),
    file: legacy,
    path,
  } satisfies WireguardConfig
}

/** Interface names come from config filenames on both platforms: `nl-free-239.conf` is `nl-free-239`. */
type KnownTunnel = { readonly country: string; readonly label: string; readonly interface: string }

function knownTunnels(paths?: Paths): KnownTunnel[] {
  const configs = paths ? discoverConfigs(paths) : []

  if (configs.length > 0)
    return configs.map((config) => ({
      country: config.id,
      label: config.label,
      interface: config.file.replace(/\.conf$/i, ""),
    }))

  return Object.entries(legacyFiles).map(([country, file]) => ({
    country,
    label: lookup(knownLabels, country) ?? pretty(file),
    interface: file.replace(/\.conf$/i, ""),
  }))
}

/** The tunnel that is up, if any. Linux answers from `/sys/class/net` without root. */
export async function activeTunnel(paths?: Paths) {
  const tunnels = knownTunnels(paths)

  if (process.platform === "win32") {
    const running = await windowsRunningTunnels()

    for (const tunnel of tunnels) {
      if (running.has(tunnel.interface))
        return { country: tunnel.country, interface: tunnel.interface, label: tunnel.label }
    }

    return undefined
  }

  for (const tunnel of tunnels) {
    if (existsSync(join("/sys/class/net", tunnel.interface)))
      return { country: tunnel.country, interface: tunnel.interface, label: tunnel.label }
  }

  return undefined
}

/** Tunnel services are named `WireGuardTunnel$<interface>`; one query answers for every config. */
async function windowsRunningTunnels() {
  const result = await runPowerShell(
    `Get-Service -Name '${WINDOWS_SERVICE_PREFIX}*' -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' } | ForEach-Object { $_.Name }`,
  )

  if (!result.ok) return new Set<string>()

  return new Set(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith(WINDOWS_SERVICE_PREFIX))
      .map((line) => line.slice(WINDOWS_SERVICE_PREFIX.length)),
  )
}

function windowsWireguardCandidates() {
  const programFiles = process.env.ProgramFiles
  const programFilesX86 = process.env["ProgramFiles(x86)"]
  const localAppData = process.env.LOCALAPPDATA

  return [
    programFiles ? join(programFiles, "WireGuard", "wireguard.exe") : undefined,
    programFilesX86 ? join(programFilesX86, "WireGuard", "wireguard.exe") : undefined,
    localAppData ? join(localAppData, "Programs", "WireGuard", "wireguard.exe") : undefined,
  ].filter((candidate): candidate is string => candidate !== undefined)
}

/** `wg-quick` ships with wireguard-tools; distributions disagree only about which bin directory holds it. */
function wgQuick() {
  return WG_QUICK.find((candidate) => existsSync(candidate))
}

/** Whether the platform's tunnel tool exists, so the window can warn before a run rather than after. */
export async function wireguardInstallation(paths: WireguardPaths): Promise<WireguardInstallation> {
  if (process.platform !== "win32") {
    const executable = wgQuick()

    return executable
      ? { installed: true, executable, configDir: paths.wireguard }
      : { installed: false, configDir: paths.wireguard }
  }

  const installed = windowsWireguardCandidates().find((candidate) => existsSync(candidate))

  if (installed) return { installed: true, executable: installed, configDir: paths.wireguard }

  // The installer can put WireGuard on PATH without using the default directory.
  const found = await runPowerShell("(Get-Command wireguard.exe -ErrorAction SilentlyContinue).Source")
  const executable = found.ok ? found.stdout.trim().split(/\r?\n/)[0]?.trim() : undefined

  if (executable) return { installed: true, executable, configDir: paths.wireguard }

  return { installed: false, configDir: paths.wireguard }
}

/** Creating the directory up front lets the dialog offer to open an otherwise-missing folder. */
export async function ensureConfigDir(paths: WireguardPaths) {
  await mkdir(paths.wireguard, { recursive: true }).catch(() => undefined)
}

export type WireguardImport =
  | {
      readonly ok: true
      readonly config: WireguardConfig
      readonly replaced: boolean
    }
  | {
      readonly ok: false
      readonly reason: "unsupported" | "invalid" | "failed"
      readonly message: string
    }

/**
 * Copies a downloaded `.conf` into the config directory under a name both tunnel tools accept. The
 * renderer sends either a picked path or, when a dropped file has no native path, its text.
 * ProtonVPN comments the server name (`# US-FREE#86`) above the peer, so one downloaded as
 * `wg0.conf` still lands as `us-free-86.conf` and gets the same label as an existing config.
 */
export async function importWireguardConfig(
  paths: WireguardPaths,
  input: { readonly path?: string; readonly name?: string; readonly content?: string },
): Promise<WireguardImport> {
  if (!maintenanceSupported())
    return { ok: false, reason: "unsupported", message: "WireGuard configs can be added on Linux and Windows" }

  const name = input.path ? basename(input.path) : (input.name ?? "wireguard.conf")
  const text = input.path ? await readConfig(input.path) : input.content
  const parsed = text === undefined ? undefined : parseConfig(text)

  if (text === undefined || !parsed)
    return { ok: false, reason: "invalid", message: `${name} is not a WireGuard config` }

  const file = `${interfaceName(parsed.server ?? name)}.conf`
  const target = join(paths.wireguard, file)
  const replaced = existsSync(target)

  await ensureConfigDir(paths)

  try {
    await writeFile(target, stripBom(text), { mode: 0o600 })
  } catch (error) {
    return { ok: false, reason: "failed", message: error instanceof Error ? error.message : String(error) }
  }

  const config = discoverConfigs(paths).find((entry) => entry.file === file)

  if (!config) return { ok: false, reason: "failed", message: `${file} could not be read back after it was saved` }

  return { ok: true, config, replaced }
}

async function readConfig(path: string) {
  const info = await stat(path).catch(() => undefined)

  if (!info?.isFile() || info.size === 0 || info.size > MAX_CONFIG_SIZE) return undefined

  const text = await readFile(path, "utf8").catch(() => undefined)

  return text === undefined ? undefined : stripBom(text)
}

function stripBom(text: string) {
  return text.startsWith("\uFEFF") ? text.slice(1) : text
}

/** A WireGuard config needs an interface with a private key and a peer with a public key and endpoint. */
function parseConfig(text: string) {
  if (text.length > MAX_CONFIG_SIZE) return undefined

  const body = stripBom(text).replace(/^\s*#.*$/gm, "")
  const has = (pattern: RegExp) => pattern.test(body)

  if (!has(/^\s*\[Interface\]\s*$/im)) return undefined
  if (!has(/^\s*PrivateKey\s*=\s*\S+/im)) return undefined
  if (!has(/^\s*\[Peer\]\s*$/im)) return undefined
  if (!has(/^\s*PublicKey\s*=\s*\S+/im)) return undefined
  if (!has(/^\s*Endpoint\s*=\s*\S+/im)) return undefined

  const server = /^\s*#\s*([A-Za-z]{2}-FREE#\d+)\s*$/m.exec(stripBom(text))?.[1]

  return { server }
}

/** `NL-FREE#239`, `nl-free-239.conf` and `US-FREE#86.conf` all become a safe interface name. */
function interfaceName(value: string) {
  const server = /([a-z]{2})-free#?(\d+)/i.exec(value)
  const base = server ? `${server[1]}-free-${server[2]}` : value.replace(/\.conf$/i, "")
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, MAX_INTERFACE_LENGTH)
    .replace(/[-_]+$/g, "")

  return clean || "wireguard"
}

export async function publicIP() {
  if (Date.now() - cached.at < IP_TTL_MS) return cached.value

  const value = await fetch(IP_ENDPOINT, { signal: AbortSignal.timeout(4_000) })
    .then((response) => (response.ok ? response.text() : undefined))
    .then((text) => text?.trim())
    .catch(() => undefined)

  cached = { value, at: Date.now() }

  return value
}

export type Rotation =
  | { readonly ok: true; readonly ip: string | undefined }
  | {
      readonly ok: false
      readonly reason:
        | "invalid-password"
        | "elevation-required"
        | "missing-config"
        | "missing-wireguard"
        | "unsupported"
        | "failed"
      readonly message: string
    }

/** Brings down every known tunnel and raises the selected one, in one elevated call. */
export async function rotate(paths: Paths, country: string, password?: string): Promise<Rotation> {
  const target = resolveConfig(paths, country)

  if (!target || !(await exists(target.path)))
    return { ok: false, reason: "missing-config", message: `Missing WireGuard config: ${country}` }

  if (process.platform === "win32") return rotateWindows(paths, target)

  if (process.platform !== "linux")
    return {
      ok: false,
      reason: "unsupported",
      message: "Tunnel rotation is wired for Linux and Windows only",
    }

  const executable = wgQuick()

  if (!executable)
    return {
      ok: false,
      reason: "missing-wireguard",
      message: "WireGuard is required: install wireguard-tools so wg-quick exists",
    }

  const existing = knownTunnels(paths)
    .map((tunnel) => join(paths.wireguard, `${tunnel.interface}.conf`))
    .filter((path) => existsSync(path))

  const script = [
    'target="$1"',
    "shift",
    `for config in "$@"; do "${executable}" down "$config" >/dev/null 2>&1 || true; done`,
    `"${executable}" up "$target"`,
  ].join("\n")

  const result = await runElevated(script, [target.path, ...existing], password)

  if (!result.ok) return result

  return settle()
}

async function rotateWindows(paths: Paths, target: WireguardConfig): Promise<Rotation> {
  const installation = await wireguardInstallation(paths)

  if (!installation.installed || !installation.executable)
    return {
      ok: false,
      reason: "missing-wireguard",
      message: "WireGuard for Windows is required to rotate tunnels",
    }

  // Include tunnels whose config file was removed, so a stale service cannot keep the old exit.
  const running = await windowsRunningTunnels()

  const existing = [
    ...new Set([
      ...knownTunnels(paths)
        .map((tunnel) => tunnel.interface)
        .filter((name) => existsSync(join(paths.wireguard, `${name}.conf`))),
      ...running,
    ]),
  ]

  const result = await runElevatedPowerShell(windowsTunnelScript(installation.executable, target.path, existing))

  if (!result.ok) return result

  return settle()
}

/** Exported for tests: the exact PowerShell the elevated process runs. */
export function windowsTunnelScript(executable: string, target: string, existing: readonly string[]) {
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

  return [
    "$ErrorActionPreference = 'Stop'",
    `$wireguard = ${quote(executable)}`,
    ...existing.map((name) => `& $wireguard /uninstalltunnelservice ${quote(name)} *> $null`),
    `& $wireguard /installtunnelservice ${quote(target)}`,
    "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
    "exit 0",
  ].join("\n")
}

async function settle(): Promise<Rotation> {
  await new Promise((resolve) => setTimeout(resolve, TUNNEL_SETTLE_MS))
  cached = { value: undefined, at: 0 }

  return { ok: true, ip: await publicIP() }
}
