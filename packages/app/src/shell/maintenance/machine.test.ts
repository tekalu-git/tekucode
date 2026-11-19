import { describe, expect, test } from "bun:test"
import { failureKey, initialState, transition, type Event, type State } from "./machine"

function replay(events: readonly Event[], from: State = initialState()) {
  return events.reduce((state, event) => transition(state, event), from)
}

describe("maintenance dialog", () => {
  test("progress for an unknown step is ignored", () => {
    const running = replay([
      { type: "run.started" },
      { type: "progress", progress: { id: "run", step: "start", status: "running" } },
    ])

    expect(transition(running, { type: "progress", progress: { id: "run", step: "nope", status: "done" } })).toBe(
      running,
    )
  })

  test("a failure keeps the form so a retry sends the same country", () => {
    const failed = replay([
      { type: "form.patched", patch: { country: "sg" } },
      { type: "run.started" },
      { type: "progress", progress: { id: "run", step: "vpn", status: "failed", message: "denied" } },
      { type: "run.failed", reason: "failed", message: "the tunnel did not answer", wiped: false },
    ])

    expect(failed).toMatchObject({
      status: "failed",
      reason: "failed",
      form: { rotate: true, country: "sg" },
      steps: { vpn: { status: "failed", message: "denied" } },
    })
    expect(transition(failed, { type: "run.started" })).toMatchObject({
      status: "running",
      form: { country: "sg" },
      step: "vpn",
    })
  })

  test("a finished run refuses another start", () => {
    const done = replay([
      { type: "run.started" },
      { type: "progress", progress: { id: "run", step: "start", status: "done" } },
      { type: "run.succeeded", ip: "203.0.113.9" },
    ])

    expect(done).toEqual({
      status: "done",
      form: { backup: true, rotate: true, country: "nl" },
      ip: "203.0.113.9",
    })
    expect(transition(done, { type: "run.started" })).toBe(done)
  })
})

describe("maintenance failure copy", () => {
  test("a missing tunnel runtime points at the setup message", () => {
    expect(failureKey("missing-wireguard")).toBe("maintenance.dialog.missingWireguard")
  })

  test("an unsupported platform keeps its own message", () => {
    expect(failureKey("unsupported")).toBe("maintenance.dialog.unsupported")
  })
})
