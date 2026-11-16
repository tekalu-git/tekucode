import type { DesktopMenuAction, DesktopZoomLevel } from "@opencode/app/desktop-menu"
import type { DesktopNativeBundle } from "@opencode/app/i18n/desktop-native"
import type { StorageSnapshot } from "../shared/ipc-transport"
import type { WindowBootstrap } from "../shared/window-bootstrap"
import type {
  ClipboardImage,
  DirectoryPickerOptions,
  FatalRendererError,
  FilePickerOptions,
  PickedFiles,
  SaveFilePickerOptions,
  ServerReadyData,
  TitlebarTheme,
} from "../shared/ipc-contract"

export type ElectronAPI = {
  awaitInitialization(): Promise<ServerReadyData>
  reconnectService(signal?: AbortSignal): Promise<ServerReadyData>
  onSidecarChanged(cb: (data: ServerReadyData) => void): () => void
  readyDeepLinks(): void
  acknowledgeDeepLinks(attempt: number): void
  isFirstLaunchOnboardingPending(): Promise<boolean>
  finishFirstLaunchOnboarding(createDefaultProject: boolean): Promise<string | null>
  isOnboardingTourPending(): Promise<boolean>
  finishOnboardingTour(): void
  resetOnboardingTour(): void
  checkAppExists(appName: string): Promise<boolean>
  resolveAppPath(appName: string): Promise<string | null>
  /** The namespaces the preload read before the page ran; `createDesktopStorage` serves each first read from it. */
  getStorageSnapshot(): Promise<StorageSnapshot>
  storeItems(name: string): Promise<{ items: Record<string, string>; revision: number }>
  storeUpdate(name: string, insert: Record<string, string>, remove: string[]): Promise<number>
  storeClear(name: string): Promise<void>
  onStoreChanged(
    cb: (name: string, insert: Record<string, string>, remove: string[], revision: number) => void,
  ): () => void
  draftGet(key: string): Promise<string | null>
  draftSet(key: string, value: string, strict: boolean): Promise<string[]>
  draftDelete(key: string): Promise<void>
  draftBlobPut(data: ArrayBuffer): Promise<string>
  draftBlobGet(id: string): Promise<ArrayBuffer | null>
  getWindowID(): string
  getWindowBootstrap(): WindowBootstrap
  themeReady(): Promise<void>
  onMenuCommand(cb: (id: string) => void): () => void
  onDeepLink(cb: (delivery: { attempt: number; urls: string[] }) => void): () => void
  openDirectoryPicker(opts?: DirectoryPickerOptions): Promise<string | string[] | null>
  openFilePicker(opts?: FilePickerOptions): Promise<PickedFiles | null>
  readPickedFile(token: string, path: string): Promise<ArrayBuffer>
  releasePickedFiles(token: string): Promise<void>
  getPathForFile(file: File): string
  saveFile(opts: SaveFilePickerOptions, content: string): Promise<boolean>
  openExternal(url: string): void
  openBrowser(url: string): Promise<boolean>
  openLocalFile(url: string): void
  openPath(path: string, app?: string): Promise<string | undefined>
  revealPath(path: string): Promise<boolean>
  readClipboardImage(): Promise<ClipboardImage | null>
  writeClipboardText(text: string): Promise<void>
  getWindowFocused(): Promise<boolean>
  requestMicrophone(): Promise<boolean>
  setVoiceCallActive(active: boolean): Promise<void>
  getWindowFullscreen(): Promise<boolean>
  onWindowFullscreenChanged(cb: (fullscreen: boolean) => void): () => void
  setWindowFocus(): Promise<void>
  showWindow(): Promise<void>
  relaunch(): void
  getZoomFactor(): Promise<number>
  setZoomFactor(factor: number): Promise<void>
  getPinchZoomEnabled(): Promise<boolean>
  setPinchZoomEnabled(enabled: boolean): Promise<void>
  onPinchZoomEnabledChanged(cb: (enabled: boolean) => void): () => void
  getZoomLevel(): Promise<DesktopZoomLevel>
  setZoomLevel(level: DesktopZoomLevel): Promise<void>
  onZoomChanged(cb: (zoom: { factor: number; level: DesktopZoomLevel }) => void): () => void
  getSystemAccentColor(): Promise<string | null>
  onSystemAccentChanged(cb: (color: string | null) => void): () => void
  setTitlebar(theme: TitlebarTheme): Promise<void>
  setTrafficLightsPosition(position: { x: number; y: number }): Promise<void>
  runDesktopMenuAction(action: DesktopMenuAction): Promise<void>
  setBackgroundColor(color: string): Promise<void>
  exportDebugLogs(): Promise<string>
  setForceFocus(enabled: boolean): Promise<void>
  getSpellcheckEnabled(): Promise<boolean>
  setSpellcheckEnabled(enabled: boolean): Promise<void>
  recordFatalRendererError(error: FatalRendererError): Promise<void>
  setNativeTranslations(bundle: DesktopNativeBundle): Promise<void>
  maintenanceStatus(): Promise<MaintenanceStatusData>
  maintenanceImport(input: MaintenanceImportInput): Promise<MaintenanceImportData>
  maintenanceBackup(options?: MaintenanceBackupOptionsData): Promise<MaintenanceBackupData>
  maintenanceRestore(input: MaintenanceRestoreInput): Promise<MaintenanceRestoreData>
  maintenanceWipe(options: MaintenanceWipeOptions): Promise<MaintenanceResultData>
  onMaintenanceProgress(cb: (progress: MaintenanceProgressData) => void): () => void
}

