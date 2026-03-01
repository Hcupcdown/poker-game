<template>
  <div class="game-page" :class="{ 'my-turn': isMyTurn }">

    <!-- ===== 顶部状态栏 ===== -->
    <div class="top-bar">
      <div class="top-left">
        <span class="phase-badge">{{ PHASE_NAMES[gameState.phase] }}</span>
      </div>
      <div class="top-right">
        <span class="room-code">{{ roomId }}</span>
        <!-- 牌型规则 -->
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
    <van-popup
      v-model:show="showRules"
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
        <van-button block round style="margin-top: 16px; background: rgba(255,255,255,0.1); color: #fff; border-color: transparent;" @click="showRules = false">关闭</van-button>
      </div>
    </van-popup>

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
            <!-- 庄家/盲注标识 -->
            <span v-if="p.isDealer" class="role-badge dealer-badge">D</span>
            <span v-if="p.isSmallBlind" class="role-badge sb-badge">SB</span>
            <span v-if="p.isBigBlind" class="role-badge bb-badge">BB</span>
          </div>

          <!-- 玩家信息 -->
          <div class="opp-info">
            <div class="opp-name">{{ p.nickname }}</div>
            <div class="opp-chips">{{ formatChips(p.chips) }}</div>
          </div>

          <!-- 当前下注 -->
          <div v-if="p.currentBet > 0 && p.status !== 'folded'" class="opp-bet">
            <span class="chip-icon"></span>
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

        <!-- 底池 + 牌堆 横排 -->
        <div class="center-row">
          <!-- 底池 -->
          <div class="pot-display" v-if="gameState.pot > 0">
            <span class="pot-display-label">底池</span>
            <span class="pot-display-value"><span class="chip-icon"></span>{{ gameState.pot.toLocaleString() }}</span>
          </div>

          <!-- 中央牌堆 -->
          <div class="deck-pile" ref="deckRef">
            <div v-for="n in 4" :key="n" class="deck-card" :style="{ '--i': n }"></div>
            <div class="deck-top">
              <div class="deck-back-pattern"></div>
              <span class="deck-count">{{ deckCardCount }}</span>
            </div>
          </div>
        </div><!-- /center-row -->

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

    </div><!-- /table-area -->

    <!-- ===== 行动 Toast ===== -->
    <transition name="action-toast-trans">
      <div v-if="actionToast" class="action-toast" :class="'toast-' + actionToast.type">
        <span class="toast-name">{{ actionToast.name }}</span>
        <span class="toast-verb">{{ ACTION_NAMES[actionToast.type] || actionToast.type }}</span>
        <span v-if="actionToast.amount > 0" class="toast-amount"><span class="chip-icon chip-icon-lg"></span>{{ actionToast.amount.toLocaleString() }}</span>
      </div>
    </transition>

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
    <div class="my-area" ref="myAreaRef">
      <!-- 我的手牌 -->
      <div class="my-cards" ref="myCardsRef">
        <!-- 我的手牌（始终渲染 wrap 以便发牌动画定位；cardsVisible 控制内容显隐） -->
        <div
          v-for="(card, i) in (myCards.length ? myCards : ['', ''])"
          :key="i + '-' + (myCards[i] || 'ph') + '-' + dealAnimKey"
          class="my-card-flip-wrap"
          :style="{ animationDelay: (i * 0.15) + 's', visibility: cardsVisible && myCards.length ? 'visible' : 'hidden' }"
          :class="{ 'cards-fade-in': cardsVisible && myCards.length }"
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
          <div class="my-avatar-wrap">
            <span class="my-avatar">{{ store.player?.avatar }}</span>
            <!-- 庄家/盲注标识 -->
            <span v-if="me?.isDealer" class="role-badge dealer-badge">D</span>
            <span v-if="me?.isSmallBlind" class="role-badge sb-badge">SB</span>
            <span v-if="me?.isBigBlind" class="role-badge bb-badge">BB</span>
          </div>
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
      <div
        class="action-panel"
        :class="{ 'action-panel-disabled': !isMyTurn }"
        v-if="isInGame && gameState.phase !== 'showdown' && gameState.phase !== 'waiting'"
      >
        <div class="action-panel-inner">

          <!-- 操作按钮 -->
          <div class="action-buttons">
            <!-- 弃牌 -->
            <van-button
              class="btn-red action-btn"
              :disabled="!isMyTurn"
              @click="doAction('fold')"
            >
              <div class="btn-inner">
                <span class="btn-text">弃牌</span>
              </div>
            </van-button>

            <!-- 跟注/看牌 -->
            <van-button
              class="btn-gray action-btn"
              :disabled="!isMyTurn"
              @click="doAction(canCheck ? 'check' : 'call')"
            >
              <div class="btn-inner">
                <span class="btn-text">{{ canCheck ? '看牌' : '跟注' }}</span>
                <span v-if="!canCheck" class="btn-amount gold">{{ callAmount }}</span>
              </div>
            </van-button>

            <!-- 加注 -->
            <van-button
              class="btn-green action-btn"
              :disabled="!isMyTurn"
              @click="showChipPicker = true"
            >
              <div class="btn-inner">
                <span class="btn-text">加注</span>
              </div>
            </van-button>
          </div>

        </div>
      </div>
    </transition>

    <!-- ===== 筹码选择弹窗 ===== -->
    <van-popup
      v-model:show="showChipPicker"
      round
      position="bottom"
      :style="{ background: '#1a1a2e', borderTop: '2px solid rgba(245,200,66,0.3)' }"
    >
      <div class="chip-picker">
        <div class="chip-picker-header">
          <span class="chip-picker-title">选择筹码</span>
          <span class="chip-picker-total gold">总计: {{ chipTotal }}</span>
        </div>
        <div class="chip-grid">
          <div
            v-for="chip in chipDenominations"
            :key="chip.value"
            class="chip-col"
          >
            <!-- 筹码图标 -->
            <div class="chip-token" :class="'chip-' + chip.value">
              <span class="chip-face">{{ chip.value }}</span>
            </div>
            <!-- 滚轮选择器 -->
            <van-picker
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
          <van-button class="chip-cancel-btn" @click="showChipPicker = false">取消</van-button>
          <van-button
            class="chip-confirm-btn"
            :disabled="chipTotal < minRaise || chipTotal > myChips"
            @click="confirmChipRaise"
          >
            确认加注 <span class="gold">{{ chipTotal }}</span>
          </van-button>
        </div>
        <div v-if="chipTotal < minRaise" class="chip-hint warn">
          最低加注 {{ minRaise }}
        </div>
        <div v-else-if="chipTotal > myChips" class="chip-hint warn">
          超出持有筹码 {{ myChips }}
        </div>
      </div>
    </van-popup>

    <!-- ===== 结算弹窗 ===== -->
    <van-popup
      v-model:show="showResult"
      round
      position="center"
      :close-on-click-overlay="false"
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

        <!-- 筹码变化 -->
        <div class="chips-change" v-if="roundResult.allHands">
          <div v-for="p in roundResult.allHands" :key="'chips-'+p.id" class="chips-row">
            <span>{{ p.avatar }} {{ p.nickname }}</span>
            <span :class="p.chipsChange >= 0 ? 'gold' : 'red-text'">
              {{ p.chipsChange >= 0 ? '+' : '' }}{{ p.chipsChange }} → {{ p.chipsAfter }}
            </span>
          </div>
        </div>

        <!-- 有人破产：显示游戏结束提示 -->
        <div v-if="roundResult.gameOver" class="game-over-hint">
          <div style="color: #e74c3c; font-weight: bold; margin-bottom: 8px;">⚠️ {{ roundResult.bustedNames?.join('、') }} 筹码耗尽</div>
          <van-button
            block round class="btn-green"
            style="margin-top: 8px;"
            :disabled="nextRoundSent"
            @click="nextRound"
          >
            {{ nextRoundSent ? `等待其他玩家确认… (${nextRoundReady}/${nextRoundTotal})` : '确认结算' }}
          </van-button>
          <div v-if="nextRoundSent" class="ready-hint">
            {{ nextRoundReady }}/{{ nextRoundTotal }} 人已确认
          </div>
        </div>

        <!-- 正常：下一局按钮 + 等待进度 -->
        <div v-else>
          <van-button
            block round class="btn-green"
            style="margin-top: 16px;"
            :disabled="nextRoundSent"
            @click="nextRound"
          >
            {{ nextRoundSent ? `等待其他玩家… (${nextRoundReady}/${nextRoundTotal})` : '下一局 ▶' }}
          </van-button>
          <div v-if="nextRoundSent" class="ready-hint">
            {{ nextRoundReady }}/{{ nextRoundTotal }} 人已准备
          </div>
        </div>
      </div>
    </van-popup>

    <!-- ===== 最终结算弹窗（房主结束游戏） ===== -->
    <van-popup
      v-model:show="showFinalResult"
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
        <van-button block round class="btn-green" style="margin-top: 20px;" @click="backToLobby">
          返回大厅
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

