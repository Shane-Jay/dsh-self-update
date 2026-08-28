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
}

/** 自更新不可用（非 git 工作副本）时返回 undefined —— 席位据此整个不渲染。 */
export async function fetchUpdateStatus(): Promise<UpdateStatus | undefined> {
  try {
    const res = await fetch('/self-update/api/update/status')
    if (!res.ok) return undefined
    return (await res.json()) as UpdateStatus
  } catch {
    return undefined
  }
}

export async function postUpdate(
  action: 'check' | 'install' | 'realign' | 'rollback' | 'restart',
): Promise<UpdateStatus | undefined> {
  try {
    const res = await fetch(`/self-update/api/update/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) return undefined
    return (await res.json()) as UpdateStatus
  } catch {
    return undefined
  }
}
