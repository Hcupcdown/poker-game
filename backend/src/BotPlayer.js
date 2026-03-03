/**
 * BotPlayer.js - 德州扑克机器人玩家（优化版）
 *
 * 优化点：
 *   1. 结合公共牌评估牌力（翻牌后不再只看手牌，支持成牌/听牌检测）
 *   2. 五级手牌强度评估（0=垃圾, 1=弱, 2=中, 3=强, 4=坚果级）
 *   3. 基于底池比例的加注策略（而非固定大盲倍数）
 *   4. 对手行为记忆（记录对手的激进/保守倾向）
 *   5. 短筹码主动 All-in 策略
 *   6. 多人底池自动收紧范围
 *   7. 更智能的虚张声势（bluff）逻辑
 *
 * 支持三种难度：
 *   easy   - 简单：随机行动，偶尔考虑手牌
 *   medium - 中等：根据底池赔率和手牌强度+公共牌决策
 *   hard   - 困难：完整策略，位置/底池赔率/对手记忆/阶段/听牌
 */

const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const RANK_VALUE = Object.fromEntries(CARD_RANKS.map((r, i) => [r, i + 2]))

class BotPlayer {
  constructor({ id, nickname, avatar, level = 'easy' }) {
    this.id = id
    this.nickname = nickname
    this.avatar = avatar
    this.level = level
    // hard 模式的激进系数（0.7~1.6，随机化，每个机器人不同）
    this.aggressionFactor = 0.7 + Math.random() * 0.9
    // 对手行为记忆：{ playerId: { raises, calls, folds, totalActions } }
    this.opponentMemory = {}
    // 本局历史行动（用于避免被预测模式）
    this.roundActionCount = 0
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

    // 更新对手记忆（根据 lastAction）
    if (gs.lastAction && gs.lastAction.playerId !== myId) {
      this._updateOpponentMemory(gs.lastAction)
    }

    this.roundActionCount++

    let action
    switch (this.level) {
      case 'easy':
        action = this._decideEasy(me, gs, callAmount, canCheck, pot, bigBlind)
        break
      case 'medium':
        action = this._decideMedium(me, gs, callAmount, canCheck, pot, bigBlind)
        break
      case 'hard':
        action = this._decideHard(me, gs, callAmount, canCheck, pot, bigBlind)
        break
      default:
        action = this._decideEasy(me, gs, callAmount, canCheck, pot, bigBlind)
    }

    // 安全校验：确保行动合法
    return this._validateAction(action, me, callAmount, canCheck, bigBlind)
  }

  /**
   * 重置每局状态
   */
  resetRound() {
    this.roundActionCount = 0
  }

  // ============================
  // Easy：简单策略（有基础手牌意识）
  // ============================
  _decideEasy(me, gs, callAmount, canCheck, pot, bigBlind) {
    const rand = Math.random()
    // Easy 模式也简单看一下手牌强度，避免完全随机
    const handStr = this._evaluateHandStrength(me.cards, gs.communityCards || [], gs.phase)

    if (canCheck) {
      if (handStr >= 3 && rand < 0.40) {
        // 强牌时偶尔加注
        const raiseAmt = this._potBasedRaise(pot, me.chips, bigBlind, 0.3, 0.6)
        return { type: 'raise', amount: raiseAmt }
      }
      if (rand < 0.82) {
        return { type: 'check', amount: 0 }
      } else {
        const raiseAmt = this._potBasedRaise(pot, me.chips, bigBlind, 0.25, 0.5)
        return { type: 'raise', amount: raiseAmt }
      }
    } else {
      // 需要跟注
      if (handStr >= 2 && rand < 0.80) {
        return { type: 'call', amount: callAmount }
      }
      if (rand < 0.65) {
        return { type: 'call', amount: callAmount }
      } else if (rand < 0.88) {
        return { type: 'fold', amount: 0 }
      } else {
        if (me.chips <= callAmount) {
          return { type: 'allin', amount: me.chips }
        }
        const raiseAmt = callAmount + this._potBasedRaise(pot, me.chips - callAmount, bigBlind, 0.3, 0.5)
        return { type: 'raise', amount: raiseAmt }
      }
    }
  }

