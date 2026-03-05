<template>
  <!-- 本局结算弹窗 -->
  <van-popup
    :show="resultVisible"
    round
    position="center"
    :close-on-click-overlay="false"
    :style="{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)', width: '90%' }"
  >
    <div class="result-popup">
      <div class="result-title">🎉 本局结算</div>
      <div class="result-winner" v-if="result?.winner">
        <span class="winner-avatar">{{ result.winner.avatar }}</span>
        <div class="winner-info">
          <span class="winner-name">{{ result.winner.nickname }}</span>
          <span class="winner-hand">{{ result.winner.handName }}</span>
        </div>
        <span class="winner-gain gold">+{{ result.winner.gain }}</span>
      </div>

      <!-- 公共牌展示 -->
      <div class="result-community" v-if="result?.communityCards?.length">
        <div class="result-community-label">公共牌</div>
        <div class="result-community-cards">
          <span
            v-for="(c, i) in result.communityCards"
            :key="'comm-' + i"
            class="hand-card"
            :class="{ red: isRedCard(c) }"
          >{{ getCardRank(c) }}{{ getCardSuit(c) }}</span>
        </div>
      </div>

      <!-- 边池归属（有多个边池时展示） -->
      <div class="side-pots" v-if="result?.sidePots?.length > 1">
        <div class="side-pots-label">筹码池归属</div>
        <div
          v-for="(sp, idx) in result.sidePots"
          :key="'sp-' + idx"
          class="side-pot-row"
        >
          <span class="sp-name">{{ idx === 0 ? '主池' : '边池' + idx }}</span>
          <span class="sp-amount gold">{{ sp.amount }}</span>
          <span class="sp-arrow">→</span>
          <span class="sp-winners">{{ getSidePotWinnerNames(sp.winners) }}</span>
        </div>
      </div>

      <div class="result-all-hands">
        <div v-for="p in result?.allHands" :key="p.id" class="hand-row">
          <span class="hand-avatar">{{ p.avatar }}</span>
          <span class="hand-name">{{ p.nickname }}</span>
          <div class="hand-cards">
            <span v-for="c in p.cards" :key="c" class="hand-card" :class="{ red: isRedCard(c) }">
              {{ getCardRank(c) }}{{ getCardSuit(c) }}
            </span>
          </div>
          <span class="hand-type" :class="{ gold: p.isWinner }">{{ p.handName }}</span>
        </div>
      </div>

      <!-- 筹码变化 -->
      <div class="chips-change" v-if="result?.allHands">
        <div v-for="p in result.allHands" :key="'chips-'+p.id" class="chips-row">
          <span>{{ p.avatar }} {{ p.nickname }}</span>
          <span :class="p.chipsChange >= 0 ? 'gold' : 'red-text'">
            {{ p.chipsChange >= 0 ? '+' : '' }}{{ p.chipsChange }} → {{ p.chipsAfter }}
          </span>
        </div>
      </div>

      <!-- 有人破产 -->
      <div v-if="result?.gameOver" class="game-over-hint">
        <div style="color: #e74c3c; font-weight: bold; margin-bottom: 8px;">⚠️ {{ result.bustedNames?.join('、') }} 筹码耗尽</div>
        <van-button block round class="btn-green" style="margin-top: 8px;" :disabled="nextRoundSent" @click="$emit('nextRound')">
          {{ nextRoundSent ? `等待其他玩家确认… (${nextRoundReady}/${nextRoundTotal})` : '确认结算' }}
        </van-button>
        <div v-if="nextRoundSent" class="ready-hint">{{ nextRoundReady }}/{{ nextRoundTotal }} 人已确认</div>
        <!-- 房主可以在等待界面结束游戏 -->
        <van-button
          v-if="isOwner"
          block
          round
          type="danger"
          plain
          style="margin-top: 10px; border-color: rgba(231,76,60,0.6);"
          @click="$emit('endGame')"
        >
          结束游戏
        </van-button>
      </div>

      <!-- 正常：下一局 -->
      <div v-else>
        <van-button block round class="btn-green" style="margin-top: 16px;" :disabled="nextRoundSent" @click="$emit('nextRound')">
          {{ nextRoundSent ? `等待其他玩家… (${nextRoundReady}/${nextRoundTotal})` : '下一局 ▶' }}
        </van-button>
        <div class="ready-hint" v-if="!nextRoundSent">{{ nextRoundCountdown }}秒后自动开始</div>
        <div v-if="nextRoundSent" class="ready-hint">{{ nextRoundReady }}/{{ nextRoundTotal }} 人已准备</div>
        <!-- 房主可以在等待界面结束游戏 -->
        <van-button
          v-if="isOwner"
          block
          round
          type="danger"
          plain
          style="margin-top: 10px; border-color: rgba(231,76,60,0.6);"
          @click="$emit('endGame')"
        >
          结束游戏
        </van-button>
      </div>
    </div>
  </van-popup>

  <!-- 最终结算弹窗 -->
  <van-popup
    :show="finalVisible"
    round
    position="center"
    :close-on-click-overlay="false"
    :style="{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)', width: '90%' }"
  >
    <div class="result-popup">
      <div class="result-title">🏆 最终结算</div>
      <div v-if="finalReason" class="final-reason" style="text-align: center; color: #f5c842; font-size: 13px; margin-bottom: 12px;">{{ finalReason }}</div>
      <div class="final-players">
        <div
          v-for="(p, i) in finalPlayers"
          :key="p.id"
          class="final-player-row"
          :class="{ 'is-top': i === 0 }"
        >
          <span class="final-rank">{{ ['🥇','🥈','🥉'][i] || (i+1)+'.' }}</span>
          <span class="final-avatar">{{ p.avatar }}</span>
          <span class="final-name">{{ p.nickname }}</span>
          <span class="final-chips gold">{{ p.chips }} 筹码</span>
        </div>
      </div>
      <van-button block round class="btn-green" style="margin-top: 20px;" @click="$emit('backToRoom')">
        返回房间
      </van-button>
    </div>
  </van-popup>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useCardDisplay } from '../../composables/useCardDisplay'

