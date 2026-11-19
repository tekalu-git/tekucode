import { useLanguage, useSettings } from "@opencode/app/desktop"
import { Button } from "@opencode/ui/button"
import { createEffect, createMemo, createSignal, For, type JSX, on, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import type { TourStep } from "./machine"
import "./tour.css"

const COPY = {
  composer: "desktop.onboarding.tour.composer.title",
  model: "desktop.onboarding.tour.model.title",
  agent: "desktop.onboarding.tour.agent.title",
  project: "desktop.onboarding.tour.project.title",
  tabs: "desktop.onboarding.tour.tabs.title",
} as const

const HOLE_PADDING = 6
const CARD_WIDTH = 320
const CARD_GAP = 12
const VIEWPORT_INSET = 16

type Rect = { top: number; left: number; width: number; height: number }
type Placement = "below" | "above" | "center"

/**
 * The spotlight over the live UI. The window dims around the current target, and a card beside it carries the copy and
 * controls. A target that is missing (collapsed rail, narrow window, another route) falls back to a centered card.
 */
export function TourOverlay(props: {
  step: TourStep
  index: number
  total: number
  /** Changes on navigation, so a moved layout is measured again. */
  revision: unknown
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}) {
  const language = useLanguage()
  const settings = useSettings()
  const [hole, setHole] = createSignal<Rect>()

  const [viewport, setViewport] = createSignal({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  })

  const [cardHeight, setCardHeight] = createSignal(150)

  let card: HTMLDivElement | undefined
  let targetObserver: ResizeObserver | undefined
  let observed: HTMLElement | undefined
  let scrolled = false

  // The inbox layout replaces the tab strip with the session inbox, so the last step follows the chosen layout.
  const inbox = () => settings.appearance.tabLayout() === "inbox"
  const anchor = () => (props.step === "tabs" && inbox() ? "inbox" : props.step)
  const copy = (step: TourStep) =>
    step === "tabs" && inbox() ? "desktop.onboarding.tour.inbox.title" : COPY[step]

  const measure = () => {
    const width = window.innerWidth
    const height = window.innerHeight
    setViewport({ width, height })

    const target = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${anchor()}"]`)).find((element) => {
      const rect = element.getBoundingClientRect()

      return rect.width > 0 && rect.height > 0
    })

    if (!target) {
      setHole(undefined)
      targetObserver?.disconnect()
      targetObserver = undefined
      observed = undefined

      return
    }

    if (target !== observed) {
      targetObserver?.disconnect()
      targetObserver = new ResizeObserver(scheduleMeasure)
      targetObserver.observe(target)
      observed = target
    }

    const rect = target.getBoundingClientRect()

    if (!scrolled && (rect.top < 0 || rect.bottom > height)) {
      scrolled = true
      target.scrollIntoView({ block: "nearest", inline: "nearest" })
      requestAnimationFrame(measure)

      return
    }

    setHole({
      top: rect.top - HOLE_PADDING,
      left: rect.left - HOLE_PADDING,
      width: rect.width + HOLE_PADDING * 2,
      height: rect.height + HOLE_PADDING * 2,
    })
  }

  let frame: number | undefined

  const scheduleMeasure = () => {
    if (frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      measure()
    })
  }

  const holeStyle = (): JSX.CSSProperties => {
    const rect = hole()

    if (!rect) return { display: "none" }

    return {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    }
  }

  // Below the target when it fits, above it when only that fits, and centered when neither does. The placement is part
  // of the data model so the card's copy can enter from the side it moved in from.
  const layout = createMemo(() => {
    const rect = hole()
    const { width: viewportWidth, height: viewportHeight } = viewport()
    const width = Math.min(CARD_WIDTH, viewportWidth - VIEWPORT_INSET * 2)
    const height = cardHeight()
    const centered = Math.max(VIEWPORT_INSET, (viewportHeight - height) / 2)

    if (!rect) {
      return {
        placement: "center" as Placement,
        style: {
          width: `${width}px`,
          left: `${Math.max(VIEWPORT_INSET, (viewportWidth - width) / 2)}px`,
          top: `${centered}px`,
        } satisfies JSX.CSSProperties,
      }
    }

    const below = viewportHeight - rect.top - rect.height - CARD_GAP
    const above = rect.top - CARD_GAP
    const placement: Placement = below >= height ? "below" : above >= height ? "above" : "center"

    const top =
      placement === "below"
        ? rect.top + rect.height + CARD_GAP
        : placement === "above"
          ? rect.top - height - CARD_GAP
          : centered

    const left = Math.min(
      Math.max(VIEWPORT_INSET, rect.left + rect.width / 2 - width / 2),
      viewportWidth - width - VIEWPORT_INSET,
    )

    return {
      placement,
      style: {
        width: `${width}px`,
        left: `${Math.max(VIEWPORT_INSET, left)}px`,
        top: `${Math.max(VIEWPORT_INSET, top)}px`,
      } satisfies JSX.CSSProperties,
    }
  })

  const focusCard = () => card?.focus({ preventScroll: true })

  const focusables = () =>
    Array.from(
      card?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? [],
    )

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      props.onSkip()

      return
    }

    if (event.key === "ArrowRight") {
      event.preventDefault()
      event.stopPropagation()
      props.onNext()

      return
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault()
      event.stopPropagation()
      props.onBack()

      return
    }

    // Enter activates a focused button itself; on the card, it advances.
    if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault()
      event.stopPropagation()
      props.onNext()

      return
    }

    if (event.key !== "Tab") return
    const items = focusables()

    if (items.length === 0) {
      event.preventDefault()
      focusCard()

      return
    }

    const first = items[0]
    const last = items.at(-1)
    const active = document.activeElement

    if (event.shiftKey && (active === first || active === card)) {
      event.preventDefault()
      last?.focus()

      return
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  createEffect(
    on(
      () => props.step,
      () => {
        scrolled = false
        scheduleMeasure()
        queueMicrotask(focusCard)
      },
    ),
  )

  createEffect(on(() => props.revision, scheduleMeasure))

  onMount(() => {
    scheduleMeasure()

    const observer = new ResizeObserver(() => {
      if (card) setCardHeight(card.getBoundingClientRect().height)
    })

    if (card) observer.observe(card)

    window.addEventListener("resize", scheduleMeasure)
    document.addEventListener("scroll", scheduleMeasure, { capture: true, passive: true })

    onCleanup(() => {
      observer.disconnect()
      targetObserver?.disconnect()
      window.removeEventListener("resize", scheduleMeasure)
      document.removeEventListener("scroll", scheduleMeasure, { capture: true })

      if (frame !== undefined) cancelAnimationFrame(frame)
    })
  })

  return (
    <Portal>
      <div
        data-component="onboarding-tour"
        data-step={props.step}
        role="dialog"
        aria-modal="true"
        aria-label={language.t(copy(props.step))}
        onKeyDown={onKeyDown}
        // A press on the dimmed window must not move focus out of the card, or the keys stop reaching the tour.
        onMouseDown={(event) => {
          if (event.target instanceof Node && card?.contains(event.target)) return

          event.preventDefault()
          focusCard()
        }}
      >
        <Show when={hole()} fallback={<div data-slot="tour-scrim" />}>
          <div data-slot="tour-hole" style={holeStyle()} />
        </Show>
        <div
          ref={(element) => (card = element)}
          data-slot="tour-card"
          data-placement={layout().placement}
          tabindex="-1"
          style={layout().style}
        >
          <div data-slot="tour-dots" aria-hidden="true">
            <For each={Array.from({ length: props.total })}>
              {(_, index) => <span data-active={index() === props.index ? "" : undefined} />}
            </For>
          </div>
          <Show when={props.step} keyed>
            {(step) => (
              <div data-slot="tour-content">
                <p data-slot="tour-copy">{language.t(copy(step))}</p>
              </div>
            )}
          </Show>
          <span class="sr-only">
            {language.t("desktop.onboarding.tour.step", { step: props.index + 1, total: props.total })}
          </span>
          <div data-slot="tour-actions">
            <Button variant="ghost" size="small" onClick={props.onSkip}>
              {language.t("desktop.onboarding.tour.skip")}
            </Button>
            <div data-slot="tour-nav">
              <Button variant="ghost" size="small" disabled={props.index === 0} onClick={props.onBack}>
                {language.t("desktop.onboarding.tour.back")}
              </Button>
              <Button variant="contrast" size="small" onClick={props.onNext}>
                {props.index === props.total - 1
                  ? language.t("desktop.onboarding.tour.done")
                  : language.t("desktop.onboarding.tour.next")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}
