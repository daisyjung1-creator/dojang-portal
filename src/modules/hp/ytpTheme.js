// Colours for the HP Plans screens. Change HP_ORANGE here to the exact team colour.
export const HP_ORANGE = 'var(--dp-hp-orange)'; // token from src/styles/tokens.css
export const HP_INK = 'var(--dp-ink)';

// Phase band (light → hot as competition gets closer; Peak uses the dojang red).
export const PHASE_STYLE = {
  'General Prep': { bg: 'var(--hp-phase-gp)', fg: 'var(--hp-phase-gp-text)', short: 'GP' },
  'Specific Prep': { bg: 'var(--hp-phase-sp)', fg: 'var(--hp-phase-sp-text)', short: 'SP' },
  'Pre-Competition': { bg: 'var(--hp-phase-pc)', fg: 'var(--hp-phase-pc-text)', short: 'PC' },
  Competition: { bg: 'var(--hp-phase-c)', fg: 'var(--hp-phase-c-text)', short: 'C' },
  Taper: { bg: 'var(--dp-hp-orange)', fg: 'var(--dp-paper)', short: 'T' },
  Peak: { bg: 'var(--dp-danger)', fg: 'var(--dp-paper)', short: 'Pk' },
  Transition: { bg: 'var(--hp-phase-tr)', fg: 'var(--dp-ink-soft)', short: 'Tr' },
  Break: { bg: 'var(--dp-canvas)', fg: 'var(--dp-ink-faint)', short: 'Br' },
};

// Skill stage: deeper orange as the skill matures (I → D → C → R). M = maintained (neutral).
export const CODE_STYLE = {
  I: { bg: 'var(--hp-stage-i)', fg: 'var(--hp-stage-i-text)' },
  D: { bg: 'var(--hp-stage-d)', fg: 'var(--hp-stage-d-text)' },
  C: { bg: 'var(--hp-stage-c)', fg: 'var(--hp-stage-c-text)' },
  R: { bg: 'var(--hp-stage-r)', fg: 'var(--dp-paper)' },
  M: { bg: 'var(--hp-stage-m)', fg: 'var(--dp-ink-soft)' },
  X: { bg: 'transparent', fg: HP_ORANGE },
};

export const PRIORITY_STYLE = {
  H: { bg: 'var(--dp-danger)', fg: 'var(--dp-paper)' },
  M: { bg: 'var(--dp-hp-orange)', fg: 'var(--dp-paper)' },
  L: { bg: 'var(--hp-stage-d)', fg: 'var(--hp-phase-c-text)' },
};

export const KIND_STYLE = {
  competition: { bg: 'var(--dp-paper)', border: 'var(--dp-hp-orange)' },
  camp: { bg: 'var(--hp-camp-tint)', border: 'var(--hp-camp)' },
  testing: { bg: 'var(--hp-testing-tint)', border: 'var(--hp-testing)' },
  break: { bg: 'var(--dp-canvas)', border: 'var(--dp-ink-faint)' },
  other: { bg: 'var(--dp-paper)', border: 'var(--dp-ink-faint)' },
};
