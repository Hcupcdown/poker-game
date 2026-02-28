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

// ===== 禁用浏览器前进/后退 =====
// 原理：每次路由变化都向 history 压入当前路径，
// 用户按后退时 popstate 触发，强制再推回来，形成"原地"效果。
router.afterEach((to) => {
  // 每次导航后压一条同路径记录，让后退变成停留原地
  history.pushState(null, '', to.fullPath)
})

window.addEventListener('popstate', () => {
  // 用户触发了前进/后退，立即推回当前路由
  history.pushState(null, '', router.currentRoute.value.fullPath)
})

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.use(router)
app.use(Vant)
app.mount('#app')

// ===== 全局监听 room:disbanded，自动回大厅 =====
// 在 mount 之后挂，确保 router 已就绪
import { getSocket } from './utils/socket'
import { showToast } from 'vant'

// 延迟一帧确保 socket 单例已初始化（页面会在 onMounted 里 connectSocket）
// 用轮询方式等 socket 就绪后绑定
let disbandBound = false
const bindDisbandListener = () => {
  try {
    const s = getSocket()
    if (disbandBound) return
    disbandBound = true
    s.on('room:disbanded', ({ message } = {}) => {
      showToast({ message: message || '房间已解散', icon: 'fail', duration: 2500 })
      router.replace('/lobby')
    })
  } catch (e) {
    // socket 尚未初始化，忽略
  }
}

// 路由变化时尝试绑定（首次进入游戏页后 socket 已就绪）
router.afterEach(bindDisbandListener)
