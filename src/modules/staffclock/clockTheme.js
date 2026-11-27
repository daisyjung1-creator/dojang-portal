// Colours and fonts of the original clock-in app (attendance-portal), kept so
// the Time Clock looks the same as before. Hex because the screens add alpha
// suffixes (e.g. `${COLORS.rust}14`).
export const COLORS = {
  bg: '#F5F3EE',
  navy: '#1C2333',
  slate: '#2F3B52',
  slateLine: '#3E4A63',
  amber: '#E8871E',
  teal: '#4A7A6C',
  rust: '#C94F3D',
  cardLine: '#ECE9E0',
  inputLine: '#E2E0D8',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',
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
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Inter:wght@400;500;600;700;800&display=swap');
  .sc-root, .sc-root * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  .sc-root { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: ${COLORS.navy}; }
  .sc-root button { font-family: inherit; cursor: pointer; }
  .sc-root .mono { font-family: 'JetBrains Mono', monospace; }
`
