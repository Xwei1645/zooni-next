# Zooni Next 设计语言 v1（现行规范）

> 本规范定义 Zooni Next 全量 UI 的视觉与动效语言：颜色、圆角、间距、阴影、字阶、动效。
> 目标是让主窗口、选项窗口、科目窗口与全部组件共用同一套 token，消灭硬编码。
> Token 全部定义在 `src/index.css`（`:root` / `.dark` / `@theme inline`），业务 CSS 一律通过 `var(--*)` 引用。
> 本文档以当前代码为准（`d512eb0 style: 全局样式改进` 之后的落定状态），任何改样式时请同步更新本文档。

---

## 0. 设计原则

1. **冷静专注** — 低饱和冷灰蓝中性底色承载内容，钢蓝（`#4D869C`）仅用于主操作与选中态，不喧宾夺主。
2. **单一圆角语言** — 层级由圆角大小表达：控件 / 菜单项 / 弹层统一 10px，卡片 12px，胶囊 999px。
3. **玻璃表面** — 卡片统一「表面色 + 不透明度 + 12px 模糊」；浮空 dock 与菜单浮层使用 16px 模糊。
4. **有体系的动效** — 只有两套缓动：进入用 ease-out，退出用 ease-in；时长按层级分级，全部 token 化。
5. **无障碍优先** — 全局尊重 `prefers-reduced-motion`；焦点一律使用统一 ring。

---

## 1. 颜色（OKLCH）

### 1.1 中性色（冷灰蓝，与强调色同频）

| Token | Light | Dark | 用途 |
| --- | --- | --- | --- |
| `--background` | `oklch(0.985 0.004 250)` | `oklch(0.16 0.008 250)` | 窗口底 / 页面底 |
| `--foreground` | `oklch(0.145 0.006 250)` | `oklch(0.97 0.004 250)` | 主要文字 |
| `--card` | `oklch(0.969 0.005 250)` | `oklch(0.24 0.012 250)` | 卡片 / 面板表面 |
| `--card-foreground` | `oklch(0.145 0.006 250)` | `oklch(0.985 0.004 250)` | 卡片内文字 |
| `--popover` | `oklch(0.995 0.003 250)` | `oklch(0.21 0.01 250)` | 弹层 / 下拉 |
| `--popover-foreground` | `oklch(0.145 0.006 250)` | `oklch(0.985 0.004 250)` | 弹层文字 |
| `--secondary` | `oklch(0.968 0.005 250)` | `oklch(0.27 0.012 250)` | 次级按钮 / 按下态 |
| `--secondary-foreground` | `oklch(0.2 0.02 250)` | `oklch(0.97 0.004 250)` | 次级文字 |
| `--muted` | `oklch(0.968 0.005 250)` | `oklch(0.27 0.012 250)` | 弱化表面（hover / 分隔） |
| `--muted-foreground` | `oklch(0.5 0.02 250)` | `oklch(0.7 0.01 250)` | 次级文字 / 注释 |
| `--accent` | `oklch(0.955 0.01 250)` | `oklch(0.31 0.015 250)` | 高亮悬停 |
| `--accent-foreground` | `oklch(0.2 0.02 250)` | `oklch(0.98 0.004 250)` | 高亮文字 |
| `--border` | `oklch(0.905 0.006 250)` | `oklch(1 0 0 / 10%)` | 分隔线 / 描边 |
| `--input` | `oklch(0.905 0.006 250)` | `oklch(1 0 0 / 15%)` | 输入框底 |
| `--ring` | `oklch(0.64 0.08 225)` | `oklch(0.72 0.08 225)` | 焦点环 |

### 1.2 强调色：钢蓝 Steel Blue（`#4D869C`，hue ≈ 225）

| Token | Light | Dark | 用途 |
| --- | --- | --- | --- |
| `--primary` | `oklch(0.589 0.069 225)` | `oklch(0.78 0.07 225)` | 主按钮 / 开关选中 / 滑块轨道 |
| `--primary-foreground` | `oklch(0.985 0.002 225)` | `oklch(0.18 0.03 225)` | 主按钮文字 |

### 1.3 语义色

