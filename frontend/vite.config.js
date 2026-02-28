import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // 代理 REST API 请求到后端
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // 代理 Socket.IO 请求到后端
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true  // 开启 WebSocket 代理
      }
    }
  }
})
