# TekuCode Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the TekuCode fork's TUI into the approved Cockpit layout with a grass-green terminal theme, without changing server, core, web, desktop, or SDK behavior.

**Architecture:** All changes live in `packages/tui`. The theme is one new v1 JSON asset plus a `DEFAULT_THEME` constant. The Cockpit reuses what upstream already has: `SessionFrame`'s right pane becomes the always-docked context rail, vertical session tabs become the left rail plus an agents section, and two new one-row bars (`CockpitTopBar`, `CockpitStatusBar`) are mounted in `app.tsx`. Every new visual unit lives under `src/component/cockpit/` so the diff stays reviewable.

**Tech Stack:** Bun 1.4.4, TypeScript, SolidJS, `@opentui/core` + `@opentui/solid`, `bun:test`.

## Global Constraints

- Repo: `/home/tekalu/Documents/Projects/TekuCode/opencode`, branch `tekucode-cockpit` (already created, clean tree).
- Only `packages/tui` and `docs/` may change. No server, core, web, desktop, SDK behavior changes.
- The single accent colour is grass `#5fd068`. Backgrounds are neutral, very dark grays; warnings use muted amber `#c9a86b`, deletions use muted red `#c96b6b`. No other saturated hues.
- Choose theme tokens by semantic role. Never read `theme.hue` directly in cockpit components, never repurpose an unrelated token.
- Keep the upstream keymap. Only additive bindings are allowed (`<leader>p` for the context rail).
- Never run `git reset --hard`, `git checkout -- .`, or clean untracked files.
- Repo has no configured git identity: commit with `git -c user.name="tekalu" -c user.email="tekalu@localhost" commit ...`.
- Test commands run from the package directory: `cd packages/tui && bun test test/<file>.test.ts`. Typecheck: `cd packages/tui && bun typecheck`.
- Commit messages: `type(scope): summary`, scope `tui`.

---

### Task 1: Grass theme and fork default

**Files:**
- Create: `packages/tui/src/theme/assets/grass.json`
- Modify: `packages/tui/src/theme/v1.ts` (imports + `DEFAULT_THEMES`)
- Modify: `packages/tui/src/theme/index.ts` (add `DEFAULT_THEME`)
- Modify: `packages/tui/src/context/theme.tsx` (default name, lines ~116, ~139, ~166, ~300-307)
- Modify: `packages/tui/src/mini/theme.ts` (line ~289)
- Test: `packages/tui/test/theme.test.ts`

**Interfaces:**
- Produces: `DEFAULT_THEME: "grass"` exported from `src/theme/index.ts`; theme name `"grass"` present in `allThemes()`.
- Consumes: existing `resolveTheme(theme, mode)`, `allThemes()`.

- [ ] **Step 1: Write the failing test**

Append to `packages/tui/test/theme.test.ts` (imports at the top of the file, tests at the end):

```ts
import { RGBA } from "@opentui/core"
import grass from "../src/theme/assets/grass.json" with { type: "json" }
import matrix from "../src/theme/assets/matrix.json" with { type: "json" }
import { DEFAULT_THEME } from "../src/theme"
```

```ts
test("registers the grass theme and makes it the fork default", () => {
  expect(allThemes().grass).toBe(grass)
  expect(DEFAULT_THEME).toBe("grass")
})

test("grass defines every theme token and uses green as the only accent", () => {
  const source = grass as ThemeV1Json
  for (const key of Object.keys(matrix.theme)) {
    expect(source.theme[key as keyof typeof source.theme]).toBeDefined()
  }
  const theme = resolveTheme(source, "dark")
  expect(theme.primary.equals(RGBA.fromHex("#5fd068"))).toBe(true)
  expect(theme.accent.equals(RGBA.fromHex("#5fd068"))).toBe(true)
  expect(theme.background.equals(RGBA.fromHex("#08090a"))).toBe(true)
  expect(theme.warning.equals(RGBA.fromHex("#c9a86b"))).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/tui && bun test test/theme.test.ts`
Expected: FAIL — cannot resolve `../src/theme/assets/grass.json` and `DEFAULT_THEME` is not exported.

- [ ] **Step 3: Create `packages/tui/src/theme/assets/grass.json`**

