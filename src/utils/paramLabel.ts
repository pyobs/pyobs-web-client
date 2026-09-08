// Humanizes a wire param/field name (ParamForm.vue, StructConfigForm.vue) —
// the raw snake_case name from a pyobs-core method signature or structured
// config field, e.g. "exposure_time" -> "Exposure Time". Generic
// underscore-split + capitalize handles most names; a handful of domain
// abbreviations (astronomical coordinates, offsets, pyobs-core's own
// non-obvious short names) title-case into nonsense or lose meaning, so each
// underscore-separated word is checked against this override table first.
// See issue #44.
const WORD_OVERRIDES: Record<string, string> = {
  ra: 'RA',
  dra: 'Δ RA',
  ddec: 'Δ Dec',
  dalt: 'Δ Alt',
  daz: 'Δ Az',
  mu: 'μ',
  psi: 'ψ',
  fmt: 'Format',
}

function humanizeWord(word: string): string {
  const override = WORD_OVERRIDES[word.toLowerCase()]
  if (override) return override
  return word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word
}

export function humanizeParamName(name: string): string {
  return name
    .split('_')
    .filter((w) => w.length > 0)
    .map(humanizeWord)
    .join(' ')
}
