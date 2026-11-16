import { expect, test } from "bun:test"
import { App } from "@opencode/core/app"

test("formats app metadata as a user agent", () => {
  expect(App.useragent(App.make({ name: "sdk", version: "1.2.3", channel: "beta" }))).toBe("opencode/beta/1.2.3/sdk")
})

test("advertises the upstream base version to the Console", () => {
  expect(App.consoleUseragent(App.make({ name: "desktop", version: "0.1.0", channel: "latest" }))).toBe(
    "opencode/latest/2.3.0/desktop",
  )
})