```json
{
  "$schema": "https://opencode.ai/theme.json",
  "defs": {
    "ink0": "#08090a",
    "ink1": "#0c0e10",
    "ink2": "#101316",
    "ink3": "#16191d",
    "line0": "#191d21",
    "line1": "#24282d",
    "text0": "#cfd4d9",
    "text1": "#7b848d",
    "grass": "#5fd068",
    "grassDim": "#46a851",
    "grassHi": "#7ee787",
    "amber": "#c9a86b",
    "red": "#c96b6b",
    "redHi": "#e08585",
    "addedBg": "#0f1a12",
    "removedBg": "#1b1212",
    "addedLineBg": "#0f1b11",
    "removedLineBg": "#1b1414",
    "paper": "#e9ebe8",
    "paperPanel": "#e1e4e0",
    "paperElement": "#d8dcd7",
    "paperMenu": "#cfd3ce",
    "paperLine": "#c2c7c1",
    "paperText": "#1b201c",
    "paperMuted": "#5c6560"
  },
  "theme": {
    "primary": { "dark": "grass", "light": "grassDim" },
    "secondary": { "dark": "text1", "light": "paperMuted" },
    "accent": { "dark": "grass", "light": "grassDim" },
    "error": { "dark": "red", "light": "red" },
    "warning": { "dark": "amber", "light": "amber" },
    "success": { "dark": "grassDim", "light": "grassDim" },
    "info": { "dark": "text1", "light": "paperMuted" },
    "text": { "dark": "text0", "light": "paperText" },
    "textMuted": { "dark": "text1", "light": "paperMuted" },
    "background": { "dark": "ink0", "light": "paper" },
    "backgroundPanel": { "dark": "ink1", "light": "paperPanel" },
    "backgroundElement": { "dark": "ink2", "light": "paperElement" },
    "backgroundMenu": { "dark": "ink3", "light": "paperMenu" },
    "border": { "dark": "line1", "light": "paperLine" },
    "borderActive": { "dark": "grass", "light": "grassDim" },
    "borderSubtle": { "dark": "line0", "light": "paperLine" },
    "diffAdded": { "dark": "grassDim", "light": "grassDim" },
    "diffRemoved": { "dark": "red", "light": "red" },
    "diffContext": { "dark": "text1", "light": "paperMuted" },
    "diffHunkHeader": { "dark": "text0", "light": "paperText" },
    "diffHighlightAdded": { "dark": "grassHi", "light": "grassDim" },
    "diffHighlightRemoved": { "dark": "redHi", "light": "red" },
    "diffAddedBg": { "dark": "addedBg", "light": "#dfeede" },
    "diffRemovedBg": { "dark": "removedBg", "light": "#f7e3e3" },
    "diffContextBg": { "dark": "ink1", "light": "paperPanel" },
    "diffLineNumber": { "dark": "text1", "light": "paperMuted" },
    "diffAddedLineNumberBg": { "dark": "addedLineBg", "light": "#d3e6d1" },
    "diffRemovedLineNumberBg": { "dark": "removedLineBg", "light": "#f0d0d0" },
    "markdownText": { "dark": "text0", "light": "paperText" },
    "markdownHeading": { "dark": "grass", "light": "grassDim" },
    "markdownLink": { "dark": "grassDim", "light": "grassDim" },
    "markdownLinkText": { "dark": "grassDim", "light": "grassDim" },
    "markdownCode": { "dark": "grassDim", "light": "grassDim" },
    "markdownBlockQuote": { "dark": "text1", "light": "paperMuted" },
    "markdownEmph": { "dark": "text0", "light": "paperText" },
    "markdownStrong": { "dark": "text0", "light": "paperText" },
    "markdownHorizontalRule": { "dark": "line1", "light": "paperLine" },
    "markdownListItem": { "dark": "text1", "light": "paperMuted" },
    "markdownListEnumeration": { "dark": "grassDim", "light": "grassDim" },
    "markdownImage": { "dark": "grassDim", "light": "grassDim" },
    "markdownImageText": { "dark": "grassDim", "light": "grassDim" },
    "markdownCodeBlock": { "dark": "text0", "light": "paperText" },
    "syntaxComment": { "dark": "text1", "light": "paperMuted" },
    "syntaxKeyword": { "dark": "grass", "light": "grassDim" },
    "syntaxFunction": { "dark": "grassHi", "light": "grassDim" },
    "syntaxVariable": { "dark": "text0", "light": "paperText" },
    "syntaxString": { "dark": "grassDim", "light": "grassDim" },
    "syntaxNumber": { "dark": "grassDim", "light": "grassDim" },
    "syntaxType": { "dark": "text0", "light": "paperText" },
    "syntaxOperator": { "dark": "text1", "light": "paperMuted" },
    "syntaxPunctuation": { "dark": "text1", "light": "paperMuted" },
    "selectedListItemText": { "dark": "ink0", "light": "paper" }
  }
}
```

- [ ] **Step 4: Register the theme and the default constant**

In `packages/tui/src/theme/v1.ts`, add the import next to the other `./assets/*.json` imports:

```ts
import grass from "./assets/grass.json" with { type: "json" }
```

and add `grass,` to the `DEFAULT_THEMES` object (e.g. after `gruvbox,`).

In `packages/tui/src/theme/index.ts`, above `export { DEFAULT_THEMES ... }`:

```ts
export const DEFAULT_THEME = "grass"
```

- [ ] **Step 5: Point the TUI defaults at `DEFAULT_THEME`**

In `packages/tui/src/context/theme.tsx`, import it (the file already imports from `../theme`):

```ts
import {
  allThemes,
  DEFAULT_THEME,
  getOpenCode2Theme,
  hasTheme,
  parseTheme,
  setCustomThemes,
  setSystemTheme,
  subscribeThemes,
  type ThemeDocumentSource,
} from "../theme"
```

Replace each default name:

```ts
const [store, setStore] = createStore<State>({
  mode: "dark",
  lock: undefined,
  active: DEFAULT_THEME,
  ready: false,
})
```

