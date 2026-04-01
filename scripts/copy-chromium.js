/**
 * scripts/copy-chromium.js
 * Pre-build script: copies the local Playwright Chromium installation
 * to .chromium-bundle/ so electron-builder can include it as extraResources.
 * Works on any machine regardless of where Playwright is installed.
 */

const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const dest = path.join(__dirname, '..', '.chromium-bundle')

async function main() {
  // Get the chromium executable path from Playwright
  const execPath = chromium.executablePath()
  console.log('[copy-chromium] Chromium executable:', execPath)

  if (!fs.existsSync(execPath)) {
    console.error('[copy-chromium] Chromium not found. Run: npx playwright install chromium')
    process.exit(1)
  }

  // The chromium folder is 2 levels up from the executable
  // e.g. .../chromium-1208/chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium
  //      .../chromium-1208/chrome-win64/chrome.exe
  // We want the chromium-NNNN folder
  let chromiumDir = execPath
  while (path.basename(chromiumDir).match(/^chrome/) === null || !fs.statSync(chromiumDir).isDirectory()) {
    chromiumDir = path.dirname(chromiumDir)
  }
  // chromiumDir is now chrome-mac-arm64 or chrome-win64 — go up one more to chromium-NNNN
  chromiumDir = path.dirname(chromiumDir)
  console.log('[copy-chromium] Chromium folder:', chromiumDir)

  // Clean and recreate dest
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true })
  }
  fs.mkdirSync(dest, { recursive: true })

  // Copy
  fs.cpSync(chromiumDir, dest, { recursive: true })
  console.log('[copy-chromium] Copied to:', dest)
}

main().catch(err => {
  console.error('[copy-chromium] Error:', err)
  process.exit(1)
})
