import { spawn } from "node:child_process"

export type ElevatedResult =
  | { readonly ok: true; readonly stdout: string }
  | {
      readonly ok: false
      readonly reason: "invalid-password" | "elevation-required" | "failed"
      readonly message: string
    }

type Run = { readonly code: number | null; readonly stdout: string; readonly stderr: string; readonly spawnError?: string }

/** `ERROR_CANCELLED`: the user dismissed the UAC prompt. Locale-independent. */
const ELEVATION_CANCELLED = 1223

/** Printed by the launcher when `Start-Process -Verb RunAs` itself fails, whatever the system language. */
const ELEVATION_MARKER = "TEKUCODE_UAC_CANCELLED"

/**
 * Runs a root-only shell script once. A password typed in the app goes through `sudo -S` on stdin and
 * is never written anywhere; without one, a cached sudo timestamp is tried first and a polkit prompt
 * (`pkexec`) is the fallback, so the dialog the user already sees still works.
 */
export async function runElevated(
  script: string,
  args: readonly string[],
  password?: string,
): Promise<ElevatedResult> {
  const command = ["/bin/sh", "-c", script, "sh", ...args]

  if (password) {
    const result = await run("sudo", ["-S", "-p", "", ...command], `${password}\n`)

    return classify(result)
  }

  const cached = await run("sudo", ["-n", ...command])

  if (cached.code === 0) return { ok: true, stdout: cached.stdout }

  // A cached credential was not the point of this attempt; ask the system for one.
  if (!needsPassword(cached.stderr)) return classify(cached)

  const polkit = await run("pkexec", command)

  if (polkit.code === 0) return { ok: true, stdout: polkit.stdout }

  return {
    ok: false,
    reason: "elevation-required",
    message: polkit.spawnError ?? tail(polkit.stderr) ?? "Administrator permission was not granted",
  }
}

/**
 * Windows has no sudo. WireGuard's tunnel commands need administrator rights, so the script is
 * handed to an elevated `powershell.exe` through the UAC prompt; the outer process only reports the
 * inner exit code. Cancel answers as `elevation-required` on every system language.
 */
export async function runElevatedPowerShell(script: string): Promise<ElevatedResult> {
  const inner = encodePowerShell(script)

  const launcher = [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    `  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${inner}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden`,
    "} catch {",
    `  Write-Output '${ELEVATION_MARKER}'`,
    `  exit ${ELEVATION_CANCELLED}`,
    "}",
    "exit $process.ExitCode",
  ].join("\n")

  const result = await run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodePowerShell(launcher)],
    undefined,
    180_000,
  )

  return classifyWindows(result)
}

/** Runs a read-only PowerShell script in the current security context. */
export async function runPowerShell(script: string): Promise<ElevatedResult> {
  const result = await run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodePowerShell(script)],
    undefined,
    30_000,
  )

  return classifyWindows(result)
}

/** PowerShell reads `-EncodedCommand` as UTF-16LE base64, which sidesteps cmd quoting entirely. */
function encodePowerShell(script: string) {
  return Buffer.from(script, "utf16le").toString("base64")
}

function classifyWindows(result: Run): ElevatedResult {
  if (result.code === 0) return { ok: true, stdout: result.stdout }

  if (result.code === ELEVATION_CANCELLED || result.stdout.includes(ELEVATION_MARKER))
    return { ok: false, reason: "elevation-required", message: "Administrator permission was not granted" }

  if (result.spawnError) return { ok: false, reason: "elevation-required", message: result.spawnError }

  if (result.code === null) return { ok: false, reason: "failed", message: "The command timed out" }

  return {
    ok: false,
    reason: "failed",
    message: tail(result.stderr) ?? `The command failed with exit code ${result.code}`,
  }
}

function classify(result: Run): ElevatedResult {
  if (result.code === 0) return { ok: true, stdout: result.stdout }

  if (result.spawnError || needsPassword(result.stderr))
    return {
      ok: false,
      reason: "elevation-required",
      message: result.spawnError ?? "Administrator permission was not granted",
    }

  if (isInvalidPassword(result.stderr))
    return { ok: false, reason: "invalid-password", message: "sudo rejected the password" }

  return { ok: false, reason: "failed", message: tail(result.stderr) ?? "The command failed" }
}

function needsPassword(stderr: string) {
  return /a password is required|no tty present|no password was provided|askpass/i.test(stderr)
}

function isInvalidPassword(stderr: string) {
  return /incorrect password|Sorry, try again/i.test(stderr)
}

function tail(value: string) {
  const text = value.trim().split("\n").slice(-4).join("\n").trim()

  return text.length > 0 ? text : undefined
}

function run(command: string, args: readonly string[], input?: string, timeout = 120_000): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    let settled = false

    const settle = (result: Run) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      settle({ code: null, stdout, stderr: `${stderr}\nTimed out after ${timeout / 1000}s` })
    }, timeout)

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on("error", (error: NodeJS.ErrnoException) => {
      settle({
        code: null,
        stdout,
        stderr,
        spawnError: error.code === "ENOENT" ? `${command} is not installed` : error.message,
      })
    })
    child.on("close", (code) => settle({ code, stdout, stderr }))

    if (input === undefined) child.stdin.end()
    else child.stdin.end(input)
  })
}
