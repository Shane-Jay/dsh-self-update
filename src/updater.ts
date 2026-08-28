// DSH 自更新：检查 harness 仓库落后多少、一键拉取并重建。
//
// 更新对象是 deepseek-harness 的 git 工作副本（dsh 从 TS 源直载运行），不是 npm 包。
// 一次完整安装 = git pull --ff-only → pnpm install → pnpm clean → pnpm build:official。
// 后两步都不能省：apps/web/dist 是 gitignore 的产物，拉了新源码不重建，界面还是旧的；
// 而旧产物不清掉，跨版本升级会翻车——2026-08-28 跨 1079 个提交那次，残留的
// packages/host/apiproxy/lib/types/api-proxy.js 还在引用已删除的 API、根目录 *.tsbuildinfo
// 又让 tsc -b 误判"无需重发射"，连环导致构建失败、client bundle 缺失、启动崩溃。
//
// 装完必须重启 dsh 进程才生效——这里只负责把"需要重启"这个事实摆出来，
// 重启动作由 /self-update/api/update/restart 触发（进程以 75 退出，桌面壳据此自动拉起）。

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 退出码约定：桌面壳（scripts/macapp）看到 75 就自动重新拉起服务。 */
export const RESTART_EXIT_CODE = 75

export interface UpdaterOptions {
  /** harness 工作副本根目录 */
  repoRoot: string
  /** 跟踪的远端分支（默认 origin/master 的本地上游） */
  remote?: string
  branch?: string
  /** 定期检查间隔，默认 6 小时；0 或负数关闭定期检查 */
  checkIntervalMs?: number
  /** 状态落盘文件（跨重启保留"装完待重启"等事实） */
  stateFile?: string
  /**
   * 安装/回滚要跑的命令。默认 pnpm install --frozen-lockfile + pnpm clean + pnpm build:official（官方品牌构建，上游 2026-08 起源码默认构建会显示 "DSH Local Build"）；
   * 换了包管理器或构建脚本时覆盖，测试里也用它把重活换成空跑。
   * clean 只在目标仓库 package.json 里确实有 "clean" script 时才执行（旧版本 harness 没有）。
   */
  commands?: { install?: string[]; clean?: string[]; build?: string[] }
}

export type UpdatePhase = 'idle' | 'checking' | 'installing' | 'ready-to-restart' | 'failed'
export type StepState = 'pending' | 'running' | 'ok' | 'failed' | 'skipped'

export interface UpdateStep {
  id: string
  label: string
  state: StepState
  /** 该步的输出尾巴（失败时给人看的证据；跳过时写一句为什么跳过） */
  tail?: string
  startedAt?: string
  endedAt?: string
}

export interface RevInfo {
  sha: string
  shortSha: string
  version: string
  subject?: string
  committedAt?: string
}

export interface UpdateStatus {
  phase: UpdatePhase
  repoRoot: string
  branch: string
  current: RevInfo
  /** 有更新时才有；behind 为落后的提交数 */
  available?: RevInfo & { behind: number }
  lastCheckedAt?: string
  lastError?: string
  /** 工作区有改动 → 拒绝安装（不替用户丢改动） */
  dirty: boolean
  /** 非快进（本地有远端没有的提交）→ 拒绝安装 */
  diverged: boolean
  steps: UpdateStep[]
  /** 安装成功后为 true，重启即生效 */
  restartRequired: boolean
  /** 安装前的 HEAD，供回滚 */
  previousSha?: string
}

/** install/rollback 里一条待执行的命令。needsScript：目标仓库缺这个 script 就跳过该步。 */
interface RunnableStep {
  id: string
  cmd: string
  args: string[]
  timeoutMs: number
  needsScript?: string
}

const TAIL_LIMIT = 4000

function tailOf(text: string): string {
  const trimmed = text.trimEnd()
  return trimmed.length > TAIL_LIMIT ? `…${trimmed.slice(-TAIL_LIMIT)}` : trimmed
}

