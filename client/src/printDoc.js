/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * One way to print, for every export in the app.
 *
 * In a browser this is the hidden-iframe trick: write the document into an
 * iframe and print that. It is deliberately not a popup — a script-opened
 * window can hang on "Saving…" in Chrome's Save-as-PDF — and the iframe is kept
 * alive until the dialog closes so the PDF still has its source to render.
 *
 * In the desktop app neither works. Electron has no print preview: window.print()
 * opens the Windows *printer* dialog, with no PDF view and no Save as PDF, and
 * window.open('', '_blank') is a popup the shell declines to open at all. So
 * there the document goes to the main process, which renders it to a real PDF
 * and shows it in a viewer — the nearest thing to what the browser gives, and
 * the same end result: a PDF on screen that can be saved.
 *
 * window.trcDesktop is injected by the desktop build's preload script and is
 * simply absent everywhere else, which is what selects the path.
 */

// Print a complete, self-contained HTML document (the export builders each
// produce one).
export function printDocument(html, title) {
  if (window.trcDesktop?.printHtml) {
    return window.trcDesktop.printHtml(html, title).catch((err) => {
      console.error('desktop PDF export failed:', err)
    })
  }
  return printViaIframe(html)
}

// Print the page as it stands, through its own @media print rules. Used by the
// on-screen print sheets, which are already laid out for paper.
export function printCurrentPage(title) {
  if (window.trcDesktop?.printPage) {
    return window.trcDesktop.printPage(title).catch((err) => {
      console.error('desktop PDF export failed:', err)
    })
  }
  return window.print()
}

function printViaIframe(html) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(iframe)
  const cw = iframe.contentWindow
  let printed = false
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    // Delay so we never yank the source while Chrome is still writing the file.
    setTimeout(() => iframe.remove(), 1500)
  }
  const doPrint = () => {
    if (printed) return
    printed = true
    try {
      cw.focus()
      cw.print()
    } catch {
      /* ignore */
    }
  }
  cw.onafterprint = cleanup
  const doc = cw.document
  doc.open()
  doc.write(html)
  doc.close()
  if (doc.readyState === 'complete') setTimeout(doPrint, 200)
  else cw.onload = () => setTimeout(doPrint, 200)
  setTimeout(doPrint, 800) // fallback if load never fires
}
