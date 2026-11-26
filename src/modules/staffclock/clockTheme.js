// Colours for the Staff Clock screens, matched to the portal's tokens
// (src/styles/tokens.css). Kept as hex because the screens add alpha
// suffixes (e.g. `${COLORS.rust}14`).
export const COLORS = {
  bg: '#F6F5F2',        // --dp-canvas
  navy: '#20241F',      // --dp-ink
  slate: '#3A3E36',
  slateLine: '#5B5F56', // --dp-ink-soft
  amber: '#E8871E',
  teal: '#2A5A30',      // --dp-success
  rust: '#BE1C21',      // --dp-hankook-red
  cardLine: '#E2DFD6',  // --dp-line
  inputLine: '#E2DFD6',
  textMuted: '#5B5F56',
  textFaint: '#8A8D84',
}

export const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: `1px solid ${COLORS.inputLine}`,
  fontSize: 16,
  background: COLORS.bg,
}

export const navBtnStyle = {
  background: '#FFF',
  border: `1px solid ${COLORS.inputLine}`,
  borderRadius: 10,
  padding: 8,
  display: 'flex',
}

// Scoped to the Staff Clock screens only (the old app styled the whole page).
export const globalFontImport = `
  .sc-root, .sc-root * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  .sc-root button { font-family: inherit; cursor: pointer; }
  .sc-root .mono { font-variant-numeric: tabular-nums; }
`
