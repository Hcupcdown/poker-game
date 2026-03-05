import { ref, watch, onUnmounted, computed, isRef } from 'vue'

/**
 * 统一的基于 actionDeadline 的倒计时 composable
 * @param {import('vue').Ref<number|null>} actionDeadline - 行动截止时间戳(ms)，Ref 或普通值
 * @param {import('vue').Ref<number>|number} actionDuration - 行动总时长(ms)，默认 30000
 * @returns {{ timerProgress: Ref<number>, timeLeft: Ref<number> }}
 */
export function useActionTimer(actionDeadline, actionDuration = 30000) {
  const timerProgress = ref(100)
  const timeLeft = ref(30)
  let timerInterval = null

  function getDeadline() {
    return isRef(actionDeadline) ? actionDeadline.value : actionDeadline
  }

  function getDuration() {
    const d = isRef(actionDuration) ? actionDuration.value : actionDuration
    return d || 30000
  }

  function updateProgress() {
    const deadline = getDeadline()
    const duration = getDuration()
    if (!deadline) {
      timerProgress.value = 100
      timeLeft.value = Math.round(duration / 1000)
      stopCountdown()
      return
    }
    const now = Date.now()
    const remaining = deadline - now
    if (remaining <= 0) {
      timerProgress.value = 0
      timeLeft.value = 0
      stopCountdown()
    } else {
      timerProgress.value = Math.min(100, (remaining / duration) * 100)
      timeLeft.value = Math.ceil(remaining / 1000)
    }
  }

  function startCountdown() {
    stopCountdown()
    if (!getDeadline()) {
      timerProgress.value = 100
      return
    }
    updateProgress()
    timerInterval = setInterval(updateProgress, 100)
  }

  function stopCountdown() {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }

  if (isRef(actionDeadline)) {
    watch(actionDeadline, (val) => {
      if (val) startCountdown()
      else { stopCountdown(); timerProgress.value = 100 }
    }, { immediate: true })
  } else {
    startCountdown()
  }

  onUnmounted(() => stopCountdown())

  return { timerProgress, timeLeft, startCountdown, stopCountdown }
}
