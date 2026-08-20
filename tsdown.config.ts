// 双产物：node 服务端（ESM）+ 浏览器 CJS 闭包工厂（照抄 harness clientConfig 硬约束）。
// banner 的 id 必须 === 包名 === cordis entry name，三者不一致会静默不注册。
import { defineConfig } from 'tsdown'

const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime/client',
]

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: 'esm',
    platform: 'node',
    outDir: 'lib',
    dts: false,
    clean: false,
  },
  {
    entry: { client: 'src/client/index.tsx' },
    format: 'cjs',
    platform: 'browser',
    outDir: 'lib',
    dts: false,
    clean: false,
    sourcemap: true,
    external: CLIENT_EXTERNALS,
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.MODE': '"production"',
      'import.meta.env': '{"MODE":"production"}',
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-self-update", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
