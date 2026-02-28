<template>
  <div class="game-page" :class="{ 'my-turn': isMyTurn }">

    <!-- ===== 顶部状态栏 ===== -->
    <div class="top-bar">
      <div class="top-left">
        <span class="phase-badge">{{ PHASE_NAMES[gameState.phase] }}</span>
      </div>
      <div class="pot-area">
        <span class="pot-label">底池</span>
        <span class="pot-value gold">🪙 {{ gameState.pot.toLocaleString() }}</span>
      </div>
      <div class="top-right">
        <span class="room-code">{{ roomId }}</span>
      </div>
    </div>

    <!-- ===== 牌桌主区域 ===== -->
    <div class="table-area">

      <!-- 对手区域（最多8人，环绕布局） -->
      <div class="opponents-ring" :class="'seats-' + opponents.length">
        <div
          v-for="(p, i) in opponents"
          :key="p.id"
          class="opponent-slot"
          :class="[
            'seat-' + i,
            { 'is-turn': p.id === gameState.currentPlayerId },
            { 'is-folded': p.status === 'folded' }
          ]"
        >
          <!-- 当前行动指示器 -->
          <div v-if="p.id === gameState.currentPlayerId" class="turn-ring"></div>

          <!-- 玩家头像 -->
          <div class="opp-avatar-wrap">
            <span class="opp-avatar">{{ p.avatar }}</span>
            <span
              class="opp-status-dot"
              :style="{ background: PLAYER_STATUS_COLORS[p.status] }"
            ></span>
          </div>

          <!-- 玩家信息 -->
          <div class="opp-info">
            <div class="opp-name">{{ p.nickname }}</div>
            <div class="opp-chips">{{ formatChips(p.chips) }}</div>
          </div>

          <!-- 当前下注 -->
          <div v-if="p.currentBet > 0 && p.status !== 'folded'" class="opp-bet">
            <span class="bet-chip">🪙</span>
            <span class="bet-amount">{{ p.currentBet }}</span>
          </div>

          <!-- 弃牌遮罩 -->
          <div v-if="p.status === 'folded'" class="fold-mask">弃牌</div>

          <!-- 手牌（背面，有发牌动画） -->
          <div class="opp-cards">
            <template v-if="p.status !== 'folded'">
              <div
                v-for="n in 2"
                :key="n"
                class="card-back deal-anim"
                :style="{ animationDelay: (dealAnimKey * 0.1 + (i * 2 + n - 1) * 0.08) + 's' }"
              >
                <div class="card-back-inner">🂠</div>
              </div>
            </template>
            <div v-if="p.status === 'allin'" class="allin-badge">ALL IN</div>
          </div>

          <!-- 倒计时环（当前行动者） -->
          <svg v-if="p.id === gameState.currentPlayerId" class="timer-ring" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
            <circle
              cx="18" cy="18" r="15.9" fill="none"
              stroke="#f5c842" stroke-width="2"
              stroke-dasharray="100" :stroke-dashoffset="100 - timerProgress"
              stroke-linecap="round"
              transform="rotate(-90 18 18)"
            />
          </svg>
        </div>
      </div>

      <!-- 公共牌区域 -->
      <div class="community-area">
        <div class="community-cards">
          <transition-group name="community-flip" tag="div" class="community-cards-inner">
            <div
              v-for="(card, i) in communityCards"
              :key="i + '-' + card"
              class="community-card"
              :class="{ 'card-red': isRedCard(card) }"
              :style="{ animationDelay: (i % 3) * 0.12 + 's' }"
            >
              <div class="card-rank">{{ getCardRank(card) }}</div>
              <div class="card-suit">{{ getCardSuit(card) }}</div>
            </div>
          </transition-group>
          <!-- 待翻牌位 -->
          <div
            v-for="n in (5 - communityCards.length)"
            :key="'placeholder-' + n"
            class="community-card placeholder"
          >?</div>
        </div>

        <!-- 最后操作提示 -->
        <div class="last-action" v-if="lastAction">
          <span class="last-action-text">
            {{ lastAction.name }} {{ ACTION_NAMES[lastAction.type] }}
            <span v-if="lastAction.amount" class="gold"> {{ lastAction.amount }}</span>
          </span>
        </div>
      </div>

    </div>

    <!-- ===== 我的区域 ===== -->
    <div class="my-area">
      <!-- 我的手牌 -->
      <div class="my-cards">
        <div
          v-for="(card, i) in myCards"
          :key="i + '-' + card + '-' + dealAnimKey"
          class="my-card-flip-wrap"
          :style="{ animationDelay: (dealAnimKey * 0.1 + i * 0.15) + 's' }"
          :class="{ 'deal-in': true }"
          @click="toggleCardReveal(i)"
        >
          <!-- 3D 翻转容器 -->
          <div class="my-card-3d" :class="{ 'is-revealed': cardRevealed[i] }">
            <!-- 背面 -->
            <div class="my-card face-back">
              <div class="card-back-pattern"></div>
              <span class="back-icon">🂠</span>
              <span class="tap-hint">点击看牌</span>
            </div>
            <!-- 正面 -->
            <div
              class="my-card face-front"
              :class="{ 'card-red': isRedCard(card), 'card-highlight': isMyTurn }"
            >
              <div class="my-card-rank">{{ getCardRank(card) }}</div>
              <div class="my-card-suit">{{ getCardSuit(card) }}</div>
              <div class="my-card-corner top-left">
                <span>{{ getCardRank(card) }}</span>
                <span>{{ getCardSuit(card) }}</span>
              </div>
            </div>
          </div>
        </div>
        <!-- 手牌背面（未开始） -->
        <div v-if="myCards.length === 0" v-for="n in 2" :key="n" class="my-card face-back back-card">
          🂠
        </div>
      </div>

      <!-- 我的信息栏 -->
      <div class="my-info-bar">
        <div class="my-avatar-area">
          <span class="my-avatar">{{ store.player?.avatar }}</span>
          <div class="my-text">
            <span class="my-name">{{ store.player?.nickname }}</span>
            <span class="my-chips">💰 {{ myChips.toLocaleString() }}</span>
          </div>
        </div>
        <div class="my-bet-area" v-if="myCurrentBet > 0">
          <span class="my-bet-label">已注</span>
          <span class="my-bet-val gold">{{ myCurrentBet }}</span>
        </div>
        <!-- 倒计时（我的回合） -->
        <div v-if="isMyTurn" class="my-timer">
          <span class="timer-num" :class="{ urgent: timeLeft <= 5 }">{{ timeLeft }}s</span>
        </div>
      </div>
    </div>

    <!-- ===== 操作面板 ===== -->
    <transition name="slide-up">
      <div class="action-panel" v-if="isMyTurn && gameState.phase !== 'showdown'">
        <div class="action-panel-inner">

          <!-- 加注滑块 -->
          <div class="raise-area" v-if="showRaiseSlider">
            <div class="raise-header">
              <span class="raise-label">加注金额</span>
              <span class="raise-val gold">{{ raiseAmount }}</span>
            </div>
            <van-slider
              v-model="raiseAmount"
              :min="minRaise"
              :max="myChips"
              :step="gameState.bigBlind || 20"
              bar-height="6px"
              active-color="#f5c842"
            />
            <div class="raise-presets">
              <span
                v-for="preset in raisePresets"
                :key="preset.label"
                class="raise-preset"
                @click="raiseAmount = preset.amount"
              >{{ preset.label }}</span>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="action-buttons">
            <!-- 弃牌 -->
            <van-button
              class="btn-red action-btn"
              @click="doAction('fold')"
            >
              <div class="btn-inner">
                <span class="btn-icon">🚫</span>
                <span class="btn-text">弃牌</span>
              </div>
            </van-button>

            <!-- 跟注/看牌 -->
            <van-button
              class="btn-gray action-btn"
              @click="doAction(canCheck ? 'check' : 'call')"
            >
              <div class="btn-inner">
                <span class="btn-icon">{{ canCheck ? '👀' : '✅' }}</span>
                <span class="btn-text">{{ canCheck ? '看牌' : '跟注' }}</span>
                <span v-if="!canCheck" class="btn-amount gold">{{ callAmount }}</span>
              </div>
            </van-button>

            <!-- 加注/All-in -->
            <van-button
              class="btn-green action-btn"
              :class="{ active: showRaiseSlider }"
              @click="toggleRaise"
            >
              <div class="btn-inner">
                <span class="btn-icon">{{ showRaiseSlider ? '✓' : '🔺' }}</span>
                <span class="btn-text">{{ showRaiseSlider ? '确认加注' : '加注' }}</span>
                <span v-if="showRaiseSlider" class="btn-amount gold">{{ raiseAmount }}</span>
              </div>
            </van-button>
          </div>

        </div>
      </div>
    </transition>

    <!-- ===== 结算弹窗 ===== -->
    <van-popup
      v-model:show="showResult"
      round
      position="center"
      :style="{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)', width: '90%' }"
    >
      <div class="result-popup">
        <div class="result-title">🎉 本局结算</div>
        <div class="result-winner" v-if="roundResult.winner">
          <span class="winner-avatar">{{ roundResult.winner.avatar }}</span>
          <div class="winner-info">
            <span class="winner-name">{{ roundResult.winner.nickname }}</span>
            <span class="winner-hand">{{ roundResult.winner.handName }}</span>
          </div>
          <span class="winner-gain gold">+{{ roundResult.winner.gain }}</span>
        </div>
        <div class="result-all-hands">
          <div v-for="p in roundResult.allHands" :key="p.id" class="hand-row">
            <span class="hand-avatar">{{ p.avatar }}</span>
            <span class="hand-name">{{ p.nickname }}</span>
            <div class="hand-cards">
              <span
                v-for="c in p.cards"
                :key="c"
                class="hand-card"
                :class="{ red: isRedCard(c) }"
              >
                {{ getCardRank(c) }}{{ getCardSuit(c) }}
              </span>
            </div>
            <span class="hand-type" :class="{ gold: p.isWinner }">{{ p.handName }}</span>
          </div>
        </div>
        <van-button block round class="btn-green" style="margin-top: 20px;" @click="nextRound">
          下一局
        </van-button>
      </div>
    </van-popup>

    <!-- ===== 操作日志 ===== -->
    <div class="action-log">
      <transition-group name="fade">
        <div v-for="log in store.actionLog.slice(0, 3)" :key="log.time" class="log-item">
          {{ log.msg }}
        </div>
      </transition-group>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import {
  PHASE_NAMES, PLAYER_STATUS_COLORS, SUIT_SYMBOLS, SUIT_COLORS,
  RANK_DISPLAY, parseCard, formatChips
} from '../utils/cardUtils'
import { showToast } from 'vant'
import { connectSocket, getSocket } from '../utils/socket'