```ts
draft.active = config.theme?.name ?? DEFAULT_THEME
```

```ts
.catch(() => setStore("active", DEFAULT_THEME))
```

```ts
const name = sources[store.active] ? store.active : DEFAULT_THEME
```

Keep the existing native-theme guard and last-resort fallback unchanged (`if (name === "opencode") throw error`, then `setStore("active", "opencode")` + `loadTheme(sources.opencode, ...)`) — `"opencode"` remains the native v2 document and the final safety net.

In `packages/tui/src/mini/theme.ts`, import `DEFAULT_THEME` and change line ~289:

```ts
import { allThemes, DEFAULT_THEME, getOpenCodeTheme, isThemeSource, parseTheme, type ThemeDocumentSource } from "../theme"
```

```ts
const name = config?.name ?? DEFAULT_THEME
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd packages/tui && bun test test/theme.test.ts`
Expected: PASS.

Run: `cd packages/tui && bun typecheck`
Expected: no errors.

- [ ] **Step 7: Run the TUI and confirm the theme visually**

Run: `cd /home/tekalu/Documents/Projects/TekuCode/opencode && bun run dev:live`
Expected: dark neutral UI with grass-green accents (primary text actions, focused borders, success feedback). `Ctrl+C` exits.

- [ ] **Step 8: Commit**

```bash
cd /home/tekalu/Documents/Projects/TekuCode/opencode
git add packages/tui/src/theme/assets/grass.json packages/tui/src/theme/v1.ts packages/tui/src/theme/index.ts packages/tui/src/context/theme.tsx packages/tui/src/mini/theme.ts packages/tui/test/theme.test.ts
git -c user.name="tekalu" -c user.email="tekalu@localhost" commit -m "feat(tui): add grass theme and make it the default"
```

---

### Task 2: Cockpit layout primitives, top bar, status bar

**Files:**
- Modify: `packages/tui/src/ui/layout.ts`
- Create: `packages/tui/src/util/cockpit.ts`
- Create: `packages/tui/src/component/cockpit/top-bar.tsx`
- Create: `packages/tui/src/component/cockpit/status-bar.tsx`
- Modify: `packages/tui/src/app.tsx` (mount both bars, left-rail default width)
- Test: `packages/tui/test/cockpit-layout.test.ts`

**Interfaces:**
- Produces from `ui/layout.ts`: `COCKPIT_MIN_WIDTH = 110`, `COCKPIT_LEFT_RAIL_WIDTH = 28`, `COCKPIT_RIGHT_RAIL_WIDTH = 32`, `COCKPIT_RIGHT_RAIL_MIN_WIDTH = 24`, `COCKPIT_RIGHT_RAIL_MAX_WIDTH = 40`, `cockpitFits(total: number): boolean`, `clampCockpitRightRail(width: number, total: number): number`.
- Produces from `util/cockpit.ts`: `formatTokens(tokens: number): string`, `formatElapsed(ms: number): string`.
- Produces components: `CockpitTopBar()`, `CockpitStatusBar()` (both no props; read contexts).

- [ ] **Step 1: Write the failing tests**

Create `packages/tui/test/cockpit-layout.test.ts`:

```ts
import { expect, test } from "bun:test"
import {
  COCKPIT_MIN_WIDTH,
  COCKPIT_RIGHT_RAIL_MAX_WIDTH,
  COCKPIT_RIGHT_RAIL_MIN_WIDTH,
  COCKPIT_RIGHT_RAIL_WIDTH,
  clampCockpitRightRail,
  cockpitFits,
} from "../src/ui/layout"
import { formatElapsed, formatTokens } from "../src/util/cockpit"

test("cockpit switches on at 110 columns", () => {
  expect(cockpitFits(COCKPIT_MIN_WIDTH - 1)).toBe(false)
  expect(cockpitFits(COCKPIT_MIN_WIDTH)).toBe(true)
})

test("right rail width clamps to its range and keeps the transcript usable", () => {
  expect(clampCockpitRightRail(10, 160)).toBe(COCKPIT_RIGHT_RAIL_MIN_WIDTH)
  expect(clampCockpitRightRail(99, 160)).toBe(COCKPIT_RIGHT_RAIL_MAX_WIDTH)
  expect(clampCockpitRightRail(COCKPIT_RIGHT_RAIL_WIDTH, 160)).toBe(COCKPIT_RIGHT_RAIL_WIDTH)
  expect(clampCockpitRightRail(COCKPIT_RIGHT_RAIL_WIDTH, 60)).toBe(COCKPIT_RIGHT_RAIL_MIN_WIDTH)
})

test("formats token counts compactly", () => {
  expect(formatTokens(0)).toBe("0")
  expect(formatTokens(999)).toBe("999")
  expect(formatTokens(1500)).toBe("1.5k")
  expect(formatTokens(250_000)).toBe("250k")
  expect(formatTokens(1_200_000)).toBe("1.2m")
})

test("formats elapsed time as seconds, minutes, or hours", () => {
  expect(formatElapsed(0)).toBe("0s")
  expect(formatElapsed(9_400)).toBe("9s")
  expect(formatElapsed(65_000)).toBe("1m05s")
  expect(formatElapsed(3_725_000)).toBe("1h02m")
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/tui && bun test test/cockpit-layout.test.ts`
Expected: FAIL — `cockpitFits`, `clampCockpitRightRail`, `formatTokens`, `formatElapsed` are not exported.

