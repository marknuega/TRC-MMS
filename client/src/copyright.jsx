/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

// Single source of truth for the author's copyright + professional credentials.
// Shown in the app footer and on every exported / printed document, so the
// wording only ever changes here.

export const AUTHOR = 'Muhammad Amir'
export const DEVELOPED_BY = `Software Developed by ${AUTHOR} MT# MT1063`
export const COPYRIGHT = `© 2026 ${AUTHOR}. All rights reserved.`
export const CREDENTIAL = 'Certified Electronics and Electrical Technician'
export const LICENSE_ELECTRICAL = 'Electrical License CLN-NQ-***6092'
export const LICENSE_ELECTRONICS = 'Electronics License CLN-COC-***204'

// Plain-text lines, in display order (used by the JSX <Credit /> footer). The
// empty string renders as a blank line separating the copyright from credentials.
export const CREDIT_LINES = [
  DEVELOPED_BY,
  COPYRIGHT,
  '',
  CREDENTIAL,
  LICENSE_ELECTRICAL,
  LICENSE_ELECTRONICS,
]

// Same lines as an HTML fragment, for print / PDF export template strings.
export const CREDIT_HTML = CREDIT_LINES.join('<br>')

// Footer credit block used across the app UI. Renders each line, break-separated.
export function Credit(props) {
  return CREDIT_LINES.map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {line}
    </span>
  ))
}
