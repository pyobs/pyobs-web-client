<script setup lang="ts">
import type { FieldSchema } from '@/pyobs-codec'
import { unwrapOptional, widgetKind, enumOptions, formatWireType } from '@/pyobs-codec'

defineProps<{
  fields: FieldSchema[]
  enums: Record<string, string[]>
  testid?: string
}>()

const paramValues = defineModel<Record<string, string>>({ required: true })
</script>

<template>
  <div v-if="fields.length" class="mb-2" :data-testid="testid">
    <div v-for="param in fields" :key="param.name" class="mb-2">
      <div class="d-flex align-items-baseline gap-2 mb-1">
        <label class="form-label mb-0 text-muted" style="font-size:0.8rem">
          {{ param.name }}
          <span v-if="unwrapOptional(param.type).optional" class="text-secondary" style="font-size:0.7rem">(optional)</span>
        </label>
        <span class="text-secondary" style="font-size:0.7rem">
          {{ formatWireType(param.type) }}
          <span v-if="param.unit">({{ param.unit }})</span>
        </span>
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
        <option value="">—</option>
        <option v-for="opt in enumOptions(param.type, enums)" :key="opt" :value="opt">{{ opt }}</option>
      </select>
      <input
        v-else-if="widgetKind(unwrapOptional(param.type).inner) !== 'unsupported'"
        v-model="paramValues[param.name]"
        :type="widgetKind(unwrapOptional(param.type).inner) === 'number' ? 'number' : 'text'"
        class="form-control form-control-sm bg-dark border-secondary text-light"
      />
      <span v-else class="text-danger" style="font-size:0.75rem">unsupported param type</span>
    </div>
  </div>
  <p v-else class="text-muted mb-2" style="font-size:0.85rem">No parameters.</p>
</template>
