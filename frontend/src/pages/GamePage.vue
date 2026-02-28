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

          <!-- 手牌（背面） -->
          <div class="opp-cards">
            <template v-if="p.status !== 'folded'">
              <div
                v-for="n in 2"
                :key="n"
                class="card-back"
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

      <!-- 公共牌区域 + 中央牌堆 -->
      <div class="community-area">

        <!-- 中央牌堆 -->
        <div class="deck-pile" ref="deckRef">
          <div v-for="n in 4" :key="n" class="deck-card" :style="{ '--i': n }"></div>
          <div class="deck-top">
            <div class="deck-back-pattern"></div>
            <span class="deck-count">{{ deckCardCount }}</span>
          </div>
        </div>

        <div class="community-cards">
          <div class="community-cards-inner">
            <div
              v-for="(slot, i) in communitySlots"
              :key="i"
              class="community-card-wrap"
              :class="{ 'flip-revealed': slot.revealed }"
            >
              <!-- 背面 -->
              <div class="comm-face comm-back">
                <div class="comm-back-pattern"></div>
              </div>
              <!-- 正面 -->
              <div
                class="comm-face comm-front"
                :class="{ 'card-red': slot.card && isRedCard(slot.card) }"
              >
                <template v-if="slot.card">
                  <div class="card-rank">{{ getCardRank(slot.card) }}</div>
                  <div class="card-suit">{{ getCardSuit(slot.card) }}</div>
                </template>
              </div>
            </div>
            <!-- 空占位（还没飞来的牌） -->
            <div
              v-for="n in (5 - communitySlots.length)"
              :key="'ph-' + n"
              class="community-card placeholder"
            >?</div>
          </div>
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

    <!-- 飞行牌层（Teleport 到 body，全屏绝对定位） -->
    <teleport to="body">
      <div
        v-for="fc in flyingCards"
        :key="fc.id"
        class="flying-card"
        :class="{ 'flying-card-go': fc.flying, 'flying-card-opp': fc.isOpp }"
        :style="{
          left: fc.startX + 'px',
          top: fc.startY + 'px',
          '--dx': fc.dx + 'px',
          '--dy': fc.dy + 'px',
          '--delay': fc.delay + 's',
        }"
      >
        <div class="flying-card-back"></div>
      </div>
    </teleport>

    <!-- ===== 我的区域 ===== -->
    <div class="my-area">
      <!-- 我的手牌 -->
      <div class="my-cards">
        <!-- 我的手牌（始终渲染 wrap 以便发牌动画定位；cardsVisible 控制内容显隐） -->
        <div
          v-for="(card, i) in (myCards.length ? myCards : ['', ''])"
          :key="i + '-' + (myCards[i] || 'ph') + '-' + dealAnimKey"
          class="my-card-flip-wrap"
          :style="{ animationDelay: (i * 0.15) + 's', visibility: cardsVisible && myCards.length ? 'visible' : 'hidden' }"
          :class="{ 'deal-in': cardsVisible && myCards.length }"
          @click="myCards.length && cardsVisible && toggleCardReveal(i)"
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
        <!-- 发牌动画飞行期间的背面占位（可见，作为"手牌落点"的视觉提示） -->
        <template v-if="!cardsVisible || !myCards.length">
          <div v-for="n in 2" :key="'ph'+n" class="my-card-placeholder"></div>
        </template>
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
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
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

// ====== 公共牌 slots（背面占位 + 翻面状态）======
// communitySlots: [{ card, revealed }]
// - game:start 后立刻建5个背面 slot（发牌动画飞到这里）
// - flop/turn/river 时，对应 slot 的 revealed 变 true（CSS 翻面）
const communitySlots = ref([])   // { card: string, revealed: boolean }

// 监听 communityCards 变化（flop/turn/river），逐张翻面
watch(
  () => gameState.value.communityCards,
  (newCards) => {
    if (!newCards || newCards.length === 0) return
    // 更新 slot 内容并触发翻面动画
    newCards.forEach((card, i) => {
      if (!communitySlots.value[i]) {
        communitySlots.value[i] = { card, revealed: false }
      } else {
        communitySlots.value[i].card = card
      }
      // 延迟触发翻面（每张间隔 150ms，视觉上逐张翻）
      setTimeout(() => {
        if (communitySlots.value[i]) {
          communitySlots.value[i].revealed = true
        }
      }, i * 150 + 80)
    })
  },
  { deep: true }
)

// ====== 发牌动画 ======
const deckRef = ref(null)                     // 牌堆 DOM ref
const flyingCards = ref([])                   // 飞行牌列表
const cardRevealed = ref([false, false])       // 我的手牌翻面状态
const dealAnimKey = ref(0)                    // 手牌动画 key（触发 CSS animation 重播）
const cardsVisible = ref(true)                // 是否显示真实手牌（发牌动画期间隐藏）
const deckCardCount = computed(() => {
  // 52 - 已发手牌 - 公共牌
  const players = gameState.value.players || []
  const dealt = players.reduce((s, p) => s + (p.cards?.length || 0), 0)
  return Math.max(0, 52 - dealt - 5)  // 5张公共牌总是预发出去
})