- [ ] **Step 3: Add the layout primitives**

In `packages/tui/src/ui/layout.ts`, export the content minimum and append:

```ts
export const SESSION_CONTENT_MIN_WIDTH = 44

export const COCKPIT_MIN_WIDTH = 110
export const COCKPIT_LEFT_RAIL_WIDTH = 28
export const COCKPIT_RIGHT_RAIL_WIDTH = 32
export const COCKPIT_RIGHT_RAIL_MIN_WIDTH = 24
export const COCKPIT_RIGHT_RAIL_MAX_WIDTH = 40

export function cockpitFits(total: number) {
  return total >= COCKPIT_MIN_WIDTH
}

export function clampCockpitRightRail(width: number, total: number) {
  return Math.max(
    COCKPIT_RIGHT_RAIL_MIN_WIDTH,
    Math.min(width, COCKPIT_RIGHT_RAIL_MAX_WIDTH, total - SESSION_CONTENT_MIN_WIDTH),
  )
}
```

Replace the existing `const SESSION_CONTENT_MIN_WIDTH = 44` line with nothing (it is now exported above).

- [ ] **Step 4: Add the formatting helpers**

Create `packages/tui/src/util/cockpit.ts`:

```ts
export function formatTokens(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return String(tokens)
}

export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`
  if (minutes > 0) return `${minutes}m${String(seconds).padStart(2, "0")}s`
  return `${seconds}s`
}
```

- [ ] **Step 5: Run the unit tests**

Run: `cd packages/tui && bun test test/cockpit-layout.test.ts`
Expected: PASS.

- [ ] **Step 6: Create the top bar**

Create `packages/tui/src/component/cockpit/top-bar.tsx`:

```tsx
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, Show } from "solid-js"
import { useData } from "../../context/data"
import { useLocal } from "../../context/local"
import { useLocation } from "../../context/location"
import { useRoute } from "../../context/route"
import { useTheme } from "../../context/theme"
import { Locale } from "../../util/locale"
import { projectName } from "../../util/project"

