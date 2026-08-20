// DSH 自更新入口：sidebar.footer.action 席位（侧栏底部「设置」正上方）。
//
// 平时完全不渲染——后台静默检查（默认 6 小时一轮，见 updater.ts），只有真有新版本
// 才在侧栏浮出一行「新版本 x.y.z ›」。侧栏那行不做任何有后果的事，点开才是更新页：
// 版本对照、要执行的三步、开始/忽略都在那里，按错的风险由结构消除。
// 忽略按目标提交记（localStorage），下一个新版本会再提醒。

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchUpdateStatus, postUpdate, type UpdateStatus } from './api.ts'
import { stepLabel, tr } from './i18n.ts'

const DISMISS_KEY = 'dsh-self-update.dismissedSha'

// 更新弹层的对外入口：设置页按钮、Mac 外壳菜单（evaluateJavaScript 派发同名事件）
// 都走这一个通道，弹层与状态流保持单源。detail.check = 打开的同时立即做一次检查。
export const OPEN_UPDATE_EVENT = 'dsh-self-update:open'

export function openUpdatePanel(opts?: { check?: boolean }) {
  window.dispatchEvent(new CustomEvent(OPEN_UPDATE_EVENT, { detail: { check: opts?.check === true } }))
}

const T = {
  text: 'var(--dsw-alias-label-primary)',
  text2: 'var(--dsw-alias-label-secondary)',
  text3: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l2)',
  layer: 'var(--dsw-alias-bg-layer-1)',
  layer2: 'var(--dsw-alias-bg-layer-2)',
  brand: 'var(--dsw-alias-brand-primary)',
  primaryFill: 'var(--dsw-alias-button-primary-fill)',
  primaryText: 'var(--dsw-alias-label-primary-foreground)',
  ok: 'var(--dsw-alias-state-success-primary)',
  err: 'var(--dsw-alias-state-error-primary)',
}

const BTN: React.CSSProperties = {
  fontSize: 13, lineHeight: '20px', padding: '6px 14px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: 'transparent', color: T.text2, cursor: 'pointer',
}
const BTN_PRIMARY: React.CSSProperties = {
  ...BTN, background: T.primaryFill, color: T.primaryText, border: 'none', fontWeight: 500,
}

function readDismissed(): string | undefined {
  try {
    return window.localStorage.getItem(DISMISS_KEY) ?? undefined
  } catch {
    return undefined
  }
}

/** 关键帧只能写在样式表里，内联 style 表达不了——挂一次，全组件共用。 */
const KEYFRAMES = `
@keyframes dsu-spin { to { transform: rotate(360deg) } }
@keyframes dsu-check { from { stroke-dashoffset: 16 } to { stroke-dashoffset: 0 } }
`

/**
 * 步骤指示圈：待执行 = 空心圈，执行中 = 旋转弧，完成 = 打勾（描边动画画出来），
 * 失败 = ✕，跳过 = 虚线圈。三态共用同一个 16px 位置，不会跳版。
 */
