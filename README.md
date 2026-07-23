# Zen Tab

一个简洁、可高度自定义的浏览器新标签页仪表盘，以 Chrome 扩展形式运行。

---

## 功能特性

### 组件系统
- **时钟** — 实时时间与日期显示
- **快捷链接** — 可拖放排列的独立链接，支持自定义图标、Emoji 或上传图片
- **便签** — 本地文本便签，支持字体大小调节，自动保存
- **日历待办** — 月视图 / 周视图切换，支持按日期管理任务
- **天气** — 基于 Open-Meteo 的实时天气，自动定位城市，含 7 天预报
- **番茄钟** — 专注计时器，支持自定义时长，可随时切换专注 / 休息模式
- **GitHub 趋势** — 每日热门仓库列表
- **网页嵌入** — 在 iframe 中嵌入任意网页

### 界面与主题
- 三套主题：**深色 / 浅色 / 莫奈**（莫奈主题含 6 种色调）
- 主题切换带 clip-path 涟漪动画，色彩变量平滑过渡
- 自定义背景：上传图片，支持模糊、遮罩、亮度调节
- 背景取色：K-means 算法自动从背景图提取主色调，动态调整全局配色

### 布局与交互
- 自由拖拽定位，支持碰撞检测与自动避让
- 四角缩放调整组件大小
- 磁吸布局：自动向上紧凑排列
- 长按空白区域或组件进入编辑模式
- 整理布局一键重排
- 纯净模式：隐藏所有组件，仅显示时钟与搜索框

### 其他
- 双语支持：中文 / English，实时切换
- 搜索引擎切换：Google / Bing / DuckDuckGo / 百度，Tab 键快速轮换
- 命令面板（`Ctrl+K`）
- 右键菜单：编辑、复制链接、移至最前、删除
- 布局导出为 JSON 文件

---

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+K` | 打开命令面板 |
| `Ctrl+A` | 打开组件库 |
| `Ctrl+M` | 切换主题 |
| `Ctrl+E` | 进入 / 退出编辑模式 |
| `Ctrl+P` | 进入 / 退出纯净模式 |
| `/` | 聚焦搜索框 |
| `Esc` | 关闭当前面板 / 退出模式 |
| `Tab`（搜索框内） | 切换搜索引擎 |

---

## 安装方式

### 开发者模式安装（推荐）

1. 克隆或下载本仓库
   ```bash
   git clone https://github.com/Coveduoji/zen-tab.git
   ```
2. 打开 Chrome，地址栏访问 `chrome://extensions`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择项目根目录
5. 打开新标签页即可使用

> **注意**：需要准备三张图标文件放入 `icons/` 目录：`icon16.png`、`icon48.png`、`icon128.png`

---

## 项目结构

```
zen-tab/
├── manifest.json          # Chrome 扩展清单（Manifest V3）
├── newtab.html            # 新标签页入口
├── style.css              # 全局样式
├── icons/                 # 扩展图标
│
└── js/
    ├── registry.js        # 组件注册表与目录（REG / CATALOG）
    ├── i18n.js            # 国际化（中 / 英双语）
    ├── utils.js           # 工具函数（esc / normalizeUrl / genId 等）
    ├── layout.js          # 布局引擎（碰撞检测 / 紧凑排列 / Timer Registry）
    ├── state.js           # 状态管理（loadState / saveState）
    ├── theme.js           # 主题系统（切换动画 / 背景 / 调色板提取）
    ├── main.js            # 入口，串联初始化流程
    │
    ├── ui/
    │   ├── toast.js       # 通知与确认弹窗
    │   ├── search.js      # 搜索引擎切换器
    │   ├── editmode.js    # 编辑模式与网格背景
    │   ├── render.js      # 组件渲染、拖拽、缩放
    │   ├── linkmodal.js   # 链接编辑弹窗
    │   ├── cmdpalette.js  # 命令面板
    │   ├── puremode.js    # 纯净模式
    │   ├── settings.js    # 设置面板与组件库
    │   └── panels.js      # FAB / 右键菜单 / 快捷键 / 顶部时钟
    │
    └── widgets/
        ├── clock.js
        ├── link.js
        ├── notes.js
        ├── todo.js
        ├── weather.js
        ├── pomodoro.js
        ├── embed.js
        └── gtrend.js
```

---

## 数据存储

所有数据存储在浏览器 `localStorage` 中：

| Key | 内容 |
|---|---|
| `dash_v3` | 主状态（组件布局 + 设置），大图片替换为占位符 |
| `dash_bg_img` | 背景图片 base64（单独存储以控制主 key 大小） |
| `dash_limg_<id>` | 链接组件自定义图片 base64 |

存储版本号为 `3`，数据结构变更时会自动迁移而不丢失用户数据。

---

## 技术说明

- 纯原生 JS + CSS，无构建工具，无框架依赖
- 布局引擎自研，不依赖 Muuri 等第三方库
- 主题切换使用 CSS `@property` 注册颜色变量，配合 `theme-animating` 类实现 1000ms 平滑过渡
- 背景取色使用 Canvas + K-means 聚类算法（k=6）提取主色调
- 遵循 Manifest V3 CSP，所有脚本本地加载

---

## License

MIT
