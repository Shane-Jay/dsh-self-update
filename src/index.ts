// dsh-self-update：DeepSeek Harness 的应用内自更新插件（git 源码安装版）。
// 服务端半边：Updater（git fetch/pull → pnpm install → pnpm build:official）+ 五条 HTTP 路由。
// 浏览器半边经 exports["./client"] 分发（见 src/client/index.tsx）。
// ⚠️ 只用 named export（loader unwrapExports 陷阱）。

import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { RESTART_EXIT_CODE, Updater } from './updater.ts'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'self-update'
export const inject: string[] = []

export interface Config {
  /** harness 的 git 工作副本；默认取进程 cwd（`pnpm dsh web` 在 harness 根启动） */
  repoRoot?: string
  /** 后台静默检查间隔，默认 6 小时；配 disabled 关闭定期检查（手动检查仍可用） */
  checkIntervalMs?: number
  disabled?: boolean
  /** 状态落盘目录（update-state.json），默认 ~/.dsh-self-update */
  dataDir?: string
}

export function apply(ctx: Context, config: Config = {}): void {
  const harnessRoot = config.repoRoot ?? process.cwd()
  // 只有目标确实是 git 工作副本才挂（npm 全局装的 dsh 没有工作副本 → 路由 404、UI 不渲染）
  const updater = existsSync(join(harnessRoot, '.git'))
    ? (() => {
        const dataDir = config.dataDir ?? join(homedir(), '.dsh-self-update')
        mkdirSync(dataDir, { recursive: true })
        return new Updater({
          repoRoot: harnessRoot,
          stateFile: join(dataDir, 'update-state.json'),
          checkIntervalMs:
            config.disabled === true ? 0 : (config.checkIntervalMs ?? 6 * 60 * 60 * 1000),
        })
      })()
    : undefined
  if (updater !== undefined) {
    // 本进程能跑起来 = 上一轮「待重启」已经兑现
    updater.clearRestartFlag()
    ctx.effect(() => updater.start())
  }

  // ── /self-update/api/update/*：检查 / 安装 / 回滚 / 重启 ────────────────────
  interface WebReqLike extends AsyncIterable<Uint8Array> {
    url?: string
    method?: string
    headers?: Record<string, string | string[] | undefined>
  }
  interface WebServerLike {
    register(route: {
      kind: 'prefix'
      path: string
      handler: (req: WebReqLike, res: {
        setHeader(k: string, v: string): void
        end(body?: string | Uint8Array): void
        statusCode: number
      }) => void | Promise<void>
    }): () => void
  }
  const isLocalOrigin = (origin: string): boolean => {
    try {
      const u = new URL(origin)
      return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1' || u.hostname === '[::1]'
    } catch {
      return false
    }
  }
  const wctx = ctx as unknown as {
    inject(deps: string[], cb: (c: { webServer: WebServerLike; effect(fn: () => () => void): void }) => void): void
  }
  wctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() =>
      webCtx.webServer.register({
        kind: 'prefix',
        path: '/self-update/api',
        handler: async (req, res) => {
          try {
            const url = new URL(req.url ?? '/', 'http://localhost')
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            // ── 写路由 CSRF 防线：浏览器 simple request（text/plain 表单）到不了这里；
            //    要求 JSON content-type（跨源必触发预检，本服务不答 CORS → 浏览器拦截），
            //    Origin 存在时必须为本机
            const method = req.method ?? 'GET'
            if (method !== 'GET') {
              const ctype = String(req.headers?.['content-type'] ?? '')
              if (!ctype.toLowerCase().startsWith('application/json')) {
                res.statusCode = 415
                res.end(JSON.stringify({ error: '写操作要求 content-type: application/json' }))
                return
              }
              const origin = req.headers?.['origin']
              if (typeof origin === 'string' && origin !== '' && !isLocalOrigin(origin)) {
                res.statusCode = 403
                res.end(JSON.stringify({ error: '非本机 Origin，拒绝写操作' }))
                return
              }
            }
            if (updater === undefined) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'dsh 不是 git 工作副本，自更新不可用' }))
              return
            }
            if (url.pathname.endsWith('/update/status') && method === 'GET') {
              res.end(JSON.stringify(await updater.status()))
              return
            }
            if (url.pathname.endsWith('/update/check') && method === 'POST') {
              res.end(JSON.stringify(await updater.check()))
              return
            }
            // 安装要跑几分钟：不 await，回一份 phase=installing 的快照，前端轮询 status
            if (url.pathname.endsWith('/update/install') && method === 'POST') {
              const started = updater.install()
              void started.catch(() => { /* 失败已落进 state.lastError */ })
              res.end(JSON.stringify(await updater.status()))
              return
            }
            if (url.pathname.endsWith('/update/rollback') && method === 'POST') {
              const started = updater.rollback()
              void started.catch(() => { /* 同上 */ })
              res.end(JSON.stringify(await updater.status()))
              return
            }
            if (url.pathname.endsWith('/update/restart') && method === 'POST') {
              res.end(JSON.stringify({ ok: true, exitCode: RESTART_EXIT_CODE }))
              // 让响应先落地再退出；supervisor / 桌面壳看到 75 会自动把服务拉起来
              setTimeout(() => process.exit(RESTART_EXIT_CODE), 300).unref?.()
              return
            }
            res.statusCode = 404
            res.end(JSON.stringify({ error: 'not found' }))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(err) }))
          }
        },
      }),
    )
  })
}