function StepDot({ state }: { state: string }) {
  const t = tr()
  const box: React.CSSProperties = { width: 16, height: 16, flex: 'none', display: 'block' }
  if (state === 'running') {
    return (
      <svg style={{ ...box, animation: 'dsu-spin 900ms linear infinite' }} viewBox="0 0 16 16" fill="none" aria-label={t.aria.running}>
        <circle cx="8" cy="8" r="6.5" stroke={T.border} strokeWidth="1.6" />
        <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" stroke={T.brand} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  if (state === 'ok') {
    return (
      <svg style={box} viewBox="0 0 16 16" fill="none" aria-label={t.aria.ok}>
        <circle cx="8" cy="8" r="6.5" stroke={T.ok} strokeWidth="1.6" />
        <path
          d="M4.8 8.2l2.2 2.2 4.2-4.4"
          stroke={T.ok}
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="16"
          style={{ animation: 'dsu-check 260ms ease-out both' }}
        />
      </svg>
    )
  }
  if (state === 'failed') {
    return (
      <svg style={box} viewBox="0 0 16 16" fill="none" aria-label={t.aria.failed}>
        <circle cx="8" cy="8" r="6.5" stroke={T.err} strokeWidth="1.6" />
        <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke={T.err} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg style={box} viewBox="0 0 16 16" fill="none" aria-label={state === 'skipped' ? t.aria.skipped : t.aria.pending}>
      <circle
        cx="8" cy="8" r="6.5" stroke={T.border} strokeWidth="1.6"
        strokeDasharray={state === 'skipped' ? '3 3' : undefined}
      />
    </svg>
  )
}

const PLAN = [
  { cmd: 'git pull --ff-only', why: 'pull' },
  { cmd: 'pnpm install', why: 'install' },
  { cmd: 'pnpm build', why: 'build' },
] as const

/** 版本对照块：当前 → 目标 */
function VersionCompare({ status }: { status: UpdateStatus }) {
  const t = tr()
  const col: React.CSSProperties = { flex: '1 1 0', minWidth: 0 }
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 12,
      background: T.layer2, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={col}>
        <div style={{ color: T.text3, fontSize: 12 }}>{t.current}</div>
        <div style={{ color: T.text, fontSize: 17, fontWeight: 600, margin: '2px 0' }}>{status.current.version}</div>
        <div style={{ color: T.text3, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {status.current.shortSha} · {status.branch}
        </div>
      </div>
      <div style={{ alignSelf: 'center', color: T.text3, fontSize: 18 }}>→</div>
      <div style={col}>
        <div style={{ color: T.text3, fontSize: 12 }}>{t.newVersion}</div>
        <div style={{ color: T.brand, fontSize: 17, fontWeight: 600, margin: '2px 0' }}>
          {status.available?.version ?? '—'}
        </div>
        <div style={{ color: T.text3, fontSize: 12 }}>
          {status.available !== undefined ? t.behind(status.available.behind) : ''}
        </div>
      </div>
    </div>
  )
}

export function UpdateAction({ wide }: { wide: boolean }) {
  const [status, setStatus] = useState<UpdateStatus | undefined>(undefined)
  const [dismissed, setDismissed] = useState<string | undefined>(() => readDismissed())
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const refresh = useCallback(async () => { setStatus(await fetchUpdateStatus()) }, [])

  // 安装中/弹层开着 2 秒一轮，平时 5 分钟一轮（真正的定期检查在后端）
  useEffect(() => {
    void refresh()
    const fast = open || status?.phase === 'installing'
    timer.current = setInterval(() => { void refresh() }, fast ? 2000 : 300_000)
    return () => { if (timer.current !== undefined) clearInterval(timer.current) }
  }, [refresh, open, status?.phase])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [open])

  const act = useCallback(async (action: 'check' | 'install' | 'rollback' | 'restart') => {
    setBusy(true)
    try {
      const next = await postUpdate(action)
      if (next !== undefined) setStatus(next)
      if (action === 'restart') setTimeout(() => { window.location.reload() }, 4000)
    } finally {
      setBusy(false)
    }
  }, [])

  // 外部入口事件：打开弹层，按需立即检查
  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true)
      if ((e as CustomEvent<{ check?: boolean }>).detail?.check === true) void act('check')
      else void refresh()
    }
    window.addEventListener(OPEN_UPDATE_EVENT, onOpen)
    return () => { window.removeEventListener(OPEN_UPDATE_EVENT, onOpen) }
  }, [act, refresh])

  const available = status?.available
  const installing = status?.phase === 'installing'
  const needsRestart = status?.restartRequired === true
  const failed = status?.phase === 'failed' && status.steps.length > 0
  const blocked = status?.dirty === true || status?.diverged === true

  // 已是最新（外部入口打开弹层时会走到这个形态；侧栏行此时不渲染）
  const upToDate = !installing && !needsRestart && !failed && available === undefined

  const silent =
    status === undefined
    || (!installing && !needsRestart && !failed
      && (available === undefined || (dismissed !== undefined && dismissed === available.sha)))
  if (silent && !open) return null

  const dismiss = () => {
    if (available === undefined) return
    try { window.localStorage.setItem(DISMISS_KEY, available.sha) } catch { /* 无痕模式忽略 */ }
    setDismissed(available.sha)
    setOpen(false)
  }

  const t = tr()
  const rowLabel = needsRestart
    ? t.rowInstalled
    : installing
      ? t.rowInstalling
      : failed
        ? t.rowFailed
        : t.rowNew(available?.version ?? '')

  return (
    <>
      {/* 侧栏那一行：只负责打开更新页，不做任何有后果的事。
          外部入口打开弹层但没有新版本时（silent），这一行不出现。 */}
      {!silent && <button
        type="button"
        title={rowLabel}
        onClick={() => { setOpen(true) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          flex: '1 1 auto', minWidth: 0, boxSizing: 'border-box',
          margin: '0 0 4px', padding: '7px 10px', borderRadius: 8,
          border: 'none', background: 'transparent', color: T.text2,
          fontSize: 13, lineHeight: '20px', cursor: 'pointer', textAlign: 'left',
          justifyContent: wide ? 'flex-start' : 'center',
        }}
      >
        <span style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M8 2.5v7m0 0L5.2 6.7M8 9.5l2.8-2.8" stroke="currentColor" strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2.8 11v1.2c0 .7.6 1.3 1.3 1.3h7.8c.7 0 1.3-.6 1.3-1.3V11" stroke="currentColor"
              strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span style={{
            position: 'absolute', top: -1, right: -2, width: 6, height: 6,
            borderRadius: '50%', background: T.brand,
          }} />
        </span>
        {wide && (
          <>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rowLabel}
            </span>
            <span style={{ color: T.text3, flex: 'none' }}>›</span>
          </>
        )}
      </button>}

      {/* portal 到 body：侧栏祖先有自己的层叠上下文，设置弹窗开着时会把这层压住 */}
      {open && status !== undefined && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.dialogTitle}
          onClick={() => { if (!installing) setOpen(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1200, // harness 弹窗层是 1000，必须压过它

            background: 'rgba(0,0,0,.28)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => { e.stopPropagation() }}
            style={{
              width: 'min(560px, calc(100vw - 48px))', maxHeight: 'calc(100vh - 96px)', overflowY: 'auto',
              background: T.layer, border: `1px solid ${T.border}`, borderRadius: 16,
              boxShadow: '0 24px 64px rgba(0,0,0,.28)', padding: 20, color: T.text,
              fontSize: 13, lineHeight: '20px',
            }}
          >
            <style>{KEYFRAMES}</style>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <strong style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>{t.dialogTitle}</strong>
              <button
                type="button"
                onClick={() => { setOpen(false) }}
                style={{ ...BTN, border: 'none', padding: '2px 8px', fontSize: 18, color: T.text3 }}
                aria-label={t.close}
              >
                ×
              </button>
            </div>

            <VersionCompare status={status} />

            {available?.subject !== undefined && available.subject !== '' && (
              <div style={{ color: T.text2, marginTop: 12 }}>
                <span style={{ color: T.text3 }}>{t.latestCommit}　</span>{available.subject}
                {available.committedAt !== undefined && (
                  <span style={{ color: T.text3 }}>　·　{new Date(available.committedAt).toLocaleString()}</span>
                )}
              </div>
            )}

            {blocked && (
              <div style={{
                marginTop: 12, padding: '10px 12px', borderRadius: 8,
                background: T.layer2, border: `1px solid ${T.border}`, color: T.err,
              }}>
                {status.dirty ? t.dirtyBlocked(status.repoRoot) : t.diverged}
              </div>
            )}

            {/* 已是最新：外部入口（设置页 / 菜单）打开时的形态 */}
            {upToDate && (
              <div style={{ marginTop: 16, color: T.text2 }}>
                {busy
                  ? t.checking
                  : status.lastCheckedAt !== undefined
                    ? t.upToDateAt(new Date(status.lastCheckedAt).toLocaleString())
                    : t.upToDate}
              </div>
            )}

            {/* 未开工：把将要发生的事摊开写清楚 */}
            {!installing && !needsRestart && !failed && available !== undefined && (
              <div style={{ marginTop: 16 }}>
                {PLAN.map((p) => (
                  <div key={p.cmd} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0' }}>
                    <StepDot state="pending" />
                    <code style={{ color: T.text, fontSize: 12, flex: 'none' }}>{p.cmd}</code>
                    <span style={{ color: T.text3, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.planWhy[p.why]}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* 进行中 / 已失败：实时步骤 */}
            {(installing || failed) && status.steps.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {status.steps.map((s) => (
                  <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0' }}>
                    <StepDot state={s.state} />
                    <span style={{ color: s.state === 'pending' ? T.text3 : T.text2 }}>{stepLabel(s.id, s.label)}</span>
                  </div>
                ))}
                {installing && (
                  <div style={{ color: T.text3, marginTop: 8 }}>{t.dontQuit}</div>
                )}
              </div>
            )}

            {failed && status.lastError !== undefined && (
              <div style={{ color: T.err, marginTop: 12 }}>{status.lastError}</div>
            )}
            {failed && status.steps.find((s) => s.state === 'failed')?.tail !== undefined && (
              <pre style={{
                marginTop: 8, maxHeight: 200, overflow: 'auto', background: T.layer2,
                border: `1px solid ${T.border}`, borderRadius: 8, padding: 10,
                fontSize: 11, lineHeight: '16px', color: T.text2, whiteSpace: 'pre-wrap',
              }}>{status.steps.find((s) => s.state === 'failed')?.tail}</pre>
            )}

            {needsRestart && (
              <div style={{ marginTop: 16, color: T.text2 }}>
                {t.installedRestart}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {needsRestart ? (
                <button type="button" style={BTN_PRIMARY} disabled={busy} onClick={() => { void act('restart') }}>
                  {t.restartNow}
                </button>
              ) : installing ? (
                <span style={{ color: T.text3, alignSelf: 'center' }}>{t.updating}</span>
              ) : failed ? (
                <>
                  {status.previousSha !== undefined && (
                    <button type="button" style={BTN} disabled={busy} onClick={() => { void act('rollback') }}>
                      {t.rollbackTo(status.previousSha.slice(0, 9))}
                    </button>
                  )}
                  <button type="button" style={BTN_PRIMARY} disabled={busy} onClick={() => { void act('install') }}>
                    {t.retry}
                  </button>
                </>
              ) : upToDate ? (
                <button type="button" style={BTN_PRIMARY} disabled={busy} onClick={() => { void act('check') }}>
                  {busy ? t.checkingBtn : t.recheck}
                </button>
              ) : (
                <>
                  <button type="button" style={BTN} disabled={busy} onClick={dismiss}>{t.dismissBtn}</button>
                  <button
                    type="button"
                    style={{ ...BTN_PRIMARY, opacity: blocked ? 0.5 : 1 }}
                    disabled={busy || blocked}
                    onClick={() => { void act('install') }}
                  >
                    {t.installBtn}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
