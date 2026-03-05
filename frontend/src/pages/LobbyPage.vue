<template>
  <div class="lobby-page page-scroll">
    <div class="lobby-container">
      <!-- 顶部用户信息 -->
      <div class="user-bar card-box">
        <div class="user-info">
          <span class="user-avatar">{{ store.player?.avatar }}</span>
          <div class="user-text">
            <span class="user-name">{{ store.player?.nickname }}</span>
          </div>
        </div>
        <van-button size="mini" class="btn-gray logout-btn" @click="handleLogout">退出</van-button>
      </div>

      <!-- 标题 -->
      <div class="lobby-title">
        <span class="title-icon">🃏</span>
        <h2>游戏大厅</h2>
      </div>

      <!-- 创建房间 -->
      <div class="action-card card-box">
        <h3 class="action-title">🏠 创建新房间</h3>
        <p class="action-desc">创建一个房间，邀请朋友加入</p>

        <div class="blind-settings">
          <div class="blind-row">
            <span class="blind-label">小盲注</span>
            <div class="blind-options">
              <span
                v-for="v in blindOptions"
                :key="v"
                class="blind-opt"
                :class="{ active: createForm.smallBlind === v }"
                @click="createForm.smallBlind = v; createForm.bigBlind = v * 2"
              >{{ v }}</span>
            </div>
          </div>
          <div class="blind-row">
            <span class="blind-label">大盲注</span>
            <span class="blind-value gold">{{ createForm.bigBlind }}</span>
          </div>
          <div class="blind-row">
            <span class="blind-label">人数上限</span>
            <div class="blind-options">
              <span
                v-for="n in [4, 6, 8, 9]"
                :key="n"
                class="blind-opt"
                :class="{ active: createForm.maxPlayers === n }"
                @click="createForm.maxPlayers = n"
              >{{ n }}人</span>
            </div>
          </div>
        </div>

        <van-button
          block round size="large"
          class="btn-green action-btn"
          :loading="creating"
          @click="handleCreate"
        >
          创建房间
        </van-button>
      </div>

      <!-- 分隔线 -->
      <div class="divider">
        <span>或</span>
      </div>

      <!-- 加入房间 -->
      <div class="action-card card-box">
        <h3 class="action-title">🔗 加入房间</h3>
        <p class="action-desc">输入朋友分享的 6 位房间码</p>

        <van-field
          v-model="joinCode"
          placeholder="输入房间码（如 AB1234）"
          clearable
          :maxlength="6"
          class="code-input"
          style="text-transform: uppercase;"
          @input="joinCode = joinCode.toUpperCase()"
          @keyup.enter="handleJoin"
        />

        <van-button
          block round size="large"
          class="btn-gray action-btn"
          :loading="joining"
          @click="handleJoin"
        >
          加入房间
        </van-button>
      </div>

      <!-- 最近房间记录 -->
      <div v-if="recentRooms.length > 0" class="recent-rooms card-box">
        <h3 class="action-title" style="display:flex;align-items:center;justify-content:space-between;">
          ⏱ 最近加入
          <van-button size="mini" class="btn-gray" :loading="refreshing" @click="refreshRooms" style="font-size:11px;">🔄 刷新</van-button>
        </h3>
        <div
          v-for="r in recentRooms"
          :key="r.id"
          class="recent-item"
          @click="rejoinRoom(r)"
        >
          <span class="recent-icon">🃏</span>
          <div class="recent-info">
            <span class="recent-code">房间 {{ r.id }}</span>
            <span class="recent-time">{{ formatTime(r.joinedAt) }}</span>
          </div>
          <van-icon name="arrow" color="rgba(255,255,255,0.4)" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { showToast, showLoadingToast, closeToast } from 'vant'
import { connectSocket, getSocket } from '../utils/socket'

const router = useRouter()
const store = useGameStore()

const joinCode = ref('')
const creating = ref(false)
const joining = ref(false)
const refreshing = ref(false)
const blindOptions = [5, 10, 25, 50]
const recentRooms = ref([])
let autoRefreshTimer = null

const createForm = reactive({
  smallBlind: 10,
  bigBlind: 20,
  maxPlayers: 6
})

onMounted(() => {
  const saved = localStorage.getItem('poker_recent_rooms')
  if (saved) recentRooms.value = JSON.parse(saved)

  // ===== #19 房间设置持久化 =====
  const savedSettings = localStorage.getItem('poker_room_settings')
  if (savedSettings) {
    try {
      const s = JSON.parse(savedSettings)
      if (s.smallBlind) { createForm.smallBlind = s.smallBlind; createForm.bigBlind = s.bigBlind || s.smallBlind * 2 }
      if (s.maxPlayers) createForm.maxPlayers = s.maxPlayers
    } catch (e) { /* ignore */ }
  }

  // 确保 socket 已连接并认证
  const socket = connectSocket(store.player)

  // 收到服务端确认后，同步更新本地 player（以后端 id 为准）
  socket.once('player:auth:ok', ({ player: serverPlayer }) => {
    if (serverPlayer && serverPlayer.id !== store.player?.id) {
      store.setPlayer({ ...store.player, ...serverPlayer })
    }
  })

  // 监听创建成功
  socket.on('room:created', ({ room }) => {
    creating.value = false
    store.setRoom(room)
    saveRecentRoom(room.id)
    router.push(`/room/${room.id}`)
  })

  socket.on('error', ({ message }) => {
    creating.value = false
    joining.value = false
    showToast({ message: message || '操作失败', icon: 'fail' })
  })

  // 自动刷新（每 30 秒）
  autoRefreshTimer = setInterval(refreshRooms, 30000)
})

