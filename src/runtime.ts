// 运行时事实：这个进程是从哪个提交起来的、谁在托管它、重启该怎么做。
//
// 2026-09-05 的事故：3080 端口上跑的是几天前由别处启动的孤儿进程，更新把磁盘上的
// 源码和产物都换成了新版本，但进程还是旧代码，也没有任何 supervisor 会在它以 75
// 退出后把它拉起来——「立即重启」成了空话，刷新页面拿到的是新前端 + 旧宿主的混合体。
// 这里把两件事摆到状态里：① 运行中的 HEAD 与磁盘上的 HEAD 是否一致（stale）；
// ② 退出后由谁拉起（supervisor / 自拉起 / 只能手动）。

import { spawn } from 'node:child_process'
import { openSync } from 'node:fs'

/** 谁会在进程以 75 退出后把它拉起来 */
export type Supervisor = 'macapp' | 'systemd' | 'pm2' | 'custom' | 'none'

/** 「立即重启」实际会怎么执行 */
export type RestartMode =
  /** 以 75 退出，supervisor 拉起 */
  | 'supervisor'
  /** 没有 supervisor：先派生一份自己的分离副本等着接管端口，再以 75 退出 */
  | 'self-respawn'
  /** 没有 supervisor 且平台没有 /bin/sh：只能退出，请用户手动拉起 */
  | 'manual'

/** 环境变量名：外壳/supervisor 在拉起服务时设置，告知插件"我会负责重启" */
export const SUPERVISOR_ENV = 'DSH_SELF_UPDATE_SUPERVISOR'

/**
 * 从环境推断托管方。显式声明优先（外壳设 macapp；任何自定义 supervisor 设成非空值即算 custom），
 * 其次认 systemd / PM2 的指纹；都没有就是 none——别假装有人会拉起它。
 */
export function detectSupervisor(env: NodeJS.ProcessEnv = process.env): Supervisor {
  const declared = (env[SUPERVISOR_ENV] ?? '').trim().toLowerCase()
  if (declared !== '') {
    if (declared === 'macapp' || declared === 'systemd' || declared === 'pm2') return declared
    if (declared === 'none' || declared === '0' || declared === 'false') return 'none'
    return 'custom'
  }
  // systemd 给每个服务单元都设 INVOCATION_ID；JOURNAL_STREAM 只在 stdout 接 journald 时有
  if (env['INVOCATION_ID'] !== undefined && env['INVOCATION_ID'] !== '') return 'systemd'
  // PM2 托管的进程带 pm_id（0 也算）与 PM2_HOME
  if (env['pm_id'] !== undefined || env['PM2_HOME'] !== undefined) return 'pm2'
  return 'none'
}

export function resolveRestartMode(supervisor: Supervisor, platform: NodeJS.Platform = process.platform): RestartMode {
  if (supervisor !== 'none') return 'supervisor'
  return platform === 'win32' ? 'manual' : 'self-respawn'
}

/**
 * 自拉起用的命令：/bin/sh 等旧进程（$0）真正退出、端口释放后，exec 同一条 node 命令行。
 * 不能直接起新进程——端口还被旧进程占着，新进程会以 EADDRINUSE 死掉。
 * 参数逐个传给 sh，不做字符串拼接：路径里有空格也不会被拆。
 */
export function buildRespawnArgs(input: {
  pid: number
  execPath: string
  execArgv: readonly string[]
  argv: readonly string[]
}): string[] {
  return [
    '/bin/sh',
    '-c',
    'while kill -0 "$0" 2>/dev/null; do sleep 0.2; done; exec "$@"',
    String(input.pid),
    input.execPath,
    ...input.execArgv,
    ...input.argv,
  ]
}

/**
 * 派生分离的自拉起副本：cwd / env 原样继承，stdout+stderr 追加到 logPath（旧进程的
 * 日志句柄归外壳所有，拿不到）。派生失败就抛——调用方据此改走 manual 路径，不要在
 * 没人接管的情况下退出。
 */
export function spawnRespawner(logPath: string): void {
  const args = buildRespawnArgs({
    pid: process.pid,
    execPath: process.execPath,
    execArgv: process.execArgv,
    argv: process.argv.slice(1),
  })
  const log = openSync(logPath, 'a')
  const child = spawn(args[0]!, args.slice(1), {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: ['ignore', log, log],
  })
  child.unref()
}
