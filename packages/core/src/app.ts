export * as App from "./app.js"

import { Context, Layer } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"

export interface Info {
  readonly name: string
  readonly version: string
  readonly channel: string
}

export class Service extends Context.Service<Service, Info>()("@opencode/App") {}

export function make(input: Partial<Info> = {}): Info {
  return {
    name: input.name ?? "opencode",
    version: input.version ?? "unknown",
    channel: input.channel ?? "unknown",
  }
}

export function useragent(app: Info) {
  return `opencode/${app.channel}/${app.version}/${app.name}`
}

/**
 * The upstream release TekuCode tracks. The Console reads the version out of the User-Agent and
 * refuses free-tier inference to anything older than 1.18.0, so a fork that numbers its own releases
 * from 0.x reports the base it was forked from instead of the product version.
 */
export const consoleVersion = "2.3.0"

/** The User-Agent for Console requests: same client, advertised at the upstream compatibility version. */
export function consoleUseragent(app: Info) {
  return `opencode/${app.channel}/${consoleVersion}/${app.name}`
}

export const layer = (input?: Partial<Info>) => Layer.succeed(Service, make(input))

export const configured = (input?: Partial<Info>) =>
  makeGlobalNode({ service: Service, layer: layer(input), deps: [] })

export const node = configured()
