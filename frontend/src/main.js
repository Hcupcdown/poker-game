import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import Vant from 'vant'
import 'vant/lib/index.css'
import App from './App.vue'

// 页面
import LoginPage from './pages/LoginPage.vue'
import LobbyPage from './pages/LobbyPage.vue'
import RoomPage from './pages/RoomPage.vue'
import GamePage from './pages/GamePage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: LoginPage },
    { path: '/lobby', component: LobbyPage },
    { path: '/room/:id', component: RoomPage },
    { path: '/game/:id', component: GamePage },
  ]
})

// 路由守卫：未登录跳转 login
router.beforeEach((to) => {
  const token = localStorage.getItem('poker_token')
  if (!token && to.path !== '/login') {
    return '/login'
  }
})

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.use(router)
app.use(Vant)
app.mount('#app')
