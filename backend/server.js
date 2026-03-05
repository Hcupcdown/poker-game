/**
 * 德扑小局 - 后端入口
 * 技术栈：Node.js + Express + Socket.IO
 */

const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const { v4: uuidv4 } = require('uuid')
const GameRoom = require('./src/GameRoom')
const BotPlayer = require('./src/BotPlayer')
const { generateRoomCode } = require('./src/utils')

const app = express()
const server = http.createServer(app)

// ====== Socket.IO 配置 ======
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  // 心跳机制配置
  pingInterval: 10000,  // 每 10 秒发送一次 ping
  pingTimeout: 8000,    // 8 秒内未收到 pong 则视为断线
})

app.use(cors())
app.use(express.json())

// ====== 静态文件（生产环境托管前端 dist）======
const path = require('path')
const fs = require('fs')
const distPath = path.join(__dirname, '../frontend/dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// ====== 内存存储 ======
const players = new Map()
const rooms = new Map()
const socketToPlayer = new Map()

// 机器人实例：botId → BotPlayer
const bots = new Map()
// 机器人正在思考的计时器：botId → timeoutId（防止重复触发）
const botThinkingTimers = new Map()

// 机器人名字和头像池
const BOT_NAMES = ['小明机器人', '智能选手', 'AI玩家', '扑克机器人', '智慧Bot', '策略大师']
const BOT_AVATARS = ['🤖']

/**
 * 检查游戏状态中当前行动者是否为机器人，如果是则触发自动行动
 */
function triggerBotActionIfNeeded(room) {
  const gs = room.gameState
  if (!gs || !gs.currentPlayerId) return
  if (room.status !== 'playing') return

  const currentId = gs.currentPlayerId
  if (!currentId.startsWith('bot_')) return

  const bot = bots.get(currentId)
  if (!bot) return

  // 清除旧的计时器，防止重复触发
  if (botThinkingTimers.has(currentId)) {
    clearTimeout(botThinkingTimers.get(currentId))
    botThinkingTimers.delete(currentId)
  }

  // 根据难度和游戏阶段动态调整思考时间，模拟真实玩家
  const level = bot.level || 'easy'
  const phase = room.gameState.phase || 'preflop'
  // Easy 快速决策，Hard 需要更多思考时间；后期阶段比翻牌前思考更久
  const baseTime = { easy: 800, medium: 1200, hard: 1800 }[level] || 1000
  const phaseExtra = { preflop: 0, flop: 400, turn: 600, river: 800 }[phase] || 0
  const randomJitter = Math.floor(Math.random() * 1200)
  const thinkMs = baseTime + phaseExtra + randomJitter

  const timer = setTimeout(() => {
    botThinkingTimers.delete(currentId)

    // 再次验证状态（延迟期间可能已变化）
    if (!room.gameState) return
    if (room.gameState.currentPlayerId !== currentId) return
    if (room.status !== 'playing') return

    try {
      const gameStateForBot = room.getGameStateForPlayer(currentId)
      const action = bot.decideAction(gameStateForBot, currentId, room.bigBlind)
      console.log(`[Bot] ${bot.nickname}(${bot.level}) 行动: ${action.type} ${action.amount || ''} [phase=${phase}, thinkMs=${thinkMs}]`)
      room.handlePlayerAction(currentId, action.type, action.amount)
    } catch (err) {
      console.error(`[Bot] ${currentId} 行动失败: ${err.message}`)
      // 失败时尝试弃牌
      try {
        room.handlePlayerAction(currentId, 'fold', 0)
      } catch (e2) {
        console.error(`[Bot] ${currentId} 弃牌也失败: ${e2.message}`)
      }
    }

    // 链式调用：Bot 行动后检查下一个行动者是否也是机器人
    triggerBotActionIfNeeded(room)
  }, thinkMs)

  botThinkingTimers.set(currentId, timer)
}

// ====== REST API ======

app.get('/api/health', (req, res) => {
  res.json({ ok: true, rooms: rooms.size, players: players.size })
})

app.post('/api/login', (req, res) => {
  const { nickname, avatar, chips } = req.body
  if (!nickname || !nickname.trim()) {
    return res.status(400).json({ error: '昵称不能为空' })
  }
  const playerId = 'p_' + uuidv4().replace(/-/g, '').slice(0, 8)
  const player = {
    id: playerId,
    nickname: nickname.trim(),
    avatar: avatar || '🐼',
    chips: chips || 1000,
    createdAt: Date.now(),
    lastActiveAt: Date.now()
  }
  players.set(playerId, player)
  res.json({ player, token: playerId })
})

app.get('/api/rooms', (req, res) => {
  const list = []
  for (const [code, room] of rooms) {
    if (room.status === 'waiting') {
      list.push({
        id: code,
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers,
        smallBlind: room.smallBlind,
        bigBlind: room.bigBlind,
        ownerName: room.getOwnerName()
      })
    }
  }
  res.json(list)
})

// ====== Socket.IO 事件处理 ======
io.on('connection', (socket) => {
  console.log(`[Socket] 新连接: ${socket.id}`)

  // 记录最后活跃时间
  socket.lastHeartbeat = Date.now()

  // ----------------------------------------------------------------
  // heartbeat — 自定义心跳
  // ----------------------------------------------------------------
  socket.on('heartbeat', (data, callback) => {
    socket.lastHeartbeat = Date.now()
    const playerId = socketToPlayer.get(socket.id)
    // 更新玩家最后活跃时间
    if (playerId) {
      const p = players.get(playerId)
      if (p) p.lastActiveAt = Date.now()
    }
    // 返回心跳响应，附带服务器时间和连接状态
    const response = {
      serverTime: Date.now(),
      connected: true,
      playerId: playerId || null
    }
    // 如果客户端传了回调函数，使用回调返回（更可靠）
    if (typeof callback === 'function') {
      callback(response)
    } else {
      socket.emit('heartbeat:ack', response)
    }
  })

  // ----------------------------------------------------------------
  // player:auth — 认证
  // ----------------------------------------------------------------
  socket.on('player:auth', (data) => {
    const { playerId, player: clientPlayer } = data || {}

    let playerData = players.get(playerId)
    if (!playerData && clientPlayer) {
      playerData = { ...clientPlayer }
      players.set(playerId, playerData)
    }

    if (!playerData) {
      socket.emit('error', { message: '玩家未找到，请重新登录' })
      return
    }

    socketToPlayer.set(socket.id, playerId)
    playerData.socketId = socket.id
    playerData.lastActiveAt = Date.now()
    players.set(playerId, playerData)

    // 检查玩家是否在某个房间中（用于断线重连恢复）
    let currentRoom = null
    let currentRoomId = null
    for (const [code, room] of rooms) {
      const p = room.players.find(pl => pl.id === playerId)
      if (p) {
        currentRoomId = code
        currentRoom = room
        // 恢复 socket 到房间
        p.socketId = socket.id
        p.connected = true
        socket.join(code)
        break
      }
    }

    const authResult = { player: playerData }
    if (currentRoom && currentRoomId) {
      authResult.inRoom = {
        roomId: currentRoomId,
        status: currentRoom.status // waiting | playing | round_end
      }
      console.log(`[Auth] ${playerData.nickname} 认证成功，当前在房间 ${currentRoomId}（${currentRoom.status}）`)

      // 如果游戏进行中或轮间等待，推送游戏状态
      if ((currentRoom.status === 'playing' || currentRoom.status === 'round_end') && currentRoom.gameState) {
        // 清除断线缓冲计时器
        if (currentRoom.clearDisconnectTimer) {
          currentRoom.clearDisconnectTimer(playerId)
        }
        // 通知其他玩家该玩家已重连
        socket.to(currentRoomId).emit('player:reconnected', { playerId, nickname: playerData.nickname })
        // 延迟推送游戏状态，确保前端已就绪
        setTimeout(() => {
          socket.emit('game:state', currentRoom.getGameStateForPlayer(playerId))
        }, 200)
        // 如果该玩家是当前行动者，重新启动行动超时计时器
        if (currentRoom.status === 'playing' && currentRoom.gameState.currentPlayerId === playerId) {
          currentRoom._startActionTimer()
        }
        // round_end 状态下：推送上一局结算结果和确认进度，让重连玩家恢复到等待下一局界面
        if (currentRoom.status === 'round_end' && currentRoom.lastRoundResult) {
          setTimeout(() => {
            socket.emit('game:result', currentRoom.lastRoundResult)
            const total = currentRoom.players.filter(p => p.isBot || p.connected !== false).length
            const ready = currentRoom.nextRoundReady ? currentRoom.nextRoundReady.size : 0
            socket.emit('game:next_round_ready', {
              ready,
              total,
              readyIds: currentRoom.nextRoundReady ? [...currentRoom.nextRoundReady] : []
            })
            // 广播更新后的进度给所有人（因为在线人数变了）
            io.to(currentRoomId).emit('game:next_round_ready', {
              ready,
              total,
              readyIds: currentRoom.nextRoundReady ? [...currentRoom.nextRoundReady] : []
            })
          }, 400)
        }
      }

      // 推送房间信息
      socket.emit('room:update', { room: currentRoom.getRoomInfo() })
      io.to(currentRoomId).emit('room:update', { room: currentRoom.getRoomInfo() })
    } else {
      console.log(`[Auth] ${playerData.nickname}(${playerId}) 认证成功, socket=${socket.id}`)
    }

    socket.emit('player:auth:ok', authResult)
  })

  // ----------------------------------------------------------------
  // room:create — 创建房间
  // ----------------------------------------------------------------
  socket.on('room:create', (data) => {
    const playerId = socketToPlayer.get(socket.id)
    if (!playerId) { socket.emit('error', { message: '请先认证' }); return }

    const player = players.get(playerId)
    if (!player) { socket.emit('error', { message: '玩家不存在' }); return }

    leaveCurrentRoom(socket, playerId)

    const roomCode = generateRoomCode()
    const { smallBlind = 10, bigBlind = 20, maxPlayers = 6, startChips = 1000 } = data || {}

    const room = new GameRoom({ id: roomCode, ownerId: playerId, smallBlind, bigBlind, maxPlayers, defaultChips: startChips, io })
    // 注册回调：阶段切换 / 超时弃牌 / 发牌动画结束 后触发机器人行动
    room.onPhaseAdvanced = (r) => triggerBotActionIfNeeded(r)
    room.onActionTimeout = (r) => triggerBotActionIfNeeded(r)
    room.onDealAnimationDone = (r) => triggerBotActionIfNeeded(r)
    rooms.set(roomCode, room)
    room.addPlayer(player, socket)
    socket.join(roomCode)

    socket.emit('room:created', { room: room.getRoomInfo() })
    console.log(`[Room] ${player.nickname} 创建房间 ${roomCode}`)
  })

  // ----------------------------------------------------------------
  // room:join — 加入房间
  // ----------------------------------------------------------------
  socket.on('room:join', (data) => {
    const { roomId, player: clientPlayer } = data || {}
    let playerId = socketToPlayer.get(socket.id)

    let player = playerId ? players.get(playerId) : null
    if (!player && clientPlayer) {
      player = { ...clientPlayer, socketId: socket.id }
      players.set(clientPlayer.id, player)
      socketToPlayer.set(socket.id, clientPlayer.id)
      playerId = clientPlayer.id
    }

    if (!player) { socket.emit('error', { message: '请先认证' }); return }

    const normalId = roomId?.toUpperCase()
    const room = rooms.get(normalId)

    if (!room) { socket.emit('error', { message: '房间不存在，请先创建' }); return }

    // 游戏中/轮间等待 允许断线重连
    if (room.status === 'playing' || room.status === 'round_end') {
      const existingPlayer = room.players.find(p => p.id === playerId)
      if (!existingPlayer) { socket.emit('error', { message: '游戏已开始，无法加入' }); return }
    }

    if (room.isFull() && !room.players.find(p => p.id === playerId)) {
      socket.emit('error', { message: '房间已满' }); return
    }

    // 已在此房间（重连/页面切换）
    const existing = room.players.find(p => p.id === playerId)
    if (existing) {
      existing.socketId = socket.id
      existing.connected = true
      player.socketId = socket.id
      players.set(playerId, player)
      socket.join(normalId)
      // 清除断线弃牌计时器（玩家已重连）
      if (room.clearDisconnectTimer) {
        room.clearDisconnectTimer(playerId)
      }
      console.log(`[Room] ${player.nickname} 重连房间 ${normalId}`)
      // 通知其他玩家该玩家已重连
      socket.to(normalId).emit('player:reconnected', { playerId, nickname: player.nickname })
      io.to(normalId).emit('room:update', { room: room.getRoomInfo() })
      if ((room.status === 'playing' || room.status === 'round_end') && room.gameState) {
        socket.emit('game:state', room.getGameStateForPlayer(playerId))
        // 如果该玩家是当前行动者，重新启动行动超时计时器
        if (room.status === 'playing' && room.gameState.currentPlayerId === playerId) {
          room._startActionTimer()
        }
        // round_end 状态下：推送上一局结算结果和确认进度，让重连玩家恢复到等待下一局界面
        if (room.status === 'round_end' && room.lastRoundResult) {
          setTimeout(() => {
            socket.emit('game:result', room.lastRoundResult)
            const total = room.players.filter(p => p.isBot || p.connected !== false).length
            const ready = room.nextRoundReady ? room.nextRoundReady.size : 0
            socket.emit('game:next_round_ready', {
              ready,
              total,
              readyIds: room.nextRoundReady ? [...room.nextRoundReady] : []
            })
            // 广播更新后的进度给所有人
            io.to(normalId).emit('game:next_round_ready', {
              ready,
              total,
              readyIds: room.nextRoundReady ? [...room.nextRoundReady] : []
            })
          }, 300)
        }
      }
      return
    }

    // 新加入
    leaveCurrentRoom(socket, playerId)
    room.addPlayer(player, socket)
    socket.join(normalId)
    io.to(normalId).emit('room:update', { room: room.getRoomInfo() })
    console.log(`[Room] ${player.nickname} 加入房间 ${normalId}`)
  })

  // ----------------------------------------------------------------
  // room:leave — 离开房间
  // ----------------------------------------------------------------
  socket.on('room:leave', () => {
    const playerId = socketToPlayer.get(socket.id)
    if (playerId) leaveCurrentRoom(socket, playerId)
  })

  // ----------------------------------------------------------------
  // room:kick — 踢人
  // ----------------------------------------------------------------
  socket.on('room:kick', (data) => {
    const { targetPlayerId } = data || {}
    const playerId = socketToPlayer.get(socket.id)
    if (!playerId) return
    const room = findPlayerRoom(playerId)
    if (!room || room.ownerId !== playerId) return

    const kicked = room.removePlayer(targetPlayerId)
    if (kicked) {
      const targetSocket = getSocketByPlayerId(targetPlayerId)
      if (targetSocket) {
        targetSocket.emit('room:kicked', { message: '你被房主踢出了房间' })
        targetSocket.leave(room.id)
      }
      io.to(room.id).emit('room:update', { room: room.getRoomInfo() })
    }
  })

  // ----------------------------------------------------------------
  // room:add_bot — 房主添加机器人
  // ----------------------------------------------------------------
  socket.on('room:add_bot', (data) => {
    const { level = 'easy' } = data || {}
    const playerId = socketToPlayer.get(socket.id)
    if (!playerId) { socket.emit('error', { message: '请先认证' }); return }

    const room = findPlayerRoom(playerId)
    if (!room) { socket.emit('error', { message: '未在任何房间' }); return }
    if (room.ownerId !== playerId) { socket.emit('error', { message: '只有房主可以添加机器人' }); return }
    if (room.status !== 'waiting') { socket.emit('error', { message: '游戏进行中无法添加机器人' }); return }
    if (room.isFull()) { socket.emit('error', { message: '房间已满' }); return }

    // 生成机器人 id 和随机名字/头像
    const botId = 'bot_' + uuidv4().replace(/-/g, '').slice(0, 8)
    const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
    const botAvatar = BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)]

    const levelNames = { easy: '简单', medium: '中等', hard: '困难' }
    const botNickname = `${botName}(${levelNames[level] || level})`

    const botData = {
      id: botId,
      nickname: botNickname,
      avatar: botAvatar,
      chips: room.defaultChips, // 初始筹码与房间配置一致（startGame 时会统一重置）
      isBot: true,
      botLevel: level
    }

    // 创建 BotPlayer 实例
    const bot = new BotPlayer({ id: botId, nickname: botNickname, avatar: botAvatar, level })
    bots.set(botId, bot)

    // 以 null socket 加入房间（机器人无 socket）
    room.addPlayer(botData, null)

    io.to(room.id).emit('room:update', { room: room.getRoomInfo() })
    console.log(`[Bot] 添加机器人 ${botNickname}(${botId})，难度: ${level}，房间: ${room.id}`)
  })

  // ----------------------------------------------------------------
  // room:remove_bot — 房主移除机器人
  // ----------------------------------------------------------------
  socket.on('room:remove_bot', (data) => {
    const { botId } = data || {}
    const playerId = socketToPlayer.get(socket.id)
    if (!playerId) { socket.emit('error', { message: '请先认证' }); return }

    const room = findPlayerRoom(playerId)
    if (!room) { socket.emit('error', { message: '未在任何房间' }); return }
    if (room.ownerId !== playerId) { socket.emit('error', { message: '只有房主可以移除机器人' }); return }
    if (!botId || !botId.startsWith('bot_')) { socket.emit('error', { message: '无效的机器人ID' }); return }

    // 清除机器人思考计时器
    if (botThinkingTimers.has(botId)) {
      clearTimeout(botThinkingTimers.get(botId))
      botThinkingTimers.delete(botId)
    }

    const removed = room.removePlayer(botId)
    if (removed) {
      bots.delete(botId)
      io.to(room.id).emit('room:update', { room: room.getRoomInfo() })
      console.log(`[Bot] 移除机器人 ${botId}，房间: ${room.id}`)
    } else {
      socket.emit('error', { message: '未找到该机器人' })
    }
  })

  // ----------------------------------------------------------------
  // room:start — 房主开始游戏（首局）
  // ----------------------------------------------------------------
  socket.on('room:start', ({ startChips } = {}) => {
    const playerId = socketToPlayer.get(socket.id)
    if (!playerId) { socket.emit('error', { message: '未认证，请刷新重试' }); return }

    const room = findPlayerRoom(playerId)
    if (!room) { socket.emit('error', { message: '未在任何房间' }); return }
    if (room.ownerId !== playerId) { socket.emit('error', { message: '只有房主可以开始游戏' }); return }
    if (room.players.length < 2) { socket.emit('error', { message: '至少需要2名玩家才能开始' }); return }
    if (room.status !== 'waiting') { socket.emit('error', { message: '游戏已经开始了' }); return }

    // 检查所有非机器人玩家在线状态
    const offlinePlayers = room.players.filter(p => !p.isBot && p.connected === false)
    if (offlinePlayers.length > 0) {
      const names = offlinePlayers.map(p => p.nickname).join('、')
      socket.emit('error', { message: `${names} 当前不在线，所有玩家在线才能开始游戏` })
      return
    }

    const roomId = room.id
    console.log(`[Game] 房间 ${roomId} 即将开始，玩家: ${room.players.map(p => p.nickname).join(', ')}`)

    // 重置所有机器人每局状态
    for (const p of room.players) {
      if (p.isBot) {
        const bot = bots.get(p.id)
        if (bot && bot.resetRound) bot.resetRound()
      }
    }

    // 通知所有非机器人玩家跳转到游戏页面
    io.to(roomId).emit('game:ready', { roomId })

    // 等待前端跳转+挂载完成后再发牌
    setTimeout(() => {
      if (room.players.length < 2) {
        io.to(roomId).emit('error', { message: '玩家不足，游戏取消' })
        return
      }
      try {
        room.startGame({ startChips, isFirstRound: true })
        console.log(`[Game] 房间 ${roomId} 首局开始，初始筹码: ${startChips || '默认'}`)
        // 机器人行动将在发牌动画结束后由 onDealAnimationDone 回调触发
      } catch (err) {
        console.error(`[Game] 房间 ${roomId} 开始失败: ${err.message}`)
        io.to(roomId).emit('error', { message: err.message })
      }
    }, 800)
  })

  // ----------------------------------------------------------------
  // game:request_state — 客户端主动拉取游戏状态
  // ----------------------------------------------------------------
  socket.on('game:request_state', () => {
    const playerId = socketToPlayer.get(socket.id)
    if (!playerId) return

    const room = findPlayerRoom(playerId)
    if (!room) return

    if ((room.status === 'playing' || room.status === 'round_end') && room.gameState) {
      socket.emit('game:state', room.getGameStateForPlayer(playerId))
      console.log(`[Game] 推送状态给 ${playerId}（主动请求）`)
    } else {
      socket.emit('room:update', { room: room.getRoomInfo() })
    }
  })

  // ----------------------------------------------------------------
  // player:action — 玩家行动
  // ----------------------------------------------------------------
  socket.on('player:action', (data) => {
    const { type, amount } = data || {}
    const playerId = socketToPlayer.get(socket.id)
    if (!playerId) return

    const room = findPlayerRoom(playerId)
    if (!room || room.status !== 'playing') {
      socket.emit('error', { message: '游戏未在进行中' })
      return
    }

    try {
      room.handlePlayerAction(playerId, type, amount)
      // 行动后检查是否轮到机器人
      triggerBotActionIfNeeded(room)
    } catch (err) {
      console.error(`[Action] ${playerId} 行动失败: ${err.message}`)
      socket.emit('error', { message: err.message })
    }
  })

  // ----------------------------------------------------------------
  // game:end — 房主强制结束游戏
  // ----------------------------------------------------------------
  socket.on('game:end', () => {
    const playerId = socketToPlayer.get(socket.id)
    if (!playerId) return

    const room = findPlayerRoom(playerId)
    if (!room) return
    if (room.ownerId !== playerId) {
      socket.emit('error', { message: '只有房主可以结束游戏' })
      return
    }

    const finalPlayers = buildFinalResult(room)
    clearAllBotTimers(room)
    room.clearActionTimer()
    room.resetToWaiting()

    io.to(room.id).emit('game:final_result', {
      players: finalPlayers,
      reason: '房主结束了游戏'
    })
    io.to(room.id).emit('room:update', { room: room.getRoomInfo() })
    console.log(`[Game] 房间 ${room.id} 被房主强制结束`)
  })

  // ----------------------------------------------------------------
  // game:next_round — 玩家确认进入下一轮
  // ----------------------------------------------------------------
  socket.on('game:next_round', () => {
    const playerId = socketToPlayer.get(socket.id)
    if (!playerId) return

    const room = findPlayerRoom(playerId)
    if (!room) return
    if (room.status !== 'round_end') return

    // 记录已确认的玩家
    if (!room.nextRoundReady) room.nextRoundReady = new Set()
    room.nextRoundReady.add(playerId)

    // 机器人自动确认（不需要等待）
    for (const p of room.players) {
      if (p.isBot) {
        room.nextRoundReady.add(p.id)
      }
    }

    // 掉线玩家自动视为已确认（不卡其他人）
    for (const p of room.players) {
      if (!p.isBot && p.connected === false) {
        room.nextRoundReady.add(p.id)
      }
    }

    // total 只统计在线的真人玩家 + 机器人（掉线玩家已自动确认，不计入等待总数）
    const onlinePlayers = room.players.filter(p => p.isBot || p.connected !== false)
    const total = onlinePlayers.length
    const ready = room.nextRoundReady.size

    // 广播等待进度
    io.to(room.id).emit('game:next_round_ready', {
      ready,
      total,
      readyIds: [...room.nextRoundReady]
    })

    // 全员就绪（所有玩家都已确认，包括掉线后重连的玩家）
    if (ready >= total) {
      room.nextRoundReady = null

      // 检查是否有人筹码耗尽 → 游戏结束
      const bustedPlayers = room.players.filter(p => p.chips <= 0)
      if (bustedPlayers.length > 0) {
        // 清除破产机器人
        for (const p of bustedPlayers) {
          if (p.isBot) {
            bots.delete(p.id)
            if (botThinkingTimers.has(p.id)) {
              clearTimeout(botThinkingTimers.get(p.id))
              botThinkingTimers.delete(p.id)
            }
          }
        }

        const finalPlayers = buildFinalResult(room)
        room.resetToWaiting()

        io.to(room.id).emit('game:final_result', {
          players: finalPlayers,
          reason: `${bustedPlayers.map(p => p.nickname).join('、')} 筹码耗尽，游戏结束`
        })
        io.to(room.id).emit('room:update', { room: room.getRoomInfo() })
        console.log(`[Game] 房间 ${room.id} 有人破产，游戏自动结束`)
        return
      }

      // 检查是否只剩不足2人
      const alivePlayers = room.players.filter(p => p.chips > 0)
      if (alivePlayers.length < 2) {
        const finalPlayers = buildFinalResult(room)
        room.resetToWaiting()

        io.to(room.id).emit('game:final_result', {
          players: finalPlayers,
          reason: '存活玩家不足，游戏结束'
        })
        io.to(room.id).emit('room:update', { room: room.getRoomInfo() })
        return
      }

      // 重置所有机器人每局状态
      for (const p of room.players) {
        if (p.isBot) {
          const bot = bots.get(p.id)
          if (bot && bot.resetRound) bot.resetRound()
        }
      }

      // 开始下一轮
      try {
        room.startGame({ isFirstRound: false })
        console.log(`[Game] 房间 ${room.id} 开始新一轮`)
        // 机器人行动将在发牌动画结束后由 onDealAnimationDone 回调触发
      } catch (err) {
        console.error(`[Game] 开始新一轮失败: ${err.message}`)
        io.to(room.id).emit('error', { message: err.message })
      }
    }
  })

  // ----------------------------------------------------------------
  // disconnect
  // ----------------------------------------------------------------
  socket.on('disconnect', () => {
    const playerId = socketToPlayer.get(socket.id)
    if (playerId) {
      console.log(`[Socket] ${playerId} 断线`)
      handleDisconnect(socket, playerId)
      socketToPlayer.delete(socket.id)
    }
  })
})

