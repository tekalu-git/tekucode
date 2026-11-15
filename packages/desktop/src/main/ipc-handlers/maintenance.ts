import { Effect } from "effect"
import { MaintenanceRpcs } from "../../shared/ipc-rpc"
import { MaintenanceProgress } from "../../shared/ipc-rpc/events"
import { emitIpcEvent } from "../ipc-events"
import { Maintenance } from "../maintenance"
import { getMainWindows } from "../windows"

export const maintenanceHandlers = MaintenanceRpcs.toLayer(
  Effect.gen(function* () {
    const maintenance = yield* Maintenance.Service

    return MaintenanceRpcs.of({
      MaintenanceStatus: () => maintenance.status,
      MaintenanceWipe: (payload) =>
        maintenance.wipe(
          { rotate: payload.rotate, country: payload.country, password: payload.password },
          (progress) => {
            const event = new MaintenanceProgress(progress)

            for (const win of getMainWindows()) emitIpcEvent(win.webContents, event)
          },
        ),
    })
  }),
)
