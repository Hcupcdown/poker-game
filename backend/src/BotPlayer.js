/**
 * BotPlayer.js - 德州扑克机器人玩家
 *
 * 支持三种难度：
 *   easy   - 简单：随机行动，70% call/check，20% fold，10% raise
 *   medium - 中等：根据底池赔率和手牌强度决策
 *   hard   - 困难：更强策略，考虑位置、底池赔率、激进程度
 */

const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const RANK_VALUE = Object.fromEntries(CARD_RANKS.map((r, i) => [r, i + 2]))

class BotPlayer {
  constructor({ id, nickname, avatar, level = 'easy' }) {
    this.id = id
    this.nickname = nickname
    this.avatar = avatar
    this.level = level
    // hard 模式的激进系数（0.5~1.5，随机化，每个机器人不同）
    this.aggressionFactor = 0.8 + Math.random() * 0.7
  }

  /**
   * 根据游戏状态决定行动
   * @param {object} gameState - 游戏状态（来自 getGameStateForPlayer）
   * @param {string} myId - 机器人自己的 playerId
   * @param {number} bigBlind - 大盲注
   * @returns {{ type: string, amount: number }}
   */
  decideAction(gameState, myId, bigBlind) {
    const gs = gameState
    const me = gs.players.find(p => p.id === myId)
    if (!me) return { type: 'fold', amount: 0 }

    const maxBet = Math.max(...gs.players.map(p => p.currentBet || 0))
    const callAmount = Math.max(0, maxBet - (me.currentBet || 0))
    const canCheck = callAmount === 0
    const pot = gs.pot || bigBlind * 2

    switch (this.level) {
      case 'easy':
        return this._decideEasy(me, callAmount, canCheck, bigBlind)
      case 'medium':
        return this._decideMedium(me, gs, callAmount, canCheck, pot, bigBlind)
      case 'hard':
        return this._decideHard(me, gs, callAmount, canCheck, pot, bigBlind)
      default:
        return this._decideEasy(me, callAmount, canCheck, bigBlind)
    }
  }

  // ============================
  // Easy：纯随机策略
  // ============================
  _decideEasy(me, callAmount, canCheck, bigBlind) {
    const rand = Math.random()

    if (canCheck) {
      // 可以看牌时：80% check，20% raise
      if (rand < 0.80) {
        return { type: 'check', amount: 0 }
      } else {
        const raiseAmt = this._randomRaise(me.chips, bigBlind, 1, 3)
        return { type: 'raise', amount: raiseAmt }
      }
    } else {
      // 需要跟注时：70% call，20% fold，10% raise
      if (rand < 0.70) {
        return { type: 'call', amount: callAmount }
      } else if (rand < 0.90) {
        return { type: 'fold', amount: 0 }
      } else {
        if (me.chips <= callAmount) {
          return { type: 'allin', amount: me.chips }
        }
        const raiseAmt = callAmount + this._randomRaise(me.chips - callAmount, bigBlind, 1, 2)
        return { type: 'raise', amount: raiseAmt }
      }
    }
  }

