import { createMemo, Show } from "solid-js"
import { useData } from "../../context/data"
import { useTheme } from "../../context/theme"
import { formatTokens } from "../../util/cockpit"
import { contextUsage } from "../../util/session"

const WIDTH = 10

export function CockpitContextMeter(props: { sessionID: string }) {
  const theme = useTheme()
  const data = useData()
  const session = createMemo(() => data.session.get(props.sessionID))
  const usage = createMemo(() =>
    contextUsage(
      data.session.message.list(props.sessionID),
      data.location.model.list(session()?.location),
      session()?.revert?.messageID,
    ),
  )
  const percent = createMemo(() => Math.max(0, Math.min(100, usage()?.percent ?? 0)))
  const filled = createMemo(() => Math.round((percent() / 100) * WIDTH))
  const color = createMemo(() =>
    percent() >= 85 ? theme.text.feedback.warning.base : theme.text.feedback.success.base,
  )

  return (
    <Show when={usage()}>
      {(value) => (
        <box flexShrink={0} gap={0}>
          <text fg={theme.text.muted} wrapMode="none">
            context
          </text>
          <box flexDirection="row" gap={1}>
            <text fg={color()} wrapMode="none">
              {"█".repeat(filled()) + "░".repeat(WIDTH - filled())}
            </text>
            <text fg={theme.text.muted} wrapMode="none">
              {value().percent ?? 0}% · {formatTokens(value().tokens)}
            </text>
          </box>
        </box>
      )}
    </Show>
  )
}
