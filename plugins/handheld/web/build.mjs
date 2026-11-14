// Builds the phone app into web/dist (or the folder given as the first argument): hashed JS/CSS under assets/, index.html,
// the service worker (sw.js, not hashed so its URL stays stable), the manifest
// and PNG icons drawn here so no binary source files are needed.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import * as esbuild from 'esbuild'

const WEB = import.meta.dirname
const DIST = process.argv[2] ? path.resolve(process.argv[2]) : path.join(WEB, 'dist')
const BASE = '/h/'
const TARGET = ['safari15.4', 'chrome100', 'firefox110']

fs.rmSync(DIST, { recursive: true, force: true })
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true })

const app = await esbuild.build({
  // File names carry a hash of the inputs and their paths relative to this folder.
  // Pinning it keeps the names the same whichever folder the build is started from.
  absWorkingDir: path.join(WEB, '..'),
  entryPoints: { app: path.join(WEB, 'src', 'main.jsx') },
  outdir: DIST,
  entryNames: 'assets/[name]-[hash]',
  assetNames: 'assets/[name]-[hash]',
  bundle: true,
  format: 'esm',
  target: TARGET,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
})

const outputs = Object.keys(app.metafile.outputs).map((file) => path.relative(DIST, file).split(path.sep).join('/'))
const js = outputs.find((f) => f.endsWith('.js'))
const css = outputs.find((f) => f.endsWith('.css'))

// ---- icons -----------------------------------------------------------------
function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixel(x, y)
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
// Mark in a 0..1 box, inside the maskable safe zone: a prompt chevron and a cursor bar.
const STROKES = [[[0.3, 0.36], [0.45, 0.5]], [[0.45, 0.5], [0.3, 0.64]], [[0.53, 0.64], [0.7, 0.64]]]
// DeepSeek blue ground, white mark (same as web/static/icon.svg).
const BG = [77, 107, 254]
const FG = [255, 255, 255]
function icon(size) {
  const width = 0.075
  const samples = 4
  return png(size, (x, y) => {
    let hit = 0
    for (let sy = 0; sy < samples; sy += 1) {
      for (let sx = 0; sx < samples; sx += 1) {
        const px = (x + (sx + 0.5) / samples) / size
        const py = (y + (sy + 0.5) / samples) / size
        if (STROKES.some(([a, b]) => segmentDistance(px, py, a, b) <= width / 2)) hit += 1
      }
    }
    const t = hit / (samples * samples)
    return BG.map((c, i) => Math.round(c + (FG[i] - c) * t))
  })
}
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  fs.writeFileSync(path.join(DIST, name), icon(size))
}
fs.copyFileSync(path.join(WEB, 'static', 'icon.svg'), path.join(DIST, 'icon.svg'))
fs.copyFileSync(path.join(WEB, 'static', 'manifest.webmanifest'), path.join(DIST, 'manifest.webmanifest'))

