import { For, Match, Switch, createUniqueId } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import type { TabLayout } from "@/settings/model"
import "./interface-mode.css"

const modes = [
  { id: "top", layout: "horizontal" },
  { id: "side", layout: "vertical" },
  { id: "inbox", layout: "inbox" },
] as const satisfies { id: string; layout: TabLayout }[]

/**
 * The three interface layouts as preview cards. Shared by Settings → General and the onboarding tour so
 * a first-run choice and a later change look and behave the same.
 */
export function InterfaceModeOptions(props: {
  value: TabLayout
  onChange: (layout: TabLayout) => void
  /** Settings search scrolls to this target; the onboarding copy stays out of that index. */
  action?: string
}) {
  const language = useLanguage()
  const id = createUniqueId()

  return (
    <fieldset data-component="interface-mode" data-action={props.action}>
      <legend class="sr-only">{language.t("settings.general.row.interfaceMode.title")}</legend>
      <For each={modes}>
        {(mode) => (
          <label data-slot="interface-mode-option" data-checked={props.value === mode.layout ? "" : undefined}>
            <input
              type="radio"
              name={id}
              value={mode.id}
              checked={props.value === mode.layout}
              onChange={() => props.onChange(mode.layout)}
            />
            <span data-slot="interface-mode-sketch" data-mode={mode.id} aria-hidden="true">
              <Switch>
                <Match when={mode.id === "top"}>
                  <span data-slot="preview-strip">
                    <For each={[0, 1, 2]}>
                      {(index) => <span data-slot="preview-tab" data-active={index === 0 ? "" : undefined} />}
                    </For>
                  </span>
                </Match>
                <Match when={mode.id === "side"}>
                  <span data-slot="preview-rail">
                    <For each={[0, 1, 2, 3]}>
                      {(index) => <span data-slot="preview-tab" data-active={index === 0 ? "" : undefined} />}
                    </For>
                  </span>
                </Match>
                <Match when={mode.id === "inbox"}>
                  <span data-slot="preview-rail">
                    <For each={inboxRows}>
                      {(status, index) => (
                        <span data-slot="preview-tab" data-active={index() === 0 ? "" : undefined}>
                          <i data-status={status} />
                        </span>
                      )}
                    </For>
                  </span>
                </Match>
              </Switch>
              <span data-slot="preview-page">
                <span data-slot="preview-line" />
                <span data-slot="preview-line" />
                <span data-slot="preview-composer" />
              </span>
            </span>
            <span data-slot="interface-mode-name">{language.t(`settings.general.row.interfaceMode.${mode.id}`)}</span>
          </label>
        )}
      </For>
    </fieldset>
  )
}

// Mirrors the inbox: a session that needs you, then finished work, then sessions still running.
const inboxRows = ["approval", "done", "working", "working"] as const
