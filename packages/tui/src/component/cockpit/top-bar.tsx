import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, Show } from "solid-js"
import { useData } from "../../context/data"
import { useLocal } from "../../context/local"
import { useLocation } from "../../context/location"
import { useRoute } from "../../context/route"
import { useTheme } from "../../context/theme"
import { Locale } from "../../util/locale"
import { projectName } from "../../util/project"

export function CockpitTopBar() {
  const theme = useTheme()
  const data = useData()
  const local = useLocal()
  const location = useLocation()
  const route = useRoute()
  const dimensions = useTerminalDimensions()

  const session = createMemo(() => (route.data.type === "session" ? data.session.get(route.data.sessionID) : undefined))
  const project = createMemo(() => {
    const project = data.location.info(session()?.location ?? location.ref)?.project
    return projectName(project, location.current?.directory) ?? "TekuCode"
  })
  const branch = createMemo(() => data.location.vcs.info(session()?.location ?? location.ref)?.branch.current)
  const model = createMemo(() => local.model.parsed().model)
  const title = createMemo(() => Locale.truncate(session()?.title ?? "", 40))

  return (
    <Show when={dimensions().width >= 60}>
      <box
        height={1}
        flexShrink={0}
        flexDirection="row"
        gap={2}
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={theme.background.raised.base}
      >
        <text fg={theme.text.base} wrapMode="none">
          <b>{project()}</b>
        </text>
        <Show when={title()}>
          <text fg={theme.text.muted} wrapMode="none">
            {title()}
          </text>
        </Show>
        <box flexGrow={1} minWidth={0} />
        <text fg={theme.text.muted} wrapMode="none">
          {model()}
        </text>
        <Show when={branch()}>
          <text fg={theme.text.muted} wrapMode="none">
            {branch()}
          </text>
        </Show>
        <text fg={theme.text.faint} wrapMode="none">
          ctrl+p
        </text>
      </box>
    </Show>
  )
}
