import { ServerConnection, useCurrentRoute, useGlobal, useLanguage, useTabs } from "@opencode/app/desktop"
import { useDialog } from "@opencode/ui/context/dialog"
import { showToast } from "@opencode/ui/toast"
import { createEffect, createSignal, on, Show, untrack } from "solid-js"
import type { ElectronAPI } from "../api-types"
import { TourFolder } from "./folder"
import { TourLayout } from "./layout"
import {
  createTourState,
  selectTourProgress,
  selectTourStep,
  TOUR_STEPS,
  transitionTour,
  type TourEffect,
  type TourEvent,
  type TourState,
} from "./machine"
import { TourOverlay } from "./overlay"
import { TourWelcome } from "./welcome"

/**
 * The first-run welcome, spotlight tour and folder question. Runs after startup reveals the app and after the
 * silent bootstrap finished, so it never gates the splash and never races the auto-created default project.
 */
export function DesktopOnboardingTour(props: { api: ElectronAPI; ready: boolean }) {
  const dialog = useDialog()
  const language = useLanguage()
  const tabs = useTabs()
  const global = useGlobal()
  const route = useCurrentRoute()
  const sidecar = ServerConnection.Key.make("sidecar")

  const [state, setState] = createSignal(createTourState(false))
  // The draft the folder step offers to keep. Resolved when the folder stage starts, so a replayed tour can still find
  // a draft, and a first run finds the one bootstrap opened.
  const [draftID, setDraftID] = createSignal<string>()
  const [choosing, setChoosing] = createSignal(false)

  let asked = false
  let shown: { id: string; status: TourState["status"] } | undefined

  const draft = () => {
    const id = draftID()

    if (!id) return
    const tab = tabs.store.find((item) => item.type === "draft" && item.draftID === id)

    return tab?.type === "draft" ? tab : undefined
  }

  const firstDraftID = () =>
    untrack(() => {
      const tab = tabs.store.find((item) => item.type === "draft")

      return tab?.type === "draft" ? tab.draftID : undefined
    })

  const dispatch = (event: TourEvent) => {
    const next = transitionTour(untrack(state), event)
    setState(next.state)
    next.effects.forEach(run)
  }

  const run = (effect: TourEffect) => {
    switch (effect.type) {
      case "persist-complete":
        return props.api.finishOnboardingTour()
    }
  }

  // Picking a folder reuses the project-add path bootstrap uses, then moves the untouched onboarding draft there.
  const chooseFolder = async () => {
    if (untrack(choosing)) return

    setChoosing(true)

    try {
      const picked = await props.api.openDirectoryPicker({ title: language.t("desktop.dialog.chooseFolder") })
      const directory = Array.isArray(picked) ? picked[0] : picked

      if (!directory) return

      const ctx = global.serverCtx(sidecar)

      if (ctx) {
        await Promise.all([
          ctx.projects.add(directory),
          ctx.data.location.provider.sync({ directory }),
          ctx.data.location.model.sync({ directory }),
        ])
      }

      const current = untrack(draft)

      if (current) {
        tabs.updateDraft(current.draftID, { directory, worktree: undefined, branch: undefined })
      } else {
        const tab = await tabs.newDraft({ server: sidecar, directory })
        setDraftID(tab.draftID)
        tabs.select(tab)
      }

      dispatch({ type: "folder.settled" })
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
        duration: 10_000,
      })
    } finally {
      setChoosing(false)
    }
  }

  createEffect(
    on(
      () => props.ready,
      (ready) => {
        if (!ready || asked) return

        asked = true
        void props.api.isOnboardingTourPending().then(
          (pending) => dispatch({ type: "pending.settled", pending }),
          (error) => console.error("[desktop-onboarding-tour] pending check failed", error),
        )
      },
    ),
  )

  // One dialog per stage: welcome, then the layout question, then the folder. The tour's steps live in the overlay instead.
  createEffect(
    on(
      () => state().status,
      (status) => {
        if (shown) {
          dialog.close(shown.id)
          shown = undefined
        }

        if (status === "welcome") {
          const id = "onboarding-tour-welcome"

          shown = { id, status }
          dialog.show(
            () => <TourWelcome onStart={() => dispatch({ type: "start" })} onSkip={() => dispatch({ type: "skip" })} />,
            () => {
              if (untrack(state).status === "welcome") dispatch({ type: "skip" })
            },
            id,
          )

          return
        }

        if (status === "layout") {
          const id = "onboarding-tour-layout"

          shown = { id, status }
          dialog.show(
            () => <TourLayout onNext={() => dispatch({ type: "next" })} onBack={() => dispatch({ type: "back" })} />,
            () => {
              if (untrack(state).status === "layout") dispatch({ type: "skip" })
            },
            id,
          )

          return
        }

        if (status !== "folder") return

        setDraftID(firstDraftID())
        const id = "onboarding-tour-folder"

        shown = { id, status }
        dialog.show(
          () => (
            <TourFolder
              directory={draft()?.directory}
              busy={choosing()}
              onKeep={() => dispatch({ type: "folder.settled" })}
              onChoose={() => void chooseFolder()}
              onSkip={() => dispatch({ type: "folder.settled" })}
            />
          ),
          () => {
            if (untrack(state).status === "folder") dispatch({ type: "folder.settled" })
          },
          id,
        )
      },
    ),
  )

  return (
    <Show when={selectTourStep(state())}>
      {(step) => (
        <TourOverlay
          step={step()}
          index={(selectTourProgress(state())?.index ?? 1) - 1}
          total={TOUR_STEPS.length}
          revision={route()}
          onNext={() => dispatch({ type: "next" })}
          onBack={() => dispatch({ type: "back" })}
          onSkip={() => dispatch({ type: "skip" })}
        />
      )}
    </Show>
  )
}
