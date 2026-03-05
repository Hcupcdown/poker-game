<template>
  <div class="game-page" :class="{ 'my-turn': isMyTurn }">

    <!-- ===== 顶部状态栏 ===== -->
    <div class="top-bar">
      <div class="top-left">
        <span class="phase-badge">{{ PHASE_NAMES[gameState.phase] }}</span>
        <span class="connection-indicator" :class="'status-' + connectionStatus">
          <span class="status-dot"></span>
          <span class="status-text" v-if="connectionStatus !== 'connected'">{{ CONNECTION_STATUS_TEXT[connectionStatus] }}</span>
          <span class="latency-text" v-if="connectionStatus === 'connected' && networkLatency > 100">{{ networkLatency }}ms</span>
        </span>
      </div>
      <div class="top-right">
        <span class="room-code">{{ roomId }}</span>
        <button class="mute-btn" @click="handleToggleMute" :title="soundMuted ? '开启声音' : '静音'">
          {{ soundMuted ? '🔇' : '🔊' }}
        </button>
        <van-button
          size="mini"
          style="margin-left: 8px; font-size: 11px; background: rgba(255,255,255,0.12); border-color: transparent; color: #fff;"
          @click="showRules = true"
        >📖 规则</van-button>
        <van-button
          v-if="isOwner"
          size="mini"
          type="danger"
          style="margin-left: 6px; font-size: 11px;"
          @click="showEndConfirm = true"
        >结束游戏</van-button>
      </div>
    </div>

    <!-- ===== 牌型规则浮层 ===== -->
    <HandRulesPopup v-model="showRules" />

    <!-- ===== 结束游戏确认 ===== -->
    <van-dialog
      v-model:show="showEndConfirm"
      title="结束游戏"
      message="确定要结束本局游戏吗？所有玩家将看到最终结算。"
      show-cancel-button
      confirm-button-color="#e74c3c"
      @confirm="endGame"
    />

    <!-- ===== 牌桌主区域 ===== -->
    <div class="table-area">

      <!-- 对手区域 -->
      <div class="opponents-ring" :class="'seats-' + opponents.length">
        <OpponentSlot
          v-for="(p, i) in opponents"
          :key="p.id"
          :player="p"
          :current-player-id="gameState.currentPlayerId"
          :display-bet="getDisplayBet(p.id)"
          :action-deadline="gameState.actionDeadline"
          :action-duration="gameState.actionDuration"
          :class="['seat-' + i]"
          :style="{ position: 'absolute' }"
        />
      </div>

      <!-- 公共牌区域（绝对定位居中于圆形装饰中心） -->
      <CommunityArea
        ref="communityAreaRef"
        class="community-center"
        :pot="gameState.pot"
        :deck-visible="deckVisible"
        :deck-card-count="deckCardCount"
        :community-slots="communitySlots"
      />
    </div>

    <!-- ===== 行动 Toast ===== -->
    <transition name="action-toast-trans">
      <div v-if="actionToast" class="action-toast" :class="'toast-' + actionToast.type">
        <span class="toast-name">{{ actionToast.name }}</span>
        <span class="toast-verb">{{ ACTION_NAMES[actionToast.type] || actionToast.type }}</span>
        <span v-if="actionToast.amount > 0" class="toast-amount">
