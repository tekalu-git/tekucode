# TekuCode icons

The mark is the **TC** lockup: a 30-unit-cell pixel `T` and `C` (the same grid as the in-app wordmark) on a full-bleed
superellipse tile. Two colourways live in `source/`:

| File | Use |
| --- | --- |
| `source/tc-ink.svg` | Grass letters on near-black ink. App icons, favicon in dark mode. |
| `source/tc-grass.svg` | Ink letters on a grass gradient. Favicon in light mode, apple-touch icon. |
| `source/tc-ink-macos.svg` | `tc-ink.svg` pulled into Apple's 824/1024 art grid with a transparent margin. |

Channel mapping: `prod` and `dev` use the ink tile, `beta` uses the grass tile so the two Dock entries stay
distinguishable. Every channel folder carries the same file names, because `script/copy-icons.ts` copies one folder
verbatim into `resources/icons`.

## Regenerating

Each channel folder is generated from the SVGs, not hand-edited:

- `icon.png` (512), `128x128@2x.png` (256), `128x128.png`, `64x64.png`, `32x32.png`, `dock.png` (256)
- `icon.ico` (16-256), `icon.icns` (16-1024), `icon.icon/Assets/icon.png` (1024, Icon Composer)
- `Square*Logo.png` / `StoreLogo.png` (Windows tiles), `android/**`, `ios/**`

`ios/AppIcon-60x60@3x.png` is special: `packages/app/vite.icons.ts` reuses it as the web `apple-touch-icon`, so it is
rendered from the grass tile to suit light home screens. `android/mipmap-*/ic_launcher.png` and `icon.png` also feed the
web manifest icons, so keep the web and desktop sets generated from the same sources.

The favicon in `packages/app/public` and `packages/ui/src/assets/favicon` is a symlink into the ui assets and follows
the same SVGs; `favicon.svg` switches between the two colourways with `prefers-color-scheme`.

## macOS notes

`icon.icns` uses the inset `tc-ink-macos.svg` art (Apple's grid), so Dock icons line up with other apps; `icon.icon`
(Icon Composer, macOS 26) takes the full-bleed art and applies its own mask. Every smaller `.icns` entry is a
premultiplied-alpha downsample of the same 1024px render, which avoids the light anti-aliased halo that shows up on
dark backgrounds at 64px.
