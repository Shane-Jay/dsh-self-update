# Show Your Plugins 发帖存档

标题：`DSH｜dsh-self-update｜git 源码安装的应用内自更新 + 原生 macOS 外壳`
分类：Show Your Plugins!（https://github.com/deepseek-ai/deepseek-harness/discussions/categories/show-your-plugins）

---

> 非官方项目，由社区成员独立开发和维护。

**项目地址：**
https://github.com/Shane-Jay/dsh-self-update

**项目介绍：**
给以 git 源码方式运行 DSH（`git clone` + `pnpm dsh web`）的用户补上缺失的更新途径：后台静默检查新版本，侧栏浮出提示，点开更新页一键执行 `git pull --ff-only → pnpm install → pnpm build`，逐步实时进度；工作区有未提交改动时拒绝更新（不丢你的本地改动），失败可一键回滚（另有命令行兜底）。

重启走「退出码 75 = 请求重启」的契约：systemd（`RestartForceExitStatus=75`）、PM2、以及附带的原生 macOS 外壳（Swift + WKWebView，非 Electron，菜单栏带「检查更新…」）都能自动拉起——即 #1231 / #2717 讨论过的那种统一重启契约的一个可用实现。

npm 全局安装的用户不适用（无 git 工作副本，插件会自动隐藏），这类场景请用 dsh-update-checker。

**截图：**

![更新页：版本对照 + 将执行的三步 + 一键开始更新](https://raw.githubusercontent.com/Shane-Jay/dsh-self-update/main/docs/assets/update-panel.png)

**安装：**

```bash
pnpm dsh plugin --profile web add dsh-self-update
```

npm：https://www.npmjs.com/package/dsh-self-update ｜ MIT，与 DeepSeek 官方无关联。
