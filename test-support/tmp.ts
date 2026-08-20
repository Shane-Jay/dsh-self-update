// 测试用临时目录：登记 + 进程退出时清理。
//
// 此前每个测试都直接 mkdtempSync 且从不删除，于是 $TMPDIR 里攒下了几千个
// dcl-* 目录（2026-08-17 实测 dcl-m1 1295 个、dcl-m0 1201 个）。macOS 只在
// 重启或 3 天未访问时才清 /var/folders，所以它们实际长期驻留。
//
// 只删本进程创建的路径——绝不按前缀盲扫 tmpdir，因为运行中的 dsh 会话同时在
// 用 dcl-import-/dcl-stage- 这类同族前缀做暂存。

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const created: string[] = []

/**
 * 删掉本进程登记过的全部临时目录。由 test-support/setup.ts 挂在 vitest 的
 * afterAll 上——不能用 process.on('exit')：vitest 的 worker 池是靠信号终止
 * 进程的，exit 钩子根本不跑（实测每轮仍新增 ~56 个目录）。
 */
export function cleanupTrackedTmpDirs(): void {
  for (const dir of created.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* 清理失败不该让测试结果变红 */
    }
  }
}

/**
 * 建一个测试用临时目录，并登记为测试文件结束时清理。
 * @param prefix mkdtemp 前缀（如 'dcl-m1-'），保留是为了排障时能认出来源
 */
export function tmpDirTracked(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  created.push(dir)
  return dir
}
