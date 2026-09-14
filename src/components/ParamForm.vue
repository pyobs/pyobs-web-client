<script setup lang="ts">
import type { FieldSchema, WireType } from '@/pyobs-codec'
import { unwrapOptional, widgetKind, enumOptions } from '@/pyobs-codec'
import { humanizeParamName } from '@/utils/paramLabel'

const props = defineProps<{
  fields: FieldSchema[]
  enums: Record<string, string[]>
  // Struct field lists, keyed by name — see InterfaceSchema.structs. Only needed for a
  // struct<Name>-typed field to render as a real nested form instead of the "unsupported"
  // fallback; every existing caller that never has one just omits it. See
  // specs/plans/2026-08-03-struct-typed-command-params.md.
  structs?: Record<string, FieldSchema[]>
  // Dot-path prefix for this level's own field keys (e.g. "elements." one level into a struct
  // param named "elements") — '' at the root. Mirrors StructConfigForm.vue's own convention
  // exactly: every nesting level shares one flat paramValues model by reference (v-model="paramValues"
  // recursing straight through, not a per-level slice), disambiguated by dot-path key alone. An
  // earlier version instead gave a struct field its own JSON-stringified sub-object and a manual
  // :model-value/@update wiring — that lost keystrokes on the first field or two typed into
  // quickly (a stale-snapshot race, found live-testing against pyobs-core#898's real wire shape).
  // This flat-key approach shares the exact same reactive object at every depth, so it can't.
  path?: string
  testid?: string
  // Two-fields-per-row grid instead of one full-width field per row — for
  // groups of short fields (binning/gain/image-format dropdowns) where a
  // stacked layout wastes mobile vertical space. See issue #33.
  compact?: boolean
  // Per-field min/max for number inputs, keyed by field name — e.g. the
  // Camera page's window widget bounds left/top/width/height by the
  // module's advertised full-frame size (see issue #43). Fields not present
  // here render with no constraint, same as before.
  limits?: Record<string, { min?: number; max?: number }>
}>()

const paramValues = defineModel<Record<string, string>>({ required: true })

function pathFor(name: string): string {
  return `${props.path ?? ''}${name}`
}

function limitFor(name: string): { min?: number; max?: number } {
  return props.limits?.[name] ?? {}
}

function kindOf(type: WireType): ReturnType<typeof widgetKind> {
  return widgetKind(unwrapOptional(type).inner, props.structs ?? {})
}

function structFieldsFor(type: WireType): FieldSchema[] {
  const inner = unwrapOptional(type).inner
  return typeof inner === 'object' && inner.kind === 'struct' ? (props.structs?.[inner.name] ?? []) : []
}
</script>

<template>
  <div v-if="fields.length" class="mb-2" :class="{ 'param-form-grid': compact }" :data-testid="testid">
    <div v-for="param in fields" :key="param.name" :class="compact ? '' : 'mb-2'">
      <div class="d-flex align-items-baseline gap-2 mb-1">
        <label class="form-label mb-0 text-muted" style="font-size:0.8rem">
          {{ humanizeParamName(param.name) }}
          <span v-if="unwrapOptional(param.type).optional" class="text-secondary" style="font-size:0.7rem">(optional)</span>
        </label>
        <span v-if="param.unit" class="text-secondary" style="font-size:0.7rem">({{ param.unit }})</span>
      </div>
      <select
        v-if="kindOf(param.type) === 'bool'"
        v-model="paramValues[pathFor(param.name)]"
        class="form-select form-select-sm bg-dark border-secondary text-light"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
      <select
        v-else-if="kindOf(param.type) === 'enum'"
        v-model="paramValues[pathFor(param.name)]"
        class="form-select form-select-sm bg-dark border-secondary text-light"
      >
        <option v-if="unwrapOptional(param.type).optional" value="">—</option>
        <option v-for="opt in enumOptions(param.type, enums)" :key="opt" :value="opt">{{ opt }}</option>
      </select>
      <!-- One level of nesting only (matches pyobs-core#898's own depth cap) — a struct field's
           own struct sub-field either has its field list published too (renders fine, another
           level of this same recursion) or doesn't (that inner field falls back to "unsupported"
           inside the nested ParamForm, same as at the top level). Shares this exact same
           paramValues object by reference, not a copy — see the `path` prop doc above. -->
      <ParamForm
        v-else-if="kindOf(param.type) === 'struct'"
        v-model="paramValues"
        class="ps-2 mt-1 border-start border-secondary"
        :fields="structFieldsFor(param.type)"
        :enums="enums"
        :structs="structs"
        :path="`${pathFor(param.name)}.`"
      />
      <input
        v-else-if="kindOf(param.type) !== 'unsupported'"
        v-model="paramValues[pathFor(param.name)]"
        :type="kindOf(param.type) === 'number' ? 'number' : 'text'"
        :min="kindOf(param.type) === 'number' ? limitFor(param.name).min : undefined"
        :max="kindOf(param.type) === 'number' ? limitFor(param.name).max : undefined"
        class="form-control form-control-sm bg-dark border-secondary text-light"
      />
      <span v-else class="text-danger" style="font-size:0.75rem">unsupported param type</span>
    </div>
  </div>
  <p v-else class="text-muted mb-2" style="font-size:0.85rem">No parameters.</p>
</template>

<style scoped>
.param-form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  column-gap: 0.75rem;
}
</style>
