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

        <!-- 登录表单 -->
        <transition name="slide-up">
          <div class="login-form card-box" v-if="showForm">
            <h3 class="form-title">输入你的昵称</h3>

            <!-- 昵称输入 -->
            <van-field
              v-model="nickname"
              placeholder="给自己起个名字"
              :maxlength="10"
              clearable
              class="nick-input"
              @keyup.enter="handleLogin"
            />

            <!-- 头像选择 -->
            <div class="avatar-section">
              <p class="avatar-label">选个头像</p>
              <div class="avatar-grid">
                <div
                  v-for="emoji in avatars"
                  :key="emoji"
                  class="avatar-item"
                  :class="{ selected: selectedAvatar === emoji }"
                  @click="selectedAvatar = emoji"
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
              class="btn-green login-btn"
              :loading="loading"
              @click="handleLogin"
            >
              进入游戏 →
            </van-button>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { showToast } from 'vant'

const router = useRouter()
const store = useGameStore()

const nickname = ref('')
const selectedAvatar = ref('🐼')
const loading = ref(false)
const showForm = ref(false)

const avatars = ['🐼', '🦊', '🐯', '🦁', '🐻', '🐸', '🐺', '🦅', '🐉', '👾', '🤠', '😎']
const bgCards = ['🂡', '🂱', '🃁', '🃑', '🂢', '🂲']

onMounted(() => {
  if (store.token && store.player) {
    router.replace('/lobby')
    return
  }
  setTimeout(() => { showForm.value = true }, 300)
})

function handleLogin() {
  if (!nickname.value.trim()) {
    showToast('请输入昵称')
    return
  }
  loading.value = true

  const playerData = {
    id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nickname: nickname.value.trim(),
    avatar: selectedAvatar.value,
    chips: 1000,   // 占位，实际由房主开局时设置
    createdAt: Date.now()
  }

  setTimeout(() => {
    store.setPlayer(playerData)
    loading.value = false
    router.push('/lobby')
  }, 600)
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
  margin-bottom: 32px;
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
  padding: 24px 20px 28px;
}

.form-title {
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 16px;
  text-align: center;
}

.nick-input {
  background: rgba(255,255,255,0.08) !important;
  border-radius: 12px !important;
  margin-bottom: 20px;
  --van-field-input-text-color: #fff;
  --van-field-placeholder-text-color: rgba(255,255,255,0.35);
  border: 1px solid rgba(255,255,255,0.15) !important;
}

:deep(.van-field__control) {
  color: #fff !important;
  font-size: 16px;
}

.avatar-section { margin-bottom: 24px; }

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
  font-size: 24px;
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

.login-btn {
  height: 52px !important;
  font-size: 17px !important;
  letter-spacing: 1px;
}
</style>
