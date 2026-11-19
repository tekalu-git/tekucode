import { chmod, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getCurrentCli } from "./utils"

// Userspace WireGuard client used for the app-scoped maintenance tunnel. It needs no driver or root,
// so the tunnel can belong to the OpenCode server process instead of the whole machine.
const VERSION = process.env.OPENCODE_WIREPROXY_VERSION ?? "v1.1.3"

const RELEASE = `https://github.com/windtf/wireproxy/releases/download/${VERSION}`

export const WIREPROXY_BINARIES: ReadonlyArray<{ os: string; cpu: string; asset: string }> = [
  { os: "linux", cpu: "x64", asset: "wireproxy_linux_amd64.tar.gz" },
  { os: "linux", cpu: "arm64", asset: "wireproxy_linux_arm64.tar.gz" },
  { os: "darwin", cpu: "x64", asset: "wireproxy_darwin_amd64.tar.gz" },
  { os: "darwin", cpu: "arm64", asset: "wireproxy_darwin_arm64.tar.gz" },
  { os: "win32", cpu: "x64", asset: "wireproxy_windows_amd64.tar.gz" },
]

export function wireproxyBinaryName(os = process.platform) {
  return os === "win32" ? "wireproxy.exe" : "wireproxy"
}

/**
 * Downloads the release that matches `OPENCODE_TARGET` into resources/ so electron-builder can ship it
 * next to the CLI. Upstream has no Windows ARM64 build, so that target packages without a tunnel
 * runtime and the maintenance dialog reports it as missing instead of falling back to system routing.
 */
export async function ensureWireproxy() {
  const cli = getCurrentCli()
  const name = wireproxyBinaryName(cli.os)
  const resources = join(import.meta.dirname, "..", "resources")
  const destination = join(resources, name)
  // The stamp records which release asset produced the cached binary: one checkout can build several
  // targets, and an x64 runtime next to an arm64 app fails only once the dialog tries to start it.
  const stamp = join(resources, `${name}.asset`)
  const binary = WIREPROXY_BINARIES.find((entry) => entry.os === cli.os && entry.cpu === cli.cpu)

  if (!binary) {
    // A runtime left by an earlier target of this OS is the wrong architecture, so a target without an
    // upstream build must not package the previous one.
    await rm(destination, { force: true })
    await rm(stamp, { force: true })
    console.warn(`wireproxy has no ${cli.os}/${cli.cpu} build; this package will not offer a scoped tunnel`)

    return
  }

  const cached = await Bun.file(stamp)
    .text()
    .catch(() => "")
  if ((await Bun.file(destination).exists()) && cached.trim() === binary.asset) {
    console.log(`Using cached ${destination}`)

    return
  }

  const directory = await mkdtemp(join(tmpdir(), "wireproxy-"))

  try {
    const archive = join(directory, "wireproxy.tar.gz")
    const response = await fetch(`${RELEASE}/${binary.asset}`)

    if (!response.ok) throw new Error(`Downloading ${binary.asset} failed: ${response.status} ${response.statusText}`)

    await Bun.write(archive, response)

    const extract = Bun.spawnSync(["tar", "-xzf", archive, "-C", directory])

    if (extract.exitCode !== 0) throw new Error(`Extracting ${binary.asset} failed: ${extract.stderr.toString()}`)

    const source = join(directory, name)

    if (!(await Bun.file(source).exists())) throw new Error(`${binary.asset} does not contain ${name}`)

    await Bun.write(destination, Bun.file(source))
    await Bun.write(stamp, binary.asset)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }

  if (cli.os !== "win32") await chmod(destination, 0o755)

  if (cli.os === "darwin") Bun.spawnSync(["codesign", "--force", "--sign", "-", destination])

  console.log(`Copied wireproxy ${VERSION} (${binary.asset}) to ${destination}`)
}