| Token | Light | Dark | 用途 |
| --- | --- | --- | --- |
| `--success` / `--success-foreground` | `oklch(0.6 0.14 150)` / `oklch(0.985 0.002 150)` | `oklch(0.7 0.15 150)` / `oklch(0.16 0.03 150)` | 成功状态 |
| `--warning` / `--warning-foreground` | `oklch(0.62 0.14 75)` / `oklch(0.985 0.002 75)` | `oklch(0.72 0.13 75)` / `oklch(0.16 0.03 75)` | 警告（toast 链接等） |
| `--info` / `--info-foreground` | `oklch(0.56 0.13 240)` / `oklch(0.985 0.002 240)` | `oklch(0.7 0.12 240)` / `oklch(0.16 0.03 240)` | 信息提示 |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | 危险操作 |

### 1.4 图表色板（蓝色谱系）

Light：`oklch(0.55 0.08 225)` / `oklch(0.6 0.09 245)` / `oklch(0.62 0.06 205)` / `oklch(0.68 0.08 225)` / `oklch(0.5 0.09 255)`
Dark 同谱提亮。

### 1.5 窗口底色约定

**三个窗口一律使用 `--background` 作为窗口底色。**

---

## 2. 圆角

基准 `--radius: 0.625rem`（10px）。Tailwind 工具类经由 `@theme inline` 映射，业务 CSS 使用语义别名。

> 注：`@theme inline` 中 `xl / 2xl / 3xl` 均折叠为 10px，`5xl / 6xl`（16px / 20px）仅为标准色板保留，当前未使用。

| 语义 Token | 值 | Tailwind 工具 | 用于 |
| --- | --- | --- | --- |
| `--radius-xs` | 2px | `rounded-xs` | 颜色指示条等微元素 |
| `--radius-control` | 10px | `rounded-lg` | 按钮、文本输入、选择器、编辑器工具、取色输入 |
| `--radius-item` | 10px | `rounded-2xl` | 菜单项、选择项、设置导航项、科目行 |
| `--radius-popover` | 10px | `rounded-3xl` | 下拉 / 菜单内容 |
| `--radius-card` | 12px | `rounded-4xl` | 作业卡片、编辑面板、设置分区、弹窗、关于卡片 |
| `--radius-pill` | 999px | `rounded-full` | 浮空 dock、拖拽把手、开关、滑块、分组标题圆点 |

**规则**：控件 / 菜单项 / 弹层 = 10px，卡片 / 面板 = 12px，胶囊 = 999px。

---

## 3. 间距（4px 尺度）

| Token | 值 | 用途示例 |
| --- | --- | --- |
| `--space-1` | 4px | 微间距、图标间距 |
| `--space-2` | 8px | 密集列表 gap、图标对间距 |
| `--space-3` | 12px | 网格 gap、工具栏内部 |
| `--space-4` | 16px | 卡片内边距、板面侧边距 |
| `--space-5` | 20px | 面板内边距 |
| `--space-6` | 24px | 板块间距、弹层留白 |
| `--space-7` | 28px | 设置面板上下边距 |
| `--space-8` | 32px | 设置面板侧边距 |
| `--space-10` | 40px | 板面顶部留白、标题栏高度、科目行高 |
| `--space-12` | 48px | 大留白、工具栏 / 编辑面板条高 |
| `--space-16` | 64px | 板面底部留白（避让工具栏） |

**约定**：板面 `padding: 40px 24px 96px`；作业网格 gap 12px；组距 16px；工具栏距右下角 16px；设置面板 `padding: 28px 32px`；设置导航宽 176px；编辑面板工具栏 / 底部条高 48px。

---

## 4. 阴影

统一使用前景色 OKLCH mix，明暗主题自动适配，不写死黑色。

| 语义 Token | 值 | Tailwind 工具 | 用于 |
| --- | --- | --- | --- |
| `--shadow-control` | `0 2px 8px` fg 10% | `shadow-sm` | 主按钮静态态、应用标记 |
| — | `0 4px 16px` fg 12% | `shadow-md` | 滑块 thumb、主按钮悬停 |
| `--shadow-panel` | `0 12px 32px` fg 16% | `shadow-lg` | 浮空 dock、菜单、下拉、编辑面板、取色器 |
| `--shadow-dialog` | `0 16px 48px` fg 22% | `shadow-xl` | 弹窗 |
| `--shadow-drawer` | `-12px 0 32px` fg 15% | — | 右侧抽屉 |

