// 自更新：用真 git 仓库跑（不联网），只有 pnpm install/build 换成空跑命令。
// 覆盖：落后检测 / 快进安装 / 脏工作区拒绝 / 单飞 / 回滚。

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Updater } from '../src/updater.ts'
import { tmpDirTracked } from '../test-support/tmp'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    },
  }).trim()

/**
 * origin（裸库） + 一份工作副本 + 一份用于制造上游提交的副本。
 * 默认 package.json 带 "clean" script（对齐真实 harness）；scripts:false 造旧版本仓库。
 */
function makeRepos(version: string, opts: { scripts?: boolean } = {}): { origin: string; work: string; upstream: string } {
  const base = tmpDirTracked('dcl-updater-')
  const origin = join(base, 'origin.git')
  const seed = join(base, 'seed')
  const work = join(base, 'work')
  const upstream = join(base, 'upstream')

  execFileSync('git', ['init', '--bare', '-b', 'master', origin])
  execFileSync('git', ['init', '-b', 'master', seed])
  writeFileSync(join(seed, 'package.json'), JSON.stringify(pkgJson(version, opts.scripts !== false)))
  git(seed, 'add', '.')
  git(seed, 'commit', '-m', 'seed')
  git(seed, 'remote', 'add', 'origin', origin)
  git(seed, 'push', '-u', 'origin', 'master')

  execFileSync('git', ['clone', origin, work])
  execFileSync('git', ['clone', origin, upstream])
  return { origin, work, upstream }
}

function pkgJson(version: string, withScripts: boolean): Record<string, unknown> {
  return { name: 'h', version, ...(withScripts ? { scripts: { clean: 'true' } } : {}) }
}

/** 在上游造一个新提交并推上去 */
function pushUpstream(upstream: string, version: string, subject: string, opts: { scripts?: boolean } = {}): void {
  writeFileSync(join(upstream, 'package.json'), JSON.stringify(pkgJson(version, opts.scripts !== false)))
  git(upstream, 'add', '.')
  git(upstream, 'commit', '-m', subject)
  git(upstream, 'push', 'origin', 'master')
}

const stub = { install: ['git', '--version'], clean: ['git', '--version'], build: ['git', '--version'] }

describe('Updater', () => {
  it('check() 报出落后的提交数与目标版本；无更新时 available 为空', async () => {
    const { work, upstream } = makeRepos('1.0.0')
    const u = new Updater({ repoRoot: work, checkIntervalMs: 0, commands: stub })

    expect((await u.check()).available).toBeUndefined()

    pushUpstream(upstream, '1.1.0', 'release 1.1.0')
    const st = await u.check()
    expect(st.available?.behind).toBe(1)
    expect(st.available?.version).toBe('1.1.0')
    expect(st.available?.subject).toBe('release 1.1.0')
    expect(st.current.version).toBe('1.0.0')
    expect(st.dirty).toBe(false)
  })

  it('install() 快进到上游并标记待重启；工作副本真的更新了', async () => {
    const { work, upstream } = makeRepos('1.0.0')
    pushUpstream(upstream, '1.1.0', 'release 1.1.0')
    const u = new Updater({ repoRoot: work, checkIntervalMs: 0, commands: stub })
    await u.check()

    const st = await u.install()
    expect(st.steps.map((s) => s.state)).toEqual(['ok', 'ok', 'ok', 'ok'])
    expect(st.phase).toBe('ready-to-restart')
    expect(st.restartRequired).toBe(true)
    expect(st.previousSha).toBeTruthy()
    expect(JSON.parse(readFileSync(join(work, 'package.json'), 'utf8')).version).toBe('1.1.0')
    // 装完就没有"可用更新"了
    expect(st.available).toBeUndefined()
  })

  it('工作区脏时拒绝安装，且不动 HEAD', async () => {
    const { work, upstream } = makeRepos('1.0.0')
    pushUpstream(upstream, '1.1.0', 'x')
    const u = new Updater({ repoRoot: work, checkIntervalMs: 0, commands: stub })
    await u.check()
    const before = git(work, 'rev-parse', 'HEAD')
    writeFileSync(join(work, 'package.json'), JSON.stringify({ name: 'h', version: '1.0.0', local: true }))

    const st = await u.install()
    expect(st.phase).toBe('failed')
    expect(st.lastError).toContain('未提交改动')
    expect(st.steps).toEqual([])
    expect(git(work, 'rev-parse', 'HEAD')).toBe(before) // 没有偷偷快进
    expect(JSON.parse(readFileSync(join(work, 'package.json'), 'utf8')).local).toBe(true)
  })

  it('单飞：安装期间再次调用不会跑第二遍', async () => {
    const { work, upstream } = makeRepos('1.0.0')
    pushUpstream(upstream, '1.1.0', 'x')
    const u = new Updater({ repoRoot: work, checkIntervalMs: 0, commands: stub })
    await u.check()

    const first = u.install()
    const second = await u.install() // 同步就该被 busy 挡回来
    expect(second.phase).toBe('installing')
    const done = await first
    expect(done.phase).toBe('ready-to-restart')
    expect(done.steps.filter((s) => s.id === 'pull')).toHaveLength(1)
  })

  it('rollback() 回到安装前的提交', async () => {
    const { work, upstream } = makeRepos('1.0.0')
    pushUpstream(upstream, '1.1.0', 'x')
    const u = new Updater({ repoRoot: work, checkIntervalMs: 0, commands: stub })
    await u.check()
    const before = git(work, 'rev-parse', 'HEAD')
    await u.install()
    expect(git(work, 'rev-parse', 'HEAD')).not.toBe(before)

    const st = await u.rollback()
    expect(st.steps.map((s) => s.state)).toEqual(['ok', 'ok', 'ok', 'ok'])
    expect(git(work, 'rev-parse', 'HEAD')).toBe(before)
    expect(JSON.parse(readFileSync(join(work, 'package.json'), 'utf8')).version).toBe('1.0.0')
  })

  it('状态跨进程留痕：待重启标记落盘，新实例读得到，clear 后归零', async () => {
    const { work, upstream } = makeRepos('1.0.0')
    pushUpstream(upstream, '1.1.0', 'x')
    const stateFile = join(tmpDirTracked('dcl-updater-state-'), 'update-state.json')
    const u = new Updater({ repoRoot: work, checkIntervalMs: 0, stateFile, commands: stub })
    await u.check()
    await u.install()

    const reborn = new Updater({ repoRoot: work, checkIntervalMs: 0, stateFile, commands: stub })
    expect((await reborn.status()).restartRequired).toBe(true)
    reborn.clearRestartFlag()
    expect((await reborn.status()).restartRequired).toBe(false)
    expect((await new Updater({ repoRoot: work, checkIntervalMs: 0, stateFile, commands: stub }).status()).phase).toBe('idle')
  })
})

