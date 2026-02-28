// 牌的工具函数

// 花色符号和颜色
export const SUIT_SYMBOLS = {
  h: '♥', d: '♦', c: '♣', s: '♠'
}

export const SUIT_COLORS = {
  h: '#e74c3c', d: '#e74c3c', c: '#2c3e50', s: '#2c3e50'
}

// 点数显示
export const RANK_DISPLAY = {
  '2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8',
  '9':'9','T':'10','J':'J','Q':'Q','K':'K','A':'A'
}

// 解析牌字符串，如 "Ah" => { rank: 'A', suit: 'h' }
export function parseCard(cardStr) {
  if (!cardStr || cardStr === 'back') return null
  const rank = cardStr.slice(0, -1)
  const suit = cardStr.slice(-1)
  return { rank, suit, str: cardStr }
}

// 阶段名称中文
export const PHASE_NAMES = {
  waiting: '等待开始',
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌',
  finished: '已结束'
}

// 玩家状态
export const PLAYER_STATUS_NAMES = {
  active: '行动中',
  folded: '已弃牌',
  allin: 'All In',
  waiting: '等待',
  winner: '赢家'
}

// 玩家状态颜色
export const PLAYER_STATUS_COLORS = {
  active: '#2ecc71',
  folded: '#7f8c8d',
  allin: '#f39c12',
  waiting: '#3498db',
  winner: '#f5c842'
}

// 格式化筹码数字
export function formatChips(n) {
  if (n >= 10000) return (n / 1000).toFixed(0) + 'k'
  return n?.toString() ?? '0'
}
