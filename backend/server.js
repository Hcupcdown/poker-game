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
    createdAt: Date.now()
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
    players.set(playerId, playerData)

    socket.emit('player:auth:ok', { player: playerData })
    console.log(`[Auth] ${playerData.nickname}(${playerId}) 认证成功, socket=${socket.id}`)
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
    const { smallBlind = 10, bigBlind = 20, maxPlayers = 6 } = data || {}

    const room = new GameRoom({ id: roomCode, ownerId: playerId, smallBlind, bigBlind, maxPlayers, io })
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
      console.log(`[Room] ${player.nickname} 重连房间 ${normalId}`)
      socket.emit('room:update', { room: room.getRoomInfo() })
      if ((room.status === 'playing' || room.status === 'round_end') && room.gameState) {
        socket.emit('game:state', room.getGameStateForPlayer(playerId))
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

    const roomId = room.id
    console.log(`[Game] 房间 ${roomId} 即将开始，玩家: ${room.players.map(p => p.nickname).join(', ')}`)

    // 通知所有人跳转到游戏页面
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

    // 收集所有玩家最终筹码
    const gs = room.gameState
    const finalPlayers = room.players.map(p => {
      const gp = gs ? gs.players.find(gpl => gpl.id === p.id) : null
      return {
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        chips: gp ? gp.chips : p.chips
      }
    }).sort((a, b) => b.chips - a.chips)

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

    const connectedPlayers = room.players.filter(p => p.connected !== false)
    const total = connectedPlayers.length
    const ready = room.nextRoundReady.size

    // 广播等待进度
    io.to(room.id).emit('game:next_round_ready', {
      ready,
      total,
      readyIds: [...room.nextRoundReady]
    })

    // 全员就绪
    if (ready >= total) {
      room.nextRoundReady = null

      // 检查是否有人筹码耗尽 → 游戏结束
      const bustedPlayers = room.players.filter(p => p.chips <= 0)
      if (bustedPlayers.length > 0) {
        const finalPlayers = room.players.map(p => ({
          id: p.id,
          nickname: p.nickname,
          avatar: p.avatar,
          chips: p.chips
        })).sort((a, b) => b.chips - a.chips)

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
        const finalPlayers = room.players.map(p => ({
          id: p.id,
          nickname: p.nickname,
          avatar: p.avatar,
          chips: p.chips
        })).sort((a, b) => b.chips - a.chips)

        room.resetToWaiting()

        io.to(room.id).emit('game:final_result', {
          players: finalPlayers,
          reason: '存活玩家不足，游戏结束'
        })
        io.to(room.id).emit('room:update', { room: room.getRoomInfo() })
        return
      }

      // 开始下一轮
      try {
        room.startGame({ isFirstRound: false })
        console.log(`[Game] 房间 ${room.id} 开始新一轮`)
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

// ====== 工具函数 ======

function leaveCurrentRoom(socket, playerId) {
  for (const [code, room] of rooms) {
    const idx = room.players.findIndex(p => p.id === playerId)
    if (idx !== -1) {
      const wasOwner = room.ownerId === playerId
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
          room.handlePlayerDisconnect(playerId)
        }
        // round_end 状态下断线：检查是否所有在线玩家都已确认
        if (room.status === 'round_end' && room.nextRoundReady) {
          const connectedPlayers = room.players.filter(pl => pl.connected !== false)
          const total = connectedPlayers.length
          const ready = [...room.nextRoundReady].filter(id => connectedPlayers.some(pl => pl.id === id)).length
          if (ready >= total && total >= 2) {
            // 触发下一轮检查（模拟全员就绪）
            io.to(code).emit('game:next_round_ready', { ready, total, readyIds: [...room.nextRoundReady] })
          }
        }
      } else {
        // 等待室：30s 重连机会
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
        }, 30000)
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
