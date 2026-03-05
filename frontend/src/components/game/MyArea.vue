<template>
  <div class="my-area" ref="myAreaRef">
    <!-- 我的已下注（底牌上方） -->
    <div class="my-bet-above" v-if="displayBet > 0">
<img src="/chip.png" class="chip-icon chip-icon-lg" />
      <span class="my-bet-above-val">{{ displayBet }}</span>
    </div>

    <!-- 我的手牌区域（含左侧余额） -->
    <div class="hand-strength-row">
      <div v-if="handStrength" class="hand-strength-label">{{ handStrength }}</div>
    </div>
    <div class="my-cards-row">
      <div class="my-chips-left">
        <span class="chips-icon">💰</span>
        <span class="chips-val">{{ chips.toLocaleString() }}</span>
      </div>
      <div class="my-cards" ref="cardsContainer">
        <div
          v-for="(card, i) in (cards.length ? cards : ['', ''])"
          :key="i + '-' + (cards[i] || 'ph') + '-' + dealAnimKey"
          class="my-card-flip-wrap"
          :style="{ animationDelay: (i * 0.15) + 's', visibility: cardsVisible && cards.length ? 'visible' : 'hidden' }"
          :class="{ 'cards-fade-in': cardsVisible && cards.length }"
          @click="cards.length && cardsVisible && $emit('toggleReveal', i)"
        >
          <div class="my-card-3d" :class="{ 'is-revealed': cardRevealed[i] }">
            <!-- 背面 -->
            <div class="my-card face-back">
              <div class="card-back-pattern"></div>
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
        <template v-if="!cardsVisible || !cards.length">
          <div v-for="n in 2" :key="'ph'+n" class="my-card-placeholder"></div>
        </template>
      </div>
    </div>

    <!-- 我的信息栏 -->
    <div class="my-info-bar">
      <div class="my-avatar-area">
        <div class="my-avatar-wrap">
          <span class="my-avatar">{{ avatar }}</span>
          <span v-if="isDealer" class="role-badge dealer-badge">D</span>
          <span v-if="isSmallBlind" class="role-badge sb-badge">SB</span>
          <span v-if="isBigBlind" class="role-badge bb-badge">BB</span>
        </div>
        <div class="my-text">
          <span class="my-name">{{ nickname }}<span v-if="connected === false" class="my-disconnected-badge">📶断线</span></span>
        </div>
      </div>
      <div v-if="isMyTurn" class="my-timer">
        <span class="timer-num" :class="{ urgent: timeLeft <= 5 }">{{ timeLeft }}s</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCardDisplay } from '../../composables/useCardDisplay'
import { evaluateHandStrength } from '../../utils/handEval'

const { getCardRank, getCardSuit, isRedCard } = useCardDisplay()

const props = defineProps({
  cards: { type: Array, default: () => [] },
  chips: { type: Number, default: 0 },
  displayBet: { type: Number, default: 0 },
  cardRevealed: { type: Array, default: () => [false, false] },
  cardsVisible: { type: Boolean, default: true },
  dealAnimKey: { type: Number, default: 0 },
  isMyTurn: { type: Boolean, default: false },
  timeLeft: { type: Number, default: 30 },
  avatar: { type: String, default: '' },
  nickname: { type: String, default: '' },
  isDealer: { type: Boolean, default: false },
  isSmallBlind: { type: Boolean, default: false },
  isBigBlind: { type: Boolean, default: false },
  connected: { type: Boolean, default: true },
  communityCards: { type: Array, default: () => [] }
})

const handStrength = computed(() => {
  if (!props.communityCards || props.communityCards.length < 3) return null
  return evaluateHandStrength(props.cards, props.communityCards)
})

defineEmits(['toggleReveal'])

const myAreaRef = ref(null)
const cardsContainer = ref(null)

defineExpose({ myAreaRef, cardsContainer })
</script>

<style scoped>
.my-area {
  background: rgba(0,0,0,0.35);
  padding: 10px 14px 8px;
  flex-shrink: 0;
}

/* 手牌强度标签独立一行，居中显示在手牌上方 */
.hand-strength-row {
  min-height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.my-cards-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}

.my-chips-left {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1;
}

.my-chips-left .chips-icon { font-size: 18px; line-height: 1; }
.my-chips-left .chips-val {
  color: #ffd700;
  font-size: 13px;
  font-weight: 700;
  margin-top: 2px;
  text-shadow: 0 1px 4px rgba(0,0,0,0.5);
}

.my-cards {
  display: flex;
  gap: 14px;
  justify-content: center;
}

.my-card-placeholder {
  width: 60px;
  height: 84px;
  flex-shrink: 0;
}

.my-card-flip-wrap {
  position: relative;
  width: 60px;
  height: 84px;
  perspective: 600px;
  -webkit-perspective: 600px;
  cursor: pointer;
}

.cards-fade-in {
  animation: cardsFadeIn 0.18s ease both;
}

@keyframes cardsFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.my-card-3d {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  -webkit-transform-style: preserve-3d;
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.my-card-3d.is-revealed {
  transform: rotateY(180deg);
}

.face-front, .face-back {
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
  background: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.04) 4px, rgba(255,255,255,0.04) 8px);
}

.tap-hint {
  position: absolute;
  bottom: 5px;
  font-size: 9px;
  color: rgba(255,255,255,0.45);
  letter-spacing: 0.3px;
  z-index: 1;
}

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
.face-front.card-red .my-card-suit,
.face-front.card-red .my-card-corner {
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

.chip-icon {
  display: inline-block;
  width: 16px;
  height: 16px;
  object-fit: contain;
  vertical-align: middle;
  flex-shrink: 0;
  margin-right: 2px;
}

.chip-icon-lg {
  width: 32px;
  height: 32px;
}

.my-bet-above {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-bottom: 14px;
  animation: betAboveFadeIn 0.3s ease both;
}

.my-bet-above-val {
  font-size: 18px;
  font-weight: 800;
  color: #f5c842;
  text-shadow: 0 1px 6px rgba(245, 200, 66, 0.5);
  letter-spacing: 0.5px;
}

@keyframes betAboveFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
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

.my-avatar-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.my-avatar { font-size: 28px; }

.my-name {
  display: block;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.my-disconnected-badge {
  font-size: 11px;
  color: #95a5a6;
  margin-left: 4px;
  font-weight: 400;
}

.hand-strength-label {
  display: inline-block;
  text-align: center;
  font-size: 14px;
  font-weight: 800;
  color: #f5c842;
  text-shadow: 0 1px 8px rgba(245,200,66,0.6);
  letter-spacing: 1px;
  animation: fadeInDown 0.3s ease;
  white-space: nowrap;
  background: rgba(245,200,66,0.1);
  padding: 2px 12px;
  border-radius: 20px;
  border: 1px solid rgba(245,200,66,0.3);
}

@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
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

.dealer-badge { top: -4px; left: -4px; background: #f5c842; color: #333; }
.sb-badge { bottom: -4px; left: -6px; background: #3498db; }
.bb-badge { bottom: -4px; left: -6px; background: #e74c3c; }

.my-timer { margin-left: auto; }

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
</style>