const route = useRoute()
const router = useRouter()
const store = useGameStore()
const roomId = route.params.id.toUpperCase()

const ACTION_NAMES = {
  fold: '弃牌',
  call: '跟注',
  check: '看牌',
  raise: '加注',
  allin: 'All In'
}

// ====== 游戏状态（由 socket 实时同步） ======
const gameState = ref({
  phase: 'waiting',
  communityCards: [],
  pot: 0,
  bigBlind: 20,
  currentPlayerId: null,
  players: [],
  lastAction: null
})

// ====== 计算属性 ======
const me = computed(() => gameState.value.players.find(p => p.id === store.player?.id))
const opponents = computed(() => gameState.value.players.filter(p => p.id !== store.player?.id))
const myCards = computed(() => me.value?.cards || [])
const myChips = computed(() => me.value?.chips || 0)
const myCurrentBet = computed(() => me.value?.currentBet || 0)
const communityCards = computed(() => gameState.value.communityCards || [])
const lastAction = computed(() => gameState.value.lastAction)

const isMyTurn = computed(() => gameState.value.currentPlayerId === store.player?.id)

const callAmount = computed(() => {
  const maxBet = Math.max(0, ...gameState.value.players.map(p => p.currentBet || 0))
  return Math.min(maxBet - (myCurrentBet.value || 0), myChips.value)
})

