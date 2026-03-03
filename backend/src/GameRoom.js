/**
 * GameRoom.js - 房间与游戏核心逻辑
 *
 * 游戏阶段（phase）：
 *   preflop → 翻牌前
 *   flop    → 翻牌
 *   turn    → 转牌
 *   river   → 河牌
 *   showdown → 摊牌
 *
 * 玩家状态（status）：
 *   active  → 活跃
 *   folded  → 已弃牌
 *   allin   → 全押
 *   out     → 出局（筹码为0）
 *
 * 房间状态（this.status）：
 *   waiting   → 等待开始
 *   playing   → 游戏中
 *   round_end → 本轮结束，等待玩家确认下一轮
 *
 * Socket.IO 事件（server→client）：
 *   game:start            首局开始（含初始 gameState，前端需跳转）
 *   game:next_round_start 续局开始（含新 gameState，前端原地刷新）
 *   game:state            游戏状态更新
 *   game:result           本轮结算结果
 *   game:final_result     最终结算（游戏结束）
 *   game:next_round_ready 下一轮等待进度
 *   room:update           房间信息更新
 *   player:action:log     行动日志广播
 *   player:bust           破产通知
 *   error                 错误信息
 */

const Deck = require('./Deck')
const HandEvaluator = require('./HandEvaluator')

// 行动超时：30秒
const ACTION_TIMEOUT_MS = 30 * 1000

// 发牌动画预留时间（毫秒）：等待前端发牌动画完成后才允许行动
const DEAL_ANIMATION_MS = 3500

// 游戏阶段顺序
const PHASES = ['preflop', 'flop', 'turn', 'river', 'showdown']

class GameRoom {
  constructor({ id, ownerId, smallBlind, bigBlind, maxPlayers, io }) {
    this.id = id
    this.ownerId = ownerId
    this.smallBlind = smallBlind || 10
    this.bigBlind = bigBlind || 20
    this.maxPlayers = maxPlayers || 6
    this.io = io

    /** @type {Array<PlayerInRoom>} */
    this.players = []
    this.status = 'waiting' // waiting | playing | round_end

    // 游戏状态（playing 时有值）
    this.gameState = null
    this.deck = null
    this.actionTimer = null
    this.dealerIndex = -1  // 庄家位索引（每局轮换）

    // 下一轮确认集合
    this.nextRoundReady = null

    // 上一局结算结果（供重连玩家恢复界面）
    this.lastRoundResult = null

    // 断线缓冲计时器 { playerId: timeoutId }
    this.disconnectTimers = {}

    // 回调钩子：阶段切换后通知外部（server.js 用于触发机器人行动）
    this.onPhaseAdvanced = null
    // 回调钩子：超时弃牌后通知外部
    this.onActionTimeout = null
    // 回调钩子：发牌动画结束后通知外部（触发机器人行动）
    this.onDealAnimationDone = null
    // 发牌动画延迟计时器
    this._dealAnimTimer = null
  }

  // ============================
  // 房间管理
  // ============================

  addPlayer(playerData, socket) {
    if (this.isFull()) throw new Error('房间已满')

    const existing = this.players.find(p => p.id === playerData.id)
    if (existing) {
      // 机器人没有 socket，不更新 socketId
      if (!playerData.isBot && socket) {
        existing.socketId = socket.id
        existing.connected = true
      }
      return existing
    }

    const p = {
      id: playerData.id,
      nickname: playerData.nickname,
      avatar: playerData.avatar,
      chips: playerData.chips,
      // 机器人没有 socket，socketId 为 null
      socketId: playerData.isBot ? null : (socket ? socket.id : null),
      connected: playerData.isBot ? true : true,
      seatIndex: this.players.length,
      // 机器人标记
      isBot: playerData.isBot || false,
      botLevel: playerData.botLevel || null
    }
    this.players.push(p)
    return p
  }

