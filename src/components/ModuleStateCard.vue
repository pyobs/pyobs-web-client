<script setup lang="ts">
import { onUnmounted } from 'vue'
import { useXmpp } from '@/composables/useXmpp'
import KeyValueCard from '@/components/KeyValueCard.vue'

// Subscribes to one module/interface's live state for the lifetime of this
// component instance — Vue's v-for mount/unmount (keyed by jid+interface)
// gives us correct ref-counted subscribe/unsubscribe for free.
const props = defineProps<{ jid: string; interfaceName: string; version: number; title: string }>()

const { subscribeState } = useXmpp()
const { value, unsubscribe } = subscribeState(props.jid, props.interfaceName, props.version)

onUnmounted(unsubscribe)
</script>

<template>
  <KeyValueCard v-if="value !== undefined" :title="title" :value="value" />
</template>
