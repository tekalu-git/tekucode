import { Context, Effect, Layer } from "effect"
import net from "node:net"
import fs from "node:fs"

const TOR_CONTROL_SOCKET = "/run/tor/control"

function readAuthCookie(): string | undefined {
  try {
    const cookie = fs.readFileSync("/run/tor/control.authcookie")
    return Buffer.from(cookie).toString("hex")
  } catch {
    return undefined
  }
}

const COOKIE = readAuthCookie()

export interface TorServiceInterface {
  readonly rotateIdentity: () => Effect.Effect<void>
  readonly getExitIP: () => Effect.Effect<{ ip: string }>
  readonly sendCommand: (command: string) => Effect.Effect<string>
}

export class TorService extends Context.Service<TorService, TorServiceInterface>()("@opencode/TorService") {}

export const TorServiceLive = Layer.effect(
  TorService,
  Effect.gen(function* () {
    const sendCommand = Effect.fn("TorService.sendCommand")(function* (command: string) {
      return yield* Effect.promise(() =>
        new Promise<string>((resolve, reject) => {
          const socket = net.connect(TOR_CONTROL_SOCKET)
          let buffer = ""

          socket.on("data", (data) => {
            buffer += data.toString()
            if (buffer.endsWith("\r\n250 OK\r\n") || buffer.endsWith("\r\n250\r\n")) {
              socket.end()
              resolve(buffer)
            }
          })

          socket.on("error", (err) => reject(err))
          socket.on("timeout", () => reject(new Error("Tor control connection timeout")))

          socket.setTimeout(10000)

          const authCmd = COOKIE
            ? `AUTHENTICATE ${COOKIE}\r\n`
            : "AUTHENTICATE\r\n"
          socket.write(authCmd + command + "\r\n")
        }),
      )
    })

    const rotateIdentity = Effect.fn("TorService.rotateIdentity")(function* () {
      yield* Effect.logInfo("Requesting new Tor identity (NEWNYM)")
      const response = yield* sendCommand("SIGNAL NEWNYM").pipe(
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            yield* Effect.logWarning("Tor not available, skipping IP rotation", { cause })
            return "Tor not available"
          })
        )
      )
      yield* Effect.logInfo("Tor NEWNYM response", { response })
      yield* Effect.sleep("8 seconds")
    })

    const getExitIP = Effect.fn("TorService.getExitIP")(function* () {
      return yield* Effect.promise(() =>
        fetch("https://api.ipify.org?format=json", {
          // Note: requires undici or similar for proxy support
          // This is a placeholder - actual implementation would use a SOCKS5 proxy agent
        }).then((r) => r.json()),
      ).pipe(
        Effect.catchCause(() => Effect.succeed({ ip: "unknown" })),
      )
    })

    return { rotateIdentity, getExitIP, sendCommand }
  }),
)