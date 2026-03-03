// 行动名称映射
export const ACTION_NAMES = {
  fold: '弃牌',
  call: '跟注',
  check: '看牌',
  raise: '加注',
  allin: 'All In'
}

// 牌型规则数据（从大到小排列）
export const HAND_RULES = [
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