let flyIdCounter = 0

function toggleCardReveal(idx) {
  cardRevealed.value[idx] = !cardRevealed.value[idx]
}

/**
 * 触发发牌飞行动画：
 *   第一阶段：按德扑顺序给每个玩家发2张手牌
 *   第二阶段：手牌飞完后，再发5张公共牌（背面朝上，飞到公共牌区域）
 */
async function triggerDealAnimation() {
  dealAnimKey.value++
  cardRevealed.value = [false, false]
  cardsVisible.value = false          // 先隐藏真实手牌槽

  // 重置公共牌 slots（5张背面占位，发牌动画飞完后才显示）
  communitySlots.value = []

  await nextTick()

  const deckEl = deckRef.value
  if (!deckEl) {
    cardsVisible.value = true
    return
  }

  const deckRect = deckEl.getBoundingClientRect()
  const deckCx = deckRect.left + deckRect.width / 2
  const deckCy = deckRect.top + deckRect.height / 2

  const gs = gameState.value
  const players = gs.players || []
  const myId = store.player?.id

  // 按庄家位后一位开始的顺序排列（发牌顺序）
  const dealerIdx = players.findIndex(p => p.isDealer)
  const n = players.length
  const orderedPlayers = []
  for (let i = 1; i <= n; i++) {
    orderedPlayers.push(players[(dealerIdx + i) % n])
  }

  // 构造手牌发牌序列：先发第1轮，再发第2轮
  const handDeals = []
  for (let round = 0; round < 2; round++) {
    for (const p of orderedPlayers) {
      if (p.status === 'folded') continue
      handDeals.push({ type: 'hand', playerId: p.id, cardIndex: round })
    }
  }

  // 构造公共牌发牌序列：手牌发完后飞5张到公共牌区
  const commDeals = [0, 1, 2, 3, 4].map(i => ({ type: 'comm', cardIndex: i }))

  // ---- 飞行牌目标位置计算 ----
  const cardW = 36, cardH = 50

  function getDeckOrigin() {
    return {
      startX: deckCx - cardW / 2,
      startY: deckCy - cardH / 2
    }
  }

  function getHandTarget(playerId, cardIndex) {
    if (playerId === myId) {
      // 我的牌：飞到手牌槽（始终存在于 DOM）
      const wraps = document.querySelectorAll('.my-card-flip-wrap')
      const el = wraps[cardIndex]
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    } else {
      // 对手牌：飞到对手头像中心消失
      const slots = document.querySelectorAll('.opponent-slot')
      const oppIdx = opponents.value.findIndex(o => o.id === playerId)
      if (oppIdx < 0 || !slots[oppIdx]) return null
      const avatarEl = slots[oppIdx].querySelector('.opp-avatar-wrap')
      const target = avatarEl || slots[oppIdx]
      const r = target.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
  }

  function getCommTarget(cardIndex) {
    // 公共牌区域的占位格
    const wraps = document.querySelectorAll('.community-card-wrap')
    const el = wraps[cardIndex]
    if (!el) {
      // fallback: 牌堆下方居中
      return { x: deckCx, y: deckCy + 80 }
    }
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  // ---- 生成飞行牌（手牌 + 公共牌） ----
  const newCards = []
  const handCount = handDeals.length

  handDeals.forEach((deal, i) => {
    const target = getHandTarget(deal.playerId, deal.cardIndex)
    if (!target) return
    const { startX, startY } = getDeckOrigin()
    newCards.push({
      id: ++flyIdCounter,
      startX, startY,
      dx: target.x - cardW / 2 - startX,
      dy: target.y - cardH / 2 - startY,
      delay: i * 0.08,
      isOpp: deal.playerId !== myId,   // 对手牌：落地缩小消失
      flying: false
    })
  })

  // 公共牌在手牌全部飞完之后开始（手牌最后一张落地时间 = handCount*0.08 + 0.38s）
  const commStartDelay = handCount * 0.08 + 0.45

  commDeals.forEach((deal, i) => {
    const target = getCommTarget(deal.cardIndex)
    const { startX, startY } = getDeckOrigin()
    newCards.push({
      id: ++flyIdCounter,
      startX, startY,
      dx: target.x - cardW / 2 - startX,
      dy: target.y - cardH / 2 - startY,
      delay: commStartDelay + i * 0.09,
      flying: false
    })
  })

  flyingCards.value = newCards
  await nextTick()

  requestAnimationFrame(() => {
    flyingCards.value.forEach(fc => { fc.flying = true })
  })

  // 手牌动画完成后显示真实手牌槽
  const handDuration = (handCount * 0.08 + 0.42) * 1000
  setTimeout(() => {
    cardsVisible.value = true
  }, handDuration)

  // 公共牌飞行完成后，在 communitySlots 里建5个背面占位
  const commArriveDelay = (commStartDelay + 4 * 0.09 + 0.42) * 1000
  setTimeout(() => {
    flyingCards.value = []
    // 建5个背面 slot（card 先取 _hiddenCommunityCards，但不翻面）
    const hidden = gameState.value._hiddenCommunityCards || []
    communitySlots.value = hidden.map(card => ({ card, revealed: false }))
    // 如果已经有公共牌（比如 all-in 一次性发完），直接翻面
    const existing = gameState.value.communityCards || []
    existing.forEach((_, i) => {
      setTimeout(() => {
        if (communitySlots.value[i]) communitySlots.value[i].revealed = true
      }, i * 150 + 80)
    })
  }, commArriveDelay + 100)
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

/* ===== 中央牌堆 ===== */
.deck-pile {
  position: relative;
  width: 44px;
  height: 62px;
  margin: 0 auto 8px;
  cursor: default;
  flex-shrink: 0;
}

.deck-card {
  position: absolute;
  width: 44px;
  height: 62px;
  background: linear-gradient(135deg, #1a3a5c 0%, #0d2137 50%, #1a3a5c 100%);
  border-radius: 6px;
  border: 1.5px solid rgba(255,255,255,0.18);
  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  /* 叠叠乐偏移 */
  transform: translate(calc(var(--i) * -1.2px), calc(var(--i) * -1.2px));
}

.deck-top {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #1a3a5c 0%, #0d2137 50%, #1a3a5c 100%);
  border-radius: 6px;
  border: 1.5px solid rgba(255,255,255,0.25);
  box-shadow: 0 4px 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.deck-back-pattern {
  position: absolute;
  inset: 4px;
  border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.18);
  background:
    repeating-linear-gradient(
      45deg,
      transparent,
      transparent 3px,
      rgba(255,255,255,0.05) 3px,
      rgba(255,255,255,0.05) 6px
    );
}

.deck-count {
  position: relative;
  z-index: 1;
  color: rgba(255,255,255,0.55);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

/* ===== 飞行牌（全屏绝对定位） ===== */
.flying-card {
  position: fixed;
  width: 36px;
  height: 50px;
  z-index: 9999;
  pointer-events: none;
  /* 初始状态：在牌堆上方 */
  transform: rotate(0deg);
  transition: none;
}

.flying-card-go {
  /* 飞行时触发 transition */
  transform: translate(var(--dx), var(--dy)) rotate(var(--rot, 5deg));
  transition:
    transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94) var(--delay),
    opacity 0.1s ease calc(0.36s + var(--delay));
}

/* 对手牌：飞到头像位置后缩小消失 */
.flying-card-go.flying-card-opp {
  transform: translate(var(--dx), var(--dy)) rotate(var(--rot, 5deg)) scale(0);
  transition:
    transform 0.42s cubic-bezier(0.25, 0.46, 0.45, 0.94) var(--delay),
    opacity 0.15s ease calc(0.38s + var(--delay));
}

.flying-card-back {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1a3a5c 0%, #0d2137 50%, #1a3a5c 100%);
  border-radius: 5px;
  border: 1.5px solid rgba(255,255,255,0.25);
  box-shadow: 0 4px 14px rgba(0,0,0,0.5);
  background-image:
    repeating-linear-gradient(
      45deg,
      transparent,
      transparent 3px,
      rgba(255,255,255,0.05) 3px,
      rgba(255,255,255,0.05) 6px
    );
}


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

/* ===== 公共牌（3D翻面） ===== */
.community-card-wrap {
  width: 46px;
  height: 64px;
  position: relative;
  perspective: 500px;
  flex-shrink: 0;
}

/* 正背面公共 */
.comm-face {
  position: absolute;
  inset: 0;
  border-radius: 6px;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 背面：默认朝前 */
.comm-back {
  background: linear-gradient(135deg, #1a3a5c 0%, #0d2137 50%, #1a3a5c 100%);
  border: 1.5px solid rgba(255,255,255,0.2);
  overflow: hidden;
  transform: rotateY(0deg);
}

.comm-back-pattern {
  position: absolute;
  inset: 4px;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.15);
  background:
    repeating-linear-gradient(
      45deg,
      transparent,
      transparent 3px,
      rgba(255,255,255,0.05) 3px,
      rgba(255,255,255,0.05) 6px
    );
}

/* 正面：初始朝后（翻转180°） */
.comm-front {
  background: #fff;
  transform: rotateY(180deg);
}

.comm-front .card-rank {
  font-size: 18px;
  font-weight: 800;
  color: #2c3e50;
  line-height: 1;
}

.comm-front .card-suit {
  font-size: 18px;
  color: #2c3e50;
  line-height: 1;
}

.comm-front.card-red .card-rank,
.comm-front.card-red .card-suit {
  color: #e74c3c;
}

/* 翻面后：背面转走，正面转来 */
.community-card-wrap.flip-revealed .comm-back {
  transform: rotateY(-180deg);
}

.community-card-wrap.flip-revealed .comm-front {
  transform: rotateY(0deg);
}

/* ===== 旧的 community-card 占位（只剩 placeholder 用） ===== */
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
.my-card-placeholder {
  width: 60px;
  height: 84px;
  flex-shrink: 0;
  /* 透明占位：让 .my-card-flip-wrap 始终有真实位置，飞行牌能正确定位 */
}

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