const canCheck = computed(() => callAmount.value <= 0)
const minRaise = computed(() => (gameState.value.bigBlind || 20) * 2)

// 加注滑块
const showRaiseSlider = ref(false)
const raiseAmount = ref(minRaise.value)

const raisePresets = computed(() => {
  const bb = gameState.value.bigBlind || 20
  const pot = gameState.value.pot || 0
  return [
    { label: '2BB', amount: bb * 2 },
    { label: '½池', amount: Math.floor(pot / 2) },
    { label: '全池', amount: pot },
    { label: '全押', amount: myChips.value }
  ].filter(p => p.amount >= minRaise.value && p.amount <= myChips.value)
})

// ====== 倒计时 ======
const timeLeft = ref(30)
const timerProgress = ref(100)
let timerInterval = null

watch(isMyTurn, (val) => {
  if (val) startTimer()
  else stopTimer()
}, { immediate: true })

function startTimer() {
  timeLeft.value = 30
  timerProgress.value = 100
  clearInterval(timerInterval)
  timerInterval = setInterval(() => {
    timeLeft.value--
    timerProgress.value = (timeLeft.value / 30) * 100
    if (timeLeft.value <= 0) {
      stopTimer()
      doAction('fold')
    }
  }, 1000)
}

function stopTimer() {
  clearInterval(timerInterval)
}