<img src="/chip.png" class="chip-icon chip-icon-lg" />{{ actionToast.amount.toLocaleString() }}
        </span>
      </div>
    </transition>

    <!-- 飞行牌层（fixed 定位在游戏页内，不用 teleport 避免层级过高覆盖弹窗） -->
    <div class="flying-cards-layer">
      <div
        v-for="fc in flyingCards"
        :key="fc.id"
        class="flying-card"
        :class="{ 'flying-card-opp': fc.isOpp }"
        :style="getFlyingCardStyle(fc)"
      >
        <div class="flying-card-back"></div>
      </div>
    </div>

    <!-- ===== 我的区域 + 操作日志 ===== -->
    <div class="my-area-wrapper">
      <MyArea
        ref="myAreaComp"
        :cards="myCards"
        :chips="myChips"
        :display-bet="myDisplayBet"
        :card-revealed="cardRevealed"
        :cards-visible="cardsVisible"
        :deal-anim-key="dealAnimKey"
        :is-my-turn="isMyTurn"
        :time-left="timeLeft"
        :avatar="store.player?.avatar"
        :nickname="store.player?.nickname"
        :is-dealer="me?.isDealer"
        :is-small-blind="me?.isSmallBlind"
        :is-big-blind="me?.isBigBlind"
        :connected="me?.connected !== false"
        :community-cards="communityCards"
        @toggle-reveal="toggleCardReveal"
      />
      <div class="action-log">
        <div class="action-log-header">
          <div v-for="log in store.actionLog.slice(0, 3)" :key="log.time" class="log-item">
            {{ log.msg }}
          </div>
        </div>
        <button class="log-expand-btn" @click="showLogPanel = true" title="展开日志">📋</button>
      </div>

      <!-- 完整操作历史面板 -->
      <van-popup
        v-model:show="showLogPanel"
        position="right"
        :style="{ width: '75%', height: '100%', background: '#0d1b2a' }"
      >
        <div class="log-panel">
          <div class="log-panel-header">
            <span class="log-panel-title">操作历史</span>
            <van-icon name="cross" color="rgba(255,255,255,0.5)" size="18" @click="showLogPanel = false" />
          </div>
          <div class="log-panel-list">
            <div
              v-for="log in store.actionLog.slice(0, 50)"
              :key="log.time"
              class="log-panel-item"
            >
              <span class="log-panel-time">{{ relativeTime(log.time) }}</span>
              <span class="log-panel-msg">{{ log.msg }}</span>
            </div>
            <div v-if="store.actionLog.length === 0" class="log-panel-empty">暂无操作记录</div>
          </div>
        </div>
      </van-popup>
    </div>

    <!-- ===== 操作面板 ===== -->
    <ActionPanel
      ref="actionPanelRef"
      :is-my-turn="isMyTurn"
      :is-in-game="isInGame"
      :phase="gameState.phase"
      :can-check="canCheck"
      :call-amount="callAmount"
      :my-chips="myChips"
      :min-raise="minRaise"
      :max-raise="maxRaise"
      :pot="gameState.pot"
      @action="doAction"
      @open-chip-picker="handleOpenChipPicker"
    />

    <!-- ===== 结算弹窗 ===== -->
    <GameResultPopup
      :result-visible="showResult"
      :result="roundResult"
      :next-round-sent="nextRoundSent"
      :next-round-ready="nextRoundReady"
      :next-round-total="nextRoundTotal"
      :final-visible="showFinalResult"
      :final-players="finalPlayers"
      :final-reason="finalReason"
      :is-owner="isOwner"
      @next-round="nextRound"
      @back-to-room="backToRoom"
      @end-game="endGame"
    />

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { PHASE_NAMES } from '../utils/cardUtils'
import { ACTION_NAMES } from '../constants/handRules'
import { showToast } from 'vant'
import { getSocket, connectionStatus, networkLatency } from '../utils/socket'
import { playBetSound, playFoldSound, playWinSound, playDealSound, getMuted, toggleMute } from '../utils/sound'

// 子组件
import OpponentSlot from '../components/game/OpponentSlot.vue'
import CommunityArea from '../components/game/CommunityArea.vue'
import MyArea from '../components/game/MyArea.vue'
import ActionPanel from '../components/game/ActionPanel.vue'
import GameResultPopup from '../components/game/GameResultPopup.vue'
import HandRulesPopup from '../components/game/HandRulesPopup.vue'

// Composables
import { useTimer } from '../composables/useTimer'
import { useDealAnimation } from '../composables/useDealAnimation'
import { useGameSocket } from '../composables/useGameSocket'

const route = useRoute()
const router = useRouter()
const store = useGameStore()
const roomId = route.params.id.toUpperCase()

const CONNECTION_STATUS_TEXT = {
  connected: '已连接',
  unstable: '连接不稳定',
  disconnected: '已断开',
  reconnecting: '重连中...'
}

// ====== 游戏状态（#17：单一数据源，从 store 读取）======
const EMPTY_GAME_STATE = {
  phase: 'waiting',
  communityCards: [],
  pot: 0,
  bigBlind: 20,
  currentPlayerId: null,
  players: [],
  lastAction: null
}

