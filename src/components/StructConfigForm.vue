<script setup lang="ts">
// Recursive renderer for IStructuredConfig's (possibly nested) ConfigSchema —
// the Phase 2/3 half of specs/plans/2026-09-07-structured-config-widget.md.
// One instance per nesting level: an `object`-typed field with a `nested`
// schema recurses into another <StructConfigForm> (Vue SFCs self-reference by
// filename, no explicit registration needed); a field with no `nested` schema
// (a pydantic opaque/freeform dict) has nothing to render — it still
// round-trips unchanged, same as pyobs-gui's placeholder passthrough, just
// via ConfigView.vue's structuredClone-of-base-state approach rather than a
// per-field raw-value cache.
//
// Every level shares one flat `Record<string, string>` v-model, keyed by
// dot-path (e.g. "nested.threshold") — not a nested object — so a field name
// reused at different nesting depths never collides, and the same object
// reference threads through every recursion level exactly like CameraView.vue
// threads `settingsParams` through multiple <ParamForm> instances.
import { computed } from 'vue'
import {
  ACCESS_LEVEL_HIDDEN,
  ACCESS_LEVEL_EXPERT,
  widgetKind,
  formatWireType,
  type ConfigFieldSchemaWire,
  type WireType,
} from '@/pyobs-codec'

const props = defineProps<{
  fields: Record<string, ConfigFieldSchemaWire>
  path?: string // dot-path prefix for this level's fields; '' at the root
  showExpert: boolean
  testid?: string
}>()

const values = defineModel<Record<string, string>>({ required: true })

const SCALAR_TYPE_MAP: Record<'str' | 'int' | 'float' | 'bool', WireType> = {
  str: 'string',
  int: 'int32',
  float: 'float64',
  bool: 'bool',
}

function wireTypeFor(name: string, f: ConfigFieldSchemaWire): WireType {
  return f.type === 'enum' ? { kind: 'enum', name } : SCALAR_TYPE_MAP[f.type as 'str' | 'int' | 'float' | 'bool']
}

const visibleEntries = computed(() =>
  Object.entries(props.fields).filter(([, f]) => f.level !== ACCESS_LEVEL_HIDDEN && (f.level !== ACCESS_LEVEL_EXPERT || props.showExpert)),
)

function pathFor(name: string): string {
  return `${props.path ?? ''}${name}`
}
</script>

<template>
  <div v-if="visibleEntries.length" :data-testid="testid">
    <template v-for="[name, f] in visibleEntries" :key="name">
      <!-- nested object with a known schema: recurse -->
      <div v-if="f.type === 'object' && f.nested" class="pyobs-card mb-2">
        <div class="text-muted fw-semibold mb-1" style="font-size:0.75rem">{{ name }}</div>
        <p v-if="f.description" class="text-secondary mb-2" style="font-size:0.7rem">{{ f.description }}</p>
        <StructConfigForm v-model="values" :fields="f.nested" :path="`${pathFor(name)}.`" :show-expert="showExpert" />
      </div>

      <!-- opaque object (pydantic freeform dict, no published field list) — no
           schema to build an editor from; round-trips unchanged (see file
           header), just flagged here rather than silently vanishing -->
      <div v-else-if="f.type === 'object'" class="mb-2">
        <div class="text-muted mb-1" style="font-size:0.8rem">{{ name }} <span class="text-secondary" style="font-size:0.7rem">(not editable here)</span></div>
      </div>

      <!-- scalar/enum leaf field -->
      <div v-else class="mb-2">
        <div class="d-flex align-items-baseline gap-2 mb-1">
          <label class="form-label mb-0 text-muted" style="font-size:0.8rem">{{ name }}</label>
          <span class="text-secondary" style="font-size:0.7rem">
            {{ formatWireType(wireTypeFor(name, f)) }}
            <span v-if="f.unit">({{ f.unit }})</span>
          </span>
        </div>
        <p v-if="f.description" class="text-secondary mb-1" style="font-size:0.7rem">{{ f.description }}</p>
        <select
          v-if="widgetKind(wireTypeFor(name, f)) === 'bool'"
          v-model="values[pathFor(name)]"
          class="form-select form-select-sm bg-dark border-secondary text-light"
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
        <select
          v-else-if="widgetKind(wireTypeFor(name, f)) === 'enum'"
          v-model="values[pathFor(name)]"
          class="form-select form-select-sm bg-dark border-secondary text-light"
        >
          <option v-for="opt in f.options ?? []" :key="opt" :value="opt">{{ opt }}</option>
        </select>
        <input
          v-else
          v-model="values[pathFor(name)]"
          :type="widgetKind(wireTypeFor(name, f)) === 'number' ? 'number' : 'text'"
          class="form-control form-control-sm bg-dark border-secondary text-light"
        />
      </div>
    </template>
  </div>
</template>
