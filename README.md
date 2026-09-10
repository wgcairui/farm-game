# Farm Game

类似 QQ 经典农场的 2D 社交休闲游戏。先做微信小程序，再移植 iOS / Android。

## 技术栈

- 引擎：Cocos Creator 2D（待定 LTS 版本）
- 语言：TypeScript
- 服务端：LeanCloud（中国服）或 Firebase（海外服）
- 美术：2D 卡通，45 度斜俯视角
- 状态机：作物生长 / 任务 / 每日重置

## 目录结构

```
farm-game/
├── assets/                  # Cocos 资源（图片、音频、prefab）
│   ├── sprites/             # 贴图
│   ├── audio/               # 音效 / BGM
│   └── fonts/               # 字体
├── scenes/                  # Cocos 场景文件
├── prefab/                  # 预制体
├── scripts/                 # TypeScript 脚本
│   ├── core/                # 全局单例：GameApp、EventBus、TimeManager
│   ├── systems/             # 业务系统：FarmSystem、ShopSystem、InventorySystem
│   ├── ui/                  # UI 控制器
│   └── utils/               # 工具函数
├── docs/                    # 设计文档（本目录）
└── project.json             # Cocos 项目配置
```

## 文档索引

- [功能清单 (MVP)](./mvp-features.md)
- [数据表设计](./data-schema.md)
- [技术选型清单](./tech-stack.md)

## 路线

1. **Phase 1（4-6 周）单机 MVP** — 种/长/收/卖 + 存档
2. **Phase 2（3-4 周）社交版** — 好友 + 偷菜 + 排行榜
3. **Phase 3（2-3 周）小程序上线**
4. **Phase 4（3-4 周）iOS / Android 移植**