// ====== 僵尸连接清理（每 30 秒检查一次） ======
const ZOMBIE_CHECK_INTERVAL = 30000  // 30 秒检查一次
const ZOMBIE_TIMEOUT = 60000         // 60 秒无心跳视为僵尸连接

setInterval(() => {
  const now = Date.now()
  for (const [socketId, socket] of io.sockets.sockets) {
    if (socket.lastHeartbeat && (now - socket.lastHeartbeat > ZOMBIE_TIMEOUT)) {
      const playerId = socketToPlayer.get(socketId)
      if (playerId) {
        console.log(`[Heartbeat] 僵尸连接超时，主动断开: ${playerId} (socket=${socketId})，最后心跳: ${Math.round((now - socket.lastHeartbeat) / 1000)}s 前`)
        socket.disconnect(true)
      }
    }
  }
}, ZOMBIE_CHECK_INTERVAL)

// ====== 内存清理（每小时运行一次） ======
const MEMORY_CLEANUP_INTERVAL = 60 * 60 * 1000   // 1 小时
const PLAYER_INACTIVE_TTL     = 2 * 60 * 60 * 1000  // 玩家 2 小时不活跃则清理
const ROOM_INACTIVE_TTL       = 2 * 60 * 60 * 1000  // 空房间 2 小时不活跃则清理