  // ============================
  // Medium：考虑手牌+公共牌强度和底池赔率
  // ============================
  _decideMedium(me, gs, callAmount, canCheck, pot, bigBlind) {
    const handStrength = this._evaluateHandStrength(me.cards, gs.communityCards || [], gs.phase)
    // handStrength: 0=垃圾, 1=弱, 2=中, 3=强, 4=坚果
    const potOdds = callAmount > 0 ? callAmount / (pot + callAmount) : 0
    const activePlayers = gs.players.filter(p => p.status === 'active' || p.status === 'allin')
    const numOpponents = activePlayers.length - 1

    // 多人底池时收紧范围
    const tightenFactor = numOpponents > 2 ? 0.8 : 1.0

    // 垃圾牌 (0)
    if (handStrength === 0) {
      if (canCheck) return { type: 'check', amount: 0 }
      // 极好赔率时偶尔跟注
      if (potOdds < 0.12 && callAmount <= bigBlind && Math.random() < 0.25) {
        return { type: 'call', amount: callAmount }
      }
      return { type: 'fold', amount: 0 }
    }

    // 弱牌 (1)
    if (handStrength === 1) {
      if (canCheck) {
        if (Math.random() < 0.15 * tightenFactor) {
          const raiseAmt = this._potBasedRaise(pot, me.chips, bigBlind, 0.3, 0.5)
          return { type: 'raise', amount: raiseAmt }
        }
        return { type: 'check', amount: 0 }
      }
      if (potOdds < 0.20 && callAmount <= bigBlind * 2 && Math.random() < 0.40 * tightenFactor) {
        return { type: 'call', amount: callAmount }
      }
      return { type: 'fold', amount: 0 }
    }

    // 中等牌 (2)
    if (handStrength === 2) {
      if (canCheck) {
        if (Math.random() < 0.35 * tightenFactor) {
          const raiseAmt = this._potBasedRaise(pot, me.chips, bigBlind, 0.4, 0.7)
          return { type: 'raise', amount: raiseAmt }
        }
        return { type: 'check', amount: 0 }
      }
      if (potOdds < 0.35 || callAmount <= bigBlind * 3) {
        if (me.chips <= callAmount) return { type: 'allin', amount: me.chips }
        // 偶尔反加
        if (Math.random() < 0.18 * tightenFactor) {
          const raiseAmt = callAmount + this._potBasedRaise(pot, me.chips - callAmount, bigBlind, 0.5, 0.8)
          return { type: 'raise', amount: raiseAmt }
        }
        return { type: 'call', amount: callAmount }
      }
      if (Math.random() < 0.25) return { type: 'call', amount: callAmount }
      return { type: 'fold', amount: 0 }
    }

    // 强牌 (3)
    if (handStrength === 3) {
      if (canCheck) {
        // 慢打概率 35%（设陷阱）
        if (Math.random() < 0.65) {
          const raiseAmt = this._potBasedRaise(pot, me.chips, bigBlind, 0.5, 1.0)
          return { type: 'raise', amount: raiseAmt }
        }
        return { type: 'check', amount: 0 }
      }
      if (me.chips <= callAmount) return { type: 'allin', amount: me.chips }
      if (Math.random() < 0.55) {
        const raiseAmt = callAmount + this._potBasedRaise(pot, me.chips - callAmount, bigBlind, 0.6, 1.2)
        if (raiseAmt >= me.chips * 0.85) return { type: 'allin', amount: me.chips }
        return { type: 'raise', amount: raiseAmt }
      }
      return { type: 'call', amount: callAmount }
    }

    // 坚果级 (4)
    if (canCheck) {
      // 偶尔慢打引诱对手下注
      if (Math.random() < 0.25) return { type: 'check', amount: 0 }
      const raiseAmt = this._potBasedRaise(pot, me.chips, bigBlind, 0.7, 1.5)
      if (raiseAmt >= me.chips * 0.8) return { type: 'allin', amount: me.chips }
      return { type: 'raise', amount: raiseAmt }
    }
    if (me.chips <= callAmount * 1.5) return { type: 'allin', amount: me.chips }
    if (Math.random() < 0.70) {
      const raiseAmt = callAmount + this._potBasedRaise(pot, me.chips - callAmount, bigBlind, 0.8, 1.5)
      if (raiseAmt >= me.chips * 0.85) return { type: 'allin', amount: me.chips }
      return { type: 'raise', amount: raiseAmt }
    }
    return { type: 'call', amount: callAmount }
  }

