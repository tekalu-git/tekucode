import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { importWireguardConfig, windowsTunnelScript } from "./vpn"

const WIREGUARD = "C:\\Program Files\\WireGuard\\wireguard.exe"

describe("windows tunnel rotation", () => {
  test("drops every existing tunnel before raising the target", () => {
    const script = windowsTunnelScript(
      WIREGUARD,
      "C:\\Users\\teku\\AppData\\Roaming\\opencode\\protonvpn-wg\\nl-free-239.conf",
      ["ca-free-36", "us-free-139"],
    )

    expect(script).toContain("& $wireguard /uninstalltunnelservice 'ca-free-36'")
    expect(script).toContain("& $wireguard /uninstalltunnelservice 'us-free-139'")
    expect(script.indexOf("/uninstalltunnelservice 'us-free-139'")).toBeLessThan(
      script.indexOf("/installtunnelservice"),
    )
  })

  test("installs the selected config and propagates its exit code", () => {
    const script = windowsTunnelScript(WIREGUARD, "C:\\tmp\\sg-free-21.conf", [])

    expect(script).toContain("& $wireguard /installtunnelservice 'C:\\tmp\\sg-free-21.conf'")
    expect(script).toContain("if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }")
    expect(script.trimEnd().endsWith("exit 0")).toBe(true)
  })

  test("escapes apostrophes inside Windows paths", () => {
    const script = windowsTunnelScript(WIREGUARD, "C:\\Users\\o'brien\\x.conf", [])

    expect(script).toContain("'C:\\Users\\o''brien\\x.conf'")
  })
})
