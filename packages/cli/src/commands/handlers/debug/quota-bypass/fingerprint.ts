import { Context, Effect, Layer, Schema } from "effect"
import fs from "node:fs/promises"
import crypto from "node:crypto"

export interface Fingerprint {
  nonce: string
  clientLabel: string
  userAgent: string
}

const CHROME_UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
]

const FIREFOX_UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
]

const ALL_UAS = [...CHROME_UAS, ...FIREFOX_UAS]

const FingerprintSchema = Schema.Struct({
  nonce: Schema.String,
  clientLabel: Schema.String,
  userAgent: Schema.String,
})

export interface FingerprintServiceInterface {
  readonly generate: () => Effect.Effect<Fingerprint>
  readonly write: (path: string, fp: Fingerprint) => Effect.Effect<void>
  readonly read: (path: string) => Effect.Effect<Fingerprint | null>
  readonly rotate: (params: { fingerprintPath: string }) => Effect.Effect<Fingerprint>
}

export const FingerprintService = Context.Service<FingerprintServiceInterface>()("@opencode/FingerprintService")

export const FingerprintServiceLive = Layer.effect(
  FingerprintService,
  Effect.gen(function* () {
    const generate = Effect.fn("FingerprintService.generate")(function* () {
      const nonce = crypto.randomBytes(32).toString("hex")
      const clientLabel = "oc-" + crypto.randomBytes(6).toString("hex")
      const userAgent = ALL_UAS[Math.floor(Math.random() * ALL_UAS.length)]
      return { nonce, clientLabel, userAgent } satisfies Fingerprint
    })

    const write = Effect.fn("FingerprintService.write")(function* (path: string, fp: Fingerprint) {
      yield* Effect.promise(() => fs.writeFile(path, JSON.stringify(fp, null, 2), "utf-8"))
    })

    const read = Effect.fn("FingerprintService.read")(function* (path: string) {
      return yield* Effect.promise(() =>
        fs.readFile(path, "utf-8").then((s) => Schema.decodeUnknownSync(FingerprintSchema)(JSON.parse(s)))
      ).pipe(Effect.catchCause(() => Effect.succeed(null)))
    })

    const rotate = Effect.fn("FingerprintService.rotate")(function* ({ fingerprintPath }: { fingerprintPath: string }) {
      const fp = yield* generate()
      yield* write(fingerprintPath, fp)
      yield* Effect.logInfo("Rotated fingerprint", { clientLabel: fp.clientLabel })
      return fp
    })

    return { generate, write, read, rotate }
  }),
)