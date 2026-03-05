<template>
  <div class="room-page page-scroll">
    <div class="room-container">
      <!-- 顶部导航 -->
      <div class="room-header">
        <van-button icon="arrow-left" size="mini" class="btn-gray back-btn" @click="handleBack">返回</van-button>
        <div class="room-id-area">
          <span class="room-label">房间号</span>
          <span class="room-id gold">{{ roomId }}</span>
          <van-button size="mini" class="btn-gray copy-btn" @click="copyCode">
            <van-icon name="copy-o" /> 复制
          </van-button>
        </div>
      </div>

      <!-- 房间信息 -->
      <div class="room-info card-box">
        <div class="info-row">
          <span class="info-label">盲注</span>
          <span class="info-val gold">{{ room.smallBlind }} / {{ room.bigBlind }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">上限</span>
          <span class="info-val">{{ room.maxPlayers }} 人</span>
        </div>
        <div class="info-row">
          <span class="info-label">状态</span>
          <span class="info-val status-waiting">等待中…</span>
        </div>
      </div>

      <!-- 房主快捷设置按钮 -->
      <div v-if="isOwner" class="owner-actions">
        <div class="action-btn card-box" @click="showBotPopup = true">
          <span class="action-icon">🤖</span>
          <span class="action-label">添加机器人</span>
          <span class="action-arrow">›</span>
        </div>
        <div class="action-btn card-box" @click="showChipsPopup = true">
          <span class="action-icon">💰</span>
          <span class="action-label">筹码 <span class="action-val gold">{{ startChips.toLocaleString() }}</span></span>
          <span class="action-arrow">›</span>
        </div>
      </div>

      <!-- 玩家列表 -->
      <div class="players-section">
        <h3 class="section-title">
          玩家（{{ players.length }}/{{ room.maxPlayers }}）
          <span class="online-dot"></span>
        </h3>

        <div class="player-list">
          <transition-group name="slide-up">
            <div
              v-for="(p, i) in players"
              :key="p.id"
              class="player-item card-box"
              :class="{ 'is-me': p.id === store.player?.id, 'is-owner': p.id === room.ownerId, 'is-bot': p.isBot }"
            >
              <div class="player-seat">{{ i + 1 }}</div>
              <div class="player-avatar">{{ p.avatar }}</div>
              <div class="player-info">
                <div class="player-name">
                  {{ p.nickname }}
                  <span v-if="p.isBot" class="bot-badge">🤖 Bot</span>
                  <span v-if="p.id === room.ownerId && !p.isBot" class="owner-badge">房主</span>
                <span v-if="p.id === store.player?.id" class="me-badge">我</span>
                </div>
              </div>
              <div class="player-right">
                <!-- 房主可删除机器人 -->
                <van-button
                  v-if="isOwner && p.isBot"
                  size="mini"
                  class="btn-remove-bot"
                  @click="removeBot(p.id)"
                >×</van-button>
                <span v-else class="player-ready">
                  <span class="ready-icon" v-if="!p.isBot && p.connected !== false">{{ p.id === store.player?.id ? '🟢' : '🟡' }}</span>
                  <span class="ready-icon" v-if="p.isBot">🤖</span>
                  <span class="offline-icon" v-if="!p.isBot && p.connected === false">🔴</span>
                </span>
              </div>
            </div>
          </transition-group>

          <!-- 空位 -->
          <div
            v-for="i in emptySeats"
            :key="'empty-' + i"
            class="player-item empty-seat card-box"
          >
            <div class="player-seat">{{ players.length + i }}</div>
            <div class="empty-avatar">?</div>
            <div class="player-info">
              <span class="empty-text">等待加入…</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 添加机器人弹出卡片 -->
      <van-popup
        v-model:show="showBotPopup"
        position="bottom"
        round
        :style="{ maxWidth: '480px', margin: '0 auto' }"
      >
        <div class="popup-card">
          <div class="popup-header">
            <span class="popup-title">🤖 添加机器人</span>
            <span class="popup-close" @click="showBotPopup = false">✕</span>
          </div>
          <p class="popup-desc">选择机器人难度后点击添加</p>
          <div class="bot-level-select">
            <div
              v-for="opt in botLevelOptions"
              :key="opt.value"
              class="level-option"
              :class="{ selected: selectedBotLevel === opt.value }"
              @click="selectedBotLevel = opt.value"
            >
              <span class="level-emoji">{{ opt.emoji }}</span>
              <span class="level-text">{{ opt.label }}</span>
            </div>
          </div>
          <van-button
            block round size="large"
            class="popup-confirm-btn btn-bot"
            :disabled="room.players && players.length >= room.maxPlayers"
            @click="addBotAndClose"
          >
            + 添加机器人
          </van-button>
          <p v-if="players.length >= room.maxPlayers" class="popup-hint">房间已满，无法继续添加</p>
        </div>
      </van-popup>

      <!-- 初始筹码弹出卡片 -->
      <van-popup
        v-model:show="showChipsPopup"
        position="bottom"
        round
        :style="{ maxWidth: '480px', margin: '0 auto' }"
      >
        <div class="popup-card">
          <div class="popup-header">
            <span class="popup-title">💰 初始筹码</span>
            <span class="popup-close" @click="showChipsPopup = false">✕</span>
          </div>
          <p class="popup-desc">选择每位玩家的初始筹码数量</p>
          <div class="chips-options">
            <div
              v-for="amount in chipOptions"
              :key="amount"
              class="chip-option"
              :class="{ selected: startChips === amount }"
              @click="startChips = amount"
            >
              {{ amount.toLocaleString() }}
            </div>
          </div>
          <van-button
            block round size="large"
            class="popup-confirm-btn btn-chips"
            @click="showChipsPopup = false"
          >
            确认
          </van-button>
        </div>
      </van-popup>

      <!-- 底部操作（固定在屏幕底部，只放按钮） -->
      <div class="room-footer">
        <template v-if="isOwner">
          <p class="start-hint" v-if="players.length < 2">至少需要 2 名玩家才能开始</p>
          <p class="start-hint offline-warning" v-else-if="hasOfflinePlayers">⚠️ {{ offlineNames }} 当前不在线，无法开始</p>
          <van-button
            block round size="large"
            class="btn-green start-btn"
            :disabled="players.length < 2 || hasOfflinePlayers"
            :loading="starting"
            @click="handleStart"
          >
            🎮 开始游戏
          </van-button>
        </template>
        <template v-else>
          <p class="wait-hint">等待房主开始游戏…</p>
          <div class="wait-animation">
            <span v-for="n in 3" :key="n" class="dot" :style="{ animationDelay: n * 0.3 + 's' }"></span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { showToast } from 'vant'
import { connectSocket, getSocket } from '../utils/socket'

const router = useRouter()
const route = useRoute()
const store = useGameStore()

const roomId = computed(() => (route.params.id || '').toUpperCase())
const starting = ref(false)
const startChips = ref(1000)
const chipOptions = [500, 1000, 2000, 5000]

// 机器人相关
const selectedBotLevel = ref('easy')
const botLevelOptions = [
  { label: '简单', value: 'easy', emoji: '🟢' },
  { label: '中等', value: 'medium', emoji: '🟡' },
  { label: '困难', value: 'hard', emoji: '🔴' }
]
const showBotPopup = ref(false)
const showChipsPopup = ref(false)

// 房间数据（由 socket 同步）
const room = reactive({
  id: roomId.value,
  ownerId: '',
  smallBlind: 10,
  bigBlind: 20,
  maxPlayers: 6,
  status: 'waiting'
})

const players = ref([])

const isOwner = computed(() => store.player?.id === room.ownerId)
const hasOfflinePlayers = computed(() => players.value.some(p => !p.isBot && p.connected === false))
const offlineNames = computed(() => players.value.filter(p => !p.isBot && p.connected === false).map(p => p.nickname).join('、'))
const emptySeats = computed(() => {
  const n = room.maxPlayers - players.value.length
  return Math.min(Math.max(n, 0), 3)
})

function applyRoomUpdate(data) {
  Object.assign(room, data)
  players.value = data.players || []
  store.setRoom(data)
}

function addBot() {
  if (players.value.length >= room.maxPlayers) {
    showToast({ message: '房间已满', icon: 'fail' })
    return
  }
  getSocket().emit('room:add_bot', { level: selectedBotLevel.value })
}

function addBotAndClose() {
  addBot()
  // 添加成功后不立即关闭，方便连续添加多个机器人
}

function removeBot(botId) {
  getSocket().emit('room:remove_bot', { botId })
}

onMounted(() => {
  if (!store.player) return router.replace('/login')

  const socket = connectSocket(store.player ? { ...store.player, _token: store.token } : store.player)
  // 后端 room:join 支持在 auth 之前处理（会用 clientPlayer 自动注册）
  const doJoinRoom = () => {
    socket.emit('room:join', { roomId: roomId.value, player: store.player })
  }

  // 确保 auth 完成后再 join（auth 是异步的）
  // 用 once + 定时兜底双保险，防止 auth:ok 被其他页面消费
  let joined = false
  const tryJoin = () => { if (!joined) { joined = true; doJoinRoom() } }
  socket.once('player:auth:ok', tryJoin)
  // 500ms 兜底（如果 socket 已认证，auth:ok 可能不会再来）
  setTimeout(tryJoin, 500)

  // 房间状态更新
  socket.on('room:update', ({ room: r }) => {
    applyRoomUpdate(r)
    starting.value = false
  })

  // 后端通知跳转（game:ready），立刻跳，不等 game:start
  socket.on('game:ready', ({ roomId: rid }) => {
    router.push(`/game/${rid || roomId.value}`)
  })

  // 被踢出
  socket.on('room:kicked', ({ message }) => {
    showToast({ message: message || '你被移出了房间', icon: 'fail' })
    router.replace('/lobby')
  })

  socket.on('error', ({ message }) => {
    starting.value = false
    showToast({ message: message || '操作失败', icon: 'fail' })
  })
})

// 监听路由参数变化（组件被复用时 roomId 会变）
watch(roomId, (newId) => {
  if (!newId) return
  // 更新房间初始数据
  room.id = newId
  room.ownerId = ''
  room.status = 'waiting'
  players.value = []
  // 离开旧房间，加入新房间
  const socket = getSocket()
  socket.emit('room:leave')
  socket.emit('room:join', { roomId: newId, player: store.player })
})

onUnmounted(() => {
  const socket = getSocket()
  socket.off('player:auth:ok')
  socket.off('room:update')
  socket.off('game:ready')
  socket.off('room:kicked')
  socket.off('error')
})

function copyCode() {
  const text = roomId.value
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showToast({ message: '房间码已复制', icon: 'success' })
    }).catch(() => {
      fallbackCopy(text)
    })
  } else {
    fallbackCopy(text)
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  try {
    document.execCommand('copy')
    showToast({ message: '房间码已复制', icon: 'success' })
  } catch {
    showToast({ message: `房间码: ${text}`, icon: 'info' })
  }
  document.body.removeChild(textarea)
}

