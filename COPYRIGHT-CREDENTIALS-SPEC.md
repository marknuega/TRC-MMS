# Copyright & Credentials Standard (reusable spec)

Paste this into a new chat when building/updating any of my apps.

## The block

**App UI footer — two columns:**

| Left (2 lines)                                | Right (2 lines)                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| Software Developed by Muhammad Amir MT# MT1063 | Certified Electronics and Electrical Technician                            |
| © 2026 Muhammad Amir. All rights reserved.    | Electrical License CLN-NQ-\*\*\*6092 · Electronics License CLN-COC-\*\*\*204 |

(Right-side licenses are joined by a middot `·`.)

## Rules

1. **Masked license numbers only** — always `CLN-NQ-***6092` and `CLN-COC-***204`. Never the full digits, anywhere in code or output.
2. **No "Philippines" prefix** on the license lines.
3. **Credentials appear in the app UI only** (on-screen footers / admin pages). **Exported or printed reports (PDF, Excel, print sheets) show the plain copyright line ONLY — no credentials.**
   - Plain export line: `Software Developed by Muhammad Amir · MT# MT1063 · © 2026 Muhammad Amir. All rights reserved.`
4. **One source-of-truth module per app** — define the footer once and reference it everywhere; don't duplicate the strings across files.
5. Per-file source-header comments stay short: `Software Developed by Muhammad Amir  MT# MT1063 / © 2026 Muhammad Amir. All rights reserved.` (Credentials do NOT go in every file header.)

## Reference implementation (React)

`copyright.jsx` — exports `<Credit />` (two-column, credentials → app footers only) and `COPYRIGHT_HTML` / `<Copyright />` (plain line → exports/print).

```jsx
export const AUTHOR = 'Muhammad Amir'
export const DEVELOPED_BY = `Software Developed by ${AUTHOR} MT# MT1063`
export const COPYRIGHT = `© 2026 ${AUTHOR}. All rights reserved.`
export const CREDENTIAL = 'Certified Electronics and Electrical Technician'
export const LICENSE_ELECTRICAL = 'Electrical License CLN-NQ-***6092'
export const LICENSE_ELECTRONICS = 'Electronics License CLN-COC-***204'
export const LICENSE_LINE = `${LICENSE_ELECTRICAL} · ${LICENSE_ELECTRONICS}`

// Plain copyright — the ONLY thing shown on exported/printed reports.
export const COPYRIGHT_HTML = `Software Developed by ${AUTHOR} · MT# MT1063 · ${COPYRIGHT}`
export function Copyright() {
  return COPYRIGHT_HTML
}

// App-UI footer credit block (never on exports).
export function Credit() {
  return (
    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', width: '100%', textAlign: 'left' }}>
      <span>{DEVELOPED_BY}<br />{COPYRIGHT}</span>
      <span style={{ textAlign: 'right' }}>{CREDENTIAL}<br />{LICENSE_LINE}</span>
    </span>
  )
}
```

Plain HTML (non-React apps) app-UI footer:

```html
<footer>
  <span style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;width:100%">
    <span style="text-align:left">Software Developed by Muhammad Amir MT# MT1063<br>© 2026 Muhammad Amir. All rights reserved.</span>
    <span style="text-align:right">Certified Electronics and Electrical Technician<br>Electrical License CLN-NQ-***6092 · Electronics License CLN-COC-***204</span>
  </span>
</footer>
```