setInterval(() => {
  const now = Date.now()
  let cleanedPlayers = 0
  let cleanedRooms = 0

  // 清理长期不活跃的空房间
  for (const [code, room] of rooms) {
    if (room.players.length === 0) {
      const lastActive = room.lastActiveAt || room.createdAt || 0
      if (now - lastActive > ROOM_INACTIVE_TTL) {
        rooms.delete(code)
        cleanedRooms++
      }
    }
  }

  // 清理长期不活跃且不在任何房间的玩家
  // 先统计所有在房间中的玩家 ID
  const activePids = new Set()
  for (const room of rooms.values()) {
    for (const p of room.players) activePids.add(p.id)
  }
  // 再清理 players Map 里既不在线、也不在房间、且超过 TTL 的玩家
  for (const [pid, player] of players) {
    if (activePids.has(pid)) continue                       // 在房间里，跳过
    if (socketToPlayer.has(pid)) continue                    // 仍有 socket，跳过
    const lastActive = player.lastActiveAt || player.createdAt || 0
    if (now - lastActive > PLAYER_INACTIVE_TTL) {
      players.delete(pid)
      cleanedPlayers++
    }
  }

  if (cleanedPlayers > 0 || cleanedRooms > 0) {
    console.log(`[Cleanup] 内存清理完成：清除 ${cleanedPlayers} 个闲置玩家，${cleanedRooms} 个空房间（当前: ${players.size} 玩家，${rooms.size} 房间）`)
  }
}, MEMORY_CLEANUP_INTERVAL)

