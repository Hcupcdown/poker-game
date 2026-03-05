import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { connectSocket, getSocket } from '../utils/socket'

/**
 * 游戏 Socket 事件处理
 * @param {Object} options
 * @param {import('vue').Ref} options.gameState - 游戏状态
 * @param {import('vue').Ref} options.displayBets - 下注显示
 * @param {import('vue').Ref} options.showResult - 结算弹窗
 * @param {import('vue').Ref} options.roundResult - 结算数据
 * @param {import('vue').Ref} options.showFinalResult - 最终结算弹窗
 * @param {import('vue').Ref} options.finalPlayers - 最终结算玩家
 * @param {import('vue').Ref} options.finalReason - 结束原因
 * @param {import('vue').Ref} options.nextRoundSent - 是否已发送下一轮
 * @param {import('vue').Ref} options.nextRoundReady - 已准备人数
 * @param {import('vue').Ref} options.nextRoundTotal - 总人数
 * @param {import('vue').Ref} options.roomOwnerId - 房主 ID
 * @param {import('vue').Ref} options.isMyTurn - 是否轮到我
 * @param {Object} options.store - game store
 * @param {string} options.roomId - 房间号
 * @param {Function} options.triggerDealAnimation - 发牌动画
 * @param {import('vue').Ref} options.communitySlots - 公共牌 slots
 * @param {Function} options.startTimer - 启动计时器
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

  function setupSocket() {
    if (!store.player) {
      router.replace('/login')
      return
    }

    const socket = connectSocket(store.player)

    // 游戏状态更新
    socket.on('game:state', (state) => {
      const wasWaiting = (store.gameState?.phase || 'waiting') === 'waiting'
      store.setGameState(state)
      if (wasWaiting && state.phase !== 'waiting') {
        triggerDealAnimation()
      }
    })

    // 游戏开始
    socket.on('game:start', ({ gameState: gs }) => {
      showResult.value = false
      showFinalResult.value = false
      nextRoundSent.value = false
      displayBets.value = {}
      store.setGameState(gs)
      communitySlots.value = []
      triggerDealAnimation()
    })

    // 玩家行动日志
    socket.on('player:action:log', ({ msg }) => {
      store.addLog(msg)
    })

    // 结算
    socket.on('game:result', (result) => {
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
    })

    // 最终结算
    socket.on('game:final_result', ({ players, reason }) => {
      clearTimeout(autoBackTimer)
      showResult.value = false
      finalPlayers.value = players
      finalReason.value = reason || ''
      showFinalResult.value = true
      store.setGameState(null)
    })

    // 房间信息更新
    socket.on('room:update', ({ room }) => {
      if (room) {
        store.setRoom(room)
        roomOwnerId.value = room.ownerId
      }
    })

    // 等待进度更新
    socket.on('game:next_round_ready', ({ ready, total }) => {
      nextRoundReady.value = ready
      nextRoundTotal.value = total
    })

    // 续局开始
    socket.on('game:next_round_start', ({ gameState: gs }) => {
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
    })

    // 破产踢出
    socket.on('player:bust', ({ message }) => {
      showToast({ message: message || '筹码耗尽，已退出游戏', icon: 'fail', duration: 3000 })
      router.replace('/lobby')
    })

    // 玩家断线通知
    socket.on('player:disconnected', ({ nickname }) => {
      store.addLog(`${nickname} 断线`)
    })

    // 玩家重连通知
    socket.on('player:reconnected', ({ nickname }) => {
      store.addLog(`${nickname} 已重连`)
    })

    // 错误处理
    socket.on('error', ({ message }) => {
      showToast({ message: message || '出错了', icon: 'fail' })
      if (isMyTurn.value && gameState.value.phase !== 'showdown') {
        startTimer()
      }
    })

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
    socket.off('game:state')
    socket.off('game:start')
    socket.off('player:action:log')
    socket.off('game:result')
    socket.off('game:final_result')
    socket.off('game:next_round_ready')
    socket.off('game:next_round_start')
    socket.off('player:bust')
    socket.off('player:disconnected')
    socket.off('player:reconnected')
    socket.off('player:auth:ok')
    socket.off('room:update')
    socket.off('error')
  }

  return {
    setupSocket,
    cleanupSocket
  }
}