const gameState = computed(() => store.gameState || EMPTY_GAME_STATE)

// ====== 房主权限 ======
const roomOwnerId = ref(store.room?.ownerId || '')
const isOwner = computed(() => store.player?.id === roomOwnerId.value)
const showEndConfirm = ref(false)
const showFinalResult = ref(false)
const finalPlayers = ref([])
const finalReason = ref('')
const showRules = ref(false)
const showLogPanel = ref(false)
const soundMuted = ref(getMuted())

function relativeTime(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 5) return '刚刚'
  if (diff < 60) return `${diff}秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`
  return `${Math.floor(diff / 3600)}小时前`
}

function handleToggleMute() {
  soundMuted.value = toggleMute()
}

function endGame() {
  getSocket().emit('game:end')
}

function backToRoom() {
  showFinalResult.value = false
  router.replace(`/room/${roomId}`)
}

// ====== 计算属性 ======
const me = computed(() => gameState.value.players.find(p => p.id === store.player?.id))
// 按真实座位顺序排列对手：从"我"的下一位开始顺时针排列
const opponents = computed(() => {
  const players = gameState.value.players
  if (!players || !players.length) return []
  const myIdx = players.findIndex(p => p.id === store.player?.id)
  if (myIdx === -1) return players // 找不到自己则返回原列表
  const result = []
  for (let i = 1; i < players.length; i++) {
    result.push(players[(myIdx + i) % players.length])
  }
  return result
})
const myCards = computed(() => me.value?.cards || [])
const myChips = computed(() => me.value?.chips || 0)
const myCurrentBet = computed(() => me.value?.currentBet || 0)
// 只有当 actionDeadline 有值时才认为真正轮到我（发牌动画期间 actionDeadline 为 null，操作面板自动禁用）
const isMyTurn = computed(() => gameState.value.currentPlayerId === store.player?.id && !!gameState.value.actionDeadline)
const isInGame = computed(() => me.value?.status === 'active')
const communityCards = computed(() => gameState.value.communityCards || [])
const lastAction = computed(() => gameState.value.lastAction)

const callAmount = computed(() => {
  const maxBet = Math.max(0, ...gameState.value.players.map(p => p.currentBet || 0))
  return Math.min(maxBet - (myCurrentBet.value || 0), myChips.value)
})
const canCheck = computed(() => callAmount.value <= 0)
const minRaise = computed(() => callAmount.value + (gameState.value.bigBlind || 20))
const maxRaise = computed(() => myChips.value)

// ====== 下注显示 ======
const displayBets = ref({})

watch(() => gameState.value.players, (players) => {
  if (!players || !players.length) return
  const newDisplay = { ...displayBets.value }
  players.forEach(p => {
    const total = p.totalBet || 0
    if (total > 0) newDisplay[p.id] = total
    if (p.status === 'folded') newDisplay[p.id] = 0
  })
  displayBets.value = newDisplay
}, { deep: true })

function getDisplayBet(playerId) {
  return displayBets.value[playerId] || 0
}

const myDisplayBet = computed(() => {
  if (!me.value) return 0
  return getDisplayBet(me.value.id)
})

const actionToast = ref(null)
let toastTimer = null
watch(lastAction, (val) => {
  if (!val) return
  if (toastTimer) clearTimeout(toastTimer)
  actionToast.value = val
  toastTimer = setTimeout(() => { actionToast.value = null }, 2000)
  // 音效
  if (val.type === 'fold') playFoldSound()
  else if (val.type === 'raise' || val.type === 'allin') playBetSound()
  else if (val.type === 'call' || val.type === 'check') playBetSound()
})

// ====== 组件 refs ======
const communityAreaRef = ref(null)
const myAreaComp = ref(null)
const actionPanelRef = ref(null)

// ====== Composables ======
// 倒计时
const { timeLeft, timerProgress, startTimer, stopTimer } = useTimer(isMyTurn, () => doAction('fold'), gameState)

