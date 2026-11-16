import { describe, expect, test } from "bun:test"
import {
  createTourState,
  IDLE,
  selectTourDone,
  selectTourProgress,
  selectTourStep,
  selectTourVisible,
  TOUR_STEPS,
  transitionTour,
  type TourEvent,
  type TourState,
} from "./machine"

function run(state: TourState, ...events: TourEvent[]) {
  return events.reduce(
    (result, event) => {
      const next = transitionTour(result.state, event)

      return { state: next.state, effects: [...result.effects, ...next.effects] }
    },
    { state, effects: [] as { type: string }[] },
  )
}

describe("onboarding tour", () => {
  test("a pending install opens the welcome; a settled one shows nothing", () => {
    expect(createTourState(true)).toEqual({ status: "welcome" })
    expect(createTourState(false)).toBe(IDLE)
  })

  test("walks welcome → steps → folder → done and persists completion once", () => {
    const walked = run(
      { status: "welcome" },
      { type: "start" },
      ...TOUR_STEPS.map(() => ({ type: "next" }) as const),
    )

    expect(walked.effects).toEqual([])
    expect(walked.state).toEqual({ status: "folder" })
    expect(selectTourVisible(walked.state)).toBe(true)

    const done = run(walked.state, { type: "folder.settled" })

    expect(done.state).toEqual({ status: "done" })
    expect(done.effects).toEqual([{ type: "persist-complete" }])
    expect(selectTourDone(done.state)).toBe(true)
    expect(selectTourVisible(done.state)).toBe(false)
  })

  test("skipping from the welcome or any step still asks where work should live", () => {
    expect(run({ status: "welcome" }, { type: "skip" }).state).toEqual({ status: "folder" })

    const mid = run({ status: "welcome" }, { type: "start" }, { type: "next" }).state

    expect(run(mid, { type: "skip" }).state).toEqual({ status: "folder" })
  })

  test("back steps through the tour and returns to the welcome from the first step", () => {
    const last = run({ status: "welcome" }, { type: "start" }, { type: "next" }).state

    expect(run(last, { type: "back" }).state).toEqual({ status: "step", index: 0 })

    const first = run(last, { type: "back" }).state

    expect(run(first, { type: "back" }).state).toEqual({ status: "welcome" })
    expect(run({ status: "folder" }, { type: "back" }).state).toEqual({
      status: "step",
      index: TOUR_STEPS.length - 1,
    })
  })

  test("the current step and its one-based progress follow the index", () => {
    const state = run({ status: "welcome" }, { type: "start" }).state

    expect(selectTourStep(state)).toBe("composer")
    expect(selectTourProgress(state)).toEqual({ index: 1, total: TOUR_STEPS.length })

    const next = run(state, { type: "next" }).state

    expect(selectTourStep(next)).toBe("model")
    expect(selectTourProgress(next)).toEqual({ index: 2, total: TOUR_STEPS.length })
    expect(selectTourStep({ status: "folder" })).toBeUndefined()
  })

  test("completion is not persisted by any earlier stage", () => {
    const walked = run(
      { status: "welcome" },
      { type: "start" },
      { type: "next" },
      { type: "back" },
      { type: "skip" },
    )

    expect(walked.effects).toEqual([])
  })

  test("a settled not-pending window ignores the tour and a closed one ignores later events", () => {
    expect(run(IDLE, { type: "pending.settled", pending: false }).state).toBe(IDLE)
    expect(run(IDLE, { type: "start" }).state).toBe(IDLE)
    expect(run(IDLE, { type: "next" }).state).toBe(IDLE)

    const done = { status: "done" } as const

    expect(run(done, { type: "replay" }).state).toBe(done)
    expect(run(done, { type: "folder.settled" }).state).toBe(done)
    expect(run({ status: "folder" }, { type: "replay" }).state).toEqual({ status: "folder" })
  })

  test("replay reopens the welcome from anywhere the tour can still run", () => {
    expect(run({ status: "welcome" }, { type: "replay" }).state).toEqual({ status: "welcome" })
    expect(run({ status: "step", index: 2 }, { type: "replay" }).state).toEqual({ status: "welcome" })
  })
})