describe('Updater：清理旧产物这一步', () => {
  it('目标仓库有 clean script 时，在 install 之后、build 之前真的执行', async () => {
    const { work, upstream } = makeRepos('1.0.0')
    pushUpstream(upstream, '1.1.0', 'x')
    const u = new Updater({
      repoRoot: work,
      checkIntervalMs: 0,
      // clean 步留下可验证的痕迹：git tag 只有真跑了才会存在
      commands: { ...stub, clean: ['git', 'tag', 'clean-ran'] },
    })
    await u.check()

    const st = await u.install()
    expect(st.phase).toBe('ready-to-restart')
    expect(st.steps.map((s) => s.id)).toEqual(['pull', 'install', 'clean', 'build'])
    expect(st.steps.find((s) => s.id === 'clean')?.state).toBe('ok')
    expect(git(work, 'tag', '--list')).toBe('clean-ran')
  })

  it('旧版本 harness 没有 clean script：跳过并留说明，更新照样成功', async () => {
    const { work, upstream } = makeRepos('1.0.0', { scripts: false })
    pushUpstream(upstream, '1.1.0', 'x', { scripts: false })
    // 真跑这条命令必然失败——用它证明"跳过"是真跳过，不是跑了个空
    const u = new Updater({
      repoRoot: work,
      checkIntervalMs: 0,
      commands: { ...stub, clean: ['git', 'no-such-subcommand'] },
    })
    await u.check()

    const st = await u.install()
    expect(st.phase).toBe('ready-to-restart')
    expect(st.restartRequired).toBe(true)
    const clean = st.steps.find((s) => s.id === 'clean')
    expect(clean?.state).toBe('skipped')
    expect(clean?.tail).toContain('clean')
    expect(st.steps.find((s) => s.id === 'build')?.state).toBe('ok')
  })

  it('clean 失败 = 整次更新失败：不能带着旧产物往下构建', async () => {
    const { work, upstream } = makeRepos('1.0.0')
    pushUpstream(upstream, '1.1.0', 'x')
    const u = new Updater({
      repoRoot: work,
      checkIntervalMs: 0,
      commands: { ...stub, clean: ['git', 'no-such-subcommand'] },
    })
    await u.check()

    const st = await u.install()
    expect(st.phase).toBe('failed')
    expect(st.restartRequired).toBe(false)
    expect(st.steps.map((s) => s.state)).toEqual(['ok', 'ok', 'failed', 'skipped'])
    expect(st.lastError).toContain('清理旧产物')
    expect(st.available).toBeUndefined() // HEAD 已快进，别再说"有更新"
  })
})

describe('Updater：安装失败后的状态自洽', () => {
  it('build 步失败时 HEAD 已经快进——available 必须重算，不能还写着落后 N 个提交', async () => {
    const { work, upstream } = makeRepos('1.0.0')
    pushUpstream(upstream, '1.1.0', 'x')
    // pull 走真 git（会成功），build 用一条必然失败的命令
    const u = new Updater({
      repoRoot: work,
      checkIntervalMs: 0,
      commands: { ...stub, build: ['git', 'no-such-subcommand'] },
    })
    await u.check()
    expect((await u.status()).available?.behind).toBe(1)

    const st = await u.install()
    expect(st.phase).toBe('failed')
    expect(st.steps.map((s) => s.state)).toEqual(['ok', 'ok', 'ok', 'failed'])
    expect(st.current.version).toBe('1.1.0') // 源码已经是新的了
    expect(st.available).toBeUndefined()     // 所以不该再说"有更新"
  })
})
