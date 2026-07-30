// Default dropdown option lists, seeded from the MOTECO / TRC defaults.
// At runtime these are merged with the user-managed lists saved via /api/options,
// so the Manage Inputs panel can add / edit / delete any of them.

export const DEFAULT_OPTIONS = {
  technicians: ['AMIR', 'M. RASHEED', 'RASHEEDULLAH', 'IMRAN', 'BAGHDAD', 'MAROOF'],

  agencies: [
    'PSD', 'CD', 'DOT', 'BG', 'PASS', 'PRI', 'FSF', 'SSF', 'TA', 'KFSC',
    'VIP', 'MJ', 'NA', 'GIP', 'GDCSS', 'NIC', 'AVS', 'RA', 'SFH', 'SA',
    'AFW', 'MOH', 'IS', 'EMH', 'SRCA', 'GPH', 'MOD', 'NG', 'GSA', 'PSS',
    'MEWA', 'TM', 'Kingdom', 'MOF', 'MOMRA', 'MCIT', 'NCA', 'MEIM', 'MEDIA', 'CAI',
    'MCI', 'SFES', 'SFSP', 'GACA', 'CC', 'MOFA', 'SFOC', 'SPL',
  ],

  types: ['SEPURA', 'AIRBUS', 'HYTERA'],

  models: [
    'TH1N', 'THR9', 'TMR 880i', 'STP9000',
    'SRG3900 CARKIT', 'SRG3900 DESKTOP', 'SRG3900 BIKE', 'PT580H', 'PT590',
  ],

  issueTypes: [
    'A COVER', 'ANTENNA', 'ANTENNA BASE', 'ANTENNA CABLE', 'ANTENNA STICK',
    'B COVER', 'BATTERY 1590', 'BATTERY 1880', 'BATTERY 3180', 'BATTERY CONNECTOR',
    'BELT CLIP', 'CAPACITOR', 'CHARGER', 'DESK MIC', 'DIODE', 'DV15 CONNECTOR', 'FIST MIC',
    'HAND MICRO LOUD SPEAKER', 'HANDSET', 'HANDSET BASE', 'I/O PORT', 'KEYMATE',
    'INDUCTOR', 'LCD', 'LCD BASE', 'LCD CABLE', 'LEATHER CASE', 'MIC', 'MIC BOTTOM', 'MIC TOP',
    'NO TRANSMIT MODE', 'NOT AVAILABLE', 'POWER', 'POWER SUPPLY', 'PROGRAM ISSUE',
    'PTT', 'RESISTOR', 'ROT KNOB', 'ROT SWITCH', 'SIDE GRIP', 'SIDE GRIP 3D', 'SIGNAL',
    'SPEAKER BASE', 'SPEAKER HIGH', 'SPEAKER LOUD', 'SPEAKER LOW', 'SPEAKER MID',
    'TEMPORARY DISABLED', 'TOP BOARD', 'UI FRAME',
  ],

  // The report engine knows the codes for these built-ins (C/R/N/PCB/P/RP/I/RI/D).
  // Adding a custom action is fine — it just prints its own name as the code.
  actions: ['CHANGE', 'REPAIR', 'NEW', 'PCB', 'PROGRAM', 'RE-PROGRAM', 'INSTALL', 'RE-INSTALL', 'DISMANTLE'],

  // The report engine knows the display codes for these (MOT (P2), MOI, ...).
  companies: ['MOTECO', 'MOI', 'PROJECT 2', 'PROJECT X', 'ONLINE', 'MOTECO LOCAL', 'FREE'],
}

// Branches shown in the header selector; the choice appears in the report header/number.
export const BRANCHES = ['Makkah', 'Taif', 'Jeddah']

// Selecting a model auto-fills the Type. Keyed by UPPERCASE model name.
export const MODEL_TYPE = {
  TH1N: 'AIRBUS',
  THR9: 'AIRBUS',
  'TMR 880I': 'AIRBUS',
  STP9000: 'SEPURA',
  'SRG3900 CARKIT': 'SEPURA',
  'SRG3900 DESKTOP': 'SEPURA',
  'SRG3900 BIKE': 'SEPURA',
  PT580H: 'HYTERA',
  PT590: 'HYTERA',
}

// Category order + labels for the Manage Inputs panel.
export const CATEGORIES = [
  { key: 'technicians', label: 'Technicians' },
  { key: 'agencies', label: 'Agencies' },
  { key: 'types', label: 'Types' },
  { key: 'models', label: 'Models' },
  { key: 'issueTypes', label: 'Issue types' },
  { key: 'actions', label: 'Actions' },
  { key: 'companies', label: 'Companies / materials' },
]

// Merge stored lists over the defaults (a saved category fully replaces its default).
export function mergeOptions(stored) {
  const out = {}
  for (const { key } of CATEGORIES) {
    const list = Array.isArray(stored?.[key]) ? stored[key] : DEFAULT_OPTIONS[key]
    out[key] = [...list]
  }
  return out
}
