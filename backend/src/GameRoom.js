/**
 * GameRoom.js - 房间与游戏核心逻辑
 *
 * 游戏阶段（phase）与前端 GamePage.vue PHASE_NAMES 对应：
 *   preflop → 翻牌前
 *   flop    → 翻牌
 *   turn    → 转牌
 *   river   → 河牌
 *   showdown → 摊牌
 *
 * 玩家状态（status）与前端 PLAYER_STATUS_COLORS 对应：
 *   active  → 活跃
 *   folded  → 已弃牌
 *   allin   → 全押
 *   out     → 出局（筹码为0）
 *
 * Socket.IO 事件：
 *   server→client:
 *     game:start     游戏开始（含初始 gameState）
 *     game:state     游戏状态更新
 *     game:result    本局结算结果
 *     room:update    房间信息更新
 *     player:action:log  行动日志广播
 *     error          错误信息
 */

const Deck = require('./Deck')
const HandEvaluator = require('./HandEvaluator')

// 行动超时：30秒
const ACTION_TIMEOUT_MS = 30 * 1000

// 游戏阶段顺序
const PHASES = ['preflop', 'flop', 'turn', 'river', 'showdown']

class GameRoom {
  constructor({ id, ownerId, smallBlind, bigBlind, maxPlayers, io }) {
    this.id = id
    this.ownerId = ownerId
    this.smallBlind = smallBlind || 10
    this.bigBlind = bigBlind || 20
    this.maxPlayers = maxPlayers || 6
    this.io = io  // Socket.IO 实例，用于广播

    /** @type {Array<PlayerInRoom>} */
    this.players = []       // 房间内所有玩家（含游戏中/旁观）
    this.status = 'waiting' // waiting | playing | finished

    // 游戏状态（playing 时有值）
    this.gameState = null
    this.deck = null
    this.actionTimer = null  // 当前行动超时计时器
    this.dealerIndex = -1    // 庄家位索引（每局轮换）
  }

  // ============================
  // 房间管理
  // ============================

  /**
   * 玩家加入房间
   */
  addPlayer(playerData, socket) {
    if (this.isFull()) throw new Error('房间已满')

    const existing = this.players.find(p => p.id === playerData.id)
    if (existing) {
      existing.socketId = socket.id
      existing.connected = true
      return existing
    }

    const p = {
      id: playerData.id,
      nickname: playerData.nickname,
      avatar: playerData.avatar,
      chips: playerData.chips,
      socketId: socket.id,
      connected: true,
      seatIndex: this.players.length
    }
    this.players.push(p)
    return p
  }

