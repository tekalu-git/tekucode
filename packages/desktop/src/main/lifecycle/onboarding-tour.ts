import { Effect } from "effect"
import { scoped } from "../native/logging"
import { FIRST_LAUNCH_ONBOARDING_COMPLETE_KEY, ONBOARDING_TOUR_COMPLETE_KEY } from "../storage/keys"
import { getStore } from "../storage/store"

// The tour's own flag is independent of the first-launch flag, so a replay can re-arm it without touching
// bootstrap. It still waits for bootstrap, because a fresh install must create its default project and draft
// before the tour can point at them.
export const isOnboardingTourPending = Effect.fn("OnboardingTour.isPending")(function* () {
  const store = getStore()

  const pending =
    store.get(FIRST_LAUNCH_ONBOARDING_COMPLETE_KEY) === true && store.get(ONBOARDING_TOUR_COMPLETE_KEY) !== true

  yield* scoped("onboarding", Effect.logInfo("onboarding tour pending checked", { pending }))

  return pending
})

export const finishOnboardingTour = Effect.fn("OnboardingTour.finish")(function* () {
  getStore().set(ONBOARDING_TOUR_COMPLETE_KEY, true)

  yield* scoped("onboarding", Effect.logInfo("onboarding tour completed"))
})

export const resetOnboardingTour = Effect.fn("OnboardingTour.reset")(function* () {
  getStore().delete(ONBOARDING_TOUR_COMPLETE_KEY)

  yield* scoped("onboarding", Effect.logInfo("onboarding tour reset"))
})
