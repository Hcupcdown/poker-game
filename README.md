# 德扑小局 🃏

一个基于 Vue3 + Node.js 的多人在线德州扑克游戏。

## 技术栈

| 端 | 技术 |
|----|------|
| 前端 | Vue3 + Vite + Vant4 + Pinia + Vue Router + Socket.IO Client |
| 后端 | Node.js + Express + Socket.IO + pokersolver |

## 目录结构

```
poker-game/
├── frontend/     # 前端（Vue3）
└── backend/      # 后端（Node.js）
```

## 快速启动

### 1. 启动后端

```bash
cd backend
npm install
npm run dev    # 开发模式（nodemon 自动重启）
# 或
npm start      # 生产模式
```

后端默认运行在 **http://localhost:3000**

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认运行在 **http://localhost:5173**

> 前端开发服务器已配置代理，`/api` 和 `/socket.io` 请求自动转发到 `localhost:3000`。

## 游戏玩法

1. **登录** → 输入昵称、选头像、选初始筹码
2. **大厅** → 创建房间（设置盲注/人数）或输入 6 位房间码加入
3. **等待室** → 等待玩家加入，房主点击"开始游戏"
4. **游戏** → 德州扑克标准玩法（preflop → flop → turn → river → showdown）
   - 行动：弃牌（fold）/ 看牌（check）/ 跟注（call）/ 加注（raise）
   - 30秒超时自动弃牌
   - 支持全押（all-in）

## 后端 API

详见 [backend/README.md](./backend/README.md)

## 开发说明

- 前端通过 Socket.IO 与后端实时通信
- 所有游戏状态由后端维护，前端只做展示
- 玩家手牌只对本人可见，其他人显示牌背
- 使用 pokersolver 库进行牌型判断与比较
