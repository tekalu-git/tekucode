import { expect, test } from "bun:test"
import {
  COCKPIT_MIN_WIDTH,
  COCKPIT_RIGHT_RAIL_MAX_WIDTH,
  COCKPIT_RIGHT_RAIL_MIN_WIDTH,
  COCKPIT_RIGHT_RAIL_WIDTH,
  clampCockpitRightRail,
  cockpitFits,
} from "../src/ui/layout"
import { formatElapsed, formatTokens } from "../src/util/cockpit"

test("cockpit switches on at 110 columns", () => {
  expect(cockpitFits(COCKPIT_MIN_WIDTH - 1)).toBe(false)
  expect(cockpitFits(COCKPIT_MIN_WIDTH)).toBe(true)
})

test("right rail width clamps to its range and keeps the transcript usable", () => {
  expect(clampCockpitRightRail(10, 160)).toBe(COCKPIT_RIGHT_RAIL_MIN_WIDTH)
  expect(clampCockpitRightRail(99, 160)).toBe(COCKPIT_RIGHT_RAIL_MAX_WIDTH)
  expect(clampCockpitRightRail(COCKPIT_RIGHT_RAIL_WIDTH, 160)).toBe(COCKPIT_RIGHT_RAIL_WIDTH)
  expect(clampCockpitRightRail(COCKPIT_RIGHT_RAIL_WIDTH, 60)).toBe(COCKPIT_RIGHT_RAIL_MIN_WIDTH)
})

test("formats token counts compactly", () => {
  expect(formatTokens(0)).toBe("0")
  expect(formatTokens(999)).toBe("999")
  expect(formatTokens(1500)).toBe("1.5k")
  expect(formatTokens(250_000)).toBe("250k")
  expect(formatTokens(1_200_000)).toBe("1.2m")
})

test("formats elapsed time as seconds, minutes, or hours", () => {
  expect(formatElapsed(0)).toBe("0s")
  expect(formatElapsed(9_400)).toBe("9s")
  expect(formatElapsed(65_000)).toBe("1m05s")
  expect(formatElapsed(3_725_000)).toBe("1h02m")
})
