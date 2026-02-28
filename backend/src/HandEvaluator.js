/**
 * HandEvaluator.js - 牌型判断（封装 pokersolver）
 *
 * pokersolver 的牌面格式：rank + suit（大写花色）
 *   rank: 2-9, T, J, Q, K, A
 *   suit: h, d, c, s（小写）
 * 与我们的内部格式一致，可直接使用。
 *
 * 牌型中文名对照（前端 GamePage.vue roundResult.winner.handName）
 */

const { Hand } = require('pokersolver')

// 牌型英文名 → 中文名映射
const HAND_NAME_ZH = {
  'Royal Flush':    '皇家同花顺',
  'Straight Flush': '同花顺',
  'Four of a Kind': '四条',
  'Full House':     '葫芦',
  'Flush':          '同花',
  'Straight':       '顺子',
  'Three of a Kind':'三条',
  'Two Pair':       '两对',
  'Pair':           '一对',
  'High Card':      '高牌'
}

class HandEvaluator {
  /**
   * 评估一个玩家的最佳手牌
   * @param {string[]} holeCards  手牌，2张，如 ['Ah', 'Kd']
   * @param {string[]} communityCards  公共牌，3~5张
   * @returns {{ hand, rank, name, nameZh, cards }}
   */
  static evaluate(holeCards, communityCards) {
    const allCards = [...holeCards, ...communityCards]
    if (allCards.length < 5) {
      throw new Error(`评估需要至少5张牌，当前只有 ${allCards.length} 张`)
    }

    const hand = Hand.solve(allCards)
    const nameEn = hand.name || 'High Card'
    return {
      hand,
      rank: hand.rank,       // 数字排名，越大越好（1=高牌...9=皇家同花顺）
      name: nameEn,
      nameZh: HAND_NAME_ZH[nameEn] || nameEn,
      cards: hand.cards.map(c => c.toString())  // 最佳5张
    }
  }

  /**
   * 比较多个玩家，找出获胜者
   * @param {Array<{ id, holeCards, communityCards }>} playerHands
   * @returns {{ winners: string[], results: Array<{ id, rank, nameZh, cards }> }}
   */
  static findWinners(playerHands, communityCards) {
    const evaluated = playerHands.map(({ id, holeCards }) => {
      try {
        const result = HandEvaluator.evaluate(holeCards, communityCards)
        return { id, ...result }
      } catch (e) {
        // 评估失败（如公共牌不足），给最低分
        return { id, hand: null, rank: 0, name: 'High Card', nameZh: '高牌', cards: [] }
      }
    })

    // 使用 pokersolver 的 Hand.winners() 找出赢家
    const hands = evaluated.filter(e => e.hand).map(e => e.hand)
    const winningHands = Hand.winners(hands)

    // 找到赢家对应的玩家 id
    const winners = evaluated
      .filter(e => e.hand && winningHands.includes(e.hand))
      .map(e => e.id)

    return {
      winners,
      results: evaluated.map(e => ({
        id: e.id,
        rank: e.rank,
        name: e.name,
        nameZh: e.nameZh,
        cards: e.cards
      }))
    }
  }
}

module.exports = HandEvaluator
