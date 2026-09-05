// 中英双语文案。harness 把设置页选的语言写在 <html lang>（如 "zh-CN"），
// 以它为准，缺省回退浏览器语言；每次渲染现读，切语言后重渲染即生效。
//
// 文案原则：一句话说清一件事，不重复界面上已经画出来的信息。

function isZh(): boolean {
  const lang = document.documentElement.lang || navigator.language || ''
  return lang.toLowerCase().startsWith('zh')
}

/** 时间只给到分钟：当天只显示时刻，跨天带月日。完整时间戳在这个面板里没人需要。 */
export function fmtTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number): string => String(n).padStart(2, '0')
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

/** 步骤：短名 + 实际命令，界面把命令渲成弱化的等宽字。 */
type StepText = readonly [name: string, cmd: string]

const ZH = {
  // 侧栏行
  rowInstalled: '已装好，待重启',
  rowStale: '需重启',
  rowInstalling: '正在更新…',
  rowFailed: '更新失败',
  rowNew: (v: string) => `新版本 ${v}`,
  // 弹层
  dialogTitle: 'DSH 更新',
  close: '关闭',
  current: '当前',
  newVersion: '新版本',
  behind: (n: number) => `落后 ${n} 个提交`,
  latestCommit: '最新提交',
  dirtyBlocked: (root: string) => `工作区有未提交改动，已暂停更新。先处理 git status（${root}）。`,
  diverged: '本地有远端没有的提交，无法快进。',
  divergedAhead: (n: number, ref: string) => `领先 ${ref} ${n} 个提交：`,
  divergedMore: (n: number) => `…还有 ${n} 个`,
  realignWhat: (branch: string, ref: string) =>
    `对齐会先把当前 HEAD 存为分支 ${branch}，再重置到 ${ref} 并重建。本地提交不会丢。`,
  realignDirty: '有未提交改动，重置会抹掉它们。先处理 git status。',
  realignBtn: '备份并对齐远端',
  backupSaved: (branch: string) => `本地提交已备份到 ${branch}。`,
  checking: '正在检查…',
  upToDate: '已是最新',
  upToDateAt: (t: string) => `已是最新 · ${t}`,
  steps: {
    pull: ['拉取源码', 'git pull --ff-only'],
    install: ['安装依赖', 'pnpm install'],
    clean: ['清理旧产物', 'pnpm clean'],
    build: ['重建前端', 'pnpm build:official'],
    backup: ['备份本地提交', 'git branch'],
    realign: ['对齐远端', 'git reset --hard'],
    reset: ['回滚源码', 'git reset --hard'],
  } as Record<string, StepText>,
  dontQuit: '更新期间请勿退出 DSH。',
  installed: '已装好，重启后生效。',
  stale: (running: string, disk: string) => `运行中 ${running}，磁盘上已是 ${disk}，重启后生效。`,
  restartBy: {
    'supervisor': '服务会自动拉起。',
    'self-respawn': '未检测到托管进程，服务将自行拉起。',
    'manual': '当前环境无法自动拉起，退出后请手动运行 pnpm dsh web。',
  } as Record<string, string>,
  restartNow: '立即重启',
  restartManual: '退出服务',
  restarting: '正在重启…',
  restartFailed: (e: string) => `重启失败：${e}`,
  updating: '更新中…',
  rollbackTo: (sha: string) => `回滚到 ${sha}`,
  retry: '重试',
  recheck: '重新检查',
  checkingBtn: '检查中…',
  dismissBtn: '忽略此版本',
  installBtn: '开始更新',
  aria: { running: '执行中', ok: '完成', failed: '失败', skipped: '已跳过', pending: '待执行' },
  // 设置页版本行
  settingsTitle: 'DSH 版本',
  settingsNew: (v: string, n: number) => `新版本 ${v} · 落后 ${n} 个提交`,
  settingsRestart: '已更新，待重启',
  settingsUpToDateAt: (t: string) => `已是最新 · ${t}`,
  settingsUpToDate: '已是最新',
  goUpdate: '前往更新',
  goRestart: '重启',
  checkBtn: '检查更新',
}

