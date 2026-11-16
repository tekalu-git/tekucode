import { Effect } from "effect"
import { scoped } from "../native/logging"
import { ONBOARDING_TOUR_COMPLETE_KEY } from "../storage/keys"
import { getStore } from "../storage/store"

// The welcome tour runs after the app reveals, so its flag is independent of first-launch bootstrap:
// bootstrap finishing says nothing about whether the user has seen the tour.
export const isOnboardingTourPending = Effect.fn("OnboardingTour.isPending")(function* () {
  const pending = getStore().get(ONBOARDING_TOUR_COMPLETE_KEY) !== true

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
