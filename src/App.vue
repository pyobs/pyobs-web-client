<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import LoginView from '@/views/LoginView.vue'
import { useXmpp } from '@/composables/useXmpp'

const { status } = useXmpp()
const route = useRoute()

const isAuthenticated = computed(() => status.value === 'connected')
</script>

<template>
  <LoginView v-if="!isAuthenticated" />
  <AppLayout v-else />
</template>
