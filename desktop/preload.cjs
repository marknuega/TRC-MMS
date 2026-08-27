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
 * Only these functions cross, and each only carries a document to be rendered
 * or one line typed into a dialog this shell itself opened.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('trcDesktop', {
  // Render a complete HTML document to PDF and show it.
  printHtml: (html, title) => ipcRenderer.invoke('trc:print-html', { html: String(html), title: String(title || '') }),
  // Render the live page, through its own print stylesheet.
  printPage: (title) => ipcRenderer.invoke('trc:print-page', { title: String(title || '') }),
})

/*
 * The reply channel for the shell's own one-line prompts (see promptLine in
 * main.js). Exposed on a SEPARATE global from trcDesktop, under a name the app
 * page never touches, and it carries nothing back into the page — a prompt
 * window is created by the shell, answers once, and is destroyed.
 *
 * The channel name is passed in by the caller rather than fixed, because it is
 * per-window: two prompts open at once must not answer each other. main.js
 * listens with ipcMain.once on that exact name, so a page that guessed one
 * could at worst answer a dialog the user is already looking at.
 */
contextBridge.exposeInMainWorld('desktop', {
  promptDone: (channel, value) => ipcRenderer.send(String(channel), value === null ? null : String(value)),
})
