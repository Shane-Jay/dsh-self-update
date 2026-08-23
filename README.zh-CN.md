<div align="center">

# dsh-self-update

[English](README.md) | **简体中文**

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) git 源码安装版的应用内自更新插件——附可选的原生 macOS 外壳。

[![npm version](https://img.shields.io/npm/v/dsh-self-update)](https://www.npmjs.com/package/dsh-self-update)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![DSH core](https://img.shields.io/badge/DSH-%3E%3D%200.1.0--rc.5-5B4CF0?style=flat-square)](https://www.npmjs.com/package/@deepseek-ai/dsh)

<img src="docs/assets/update-panel.png" alt="更新页：当前/新版本对照、将执行的三步、一键开始更新" width="760">

</div>

## 这是什么？

如果你是**以 git 源码方式**跑 DeepSeek Harness（`git clone` + `pnpm dsh web`）——自部署用户几乎都是这样——那么它没有任何内置的更新途径。每出一个新版本，都要手动 `git pull`、`pnpm install`、`pnpm build`、重启服务；一旦更坏了，还得自己翻旧提交回退。

**dsh-self-update 把这整个循环变成一个按钮。** 它是一个 harness 插件：

- **后台静默检查**（默认 6 小时一轮），也可随时手动检查——设置页或 macOS 菜单栏都行；
- 有新版本时**侧栏浮出一行「新版本 x.y.z ›」**，点开是更新页：版本对照 + 将要执行的三条命令，明明白白；
- **一键安装**：`git pull --ff-only` → `pnpm install` → `pnpm build:official`（官方品牌构建），逐步实时进度；
- **工作区有未提交改动或本地分叉时拒绝更新**——绝不替你丢改动；
- 失败时**一键回滚**（UI 挂掉时还有命令行兜底）；
- **重启闭环**：进程以**退出码 75** 退出（"请重启我"），由 systemd / PM2 / 自带 macOS 外壳自动拉起。

**不适用于你，如果**你是 `npm i -g @deepseek-ai/dsh` 全局安装的：没有 git 工作副本可更新，本插件会整体自动隐藏。请改用 npm 系更新器（如 `dsh-update-checker`）。

## 安装（任何平台）

```bash
cd <你的 deepseek-harness 检出目录>
pnpm dsh plugin --profile web add dsh-self-update
```

重启一次 dsh 服务即生效。零配置——插件以进程工作目录为 harness 检出（不一致时用插件 config `repoRoot` 覆盖）。

### 让「立即重启」闭环

「立即重启」按钮会让进程以**退出码 75** 退出。让你的 supervisor 认识它：

| 运行方式 | 配置 |
|---|---|
| systemd | `RestartForceExitStatus=75` |
| PM2 | `autorestart: true`（默认即可） |
| macOS 外壳（见下） | 内置 |
| 裸终端 | 自己再跑一次 `pnpm dsh web` |

## macOS 外壳（可选）

原生 Swift + WKWebView（非 Electron）的 DSH.app，托管 dsh 服务：点图标即界面，关窗不停服务，⌘Q 才停。菜单栏有 **「检查更新…」**，直接弹出应用内更新页；服务以 75 退出时自动拉起并重载页面。

```bash
node macapp/build-mac-app.mjs        # 需要 Xcode 命令行工具
# 输出 ~/Applications/DSH.app
```

首次打开需右键 → 打开（ad-hoc 签名，未做 Apple 公证）。

## 与同类项目的区别

| | 更新对象 | 平台 | 自动重启 |
|---|---|---|---|
| `dsh-update-checker` | npm 包 | 重启仅 Windows | ✅（Win） |
| `dsh-update-copilot` | 插件为主，core 只报告 | 全平台 | ❌ |
| **`dsh-self-update`** | **harness git 工作副本本体** | **全平台（重启含 macOS/Linux）** | **✅（退出码 75 契约）** |

退出码 75 的重启契约正是社区一直在向 harness core 呼吁的东西（见上游讨论 [#1231](https://github.com/deepseek-ai/deepseek-harness/discussions/1231)、[#2717](https://github.com/deepseek-ai/deepseek-harness/discussions/2717)）——本插件是它的一个可用实现。

## 接口契约

- **HTTP** — `/self-update/api/update/{status,check,install,rollback,restart}`；写路由要求 `Content-Type: application/json` + 本机 `Origin`（CSRF 防线）。
- **弹层事件** — 在 `window` 上派发 `dsh-self-update:open`（`detail: { check: true }` = 打开即检查）。macOS 菜单项就是通过 `evaluateJavaScript` 派发它。
- **重启** — 进程退出码 **75** = 请求重启；其他退出码一律按崩溃处理。
- **状态** — 落盘 `~/.dsh-self-update/update-state.json`。

## UI 挂掉时的兜底

更新后 dsh 起不来（插件与新版本接缝不兼容）时，Web UI 连同回滚按钮一起没了。从命令行退：

```bash
node scripts/rollback-harness.mjs          # 目标取状态文件里的 previousSha
node scripts/rollback-harness.mjs --sha <commit>   # 或自己指定提交
```

更新器每次安装前都会先记下 `previousSha`，就是为了这一刻。

## 开发

Sibling 布局（与 dsh 插件生态同款）：本仓库必须与 `deepseek-harness` 检出为**同级目录**——`@deepseek-ai/*` 开发依赖是 `link:../deepseek-harness/...`。

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build
```

updater 测试跑在真实（离线）git 仓库上，只有 install/build 两步换成了空跑命令。

## License

[MIT](LICENSE)

---

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
