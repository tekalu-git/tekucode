import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { runElevated } from "./elevate"
import { exists } from "./files"
import type { Paths } from "./paths"

export type WireguardConfig = {
  readonly id: string
  readonly label: string
  readonly file: string
  readonly path: string
}

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

const WG_QUICK = "/usr/bin/wg-quick"

const IP_ENDPOINT = "https://api.ipify.org"

const IP_TTL_MS = 15_000

const TUNNEL_SETTLE_MS = 5_000

type IPCache = {
  readonly value: string | undefined
  readonly at: number
}

let cached: IPCache = { value: undefined, at: 0 }

function pretty(file: string) {
  const name = file.replace(/\.conf$/i, "")

  const match = /^([a-z]{2})-free-(\d+)$/i.exec(name)

  if (match) return `${match[1]!.toUpperCase()}-FREE#${match[2]}`

  return name
}

function lookup(table: Record<string, string>, value: string) {
  return Object.hasOwn(table, value) ? table[value] : undefined
}

export function discoverConfigs(paths: Paths): WireguardConfig[] {
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

/** The tunnel that is up, if any. `/sys/class/net` answers this without root. */
export function activeTunnel(paths?: Paths) {
  const configs = paths ? discoverConfigs(paths) : []

  if (configs.length > 0) {
    for (const config of configs) {
      const iface = config.file.replace(/\.conf$/i, "")

      if (existsSync(join("/sys/class/net", iface)))
        return { country: config.id, interface: iface, label: config.label }
    }

    return undefined
  }

  for (const [country, file] of Object.entries(legacyFiles)) {
    const iface = file.replace(/\.conf$/, "")

    if (existsSync(join("/sys/class/net", iface)))
      return { country, interface: iface, label: lookup(knownLabels, country) ?? pretty(file) }
  }

  return undefined
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
      readonly reason: "invalid-password" | "elevation-required" | "missing-config" | "failed"
      readonly message: string
    }

/** Brings down every known tunnel and raises the selected one, in one elevated call. */
export async function rotate(paths: Paths, country: string, password?: string): Promise<Rotation> {
  const target = resolveConfig(paths, country)

  if (!target || !(await exists(target.path)))
    return { ok: false, reason: "missing-config", message: `Missing WireGuard config: ${country}` }

  const configs = discoverConfigs(paths)

  const known =
    configs.length > 0
      ? configs.map((config) => config.path)
      : Object.values(legacyFiles).map((file) => join(paths.wireguard, file))

  const existing = (await Promise.all(known.map(async (path) => ((await exists(path)) ? path : undefined)))).filter(
    (path): path is string => path !== undefined,
  )

  const script = [
    'target="$1"',
    "shift",
    `for config in "$@"; do "${WG_QUICK}" down "$config" >/dev/null 2>&1 || true; done`,
    `"${WG_QUICK}" up "$target"`,
  ].join("\n")

  const result = await runElevated(script, [target.path, ...existing], password)

  if (!result.ok) return result

  await new Promise((resolve) => setTimeout(resolve, TUNNEL_SETTLE_MS))
  cached = { value: undefined, at: 0 }

  return { ok: true, ip: await publicIP() }
}
