<template>
  <van-popup
    v-model:show="visible"
    round
    position="bottom"
    :style="{ background: '#1a1a2e', maxHeight: '80vh', overflowY: 'auto' }"
  >
    <div class="rules-panel">
      <div class="rules-title">🃏 德州扑克牌型大小</div>
      <div class="rules-subtitle">从大到小排列</div>
      <div class="rule-row" v-for="r in HAND_RULES" :key="r.name">
        <div class="rule-header">
          <span class="rule-rank">{{ r.rank }}</span>
          <span class="rule-name">{{ r.name }}</span>
          <span class="rule-desc">{{ r.desc }}</span>
        </div>
        <div class="rule-cards">
          <span
            v-for="(c, i) in r.cards"
            :key="i"
            class="rule-card"
            :class="c.red ? 'red' : 'black'"
          >{{ c.v }}</span>
        </div>
      </div>
      <div class="rules-note">同牌型比较最大牌点数，花色不分大小</div>
      <van-button
        block round
        style="margin-top: 16px; background: rgba(255,255,255,0.1); color: #fff; border-color: transparent;"
        @click="visible = false"
      >关闭</van-button>
    </div>
  </van-popup>
</template>

<script setup>
import { HAND_RULES } from '../../constants/handRules'

const visible = defineModel({ type: Boolean, default: false })
</script>

<style scoped>
.rules-panel {
  padding: 20px 16px 24px;
  color: #fff;
}

.rules-title {
  font-size: 18px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 2px;
}

.rules-subtitle {
  font-size: 12px;
  color: rgba(255,255,255,0.4);
  text-align: center;
  margin-bottom: 14px;
}

.rule-row {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255,255,255,0.05);
  margin-bottom: 8px;
}

.rule-header {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
}

.rule-rank {
  font-size: 13px;
  font-weight: 700;
  color: #ffd700;
  white-space: nowrap;
}

.rule-name { font-size: 13px; font-weight: 600; }
.rule-desc { font-size: 11px; color: rgba(255,255,255,0.5); margin-left: auto; }

.rule-cards { display: flex; gap: 6px; flex-wrap: wrap; }

.rule-card {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
}

.rule-card.red { color: #e74c3c; }
.rule-card.black { color: #1a1a1a; }

.rules-note {
  font-size: 11px;
  color: rgba(255,255,255,0.35);
  text-align: center;
  margin-top: 10px;
}
</style>