  // ============================
  // Medium：考虑手牌强度和底池赔率
  // ============================
  _decideMedium(me, gs, callAmount, canCheck, pot, bigBlind) {
    const handStrength = this._evaluateHoleCards(me.cards)
    // handStrength: 0=弱, 1=中, 2=强
    const potOdds = callAmount > 0 ? callAmount / (pot + callAmount) : 0

    // 弱牌
    if (handStrength === 0) {
      if (canCheck) return { type: 'check', amount: 0 }
      // 底池赔率好（< 20%）且跟注不超过大盲的2倍时，偶尔跟注
      if (potOdds < 0.20 && callAmount <= bigBlind * 2 && Math.random() < 0.35) {
        return { type: 'call', amount: callAmount }
      }
      return { type: 'fold', amount: 0 }
    }

    // 中等牌
    if (handStrength === 1) {
      if (canCheck) {
        // 30% 概率小加注
        if (Math.random() < 0.30) {
          const raiseAmt = this._randomRaise(me.chips, bigBlind, 1, 2)
          return { type: 'raise', amount: raiseAmt }
        }
        return { type: 'check', amount: 0 }
      }
      // 跟注或弃牌取决于底池赔率
      if (potOdds < 0.35 || callAmount <= bigBlind * 3) {
        if (me.chips <= callAmount) return { type: 'allin', amount: me.chips }
        return { type: 'call', amount: callAmount }
      }
      if (Math.random() < 0.25) return { type: 'call', amount: callAmount }
      return { type: 'fold', amount: 0 }
    }

    // 强牌
    if (canCheck) {
      // 60% 概率加注，40% 慢打（check）
      if (Math.random() < 0.60) {
        const raiseAmt = this._randomRaise(me.chips, bigBlind, 2, 4)
        return { type: 'raise', amount: raiseAmt }
      }
      return { type: 'check', amount: 0 }
    }
    // 强牌面对下注：大多数跟注/加注
    if (Math.random() < 0.55) {
      const raiseAmt = callAmount + this._randomRaise(me.chips - callAmount, bigBlind, 1, 3)
      if (me.chips <= callAmount) return { type: 'allin', amount: me.chips }
      if (raiseAmt >= me.chips) return { type: 'allin', amount: me.chips }
      return { type: 'raise', amount: raiseAmt }
    }
    if (me.chips <= callAmount) return { type: 'allin', amount: me.chips }
    return { type: 'call', amount: callAmount }
  }

  // ============================
  // Hard：考虑位置、底池赔率、激进程度
  // ============================
  _decideHard(me, gs, callAmount, canCheck, pot, bigBlind) {
    const handStrength = this._evaluateHoleCards(me.cards)
    const potOdds = callAmount > 0 ? callAmount / (pot + callAmount) : 0

    // 位置分析：庄家或靠后位置更激进
    const activePlayers = gs.players.filter(p => p.status === 'active')
    const myIndex = activePlayers.findIndex(p => p.id === me.id)
    const totalActive = activePlayers.length
    // 位置越靠后（index 越大），越占优势
    const positionBonus = totalActive > 1 ? myIndex / (totalActive - 1) : 0.5
    // 庄家加成
    const dealerBonus = me.isDealer ? 0.15 : 0

    // 综合强度：手牌 + 位置 + 激进系数
    // handStrength(0~2) 归一化到 0~1，加上位置加成
    const effectiveStrength = (handStrength / 2) * 0.7 + positionBonus * 0.2 + dealerBonus
    const aggression = this.aggressionFactor  // 0.8~1.5

    // 阶段加成：越到后期越保守（除非手牌强）
    const phase = gs.phase || 'preflop'
    const phaseMultiplier = { preflop: 1.1, flop: 1.0, turn: 0.95, river: 0.9 }[phase] || 1.0

    const score = effectiveStrength * aggression * phaseMultiplier

    // 弱牌区（score < 0.3）
    if (score < 0.30) {
      if (canCheck) return { type: 'check', amount: 0 }
      // 偶发虚张声势
      if (Math.random() < 0.12 * aggression && me.chips > bigBlind * 3) {
        const bluffAmt = this._randomRaise(me.chips, bigBlind, 2, 5)
        if (bluffAmt < me.chips) return { type: 'raise', amount: bluffAmt }
      }
      if (potOdds < 0.15 && callAmount <= bigBlind) return { type: 'call', amount: callAmount }
      return { type: 'fold', amount: 0 }
    }

    // 中等区（score 0.3~0.6）
    if (score < 0.60) {
      if (canCheck) {
        if (Math.random() < 0.35 * aggression) {
          const raiseAmt = this._randomRaise(me.chips, bigBlind, 1, 3)
          return { type: 'raise', amount: raiseAmt }
        }
        return { type: 'check', amount: 0 }
      }
      // 底池赔率决策
      const callThreshold = 0.3 + score * 0.3
      if (potOdds < callThreshold || callAmount <= bigBlind * 2) {
        if (me.chips <= callAmount) return { type: 'allin', amount: me.chips }
        // 有时候在跟注基础上再加注
        if (Math.random() < 0.2 * aggression) {
          const raiseAmt = callAmount + this._randomRaise(me.chips - callAmount, bigBlind, 1, 2)
          if (raiseAmt < me.chips) return { type: 'raise', amount: raiseAmt }
        }
        return { type: 'call', amount: callAmount }
      }
      if (Math.random() < 0.2) return { type: 'call', amount: callAmount }
      return { type: 'fold', amount: 0 }
    }

    // 强牌区（score >= 0.6）
    if (canCheck) {
      const raiseProbability = Math.min(0.85, 0.5 + score * aggression * 0.5)
      if (Math.random() < raiseProbability) {
        // 强牌大加注
        const raiseMultiplier = 2 + Math.floor(score * aggression * 3)
        const raiseAmt = this._randomRaise(me.chips, bigBlind, raiseMultiplier, raiseMultiplier + 2)
        if (raiseAmt >= me.chips * 0.8) return { type: 'allin', amount: me.chips }
        return { type: 'raise', amount: raiseAmt }
      }
      // 慢打
      return { type: 'check', amount: 0 }
    }

    // 面对下注的强牌：通常加注
    const reraiseProbability = Math.min(0.75, 0.4 + score * aggression * 0.4)
    if (Math.random() < reraiseProbability) {
      const raiseAmt = callAmount + this._randomRaise(me.chips - callAmount, bigBlind, 2, 5)
      if (raiseAmt >= me.chips * 0.9 || me.chips <= callAmount * 1.5) {
        return { type: 'allin', amount: me.chips }
      }
      return { type: 'raise', amount: raiseAmt }
    }
    if (me.chips <= callAmount) return { type: 'allin', amount: me.chips }
    return { type: 'call', amount: callAmount }
  }

