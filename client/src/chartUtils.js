/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

export const PALETTE = ['#2563eb', '#d97706', '#059669', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#dc2626']

// Collapse a ranked list to at most `max` slices, bundling the rest as "Others".
// items must be pre-sorted (busiest first). -> [{ label, value }]
export function toPie(items, labelFn, valueFn, max = 6) {
  const mapped = (items ?? []).map((x) => ({ label: labelFn(x), value: valueFn(x) })).filter((d) => d.value > 0)
  if (mapped.length <= max) return mapped
  const head = mapped.slice(0, max)
  const rest = mapped.slice(max).reduce((s, d) => s + d.value, 0)
  return rest > 0 ? [...head, { label: 'Others', value: rest }] : head
}
