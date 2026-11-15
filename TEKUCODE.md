# TekuCode — READ ME FIRST

Canonical state file for the TekuCode fork. **Any new session: read this before doing anything.**
Update the Status / Next / Changelog sections whenever something big changes (new phase done,
architecture decision, rename, dependency bump, branch move).

Last updated: 2026-11-14

## What this is

TekuCode is a fork of [anomalyco/opencode](https://github.com/anomalyco/opencode) (MIT) with a
redesigned terminal UI: **layout A · Cockpit** and a **grass-green terminal theme**.

- Repo: `/home/tekalu/Documents/Projects/TekuCode/opencode`
- Working branch: `tekucode-cockpit` (rebrand checkpoint + cockpit work committed here)
- Upstream remote: `origin` → https://github.com/anomalyco/opencode.git (branch `dev`)
- Product name: **TekuCode**. CLI binary is still `opencode` for now (rename is packaging work, not done).
- Design docs: `docs/superpowers/specs/2026-11-14-tekucode-cockpit-design.md`
- Plan: `docs/superpowers/plans/2026-11-14-tekucode-cockpit.md`

## Locked decisions

| Area | Decision |
| --- | --- |
| Layout | A · Cockpit. Left rail (sessions + agents), center chat + composer, right rail (context + plan), top bar, status bar. Layout mockup: earlier brainstorm screen `layout-directions.html`. |
| Style | Terminal-native. JetBrains Mono (set in the user's terminal, the app cannot force it), square edges, dense. |
| Color | Backgrounds/panels = neutral very dark grays in distinguishable steps. **Only accent/success is green: `#5fd068`.** No other saturated hues except muted amber warnings and muted red deletions. |
| Scope | `packages/tui` only (plus theme assets and docs). No server/core/web/desktop/SDK behavior changes. |
| Interaction | Keep the upstream keymap. Only additive rail toggles. |
| Icon | **TC** pixel lockup (same 30-unit grid as the in-app wordmark) on a full-bleed superellipse tile. No wordmark, no OpenCode glyph. Ink tile (`#08090a`, grass letters) for dark surfaces, grass tile (`#5fd068`) for light ones. |

## Status (as of 2026-11-14)

- Rebrand work is committed as a checkpoint on `tekucode-cockpit`; the tree is clean apart from
  later cockpit commits.
- Cockpit phases 1-5 are implemented in `packages/tui`:
  - `grass` theme (`src/theme/assets/grass.json`), registered in `DEFAULT_THEMES`, and selected by
    `DEFAULT_THEME = "grass"` in `theme/index.ts` for both the main TUI and mini mode.
  - `CockpitTopBar` (project · session · model · branch · ctrl+p) and `CockpitStatusBar`
    (state · branch · tokens · cost · elapsed) mounted in `app.tsx`.
  - Docked context rail at ≥110 columns with the `CONTEXT` and `PLAN` sections plus a pinned
    context meter; `<leader>p` toggles it (`session.rightrail.toggle`, persisted as `layout.rightRail`).
  - `AGENTS` section under the vertical session tabs, listing subagent sessions of the open session.
  - `OPENCODE_STORY=cockpit bun run dev:live` renders the cockpit bars story.
- `bun typecheck` in `packages/tui` still reports 7 pre-existing errors in `packages/core/plugin/provider`
  (`tor-http-client.ts`, `opencode.ts`) from the rebrand work — unrelated to the TUI changes.
- Visual/manual verification at 80×24, 110×30 and 160×40 has not been recorded yet.

## Next steps (in order)

1. Manual visual pass with `bun run dev:live`: 80×24, 100×30, 110×30, 160×40; rails on/off; composer,
   scrolling, permission dialogs, diffs. Fix any overlap or focus bug found.
2. Decide whether `grass` should also be the default for `opencode2` / new-designs mode.
3. Optional: rename the CLI binary and packages from `opencode` to `tekucode` (packaging work).
4. Optional: fix the pre-existing `packages/core` typecheck errors from the rebrand work.

## Key files

- `packages/tui/src/app.tsx` — app shell; mounts `CockpitTopBar` and `CockpitStatusBar`
- `packages/tui/src/component/cockpit/` — `top-bar.tsx`, `status-bar.tsx`, `context-meter.tsx`, `agents.tsx`
- `packages/tui/src/component/session-frame.tsx` — right pane / cockpit rail docking
- `packages/tui/src/component/session-tabs.tsx` — vertical left rail + `AGENTS` section
- `packages/tui/src/feature-plugins/sidebar/` — `CONTEXT` and `PLAN` rail sections
- `packages/tui/src/theme/assets/grass.json` — the grass theme document
- `packages/tui/src/theme/index.ts`, `v1.ts` — theme registry and `DEFAULT_THEME`
- `packages/tui/src/ui/layout.ts` — rail widths, breakpoints, `cockpitFits`
- `packages/tui/src/util/cockpit.ts` — token/elapsed formatting
- `packages/tui/AGENTS.md` — TUI rules (experiments registry, stories)
- `packages/desktop/icons/` — TC icon sets per channel (`source/*.svg` is the origin); `README.md` explains regeneration
- `packages/app/manifest.json`, `packages/ui/src/assets/favicon/` — PWA/favicon assets, generated from the same SVGs
- `AGENTS.md` (repo root) — upstream conventions (branch names, theme token semantics, dev:live)

## How to run and check

```sh
bun install                                   # already done once
bun run dev                                   # stock/dev TUI from source
bun run dev:live                              # TUI against the live background server
OPENCODE_STORY=cockpit bun run dev:live       # cockpit bars story
cd packages/tui && bun test                   # TUI tests
cd packages/tui && bun typecheck              # TUI type-check (see pre-existing core errors above)
bun run check                                 # canonical full lint + type-check from root
```

## Guardrails

- Never run `git reset --hard`, `git checkout -- .`, or clean untracked files without explicit user
  approval.
- Don't change behavior outside `packages/tui` unless the user asks.
- Follow the theme token rules in root `AGENTS.md`: pick tokens by semantic role; extend the theme
  schema instead of repurposing tokens.
- Keep the fork mergeable: prefer new cockpit components + small edits at real seams over rewrites.
- Grass `#5fd068` is the only accent hue; warnings are muted amber, deletions muted red.

## Changelog

- 2026-11-14 — Created.
- 2026-11-14 — Rebrand committed as checkpoint on `tekucode-cockpit`.
- 2026-11-14 — Cockpit phases 1-5: grass default theme, top/status bars, docked context rail with
  meter, agents rail, cockpit story. Plan and spec committed under `docs/superpowers/`.
- 2026-11-14 — `opencode-wiper` rewritten as a small Bun TUI with the grass accent: exit picker,
  WireGuard .conf add/validate (auto ping to 1.1.1.1), before/after public IP, disconnect-all, and a
  confirmed wipe. Original script saved as `opencode-wiper.backup.20261114-203850`; the TUI lives in
  `opencode-wiper.ts` behind the `opencode-wiper` launcher.
- 2026-11-15 — Desktop clean-slate maintenance integrated in-app: DB snapshot/selective restore,
  service restart and automatic window reload (no app restart), and VPN rotation from any
  `*.conf` discovered in `~/.config/protonvpn-wg`, so new tunnels need no code change.
- 2026-11-15 — Bottom maintenance bar warns when the persisted free-limit lockout is active: red dot
  plus the reset time (or “reset required”), driven by the same `free-limit` state the composer uses.
- 2026-11-15 — Fixed the packaged desktop app hanging on its splash screen. The shell waits for
  `$XDG_STATE_HOME/opencode/service.json`, but a CLI built from the `main` branch registers as
  `service-main.json`, so the service ran and was never found. Release builds must build the CLI with
  `OPENCODE_CHANNEL=latest`. Verified in a clean Fedora container (AppImage + Xvfb + openbox):
  service ready in ~15 s, onboarding renders.
- 2026-11-15 — Fixed the desktop cold-start "Desktop IPC port handshake timed out": the main
  process posted the renderer's MessagePort on `did-finish-load`, which can beat the renderer's module
  graph in dev, so the port was dropped. The preload now holds it until the renderer dispatches
  `IpcTransportReady` (`packages/shared/ipc-transport.ts`).
- 2026-11-15 — Repository moved to `main` and published at `tekalu-git/tekucode`
  (private, `main` is the default branch). Root `README.md` rewritten for the fork; the loose
  `opencode-wiper*` scripts stay untracked on purpose.
- 2026-11-15 — New app icon: TC pixel lockup on a squircle tile. Ink tile for `prod`/`dev` and every
  dark surface, grass tile for `beta`, the theme-aware SVG favicon in light mode, and the
  apple-touch icon. Regenerated all channel icon folders (png/ico/icns/icon.icon/android/ios),
  the web favicons/manifest icons, and renamed the PWA manifests from OpenCode to TekuCode.
