// TekuCode's wordmark, one entry per glyph: the counter shadow, the stem, and whether the glyph
// belongs to "code" (the strong half of the mark).
export const glyphs = [
  { weak: "M0 6H24V12H0Z", stem: "M0 6H24V12H15V36H9V12H0V6Z", strong: false },
  { weak: "M54 24V30H36V24H54Z", stem: "M36 12V18H48V12H36ZM54 24H36V30H54V36H30V6H54V24Z", strong: false },
  { weak: "M66 24L72 18L78 30H72L66 24Z", stem: "M60 6H66V18L78 6H84L72 20L84 36H78L69 24L66 27V36H60V6Z", strong: false },
  { weak: "M96 30H108V36H96Z", stem: "M90 6H96V30H108V6H114V36H90V6Z", strong: false },
  { weak: "M144 30H126V18H144V30Z", stem: "M144 12H126V30H144V36H120V6H144V12Z", strong: true },
  { weak: "M168 30H156V18H168V30Z", stem: "M168 12H156V30H168V12ZM174 36H150V6H174V36Z", strong: true },
  { weak: "M198 30H186V18H198V30Z", stem: "M198 12H186V30H198V12ZM204 36H180V6H198V0H204V36Z", strong: true },
  { weak: "M234 24V30H216V24H234Z", stem: "M216 12V18H228V12H216ZM234 24H216V30H234V36H210V6H234V24Z", strong: true },
] as const

export const viewBox = "0 0 234 42"
