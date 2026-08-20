// vitest setupFile：每个测试文件跑完就清掉它建过的临时目录。
// 挂在 afterAll（而非 process exit）——worker 是被信号杀掉的，exit 钩子不执行。

import { afterAll } from 'vitest'
import { cleanupTrackedTmpDirs } from './tmp'

afterAll(cleanupTrackedTmpDirs)
