import { ref, computed, watch, nextTick } from 'vue'

/**
 * 发牌动画逻辑
 * @param {Object} options
 * @param {import('vue').Ref} options.gameState - 游戏状态
 * @param {import('vue').Ref} options.opponents - 对手列表
 * @param {Object} options.store - game store
 * @param {import('vue').Ref} options.communityAreaRef - CommunityArea 组件 ref
 * @param {import('vue').Ref} options.myAreaRef - MyArea 组件 ref
 */
export function useDealAnimation({ gameState, opponents, store, communityAreaRef, myAreaRef }) {
  const flyingCards = ref([])
  const cardRevealed = ref([false, false])
  const dealAnimKey = ref(0)
  const cardsVisible = ref(true)
  const deckVisible = ref(true)
  const communitySlots = ref([])

  const deckCardCount = computed(() => {
    const players = gameState.value.players || []
    const dealt = players.reduce((s, p) => s + (p.cards?.length || 0), 0)
    return Math.max(0, 52 - dealt - 5)
  })

  let flyIdCounter = 0

  function toggleCardReveal(idx) {
    cardRevealed.value[idx] = !cardRevealed.value[idx]
  }

  // 监听 communityCards 变化（flop/turn/river），逐张翻面
  watch(
    () => gameState.value.communityCards,
    (newCards) => {
      if (!newCards || newCards.length === 0) return
      newCards.forEach((card, i) => {
        if (!communitySlots.value[i]) {
          communitySlots.value[i] = { card, revealed: false }
        } else {
          communitySlots.value[i].card = card
        }
        setTimeout(() => {
          if (communitySlots.value[i]) {
            communitySlots.value[i].revealed = true
          }
        }, i * 150 + 80)
      })
    },
    { deep: true }
  )

  /**
   * 触发发牌飞行动画
   */
  async function triggerDealAnimation() {
    dealAnimKey.value++
    cardRevealed.value = [false, false]
    cardsVisible.value = false
    deckVisible.value = true
    communitySlots.value = []

    await nextTick()

    // 从子组件 ref 中获取 DOM 元素
    const deckEl = communityAreaRef?.value?.deckEl
    if (!deckEl) {
      cardsVisible.value = true
      return
    }

    const deckRect = deckEl.getBoundingClientRect()
    const deckCx = deckRect.left + deckRect.width / 2
    const deckCy = deckRect.top + deckRect.height / 2

    // 飞行牌容器（.flying-cards-layer / .game-page）的偏移，用于将 viewport 坐标转为容器内坐标
    const containerEl = document.querySelector('.flying-cards-layer') || document.querySelector('.game-page')
    const containerRect = containerEl ? containerEl.getBoundingClientRect() : { left: 0, top: 0 }
    const ox = containerRect.left
    const oy = containerRect.top

    const gs = gameState.value
    const players = gs.players || []
    const myId = store.player?.id

    // 按庄家位后一位开始，顺时针排列玩家（模拟真实发牌顺序）
    const dealerIdx = players.findIndex(p => p.isDealer)
    const n = players.length
    const orderedPlayers = []
    for (let i = 1; i <= n; i++) {
      const p = players[(dealerIdx + i) % n]
      if (p.status !== 'folded') {
        orderedPlayers.push(p)
      }
    }

    // 构造手牌发牌序列：顺时针发牌
    // 第一轮：按顺时针给每位玩家发第1张
    // 第二轮：按顺时针给每位玩家发第2张
    const handDeals = []
    for (let round = 0; round < 2; round++) {
      for (const p of orderedPlayers) {
        handDeals.push({ type: 'hand', playerId: p.id, cardIndex: round })
      }
    }

    // 公共牌发牌序列
    const commDeals = [0, 1, 2, 3, 4].map(i => ({ type: 'comm', cardIndex: i }))

    const cardW = 60, cardH = 84

    function getDeckOrigin() {
      return {
        startX: deckCx - cardW / 2 - ox,
        startY: deckCy - cardH / 2 - oy
      }
    }

    function getHandTarget(playerId, cardIndex) {
      if (playerId === myId) {
        const container = myAreaRef?.value?.cardsContainer
        if (!container) return null
        const r = container.getBoundingClientRect()
        const centerX = r.left + r.width / 2 - ox
        const centerY = r.top + r.height / 2 - oy
        const offset = cardIndex === 0 ? -37 : 37
        return { x: centerX + offset, y: centerY }
      } else {
        const slots = document.querySelectorAll('.opponent-slot')
        const oppIdx = opponents.value.findIndex(o => o.id === playerId)
        if (oppIdx < 0 || !slots[oppIdx]) return null
        const avatarEl = slots[oppIdx].querySelector('.opp-avatar-wrap')
        const target = avatarEl || slots[oppIdx]
        const r = target.getBoundingClientRect()
        return { x: r.left + r.width / 2 - ox, y: r.top + r.height / 2 - oy }
      }
    }

    function getCommTarget(cardIndex) {
      const wraps = document.querySelectorAll('.community-card-wrap')
      let el = wraps[cardIndex]
      if (!el) {
        const placeholders = document.querySelectorAll('.community-card.placeholder')
        el = placeholders[cardIndex]
      }
      if (!el) {
        return { x: deckCx - ox, y: deckCy + 80 - oy }
      }
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2 - ox, y: r.top + r.height / 2 - oy }
    }

    // 生成飞行牌（手牌部分）
    const newCards = []
    const handCount = handDeals.length
    const perCardDelay = 0.13       // 每张牌之间的间隔（秒）
    const roundPause = 0.18         // 两轮发牌之间的额外停顿（秒）

    handDeals.forEach((deal, i) => {
      const target = getHandTarget(deal.playerId, deal.cardIndex)
      if (!target) return
      const { startX, startY } = getDeckOrigin()
      // 第二轮发牌时加上额外停顿
      const roundOffset = deal.cardIndex === 1 ? roundPause : 0
      newCards.push({
        id: ++flyIdCounter,
        startX, startY,
        dx: target.x - cardW / 2 - startX,
        dy: target.y - cardH / 2 - startY,
        delay: i * perCardDelay + roundOffset,
        isOpp: deal.playerId !== myId,
        flying: false
      })
    })

    const commStartDelay = handCount * perCardDelay + roundPause + 0.45

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

    // 使用 JS 直接操控 style，避免 CSS 变量 transition 的浏览器兼容问题
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        flyingCards.value.forEach(fc => { fc.flying = true })
      })
    })

    // 手牌动画完成后显示真实手牌槽
    const handDuration = (handCount * perCardDelay + roundPause + 0.42) * 1000
    setTimeout(() => {
      cardsVisible.value = true
    }, handDuration)

    // 公共牌飞行完成后建背面占位
    const commArriveDelay = (commStartDelay + 4 * 0.09 + 0.42) * 1000
    setTimeout(() => {
      flyingCards.value = []
      deckVisible.value = false
      const hidden = gameState.value._hiddenCommunityCards || []
      communitySlots.value = hidden.map(card => ({ card, revealed: false }))
      const existing = gameState.value.communityCards || []
      existing.forEach((_, i) => {
        setTimeout(() => {
          if (communitySlots.value[i]) communitySlots.value[i].revealed = true
        }, i * 150 + 80)
      })
    }, commArriveDelay + 100)
  }

  return {
    flyingCards,
    cardRevealed,
    dealAnimKey,
    cardsVisible,
    deckVisible,
    deckCardCount,
    communitySlots,
    toggleCardReveal,
    triggerDealAnimation
  }
}
