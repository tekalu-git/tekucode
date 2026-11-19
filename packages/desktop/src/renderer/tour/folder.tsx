import { useLanguage } from "@opencode/app/desktop"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { Show } from "solid-js"

/**
 * The last setup decision: keep the folder bootstrap made, pick another, or skip.
 * `directory` is missing on an install that had no default project yet; then choosing is the only offer.
 */
export function TourFolder(props: {
  directory?: string
  busy: boolean
  onKeep: () => void
  onChoose: () => void
  onSkip: () => void
}) {
  const language = useLanguage()

  const name = () => {
    const directory = props.directory

    if (!directory) return ""
    const parts = directory.split(/[\\/]/).filter(Boolean)

    return parts.at(-1) ?? directory
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup
          title={language.t("desktop.onboarding.folder.title")}
          description={language.t("desktop.onboarding.folder.body")}
        />
      </DialogHeader>
      <DialogBody class="tour-dialog-body">
        <Show
          when={props.directory}
          fallback={<p data-slot="tour-folder-empty">{language.t("desktop.onboarding.folder.empty")}</p>}
        >
          {(directory) => (
            <div data-slot="tour-folder-field">
              <div data-slot="tour-folder-display">
                <Icon name="folder" size="small" aria-hidden="true" />
                <p data-slot="tour-folder-path" title={directory()} dir="ltr">
                  {directory()}
                </p>
              </div>
              <Button variant="outline" icon="folder" disabled={props.busy} onClick={props.onChoose}>
                {language.t("desktop.onboarding.folder.browse")}
              </Button>
            </div>
          )}
        </Show>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" disabled={props.busy} onClick={props.onSkip}>
          {language.t("desktop.onboarding.folder.skip")}
        </Button>
        {props.directory ? (
          <Button variant="contrast" autofocus disabled={props.busy} onClick={props.onKeep}>
            {language.t("desktop.onboarding.folder.keep", { name: name() })}
          </Button>
        ) : (
          <Button variant="contrast" autofocus disabled={props.busy} onClick={props.onChoose}>
            {language.t("desktop.onboarding.folder.choose")}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  )
}