onUnmounted(() => {
  clearInterval(autoRefreshTimer)
  const socket = getSocket()
  socket.off('room:created')
  socket.off('error')
})

function handleCreate() {
  if (!store.player) {
    showToast('请先登录')
    return router.replace('/login')
  }
  creating.value = true
  // 保存房间设置
  localStorage.setItem('poker_room_settings', JSON.stringify({
    smallBlind: createForm.smallBlind,
    bigBlind: createForm.bigBlind,
    maxPlayers: createForm.maxPlayers
  }))
  const socket = getSocket()
  socket.emit('room:create', {
    smallBlind: createForm.smallBlind,
    bigBlind: createForm.bigBlind,
    maxPlayers: createForm.maxPlayers
  })
  // 超时兜底
  setTimeout(() => { creating.value = false }, 5000)
}

function handleJoin() {
  const code = joinCode.value.trim().toUpperCase()
  if (!code || code.length < 4) {
    showToast('请输入正确的房间码')
    return
  }
  joining.value = true
  const socket = getSocket()

  // 先向后端验证房间是否存在
  const onRoomUpdate = ({ room }) => {
    cleanup()
    joining.value = false
    if (room && room.id?.toUpperCase() === code) {
      store.setRoom(room)
      saveRecentRoom(code)
      router.push(`/room/${code}`)
    }
  }

  const onError = ({ message }) => {
    cleanup()
    joining.value = false
    showToast({ message: message || '加入失败', icon: 'fail' })
  }

  const cleanup = () => {
    socket.off('room:update', onRoomUpdate)
    socket.off('error', onError)
    clearTimeout(timer)
  }

  // 超时兜底
  const timer = setTimeout(() => {
    cleanup()
    joining.value = false
    showToast({ message: '加入超时，请重试', icon: 'fail' })
  }, 5000)

  socket.on('room:update', onRoomUpdate)
  socket.on('error', onError)
  socket.emit('room:join', { roomId: code, player: store.player })
}

function rejoinRoom(r) {
  router.push(`/room/${r.id}`)
}

function refreshRooms() {
  const saved = localStorage.getItem('poker_recent_rooms')
  if (saved) {
    refreshing.value = true
    recentRooms.value = JSON.parse(saved)
    setTimeout(() => { refreshing.value = false }, 500)
  }
}

function saveRecentRoom(id) {
  const rooms = recentRooms.value.filter(r => r.id !== id)
  rooms.unshift({ id, joinedAt: Date.now() })
  recentRooms.value = rooms.slice(0, 3)
  localStorage.setItem('poker_recent_rooms', JSON.stringify(recentRooms.value))
}

function formatTime(ts) {
  const d = new Date(ts)
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function handleLogout() {
  store.logout()
  router.replace('/login')
}
</script>

<style scoped>
.lobby-page {
  background: linear-gradient(160deg, #0d1b2a 0%, #1a1a2e 50%, #16213e 100%);
  min-height: 100dvh;
}

.lobby-container {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px 16px 40px;
}

/* 用户栏 */
.user-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin-bottom: 20px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  font-size: 32px;
}

.user-text {
  display: flex;
  flex-direction: column;
}

.user-name {
  color: #fff;
  font-weight: 700;
  font-size: 15px;
}

.user-chips {
  color: #f5c842;
  font-size: 13px;
}

.logout-btn {
  height: 30px !important;
  padding: 0 14px !important;
  font-size: 12px !important;
}

/* 标题 */
.lobby-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.title-icon {
  font-size: 28px;
}

.lobby-title h2 {
  color: #fff;
  font-size: 22px;
  font-weight: 800;
  margin: 0;
}

/* 操作卡片 */
.action-card {
  padding: 20px;
  margin-bottom: 16px;
}

.action-title {
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 4px;
}

.action-desc {
  color: rgba(255,255,255,0.45);
  font-size: 13px;
  margin: 0 0 16px;
}

.action-btn {
  height: 48px !important;
  font-size: 15px !important;
}

/* 盲注设置 */
.blind-settings {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.blind-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.blind-label {
  color: rgba(255,255,255,0.55);
  font-size: 13px;
  width: 50px;
  flex-shrink: 0;
}

.blind-value {
  font-size: 15px;
  font-weight: 700;
}

.blind-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.blind-opt {
  padding: 5px 12px;
  border-radius: 20px;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.6);
  font-size: 13px;
  cursor: pointer;
  border: 1.5px solid transparent;
  transition: all 0.2s;
}

.blind-opt.active {
  border-color: #f5c842;
  background: rgba(245,200,66,0.15);
  color: #f5c842;
  font-weight: 600;
}

/* 房间码输入 */
.code-input {
  background: rgba(255,255,255,0.08) !important;
  border-radius: 12px !important;
  margin-bottom: 16px;
  border: 1px solid rgba(255,255,255,0.15) !important;
  --van-field-input-text-color: #fff;
  --van-field-placeholder-text-color: rgba(255,255,255,0.35);
  letter-spacing: 4px;
  font-size: 18px;
}

:deep(.van-field__control) {
  color: #fff !important;
  font-size: 18px;
  letter-spacing: 4px;
  text-align: center;
}

/* 分隔线 */
.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 4px 0 16px;
  color: rgba(255,255,255,0.25);
  font-size: 13px;
}

.divider::before, .divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(255,255,255,0.12);
}

/* 最近房间 */
.recent-rooms {
  padding: 16px 20px;
  margin-bottom: 16px;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  cursor: pointer;
}

.recent-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.recent-icon {
  font-size: 20px;
}

.recent-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.recent-code {
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.recent-time {
  color: rgba(255,255,255,0.4);
  font-size: 12px;
}
</style>
