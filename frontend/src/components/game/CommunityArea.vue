<template>
  <div class="community-area">
    <!-- 底池（屏幕横向居中） -->
    <div class="pot-display" v-if="pot > 0">
      <span class="pot-display-label">底池</span>
      <span class="pot-display-value">
        <img src="/pot-icon.png" class="chip-icon" />{{ pot.toLocaleString() }}
      </span>
    </div>

    <!-- 牌堆（隐藏，仅保留 ref 供发牌动画定位） -->
    <div ref="deckEl" style="display:none"></div>

    <!-- 公共牌 -->
    <div class="community-cards">
      <div class="community-cards-inner">
        <div
          v-for="(slot, i) in communitySlots"
          :key="i"
          class="community-card-wrap"
          :class="{ 'flip-revealed': slot.revealed }"
        >
          <div class="comm-face comm-back">
            <div class="comm-back-pattern"></div>
          </div>
          <div
            class="comm-face comm-front"
            :class="{ 'card-red': slot.card && isRedCard(slot.card) }"
          >
            <template v-if="slot.card">
              <div class="card-rank">{{ getCardRank(slot.card) }}</div>
              <div class="card-suit">{{ getCardSuit(slot.card) }}</div>
              <div class="comm-card-corner top-left">
                <span>{{ getCardRank(slot.card) }}</span>
                <span>{{ getCardSuit(slot.card) }}</span>
              </div>
            </template>
          </div>
        </div>
        <div
          v-for="n in (5 - communitySlots.length)"
          :key="'ph-' + n"
          class="community-card placeholder"
        >?</div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useCardDisplay } from '../../composables/useCardDisplay'

const { getCardRank, getCardSuit, isRedCard } = useCardDisplay()

const props = defineProps({
  pot: { type: Number, default: 0 },
  deckVisible: { type: Boolean, default: true },
  deckCardCount: { type: Number, default: 0 },
  communitySlots: { type: Array, default: () => [] }
})

// 暴露牌堆 DOM ref 供父组件获取（用于发牌动画定位）
const deckEl = ref(null)
defineExpose({ deckEl })
</script>

<style scoped>
.community-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 2;
  width: 100%;
  position: relative;
}



.pot-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.45);
  border: 1px solid rgba(245,200,66,0.3);
  border-radius: 12px;
  padding: 6px 16px;
  min-width: 90px;
  z-index: 5;
  white-space: nowrap;
}

.pot-display-label {
  font-size: 12px;
  color: rgba(255,255,255,0.45);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.pot-display-value {
  font-size: 24px;
  font-weight: 800;
  color: #f5c842;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.chip-icon {
  display: inline-block;
  width: 24px;
  height: 24px;
  object-fit: contain;
  vertical-align: middle;
  flex-shrink: 0;
  margin-right: 3px;
}



/* 公共牌 */
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

.community-card-wrap {
  width: 46px;
  height: 64px;
  position: relative;
  perspective: 500px;
  -webkit-perspective: 500px;
  flex-shrink: 0;
}

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
  -webkit-transition: -webkit-transform 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}

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
  background: repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.05) 3px, rgba(255,255,255,0.05) 6px);
}

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

.comm-card-corner {
  position: absolute;
  top: 3px;
  left: 4px;
  display: flex;
  flex-direction: column;
  font-size: 9px;
  font-weight: 700;
  line-height: 1.1;
  color: #2c3e50;
}

.comm-front.card-red .comm-card-corner {
  color: #e74c3c;
}

.community-card-wrap.flip-revealed .comm-back {
  transform: rotateY(-180deg);
}

.community-card-wrap.flip-revealed .comm-front {
  transform: rotateY(0deg);
}

.community-card.placeholder {
  width: 46px;
  height: 64px;
  background: rgba(255,255,255,0.08);
  border: 2px dashed rgba(255,255,255,0.2);
  border-radius: 6px;
  color: rgba(255,255,255,0.2);
  font-size: 20px;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

</style>