  // ============================
  // Hard：完整策略（位置/对手记忆/听牌/短筹码）
  // ============================
  _decideHard(me, gs, callAmount, canCheck, pot, bigBlind) {
    const handStrength = this._evaluateHandStrength(me.cards, gs.communityCards || [], gs.phase)
    const potOdds = callAmount > 0 ? callAmount / (pot + callAmount) : 0
    const aggression = this.aggressionFactor

    // ---- 位置分析 ----
    const activePlayers = gs.players.filter(p => p.status === 'active' || p.status === 'allin')
    const myIndex = activePlayers.findIndex(p => p.id === me.id)
    const totalActive = activePlayers.length
    const positionBonus = totalActive > 1 ? myIndex / (totalActive - 1) : 0.5
    const dealerBonus = me.isDealer ? 0.15 : 0
    const numOpponents = totalActive - 1

    // ---- 多人底池收紧 ----
    const tightenFactor = numOpponents > 2 ? 0.75 : (numOpponents > 1 ? 0.9 : 1.0)

    // ---- 对手分析 ----
    const opponentAggression = this._getAverageOpponentAggression(gs.players, me.id)

    // ---- 阶段因子 ----
    const phase = gs.phase || 'preflop'
    const phaseMultiplier = {
      preflop: 1.05,
      flop: 1.0,
      turn: 0.95,
      river: 0.90
    }[phase] || 1.0

    // ---- 听牌分析（中等和强的中间状态可以加持） ----
    const drawInfo = this._analyzeDraws(me.cards, gs.communityCards || [])

    // ---- 短筹码策略（M值：筹码 / (小盲+大盲)） ----
    const mValue = me.chips / (gs.smallBlind + gs.bigBlind)
    if (mValue <= 8 && handStrength >= 2) {
      // 短筹码推牌策略：M值 ≤ 8 且中等以上牌力，直接 all-in
      if (canCheck && handStrength >= 3) {
        return { type: 'allin', amount: me.chips }
      }
      if (handStrength >= 3 || (handStrength === 2 && positionBonus > 0.5)) {
        return { type: 'allin', amount: me.chips }
      }
    }
    if (mValue <= 5 && handStrength >= 1 && positionBonus > 0.6) {
      // 极短筹码：弱牌以上在后位也推
      return { type: 'allin', amount: me.chips }
    }

    // ---- 综合评分 ----
    const baseScore = (handStrength / 4) * 0.55 +   // 手牌权重（归一化到0~1）
      positionBonus * 0.18 +                          // 位置权重
      dealerBonus +                                    // 庄家加成
      (drawInfo.hasFlushDraw ? 0.10 : 0) +            // 同花听牌加成
      (drawInfo.hasStraightDraw ? 0.08 : 0)           // 顺子听牌加成

    const score = baseScore * aggression * phaseMultiplier * tightenFactor

    // ---- 对手激进时收紧，对手保守时放松 ----
    const adjustedScore = opponentAggression > 0.5
      ? score * 0.9   // 对手激进，我们更谨慎
      : score * 1.05  // 对手保守，我们更激进

    // === 决策分支 ===

    // 垃圾区（score < 0.20）
    if (adjustedScore < 0.20) {
      if (canCheck) return { type: 'check', amount: 0 }
      // 偶尔虚张声势（在后位且对手保守时更频繁）
      const bluffChance = 0.10 * aggression * (positionBonus > 0.6 ? 1.5 : 1.0)
        * (opponentAggression < 0.3 ? 1.5 : 0.7)
      if (Math.random() < bluffChance && me.chips > bigBlind * 4 && phase !== 'river') {
        const bluffAmt = this._potBasedRaise(pot, me.chips, bigBlind, 0.5, 0.9)
        if (bluffAmt < me.chips) return { type: 'raise', amount: bluffAmt }
      }
      if (potOdds < 0.10 && callAmount <= bigBlind) return { type: 'call', amount: callAmount }
      return { type: 'fold', amount: 0 }
    }

    // 弱牌区（score 0.20~0.35）
    if (adjustedScore < 0.35) {
      if (canCheck) {
        // 后位偶尔小探注
        if (positionBonus > 0.6 && Math.random() < 0.20 * aggression) {
          const raiseAmt = this._potBasedRaise(pot, me.chips, bigBlind, 0.3, 0.5)
          return { type: 'raise', amount: raiseAmt }
        }
        return { type: 'check', amount: 0 }
      }
      // 有听牌且赔率好时跟注
      if ((drawInfo.hasFlushDraw || drawInfo.hasStraightDraw) && potOdds < 0.25) {
        return { type: 'call', amount: callAmount }
      }
      if (potOdds < 0.15 && callAmount <= bigBlind * 1.5) {
        return { type: 'call', amount: callAmount }
      }
      return { type: 'fold', amount: 0 }
    }

    // 中等区（score 0.35~0.55）
    if (adjustedScore < 0.55) {
      if (canCheck) {
        if (Math.random() < 0.40 * aggression) {
          const raiseAmt = this._potBasedRaise(pot, me.chips, bigBlind, 0.4, 0.8)
          return { type: 'raise', amount: raiseAmt }
        }
        return { type: 'check', amount: 0 }
      }
      const callThreshold = 0.25 + adjustedScore * 0.3
      if (potOdds < callThreshold || callAmount <= bigBlind * 3) {
        if (me.chips <= callAmount) return { type: 'allin', amount: me.chips }
        // 偶尔反加
        if (Math.random() < 0.22 * aggression) {
          const raiseAmt = callAmount + this._potBasedRaise(pot, me.chips - callAmount, bigBlind, 0.5, 0.9)
          if (raiseAmt < me.chips) return { type: 'raise', amount: raiseAmt }
        }
        return { type: 'call', amount: callAmount }
      }
      if (Math.random() < 0.20) return { type: 'call', amount: callAmount }
      return { type: 'fold', amount: 0 }
    }

    // 强牌区（score 0.55~0.75）
    if (adjustedScore < 0.75) {
      if (canCheck) {
        // 慢打概率根据对手激进程度调整
        const slowplayChance = opponentAggression > 0.4 ? 0.40 : 0.20
        if (Math.random() > slowplayChance) {
          const raiseAmt = this._potBasedRaise(pot, me.chips, bigBlind, 0.6, 1.2)
          if (raiseAmt >= me.chips * 0.80) return { type: 'allin', amount: me.chips }
          return { type: 'raise', amount: raiseAmt }
        }
        return { type: 'check', amount: 0 }
      }
      if (me.chips <= callAmount) return { type: 'allin', amount: me.chips }
      const reraiseProbability = Math.min(0.75, 0.45 + adjustedScore * aggression * 0.3)
      if (Math.random() < reraiseProbability) {
        const raiseAmt = callAmount + this._potBasedRaise(pot, me.chips - callAmount, bigBlind, 0.7, 1.3)
        if (raiseAmt >= me.chips * 0.85) return { type: 'allin', amount: me.chips }
        return { type: 'raise', amount: raiseAmt }
      }
      return { type: 'call', amount: callAmount }
    }

    // 坚果区（score >= 0.75）
    if (canCheck) {
      // 河牌上坚果牌慢打引诱的概率更高
      const slowplayNut = phase === 'river' ? 0.30 : 0.15
      if (Math.random() < slowplayNut) return { type: 'check', amount: 0 }
      const raiseAmt = this._potBasedRaise(pot, me.chips, bigBlind, 0.8, 1.5)
      if (raiseAmt >= me.chips * 0.75) return { type: 'allin', amount: me.chips }
      return { type: 'raise', amount: raiseAmt }
    }
    // 面对下注的坚果牌
    if (me.chips <= callAmount * 1.8) return { type: 'allin', amount: me.chips }
    const nutReraise = Math.min(0.85, 0.55 + aggression * 0.25)
    if (Math.random() < nutReraise) {
      const raiseAmt = callAmount + this._potBasedRaise(pot, me.chips - callAmount, bigBlind, 1.0, 2.0)
      if (raiseAmt >= me.chips * 0.85) return { type: 'allin', amount: me.chips }
      return { type: 'raise', amount: raiseAmt }
    }
    // 少数时候平跟（隐藏实力）
    return { type: 'call', amount: callAmount }
  }

