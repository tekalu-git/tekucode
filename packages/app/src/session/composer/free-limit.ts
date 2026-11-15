import { Schema } from "effect"
import { Persistence } from "@/runtime/persistence/schema"

/** OpenCode Zen always says when free usage resets; this covers a refusal that doesn't, or a delay out of range. */
export const FALLBACK_RESET_MS = 3_600_000

export const FreeLimitState = Persistence.struct({ resetAt: Schema.NullOr(Schema.Finite) })

/** Free usage is counted per network, not per session, so one refusal holds until its reset time passes. */
export function freeLimitActive(resetAt: number | null, now: number) {
  return resetAt !== null && resetAt > now
}
