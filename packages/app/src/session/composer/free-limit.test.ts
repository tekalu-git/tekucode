import { expect, test } from "bun:test"
import { freeLimitActive } from "./free-limit"

test("a reset time still in the future keeps the lockout active", () => {
  expect(freeLimitActive(2_000, 1_000)).toBe(true)
})

test("no reset, a passed reset, or the exact reset moment is not active", () => {
  expect(freeLimitActive(null, 1_000)).toBe(false)
  expect(freeLimitActive(500, 1_000)).toBe(false)
  expect(freeLimitActive(1_000, 1_000)).toBe(false)
})