// 发牌动画
const {
  flyingCards, cardRevealed, dealAnimKey,
  cardsVisible, deckVisible, deckCardCount, communitySlots,
  toggleCardReveal, triggerDealAnimation
} = useDealAnimation({ gameState, opponents, store, communityAreaRef, myAreaRef: myAreaComp })

// Deal sound on deal animation start
watch(deckVisible, (val) => {
  if (val) playDealSound()
})

// 结算相关
const showResult = ref(false)
const roundResult = ref(null)
const nextRoundSent = ref(false)
const nextRoundReady = ref(0)
const nextRoundTotal = ref(0)

// Socket 事件
const { setupSocket, cleanupSocket } = useGameSocket({
  gameState, displayBets, showResult, roundResult,
  showFinalResult, finalPlayers, finalReason,
  nextRoundSent, nextRoundReady, nextRoundTotal,
  roomOwnerId, isMyTurn, store, roomId,
  triggerDealAnimation, communitySlots, startTimer
})

// ====== 操作 ======
function doAction(type, amount) {
  stopTimer()
  // 不在本地写日志，等服务端广播 player:action:log，避免自己操作时写两条
  showToast({ message: ACTION_NAMES[type], duration: 800, position: 'middle' })
  getSocket().emit('player:action', { type, amount: amount || callAmount.value })
}

function handleOpenChipPicker() {
  actionPanelRef.value?.openPicker()
}

/**
 * 计算飞行牌的内联样式（兼容性方案，不依赖 CSS 变量动画）
 */
function getFlyingCardStyle(fc) {
  const base = {
    left: fc.startX + 'px',
    top: fc.startY + 'px',
  }
  if (!fc.flying) {
    // 初始状态：无动画，原位
    base.transform = 'translate(0, 0) rotate(0deg) scale(1)'
    base.transition = 'none'
    base.opacity = '1'
    return base
  }
  // 飞行状态：使用内联 transition
  if (fc.isOpp) {
    base.transform = `translate(${fc.dx}px, ${fc.dy}px) rotate(8deg) scale(0)`
    base.transition = `transform 0.40s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${fc.delay}s, opacity 0.15s ease ${0.36 + fc.delay}s`
  } else {
    base.transform = `translate(${fc.dx}px, ${fc.dy}px) rotate(0deg) scale(1)`
    base.transition = `transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${fc.delay}s, opacity 0.12s ease ${0.35 + fc.delay}s`
  }
  return base
}

function nextRound() {
  if (nextRoundSent.value) return
  nextRoundSent.value = true
  getSocket().emit('game:next_round')
}

// ====== 生命周期 ======
onMounted(() => {
  setupSocket()
})

onUnmounted(() => {
  stopTimer()
  cleanupSocket()
})
</script>

<style scoped>
.game-page {
  height: 100dvh;
  background: radial-gradient(ellipse at center, #1a6b3a 0%, #0d4a28 60%, #082918 100%);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.game-page.my-turn {
  box-shadow: inset 0 0 40px rgba(245,200,66,0.1);
}

/* ===== 顶部状态栏 ===== */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 6px;
  background: rgba(0,0,0,0.3);
  flex-shrink: 0;
  z-index: 10;
}

.phase-badge {
  background: rgba(255,255,255,0.12);
  color: #fff;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 20px;
}

.room-code {
  color: rgba(255,255,255,0.35);
  font-size: 11px;
  letter-spacing: 2px;
}

.mute-btn {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 4px;
  margin-left: 8px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.mute-btn:active { opacity: 1; }

/* ===== 连接状态指示器 ===== */
.connection-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  transition: all 0.3s ease;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  transition: background 0.3s ease;
}

.status-connected .status-dot {
  background: #4caf50;
  box-shadow: 0 0 4px rgba(76, 175, 80, 0.6);
}

.status-unstable .status-dot {
  background: #ff9800;
  box-shadow: 0 0 4px rgba(255, 152, 0, 0.6);
  animation: pulse-dot 1s infinite;
}

.status-disconnected .status-dot {
  background: #f44336;
  box-shadow: 0 0 4px rgba(244, 67, 54, 0.6);
}

.status-reconnecting .status-dot {
  background: #ff9800;
  animation: pulse-dot 0.6s infinite;
}

