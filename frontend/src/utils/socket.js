/**
 * socket.js - Socket.IO 单例
 * 整个应用共享一个 socket 连接
 * 包含自定义心跳机制，优化连接稳定性
 */
import { io } from 'socket.io-client'
import { ref } from 'vue'

// 开发时走 vite proxy，生产时同源
const URL = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin

let socket = null
let authSent = false   // 防止重复发 auth
let currentPlayer = null // 保存当前玩家信息，供重连时使用

// ====== 心跳机制 ======
const HEARTBEAT_INTERVAL = 8000   // 每 8 秒发送一次心跳
const HEARTBEAT_TIMEOUT = 15000   // 15 秒未收到心跳响应视为连接异常
let heartbeatTimer = null
let heartbeatTimeoutTimer = null
let lastHeartbeatAck = 0          // 最后一次收到心跳响应的时间
let missedHeartbeats = 0          // 连续丢失的心跳次数
const MAX_MISSED_HEARTBEATS = 3   // 允许连续丢失的最大心跳次数

// 导出连接状态（响应式），供组件使用
export const connectionStatus = ref('disconnected') // 'connected' | 'unstable' | 'disconnected' | 'reconnecting'
export const networkLatency = ref(0) // 网络延迟（ms）

function startHeartbeat() {
  stopHeartbeat()
  missedHeartbeats = 0
  lastHeartbeatAck = Date.now()

  heartbeatTimer = setInterval(() => {
    if (!socket || !socket.connected) return

    const sendTime = Date.now()
    missedHeartbeats++

    // 使用回调方式发送心跳（更可靠）
    socket.emit('heartbeat', { clientTime: sendTime }, (response) => {
      // 收到心跳响应
      missedHeartbeats = 0
      lastHeartbeatAck = Date.now()
      networkLatency.value = Date.now() - sendTime

      // 更新连接状态
      if (networkLatency.value > 500) {
        connectionStatus.value = 'unstable'
      } else {
        connectionStatus.value = 'connected'
      }

      // 清除超时计时器
      if (heartbeatTimeoutTimer) {
        clearTimeout(heartbeatTimeoutTimer)
        heartbeatTimeoutTimer = null
      }
    })

    // 设置心跳超时检测
    heartbeatTimeoutTimer = setTimeout(() => {
      if (missedHeartbeats >= MAX_MISSED_HEARTBEATS) {
        console.warn(`[Heartbeat] 连续 ${missedHeartbeats} 次心跳超时，连接可能已断开`)
        connectionStatus.value = 'unstable'

        // 尝试主动重连
        if (socket && socket.connected) {
          console.log('[Heartbeat] 尝试主动断开并重连...')
          socket.disconnect()
          setTimeout(() => {
            if (socket && !socket.connected) {
              socket.connect()
            }
          }, 1000)
        }
      } else {
        connectionStatus.value = 'unstable'
      }
    }, HEARTBEAT_TIMEOUT)
  }, HEARTBEAT_INTERVAL)
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (heartbeatTimeoutTimer) {
    clearTimeout(heartbeatTimeoutTimer)
    heartbeatTimeoutTimer = null
  }
  missedHeartbeats = 0
}

export function getSocket() {
  if (!socket) {
    socket = io(URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity, // 无限重连
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    socket.on('disconnect', (reason) => {
      authSent = false  // 断线后重置，重连时重新 auth
      connectionStatus.value = 'disconnected'
      stopHeartbeat()
      console.log(`[Socket] 断线: ${reason}`)
    })

    // 重连成功后自动重新认证 & 启动心跳
    socket.on('connect', () => {
      console.log(`[Socket] 已连接, id=${socket.id}`)
      connectionStatus.value = 'connected'
      startHeartbeat()

      if (currentPlayer && !authSent) {
        authSent = true
        // 使用 JWT token 认证
        const token = currentPlayer._token || currentPlayer.id
        socket.emit('player:auth', { token })
        console.log(`[Socket] 重连后自动认证: ${currentPlayer.nickname}`)
      }
    })

    // 监听重连中状态
    socket.io.on('reconnect_attempt', (attempt) => {
      connectionStatus.value = 'reconnecting'
      console.log(`[Socket] 正在重连... 第 ${attempt} 次尝试`)
    })

    socket.io.on('reconnect', (attempt) => {
      console.log(`[Socket] 重连成功（第 ${attempt} 次）`)
      connectionStatus.value = 'connected'
    })

    socket.io.on('reconnect_error', (err) => {
      console.warn(`[Socket] 重连失败: ${err.message}`)
    })

    // 兜底：监听服务端发来的心跳确认（非回调模式）
    socket.on('heartbeat:ack', (data) => {
      missedHeartbeats = 0
      lastHeartbeatAck = Date.now()
      if (data.serverTime) {
        networkLatency.value = Date.now() - (Date.now() - (Date.now() - data.serverTime))
      }
      connectionStatus.value = 'connected'
    })
  }
  return socket
}

/**
 * 连接并认证
 * 每次调用都会确保 auth 发出，保证 socketToPlayer 映射正确
 * @param {object} player - 玩家对象（需含 _token 字段存放 JWT）
 * @returns {socket}
 */
export function connectSocket(player) {
  const s = getSocket()
  currentPlayer = player // 保存玩家信息供重连使用

  const doAuth = () => {
    authSent = true
    // 优先使用 _token（JWT），兼容旧格式
    const token = player._token || player.id
    s.emit('player:auth', { token })
  }

  if (s.connected) {
    // 已连接：重新发 auth（页面切换后 socketId 没变，但重发一次无害）
    doAuth()
    startHeartbeat() // 确保心跳运行
  } else {
    // connect 事件中已经处理了 auth，但这里用 once 确保首次连接也会触发
    if (!s.hasListeners?.('connect') || true) {
      // connectSocket 调用时 connect handler 已在 getSocket 中注册
      // 只需确保 currentPlayer 已设置
    }
    s.connect()
  }

  return s
}

export function disconnectSocket() {
  stopHeartbeat()
  if (socket && socket.connected) {
    authSent = false
    currentPlayer = null
    socket.disconnect()
  }
  connectionStatus.value = 'disconnected'
}

/**
 * 获取当前连接健康信息
 */
export function getConnectionHealth() {
  return {
    status: connectionStatus.value,
    latency: networkLatency.value,
    missedHeartbeats,
    lastAck: lastHeartbeatAck ? new Date(lastHeartbeatAck).toLocaleTimeString() : 'N/A',
    connected: socket?.connected || false
  }
}
