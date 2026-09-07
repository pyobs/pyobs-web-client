import { createRouter, createWebHistory, type RouteLocationRaw } from 'vue-router'
import { useXmpp } from '@/composables/useXmpp'
import DashboardView from '@/views/DashboardView.vue'
import ShellView from '@/views/ShellView.vue'
import ModulePageView from '@/views/ModulePageView.vue'
import LoggingView from '@/views/LoggingView.vue'
import EventsView from '@/views/EventsView.vue'
import SettingsView from '@/views/SettingsView.vue'
import MoreView from '@/views/MoreView.vue'
import LoginView from '@/views/LoginView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
      meta: { requiresAuth: true },
    },
    {
      path: '/shell',
      name: 'shell',
      component: ShellView,
      meta: { requiresAuth: true },
    },
    {
      path: '/module/:jid/:tab?',
      name: 'module',
      component: ModulePageView,
      meta: { requiresAuth: true },
    },
    // The 7 routes below are what /module/:jid/:tab replaces — see
    // specs/plans/module-page-rework.md. Kept as redirects, not deleted outright, so existing
    // bookmarks/links keep working: with a :jid, straight to that module's matching tab; without
    // one (the old "pick a module for me" case), to Dashboard instead of guessing — Dashboard is
    // already "go pick a module".
    ...(
      [
        ['roof', 'roof'],
        ['mode', 'mode'],
        ['weather', 'weather'],
        ['autofocus', 'autofocus'],
        ['autoguiding', 'autoguiding'],
        ['acquisition', 'acquisition'],
        ['camera', 'camera'],
      ] as const
    ).map(([routeName, tab]) => ({
      path: `/${routeName}/:jid?`,
      name: routeName,
      redirect: (to: { params: { jid?: string } }): RouteLocationRaw =>
        to.params.jid ? { name: 'module', params: { jid: to.params.jid, tab } } : { name: 'dashboard' },
    })),
    {
      path: '/logging',
      name: 'logging',
      component: LoggingView,
      meta: { requiresAuth: true },
    },
    {
      path: '/events',
      name: 'events',
      component: EventsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/more',
      name: 'more',
      component: MoreView,
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach((to) => {
  const { status } = useXmpp()
  // During 'connecting', the App.vue spinner is shown — don't redirect yet.
  // Only block access when we know the user is not (and won't be) authenticated.
  if (to.meta.requiresAuth && status.value !== 'connected' && status.value !== 'connecting') {
    return { name: 'login' }
  }
  if (to.name === 'login' && status.value === 'connected') {
    return { name: 'dashboard' }
  }
})

export default router