  // ============================
  // 手牌强度评估
  // ============================

  /**
   * 评估两张手牌的强度
   * @returns {number} 0=弱, 1=中, 2=强
   */
  _evaluateHoleCards(cards) {
    if (!cards || cards.length < 2) return 0
    // 机器人看到的自己手牌是真实牌
    if (cards[0] === 'back' || cards[1] === 'back') return 1 // 默认中等

    const rank1 = this._getCardRank(cards[0])
    const rank2 = this._getCardRank(cards[1])
    const suit1 = this._getCardSuit(cards[0])
    const suit2 = this._getCardSuit(cards[1])

    const val1 = RANK_VALUE[rank1] || 0
    const val2 = RANK_VALUE[rank2] || 0
    const highVal = Math.max(val1, val2)
    const lowVal = Math.min(val1, val2)

    // 对子
    if (rank1 === rank2) {
      // 高对：AA/KK/QQ
      if (val1 >= 12) return 2  // QQ+
      // 中对：77-JJ
      if (val1 >= 7) return 2   // 也算强牌
      // 低对：22-66
      return 1
    }

    // 同花
    const isSuited = suit1 === suit2

    // AK/AQ/AJ（同花或非同花）
    if (highVal === 14) {
      if (lowVal >= 11) return 2  // AJ+
      if (isSuited && lowVal >= 9) return 2   // A9s+
      if (lowVal >= 10) return 1  // AT
      if (isSuited) return 1      // 同花Ax
      return 0
    }

    // KQ/KJ
    if (highVal === 13) {
      if (isSuited) return lowVal >= 9 ? 2 : 1
      return lowVal >= 11 ? 1 : 0
    }

    // 同花连张（相差1-2点）
    if (isSuited) {
      if (highVal - lowVal <= 2 && highVal >= 9) return 1
      if (highVal >= 10) return 1
    }

    // 顺子潜力（连张且都是高牌）
    if (highVal >= 10 && highVal - lowVal <= 2) return 1

    return 0
  }

  _getCardRank(card) {
    if (!card || card === 'back') return ''
    // 牌格式如：'A♠', 'K♥', '10♦', '2♣'
    const match = card.match(/^(10|[2-9JQKA])/)
    return match ? match[1] : ''
  }

  _getCardSuit(card) {
    if (!card || card === 'back') return ''
    const match = card.match(/([♠♥♦♣])$/)
    return match ? match[1] : ''
  }

  /**
   * 生成随机加注额
   * @param {number} chips - 可用筹码
   * @param {number} bigBlind - 大盲
   * @param {number} minMult - 最小倍数
   * @param {number} maxMult - 最大倍数
   */
  _randomRaise(chips, bigBlind, minMult, maxMult) {
    const mult = minMult + Math.random() * (maxMult - minMult)
    const amount = Math.floor(bigBlind * mult)
    return Math.min(amount, chips)
  }
}

module.exports = BotPlayer
