<template>
  <div
    class="action-panel"
    :class="{ 'action-panel-disabled': !isMyTurn || !isInGame || phase === 'showdown' || phase === 'waiting' }"
  >
    <div class="action-panel-inner">
      <div class="action-buttons">
        <!-- 弃牌 -->
        <van-button class="btn-red action-btn" :disabled="!isMyTurn" @click="$emit('action', 'fold')">
          <div class="btn-inner">
            <span class="btn-text">弃牌</span>
          </div>
        </van-button>

        <!-- 跟注/看牌 -->
        <van-button class="btn-gray action-btn" :disabled="!isMyTurn" @click="$emit('action', canCheck ? 'check' : 'call')">
          <div class="btn-inner">
            <span class="btn-text">{{ canCheck ? '看牌' : '跟注' }}</span>
            <span v-if="!canCheck" class="btn-amount gold">{{ callAmount }}</span>
          </div>
        </van-button>

        <!-- 加注 -->
        <van-button class="btn-green action-btn" :disabled="!isMyTurn" @click="$emit('openChipPicker')">
          <div class="btn-inner">
            <span class="btn-text">加注</span>
          </div>
        </van-button>

        <!-- All In -->
        <van-button class="btn-allin action-btn" :disabled="!isMyTurn" @click="$emit('action', 'allin')">
          <div class="btn-inner">
            <span class="btn-text">All In</span>
            <span class="btn-amount gold">{{ myChips }}</span>
          </div>
        </van-button>
      </div>
    </div>
  </div>

  <!-- 筹码选择弹窗 -->
  <van-popup
    v-model:show="chipPickerVisible"
    round
    position="bottom"
    :style="{ background: '#1a1a2e', borderTop: '2px solid rgba(245,200,66,0.3)' }"
  >
    <div class="chip-picker">
      <div class="chip-picker-header">
        <span class="chip-picker-title">选择筹码</span>
        <span class="chip-picker-total gold">加注到: {{ chipTotal }}</span>
      </div>
      <!-- 快捷加注按钮 -->
      <div class="quick-bet-row">
        <button
          v-for="btn in quickBetButtons"
          :key="btn.label"
          class="quick-bet-btn"
          :class="btn.cls"
          :disabled="btn.amount < props.minRaise"
          @click="applyQuickBet(btn.amount)"
        >{{ btn.label }}</button>
      </div>
      <div class="chip-grid">
        <div v-for="chip in chipDenominations" :key="chip.value" class="chip-col">
          <div class="chip-token">
            <img class="chip-token-img" :src="`/chips/${chip.value}.svg`" :alt="`${chip.value}筹码`" />
          </div>
          <van-picker
            :key="pickerKey + '-' + chip.value"
            :columns="chip.columns"
            :visible-option-num="3"
            :option-height="36"
            :show-toolbar="false"
            @change="(val) => onChipCountChange(chip.value, val)"
          />
          <div class="chip-subtotal">
            <span class="gold">{{ chip.value * chipCounts[chip.value] }}</span>
          </div>
        </div>
      </div>
      <div class="chip-picker-footer">
        <van-button class="chip-cancel-btn" @click="chipPickerVisible = false">取消</van-button>
        <van-button
          class="chip-confirm-btn"
          :disabled="chipTotal < minRaise || chipTotal > maxRaise"
          @click="confirmRaise"
        >
          确认加注 <span class="gold">{{ chipTotal }}</span>
        </van-button>
      </div>
      <div v-if="chipTotal < minRaise" class="chip-hint warn">
        最低加注 {{ minRaise }}（含跟注 {{ callAmount }}）
      </div>
      <div v-else-if="chipTotal > maxRaise" class="chip-hint warn">
        超出持有筹码 {{ maxRaise }}
      </div>
    </div>
  </van-popup>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  isMyTurn: { type: Boolean, default: false },
  isInGame: { type: Boolean, default: false },
  phase: { type: String, default: 'waiting' },
  canCheck: { type: Boolean, default: false },
  callAmount: { type: Number, default: 0 },
  myChips: { type: Number, default: 0 },
  minRaise: { type: Number, default: 0 },
  maxRaise: { type: Number, default: 0 },
  pot: { type: Number, default: 0 }
})

const emit = defineEmits(['action', 'openChipPicker'])

// 快捷加注按钮
const quickBetButtons = computed(() => {
  const pot = props.pot || 0
  const max = props.maxRaise
  const clamp = (v) => Math.min(Math.max(Math.floor(v), 0), max)
  return [
    { label: '½池', amount: clamp(pot / 2), cls: 'qb-half' },
    { label: '全池', amount: clamp(pot), cls: 'qb-full' },
    { label: '2倍池', amount: clamp(pot * 2), cls: 'qb-double' },
    { label: 'All In', amount: max, cls: 'qb-allin' }
  ]
})

