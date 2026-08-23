// 中英双语文案。harness 把设置页选的语言写在 <html lang>（如 "zh-CN"），
// 以它为准，缺省回退浏览器语言；每次渲染现读，切语言后重渲染即生效。

function isZh(): boolean {
  const lang = document.documentElement.lang || navigator.language || ''
  return lang.toLowerCase().startsWith('zh')
}

const ZH = {
  // 侧栏行
  rowInstalled: '更新已装好',
  rowInstalling: '正在更新…',
  rowFailed: '更新失败',
  rowNew: (v: string) => `新版本 ${v}`,
  // 弹层
  dialogTitle: 'DSH 更新',
  close: '关闭',
  current: '当前版本',
  newVersion: '新版本',
  behind: (n: number) => `落后 ${n} 个提交`,
  latestCommit: '最新提交',
  dirtyBlocked: (root: string) => `工作区有未提交改动，更新已锁定——不会动你的改动。先处理 ${root} 的 git status。`,
  diverged: '本地有远端没有的提交，无法快进更新。',
  checking: '正在检查更新…',
  upToDate: '已是最新版本',
  upToDateAt: (t: string) => `已是最新版本　·　上次检查 ${t}`,
  planWhy: {
    pull: '拉取新版本源码',
    install: '同步依赖',
    build: '重建前端（dist 不入库）',
  },
  steps: {
    pull: '拉取源码 (git pull --ff-only)',
    install: '安装依赖 (pnpm install)',
    build: '重建前端 (pnpm build:official)',
  } as Record<string, string>,
  dontQuit: '更新期间请勿退出 DSH（关窗无妨）。',
  installedRestart: '更新已装好，重启后生效——服务自动拉起，页面随后刷新。',
  restartNow: '立即重启',
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
  settingsNew: (v: string, n: number) => `有新版本 ${v}（落后 ${n} 个提交）`,
  settingsUpToDateAt: (t: string) => `已是最新　·　上次检查 ${t}`,
  settingsUpToDate: '已是最新',
  goUpdate: '前往更新',
  checkBtn: '检查更新',
}

const EN: typeof ZH = {
  rowInstalled: 'Update installed',
  rowInstalling: 'Updating…',
  rowFailed: 'Update failed',
  rowNew: (v: string) => `New version ${v}`,
  dialogTitle: 'DSH Update',
  close: 'Close',
  current: 'Current',
  newVersion: 'New version',
  behind: (n: number) => `${n} commit${n === 1 ? '' : 's'} behind`,
  latestCommit: 'Latest commit',
  dirtyBlocked: (root: string) => `Working tree has uncommitted changes — update locked, your changes are untouched. Clean up git status in ${root} first.`,
  diverged: 'Local commits are not on the remote — cannot fast-forward.',
  checking: 'Checking for updates…',
  upToDate: 'Up to date',
  upToDateAt: (t: string) => `Up to date · last checked ${t}`,
  planWhy: {
    pull: 'Fetch the new source',
    install: 'Sync dependencies',
    build: 'Rebuild the frontend (dist is not committed)',
  },
  steps: {
    pull: 'Pull source (git pull --ff-only)',
    install: 'Install deps (pnpm install)',
    build: 'Rebuild frontend (pnpm build:official)',
  } as Record<string, string>,
  dontQuit: "Don't quit DSH while updating (closing the window is fine).",
  installedRestart: 'Update installed. Restart to apply — the service relaunches itself and this page reloads.',
  restartNow: 'Restart now',
  updating: 'Updating…',
  rollbackTo: (sha: string) => `Roll back to ${sha}`,
  retry: 'Retry',
  recheck: 'Check again',
  checkingBtn: 'Checking…',
  dismissBtn: 'Skip this version',
  installBtn: 'Update now',
  aria: { running: 'Running', ok: 'Done', failed: 'Failed', skipped: 'Skipped', pending: 'Pending' },
  settingsTitle: 'DSH version',
  settingsNew: (v: string, n: number) => `New version ${v} (${n} commit${n === 1 ? '' : 's'} behind)`,
  settingsUpToDateAt: (t: string) => `Up to date · checked ${t}`,
  settingsUpToDate: 'Up to date',
  goUpdate: 'Update…',
  checkBtn: 'Check for updates',
}

export function tr(): typeof ZH {
  return isZh() ? ZH : EN
}

/** 后端 step 只带中文 label；前端按 id 本地化，认不出的 id 用后端 label 兜底。 */
export function stepLabel(id: string, fallback: string): string {
  return tr().steps[id] ?? fallback
}
