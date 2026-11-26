import React from 'react';
import { classColor } from '../lib/classes';

// A class name in its own class colour (DESIGN.md → Class colours).
export default function ClassChip({ name, size = 13, style }) {
  const c = classColor(name);
  return (
    <span style={{ display: 'inline-block', fontSize: size, fontWeight: 500, lineHeight: 1.35, color: c.text, background: c.bg, borderRadius: 999, padding: size >= 16 ? '3px 12px' : '2px 10px', whiteSpace: 'nowrap', ...style }}>
      {name}
    </span>
  );
}

// Just the colour, as a small round dot (for dark backgrounds or tight spots).
export function ClassDot({ name, size = 10, style }) {
  return <span aria-hidden="true" style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: classColor(name).bg, boxShadow: `inset 0 0 0 1.5px ${classColor(name).text}`, flexShrink: 0, ...style }} />;
}
