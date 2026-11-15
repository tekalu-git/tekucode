import { describe, expect, test } from "bun:test"
import { initialState, transition, type Event, type Progress, type State } from "./machine"

function replay(events: readonly Event[], from: State = initialState()) {
  return events.reduce<{ state: State; progress: Progress[] }>(
    (result, event) => {
      const next = transition(result.state, event)

      return {
        state: next.state,
        progress: [...result.progress, ...next.effects.map((effect) => effect.progress)],
      }
    },
    { state: from, progress: [] },
  )
}

describe("maintenance wipe steps", () => {
  test("a skipped first step is completed and reported as skipped", () => {
    const { state, progress } = replay([
      { type: "run.started", id: "run", first: "vpn" },
      { type: "step.skipped", message: "not requested" },
    ])

    expect(progress).toEqual([
      { id: "run", step: "vpn", status: "running" },
      { id: "run", step: "vpn", status: "skipped", message: "not requested" },
    ])
    expect(state).toEqual({ status: "running", id: "run", step: "vpn", completed: ["vpn"] })
  })

  test("a failure reports the step it stopped on and keeps that step", () => {
    const { state, progress } = replay([
      { type: "run.started", id: "run", first: "vpn" },
      { type: "step.entered", step: "stop" },
      { type: "run.failed", message: "wg-quick failed" },
    ])

    expect(progress.at(-1)).toEqual({ id: "run", step: "stop", status: "failed", message: "wg-quick failed" })
    expect(state).toEqual({ status: "failed", id: "run", step: "stop", message: "wg-quick failed" })
  })

  test("a finished run ignores later step events without allocating", () => {
    const done = replay([
      { type: "run.started", id: "run", first: "vpn" },
      { type: "run.succeeded" },
    ]).state

    const next = transition(done, { type: "step.entered", step: "stop" })

    expect(next.state).toBe(done)
    expect(next.effects).toEqual([])
  })
})
