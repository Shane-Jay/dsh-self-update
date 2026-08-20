import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 唯一职责：让每个测试文件结束时清掉自己建的临时目录（test-support/tmp.ts）。
    // 其余全部沿用 vitest 默认（发现规则、pool、超时都不动）。
    setupFiles: ['./test-support/setup.ts'],
  },
})