export type MaintenanceBackupInfoData = {
  id: string
  path: string
  time: number
  count: number
}

export type MaintenanceConfigData = {
  id: string
  label: string
  file: string
}

export type MaintenanceStatusData = {
  supported: boolean
  platform: "linux" | "win32" | "darwin" | "other"
  vpn: {
    connected: boolean
    country?: string
    interface?: string
    ip?: string
  }
  wireguard: {
    installed: boolean
    executable?: string
    configDir: string
  }
  configs: readonly MaintenanceConfigData[]
  backups: readonly MaintenanceBackupInfoData[]
}

export type MaintenanceWipeOptions = {
  rotate: boolean
  country?: string
  password?: string
  backup: boolean
  backupOptions?: MaintenanceBackupOptionsData
}

/** What a conversation backup keeps; omitted kinds stay on, so nothing sent means the full transcript. */
export type MaintenanceBackupOptionsData = {
  toolOutput?: boolean
  reasoning?: boolean
  attachments?: boolean
  metadata?: boolean
}

export type MaintenanceBackupData = {
  ok: boolean
  path?: string
  count?: number
  failed?: number
  reason?: "busy" | "unsupported" | "failed"
  message?: string
}

export type MaintenanceRestoreInput = {
  id?: string
}

export type MaintenanceRestoreData = {
  ok: boolean
  path?: string
  imported?: number
  skipped?: number
  failed?: number
  reason?: "busy" | "unsupported" | "missing" | "failed"
  message?: string
}

export type MaintenanceImportInput = {
  path?: string
  name?: string
  content?: string
}

export type MaintenanceImportData = {
  ok: boolean
  config?: MaintenanceConfigData
  replaced?: boolean
  reason?: "unsupported" | "invalid" | "failed"
  message?: string
}

export type MaintenanceResultData = {
  ok: boolean
  wiped: boolean
  reason?:
    | "busy"
    | "unsupported"
    | "invalid-password"
    | "elevation-required"
    | "missing-config"
    | "missing-wireguard"
    | "failed"
  message?: string
  ip?: string
  backup?: string
}

export type MaintenanceProgressData = {
  id: string
  step: string
  status: "running" | "done" | "skipped" | "failed"
  message?: string
}
