# TekuCode — Cockpit TUI and Grass Theme (design)

Date: 2026-11-14
Status: approved design, pending implementation plan
Repo: `/home/tekalu/Documents/Projects/TekuCode/opencode`

## 1. Context

TekuCode is a fork of `anomalyco/opencode` (MIT, branch `dev`). The product goal is a distinct
terminal experience, not new agent capability: **layout A · Cockpit** plus a **grass-green terminal
theme**. The fork already exists locally with an in-progress rebrand (uncommitted). This design covers
only the TUI and its theme.

Non-goals: web app, desktop app, server/core behavior, SDK, packaging pipelines, new tools or agents.

## 2. Baseline and constraints

- Work happens in `packages/tui` (SolidJS on `@opentui/core` + `@opentui/solid`), plus theme assets.
- The tree has 67 modified + 9 untracked files on `dev` (rebrand work). They must be preserved.
  Before UI work: checkpoint them in a commit on branch `tekucode-cockpit` (branch naming follows the
  repo convention: max three hyphenated words).
- Bun is pinned at 1.4.4 and matches the repo's `packageManager`. `node_modules` is already installed.
- A terminal app cannot choose the font. JetBrains Mono is a documentation/setup recommendation set in
  the user's terminal profile; the fork controls colors, spacing, borders, and glyphs.

## 3. Layout: Cockpit

Regions for width ≥ 110 columns:

```
┌ top bar ── project / session · model · branch · ⌘K ──────────────┐
│ SESSIONS      │  message stream                 │ CONTEXT         │
│  flaky auth ●3│  (existing message/tool/diff    │  M session.ts   │
│  rate limit   │   renderers, unchanged)         │  M auth.test.ts │
│ AGENTS        │                                 │ PLAN            │
│  lead   run   │                                 │  ✓ reproduce    │
│  tests  idle  │  ┌ composer ─────────────────┐  │  ○ add lock     │
│               │  │ ❯ …                        │  │  [context meter]│
└ status bar ── branch · tokens · cost · elapsed · keys ───────────┘
```

- **Top bar** (1 row): project name (accent), session breadcrumb, model pill, git branch pill, key hint.
- **Left rail** (default 28 cols, compact below 12, max 72): SESSIONS list from existing session tabs
  data, then an AGENTS list (subagent sessions with run/idle indicator). Seed: the existing vertical
  tabs machinery; do not introduce a second source of truth.
- **Center** (min 44 cols): existing message stream and composer. No renderer changes.
- **Right rail** (default 32 cols, min 24, max 40): CONTEXT (usage/tokens) above PLAN (session todos,
  done/todo), with the context meter pinned at the bottom. Reuses the existing `Sidebar` and its
  `sidebar.content` plugin slot.
- **Status bar** (1 row): branch/clean state, token count, cost, elapsed, contextual key hints.

Responsive behavior (shipped):
- `< 110` cols: right rail hidden by default; toggled as an overlay/docked pane using existing panel
  split behavior (`ui/layout.ts` constants, `SESSION_PANEL_SPLIT_MIN_WIDTH`).
- Below the cockpit breakpoint both rails follow the original upstream behavior; the center always
  keeps at least 44 cols.
- No regression at 80x24: the session remains usable with rails hidden.

Implementation seams (new code stays reviewable):
- `packages/tui/src/ui/layout.ts` — add rail width constants/clamps and breakpoints.
- `packages/tui/src/app.tsx` — top bar and status bar composition.
- `packages/tui/src/routes/session/index.tsx` — mount the right rail around the existing stream/composer.
- `packages/tui/src/routes/session/sidebar.tsx` — left rail sections (sessions + agents).
- `packages/tui/src/component/cockpit/` — new components: `top-bar.tsx`, `status-bar.tsx`,
  `right-rail.tsx`, `context-list.tsx`, `plan-list.tsx`, `rail-section.tsx`.

## 4. Interaction

Keep the upstream keymap; only add one binding.

