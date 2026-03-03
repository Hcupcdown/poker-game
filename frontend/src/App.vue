<template>
  <router-view />
</template>

<style>
* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  background: #1a1a2e;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
}

#app {
  height: 100dvh;
  overflow: hidden;
}

/* 全局滚动容器 */
.page-scroll {
  height: 100dvh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* 卡片风格 */
.card-box {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 16px;
  backdrop-filter: blur(10px);
}

/* 金色文字 */
.gold {
  color: #f5c842;
}

/* 绿色按钮 */
.btn-green {
  background: linear-gradient(135deg, #27ae60, #2ecc71) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 700 !important;
  border-radius: 12px !important;
}

/* 红色按钮 */
.btn-red {
  background: linear-gradient(135deg, #c0392b, #e74c3c) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 700 !important;
  border-radius: 12px !important;
}

/* 灰色按钮 */
.btn-gray {
  background: rgba(255,255,255,0.15) !important;
  border: 1px solid rgba(255,255,255,0.2) !important;
  color: #fff !important;
  font-weight: 600 !important;
  border-radius: 12px !important;
}

/* All In 按钮 */
.btn-allin {
  background: linear-gradient(135deg, #e65100, #ff9800) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 700 !important;
  border-radius: 12px !important;
}

/* 动画 */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.slide-up-enter-from {
  transform: translateY(30px);
  opacity: 0;
}
</style>