.status-text {
  color: rgba(255,255,255,0.7);
  font-weight: 500;
}

.status-disconnected .status-text {
  color: #ef9a9a;
}

.status-reconnecting .status-text {
  color: #ffcc80;
}

.latency-text {
  color: rgba(255,255,255,0.35);
  font-size: 9px;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ===== 牌桌主区 ===== */
.table-area {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.table-area::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80%;
  height: 70%;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.1);
  pointer-events: none;
}

/* 公共牌绝对定位居中于圆形装饰中心 */
.community-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
}

/* ===== 对手环绕布局 ===== */
.opponents-ring {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* 根据人数动态定位（顺时针：从"我"左侧开始，经上方到右侧）
   seat-0 = 我的顺时针下一位，seat-N = 我的顺时针上一位
   使用 vmin 单位替代纯百分比，减少宽屏重叠 */

/* 1个对手 → 正对面 */
.seats-1 .seat-0 { top: 8%; left: 50%; transform: translateX(-50%); }

/* 2个对手 → 左上、右上 */
.seats-2 .seat-0 { top: 8%; left: 22%; }
.seats-2 .seat-1 { top: 8%; right: 22%; }

/* 3个对手 → 左中、正上、右中 */
.seats-3 .seat-0 { top: 32%; left: 3%; }
.seats-3 .seat-1 { top: 6%; left: 50%; transform: translateX(-50%); }
.seats-3 .seat-2 { top: 32%; right: 3%; }

/* 4个对手 → 左中、左上、右上、右中 */
.seats-4 .seat-0 { top: 32%; left: 2%; }
.seats-4 .seat-1 { top: 5%; left: 20%; }
.seats-4 .seat-2 { top: 5%; right: 20%; }
.seats-4 .seat-3 { top: 32%; right: 2%; }

/* 5个对手 → 左中、左上、正上、右上、右中 */
.seats-5 .seat-0 { top: 36%; left: 2%; }
.seats-5 .seat-1 { top: 5%; left: 14%; }
.seats-5 .seat-2 { top: 5%; left: 50%; transform: translateX(-50%); }
.seats-5 .seat-3 { top: 5%; right: 14%; }
.seats-5 .seat-4 { top: 36%; right: 2%; }

/* 6个对手 */
.seats-6 .seat-0 { top: 35%; left: 2%; }
.seats-6 .seat-1 { top: 5%; left: 18%; }
.seats-6 .seat-2 { top: 5%; left: 50%; transform: translateX(-50%); }
.seats-6 .seat-3 { top: 5%; right: 18%; }
.seats-6 .seat-4 { top: 35%; right: 2%; }
.seats-6 .seat-5 { top: 62%; right: 8%; }

/* 7个对手 */
.seats-7 .seat-0 { top: 32%; left: 2%; }
.seats-7 .seat-1 { top: 5%; left: 16%; }
.seats-7 .seat-2 { top: 5%; left: 50%; transform: translateX(-50%); }
.seats-7 .seat-3 { top: 5%; right: 16%; }
.seats-7 .seat-4 { top: 32%; right: 2%; }
.seats-7 .seat-5 { top: 60%; right: 5%; }
.seats-7 .seat-6 { top: 60%; left: 5%; }

/* 8个对手 */
.seats-8 .seat-0 { top: 30%; left: 1%; }
.seats-8 .seat-1 { top: 5%; left: 13%; }
.seats-8 .seat-2 { top: 5%; left: 50%; transform: translateX(-50%); }
.seats-8 .seat-3 { top: 5%; right: 13%; }
.seats-8 .seat-4 { top: 30%; right: 1%; }
.seats-8 .seat-5 { top: 56%; right: 2%; }
.seats-8 .seat-6 { top: 63%; left: 32%; }
.seats-8 .seat-7 { top: 56%; left: 2%; }

/* 小屏手机兜底（宽度 <= 375px，适当收紧） */
@media (max-width: 375px) {
  .seats-5 .seat-0, .seats-6 .seat-0, .seats-7 .seat-0, .seats-8 .seat-0 { left: 1%; }
  .seats-5 .seat-4, .seats-6 .seat-4, .seats-7 .seat-4, .seats-8 .seat-4 { right: 1%; }
  .seats-6 .seat-1, .seats-7 .seat-1, .seats-8 .seat-1 { left: 10%; }
  .seats-6 .seat-3, .seats-7 .seat-3, .seats-8 .seat-3 { right: 10%; }
}

/* ===== 行动 Toast ===== */
.action-toast {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 8000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: rgba(10, 20, 40, 0.88);
  border-radius: 16px;
  padding: 14px 28px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  pointer-events: none;
  border: 1.5px solid rgba(255,255,255,0.12);
  min-width: 140px;
  text-align: center;
}

.toast-name { font-size: 13px; color: rgba(255,255,255,0.7); font-weight: 500; }
.toast-verb { font-size: 22px; font-weight: 900; letter-spacing: 1px; color: #fff; }
.toast-amount { font-size: 20px; font-weight: 800; color: #f5c842; }

.toast-call .toast-verb  { color: #4fc3f7; }
.toast-raise .toast-verb { color: #81c784; }
.toast-fold .toast-verb  { color: rgba(255,255,255,0.45); }
.toast-check .toast-verb { color: #ce93d8; }
.toast-allin .toast-verb { color: #ff7043; }

.action-toast-trans-enter-active { animation: toastIn 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.action-toast-trans-leave-active { animation: toastOut 0.22s ease-in both; }

@keyframes toastIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

@keyframes toastOut {
  from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  to   { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
}

/* ===== 飞行牌 ===== */
.flying-cards-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 50;   /* 高于牌桌元素，低于 van-popup（2000+）和结算弹窗 */
  overflow: hidden;
}

.flying-card {
  position: absolute;
  width: 60px;
  height: 84px;
  pointer-events: none;
  will-change: transform, opacity;
}

.flying-card-back {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  border: 2px solid rgba(255,255,255,0.15);
  background: linear-gradient(135deg, #1a3a5c 0%, #0d2137 50%, #1a3a5c 100%);
  box-shadow: 0 6px 20px rgba(0,0,0,0.5);
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.flying-card-back::before {
  content: '';
  position: absolute;
  inset: 4px;
  border-radius: 5px;
  border: 1.5px solid rgba(255,255,255,0.2);
  background: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.04) 4px, rgba(255,255,255,0.04) 8px);
}

.flying-card-back::after {
  content: '';
}

.chip-icon {
  display: inline-block;
  width: 16px;
  height: 16px;
  object-fit: contain;
  vertical-align: middle;
  flex-shrink: 0;
  margin-right: 2px;
}

.chip-icon-lg { width: 32px; height: 32px; }

.gold { color: #f5c842; }

/* ===== 我的区域包裹层 ===== */
.my-area-wrapper {
  position: relative;
  flex-shrink: 0;
}

/* ===== 操作日志（手牌区域右侧） ===== */
.action-log {
  position: absolute;
  right: 8px;
  top: 6px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  pointer-events: none;
  z-index: 20;
  max-width: 45%;
}

.action-log-header {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  pointer-events: none;
}

.log-expand-btn {
  pointer-events: auto;
  background: rgba(0,0,0,0.6);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  padding: 3px 7px;
  font-size: 14px;
  cursor: pointer;
  margin-top: 4px;
  color: rgba(255,255,255,0.7);
  line-height: 1.4;
}

.log-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.log-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.log-panel-title {
  color: #fff;
  font-size: 16px;
  font-weight: 700;
}

.log-panel-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-panel-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.log-panel-time {
  color: rgba(255,255,255,0.35);
  font-size: 10px;
  flex-shrink: 0;
  padding-top: 1px;
  min-width: 42px;
}

.log-panel-msg {
  color: rgba(255,255,255,0.8);
  font-size: 13px;
  line-height: 1.4;
}

.log-panel-empty {
  color: rgba(255,255,255,0.3);
  text-align: center;
  padding: 40px 0;
  font-size: 14px;
}

.log-item {
  background: rgba(0,0,0,0.6);
  color: rgba(255,255,255,0.8);
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 10px;
  border-right: 2px solid #f5c842;
  border-left: none;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
</style>