// ====== 房主权限 ======
// ownerId 通过 room:update 事件同步，避免依赖 store.room
const roomOwnerId = ref(store.room?.ownerId || '')
const isOwner = computed(() => store.player?.id === roomOwnerId.value)
const showEndConfirm = ref(false)
const showFinalResult = ref(false)
const finalPlayers = ref([])
const finalReason = ref('')

function endGame() {
  getSocket().emit('game:end')
}

function backToLobby() {
  showFinalResult.value = false
  router.replace('/lobby')
}

// ====== 牌型规则 ======
const showRules = ref(false)

const HAND_RULES = [
  {
    rank: '① 皇家同花顺', name: '', desc: '同花色 A K Q J 10',
    cards: [
      { v: 'A♠', red: false }, { v: 'K♠', red: false }, { v: 'Q♠', red: false },
      { v: 'J♠', red: false }, { v: '10♠', red: false }
    ]
  },
  {
    rank: '② 同花顺', name: '', desc: '同花色连续五张',
    cards: [
      { v: '9♥', red: true }, { v: '8♥', red: true }, { v: '7♥', red: true },
      { v: '6♥', red: true }, { v: '5♥', red: true }
    ]
  },
  {
    rank: '③ 四条', name: '', desc: '四张相同点数',
    cards: [
      { v: 'K♠', red: false }, { v: 'K♥', red: true }, { v: 'K♦', red: true },
      { v: 'K♣', red: false }, { v: '3♠', red: false }
    ]
  },
  {
    rank: '④ 葫芦', name: '', desc: '三条 + 一对',
    cards: [
      { v: 'Q♠', red: false }, { v: 'Q♥', red: true }, { v: 'Q♦', red: true },
      { v: 'J♠', red: false }, { v: 'J♣', red: false }
    ]
  },
  {
    rank: '⑤ 同花', name: '', desc: '同花色任意五张',
    cards: [
      { v: 'A♦', red: true }, { v: 'J♦', red: true }, { v: '8♦', red: true },
      { v: '5♦', red: true }, { v: '2♦', red: true }
    ]
  },
  {
    rank: '⑥ 顺子', name: '', desc: '连续五张不同花',
    cards: [
      { v: '9♠', red: false }, { v: '8♥', red: true }, { v: '7♦', red: true },
      { v: '6♣', red: false }, { v: '5♠', red: false }
    ]
  },
  {
    rank: '⑦ 三条', name: '', desc: '三张相同点数',
    cards: [
      { v: '7♠', red: false }, { v: '7♥', red: true }, { v: '7♦', red: true },
      { v: 'K♠', red: false }, { v: '2♣', red: false }
    ]
  },
  {
    rank: '⑧ 两对', name: '', desc: '两个不同的对子',
    cards: [
      { v: 'A♠', red: false }, { v: 'A♥', red: true }, { v: '6♦', red: true },
      { v: '6♣', red: false }, { v: 'J♠', red: false }
    ]
  },
  {
    rank: '⑨ 一对', name: '', desc: '两张相同点数',
    cards: [
      { v: '10♠', red: false }, { v: '10♣', red: false }, { v: 'A♦', red: true },
      { v: '7♥', red: true }, { v: '3♠', red: false }
    ]
  },
  {
    rank: '⑩ 高牌', name: '', desc: '无以上组合，最大单张',
    cards: [
      { v: 'A♠', red: false }, { v: 'J♦', red: true }, { v: '9♣', red: false },
      { v: '5♥', red: true }, { v: '2♠', red: false }
    ]
  }
]

