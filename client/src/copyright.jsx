/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

// Single source of truth for the author's copyright + professional credentials.
//
// Two audiences, on purpose:
//   • App UI footers  -> <Credit />: two columns, credentials on the right.
//   • Exported/printed reports (PDF/Excel/print) -> plain copyright ONLY,
//     no credentials. Use COPYRIGHT_HTML (strings) or <Copyright /> (JSX).

export const AUTHOR = 'Muhammad Amir'
export const DEVELOPED_BY = `Software Developed by ${AUTHOR} MT# MT1063`
export const COPYRIGHT = `© 2026 ${AUTHOR}. All rights reserved.`
export const CREDENTIAL = 'Certified Electronics and Electrical Technician'
export const LICENSE_ELECTRICAL = 'Electrical License CLN-NQ-***6092'
export const LICENSE_ELECTRONICS = 'Electronics License CLN-NQ-***6595'
export const LICENSE_LINE = `${LICENSE_ELECTRICAL} · ${LICENSE_ELECTRONICS}`

// Plain copyright, one line — the ONLY thing shown on exported/printed reports.
export const COPYRIGHT_HTML = `Software Developed by ${AUTHOR} · MT# MT1063 · ${COPYRIGHT}`

// JSX plain copyright for on-page print sheets (Save-as-PDF report views).
export function Copyright() {
  return COPYRIGHT_HTML
}

// App-UI footer credit block: left column = author/copyright, right column =
// credentials/licenses. Shown in the live app only, never on exports.
export function Credit() {
  return (
    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', width: '100%', textAlign: 'left' }}>
      <span>
        {DEVELOPED_BY}
        <br />
        {COPYRIGHT}
      </span>
      <span style={{ textAlign: 'right' }}>
        {CREDENTIAL}
        <br />
        {LICENSE_LINE}
      </span>
    </span>
  )
}
