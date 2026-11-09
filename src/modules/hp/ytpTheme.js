// Colours for the HP Plans screens. Change HP_ORANGE here to the exact team colour.
export const HP_ORANGE = '#E8702A';
export const HP_INK = '#20241F';
export const HP_FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// Phase band (light → hot as competition gets closer; Peak uses the dojang red).
export const PHASE_STYLE = {
  'General Prep': { bg: '#DDE7DD', fg: '#2E4A33', short: 'GP' },
  'Specific Prep': { bg: '#B7CFBB', fg: '#22392A', short: 'SP' },
  'Pre-Competition': { bg: '#F7DCC0', fg: '#6B3A12', short: 'PC' },
  Competition: { bg: '#F0A56E', fg: '#4A2208', short: 'C' },
  Taper: { bg: '#E8702A', fg: '#FFFFFF', short: 'T' },
  Peak: { bg: '#9A2B2B', fg: '#FFFFFF', short: 'Pk' },
  Transition: { bg: '#E7E3D8', fg: '#5B5F56', short: 'Tr' },
  Break: { bg: '#F1EFE8', fg: '#8A8D84', short: 'Br' },
};

// Skill stage: deeper orange as the skill matures (I → D → C → R). M = maintained (neutral).
export const CODE_STYLE = {
  I: { bg: '#FCEBDD', fg: '#8A4A1C' },
  D: { bg: '#F6C39A', fg: '#6B3410' },
  C: { bg: '#EC9254', fg: '#3E1C06' },
  R: { bg: '#B8501B', fg: '#FFFFFF' },
  M: { bg: '#DAD6CB', fg: '#45483F' },
  X: { bg: 'transparent', fg: HP_ORANGE },
};

export const PRIORITY_STYLE = {
  H: { bg: '#9A2B2B', fg: '#FFFFFF' },
  M: { bg: '#E8702A', fg: '#FFFFFF' },
  L: { bg: '#F6C39A', fg: '#4A2208' },
};

export const KIND_STYLE = {
  competition: { bg: '#FFFFFF', border: '#E8702A' },
  camp: { bg: '#EEF3EE', border: '#4F7A57' },
  testing: { bg: '#F2F0FA', border: '#6A5FA8' },
  break: { bg: '#F1EFE8', border: '#B9BCB4' },
  other: { bg: '#FFFFFF', border: '#B9BCB4' },
};