// ====== 工具函数 ======

/**
 * 构建游戏最终结果数组（房主结束 / 破产 / 人数不足时统一使用）
 * @param {GameRoom} room
 * @returns {Array}
 */
function buildFinalResult(room) {
  const gs = room.gameState
  return room.players.map(p => {
    const gp = gs ? gs.players.find(gpl => gpl.id === p.id) : null
    return {
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      chips: gp ? gp.chips : p.chips,
      isBot: p.isBot || false
    }
  }).sort((a, b) => b.chips - a.chips)
}

/**
 * 清除房间内所有机器人的思考计时器
 * @param {GameRoom} room
 */
function clearAllBotTimers(room) {
  for (const p of room.players) {
    if (p.isBot && botThinkingTimers.has(p.id)) {
      clearTimeout(botThinkingTimers.get(p.id))
      botThinkingTimers.delete(p.id)
    }
  }
}

function leaveCurrentRoom(socket, playerId) {
  for (const [code, room] of rooms) {
    const idx = room.players.findIndex(p => p.id === playerId)
    if (idx !== -1) {
      const wasOwner = room.ownerId === playerId
      // 清除断线缓冲计时器
      if (room.clearDisconnectTimer) {
        room.clearDisconnectTimer(playerId)
      }
      room.removePlayer(playerId)
      socket.leave(code)
      if (room.players.length === 0) {
        rooms.delete(code)
        console.log(`[Room] 房间 ${code} 已删除（无人）`)
      } else if (wasOwner) {
        rooms.delete(code)
        io.to(code).emit('room:disbanded', { message: '房主已离开，房间已解散' })
        console.log(`[Room] 房间 ${code} 因房主离开而解散`)
      } else {
        io.to(code).emit('room:update', { room: room.getRoomInfo() })
        if (room.status === 'playing') {
          room.handlePlayerDisconnect(playerId)
        }
      }
      break
    }
  }
}

