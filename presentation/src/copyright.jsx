/*
 * Software Developed by Muhammad Amir MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Certified Electronics and Electrical Technician
 * Electrical License CLN-NQ-***6092 · Electronics License CLN-COC-***204
 */

export const COPYRIGHT_TEXT =
  "Software Developed by Muhammad Amir · MT# MT1063 · © 2026 Muhammad Amir. All rights reserved.";

export function Credit() {
  return (
    <footer className="deck-footer">
      <div>
        <div>Software Developed by Muhammad Amir MT# MT1063</div>
        <div>© 2026 Muhammad Amir. All rights reserved.</div>
      </div>
      <div className="deck-footer-credentials">
        <div>Certified Electronics and Electrical Technician</div>
        <div>
          Electrical License CLN-NQ-***6092 · Electronics License CLN-COC-***204
        </div>
      </div>
    </footer>
  );
}

export function Copyright() {
  return <div className="deck-export-copyright">{COPYRIGHT_TEXT}</div>;
}
