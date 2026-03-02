/**
 * socket.js - Socket.IO 单例
 * 整个应用共享一个 socket 连接
 */
import { io } from 'socket.io-client'

// 开发时走 vite proxy，生产时同源
const URL = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin

let socket = null
let authSent = false   // 防止重复发 auth
let currentPlayer = null // 保存当前玩家信息，供重连时使用

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
      console.log(`[Socket] 断线: ${reason}`)
    })

    // 重连成功后自动重新认证
    socket.on('connect', () => {
      console.log(`[Socket] 已连接, id=${socket.id}`)
      if (currentPlayer && !authSent) {
        authSent = true
        socket.emit('player:auth', { playerId: currentPlayer.id, player: currentPlayer })
        console.log(`[Socket] 重连后自动认证: ${currentPlayer.nickname}`)
      }
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
  currentPlayer = player // 保存玩家信息供重连使用

  const doAuth = () => {
    authSent = true
    s.emit('player:auth', { playerId: player.id, player })
  }

  if (s.connected) {
    // 已连接：重新发 auth（页面切换后 socketId 没变，但重发一次无害）
    doAuth()
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
  if (socket && socket.connected) {
    authSent = false
    currentPlayer = null
    socket.disconnect()
  }
}
