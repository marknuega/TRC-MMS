/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * The only bridge between the page and the desktop shell.
 *
 * CommonJS (.cjs) on purpose: desktop/package.json declares "type": "module",
 * so a .js preload would be parsed as ESM and fail to load — silently, as far
 * as the page is concerned, leaving window.trcDesktop undefined and the app
 * quietly falling back to browser behaviour that does not work here.
 *
 * Exposed through contextBridge rather than by assigning to window, because
 * contextIsolation is on: the page and this script are separate realms, and
 * that separation is what stops a bug in the app reaching Electron's internals.
 * Only these two functions cross, and both only send a document to be rendered.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('trcDesktop', {
  // Render a complete HTML document to PDF and show it.
  printHtml: (html, title) => ipcRenderer.invoke('trc:print-html', { html: String(html), title: String(title || '') }),
  // Render the live page, through its own print stylesheet.
  printPage: (title) => ipcRenderer.invoke('trc:print-page', { title: String(title || '') }),
})
