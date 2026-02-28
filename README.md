# 🃏 德扑小局 - Online Poker Game

基于 **Vue 3 + Vite + Socket.IO** 的手机端德州扑克网页小游戏，支持多人在线实时对战。

## 功能特性

- 📱 **手机端适配**：专为移动端设计，竖屏布局，操作友好
- 🏠 **房间系统**：创建/加入房间，6位邀请码分享
- 🎮 **完整牌桌**：最多9人、环绕座位布局、实时状态同步
- ⏱ **倒计时**：每位玩家30秒行动时间，超时自动弃牌
- 💰 **加注系统**：滑块调节加注额，快捷预设（2BB/½池/全池/全押）
- 🃏 **手牌保密**：服务端下发，对手只见背面
- 🏆 **结算展示**：摊牌动画、手牌类型、底池分配

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | Vue 3 + Vite |
| UI 组件库 | Vant 4（移动端） |
| 路由 | Vue Router 4 |
| 状态管理 | Pinia |
| 实时通信 | Socket.IO Client |
| 后端（规划中） | Node.js + Express + Socket.IO |

## 快速开始

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173

## 项目结构

```
poker-game/
└── frontend/
    ├── src/
    │   ├── main.js
    │   ├── App.vue
    │   ├── pages/
    │   │   ├── LoginPage.vue   # 登录页（昵称+头像+筹码选择）
    │   │   ├── LobbyPage.vue   # 大厅（创建/加入房间）
    │   │   ├── RoomPage.vue    # 等待室（玩家列表+房主开始）
    │   │   └── GamePage.vue    # 游戏牌桌（完整对战界面）
    │   ├── stores/
    │   │   └── gameStore.js    # Pinia 全局状态
    │   └── utils/
    │       └── cardUtils.js    # 牌面工具函数
    └── package.json
```

## 页面路由

| 路径 | 页面 |
|---|---|
| /login | 登录页 |
| /lobby | 游戏大厅 |
| /room/:id | 等待室 |
| /game/:id | 游戏牌桌 |

## 开发计划

- [x] 前端 UI（4个页面全部完成）
- [ ] 后端游戏引擎（Node.js + Socket.IO）
- [ ] 多人实时同步
- [ ] 断线重连
- [ ] 牌型判断（pokersolver）
- [ ] 边池计算
- [ ] 部署上线
