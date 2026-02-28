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
const { generateRoomCode } = require('./src/utils')

const app = express()
const server = http.createServer(app)

// ====== Socket.IO 配置 ======
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

app.use(cors())
app.use(express.json())

// ====== 内存存储 ======
// players: Map<playerId, playerData>
const players = new Map()
// rooms: Map<roomCode, GameRoom>
const rooms = new Map()
// socketToPlayer: Map<socketId, playerId>
const socketToPlayer = new Map()

// ====== REST API ======

/**
 * 健康检查
 */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, rooms: rooms.size, players: players.size })
})

/**
 * 玩家登录
 * POST /api/login
 * body: { nickname, avatar, chips }
 * 返回: { player, token }
 *
 * 注意：前端 LoginPage.vue 目前在本地生成 id，
 * 但为了多人联机，后端统一分配 id 和 token。
 * 前端若已有 token（localStorage 存储），直接走 socket 认证即可。
 */
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
    createdAt: Date.now()
  }

  players.set(playerId, player)

  res.json({
    player,
    token: playerId  // token 就是 playerId，前端 setPlayer 时 token = data.id
  })
})

/**
 * 获取房间列表（大厅展示）
 * GET /api/rooms
 */
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

  /**
   * 玩家通过 socket 认证
   * 前端连接 socket 后需先发送 auth 事件
   * emit: player:auth { playerId, player }
   * on:   player:auth:ok { player }
   */
  socket.on('player:auth', (data) => {
    const { playerId, player: clientPlayer } = data

    // 如果后端有记录就用后端数据，否则接受客户端数据（前端本地生成的 id）
    let playerData = players.get(playerId)
    if (!playerData && clientPlayer) {
      // 前端 LoginPage.vue 本地生成的玩家，接受并存储
      playerData = { ...clientPlayer }
      players.set(playerId, playerData)
    }

    if (!playerData) {
      socket.emit('error', { message: '玩家未找到，请重新登录' })
      return
    }

    // 绑定 socket <-> playerId
    socketToPlayer.set(socket.id, playerId)
    playerData.socketId = socket.id
    players.set(playerId, playerData)

    socket.emit('player:auth:ok', { player: playerData })
    console.log(`[Auth] 玩家 ${playerData.nickname}(${playerId}) 认证成功`)
  })

  /**
   * 创建房间
   * emit: room:create { smallBlind, bigBlind, maxPlayers }
   * on:   room:created { room } | error
   *
   * 前端 LobbyPage.vue handleCreate() → router.push(`/room/${roomId}`)
   * 房间 ID 就是 6 位邀请码
   */
  socket.on('room:create', (data) => {
    const playerId = socketToPlayer.get(socket.id)
    if (!playerId) {
      socket.emit('error', { message: '请先认证' })
      return
    }

    const player = players.get(playerId)
    if (!player) {
      socket.emit('error', { message: '玩家不存在' })
      return
    }

    // 如果已在某个房间，先离开
    leaveCurrentRoom(socket, playerId)

    const roomCode = generateRoomCode()
    const { smallBlind = 10, bigBlind = 20, maxPlayers = 6 } = data || {}

    const room = new GameRoom({
      id: roomCode,
      ownerId: playerId,
      smallBlind,
      bigBlind,
      maxPlayers,
      io
    })

    rooms.set(roomCode, room)
    room.addPlayer(player, socket)

    socket.join(roomCode)

    const roomInfo = room.getRoomInfo()
    socket.emit('room:created', { room: roomInfo })

    console.log(`[Room] ${player.nickname} 创建了房间 ${roomCode}`)
  })

  /**
   * 加入房间（by 房间码）
   * emit: room:join { roomId, player }
   * on:   room:update { room } | error
   *
   * 前端 RoomPage.vue onMounted 注释里有 socket.emit('room:join', ...)
   */
  socket.on('room:join', (data) => {
    const { roomId, player: clientPlayer } = data || {}
    const playerId = socketToPlayer.get(socket.id)

    // 如果 socket 还没认证，用客户端传来的 player 数据
    let player = playerId ? players.get(playerId) : null
    if (!player && clientPlayer) {
      player = clientPlayer
      players.set(clientPlayer.id, clientPlayer)
      socketToPlayer.set(socket.id, clientPlayer.id)
      player.socketId = socket.id
    }

    if (!player) {
      socket.emit('error', { message: '请先认证' })
      return
    }

    const effectivePlayerId = player.id
    const room = rooms.get(roomId?.toUpperCase())

    if (!room) {
      // 房间不存在，可能是第一个进入的人（房主）需要创建
      // 但按标准流程，create 先于 join，这里返回错误
      socket.emit('error', { message: '房间不存在，请先创建' })
      return
    }

    if (room.isFull()) {
      socket.emit('error', { message: '房间已满' })
      return
    }

    if (room.status === 'playing') {
      socket.emit('error', { message: '游戏已开始，无法加入' })
      return
    }

    // 如果已在这个房间（断线重连），更新 socket
    const existingPlayer = room.players.find(p => p.id === effectivePlayerId)
    if (existingPlayer) {
      const oldSocketId = existingPlayer.socketId
      existingPlayer.socketId = socket.id
      existingPlayer.connected = true
      socket.join(roomId.toUpperCase())
      console.log(`[Room] ${player.nickname} 断线重连房间 ${roomId}`)
      // 发送当前房间/游戏状态
      socket.emit('room:update', { room: room.getRoomInfo() })
      if (room.status === 'playing' && room.gameState) {
        socket.emit('game:state', room.getGameStateForPlayer(effectivePlayerId))
      }
      return
    }

    // 如果在别的房间，先离开
    leaveCurrentRoom(socket, effectivePlayerId)

    room.addPlayer(player, socket)
    socket.join(roomId.toUpperCase())

    // 广播房间更新给所有人
    io.to(roomId.toUpperCase()).emit('room:update', { room: room.getRoomInfo() })

    console.log(`[Room] ${player.nickname} 加入房间 ${roomId}`)
  })

  /**
   * 离开房间
   * emit: room:leave
   * on:   room:update 广播给其他人
   */
  socket.on('room:leave', () => {
    const playerId = socketToPlayer.get(socket.id)
    if (playerId) {
      leaveCurrentRoom(socket, playerId)
    }
  })

  /**
   * 房主踢人
   * emit: room:kick { targetPlayerId }
   * on:   room:kicked { playerId } 广播
   */
  socket.on('room:kick', (data) => {
    const { targetPlayerId } = data || {}
    const playerId = socketToPlayer.get(socket.id)
    if (!playerId) return

    // 找到玩家所在房间
    const room = findPlayerRoom(playerId)
    if (!room) return

    if (room.ownerId !== playerId) {
      socket.emit('error', { message: '只有房主可以踢人' })
      return
    }

    const kicked = room.removePlayer(targetPlayerId)
    if (kicked) {
      // 通知被踢的玩家
      const targetSocket = getSocketByPlayerId(targetPlayerId)
      if (targetSocket) {
        targetSocket.emit('room:kicked', { message: '你被房主踢出了房间' })
        targetSocket.leave(room.id)
      }
      // 广播房间更新
      io.to(room.id).emit('room:update', { room: room.getRoomInfo() })
      console.log(`[Room] ${playerId} 踢出了 ${targetPlayerId}`)
    }
  })

  /**
   * 房主开始游戏
   * emit: room:start
   * on:   game:start { gameState } 广播给所有人
   *
   * 前端 RoomPage.vue handleStart() → socket.emit('room:start')
   */
  socket.on('room:start', () => {
    const playerId = socketToPlayer.get(socket.id)
    if (!playerId) return

    const room = findPlayerRoom(playerId)
    if (!room) {
      socket.emit('error', { message: '未在任何房间' })
      return
    }

    if (room.ownerId !== playerId) {
      socket.emit('error', { message: '只有房主可以开始游戏' })
      return
    }

    if (room.players.length < 2) {
      socket.emit('error', { message: '至少需要2名玩家才能开始' })
      return
    }

    if (room.status === 'playing') {
      socket.emit('error', { message: '游戏已经开始了' })
      return
    }

    try {
      room.startGame()
      // game:start 和首个 game:state 在 GameRoom 内部通过 io 广播
      console.log(`[Game] 房间 ${room.id} 游戏开始`)
    } catch (err) {
      socket.emit('error', { message: err.message })
    }
  })

  /**
   * 玩家行动
   * emit: player:action { type: 'fold'|'call'|'check'|'raise', amount? }
   * on:   game:state 更新广播
   *
   * 前端 GamePage.vue doAction() 注释里 socket.emit('player:action', { type, amount })
   */
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
    } catch (err) {
      socket.emit('error', { message: err.message })
    }
  })

  /**
   * 请求下一局
   * emit: game:next_round
   * on:   room:update | game:start
   */
  socket.on('game:next_round', () => {
    const playerId = socketToPlayer.get(socket.id)
    if (!playerId) return

    const room = findPlayerRoom(playerId)
    if (!room) return

    // 任意玩家都可以触发下一局（或者只允许房主，根据需求）
    if (room.status === 'finished' || room.status === 'waiting') {
      // 重置为等待状态
      room.resetToWaiting()
      io.to(room.id).emit('room:update', { room: room.getRoomInfo() })
    }
  })

  /**
   * 断线处理
   */
  socket.on('disconnect', () => {
    const playerId = socketToPlayer.get(socket.id)
    if (playerId) {
      console.log(`[Socket] 玩家 ${playerId} 断线`)
      handleDisconnect(socket, playerId)
      socketToPlayer.delete(socket.id)
    }
  })
})

