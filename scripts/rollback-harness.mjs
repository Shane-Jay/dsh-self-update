#!/usr/bin/env node
// 命令行回滚兜底：把 harness 退回自更新前的那个提交。
//
//   node scripts/rollback-harness.mjs [--sha <commit>] [--dry-run]
//
// 什么时候用：应用内更新装完、重启后 dsh 起不来（插件与新版本接缝不兼容），
// 这时 Web UI 连同里面的「回滚」按钮一起没了，只能从命令行退。
// 目标提交默认取自更新器落盘的 previousSha（~/.dsh-self-update/update-state.json）。

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? undefined : argv[i + 1]
}
const dryRun = argv.includes('--dry-run')

const harnessRoot = resolve(flag('harness') ?? process.env.DSH_HARNESS_ROOT ?? join(repoRoot, '..', 'deepseek-harness'))
const stateFile = join(process.env.DSH_SELF_UPDATE_DATA_DIR ?? join(homedir(), '.dsh-self-update'), 'update-state.json')

let sha = flag('sha')
if (sha === undefined) {
  if (!existsSync(stateFile)) {
    console.error(`✗ 找不到 ${stateFile}，无法确定回滚目标。用 --sha <commit> 指定。`)
    process.exit(1)
  }
  sha = JSON.parse(readFileSync(stateFile, 'utf8')).previousSha
  if (typeof sha !== 'string' || sha === '') {
    console.error('✗ 状态文件里没有 previousSha（可能从未通过应用内更新升级过）。用 --sha <commit> 指定。')
    process.exit(1)
  }
}

const git = (...args) => execFileSync('git', args, { cwd: harnessRoot, encoding: 'utf8' }).trim()

const dirty = git('status', '--porcelain')
if (dirty !== '') {
  console.error(`✗ ${harnessRoot} 工作区有未提交改动，先自行处理：\n${dirty}`)
  process.exit(1)
}

console.log(`harness : ${harnessRoot}`)
console.log(`当前    : ${git('rev-parse', '--short=9', 'HEAD')} ${git('log', '-1', '--format=%s')}`)
console.log(`回滚到  : ${sha.slice(0, 9)} ${git('log', '-1', '--format=%s', sha)}`)
if (dryRun) {
  console.log('(--dry-run：什么都没做)')
  process.exit(0)
}

for (const [label, cmd, args] of [
  ['git reset --hard', 'git', ['reset', '--hard', sha]],
  ['pnpm install', 'pnpm', ['install', '--frozen-lockfile']],
  ['pnpm build', 'pnpm', ['build']],
]) {
  console.log(`→ ${label}`)
  execFileSync(cmd, args, { cwd: harnessRoot, stdio: 'inherit' })
}
console.log('✓ 回滚完成，重新打开 DSH.app 即可')