// ====== 发牌动画 & 翻牌状态 ======
const dealAnimKey = ref(0)          // 每次发牌时自增，触发重新动画
const cardRevealed = ref([false, false])   // 我的手牌是否已翻面

function toggleCardReveal(idx) {
  cardRevealed.value[idx] = !cardRevealed.value[idx]
}

function triggerDealAnimation() {
  dealAnimKey.value++
  cardRevealed.value = [false, false]  // 每轮重置为背面
}

// ====== Socket 事件 ======
onMounted(() => {
  if (!store.player) return router.replace('/login')

  const socket = connectSocket(store.player)

  // 游戏状态更新（行动后广播）
  socket.on('game:state', (state) => {
    const wasWaiting = gameState.value.phase === 'waiting'
    gameState.value = state
    store.setGameState(state)
    // 如果是第一次收到真实游戏状态（发牌），触发动画
    if (wasWaiting && state.phase !== 'waiting') {
      triggerDealAnimation()
    }
  })

  // 游戏开始（发牌）
  socket.on('game:start', ({ gameState: gs }) => {
    gameState.value = gs
    store.setGameState(gs)
    triggerDealAnimation()
  })

  // 玩家行动日志
  socket.on('player:action:log', ({ msg }) => {
    store.addLog(msg)
  })

  // 结算
  socket.on('game:result', (result) => {
    roundResult.value = result
    showResult.value = true
    store.setGameState(null)
  })

  // 玩家断线通知
  socket.on('player:disconnected', ({ nickname }) => {
    store.addLog(`${nickname} 断线`)
  })

  socket.on('error', ({ message }) => {
    showToast({ message: message || '出错了', icon: 'fail' })
  })

  // 主动拉取当前游戏状态
  // 因为 game:start 可能在这个页面挂载之前就发出了，需要主动补一次
  const doRequestState = () => {
    socket.emit('game:request_state')
  }

  if (socket.connected) {
    // 已连接，先确保 auth，再 join + 拉状态
    let done = false
    const tryRequest = () => {
      if (done) return
      done = true
      // 先 join 房间（如果断线重连，后端会推 game:state）
      socket.emit('room:join', { roomId, player: store.player })
      // 100ms 后再拉一次，确保 join 处理完
      setTimeout(doRequestState, 150)
    }
    socket.once('player:auth:ok', tryRequest)
    setTimeout(tryRequest, 400)
  } else {
    socket.once('player:auth:ok', () => {
      socket.emit('room:join', { roomId, player: store.player })
      setTimeout(doRequestState, 150)
    })
  }
})

