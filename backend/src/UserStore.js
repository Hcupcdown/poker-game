/**
 * UserStore.js - 用户数据持久化层（JSON 文件）
 * 数据结构：{ users: [ { id, username, passwordHash, nickname, avatar, chips, createdAt, lastLoginAt } ] }
 */
const fs = require('fs')
const path = require('path')

class UserStore {
  constructor(filePath) {
    this.filePath = filePath
    // 确保目录存在
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  _load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { users: [] }
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      return JSON.parse(raw)
    } catch (e) {
      console.error('[UserStore] 读取文件失败:', e.message)
      return { users: [] }
    }
  }

  _save(data) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (e) {
      console.error('[UserStore] 写入文件失败:', e.message)
      throw e
    }
  }

  findByUsername(username) {
    const data = this._load()
    return data.users.find(u => u.username === username) || null
  }

  findById(id) {
    const data = this._load()
    return data.users.find(u => u.id === id) || null
  }

  create({ username, passwordHash, nickname, avatar }) {
    const data = this._load()
    const id = 'p_' + require('crypto').randomBytes(4).toString('hex')
    const user = {
      id,
      username,
      passwordHash,
      nickname,
      avatar: avatar || '🐼',
      chips: 1000,
      createdAt: Date.now(),
      lastLoginAt: null
    }
    data.users.push(user)
    this._save(data)
    return user
  }

  updateLastLogin(id) {
    const data = this._load()
    const user = data.users.find(u => u.id === id)
    if (user) {
      user.lastLoginAt = Date.now()
      this._save(data)
    }
  }

  updateChips(id, chips) {
    const data = this._load()
    const user = data.users.find(u => u.id === id)
    if (user) {
      user.chips = chips
      this._save(data)
    }
  }
}

module.exports = UserStore