// ====== 工具函数 ======

/**
 * 离开当前所在房间
 */
function leaveCurrentRoom(socket, playerId) {
  for (const [code, room] of rooms) {
    const idx = room.players.findIndex(p => p.id === playerId)
    if (idx !== -1) {
      room.removePlayer(playerId)
      socket.leave(code)

      if (room.players.length === 0) {
        // 房间空了，删除
        rooms.delete(code)
        console.log(`[Room] 房间 ${code} 已删除（无人）`)
      } else {
        // 广播房间更新
        io.to(code).emit('room:update', { room: room.getRoomInfo() })
        // 如果游戏进行中，处理断线
        if (room.status === 'playing') {
          room.handlePlayerDisconnect(playerId)
        }
      }
      break
    }
  }
}

/**
 * 处理断线（不移除玩家，标记为断线）
 */
function handleDisconnect(socket, playerId) {
  for (const [code, room] of rooms) {
    const p = room.players.find(pl => pl.id === playerId)
    if (p) {
      p.connected = false
      if (room.status === 'playing') {
        // 游戏中断线，通知其他玩家
        io.to(code).emit('player:disconnected', { playerId, nickname: p.nickname })
        // 如果是当前行动玩家，自动 fold
        room.handlePlayerDisconnect(playerId)
      } else {
        // 等待室断线，短暂等待后移除
        setTimeout(() => {
          const still = room.players.find(pl => pl.id === playerId)
          if (still && !still.connected) {
            room.removePlayer(playerId)
            if (room.players.length === 0) {
              rooms.delete(code)
            } else {
              io.to(code).emit('room:update', { room: room.getRoomInfo() })
            }
          }
        }, 30000) // 30秒后移除
      }
      break
    }
  }
}

/**
 * 找到玩家所在的房间
 */
function findPlayerRoom(playerId) {
  for (const [, room] of rooms) {
    if (room.players.find(p => p.id === playerId)) {
      return room
    }
  }
  return null
}

/**
 * 通过 playerId 获取 socket
 */
function getSocketByPlayerId(playerId) {
  const player = players.get(playerId)
  if (!player || !player.socketId) return null
  return io.sockets.sockets.get(player.socketId)
}

// ====== 启动服务器 ======
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`🃏 德扑小局后端启动成功: http://localhost:${PORT}`)
  console.log(`📡 Socket.IO 服务就绪`)
})

module.exports = { app, io, rooms, players }
