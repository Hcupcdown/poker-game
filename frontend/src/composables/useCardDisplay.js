import { RANK_DISPLAY, SUIT_SYMBOLS } from '../utils/cardUtils'

/**
 * 牌面显示工具函数
 */
export function useCardDisplay() {
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

  return {
    getCardRank,
    getCardSuit,
    isRedCard
  }
}