/** execFile 的 Promise 版：不走 shell，参数逐个传，输出合并成尾巴。 */
function run(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeoutMs ?? 120_000,
        maxBuffer: 32 * 1024 * 1024,
        env: opts.env ?? process.env,
      },
      (err, stdout, stderr) => {
        const out = `${stdout ?? ''}${stderr ?? ''}`
        resolve({ ok: err === null, out })
      },
    )
  })
}

function versionOf(json: string): string {
  try {
    const v = (JSON.parse(json) as { version?: unknown }).version
    return typeof v === 'string' ? v : 'unknown'
  } catch {
    return 'unknown'
  }
}

export class Updater {
  private readonly repoRoot: string
  private readonly remote: string
  private readonly stateFile: string | undefined
  private readonly checkIntervalMs: number
  private readonly installCmd: string[]
  private readonly cleanCmd: string[]
  private readonly buildCmd: string[]
  private branch: string
  private timer: NodeJS.Timeout | undefined
  private busy = false

  private state: {
    phase: UpdatePhase
    lastCheckedAt?: string
    lastError?: string
    available?: RevInfo & { behind: number }
    steps: UpdateStep[]
    restartRequired: boolean
    previousSha?: string
  } = { phase: 'idle', steps: [], restartRequired: false }

  constructor(private readonly opts: UpdaterOptions) {
    this.repoRoot = opts.repoRoot
    this.remote = opts.remote ?? 'origin'
    this.branch = opts.branch ?? 'master'
    this.checkIntervalMs = opts.checkIntervalMs ?? 6 * 60 * 60 * 1000
    this.installCmd = opts.commands?.install ?? ['pnpm', 'install', '--frozen-lockfile']
    this.cleanCmd = opts.commands?.clean ?? ['pnpm', 'clean']
    this.buildCmd = opts.commands?.build ?? ['pnpm', 'build:official']
    this.stateFile = opts.stateFile
    this.restore()
  }

  private restore(): void {
    if (this.stateFile === undefined || !existsSync(this.stateFile)) return
    try {
      const saved = JSON.parse(readFileSync(this.stateFile, 'utf8')) as Partial<typeof this.state>
      // 只恢复跨重启仍成立的事实：安装中的步骤状态不跨进程
      this.state = {
        phase: saved.restartRequired === true ? 'ready-to-restart' : 'idle',
        steps: saved.restartRequired === true ? (saved.steps ?? []) : [],
        restartRequired: saved.restartRequired ?? false,
        ...(saved.lastCheckedAt !== undefined ? { lastCheckedAt: saved.lastCheckedAt } : {}),
        ...(saved.available !== undefined ? { available: saved.available } : {}),
        ...(saved.previousSha !== undefined ? { previousSha: saved.previousSha } : {}),
      }
    } catch { /* 状态文件坏了就当没有 */ }
  }