// ====== 计算属性 ======
const me = computed(() => gameState.value.players.find(p => p.id === store.player?.id))
const opponents = computed(() => gameState.value.players.filter(p => p.id !== store.player?.id))
const myCards = computed(() => me.value?.cards || [])
const myChips = computed(() => me.value?.chips || 0)
const myCurrentBet = computed(() => me.value?.currentBet || 0)
const communityCards = computed(() => gameState.value.communityCards || [])
const lastAction = computed(() => gameState.value.lastAction)

// ===== 行动 Toast =====
const actionToast = ref(null)
let toastTimer = null
watch(lastAction, (val) => {
  if (!val) return
  if (toastTimer) clearTimeout(toastTimer)
  actionToast.value = val
  toastTimer = setTimeout(() => { actionToast.value = null }, 2000)
})

const isMyTurn = computed(() => gameState.value.currentPlayerId === store.player?.id)

// 当前玩家是否在本局游戏中（active 状态，未弃牌/未全下/未出局）
const isInGame = computed(() => {
  if (!me.value) return false
  return me.value.status === 'active'
})

const callAmount = computed(() => {
  const maxBet = Math.max(0, ...gameState.value.players.map(p => p.currentBet || 0))
  return Math.min(maxBet - (myCurrentBet.value || 0), myChips.value)
})