const EN: typeof ZH = {
  rowInstalled: 'Installed, restart pending',
  rowStale: 'Restart needed',
  rowInstalling: 'Updating…',
  rowFailed: 'Update failed',
  rowNew: (v: string) => `New version ${v}`,
  dialogTitle: 'DSH Update',
  close: 'Close',
  current: 'Current',
  newVersion: 'New',
  behind: (n: number) => `${n} commit${n === 1 ? '' : 's'} behind`,
  latestCommit: 'Latest commit',
  dirtyBlocked: (root: string) => `Uncommitted changes in the working tree; update paused. Clean up git status first (${root}).`,
  diverged: 'Local commits are not on the remote; cannot fast-forward.',
  divergedAhead: (n: number, ref: string) => `${n} commit${n === 1 ? '' : 's'} ahead of ${ref}:`,
  divergedMore: (n: number) => `…and ${n} more`,
  realignWhat: (branch: string, ref: string) =>
    `Aligning saves the current HEAD as branch ${branch}, then resets to ${ref} and rebuilds. No local commit is lost.`,
  realignDirty: 'Uncommitted changes would be wiped by the reset. Clean up git status first.',
  realignBtn: 'Back up and align to remote',
  backupSaved: (branch: string) => `Local commits are backed up on ${branch}.`,
  checking: 'Checking…',
  upToDate: 'Up to date',
  upToDateAt: (t: string) => `Up to date · ${t}`,
  steps: {
    pull: ['Pull source', 'git pull --ff-only'],
    install: ['Install deps', 'pnpm install'],
    clean: ['Clean stale output', 'pnpm clean'],
    build: ['Rebuild frontend', 'pnpm build:official'],
    backup: ['Back up local commits', 'git branch'],
    realign: ['Align to remote', 'git reset --hard'],
    reset: ['Roll back source', 'git reset --hard'],
  } as Record<string, StepText>,
  dontQuit: "Don't quit DSH while updating.",
  installed: 'Installed. Restart to apply.',
  stale: (running: string, disk: string) => `Running ${running}, on disk ${disk}. Restart to apply.`,
  restartBy: {
    'supervisor': 'The service relaunches itself.',
    'self-respawn': 'No supervisor detected; the service will relaunch on its own.',
    'manual': 'Nothing can relaunch the service here. After it exits, run pnpm dsh web yourself.',
  } as Record<string, string>,
  restartNow: 'Restart now',
  restartManual: 'Stop service',
  restarting: 'Restarting…',
  restartFailed: (e: string) => `Restart failed: ${e}`,
  updating: 'Updating…',
  rollbackTo: (sha: string) => `Roll back to ${sha}`,
  retry: 'Retry',
  recheck: 'Check again',
  checkingBtn: 'Checking…',
  dismissBtn: 'Skip this version',
  installBtn: 'Update now',
  aria: { running: 'Running', ok: 'Done', failed: 'Failed', skipped: 'Skipped', pending: 'Pending' },
  settingsTitle: 'DSH version',
  settingsNew: (v: string, n: number) => `New version ${v} · ${n} commit${n === 1 ? '' : 's'} behind`,
  settingsRestart: 'Updated, restart pending',
  settingsUpToDateAt: (t: string) => `Up to date · ${t}`,
  settingsUpToDate: 'Up to date',
  goUpdate: 'Update…',
  goRestart: 'Restart',
  checkBtn: 'Check for updates',
}

export function tr(): typeof ZH {
  return isZh() ? ZH : EN
}

/** 后端 step 只带中文 label；前端按 id 本地化，认不出的 id 用后端 label 当名字、不显示命令。 */
export function stepText(id: string, fallback: string): StepText {
  return tr().steps[id] ?? [fallback, '']
}
