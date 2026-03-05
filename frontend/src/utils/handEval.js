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
  const suitCounts = getSuitCounts(cards)
  return Object.values(suitCounts).some(c => c >= 5)
}

/**
 * 从一组牌中判断是否存在 5 张连续点数的顺子
 * 使用滑窗：对去重排序后的点数索引，从每个位置起找连续 5 张
 */
function isStraight(cards) {
  const indices = [...new Set(cards.map(c => c.rankIndex))].sort((a, b) => a - b)

  // 普通顺子：找连续 5 个不同点数
  let consec = 1
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) {
      consec++
      if (consec >= 5) return true
    } else if (indices[i] !== indices[i - 1]) {
      consec = 1
    }
  }

  // A-2-3-4-5 低顺（wheel）：A 当 1 用
  const rankSet = new Set(indices)
  if (rankSet.has(12) && rankSet.has(0) && rankSet.has(1) && rankSet.has(2) && rankSet.has(3)) {
    return true
  }

  return false
}

/**
 * 判断是否有同花顺，同时返回是否为皇家同花顺
 * @returns {'royal' | 'straight-flush' | false}
 */
function checkStraightFlush(cards) {
  const suitGroups = {}
  cards.forEach(c => {
    if (!suitGroups[c.suit]) suitGroups[c.suit] = []
    suitGroups[c.suit].push(c)
  })

  for (const group of Object.values(suitGroups)) {
    if (group.length < 5) continue
    if (!isStraight(group)) continue

    // 检查是否是 T-J-Q-K-A 同花顺（皇家同花顺）
    const rankSet = new Set(group.map(c => c.rankIndex))
    if (rankSet.has(8) && rankSet.has(9) && rankSet.has(10) && rankSet.has(11) && rankSet.has(12)) {
      return 'royal'
    }
    return 'straight-flush'
  }

  return false
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

  const allCards = [...holeCards, ...communityCards]
    .filter(Boolean)
    .map(parseCard)
    .filter(Boolean)

  if (allCards.length < 3) return null

  const sfResult = checkStraightFlush(allCards)
  if (sfResult === 'royal') return '🏆皇家同花顺'
  if (sfResult === 'straight-flush') return '同花顺'

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
