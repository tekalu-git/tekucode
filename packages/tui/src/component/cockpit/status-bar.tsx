import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { useData } from "../../context/data"
import { useLocation } from "../../context/location"
import { useRoute } from "../../context/route"
import { useTheme } from "../../context/theme"
import { formatElapsed, formatTokens } from "../../util/cockpit"
import { contextUsage } from "../../util/session"

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export function CockpitStatusBar() {
  const theme = useTheme()
  const data = useData()
  const location = useLocation()
  const route = useRoute()
  const dimensions = useTerminalDimensions()
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(timer))

  const sessionID = createMemo(() => (route.data.type === "session" ? route.data.sessionID : undefined))
  const session = createMemo(() => {
    const id = sessionID()
    return id ? data.session.get(id) : undefined
  })
  const usage = createMemo(() => {
    const id = sessionID()
    if (!id) return
    return contextUsage(
      data.session.message.list(id),
      data.location.model.list(session()?.location),
      session()?.revert?.messageID,
    )
  })
  const cost = createMemo(() => {
    const id = sessionID()
    return id ? data.session.cost(id) : 0
  })
  const elapsed = createMemo(() => {
    const created = session()?.time.created
    if (!created) return
    return formatElapsed(now() - created)
  })
  const branch = createMemo(() => data.location.vcs.info(session()?.location ?? location.ref)?.branch.current)
  const status = createMemo(() => {
    const id = sessionID()
    if (!id) return "idle"
    return data.session.status(id)
  })

  return (
    <Show when={dimensions().width >= 48}>
      <box
        height={1}
        flexShrink={0}
        flexDirection="row"
        gap={2}
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={theme.background.raised.base}
      >
        <text fg={status() === "running" ? theme.text.feedback.success.base : theme.text.muted} wrapMode="none">
          {status() === "running" ? "● running" : "○ idle"}
        </text>
        <Show when={branch()}>
          <text fg={theme.text.muted} wrapMode="none">
            {branch()}
          </text>
        </Show>
        <box flexGrow={1} minWidth={0} />
        <Show when={usage()}>
          {(value) => (
            <text fg={theme.text.muted} wrapMode="none">
              {formatTokens(value().tokens)} tokens
            </text>
          )}
        </Show>
        <Show when={cost() > 0}>
          <text fg={theme.text.muted} wrapMode="none">
            {money.format(cost())}
          </text>
        </Show>
        <Show when={elapsed()}>
          <text fg={theme.text.muted} wrapMode="none">
            {elapsed()}
          </text>
        </Show>
        <text fg={theme.text.faint} wrapMode="none">
          ? help
        </text>
      </box>
    </Show>
  )
}