export function CockpitTopBar() {
  const theme = useTheme()
  const data = useData()
  const local = useLocal()
  const location = useLocation()
  const route = useRoute()
  const dimensions = useTerminalDimensions()

  const session = createMemo(() => (route.data.type === "session" ? data.session.get(route.data.sessionID) : undefined))
  const project = createMemo(() => {
    const project = data.location.info(session()?.location ?? location.ref)?.project
    return projectName(project, location.current?.directory) ?? "TekuCode"
  })
  const branch = createMemo(() => data.location.vcs.info(session()?.location ?? location.ref)?.branch.current)
  const model = createMemo(() => local.model.parsed().model)
  const title = createMemo(() => Locale.truncate(session()?.title ?? "", 40))

  return (
    <Show when={dimensions().width >= 60}>
      <box
        height={1}
        flexShrink={0}
        flexDirection="row"
        gap={2}
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={theme.background.raised.base}
      >
        <text fg={theme.text.base} wrapMode="none">
          <b>{project()}</b>
        </text>
        <Show when={title()}>
          <text fg={theme.text.muted} wrapMode="none">
            {title()}
          </text>
        </Show>
        <box flexGrow={1} minWidth={0} />
        <text fg={theme.text.muted} wrapMode="none">
          {model()}
        </text>
        <Show when={branch()}>
          <text fg={theme.text.muted} wrapMode="none">
            {branch()}
          </text>
        </Show>
        <text fg={theme.text.faint} wrapMode="none">
          ctrl+p
        </text>
      </box>
    </Show>
  )
}
```

- [ ] **Step 7: Create the status bar**

Create `packages/tui/src/component/cockpit/status-bar.tsx`:

```tsx
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { useData } from "../../context/data"
import { useLocation } from "../../context/location"
import { useRoute } from "../../context/route"
import { useTheme } from "../../context/theme"
import { formatElapsed, formatTokens } from "../../util/cockpit"
import { contextUsage } from "../../util/session"

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export function CockpitStatusBar() {
  const theme = useTheme()
  const data = useData()
  const location = useLocation()
  const route = useRoute()
  const dimensions = useTerminalDimensions()
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(timer))

  const sessionID = createMemo(() => (route.data.type === "session" ? route.data.sessionID : undefined))
  const session = createMemo(() => {
    const id = sessionID()
    return id ? data.session.get(id) : undefined
  })
  const usage = createMemo(() => {
    const id = sessionID()
    if (!id) return
    return contextUsage(
      data.session.message.list(id),
      data.location.model.list(session()?.location),
      session()?.revert?.messageID,
    )
  })
  const cost = createMemo(() => {
    const id = sessionID()
    return id ? data.session.cost(id) : 0
  })
  const elapsed = createMemo(() => {
    const created = session()?.time.created
    if (!created) return
    return formatElapsed(now() - created)
  })
  const branch = createMemo(() => data.location.vcs.info(session()?.location ?? location.ref)?.branch.current)
  const status = createMemo(() => {
    const id = sessionID()
    if (!id) return "idle"
    return data.session.status(id)
  })

  return (
    <Show when={dimensions().width >= 48}>
      <box
        height={1}
        flexShrink={0}
        flexDirection="row"
        gap={2}
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={theme.background.raised.base}
      >
        <text fg={status() === "running" ? theme.text.feedback.success.base : theme.text.muted} wrapMode="none">
          {status() === "running" ? "● running" : "○ idle"}
        </text>
        <Show when={branch()}>
          <text fg={theme.text.muted} wrapMode="none">
            {branch()}
          </text>
        </Show>
        <box flexGrow={1} minWidth={0} />
        <Show when={usage()}>
          {(value) => (
            <text fg={theme.text.muted} wrapMode="none">
              {formatTokens(value().tokens)} tokens
            </text>
          )}
        </Show>
        <Show when={cost() > 0}>
          <text fg={theme.text.muted} wrapMode="none">
            {money.format(cost())}
          </text>
        </Show>
        <Show when={elapsed()}>
          <text fg={theme.text.muted} wrapMode="none">
            {elapsed()}
          </text>
        </Show>
        <text fg={theme.text.faint} wrapMode="none">
          ? help
        </text>
      </box>
    </Show>
  )
}
```

- [ ] **Step 8: Mount both bars and shrink the left-rail default**

In `packages/tui/src/app.tsx`:

Add imports:

```ts
import { CockpitStatusBar } from "./component/cockpit/status-bar"
import { CockpitTopBar } from "./component/cockpit/top-bar"
```

Change the vertical-tabs default width accessor (around line 543) to the Cockpit value, and the storage default:

```ts
const [layout, updateLayout] = useStorage().store<{ verticalTabsWidth?: number }>("layout", {
  initial: { verticalTabsWidth: COCKPIT_LEFT_RAIL_WIDTH },
})
```

```ts
value: () => layout.verticalTabsWidth ?? COCKPIT_LEFT_RAIL_WIDTH,
```

Import `COCKPIT_LEFT_RAIL_WIDTH` from `./ui/layout` in the existing import block.

Inside the root `<box ...>` (line ~1405), insert the top bar as the first child:

```tsx
<CockpitTopBar />
```

Insert the status bar just before the existing `<Show when={devtools() ...}>` block:

```tsx
<CockpitStatusBar />
```

- [ ] **Step 9: Typecheck and run**

Run: `cd packages/tui && bun typecheck`
Expected: no errors.

Run: `cd /home/tekalu/Documents/Projects/TekuCode/opencode && bun run dev:live`
Expected: one-row project bar on top, one-row status bar on the bottom, left rail narrower than before. Resize below 60/48 columns: bars disappear.

- [ ] **Step 10: Commit**

```bash
cd /home/tekalu/Documents/Projects/TekuCode/opencode
git add packages/tui/src/ui/layout.ts packages/tui/src/util/cockpit.ts packages/tui/src/component/cockpit/top-bar.tsx packages/tui/src/component/cockpit/status-bar.tsx packages/tui/src/app.tsx packages/tui/test/cockpit-layout.test.ts
git -c user.name="tekalu" -c user.email="tekalu@localhost" commit -m "feat(tui): add cockpit top and status bars"
```

---

### Task 3: Docked context rail

**Files:**
- Create: `packages/tui/src/component/cockpit/context-meter.tsx`
- Modify: `packages/tui/src/routes/session/sidebar.tsx` (accept `width`, pin the meter)
- Modify: `packages/tui/src/component/session-frame.tsx` (cockpit docking + right-rail toggle)
- Modify: `packages/tui/src/config/keybind.ts` and `packages/tui/src/config/v1/keybind.ts` (new binding)
- Modify: `packages/tui/src/feature-plugins/sidebar/context.tsx` and `todo.tsx` (section labels)
- Test: `packages/tui/test/cockpit-layout.test.ts` (already covers the pure parts; no new file)

**Interfaces:**
- Consumes: `cockpitFits`, `clampCockpitRightRail`, `COCKPIT_RIGHT_RAIL_WIDTH` from Task 2.
- Produces: `CockpitContextMeter(props: { sessionID: string })`; keymap command id `"session.rightrail.toggle"`, config key `right_panel_toggle`.
- Persists: `layout.rightRail?: boolean` in the existing TUI `layout` storage.

- [ ] **Step 1: Create the context meter**

Create `packages/tui/src/component/cockpit/context-meter.tsx`:

```tsx
import { createMemo, Show } from "solid-js"
import { useData } from "../../context/data"
import { useTheme } from "../../context/theme"
import { formatTokens } from "../../util/cockpit"
import { contextUsage } from "../../util/session"

const WIDTH = 10