const { getCardRank, getCardSuit, isRedCard } = useCardDisplay()

const props = defineProps({
  resultVisible: { type: Boolean, default: false },
  result: { type: Object, default: null },
  nextRoundSent: { type: Boolean, default: false },
  nextRoundReady: { type: Number, default: 0 },
  nextRoundTotal: { type: Number, default: 0 },
  finalVisible: { type: Boolean, default: false },
  finalPlayers: { type: Array, default: () => [] },
  finalReason: { type: String, default: '' },
  isOwner: { type: Boolean, default: false }
})

defineEmits(['nextRound', 'backToRoom', 'endGame', 'update:resultVisible', 'update:finalVisible'])

// 根据 winner id 列表，从 allHands 中查找昵称
function getSidePotWinnerNames(winnerIds) {
  if (!winnerIds || !winnerIds.length || !props.result?.allHands) return '?'
  return winnerIds.map(id => {
    const p = props.result.allHands.find(h => h.id === id)
    return p ? p.nickname : id
  }).join('、')
}

// ===== #9 结算倒计时 =====
const nextRoundCountdown = ref(60)
let countdownTimer = null

function startCountdown() {
  clearInterval(countdownTimer)
  nextRoundCountdown.value = 60
  countdownTimer = setInterval(() => {
    nextRoundCountdown.value--
    if (nextRoundCountdown.value <= 0) {
      clearInterval(countdownTimer)
    }
  }, 1000)
}

watch(() => props.resultVisible, (val) => {
  if (val) {
    startCountdown()
  } else {
    clearInterval(countdownTimer)
    nextRoundCountdown.value = 60
  }
})

onUnmounted(() => {
  clearInterval(countdownTimer)
})
</script>

<style scoped>
.result-popup { padding: 24px 20px; }

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

.winner-avatar { font-size: 36px; }
.winner-info { flex: 1; }
.winner-name { display: block; color: #fff; font-size: 16px; font-weight: 700; }
.winner-hand { display: block; color: #f5c842; font-size: 13px; }
.winner-gain { font-size: 22px; font-weight: 800; }

.result-all-hands { display: flex; flex-direction: column; gap: 8px; }

.hand-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hand-avatar { font-size: 20px; }
.hand-name { color: rgba(255,255,255,0.7); font-size: 13px; width: 60px; flex-shrink: 0; }
.hand-cards { display: flex; gap: 4px; flex: 1; }

.hand-card {
  background: #fff;
  color: #2c3e50;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 4px;
}

.hand-card.red { color: #e74c3c; }

.result-community {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}

.result-community-label { color: rgba(255, 255, 255, 0.5); font-size: 12px; flex-shrink: 0; }
.result-community-cards { display: flex; gap: 5px; flex-wrap: wrap; }

.hand-type { font-size: 12px; color: rgba(255,255,255,0.5); text-align: right; flex-shrink: 0; }

.chips-change {
  margin-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.1);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chips-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: rgba(255,255,255,0.75);
}

.gold { color: #f5c842; }
.red-text { color: #e74c3c; }

/* 边池归属 */
.side-pots {
  margin-top: 10px;
  margin-bottom: 6px;
  background: rgba(255,255,255,0.05);
  border-radius: 8px;
  padding: 8px 12px;
}

.side-pots-label {
  color: rgba(255,255,255,0.45);
  font-size: 11px;
  margin-bottom: 6px;
}

.side-pot-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 2px 0;
}

.sp-name {
  color: rgba(255,255,255,0.6);
  width: 36px;
  flex-shrink: 0;
  font-weight: 600;
}

.sp-amount {
  font-weight: 700;
  min-width: 36px;
}

.sp-arrow {
  color: rgba(255,255,255,0.35);
}

.sp-winners {
  color: #fff;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ready-hint {
  text-align: center;
  font-size: 12px;
  color: rgba(255,255,255,0.45);
  margin-top: 8px;
}

.final-players { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }

.final-player-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255,255,255,0.05);
}

.final-player-row.is-top {
  background: rgba(255, 215, 0, 0.12);
  border: 1px solid rgba(255, 215, 0, 0.3);
}

.final-rank { font-size: 20px; width: 28px; text-align: center; }
.final-avatar { font-size: 22px; }
.final-name { flex: 1; font-size: 14px; color: rgba(255,255,255,0.9); }
.final-chips { font-size: 14px; font-weight: 700; }
</style>
