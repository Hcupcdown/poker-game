import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { connectSocket, getSocket } from '../utils/socket'

/**
 * 游戏 Socket 事件处理
 * 所有 handler 用具名函数注册，cleanup 时精确 off，避免误移除其他监听器
 */
export function useGameSocket({
  gameState, displayBets, showResult, roundResult,
  showFinalResult, finalPlayers, finalReason,
  nextRoundSent, nextRoundReady, nextRoundTotal,
  roomOwnerId, isMyTurn, store, roomId,
  triggerDealAnimation, communitySlots, startTimer
}) {
  const router = useRouter()
  let autoBackTimer = null

  // 具名 handler，cleanup 时可精确移除
  const handlers = {}

  function setupSocket() {
    if (!store.player) {
      router.replace('/login')
      return
    }

    const socket = connectSocket(store.player ? { ...store.player, _token: store.token } : store.player)

    handlers['game:state'] = (state) => {
      const wasWaiting = (store.gameState?.phase || 'waiting') === 'waiting'
      store.setGameState(state)
      if (wasWaiting && state.phase !== 'waiting') {
        triggerDealAnimation()
      }
    }

    handlers['game:start'] = ({ gameState: gs }) => {
      showResult.value = false
      showFinalResult.value = false
      nextRoundSent.value = false
      displayBets.value = {}
      store.setGameState(gs)
      communitySlots.value = []
      triggerDealAnimation()
    }

    handlers['player:action:log'] = ({ msg }) => {
      store.addLog(msg)
    }

    handlers['game:result'] = (result) => {
      roundResult.value = result
      showResult.value = true
      nextRoundSent.value = false
      nextRoundReady.value = 0
      nextRoundTotal.value = result.allHands?.length || 0

      clearTimeout(autoBackTimer)
      autoBackTimer = setTimeout(() => {
        if (showResult.value && !nextRoundSent.value) {
          getSocket().emit('game:next_round')
          nextRoundSent.value = true
        }
      }, 60000)
    }

    handlers['game:final_result'] = ({ players, reason }) => {
      clearTimeout(autoBackTimer)
      showResult.value = false
      finalPlayers.value = players
      finalReason.value = reason || ''
      showFinalResult.value = true
      store.setGameState(null)
    }

    handlers['room:update'] = ({ room }) => {
      if (room) {
        store.setRoom(room)
        roomOwnerId.value = room.ownerId
      }
    }

    handlers['game:next_round_ready'] = ({ ready, total }) => {
      nextRoundReady.value = ready
      nextRoundTotal.value = total
    }

    handlers['game:next_round_start'] = ({ gameState: gs }) => {
      clearTimeout(autoBackTimer)
      showResult.value = false
      showFinalResult.value = false
      nextRoundSent.value = false
      nextRoundReady.value = 0
      nextRoundTotal.value = 0
      displayBets.value = {}
      store.setGameState(gs)
      communitySlots.value = []
      triggerDealAnimation()
    }

    handlers['player:bust'] = ({ message }) => {
      showToast({ message: message || '筹码耗尽，已退出游戏', icon: 'fail', duration: 3000 })
      router.replace('/lobby')
    }

    handlers['player:disconnected'] = ({ nickname }) => {
      store.addLog(`${nickname} 断线`)
    }

    handlers['player:reconnected'] = ({ nickname }) => {
      store.addLog(`${nickname} 已重连`)
    }

    handlers['error'] = ({ message }) => {
      showToast({ message: message || '出错了', icon: 'fail' })
      if (isMyTurn.value && gameState.value.phase !== 'showdown') {
        startTimer()
      }
    }

    // 注册所有 handler
    for (const [event, fn] of Object.entries(handlers)) {
      socket.on(event, fn)
    }

    // 主动拉取当前游戏状态
    const doRequestState = () => {
      socket.emit('game:request_state')
    }

    if (socket.connected) {
      let done = false
      const tryRequest = () => {
        if (done) return
        done = true
        socket.emit('room:join', { roomId, player: store.player })
        setTimeout(doRequestState, 150)
      }
      socket.once('player:auth:ok', tryRequest)
      setTimeout(tryRequest, 400)
    } else {
      socket.once('player:auth:ok', () => {
        socket.emit('room:join', { roomId, player: store.player })
        setTimeout(doRequestState, 150)
      })
    }
  }

  function cleanupSocket() {
    clearTimeout(autoBackTimer)
    const socket = getSocket()
    if (!socket) return
    // 精确移除每个具名 handler，不影响其他组件对相同事件的监听
    for (const [event, fn] of Object.entries(handlers)) {
      socket.off(event, fn)
    }
  }

  return {
    setupSocket,
    cleanupSocket
  }
}