export function CockpitContextMeter(props: { sessionID: string }) {
  const theme = useTheme()
  const data = useData()
  const session = createMemo(() => data.session.get(props.sessionID))
  const usage = createMemo(() =>
    contextUsage(
      data.session.message.list(props.sessionID),
      data.location.model.list(session()?.location),
      session()?.revert?.messageID,
    ),
  )
  const percent = createMemo(() => Math.max(0, Math.min(100, usage()?.percent ?? 0)))
  const filled = createMemo(() => Math.round((percent() / 100) * WIDTH))
  const color = createMemo(() =>
    percent() >= 85 ? theme.text.feedback.warning.base : theme.text.feedback.success.base,
  )

  return (
    <Show when={usage()}>
      {(value) => (
        <box flexShrink={0} gap={0}>
          <text fg={theme.text.muted} wrapMode="none">
            context
          </text>
          <box flexDirection="row" gap={1}>
            <text fg={color()} wrapMode="none">
              {"█".repeat(filled()) + "░".repeat(WIDTH - filled())}
            </text>
            <text fg={theme.text.muted} wrapMode="none">
              {value().percent ?? 0}% · {formatTokens(value().tokens)}
            </text>
          </box>
        </box>
      )}
    </Show>
  )
}
```

- [ ] **Step 2: Accept a width and pin the meter in the sidebar**

In `packages/tui/src/routes/session/sidebar.tsx`:

```ts
import { CockpitContextMeter } from "../../component/cockpit/context-meter"
```

Change the signature and the root width:

```ts
export function Sidebar(props: { sessionID: string; width?: number }) {
```

```tsx
width={props.width ?? SESSION_SIDEBAR_WIDTH}
```

Inside the bottom `<box flexShrink={0} gap={1} paddingTop={1}>`, after the `sidebar.footer` slot:

```tsx
<CockpitContextMeter sessionID={props.sessionID} />
```

- [ ] **Step 3: Dock the rail in the session frame**

In `packages/tui/src/component/session-frame.tsx`:

Import the new primitives:

```ts
import {
  clampCockpitRightRail,
  cockpitFits,
  COCKPIT_RIGHT_RAIL_WIDTH,
  SESSION_SIDEBAR_WIDTH,
} from "../ui/layout"
```

Extend the stored layout type:

```ts
const [layout, updateLayout] = useStorage().store<{
  paneWidth?: number
  terminalWidth?: number
  rightRail?: boolean
}>("layout", { initial: {} })
```

Add the cockpit accessors next to `wide`:

```ts
const cockpit = createMemo(() => cockpitFits(availableWidth()) && !data.session.get(props.sessionID)?.parentID)
const rightRail = createMemo(() => cockpit() && (layout.rightRail ?? true))
const dockedSidebar = () => rightPane() === "sidebar" && (wide() || cockpit())
const railWidth = () =>
  cockpit() ? clampCockpitRightRail(COCKPIT_RIGHT_RAIL_WIDTH, availableWidth()) : SESSION_SIDEBAR_WIDTH
```

Add `rightRail()` to `sidebarVisible`:

```ts
const sidebarVisible = createMemo(() => {
  if (data.session.get(props.sessionID)?.parentID) return false
  if (rightRail()) return true
  if ((layout.rightRail ?? true) === false && cockpit()) return false
  if (sidebarOpen()) return true
  return (config.data.session?.sidebar ?? "auto") === "auto" && wide()
})
```

Add the toggle next to `toggleSidebar`:

```ts
const toggleRightRail = () => {
  const next = !rightRail()
  void updateLayout((draft) => {
    draft.rightRail = next
  }).catch(toast.error)
}
```

Register the command in the existing always-on keymap layer (the one containing `session.sidebar.toggle`):

```ts
{
  id: "session.rightrail.toggle",
  title: rightRail() ? "Hide context rail" : "Show context rail",
  group: "Session",
  palette: true,
  run: () => {
    toggleRightRail()
    dialog.clear()
  },
},
```

Replace the two `Sidebar` render sites:

```tsx
<Sidebar sessionID={props.sessionID} width={railWidth()} />
```

Change the dock condition (line ~325) to:

```tsx
<Show when={rightPane() === "terminal" || rightPane() === "panel" || dockedSidebar()}>
```

and the overlay condition (line ~385) to:

```tsx
<Show when={rightPane() === "sidebar" && !dockedSidebar()}>
```

Inside the docked pane, keep the existing width expression but use the rail width for the sidebar branch:

```tsx
width={
  fullscreen()
    ? availableWidth()
    : rightPane() === "sidebar"
      ? railWidth()
      : paneResize.size()
}
```

- [ ] **Step 4: Add the keybinding**

In `packages/tui/src/config/keybind.ts`, after `"session.sidebar.toggle"`:

```ts
"session.rightrail.toggle": keybind("<leader>p", "Toggle context rail"),
```

In `packages/tui/src/config/v1/keybind.ts`, add the default next to `sidebar_toggle`:

```ts
right_panel_toggle: keybind("<leader>p", "Toggle context rail"),
```

and the legacy mapping next to `sidebar_toggle: "session.sidebar.toggle",`:

```ts
right_panel_toggle: "session.rightrail.toggle",
```

- [ ] **Step 5: Rename the two section headings**

In `packages/tui/src/feature-plugins/sidebar/context.tsx`:

```tsx
<b>CONTEXT</b>
```

In `packages/tui/src/feature-plugins/sidebar/todo.tsx`, both heading occurrences:

```tsx
<b>PLAN</b>
```

- [ ] **Step 6: Typecheck and run**

Run: `cd packages/tui && bun typecheck`
Expected: no errors.

Run: `cd packages/tui && bun test test/cockpit-layout.test.ts test/keybind.test.ts`
Expected: PASS.

Run: `cd /home/tekalu/Documents/Projects/TekuCode/opencode && bun run dev:live`
Expected: at ≥110 columns the Context/Plan rail is always docked on the right with the meter at the bottom; `<leader>p` hides and shows it; the transcript keeps at least 44 columns; below 110 columns the rail behaves as before.

- [ ] **Step 7: Commit**

```bash
cd /home/tekalu/Documents/Projects/TekuCode/opencode
git add packages/tui/src/component/cockpit/context-meter.tsx packages/tui/src/routes/session/sidebar.tsx packages/tui/src/component/session-frame.tsx packages/tui/src/config/keybind.ts packages/tui/src/config/v1/keybind.ts packages/tui/src/feature-plugins/sidebar/context.tsx packages/tui/src/feature-plugins/sidebar/todo.tsx
git -c user.name="tekalu" -c user.email="tekalu@localhost" commit -m "feat(tui): dock the cockpit context rail"
```

---

### Task 4: Left rail agents section

**Files:**
- Create: `packages/tui/src/component/cockpit/agents.tsx`
- Modify: `packages/tui/src/component/session-tabs.tsx` (mount the section in `VerticalSessionTabs`)

**Interfaces:**
- Consumes: `useData().session.family(sessionID)`, `data.session.status(id)`, `useRoute().navigate`.
- Produces: `CockpitAgents(props: { sessionID?: string; width: number })`.

- [ ] **Step 1: Create the agents section**

Create `packages/tui/src/component/cockpit/agents.tsx`:

```tsx
import { createMemo, For, Show } from "solid-js"
import { useData } from "../../context/data"
import { useRoute } from "../../context/route"
import { useTheme } from "../../context/theme"
import { Locale } from "../../util/locale"

const MAX_VISIBLE = 5

export function CockpitAgents(props: { sessionID?: string; width: number }) {
  const theme = useTheme()
  const data = useData()
  const route = useRoute()

  const agents = createMemo(() => {
    const sessionID = props.sessionID
    if (!sessionID) return []
    return data.session
      .family(sessionID)
      .filter((id) => id !== sessionID)
      .map((id) => ({
        id,
        title: Locale.truncate(data.session.get(id)?.title ?? "Agent", Math.max(8, props.width - 6)),
        running: data.session.status(id) === "running",
      }))
  })
  const visible = createMemo(() => agents().slice(0, MAX_VISIBLE))
  const hidden = createMemo(() => Math.max(0, agents().length - visible().length))

  return (
    <Show when={visible().length > 0}>
      <box flexShrink={0} flexDirection="column" paddingTop={1} paddingLeft={2} paddingRight={1} gap={0}>
        <text fg={theme.text.muted} wrapMode="none">
          AGENTS
        </text>
        <For each={visible()}>
          {(agent) => (
            <box
              flexDirection="row"
              gap={1}
              onMouseUp={() => route.navigate({ type: "session", sessionID: agent.id })}
            >
              <text fg={agent.running ? theme.text.feedback.success.base : theme.text.faint} wrapMode="none">
                {agent.running ? "●" : "○"}
              </text>
              <text fg={agent.running ? theme.text.base : theme.text.muted} wrapMode="none">
                {agent.title}
              </text>
            </box>
          )}
        </For>
        <Show when={hidden() > 0}>
          <text fg={theme.text.faint} wrapMode="none">
            +{hidden()} more
          </text>
        </Show>
      </box>
    </Show>
  )
}
```

- [ ] **Step 2: Mount it in the vertical tabs**

In `packages/tui/src/component/session-tabs.tsx` add the import:

```ts
import { CockpitAgents } from "./cockpit/agents"
```

Inside `VerticalSessionTabs`, immediately after the closing `</scrollbox>` (line ~1209) and before the compact tooltip `<Show>`:

```tsx
<Show when={!props.controller && !compact() && width() >= 20}>
  <CockpitAgents sessionID={activeID()} width={width()} />
</Show>
```

- [ ] **Step 3: Typecheck and test**

Run: `cd packages/tui && bun typecheck`
Expected: no errors.

Run: `cd packages/tui && bun test test/component/session-tabs-rail.test.tsx test/component/session-tabs-mouse.test.tsx`
Expected: PASS (the new section only renders when a real data provider exists, so controller-driven tests are unaffected).

Run: `cd /home/tekalu/Documents/Projects/TekuCode/opencode && bun run dev:live`
Expected: with a subagent session open, the left rail shows an `AGENTS` list under the sessions; running agents use a filled grass dot, idle ones an outline. Clicking one navigates to it.

- [ ] **Step 4: Commit**

```bash
cd /home/tekalu/Documents/Projects/TekuCode/opencode
git add packages/tui/src/component/cockpit/agents.tsx packages/tui/src/component/session-tabs.tsx
git -c user.name="tekalu" -c user.email="tekalu@localhost" commit -m "feat(tui): list subagent sessions in the left rail"
```

---

### Task 5: Narrow-terminal pass, story, and handoff docs

**Files:**
- Create: `packages/tui/src/feature-plugins/system/storybook/cockpit.tsx`
- Modify: `packages/tui/src/feature-plugins/system/storybook/index.tsx`
- Modify: `TEKUCODE.md`
- Modify: `docs/superpowers/specs/2026-11-14-tekucode-cockpit-design.md` (record the final rail widths)

**Interfaces:**
- Produces: story id `cockpit`, title `Cockpit bars`, registered in the `stories` array.
- Consumes: `CockpitTopBar`, `CockpitStatusBar` from Task 2.

- [ ] **Step 1: Add the story**

Create `packages/tui/src/feature-plugins/system/storybook/cockpit.tsx`:

```tsx
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
```

Register it in `packages/tui/src/feature-plugins/system/storybook/index.tsx`:

```ts
import { cockpitStory } from "./cockpit"
```

```ts
const stories: Story[] = [
  cockpitStory,
  mermanLayoutsStory,
  ...
]
```

- [ ] **Step 2: Run the story and the size matrix**

Run: `OPENCODE_STORY=cockpit bun run dev:live` from the repo root.
Expected: the story renders; `tab` narrows and widens the mock rail; `escape` returns to the storybook.

Then run the real TUI and check each size, with rails on and off:

| Size | Expected |
| --- | --- |
| 80×24 | no top/status bars; rails hidden; composer usable; no clipping |
| 100×30 | top bar visible; right rail hidden; left rail full |
| 110×30 | right rail docked; transcript ≥44 columns |
| 160×40 | full Cockpit: left 28, transcript, right 32, both bars |

For each: send a prompt, scroll the transcript, open a permission dialog, and open a diff. Nothing may overlap or lose focus.

- [ ] **Step 3: Update the handoff file**

In `TEKUCODE.md`:
- Set `Last updated: 2026-11-15` (or the actual date).
- Under Status, replace "No cockpit/TUI UI work has been done yet" with the completed phases, the grass default, and the new files.
- Under Next steps, delete the phases that are done and leave the remaining ones.
- Append a Changelog line: `- 2026-11-xx — Phases 1-5 landed: grass default theme, cockpit bars, docked context rail, agents rail, cockpit story.`

In `docs/superpowers/specs/2026-11-14-tekucode-cockpit-design.md`, correct the rail values to the shipped ones: left 28 (min 5 compact, max 72), right 32 (min 24, max 40), cockpit breakpoint 110 columns.

- [ ] **Step 4: Full verification**

Run: `cd packages/tui && bun test`
Expected: full suite PASS.

Run: `cd packages/tui && bun typecheck`
Expected: no errors.

Run: `cd /home/tekalu/Documents/Projects/TekuCode/opencode && bun run check`
Expected: lint and type-check PASS (or report only pre-existing, unrelated failures).

- [ ] **Step 5: Commit**

```bash
cd /home/tekalu/Documents/Projects/TekuCode/opencode
git add packages/tui/src/feature-plugins/system/storybook/cockpit.tsx packages/tui/src/feature-plugins/system/storybook/index.tsx TEKUCODE.md docs/superpowers/specs/2026-11-14-tekucode-cockpit-design.md
git -c user.name="tekalu" -c user.email="tekalu@localhost" commit -m "feat(tui): add cockpit story and finalize docs"
```

---

## Self-review

**Spec coverage**

| Spec requirement | Task |
| --- | --- |
| Grass theme, neutral grays, green-only accent, default theme | 1 |
| Top bar (project, title, model, branch, key hint) | 2 |
| Status bar (status, branch, tokens, cost, elapsed, keys) | 2 |
| Right rail: CONTEXT, PLAN, pinned context meter | 3 |
| Responsive collapse, no regression at 80×24 | 3 + 5 |
| `<leader>p` toggle, no existing key remapped | 3 |
| Left rail sessions + AGENTS section | 4 |
| Story harness, manual size matrix, docs/handoff | 5 |
| `packages/tui`-only scope | all tasks |

**Placeholder scan:** no TBD/TODO steps; every code step contains the actual code; every command has an expected result.

**Type consistency:** `DEFAULT_THEME`, `cockpitFits`, `clampCockpitRightRail`, `COCKPIT_*`, `formatTokens`, `formatElapsed`, `CockpitContextMeter`, `CockpitAgents`, `"session.rightrail.toggle"`, and `layout.rightRail` are spelled identically everywhere they appear.

**Known deviations from the spec, intentional:** no separate `rail-section.tsx` — the existing `sidebar.content` slot plugins already provide the sections, so only their headings change; the right rail width default is 32 rather than 30 for readability.