function handleDisconnect(socket, playerId) {
  for (const [code, room] of rooms) {
    const p = room.players.find(pl => pl.id === playerId)
    if (p) {
      p.connected = false
      const wasOwner = room.ownerId === playerId
      if (room.status === 'playing' || room.status === 'round_end') {
        io.to(code).emit('player:disconnected', { playerId, nickname: p.nickname })
        if (room.status === 'playing') {
          // 如果当前轮到该玩家行动，暂停行动超时计时器（让断线缓冲计时器接管）
          if (room.gameState && room.gameState.currentPlayerId === playerId) {
            room.clearActionTimer()
          }
          // 给断线玩家一个缓冲期（15秒），如果在此期间重连则不弃牌
          room.setDisconnectTimer(playerId, () => {
            // 缓冲期到了还没重连，自动弃牌
            const stillDisconnected = room.players.find(pl => pl.id === playerId)
            if (stillDisconnected && stillDisconnected.connected === false) {
              room.handlePlayerDisconnect(playerId)
              // 弃牌后检查是否轮到机器人
              triggerBotActionIfNeeded(room)
            }
          })
        }
        // round_end 状态下断线：掉线玩家自动视为已确认，广播更新后的进度
        if (room.status === 'round_end') {
          // 掉线玩家自动加入已确认集合
          if (!room.nextRoundReady) room.nextRoundReady = new Set()
          room.nextRoundReady.add(playerId)
          // 机器人也自动确认
          for (const bp of room.players) {
            if (bp.isBot) room.nextRoundReady.add(bp.id)
          }
          const total = room.players.filter(pl => pl.isBot || pl.connected !== false).length
          const ready = room.nextRoundReady.size
          io.to(code).emit('game:next_round_ready', { ready, total, readyIds: [...room.nextRoundReady] })
        }
      } else {
        // 等待室：60s 重连机会（延长以给玩家更多重连时间）
        setTimeout(() => {
          const still = room.players.find(pl => pl.id === playerId)
          if (still && !still.connected) {
            room.removePlayer(playerId)
            if (room.players.length === 0) {
              rooms.delete(code)
            } else if (wasOwner) {
              rooms.delete(code)
              io.to(code).emit('room:disbanded', { message: '房主已断线，房间已解散' })
              console.log(`[Room] 房间 ${code} 因房主断线而解散`)
            } else {
              io.to(code).emit('room:update', { room: room.getRoomInfo() })
            }
          }
        }, 60000)
      }
      break
    }
  }
}

function findPlayerRoom(playerId) {
  for (const [, room] of rooms) {
    if (room.players.find(p => p.id === playerId)) return room
  }
  return null
}

function getSocketByPlayerId(playerId) {
  const player = players.get(playerId)
  if (!player || !player.socketId) return null
  return io.sockets.sockets.get(player.socketId)
}

// ====== 启动 ======
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`🃏 德扑小局后端启动: http://localhost:${PORT}`)
})

module.exports = { app, io, rooms, players }