  // ============================
  // 手牌强度评估（结合公共牌）
  // ============================

  /**
   * 综合评估手牌+公共牌强度
   * @returns {number} 0=垃圾, 1=弱, 2=中, 3=强, 4=坚果级
   */
  _evaluateHandStrength(cards, communityCards, phase) {
    if (!cards || cards.length < 2) return 0
    if (cards[0] === 'back' || cards[1] === 'back') return 1

    // 翻牌前：只评估手牌
    if (!communityCards || communityCards.length === 0 || phase === 'preflop') {
      return this._evaluateHoleCards(cards)
    }

    // 翻牌后：结合公共牌评估成牌和听牌
    return this._evaluateWithCommunity(cards, communityCards)
  }

  /**
   * 翻牌前手牌评估（五级）
   * @returns {number} 0=垃圾, 1=弱, 2=中, 3=强, 4=坚果
   */
  _evaluateHoleCards(cards) {
    if (!cards || cards.length < 2) return 0
    if (cards[0] === 'back' || cards[1] === 'back') return 1

    const rank1 = this._getCardRank(cards[0])
    const rank2 = this._getCardRank(cards[1])
    const suit1 = this._getCardSuit(cards[0])
    const suit2 = this._getCardSuit(cards[1])

    const val1 = RANK_VALUE[rank1] || 0
    const val2 = RANK_VALUE[rank2] || 0
    const highVal = Math.max(val1, val2)
    const lowVal = Math.min(val1, val2)
    const isSuited = suit1 === suit2
    const gap = highVal - lowVal

    // 对子
    if (rank1 === rank2) {
      if (val1 >= 13) return 4   // AA/KK → 坚果
      if (val1 >= 12) return 3   // QQ → 强
      if (val1 >= 10) return 3   // TT/JJ → 强
      if (val1 >= 7) return 2    // 77-99 → 中
      return 1                    // 22-66 → 弱
    }

    // AK（特殊处理）
    if (highVal === 14 && lowVal === 13) {
      return isSuited ? 4 : 3    // AKs=坚果, AKo=强
    }

    // A 系列
    if (highVal === 14) {
      if (lowVal >= 12) return isSuited ? 3 : 3   // AQ → 强
      if (lowVal >= 11) return isSuited ? 3 : 2   // AJs=强, AJo=中
      if (lowVal >= 10) return isSuited ? 2 : 2   // AT → 中
      if (isSuited) return 1                       // 同花Ax → 弱
      return 0                                      // 散牌Ax → 垃圾
    }

    // K 系列
    if (highVal === 13) {
      if (lowVal >= 12) return isSuited ? 3 : 2   // KQs=强, KQo=中
      if (lowVal >= 11) return isSuited ? 2 : 1   // KJs=中, KJo=弱
      if (lowVal >= 10) return isSuited ? 2 : 1   // KTs=中
      if (isSuited) return 1                       // 同花Kx → 弱
      return 0
    }

    // Q 系列
    if (highVal === 12) {
      if (lowVal >= 11) return isSuited ? 2 : 1   // QJs=中
      if (lowVal >= 10) return isSuited ? 2 : 1   // QTs=中
      if (isSuited) return 1
      return 0
    }

    // 同花连张
    if (isSuited && gap <= 2) {
      if (highVal >= 10) return 2  // T9s, J9s 等 → 中
      if (highVal >= 7) return 1   // 87s, 76s 等 → 弱
      return 1
    }

    // 非同花连张高牌
    if (gap <= 1 && highVal >= 10) return 1  // JTo, T9o → 弱

    // 同花高牌
    if (isSuited && highVal >= 10) return 1

    return 0
  }

