import { ref, watch, onUnmounted } from 'vue'

/**
 * 倒计时逻辑（基于服务端 actionDeadline 同步）
 * @param {import('vue').Ref<boolean>} isMyTurn - 是否轮到我
 * @param {Function} onTimeout - 超时回调
 * @param {import('vue').Ref} gameState - 游戏状态 ref，读取 actionDeadline / actionDuration
 */
export function useTimer(isMyTurn, onTimeout, gameState) {
  const timeLeft = ref(30)
  const timerProgress = ref(100)
  let timerInterval = null

  function getDeadlineInfo() {
    if (gameState && gameState.value) {
      return {
        deadline: gameState.value.actionDeadline || null,
        duration: gameState.value.actionDuration || 30000
      }
    }
    // 兼容旧调用（传 number 作为 duration）
    return { deadline: null, duration: typeof gameState === 'number' ? gameState * 1000 : 30000 }
  }

  function updateProgress() {
    const { deadline, duration } = getDeadlineInfo()
    if (!deadline) {
      // 没有 deadline，降级为本地 30 秒倒计时（每次 tick -1 秒）
      return
    }
    const now = Date.now()
    const remaining = deadline - now
    if (remaining <= 0) {
      timeLeft.value = 0
      timerProgress.value = 0
      stopTimer()
      onTimeout?.()
    } else {
      timeLeft.value = Math.ceil(remaining / 1000)
      timerProgress.value = Math.min(100, (remaining / duration) * 100)
    }
  }

  function startTimer() {
    stopTimer()
    const { deadline, duration } = getDeadlineInfo()

    if (deadline) {
      // 基于服务端时间戳
      updateProgress()
      timerInterval = setInterval(updateProgress, 100)
    } else {
      // 降级：本地 30 秒倒计时
      const totalSecs = Math.round(duration / 1000) || 30
      timeLeft.value = totalSecs
      timerProgress.value = 100
      timerInterval = setInterval(() => {
        timeLeft.value--
        timerProgress.value = (timeLeft.value / totalSecs) * 100
        if (timeLeft.value <= 0) {
          stopTimer()
          onTimeout?.()
        }
      }, 1000)
    }
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }

  watch(isMyTurn, (val) => {
    if (val) startTimer()
    else stopTimer()
  }, { immediate: true })

  onUnmounted(() => {
    stopTimer()
  })

  return {
    timeLeft,
    timerProgress,
    startTimer,
    stopTimer
  }
}
