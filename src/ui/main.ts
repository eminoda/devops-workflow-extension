import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import '@/assets/index.css'
import 'virtual:uno.css'
import App from './App.vue'
import Dashboard from './views/Dashboard.vue'
import Settings from './views/Settings.vue'
import Jobs from './views/Jobs.vue'
const routes = [
  { path: '/', name: 'dashboard', component: Dashboard },
  { path: '/settings', name: 'settings', component: Settings },
  { path: '/jobs', name: 'jobs', component: Jobs },
]

export const router = createRouter({ history: createWebHashHistory(), routes })

const app = createApp(App)
app.use(router)
app.mount('#app')
