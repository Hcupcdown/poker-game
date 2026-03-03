import { ref, watch, onUnmounted } from 'vue'

/**
 * 倒计时逻辑
 * @param {import('vue').Ref<boolean>} isMyTurn - 是否轮到我
 * @param {Function} onTimeout - 超时回调
 * @param {number} duration - 总时长（秒），默认 30
 */
export function useTimer(isMyTurn, onTimeout, duration = 30) {
  const timeLeft = ref(duration)
  const timerProgress = ref(100)
  let timerInterval = null

  function startTimer() {
    timeLeft.value = duration
    timerProgress.value = 100
    clearInterval(timerInterval)
    timerInterval = setInterval(() => {
      timeLeft.value--
      timerProgress.value = (timeLeft.value / duration) * 100
      if (timeLeft.value <= 0) {
        stopTimer()
        onTimeout?.()
      }
    }, 1000)
  }

  function stopTimer() {
    clearInterval(timerInterval)
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
