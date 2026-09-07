<script setup lang="ts">
import { computed } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import ModeModuleCard from '@/components/ModeModuleCard.vue'

// One tab on ModulePageView.vue now — see specs/plans/module-page-rework.md.
const props = defineProps<{ jid: string }>()
const { modules } = useXmpp()

const currentModule = computed(() => modules.value.find((m) => m.jid === props.jid))
</script>

<template>
  <div v-if="currentModule" class="d-flex flex-column gap-2">
    <ModeModuleCard :key="currentModule.jid" :mod="currentModule" />
  </div>
</template>
