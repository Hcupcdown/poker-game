<template>
  <div class="login-page page-scroll">
    <div class="login-bg">
      <!-- 背景装饰牌 -->
      <div class="bg-cards">
        <span v-for="c in bgCards" :key="c" class="bg-card">{{ c }}</span>
      </div>

      <div class="login-content">
        <!-- Logo -->
        <div class="logo-area">
          <div class="logo-icon">🃏</div>
          <h1 class="logo-title">德扑小局</h1>
          <p class="logo-sub">和朋友一起玩德州扑克</p>
        </div>

        <!-- 登录/注册 Tab -->
        <transition name="slide-up">
          <div class="login-form card-box" v-if="showForm">
            <van-tabs
              v-model:active="activeTab"
              class="auth-tabs"
              color="#f5c842"
              title-active-color="#f5c842"
              title-inactive-color="rgba(255,255,255,0.5)"
              background="transparent"
            >
              <!-- ===== 登录 Tab ===== -->
              <van-tab title="登录" name="login">
                <div class="tab-content">
                  <van-field
                    v-model="loginForm.username"
                    placeholder="用户名"
                    left-icon="person-o"
                    clearable
                    class="auth-input"
                    @keyup.enter="handleLogin"
                  />
                  <van-field
                    v-model="loginForm.password"
                    :type="showLoginPwd ? 'text' : 'password'"
                    placeholder="密码"
                    left-icon="lock"
                    :right-icon="showLoginPwd ? 'eye-o' : 'closed-eye'"
                    @click-right-icon="showLoginPwd = !showLoginPwd"
                    class="auth-input"
                    @keyup.enter="handleLogin"
                  />
                  <div class="remember-row">
                    <van-checkbox
                      v-model="rememberMe"
                      icon-size="16px"
                      checked-color="#f5c842"
                    >
                      <span class="remember-text">记住用户名</span>
                    </van-checkbox>
                  </div>
                  <van-button
                    type="primary"
                    block
                    round
                    size="large"
                    class="btn-green auth-btn"
                    :loading="loginLoading"
                    @click="handleLogin"
                  >
                    登录 →
                  </van-button>
                </div>
              </van-tab>

              <!-- ===== 注册 Tab ===== -->
              <van-tab title="注册" name="register">
                <div class="tab-content">
                  <van-field
                    v-model="regForm.username"
                    placeholder="用户名（3-20位字母数字下划线）"
                    left-icon="person-o"
                    clearable
                    class="auth-input"
                  />
                  <van-field
                    v-model="regForm.password"
                    :type="showRegPwd ? 'text' : 'password'"
                    placeholder="密码（6-30位）"
                    left-icon="lock"
                    :right-icon="showRegPwd ? 'eye-o' : 'closed-eye'"
                    @click-right-icon="showRegPwd = !showRegPwd"
                    class="auth-input"
                  />
                  <van-field
                    v-model="regForm.confirmPassword"
                    :type="showRegPwd ? 'text' : 'password'"
                    placeholder="确认密码"
                    left-icon="lock"
                    class="auth-input"
                  />
                  <van-field
                    v-model="regForm.nickname"
                    placeholder="昵称（最多10字）"
                    :maxlength="10"
                    left-icon="user-o"
                    clearable
                    class="auth-input"
                  />
                  <!-- 头像选择 -->
                  <div class="avatar-section">
                    <p class="avatar-label">选个头像</p>
                    <div class="avatar-grid">
                      <div
                        v-for="emoji in avatars"
                        :key="emoji"
                        class="avatar-item"
                        :class="{ selected: regForm.avatar === emoji }"
                        @click="regForm.avatar = emoji"
                      >
                        {{ emoji }}
                      </div>
                    </div>
                  </div>
                  <van-button
                    type="primary"
                    block
                    round
                    size="large"
                    class="btn-green auth-btn"
                    :loading="regLoading"
                    @click="handleRegister"
                  >
                    注册并登录 →
                  </van-button>
                </div>
              </van-tab>
            </van-tabs>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { showToast } from 'vant'

const router = useRouter()
const store = useGameStore()

const activeTab = ref('login')
const showForm = ref(false)

// 登录表单
const loginForm = reactive({ username: '', password: '' })
const showLoginPwd = ref(false)
const rememberMe = ref(false)
const loginLoading = ref(false)

// 注册表单
const regForm = reactive({ username: '', password: '', confirmPassword: '', nickname: '', avatar: '🐼' })
const showRegPwd = ref(false)
const regLoading = ref(false)

const avatars = ['🐼', '🦊', '🐯', '🦁', '🐻', '🐸', '🐺', '🦅', '🐉', '👾', '🤠', '😎']
const bgCards = ['🂡', '🂱', '🃁', '🃑', '🂢', '🂲']

const BASE_URL = import.meta.env.DEV ? 'http://localhost:3000' : ''

