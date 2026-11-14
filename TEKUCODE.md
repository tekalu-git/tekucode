# TekuCode — READ ME FIRST

Canonical state file for the TekuCode fork. **Any new session: read this before doing anything.**
Update the Status / Next / Changelog sections whenever something big changes (new phase done,
architecture decision, rename, dependency bump, branch move).

Last updated: 2026-11-14

## What this is

TekuCode is a fork of [anomalyco/opencode](https://github.com/anomalyco/opencode) (MIT) with a
redesigned terminal UI: **layout A · Cockpit** and a **grass-green terminal theme**.

- Repo: `/home/tekalu/Documents/Projects/TekuCode/opencode`
- Upstream remote: `origin` → https://github.com/anomalyco/opencode.git (branch `dev`)
- Product name: **TekuCode**. CLI binary is still `opencode` for now (rename is packaging work, not done).
- Design docs: `docs/superpowers/specs/2026-11-14-tekucode-cockpit-design.md`

## Locked decisions

| Area | Decision |
| --- | --- |
| Layout | A · Cockpit. Left rail (sessions + agents), center chat + composer, right rail (context + plan), top bar, status bar. Layout mockup: earlier brainstorm screen `layout-directions.html`. |
| Style | Terminal-native. JetBrains Mono (set in the user's terminal, the app cannot force it), square edges, dense. |
| Color | Backgrounds/panels = neutral very dark grays in distinguishable steps. **Only accent/success is green: `#5fd068`.** No other saturated hues except muted amber warnings and muted red deletions. |
| Scope | `packages/tui` only (plus theme assets and docs). No server/core/web/desktop/SDK behavior changes. |
| Interaction | Keep the upstream keymap. Only additive rail toggles. |

## Status (as of 2026-11-14)

- Fork cloned and dependencies installed (`node_modules` present, `dist/` present).
- **Uncommitted rebrand work on `dev`**: 67 modified + 9 untracked files (TekuCode wordmark,
  `tekucode.dev` metadata, desktop app names/accent, CLI debug quota tools, tor http client, etc.).
  This is the user's work-in-progress. **Do not revert, reset, stash-drop, or overwrite it.**
- **No cockpit/TUI UI work has been done yet.** `packages/tui` is effectively upstream apart from
  a version line in `package.json`.
- No checkpoint commit exists for the rebrand. Confirm with the user before committing it.

## Next steps (in order)

1. Protect the dirty tree: get the user's OK, then commit the rebrand as a checkpoint on branch
   `tekucode-cockpit` (branch names: max 3 hyphenated words, per upstream AGENTS.md).
2. Phase 0: prove `bun run dev` builds and runs the stock TUI.
3. Phase 1: add `grass` theme document under `packages/tui/src/theme/assets/v2/`, register it
   (see `theme/index.ts`, `theme/v1.ts`), make it the fork default. Semantic tokens only.
4. Phase 2: top bar + status bar in `packages/tui/src/app.tsx`.
5. Phase 3: right rail (CONTEXT + PLAN + context meter) in `routes/session/index.tsx`, with
   responsive collapse; widths/breakpoints in `ui/layout.ts`; new components in
   `src/component/cockpit/`.
6. Phase 4: left rail — sessions and AGENTS sections (`routes/session/sidebar.tsx`).
7. Phase 5: polish + layout snapshots at 80x24, 120x30, 160x40. Use the simulation/story harness
   (`packages/tui/src/simulation`, `scripts` in upstream AGENTS.md).

## Key files

- `packages/tui/src/app.tsx` — app shell, tabs, status, dialogs
- `packages/tui/src/routes/session/index.tsx` — the session screen (large)
- `packages/tui/src/routes/session/sidebar.tsx` — session sidebar (left rail seed)
- `packages/tui/src/ui/layout.ts` — widths and breakpoints
- `packages/tui/src/theme/` — theme loading/resolution; JSON themes in `assets/v2/`
- `packages/tui/AGENTS.md` — TUI rules (experiments registry)
- `AGENTS.md` (repo root) — upstream conventions (branch names, theme token semantics, dev:live)

## How to run and check

```sh
bun install                                   # already done once
bun run dev                                   # stock/dev TUI from source
bun run dev:live                              # TUI against the live background server
bun test --cwd packages/tui                   # TUI tests
bun turbo typecheck --concurrency=3           # or: bun run typecheck
```

## Guardrails

- Never run `git reset --hard`, `git checkout -- .`, or clean untracked files in this repo without
  explicit user approval — there is uncommitted work.
- Don't change behavior outside `packages/tui` unless the user asks.
- Follow the theme token rules in root `AGENTS.md`: pick tokens by semantic role; extend the theme
  schema instead of repurposing tokens.
- Keep the fork mergeable: prefer new cockpit components + small edits at real seams over rewrites.

## Changelog

- 2026-11-14 — Created. Fork rebrand already in progress (uncommitted). Cockpit + grass theme
  chosen; design spec written; no UI code yet.
