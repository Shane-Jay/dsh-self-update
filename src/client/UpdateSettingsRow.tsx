// 版本行：settings.general.item 席位（与「外观」「语言」并排，住在通用设置里）。
// 版式对齐 harness 的 Setting-Cell：左标题 + 副标题、右侧胶囊按钮、16px 上下留白 + 细分隔线。

import { useEffect, useState } from 'react'
import { fetchUpdateStatus, postUpdate, type UpdateStatus } from './api.ts'
import { openUpdatePanel } from './UpdateAction.tsx'
import { tr } from './i18n.ts'

const T = {
  text: 'var(--dsw-alias-label-primary)',
  text3: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l2)',
  pill: 'var(--dsw-alias-bg-module-platform)',
  brand: 'var(--dsw-alias-brand-primary)',
}

export function UpdateSettingsRow() {
  const [st, setSt] = useState<UpdateStatus | undefined>(undefined)
  const [checking, setChecking] = useState(false)

  useEffect(() => { void fetchUpdateStatus().then(setSt) }, [])
  // 后端不提供自更新（harness 不是 git 工作副本）→ 整行不渲染
  if (st === undefined) return null

  // 手动检查发现新版本 → 直接弹出侧栏那套更新页（唯一的更新操作面板），
  // 不让用户对着一行品牌色副标题干等。
  const check = async () => {
    setChecking(true)
    try {
      const next = (await postUpdate('check')) ?? st
      setSt(next)
      if (next.available !== undefined) openUpdatePanel()
    } finally {
      setChecking(false)
    }
  }

  const t = tr()
  const hasUpdate = st.available !== undefined

  const sub = st.available !== undefined
    ? t.settingsNew(st.available.version, st.available.behind)
    : st.lastCheckedAt !== undefined
      ? t.settingsUpToDateAt(new Date(st.lastCheckedAt).toLocaleString())
      : t.settingsUpToDate

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '16px 0', borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 48 }}>
        <div style={{ fontSize: 14, lineHeight: '22px', color: T.text }}>{t.settingsTitle}</div>
        <div style={{ fontSize: 13, lineHeight: '20px', color: st.available !== undefined ? T.brand : T.text3 }}>
          {st.current.version}　·　{sub}
        </div>
      </div>
      <button
        type="button"
        disabled={checking}
        onClick={() => { if (hasUpdate) openUpdatePanel(); else void check() }}
        style={{
          display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 14px',
          border: 'none', borderRadius: 18,
          background: hasUpdate ? T.brand : T.pill,
          color: hasUpdate ? 'var(--dsw-alias-label-primary-foreground)' : T.text,
          font: 'inherit', fontSize: 14, lineHeight: '22px', cursor: checking ? 'default' : 'pointer',
        }}
      >
        {checking ? t.checkingBtn : hasUpdate ? t.goUpdate : t.checkBtn}
      </button>
    </div>
  )
}
