/*
 * Software Developed by Muhammad Amir
 * © 2026 All rights reserved.
 */

// Single source of truth for the author's copyright + professional credentials.
//
// Two audiences, on purpose:
//   • App UI footers  -> <Credit />: two columns, credentials on the right.
//   • Exported/printed reports (PDF/Excel/print) -> plain copyright ONLY,
//     no credentials. Use COPYRIGHT_HTML (strings) or <Copyright /> (JSX).

export const AUTHOR = 'Muhammad Amir'
export const COMPANY = 'Modern Technology Company, TRC-Makkah (Western Region)'
export const DEVELOPED_BY = `Software Developed by ${AUTHOR}`
export const COPYRIGHT = `© 2026 All rights reserved.`
export const CREDENTIAL = 'Certified Electronics and Electrical Technician:'
export const LICENSE_ELECTRONICS = 'Electronics License#: CLN-NQ-***6595'
export const LICENSE_ELECTRICAL = 'Electrical License#: CLN-NQ-***6092'
export const LICENSE_LINE = `${LICENSE_ELECTRONICS} · ${LICENSE_ELECTRICAL}`

// Plain copyright, one line — the ONLY thing shown on exported/printed reports.
export const COPYRIGHT_HTML = `${COMPANY} · ${DEVELOPED_BY} · ${COPYRIGHT}`

// JSX plain copyright for on-page print sheets (Save-as-PDF report views).
export function Copyright() {
  return COPYRIGHT_HTML
}

// App-UI footer credit block: left column = author/copyright, right column =
// credentials/licenses. Shown in the live app only, never on exports.
export function Credit() {
  return (
    <span
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        width: '100%',
        textAlign: 'left',
      }}
    >
      <span>
        {COMPANY}
        <br />
        {DEVELOPED_BY} · {COPYRIGHT}
      </span>
      <span style={{ textAlign: 'right' }}>
        {CREDENTIAL}
        <br />
        {LICENSE_LINE}
      </span>
    </span>
  )
}
