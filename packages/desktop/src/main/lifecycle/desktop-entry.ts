import { copyFile, mkdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { app } from "electron"
import { APP_ID, APP_NAME } from "../constants"

// Wayland clients identify themselves by app id, and the compositor resolves that id to an installed
// `.desktop` file to find the window's icon. An AppImage carries one, but nothing installs it without
// an integration helper, so the taskbar shows its generic fallback. Publish a copy in the user's data
// dir instead; a distro package's copy still wins on desktops that read the system dirs as well.
const icons = [
  ["32x32.png", "32x32"],
  ["64x64.png", "64x64"],
  ["128x128.png", "128x128"],
  ["128x128@2x.png", "256x256"],
  ["icon.png", "512x512"],
] as const

export async function installDesktopEntry() {
  if (process.platform !== "linux" || !app.isPackaged) return

  const executable = process.env.APPIMAGE ?? process.execPath
  // An extract-and-run AppImage executes from a throwaway directory, so a launcher would point nowhere.
  if (!process.env.APPIMAGE && executable.startsWith(app.getPath("temp"))) return

  const name = `${APP_ID}.desktop`
  if (installed(name)) return

  const data = process.env.XDG_DATA_HOME ?? path.join(app.getPath("home"), ".local", "share")
  const resources = path.join(process.resourcesPath, "icons")

  await mkdir(path.join(data, "applications"), { recursive: true })
  await writeFile(path.join(data, "applications", name), entry(executable))

  await Promise.all(
    icons.map(async ([file, size]) => {
      const dir = path.join(data, "icons", "hicolor", size, "apps")
      await mkdir(dir, { recursive: true })
      await copyFile(path.join(resources, file), path.join(dir, `${APP_ID}.png`))
    }),
  )
}

function installed(name: string) {
  return (process.env.XDG_DATA_DIRS ?? "/usr/local/share:/usr/share")
    .split(":")
    .some((dir) => existsSync(path.join(dir, "applications", name)))
}

function entry(executable: string) {
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${APP_NAME}`,
    "Comment=Open source AI coding agent",
    `Exec="${executable}" %U`,
    `Icon=${APP_ID}`,
    "Terminal=false",
    "Categories=Development;",
    `StartupWMClass=${APP_ID}`,
    "StartupNotify=true",
    "MimeType=x-scheme-handler/opencode;",
    "",
  ].join("\n")
}
