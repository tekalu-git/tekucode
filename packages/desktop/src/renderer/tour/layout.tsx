import { InterfaceModeOptions, useLanguage, useSettings } from "@opencode/app/desktop"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"

/** The setup question after the welcome: which of the three interface layouts to start with. */
export function TourLayout(props: { onNext: () => void; onBack: () => void }) {
  const language = useLanguage()
  const settings = useSettings()

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup
          title={language.t("desktop.onboarding.layout.title")}
          description={language.t("desktop.onboarding.layout.body")}
        />
      </DialogHeader>
      <DialogBody class="tour-dialog-body">
        <InterfaceModeOptions
          value={settings.appearance.tabLayout()}
          onChange={(layout) => settings.appearance.setTabLayout(layout)}
        />
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={props.onBack}>
          {language.t("desktop.onboarding.tour.back")}
        </Button>
        <Button variant="contrast" autofocus onClick={props.onNext}>
          {language.t("desktop.onboarding.layout.continue")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