  removePlayer(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId)
    if (idx === -1) return null
    const [removed] = this.players.splice(idx, 1)
    this.players.forEach((p, i) => { p.seatIndex = i })
    if (this.ownerId === playerId && this.players.length > 0) {
      // 新房主优先选非机器人玩家
      const nonBot = this.players.find(p => !p.isBot)
      this.ownerId = nonBot ? nonBot.id : this.players[0].id
    }
    return removed
  }

  isFull() {
    return this.players.length >= this.maxPlayers
  }

  getOwnerName() {
    const owner = this.players.find(p => p.id === this.ownerId)
    return owner ? owner.nickname : '未知'
  }

  getRoomInfo() {
    return {
      id: this.id,
      ownerId: this.ownerId,
      ownerName: this.getOwnerName(),
      players: this.players.map(p => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        chips: p.chips,
        connected: p.connected,
        seatIndex: p.seatIndex,
        isBot: p.isBot || false,
        botLevel: p.botLevel || null
      })),
      maxPlayers: this.maxPlayers,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      status: this.status,
      createdAt: this.createdAt || Date.now()
    }
  }

  resetToWaiting() {
    this.status = 'waiting'
    this.gameState = null
    this.deck = null
    this.nextRoundReady = null
    this.lastRoundResult = null
    this.clearActionTimer()
    this._clearDealAnimTimer()
    this.clearAllDisconnectTimers()
  }

  // ============================
  // 游戏流程
  // ============================

  /**
   * 开始新一轮游戏
   * @param {object} opts
   * @param {number}  [opts.startChips]   首局初始筹码
   * @param {boolean} [opts.isFirstRound] 是否首局（需要前端跳转）
   */
  startGame({ startChips, isFirstRound } = {}) {
    if (this.players.length < 2) throw new Error('至少需要2名玩家')

    // 首局时重置筹码
    if (isFirstRound) {
      const chips = parseInt(startChips) || 1000
      this.players.forEach(p => { p.chips = chips })
      this.dealerIndex = -1 // 重置庄家位
    }

    this.status = 'playing'
    this.nextRoundReady = null

    // 初始化牌组
    this.deck = new Deck()
    this.deck.shuffle()

    // 参与本局的玩家（筹码 > 0）
    const activePlayers = this.players.filter(p => p.chips > 0)
    if (activePlayers.length < 2) throw new Error('参与玩家筹码不足')

    // 庄家位轮换
    this.dealerIndex = (this.dealerIndex + 1) % activePlayers.length

    const n = activePlayers.length

    // 初始化游戏状态
    this.gameState = {
      phase: 'preflop',
      communityCards: [],
      pot: 0,
      sidePots: [],
      bigBlind: this.bigBlind,
      smallBlind: this.smallBlind,
      currentPlayerId: null,
      lastAction: null,
      players: activePlayers.map((p, i) => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        chips: p.chips,
        cards: [],
        currentBet: 0,
        totalBet: 0,
        status: 'active',
        seatIndex: i,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: false,
        hasActed: false,
        isBot: p.isBot || false,
        botLevel: p.botLevel || null
      }))
    }

    const gs = this.gameState

    // ---- 标记庄家/盲注位 ----
    // 2人局特殊规则：庄家 = 小盲，另一人 = 大盲
    // 多人局：庄家下一位 = 小盲，庄家下两位 = 大盲
    const dealerIdx = this.dealerIndex % n
    gs.players[dealerIdx].isDealer = true

    let sbIdx, bbIdx
    if (n === 2) {
      // Heads-up：庄家是小盲
      sbIdx = dealerIdx
      bbIdx = (dealerIdx + 1) % n
    } else {
      sbIdx = (dealerIdx + 1) % n
      bbIdx = (dealerIdx + 2) % n
    }

    gs.players[sbIdx].isSmallBlind = true
    gs.players[bbIdx].isBigBlind = true

    // 发手牌（每人2张）
    for (let i = 0; i < 2; i++) {
      for (const p of gs.players) {
        p.cards.push(this.deck.deal())
      }
    }

    // 预发5张公共牌
    gs._hiddenCommunityCards = this.deck.dealMultiple(5)

    // 收取盲注
    this._postBlind(gs.players[sbIdx], this.smallBlind)
    this._postBlind(gs.players[bbIdx], this.bigBlind)
    gs.pot = gs.players.reduce((s, p) => s + p.currentBet, 0)

    // preflop 第一个行动者：大盲后一位
    // 2人局特殊：小盲（庄家）先行动
    let firstIdx
    if (n === 2) {
      firstIdx = sbIdx // 庄家/小盲先说话
    } else {
      firstIdx = (bbIdx + 1) % n
    }
    gs.currentPlayerId = gs.players[firstIdx].id

    // 广播游戏状态（此时先不启动行动计时器，等发牌动画结束后再启动）
    if (isFirstRound) {
      console.log(`[Game] 广播 game:start（首局）`)
      this._broadcastGameStart()
    } else {
      console.log(`[Game] 广播 game:next_round_start（续局）`)
      this._broadcastNextRoundStart()
    }

    console.log(`[Game] 房间 ${this.id} 新局开始，庄家: ${gs.players[dealerIdx].nickname}，小盲: ${gs.players[sbIdx].nickname}，大盲: ${gs.players[bbIdx].nickname}`)

    // 延迟启动行动计时器，等发牌动画完成后才允许行动
    // 同时通知外部（server.js）在动画结束后才触发机器人行动
    this._dealAnimTimer = setTimeout(() => {
      this._dealAnimTimer = null
      // 确保游戏仍在进行中
      if (this.status !== 'playing' || !this.gameState) return
      this._startActionTimer()
      // 广播一次最新状态（包含 actionDeadline）
      this._broadcastGameState()
      // 通知外部：发牌动画结束，可以触发机器人行动
      if (this.onDealAnimationDone) this.onDealAnimationDone(this)
    }, DEAL_ANIMATION_MS)
  }

  /**
   * 处理玩家行动
   */
  handlePlayerAction(playerId, type, amount) {
    const gs = this.gameState
    if (!gs) throw new Error('游戏未开始')
    if (gs.currentPlayerId !== playerId) throw new Error('还没轮到你行动')

    const player = gs.players.find(p => p.id === playerId)
    if (!player || player.status !== 'active') throw new Error('玩家状态异常')

    this.clearActionTimer()

    const maxBet = Math.max(...gs.players.map(p => p.currentBet))

    // 记录行动前的下注额，用于计算 lastAction.amount
    const betBefore = player.currentBet

    switch (type) {
      case 'fold':
        this._doFold(player)
        break

      case 'check':
        if (player.currentBet < maxBet) throw new Error('无法看牌，需要跟注或弃牌')
        this._doCheck(player)
        break

      case 'call':
        this._doCall(player, maxBet)
        break

      case 'raise': {
        // amount 代表玩家额外投入的金额（包含跟注部分 + 加注部分）
        // raiseTotal = 已下注 + 额外投入，即本阶段累计下注目标
        const extraAmount = safeAmount(amount)
        const raiseTotal = Math.min(player.currentBet + extraAmount, player.chips + player.currentBet)
        if (raiseTotal <= maxBet) throw new Error('加注金额必须大于当前最高下注')
        this._doRaise(player, raiseTotal)
        // 加注后重置其他已行动玩家的 hasActed，让他们有机会再次行动
        gs.players.forEach(p => {
          if (p.id !== player.id && p.status === 'active') {
            p.hasActed = false
          }
        })
        break
      }

      case 'allin': {
        this._doAllIn(player)
        // all-in 超过当前最高下注时，等同于加注，需要重置其他玩家的 hasActed
        if (player.currentBet > maxBet) {
          gs.players.forEach(p => {
            if (p.id !== player.id && p.status === 'active') {
              p.hasActed = false
            }
          })
        }
        break
      }

      default:
        throw new Error(`未知行动类型: ${type}`)
    }

    // 计算实际投入金额
    const actualAmount = player.currentBet - betBefore

    gs.lastAction = {
      type,
      name: player.nickname,
      amount: actualAmount,
      playerId
    }

    player.hasActed = true

    // 日志广播
    const actionDesc = this._getActionDesc(player, type, actualAmount)
    this.io.to(this.id).emit('player:action:log', { msg: actionDesc })

    // 先广播一次当前状态，确保前端能看到本次行动的下注金额
    // （如果紧接着触发阶段转换，currentBet 会被清零，前端将看不到这一轮的下注）
    this._broadcastGameState()

    this._checkRoundEnd()
  }

  /**
   * 设置断线缓冲计时器
   * 给玩家一定时间重连，超时才执行回调（弃牌）
   */
  setDisconnectTimer(playerId, callback, delayMs = 15000) {
    // 先清除旧的计时器
    this.clearDisconnectTimer(playerId)
    this.disconnectTimers[playerId] = setTimeout(() => {
      delete this.disconnectTimers[playerId]
      callback()
    }, delayMs)
    console.log(`[Game] ${playerId} 断线缓冲开始，${delayMs / 1000}秒后自动弃牌`)
  }

  /**
   * 清除断线缓冲计时器（玩家重连时调用）
   */
  clearDisconnectTimer(playerId) {
    if (this.disconnectTimers[playerId]) {
      clearTimeout(this.disconnectTimers[playerId])
      delete this.disconnectTimers[playerId]
      console.log(`[Game] ${playerId} 重连，断线缓冲已取消`)
    }
  }

  /**
   * 清除所有断线缓冲计时器
   */
  clearAllDisconnectTimers() {
    for (const [id, timer] of Object.entries(this.disconnectTimers)) {
      clearTimeout(timer)
    }
    this.disconnectTimers = {}
  }

  /**
   * 处理玩家断线（立即弃牌，由 server.js 的缓冲期到期后调用）
   */
  handlePlayerDisconnect(playerId) {
    if (!this.gameState) return
    const gs = this.gameState
    const player = gs.players.find(p => p.id === playerId)
    if (!player || player.status !== 'active') return

    if (gs.currentPlayerId === playerId) {
      this.clearActionTimer()
      this._doFold(player)
      gs.lastAction = { type: 'fold', name: player.nickname + '(断线)', amount: 0, playerId }
      player.hasActed = true
      this.io.to(this.id).emit('player:action:log', { msg: `${player.nickname} 断线超时自动弃牌` })
      this._broadcastGameState()
      this._checkRoundEnd()
    }
  }

  // ============================
  // 行动实现
  // ============================

  _doFold(player) {
    player.status = 'folded'
  }

  _doCheck(player) {
    // 看牌：无需额外下注
  }

  _doCall(player, maxBet) {
    const callAmount = maxBet - player.currentBet
    if (callAmount <= 0) return

    const actual = Math.min(callAmount, player.chips)
    player.chips -= actual
    player.currentBet += actual
    player.totalBet += actual
    this.gameState.pot += actual

    if (player.chips === 0) player.status = 'allin'
  }

  _doRaise(player, raiseTo) {
    const additional = raiseTo - player.currentBet
    const actual = Math.min(additional, player.chips)
    player.chips -= actual
    player.currentBet += actual
    player.totalBet += actual
    this.gameState.pot += actual

    if (player.chips === 0) player.status = 'allin'
  }

  _doAllIn(player) {
    const allIn = player.chips
    player.currentBet += allIn
    player.totalBet += allIn
    this.gameState.pot += allIn
    player.chips = 0
    player.status = 'allin'
  }

  _postBlind(player, amount) {
    const actual = Math.min(amount, player.chips)
    player.chips -= actual
    player.currentBet = actual
    player.totalBet = actual
    if (player.chips === 0) player.status = 'allin'
  }

  // ============================
  // 轮次控制
  // ============================

  _checkRoundEnd() {
    const gs = this.gameState

    // 只剩一个未弃牌玩家
    const notFolded = gs.players.filter(p => p.status !== 'folded')
    if (notFolded.length === 1) {
      this._settleGame(false)
      return
    }

    // 所有活跃玩家都已 all-in，无需继续行动
    const activeOnly = gs.players.filter(p => p.status === 'active')
    if (activeOnly.length === 0) {
      this._dealRemainingCommunityCards()
      return
    }

    // 仅剩一个 active 玩家（其余都 all-in 或弃牌），且该玩家下注额 >= 最高下注
    if (activeOnly.length === 1) {
      const maxBetNotFolded = Math.max(...notFolded.map(p => p.currentBet))
      if (activeOnly[0].currentBet >= maxBetNotFolded && activeOnly[0].hasActed) {
        this._dealRemainingCommunityCards()
        return
      }
    }

    // 检查本轮行动是否完成
    const maxBet = Math.max(...gs.players.filter(p => p.status !== 'folded').map(p => p.currentBet))
    const allEqualBet = activeOnly.every(p => p.currentBet === maxBet)
    const allHaveActed = activeOnly.every(p => p.hasActed === true)

    if (allEqualBet && allHaveActed) {
      this._advancePhase()
    } else {
      this._nextPlayer()
    }
  }

  _advancePhase() {
    const gs = this.gameState
    const currentIdx = PHASES.indexOf(gs.phase)

    if (currentIdx === -1 || gs.phase === 'showdown') {
      this._settleGame(true)
      return
    }

    const nextPhase = PHASES[currentIdx + 1]

    // 延迟 600ms 再切换到新阶段，让前端有时间展示上一轮的下注信息
    setTimeout(() => {
      gs.phase = nextPhase

      // 重置本轮下注和行动标记（所有玩家的 currentBet 都要清零，避免前端显示残留）
      gs.players.forEach(p => {
        p.currentBet = 0
        if (p.status === 'active') {
          p.hasActed = false
        }
      })

      // 翻公共牌
      const hidden = gs._hiddenCommunityCards || []
      if (nextPhase === 'flop') {
        gs.communityCards = hidden.slice(0, 3)
      } else if (nextPhase === 'turn') {
        gs.communityCards = hidden.slice(0, 4)
      } else if (nextPhase === 'river') {
        gs.communityCards = hidden.slice(0, 5)
      } else if (nextPhase === 'showdown') {
        this._settleGame(true)
        return
      }

      this._setFirstActivePlayerAfterDealer()
      this._startActionTimer()
      this._broadcastGameState()

      // 通知外部（server.js）阶段已切换，可能需要触发机器人行动
      if (this.onPhaseAdvanced) this.onPhaseAdvanced(this)
    }, 600)
  }

  _dealRemainingCommunityCards() {
    const gs = this.gameState
    const hidden = gs._hiddenCommunityCards || []
    gs.communityCards = hidden.slice(0, 5)
    gs.phase = 'showdown'
    this._broadcastGameState()
    setTimeout(() => this._settleGame(true), 1000)
  }

  _nextPlayer() {
    const gs = this.gameState
    const players = gs.players
    const currentIdx = players.findIndex(p => p.id === gs.currentPlayerId)

    let nextIdx = (currentIdx + 1) % players.length
    let count = 0
    while (players[nextIdx].status !== 'active') {
      nextIdx = (nextIdx + 1) % players.length
      count++
      if (count >= players.length) {
        this._checkRoundEnd()
        return
      }
    }

    gs.currentPlayerId = players[nextIdx].id
    this._startActionTimer()
    this._broadcastGameState()
  }

  _setFirstActivePlayerAfterDealer() {
    const gs = this.gameState
    const n = gs.players.length
    let idx = (this.dealerIndex + 1) % n
    let count = 0
    while (gs.players[idx].status !== 'active') {
      idx = (idx + 1) % n
      count++
      if (count >= n) return
    }
    gs.currentPlayerId = gs.players[idx].id
  }

  // ============================
  // 结算
  // ============================

  _settleGame(showdown) {
    const gs = this.gameState
    this.clearActionTimer()

    const notFolded = gs.players.filter(p => p.status !== 'folded')

    let winners = []
    let results = []

    if (!showdown || notFolded.length === 1) {
      winners = [notFolded[0].id]
      results = gs.players.map(p => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        cards: p.cards,
        handName: p.id === notFolded[0].id ? '其他人弃牌' : '已弃牌',
        isWinner: p.id === notFolded[0].id
      }))
    } else {
      const evalInput = notFolded.map(p => ({
        id: p.id,
        holeCards: p.cards
      }))

      try {
        const evalResult = HandEvaluator.findWinners(evalInput, gs.communityCards)
        winners = evalResult.winners
        results = gs.players.map(p => {
          const r = evalResult.results.find(e => e.id === p.id)
          return {
            id: p.id,
            nickname: p.nickname,
            avatar: p.avatar,
            cards: p.cards,
            handName: r ? r.nameZh : '已弃牌',
            isWinner: winners.includes(p.id)
          }
        })
      } catch (e) {
        console.error(`[Game] 牌型评估失败: ${e.message}`)
        winners = [notFolded[0].id]
        results = gs.players.map(p => ({
          id: p.id,
          nickname: p.nickname,
          avatar: p.avatar,
          cards: p.cards,
          handName: '未知',
          isWinner: p.id === notFolded[0].id
        }))
      }
    }

    // 分配底池（处理余数：多余的筹码给第一个赢家）
    const totalPot = gs.pot
    const baseGain = Math.floor(totalPot / winners.length)
    const remainder = totalPot % winners.length

    winners.forEach((wid, idx) => {
      const gain = baseGain + (idx === 0 ? remainder : 0)
      const p = gs.players.find(pl => pl.id === wid)
      if (p) {
        p.chips += gain
        const roomPlayer = this.players.find(rp => rp.id === wid)
        if (roomPlayer) roomPlayer.chips = p.chips
      }
    })

    // 同步所有玩家筹码到房间
    gs.players.forEach(gp => {
      const rp = this.players.find(rp => rp.id === gp.id)
      if (rp) rp.chips = gp.chips
    })

    // 构建结算结果
    const winner = gs.players.find(p => winners.includes(p.id))
    const winnerResult = results.find(r => r.isWinner)
    const winnerGain = baseGain + (winners.length > 0 ? remainder : 0)

    const roundResult = {
      winner: winner ? {
        id: winner.id,
        nickname: winner.nickname,
        avatar: winner.avatar,
        handName: winnerResult ? winnerResult.handName : '',
        gain: winnerGain
      } : null,
      winners,
      allHands: results.map(r => {
        const gp = gs.players.find(p => p.id === r.id)
        const rp = this.players.find(p => p.id === r.id)
        const chipsAfter = rp ? rp.chips : 0
        const invested = gp ? gp.totalBet || 0 : 0
        const isWin = r.isWinner
        const winnerIdx = winners.indexOf(r.id)
        const myGain = isWin ? (baseGain + (winnerIdx === 0 ? remainder : 0)) : 0
        const chipsChange = myGain - invested
        return { ...r, chipsChange, chipsAfter }
      }),
      pot: totalPot,
      communityCards: gs.communityCards
    }

    gs.phase = 'showdown'
    gs.currentPlayerId = null

    // 检查是否有人筹码耗尽
    const bustedPlayers = this.players.filter(p => p.chips <= 0)
    roundResult.gameOver = bustedPlayers.length > 0
    if (roundResult.gameOver) {
      roundResult.bustedNames = bustedPlayers.map(p => p.nickname)
    }

    // 保存结算结果（供重连玩家恢复界面）
    this.lastRoundResult = roundResult

    // 广播摊牌和结算
    this._broadcastShowdown(roundResult)

    // 标记本轮结束，等待确认
    this.status = 'round_end'

    console.log(`[Game] 房间 ${this.id} 本局结算，赢家: ${winners.join(',')}，底池: ${totalPot}${roundResult.gameOver ? '，有人破产' : ''}`)
  }

  // ============================
  // 超时计时器
  // ============================

  _startActionTimer() {
    this.clearActionTimer()
    // 记录行动截止时间戳，供前端倒计时使用
    this.actionDeadline = Date.now() + ACTION_TIMEOUT_MS
    this.actionTimer = setTimeout(() => {
      const gs = this.gameState
      if (!gs || !gs.currentPlayerId) return

      const player = gs.players.find(p => p.id === gs.currentPlayerId)
      if (!player || player.status !== 'active') return

      console.log(`[Timer] ${player.nickname} 超时，自动弃牌`)
      this._doFold(player)
      gs.lastAction = { type: 'fold', name: player.nickname + '(超时)', amount: 0, playerId: player.id }
      player.hasActed = true
      this.io.to(this.id).emit('player:action:log', { msg: `${player.nickname} 超时自动弃牌` })
      this._broadcastGameState()
      this._checkRoundEnd()

      // 超时弃牌后通知外部，可能需要触发下一个机器人行动
      if (this.onActionTimeout) this.onActionTimeout(this)
    }, ACTION_TIMEOUT_MS)
  }

  clearActionTimer() {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer)
      this.actionTimer = null
    }
    this.actionDeadline = null
  }

  _clearDealAnimTimer() {
    if (this._dealAnimTimer) {
      clearTimeout(this._dealAnimTimer)
      this._dealAnimTimer = null
    }
  }

  // ============================
  // 广播（跳过机器人玩家，他们没有 socket）
  // ============================

  _broadcastGameStart() {
    const gs = this.gameState
    for (const player of this.players) {
      if (player.isBot) continue  // 机器人没有 socket，跳过
      const socketId = player.socketId
      if (!socketId) continue
      const socket = this.io.sockets.sockets.get(socketId)
      if (!socket) continue
      const stateForPlayer = this._buildStateForPlayer(player.id)
      socket.emit('game:start', { gameState: stateForPlayer })
    }
  }

  _broadcastNextRoundStart() {
    for (const player of this.players) {
      if (player.isBot) continue  // 机器人没有 socket，跳过
      const socketId = player.socketId
      if (!socketId) continue
      const socket = this.io.sockets.sockets.get(socketId)
      if (!socket) continue
      const stateForPlayer = this._buildStateForPlayer(player.id)
      socket.emit('game:next_round_start', { gameState: stateForPlayer })
    }
  }

  _broadcastGameState() {
    for (const player of this.players) {
      if (player.isBot) continue  // 机器人没有 socket，跳过
      const socketId = player.socketId
      if (!socketId) continue
      const socket = this.io.sockets.sockets.get(socketId)
      if (!socket) continue
      socket.emit('game:state', this._buildStateForPlayer(player.id))
    }
  }

  _broadcastShowdown(roundResult) {
    const gs = this.gameState
    const stateWithAllCards = {
      ...gs,
      players: gs.players.map(p => ({
        ...p,
        cards: p.status !== 'folded' ? p.cards : []
      }))
    }
    this.io.to(this.id).emit('game:state', stateWithAllCards)
    setTimeout(() => {
      this.io.to(this.id).emit('game:result', roundResult)
    }, 800)
  }

  getGameStateForPlayer(playerId) {
    return this._buildStateForPlayer(playerId)
  }

  _buildStateForPlayer(playerId) {
    const gs = this.gameState
    if (!gs) return null
    return {
      ...gs,
      // 行动截止时间戳和总时长，供前端所有客户端计算倒计时进度
      actionDeadline: this.actionDeadline || null,
      actionDuration: ACTION_TIMEOUT_MS,
      players: gs.players.map(p => ({
        ...p,
        cards: p.id === playerId ? p.cards : (p.status !== 'folded' ? ['back', 'back'] : [])
      }))
    }
  }

  // ============================
  // 工具
  // ============================

  _getActionDesc(player, type, amount) {
    const names = {
      fold: '弃牌',
      check: '看牌',
      call: '跟注',
      raise: '加注',
      allin: 'All In'
    }
    const name = names[type] || type
    if ((type === 'raise' || type === 'call' || type === 'allin') && amount > 0) {
      return `${player.nickname} ${name} ${amount}`
    }
    return `${player.nickname} ${name}`
  }
}

function safeAmount(val) {
  const n = parseInt(val, 10)
  return isNaN(n) || n < 0 ? 0 : n
}

module.exports = GameRoom
