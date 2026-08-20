#!/usr/bin/env node
// Builds "DSH.app" — a native WKWebView shell that owns the `dsh web` server.
//
//   node scripts/build-mac-app.mjs [--out <dir>] [--name <AppName>] [--port 3080]
//
// The harness repo, node binary and port are baked into Info.plist, so the app
// keeps working when this repo is not the frontmost project. Re-run after
// moving either repo.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, copyFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}

const appName = flag('name', 'DSH')
const outDir = resolve(flag('out', join(homedir(), 'Applications')))
const port = Number(flag('port', process.env.DSH_PORT ?? 3080))
const harnessRoot = resolve(
  flag('harness', process.env.DSH_HARNESS_ROOT ?? join(repoRoot, '..', 'deepseek-harness')),
)
const logPath = join(homedir(), 'Library', 'Logs', 'dsh-web.log')
const bundleId = 'dev.dsh-self-update.shell'
// Bumped every build: macOS caches app icons per (bundle id, version), so a
// stable version leaves a stale tile in the Dock after the icon changes.
const bundleVersion = String(Math.floor(Date.now() / 1000))

if (!existsSync(join(harnessRoot, 'apps/cli/src/bin.ts'))) {
  console.error(`✗ deepseek-harness not found at ${harnessRoot}\n  pass --harness <path> or set DSH_HARNESS_ROOT`)
  process.exit(1)
}
if (!existsSync(join(harnessRoot, 'node_modules/tsx'))) {
  console.error(`✗ ${harnessRoot}/node_modules/tsx missing — run pnpm install in the harness repo first`)
  process.exit(1)
}

const appPath = join(outDir, `${appName}.app`)
const contents = join(appPath, 'Contents')
const macos = join(contents, 'MacOS')
const resources = join(contents, 'Resources')

console.log(`→ building ${appPath}`)
console.log(`  harness : ${harnessRoot}`)
console.log(`  node    : ${process.execPath}`)
console.log(`  port    : ${port}`)

rmSync(appPath, { recursive: true, force: true })
mkdirSync(macos, { recursive: true })
mkdirSync(resources, { recursive: true })

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${appName}</string>
  <key>CFBundleDisplayName</key><string>${appName}</string>
  <key>CFBundleIdentifier</key><string>${bundleId}</string>
  <key>CFBundleExecutable</key><string>${appName.replace(/\s+/g, '')}</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>${bundleVersion}</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>DSHHarnessRoot</key><string>${harnessRoot}</string>
  <key>DSHNodeBin</key><string>${process.execPath}</string>
  <key>DSHPort</key><integer>${port}</integer>
  <key>DSHLogPath</key><string>${logPath}</string>
</dict>
</plist>
`
writeFileSync(join(contents, 'Info.plist'), plist)
writeFileSync(join(contents, 'PkgInfo'), 'APPL????')

// Icon: composite the harness's own favicon onto a macOS-style plate. Falls
// back to a checked-in icns, then to no icon at all.
function buildIcon() {
  const cached = join(repoRoot, 'macapp/AppIcon.icns')
  const svg = join(harnessRoot, 'apps/web/public/favicon.svg')
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-icon-'))
  try {
    if (!existsSync(svg)) throw new Error(`no favicon at ${svg}`)

    // WebKit render (scales the viewBox to fill, keeps alpha) → plate composite.
    const renderer = join(tmp, 'render-svg')
    execFileSync('swiftc', ['-O', '-o', renderer, join(repoRoot, 'macapp/render-svg.swift'),
      '-framework', 'AppKit', '-framework', 'WebKit'], { stdio: 'inherit' })
    const flat = join(tmp, 'logo.png')
    execFileSync(renderer, [svg, flat, '2048'], { stdio: 'inherit' })
    if (!existsSync(flat)) throw new Error('svg render produced no png')

    const compositor = join(tmp, 'make-icon')
    execFileSync('swiftc', ['-O', '-o', compositor, join(repoRoot, 'macapp/make-icon.swift'),
      '-framework', 'AppKit'], { stdio: 'inherit' })
    const master = join(tmp, 'master.png')
    execFileSync(compositor, [flat, master], { stdio: 'inherit' })

    const iconset = join(tmp, 'AppIcon.iconset')
    mkdirSync(iconset)
    for (const size of [16, 32, 128, 256, 512]) {
      for (const [px, name] of [[size, `icon_${size}x${size}.png`], [size * 2, `icon_${size}x${size}@2x.png`]]) {
        execFileSync('sips', ['-z', String(px), String(px), master, '--out', join(iconset, name)], { stdio: 'ignore' })
      }
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', cached], { stdio: 'inherit' })
    console.log(`  icon    : generated from ${svg}`)
    return cached
  } catch (err) {
    if (existsSync(cached)) {
      console.log(`  icon    : ${cached} (reused; generation failed: ${err.message})`)
      return cached
    }
    console.log(`  icon    : none (generation failed: ${err.message})`)
    return null
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const icon = buildIcon()
if (icon) copyFileSync(icon, join(resources, 'AppIcon.icns'))

execFileSync(
  'swiftc',
  [
    '-O',
    '-o', join(macos, appName.replace(/\s+/g, '')),
    join(repoRoot, 'macapp/main.swift'),
    '-framework', 'AppKit',
    '-framework', 'WebKit',
  ],
  { stdio: 'inherit' },
)

execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
execFileSync('touch', [appPath])

console.log(`✓ ${appPath}`)
console.log(`  open -a "${appPath}"`)