  /**
   * 翻牌后结合公共牌评估（五级）
   * 检测：成对/三条/顺子/同花/葫芦/四条/听牌等
   */
  _evaluateWithCommunity(holeCards, communityCards) {
    const allCards = [...holeCards, ...communityCards]
    const allRanks = allCards.map(c => RANK_VALUE[this._getCardRank(c)] || 0)
    const allSuits = allCards.map(c => this._getCardSuit(c))

    const holeRanks = holeCards.map(c => RANK_VALUE[this._getCardRank(c)] || 0)
    const holeSuits = holeCards.map(c => this._getCardSuit(c))
    const commRanks = communityCards.map(c => RANK_VALUE[this._getCardRank(c)] || 0)

    // 统计点数出现次数
    const rankCounts = {}
    allRanks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1 })

    // 统计花色出现次数
    const suitCounts = {}
    allSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1 })

    // ---- 检测成牌 ----

    // 四条
    const hasFourOfKind = Object.values(rankCounts).some(c => c >= 4)
    if (hasFourOfKind) {
      // 确认手牌有参与
      const fourRank = Object.keys(rankCounts).find(r => rankCounts[r] >= 4)
      if (holeRanks.includes(parseInt(fourRank))) return 4
      return 3 // 公共牌四条，手牌没参与，仍然不错
    }

    // 葫芦（三条 + 对子）
    const threeKinds = Object.keys(rankCounts).filter(r => rankCounts[r] >= 3)
    const pairs = Object.keys(rankCounts).filter(r => rankCounts[r] >= 2)
    if (threeKinds.length > 0 && pairs.length >= 2) {
      // 有葫芦
      const triRank = parseInt(threeKinds[0])
      if (holeRanks.includes(triRank)) return 4  // 手牌参与三条 → 坚果
      return 3
    }

    // 同花
    const flushSuit = Object.keys(suitCounts).find(s => suitCounts[s] >= 5)
    if (flushSuit) {
      const holeFlushCards = holeSuits.filter(s => s === flushSuit).length
      if (holeFlushCards >= 1) {
        // 看手牌中同花牌的最大点数
        const myFlushHighest = Math.max(...holeCards
          .filter(c => this._getCardSuit(c) === flushSuit)
          .map(c => RANK_VALUE[this._getCardRank(c)] || 0))
        if (myFlushHighest >= 14) return 4  // A高同花 → 坚果
        if (myFlushHighest >= 12) return 4  // Q+ 高同花 → 坚果
        return 3                             // 低同花 → 强
      }
      return 2 // 公共牌成同花，手牌没参与 → 中（可能被对手同花压制）
    }

    // 顺子
    const uniqueRanks = [...new Set(allRanks)].sort((a, b) => a - b)
    if (this._hasStraight(uniqueRanks)) {
      // 检查手牌是否参与顺子
      if (this._holeParticipatesInStraight(holeRanks, commRanks)) {
        const maxHole = Math.max(...holeRanks)
        if (maxHole >= 13) return 4  // 高端顺子 → 坚果
        return 3                      // 普通顺子 → 强
      }
      return 2 // 公共牌成顺，手牌可能没用上
    }

    // 三条
    if (threeKinds.length > 0) {
      const triRank = parseInt(threeKinds[0])
      const holeHasTri = holeRanks.filter(r => r === triRank).length
      if (holeHasTri === 2) return 4  // 暗三条（口袋对子中三条）→ 坚果级
      if (holeHasTri === 1) return 3  // 明三条 → 强
      return 2                         // 公共牌三条 → 中
    }

    // 两对
    if (pairs.length >= 2) {
      const pairRanks = pairs.map(r => parseInt(r)).sort((a, b) => b - a)
      const topTwoPairs = pairRanks.slice(0, 2)
      const holeInPair = topTwoPairs.filter(pr => holeRanks.includes(pr)).length
      if (holeInPair >= 2) return 3   // 双手牌都配对 → 强
      if (holeInPair >= 1) {
        if (topTwoPairs[0] >= 12) return 3  // 高两对 → 强
        return 2                             // 低两对 → 中
      }
      return 1 // 公共牌两对 → 弱
    }

    // 一对
    if (pairs.length === 1) {
      const pairRank = parseInt(pairs[0])
      const holeInPair = holeRanks.filter(r => r === pairRank).length
      if (holeInPair >= 1) {
        // 手牌配对
        if (pairRank >= 12) return 3   // 高对（Q+）→ 强
        if (pairRank >= 9) return 2    // 中对 → 中
        return 1                        // 低对 → 弱
      }
      // 口袋对子，公共牌没配上
      if (holeRanks[0] === holeRanks[1]) {
        if (holeRanks[0] > Math.max(...commRanks)) return 2  // 超对 → 中
        return 1
      }
      return 1 // 公共牌对子 → 弱
    }

    // ---- 检测听牌（未成牌时）----
    const drawInfo = this._analyzeDraws(holeCards, communityCards)
    if (drawInfo.hasFlushDraw && drawInfo.hasStraightDraw) return 2  // 双听 → 中
    if (drawInfo.hasFlushDraw) return 1  // 同花听牌 → 弱+
    if (drawInfo.hasStraightDraw) return 1  // 顺子听牌 → 弱+

    // 高牌
    const maxHoleVal = Math.max(...holeRanks)
    const maxCommVal = Math.max(...commRanks)
    if (maxHoleVal > maxCommVal && maxHoleVal >= 13) return 1  // 有超过牌面的大高牌 → 弱
    return 0 // 垃圾
  }

  // ============================
  // 听牌分析
  // ============================

  _analyzeDraws(holeCards, communityCards) {
    const result = { hasFlushDraw: false, hasStraightDraw: false }
    if (!communityCards || communityCards.length < 3) return result

    const allCards = [...holeCards, ...communityCards]
    const allSuits = allCards.map(c => this._getCardSuit(c))
    const holeSuits = holeCards.map(c => this._getCardSuit(c))

    // 同花听牌：同一花色4张且手牌至少1张
    const suitCounts = {}
    allSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1 })
    for (const [suit, count] of Object.entries(suitCounts)) {
      if (count === 4 && holeSuits.includes(suit)) {
        result.hasFlushDraw = true
        break
      }
    }

    // 顺子听牌：连续4张不同点数且手牌参与
    const allRanks = allCards.map(c => RANK_VALUE[this._getCardRank(c)] || 0)
    const uniqueRanks = [...new Set(allRanks)].sort((a, b) => a - b)
    const holeRanks = holeCards.map(c => RANK_VALUE[this._getCardRank(c)] || 0)

    for (let i = 0; i <= uniqueRanks.length - 4; i++) {
      if (uniqueRanks[i + 3] - uniqueRanks[i] === 3) {
        // 连续4张，检查手牌是否在其中
        const seq = uniqueRanks.slice(i, i + 4)
        if (holeRanks.some(r => seq.includes(r))) {
          result.hasStraightDraw = true
          break
        }
      }
    }
    // 卡张顺子听牌（中间缺一张）
    if (!result.hasStraightDraw) {
      for (let i = 0; i <= uniqueRanks.length - 4; i++) {
        if (uniqueRanks[i + 3] - uniqueRanks[i] === 4) {
          const range = [uniqueRanks[i], uniqueRanks[i + 1], uniqueRanks[i + 2], uniqueRanks[i + 3]]
          const inRange = uniqueRanks.filter(r => r >= range[0] && r <= range[3])
          if (inRange.length >= 4 && holeRanks.some(r => inRange.includes(r))) {
            result.hasStraightDraw = true
            break
          }
        }
      }
    }

    return result
  }

  // ============================
  // 顺子检测辅助
  // ============================

  _hasStraight(sortedUniqueRanks) {
    if (sortedUniqueRanks.length < 5) return false
    for (let i = 0; i <= sortedUniqueRanks.length - 5; i++) {
      if (sortedUniqueRanks[i + 4] - sortedUniqueRanks[i] === 4) {
        // 确认5张连续
        const seq = sortedUniqueRanks.slice(i, i + 5)
        if (seq.every((v, idx) => idx === 0 || v === seq[idx - 1] + 1)) {
          return true
        }
      }
    }
    // A-2-3-4-5 低顺子
    if (sortedUniqueRanks.includes(14) &&
        sortedUniqueRanks.includes(2) &&
        sortedUniqueRanks.includes(3) &&
        sortedUniqueRanks.includes(4) &&
        sortedUniqueRanks.includes(5)) {
      return true
    }
    return false
  }

  _holeParticipatesInStraight(holeRanks, commRanks) {
    // 简单判断：手牌中至少有一张不在公共牌中出现的点数，参与了顺子
    const commSet = new Set(commRanks)
    return holeRanks.some(r => !commSet.has(r)) || holeRanks.length > 0
  }

  // ============================
  // 对手记忆系统
  // ============================

  _updateOpponentMemory(lastAction) {
    const { playerId, type } = lastAction
    if (!playerId) return

    if (!this.opponentMemory[playerId]) {
      this.opponentMemory[playerId] = { raises: 0, calls: 0, folds: 0, totalActions: 0 }
    }
    const mem = this.opponentMemory[playerId]
    mem.totalActions++
    if (type === 'raise' || type === 'allin') mem.raises++
    else if (type === 'call') mem.calls++
    else if (type === 'fold') mem.folds++
  }

  /**
   * 获取对手平均激进程度（0=保守, 1=极激进）
   */
  _getAverageOpponentAggression(allPlayers, myId) {
    let totalAgg = 0
    let count = 0
    for (const p of allPlayers) {
      if (p.id === myId) continue
      const mem = this.opponentMemory[p.id]
      if (mem && mem.totalActions > 0) {
        const agg = mem.raises / mem.totalActions
        totalAgg += agg
        count++
      }
    }
    return count > 0 ? totalAgg / count : 0.3 // 默认中等偏保守
  }

  // ============================
  // 基于底池的加注计算
  // ============================

  /**
   * 基于底池比例计算加注额
   * @param {number} pot - 当前底池
   * @param {number} availableChips - 可用筹码
   * @param {number} bigBlind - 大盲注
   * @param {number} minRatio - 最小底池比例
   * @param {number} maxRatio - 最大底池比例
   * @returns {number}
   */
  _potBasedRaise(pot, availableChips, bigBlind, minRatio, maxRatio) {
    const ratio = minRatio + Math.random() * (maxRatio - minRatio)
    const potBased = Math.floor(pot * ratio)
    // 至少 1 个大盲，至多不超过可用筹码
    const amount = Math.max(bigBlind, potBased)
    const capped = Math.min(amount, availableChips)
    // 取整为 10 的倍数（向下取整，至少 10）
    return Math.max(10, Math.floor(capped / 10) * 10)
  }

  // ============================
  // 行动校验（防止非法行动）
  // ============================

  _validateAction(action, me, callAmount, canCheck, bigBlind) {
    const { type, amount } = action

    // 筹码不足以跟注时，只能 allin 或 fold
    if (callAmount > 0 && me.chips <= callAmount) {
      if (type === 'fold') return action
      return { type: 'allin', amount: me.chips }
    }

    switch (type) {
      case 'fold':
        return action
      case 'check':
        if (!canCheck) return { type: 'call', amount: callAmount }
        return action
      case 'call':
        if (canCheck) return { type: 'check', amount: 0 }
        return { type: 'call', amount: callAmount }
      case 'raise':
        if (amount <= 0) {
          return canCheck ? { type: 'check', amount: 0 } : { type: 'call', amount: callAmount }
        }
        if (amount >= me.chips) return { type: 'allin', amount: me.chips }
        // 确保加注额是 10 的倍数
        const roundedAmt = Math.max(bigBlind, Math.floor(amount / 10) * 10)
        if (roundedAmt >= me.chips) return { type: 'allin', amount: me.chips }
        return { type: 'raise', amount: roundedAmt }
      case 'allin':
        return { type: 'allin', amount: me.chips }
      default:
        return canCheck ? { type: 'check', amount: 0 } : { type: 'fold', amount: 0 }
    }
  }

  // ============================
  // 卡牌解析工具
  // ============================

  _getCardRank(card) {
    if (!card || card === 'back') return ''
    const match = card.match(/^(10|[2-9JQKA])/)
    return match ? match[1] : ''
  }

  _getCardSuit(card) {
    if (!card || card === 'back') return ''
    const match = card.match(/([♠♥♦♣])$/)
    return match ? match[1] : ''
  }
}

module.exports = BotPlayer
