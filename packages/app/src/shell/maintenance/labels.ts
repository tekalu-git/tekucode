import type { useLanguage } from "@/runtime/i18n/language"

type Language = ReturnType<typeof useLanguage>

type Key = Parameters<Language["t"]>[0]

const countries = {
  nl: "maintenance.country.nl",
  ca: "maintenance.country.ca",
  us: "maintenance.country.us",
  sg: "maintenance.country.sg",
  nl2: "maintenance.country.nl2",
  nl3: "maintenance.country.nl3",
  ro: "maintenance.country.ro",
  ch: "maintenance.country.ch",
  sg2: "maintenance.country.sg2",
  us1: "maintenance.country.us1",
} satisfies Record<string, Key>

const steps = {
  vpn: "maintenance.step.vpn",
  stop: "maintenance.step.stop",
  snapshot: "maintenance.step.snapshot",
  wipe: "maintenance.step.wipe",
  restore: "maintenance.step.restore",
  start: "maintenance.step.start",
} satisfies Record<string, Key>

function lookup(table: Record<string, Key>, value: string) {
  return Object.hasOwn(table, value) ? table[value] : undefined
}

/** A discovered config carries its own label, so new tunnels need no translation key. */
export function countryLabel(
  country: string,
  language: Language,
  configs?: readonly { id: string; label: string }[],
) {
  const config = configs?.find((item) => item.id === country)

  if (config) return config.label

  const key = lookup(countries, country)

  return key ? language.t(key) : country
}

export function stepLabelKey(step: string): Key {
  return lookup(steps, step) ?? "maintenance.step.vpn"
}