  /**
   * 移除玩家
   */
  removePlayer(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId)
    if (idx === -1) return null
    const [removed] = this.players.splice(idx, 1)
    // 重新分配座位索引
    this.players.forEach((p, i) => { p.seatIndex = i })
    // 如果房主离开，转让给第一个玩家
    if (this.ownerId === playerId && this.players.length > 0) {
      this.ownerId = this.players[0].id
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

  /**
   * 获取房间基本信息（用于等待室）
   * 对应前端 RoomPage.vue 需要的 room 数据结构
   */
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
        seatIndex: p.seatIndex
      })),
      maxPlayers: this.maxPlayers,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      status: this.status,
      createdAt: this.createdAt || Date.now()
    }
  }

  /**
   * 结束游戏后重置为等待状态
   */
  resetToWaiting() {
    this.status = 'waiting'
    this.gameState = null
    this.deck = null
    this.clearActionTimer()
  }

  // ============================
  // 游戏流程
  // ============================

  /**
   * 开始新一局游戏
   * 被 server.js 的 room:start 事件调用
   */
  startGame({ startChips } = {}) {
    if (this.players.length < 2) throw new Error('至少需要2名玩家')
    this.status = 'playing'

    // 如果指定了初始筹码，覆盖所有玩家筹码
    const chips = parseInt(startChips) || 1000
    this.players.forEach(p => { p.chips = chips })

    // 初始化牌组
    this.deck = new Deck()
    this.deck.shuffle()

    // 参与本局的玩家（筹码 > 0 的才能参与）
    const activePlayers = this.players.filter(p => p.chips > 0)
    if (activePlayers.length < 2) throw new Error('参与玩家筹码不足')

    // 庄家位轮换
    this.dealerIndex = (this.dealerIndex + 1) % activePlayers.length

    // 初始化游戏状态
    this.gameState = {
      phase: 'preflop',
      communityCards: [],
      pot: 0,
      sidePots: [],        // 边池（all-in 时）
      bigBlind: this.bigBlind,
      smallBlind: this.smallBlind,
      currentPlayerId: null,
      lastAction: null,
      // 本局参与玩家（含游戏内状态）
      players: activePlayers.map((p, i) => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        chips: p.chips,
        cards: [],          // 手牌（只对该玩家自己可见）
        currentBet: 0,      // 当前下注（本轮）
        totalBet: 0,        // 总下注（本局）
        status: 'active',   // active | folded | allin | out
        seatIndex: i,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: false
      }))
    }

    // 标记庄家/小盲/大盲位
    const gs = this.gameState
    const n = gs.players.length
    gs.players[this.dealerIndex % n].isDealer = true

    // 小盲：庄家下一位
    const sbIdx = (this.dealerIndex + 1) % n
    // 大盲：庄家下两位
    const bbIdx = (this.dealerIndex + 2) % n

    gs.players[sbIdx].isSmallBlind = true
    gs.players[bbIdx].isBigBlind = true

    // 发手牌（每人2张）
    for (let i = 0; i < 2; i++) {
      for (const p of gs.players) {
        p.cards.push(this.deck.deal())
      }
    }

    // 预先发好5张公共牌（藏起来，阶段推进时翻出）
    gs._hiddenCommunityCards = this.deck.dealMultiple(5)

    // 收取盲注
    this._postBlind(gs.players[sbIdx], this.smallBlind)
    this._postBlind(gs.players[bbIdx], this.bigBlind)
    gs.pot = gs.players.reduce((s, p) => s + p.currentBet, 0)

    // preflop 第一个行动者是大盲后一位
    const firstIdx = (bbIdx + 1) % n
    gs.currentPlayerId = gs.players[firstIdx].id

    // 广播 game:start（含各自手牌）
    this._broadcastGameStart()

    // 启动行动超时计时器
    this._startActionTimer()

    console.log(`[Game] 房间 ${this.id} 新局开始，庄家: ${gs.players[this.dealerIndex % n].nickname}`)
  }

  /**
   * 处理玩家行动
   * @param {string} playerId
   * @param {string} type  fold | call | check | raise | allin
   * @param {number} [amount]  raise 时的加注到金额
   */
  handlePlayerAction(playerId, type, amount) {
    const gs = this.gameState
    if (!gs) throw new Error('游戏未开始')

    // 验证是否轮到该玩家
    if (gs.currentPlayerId !== playerId) {
      throw new Error('还没轮到你行动')
    }

    const player = gs.players.find(p => p.id === playerId)
    if (!player || player.status !== 'active') {
      throw new Error('玩家状态异常')
    }

    // 停止超时计时器
    this.clearActionTimer()

    // 当前最高下注
    const maxBet = Math.max(...gs.players.map(p => p.currentBet))

    switch (type) {
      case 'fold':
        this._doFold(player)
        break

      case 'check':
        // 看牌：只有当前下注等于最高下注时才能看牌
        if (player.currentBet < maxBet) {
          throw new Error('无法看牌，需要跟注或弃牌')
        }
        this._doCheck(player)
        break

      case 'call':
        this._doCall(player, maxBet)
        break

      case 'raise': {
        // amount 是加注到的总额（不是加注的增量）
        const raiseTotal = Math.min(safeAmount(amount), player.chips + player.currentBet)
        if (raiseTotal <= maxBet) {
          throw new Error('加注金额必须大于当前最高下注')
        }
        this._doRaise(player, raiseTotal)
        break
      }

      case 'allin':
        this._doAllIn(player)
        break

      default:
        throw new Error(`未知行动类型: ${type}`)
    }

    // 记录最后一次行动（供前端 lastAction 显示）
    gs.lastAction = {
      type,
      name: player.nickname,
      amount: type === 'raise' ? player.currentBet : (type === 'call' ? maxBet - (player.currentBet - (maxBet - player.currentBet)) : 0),
      playerId
    }

    // 标记该玩家本轮已行动（用于 preflop BB 权利判断）
    player.hasActed = true

    // 日志广播
    const actionDesc = this._getActionDesc(player, type, gs.lastAction.amount)
    this.io.to(this.id).emit('player:action:log', { msg: actionDesc })

    // 检查本轮是否结束
    this._checkRoundEnd()
  }

  /**
   * 处理玩家断线（游戏中）
   * 如果是当前行动者，自动 fold
   */
  handlePlayerDisconnect(playerId) {
    if (!this.gameState) return
    const gs = this.gameState
    const player = gs.players.find(p => p.id === playerId)
    if (!player || player.status !== 'active') return

    if (gs.currentPlayerId === playerId) {
      // 自动弃牌
      this.clearActionTimer()
      this._doFold(player)
      gs.lastAction = { type: 'fold', name: player.nickname + '(断线)', amount: 0, playerId }
      this.io.to(this.id).emit('player:action:log', { msg: `${player.nickname} 断线自动弃牌` })
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
    if (callAmount <= 0) {
      // 实际上是 check
      return
    }
    const actual = Math.min(callAmount, player.chips)
    player.chips -= actual
    player.currentBet += actual
    player.totalBet += actual
    this.gameState.pot += actual

    // 筹码不足，变成 all-in
    if (player.chips === 0) {
      player.status = 'allin'
    }
  }

  _doRaise(player, raiseTo) {
    // raiseTo 是本轮下注总额
    const additional = raiseTo - player.currentBet
    const actual = Math.min(additional, player.chips)
    player.chips -= actual
    player.currentBet += actual
    player.totalBet += actual
    this.gameState.pot += actual

    if (player.chips === 0) {
      player.status = 'allin'
    }
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

  /**
   * 检查本轮是否结束，并推进游戏流程
   */
  _checkRoundEnd() {
    const gs = this.gameState

    // 所有人都 fold 了（只剩一个活跃玩家）
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

    // 检查本轮行动是否完成：
    // 1. 所有 active 玩家下注额相等
    // 2. 每个 active 玩家都至少行动过一次（hasActed = true）
    const maxBet = Math.max(...gs.players.filter(p => p.status !== 'folded').map(p => p.currentBet))
    const allEqualBet = gs.players
      .filter(p => p.status === 'active')
      .every(p => p.currentBet === maxBet)
    const allHaveActed = gs.players
      .filter(p => p.status === 'active')
      .every(p => p.hasActed === true)

    if (allEqualBet && allHaveActed) {
      this._advancePhase()
    } else {
      this._nextPlayer()
    }
  }

  /**
   * 进入下一个游戏阶段
   */
  _advancePhase() {
    const gs = this.gameState
    const phases = PHASES
    const currentIdx = phases.indexOf(gs.phase)

    if (currentIdx === -1 || gs.phase === 'showdown') {
      this._settleGame(true)
      return
    }

    const nextPhase = phases[currentIdx + 1]
    gs.phase = nextPhase

    // 重置本轮下注和行动标记（进入新轮）
    gs.players.forEach(p => {
      if (p.status === 'active') {
        p.currentBet = 0
        p.hasActed = false
      }
    })

    // 翻公共牌（从预发的隐藏牌里取，不再现场 deal）
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

    // 广播游戏状态（先翻牌、重置下注，再设置下一个行动者，最后广播）
    this._setFirstActivePlayerAfterDealer()
    this._broadcastGameState()
    this._startActionTimer()
  }

  /**
   * 翻完剩余公共牌（全员 all-in 情况）
   */
  _dealRemainingCommunityCards() {
    const gs = this.gameState
    // 从预发的隐藏公共牌里补全5张
    const hidden = gs._hiddenCommunityCards || []
    gs.communityCards = hidden.slice(0, 5)
    gs.phase = 'showdown'
    this._broadcastGameState()
    setTimeout(() => this._settleGame(true), 1000)
  }

  /**
   * 轮到下一个活跃玩家
   */
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
        // 没有 active 玩家了
        this._checkRoundEnd()
        return
      }
    }

    gs.currentPlayerId = players[nextIdx].id
    this._broadcastGameState()
    this._startActionTimer()
  }

  /**
   * 新一轮从庄家左手边的第一个 active 玩家开始
   */
  _setFirstActivePlayerAfterDealer() {
    const gs = this.gameState
    const n = gs.players.length
    let idx = (this.dealerIndex + 1) % n
    let count = 0
    while (gs.players[idx].status !== 'active') {
      idx = (idx + 1) % n
      count++
      if (count >= n) return // 全员弃牌/allin
    }
    gs.currentPlayerId = gs.players[idx].id
  }

  // ============================
  // 结算
  // ============================

  /**
   * 结算游戏
   * @param {boolean} showdown  是否需要摊牌比较牌型
   */
  _settleGame(showdown) {
    const gs = this.gameState
    this.clearActionTimer()

    const notFolded = gs.players.filter(p => p.status !== 'folded')

    let winners = []
    let results = []

    if (!showdown || notFolded.length === 1) {
      // 只剩一人：直接获胜
      winners = [notFolded[0].id]
      results = gs.players.map(p => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        cards: p.cards,
        handName: p.id === notFolded[0].id ? '其他人弃牌' : '已弃牌',
        nameZh: p.id === notFolded[0].id ? '其他人弃牌' : '已弃牌',
        isWinner: p.id === notFolded[0].id
      }))
    } else {
      // 需要比较牌型
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
        // fallback
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

    // 分配底池
    const totalPot = gs.pot
    const gain = Math.floor(totalPot / winners.length)
    winners.forEach(wid => {
      const p = gs.players.find(pl => pl.id === wid)
      if (p) {
        p.chips += gain
        // 同步回房间玩家筹码
        const roomPlayer = this.players.find(rp => rp.id === wid)
        if (roomPlayer) roomPlayer.chips = p.chips
      }
    })

    // 同步所有玩家筹码到房间
    gs.players.forEach(gp => {
      const rp = this.players.find(rp => rp.id === gp.id)
      if (rp) rp.chips = gp.chips
    })

    // 构建结算结果（对应前端 GamePage.vue roundResult 数据结构）
    const winner = gs.players.find(p => winners.includes(p.id))
    const winnerResult = results.find(r => r.isWinner)
    const roundResult = {
      winner: winner ? {
        id: winner.id,
        nickname: winner.nickname,
        avatar: winner.avatar,
        handName: winnerResult ? winnerResult.handName : '',
        gain: gain
      } : null,
      winners,
      allHands: results,
      pot: totalPot,
      communityCards: gs.communityCards
    }

    gs.phase = 'showdown'
    gs.currentPlayerId = null

    // 先广播最终游戏状态（含手牌揭示）
    this._broadcastShowdown(roundResult)

    // 标记游戏结束
    this.status = 'finished'

    console.log(`[Game] 房间 ${this.id} 本局结算，赢家: ${winners.join(',')}，底池: ${totalPot}`)
  }

  // ============================
  // 超时计时器
  // ============================

  _startActionTimer() {
    this.clearActionTimer()
    this.actionTimer = setTimeout(() => {
      const gs = this.gameState
      if (!gs || !gs.currentPlayerId) return

      const player = gs.players.find(p => p.id === gs.currentPlayerId)
      if (!player || player.status !== 'active') return

      console.log(`[Timer] ${player.nickname} 超时，自动弃牌`)
      this._doFold(player)
      gs.lastAction = { type: 'fold', name: player.nickname + '(超时)', amount: 0, playerId: player.id }
      this.io.to(this.id).emit('player:action:log', { msg: `${player.nickname} 超时自动弃牌` })
      this._checkRoundEnd()
    }, ACTION_TIMEOUT_MS)
  }

  clearActionTimer() {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer)
      this.actionTimer = null
    }
  }

  // ============================
  // 广播
  // ============================

  /**
   * 广播 game:start
   * 每个玩家收到的手牌只包含自己的
   */
  _broadcastGameStart() {
    const gs = this.gameState
    for (const player of this.players) {
      const socketId = player.socketId
      if (!socketId) continue

      const socket = this.io.sockets.sockets.get(socketId)
      if (!socket) continue

      // 构造该玩家视角的 gameState：只有自己的 cards 是明牌
      const stateForPlayer = this._buildStateForPlayer(player.id)
      socket.emit('game:start', { gameState: stateForPlayer })
    }
  }

  /**
   * 广播 game:state（常规更新）
   */
  _broadcastGameState() {
    for (const player of this.players) {
      const socketId = player.socketId
      if (!socketId) continue
      const socket = this.io.sockets.sockets.get(socketId)
      if (!socket) continue
      socket.emit('game:state', this._buildStateForPlayer(player.id))
    }
  }

  /**
   * 广播 showdown（摊牌，所有手牌可见）
   */
  _broadcastShowdown(roundResult) {
    const gs = this.gameState
    // showdown 时所有未弃牌的玩家手牌都公开
    const stateWithAllCards = {
      ...gs,
      players: gs.players.map(p => ({
        ...p,
        // 弃牌者手牌隐藏（前端不显示），未弃牌者公开
        cards: p.status !== 'folded' ? p.cards : []
      }))
    }
    this.io.to(this.id).emit('game:state', stateWithAllCards)
    // 稍后发结算结果
    setTimeout(() => {
      this.io.to(this.id).emit('game:result', roundResult)
    }, 800)
  }

  /**
   * 获取指定玩家视角的 gameState
   */
  getGameStateForPlayer(playerId) {
    return this._buildStateForPlayer(playerId)
  }

  /**
   * 构建玩家视角的游戏状态
   * - 自己的手牌：明牌
   * - 其他人的手牌：隐藏（替换为 ['back', 'back']）
   */
  _buildStateForPlayer(playerId) {
    const gs = this.gameState
    if (!gs) return null
    return {
      ...gs,
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
    if ((type === 'raise' || type === 'call') && amount > 0) {
      return `${player.nickname} ${name} ${amount}`
    }
    return `${player.nickname} ${name}`
  }
}

/**
 * 安全转数字
 */
function safeAmount(val) {
  const n = parseInt(val, 10)
  return isNaN(n) || n < 0 ? 0 : n
}

module.exports = GameRoom
