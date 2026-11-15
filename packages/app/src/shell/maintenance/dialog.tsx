import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { Select } from "@opencode/ui/select"
import { Switch } from "@opencode/ui/switch"
import { TextInput } from "@opencode/ui/text-input"
import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform, type MaintenanceConfig, type MaintenanceStatus } from "@/runtime/platform/platform"
import { countryLabel, stepLabelKey } from "./labels"
import {
  canSubmit,
  failureKey,
  initialState,
  isRunning,
  maintenanceSteps,
  transition,
  type Event,
  type Form,
  type State,
} from "./machine"
import "./maintenance.css"

export function DialogMaintenance(props: { initial?: MaintenanceStatus }) {
  const dialog = useDialog()
  const platform = usePlatform()
  const language = useLanguage()
  const maintenance = platform.maintenance

  if (!maintenance) return null

  const [state, setState] = createSignal<State>(initialState(props.initial))
  const [configs, setConfigs] = createSignal<readonly MaintenanceConfig[]>(props.initial?.configs ?? [])
  const form = () => state().form

  const dispatch = (event: Event) => setState((current) => transition(current, event))
  const patch = (value: Partial<Form>) => dispatch({ type: "form.patched", patch: value })

  onMount(() => {
    const stop = maintenance.onProgress((progress) => dispatch({ type: "progress", progress }))

    // The bar polls, but the dialog owns the current selection; refresh once so a config added since
    // the last poll is available and a stale selection falls back to the first discovered tunnel.
    void maintenance.status().then(
      (status) => {
        setConfigs(status.configs)

        if (!status.configs.some((config) => config.id === form().country) && status.configs[0])
          patch({ country: status.configs[0].id })
      },
      () => undefined,
    )

    onCleanup(stop)
  })

  const submit = () => {
    if (!canSubmit(state())) return

    const current = form()
    const request: Parameters<typeof maintenance.wipe>[0] = { rotate: current.rotate }

    if (current.rotate) request.country = current.country

    if (current.password) request.password = current.password

    dispatch({ type: "run.started" })

    void maintenance
      .wipe(request)
      .then(
        (result) =>
          dispatch(
            result.ok
              ? { type: "run.succeeded", ip: result.ip }
              : {
                  type: "run.failed",
                  reason: result.reason,
                  message: result.message ?? "",
                  wiped: result.wiped,
                },
          ),
        (error: Error) =>
          dispatch({ type: "run.failed", reason: undefined, message: error.message, wiped: false }),
      )
  }

  const running = () => isRunning(state())

  const steps = () => {
    const current = state()

    return current.status === "running" || current.status === "failed" ? current.steps : {}
  }

  const failed = () => {
    const current = state()

    return current.status === "failed" ? current : undefined
  }

  const done = () => {
    const current = state()

    return current.status === "done" ? current : undefined
  }

  return (
    <Dialog fit preventBackdropDismiss={running()}>
      <DialogHeader hideClose={running()}>
        <DialogTitleGroup
          title={language.t("maintenance.dialog.title")}
          description={language.t("maintenance.dialog.description")}
        />
      </DialogHeader>

      <DialogBody>
        <div data-component="maintenance-dialog">
          <Show when={!running() && !done()}>
            <div data-slot="maintenance-warning">{language.t("maintenance.dialog.warning")}</div>

            <div data-slot="maintenance-field">
              <div data-slot="maintenance-field-label" data-split>
                <span>{language.t("maintenance.dialog.rotate")}</span>
                <Switch checked={form().rotate} onChange={(rotate) => patch({ rotate })} />
              </div>
              <span data-slot="maintenance-field-description">
                {language.t("maintenance.dialog.rotate.description")}
              </span>
            </div>

            <Show when={form().rotate}>
              <div data-slot="maintenance-field">
                <span data-slot="maintenance-field-label">{language.t("maintenance.dialog.country")}</span>
                <Select
                  options={configs().map((config) => config.id)}
                  current={form().country}
                  value={(country) => country}
                  label={(country) => countryLabel(country, language, configs())}
                  onSelect={(country) => country && patch({ country })}
                  appearance="base"
                  placement="bottom-start"
                />
                <Show when={configs().length === 0}>
                  <span data-slot="maintenance-field-description">{language.t("maintenance.dialog.noConfigs")}</span>
                </Show>
              </div>

              <div data-slot="maintenance-field">
                <span data-slot="maintenance-field-label">
                  <Icon name="lock" width={12} height={12} />
                  {language.t("maintenance.dialog.password")}
                </span>
                <TextInput
                  type="password"
                  value={form().password}
                  appearance="base"
                  placeholder={language.t("maintenance.dialog.password.placeholder")}
                  invalid={failed()?.reason === "invalid-password"}
                  onInput={(event) => patch({ password: event.currentTarget.value })}
                  autocomplete="current-password"
                />
                <span data-slot="maintenance-field-description">
                  {language.t("maintenance.dialog.password.description")}
                </span>
              </div>
            </Show>
          </Show>

          <Show when={running() || done() || failed()}>
            <ol data-slot="maintenance-steps">
              <For each={maintenanceSteps}>
                {(step) => {
                  const entry = () => steps()[step]

                  return (
                    <li
                      data-slot="maintenance-step"
                      data-status={entry()?.status ?? (done() ? "done" : "pending")}
                    >
                      <span data-slot="maintenance-step-marker">
                        <Show when={entry()?.status === "running"} fallback={<Icon name="check-small" />}>
                          <Loader width={11} height={11} />
                        </Show>
                      </span>
                      <span data-slot="maintenance-step-label">{language.t(stepLabelKey(step))}</span>
                      <Show when={entry()?.message}>
                        {(message) => <span data-slot="maintenance-step-message">{message()}</span>}
                      </Show>
                    </li>
                  )
                }}
              </For>
            </ol>
          </Show>

          <Show when={done()}>
            {(outcome) => (
              <div data-slot="maintenance-outcome" data-tone="success" role="status">
                <Loader width={12} height={12} />
                <span>
                  {outcome().ip
                    ? language.t("maintenance.dialog.doneIp", { ip: outcome().ip! })
                    : language.t("maintenance.dialog.done")}
                </span>
              </div>
            )}
          </Show>

          <Show when={failed()}>
            {(failure) => (
              <div data-slot="maintenance-outcome" data-tone="danger" role="alert">
                <Icon name="circle-exclamation" width={12} height={12} />
                <span>
                  {failure().wiped
                    ? language.t("maintenance.dialog.failedWiped")
                    : language.t(failureKey(failure().reason))}
                </span>
                <Show when={failure().message}>
                  <code data-slot="maintenance-outcome-detail">{failure().message}</code>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </DialogBody>

      <DialogFooter>
        <Button variant="ghost" disabled={running()} onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button
          size="normal"
          variant="danger"
          disabled={running() || done() !== undefined}
          onClick={submit}
        >
          {state().status === "failed" ? language.t("maintenance.dialog.retry") : language.t("maintenance.dialog.start")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