onMounted(async () => {
  // 恢复记住的用户名
  const savedUsername = localStorage.getItem('poker_remember_username')
  if (savedUsername) {
    loginForm.username = savedUsername
    rememberMe.value = true
  }

  // 如果有 token，验证是否有效
  const token = store.token
  if (token) {
    try {
      const res = await fetch(`${BASE_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        // token 有效，直接更新 store 并跳转
        store.setPlayer(data.user, token)
        router.replace('/lobby')
        return
      } else {
        // token 无效，清除
        store.logout()
      }
    } catch (e) {
      store.logout()
    }
  }

  setTimeout(() => { showForm.value = true }, 300)
})

async function handleLogin() {
  const { username, password } = loginForm
  if (!username.trim()) { showToast('请输入用户名'); return }
  if (!password) { showToast('请输入密码'); return }

  loginLoading.value = true
  try {
    const res = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password })
    })
    const data = await res.json()
    if (!res.ok) {
      showToast({ message: data.error || '登录失败', icon: 'fail' })
      return
    }
    // 记住用户名
    if (rememberMe.value) {
      localStorage.setItem('poker_remember_username', username.trim())
    } else {
      localStorage.removeItem('poker_remember_username')
    }
    // 存储 player（带 _token 供 socket 使用）
    store.setPlayer({ ...data.user, _token: data.token }, data.token)
    router.replace('/lobby')
  } catch (e) {
    showToast({ message: '网络错误，请重试', icon: 'fail' })
  } finally {
    loginLoading.value = false
  }
}

async function handleRegister() {
  const { username, password, confirmPassword, nickname, avatar } = regForm
  if (!username.trim()) { showToast('请输入用户名'); return }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
    showToast('用户名需为3-20位字母、数字或下划线')
    return
  }
  if (!password || password.length < 6) { showToast('密码至少6位'); return }
  if (password !== confirmPassword) { showToast('两次密码不一致'); return }
  if (!nickname.trim()) { showToast('请输入昵称'); return }

  regLoading.value = true
  try {
    const res = await fetch(`${BASE_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.trim(),
        password,
        nickname: nickname.trim(),
        avatar
      })
    })
    const data = await res.json()
    if (!res.ok) {
      showToast({ message: data.error || '注册失败', icon: 'fail' })
      return
    }
    showToast({ message: '注册成功！', icon: 'success' })
    store.setPlayer({ ...data.user, _token: data.token }, data.token)
    router.replace('/lobby')
  } catch (e) {
    showToast({ message: '网络错误，请重试', icon: 'fail' })
  } finally {
    regLoading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100dvh;
  background: linear-gradient(160deg, #0d1b2a 0%, #1a1a2e 50%, #16213e 100%);
}

.login-bg {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  position: relative;
  overflow: hidden;
}

/* 背景装饰 */
.bg-cards {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.bg-card {
  position: absolute;
  font-size: 80px;
  opacity: 0.04;
  animation: floatCard 8s infinite ease-in-out;
}
.bg-card:nth-child(1) { top: 5%; left: 10%; animation-delay: 0s; }
.bg-card:nth-child(2) { top: 15%; right: 8%; animation-delay: 1.5s; }
.bg-card:nth-child(3) { top: 45%; left: 5%; animation-delay: 3s; }
.bg-card:nth-child(4) { top: 60%; right: 15%; animation-delay: 4.5s; }
.bg-card:nth-child(5) { bottom: 15%; left: 20%; animation-delay: 2s; }
.bg-card:nth-child(6) { bottom: 8%; right: 5%; animation-delay: 6s; }

@keyframes floatCard {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-20px) rotate(10deg); }
}

.login-content {
  width: 100%;
  max-width: 420px;
  z-index: 1;
}

.logo-area {
  text-align: center;
  margin-bottom: 28px;
}

.logo-icon {
  font-size: 72px;
  margin-bottom: 8px;
  filter: drop-shadow(0 4px 20px rgba(245,200,66,0.4));
  animation: pulse 2s infinite ease-in-out;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}

.logo-title {
  font-size: 32px;
  font-weight: 800;
  color: #f5c842;
  margin: 0 0 8px;
  letter-spacing: 2px;
  text-shadow: 0 2px 20px rgba(245,200,66,0.3);
}

.logo-sub {
  color: rgba(255,255,255,0.5);
  font-size: 14px;
  margin: 0;
}

.login-form {
  padding: 0 0 20px;
  overflow: hidden;
}

/* Tabs 样式覆盖 */
.auth-tabs :deep(.van-tabs__wrap) {
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.auth-tabs :deep(.van-tab) {
  font-size: 16px;
  font-weight: 600;
}

.auth-tabs :deep(.van-tabs__line) {
  background: #f5c842;
  height: 3px;
  border-radius: 2px;
}

.tab-content {
  padding: 20px 20px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.auth-input {
  background: rgba(255,255,255,0.08) !important;
  border-radius: 12px !important;
  --van-field-input-text-color: #fff;
  --van-field-placeholder-text-color: rgba(255,255,255,0.35);
  --van-field-icon-size: 18px;
  border: 1px solid rgba(255,255,255,0.12) !important;
}

:deep(.van-field__control) {
  color: #fff !important;
  font-size: 15px;
}

:deep(.van-field__left-icon .van-icon) {
  color: rgba(255,255,255,0.45) !important;
}

:deep(.van-field__right-icon .van-icon) {
  color: rgba(255,255,255,0.45) !important;
}

.remember-row {
  display: flex;
  align-items: center;
  padding: 0 2px;
}

.remember-text {
  color: rgba(255,255,255,0.55);
  font-size: 13px;
}

.auth-btn {
  height: 50px !important;
  font-size: 16px !important;
  letter-spacing: 1px;
  margin-top: 4px;
}

/* 头像选择 */
.avatar-section { }

.avatar-label {
  color: rgba(255,255,255,0.6);
  font-size: 13px;
  margin: 0 0 10px;
}

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.avatar-item {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  border-radius: 10px;
  cursor: pointer;
  background: rgba(255,255,255,0.06);
  border: 2px solid transparent;
  transition: all 0.2s;
}

.avatar-item.selected {
  border-color: #f5c842;
  background: rgba(245,200,66,0.15);
  transform: scale(1.1);
}

/* 滑入动画 */
.slide-up-enter-active {
  transition: all 0.4s ease;
}
.slide-up-enter-from {
  opacity: 0;
  transform: translateY(30px);
}
</style>
