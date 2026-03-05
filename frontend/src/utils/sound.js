/**
 * 游戏音效模块（Web Audio API 合成，无需音频文件）
 */

let audioCtx = null

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioCtx
}

function isMuted() {
  return localStorage.getItem('poker_sound_muted') === '1'
}

function playTone({ freq = 440, type = 'sine', duration = 0.1, gainStart = 0.3, gainEnd = 0, startDelay = 0 }) {
  if (isMuted()) return
  try {
    const ctx = getCtx()
    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') ctx.resume()

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.type = type
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime + startDelay)

    gainNode.gain.setValueAtTime(gainStart, ctx.currentTime + startDelay)
    gainNode.gain.linearRampToValueAtTime(gainEnd, ctx.currentTime + startDelay + duration)

    oscillator.start(ctx.currentTime + startDelay)
    oscillator.stop(ctx.currentTime + startDelay + duration + 0.01)
  } catch (e) {
    // 静默处理音频错误，不影响游戏
  }
}

/** 发牌音：短促高频正弦波 ~800Hz, 80ms */
export function playDealSound() {
  playTone({ freq: 800, type: 'sine', duration: 0.08, gainStart: 0.25, gainEnd: 0 })
}

/** 下注/加注音：中频 ~400Hz, 120ms */
export function playBetSound() {
  playTone({ freq: 400, type: 'triangle', duration: 0.12, gainStart: 0.3, gainEnd: 0 })
}

/** 赢筹码音：上升音阶 C5→E5→G5，各 80ms */
export function playWinSound() {
  const notes = [523.25, 659.25, 783.99] // C5, E5, G5
  notes.forEach((freq, i) => {
    playTone({ freq, type: 'sine', duration: 0.08, gainStart: 0.35, gainEnd: 0, startDelay: i * 0.09 })
  })
}

/** 弃牌音：低频衰减 ~200Hz, 150ms */
export function playFoldSound() {
  playTone({ freq: 200, type: 'sawtooth', duration: 0.15, gainStart: 0.2, gainEnd: 0 })
}

/** 获取/设置静音状态 */
export function getMuted() {
  return isMuted()
}

export function setMuted(val) {
  localStorage.setItem('poker_sound_muted', val ? '1' : '0')
}

export function toggleMute() {
  const next = !isMuted()
  setMuted(next)
  return next
}
