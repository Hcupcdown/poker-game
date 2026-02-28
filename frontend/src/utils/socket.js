/**
 * socket.js - Socket.IO 单例
 * 整个应用共享一个 socket 连接
 */
import { io } from 'socket.io-client'

// 开发时走 vite proxy，生产时同源
const URL = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin

let socket = null
let authSent = false   // 防止重复发 auth

export function getSocket() {
  if (!socket) {
    socket = io(URL, {
      autoConnect: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })
    socket.on('disconnect', () => {
      authSent = false  // 断线后重置，重连时重新 auth
    })
  }
  return socket
}

/**
 * 连接并认证
 * 每次调用都会确保 auth 发出，保证 socketToPlayer 映射正确
 * @param {object} player
 * @returns {socket}
 */
export function connectSocket(player) {
  const s = getSocket()

  const doAuth = () => {
    authSent = true
    s.emit('player:auth', { playerId: player.id, player })
  }

  if (s.connected) {
    // 已连接：重新发 auth（页面切换后 socketId 没变，但重发一次无害）
    doAuth()
  } else {
    s.once('connect', doAuth)
    s.connect()
  }

  return s
}

export function disconnectSocket() {
  if (socket && socket.connected) {
    authSent = false
    socket.disconnect()
  }
}
