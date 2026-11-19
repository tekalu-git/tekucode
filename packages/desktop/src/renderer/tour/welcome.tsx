import { useLanguage } from "@opencode/app/desktop"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Wordmark } from "@opencode/ui/wordmark"

/** The first-run greeting: start the tour, or skip it for someone who already knows OpenCode. */
export function TourWelcome(props: { onStart: () => void; onSkip: () => void }) {
  const language = useLanguage()

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup
          title={language.t("desktop.onboarding.welcome.title")}
          description={language.t("desktop.onboarding.welcome.body")}
        />
      </DialogHeader>
      <DialogBody class="tour-dialog-body">
        <div data-slot="tour-welcome">
          <Wordmark class="h-9 w-auto text-v2-text-text-base" muted={false} fade={false} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={props.onSkip}>
          {language.t("desktop.onboarding.welcome.skip")}
        </Button>
        <Button variant="contrast" autofocus onClick={props.onStart}>
          {language.t("desktop.onboarding.welcome.start")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
