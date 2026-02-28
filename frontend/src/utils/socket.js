/**
 * socket.js - Socket.IO 单例
 * 整个应用共享一个 socket 连接
 */
import { io } from 'socket.io-client'

// 开发时走 vite proxy，生产时同源
const URL = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin

let socket = null

export function getSocket() {
  if (!socket) {
    socket = io(URL, {
      autoConnect: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })
  }
  return socket
}

export function connectSocket(player) {
  const s = getSocket()
  if (!s.connected) {
    s.connect()
  }
  // 认证
  s.emit('player:auth', { playerId: player.id, player })
  return s
}

export function disconnectSocket() {
  if (socket && socket.connected) {
    socket.disconnect()
  }
}
