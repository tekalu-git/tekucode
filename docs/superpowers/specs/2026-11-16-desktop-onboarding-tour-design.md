# TekuCode — Desktop Onboarding and Grass Default Theme (design)

Date: 2026-11-16
Status: approved design, pending implementation plan
Repo: `/home/tekalu/Documents/Projects/TekuCode/opencode`

## 1. Context

TekuCode's desktop app (Electron + shared Solid UI in `packages/app`) today has a **silent** first
launch: `packages/desktop/src/main/lifecycle/onboarding.ts` decides whether the install is fresh,
creates `~/Documents/<default project>`, and `packages/desktop/src/renderer/onboarding/` opens a draft
tab before the app reveals. Nothing is shown. The new-session screen also carries a small
`workspace-onboarding` hint above the workspace selector.

The desktop default theme is `oc-2` (`DEFAULT_THEME_ID` in `packages/ui/src/theme/machine.ts`), which is
blue/neutral. The product's locked visual identity is the TUI **grass** theme (`#5fd068` accent,
`DEFAULT_THEME = "grass"` in `packages/tui/src/theme/index.ts`, palette in
`packages/tui/src/theme/assets/grass.json`).

This design adds a real first-run experience (welcome + spotlight tour + optional project folder step)
and makes grass the desktop default.

## 2. Goals

- Show a welcome screen on a fresh install, with a skip path for users who already know OpenCode.
- Teach the real UI in place with a 5-step spotlight tour.
- Let the user choose where their work lives, after the tour, skippable.
- Make grass the default desktop theme, including on installs that never picked a theme.
- Use existing components, tokens, state-machine and i18n conventions. No new dependency, no new visual
  language.

Non-goals: provider/auth setup inside onboarding, a web-only tour, tour analytics, translations for the
new keys beyond English (other locales fall back to English), changes to session/core/server behavior.

## 3. Flow

```
silent bootstrap (existing)
  → default project created + draft tab opened
  → app revealed, draft visible
welcome dialog (new)
  [Start tour]                     → spotlight tour
  [I've already used OpenCode]     → folder step
spotlight tour (new, 5 steps)      → Next / Back / Skip tour
folder step (new)                  → Keep default / Choose folder / Skip
composer focused
```

- Every stage is skippable. Skipping never blocks the app; the user always lands in the draft.
- `I've already used OpenCode` skips the tour only. The folder step still runs because it is the one
  remaining setup decision.
- The welcome/tour runs **after** startup reveals the app, so the splash never waits on a click. The
  existing onboarding machine keeps owning the reveal gate and is not modified.

## 4. Welcome dialog

Existing `Dialog` composition (`DialogHeader`, `DialogTitleGroup`, `DialogBody`, `DialogFooter`) with
the wordmark already used on the new-session screen.

- Title: "Welcome to TekuCode"
- Body: one sentence naming the free model and that no API key is needed.
- Footer: primary `Start tour`, ghost `I've already used OpenCode`.
- `Esc`, backdrop click and the close control all behave as skip.
- Focus lands on the primary action; `aria-modal` and focus trap come from `Dialog`.

## 5. Spotlight tour

| Step | Anchor (`data-tour`) | Copy |
|---|---|---|
| 1 | `composer` | "Type your task here. Enter sends." |
| 2 | `model-picker` | "A free model is included. Switch any time." |
| 3 | `agent-picker` | "Build edits files, Plan only reads." |
| 4 | `project-selector` | "Each project is a folder on your machine." |
| 5 | `session-tabs` | "Each conversation is its own tab." |

Mechanics:

- Existing elements gain `data-tour` attributes; `TourOverlay` resolves the current target with
  `document.querySelector`.
- Dim the window and cut a rounded hole around the target's bounding rect; outline it with the theme's
  accent/border-strong token. Recompute on resize, scroll and route change.
- Step card sits next to the target with the Popover surface/elevation/radius tokens; when the target is
  missing (collapsed sidebar, narrow window, element unmounted) it renders centered instead of failing.
- Controls: `Back`, `Next` (last step: `Done`), `Skip tour`, step dots, `Step n of 5` for assistive tech.
- Keyboard: `→`/`Enter` next, `←` back, `Esc` skip. Focus stays inside the card; reduced motion removes
  the hole transition.
- On finish or skip: record completion, close, then start the folder step.

## 6. Folder step

Existing `Dialog` with the existing location/workspace picker in its large appearance.

- Question: "Where should your work live?"
- Actions: primary `Keep ~/Documents/<default project>`, secondary `Choose folder` (opens the existing
  folder picker), ghost `Skip`.
- `Choose folder` reuses the existing project-add path (`ctx.projects.add(directory)`), then opens a
  draft at the chosen directory and selects it, replacing the untouched onboarding draft tab. Failures
  show the standard error toast and leave the default-project draft in place.
- `Skip` keeps the auto-created default project.

## 7. State and persistence

- New renderer machine `packages/desktop/src/renderer/tour/machine.ts`, following the
  `onboarding/machine.ts` pattern: one union of states (`idle`, `welcome`, `step`, `folder`, `done`), a
  pure `transition`, selectors for the driver, effects executed in a thin driver component.