// ---- fonts -------------------------------------------------------------------
// Pretendard (UI and reading) and D2Coding (code) ship with the app so every
// device shows the same letters. Both are SIL OFL 1.1 and come from pinned
// devDependencies; nothing is fetched from another origin at run time. Pretendard
// is split into unicode-range pieces, so a phone downloads only the ones it shows.
// In the kit the packages are hoisted to the workspace root, so look upward.
function packageDir(name) {
  for (let dir = WEB; ; dir = path.dirname(dir)) {
    const found = path.join(dir, 'node_modules', name)
    if (fs.existsSync(path.join(found, 'package.json'))) return found
    if (dir === path.dirname(dir)) throw new Error(`${name} is not installed: run npm install at the kit root`)
  }
}
const versionOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version
const pretendardPkg = packageDir('pretendard')
const d2Pkg = packageDir('d2coding')
const pretendardDir = `fonts/pretendard-${versionOf(pretendardPkg)}`
const d2Dir = `fonts/d2coding-${versionOf(d2Pkg)}`
const pretendardSrc = path.join(pretendardPkg, 'dist', 'web', 'variable')
fs.cpSync(path.join(pretendardSrc, 'woff2-dynamic-subset'), path.join(DIST, 'assets', pretendardDir), { recursive: true })
fs.mkdirSync(path.join(DIST, 'assets', d2Dir), { recursive: true })
for (const file of ['d2coding-subset.woff2', 'd2coding-bold-subset.woff2']) {
  fs.copyFileSync(path.join(d2Pkg, 'fonts', file), path.join(DIST, 'assets', d2Dir, file))
}
// The OFL asks that the licence travel with the font files.
fs.copyFileSync(path.join(pretendardPkg, 'dist', 'LICENSE.txt'), path.join(DIST, 'assets', pretendardDir, 'LICENSE.txt'))
fs.writeFileSync(path.join(DIST, 'assets', d2Dir, 'LICENSE.txt'), 'D2Coding\nCopyright (c) 2015, NAVER Corporation (http://www.navercorp.com), with Reserved Font Name D2Coding.\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\nThe license text is the same as in ../' + path.basename(pretendardDir) + '/LICENSE.txt and is available at https://openfontlicense.org\n')
const d2Face = (weight, file) => `@font-face{font-family:'D2Coding';font-style:normal;font-weight:${String(weight)};font-display:swap;src:url(./${d2Dir}/${file}) format('woff2')}`
const fontCss = [
  fs.readFileSync(path.join(pretendardSrc, 'pretendardvariable-dynamic-subset.css'), 'utf8').replaceAll('./woff2-dynamic-subset/', `./${pretendardDir}/`),
  '/*\nD2Coding: Copyright (c) 2015, NAVER Corporation (http://www.navercorp.com), with Reserved Font Name D2Coding.\nLicensed under the SIL Open Font License, Version 1.1 (http://scripts.sil.org/OFL).\n*/',
  d2Face(400, 'd2coding-subset.woff2'),
  d2Face(700, 'd2coding-bold-subset.woff2'),
].join('\n')
const fontsCss = `assets/fonts-${createHash('sha256').update(fontCss).digest('hex').slice(0, 8).toUpperCase()}.css`
fs.writeFileSync(path.join(DIST, fontsCss), fontCss)

// ---- index.html ------------------------------------------------------------
const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7fb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0c0f16" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="DSH">
<meta name="referrer" content="no-referrer">
<title>DSH 휴대폰</title>
<link rel="manifest" href="${BASE}manifest.webmanifest">
<link rel="icon" href="${BASE}icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${BASE}apple-touch-icon.png">
<link rel="stylesheet" href="${BASE}${fontsCss}">
<link rel="stylesheet" href="${BASE}${css}">
<script type="module" src="${BASE}${js}"></script>
</head>
<body>
<div id="app"></div>
<div><noscript>이 앱은 JavaScript가 필요합니다.</noscript></div>
</body>
</html>
`
fs.writeFileSync(path.join(DIST, 'index.html'), html)

// ---- service worker ----------------------------------------------------------
const shell = [BASE, `${BASE}${js}`, `${BASE}${css}`, `${BASE}${fontsCss}`, `${BASE}manifest.webmanifest`, `${BASE}icon.svg`, `${BASE}icon-192.png`]
const shellVersion = createHash('sha256').update(shell.join('|')).digest('hex').slice(0, 12)
await esbuild.build({
  entryPoints: [path.join(WEB, 'src', 'sw.js')],
  outfile: path.join(DIST, 'sw.js'),
  bundle: true,
  format: 'iife',
  target: TARGET,
  minify: true,
  legalComments: 'none',
  define: { __SHELL__: JSON.stringify(shell), __SHELL_VERSION__: JSON.stringify(shellVersion) },
  logLevel: 'warning',
})

const size = (f) => fs.statSync(path.join(DIST, f)).size
const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(DIST, f))).length
console.log(`built web/dist: ${js} ${String(size(js))} B (gzip ${String(gz(js))} B), ${css} ${String(size(css))} B, sw.js ${String(size('sw.js'))} B`)
