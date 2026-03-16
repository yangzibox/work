年会抽奖系统 - 项目说明（给新会话参考用）
最后更新：2026-03-16

一、项目基本信息
───────────────────────────────
项目名称：年会抽奖桌面程序
技术栈：Tauri v2 (Rust) + React (Vite) + 纯 CSS
目标：年会现场全屏抽奖，支持键盘控制、多轮奖项、结果自动保存到 CSV
GitHub 仓库：https://github.com/yangzibox/work
主代码目录：lottery-app/

二、核心文件路径（重点关注 jsx 和 css）
───────────────────────────────────────────────
前端核心文件（src/ 目录下）：
  - src/App.jsx          → 几乎全部抽奖逻辑都在这里（状态、useEffect、抽奖、写入文件、界面切换）
  - src/App.css          → 所有界面样式（全屏背景、按钮、滚动文字、结果网格、tips 提示等）
  - src/index.css        → 全局样式（body、html 重置）
  - src/main.jsx         → React 入口（createRoot(<App />)）

Tauri 相关（src-tauri/ 目录下）：
  - src-tauri/tauri.conf.json         → Tauri 配置（窗口大小、标题、dev/build 命令、dev 重载等）
  - src-tauri/capabilities/           → v2 权限配置（必须开启 fs:write-text-file、exists、mkdir 等）
  - src-tauri/src/main.rs             → Tauri Rust 入口（窗口创建、插件注册）

数据 & 配置：
  - participants.csv                  → 参与者名单（根目录或 configuration/ 下，根据 settings.json 配置）
  - configuration/settings.json       → 奖项数量、名单路径、read_fields_max 等配置
  - 输出目录（运行时生成）：output/result_YYYYMMDDHHmmss.csv
    （实际路径：%APPDATA%/output/ 下，Windows AppLocalData）

三、当前状态 & 已完成功能
───────────────────────────────────────────────
✅ 基本功能已通，可完整跑一次抽奖流程
- 启动读配置 + 名单 → 主界面显示人数
- 点击“开始抽奖” → 重新读配置/名单 → 创建新 CSV（只写表头） → 进入全屏
- prize_guide → 空格开始滚动（80ms 间隔）
- rolling → 空格停止 → 随机抽本轮中奖者（排除已中奖） → 写入 CSV → 显示结果
- result → 空格继续下一轮或结束
- finish → “抽奖结束”
- Esc 退出全屏并重置

✅ 文件写入稳定
- 启动时不创建任何 CSV（已移除）
- 只在点击“开始抽奖”时新建带时间戳文件
- 每轮追加写入（open + append + write）
- 多次开始 → 每次新文件

四、踩过的坑 & 已修复
───────────────────────────────────────────────
1. 启动就创建空 CSV 文件
   → 原因：useEffect([isTauri]) 提前 initOutputFile
   → 解决：删除/注释该 useEffect，只保留 enterFullscreen 里的创建逻辑

2. 按空格无法停止滚动
   → 原因：定时器未正确清理
   → 解决：useEffect 依赖 [screen, participants] + return clearInterval

3. 文件写入权限失败（Tauri v2）
   → 解决：用 @tauri-apps/plugin-fs 的 writeTextFile + exists + open(append)

4. 人数显示 0
   → 解决：启动时保留一次读取 + 过滤无效行

五、未来计划（优先级排序）
───────────────────────────────────────────────
高优先（建议尽快实现）
- 内定人员：settings.json prizes 加 "pred": ["ID001"]，抽奖时强制中奖
- 不同奖项滚动速度：特等奖慢、低等奖快（动态 interval）
- 中奖音效 + confetti 动画

中优先
- 结束界面汇总所有中奖名单（按奖项分组表格）
- finish 界面显示文件路径 + 按钮打开文件夹

低优先
- 主界面“重置”按钮
- UI 美化（背景、Logo、奖项颜色区分）
- 滚动文字渐变/模糊效果

六、开发 & 打包常用命令
───────────────────────────────────────────────
开发模式：
  npm run tauri dev               （普通开发）
  npm run tauri dev -- --reload   （强制窗口重载，适合改 jsx/css 后）

打包：
  npm run tauri build             → 生成 exe/msi

测试建议：
- 打包后拷到另一台电脑
- 测试：文件写入、权限、全屏、空格响应、多次开始新文件

七、注意事项
───────────────────────────────────────────────
- Tauri v2 需要在 capabilities/ 里显式开启 fs 权限
- participants.csv 字段：至少 id, name，可选 职务, 部门
- settings.json 示例字段：grand-prize:1, 1st-prize:3, participants: "configuration/participants.csv"

欢迎继续开发！如果新会话需要快速上手，直接看这个文件即可。
作者：yangzibox
GitHub：https://github.com/yangzibox/work/tree/main/lottery-app