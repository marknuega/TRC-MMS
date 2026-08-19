/*
 * Software Developed by Muhammad Amir MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Certified Electronics and Electrical Technician
 * Electrical License#: CLN-NQ-***6092 · Electronics License#: CLN-NQ-***6595
 *
 * Single source of truth for the TRC brand marks, so the sidebar, the sign-in
 * card and the PWA icons never drift apart.
 *
 * Two cuts of the same artwork (both generated from "TRC Makkah Logo (New)"):
 *  - MARK: the emblem only (Kaaba + radio). Legible at 24px, so it is what the
 *    sidebar and the app/PWA icons use.
 *  - FULL: emblem + "Makkah Tetra Repair Center / MAKKAH TRC" wordmark, for the
 *    one place with room to read it — the sign-in card.
 */

export const LOGO_MARK = "/trc-mark.png";
export const LOGO_FULL = "/trc-logo.png";
export const BRAND_NAME = "Makkah Tetra Repair Center";

// Emblem-only mark. Decorative next to visible text, so it is aria-hidden there.
export function BrandMark({ className = "brand-ico", alt = "" }) {
  return (
    <img
      className={className}
      src={LOGO_MARK}
      alt={alt}
      aria-hidden={alt ? undefined : "true"}
    />
  );
}
