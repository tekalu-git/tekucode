import type { MaintenanceProgress, MaintenanceResult, MaintenanceStatus } from "@/runtime/platform/platform"

export type MaintenanceFailure = NonNullable<MaintenanceResult["reason"]>

export const maintenanceSteps = ["vpn", "stop", "snapshot", "wipe", "restore", "start"] as const

export type MaintenanceStep = (typeof maintenanceSteps)[number]

export type StepState = {
  readonly status: "running" | "done" | "skipped" | "failed"
  readonly message?: string
}

export type Form = {
  readonly rotate: boolean
  readonly country: string
  readonly password: string
}

export type State =
  | { readonly status: "idle"; readonly form: Form }
  | {
      readonly status: "running"
      readonly form: Form
      readonly step: MaintenanceStep
      readonly steps: Readonly<Partial<Record<MaintenanceStep, StepState>>>
    }
  | {
      readonly status: "failed"
      readonly form: Form
      readonly reason: MaintenanceFailure | undefined
      readonly message: string
      readonly wiped: boolean
      readonly steps: Readonly<Partial<Record<MaintenanceStep, StepState>>>
    }
  | { readonly status: "done"; readonly form: Form; readonly ip?: string }

export type Event =
  | { readonly type: "form.patched"; readonly patch: Partial<Form> }
  | { readonly type: "run.started" }
  | { readonly type: "progress"; readonly progress: MaintenanceProgress }
  | {
      readonly type: "run.failed"
      readonly reason: MaintenanceFailure | undefined
      readonly message: string
      readonly wiped: boolean
    }
  | { readonly type: "run.succeeded"; readonly ip?: string }

export function initialState(status?: MaintenanceStatus): State {
  const country = status?.vpn.country ?? status?.configs[0]?.id ?? "nl"

  return { status: "idle", form: { rotate: true, country, password: "" } }
}

export function transition(state: State, event: Event): State {
  if (event.type === "form.patched") {
    if (state.status !== "idle" && state.status !== "failed") return state

    return { ...state, form: { ...state.form, ...event.patch } }
  }

  if (event.type === "run.started") {
    if (state.status === "running" || state.status === "done") return state

    return { status: "running", form: state.form, step: "vpn", steps: {} }
  }

  if (state.status !== "running") return state

  if (event.type === "progress") {
    const step = asStep(event.progress.step)

    if (!step) return state

    return {
      ...state,
      step: event.progress.status === "running" ? step : state.step,
      steps: {
        ...state.steps,
        [step]: event.progress.message
          ? { status: event.progress.status, message: event.progress.message }
          : { status: event.progress.status },
      },
    }
  }

  if (event.type === "run.failed")
    return {
      status: "failed",
      form: state.form,
      reason: event.reason,
      message: event.message,
      wiped: event.wiped,
      steps: state.steps,
    }

  if (event.type === "run.succeeded")
    return event.ip
      ? { status: "done", form: state.form, ip: event.ip }
      : { status: "done", form: state.form }

  return state
}

export function asStep(value: string): MaintenanceStep | undefined {
  return maintenanceSteps.find((step) => step === value)
}

export function canSubmit(state: State) {
  return state.status === "idle" || state.status === "failed"
}

export function isRunning(state: State) {
  return state.status === "running"
}

/** The failure copy key for a reason main reported, with the raw message as the fallback detail. */
export function failureKey(reason: MaintenanceFailure | undefined) {
  if (reason === "invalid-password") return "maintenance.dialog.password.invalid" as const

  if (reason === "elevation-required") return "maintenance.dialog.elevation" as const

  if (reason === "busy") return "maintenance.dialog.busy" as const

  if (reason === "unsupported") return "maintenance.dialog.unsupported" as const

  if (reason === "missing-config") return "maintenance.dialog.missingConfig" as const

  return "maintenance.dialog.failed" as const
}
