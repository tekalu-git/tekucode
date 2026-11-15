import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform, type MaintenanceProgress, type MaintenanceStatus } from "@/runtime/platform/platform"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { FreeLimitState, freeLimitActive } from "@/session/composer/free-limit"
import { DialogMaintenance } from "./dialog"
import { countryLabel, stepLabelKey } from "./labels"
import "./maintenance.css"

/**
 * A slim strip at the window's bottom edge: the tunnel that is up, its exit IP, and the way into the
 * clean-slate dialog. It stays visible over the session, so a wipe is one click away from anywhere.
 */
export function MaintenanceBar() {
  const platform = usePlatform()
  const language = useLanguage()
  const dialog = useDialog()
  const maintenance = platform.maintenance

  if (!maintenance) return null

  const [status, setStatus] = createSignal<MaintenanceStatus>()
  const [progress, setProgress] = createSignal<MaintenanceProgress>()
  const [freeLimit] = persisted(Persist.global("free-limit"), FreeLimitState, { resetAt: null })
  const [now, setNow] = createSignal(Date.now())
  let reset: ReturnType<typeof setTimeout> | undefined

  const refresh = () => {
    setNow(Date.now())
    void maintenance.status().then(setStatus, () => undefined)
  }

  onMount(() => {
    refresh()

    const interval = setInterval(refresh, 30_000)

    const stop = maintenance.onProgress((event) => {
      setProgress(event)
      clearTimeout(reset)

      if (event.status === "done" || event.status === "failed" || event.status === "skipped") {
        reset = setTimeout(() => {
          setProgress(undefined)
          refresh()
        }, 4_000)
      }
    })

    onCleanup(() => {
      clearInterval(interval)
      clearTimeout(reset)
      stop()
    })
  })

  const open = () => void dialog.show(() => <DialogMaintenance initial={status()} />)
  const running = () => progress()?.status === "running"
  const connected = () => status()?.vpn.connected === true

  const country = () => {
    const code = status()?.vpn.country

    return code ? countryLabel(code, language, status()?.configs) : ""
  }

  const ip = () => status()?.vpn.ip
  const limited = () => freeLimitActive(freeLimit.resetAt, now())

  const limitLabel = () => {
    const at = freeLimit.resetAt

    if (at === null) return language.t("maintenance.bar.limit")
    const sameDay = new Date(at).toDateString() === new Date().toDateString()

    const time = new Intl.DateTimeFormat(
      language.locale(),
      sameDay ? { timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" },
    ).format(at)

    return language.t("maintenance.bar.limitReset", { time })
  }

  return (
    <button type="button" data-component="maintenance-bar" data-running={running() ? "" : undefined} onClick={open}>
      <span data-slot="maintenance-bar-tunnel">
        <span
          data-slot="maintenance-bar-dot"
          data-connected={connected() && !limited() ? "" : undefined}
          data-limited={limited() ? "" : undefined}
        />
        <Icon name="globe" width={12} height={12} />
        <Show
          when={status()}
          fallback={<span data-slot="maintenance-bar-label">{language.t("maintenance.bar.checking")}</span>}
        >
          <span data-slot="maintenance-bar-label">
            {connected()
              ? language.t("maintenance.bar.vpn", { country: country() })
              : language.t("maintenance.bar.direct")}
          </span>
          <Show when={ip()}>{(address) => <code data-slot="maintenance-bar-ip">{address()}</code>}</Show>
        </Show>
      </span>

      <Show when={limited()}>
        <span data-slot="maintenance-bar-limit" role="status">
          {limitLabel()}
        </span>
      </Show>

      <span data-slot="maintenance-bar-grow" />

      <Show when={running()}>
        <span data-slot="maintenance-bar-progress" role="status">
          <Loader width={11} height={11} />
          <span>{language.t(stepLabelKey(progress()?.step ?? ""))}</span>
        </span>
      </Show>

      <span data-slot="maintenance-bar-action">
        <Icon name="outline-reset" width={12} height={12} />
        <span>{language.t("maintenance.bar.action")}</span>
      </span>

      <Show when={running()}>
        <span data-slot="maintenance-bar-track" aria-hidden="true">
          <span />
        </span>
      </Show>
    </button>
  )
}
