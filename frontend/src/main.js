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

// ===== #20 全局错误捕获 =====
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue errorHandler]', err, info)
  try {
    showToast({ message: '页面出错，请刷新重试', duration: 2500 })
  } catch (e) { /* ignore */ }
}

window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandledrejection]', event.reason)
  try {
    showToast({ message: '操作失败，请重试', duration: 2000 })
  } catch (e) { /* ignore */ }
})

app.mount('#app')

// ===== 全局监听 room:disbanded，自动回大厅 =====
// 在 mount 之后挂，确保 router 已就绪
import { getSocket } from './utils/socket'
import { showToast } from 'vant'

// 延迟一帧确保 socket 单例已初始化（页面会在 onMounted 里 connectSocket）
// 用轮询方式等 socket 就绪后绑定
let globalBound = false
const bindGlobalListeners = () => {
  try {
    const s = getSocket()
    if (globalBound) return
    globalBound = true

    // 房间解散
    s.on('room:disbanded', ({ message } = {}) => {
      showToast({ message: message || '房间已解散', icon: 'fail', duration: 2500 })
      router.replace('/lobby')
    })

    // 重连后自动恢复页面
    // player:auth:ok 会携带 inRoom 信息，表示玩家在某个房间中
    s.on('player:auth:ok', ({ player, inRoom } = {}) => {
      if (!inRoom) return

      const currentPath = router.currentRoute.value.path
      const { roomId, status } = inRoom

      // 如果玩家当前不在正确的页面，自动跳转
      if (status === 'playing' || status === 'round_end') {
        // 游戏进行中或轮间等待：跳转到游戏页面
        const targetPath = `/game/${roomId}`
        if (!currentPath.startsWith('/game/')) {
          console.log(`[Reconnect] 自动跳转到游戏页面: ${targetPath}`)
          showToast({ message: '已重新连接，恢复游戏', icon: 'success', duration: 1500 })
          router.replace(targetPath)
        }
      } else if (status === 'waiting') {
        // 等待中：跳转到房间页面
        const targetPath = `/room/${roomId}`
        if (!currentPath.startsWith('/room/') && !currentPath.startsWith('/game/')) {
          console.log(`[Reconnect] 自动跳转到房间页面: ${targetPath}`)
          showToast({ message: '已重新连接，回到房间', icon: 'success', duration: 1500 })
          router.replace(targetPath)
        }
      }
    })

    // 其他玩家重连通知
    s.on('player:reconnected', ({ nickname } = {}) => {
      if (nickname) {
        showToast({ message: `${nickname} 已重新连接`, icon: 'success', duration: 1500 })
      }
    })
  } catch (e) {
    // socket 尚未初始化，忽略
  }
}

// 路由变化时尝试绑定（首次进入游戏页后 socket 已就绪）
router.afterEach(bindGlobalListeners)