onUnmounted(() => {
  stopTimer()
  const socket = getSocket()
  socket.off('game:state')
  socket.off('game:start')
  socket.off('player:action:log')
  socket.off('game:result')
  socket.off('player:disconnected')
  socket.off('player:auth:ok')
  socket.off('error')
})

// ====== 操作 ======
function toggleRaise() {
  if (showRaiseSlider.value) {
    doAction('raise', raiseAmount.value)
  } else {
    raiseAmount.value = minRaise.value
    showRaiseSlider.value = true
  }
}

function doAction(type, amount) {
  showRaiseSlider.value = false
  stopTimer()

  const actionMsg = {
    fold: `${store.player?.nickname} 弃牌`,
    check: `${store.player?.nickname} 看牌`,
    call: `${store.player?.nickname} 跟注 ${callAmount.value}`,
    raise: `${store.player?.nickname} 加注到 ${amount}`
  }
  store.addLog(actionMsg[type] || type)
  showToast({ message: ACTION_NAMES[type], duration: 800, position: 'middle' })

  getSocket().emit('player:action', { type, amount: amount || callAmount.value })
}

// ====== 结算 ======
const showResult = ref(false)
const roundResult = ref(null)

function nextRound() {
  showResult.value = false
  getSocket().emit('game:next_round')
  router.push(`/room/${roomId}`)
}

// ====== 牌面显示工具 ======
function getCardRank(card) {
  if (!card || card === 'back') return '?'
  return RANK_DISPLAY[card.slice(0, -1)] || card.slice(0, -1)
}

function getCardSuit(card) {
  if (!card || card === 'back') return ''
  return SUIT_SYMBOLS[card.slice(-1)] || ''
}

function isRedCard(card) {
  if (!card) return false
  return card.slice(-1) === 'h' || card.slice(-1) === 'd'
}
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
  /* 我的回合时，边框微发光 */
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

.pot-area {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pot-label {
  color: rgba(255,255,255,0.45);
  font-size: 10px;
}

.pot-value {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 1px;
}

.room-code {
  color: rgba(255,255,255,0.35);
  font-size: 11px;
  letter-spacing: 2px;
}

/* ===== 牌桌主区 ===== */
.table-area {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

/* 牌桌椭圆装饰 */
.table-area::before {
  content: '';
  position: absolute;
  width: 80%;
  height: 70%;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.1);
  pointer-events: none;
}

/* ===== 对手环绕布局 ===== */
.opponents-ring {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.opponent-slot {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: auto;
  transition: all 0.3s;
}

/* 根据人数动态定位（最多支持8个对手） */
.seats-1 .seat-0 { top: 8%; left: 50%; transform: translateX(-50%); }

.seats-2 .seat-0 { top: 8%; left: 25%; }
.seats-2 .seat-1 { top: 8%; right: 25%; transform: translateX(50%); }

.seats-3 .seat-0 { top: 8%; left: 50%; transform: translateX(-50%); }
.seats-3 .seat-1 { top: 35%; left: 4%; }
.seats-3 .seat-2 { top: 35%; right: 4%; transform: translateX(0); }

.seats-4 .seat-0 { top: 5%; left: 20%; }
.seats-4 .seat-1 { top: 5%; right: 20%; }
.seats-4 .seat-2 { top: 35%; left: 2%; }
.seats-4 .seat-3 { top: 35%; right: 2%; }

.seats-5 .seat-0 { top: 5%; left: 50%; transform: translateX(-50%); }
.seats-5 .seat-1 { top: 5%; left: 15%; }
.seats-5 .seat-2 { top: 5%; right: 15%; }
.seats-5 .seat-3 { top: 40%; left: 2%; }
.seats-5 .seat-4 { top: 40%; right: 2%; }

.seats-6 .seat-0 { top: 4%; left: 50%; transform: translateX(-50%); }
.seats-6 .seat-1 { top: 4%; left: 20%; }
.seats-6 .seat-2 { top: 4%; right: 20%; }
.seats-6 .seat-3 { top: 38%; left: 2%; }
.seats-6 .seat-4 { top: 38%; right: 2%; }
.seats-6 .seat-5 { top: 65%; left: 10%; }

.seats-7 .seat-0 { top: 4%; left: 50%; transform: translateX(-50%); }
.seats-7 .seat-1 { top: 4%; left: 18%; }
.seats-7 .seat-2 { top: 4%; right: 18%; }
.seats-7 .seat-3 { top: 35%; left: 2%; }
.seats-7 .seat-4 { top: 35%; right: 2%; }
.seats-7 .seat-5 { top: 62%; left: 6%; }
.seats-7 .seat-6 { top: 62%; right: 6%; }

.seats-8 .seat-0 { top: 4%; left: 50%; transform: translateX(-50%); }
.seats-8 .seat-1 { top: 4%; left: 14%; }
.seats-8 .seat-2 { top: 4%; right: 14%; }
.seats-8 .seat-3 { top: 32%; left: 1%; }
.seats-8 .seat-4 { top: 32%; right: 1%; }
.seats-8 .seat-5 { top: 58%; left: 3%; }
.seats-8 .seat-6 { top: 58%; right: 3%; }
.seats-8 .seat-7 { top: 65%; left: 35%; }

/* 对手卡片 */
.opp-avatar-wrap {
  position: relative;
  width: 42px;
  height: 42px;
}

.opp-avatar {
  font-size: 32px;
  display: block;
  text-align: center;
  line-height: 42px;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.5));
}