const canCheck = computed(() => callAmount.value <= 0)
const minRaise = computed(() => {
  const bb = gameState.value.bigBlind || 20
  const maxBet = Math.max(0, ...gameState.value.players.map(p => p.currentBet || 0))
  // 最小加注 = 当前最高下注 + 大盲注（标准德扑规则）
  // 但不能小于大盲注的2倍（首次加注的最低标准）
  return Math.max(maxBet + bb, bb * 2)
})

// 筹码选择器
const showChipPicker = ref(false)
const chipCounts = ref({ 10: 0, 20: 0, 50: 0, 100: 0 })

const chipDenominations = computed(() => {
  const maxCount = (val) => Math.floor(myChips.value / val)
  return [10, 20, 50, 100].map(value => ({
    value,
    columns: [Array.from({ length: maxCount(value) + 1 }, (_, i) => ({ text: String(i), value: i }))]
  }))
})

const chipTotal = computed(() => {
  return Object.entries(chipCounts.value).reduce((sum, [val, count]) => sum + Number(val) * count, 0)
})

function onChipCountChange(denomination, { selectedValues }) {
  // Vant 4 Picker change 事件返回 { selectedValues, selectedOptions, ... }
  chipCounts.value[denomination] = Number(selectedValues[0])
}

function confirmChipRaise() {
  if (chipTotal.value < minRaise.value || chipTotal.value > myChips.value) return
  showChipPicker.value = false
  doAction('raise', chipTotal.value)
  // 重置计数
  chipCounts.value = { 10: 0, 20: 0, 50: 0, 100: 0 }
}

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
const myCardsRef = ref(null)                  // 我的手牌容器 ref
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
  const cardW = 60, cardH = 84

  function getDeckOrigin() {
    return {
      startX: deckCx - cardW / 2,
      startY: deckCy - cardH / 2
    }
  }

  function getHandTarget(playerId, cardIndex) {
    if (playerId === myId) {
      // 用手牌容器坐标推算每张牌中心（容器 flex 居中，gap=14px，牌宽60px）
      const container = myCardsRef.value
      if (!container) return null
      const r = container.getBoundingClientRect()
      // 两张牌总宽 = 60+14+60 = 134px，从容器中心向两侧分布
      const centerX = r.left + r.width / 2
      const centerY = r.top + r.height / 2
      // cardIndex 0 → 左牌，1 → 右牌
      const offset = cardIndex === 0 ? -37 : 37   // (60+14)/2 = 37
      return { x: centerX + offset, y: centerY }
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
    // 优先查找已渲染的 community-card-wrap
    const wraps = document.querySelectorAll('.community-card-wrap')
    let el = wraps[cardIndex]
    if (!el) {
      // 发牌动画期间 communitySlots 为空，wrap 不存在，
      // 此时 DOM 中有5个 .community-card.placeholder 占位符，用它们来定位
      const placeholders = document.querySelectorAll('.community-card.placeholder')
      el = placeholders[cardIndex]
    }
    if (!el) {
      // 最终 fallback: 牌堆下方居中
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

  // 游戏开始（首局发牌）
  socket.on('game:start', ({ gameState: gs }) => {
    showResult.value = false
    showFinalResult.value = false
    nextRoundSent.value = false
    gameState.value = gs
    store.setGameState(gs)
    communitySlots.value = []
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
    nextRoundSent.value = false
    nextRoundReady.value = 0
    nextRoundTotal.value = result.allHands?.length || 0
    // 注意：不清空 gameState，保留牌桌展示

    // 兜底：60秒后无人操作自动触发确认
    clearTimeout(autoBackTimer)
    autoBackTimer = setTimeout(() => {
      if (showResult.value && !nextRoundSent.value) {
        nextRound()
      }
    }, 60000)
  })

  // 最终结算（房主结束游戏 / 有人破产）
  socket.on('game:final_result', ({ players, reason }) => {
    clearTimeout(autoBackTimer)
    showResult.value = false
    finalPlayers.value = players
    finalReason.value = reason || ''
    showFinalResult.value = true
    store.setGameState(null)
    // 重置游戏界面状态
    gameState.value = {
      phase: 'waiting',
      communityCards: [],
      pot: 0,
      bigBlind: 20,
      currentPlayerId: null,
      players: [],
      lastAction: null
    }
  })

  // 房间信息更新（同步 ownerId）
  socket.on('room:update', ({ room }) => {
    if (room) {
      store.setRoom(room)
      roomOwnerId.value = room.ownerId
    }
  })

  // 等待进度更新
  socket.on('game:next_round_ready', ({ ready, total }) => {
    nextRoundReady.value = ready
    nextRoundTotal.value = total
  })

  // 续局开始（所有人就绪后直接刷新牌桌，开始发牌）
  socket.on('game:next_round_start', ({ gameState: gs }) => {
    clearTimeout(autoBackTimer)
    showResult.value = false
    showFinalResult.value = false
    nextRoundSent.value = false
    nextRoundReady.value = 0
    nextRoundTotal.value = 0
    gameState.value = gs
    store.setGameState(gs)
    // 重置公共牌 slots
    communitySlots.value = []
    triggerDealAnimation()
  })

  // 破产踢出
  socket.on('player:bust', ({ message }) => {
    showToast({ message: message || '筹码耗尽，已退出游戏', icon: 'fail', duration: 3000 })
    router.replace('/lobby')
  })

  // 玩家断线通知
  socket.on('player:disconnected', ({ nickname }) => {
    store.addLog(`${nickname} 断线`)
  })

  socket.on('error', ({ message }) => {
    showToast({ message: message || '出错了', icon: 'fail' })
    // 如果仍是当前玩家回合（例如加注失败），恢复计时器让玩家可以重新操作
    if (isMyTurn.value && gameState.value.phase !== 'showdown') {
      startTimer()
    }
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
  clearTimeout(autoBackTimer)
  const socket = getSocket()
  socket.off('game:state')
  socket.off('game:start')
  socket.off('player:action:log')
  socket.off('game:result')
  socket.off('game:final_result')
  socket.off('game:next_round_ready')
  socket.off('game:next_round_start')
  socket.off('player:bust')
  socket.off('player:disconnected')
  socket.off('player:auth:ok')
  socket.off('room:update')
  socket.off('error')
})

// ====== 操作 ======
function doAction(type, amount) {
  showChipPicker.value = false
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
const nextRoundSent = ref(false)
const nextRoundReady = ref(0)
const nextRoundTotal = ref(0)
let autoBackTimer = null

function nextRound() {
  if (nextRoundSent.value) return
  nextRoundSent.value = true
  getSocket().emit('game:next_round')
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

/* ===== 底池（中央牌堆旁） ===== */
.center-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.pot-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(0,0,0,0.45);
  border: 1px solid rgba(245,200,66,0.3);
  border-radius: 10px;
  padding: 5px 12px;
  min-width: 70px;
}

.pot-display-label {
  font-size: 9px;
  color: rgba(255,255,255,0.45);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.pot-display-value {
  font-size: 17px;
  font-weight: 800;
  color: #f5c842;
  letter-spacing: 0.5px;
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

/* 庄家/盲注角标 */
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

/* 我的头像包裹（用于定位角标） */
.my-avatar-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
  gap: 3px;
  background: rgba(0,0,0,0.65);
  border: 1px solid rgba(245,200,66,0.4);
  border-radius: 10px;
  padding: 2px 8px;
  margin-top: 2px;
}

.bet-chip { font-size: 12px; }
.bet-amount { color: #f5c842; font-size: 12px; font-weight: 800; }

/* 金色筹码圆形图标 */
.chip-icon {
  display: inline-block;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #ffe066, #f5c842 50%, #c8861a);
  border: 1.5px solid rgba(255,255,255,0.45);
  box-shadow: 0 1px 3px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.3);
  vertical-align: middle;
  flex-shrink: 0;
}

.chip-icon-lg {
  width: 18px;
  height: 18px;
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

.toast-name {
  font-size: 13px;
  color: rgba(255,255,255,0.7);
  font-weight: 500;
}

.toast-verb {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 1px;
  color: #fff;
}

.toast-amount {
  font-size: 20px;
  font-weight: 800;
  color: #f5c842;
}

/* 颜色区分行动类型 */
.toast-call .toast-verb  { color: #4fc3f7; }
.toast-raise .toast-verb { color: #81c784; }
.toast-fold .toast-verb  { color: rgba(255,255,255,0.45); }
.toast-check .toast-verb { color: #ce93d8; }
.toast-allin .toast-verb { color: #ff7043; }

/* 进出动画 */
.action-toast-trans-enter-active {
  animation: toastIn 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.action-toast-trans-leave-active {
  animation: toastOut 0.22s ease-in both;
}

@keyframes toastIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

@keyframes toastOut {
  from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  to   { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
}

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
  width: 60px;
  height: 84px;
  z-index: 9999;
  pointer-events: none;
  transform: rotate(0deg);
  transition: none;
}

.flying-card-go {
  transform: translate(var(--dx), var(--dy)) rotate(0deg);
  transition:
    transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94) var(--delay),
    opacity 0.12s ease calc(0.35s + var(--delay));
}

/* 对手牌：飞到头像位置后缩小消失 */
.flying-card-go.flying-card-opp {
  transform: translate(var(--dx), var(--dy)) rotate(var(--rot, 8deg)) scale(0);
  transition:
    transform 0.40s cubic-bezier(0.25, 0.46, 0.45, 0.94) var(--delay),
    opacity 0.15s ease calc(0.36s + var(--delay));
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

/* 内框纹（和 .face-back 一致） */
.flying-card-back::before {
  content: '';
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

.flying-card-back::after {
  content: '🂠';
  font-size: 36px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
  z-index: 1;
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
}

.cards-fade-in {
  animation: cardsFadeIn 0.18s ease both;
}

@keyframes cardsFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
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
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0,0,0,0.55);
  border: 1px solid rgba(245,200,66,0.35);
  border-radius: 10px;
  padding: 3px 10px;
}

.my-bet-label {
  color: rgba(255,255,255,0.5);
  font-size: 11px;
}

.my-bet-val {
  font-size: 14px;
  font-weight: 800;
  color: #f5c842;
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

.chip-picker-title {
  font-size: 18px;
  font-weight: 700;
}

.chip-picker-total {
  font-size: 16px;
  font-weight: 800;
}

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

/* 筹码图标 */
.chip-token {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 16px;
  color: #fff;
  border: 3px solid rgba(255,255,255,0.3);
  box-shadow: 0 3px 8px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.2);
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.chip-10 {
  background: linear-gradient(135deg, #4a90d9, #357abd);
  border-color: rgba(100,160,240,0.5);
}

.chip-20 {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  border-color: rgba(240,100,100,0.5);
}

.chip-50 {
  background: linear-gradient(135deg, #27ae60, #1e8449);
  border-color: rgba(80,200,120,0.5);
}

.chip-100 {
  background: linear-gradient(135deg, #2c3e50, #1a252f);
  border-color: rgba(200,180,100,0.5);
}

.chip-face {
  pointer-events: none;
}

/* 滚轮选择器样式覆盖 */
.chip-col :deep(.van-picker) {
  background: transparent !important;
  width: 70px;
}

.chip-col :deep(.van-picker__mask) {
  background-image: linear-gradient(180deg, rgba(26,26,46,0.9), rgba(26,26,46,0.4)), linear-gradient(0deg, rgba(26,26,46,0.9), rgba(26,26,46,0.4)) !important;
}

.chip-col :deep(.van-picker-column__item) {
  color: rgba(255,255,255,0.5) !important;
  font-size: 16px !important;
}

.chip-col :deep(.van-picker__frame) {
  border-top: 1px solid rgba(245,200,66,0.3) !important;
  border-bottom: 1px solid rgba(245,200,66,0.3) !important;
}

.chip-col :deep(.van-picker__toolbar) {
  display: none !important;
}

.chip-subtotal {
  font-size: 13px;
  font-weight: 700;
  min-height: 20px;
}

/* 底部按钮 */
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

.chip-confirm-btn:disabled {
  opacity: 0.4 !important;
}

.chip-hint {
  text-align: center;
  font-size: 12px;
  margin-top: 8px;
  color: rgba(255,255,255,0.5);
}

.chip-hint.warn {
  color: #e74c3c;
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
  transition: opacity 0.3s, filter 0.3s;
}

/* 非本回合时操作面板灰化 */
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

.red-text {
  color: #e74c3c;
}

.ready-hint {
  text-align: center;
  font-size: 12px;
  color: rgba(255,255,255,0.45);
  margin-top: 8px;
}

/* ===== 最终结算 ===== */
.final-players {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

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

/* ===== 牌型规则面板 ===== */
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

.rule-name {
  font-size: 13px;
  font-weight: 600;
}

.rule-desc {
  font-size: 11px;
  color: rgba(255,255,255,0.5);
  margin-left: auto;
}

.rule-cards {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

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
