# TekuCode — READ ME FIRST

Canonical state file for the TekuCode fork. **Any new session: read this before doing anything.**
Update the Status / Next / Changelog sections whenever something big changes (new phase done,
architecture decision, rename, dependency bump, branch move).

Last updated: 2026-11-16

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
- Desktop onboarding (2026-11-17): after the silent bootstrap the window now shows a welcome dialog, a
  five-step spotlight over the real controls, and a skippable folder step; completion persists in the
  main settings store. Code lives in `packages/desktop/src/renderer/tour/`.

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
- `packages/desktop/src/renderer/tour/` — first-run welcome, spotlight steps, folder step, state machine
- `packages/desktop/src/main/lifecycle/onboarding-tour.ts` — `onboardingTourComplete` gate and replay reset
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
- 2026-11-15 — Windows support for clean-slate maintenance. Data reclaiming now runs on Windows
  (`Stop-Process` for stray servers, same XDG-resolved data directories as the CLI), and tunnel
  rotation drives WireGuard for Windows through one UAC-elevated PowerShell call
  (`/uninstalltunnelservice` for every known tunnel, then `/installtunnelservice` for the target).
  Configs live in `%APPDATA%\opencode\protonvpn-wg` on Windows and `~/.config/protonvpn-wg` elsewhere.
  The dialog now warns when WireGuard (or `wireguard-tools` on Linux) is missing, shows the exact
  config folder with an "Open folder" button, explains the UAC prompt instead of asking for a sudo
  password on Windows, and disables rotation until the setup is complete. macOS reports the platform
  as unsupported instead of the old Linux-only message.
- 2026-11-16 — Clean-slate reset now saves conversations before it wipes. The dialog exports every
  session through `experimental.session.export` into `opencode-session-backups` beside the data
  directory (newest ten kept, outside every wiped path), defaults the save toggle on, and offers
  "Save now" without wiping. A restore action imports the newest backup through
  `experimental.session.import`, parents before children, skipping IDs that already exist, then
  reloads the windows so the restored list appears. `Maintenance` gained `backup`/`restore`, with
  `MaintenanceBackup` and `MaintenanceRestore` on the RPC surface.
- 2026-11-16 — Release builds no longer fail the Console free tier with "OpenCode 1.18.0 or newer is
  required to use the free tier". The Console reads the version from the `User-Agent` and refuses
  free-tier inference to anything older than 1.18.0, so the fork's own `0.x` release stamp read as too
  old. Console-facing requests (the provider client and model requests to the `opencode` provider) now
  advertise the upstream base version through `App.consoleUseragent`; everything else keeps the real
  product version. Verified with the source CLI stamped `OPENCODE_VERSION=0.1.0`: a free-model prompt
  answers instead of returning the version error.
- 2026-11-16 — Desktop branding reached the splash and Linux window identity. The first-launch splash
  now draws the TekuCode wordmark instead of upstream's, the idle splash and server-connect screen use
  the TC monogram, and the glyph data lives in `packages/ui/src/typography/wordmark/glyphs.ts` for the
  wordmark and `Logo`. Packaged builds also ship `resources/icons` beside the asar (the window icon path
  pointed inside it before), set the Linux desktop name explicitly, and publish a user-level
  `ai.opencode.desktop*.desktop` entry with hicolor icons so an AppImage gets the TC icon in the
  taskbar instead of the compositor's fallback.
- 2026-11-16 — Conversation backups gained contents options. The clean-slate dialog's backup section
  now has switches for tool output, reasoning, attachments, and titles/metadata, plus a one-click
  "Keep text only" preset; the same options apply to the save-before-wipe step. Trimmed exports keep
  session and message IDs because `experimental.session.import` keys its rows by them, and every
  trimmed message still decodes against `Session.Message.Info`. On a real 209 KB conversation the
  text-only preset writes 40 KB (81% smaller) and restores without loss of the visible transcript.
- 2026-11-16 — Clean-slate dialog fits short windows and uses the space. The body is capped to the
  window height and scrolls on its own, so the header and footer never leave the screen in a restored
  (non-maximized) window. The form is grouped into Conversations and Network cards, laid out in two
  columns when the window is wide and one when it is narrow, and the backup contents sit in an inset
  that follows the active theme.