function handleStart() {
  if (players.value.length < 2) return
  starting.value = true
  getSocket().emit('room:start', { startChips: startChips.value })
  setTimeout(() => { starting.value = false }, 5000)
}

function handleBack() {
  getSocket().emit('room:leave')
  router.push('/lobby')
}
</script>

<style scoped>
.room-page {
  background: linear-gradient(160deg, #0d1b2a 0%, #1a1a2e 60%, #16213e 100%);
  min-height: 100dvh;
}

.room-container {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px 16px 120px;
}

/* 顶部 */
.room-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.back-btn {
  height: 34px !important;
  flex-shrink: 0;
}

.room-id-area {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.room-label {
  color: rgba(255,255,255,0.45);
  font-size: 13px;
}

.room-id {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 2px;
}

.copy-btn {
  height: 28px !important;
  font-size: 12px !important;
  padding: 0 10px !important;
  margin-left: auto;
}

/* 信息栏 */
.room-info {
  display: flex;
  padding: 12px 16px;
  gap: 24px;
  margin-bottom: 12px;
}

.info-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.info-label {
  color: rgba(255,255,255,0.4);
  font-size: 11px;
}

.info-val {
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.status-waiting {
  color: #3498db;
}

/* 分享提示 */
.share-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  color: rgba(255,255,255,0.65);
  font-size: 13px;
  margin-bottom: 20px;
}

/* 玩家列表 */
.section-title {
  color: rgba(255,255,255,0.65);
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.online-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2ecc71;
  animation: blink 1.5s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.player-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.player-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  transition: all 0.3s;
}

.player-item.is-me {
  border-color: rgba(245,200,66,0.4) !important;
  background: rgba(245,200,66,0.06) !important;
}

.player-item.is-owner {
  border-color: rgba(46,204,113,0.3) !important;
}

.player-item.is-bot {
  border-color: rgba(100,180,255,0.25) !important;
  background: rgba(100,180,255,0.04) !important;
}

.player-seat {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.5);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.player-avatar {
  font-size: 28px;
  flex-shrink: 0;
}

.player-info {
  flex: 1;
}

.player-name {
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.owner-badge {
  background: #27ae60;
  color: #fff;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
}

.me-badge {
  background: rgba(245,200,66,0.25);
  color: #f5c842;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
}

.bot-badge {
  background: rgba(100,180,255,0.2);
  color: #64b4ff;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
}

.player-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.player-ready {
  display: flex;
  align-items: center;
}

.ready-icon {
  font-size: 18px;
}

.offline-icon {
  font-size: 18px;
}

.offline-warning {
  color: #e74c3c !important;
  font-weight: 600;
}

.btn-remove-bot {
  background: rgba(231,76,60,0.2) !important;
  border-color: rgba(231,76,60,0.4) !important;
  color: #e74c3c !important;
  font-size: 16px !important;
  font-weight: 700 !important;
  width: 28px !important;
  height: 28px !important;
  padding: 0 !important;
  border-radius: 50% !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 空位 */
.empty-seat {
  opacity: 0.45;
}

.empty-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.06);
  border: 2px dashed rgba(255,255,255,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.3);
  font-size: 16px;
}

.empty-text {
  color: rgba(255,255,255,0.3);
  font-size: 13px;
}

/* 房主快捷操作按钮 */
.owner-actions {
  display: flex;
  flex-direction: row;
  gap: 10px;
  margin-bottom: 14px;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:active {
  transform: scale(0.98);
  opacity: 0.85;
}

.action-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.action-label {
  flex: 1;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.action-val {
  font-size: 13px;
  font-weight: 700;
}

.action-arrow {
  color: rgba(255,255,255,0.3);
  font-size: 18px;
  font-weight: 300;
  margin-left: 2px;
}

/* 弹出卡片通用 */
.popup-card {
  padding: 24px 20px;
  background: #1a1a2e;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.popup-title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.popup-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.5);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.popup-close:active {
  background: rgba(255,255,255,0.15);
}

.popup-desc {
  color: rgba(255,255,255,0.4);
  font-size: 13px;
  margin: 0 0 18px;
}

.popup-confirm-btn {
  margin-top: 20px;
  height: 48px !important;
  font-size: 16px !important;
  font-weight: 600 !important;
}

.btn-bot {
  background: rgba(100,180,255,0.2) !important;
  border-color: rgba(100,180,255,0.5) !important;
  color: #64b4ff !important;
}

.btn-chips {
  background: rgba(245,200,66,0.2) !important;
  border-color: rgba(245,200,66,0.5) !important;
  color: #f5c842 !important;
}

.popup-hint {
  color: rgba(255,255,255,0.35);
  font-size: 12px;
  text-align: center;
  margin: 10px 0 0;
}

/* 底部 */
.room-footer {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  padding: 16px;
  background: linear-gradient(to top, #0d1b2a 60%, transparent);
}

.start-hint, .wait-hint {
  color: rgba(255,255,255,0.45);
  font-size: 13px;
  text-align: center;
  margin: 0 0 8px;
}

/* 机器人难度选择 */
.bot-level-select {
  display: flex;
  gap: 10px;
}

.level-option {
  flex: 1;
  padding: 14px 8px;
  text-align: center;
  border-radius: 12px;
  cursor: pointer;
  background: rgba(255,255,255,0.06);
  border: 2px solid transparent;
  color: rgba(255,255,255,0.6);
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.level-option.selected {
  border-color: #64b4ff;
  background: rgba(100,180,255,0.15);
  color: #64b4ff;
}

.level-emoji {
  font-size: 24px;
}

.level-text {
  font-size: 14px;
  font-weight: 600;
}

.chips-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.chip-option {
  padding: 16px 0;
  text-align: center;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  background: rgba(255,255,255,0.06);
  border: 2px solid transparent;
  color: rgba(255,255,255,0.7);
  transition: all 0.2s;
}

.chip-option.selected {
  border-color: #f5c842;
  background: rgba(245,200,66,0.15);
  color: #f5c842;
}

.chip-option:active {
  transform: scale(0.96);
}

.start-btn {
  height: 52px !important;
  font-size: 17px !important;
}

.wait-animation {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 12px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255,255,255,0.3);
  animation: bounce 1.2s infinite ease-in-out;
}

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.6); }
  40% { transform: scale(1); background: #f5c842; }
}
</style>
