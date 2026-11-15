import type { MaintenanceStep } from "../../shared/ipc-rpc/maintenance"

/** One step of a run reached a new state; the driver emits it to every window. */
export type Progress = {
  readonly id: string
  readonly step: MaintenanceStep
  readonly status: "running" | "done" | "skipped" | "failed"
  readonly message?: string
}

export type State =
  | { readonly status: "idle" }
  | {
      readonly status: "running"
      readonly id: string
      readonly step: MaintenanceStep
      readonly completed: readonly MaintenanceStep[]
    }
  | { readonly status: "failed"; readonly id: string; readonly step: MaintenanceStep; readonly message: string }
  | { readonly status: "done"; readonly id: string }

export type Event =
  | { readonly type: "run.started"; readonly id: string; readonly first: MaintenanceStep }
  | { readonly type: "step.entered"; readonly step: MaintenanceStep }
  | { readonly type: "step.finished"; readonly message?: string }
  | { readonly type: "step.skipped"; readonly message?: string }
  | { readonly type: "run.failed"; readonly message: string }
  | { readonly type: "run.succeeded" }
  | { readonly type: "run.reset" }

export type Effect = { readonly type: "progress"; readonly progress: Progress }

export type Transition = { readonly state: State; readonly effects: readonly Effect[] }

export function initialState(): State {
  return { status: "idle" }
}

export function transition(state: State, event: Event): Transition {
  if (event.type === "run.reset") return { state: initialState(), effects: [] }

  if (event.type === "run.started") {
    const next: State = { status: "running", id: event.id, step: event.first, completed: [] }

    return {
      state: next,
      effects: [{ type: "progress", progress: progress(next, "running") }],
    }
  }

  if (state.status !== "running") return unchanged(state)

  if (event.type === "step.entered") {
    const next: State = { ...state, step: event.step }

    return { state: next, effects: [{ type: "progress", progress: progress(next, "running") }] }
  }

  if (event.type === "step.finished" || event.type === "step.skipped") {
    const next: State = { ...state, completed: [...state.completed, state.step] }

    return {
      state: next,
      effects: [
        {
          type: "progress",
          progress: progress(next, event.type === "step.skipped" ? "skipped" : "done", event.message),
        },
      ],
    }
  }

  if (event.type === "run.failed") {
    const next: State = { status: "failed", id: state.id, step: state.step, message: event.message }

    return {
      state: next,
      effects: [{ type: "progress", progress: progress(state, "failed", event.message) }],
    }
  }

  if (event.type === "run.succeeded") return { state: { status: "done", id: state.id }, effects: [] }

  return unchanged(state)
}

function progress(state: Extract<State, { status: "running" }>, status: Progress["status"], message?: string) {
  if (message !== undefined)
    return { id: state.id, step: state.step, status, message } satisfies Progress

  return { id: state.id, step: state.step, status } satisfies Progress
}

function unchanged(state: State): Transition {
  return { state, effects: [] }
}
