import { createMemo, For, Show } from "solid-js"
import { useData } from "../../context/data"
import { useRoute } from "../../context/route"
import { useTheme } from "../../context/theme"
import { Locale } from "../../util/locale"

const MAX_VISIBLE = 5

export function CockpitAgents(props: { sessionID?: string; width: number }) {
  const theme = useTheme()
  const data = useData()
  const route = useRoute()

  const agents = createMemo(() => {
    const sessionID = props.sessionID
    if (!sessionID) return []
    return data.session
      .family(sessionID)
      .filter((id) => id !== sessionID)
      .map((id) => ({
        id,
        title: Locale.truncate(data.session.get(id)?.title ?? "Agent", Math.max(8, props.width - 6)),
        running: data.session.status(id) === "running",
      }))
  })
  const visible = createMemo(() => agents().slice(0, MAX_VISIBLE))
  const hidden = createMemo(() => Math.max(0, agents().length - visible().length))

  return (
    <Show when={visible().length > 0}>
      <box flexShrink={0} flexDirection="column" paddingTop={1} paddingLeft={2} paddingRight={1} gap={0}>
        <text fg={theme.text.muted} wrapMode="none">
          AGENTS
        </text>
        <For each={visible()}>
          {(agent) => (
            <box flexDirection="row" gap={1} onMouseUp={() => route.navigate({ type: "session", sessionID: agent.id })}>
              <text fg={agent.running ? theme.text.feedback.success.base : theme.text.faint} wrapMode="none">
                {agent.running ? "●" : "○"}
              </text>
              <text fg={agent.running ? theme.text.base : theme.text.muted} wrapMode="none">
                {agent.title}
              </text>
            </box>
          )}
        </For>
        <Show when={hidden() > 0}>
          <text fg={theme.text.faint} wrapMode="none">
            +{hidden()} more
          </text>
        </Show>
      </box>
    </Show>
  )
}
