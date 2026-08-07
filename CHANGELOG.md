## [0.3.2] - 2026-08-07

### 🚀 Features

- 新增“窗口层级”选项
- 改进更新日志显示

### 🐛 Bug Fixes

- 修复主窗口元素高度
- 改进页面高度

### ⚙️ Miscellaneous Tasks

- 改进脚本
## [0.3.1] - 2026-08-07

### 🚀 Features

- 新增无作业占位符
- 新增“通用”导航
- 新增开机自启动功能

### 🐛 Bug Fixes

- 修复无作业时主窗口显示滚动条的问题

### ⚙️ Miscellaneous Tasks

- 优化 release 脚本
## [0.3.0] - 2026-08-06

### 🚀 Features

- 新增自动更新

### 🐛 Bug Fixes

- 修复选项界面滚动条的显示问题

### 📚 Documentation

- 改进设计文档

### 🎨 Styling

- 样式优化
- 删除渐变背景

### ⚙️ Miscellaneous Tasks

- Cargo.lock 版本更新
- 改进 release 脚本
- 改进 release 工作流
- 修改窗口标题
- 修复 release 脚本
## [0.2.0] - 2026-08-05

### 🐛 Bug Fixes

- 修复导航和内容区无法延伸到底部的问题

### 📚 Documentation

- 新增设计文档

### 🎨 Styling

- 改进圆角
- 全局样式改进
- 样式改进
## [0.1.2] - 2026-07-28

### ⚙️ Miscellaneous Tasks

- 改进发版逻辑
## [0.1.1] - 2026-07-28

### 🚀 Features

- 新增“关于”界面
- 添加日志功能
- 支持调整文本颜色
- 添加检查更新功能

### 🐛 Bug Fixes

- 使 Sooner 跟随主题
- 修复 CI 无法创建第三方库文件的问题

### ⚙️ Miscellaneous Tasks

- 改进 release 脚本
## [0.1.0] - 2026-07-27

### 🚀 Features

- Disable window decorations
- Add window grag handle
- Add toolbar
- Add menu
- Add option window
- Support double-click to toggle maximize on options window
- Add configurable window background opacity
- Add fullscreen toggle
- Improve fullscreen experience
- Add collapse toggle
- Add fullscreen animation
- Add animation switch
- Disable context menu
- Add exit app toggle
- Add subject window
- Center subjects window relative to main window
- Add assignments management system
- Add assignments board
- Improve assignments board
- Add toast notifications
- Add option to hide main window taskbar icon

### 🐛 Bug Fixes

- Disable buttons when reaching limit
- Ensure dropdown menu animation plays on first open
- Ensure windows could be unminimized correctly
- Improve fullscreen transition handling

### 🚜 Refactor

- Improve settings management and option window
- Use shadcn Slider instead of native range input
- Improve window placement state management
- Split window state updates into granular commands

### ⚡ Performance

- Code-split frontend entry by window to reduce initial bundle size
- Improve subjects window experience
- Improve scrolling and zoom experience

### 🎨 Styling

- Enhance toolbar with blur and transparency effects
- Adjust scrollbar width defaults
- Refine card background color

### ⚙️ Miscellaneous Tasks

- Setup shadcn and more
- Update app title
- Remove tauri-plugin-opener and enhance security
- Remove
- Defer main window visibility until settings are loaded
- Add license
- Replace Inter font
- Update product name and identifier
- Add build workflow
- Setup release workflow and git-cliff
