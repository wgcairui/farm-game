# 技术选型清单

## 一、引擎：Cocos Creator 2D

**为什么选 Cocos**：
- 微信小游戏支持最成熟，国内同类游戏首选
- 一套代码导出小程序 + iOS + Android，节省 50% 工作量
- TypeScript 一等公民，编辑器可视化
- 2D 性能经过大量商业项目验证

**版本**：Cocos Creator 3.8.x LTS（最新稳定版）

**引擎授权**：
- 个人学习 / 年营收 < 100 万：免费
- 年营收 100-500 万：约 1.5 万/年
- 年营收 > 500 万：约 3 万/年
- **MVP 阶段不用付钱**，等赚钱再谈

---

## 二、语言：TypeScript

理由：
- Cocos Creator 原生支持 TS
- 类型系统避免运行时 bug
- 重构友好，Phase 2 扩展时收益大

---

## 三、Cocos 项目结构

```
scripts/
├── core/                   # 全局单例
│   ├── GameApp.ts          # 游戏启动 + 模块注册
│   ├── EventBus.ts         # 事件总线
│   ├── TimeManager.ts      # 时间管理（含 Phase 2 校时）
│   └── SaveManager.ts      # 存档读写
├── systems/                # 业务系统
│   ├── FarmSystem.ts       # 地块 / 作物
│   ├── ShopSystem.ts       # 商店
│   ├── InventorySystem.ts  # 背包 / 仓库
│   ├── EconomySystem.ts    # 金币 / 钻石
│   └── CropConfig.ts       # 作物配置表
├── ui/                     # UI 控制器
│   ├── FarmView.ts         # 农场场景
│   ├── ShopView.ts
│   ├── InventoryView.ts
│   ├── HUDView.ts          # 顶部资源栏
│   └── ToastView.ts
└── utils/
    ├── Logger.ts
    ├── Random.ts           # 种子随机（防作弊）
    └── Validators.ts
```

**核心原则**：
- UI 层只读状态 + 发事件，不改状态
- 系统层改状态 + 发事件
- 单向数据流，可调试

---

## 四、必备 Cocos 插件

| 插件 | 用途 | 必装？ |
|------|------|--------|
| AssetsManager | 资源热更新 | ✅ Phase 2+ |
| AudioSource | 音效管理 | ✅ |
| Tween | 补间动画 | ✅ |
| LabelOutline | 文字描边 | 可选 |
| Spine / DragonBones | 骨骼动画 | Phase 2+ |

---

## 五、服务端（Phase 2 接）

| 方案 | 适用 | 价格 |
|------|------|------|
| **LeanCloud** | 国内服，好友/排行榜现成 | 免费版够用，付费 ¥30/月起 |
| Firebase | 海外服 | 免费配额够用 |
| 自建 Node + Socket.io | 完全可控 | 服务器成本 ¥50/月起 |

**推荐**：MVP 阶段 0 服务端，**全部数据走本地存档**。Phase 2 再接 LeanCloud。

---

## 六、工具链

| 用途 | 工具 |
|------|------|
| 版本控制 | Git |
| 包管理 | npm 或 pnpm |
| 美术 | Aseprite（像素）/ Photoshop / Figma（UI） |
| 动画 | DragonBones（推荐）或 Spine |
| 音频 | BFXR（音效）+ 网易云音乐/免费 BGM |
| 协作 | Trello / Notion / 飞书 |
| CI/CD（Phase 3+） | Cocos 自带构建 + 微信开发者工具 |

---

## 七、性能预算

| 指标 | 目标 |
|------|------|
| 首包大小（微信） | ≤ 4 MB |
| 首屏加载时间 | ≤ 3s |
| 帧率（30 作物同时） | ≥ 30 FPS |
| 内存占用 | ≤ 200 MB |
| 启动时间 | ≤ 2s |

**关键优化**：
- 纹理压缩（ASTC / ETC2）
- 图集打包（TexturePacker）
- 资源按场景分包加载
- 动画对象池

---

## 八、必须引入的第三方库

| 库 | 用途 | 备注 |
|---|------|------|
| `eventemitter3` | 事件总线（备用） | Cocos 自带 EventTarget 够用 |
| `uuid` | 生成玩家 id | 或用 `crypto.randomUUID()` |
| `dayjs` | 时间格式化 | Phase 2+ 用 |
| `leancloud-storage` | 服务端 SDK | Phase 2 接入 |

**原则**：能不依赖就别装。Cocos 自带的优先用。

---

## 九、目录命名 & 代码规范

- 文件名：PascalCase（大驼峰）`FarmSystem.ts`
- 类名：PascalCase
- 方法名：camelCase
- 常量：UPPER_SNAKE
- 私有字段：`_` 前缀 `_coins`
- 事件名：`模块_动作` 命名 `plot_planted` `coins_changed`

---

## 十、开发环境

| 工具 | 版本 |
|------|------|
| Node.js | ≥ 18 LTS |
| Cocos Dashboard | 最新 |
| 微信开发者工具 | 最新 |
| Xcode | 15+（Phase 4） |
| Android Studio | Hedgehog+（Phase 4） |
| VSCode + Cocos 插件 | 推荐 |

---

## 十一、风险点 Checklist（每次发版前过一遍）

- [ ] 首包 ≤ 4 MB
- [ ] 杀进程后存档可恢复
- [ ] 时间戳改到 2030 年不会刷钱（本地校验 + Phase 2 服务端校时）
- [ ] 仓库满时收获不丢失
- [ ] 低端机（红米 Note 级别）30 作物不卡
- [ ] 没有 console.log 漏在生产