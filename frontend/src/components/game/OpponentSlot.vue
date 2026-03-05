<template>
  <div
    class="opponent-slot"
    :class="[
      { 'is-turn': player.id === currentPlayerId },
      { 'is-folded': player.status === 'folded' },
      { 'is-disconnected': player.connected === false }
    ]"
  >
    <!-- 当前行动指示器（倒计时光圈） -->
    <svg v-if="player.id === currentPlayerId" class="turn-timer-ring" viewBox="0 0 52 52">
      <!-- 底环（暗色背景） -->
      <circle cx="26" cy="26" r="23" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="3"/>
      <!-- 倒计时弧线 -->
      <circle
        cx="26" cy="26" r="23" fill="none"
        :stroke="timerColor"
        stroke-width="3"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="circumference - (circumference * timerProgress / 100)"
        stroke-linecap="round"
        transform="rotate(-90 26 26)"
        class="timer-arc"
      />
      <!-- 外发光 -->
      <circle cx="26" cy="26" r="24.5" fill="none" :stroke="timerGlowColor" stroke-width="1" class="timer-glow"/>
    </svg>

    <!-- 玩家头像 -->
    <div class="opp-avatar-wrap" :class="{ 'avatar-disconnected': player.connected === false }">
      <span class="opp-avatar">{{ player.avatar }}</span>
      <span
        class="opp-status-dot"
        :style="{ background: PLAYER_STATUS_COLORS[player.status] }"
      ></span>
      <span v-if="player.isDealer" class="role-badge dealer-badge">D</span>
      <span v-if="player.isSmallBlind" class="role-badge sb-badge">SB</span>
      <span v-if="player.isBigBlind" class="role-badge bb-badge">BB</span>
    </div>

    <!-- 玩家信息 -->
    <div class="opp-info">
      <div class="opp-name">
        <span v-if="player.isBot" class="bot-indicator">🤖</span>{{ player.nickname }}<span v-if="player.connected === false" class="disconnected-badge">📶断线</span>
      </div>
      <div class="opp-chips">{{ player.chips?.toLocaleString?.() ?? player.chips }}</div>
      <div v-if="displayBet > 0 && player.status !== 'folded'" class="opp-bet">
<img src="/chip.png" class="chip-icon" />
        <span class="bet-amount">{{ displayBet }}</span>
      </div>
    </div>

    <!-- 弃牌遮罩 -->
    <div v-if="player.status === 'folded'" class="fold-mask">弃牌</div>

    <!-- ALL IN 标记 -->
    <div v-if="player.status === 'allin'" class="allin-badge">ALL IN</div>


  </div>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { PLAYER_STATUS_COLORS } from '../../utils/cardUtils'

const props = defineProps({
  player: { type: Object, required: true },
  currentPlayerId: { type: String, default: null },
  displayBet: { type: Number, default: 0 },
  actionDeadline: { type: Number, default: null },   // 服务端行动截止时间戳（ms）
  actionDuration: { type: Number, default: 30000 }    // 行动总时长（ms）
})

// 圆环周长
const circumference = computed(() => 2 * Math.PI * 23)

// 内部倒计时进度（0~100）
const timerProgress = ref(100)
let timerInterval = null

function startCountdown() {
  stopCountdown()
  if (!props.actionDeadline) {
    timerProgress.value = 100
    return
  }
  // 立即计算一次
  updateProgress()
  // 每 100ms 更新一次，保证动画流畅
  timerInterval = setInterval(updateProgress, 100)
}

function updateProgress() {
  if (!props.actionDeadline) {
    timerProgress.value = 100
    stopCountdown()
    return
  }
  const now = Date.now()
  const remaining = props.actionDeadline - now
  const duration = props.actionDuration || 30000
  if (remaining <= 0) {
    timerProgress.value = 0
    stopCountdown()
  } else {
    timerProgress.value = Math.min(100, (remaining / duration) * 100)
  }
}

function stopCountdown() {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

// 当该对手成为/不再是当前行动者，或 deadline 变化时，重新启动倒计时
watch(
  () => props.player.id === props.currentPlayerId ? props.actionDeadline : null,
  (newVal) => {
    if (newVal) {
      startCountdown()
    } else {
      stopCountdown()
      timerProgress.value = 100
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  stopCountdown()
})

// 颜色根据倒计时进度变化：充裕时金色 → 中等时橙色 → 紧急时红色
const timerColor = computed(() => {
  const p = timerProgress.value
  if (p > 50) return '#f5c842'
  if (p > 25) return '#f59e42'
  return '#e74c3c'
})

const timerGlowColor = computed(() => {
  const p = timerProgress.value
  if (p > 50) return 'rgba(245,200,66,0.3)'
  if (p > 25) return 'rgba(245,158,66,0.3)'
  return 'rgba(231,76,60,0.4)'
})
</script>

<style scoped>
.opponent-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: auto;
  transition: all 0.3s;
}

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

.role-badge {
  position: absolute;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  color: #fff;
  white-space: nowrap;
  z-index: 5;
  pointer-events: none;
  box-shadow: 0 1px 4px rgba(0,0,0,0.5);
}

.dealer-badge {
  top: -4px;
  left: -4px;
  background: #f5c842;
  color: #333;
}

.sb-badge {
  bottom: -4px;
  left: -6px;
  background: #3498db;
}

.bb-badge {
  bottom: -4px;
  left: -6px;
  background: #e74c3c;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.bot-indicator {
  font-size: 10px;
  flex-shrink: 0;
}

.opp-chips {
  color: rgba(255,255,255,0.5);
  font-size: 10px;
  margin-top: 1px;
}

.opp-bet {
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(0,0,0,0.65);
  border: 1px solid rgba(245,200,66,0.4);
  border-radius: 10px;
  padding: 2px 8px;
  margin-top: 2px;
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

.bet-amount { color: #f5c842; font-size: 12px; font-weight: 800; }

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

.is-folded {
  opacity: 0.4;
  filter: grayscale(0.5);
}

.is-disconnected .opp-avatar-wrap.avatar-disconnected {
  filter: grayscale(80%) opacity(0.5);
}

.is-disconnected .opp-info {
  opacity: 0.6;
}

.disconnected-badge {
  font-size: 9px;
  color: #95a5a6;
  margin-left: 3px;
  font-weight: 400;
  white-space: nowrap;
}

.is-turn {
  filter: drop-shadow(0 0 12px rgba(245,200,66,0.5)) !important;
}

.turn-timer-ring {
  position: absolute;
  width: 52px;
  height: 52px;
  top: -5px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  pointer-events: none;
}

.timer-arc {
  transition: stroke-dashoffset 0.15s linear, stroke 0.5s ease;
}

.timer-glow {
  transition: stroke 0.5s ease;
  animation: glowPulse 2s infinite ease-in-out;
}

@keyframes glowPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