function applyQuickBet(amount) {
  if (amount < props.minRaise || amount > props.maxRaise) return
  // 按面值从大到小贪心分配，余数直接截断（最小面值10，不凑整以免超出）
  let remaining = amount
  const newCounts = { 10: 0, 20: 0, 50: 0, 100: 0 }
  for (const val of [100, 50, 20, 10]) {
    newCounts[val] = Math.floor(remaining / val)
    remaining = remaining % val
  }
  // remaining < 10 的余数丢弃（保证不超出 amount）
  chipCounts.value = newCounts
  pickerKey.value++
}

// 筹码选择器
const chipPickerVisible = ref(false)
const chipCounts = ref({ 10: 0, 20: 0, 50: 0, 100: 0 })
const pickerKey = ref(0)

const chipDenominations = computed(() => {
  const maxCount = (val) => Math.floor(props.maxRaise / val)
  return [10, 20, 50, 100].map(value => ({
    value,
    columns: [Array.from({ length: maxCount(value) + 1 }, (_, i) => ({ text: String(i), value: i }))]
  }))
})

const chipTotal = computed(() => {
  return Object.entries(chipCounts.value).reduce((sum, [val, count]) => sum + Number(val) * count, 0)
})

function onChipCountChange(denomination, { selectedValues }) {
  chipCounts.value[denomination] = Number(selectedValues[0])
}

function openPicker() {
  chipCounts.value = { 10: 0, 20: 0, 50: 0, 100: 0 }
  pickerKey.value++
  chipPickerVisible.value = true
}

function confirmRaise() {
  if (chipTotal.value < props.minRaise || chipTotal.value > props.maxRaise) return
  chipPickerVisible.value = false
  emit('action', 'raise', chipTotal.value)
  chipCounts.value = { 10: 0, 20: 0, 50: 0, 100: 0 }
}

defineExpose({ openPicker })
</script>

<style scoped>
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

.action-buttons {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1fr 1.2fr;
  gap: 8px;
}

.action-btn {
  height: 60px !important;
  border-radius: 14px !important;
  width: 100% !important;
  transition: opacity 0.3s, filter 0.3s;
}

.action-panel-disabled {
  pointer-events: none;
}

.action-panel-disabled .action-btn {
  opacity: 0.4 !important;
  filter: grayscale(0.8) !important;
}

.action-panel-disabled .btn-text,
.action-panel-disabled .btn-amount {
  color: rgba(255,255,255,0.35) !important;
}

.btn-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.btn-text {
  font-size: 13px;
  font-weight: 700;
}

.btn-amount {
  font-size: 12px;
  font-weight: 800;
}

.gold { color: #f5c842; }

/* 筹码选择器 */
.chip-picker {
  padding: 20px 16px;
  color: #fff;
}

.chip-picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.chip-picker-title { font-size: 18px; font-weight: 700; }
.chip-picker-total { font-size: 16px; font-weight: 800; }

.chip-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.chip-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.chip-token {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chip-token-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4));
}

.chip-col :deep(.van-picker) { background: transparent !important; width: 70px; }
.chip-col :deep(.van-picker__mask) { background-image: linear-gradient(180deg, rgba(26,26,46,0.9), rgba(26,26,46,0.4)), linear-gradient(0deg, rgba(26,26,46,0.9), rgba(26,26,46,0.4)) !important; }
.chip-col :deep(.van-picker-column__item) { color: rgba(255,255,255,0.5) !important; font-size: 16px !important; }
.chip-col :deep(.van-picker__frame) { border-top: 1px solid rgba(245,200,66,0.3) !important; border-bottom: 1px solid rgba(245,200,66,0.3) !important; }
.chip-col :deep(.van-picker__toolbar) { display: none !important; }

.chip-subtotal { font-size: 13px; font-weight: 700; min-height: 20px; }

.chip-picker-footer {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.chip-cancel-btn {
  flex: 1;
  height: 44px !important;
  border-radius: 12px !important;
  background: rgba(255,255,255,0.1) !important;
  color: rgba(255,255,255,0.7) !important;
  border: 1px solid rgba(255,255,255,0.15) !important;
  font-size: 15px !important;
  font-weight: 600 !important;
}

.chip-confirm-btn {
  flex: 2;
  height: 44px !important;
  border-radius: 12px !important;
  background: linear-gradient(135deg, #27ae60, #2ecc71) !important;
  color: #fff !important;
  border: none !important;
  font-size: 15px !important;
  font-weight: 700 !important;
}

.chip-confirm-btn:disabled { opacity: 0.4 !important; }

.chip-hint {
  text-align: center;
  font-size: 12px;
  margin-top: 8px;
  color: rgba(255,255,255,0.5);
}

.chip-hint.warn { color: #e74c3c; }

/* 快捷加注按钮 */
.quick-bet-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.quick-bet-btn {
  flex: 1;
  height: 34px;
  border-radius: 10px;
  border: none;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
  color: #fff;
}

.quick-bet-btn:active { transform: scale(0.95); }
.quick-bet-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.qb-half   { background: linear-gradient(135deg, #3498db, #2980b9); }
.qb-full   { background: linear-gradient(135deg, #27ae60, #1e8449); }
.qb-double { background: linear-gradient(135deg, #f39c12, #d68910); }
.qb-allin  { background: linear-gradient(135deg, #e74c3c, #c0392b); }
</style>
