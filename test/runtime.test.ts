// 运行时探测：托管方识别、重启方式、自拉起命令（用真 sh 跑：等旧进程退出后才 exec）。

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUPERVISOR_ENV, buildRespawnArgs, detectSupervisor, resolveRestartMode } from '../src/runtime.ts'
import { tmpDirTracked } from '../test-support/tmp'

describe('detectSupervisor', () => {
  it('显式声明优先：macapp / systemd / pm2 原样返回，其他非空值算 custom，none 系列算没有', () => {
    expect(detectSupervisor({ [SUPERVISOR_ENV]: 'macapp' })).toBe('macapp')
    expect(detectSupervisor({ [SUPERVISOR_ENV]: 'PM2' })).toBe('pm2')
    expect(detectSupervisor({ [SUPERVISOR_ENV]: 'launchd' })).toBe('custom')
    expect(detectSupervisor({ [SUPERVISOR_ENV]: 'none', INVOCATION_ID: 'x' })).toBe('none')
    expect(detectSupervisor({ [SUPERVISOR_ENV]: '0', pm_id: '3' })).toBe('none')
  })

  it('没声明就认指纹：systemd 的 INVOCATION_ID、PM2 的 pm_id/PM2_HOME；都没有 → none', () => {
    expect(detectSupervisor({ INVOCATION_ID: 'abc' })).toBe('systemd')
    expect(detectSupervisor({ pm_id: '0' })).toBe('pm2')
    expect(detectSupervisor({ PM2_HOME: '/home/x/.pm2' })).toBe('pm2')
    expect(detectSupervisor({ PATH: '/usr/bin' })).toBe('none')
  })
})

describe('resolveRestartMode', () => {
  it('有托管方就交给它；没有则 POSIX 自拉起、Windows 只能手动', () => {
    expect(resolveRestartMode('macapp')).toBe('supervisor')
    expect(resolveRestartMode('custom', 'win32')).toBe('supervisor')
    expect(resolveRestartMode('none', 'darwin')).toBe('self-respawn')
    expect(resolveRestartMode('none', 'linux')).toBe('self-respawn')
    expect(resolveRestartMode('none', 'win32')).toBe('manual')
  })
})

describe('buildRespawnArgs', () => {
  it('参数逐个传给 sh：$0 是旧 pid，$@ 是原样的 node 命令行（含 execArgv）', () => {
    const args = buildRespawnArgs({
      pid: 4242,
      execPath: '/opt/homebrew/bin/node',
      execArgv: ['--import', 'tsx/esm'],
      argv: ['apps/cli/src/bin.ts', 'web', '--no-open'],
    })
    expect(args.slice(0, 2)).toEqual(['/bin/sh', '-c'])
    expect(args[2]).toContain('kill -0 "$0"')
    expect(args[2]).toContain('exec "$@"')
    expect(args.slice(3)).toEqual([
      '4242', '/opt/homebrew/bin/node', '--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--no-open',
    ])
  })

  it('真跑一遍：旧进程活着时不动，它退出后才 exec 目标命令', async () => {
    const dir = tmpDirTracked('dsu-respawn-')
    const marker = join(dir, 'respawned')
    // 假装的旧进程：活 700ms
    const old = spawn('sleep', ['0.7'])
    await new Promise((r) => old.on('spawn', r))
    const args = buildRespawnArgs({
      pid: old.pid!,
      execPath: '/bin/sh',
      execArgv: [],
      argv: ['-c', `echo respawned > "${marker}"`],
    })
    const t0 = Date.now()
    const respawner = spawn(args[0]!, args.slice(1), { stdio: 'ignore' })

    // 旧进程还在的这段时间里，marker 不该出现
    await new Promise((r) => setTimeout(r, 300))
    expect(existsSync(marker)).toBe(false)

    await new Promise((r) => respawner.on('exit', r))
    expect(Date.now() - t0).toBeGreaterThanOrEqual(600)
    expect(readFileSync(marker, 'utf8').trim()).toBe('respawned')
  })
})
