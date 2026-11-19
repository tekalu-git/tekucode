import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { Paths } from "./paths"
import {
  discoverConfigs,
  importWireguardConfig,
  maintenanceSupported,
  rotate,
  stopTunnel,
  tunnelConfig,
  tunnelEnvironment,
  tunnelInstallation,
  tunnelStatus,
} from "./vpn"

const CONFIG = `[Interface]
PrivateKey = aGVsbG8=
Address = 10.2.0.2/32

# NL-FREE#239
[Peer]
PublicKey = d29ybGQ=
Endpoint = 203.0.113.10:51820
`

const supported = test.skipIf(!maintenanceSupported())

async function directory() {
  return mkdtemp(path.join(os.tmpdir(), "opencode-vpn-test-"))
}

describe("userspace tunnel", () => {
  test("keeps the user's config and binds only loopback", () => {
    const config = tunnelConfig("/home/teku/.config/opencode/protonvpn-wg/nl-free-239.conf", 41823)

    expect(config).toBe(
      [
        "WGConfig = /home/teku/.config/opencode/protonvpn-wg/nl-free-239.conf",
        "",
        "[http]",
        "BindAddress = 127.0.0.1:41823",
        "",
      ].join("\n"),
    )
  })

  test("an inactive tunnel exports no proxy and reports no connection", async () => {
    await stopTunnel()

    expect(tunnelEnvironment()).toEqual({})
    expect(tunnelStatus()).toEqual({ connected: false })
  })

  test("an executable decides whether the tunnel can run", () => {
    expect(tunnelInstallation("/opt/TekuCode/resources/wireproxy", { wireguard: "/wg" })).toEqual({
      installed: true,
      executable: "/opt/TekuCode/resources/wireproxy",
      configDir: "/wg",
    })
    expect(tunnelInstallation(undefined, { wireguard: "/wg" })).toEqual({ installed: false, configDir: "/wg" })
  })

  supported("rotation fails without the runtime instead of falling back to system routing", async () => {
    const wireguard = await directory()

    try {
      await writeFile(path.join(wireguard, "nl-free-239.conf"), CONFIG)

      const result = await rotate({ wireguard } as Paths, "nl", undefined)

      expect(result).toMatchObject({ ok: false, reason: "missing-wireguard" })
      expect(tunnelStatus()).toEqual({ connected: false })
      expect(tunnelEnvironment()).toEqual({})
    } finally {
      await rm(wireguard, { recursive: true, force: true })
    }
  })

  supported("rotation reports a missing config before starting anything", async () => {
    const wireguard = await directory()

    try {
      const result = await rotate({ wireguard } as Paths, "nl", "/nonexistent/wireproxy")

      expect(result).toMatchObject({ ok: false, reason: "missing-config" })
      expect(tunnelStatus()).toEqual({ connected: false })
    } finally {
      await rm(wireguard, { recursive: true, force: true })
    }
  })
})

describe("config discovery", () => {
  test("Proton filenames map back to their country id and label", async () => {
    const wireguard = await directory()

    try {
      await writeFile(path.join(wireguard, "nl-free-239.conf"), CONFIG)
      await writeFile(path.join(wireguard, "custom.conf"), CONFIG)

      expect(discoverConfigs({ wireguard })).toEqual([
        { id: "custom", label: "custom", file: "custom.conf", path: path.join(wireguard, "custom.conf") },
        {
          id: "nl",
          label: "Netherlands · NL-FREE#239",
          file: "nl-free-239.conf",
          path: path.join(wireguard, "nl-free-239.conf"),
        },
      ])
    } finally {
      await rm(wireguard, { recursive: true, force: true })
    }
  })

  supported("a downloaded Proton file lands under its server name", async () => {
    const wireguard = await directory()

    try {
      const imported = await importWireguardConfig({ wireguard }, { name: "wg0.conf", content: CONFIG })

      expect(imported.ok).toBe(true)
      if (!imported.ok) return

      expect(imported.replaced).toBe(false)
      expect(imported.config).toMatchObject({ id: "nl", file: "nl-free-239.conf" })
    } finally {
      await rm(wireguard, { recursive: true, force: true })
    }
  })
})
