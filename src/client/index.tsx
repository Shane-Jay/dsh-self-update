// dsh-self-update 浏览器半边：
// ① sidebar.footer.action：侧栏底部「设置」正上方的更新入口（有新版本才浮出）；
// ② settings.general.item：通用设置里的「DSH 版本」行（手动检查 / 前往更新）。
// 弹层单源：两个席位 + 外部入口（Mac 外壳菜单）都经 window 事件打开同一个更新页。
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only：SlotRegistry 服务 merge（ctx.slots）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only：各 slot 声明的 SlotMap merge。
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-general/client'
import { UpdateAction } from './UpdateAction.tsx'
import { UpdateSettingsRow } from './UpdateSettingsRow.tsx'

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  // 自更新入口：footer.action 席位（list 型，可与他人共存）
  ctx.slots.inject(
    'sidebar.footer.action',
    () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'self-update', order: 40 }, UpdateAction),
  )

  // 版本行：通用设置里与「外观」「语言」并排（settings.general.item 是它们同一个席位）
  ctx.slots.inject(
    'settings.general.item',
    () => ctx.slots.register({ name: 'settings.general.item', id: 'self-update', order: 60 }, UpdateSettingsRow),
  )
}
