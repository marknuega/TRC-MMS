/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Proves the desktop print path produces a real PDF rather than opening the
 * Windows printer dialog.
 *
 * It runs inside Electron — that is the point, printToPDF and contextBridge are
 * Electron APIs — and checks the two halves the export depends on:
 *
 *   1. the preload bridge reaches the page, so the client takes the desktop
 *      path at all. Without it window.trcDesktop is undefined, the client
 *      quietly falls back to window.print(), and Electron shows the printer
 *      dialog: the exact bug this exists to catch.
 *   2. an HTML document renders to bytes that really are a PDF.
 *
 * The bridge is checked FIRST and in a window of its own. Creating and
 * destroying a BrowserWindow before it leaves later file:// loads failing with
 * ERR_FAILED — nothing to do with the preload, but it reports as though it were.
 *
 *   npx electron scripts/print-check.mjs
 */

import electron from 'electron'
const { app, BrowserWindow } = electron
import { writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// Built from import.meta.url rather than written out: Electron silently ignores
// a preload path it cannot resolve — no error, no event, just a page with no
// bridge — so the path has to be one that cannot be mistyped.
const PRELOAD = join(here, '..', 'preload.cjs')

const SAMPLE = `<!doctype html><html><head><meta charset="utf-8"><title>Print check</title>
<style>@page{size:A4 portrait;margin:12mm} body{font-family:Arial,sans-serif}
table{border-collapse:collapse;width:100%} td,th{border:1px solid #999;padding:4px}</style>
</head><body><h1>TRC Maintenance Report</h1>
<table><tr><th>#</th><th>ISSUE &amp; ACTION</th><th>QTY</th></tr>
<tr><td>1</td><td>LCD (C) (1) MOT + CHARGER (C) (3) MOT</td><td>4</td></tr></table>
</body></html>`

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok    ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`)
  }
}

app.whenReady().then(async () => {
  console.log('\nTRC-MMS desktop print check\n')

  // ── 1. The bridge ──────────────────────────────────────────────
  const probePage = join(here, 'probe.tmp.html')
  writeFileSync(probePage, '<!doctype html><title>probe</title>', 'utf8')
  const probe = new BrowserWindow({
    show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  try {
    await probe.loadFile(probePage)
    const { present, keys } = JSON.parse(
      await probe.webContents.executeJavaScript(
        'JSON.stringify({ present: !!window.trcDesktop, keys: Object.keys(window.trcDesktop || {}) })',
      ),
    )
    check('preload exposes window.trcDesktop', present)
    check(
      'bridge exposes printHtml + printPage',
      keys.includes('printHtml') && keys.includes('printPage'),
      `saw ${keys}`,
    )
  } catch (err) {
    check('preload exposes window.trcDesktop', false, err.message)
  } finally {
    rmSync(probePage, { force: true })
  }
  // NOT destroyed yet. In the running app the main window outlives every export,
  // and destroying a window before creating the next leaves the new one failing
  // every file:// load — a state the app never reaches, so the check must not
  // manufacture it.

  // ── 2. The renderer ────────────────────────────────────────────
  const source = join(tmpdir(), `trc-print-check-${Date.now()}.html`)
  writeFileSync(source, SAMPLE, 'utf8')

  // One reused window, exactly as main.js does it — and rendered TWICE, because
  // a second export failing where the first succeeded is the failure mode that
  // window-per-export produced.
  let pdf = null
  const worker = new BrowserWindow({ show: false, webPreferences: { javascript: false } })
  try {
    await worker.loadFile(source)
    pdf = await worker.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: 'A4' })
    check('renders HTML to PDF', true)

    await worker.loadFile(source)
    const again = await worker.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: 'A4',
    })
    check('a second export also renders', again.length > 1000, `second render was ${again.length} bytes`)
  } catch (err) {
    check('renders HTML to PDF', false, err.message)
  } finally {
    worker.destroy()
  }

  if (pdf) {
    // A PDF always starts %PDF- and ends with an EOF marker. Anything else means
    // we produced something, but not a document a viewer will open.
    const head = pdf.subarray(0, 5).toString('latin1')
    check('output is a real PDF', head === '%PDF-', `file starts with ${JSON.stringify(head)}`)
    check('PDF is not empty', pdf.length > 1000, `only ${pdf.length} bytes`)
    check('PDF is terminated', pdf.subarray(-32).toString('latin1').includes('%%EOF'))

    const out = join(tmpdir(), `trc-print-check-${Date.now()}.pdf`)
    writeFileSync(out, pdf)
    check('PDF lands on disk', existsSync(out) && readFileSync(out).length === pdf.length)
    console.log(`\n  rendered ${(pdf.length / 1024).toFixed(1)} KB of PDF`)
    rmSync(out, { force: true })
  }

  probe.destroy()
  rmSync(source, { force: true })
  console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n')
  app.exit(failures ? 1 : 0)
})