  private persist(): void {
    if (this.stateFile === undefined) return
    try {
      mkdirSync(dirname(this.stateFile), { recursive: true })
      writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2))
    } catch { /* 落盘失败不影响功能 */ }
  }

  /** 启动定期检查（立即检查一次，随后按间隔）。返回停止函数。 */
  start(): () => void {
    if (this.checkIntervalMs <= 0) return () => {}
    void this.check()
    this.timer = setInterval(() => { void this.check() }, this.checkIntervalMs)
    this.timer.unref?.()
    return () => { if (this.timer !== undefined) clearInterval(this.timer) }
  }

  private async gitOut(args: string[]): Promise<string> {
    const r = await run('git', args, { cwd: this.repoRoot })
    return r.ok ? r.out.trim() : ''
  }

  private async currentRev(): Promise<RevInfo> {
    const sha = await this.gitOut(['rev-parse', 'HEAD'])
    let version = 'unknown'
    try {
      version = versionOf(readFileSync(join(this.repoRoot, 'package.json'), 'utf8'))
    } catch { /* 读不到就 unknown */ }
    return {
      sha,
      shortSha: sha.slice(0, 9),
      version,
      subject: await this.gitOut(['log', '-1', '--format=%s']),
      committedAt: await this.gitOut(['log', '-1', '--format=%cI']),
    }
  }

  /** 探测本地跟踪的上游分支（拿不到就沿用默认）。 */
  private async resolveBranch(): Promise<void> {
    const upstream = await this.gitOut(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
    const m = /^([^/]+)\/(.+)$/.exec(upstream)
    if (m?.[2] !== undefined) this.branch = m[2]
  }

  async status(): Promise<UpdateStatus> {
    const current = await this.currentRev()
    const dirty = (await this.gitOut(['status', '--porcelain'])) !== ''
    const ahead = await this.gitOut(['rev-list', '--count', `${this.remote}/${this.branch}..HEAD`])
    return {
      phase: this.state.phase,
      repoRoot: this.repoRoot,
      branch: this.branch,
      current,
      ...(this.state.available !== undefined ? { available: this.state.available } : {}),
      ...(this.state.lastCheckedAt !== undefined ? { lastCheckedAt: this.state.lastCheckedAt } : {}),
      ...(this.state.lastError !== undefined ? { lastError: this.state.lastError } : {}),
      dirty,
      diverged: ahead !== '' && ahead !== '0',
      steps: this.state.steps,
      restartRequired: this.state.restartRequired,
      ...(this.state.previousSha !== undefined ? { previousSha: this.state.previousSha } : {}),
    }
  }

  /** git fetch + 比对。安装期间跳过（不打断步骤状态）。 */
  async check(): Promise<UpdateStatus> {
    if (this.busy) return this.status()
    const prevPhase = this.state.phase
    this.state.phase = prevPhase === 'ready-to-restart' ? prevPhase : 'checking'
    try {
      await this.resolveBranch()
      const fetched = await run('git', ['fetch', '--quiet', this.remote, this.branch], {
        cwd: this.repoRoot,
        timeoutMs: 180_000,
      })
      if (!fetched.ok) throw new Error(`git fetch 失败：${tailOf(fetched.out) || '未知错误'}`)

      const behindRaw = await this.gitOut(['rev-list', '--count', `HEAD..${this.remote}/${this.branch}`])
      const behind = Number(behindRaw || '0')
      this.state.lastCheckedAt = new Date().toISOString()
      delete this.state.lastError

      if (!Number.isFinite(behind) || behind <= 0) {
        delete this.state.available
      } else {
        const sha = await this.gitOut(['rev-parse', `${this.remote}/${this.branch}`])
        const pkg = await this.gitOut(['show', `${this.remote}/${this.branch}:package.json`])
        this.state.available = {
          sha,
          shortSha: sha.slice(0, 9),
          version: versionOf(pkg),
          subject: await this.gitOut(['log', '-1', '--format=%s', `${this.remote}/${this.branch}`]),
          committedAt: await this.gitOut(['log', '-1', '--format=%cI', `${this.remote}/${this.branch}`]),
          behind,
        }
      }
    } catch (err) {
      this.state.lastError = err instanceof Error ? err.message : String(err)
      this.state.phase = 'failed'
      this.persist()
      return this.status()
    }
    if (this.state.phase === 'checking') this.state.phase = 'idle'
    this.persist()
    return this.status()
  }

  /**
   * 只用本地 ref 重算"还落后多少"（不联网）。安装/回滚跑完必须重算：
   * pull 成功后 HEAD 已经动了，留着旧的 available 会在界面上写着
   * "当前 rc.8 · 落后 1 个提交"这种自相矛盾的话。
   */
  private async recount(): Promise<void> {
    const behind = Number(await this.gitOut(['rev-list', '--count', `HEAD..${this.remote}/${this.branch}`]) || '0')
    if (!Number.isFinite(behind) || behind <= 0) {
      delete this.state.available
      return
    }
    if (this.state.available !== undefined) this.state.available.behind = behind
  }

  /**
   * 目标仓库的 package.json 里有没有这个 script。
   * 必须在该步真要跑的那一刻现读：pull 之后 package.json 已经换成新版本的了，
   * 旧版本没有 clean、新版本有——按拉取后的事实决定跑不跑。
   */
  private hasScript(name: string): boolean {
    try {
      const pkg = JSON.parse(readFileSync(join(this.repoRoot, 'package.json'), 'utf8')) as {
        scripts?: Record<string, unknown>
      }
      return typeof pkg.scripts?.[name] === 'string'
    } catch {
      return false // 读不到就当没有：跳过好过瞎跑
    }
  }

  private setStep(id: string, patch: Partial<UpdateStep>): void {
    const step = this.state.steps.find((s) => s.id === id)
    if (step !== undefined) Object.assign(step, patch)
    this.persist()
  }

  /**
   * 拉取并重建。单飞：安装期间再次调用直接返回当前状态。
   * 任一步失败即停在该步，前面已完成的步骤不回退（git pull 成功但 build 失败时，
   * 用户可以选择重试或回滚）。
   */
  async install(): Promise<UpdateStatus> {
    // busy / 步骤骨架都在首个 await 之前置位：路由不等安装跑完（要几分钟），
    // 而是立刻回一份 phase=installing 的状态让前端开始轮询——所以这一段必须同步可见，
    // 同时也堵住"连点两次装两遍"的竞态。
    if (this.busy) return this.status()
    this.busy = true
    this.state.phase = 'installing'
    delete this.state.lastError
    this.state.restartRequired = false
    this.state.steps = [
      { id: 'pull', label: '拉取源码 (git pull --ff-only)', state: 'pending' },
      { id: 'install', label: '安装依赖 (pnpm install)', state: 'pending' },
      { id: 'clean', label: '清理旧产物 (pnpm clean)', state: 'pending' },
      { id: 'build', label: '重建前端 (pnpm build:official)', state: 'pending' },
    ]
    this.persist()

    const fail = async (msg: string): Promise<UpdateStatus> => {
      this.busy = false
      this.state.lastError = msg
      this.state.phase = 'failed'
      this.state.steps = []
      this.persist()
      return this.status()
    }

    const pre = await this.status()
    if (pre.dirty) return await fail('工作区有未提交改动，拒绝更新（先自行处理 git status）')
    if (pre.diverged) return await fail('本地有远端没有的提交，无法快进更新')
    if (pre.available === undefined) return await fail('没有可用更新')

    this.state.previousSha = pre.current.sha
    this.persist()

    const steps: RunnableStep[] = [
      { id: 'pull', cmd: 'git', args: ['pull', '--ff-only', this.remote, this.branch], timeoutMs: 300_000 },
      { id: 'install', cmd: this.installCmd[0]!, args: this.installCmd.slice(1), timeoutMs: 900_000 },
      { id: 'clean', cmd: this.cleanCmd[0]!, args: this.cleanCmd.slice(1), timeoutMs: 300_000, needsScript: 'clean' },
      { id: 'build', cmd: this.buildCmd[0]!, args: this.buildCmd.slice(1), timeoutMs: 1_800_000 },
    ]

    try {
      for (const step of steps) {
        if (step.needsScript !== undefined && !this.hasScript(step.needsScript)) {
          // 旧版本 harness 没有这个 script——跳过并留一句说明，不能让整次更新失败
          this.setStep(step.id, {
            state: 'skipped',
            tail: `目标仓库 package.json 没有 "${step.needsScript}" script，已跳过`,
            endedAt: new Date().toISOString(),
          })
          continue
        }
        this.setStep(step.id, { state: 'running', startedAt: new Date().toISOString() })
        const r = await run(step.cmd, step.args, {
          cwd: this.repoRoot,
          timeoutMs: step.timeoutMs,
          // pnpm 走 PATH；桌面壳启动的进程 PATH 已含 node/pnpm 目录
          env: { ...process.env, CI: '1' },
        })
        this.setStep(step.id, {
          state: r.ok ? 'ok' : 'failed',
          tail: tailOf(r.out),
          endedAt: new Date().toISOString(),
        })
        if (!r.ok) {
          for (const rest of this.state.steps) if (rest.state === 'pending') rest.state = 'skipped'
          this.state.phase = 'failed'
          this.state.lastError = `${this.state.steps.find((x) => x.id === step.id)?.label ?? step.id} 失败`
          await this.recount() // pull 可能已经成功，别再说"落后 N 个提交"
          this.persist()
          return this.status()
        }
      }
      this.state.phase = 'ready-to-restart'
      this.state.restartRequired = true
      delete this.state.available
      this.persist()
      return this.status()
    } finally {
      this.busy = false
    }
  }

  /** 回滚到安装前的提交（同样要 install + build 才是一致状态）。 */
  async rollback(): Promise<UpdateStatus> {
    const target = this.state.previousSha
    if (this.busy || target === undefined) return this.status()
    this.busy = true // 同步置位：与 install() 同一把单飞锁
    this.state.phase = 'installing'
    this.state.steps = [
      { id: 'reset', label: `回滚源码 (git reset --hard ${target.slice(0, 9)})`, state: 'pending' },
      { id: 'install', label: '安装依赖 (pnpm install)', state: 'pending' },
      { id: 'clean', label: '清理旧产物 (pnpm clean)', state: 'pending' },
      { id: 'build', label: '重建前端 (pnpm build:official)', state: 'pending' },
    ]
    this.persist()
    // 回滚同样要清产物：刚失败的那次更新可能已经写出了新版本的 lib/ 与 tsbuildinfo，
    // 留着它们回滚重建出来的照样是坏的。
    const steps: RunnableStep[] = [
      { id: 'reset', cmd: 'git', args: ['reset', '--hard', target], timeoutMs: 120_000 },
      { id: 'install', cmd: this.installCmd[0]!, args: this.installCmd.slice(1), timeoutMs: 900_000 },
      { id: 'clean', cmd: this.cleanCmd[0]!, args: this.cleanCmd.slice(1), timeoutMs: 300_000, needsScript: 'clean' },
      { id: 'build', cmd: this.buildCmd[0]!, args: this.buildCmd.slice(1), timeoutMs: 1_800_000 },
    ]
    try {
      for (const step of steps) {
        if (step.needsScript !== undefined && !this.hasScript(step.needsScript)) {
          this.setStep(step.id, {
            state: 'skipped',
            tail: `目标仓库 package.json 没有 "${step.needsScript}" script，已跳过`,
            endedAt: new Date().toISOString(),
          })
          continue
        }
        this.setStep(step.id, { state: 'running', startedAt: new Date().toISOString() })
        const r = await run(step.cmd, step.args, { cwd: this.repoRoot, timeoutMs: step.timeoutMs })
        this.setStep(step.id, {
          state: r.ok ? 'ok' : 'failed',
          tail: tailOf(r.out),
          endedAt: new Date().toISOString(),
        })
        if (!r.ok) {
          this.state.phase = 'failed'
          this.state.lastError = `${this.state.steps.find((x) => x.id === step.id)?.label ?? step.id} 失败`
          await this.recount()
          this.persist()
          return this.status()
        }
      }
      this.state.phase = 'ready-to-restart'
      this.state.restartRequired = true
      await this.recount() // 回滚后又落后于上游了
      this.persist()
      return this.status()
    } finally {
      this.busy = false
    }
  }

  /** 清掉"待重启"标记（重启后由新进程调用）。 */
  clearRestartFlag(): void {
    this.state.restartRequired = false
    if (this.state.phase === 'ready-to-restart') this.state.phase = 'idle'
    this.persist()
  }
}
