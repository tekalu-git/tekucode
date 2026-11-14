import { contrastRatio, generateScale, withAlpha } from "./color"
import type { HexColor } from "./types"
import { generateV2HueScale } from "./v2/resolve"

/**
 * Tokens that use the system accent instead of the selected theme's interactive hue.
 * Applied by the desktop shell only while the bundled default theme is selected.
 */
export function systemAccentTokens(color: HexColor, isDark: boolean): Record<string, string> {
  const interactive = generateScale(color, isDark)
  const blue = generateV2HueScale(color, isDark)
  const interBase = interactive[isDark ? 6 : 4]!
  const onInteractive = contrastRatio("#ffffff", interBase) > contrastRatio("#000000", interBase)
    ? "#ffffff"
    : "#000000"

  const tokens: Record<string, string> = {}

  const steps = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200]
  steps.forEach((step, index) => {
    tokens[`v2-blue-${step}`] = blue[index]!
  })

  Object.assign(tokens, {
    "v2-background-bg-accent": blue[5]!,
    "v2-text-text-accent": blue[isDark ? 3 : 5]!,
    "v2-text-text-accent-hover": blue[isDark ? 2 : 6]!,
    "v2-border-border-focus": blue[4]!,

    "surface-base-interactive-active": withAlpha(interactive[2]!, 0.3),
    "surface-interactive-base": interBase,
    "surface-interactive-hover": interactive[isDark ? 7 : 5]!,
    "surface-interactive-weak": interactive[isDark ? 5 : 3]!,
    "surface-interactive-weak-hover": interBase,

    "input-active": interactive[isDark ? 6 : 0]!,
    "input-selected": interactive[isDark ? 7 : 3]!,
    "input-focus": interactive[isDark ? 6 : 0]!,

    "text-interactive-base": interactive[isDark ? 10 : 9]!,
    "text-on-interactive-base": onInteractive,
    "text-on-interactive-weak": onInteractive,

    "border-selected": withAlpha(interactive[8]!, isDark ? 0.9 : 0.99),
    "border-strong-selected": withAlpha(interactive[5]!, 0.6),
    "border-weak-selected": withAlpha(interactive[4]!, isDark ? 0.6 : 0.5),
    "border-interactive-base": interactive[6]!,
    "border-interactive-hover": interactive[7]!,
    "border-interactive-active": interactive[8]!,
    "border-interactive-selected": interactive[8]!,
    "border-interactive-focus": interactive[8]!,

    "icon-interactive-base": interactive[8]!,
    "icon-agent-build-base": interactive[isDark ? 10 : 8]!,
  })

  return tokens
}