---

## 5. 字阶

| Token | 值 | 用于 |
| --- | --- | --- |
| `--text-caption` | 12px | 注释、三方库版本、许可文本 |
| `--text-note` | 13px | 次级说明、设置描述 |
| `--text-body` | 14px | 正文默认（按钮/菜单/控件） |
| `--text-subtitle` | 15px | 区块小标题（弹窗头部） |
| `--text-title` | 20px | 面板大标题（设置/关于） |
| `--text-display` | 24px | 作业分组标题（随 `--assignment-content-zoom` 缩放） |

---

## 6. 动效

### 6.1 缓动

| Token | 值 | 用于 |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | 所有进入/展开动画（spring 感） |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | 所有退出/收起动画 |
| `--ease-standard` | `cubic-bezier(0.33, 1, 0.68, 1)` | 通用过渡 |

### 6.2 时长分级

| Token | 值 | 场景 |
| --- | --- | --- |
| `--duration-fast` | 120ms | 微交互（折叠标签、退出微动画） |
| `--duration-base` | 160ms | 通用过渡（hover、菜单项、卡片动作浮现） |
| `--duration-slow` | 220ms | 弹层进入、抽屉、正文内容切换 |
| `--duration-slower` | 280ms | 布局 FLIP、窗口动画、toast |
| `--duration-xslow` | 340ms | 卡片 jelly 弹性反馈 |

### 6.3 标准模式

| 场景 | 进入 | 退出 |
| --- | --- | --- |
| 弹层/菜单 | fade + scale(0.96) 平移 | 反向 |
| 编辑器覆盖层 | fade + translateY(12px) scale(0.98) | 反向 + 收缩 |
| 卡片新增 | fade + translateY(4px) | — |
| 卡片更新 | jelly 弹性 + 内容交叉淡化 | — |
| 布局变化 | FLIP 位移动画（280ms, ease-out） | — |

### 6.4 无障碍

`index.css` 内置全局 `prefers-reduced-motion` 降级：所有动画/过渡时长压至 0.01ms，滚动改为即时。业务代码无需重复处理。

---

## 7. 通用约定

- **焦点环**：统一 `ring`（`ring-3 ring-ring/30`；`scroll-area` 用 `ring-ring/50`），自定义可聚焦元素用 `box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 30%, transparent)`。
- **玻璃表面配方**：卡片 `background: color-mix(in oklch, var(--card) calc(var(--card-background-opacity) * 100%), transparent); backdrop-filter: blur(12px)`；浮空 dock / 菜单浮层 `blur(16px)` + `popover 92%`。
- **输入框/选择器 = 有边框矩形**：`border: 1px solid var(--border)` + `background: var(--background)`，10px 圆角（`--radius-control`）。
- **主按钮**：`default` 变体带 `shadow-sm`、悬停 `shadow-md` 微浮起；圆形 dock 添加键按下呈 `scale(0.96)`。
- **图标尺寸**：标题栏 15px、菜单项 16px、操作按钮 16px、编辑器工具 14px（由 `size-*` 与 `[&_svg]:size-*` 控制）。
- **标题栏**：三窗口统一 40px 高、`border-bottom: 1px solid var(--border)`，并叠加 `primary 5%` 的品牌色淡染。
- **板面氛围**：作业板面叠加两枚 `primary` / `info` 低透明径向渐变，赋予品牌环境光。
- **卡片**：玻璃表面 + 发丝描边（`inset 0 0 0 1px fg 7%`）。
- **滚动条**：thumb 用 `foreground/15`，悬停 `foreground/25`。
- **选区/光标**：`::selection` 使用 `primary 22%`。
- **toast**：警告链接颜色使用 `var(--warning)`，不再硬编码。

---

## 8. 组件规范速查