- 2026-11-17 — Clean-slate dialog scrolls for real. Its body override was losing the cascade to the
  dialog's four-level nested `overflow: hidden`, so content was clipped rather than scrolled and the
  restore button sat out of bounds. The override now repeats the component selector and sets
  `min-height: 0`, the header copy is shorter, and the four backup options use a two-column inset so
  the dialog fits more windows without scrolling.
- 2026-11-17 — Desktop first-run onboarding became visible. After the silent bootstrap (default project
  plus draft tab) the app reveals and shows a welcome dialog — start the tour, or skip it for someone
  who already knows OpenCode — then a five-step spotlight cuts a hole around the real composer, model
  picker, agent picker, project selector and tab strip, and a folder step keeps the default project or
  replaces it through the native directory picker before the composer takes focus. Every stage is
  skippable; `→`/`Enter` advance, `←` goes back, `Esc` skips, and a missing anchor (collapsed rail,
  narrow window) centers the card instead of failing. Completion is stored in the main settings store as
  `onboardingTourComplete` next to `firstLaunchOnboardingComplete`, and Settings → General gained
  "Show welcome tour", which re-arms it for the next window mount. New copy is English-only (other
  locales fall back), and anchors are `data-tour` attributes on the existing controls.
- 2026-11-17 — First-run onboarding polish. The welcome and folder dialogs opt into the shared `fit`
  sizing so they hug their content instead of a fixed 480×368 box, and the dialog body keeps a 16px
  inset. The folder step renders the suggested path inside a framed, padded field with a folder glyph
  and a Browse button that opens the native picker (the footer's Choose folder remains only when no
  folder is suggested), with a short empty-state line for installs without a default project. The
  spotlight card now springs between targets on a 560 ms eased curve, the hole follows on a 480 ms
  curve, and each step's copy remounts into a keyed enter animation that slides in from the card's
  placement side; reduced-motion still disables all of it.
- 2026-11-19 — Clean-slate VPN rotation became app-scoped. The tunnel no longer installs a
  system-wide WireGuard service or route: packaged builds ship the ISC-licensed `wireproxy` 1.1.3
  next to the CLI, start it as a child of the desktop main process against the selected `.conf`, and
  expose it on an ephemeral loopback HTTP CONNECT proxy. Only the OpenCode sidecar is spawned with
  `HTTP(S)_PROXY`/`ALL_PROXY` (both spellings), which Bun honors, so model traffic crosses the tunnel
  while system routes, DNS and other apps stay on the normal connection. The existing `NO_PROXY` list
  keeps `127.0.0.1`/`localhost`/`::1` direct, so the window still reaches the local server. Rotating
  needs no driver, sudo or UAC, and the tunnel exits with the app (`will-quit`) instead of leaving a
  service to uninstall; the dialog lost its password and WireGuard-install prompts and now reports a
  scoped tunnel. `script/wireproxy.ts` downloads the matching release for `OPENCODE_TARGET` in
  `build`, `dev` and `pack`; upstream has no Windows ARM64 binary, so that target packages without a
  tunnel runtime and the dialog disables rotation. Linux and Windows are supported, macOS is not.
- 2026-11-19 — Clean-slate wipe no longer touches another running install, and keeps a custom
  service port. The stop step ran `pkill -f "opencode.*serve"`, which matched every staged
  `opencode-cli serve` on the machine — including the 2.3.3 sidecar the current desktop session was
  using — so a wipe in a second instance killed the first. The match is now anchored to
  `<userData>/cli/<stage>/opencode-cli serve` (Windows filters `ExecutablePath` under the same
  folder), and Electron helpers, the bundle mount and other installs never match. The wipe also
  reads `config/opencode/service.json` before the config directory goes away and writes the port
  back after the snapshot restore, so an install whose service is not on 49374 restarts on its own
  port instead of failing with "port already in use". Verified end to end in a rootless Fedora
  container (Xvfb + CDP) with the real 2.3.3 still holding 49374: backup, rotation to
  NL-FREE#253, wipe, restore and restart all completed, exit IP 80.79.7.83, bar showed
  "NL-FREE#253 tunnel · TekuCode only", host stayed on its direct IP.
