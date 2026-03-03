<template>
  <div
    class="opponent-slot"
    :class="[
      { 'is-turn': player.id === currentPlayerId },
      { 'is-folded': player.status === 'folded' }
    ]"
  >
    <!-- 当前行动指示器 -->
    <div v-if="player.id === currentPlayerId" class="turn-ring"></div>

    <!-- 玩家头像 -->
    <div class="opp-avatar-wrap">
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
        <span v-if="player.isBot" class="bot-indicator">🤖</span>{{ player.nickname }}
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

    <!-- 倒计时环 -->
    <svg v-if="player.id === currentPlayerId" class="timer-ring" viewBox="0 0 36 36">
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
</template>

<script setup>
import { PLAYER_STATUS_COLORS } from '../../utils/cardUtils'

defineProps({
  player: { type: Object, required: true },
  currentPlayerId: { type: String, default: null },
  displayBet: { type: Number, default: 0 },
  timerProgress: { type: Number, default: 100 }
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
</style>