.opp-status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid #0d4a28;
}

.opp-info {
  text-align: center;
  max-width: 70px;
}

.opp-name {
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70px;
}

.opp-chips {
  color: #f5c842;
  font-size: 11px;
}

.opp-bet {
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(0,0,0,0.5);
  border-radius: 10px;
  padding: 2px 6px;
}

.bet-chip { font-size: 11px; }
.bet-amount { color: #f5c842; font-size: 11px; font-weight: 700; }

.opp-cards {
  display: flex;
  gap: 3px;
  position: relative;
}

/* ===== 发牌动画（背面飞入） ===== */
.card-back {
  font-size: 22px;
  line-height: 1;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
}

.deal-anim {
  animation: dealFlyIn 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
  animation-fill-mode: both;
}

@keyframes dealFlyIn {
  from {
    transform: translate(0, -60px) scale(0.6) rotate(-15deg);
    opacity: 0;
  }
  to {
    transform: translate(0, 0) scale(1) rotate(0deg);
    opacity: 1;
  }
}

.card-back-inner {
  display: inline-block;
  transition: transform 0.15s;
}

.card-back.deal-anim:active .card-back-inner {
  transform: scale(0.92);
}

.allin-badge {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%);
  background: #f39c12;
  color: #fff;
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 700;
  white-space: nowrap;
}

.fold-mask {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  border-radius: 8px;
  color: rgba(255,255,255,0.4);
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.is-folded {
  opacity: 0.4;
  filter: grayscale(0.5);
}

/* 当前行动高亮环 */
.is-turn {
  filter: drop-shadow(0 0 12px rgba(245,200,66,0.7)) !important;
}

.turn-ring {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid #f5c842;
  animation: turnPulse 1s infinite ease-in-out;
  pointer-events: none;
  z-index: 10;
  width: 50px;
  height: 50px;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
}

@keyframes turnPulse {
  0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
  50% { opacity: 0.5; transform: translateX(-50%) scale(1.1); }
}

/* 倒计时环 */
.timer-ring {
  position: absolute;
  width: 50px;
  height: 50px;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 11;
  pointer-events: none;
}

/* ===== 公共牌 ===== */
.community-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  z-index: 2;
}

.community-cards {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
}

.community-cards-inner {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
}

.community-card {
  width: 46px;
  height: 64px;
  background: #fff;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  position: relative;
  transition: all 0.3s;
}

.community-card .card-rank {
  font-size: 18px;
  font-weight: 800;
  color: #2c3e50;
  line-height: 1;
}

