import type { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { CockpitAgents } from "../../../component/cockpit/agents"
import { CockpitStatusBar } from "../../../component/cockpit/status-bar"
import { CockpitTopBar } from "../../../component/cockpit/top-bar"
import { useRoute } from "../../../context/route"
import { StoryFooter } from "./footer"
import type { Story } from "./index"

function CockpitStory(props: { context: Plugin.Context }) {
  const route = useRoute()
  const [railWidth, setRailWidth] = createSignal(28)
  const sessionID = () => (route.data.type === "session" ? route.data.sessionID : undefined)

  props.context.keymap.layer(() => ({
    commands: [
      {
        bind: "tab",
        title: "Toggle story rail width",
        group: "Storybook",
        run: () => setRailWidth((value) => (value === 28 ? 12 : 28)),
      },
      {
        bind: "escape",
        title: "Back to storybook",
        group: "Storybook",
        run: () => props.context.ui.router.navigate({ type: "plugin", name: "storybook" }),
      },
    ],
  }))

  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={props.context.theme.background.base}>
      <CockpitTopBar />
      <box flexGrow={1} minHeight={0} flexDirection="row">
        <box width={railWidth()} backgroundColor={props.context.theme.background.raised.base}>
          <CockpitAgents sessionID={sessionID()} width={railWidth()} />
        </box>
        <box flexGrow={1} minWidth={0} padding={1}>
          <text fg={props.context.theme.text.muted}>Cockpit bars · tab toggles rail width · escape returns</text>
        </box>
      </box>
      <CockpitStatusBar />
      <StoryFooter
        context={props.context}
        title="Cockpit bars"
        details={[`rail ${railWidth()}`]}
        controls={[
          { shortcut: "tab", label: "rail width" },
          { shortcut: "escape", label: "back" },
        ]}
      />
    </box>
  )
}

export const cockpitStory: Story = {
  id: "cockpit",
  title: "Cockpit bars",
  render: (context) => <CockpitStory context={context} />,
}
