# dsh-self-update

In-app self-update for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) **git-source installs** — check, one-click update (`git pull --ff-only` → `pnpm install` → `pnpm build`), failure rollback, and a restart contract — plus an **optional native macOS shell** (WKWebView, no Electron) with a "Check for Updates…" menu item.

DeepSeek Harness 应用内自更新插件（git 源码安装版）：检查 / 一键更新 / 失败回滚 / 重启闭环，附可选的原生 macOS 外壳。

> **适用范围**：以 git 源码方式安装并运行 harness（`git clone` + `pnpm dsh web`）的用户。
> npm 全局安装（`npm i -g @deepseek-ai/dsh`）的用户请使用 npm 系的更新器（如 dsh-update-checker）——本插件检测不到 git 工作副本时会自动隐藏。

**我只用 Web UI（任何平台）** → [§ 安装插件](#安装插件任何平台)
**我用 macOS，想要原生 App** → [§ macOS 外壳（可选）](#macos-外壳可选)

## 功能

- 后台静默检查（默认 6 小时一轮）+ 手动检查（设置页「DSH 版本」行 / macOS 菜单）
- 有新版本时侧栏浮出一行「新版本 x.y.z ›」，点开更新页：版本对照、将执行的三步、开始/忽略
- 更新三步实时进度；失败自动记录并可一键回滚到更新前的提交
- 装完一键重启：进程以**退出码 75** 退出，由 supervisor / macOS 外壳自动拉起
- 工作区有未提交改动或本地分叉时拒绝更新（不替你丢改动）

## 安装插件（任何平台）

```bash
cd <deepseek-harness>
pnpm dsh plugin --profile web add dsh-self-update
```

重启 dsh 服务生效。无需其他配置；插件自动以进程 cwd 作为 harness 工作副本（可用插件 config `repoRoot` 覆盖）。

让「立即重启」按钮闭环（进程退出码 75 = 请求重启）：

- **systemd**：`RestartForceExitStatus=75`
- **PM2**：`autorestart: true`（默认即可）
- **macOS 外壳**：内置，见下节
- 裸终端：点完重启自己再 `pnpm dsh web` 一次

## macOS 外壳（可选）

原生 Swift + WKWebView 的 DSH.app：点图标即界面，关窗不停服务，⌘Q 才停；
菜单「DSH → 检查更新…」直接弹出应用内更新页；服务以 75 退出时自动拉起并重载页面。

```bash
node macapp/build-mac-app.mjs        # 需要 Xcode 命令行工具；默认输出 ~/Applications/DSH.app
```

首次打开需右键 → 打开（ad-hoc 签名，未做 Apple 公证）。

## 与同类项目的区别

| | 更新对象 | 平台 | 自动重启 |
|---|---|---|---|
| dsh-update-checker | npm 包 | 重启仅 Windows | ✅(Win) |
| dsh-update-copilot | 插件为主，core 只报告 | 全平台 | ❌ |
| **dsh-self-update** | **harness git 工作副本** | **全平台（重启含 macOS/Linux）** | **✅（退出码 75 契约）** |

## 接口契约

- HTTP：`/self-update/api/update/{status,check,install,rollback,restart}`（写路由要求 JSON content-type + 本机 Origin）
- 弹层事件：`window` 上派发 `dsh-self-update:open`（`detail.check: true` = 打开即检查）——macOS 外壳菜单走的就是它
- 重启：进程退出码 **75** = 请求重启（呼应上游 [#1231](https://github.com/deepseek-ai/deepseek-harness/discussions/1231) / [#2717](https://github.com/deepseek-ai/deepseek-harness/discussions/2717) 对统一重启契约的讨论）
- 状态落盘：`~/.dsh-self-update/update-state.json`

## 兜底

更新后 dsh 起不来（UI 连同回滚按钮一起没了）时，从命令行退回：

```bash
node scripts/rollback-harness.mjs        # 目标取落盘的 previousSha；--sha <commit> 可指定
```

## 开发

Sibling 布局（与 dsh 插件生态同款）：本仓库须与 `deepseek-harness` 检出为同级目录，`@deepseek-ai/*` 依赖是 `link:../deepseek-harness/...`。

```bash
pnpm install && pnpm typecheck && pnpm test && pnpm build
```

## License

MIT