| 组件 | 实现要点 |
| --- | --- |
| 按钮（`ui/button`） | 圆角 `--radius-control`(10px)；变体 default / outline / secondary / ghost / destructive / link；尺寸 default h-9、sm h-8、lg h-10、xs h-6、icon 36×36、icon-xs 24×24、icon-sm 32×32、icon-lg 40×40；default 带 `shadow-sm` 悬停 `shadow-md` |
| 文本输入（`ui/input`） | h-9、`border-border` + `bg-background`、`--radius-control`、焦点 ring |
| 选择器（`ui/select`） | trigger 同输入框（h-9 有边框矩形）；content `bg-popover` + `--radius-popover` + `shadow-lg`；item `--radius-item` |
| 开关 / 滑块（`ui/switch` / `ui/slider`） | 胶囊 `rounded-full`；选中态 primary；thumb 白底 + `shadow-md` |
| 菜单（`ui/dropdown-menu`） | content `bg-popover` + `--radius-popover` + `shadow-lg`；item `--radius-item` |
| 标题栏（三窗口统一） | 40px 高、`border-bottom: var(--border)`、`color-mix(primary 5%, background)` 品牌淡染；拖拽区图标 15px `--muted-foreground` |
| 设置分区（`.settings-section`） | `--radius-card` + `bg-card` + `padding: 16px 24px`，**无边框无阴影**；分区用 8px 卡片间距代替分隔线 |
| 编辑面板（`.assignment-composer`） | 宽 680px、`--radius-card` + `bg-card` + `--shadow-panel`；工具栏 / 底部条 48px 高，用 `color-mix(card 93%, fg)` 背景色与正文区分（**无分割线**）；正文区 224px 起 |
| 编辑器工具 | 工具键 `--radius-control`；字号输入 48×32 无边框透明、聚焦 ring；富文本工具与字号之间**无分隔符** |
| 编辑面板确认键 | 36×36、`--radius-control`（与左侧科目 select 同高）；科目 select 用默认有边框矩形并 `max-width: none` 撑满 |
| 科目列表 | 行 40px 高、`--radius-item`、悬停 `muted 45%`、编辑态 `primary 8%`；「新增」主色填充 |
| 浮空 dock（`.toolbar`） | `--radius-pill` 玻璃容器 + `blur(16px)` + `--shadow-panel` + `bg color-mix(background 94%, fg) × opacity`；添加键钢蓝填充、按下 `scale(0.96)` |
| 取色器 / 关于弹窗 / 抽屉 | 分别沿用 `--shadow-panel` / `--shadow-dialog` / `--shadow-drawer` |

---

## 9. 现状 → Token 变更映射表（历史）

> 以下为历次落地记录，仅作追溯。当前实现一律以第 1–8 章为准。

| 位置 | 现状 | 新 Token |
| --- | --- | --- |
| 作业卡片 / 编辑面板 / 设置分区 | `border-radius: 24px` | `var(--radius-card)`（现 12px） |
| 编辑器工具按钮 | `border-radius: 6px` | `var(--radius-control)`（现 10px） |
| 颜色指示条 | `border-radius: 2px` | `var(--radius-xs)` |
| 关于卡片 / 许可弹窗 / 应用标记 | `border-radius: 8px` | `var(--radius-control)` / `var(--radius-card)` |
| 编辑面板 / 取色器阴影 | `0 12px 28px …16%` | `var(--shadow-panel)`（现 32px，与 `shadow-lg` 一致） |
| 许可弹窗阴影 | `0 16px 48px …78%` | `var(--shadow-dialog)` |
| 抽屉阴影 | `-12px 0 32px …85%` | `var(--shadow-drawer)` |
| 选项窗口底色 | `var(--muted)` | `var(--background)` |
| 分散动画时长 100–360ms | 硬编码 | `var(--duration-*)` |
| 分散缓动 | 混用 ease-out/ease-in | `var(--ease-out)` / `var(--ease-in)` |
| reduced-motion | 仅 Assignments.css 局部 | 提升至 index.css 全局 |
| 硬编码字号 12/13/14/15/20/24px | 硬编码 | `var(--text-*)` |
| toast 警告链接色 | `oklch(0.49 0.13 75)` | `var(--warning)` |
| 强调色 | 恪守中性灰 | 钢蓝 `#4D869C`（`--primary`） |
| 编辑面板上下分割线 | `border-top/bottom` | 背景色区分（工具栏 / 底部 48px `card 93%` 条） |
| 科目选择器透明化 | `border-color: transparent` | 默认有边框矩形（`border-border` + `bg-background`） |