- The tour machine is separate from `onboarding/machine.ts` because it runs after reveal and must not
  gate the splash.
- Completion is stored in the **main settings store** (`packages/desktop/src/main/storage/keys.ts`,
  SQLite store) as `onboardingTourComplete`, next to `firstLaunchOnboardingComplete`.
- IPC, mirroring the existing first-launch pair:
  - `AppIsOnboardingTourPending` → `isOnboardingTourPending` in `main/lifecycle/onboarding-tour.ts`
  - `AppFinishOnboardingTour` → `finishOnboardingTour` (also marks the folder step settled)
  - Declared in `shared/ipc-rpc`, handled in `main/ipc-handlers/app.ts`, exposed in `preload`, typed in
    `renderer/api-types.ts`.
- Pending means: `firstLaunchOnboardingComplete` is true (bootstrap finished) **and**
  `onboardingTourComplete` is unset.
- Settings → General gets a `Show welcome tour` action that clears the flag and re-arms the tour on the
  next window mount.

## 8. Grass default theme

- New `packages/ui/src/theme/themes/grass.json` (schema `desktop-theme.schema.json`) with dark and light
  variants derived from the TUI palette:
  - ink `#08090a`, `#0c0e10`, `#101316`, `#16191d`; lines `#191d21`, `#24282d`
  - text `#cfd4d9`, muted `#7b848d`
  - primary/accent `#5fd068`, success `#46a851`, info `#7b848d`, warning `#c9a86b`, error `#c96b6b`
  - light "paper" surfaces `#e9ebe8`, `#e1e4e0`, `#d8dcd7`, `#cfd3ce`, `#c2c7c1`, text `#1b201c`,
    muted `#5c6560`
- `DEFAULT_THEME_ID = "grass"`; add the display name to the theme name map in
  `packages/ui/src/theme/context.tsx`; use grass as the pre-load fallback theme instead of `oc2Theme`.
- Migration for existing installs: the theme id lives in renderer storage under `opencode-theme-id`.
  Add a one-time key `opencode-theme-default-migrated`; when it is absent and the stored id is `oc-2`
  (the old default), rewrite it to `grass`. Explicit choices of any other theme stay untouched, and the
  flag prevents re-running.
- The change applies to every client of `packages/ui` (desktop and web), which is intended: grass is the
  product identity. Other visible surfaces keep their current tokens; only the default selection changes.

## 9. i18n

New keys in `packages/app/src/runtime/i18n/en.ts` under `desktop.onboarding.*`:
`welcome.title`, `welcome.body`, `welcome.start`, `welcome.skip`, `tour.step` (with `{{step}}`/`{{total}}`),
`tour.next`, `tour.back`, `tour.done`, `tour.skip`, `tour.composer.title`, `tour.model.title`,
`tour.agent.title`, `tour.project.title`, `tour.tabs.title`, `folder.title`, `folder.body`,
`folder.keep`, `folder.choose`, `folder.skip`, `settings.replay`.

Other locale files use `satisfies Partial<Record<Keys, string>>`, so they fall back to English. No locale
is edited in this change. Existing English copy is not modified.

## 10. Files

New:

- `packages/desktop/src/renderer/tour/machine.ts`, `machine.test.ts`
- `packages/desktop/src/renderer/tour/index.tsx` (driver), `overlay.tsx` (spotlight + card)
- `packages/desktop/src/renderer/tour/welcome.tsx`
- `packages/desktop/src/main/lifecycle/onboarding-tour.ts`
- `packages/ui/src/theme/themes/grass.json`

Touched:

- `packages/desktop/src/shared/ipc-rpc.ts`, `main/ipc-handlers/app.ts`, `main/storage/keys.ts`,
  `preload/*`, `renderer/api-types.ts`
- `packages/desktop/src/renderer/desktop-app.tsx` (mount after reveal)
- existing UI anchors in `packages/app` (composer, model picker, agent picker, project selector, tabs)
- `packages/ui/src/theme/machine.ts`, `context.tsx`, `machine.test.ts`
- `packages/app/src/runtime/i18n/en.ts`, Settings → General action
- `TEKUCODE.md` after implementation

## 11. Tests

- `tour/machine.test.ts`: welcome → tour → folder → done; skip from every stage; back; completion effect
  emitted once; missing-target fallback keeps the step index.
- `main/lifecycle/onboarding-tour` test: pending/complete transitions, replay reset, store persistence.
- `packages/ui/src/theme/machine.test.ts`: default is grass; stored `oc-2` migrates once; explicit other
  choice is preserved.
- Manual: container demo with fresh `HOME` (existing `/tmp/opencode/tk-electron` setup) for welcome →
  tour → folder → composer, plus a narrow-window pass for target fallback.

## 12. Risks and decisions

- Spotlight positioning against a live Solid layout can drift: mitigate with rect recomputation on
  resize/scroll and the centered fallback.
- Migrating `oc-2` to grass could surprise a user who genuinely chose the old default; accepted, because
  `oc-2` was the unconditional default and grass is the intended identity.
- Main-store persistence avoids dev/packaged origin differences that `Persist.global` would leak into.

## 13. Out of scope

Provider setup, account sign-in, model capability pickers, tour on web, translated copy for new keys,
any change to startup gating or the bundled CLI.