.community-card .card-suit {
  font-size: 18px;
  color: #2c3e50;
  line-height: 1;
}

.community-card.card-red .card-rank,
.community-card.card-red .card-suit {
  color: #e74c3c;
}

.community-card.placeholder {
  background: rgba(255,255,255,0.08);
  border: 2px dashed rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.2);
  font-size: 20px;
  box-shadow: none;
}

/* 公共牌翻入动画 */
.community-flip-enter-active {
  animation: communityFlipIn 0.45s ease both;
}

.community-flip-leave-active {
  display: none;
}

@keyframes communityFlipIn {
  0%   { transform: rotateY(90deg) translateY(-10px) scale(0.8); opacity: 0; }
  60%  { transform: rotateY(-8deg) translateY(2px) scale(1.05); opacity: 1; }
  100% { transform: rotateY(0) translateY(0) scale(1); opacity: 1; }
}

.last-action {
  background: rgba(0,0,0,0.4);
  border-radius: 16px;
  padding: 4px 14px;
}

.last-action-text {
  color: rgba(255,255,255,0.7);
  font-size: 12px;
}

/* ===== 我的区域 ===== */
.my-area {
  background: rgba(0,0,0,0.35);
  padding: 10px 14px 8px;
  flex-shrink: 0;
}

.my-cards {
  display: flex;
  gap: 14px;
  justify-content: center;
  margin-bottom: 10px;
}

/* ===== 手牌发牌飞入 ===== */
.my-card-flip-wrap {
  position: relative;
  width: 60px;
  height: 84px;
  perspective: 600px;
  cursor: pointer;
  animation: myCardDealIn 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
  animation-fill-mode: both;
}

@keyframes myCardDealIn {
  from {
    transform: translate(0, -80px) scale(0.5) rotate(-20deg);
    opacity: 0;
  }
  to {
    transform: translate(0, 0) scale(1) rotate(0deg);
    opacity: 1;
  }
}

