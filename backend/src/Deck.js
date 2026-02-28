/**
 * Deck.js - 标准德州扑克牌组
 *
 * 牌面格式：rank + suit
 * rank: 2,3,4,5,6,7,8,9,T,J,Q,K,A
 * suit: h(红心), d(方块), c(梅花), s(黑桃)
 * 例：'Ah'=A红心, 'Tc'=10梅花, '2s'=2黑桃
 *
 * 前端 GamePage.vue 中的 getCardRank/getCardSuit 解析方式：
 *   card.slice(0, -1) → rank
 *   card.slice(-1)    → suit
 */

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const SUITS = ['h', 'd', 'c', 's']

class Deck {
  constructor() {
    this.cards = []
    this.reset()
  }

  /**
   * 重置并生成完整 52 张牌
   */
  reset() {
    this.cards = []
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        this.cards.push(rank + suit)
      }
    }
  }

  /**
   * Fisher-Yates 洗牌算法
   */
  shuffle() {
    const arr = this.cards
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return this
  }

  /**
   * 发一张牌（从顶部取出）
   */
  deal() {
    if (this.cards.length === 0) throw new Error('牌组已空')
    return this.cards.pop()
  }

  /**
   * 发多张牌
   */
  dealMultiple(count) {
    const result = []
    for (let i = 0; i < count; i++) {
      result.push(this.deal())
    }
    return result
  }

  get remaining() {
    return this.cards.length
  }
}

module.exports = Deck
