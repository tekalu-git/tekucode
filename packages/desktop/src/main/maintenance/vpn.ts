import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { HttpsProxyAgent } from "https-proxy-agent"
import https from "node:https"
import { exists } from "./files"
import type { Paths } from "./paths"

/** Everything here reads the WireGuard config directory; the tunnel itself is a child process. */
export type WireguardPaths = Pick<Paths, "wireguard">

export type WireguardConfig = {
  readonly id: string
  readonly label: string
  readonly file: string
  readonly path: string
}

/** Where the tunnel runtime comes from, and whether this install can find it. */
export type TunnelInstallation = {
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

// WireGuard configs are a few hundred bytes; anything this large is not a tunnel definition.
const MAX_CONFIG_SIZE = 64 * 1024

const IP_ENDPOINT = "https://api.ipify.org"

const IP_TTL_MS = 15_000

// The first handshake on a free Proton tunnel can take a few seconds; a dead config never answers.
const TUNNEL_SETTLE_MS = 15_000

type IPCache = {
  readonly proxy: string | undefined
  readonly value: string | undefined
  readonly at: number
}

type ActiveTunnel = {
  readonly country: string
  readonly proxy: string
  readonly child: ChildProcess
  readonly directory: string
}

let active: ActiveTunnel | undefined

let cached: IPCache = { proxy: undefined, value: undefined, at: 0 }

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

/** The tunnel runtime is one userspace binary: it needs no driver, service or administrator rights. */
export function tunnelInstallation(executable: string | undefined, paths: WireguardPaths): TunnelInstallation {
  return executable
    ? { installed: true, executable, configDir: paths.wireguard }
    : { installed: false, configDir: paths.wireguard }
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
 * Copies a downloaded `.conf` into the config directory. The renderer sends either a picked path or,
 * when a dropped file has no native path, its text. ProtonVPN comments the server name
 * (`# US-FREE#86`) above the peer, so one downloaded as `wg0.conf` still lands as `us-free-86.conf`
 * and gets the same label as an existing config.
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

/** `NL-FREE#239`, `nl-free-239.conf` and `US-FREE#86.conf` all become a safe config name. */
function interfaceName(value: string) {
  const server = /([a-z]{2})-free#?(\d+)/i.exec(value)
  const base = server ? `${server[1]}-free-${server[2]}` : value.replace(/\.conf$/i, "")
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 15)
    .replace(/[-_]+$/g, "")

  return clean || "wireguard"
}

/**
 * The exact config the userspace proxy reads. `WGConfig` keeps the user's `.conf` as the single
 * source, and `[http]` exposes a loopback-only CONNECT proxy: traffic that uses it crosses the
 * tunnel, while the system's own interfaces, routes and DNS are untouched.
 */
export function tunnelConfig(wireguard: string, port: number) {
  return ["WGConfig = " + wireguard, "", "[http]", `BindAddress = 127.0.0.1:${port}`, ""].join("\n")
}

/** The environment that routes a process through the app-scoped tunnel, or nothing when it is off. */
export function tunnelEnvironment(): Readonly<Record<string, string>> {
  if (!active) return {}

  const proxy = active.proxy

  return {
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    ALL_PROXY: proxy,
    http_proxy: proxy,
    https_proxy: proxy,
    all_proxy: proxy,
  }
}

export type TunnelStatus = {
  readonly connected: boolean
  readonly country?: string
  readonly proxy?: string
}

export function tunnelStatus(): TunnelStatus {
  if (!active) return { connected: false }

  return { connected: true, country: active.country, proxy: active.proxy }
}

export async function publicIP(proxy?: string) {
  if (cached.proxy === proxy && Date.now() - cached.at < IP_TTL_MS) return cached.value

  const value = proxy
    ? await throughProxy(proxy, 8_000)
    : await fetch(IP_ENDPOINT, { signal: AbortSignal.timeout(4_000) })
        .then((response) => (response.ok ? response.text() : undefined))
        .then((text) => text?.trim())
        .catch(() => undefined)

  cached = { proxy, value, at: Date.now() }

  return value
}

export type Rotation =
  | { readonly ok: true; readonly ip: string | undefined }
  | {
      readonly ok: false
      readonly reason: "missing-config" | "missing-wireguard" | "unsupported" | "failed"
      readonly message: string
    }

/**
 * Starts the selected config as a userspace tunnel and exposes it on a loopback HTTP proxy. Every
 * known system tunnel is left alone; only a process that is handed this proxy uses the new exit.
 */
export async function rotate(paths: Paths, country: string, executable: string | undefined): Promise<Rotation> {
  const target = resolveConfig(paths, country)

  if (!target || !(await exists(target.path)))
    return { ok: false, reason: "missing-config", message: `Missing WireGuard config: ${country}` }

  if (!maintenanceSupported())
    return {
      ok: false,
      reason: "unsupported",
      message: "Tunnel rotation is wired for Linux and Windows only",
    }

  if (!executable)
    return {
      ok: false,
      reason: "missing-wireguard",
      message: "The bundled userspace tunnel runtime is missing; reinstall the app",
    }

  await stopTunnel()

  const port = await freePort()
  const directory = await mkdtemp(join(tmpdir(), "tekucode-tunnel-"))
  const file = join(directory, "tunnel.conf")
  const proxy = `http://127.0.0.1:${port}`

  await writeFile(file, tunnelConfig(target.path, port), { mode: 0o600 })

  const child = spawn(executable, ["-c", file, "-s"], { stdio: "ignore", windowsHide: true })
  let spawnError: Error | undefined

  child.once("error", (error) => {
    spawnError = error
  })

  active = { country: target.id, proxy, child, directory }

  child.once("exit", () => {
    if (active?.child !== child) return

    active = undefined
    cached = { proxy: undefined, value: undefined, at: 0 }
  })

  const ip = await settleProxy(proxy, () => spawnError !== undefined)

  if (!ip) {
    const message = spawnError instanceof Error ? spawnError.message : "The tunnel did not answer"
    await stopTunnel()

    return { ok: false, reason: "failed", message }
  }

  cached = { proxy, value: ip, at: Date.now() }

  return { ok: true, ip }
}

/** Stops the userspace tunnel and its proxy. System tunnels never started, so nothing else is touched. */
export async function stopTunnel() {
  const current = active

  active = undefined
  cached = { proxy: undefined, value: undefined, at: 0 }

  if (!current) return

  current.child.kill()
  // Windows keeps the config file locked while the process is alive, so wait for it to leave before
  // deleting the directory; this also reaps the child instead of leaving a zombie until app quit.
  await new Promise<void>((resolve) => {
    if (current.child.exitCode !== null || current.child.signalCode !== null) return resolve()

    current.child.once("exit", () => resolve())
    setTimeout(resolve, 2_000).unref()
  })
  await rm(current.directory, { recursive: true, force: true }).catch(() => undefined)
}

async function settleProxy(proxy: string, failed: () => boolean) {
  const deadline = Date.now() + TUNNEL_SETTLE_MS

  while (Date.now() < deadline) {
    if (failed()) return undefined

    const ip = await throughProxy(proxy, 2_000)

    if (ip) return ip

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return undefined
}

/** One HTTPS request through the tunnel's CONNECT proxy; resolves undefined on any failure. */
function throughProxy(proxy: string, timeout: number) {
  return new Promise<string | undefined>((resolve) => {
    const request = https.get(IP_ENDPOINT, { agent: new HttpsProxyAgent(proxy), timeout }, (response) => {
      if (response.statusCode !== 200) {
        response.resume()
        resolve(undefined)

        return
      }

      let body = ""

      response.setEncoding("utf8")
      response.on("data", (chunk: string) => (body += chunk))
      response.on("end", () => resolve(body.trim() || undefined))
    })

    request.on("timeout", () => request.destroy())
    request.on("error", () => resolve(undefined))
  })
}

/** A loopback port the tunnel can bind; the kernel picks it, so two runs never collide. */
function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()

    server.unref()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address !== null ? address.port : 0

      server.close(() => resolve(port))
    })
  })
}
