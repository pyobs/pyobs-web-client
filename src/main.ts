import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { syncWeatherWidgets } from './composables/useLinkedApps'
import './assets/main.css'

const app = createApp(App)
app.use(router)
app.mount('#app')

void syncWeatherWidgets()
