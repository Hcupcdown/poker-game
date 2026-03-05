/**
 * 前端简单手牌强度评估器
 * 基于 myCards + communityCards 计算最佳5张牌的牌型
 * 返回中文牌型名称
 */

const RANK_ORDER = ['2','3','4','5','6','7','8','9','T','J','Q','K','A']

function parseCard(cardStr) {
  if (!cardStr || cardStr === 'back') return null
  return {
    rank: cardStr.slice(0, -1),
    suit: cardStr.slice(-1),
    rankIndex: RANK_ORDER.indexOf(cardStr.slice(0, -1))
  }
}

function getRankCounts(cards) {
  const counts = {}
  cards.forEach(c => {
    counts[c.rank] = (counts[c.rank] || 0) + 1
  })
  return counts
}

function getSuitCounts(cards) {
  const counts = {}
  cards.forEach(c => {
    counts[c.suit] = (counts[c.suit] || 0) + 1
  })
  return counts
}

function isFlush(cards) {
  // 从所有牌中找到有 5 张以上相同花色的
  const suitCounts = getSuitCounts(cards)
  return Object.values(suitCounts).some(c => c >= 5)
}

function getSortedRankIndices(cards) {
  return [...new Set(cards.map(c => c.rankIndex))].sort((a, b) => a - b)
}

function isStraight(cards) {
  const indices = getSortedRankIndices(cards)
  // 检查是否有5连续
  for (let i = 0; i <= indices.length - 5; i++) {
    let consec = 1
    for (let j = i + 1; j < indices.length; j++) {
      if (indices[j] === indices[j-1] + 1) {
        consec++
        if (consec >= 5) return true
      } else if (indices[j] !== indices[j-1]) {
        consec = 1
      }
    }
  }
  // A-2-3-4-5 低顺（wheel）
  const rankSet = new Set(indices)
  if (rankSet.has(12) && rankSet.has(0) && rankSet.has(1) && rankSet.has(2) && rankSet.has(3)) {
    return true
  }
  return false
}

function isStraightFlush(cards) {
  // 按花色分组，找到 5 张以上的花色，再检查是否有顺
  const suitGroups = {}
  cards.forEach(c => {
    if (!suitGroups[c.suit]) suitGroups[c.suit] = []
    suitGroups[c.suit].push(c)
  })
  return Object.values(suitGroups).some(g => g.length >= 5 && isStraight(g))
}

/**
 * 评估手牌强度
 * @param {string[]} holeCards - 手牌（2张）
 * @param {string[]} communityCards - 公共牌（3-5张）
 * @returns {string} 中文牌型名称，或 null（翻牌前）
 */
export function evaluateHandStrength(holeCards, communityCards) {
  if (!holeCards || holeCards.length < 2) return null
  if (!communityCards || communityCards.length < 3) return null

  const allCardStrs = [...holeCards, ...communityCards].filter(Boolean)
  const allCards = allCardStrs.map(parseCard).filter(Boolean)

  if (allCards.length < 3) return null

  // 检测各牌型（从高到低）
  if (isStraightFlush(allCards)) {
    // 检查是否是 A-高同花顺（皇家同花顺）—— 没有单独牌型名，统一叫同花顺
    return '同花顺'
  }

  const rankCounts = getRankCounts(allCards)
  const counts = Object.values(rankCounts).sort((a, b) => b - a)

  if (counts[0] >= 4) return '四条'

  if (counts[0] >= 3 && counts[1] >= 2) return '葫芦'

  if (isFlush(allCards)) return '同花'

  if (isStraight(allCards)) return '顺子'

  if (counts[0] >= 3) return '三条'

  if (counts[0] >= 2 && counts[1] >= 2) return '两对'

  if (counts[0] >= 2) return '一对'

  return '高牌'
}