- Left rail toggle: existing `sidebar_toggle` (`<leader>b`) — reuse, no new key.
- Right rail toggle: new `right_panel_toggle` (`<leader>p`, currently unbound). Hidden/overlay state is
  persisted with the existing layout storage, like `verticalTabsWidth`.
- Focus movement stays as-is; no remapping of `ctrl+b` (session background) or `ctrl+r` (rename).

## 5. Theme: `grass`

Bundled themes are v1 JSON documents (`defs` + `theme` with `dark`/`light` values) resolved by
`theme/resolve.ts`. Add `packages/tui/src/theme/assets/grass.json` and register it in
`DEFAULT_THEMES` (`theme/v1.ts`). Make it the fork default by changing the `"opencode"` fallbacks in
`context/theme.tsx` and `mini/theme.ts` to `"grass"`.

Palette rules: neutral, very dark grays in distinguishable steps; **green is the only accent**.

| Token | Dark value | Role |
| --- | --- | --- |
| `background` | `#08090a` | app background |
| `backgroundPanel` | `#0c0e10` | rails, bars |
| `backgroundElement` | `#101316` | cards, composer, diffs |
| `backgroundMenu` | `#16191d` | menus, selection |
| `borderSubtle` / `border` | `#191d21` / `#24282d` | inactive hairlines |
| `text` / `textMuted` | `#cfd4d9` / `#7b848d` | primary / secondary text |
| `primary`, `accent`, `borderActive` | `#5fd068` | the single grass green |
| `success`, `diffAdded` | `#46a851` | status + diff additions |
| `diffHighlightAdded` | `#7ee787` | highlighted additions |
| `warning` | `#c9a86b` | muted amber, warnings only |
| `error`, `diffRemoved` | `#c96b6b` | muted red, errors/deletions |
| `diffHighlightRemoved` | `#e08585` | highlighted deletions |
| `diffAddedBg` / `diffRemovedBg` | `#0f1a12` / `#1b1212` | tinted backgrounds |
| `secondary`, `info` | `#7b848d` | deliberately neutral (no second hue) |
| `selectedListItemText` | `#08090a` | contrast on green selection |

- Categorical/hue palettes are reduced to neutral + green shades so nothing else competes with the accent.
- Light mode: keep a low-contrast neutral paper variant so the theme does not break when the terminal
  reports a light background; grass stays the accent but darker (`#3f9a4b`) for contrast.
- No component hard-codes colors; everything goes through theme tokens (repo rule).

## 6. Testing and verification

- `bun test --cwd packages/tui` — existing suite must pass.
- `bun run typecheck` (or `bun turbo typecheck --concurrency=3`).
- Manual matrix: 80x24, 120x30, 160x40, with rails shown/hidden; verify composer focus, scrolling,
  permission dialogs, and diffs are unaffected.
- Optional visual checks via the existing story/simulation harness (`packages/tui/src/simulation`).
- One screenshot per phase in `docs/tekucode/` for the handoff file.

## 7. Phases

0. Checkpoint rebrand on `tekucode-cockpit`; `bun run dev` proves the stock TUI runs from source.
1. Grass theme + default (visible immediately, low risk).
2. Top bar + status bar.
3. Right rail (CONTEXT, PLAN, meter) with responsive collapse.
4. Left rail sessions + agents.
5. Polish + narrow-terminal pass + docs/handoff update.

## 8. Risks

- **Dirty tree**: the rebrand is uncommitted; a careless reset destroys it. Mitigation: checkpoint
  commit first, never reset without explicit approval.
- **Upstream churn**: `routes/session/index.tsx` is large and fast-moving. Mitigation: new components,
  minimal edits at seams, keep the fork on a branch and rebase deliberately.
- **Overclaiming the font**: JetBrains Mono cannot be enforced by the app; docs must say so.
- **Theme schema drift**: the v2 theme document format exists; use v1 JSON like all bundled themes,
  and only extend tokens if a semantic role is genuinely missing.

## 9. Open items

- Rename the CLI binary/packages from `opencode` to `tekucode`? Deferred: product name is TekuCode, the
  executable stays `opencode` until a dedicated packaging task.
- Whether the user wants a checkpoint commit and branch move now (see handoff file).
