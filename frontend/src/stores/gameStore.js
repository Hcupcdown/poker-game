import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useGameStore = defineStore('game', () => {
  // 用户信息
  const player = ref(JSON.parse(localStorage.getItem('poker_player') || 'null'))
  const token = ref(localStorage.getItem('poker_token') || '')

  // 房间信息
  const room = ref(null)

  // 游戏状态
  const gameState = ref(null)

  // socket 连接状态
  const connected = ref(false)

  // 本局消息提示
  const actionLog = ref([])

  // 是否是我的回合
  const isMyTurn = computed(() => {
    if (!gameState.value || !player.value) return false
    const me = gameState.value.players?.find(p => p.id === player.value.id)
    return me && gameState.value.currentPlayerId === player.value.id
  })

  // 我的玩家数据
  const myPlayerData = computed(() => {
    if (!gameState.value || !player.value) return null
    return gameState.value.players?.find(p => p.id === player.value.id) || null
  })

  // 对手数据（除我之外）
  const opponents = computed(() => {
    if (!gameState.value || !player.value) return []
    return gameState.value.players?.filter(p => p.id !== player.value.id) || []
  })

  function setPlayer(data, jwtToken) {
    player.value = data
    // 如果传入了独立的 JWT token，优先使用；否则兼容旧模式
    if (jwtToken) {
      token.value = jwtToken
    } else if (data.token) {
      token.value = data.token
      delete data.token
    } else {
      token.value = data.id
    }
    localStorage.setItem('poker_player', JSON.stringify(data))
    localStorage.setItem('poker_token', token.value)
  }

  function setRoom(data) {
    room.value = data
  }

  function setGameState(state) {
    gameState.value = state
  }

  function setConnected(val) {
    connected.value = val
  }

  function addLog(msg) {
    actionLog.value.unshift({ msg, time: Date.now() })
    if (actionLog.value.length > 20) actionLog.value.pop()
  }

  function logout() {
    player.value = null
    token.value = ''
    room.value = null
    gameState.value = null
    localStorage.removeItem('poker_player')
    localStorage.removeItem('poker_token')
  }

  return {
    player, token, room, gameState, connected, actionLog,
    isMyTurn, myPlayerData, opponents,
    setPlayer, setRoom, setGameState, setConnected, addLog, logout
  }
})
