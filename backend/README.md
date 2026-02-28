# 德扑小局 - 后端服务

## 简介

基于 Node.js + Express + Socket.IO 的德州扑克后端服务，支持多人在线游戏。

## 技术栈

- **Node.js** >= 16.0.0
- **Express** 4.x - HTTP 服务器
- **Socket.IO** 4.x - 实时通信
- **pokersolver** - 牌型判断
- **uuid** - 生成唯一 ID

## 目录结构

```
backend/
├── package.json
├── server.js          # 入口：Express + Socket.IO 初始化、事件注册
├── src/
│   ├── GameRoom.js    # 房间/游戏核心逻辑（状态机、行动处理、结算）
│   ├── Deck.js        # 牌组（52张牌、洗牌、发牌）
│   ├── HandEvaluator.js  # 牌型判断（封装 pokersolver）
│   └── utils.js       # 工具函数（生成房间码等）
└── README.md
```

## 快速启动

```bash
cd backend
npm install
npm start          # 生产模式
npm run dev        # 开发模式（nodemon 自动重启）
```

服务默认监听 **http://localhost:3000**

## REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | /api/health | 健康检查 |
| POST | /api/login  | 玩家登录（返回 player + token） |
| GET  | /api/rooms  | 获取大厅房间列表 |

### POST /api/login

**请求：**
```json
{
  "nickname": "熊猫",
  "avatar": "🐼",
  "chips": 1000
}
```

**响应：**
```json
{
  "player": {
    "id": "p_abc12345",
    "nickname": "熊猫",
    "avatar": "🐼",
    "chips": 1000,
    "createdAt": 1706000000000
  },
  "token": "p_abc12345"
}
```

## Socket.IO 事件协议

### 客户端 → 服务端

| 事件 | 数据 | 说明 |
|------|------|------|
| `player:auth` | `{ playerId, player }` | 连接后认证 |
| `room:create` | `{ smallBlind, bigBlind, maxPlayers }` | 创建房间 |
| `room:join`   | `{ roomId, player }` | 加入房间 |
| `room:leave`  | - | 离开房间 |
| `room:kick`   | `{ targetPlayerId }` | 踢人（仅房主） |
| `room:start`  | - | 开始游戏（仅房主） |
| `player:action` | `{ type, amount? }` | 游戏行动（fold/call/check/raise） |
| `game:next_round` | - | 请求下一局 |

### 服务端 → 客户端

| 事件 | 数据 | 说明 |
|------|------|------|
| `player:auth:ok` | `{ player }` | 认证成功 |
| `room:created` | `{ room }` | 房间创建成功 |
| `room:update` | `{ room }` | 房间状态更新（广播） |
| `room:kicked` | `{ message }` | 被踢出房间 |
| `game:start` | `{ gameState }` | 游戏开始（含手牌） |
| `game:state` | `gameState` | 游戏状态更新（广播） |
| `game:result` | `roundResult` | 本局结算结果 |
| `player:action:log` | `{ msg }` | 行动日志（广播） |
| `player:disconnected` | `{ playerId, nickname }` | 玩家断线通知 |
| `error` | `{ message }` | 错误信息 |

## 游戏状态结构（gameState）

```js
{
  phase: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown',
  communityCards: ['Ah', 'Kd', ...],  // 公共牌
  pot: 180,              // 底池
  bigBlind: 20,
  smallBlind: 10,
  currentPlayerId: 'p_xxx',  // 当前行动玩家
  lastAction: { type, name, amount, playerId },
  players: [{
    id: 'p_xxx',
    nickname: '熊猫',
    avatar: '🐼',
    chips: 980,
    cards: ['Ah', 'Kd'],  // 只有本人可见，其他人显示 ['back', 'back']
    currentBet: 20,
    totalBet: 20,
    status: 'active' | 'folded' | 'allin',
    isDealer: false,
    isSmallBlind: true,
    isBigBlind: false,
    seatIndex: 0
  }]
}
```

## 本局结算结构（roundResult）

```js
{
  winner: {
    id: 'p_xxx',
    nickname: '熊猫',
    avatar: '🐼',
    handName: '同花顺',
    gain: 180
  },
  winners: ['p_xxx'],
  allHands: [{
    id: 'p_xxx',
    nickname: '熊猫',
    avatar: '🐼',
    cards: ['Ah', 'Kd'],
    handName: '同花顺',
    isWinner: true
  }],
  pot: 180,
  communityCards: [...]
}
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | 服务监听端口 |
