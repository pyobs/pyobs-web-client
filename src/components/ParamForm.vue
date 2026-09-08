<script setup lang="ts">
import type { FieldSchema } from '@/pyobs-codec'
import { unwrapOptional, widgetKind, enumOptions } from '@/pyobs-codec'
import { humanizeParamName } from '@/utils/paramLabel'

const props = defineProps<{
  fields: FieldSchema[]
  enums: Record<string, string[]>
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

function limitFor(name: string): { min?: number; max?: number } {
  return props.limits?.[name] ?? {}
}

const paramValues = defineModel<Record<string, string>>({ required: true })
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
        v-if="widgetKind(unwrapOptional(param.type).inner) === 'bool'"
        v-model="paramValues[param.name]"
        class="form-select form-select-sm bg-dark border-secondary text-light"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
      <select
        v-else-if="widgetKind(unwrapOptional(param.type).inner) === 'enum'"
        v-model="paramValues[param.name]"
        class="form-select form-select-sm bg-dark border-secondary text-light"
      >
        <option v-if="unwrapOptional(param.type).optional" value="">—</option>
        <option v-for="opt in enumOptions(param.type, enums)" :key="opt" :value="opt">{{ opt }}</option>
      </select>
      <input
        v-else-if="widgetKind(unwrapOptional(param.type).inner) !== 'unsupported'"
        v-model="paramValues[param.name]"
        :type="widgetKind(unwrapOptional(param.type).inner) === 'number' ? 'number' : 'text'"
        :min="widgetKind(unwrapOptional(param.type).inner) === 'number' ? limitFor(param.name).min : undefined"
        :max="widgetKind(unwrapOptional(param.type).inner) === 'number' ? limitFor(param.name).max : undefined"
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
