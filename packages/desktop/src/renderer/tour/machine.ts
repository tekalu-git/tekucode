/** The real UI each step points at, in order. The overlay resolves these as `data-tour` anchors. */
export const TOUR_STEPS = ["composer", "model", "agent", "project", "tabs"] as const

export type TourStep = (typeof TOUR_STEPS)[number]

/** Everything the window shows: nothing, the welcome dialog, the layout question, a highlighted step, the folder question, or closed. */
export type TourState =
  | { readonly status: "idle" }
  | { readonly status: "welcome" }
  | { readonly status: "layout" }
  | { readonly status: "step"; readonly index: number }
  | { readonly status: "folder" }
  | { readonly status: "done" }

export type TourEvent =
  | { readonly type: "pending.settled"; readonly pending: boolean }
  | { readonly type: "start" }
  | { readonly type: "next" }
  | { readonly type: "back" }
  | { readonly type: "skip" }
  | { readonly type: "folder.settled" }
  | { readonly type: "replay" }

export type TourEffect = { readonly type: "persist-complete" }

export type TourTransition = { readonly state: TourState; readonly effects: readonly TourEffect[] }

const NO_EFFECTS: readonly TourEffect[] = []

export const IDLE: TourState = { status: "idle" }

export function createTourState(pending: boolean): TourState {
  return pending ? { status: "welcome" } : IDLE
}

export function transitionTour(state: TourState, event: TourEvent): TourTransition {
  switch (event.type) {
    case "pending.settled":
      if (state.status !== "idle") return { state, effects: NO_EFFECTS }

      return { state: event.pending ? { status: "welcome" } : IDLE, effects: NO_EFFECTS }

    case "replay":
      return state.status === "done" || state.status === "folder"
        ? { state, effects: NO_EFFECTS }
        : { state: { status: "welcome" }, effects: NO_EFFECTS }

    case "start":
      if (state.status !== "welcome") return { state, effects: NO_EFFECTS }

      return { state: { status: "layout" }, effects: NO_EFFECTS }

    case "next": {
      if (state.status === "layout") return { state: { status: "step", index: 0 }, effects: NO_EFFECTS }

      if (state.status !== "step") return { state, effects: NO_EFFECTS }

      if (state.index === TOUR_STEPS.length - 1) return { state: { status: "folder" }, effects: NO_EFFECTS }

      return { state: { status: "step", index: state.index + 1 }, effects: NO_EFFECTS }
    }

    case "back": {
      if (state.status === "folder")
        return { state: { status: "step", index: TOUR_STEPS.length - 1 }, effects: NO_EFFECTS }

      if (state.status === "layout") return { state: { status: "welcome" }, effects: NO_EFFECTS }

      if (state.status !== "step") return { state, effects: NO_EFFECTS }

      return {
        state: state.index === 0 ? { status: "layout" } : { status: "step", index: state.index - 1 },
        effects: NO_EFFECTS,
      }
    }

    // Skipping the tour keeps the folder question: it is the one setup choice left.
    case "skip":
      if (state.status !== "welcome" && state.status !== "layout" && state.status !== "step")
        return { state, effects: NO_EFFECTS }

      return { state: { status: "folder" }, effects: NO_EFFECTS }

    case "folder.settled":
      if (state.status !== "folder") return { state, effects: NO_EFFECTS }

      return { state: { status: "done" }, effects: [{ type: "persist-complete" }] }
  }
}

/** Whether the driver shows anything: the welcome, the layout question, a step or the folder question. */
export function selectTourVisible(state: TourState) {
  return state.status === "welcome" || state.status === "layout" || state.status === "step" || state.status === "folder"
}

/** The anchor of the current step, if one is showing. */
export function selectTourStep(state: TourState): TourStep | undefined {
  return state.status === "step" ? TOUR_STEPS[state.index] : undefined
}

/** One-based position for copy such as "Step 2 of 5"; undefined outside the tour. */
export function selectTourProgress(state: TourState) {
  return state.status === "step" ? { index: state.index + 1, total: TOUR_STEPS.length } : undefined
}

export function selectTourDone(state: TourState) {
  return state.status === "done"
}
