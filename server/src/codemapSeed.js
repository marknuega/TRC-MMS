/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Seed for the CDS code map, captured from the WhatsApp bridge's public
 * /codemap on 2026-08-13 — the state it was in when this app took ownership
 * of the map.
 *
 * Used ONLY to fill an EMPTY code_map row on first boot. Once the row exists
 * it is never re-applied, so a deploy can never clobber a live edit.
 *
 * `variants` is included even though the bridge never published it: the client
 * carried it as a hardcoded fallback, and folding it in makes the whole
 * vocabulary editable in one place. An empty suffix is a REAL value — it is
 * what makes A the default build of a part, not a missing entry.
 */

export const CODEMAP_SEED = {
  equipmentCodes: {
    H: "Airbus TH1n",
    R: "Airbus THR9",
    M: "Airbus TMR880i",
    T: "Sepura STP9000",
    C: "Sepura SRG Carkit",
    D: "Sepura SRG Desktop",
    B: "Sepura SRG Bike",
    S: "Hytera MT680",
    E: "Hytera PT580H",
    N: "Hytera PT590",
  },
  components: {
    "10": "Antenna",
    "11": "Antenna Connector",
    "12": "A Cover",
    "13": "B Cover",
    "14": "Belt Clip",
    "15": "DV15",
    "17": "Battery Connector",
    "19": "Fistmic",
    "20": "Programming",
    "21": "Dismantle",
    "22": "Installation",
    "23": "PCB",
    "24": "Handset",
    "25": "Keypad",
    "26": "LCD",
    "27": "Keymate",
    "28": "Micro-Loud Speaker",
    "29": "Speaker Base",
    "30": "Antenna Base",
    "31": "LCD Base",
    "33": "Fuse Cover",
    "41": "Rotary Knob",
    "42": "Rotary Switch",
    "43": "Side Grip",
    "44": "Microphone",
    "45": "Speaker Low",
    "46": "Speaker Mid",
    "95": "Battery Pack",
    "97": "Charging Pin",
    "98": "Power Supply",
    // H43A, H43B, 98A, 99A, 99B used to live here too, carried over verbatim
    // from the WhatsApp bridge. A parts number is exactly two digits (see
    // refGroups.js / PARTS_RE), so none of those five could ever be reached by
    // a decode — H43A/H43B just duplicated 43+A/43+B (already covered by
    // `variants` below), and 98A/99A/99B named real parts with no code able to
    // reach them. Those three are re-homed as Issue-type claims instead (Manage
    // inputs -> Issue types: 98+A "Power Supply - PSE65-12", 99+A "Charger818",
    // 99+B "ChargerDC"), which is the mechanism built for exactly this case.
  },
  variants: {
    A: "",
    B: "3D",
  },
  actions: {
    C: "Change",
    N: "New",
    R: "Repair",
    I: "Install/Re-Install",
    P: "Program/Re-program",
    D: "Dismantle",
  },
  companies: {
    MI: "MOI",
    MT: "MOTECO",
  },
  agencies: {
    PSD: "PUBLIC SECURITY DEPARTMENT",
    CD: "CIVIL DEFENSE",
    PRI: "PRISON",
    MEWA: "MINISTRY OF ENVIRONMENT WATER & AGRICULTURE",
    KINGDOM: "KINGDOM",
    X: "Not Available",
    DOT: "DIRECTORATE OF TELECOMMUNICATIONS",
    BG: "BORDER GUARD",
    PASS: "PASSPORT",
    FSF: "FACILITIES SECURITY FORCES",
    SSF: "SPECIAL SECURITY FORCES",
    TA: "TECHNICAL AFFAIRS",
    KFSC: "KING FAHD SECURITY COLLEGE",
    VIP: "VIP",
    MJ: "MUJAHIDEEN",
    NA: "NARCOTICS CONTROL",
    GIP: "GIP",
    GDCSS: "GDCSS",
    NIC: "NATIONAL INFORMATION CENTER",
    AVS: "AVIATION SECURITY",
    RA: "REGION AFFAIRS",
    SFH: "SECURITY FORCES HOSPITAL",
    SA: "SPECIAL AFFAIRS",
    AFW: "AFWAJ",
    MOH: "MINISTRY OF HEALTH",
    IS: "INDUSTRIAL SECURITY",
    EMH: "EMARAH",
    SRCA: "SAUDI RED CRESENT AUTHORITY",
    GPH: "GENERAL PRESIDENCY FOR THE HOLY MOSQUE",
    MOD: "MINISTRY OF DEFENSE",
    NG: "NATIONAL GUARD",
    GSA: "GENERAL SPORTS AUTHORITY",
    PSS: "PRECEDENCY FOR SECURITY OF THE STATE",
    TM: "TRANSPORT MINISTRY",
    MOF: "MINISTRY OF FINANCE",
    MOMRA: "MINISTRY OF MUNICIPAL & RURAL AFFAIRS",
    MCIT: "MINISTRY OF COMMUNICATIONS AND INFORMATION TECHNOLOGY",
    NCA: "NATIONAL CYBERSECURITY AUTHORITY",
    MEIM: "MINISTRY OF ENERGY INDUSTRY AND MINERAL RESOURCES",
    MEDIA: "MINISTRY OF MEDIA",
    C4I: "COMMAND AND CONTROL CENTRE (911)",
    MCI: "MINISTRY OF COMMERCE AND INVESTMENT",
    SFES: "SPECIAL FORCES FOR ENVIRONMENTAL SECURITY",
    SFSP: "SPECIAL FORCES FOR ENVIRONMENTAL SECURITY",
  },
  technicians: {
    "1": "Amir",
    "2": "Muhammad Rashid",
    "3": "Imran",
    "4": "Rasheedullah",
    "5": "Maroof",
    "6": "Baghdad",
    "7": "Engr. Khalid",
    "8": "Engr. Hamed",
  },
}
