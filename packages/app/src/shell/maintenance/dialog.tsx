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
import {
  usePlatform,
  type MaintenanceBackupResult,
  type MaintenanceRestoreResult,
  type MaintenanceStatus,
} from "@/runtime/platform/platform"
import { countryLabel, stepLabelKey } from "./labels"
import {
  canSubmit,
  failureKey,
  importFailureKey,
  initialState,
  isRunning,
  maintenanceSteps,
  transition,
  type Event,
  type Form,
  type ImportFailureReason,
  type State,
} from "./machine"
import "./maintenance.css"

const WIREGUARD_DOWNLOAD = "https://www.wireguard.com/install/"

export function DialogMaintenance(props: { initial?: MaintenanceStatus }) {
  const dialog = useDialog()
  const platform = usePlatform()
  const language = useLanguage()
  const maintenance = platform.maintenance

  if (!maintenance) return null

  const [state, setState] = createSignal<State>(initialState(props.initial))
  const [status, setStatus] = createSignal<MaintenanceStatus | undefined>(props.initial)
  const [importing, setImporting] = createSignal(false)
  const [importFailure, setImportFailure] = createSignal<{ reason: ImportFailureReason; message?: string }>()
  const [imported, setImported] = createSignal<{ file: string; replaced: boolean }>()
  const [saving, setSaving] = createSignal(false)
  const [saved, setSaved] = createSignal<MaintenanceBackupResult>()
  const [restoring, setRestoring] = createSignal(false)
  const [restored, setRestored] = createSignal<MaintenanceRestoreResult>()
  const form = () => state().form
  const configs = () => status()?.configs ?? []
  const backups = () => status()?.backups ?? []

  const dispatch = (event: Event) => setState((current) => transition(current, event))
  const patch = (value: Partial<Form>) => dispatch({ type: "form.patched", patch: value })

  const refreshStatus = () => {
    void maintenance.status().then(
      (next) => {
        setStatus(next)

        if (!next.configs.some((config) => config.id === form().country) && next.configs[0])
          patch({ country: next.configs[0].id })
      },
      () => undefined,
    )
  }

  onMount(() => {
    const stop = maintenance.onProgress((progress) => dispatch({ type: "progress", progress }))

    // The bar polls, but the dialog owns the current selection; refresh once so a config added since
    // the last poll is available and a stale selection falls back to the first discovered tunnel.
    refreshStatus()

    onCleanup(stop)
  })

  const submit = () => {
    if (!canSubmit(state()) || blocked()) return

    const current = form()
    const request: Parameters<typeof maintenance.wipe>[0] = { rotate: current.rotate, backup: current.backup }

    if (current.rotate) request.country = current.country

    if (current.password) request.password = current.password

    dispatch({ type: "run.started" })

    void maintenance.wipe(request).then(
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
      (error: Error) => dispatch({ type: "run.failed", reason: undefined, message: error.message, wiped: false }),
    )
  }

  const saveConversations = () => {
    if (saving() || restoring() || running()) return

    setSaving(true)
    setSaved(undefined)

    void maintenance.backup().then(
      (result) => {
        setSaving(false)
        setSaved(result)
        refreshStatus()
      },
      (error: Error) => {
        setSaving(false)
        setSaved({ ok: false, reason: "failed", message: error.message })
      },
    )
  }

  const restoreConversations = () => {
    if (saving() || restoring() || running()) return

    setRestoring(true)
    setRestored(undefined)

    void maintenance.restore().then(
      (result) => {
        setRestoring(false)
        setRestored(result)
        refreshStatus()
      },
      (error: Error) => {
        setRestoring(false)
        setRestored({ ok: false, reason: "failed", message: error.message })
      },
    )
  }

  const openBackupFolder = () => {
    const path = backups()[0]?.path

    if (path) void platform.openPath?.(path)
  }

  const backupTime = (time: number) =>
    new Intl.DateTimeFormat(language.locale(), { dateStyle: "medium", timeStyle: "short" }).format(time)

  const running = () => isRunning(state())

  // Setup state comes from main: which OS the shell runs on, whether WireGuard is installed, and the
  // folder the tunnel configs are read from. Until it arrives the dialog stays optimistic.
  const supported = () => status()?.supported !== false
  const os = () => status()?.platform
  const windows = () => os() === "win32"
  const linux = () => os() === "linux"
  const wireguard = () => status()?.wireguard
  const missingWireguard = () => supported() && wireguard()?.installed === false
  const configDir = () => wireguard()?.configDir ?? ""
  const needsConfig = () => form().rotate && configs().length === 0
  const blocked = () => !supported() || (form().rotate && (missingWireguard() || needsConfig()))

  const wireguardHint = () =>
    windows() ? language.t("maintenance.dialog.wireguard.windows") : language.t("maintenance.dialog.wireguard.linux")

  const openWireguardDownload = () => void platform.openExternal(WIREGUARD_DOWNLOAD)

  const openConfigDir = () => {
    const directory = configDir()

    if (directory) void platform.openPath?.(directory)
  }

  const applyConfig = (input: { path?: string; name?: string; content?: string }) => {
    setImporting(true)
    setImportFailure(undefined)
    setImported(undefined)

    void maintenance.importConfig(input).then(
      (result) => {
        setImporting(false)

        if (!result.ok || !result.config) {
          setImportFailure({ reason: result.reason, message: result.message })

          return
        }

        const config = result.config

        setImported({ file: config.file, replaced: result.replaced === true })

        // The dialog owns the selection, so the new config becomes the exit immediately.
        void maintenance.status().then((next) => {
          setStatus(next)
          patch({ country: config.id })
        }, () => undefined)
      },
      (error: Error) => {
        setImporting(false)
        setImportFailure({ reason: "failed", message: error.message })
      },
    )
  }

  const chooseConfig = async () => {
    const paths = await platform.openFilePathPickerDialog?.({
      title: language.t("maintenance.dialog.import.pickTitle"),
      extensions: ["conf"],
    })

    const path = paths?.[0]

    if (path) applyConfig({ path })
  }

  const dropConfig = (event: DragEvent) => {
    event.preventDefault()

    const file = event.dataTransfer?.files?.[0]

    if (!file) return

    const path = platform.getPathForFile?.(file)

    if (path) {
      applyConfig({ path })

      return
    }

    void file.text().then((content) => applyConfig({ name: file.name, content }), () => undefined)
  }

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

  const failureMessage = (reason: Parameters<typeof failureKey>[0]) =>
    reason === "elevation-required" && windows()
      ? language.t("maintenance.dialog.elevation.windowsDenied")
      : language.t(failureKey(reason))

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

            <Show when={!supported()}>
              <div data-slot="maintenance-setup" data-tone="danger" role="alert">
                <span data-slot="maintenance-setup-title">{language.t("maintenance.dialog.unsupported.title")}</span>
                <span data-slot="maintenance-setup-text">{language.t("maintenance.dialog.unsupported")}</span>
              </div>
            </Show>

            <Show when={supported()}>
              <div data-slot="maintenance-field">
                <div data-slot="maintenance-field-label" data-split>
                  <span>{language.t("maintenance.dialog.backup.toggle")}</span>
                  <Switch checked={form().backup} onChange={(backup) => patch({ backup })} />
                </div>
                <span data-slot="maintenance-field-description">
                  {language.t("maintenance.dialog.backup.description")}
                </span>
                <div data-slot="maintenance-actions">
                  <Button
                    variant="outline"
                    size="small"
                    disabled={saving() || restoring() || running()}
                    onClick={saveConversations}
                  >
                    {saving()
                      ? language.t("maintenance.dialog.backup.saving")
                      : language.t("maintenance.dialog.backup.save")}
                  </Button>
                  <Show when={backups().length > 0}>
                    <Button
                      variant="ghost"
                      size="small"
                      disabled={saving() || restoring() || running()}
                      onClick={openBackupFolder}
                    >
                      {language.t("maintenance.dialog.backup.open")}
                    </Button>
                  </Show>
                </div>
                <Show when={saving()}>
                  <span data-slot="maintenance-import-status">
                    <Loader width={11} height={11} />
                    {language.t("maintenance.dialog.backup.saving")}
                  </span>
                </Show>
                <Show when={saved()}>
                  {(result) => {
                    if (!result().ok)
                      return (
                        <div data-slot="maintenance-setup" data-tone="danger" role="alert">
                          <span data-slot="maintenance-setup-text">
                            {language.t("maintenance.dialog.backup.failed")}
                          </span>
                          <Show when={result().message}>
                            {(message) => <code data-slot="maintenance-outcome-detail">{message()}</code>}
                          </Show>
                        </div>
                      )

                    const count = result().count ?? 0

                    if (count === 0)
                      return (
                        <span data-slot="maintenance-import-status" role="status">
                          {language.t("maintenance.dialog.backup.empty")}
                        </span>
                      )

                    return (
                      <div data-slot="maintenance-result">
                        <span data-slot="maintenance-import-status" data-tone="success" role="status">
                          <Icon name="check-small" width={12} height={12} />
                          {(result().failed ?? 0) > 0
                            ? language.plural("maintenance.dialog.backup.partial", count, {
                                failed: String(result().failed),
                              })
                            : language.plural("maintenance.dialog.backup.saved", count)}
                        </span>
                        <Show when={result().path}>
                          {(path) => <code data-slot="maintenance-outcome-detail">{path()}</code>}
                        </Show>
                      </div>
                    )
                  }}
                </Show>
              </div>

              <Show when={backups().length > 0}>
                <div data-slot="maintenance-field">
                  <span data-slot="maintenance-field-label">{language.t("maintenance.dialog.restore")}</span>
                  <span data-slot="maintenance-field-description">
                    {language.t("maintenance.dialog.restore.description")}
                  </span>
                  <Show when={backups()[0]}>
                    {(backup) => (
                      <span data-slot="maintenance-field-description">
                        {language.plural("maintenance.dialog.restore.last", backup().count, {
                          time: backupTime(backup().time),
                        })}
                      </span>
                    )}
                  </Show>
                  <div data-slot="maintenance-actions">
                    <Button
                      variant="outline"
                      size="small"
                      disabled={saving() || restoring() || running()}
                      onClick={restoreConversations}
                    >
                      {restoring()
                        ? language.t("maintenance.dialog.restore.restoring")
                        : language.t("maintenance.dialog.restore.action")}
                    </Button>
                  </div>
                  <Show when={restored()}>
                    {(result) => {
                      if (!result().ok)
                        return (
                          <div data-slot="maintenance-setup" data-tone="danger" role="alert">
                            <span data-slot="maintenance-setup-text">
                              {result().reason === "missing"
                                ? language.t("maintenance.dialog.restore.none")
                                : language.t("maintenance.dialog.restore.failed")}
                            </span>
                            <Show when={result().message}>
                              {(message) => <code data-slot="maintenance-outcome-detail">{message()}</code>}
                            </Show>
                          </div>
                        )

                      const imported = result().imported ?? 0
                      const skipped = result().skipped ?? 0
                      const failed = result().failed ?? 0

                      if (imported === 0 && skipped > 0 && failed === 0)
                        return (
                          <span data-slot="maintenance-import-status" role="status">
                            {language.plural("maintenance.dialog.restore.already", skipped)}
                          </span>
                        )

                      return (
                        <span
                          data-slot="maintenance-import-status"
                          data-tone={failed > 0 ? undefined : "success"}
                          role="status"
                        >
                          <Icon name={failed > 0 ? "circle-exclamation" : "check-small"} width={12} height={12} />
                          {failed > 0
                            ? language.plural("maintenance.dialog.restore.partial", imported, {
                                failed: String(failed),
                              })
                            : language.plural("maintenance.dialog.restore.done", imported)}
                        </span>
                      )
                    }}
                  </Show>
                </div>
              </Show>

              <div data-slot="maintenance-field">
                <div data-slot="maintenance-field-label" data-split>
                  <span>{language.t("maintenance.dialog.rotate")}</span>
                  <Switch checked={form().rotate} onChange={(rotate) => patch({ rotate })} />
                </div>
                <span data-slot="maintenance-field-description">
                  {language.t("maintenance.dialog.rotate.description")}
                </span>
              </div>
            </Show>

            <Show when={form().rotate && supported()}>
              <Show when={missingWireguard()}>
                <div data-slot="maintenance-setup" data-tone="warning" role="status">
                  <span data-slot="maintenance-setup-title">{language.t("maintenance.dialog.wireguard.title")}</span>
                  <span data-slot="maintenance-setup-text">{wireguardHint()}</span>
                  <Show when={windows()}>
                    <Button variant="outline" size="small" onClick={openWireguardDownload}>
                      {language.t("maintenance.dialog.wireguard.install")}
                    </Button>
                  </Show>
                </div>
              </Show>

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

              <div
                data-slot="maintenance-import"
                onDragOver={(event) => event.preventDefault()}
                onDrop={dropConfig}
              >
                <div data-slot="maintenance-field-label" data-split>
                  <span>{language.t("maintenance.dialog.import")}</span>
                  <Button variant="outline" size="small" disabled={importing()} onClick={() => void chooseConfig()}>
                    {language.t("maintenance.dialog.import.pick")}
                  </Button>
                </div>
                <span data-slot="maintenance-field-description">
                  {language.t("maintenance.dialog.import.description")}
                </span>
                <Show when={importing()}>
                  <span data-slot="maintenance-import-status">
                    <Loader width={11} height={11} />
                    {language.t("maintenance.dialog.import.adding")}
                  </span>
                </Show>
                <Show when={importFailure()}>
                  {(failure) => (
                    <div data-slot="maintenance-setup" data-tone="danger" role="alert">
                      <span data-slot="maintenance-setup-text">
                        {language.t(importFailureKey(failure().reason))}
                      </span>
                      <Show when={failure().message}>
                        {(message) => <code data-slot="maintenance-outcome-detail">{message()}</code>}
                      </Show>
                    </div>
                  )}
                </Show>
                <Show when={imported()}>
                  {(added) => (
                    <span data-slot="maintenance-import-status" data-tone="success" role="status">
                      <Icon name="check-small" width={12} height={12} />
                      {language.t(
                        added().replaced
                          ? "maintenance.dialog.import.replaced"
                          : "maintenance.dialog.import.added",
                        { file: added().file },
                      )}
                    </span>
                  )}
                </Show>
              </div>

              <div data-slot="maintenance-field">
                <span data-slot="maintenance-field-label">{language.t("maintenance.dialog.configDir")}</span>
                <div data-slot="maintenance-path">
                  <code>{configDir()}</code>
                  <Button variant="ghost" size="small" disabled={!configDir()} onClick={openConfigDir}>
                    {language.t("maintenance.dialog.openConfigDir")}
                  </Button>
                </div>
                <span data-slot="maintenance-field-description">
                  {language.t("maintenance.dialog.configDir.description")}
                </span>
              </div>

              <Show when={linux()}>
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

              <Show when={windows()}>
                <span data-slot="maintenance-field-description">
                  {language.t("maintenance.dialog.elevation.windows")}
                </span>
              </Show>
            </Show>
          </Show>

          <Show when={running() || done() || failed()}>
            <ol data-slot="maintenance-steps">
              <For each={maintenanceSteps}>
                {(step) => {
                  const entry = () => steps()[step]

                  return (
                    <li data-slot="maintenance-step" data-status={entry()?.status ?? (done() ? "done" : "pending")}>
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
                  {failure().wiped ? language.t("maintenance.dialog.failedWiped") : failureMessage(failure().reason)}
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
          disabled={running() || done() !== undefined || blocked() || saving() || restoring()}
          onClick={submit}
        >
          {state().status === "failed"
            ? language.t("maintenance.dialog.retry")
            : language.t("maintenance.dialog.start")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
