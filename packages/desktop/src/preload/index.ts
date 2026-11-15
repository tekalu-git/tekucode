import { contextBridge, ipcRenderer, webUtils } from "electron"
import {
  DragCancelEvent,
  IpcTransportPort,
  IpcTransportReady,
  WindowSnapshotChannel,
  storageSnapshotNames,
  type WindowSnapshot,
} from "../shared/ipc-transport"
import { windowBootstrapFromArguments } from "../shared/window-bootstrap"

// The main process posts the port on `did-finish-load`, which can beat the renderer's module graph in
// development. Hold it until the renderer says its listener is attached, then hand it over once.
let pendingPort: MessagePort | undefined
let rendererReady = false

function offerPort() {
  if (!rendererReady || !pendingPort) return

  window.postMessage(IpcTransportPort, "*", [pendingPort])
  pendingPort = undefined
}

ipcRenderer.on(IpcTransportPort, (event) => {
  const port = event.ports[0]

  if (port) pendingPort = port

  offerPort()
})

window.addEventListener(IpcTransportReady, () => {
  rendererReady = true
  offerPort()
})

ipcRenderer.on(DragCancelEvent, () => window.dispatchEvent(new Event(DragCancelEvent)))

const bootstrap = windowBootstrapFromArguments(process.argv)

// Asked before the page runs, so the stores the shell reads are hydrated on the first render.
const snapshot: Promise<WindowSnapshot> = ipcRenderer
  .invoke(WindowSnapshotChannel, storageSnapshotNames(bootstrap.id))
  .catch(() => ({ storage: {} }))

contextBridge.exposeInMainWorld("electron", {
  windowID: bootstrap.id,
  bootstrap,
  storageSnapshot: snapshot.then((snapshot) => snapshot.storage),
  plugins: snapshot.then((snapshot) => snapshot.plugins),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
})
