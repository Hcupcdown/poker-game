/**
 * utils.js - 工具函数
 */

/**
 * 生成随机 6 位房间码（字母+数字，大写）
 * 与前端 LobbyPage.vue generateRoomCode 逻辑对应
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去掉易混淆字符 I,O,0,1
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/**
 * 深拷贝（简单版）
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * 延迟工具
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 安全取整
 */
function safeInt(val, defaultVal = 0) {
  const n = parseInt(val, 10)
  return isNaN(n) ? defaultVal : n
}

module.exports = { generateRoomCode, deepClone, sleep, safeInt }
