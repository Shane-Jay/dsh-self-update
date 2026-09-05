// 服务端 /self-update/api 的薄 fetch 层。类型镜像 src/updater.ts 的 UpdateStatus。

export interface UpdateStep {
  id: string
  label: string
  state: 'pending' | 'running' | 'ok' | 'failed' | 'skipped'
  tail?: string
  startedAt?: string
  endedAt?: string
}

export interface UpdateRev {
  sha: string
  shortSha: string
  version: string
  subject?: string
  committedAt?: string
}

export interface DivergedCommit {
  shortSha: string
  subject: string
}

export interface DivergenceInfo {
  upstreamRef: string
  ahead: number
  commits: DivergedCommit[]
  truncated: boolean
}

export type RestartMode = 'supervisor' | 'self-respawn' | 'manual'

export interface RuntimeInfo {
  pid: number
  startedAt: string
  sha: string
  shortSha: string
  /** 磁盘上的 HEAD 已不是进程起来时那个 → 重启才生效 */
  stale: boolean
  supervisor: 'macapp' | 'systemd' | 'pm2' | 'custom' | 'none'
  restartMode: RestartMode
}

export interface UpdateStatus {
  phase: 'idle' | 'checking' | 'installing' | 'ready-to-restart' | 'failed'
  repoRoot: string
  branch: string
  current: UpdateRev
  available?: UpdateRev & { behind: number }
  lastCheckedAt?: string
  lastError?: string
  dirty: boolean
  diverged: boolean
  divergence?: DivergenceInfo
  steps: UpdateStep[]
  restartRequired: boolean
  previousSha?: string
  backupBranch?: string
  runtime: RuntimeInfo
}

/** 自更新不可用（非 git 工作副本）时返回 undefined —— 席位据此整个不渲染。 */
export async function fetchUpdateStatus(): Promise<UpdateStatus | undefined> {
  try {
    const res = await fetch('/self-update/api/update/status', { cache: 'no-store' })
    if (!res.ok) return undefined
    return (await res.json()) as UpdateStatus
  } catch {
    return undefined
  }
}

const POST_INIT: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }

export async function postUpdate(
  action: 'check' | 'install' | 'realign' | 'rollback',
): Promise<UpdateStatus | undefined> {
  try {
    const res = await fetch(`/self-update/api/update/${action}`, POST_INIT)
    if (!res.ok) return undefined
    return (await res.json()) as UpdateStatus
  } catch {
    return undefined
  }
}

export interface RestartResult {
  ok: boolean
  mode: RestartMode
  error?: string
}

/** 请求重启。服务端答应后会在 300ms 内退出，之后用 waitForServer 等它回来。 */
export async function postRestart(): Promise<RestartResult> {
  try {
    const res = await fetch('/self-update/api/update/restart', POST_INIT)
    const body = (await res.json().catch(() => ({}))) as Partial<RestartResult>
    return {
      ok: res.ok && body.ok === true,
      mode: body.mode ?? 'manual',
      ...(body.error !== undefined ? { error: body.error } : {}),
    }
  } catch (err) {
    return { ok: false, mode: 'manual', error: String(err) }
  }
}

/**
 * 等新进程接管端口：旧进程还在时 status 会答（pid 不变），退出后 fetch 抛错，
 * 新进程起来后 pid 变了——只认 pid 变化，不认"能连上"，免得旧进程还没退就刷新。
 */
export async function waitForServer(oldPid: number, timeoutMs = 120_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    const st = await fetchUpdateStatus()
    if (st !== undefined && st.runtime.pid !== oldPid) return true
  }
  return false
}