/* 3D 翻牌容器 */
.my-card-3d {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.my-card-3d.is-revealed {
  transform: rotateY(180deg);
}

/* 公共的正/背面样式 */
.face-front,
.face-back {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 20px rgba(0,0,0,0.5);
}

/* 背面 */
.face-back {
  background: linear-gradient(135deg, #1a3a5c 0%, #0d2137 50%, #1a3a5c 100%);
  border: 2px solid rgba(255,255,255,0.15);
  overflow: hidden;
}

.card-back-pattern {
  position: absolute;
  inset: 4px;
  border-radius: 5px;
  border: 1.5px solid rgba(255,255,255,0.2);
  background:
    repeating-linear-gradient(
      45deg,
      transparent,
      transparent 4px,
      rgba(255,255,255,0.04) 4px,
      rgba(255,255,255,0.04) 8px
    );
}

.back-icon {
  font-size: 36px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
  z-index: 1;
}

.tap-hint {
  position: absolute;
  bottom: 5px;
  font-size: 9px;
  color: rgba(255,255,255,0.45);
  letter-spacing: 0.3px;
  z-index: 1;
}

/* 正面 */
.face-front {
  background: #fff;
  transform: rotateY(180deg);
  transition: transform 0.2s, box-shadow 0.2s;
}

.face-front.card-highlight {
  transform: rotateY(180deg) translateY(-4px);
  box-shadow: 0 10px 28px rgba(245,200,66,0.45);
}

.my-card-rank {
  font-size: 24px;
  font-weight: 800;
  color: #2c3e50;
  line-height: 1;
}

.my-card-suit {
  font-size: 22px;
  color: #2c3e50;
  line-height: 1;
}

.face-front.card-red .my-card-rank,
.face-front.card-red .my-card-suit {
  color: #e74c3c;
}

.my-card-corner {
  position: absolute;
  top: 4px;
  left: 5px;
  display: flex;
  flex-direction: column;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.1;
  color: inherit;
}

/* 未开始时的空白背面 */
.back-card {
  width: 60px;
  height: 84px;
  font-size: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a3a5c, #0d2137);
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.my-info-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.my-avatar-area {
  display: flex;
  align-items: center;
  gap: 8px;
}

.my-avatar {
  font-size: 28px;
}

.my-name {
  display: block;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.my-chips {
  display: block;
  color: #f5c842;
  font-size: 12px;
}

.my-bet-area {
  margin-left: auto;
  text-align: right;
}

.my-bet-label {
  color: rgba(255,255,255,0.45);
  font-size: 11px;
  display: block;
}

.my-bet-val {
  font-size: 16px;
  font-weight: 700;
}

.my-timer {
  margin-left: auto;
}

.timer-num {
  font-size: 24px;
  font-weight: 800;
  color: #fff;
  transition: color 0.3s;
}

.timer-num.urgent {
  color: #e74c3c;
  animation: urgentPulse 0.5s infinite;
}

@keyframes urgentPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ===== 操作面板 ===== */
.action-panel {
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(12px);
  flex-shrink: 0;
  border-top: 1px solid rgba(255,255,255,0.1);
}

.action-panel-inner {
  padding: 10px 14px 16px;
  max-width: 480px;
  margin: 0 auto;
}

/* 加注滑块 */
.raise-area {
  margin-bottom: 12px;
  padding: 12px;
  background: rgba(255,255,255,0.05);
  border-radius: 12px;
}

.raise-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.raise-label {
  color: rgba(255,255,255,0.6);
  font-size: 13px;
}

.raise-val {
  font-size: 20px;
  font-weight: 800;
}

.raise-presets {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.raise-preset {
  padding: 4px 12px;
  border-radius: 16px;
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.7);
  font-size: 12px;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.15);
  transition: all 0.2s;
}

.raise-preset:active {
  background: rgba(245,200,66,0.2);
  color: #f5c842;
}

/* 操作按钮行 */
.action-buttons {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1.2fr;
  gap: 10px;
}

.action-btn {
  height: 60px !important;
  border-radius: 14px !important;
  width: 100% !important;
}

.btn-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.btn-icon {
  font-size: 18px;
  line-height: 1;
}

.btn-text {
  font-size: 13px;
  font-weight: 700;
}

.btn-amount {
  font-size: 12px;
  font-weight: 800;
}

/* ===== 结算弹窗 ===== */
.result-popup {
  padding: 24px 20px;
}

.result-title {
  color: #f5c842;
  font-size: 20px;
  font-weight: 800;
  text-align: center;
  margin-bottom: 20px;
}

.result-winner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(245,200,66,0.1);
  border: 1px solid rgba(245,200,66,0.3);
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.winner-avatar {
  font-size: 36px;
}

.winner-info {
  flex: 1;
}

.winner-name {
  display: block;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
}

.winner-hand {
  display: block;
  color: #f5c842;
  font-size: 13px;
}

.winner-gain {
  font-size: 22px;
  font-weight: 800;
}

.result-all-hands {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hand-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hand-avatar {
  font-size: 20px;
}

.hand-name {
  color: rgba(255,255,255,0.7);
  font-size: 13px;
  width: 60px;
  flex-shrink: 0;
}

.hand-cards {
  display: flex;
  gap: 4px;
  flex: 1;
}

.hand-card {
  background: #fff;
  color: #2c3e50;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 4px;
}

.hand-card.red {
  color: #e74c3c;
}

.hand-type {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  text-align: right;
  flex-shrink: 0;
}

/* ===== 操作日志 ===== */
.action-log {
  position: absolute;
  top: 52px;
  left: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  pointer-events: none;
  z-index: 20;
}

.log-item {
  background: rgba(0,0,0,0.6);
  color: rgba(255,255,255,0.8);
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 10px;
  border-left: 2px solid #f5c842;
}

:deep(.van-slider__bar) {
  background: linear-gradient(90deg, #f5c842, #f39c12) !important;
}

:deep(.van-slider__button) {
  background: #f5c842 !important;
  border: none !important;
  width: 20px !important;
  height: 20px !important;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
}
</style>
