import { describe, expect, test } from "bun:test"
import { initialState, transition, type Event, type State } from "./machine"

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
      { type: "form.patched", patch: { country: "sg", password: "hunter2" } },
      { type: "run.started" },
      { type: "progress", progress: { id: "run", step: "vpn", status: "failed", message: "denied" } },
      { type: "run.failed", reason: "invalid-password", message: "sudo rejected the password", wiped: false },
    ])

    expect(failed).toMatchObject({
      status: "failed",
      reason: "invalid-password",
      form: { rotate: true, country: "sg", password: "hunter2" },
      steps: { vpn: { status: "failed", message: "denied" } },
    })
    expect(transition(failed, { type: "run.started" })).toMatchObject({
      status: "running",
      form: { country: "sg", password: "hunter2" },
      step: "vpn",
    })
  })

  test("a finished run refuses another start", () => {
    const done = replay([
      { type: "run.started" },
      { type: "progress", progress: { id: "run", step: "start", status: "done" } },
      { type: "run.succeeded", ip: "203.0.113.9" },
    ])

    expect(done).toEqual({ status: "done", form: { rotate: true, country: "nl", password: "" }, ip: "203.0.113.9" })
    expect(transition(done, { type: "run.started" })).toBe(done)
  })
})
